// Un'etichetta davanti al nome del lavoro, nel registro dell'uso.
//
// La prova delle risposte (P7) chiama la chat vera, il modello che giudica e
// quello che scrive le domande: nel registro devono comparire come
// «prova:risposta», «prova:verifica», «prova:esame», così «Quanto ha
// ragionato» dice quanto è costata la prova, e il tetto di oggi la conta.
//
// È per contesto asincrono, non per processo: una chat viva che gira accanto
// a una prova non prende l'etichetta, perché non sta dentro `conEtichetta`.

import { AsyncLocalStorage } from 'node:async_hooks'

const etichetta = new AsyncLocalStorage<string>()

/** Tutto quello che `fai` registra nell'uso porta `prefisso:` davanti al lavoro. */
export function conEtichetta<T>(prefisso: string, fai: () => T): T {
  return etichetta.run(prefisso, fai)
}

/** Il nome del lavoro con l'etichetta del contesto, se c'è e non c'è già. */
export function etichettato(lavoro: string): string {
  const p = etichetta.getStore()
  return p && !lavoro.startsWith(`${p}:`) ? `${p}:${lavoro}` : lavoro
}

/** L'etichetta del contesto in corso, o null: serve a chi somma i token di una prova. */
export function etichettaInCorso(): string | null {
  return etichetta.getStore() ?? null
}

// — la carta a cui va il conto (F9) —
//
// Lo stesso trucco per un'altra domanda: «quanto è costata questa carta?».
// Tutto quello che succede mentre una carta è al lavoro (la stesura, la
// rilettura, la cosa dopo, il contratto scritto prima di partire) finisce
// nel registro con l'id della carta accanto. Per contesto asincrono, come
// l'etichetta: la chat viva che gira accanto non si prende il conto di nessuno.

export type CompitoAlLavoro = {
  id: string
  /** L'ha fatta partire il turno (F2): per lei vale il budget della notte. */
  turno: boolean
}

const alLavoro = new AsyncLocalStorage<CompitoAlLavoro>()

/** Tutto quello che `fai` registra nell'uso va sul conto della carta `id`. */
export function conCompito<T>(id: string, fai: () => T, o: { turno?: boolean } = {}): T {
  return alLavoro.run({ id, turno: !!o.turno }, fai)
}

/** La carta al lavoro nel contesto in corso, o null. */
export function compitoInCorso(): CompitoAlLavoro | null {
  return alLavoro.getStore() ?? null
}

/**
 * Fuori dal conto di qualunque carta: per chi parte da dentro una carta ma
 * non è suo (il turno che guarda la carta dopo, quando questa ha finito).
 */
export function fuoriDalCompito<T>(fai: () => T): T {
  return alLavoro.exit(fai)
}
