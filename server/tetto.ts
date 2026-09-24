// Il tetto di token di oggi, in un posto solo.
//
// Stava dentro `modello.ts`, e valeva per le strade che partono da lì: la
// chiave, il fornitore compatibile, l'account ChatGPT. L'account Claude no:
// `abbonamento.ts` lancia `claude` da sé, e `modello.ts` importa lui — non il
// contrario. Il risultato era un tetto che si poteva scavalcare scegliendo
// l'account Claude, e un registro dell'uso in cui quelle chiamate non
// comparivano. Qui il tetto sta in un modulo che tutti e due possono chiamare.

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
