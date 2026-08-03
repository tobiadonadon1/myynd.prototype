/**
 * Provider basato sulla CLI `claude` già autenticata sull'abbonamento
 * dell'utente — nessuna chiave api, nessun @anthropic-ai/sdk.
 *
 * Uno spawn a freddo per domanda costa ~7s, inaccettabile. Si tiene invece un
 * processo figlio caldo e persistente per ogni system prompt distinto usato
 * dall'app (uno per le domande, uno per le proposte): il primo turno paga
 * l'avvio, i successivi arrivano al primo token in una frazione del tempo.
 *
 * Sicurezza: il modello non deve avere accesso al filesystem reale. Il
 * flag che lo garantisce è `--tools ""` (svuota l'elenco degli strumenti
 * nell'evento di init) — non `--allowed-tools ""`, che nella pratica lascia
 * comunque eseguire Bash/Read. Verificato manualmente prima di scrivere
 * questo file.
 */
import { type ChildProcessWithoutNullStreams, exec as execCb, spawn } from 'node:child_process'
import { access, constants as fsConstants } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { ModelStatus } from '@shared/types'
import type { ChatMessage, CompleteRequest, Provider, StreamEvent } from './provider.js'

const exec = promisify(execCb)

export const MODEL = 'claude-sonnet-5'
/** nome mostrato all'utente (pagina trasparenza) — l'id tecnico sopra serve solo al flag --model della cli */
export const MODEL_DISPLAY_NAME = 'claude'

const RECYCLE_AFTER_TURNS = 8
const TURN_TIMEOUT_MS = 45_000
const WARMUP_TEXT = 'ok'

/* ─────────────────────────── risoluzione binario ────────────────────────── */

async function fileIsExecutable(p: string): Promise<boolean> {
  try {
    await access(p, fsConstants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Un'app Electron impacchettata non eredita il PATH di una shell di login.
 * Si prova prima `which claude` con la shell di login dell'utente, poi le
 * posizioni note.
 */
async function resolveClaudeBinary(): Promise<string | null> {
  try {
    const shell = process.env.SHELL || '/bin/zsh'
    const { stdout } = await exec(`${shell} -lc 'which claude'`, { timeout: 5000 })
    const found = stdout.trim().split('\n')[0]?.trim()
    if (found && (await fileIsExecutable(found))) return found
  } catch {
    // shell di login assente o `claude` non sul suo path: si prova sotto
  }

  const candidates = [
    path.join(os.homedir(), '.local/bin/claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
  ]
  for (const candidate of candidates) {
    if (await fileIsExecutable(candidate)) return candidate
  }
  return null
}

/* ──────────────────────────── errori interni ────────────────────────────── */

class ProcessDiedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProcessDiedError'
  }
}

/**
 * Un `result` con `is_error: true` mentre il processo resta vivo e
 * funzionante — diverso da un processo morto, ma da trattare allo stesso
 * modo: si ritenta una volta invece di scartare subito una risposta che,
 * a volte, è già arrivata per intero prima che questo errore transitorio
 * comparisse. Solo se anche il tentativo di ripiego fallisce si dice
 * davvero che il modello non è raggiungibile.
 */
class TransientCliError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TransientCliError'
  }
}

interface TurnResult {
  text: string
  structured: unknown
}

interface PendingTurn {
  onToken?: (t: string) => void
  textAccum: string
  resolve: (result: TurnResult) => void
  reject: (err: Error) => void
  timeout: NodeJS.Timeout
}

/* ─────────────────────────────── sessione ───────────────────────────────── */

/**
 * Un processo `claude -p` persistente con un system prompt (ed
 * eventualmente uno schema json) fissati alla nascita. I turni sono inviati
 * in sequenza su stdin; le risposte arrivano riga per riga su stdout come
 * eventi `stream_event` (i token) seguiti da un `result` (fine turno).
 */
class ClaudeCliSession {
  private child: ChildProcessWithoutNullStreams | null = null
  private buffer = ''
  private pending: PendingTurn | null = null
  private dead = false
  private intentionalKill = false
  private chain: Promise<unknown> = Promise.resolve()
  turnCount = 0
  recycling = false

  constructor(
    private readonly binaryPath: string,
    private readonly systemPrompt: string,
    private readonly jsonSchema: Record<string, unknown> | undefined,
    private readonly onDied: () => void,
  ) {}

  private spawnArgs(): string[] {
    const args = [
      '-p',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--include-partial-messages',
      '--verbose',
      '--model',
      MODEL,
      '--tools',
      '',
      '--setting-sources',
      '',
      '--strict-mcp-config',
      '--system-prompt',
      this.systemPrompt,
    ]
    if (this.jsonSchema) {
      args.push('--json-schema', JSON.stringify(this.jsonSchema))
    }
    return args
  }

  private async ensureSpawned(): Promise<void> {
    if (this.child && !this.dead) return
    this.dead = false
    this.intentionalKill = false
    this.buffer = ''

    const child = spawn(this.binaryPath, this.spawnArgs(), { stdio: ['pipe', 'pipe', 'pipe'] })
    this.child = child

    child.stdout.on('data', (chunk: Buffer) => this.handleData(chunk))
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8').trim()
      if (text) console.error(`[myynd/claude-cli] ${text.slice(0, 500)}`)
    })
    child.on('error', (err) => this.handleDeath(err))
    child.on('exit', (code) => {
      if (!this.intentionalKill) {
        this.handleDeath(new Error(`il processo claude è terminato inaspettatamente (codice ${code})`))
      }
    })
  }

  private handleDeath(err: Error): void {
    if (this.dead) return
    this.dead = true
    this.child = null
    const pending = this.pending
    this.pending = null
    if (pending) {
      clearTimeout(pending.timeout)
      pending.reject(new ProcessDiedError(err.message))
    }
    this.onDied()
  }

  private handleData(chunk: Buffer): void {
    this.buffer += chunk.toString('utf-8')
    let idx: number
    while ((idx = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, idx).trim()
      this.buffer = this.buffer.slice(idx + 1)
      if (line) this.handleLine(line)
    }
  }

  private handleLine(line: string): void {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(line)
    } catch {
      return // riga non-json (rumore), ignorata
    }
    const pending = this.pending
    if (!pending) return

    // qualunque riga è un segno di vita: la generazione con schema json può
    // comportare un giro interno in più ed essere più lenta di una domanda
    // semplice — quello che conta è che il processo stia ancora lavorando,
    // non il tempo assoluto dall'inizio del turno.
    pending.timeout.refresh()

    if (msg.type === 'stream_event') {
      const event = msg.event as Record<string, unknown> | undefined
      if (event?.type === 'content_block_delta') {
        const delta = event.delta as Record<string, unknown> | undefined
        if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
          pending.textAccum += delta.text
          pending.onToken?.(delta.text)
        }
      }
      return
    }

    if (msg.type === 'result') {
      this.pending = null
      clearTimeout(pending.timeout)
      if (msg.is_error === true) {
        const reason = typeof msg.result === 'string' && msg.result ? msg.result : 'errore dal cli claude'
        pending.reject(new TransientCliError(reason))
        return
      }
      const text = pending.textAccum || (typeof msg.result === 'string' ? msg.result : '')
      pending.resolve({ text, structured: msg.structured_output ?? null })
    }
  }

  /** un turno alla volta: le richieste successive attendono in coda quella in corso */
  runTurn(text: string, onToken?: (t: string) => void): Promise<TurnResult> {
    const result = this.chain.then(() => this.runTurnInternal(text, onToken))
    this.chain = result.catch(() => undefined)
    return result
  }

  private async runTurnInternal(text: string, onToken?: (t: string) => void): Promise<TurnResult> {
    await this.ensureSpawned()
    this.turnCount += 1

    return new Promise<TurnResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.child?.kill()
        this.handleDeath(new Error('il modello non ha risposto in tempo'))
      }, TURN_TIMEOUT_MS)

      this.pending = { onToken, textAccum: '', resolve, reject, timeout }

      const payload =
        JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } }) + '\n'
      this.child!.stdin.write(payload, (err) => {
        if (err) {
          clearTimeout(timeout)
          this.pending = null
          reject(err)
        }
      })
    })
  }

  /** spegnimento intenzionale (riciclo o chiusura app): non conta come morte inattesa */
  async kill(): Promise<void> {
    this.intentionalKill = true
    this.child?.kill()
    this.child = null
    this.dead = true
  }

  /**
   * Variante sincrona, per gli handler di uscita del processo. Usa SIGKILL
   * invece del SIGTERM "gentile" di kill(): l'app sta chiudendo, non c'è
   * nessuno stato da salvare nel processo figlio, e un handler di uscita
   * non può comunque attendere che finisca di spegnersi da solo — misurato
   * che con SIGTERM il processo claude può restare visibile per un paio di
   * secondi dopo che node è già terminato, un orfano temporaneo ma reale.
   */
  killSync(): void {
    this.intentionalKill = true
    this.child?.kill('SIGKILL')
    this.child = null
    this.dead = true
  }
}

/* ─────────────────────────────── provider ───────────────────────────────── */

function sessionKey(systemPrompt: string, jsonSchema?: Record<string, unknown>): string {
  return jsonSchema ? `${systemPrompt} ${JSON.stringify(jsonSchema)}` : systemPrompt
}

const activeProviders = new Set<ClaudeCliProvider>()
let processHandlersRegistered = false

function ensureProcessHandlers(): void {
  if (processHandlersRegistered) return
  processHandlersRegistered = true
  const killAll = () => {
    for (const provider of activeProviders) provider.killAllSync()
  }
  process.on('exit', killAll)
  process.on('SIGINT', () => {
    killAll()
    process.exit(0)
  })
  process.on('SIGTERM', () => {
    killAll()
    process.exit(0)
  })
}

export class ClaudeCliProvider implements Provider {
  name = 'claude-cli'
  private binaryPath: string | null = null
  private binaryResolution: Promise<string | null> | null = null
  private sessions = new Map<string, ClaudeCliSession>()
  /**
   * Ogni sessione mai creata, dal momento stesso in cui il processo figlio
   * nasce — non solo quella "attiva" per una chiave. Il riciclo crea una
   * sessione di ricambio e la scalda prima di renderla attiva: se la si
   * tracciasse solo in `sessions` una chiusura dell'app proprio in quella
   * finestra lascerebbe un processo orfano, mai spento. Questo insieme è
   * l'unica cosa su cui si basa la pulizia in uscita.
   */
  private allSessions = new Set<ClaudeCliSession>()
  private status: ModelStatus = { ready: false, reason: 'claude non trovato', model: MODEL }

  constructor() {
    activeProviders.add(this)
    ensureProcessHandlers()
  }

  ready(): boolean {
    return this.status.ready
  }

  getStatus(): ModelStatus {
    return this.status
  }

  /** un turno è appena andato a buon fine: se lo stato era segnato come irraggiungibile, si corregge */
  private markReachable(): void {
    if (!this.status.ready) this.status = { ready: true, model: MODEL }
  }

  /** un turno (e il suo ripiego) sono definitivamente falliti: lo stato deve dirlo, non restare fermo su "sincronizzato" */
  private markUnreachable(): void {
    this.status = { ready: false, reason: 'claude non raggiungibile', model: MODEL }
  }

  private async ensureBinary(): Promise<string | null> {
    if (this.binaryPath) return this.binaryPath
    if (!this.binaryResolution) this.binaryResolution = resolveClaudeBinary()
    this.binaryPath = await this.binaryResolution
    return this.binaryPath
  }

  /**
   * Risolve il binario e scalda una sessione di prova con un turno usa e
   * getta. Verifica davvero (non presume) che claude sia disponibile e
   * collegato. Va chiamata all'avvio senza attenderla (fire-and-forget):
   * l'avvio dell'app non deve aspettare ~2s di spawn.
   */
  async warmup(defaultSystemPrompt: string): Promise<void> {
    const bin = await this.ensureBinary()
    if (!bin) {
      this.status = { ready: false, reason: 'claude non trovato', model: MODEL }
      return
    }
    try {
      const session = await this.getOrCreateSession(defaultSystemPrompt, undefined)
      await session.runTurn(WARMUP_TEXT)
      this.status = { ready: true, model: MODEL }
    } catch (err) {
      console.error('[myynd/claude-cli] verifica iniziale fallita:', err)
      this.status = { ready: false, reason: 'claude non collegato', model: MODEL }
    }
  }

  private async getOrCreateSession(
    systemPrompt: string,
    jsonSchema: Record<string, unknown> | undefined,
  ): Promise<ClaudeCliSession> {
    const key = sessionKey(systemPrompt, jsonSchema)
    const existing = this.sessions.get(key)
    if (existing) return existing

    const bin = await this.ensureBinary()
    if (!bin) throw new Error('claude cli non disponibile')

    const session = new ClaudeCliSession(bin, systemPrompt, jsonSchema, () => {
      if (this.sessions.get(key) === session) this.sessions.delete(key)
      this.allSessions.delete(session)
    })
    this.allSessions.add(session)
    this.sessions.set(key, session)
    return session
  }

  private async maybeRecycle(
    key: string,
    session: ClaudeCliSession,
    systemPrompt: string,
    jsonSchema: Record<string, unknown> | undefined,
  ): Promise<void> {
    if (session.turnCount < RECYCLE_AFTER_TURNS || session.recycling) return
    if (this.sessions.get(key) !== session) return
    session.recycling = true
    try {
      const bin = await this.ensureBinary()
      if (!bin) return
      const replacement = new ClaudeCliSession(bin, systemPrompt, jsonSchema, () => {
        if (this.sessions.get(key) === replacement) this.sessions.delete(key)
        this.allSessions.delete(replacement)
      })
      // tracciata da subito: il processo nasce dentro runTurn, ben prima che
      // diventi la sessione attiva per questa chiave.
      this.allSessions.add(replacement)
      await replacement.runTurn(WARMUP_TEXT)
      if (this.sessions.get(key) === session) this.sessions.set(key, replacement)
      await session.kill()
    } catch (err) {
      console.error('[myynd/claude-cli] riciclo del processo non riuscito, si riprova più avanti:', err)
      session.recycling = false
    }
  }

  /**
   * `onReset`, se presente, viene invocato subito prima di ripetere il
   * turno — mai dopo che i primi token del tentativo fresco sono già
   * arrivati, cosa che permette al chiamante di scartare tutto quello che
   * ha accumulato dal tentativo fallito prima che il nuovo testo inizi a
   * mescolarsi con quello vecchio.
   *
   * Due cause diverse portano a un solo ritentativo: il processo è morto
   * (`ProcessDiedError`, va rifatto da capo — `getOrCreateSession` spawna
   * una sessione nuova perché quella morta si è già rimossa dalla mappa)
   * oppure la cli ha segnalato un `is_error` transitorio restando viva
   * (`TransientCliError` — qui `getOrCreateSession` ritrova e riusa la
   * stessa sessione, ancora registrata). In entrambi i casi si scarta il
   * tentativo fallito e si riprova una volta sola: solo se anche il
   * ripiego fallisce si dice che il modello non è raggiungibile — non
   * prima, e non per un intoppo transitorio che il turno successivo
   * risolverebbe da solo.
   */
  private async runTurnWithRetry(
    systemPrompt: string,
    text: string,
    jsonSchema: Record<string, unknown> | undefined,
    onToken?: (t: string) => void,
    onReset?: () => void,
  ): Promise<TurnResult> {
    const key = sessionKey(systemPrompt, jsonSchema)
    const session = await this.getOrCreateSession(systemPrompt, jsonSchema)
    try {
      const result = await session.runTurn(text, onToken)
      void this.maybeRecycle(key, session, systemPrompt, jsonSchema)
      this.markReachable()
      return result
    } catch (err) {
      if (err instanceof ProcessDiedError || err instanceof TransientCliError) {
        console.error('[myynd/claude-cli] turno fallito, riprovo una volta:', err.message)
        onReset?.()
        try {
          const fresh = await this.getOrCreateSession(systemPrompt, jsonSchema)
          const result = await fresh.runTurn(text, onToken)
          this.markReachable()
          return result
        } catch (retryErr) {
          // anche il ripiego è fallito: solo ora è vero che il modello non
          // risponde, e solo ora lo stato deve dirlo — l'indicatore in alto
          // non deve restare su "sincronizzato" mentre la risposta sotto
          // dice il contrario.
          this.markUnreachable()
          throw retryErr
        }
      }
      this.markUnreachable()
      throw err
    }
  }

  private lastUserText(messages: ChatMessage[]): string {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'user') return messages[i].content
    }
    return messages[messages.length - 1]?.content ?? ''
  }

  async complete(req: CompleteRequest): Promise<string> {
    const text = this.lastUserText(req.messages)
    const { text: fullText, structured } = await this.runTurnWithRetry(req.system, text, req.jsonSchema)
    if (req.jsonSchema && structured !== null && structured !== undefined) {
      return JSON.stringify(structured)
    }
    return fullText
  }

  async *stream(req: CompleteRequest): AsyncIterable<StreamEvent> {
    const text = this.lastUserText(req.messages)
    const queue: StreamEvent[] = []
    let done = false
    let error: Error | null = null
    let wake: (() => void) | null = null

    const onToken = (t: string) => {
      queue.push({ type: 'token', text: t })
      wake?.()
    }
    const onReset = () => {
      queue.push({ type: 'reset' })
      wake?.()
    }

    this.runTurnWithRetry(req.system, text, req.jsonSchema, onToken, onReset)
      .then(() => {
        done = true
        wake?.()
      })
      .catch((err) => {
        error = err instanceof Error ? err : new Error(String(err))
        done = true
        wake?.()
      })

    while (true) {
      if (queue.length > 0) {
        yield queue.shift() as StreamEvent
        continue
      }
      if (done) {
        if (error) throw error
        return
      }
      await new Promise<void>((resolve) => {
        wake = resolve
      })
      wake = null
    }
  }

  /** ferma tutti i processi figli, compresi quelli di un riciclo in corso — usato anche in uscita dal processo */
  killAllSync(): void {
    for (const session of this.allSessions) session.killSync()
    this.allSessions.clear()
    this.sessions.clear()
  }

  /** ferma tutti i processi figli, per una chiusura ordinata dell'app */
  async shutdown(): Promise<void> {
    const sessions = Array.from(this.allSessions)
    this.allSessions.clear()
    this.sessions.clear()
    activeProviders.delete(this)
    await Promise.all(sessions.map((s) => s.kill()))
  }
}
