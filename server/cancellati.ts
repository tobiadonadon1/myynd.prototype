// I conti cancellati, finché il processo vive.
//
// Cancellare un conto toglie la cartella; ma una lettura partita un attimo
// prima ha ancora in mano quello che ha scaricato, e scrivendolo apriva
// l'indice, cioè ricreava la cartella con dentro la posta di chi se n'era
// appena andato. Qui si segna la cartella prima di toglierla, e chi scrive
// (l'indice, la configurazione, l'avvio, l'imbuto) la guarda e si rifiuta.
// Nessun import che scriva: lo leggono tutti.

import { resolve } from 'node:path'

export const CONTO_CANCELLATO = 'Questo conto è stato cancellato.'

const segnate = new Set<string>()

/** Questa cartella non si riapre più. */
export function segna(dove: string): void {
  segnate.add(resolve(dove))
}

/** La cartella appartiene a un conto cancellato. */
export function cancellata(dove: string): boolean {
  return segnate.size > 0 && segnate.has(resolve(dove))
}

/** Solo per le prove. */
export function dimentica(): void { segnate.clear() }
