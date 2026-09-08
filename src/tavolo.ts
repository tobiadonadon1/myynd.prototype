// Quante cose ci sono davvero sulla prima pagina.
//
// Il titolone diceva «due cose da guardare» sopra una pagina di nove righe:
// contava le voci del feed, e la pagina sotto mostra anche le righe della
// lista e la domanda in sospeso. Non era un errore di conto, era una parola
// sbagliata — «da guardare» erano le voci, e il resto stava lì lo stesso.
// Qui si conta esattamente quello che `Myynd.tsx` disegna, con le sue stesse
// regole, e il titolo dice quello.

/** Quante righe della lista stanno sulla prima pagina, oltre a quella in cima. */
export const RIGHE_LISTA = 6

export type Tavolo = {
  /** Le voci aperte del feed. */
  voci: number
  /** Le righe aperte della lista, tutte: qui si decide quante se ne vedono. */
  compiti: number
  /** C'è una domanda in sospeso. */
  domanda: boolean
  /** In cima c'è una riga della lista scelta da lui, invece della voce. */
  inCimaUnCompito?: boolean
}

/**
 * Le cose in pagina: la voce o la riga in cima, le righe della lista sotto
 * (al massimo sei), le altre voci, e la domanda se c'è.
 *
 * Rispecchia `Myynd.tsx`: con una voce in cima le righe della lista sono le
 * prime sei; con una riga della lista in cima — perché il feed è vuoto o
 * perché l'ha scelta lui — quella non si conta due volte, e sotto ne stanno
 * altre sei.
 */
export function sulTavolo(t: Tavolo): number {
  const inCimaLaLista = t.inCimaUnCompito || t.voci === 0
  const righeLista = inCimaLaLista
    ? Math.min(t.compiti, RIGHE_LISTA + 1)
    : Math.min(t.compiti, RIGHE_LISTA)
  return t.voci + righeLista + (t.domanda ? 1 : 0)
}
