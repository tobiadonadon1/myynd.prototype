// Le parole del bottone che approva una proposta scritta su una riga, e
// quelle dell'avviso che segue. Stavano accanto al costruttore degli ordini
// fissi, che non c'è più: le proposte già scritte nelle righe restano da
// approvare, e questi due testi con loro.

import { lingua, t } from '../lingua.ts'

const du = (x: { it: string; en: string }) => lingua() === 'en' ? x.en : x.it

/** «Approva», o «Approva tutto (3)» quando sono più di una. */
export function approva(n: number): string {
  return n > 1 ? du({ it: `Approva tutto (${n})`, en: `Approve all (${n})` }) : t('Approva')
}

/** Cosa è successo dopo il «sì», detto con il nome della cosa. */
export function approvata(azione: string, n: number, nome: string): string {
  if (azione === 'posta.bozza') return n === 1
    ? du({ it: 'Una bozza nella casella.', en: 'One draft in your mailbox.' })
    : du({ it: `${n} bozze nella casella.`, en: `${n} drafts in your mailbox.` })
  if (azione === 'agenda.aggiungi') return n === 1
    ? du({ it: 'Un evento in agenda.', en: 'One event in your calendar.' })
    : du({ it: `${n} eventi in agenda.`, en: `${n} events in your calendar.` })
  if (azione === 'nota.crea') return t('La nota è in Note.')
  return du({ it: `Salvato: ${nome}`, en: `Saved: ${nome}` })
}
