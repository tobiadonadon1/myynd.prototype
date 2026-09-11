// Il secchio vero di una riga, non quello scritto.
//
// `quando` si sceglie una volta sola — alla creazione, pianificando nel
// calendario, o a mano nel dettaglio — e da lì in poi non lo tocca più
// nessuno. Una riga pianificata per lunedì e mai più guardata resta scritta
// «questa settimana» anche il giovedì dopo, quando lunedì è tre giorni
// indietro: la lista raggruppa sul dato salvato e non se ne accorge.
//
// `secchioVivo` è la correzione, calcolata a ogni lettura invece che scritta
// una volta: guarda anche il giorno pianificato e la data di oggi, e sposta
// in cima alla lista di oggi quello che è rimasto indietro — senza toccare
// `quando` sul disco, che resta quello che il calendario e l'editor si
// aspettano di trovare.
//
// Sta in un file per conto suo, separato da `useCompiti.ts`: è codice puro,
// senza React, e le prove sotto `node --test` lo importano direttamente —
// `useCompiti.ts` porta con sé l'albero della UI e non si importa fuori da un
// bundler.

// con l'estensione, perché questo file lo eseguono anche le prove in Node —
// e giorni.ts non importa niente, quindi non c'è un giro
import { secchioDelGiorno } from './giorni.ts'

export function secchioVivo(
  c: { stato: string; giorno?: string | null; quando: string },
  oggi: string
): 'oggi' | 'settimana' | 'poi' {
  const vivo = c.stato !== 'fatto' && c.stato !== 'lasciato'
  if (vivo && c.giorno && c.giorno <= oggi) return 'oggi'
  // una data nei prossimi sette giorni è di questa settimana; più in là, la
  // riga resta sullo scaffale dove l'ha messa lei («prima o poi» compreso)
  if (c.giorno && c.giorno > oggi && entroUnaSettimana(c.giorno, oggi)) return secchioDelGiorno(c.giorno, oggi)
  return c.quando as 'oggi' | 'settimana' | 'poi'
}

function entroUnaSettimana(giorno: string, oggi: string): boolean {
  const ms = Date.parse(giorno + 'T00:00:00Z') - Date.parse(oggi + 'T00:00:00Z')
  return ms > 0 && ms <= 7 * 86_400_000
}
