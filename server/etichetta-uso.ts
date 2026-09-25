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
