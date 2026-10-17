// stub: la coda unica lo sostituisce all'unione
//
// La coda dei candidati la scrive un altro lavoro, in parallelo. Qui c'è solo
// il contratto che i produttori usano (`Candidato`, `proponi`) e, per ora, la
// carta fatta come la fa l'iniziativa oggi: scritta, col suo contratto, in coda
// per il turno, con la sua traccia.

import * as store from './store.ts'
import * as contratto from './contratto.ts'
import * as tracce from './tracce.ts'
import { fra } from './ordine.ts'

export type Candidato = {
  id: string; genere: 'seguito' | 'risposta' | 'passo' | 'lavoro' | 'contenuto' | 'notion' | 'primo-giorno' | 'guadagnata' | 'fattura' | 'modulo'
  progetto: string | null; titolo: string; risultato: string; perche: string
  prove: string[]; eventAt: string | null; valore: number; incertezza: number; costo: number
  classi: string[]; chiave: string; scade: string
  carta: { testo: string; nota?: string | null; doc?: string | null; modo: 'bozza' | 'tutto'; origine: string; priorita?: string; contratto?: unknown }
}

/** La carta del candidato, in coda per il turno. Una carta che c'è già non si riscrive. */
export function proponi(c: Candidato): void {
  if (store.compito(c.id)) return
  const priorita = c.carta.priorita === 'alta' || c.carta.priorita === 'bassa' ? c.carta.priorita : null
  store.scriviCompito({
    id: c.id, testo: c.carta.testo, nota: c.carta.nota ?? null, doc: c.carta.doc ?? null,
    progetto: c.progetto, origine: c.carta.origine, quando: 'oggi', priorita, ordine: fra(store.ultimoOrdine('oggi'), '')
  })
  if (c.carta.contratto) store.scriviContrattoCompito(c.id, c.carta.contratto as store.Contratto)
  if (store.mettiCompitoInCoda(c.id, c.carta.modo, { da: 'myynd', quando: 'notte', dal: new Date().toISOString(), tentativi: 0 })) contratto.subito(c.id)
  tracce.inizia({ compito: c.id, progetto: c.progetto, genere: c.genere, prove: c.prove, candidato: c.id })
}
