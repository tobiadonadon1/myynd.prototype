// Le domande delle preferenze, fatte da Myynd in chat.
//
// Nome, lavoro, fuoco, argomenti, tono e autonomia stavano in sei carte delle
// preferenze, e nessuno le compilava: il conto nasceva «tu» e restava «tu», e
// ogni risposta era scritta per nessuno. Adesso le chiede Myynd, una alla
// volta, nella chat — e la risposta si salva nel profilo come se fosse stata
// scritta nella carta. Sono domande scritte, non generate: devono funzionare
// al primo minuto, quando una chiave non c'è ancora.

import { AUTONOMIE, TONI } from './data'

export type Campo = 'nome' | 'ruolo' | 'fuoco' | 'argomenti' | 'tono' | 'autonomia'

export type Domanda = {
  campo: Campo
  /** La domanda, come chiave del dizionario. */
  testo: string
  /** Se c'è, si risponde scegliendo e non scrivendo. */
  scelte?: { id: string; testo: string }[]
}

export const DOMANDE: Domanda[] = [
  { campo: 'nome', testo: 'Come ti chiamo?' },
  { campo: 'ruolo', testo: 'Che lavoro fai?' },
  { campo: 'fuoco', testo: 'Su cosa devo concentrarmi in questo periodo?' },
  { campo: 'argomenti', testo: 'Di cosa vuoi che ti tenga aggiornato?' },
  { campo: 'tono', testo: 'Con che tono ti scrivo?', scelte: TONI.map(x => ({ id: x.id, testo: x.label })) },
  { campo: 'autonomia', testo: 'Quanto posso fare da solo?', scelte: AUTONOMIE.map(a => ({ id: a.id, testo: a.titolo })) }
]
