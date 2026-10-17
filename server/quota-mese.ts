// La quota del mese: quanto può spendere il lavoro di fondo in un mese.
//
// Il budget della notte (tre dollari) lasciava passare fino a novanta dollari
// al mese, su un prodotto che ne costa dieci e un tetto interno di tre per
// l'AI. Qui sta il conto del mese, per persona:
//
//   · **di serie tre dollari** quando l'AI la paga Myynd (l'AI inclusa, o la
//     chiave della casa); **nessuna** quando lavora il suo account Claude o
//     ChatGPT, la sua chiave, o un modello sul suo computer. Senza quota si
//     conta lo stesso: il registro dell'uso scrive ogni chiamata.
//   · **si prenota prima di chiamare.** Ogni chiamata di fondo mette da parte
//     quello che costerebbe (dal prompt e dal prezzo del modello); finita, la
//     prenotazione si toglie e resta la spesa vera del registro; se fallisce
//     si toglie e basta. Così dieci lavori partiti insieme non sforano in dieci.
//   · **finita la quota, il fondo si ferma** con una frase sua (`MESE_FINITO`),
//     che la riga fissa e il resoconto della mattina possono dire. La chat che
//     apre lui non si ferma mai; oltre una volta e mezza la quota passa al
//     modello economico.
//
// «Chi guarda» è un contesto (`conChiGuarda`): la chat e il lavoro che lui
// chiede adesso ci stanno dentro, il resto è fondo.

import { AsyncLocalStorage } from 'node:async_hooks'
import { leggi, type Config } from './config.ts'
import * as store from './store.ts'
import * as chi from './chi.ts'
import * as prezzi from './prezzi.ts'

/** Di serie, in dollari al mese, quando l'AI la paga Myynd. */
export const QUOTA_INCLUSA = 3
/** Oltre questa parte della quota la chat passa al modello economico. */
export const OLTRE = 1.5

/** La frase del fondo fermo: la dice la riga fissa, e la mattina il resoconto. */
export const MESE_FINITO = 'Quota AI del mese raggiunta: il lavoro di fondo riparte il primo del mese.'

// — chi paga —

/**
 * L'AI la paga Myynd? Lo sa `modello.ts` (l'AI inclusa, la chiave della
 * casa), che importa questo file: la risposta arriva da lì quando si carica,
 * invece di un import a giro.
 */
let pagaMyynd: (c: Config) => boolean = c => c.motore === 'incluso'
export function quandoPagaMyynd(f: (c: Config) => boolean): void { pagaMyynd = f }
export function pagataDaMyynd(c: Config = leggi()): boolean {
  try { return pagaMyynd(c) } catch { return false }
}

/** La quota in micro-dollari; zero vuol dire nessuna. Quella scritta vince; senza, dipende da chi paga. */
export function limite(c: Config = leggi()): number {
  const q = c.quota
  if (typeof q === 'number' && Number.isFinite(q) && q >= 0) return Math.round(q * 1_000_000)
  return pagataDaMyynd(c) ? QUOTA_INCLUSA * 1_000_000 : 0
}

/** Il primo istante del mese, in UTC: lo stesso per tutti i server, come il giorno del tetto. */
export function inizioMese(adesso = new Date()): string {
  return new Date(Date.UTC(adesso.getUTCFullYear(), adesso.getUTCMonth(), 1)).toISOString()
}

// — chi guarda —

const guardato = new AsyncLocalStorage<true>()
/** Quello che lui ha chiesto adesso (la chat, «fallo»): la quota non lo ferma mai. */
export function conChiGuarda<T>(fai: () => T): T { return guardato.run(true, fai) }
export function chiGuarda(): boolean { return guardato.getStore() === true }

// — le prenotazioni —

export type Riserva = { id: number; utente: string; lavoro: string; stima: number; prima: number }
const prenotate = new Map<string, Map<number, Riserva>>()
let numero = 0
const chiave = () => chi.adesso() ?? ''

function spesoDelMese(adesso = new Date()): number {
  try { return store.spesaDal(inizioMese(adesso)) } catch { return 0 }
}
function riservato(utente = chiave()): number {
  let n = 0
  for (const r of prenotate.get(utente)?.values() ?? []) n += r.stima
  return n
}

export type Stato = {
  /** Il mese, «2026-10». */
  mese: string
  /** Micro-dollari spesi questo mese, dal registro dell'uso. */
  speso: number
  /** Micro-dollari prenotati da chiamate in corso. */
  riservato: number
  /** La quota in micro-dollari; zero, nessuna. */
  limite: number
  /** Quanto resta, prenotazioni comprese; null senza quota. */
  resto: number | null
  /** Il fondo è fermo. */
  finita: boolean
  /** Oltre una volta e mezza: la chat va sul modello economico. */
  oltre: boolean
  /** L'AI la paga Myynd (di serie tre dollari), o lui. */
  pagaMyynd: boolean
}

export function stato(adesso = new Date(), c: Config = leggi()): Stato {
  const lim = limite(c)
  const speso = spesoDelMese(adesso)
  const ris = riservato()
  return {
    mese: inizioMese(adesso).slice(0, 7), speso, riservato: ris, limite: lim,
    resto: lim ? Math.max(0, lim - speso - ris) : null,
    finita: lim > 0 && speso >= lim,
    oltre: lim > 0 && speso >= lim * OLTRE,
    pagaMyynd: pagataDaMyynd(c)
  }
}

/** Gli errori della quota: chi li prende li legge come il tetto, non come un guasto della strada. */
const DELLA_QUOTA = new WeakSet<Error>()
let marca: (e: Error) => Error = e => e
/** `tetto.ts` passa il suo marchio: così il fondo fermo è un «tetto» per chi sa riconoscerlo. */
export function marchiaCon(f: (e: Error) => Error): void { marca = f }
function erroreDellaQuota(): Error {
  const e = marca(new Error(MESE_FINITO))
  DELLA_QUOTA.add(e)
  return e
}
export function dellaQuota(e: unknown): boolean {
  return e instanceof Error && (DELLA_QUOTA.has(e) || e.message === MESE_FINITO)
}

/** Prima di ogni chiamata di fondo: se la quota è finita non si parte. Chi guarda passa sempre. */
export function controlla(): void {
  if (chiGuarda()) return
  if (stato().finita) throw erroreDellaQuota()
}

/**
 * Mette da parte quello che una chiamata di fondo costerebbe. Lancia se non
 * ci sta: speso + prenotato + questa supera la quota. Senza quota, o per chi
 * guarda, non prenota niente (null).
 */
export function riserva(lavoro: string, stima: number): Riserva | null {
  if (chiGuarda()) return null
  const lim = limite()
  if (!lim) return null
  const utente = chiave()
  const speso = spesoDelMese()
  const quanto = Math.max(0, Math.round(stima))
  if (speso + riservato(utente) + quanto > lim) throw erroreDellaQuota()
  const r: Riserva = { id: ++numero, utente, lavoro, stima: quanto, prima: speso }
  const m = prenotate.get(utente) ?? new Map<number, Riserva>()
  m.set(r.id, r)
  prenotate.set(utente, m)
  return r
}

function togli(r: Riserva): void {
  const m = prenotate.get(r.utente)
  m?.delete(r.id)
  if (m && !m.size) prenotate.delete(r.utente)
}

/**
 * La chiamata è finita: la prenotazione si toglie, e resta la spesa vera che
 * il registro ha appena scritto. Torna quanto si era stimato e quanto è
 * costata davvero (la differenza del registro dalla prenotazione in qua: con
 * altre chiamate in parallelo è un'approssimazione, e serve solo a dirlo).
 */
export function concilia(r: Riserva | null): { stima: number; vera: number } | null {
  if (!r) return null
  togli(r)
  return { stima: r.stima, vera: Math.max(0, spesoDelMese() - r.prima) }
}

/** La chiamata è fallita: la prenotazione si toglie e basta. */
export function rilascia(r: Riserva | null): void {
  if (r) togli(r)
}

/** Prenota, chiama, concilia; se fallisce, rilascia. */
export async function conRiserva<T>(lavoro: string, stima: number, fai: () => Promise<T>): Promise<T> {
  const r = riserva(lavoro, stima)
  try {
    const fuori = await fai()
    concilia(r)
    return fuori
  } catch (e) {
    rilascia(r)
    throw e
  }
}

/**
 * Quanto costerebbe una chiamata, in micro-dollari: un token ogni quattro
 * caratteri di quello che entra, e tutta l'uscita permessa. Per difetto
 * sull'entrata, per eccesso sull'uscita: in media regge. Un modello senza
 * prezzo (in casa, un fornitore compatibile) non costa niente.
 */
export function stima(modello: string | null | undefined, caratteriEntrata: number, maxUscita: number): number {
  return prezzi.costo(modello, { entrata: Math.ceil(Math.max(0, caratteriEntrata) / 4), uscita: Math.max(0, maxUscita) }) ?? 0
}

/** Per le prove: niente prenotazioni appese. */
export function perProva(): void { prenotate.clear() }
