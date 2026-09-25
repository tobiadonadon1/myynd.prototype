// Cosa sa fare il `claude` installato (P10), senza mai chiederlo durante una chat.
//
// Tre opzioni fanno partire prima la risposta sull'account Claude:
// `--tools ''` (nessun attrezzo da descrivere nel preambolo),
// `--no-session-persistence` (niente trascrizione su disco) e `--effort low`
// (per una domanda secca). Una versione vecchia non le conosce, e passarle
// vorrebbe dire un errore al posto della risposta. Quindi si guarda `--help`
// una volta per versione, di fondo, e fino ad allora si parte come sempre.
//
// La versione è il file stesso: percorso vero, data e dimensione. Un
// aggiornamento di Claude Code cambia la chiave e si riguarda da capo.

import { spawn } from 'node:child_process'
import { realpathSync, statSync } from 'node:fs'

export type Bandiere = { tools: boolean; sessione: boolean; effort: boolean }

const note_ = new Map<string, Bandiere>()
const inCorso = new Map<string, Promise<Bandiere>>()
const NESSUNA: Bandiere = { tools: false, sessione: false, effort: false }

function chiave(exe: string): string | null {
  try {
    const vero = realpathSync(exe)
    const s = statSync(vero)
    return `${vero}·${s.mtimeMs}·${s.size}`
  } catch { return null }
}

/** Quello che si sa già di questo `claude`, o null: non lancia mai niente. */
export function note(exe: string): Bandiere | null {
  const k = chiave(exe)
  return k ? note_.get(k) ?? null : null
}

/** Legge `exe --help`, una volta per versione. Mai dentro una chat: la lancia chi guarda lo stato. */
export function sonda(exe: string): Promise<Bandiere> {
  const k = chiave(exe)
  if (!k) return Promise.resolve(NESSUNA)
  const gia = note_.get(k)
  if (gia) return Promise.resolve(gia)
  const corre = inCorso.get(k)
  if (corre) return corre
  const p = new Promise<Bandiere>(risolvi => {
    const { ANTHROPIC_API_KEY: _no, ...ambiente } = process.env
    let fuori = ''
    let finito = false
    const fine = (b: Bandiere) => { if (finito) return; finito = true; clearTimeout(tetto); inCorso.delete(k); note_.set(k, b); risolvi(b) }
    let figlio: ReturnType<typeof spawn>
    try { figlio = spawn(exe, ['--help'], { env: ambiente, stdio: ['ignore', 'pipe', 'ignore'] }) }
    catch { fine(NESSUNA); return }
    const tetto = setTimeout(() => { try { figlio.kill('SIGTERM') } catch { /* già via */ } fine(NESSUNA) }, 5000)
    figlio.stdout?.on('data', d => { if (fuori.length < 200_000) fuori += String(d) })
    figlio.on('error', () => fine(NESSUNA))
    figlio.on('close', () => fine({
      tools: /--tools\b/.test(fuori),
      sessione: /--no-session-persistence\b/.test(fuori),
      effort: /--effort\b/.test(fuori)
    }))
  })
  inCorso.set(k, p)
  return p
}

/** Questa versione ha detto «unknown option»: da qui in poi niente opzioni nuove. */
export function rifiutate(exe: string): void {
  const k = chiave(exe)
  if (k) note_.set(k, NESSUNA)
}

export function perProva(): void {
  note_.clear()
  inCorso.clear()
}
