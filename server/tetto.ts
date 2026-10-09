// Il tetto di token di oggi, in un posto solo.
//
// Stava dentro `modello.ts`, e valeva per le strade che partono da lì: la
// chiave, il fornitore compatibile, l'account ChatGPT. L'account Claude no:
// `abbonamento.ts` lancia `claude` da sé, e `modello.ts` importa lui — non il
// contrario. Il risultato era un tetto che si poteva scavalcare scegliendo
// l'account Claude, e un registro dell'uso in cui quelle chiamate non
// comparivano. Qui il tetto sta in un modulo che tutti e due possono chiamare.

import * as provaChiusa from './prova-chiusa.ts'
import { leggi } from './config.ts'
import * as store from './store.ts'
import * as budgetNotte from './budget-notte.ts'
import * as prezzi from './prezzi.ts'
import { compitoInCorso } from './etichetta-uso.ts'

/** Da mezzanotte UTC: un giorno solare semplice, uguale per tutti i server. */
function inizioDiOggi(): string {
  return new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z'
}

/** Il tetto giornaliero in token (entrata + uscita, la cache non conta). Zero = nessuno. */
export function tetto(): number {
  const t = Number(leggi().tetto ?? 0)
  const suo = Number.isFinite(t) && t > 0 ? Math.floor(t) : 0
  // F8 · con l'AI inclusa vale il più basso fra il suo e quello del piano: il suo si abbassa, quello del piano non si alza
  const piano = tettoDelPiano()
  return piano ? (suo ? Math.min(suo, piano) : piano) : suo
}

/*
 * F8 · la dose di ogni giorno dell'AI inclusa, in token.
 *
 * Prudente di serie: duecentomila token al giorno sono una giornata di lavoro
 * vero e non una bolletta. La cifra del piano la mette chi ospita o chi
 * impacchetta (`MYYND_INCLUSO_TETTO`), mai la persona dalle preferenze. Sul suo
 * computer questo conto sta nel suo database, quindi è una cortesia e non un
 * limite: il limite vero lo tiene il ponte (`incluso.ts`), sul registro del
 * server. La spesa della notte è il budget di F9, non un secondo budget.
 */
export const TETTO_DEL_PIANO = 200_000
export function tettoDelPiano(c = leggi()): number {
  if (c.motore !== 'incluso') return 0
  return tettoDelPianoSulServer()
}
/** La dose del piano, a prescindere da chi è scelto: la usa il ponte, sul server. */
export function tettoDelPianoSulServer(): number {
  const n = Number((process.env.MYYND_INCLUSO_TETTO ?? '').trim())
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : TETTO_DEL_PIANO
}

/*
 * La dose del mese dell'AI inclusa, in dollari: il conto vero che paga chi
 * ospita. I token di un giorno tengono il ritmo; i dollari del mese tengono la
 * bolletta, anche per chi usa la dose intera ogni giorno. Di serie venti
 * dollari a persona; la cifra del piano la mette chi ospita
 * (`MYYND_INCLUSO_MESE_USD`), zero vuol dire nessun tetto.
 */
export const TETTO_DEL_MESE_USD = 20
/** In micro-dollari, come `prezzi.costo`. */
export function tettoDelMeseSulServer(): number {
  const v = (process.env.MYYND_INCLUSO_MESE_USD ?? '').trim()
  const n = v === '' ? TETTO_DEL_MESE_USD : Number(v)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1_000_000) : 0
}

/** Quanto si è speso oggi, e se il tetto è stato raggiunto. */
export function usoDiOggi(): store.Totale & { tetto: number; raggiunto: boolean } {
  const t = tetto()
  let oggi: store.Totale = { chiamate: 0, entrata: 0, cache: 0, uscita: 0 }
  try { oggi = store.usoDal(inizioDiOggi()) } catch { /* senza indice non si conta */ }
  return { ...oggi, tetto: t, raggiunto: t > 0 && oggi.entrata + oggi.uscita >= t }
}

export const TETTO_RAGGIUNTO = 'Hai raggiunto il tetto di token di oggi. Si riparte domani, o lo alzi nelle preferenze.'
/** F8 · la dose dell'AI inclusa: non si alza dalle preferenze, e lo si dice. */
export const INCLUSO_FINITO = 'Hai finito l’AI inclusa di oggi. Si riparte domani.'
/** La dose del mese, detta dal ponte: si riparte il primo, non domani. */
export const INCLUSO_FINITO_MESE = 'Hai finito l’AI inclusa di questo mese. Si riparte il primo del mese.'

/** Gli errori del tetto: chi li prende deve sapere che non sono un guasto della strada. */
const DEL_TETTO = new WeakSet<Error>()

/**
 * Prima di ogni chiamata che costa: se il tetto è raggiunto non si parte.
 *
 * Il tetto è una scelta sua e sta nelle preferenze; zero vuol dire nessuno.
 */
export function controllaIlTetto(): void {
  provaChiusa.controllaBudget()
  controllaLaNotte()
  const u = usoDiOggi()
  if (!u.raggiunto) return
  // il tetto che si è toccato è quello del piano, non il suo: dirgli di alzarlo sarebbe falso
  const piano = tettoDelPiano()
  throw erroreDelTetto(piano && u.tetto === piano ? INCLUSO_FINITO : TETTO_RAGGIUNTO)
}

/**
 * Un errore che chi lo prende deve leggere come il tetto, non come la strada
 * rotta (F8: anche il 429 `budget_exhausted` del ponte dell'AI inclusa).
 */
export function erroreDelTetto(messaggio: string): Error {
  const e = new Error(messaggio)
  DEL_TETTO.add(e)
  return e
}

export const BUDGET_NOTTE = 'Ha finito il budget di stanotte. La carta torna in coda per la notte dopo.'
const DEL_BUDGET = new WeakSet<Error>()

/**
 * F9 · il budget della notte, a metà di una carta.
 *
 * Il turno non fa partire una carta se il budget è finito (`turno.giro`); ma
 * una carta partita con il budget quasi pieno può costare più del previsto,
 * e allora si ferma quando la spesa passa il budget di un quarto. Vale solo
 * per le carte partite dal turno: una carta che lei affida a mano, anche di
 * notte, conta nella spesa ma non si ferma mai per il budget.
 */
function controllaLaNotte() {
  const k = compitoInCorso()
  if (!k?.turno || !budgetNotte.sforato()) return
  const e = new Error(BUDGET_NOTTE)
  DEL_TETTO.add(e)
  DEL_BUDGET.add(e)
  throw e
}

/** Questo errore è il budget della notte: la carta torna in coda, non ha un guaio. */
export function delBudget(e: unknown): boolean {
  return e instanceof Error && (DEL_BUDGET.has(e) || e.message === BUDGET_NOTTE)
}

/**
 * Questo errore è il tetto, non la strada che si è rotta.
 *
 * Conta per l'account Claude: un suo errore lo mette a riposo per cinque
 * minuti, e il lavoro passa alla chiave. Per il tetto sarebbe sbagliato due
 * volte — l'account funziona benissimo, e la chiave costa denaro.
 */
export function delTetto(e: unknown): boolean {
  return e instanceof Error && DEL_TETTO.has(e)
}

// — l'account Claude nel registro dell'uso —
//
// `abbonamento.ts` (le domande e la chat) e `lavoro.ts` (il lavoro sul codice)
// lanciano lo stesso `claude` sullo stesso account: contano allo stesso modo.

/** I token che Claude Code dice di aver usato, nella busta del risultato. */
export type UsoCLI = {
  input_tokens?: number; output_tokens?: number
  cache_read_input_tokens?: number; cache_creation_input_tokens?: number
}

/** Il nome con cui l'account Claude compare nel registro dell'uso. */
export const MOTORE = 'Claude account'

const numero = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.round(x) : null

/**
 * I token di una chiamata: quelli detti da Claude Code, o una stima.
 *
 * `claude -p --output-format json` (e la riga `result` dello streaming) porta
 * `usage` come l'API: entrati, scritti in cache, letti dalla cache, usciti. Si
 * contano come `modello.segnaUso`: entrata = entrati + scritti in cache. Se la
 * busta non li porta — una versione vecchia, un risultato senza — si stima un
 * token ogni quattro caratteri, e la riga lo dice nel nome del motore: una
 * stima che si spaccia per una misura è peggio di nessuna riga.
 */
export function usoDellaBusta(u: unknown, entrato: string, uscito: string):
  { entrata: number; cache: number; uscita: number; stima: boolean } {
  const v = (u && typeof u === 'object' ? u : {}) as UsoCLI
  const dentro = numero(v.input_tokens)
  const fuori = numero(v.output_tokens)
  if (dentro !== null && fuori !== null) {
    return { entrata: dentro + (numero(v.cache_creation_input_tokens) ?? 0), cache: numero(v.cache_read_input_tokens) ?? 0, uscita: fuori, stima: false }
  }
  return { entrata: Math.ceil(entrato.length / 4), cache: 0, uscita: Math.ceil(uscito.length / 4), stima: true }
}

/**
 * Una riga nel registro dell'uso, come per ogni altra strada. Non rompe mai la chiamata contata.
 *
 * F9 · il costo: quello che Claude Code scrive nella busta (`total_cost_usd`)
 * quando c'è, altrimenti il listino del modello chiesto, se si sa quale.
 */
export function segnaAccount(lavoro: string, u: unknown, entrato: string, uscito: string, o: { costoUsd?: unknown; modello?: string | null } = {}) {
  const c = usoDellaBusta(u, entrato, uscito)
  const motore = c.stima ? `${MOTORE} (stima)` : MOTORE
  const scritti = numero((u as UsoCLI | null)?.cache_creation_input_tokens) ?? 0
  const costo = prezzi.daDollari(o.costoUsd)
  try { store.segnaUso({ lavoro, motore, entrata: c.entrata, cache: c.cache, uscita: c.uscita, scritti, costo, modello: o.modello ?? null }) } catch { /* contare è accessorio */ }
  console.log(`myynd · uso · ${lavoro} · ${motore} · entrata ${c.entrata}${c.cache ? ` (+${c.cache} dalla cache)` : ''} · uscita ${c.uscita}`)
}
