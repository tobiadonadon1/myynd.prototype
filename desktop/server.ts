// Il server, tenuto in vita dal guscio.
//
// È lo stesso `server/index.ts` che gira ospitato, avviato come utilityProcess
// di Electron senza toccarlo: gli si chiede la porta 0 e lui risponde con
// `{ porta }` su `parentPort` quando è in ascolto. Tutto quello che scrive
// finisce in un registro su disco, perché un'app che si chiude da sola non ha
// un terminale in cui guardare.
//
// Tre cose che una GUI su Mac non ha e che qui vanno rimesse: il PATH della
// persona (senza, il server non trova `claude`), un riavvio quando muore, e
// una chiusura che aspetta — il server scrive la configurazione mentre si
// spegne, e chiuderlo a metà vorrebbe dire perdere l'ultima cosa salvata.

import { utilityProcess, type UtilityProcess } from 'electron'
import { execFile } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SERVER = fileURLToPath(new URL('../server/index.ts', import.meta.url))

/* ------------------------------------------------------------------ registro */

const LIMITE_REGISTRO = 5 * 1024 * 1024

let percorsoRegistro = ''

/** Dove si scrive: `<userData>/myynd.log`, con un solo `.1` di scorta. */
export function apriRegistro(cartella: string): string {
  mkdirSync(cartella, { recursive: true })
  percorsoRegistro = join(cartella, 'myynd.log')
  return percorsoRegistro
}

export function registro(): string {
  return percorsoRegistro
}

/** Una riga con l'ora davanti. Ruota a 5 MB: il vecchio diventa `.1`, punto. */
export function scriviRegistro(riga: string) {
  if (!percorsoRegistro) return
  try {
    if (existsSync(percorsoRegistro) && statSync(percorsoRegistro).size > LIMITE_REGISTRO) {
      renameSync(percorsoRegistro, percorsoRegistro + '.1')
    }
    appendFileSync(percorsoRegistro, `[${new Date().toISOString()}] ${riga}\n`)
  } catch {
    // il registro non deve mai essere il motivo per cui l'app cade
  }
}

/* ---------------------------------------------------------------------- PATH */

const RIPIEGHI = [
  join(homedir(), '.local', 'bin'),
  '/opt/homebrew/bin',
  '/usr/local/bin',
  join(homedir(), '.claude', 'local'),
  join(homedir(), '.npm-global', 'bin')
]

let pathRisolto: string | null = null

/**
 * Il PATH vero della persona, chiesto una volta alla sua shell di login.
 *
 * Le app aperte dal Finder partono con `/usr/bin:/bin:/usr/sbin:/sbin`: né
 * Homebrew né `~/.local/bin`, cioè né `claude` né niente di quello che ha
 * installato. Si chiede a `$SHELL -ilc` di dircelo, con tre secondi di
 * pazienza — un `.zshrc` che aspetta la rete non deve tenere ferma l'app —
 * e in ogni caso si aggiungono in coda i posti soliti.
 */
export function risolviPATH(): Promise<string> {
  if (pathRisolto) return Promise.resolve(pathRisolto)
  const attuale = process.env.PATH ?? ''
  const unisci = (base: string) => {
    const voci = base.split(':').filter(Boolean)
    for (const r of RIPIEGHI) if (!voci.includes(r)) voci.push(r)
    return voci.join(':')
  }
  if (process.platform === 'win32') return Promise.resolve(attuale)
  return new Promise(risolvi => {
    const shell = process.env.SHELL || '/bin/zsh'
    const fine = (p: string) => { pathRisolto = unisci(p); risolvi(pathRisolto) }
    try {
      execFile(shell, ['-ilc', 'echo -n "__MYYND__$PATH__MYYND__"'],
        { timeout: 3000, maxBuffer: 1024 * 1024, env: { ...process.env, TERM: 'dumb' } },
        (errore, stdout) => {
          const m = /__MYYND__(.*?)__MYYND__/s.exec(String(stdout ?? ''))
          if (m && m[1]) fine(`${m[1]}:${attuale}`)
          else {
            if (errore) scriviRegistro(`guscio · PATH dalla shell non letto: ${errore.message}`)
            fine(attuale)
          }
        })
    } catch (e) {
      scriviRegistro(`guscio · PATH dalla shell non chiesto: ${e instanceof Error ? e.message : e}`)
      fine(attuale)
    }
  })
}

/* --------------------------------------------------------------------- server */

export type Ascolto = {
  /** La porta è arrivata: il server ascolta lì. */
  suPorta(porta: number): void
  /** Il server è morto e non lo si riavvia da soli: tocca alla persona. */
  suMorte(ultimeRighe: string[]): void
}

const RIAVVII_MASSIMI = 3
const FINESTRA_RIAVVII = 60_000
const ATTESA_USCITA = 10_000
const RIGHE_DA_TENERE = 20

let figlio: UtilityProcess | null = null
let fermando = false
let riavvii: number[] = []
let ultime: string[] = []

function ricorda(prefisso: string, blocco: Buffer | string) {
  const testo = String(blocco)
  for (const riga of testo.split(/\r?\n/)) {
    if (!riga) continue
    scriviRegistro(`${prefisso} ${riga}`)
    ultime.push(riga)
    if (ultime.length > RIGHE_DA_TENERE) ultime.shift()
  }
}

/** Le ultime righe che il server ha scritto, per la finestra di errore. */
export function ultimeRighe(): string[] {
  return ultime.slice()
}

export function acceso(): boolean {
  return figlio !== null
}

export async function avvia(ascolto: Ascolto): Promise<void> {
  if (figlio) return
  fermando = false
  const PATH = await risolviPATH()
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v
  // il server crede di essere un Node normale se lo trova: dentro un
  // utilityProcess non lo è, e con questa variabile Electron farebbe pasticci
  delete env.ELECTRON_RUN_AS_NODE
  Object.assign(env, { PATH, MYYND_PORT: '0', NODE_ENV: 'production', MYYND_APP: '1' })
  // MYYND_DEV acceso in produzione fa uscire il server con un errore: meglio
  // toglierlo qui che vedere la finestra di errore
  delete env.MYYND_DEV

  const p = utilityProcess.fork(SERVER, [], {
    env, stdio: 'pipe', serviceName: 'myynd-server',
    execArgv: ['--disable-warning=ExperimentalWarning']
  })
  figlio = p
  ultime = []
  scriviRegistro(`guscio · avvio il server (${SERVER})`)

  p.stdout?.on('data', d => ricorda('server ·', d))
  p.stderr?.on('data', d => ricorda('server !', d))
  p.on('message', (m: unknown) => {
    const porta = (m as { porta?: unknown })?.porta
    if (typeof porta === 'number') {
      scriviRegistro(`guscio · il server ascolta su ${porta}`)
      ascolto.suPorta(porta)
    }
  })
  p.on('exit', codice => {
    if (figlio !== p) return
    figlio = null
    scriviRegistro(`guscio · il server è uscito con ${codice}`)
    if (fermando) return
    const adesso = Date.now()
    riavvii = riavvii.filter(t => adesso - t < FINESTRA_RIAVVII)
    if (riavvii.length < RIAVVII_MASSIMI) {
      riavvii.push(adesso)
      scriviRegistro(`guscio · lo riavvio da solo (${riavvii.length}/${RIAVVII_MASSIMI} nell'ultimo minuto)`)
      void avvia(ascolto)
    } else {
      ascolto.suMorte(ultimeRighe())
    }
  })
}

/** Da capo, su richiesta della persona: il conto dei riavvii riparte da zero. */
export function riavvia(ascolto: Ascolto): Promise<void> {
  riavvii = []
  return avvia(ascolto)
}

/**
 * SIGTERM, poi pazienza: fino a dieci secondi perché finisca di scrivere.
 * Se non basta, si insiste — un server sordo non deve tenere aperta l'app.
 */
export function ferma(): Promise<void> {
  const p = figlio
  if (!p) return Promise.resolve()
  fermando = true
  return new Promise(risolvi => {
    const fine = () => { clearTimeout(orologio); figlio = null; risolvi() }
    const orologio = setTimeout(() => {
      scriviRegistro('guscio · il server non è uscito in tempo, lo chiudo a forza')
      try { if (p.pid) process.kill(p.pid, 'SIGKILL') } catch { /* già andato */ }
      fine()
    }, ATTESA_USCITA)
    p.once('exit', fine)
    scriviRegistro('guscio · chiedo al server di fermarsi')
    p.kill()
  })
}

export function cartellaDati(): string {
  return process.env.MYYND_DATI || join(homedir(), '.myynd')
}

export const cartellaServer = dirname(SERVER)
