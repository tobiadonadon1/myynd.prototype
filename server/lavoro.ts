// Dare un lavoro a Claude Code dentro un progetto collegato.
//
// È il verbo che cambia natura a questa applicazione. Fino a qui Myynd
// *scriveva*: testo che una persona legge, corregge, manda. Da qui Myynd può
// far *succedere* del lavoro dentro un progetto — leggerlo, capirlo, cambiarlo.
//
// Perché passare dalla riga di comando invece di rifare l'agente qui dentro:
// perché Claude Code esiste già, sa lavorare in una cartella, sa cercare fra i
// file, sa scrivere una patch e sa quando fermarsi. Riscriverlo dentro Myynd
// vorrebbe dire un anno di lavoro per avere qualcosa di peggio.
//
// La regola di questa casa non cambia, e qui vale il doppio: **prima guarda,
// poi fa**. Due passi, e sono due apposta:
//
//   1. `--permission-mode plan` — legge il progetto e scrive cosa farebbe.
//      Non tocca un file. Quello che torna si legge come una bozza qualsiasi.
//   2. `--permission-mode acceptEdits` — lo fa in una copia del progetto,
//      dopo che una persona ha letto il piano e ha premuto.
//
// Un solo passo — «fai» e basta — sarebbe stato metà del lavoro e il doppio del
// rischio: modifiche di cui nessuno ha visto il piano.
//
// E il recinto è quello di sempre: solo le cartelle collegate, mai la copia
// originale per il passo che cambia file.

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { realpath, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { ConfigDesktop } from './config.ts'
import { OSPITATO } from './ospitato.ts'
import { executeInCopy, type ExecutionReport } from './esecuzione-isolata.ts'
import { detectRuntime, runHermesPatch, type RuntimeId, type RuntimeProvenance } from './agent-runtime.ts'
import { reviewProjectReport, type TeamEvidence } from './project-review.ts'

type ProjectReport = ExecutionReport & {runtimeProvenance?:RuntimeProvenance; team?:TeamEvidence}
async function saveOutcome(report:ProjectReport, options:{runtime?:RuntimeId; team?:boolean; acceptanceCriteria?:string; signal?:AbortSignal}):Promise<void> {
  await writeFile(report.reportFile,JSON.stringify(report,null,2),{mode:0o600})
  if(options.team) {
    report.team=await reviewProjectReport(report,options.acceptanceCriteria!,{worker:options.runtime ?? 'claude',signal:options.signal})
    if(!report.team.accepted && report.state==='verified') report.state='unverified'
    await writeFile(report.reportFile,JSON.stringify(report,null,2),{mode:0o600})
  }
}

/** Dove sta `claude`. Non si cerca nella PATH: un'app impacchettata non ce l'ha. */
const DOVE = [
  `${process.env.HOME}/.local/bin/claude`,
  '/opt/homebrew/bin/claude',
  '/usr/local/bin/claude'
]

/**
 * Su un server la risposta è «no» prima ancora di guardare.
 *
 * Dentro un contenitore l'eseguibile non c'è. Ma se ci fosse — chi ospita che
 * lo installa per sé — sarebbe *il suo* account a rispondere per tutte le
 * persone registrate, e a lavorare dentro cartelle del server, non loro. È la
 * stessa ragione per cui il desktop non si offre ospitato (`ospitato.ts`):
 * qui è più grave, perché non legge soltanto, agisce. Da questa riga
 * discendono `abbonamento.pronto()`, `/api/lavoro/pronto` e `fai()`: un
 * posto solo, e tutte e tre le strade si chiudono insieme.
 */
export function installato(): string | null {
  if (OSPITATO) return null
  return DOVE.find(p => existsSync(p)) ?? null
}

export type Passo = 'piano' | 'fai'

export type Esito = {
  passo: Passo
  testo: string
  /** Vero se è finito da solo, falso se l'abbiamo fermato noi. */
  finito: boolean
  cartella: string
  /** Present only for edits: files and tests in the isolated project copy. */
  esecuzione?: ProjectReport
}

/**
 * La cartella dev'essere una di quelle collegate — la stessa regola di
 * `scrivania.ts`, e per lo stesso motivo. Qui pesa di più: là si scriveva un
 * file, qui si lascia lavorare un agente dentro una cartella intera.
 */
async function dentroLeTue(cartella: string, c: ConfigDesktop | null | undefined): Promise<string> {
  const scelte = c?.cartelle ?? []
  if (!scelte.length) throw new Error('Collega una cartella del desktop e potrò lavorarci.')
  const vero = await realpath(resolve(cartella)).catch(() => resolve(cartella))
  for (const s of scelte) {
    const radice = await realpath(resolve(s)).catch(() => resolve(s))
    if (vero === radice || vero.startsWith(radice + '/')) return vero
  }
  throw new Error('Posso lavorare solo nelle cartelle che hai collegato.')
}

/** Il tetto: un lavoro che non finisce non deve tenere occupato il server. */
const TETTO_MINUTI = { piano: 5, fai: 20 }
const TETTO_TESTO = 200_000

/**
 * Fa girare Claude Code e riporta indietro ciò che ha fatto nella copia.
 *
 * `spawn` con gli argomenti in un elenco, mai una stringa di shell: la
 * richiesta è testo di una persona, e in una shell un testo con dentro un punto
 * e virgola smette di essere testo. Qui è un argomento, e un argomento è solo
 * quello.
 *
 * L'ambiente si passa quasi intero — Claude Code ha bisogno delle sue
 * credenziali — ma senza la chiave API di Myynd: sono due conti diversi, e
 * quello che spende l'uno non deve finire sull'altro.
 */
/**
 * Gli argomenti della riga di comando, staccati apposta.
 *
 * Stanno in una funzione loro perché quello che c'è qui dentro è una superficie
 * di sicurezza — cosa può toccare un agente che parte da solo alle sette di
 * mattina — e una superficie di sicurezza va provata, non guardata. Una prova
 * la legge; un array in mezzo a `fai` no.
 */
export function argomentiDi(passo: Passo, richiesta = ''): string[] {
  return [
    '-p', richiesta,
    '--permission-mode', passo === 'piano' ? 'plan' : 'acceptEdits',
    '--output-format', 'text',

    /*
     * Le impostazioni del progetto non sono le sue.
     *
     * Dentro una cartella collegata può esserci un `.claude/settings.json` che
     * dichiara degli hook — comandi che partono da soli, prima e dopo ogni
     * attrezzo, in modalità piano come in qualunque altra — e un `.mcp.json`
     * che dichiara server a cui il modello può parlare. Li ha scritti chi ha
     * fatto quel progetto: una cartella clonata da internet, un repository di
     * un cliente. Chi ha collegato la cartella non li ha letti e non sa che
     * esistono.
     *
     * Quindi si caricano solo le impostazioni della persona (`user`), mai
     * quelle del progetto, e nessun server MCP: `--strict-mcp-config` senza
     * nessun `--mcp-config` vuol dire nessuno. Vale per tutti e due i passi —
     * chi preme «fallo» ha approvato delle modifiche a dei file, non un
     * comando che parte da sé.
     */
    '--setting-sources', 'user',
    '--strict-mcp-config',

    // The agent edits only files in the task copy. Shell and network actions
    // are outside that scope; verification runs separately with fixed argv.
    '--disallowedTools', 'Bash', 'WebFetch', 'WebSearch'
  ]
}

export async function fai(
  desktop: ConfigDesktop | null | undefined,
  o: { cartella: string; richiesta: string; passo: Passo; signal?: AbortSignal; runtime?: RuntimeId; hermes?: { files: string[]; model: string; provider: string }; team?:boolean; acceptanceCriteria?:string }
): Promise<Esito> {
  // Prima quello che riguarda la richiesta, poi quello che riguarda la
  // macchina: se la cartella è fuori dal recinto va detto *quello*, anche su un
  // computer dove Claude Code manca. Sono due notizie diverse, e la prima è
  // quella che si può correggere.
  if (!o.richiesta.trim()) throw new Error('Non c’è niente da chiedergli.')
  if(o.team && (!o.acceptanceCriteria?.trim() || o.acceptanceCriteria.length>4000)) throw new Error('Write explicit acceptance criteria for the worker and reviewer team.')
  const cartella = await dentroLeTue(o.cartella, desktop)
  const workerRequest=o.team ? `${o.richiesta}\n\nUser acceptance criteria: ${o.acceptanceCriteria}` : o.richiesta
  if (o.runtime === 'hermes') {
    if (o.passo !== 'fai') throw new Error('Discuss the goal first; Hermes supports a scoped patch in the project copy.')
    if (!o.hermes) throw new Error('Choose the project files, model and provider for Hermes.')
    const runtime = await detectRuntime('hermes')
    if (runtime.status !== 'supported' || !runtime.executable) throw new Error('A compatible Hermes CLI is not installed on this computer.')
    const report = await executeInCopy(cartella, async (workspace, signal) => runHermesPatch(runtime, workspace, workerRequest, { ...o.hermes!, signal }), { signal: o.signal }) as ProjectReport
    report.runtimeProvenance = { runtime: 'hermes', executable: runtime.executable, version: runtime.version, scope: 'copy-files', model: o.hermes.model, provider: o.hermes.provider }
    await saveOutcome(report,o)
    return { passo: 'fai', testo: `Hermes · ${report.state}\nWorking copy: ${report.workspace}\n${report.agentText}`, finito: report.state === 'verified', cartella: report.workspace, esecuzione: report }
  }
  const exe = installato()
  if (!exe) throw new Error('Claude Code non è installato su questo computer.')

  if (o.passo === 'fai') {
    const report = await executeInCopy(cartella, async (workspace, signal) => {
      const request = `${workerRequest}\n\nLavora esclusivamente nella cartella corrente, che è una copia isolata del progetto collegato. Non modificare la cartella originale; non creare commit, non inviare modifiche e non distribuire il progetto. Cambia i file necessari e descrivi brevemente ciò che hai fatto.`
      const result = await runClaude(exe, workspace, 'fai', request, signal)
      return { exitCode: result.exitCode, finished: result.finished, text: result.text }
    }, { signal: o.signal }) as ProjectReport
    report.runtimeProvenance = { runtime: 'claude', executable: exe, scope: 'copy-files' }
    await saveOutcome(report,o)
    return {
      passo: 'fai',
      testo: report.state === 'verified'
        ? `Modifiche nella copia ${report.workspace}: ${report.changedFiles.map(f => f.path).join(', ')}. Verifica superata.\n\n${report.agentText}`
        : `Il lavoro nella copia ${report.workspace} richiede una revisione: ${report.state}. ${report.verification.output ?? ''}\n\n${report.agentText}`,
      finito: report.state === 'verified', cartella: report.workspace, esecuzione: report
    }
  }
  const result = await runClaude(exe, cartella, 'piano', o.richiesta, o.signal)
  if (result.exitCode !== 0 && !result.text) throw new Error('Claude Code non ce l’ha fatta.')
  return { passo: 'piano', testo: result.text, finito: result.finished && result.exitCode === 0, cartella }
}

async function runClaude(exe: string, cwd: string, passo: Passo, richiesta: string, signal?: AbortSignal): Promise<{ text: string; exitCode: number | null; finished: boolean }> {
  const args = argomentiDi(passo, richiesta)
  const { ANTHROPIC_API_KEY: _mia, ...ambiente } = process.env
  if (signal?.aborted) return { text: '', exitCode: null, finished: false }
  return await new Promise((risolvi, rifiuta) => {
    const p = spawn(exe, args, { cwd, env: ambiente, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] })
    let fuori = ''
    let male = ''
    let finito = true
    let settled = false

    const stop = () => {
      finito = false
      try { if (p.pid && process.platform !== 'win32') process.kill(-p.pid, 'SIGTERM'); else p.kill('SIGTERM') } catch { /* already gone */ }
      setTimeout(() => {
        try { if (p.pid && process.platform !== 'win32') process.kill(-p.pid, 'SIGKILL'); else p.kill('SIGKILL') } catch { /* already gone */ }
      }, 2000).unref()
    }

    const tetto = setTimeout(() => {
      stop()
    }, TETTO_MINUTI[passo] * 60_000)
    signal?.addEventListener('abort', stop, { once: true })

    p.stdout.on('data', d => {
      if (fuori.length < TETTO_TESTO) fuori += String(d)
    })
    p.stderr.on('data', d => { if (male.length < 4000) male += String(d) })

    p.on('error', e => {
      if (settled) return
      settled = true
      clearTimeout(tetto)
      signal?.removeEventListener('abort', stop)
      rifiuta(new Error(`Non sono riuscito ad avviare Claude Code: ${e.message}`))
    })

    p.on('close', codice => {
      if (settled) return
      settled = true
      clearTimeout(tetto)
      signal?.removeEventListener('abort', stop)
      const testo = fuori.trim()
      if (!testo && /not logged in|authentication/i.test(male)) return rifiuta(new Error('Claude Code non è collegato: apri un terminale e fai «claude» una volta.'))
      risolvi({ text: testo, exitCode: codice, finished: finito })
    })
  })
}
