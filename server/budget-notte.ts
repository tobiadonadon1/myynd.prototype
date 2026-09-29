// Il budget della notte (F9), in un posto che possono leggere tutti.
//
// «A cost limit per night per user»: quanto può spendere il turno in una sua
// giornata, in dollari. Lo leggono in due, e per questo sta qui e non in
// `turno.ts`: il turno, prima di far partire una carta, e `tetto.ts`, prima di
// ogni chiamata, per fermare a metà una carta che ha già sforato. `tetto.ts`
// lo chiamano tutte le strade verso un modello, e `turno.ts` importa quelle
// strade: con il budget dentro il turno i due si importerebbero a vicenda.
//
// La finestra è la giornata del turno (`inizioGiornata`: dalla fine di una
// notte alla fine della dopo), la stessa del conto delle carte. La spesa è
// quella delle carte (`store.costoDal`): la chat del pomeriggio non consuma
// il budget del lavoro affidato.

import * as store from './store.ts'
import * as cfg from './config.ts'
import * as regole from './turno-regole.ts'

/** Di serie tre dollari a notte: abbastanza per una dozzina di carte su Sonnet, poco per sbagliare. */
export const BUDGET_DI_SERIE = 3
/** Oltre questa parte del budget una carta partita dal turno si ferma a metà. */
export const SFORO = 1.25
/** Sotto questo resto non si fa partire niente: nessuna carta costa meno di dieci centesimi. */
export const RESTO_MINIMO = 0.10

/** Il budget in dollari; zero vuol dire nessuno. Un valore storto torna quello di serie. */
export function budget(c: cfg.Config = cfg.leggi()): number {
  const b = c.turno?.budget
  if (b === undefined || b === null) return BUDGET_DI_SERIE
  return typeof b === 'number' && Number.isFinite(b) && b >= 0 ? b : BUDGET_DI_SERIE
}

/** La notte scelta, com'è scritta nella configurazione. */
export function finestra(c: cfg.Config = cfg.leggi()): regole.Finestra {
  const t = c.turno ?? {}
  return {
    da: regole.oraValida(t.notteDa) ? t.notteDa : regole.NOTTE_DI_SERIE.da,
    a: regole.oraValida(t.notteA) ? t.notteA : regole.NOTTE_DI_SERIE.a
  }
}

export type Budget = {
  /** Dollari spesi dalle carte nella giornata del turno. */
  speso: number
  /** Il budget in dollari; zero vuol dire nessuno. */
  limite: number
  /** Non c'è più posto per un'altra carta: le altre aspettano la notte dopo. */
  finito: boolean
}

/** La mediana di un elenco di numeri, o zero. */
function mediana(xs: number[]): number {
  if (!xs.length) return 0
  const o = [...xs].sort((a, b) => a - b)
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}

/**
 * Com'è il budget adesso. `finito` se la spesa l'ha raggiunto, o se quello
 * che resta non basta per una carta come le ultime dieci (la mediana, con un
 * minimo di dieci centesimi): meglio fermarsi prima che a metà di una carta.
 * Non lancia: senza indice il budget non si conta, e non ferma niente.
 */
export function stato(adesso = new Date(), c: cfg.Config = cfg.leggi()): Budget {
  const limite = budget(c)
  let speso = 0
  try { speso = store.costoDal(regole.inizioGiornata(adesso, finestra(c)).toISOString()) / 1_000_000 } catch { return { speso: 0, limite, finito: false } }
  if (!limite) return { speso, limite, finito: false }
  let unaCarta = RESTO_MINIMO
  try { unaCarta = Math.max(RESTO_MINIMO, mediana(store.costiUltimeCarte(10)) / 1_000_000) } catch { /* senza storia basta il minimo */ }
  return { speso, limite, finito: speso >= limite || limite - speso < unaCarta }
}

/** La spesa ha passato il budget di un quarto: una carta del turno ancora al lavoro si ferma. */
export function sforato(adesso = new Date(), c: cfg.Config = cfg.leggi()): boolean {
  const limite = budget(c)
  if (!limite) return false
  try { return store.costoDal(regole.inizioGiornata(adesso, finestra(c)).toISOString()) / 1_000_000 >= limite * SFORO } catch { return false }
}
