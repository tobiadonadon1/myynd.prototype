// Il turno (F2): Myynd lavora la bacheca da solo.
//
// Hermes ha un dispatcher che ogni sessanta secondi prende una carta pronta e
// la fa partire. Qui è lo stesso, con tre differenze che vengono da chi usa
// questa app, non da chi la programma:
//
//   · Le carte non le scrive solo lei. Una carta che lei passa a Myynd entra
//     «In coda»; una che Myynd propone dal suo materiale (una mail che chiede
//     qualcosa, una fattura da pagare) ci entra da sola, se lei ha acceso le
//     bozze pronte prima che le chieda. Tutte e due le lavora il turno.
//   · Il tempo è quello di una persona. Una carta di oggi parte subito; una
//     di domani la notte prima; le proposte di Myynd di notte o quando lei
//     non c'è. Le regole stanno in `turno-regole.ts`, pure.
//   · C'è un tetto e un bottone. Dodici carte in una giornata, di serie, e
//     la pausa: il turno è una cosa che lei vede e ferma, non un processo.
//
// Una carta alla volta per persona: è la regola della coda di `compiti.ts`,
// e il turno la rispetta. Quando una finisce, il turno guarda se ce n'è
// un'altra pronta (`compiti.quandoLibero`): la bacheca si svuota in fila,
// una dopo l'altra, finché c'è qualcosa di pronto e il tetto lo permette.
//
// Niente di quello che parte da qui manda, paga o cancella: il lavoro è
// quello di una carta affidata, con le mani del suo contratto (F1), e finisce
// in una bozza, un file, una nota o una copia del progetto.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as store from './store.ts'
import * as cfg from './config.ts'
import * as chi from './chi.ts'
import * as progetti from './progetti.ts'
import * as compiti from './compiti.ts'
import * as contratto from './contratto.ts'
import * as presenza from './presenza.ts'
import * as regole from './turno-regole.ts'
import { fonteValida } from './iniziativa.ts'
import { puoLavorare, rifiutata, testaAlLavoro } from './modello.ts'

/** Quante carte in una giornata, di serie; e il minimo e il massimo che si possono scegliere. */
export const CARTE_DI_SERIE = 12
export const CARTE_MIN = 1
export const CARTE_MAX = 40
/** Le partenze dopo le quali una carta che si interrompe non riparte da sola. */
export const TENTATIVI_MAX = 2
/** Una pausa dura da un minuto a una giornata. */
export const PAUSA_MAX = 24 * 60

export type Impostazioni = {
  acceso: boolean
  pausaFino: string | null
  carte: number
  notte: regole.Finestra
}

export function impostazioni(c: cfg.Config = cfg.leggi(), adesso = new Date()): Impostazioni {
  const t = c.turno ?? {}
  const carte = Number.isInteger(t.carte) ? Math.min(CARTE_MAX, Math.max(CARTE_MIN, t.carte as number)) : CARTE_DI_SERIE
  const pausa = t.pausaFino && Date.parse(t.pausaFino) > adesso.getTime() ? new Date(Date.parse(t.pausaFino)).toISOString() : null
  return {
    acceso: t.spento !== true,
    pausaFino: pausa,
    carte,
    notte: {
      da: regole.oraValida(t.notteDa) ? t.notteDa : regole.NOTTE_DI_SERIE.da,
      a: regole.oraValida(t.notteA) ? t.notteA : regole.NOTTE_DI_SERIE.a
    }
  }
}

/** Cambia le impostazioni del turno. Lancia con una frase sua se un valore non va. */
export function imposta(p: { acceso?: unknown; pausa?: unknown; carte?: unknown; notteDa?: unknown; notteA?: unknown }, adesso = new Date()): Impostazioni {
  const c = cfg.leggi()
  const t = { ...(c.turno ?? {}) }
  if (p.acceso !== undefined) {
    if (typeof p.acceso !== 'boolean') throw new Error('Acceso o spento?')
    t.spento = !p.acceso
    if (p.acceso) t.pausaFino = null
  }
  if (p.pausa !== undefined) {
    // zero, o null, riprende; un numero di minuti mette in pausa
    if (p.pausa === null || p.pausa === 0) t.pausaFino = null
    else if (typeof p.pausa === 'number' && Number.isInteger(p.pausa) && p.pausa >= 1 && p.pausa <= PAUSA_MAX) t.pausaFino = new Date(adesso.getTime() + p.pausa * 60_000).toISOString()
    else throw new Error('Quanto deve durare la pausa?')
  }
  if (p.carte !== undefined) {
    if (typeof p.carte !== 'number' || !Number.isInteger(p.carte) || p.carte < CARTE_MIN || p.carte > CARTE_MAX) throw new Error('Quante carte in una giornata?')
    t.carte = p.carte
  }
  for (const k of ['notteDa', 'notteA'] as const) {
    if (p[k] === undefined) continue
    if (!regole.oraValida(p[k])) throw new Error('Un’ora come 22:00.')
    t[k] = p[k] as string
  }
  if ((t.notteDa ?? regole.NOTTE_DI_SERIE.da) === (t.notteA ?? regole.NOTTE_DI_SERIE.a)) throw new Error('La notte comincia e finisce alla stessa ora.')
  cfg.aggiorna({ turno: t })
  return impostazioni(cfg.leggi(), adesso)
}

// — il conto della giornata: su disco, per persona —

type Conto = { giornata: string; avviate: number }
const fileConto = () => join(cfg.cartella(), 'turno.json')

function leggiConto(inizio: string): Conto {
  try {
    if (existsSync(fileConto())) {
      const c = JSON.parse(readFileSync(fileConto(), 'utf8'))
      if (c && c.giornata === inizio && Number.isInteger(c.avviate)) return { giornata: inizio, avviate: c.avviate }
    }
  } catch { /* un conto illeggibile riparte da zero: meglio una carta in più che il turno fermo */ }
  return { giornata: inizio, avviate: 0 }
}

function scriviConto(c: Conto) {
  mkdirSync(cfg.cartella(), { recursive: true })
  writeFileSync(fileConto() + '.tmp', JSON.stringify(c), { mode: 0o600 })
  renameSync(fileConto() + '.tmp', fileConto())
}

/**
 * Le mani, sostituibili solo nelle prove: far partire una carta, sapere se il
 * motore c'è, se la persona ha già un lavoro in corso, se lei c'è.
 */
type Ferri = {
  affida: (id: string, modo: string, nativa: boolean) => void
  motore: () => boolean
  occupato: (utente: string) => boolean
  assente: () => boolean
  /** Il contratto preciso, prima di partire: la carta aspetta il modello al massimo qualche secondo. */
  contratto: (id: string) => Promise<unknown>
}
const VERI: Ferri = {
  affida: (id, modo, nativa) => compiti.affida(id, modo, nativa),
  motore: () => {
    if (!puoLavorare()) return false
    const t = testaAlLavoro()
    return !((t === 'claude' || t === 'openai') && rifiutata(t))
  },
  occupato: u => compiti.occupatoPer(u),
  assente: () => presenza.assente(),
  contratto: id => contratto.assicura(id, { rifai: true, attesa: 6_000 })
}
let ferri: Ferri = VERI

/** Solo per le prove: sostituisce le mani, o le rimette (con `null`). */
export function perProva(f: Partial<Ferri> | null) { ferri = f ? { ...VERI, ...f } : VERI }

/** Il contesto delle regole, adesso. */
export function contesto(adesso = new Date(), imp = impostazioni(cfg.leggi(), adesso)): regole.Contesto {
  return { adesso, notte: imp.notte, assente: ferri.assente() }
}

/** Una carta nata da un'iniziativa di Myynd la cui fonte non regge più: si ritira invece di lavorarla. */
function ritirabile(c: store.Compito): boolean {
  return c.origine === 'iniziativa' && !fonteValida(c.doc)
}

/**
 * Le carte in coda, pronte adesso, nell'ordine in cui partirebbero.
 * Pura rispetto all'indice: non fa partire niente.
 */
export function pronte(adesso = new Date()): store.Compito[] {
  const ctx = contesto(adesso)
  const alti = new Set(progetti.elenco('attivo').filter(p => p.priorita === 'alta').map(p => p.id))
  return store.elencoCompiti()
    .filter(c => regole.pronta(c, ctx) && (c.turno?.tentativi ?? 0) < TENTATIVI_MAX + 1)
    .map(c => ({ c, p: regole.punteggio(c, { adesso, progettoAlto: !!c.progetto && alti.has(c.progetto) }) }))
    .sort((a, b) => b.p - a.p || a.c.ordine.localeCompare(b.c.ordine) || a.c.id.localeCompare(b.c.id))
    .map(x => x.c)
}

const inGiro = new Set<string>()

/**
 * Un giro del turno: se si può, fa partire la carta pronta che conta di più.
 *
 * Non fa niente — e lo dice nel registro solo quando cambia qualcosa — se il
 * turno è spento o in pausa, se non c'è un motore, se la persona ha già un
 * lavoro in corso, se il tetto della giornata è raggiunto, o se niente è
 * pronto. Torna l'id della carta partita, o null. Non lancia mai.
 */
export async function giro(adesso = new Date()): Promise<string | null> {
  const conto = cfg.cartella()
  if (inGiro.has(conto)) return null
  inGiro.add(conto)
  try {
    const imp = impostazioni(cfg.leggi(), adesso)
    if (!imp.acceso || imp.pausaFino) return null
    if (!ferri.motore()) return null
    const utente = chi.adesso() ?? ''
    if (ferri.occupato(utente)) return null
    const inizio = regole.inizioGiornata(adesso, imp.notte).toISOString()
    const c = leggiConto(inizio)
    if (c.avviate >= imp.carte) return null
    for (const carta of pronte(adesso)) {
      if (ritirabile(carta)) {
        store.cambiaStatoCompito(carta.id, 'ritirato', 'Source changed or preparation paused')
        compiti.annunciaCambio()
        continue
      }
      // il contratto preciso prima di partire, se il modello risponde in
      // qualche secondo: chi scrive e chi rilegge guardano la stessa riga
      await ferri.contratto(carta.id)
      // nel frattempo la carta può essere cambiata di mano
      const ora = store.compito(carta.id)
      if (!ora || !regole.inCoda(ora) || ferri.occupato(utente)) return null
      const notte = regole.inNotte(adesso, imp.notte)
      const t: store.TurnoCompito = {
        da: ora.turno?.da ?? 'tu', quando: ora.turno?.quando ?? 'presto', dal: ora.turno?.dal ?? ora.aggiornato,
        tentativi: (ora.turno?.tentativi ?? 0) + 1, ultimo: adesso.toISOString(), notte
      }
      store.scriviTurnoCompito(ora.id, t)
      store.segnaNelDiario(ora.id, { tipo: 'turno', dettaglio: notte ? 'notte' : ferri.assente() ? 'via' : 'giorno' })
      scriviConto({ giornata: inizio, avviate: c.avviate + 1 })
      console.info(`myynd · turno · parte · ${ora.id} · ${t.da} · ${notte ? 'notte' : 'giorno'} · ${c.avviate + 1}/${imp.carte}`)
      ferri.affida(ora.id, ora.modo && ora.modo !== 'io' ? ora.modo : 'tutto', t.da !== 'myynd')
      return ora.id
    }
    return null
  } catch (e) {
    console.warn('myynd · il turno non è riuscito:', e instanceof Error ? e.message : e)
    return null
  } finally {
    inGiro.delete(conto)
  }
}

/**
 * Una carta in coda per Myynd, messa da lei (o da Myynd, per le sue proposte).
 *
 * Si scrive il turno e la base del contratto nello stesso istante (così la
 * carta in «In coda» ha già il suo «fatto»), poi si guarda se può partire.
 * Solo da aperta: lancia con una frase sua se no.
 */
export function mettiInCoda(id: string, da: 'tu' | 'myynd' = 'tu', quando: 'presto' | 'notte' = 'presto', adesso = new Date()): store.TurnoCompito {
  const c = store.compito(id)
  if (!c) throw new Error('Compito non trovato.')
  if (c.stato !== 'aperto') throw new Error('Questa carta non si mette in coda: rispondile, o cambiala.')
  const modo = c.modo && c.modo !== 'io' ? c.modo : 'tutto'
  const t: store.TurnoCompito = { da, quando, dal: adesso.toISOString(), tentativi: 0 }
  if (!store.mettiCompitoInCoda(id, modo, t)) throw new Error('Questa carta non si mette in coda: rispondile, o cambiala.')
  contratto.subito(id)
  compiti.annunciaCambio()
  const utente = chi.adesso()
  // il giro dopo aver risposto: chi ha trascinato la carta non aspetta il modello
  setTimeout(() => { void per(utente, () => giro()) }, 50).unref?.()
  return t
}

function per<T>(utente: string | null, f: () => T): T {
  return utente ? chi.dentro(utente, f) : f()
}

export type Stato = Impostazioni & {
  avviate: number
  inNotte: boolean
  prossimaNotte: string | null
  assente: boolean
  motore: boolean
  inCoda: number
  prontePerOra: number
  /** Quello che il turno ha fatto da quando è cominciata l'ultima notte: finite e che aspettano lei. */
  stanotte: { fatte: number; attende: number; dal: string }
}

/** Com'è il turno adesso: quello che la bacheca dice in una riga. Non lancia mai. */
export function stato(adesso = new Date()): Stato {
  const imp = impostazioni(cfg.leggi(), adesso)
  let avviate = 0, inCoda = 0, prontePerOra = 0, fatte = 0, attende = 0
  const dal = regole.inizioUltimaNotte(adesso, imp.notte)
  try {
    avviate = leggiConto(regole.inizioGiornata(adesso, imp.notte).toISOString()).avviate
    const ctx = { adesso, notte: imp.notte, assente: ferri.assente() }
    const vive = store.elencoCompiti()
    for (const c of vive) {
      if (regole.inCoda(c)) { inCoda++; if (regole.pronta(c, ctx)) prontePerOra++ }
    }
    for (const c of [...vive, ...store.compitiChiusi()]) {
      const t = c.turno
      if (!t?.notte || !t.ultimo || Date.parse(t.ultimo) < dal.getTime()) continue
      if (c.stato === 'fatto' || (c.stato === 'pronto' && c.prova?.esito !== 'fail')) fatte++
      else if (c.stato === 'chiede' || c.stato === 'pronto' || (c.stato === 'aperto' && c.guaio)) attende++
    }
  } catch { /* senza indice il turno dice solo come è impostato */ }
  const prossima = regole.prossimaNotte(adesso, imp.notte)
  return {
    ...imp, avviate, inNotte: regole.inNotte(adesso, imp.notte), prossimaNotte: prossima ? prossima.toISOString() : null,
    assente: ferri.assente(), motore: ferri.motore(), inCoda, prontePerOra,
    stanotte: { fatte, attende, dal: dal.toISOString() }
  }
}

let avviato = false
/**
 * All'avvio: il turno ascolta la coda. Quando una carta finisce, si guarda se
 * ce n'è un'altra pronta per la stessa persona. Una volta sola per processo.
 */
export function avvia() {
  if (avviato) return
  avviato = true
  compiti.quandoLibero(utente => {
    setTimeout(() => { void per(utente, () => giro()) }, 800).unref?.()
  })
}
