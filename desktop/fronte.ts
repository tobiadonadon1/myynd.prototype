// Chi c'è davanti: le due fonti dell'osservatore.
//
// La prima è un piccolo programma nostro, `bin/myynd-fronte` (il sorgente è
// `bin/fronte.swift`, lo costruisce `build/fronte.cjs`): ascolta il Mac
// invece di chiedergli ogni tanto, e scrive una riga JSON a ogni cambio — app
// davanti e, se la persona ha dato il permesso di Accessibilità, titolo della
// finestra. Muore da solo quando il guscio chiude il suo stdin, cioè quando
// Myynd esce, anche se esce male.
//
// La seconda è il ripiego, quando il programma non c'è (in sviluppo, prima di
// `npm run fronte`) o continua a cadere: `lsappinfo`, che il Mac ha di serie,
// chiesto ogni cinque secondi. Solo l'app, mai il titolo.
//
// Le due letture delle righe sono pure e provate su esempi veri. Le fonti vere
// non girano mai in una prova: guarderebbero la persona che sta lavorando.

import { spawn, execFile } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import type { EventoFronte } from './sessioni.ts'

export type FonteFronte = {
  /** Da dove arrivano gli eventi: il programma nostro, o `lsappinfo`. */
  tipo: 'aiutante' | 'ripiego'
  /** Chi c'è davanti adesso, anche se non è cambiato (dopo un blocco, un sonno). */
  chiedi(): void
  ferma(): void
}
export type OpzioniFonte = {
  titoli: boolean
  suEvento: (e: EventoFronte) => void
  /** La fonte si è fermata da sola (il programma è uscito, non è partito). */
  suFine: (motivo: string) => void
  /** Solo il ripiego, anche se il programma c'è: dopo tre cadute. */
  ripiego?: boolean
}
export type Crea = (o: OpzioniFonte) => FonteFronte

/** Il segno di direzione che macOS mette davanti al nome di certe app, e i suoi fratelli. */
const DIREZIONE = /[‎‏‪-‮]/g

/* ------------------------------------------------------------------ letture */

/** Una riga del programma: quella forma e nient'altro. */
export function leggiRiga(riga: string): EventoFronte | null {
  let v: unknown
  try { v = JSON.parse(riga) } catch { return null }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const { bundle, app, pid, titolo, t } = v as Record<string, unknown>
  if (typeof bundle !== 'string' || typeof app !== 'string') return null
  if (typeof pid !== 'number' || !Number.isInteger(pid)) return null
  if (titolo !== null && typeof titolo !== 'string') return null
  if (typeof t !== 'number' || !Number.isFinite(t)) return null
  return { bundle, app, pid, titolo, t }
}

/** L'ASN che `lsappinfo front` scrive: `ASN:0x0-0x1d01d:`. */
export function leggiAsn(testo: string): string | null {
  const m = /ASN:0x[0-9a-f]+-0x[0-9a-f]+:?/i.exec(testo)
  return m ? m[0] : null
}

/**
 * Quello che `lsappinfo info -only name -only bundleid -only pid <ASN>` scrive:
 *
 *   "LSDisplayName"="‎WhatsApp"
 *   "CFBundleIdentifier"="net.whatsapp.WhatsApp"
 *   "pid"=75956
 *
 * Senza bundle non si sa chi è: `null`.
 */
export function leggiLsappinfo(testo: string, t: number): EventoFronte | null {
  const bundle = /"CFBundleIdentifier"="([^"]*)"/.exec(testo)?.[1]?.replace(DIREZIONE, '').trim()
  if (!bundle) return null
  const nome = /"LSDisplayName"="([^"]*)"/.exec(testo)?.[1]?.replace(DIREZIONE, '').trim()
  const pid = Number(/"pid"\s*=\s*(\d+)/.exec(testo)?.[1] ?? 0)
  return { bundle, app: nome || bundle, pid: Number.isInteger(pid) ? pid : 0, titolo: null, t }
}

/* ---------------------------------------------------------------- percorso */

/** Dentro l'asar un eseguibile non parte: quello vero sta in `app.asar.unpacked`. */
export function spacchettato(percorso: string): string {
  return percorso.replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2')
}

function eseguibile(p: string): boolean {
  try { accessSync(p, constants.X_OK); return true } catch { return false }
}

/** Dov'è il programma, o `null` se non c'è o non si può eseguire. */
export function percorsoHelper(o: { url?: URL; esiste?: (p: string) => boolean } = {}): string | null {
  const url = o.url ?? new URL('./bin/myynd-fronte', import.meta.url)
  const p = spacchettato(fileURLToPath(url))
  return (o.esiste ?? eseguibile)(p) ? p : null
}

/* -------------------------------------------------------------------- fonti */

/** Il programma nostro: un evento per riga, finché il suo stdin resta aperto. */
function creaAiutante(percorso: string, o: OpzioniFonte): FonteFronte {
  let finita = false
  const figlio = spawn(percorso, o.titoli ? ['--titoli'] : [], { stdio: ['pipe', 'pipe', 'ignore'] })
  const fine = (motivo: string) => {
    if (finita) return
    finita = true
    o.suFine(motivo)
  }
  figlio.on('error', () => fine('errore'))
  figlio.on('exit', () => fine('uscito'))
  // uno stdin rotto (il programma è già uscito) non deve far cadere il guscio
  figlio.stdin?.on('error', () => {})
  if (figlio.stdout) {
    const righe = createInterface({ input: figlio.stdout })
    righe.on('line', riga => {
      if (finita) return
      const e = leggiRiga(riga)
      if (e) o.suEvento(e)
    })
  }
  return {
    tipo: 'aiutante',
    chiedi() {
      if (finita) return
      try { figlio.stdin?.write('ora\n') } catch { /* è già uscito */ }
    },
    ferma() {
      finita = true
      try { figlio.stdin?.end() } catch { /* già chiuso */ }
      try { figlio.kill('SIGTERM') } catch { /* già andato */ }
    }
  }
}

const OGNI_RIPIEGO = 5_000

function eseguiVero(cmd: string, argomenti: string[]): Promise<string> {
  return new Promise(risolvi => {
    execFile(cmd, argomenti, { timeout: 3_000, maxBuffer: 64 * 1024 }, (errore, stdout) => {
      risolvi(errore ? '' : String(stdout ?? ''))
    })
  })
}

/**
 * `lsappinfo` ogni cinque secondi: solo l'app, e solo quando cambia.
 * `esegui` si cambia solo nelle prove.
 */
export function creaRipiego(o: OpzioniFonte, esegui: (cmd: string, argomenti: string[]) => Promise<string> = eseguiVero): FonteFronte {
  let fermata = false
  let ultimo = ''
  let inCorso = false
  // un chiedi() arrivato mentre un giro è a metà: si rifà appena finisce
  let richiesto = false
  const giro = async (sempre: boolean) => {
    if (fermata) return
    if (inCorso) { if (sempre) richiesto = true; return }
    inCorso = true
    try {
      const asn = leggiAsn(await esegui('lsappinfo', ['front']))
      if (!asn || fermata) return
      const e = leggiLsappinfo(await esegui('lsappinfo', ['info', '-only', 'name', '-only', 'bundleid', '-only', 'pid', asn]), Date.now())
      if (!e || fermata) return
      const chiave = `${e.bundle}\u0000${e.pid}`
      if (!sempre && chiave === ultimo) return
      ultimo = chiave
      o.suEvento(e)
    } finally {
      inCorso = false
      if (richiesto && !fermata) { richiesto = false; void giro(true) }
    }
  }
  const orologio = setInterval(() => { void giro(false) }, OGNI_RIPIEGO)
  orologio.unref?.()
  void giro(true)
  return {
    tipo: 'ripiego',
    chiedi() { void giro(true) },
    ferma() { fermata = true; clearInterval(orologio) }
  }
}

/** Il programma se c'è e parte; altrimenti, o se lo si chiede, il ripiego. */
export const creaFonte: Crea = o => {
  const p = o.ripiego ? null : percorsoHelper()
  if (p) {
    try { return creaAiutante(p, o) } catch { /* non è partito: ripiego */ }
  }
  return creaRipiego(o)
}
