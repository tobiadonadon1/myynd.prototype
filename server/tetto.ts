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

/** Da mezzanotte UTC: un giorno solare semplice, uguale per tutti i server. */
function inizioDiOggi(): string {
  return new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z'
}

/** Il tetto giornaliero in token (entrata + uscita, la cache non conta). Zero = nessuno. */
export function tetto(): number {
  const t = Number(leggi().tetto ?? 0)
  return Number.isFinite(t) && t > 0 ? Math.floor(t) : 0
}

/** Quanto si è speso oggi, e se il tetto è stato raggiunto. */
export function usoDiOggi(): store.Totale & { tetto: number; raggiunto: boolean } {
  const t = tetto()
  let oggi: store.Totale = { chiamate: 0, entrata: 0, cache: 0, uscita: 0 }
  try { oggi = store.usoDal(inizioDiOggi()) } catch { /* senza indice non si conta */ }
  return { ...oggi, tetto: t, raggiunto: t > 0 && oggi.entrata + oggi.uscita >= t }
}

export const TETTO_RAGGIUNTO = 'Hai raggiunto il tetto di token di oggi. Si riparte domani, o lo alzi nelle preferenze.'

/** Gli errori del tetto: chi li prende deve sapere che non sono un guasto della strada. */
const DEL_TETTO = new WeakSet<Error>()

/**
 * Prima di ogni chiamata che costa: se il tetto è raggiunto non si parte.
 *
 * Il tetto è una scelta sua e sta nelle preferenze; zero vuol dire nessuno.
 */
export function controllaIlTetto(): void {
  provaChiusa.controllaBudget()
  if (!usoDiOggi().raggiunto) return
  const e = new Error(TETTO_RAGGIUNTO)
  DEL_TETTO.add(e)
  throw e
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

/** Una riga nel registro dell'uso, come per ogni altra strada. Non rompe mai la chiamata contata. */
export function segnaAccount(lavoro: string, u: unknown, entrato: string, uscito: string) {
  const c = usoDellaBusta(u, entrato, uscito)
  const motore = c.stima ? `${MOTORE} (stima)` : MOTORE
  try { store.segnaUso({ lavoro, motore, entrata: c.entrata, cache: c.cache, uscita: c.uscita }) } catch { /* contare è accessorio */ }
  console.log(`myynd · uso · ${lavoro} · ${motore} · entrata ${c.entrata}${c.cache ? ` (+${c.cache} dalla cache)` : ''} · uscita ${c.uscita}`)
}
