// La prova chiusa (P6): il recinto in cui un'automazione si prova sul passato.
//
// Dentro, il database è una connessione di sola lettura che vede i dati com'erano
// all'ora della prova (store.ts), l'orologio segna quell'ora, e ogni porta verso
// fuori (posta, agenda, file, note, Claude Code, la configurazione) lancia prima
// di aprirsi. L'unica scrittura è il registro dei gettoni: sono soldi veri.
//
// Non importa niente se non `node:async_hooks`: chi la usa la importa, lei non
// conosce nessuno.

import { AsyncLocalStorage } from 'node:async_hooks'

/** Il conto di una prova: uno per prova, condiviso da tutti i suoi recinti. */
export type Conto = {
  gettoni: number
  tetto: number
  sforato: boolean
}

/** Un recinto: uno per occorrenza o per bozza. */
export type Contesto = {
  tipo: 'prova' | 'vassoio'
  prova: string
  /** L'ora della prova (ISO); null nel vassoio, che gira adesso. */
  al: string | null
  conto: Conto
  /** Cosa non si è potuto rifare nel passato. */
  parziale: Set<'agenda' | 'codice'>
  /** La connessione della prova: è di store.ts. */
  db?: unknown
  chiusa?: boolean
}

const als = new AsyncLocalStorage<Contesto>()

export function dentroLaProva<T>(c: Contesto, fn: () => T): T {
  return als.run(c, fn)
}

/** Il recinto in cui si sta girando, o null (anche quando la sua connessione è chiusa). */
export function inProva(): Contesto | null {
  const c = als.getStore()
  return c && !c.chiusa ? c : null
}

/** L'unica strada scrivibile: fuori dal recinto, esplicitamente. */
export function fuori<T>(fn: () => T): T {
  return als.exit(fn)
}

/** L'orologio: l'ora della prova dentro una prova che ne ha una, adesso altrimenti. */
export function adesso(): number {
  const c = inProva()
  if (c?.al) {
    const t = Date.parse(c.al)
    if (Number.isFinite(t)) return t
  }
  return Date.now()
}

export function conta(n: number): void {
  const c = inProva()
  if (c && Number.isFinite(n) && n > 0) c.conto.gettoni += n
}

export const BUDGET = 'La prova ha finito il suo budget.'

export function controllaBudget(): void {
  const c = inProva()
  if (!c) return
  if (c.conto.gettoni >= c.conto.tetto) {
    c.conto.sforato = true
    throw new Error(BUDGET)
  }
}

/** Le porte chiuse: ogni nome passato a `vietato()` nel codice. La prova le itera tutte. */
export const PORTE_CHIUSE: readonly string[] = [
  'agenda.prossimi', 'agenda.aggiungi', 'agenda.aggiungiVerificati',
  'agenda.creaEvento', 'agenda.modificaEvento', 'agenda.eliminaEvento',
  'microsoft.prossimi',
  'mailbox-drafts.salvaBozzaCasella', 'mailbox-drafts.salvaRevisioneCasella',
  'invio.manda', 'postaUscita.manda',
  'posta.invia', 'posta.salvaBozza', 'posta.aggiornaBozza', 'posta.sposta', 'posta.verificaEArchiviaPerRegola',
  'google.cestina', 'google.archivia', 'google.salvaBozza', 'google.aggiornaBozza',
  'google.verificaEArchiviaPerRegola', 'google.mettiInAgenda',
  'mani.salvaConsegna', 'mani.crea_nota', 'mani.scrivi_file', 'mani.lavora_nel_codice', 'mani.crea_documento_app',
  'lavoro.fai', 'config.aggiorna'
]

export const CHIUSA = 'Nella prova questa porta resta chiusa.'

export class ProvaChiusa extends Error {
  codice = 'prova-chiusa' as const
  porta: string
  constructor(cosa: string) {
    super(CHIUSA)
    this.name = 'ProvaChiusa'
    this.porta = cosa
  }
}

/** Dentro una prova, lancia: questa porta non si apre. Fuori non fa niente. */
export function vietato(cosa: string): void {
  if (inProva()) throw new ProvaChiusa(cosa)
}

export function eChiusa(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { codice?: unknown }).codice === 'prova-chiusa'
}

/**
 * Un errore dell'account Claude dentro la prova: si segna, così la prova sa
 * fermarsi «occupato» invece di chiamarlo un guaio suo.
 */
export function dallAccount(e: unknown): Error {
  const x = e instanceof Error ? e : new Error(String(e))
  ;(x as Error & { account?: boolean }).account = true
  return x
}

export function eDellAccount(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { account?: unknown }).account === true
}
