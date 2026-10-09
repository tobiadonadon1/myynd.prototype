// Gli ordini fissi, detti a una persona (E): quando girano, la ricevuta di
// ogni giro, il mese prima, il bottone di una proposta, la frase che nasce da
// una carta, e la riga fissa del motore quando uno non è riuscito. In
// italiano e in inglese.
//
//   node --test src/ordini-fissi.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'

;(globalThis as unknown as { document: unknown }).document = { documentElement: { lang: '' } }
const { impostaLingua } = await import('./lingua.ts')
const q = await import('./automazioni/quando.ts')
const { quandoDetto, consegnaDetta, interpreta } = await import('./automazioni/interpreta.ts')
const sf = await import('./salute-fonti.ts')

function in_<T>(l: 'it' | 'en', f: () => T): T {
  impostaLingua(l)
  try { return f() } finally { impostaLingua('en') }
}
const ORA = '2026-10-09T08:00:00.000Z'

test('quando gira: i giorni feriali e il mese, nelle due lingue', () => {
  assert.equal(in_('it', () => q.quandoGira({ ogni: 'feriali', ora: 9 })), 'dal lunedì al venerdì alle 09:00')
  assert.equal(in_('en', () => q.quandoGira({ ogni: 'feriali', ora: 9 })), 'weekdays at 09:00')
  assert.equal(in_('it', () => q.quandoGira({ ogni: 'mese', giorno: 1, ora: 9 })), 'il 1 di ogni mese alle 09:00')
  assert.equal(in_('en', () => q.quandoGira({ ogni: 'mese', giorno: 15, ora: 18 })), 'on day 15 of each month at 18:00')
  assert.equal(in_('en', () => q.quandoGira({ ogni: 'settimana', giorno: 1, ora: 8 })), 'every Monday at 08:00')
  assert.equal(in_('en', () => q.quandoGira({ quandoArriva: true })), 'when something new arrives')
  // la prossima volta: oltre la settimana anche la data, o un mensile sembra fra tre giorni
  const adesso = new Date(2026, 9, 9, 12).getTime()
  const vicina = in_('en', () => q.quandoData(new Date(2026, 9, 12, 9).toISOString(), adesso))
  const lontana = in_('en', () => q.quandoData(new Date(2026, 10, 1, 9).toISOString(), adesso))
  assert.match(vicina, /^Monday/)
  assert.doesNotMatch(vicina, /Oct/)
  assert.match(lontana, /Sunday/)
  assert.match(lontana, /Nov/)
})

test('la ricevuta di ogni giro: quante cose, o perché niente', () => {
  const g = (x: Partial<import('./api.ts').Giro>) => ({ quando: ORA, esito: 'niente', quanti: 0, ...x })
  assert.equal(in_('en', () => q.ricevuta(g({ esito: 'fatta', quanti: 12, fatti: 3 }))), 'Looked at 12 documents and made 3 items.')
  assert.equal(in_('it', () => q.ricevuta(g({ esito: 'fatta', quanti: 1, fatti: 1 }))), 'Ha guardato 1 documento e fatto 1 cosa.')
  assert.equal(in_('en', () => q.ricevuta(g({ perche: 'vuoto' }))), 'There was nothing new to look at.')
  assert.equal(in_('en', () => q.ricevuta(g({ quanti: 8, perche: 'niente' }))), 'Looked at 8 documents: nothing needed doing.')
  assert.equal(in_('en', () => q.ricevuta(g({ esito: 'gia', perche: 'gia' }))), 'Waiting for you to close its line.')
  assert.equal(in_('en', () => q.ricevuta(g({ esito: 'saltata', perche: 'tetto' }))), 'Today’s budget is spent: back tomorrow.')
  assert.equal(in_('en', () => q.ricevuta(g({ quanti: 4, perche: 'condizione' }))), 'Looked at 4 documents: an “only if” step stopped it.')
  assert.match(in_('en', () => q.ricevuta(g({ esito: 'guaio', perche: 'guaio' }), '2026-10-09T10:35:00.000Z')), /^It failed: retrying at /)
  assert.equal(in_('en', () => q.ricevuta(null)), "It hasn't run yet.")
  // nessuna riga di ricevuta ha una lineetta
  for (const l of ['it', 'en'] as const) for (const perche of ['vuoto', 'niente', 'gia', 'tetto', 'condizione'] as const) {
    assert.doesNotMatch(in_(l, () => q.ricevuta(g({ quanti: 2, perche }))), /—/)
  }
})

test('il mese prima, il bottone di una proposta, l\'avviso dopo', () => {
  assert.equal(in_('en', () => q.mesePrima(6, 9)), 'Last month: up to 6 items, from 9 documents.')
  assert.equal(in_('it', () => q.mesePrima(1, 1)), 'Il mese scorso: fino a 1 cosa, da 1 documento.')
  assert.equal(in_('en', () => q.mesePrima(0, 0)), 'Last month it would have done nothing.')
  assert.equal(in_('en', () => q.mesePrima(4, 0)), 'Last month: 4 lines on your list.')
  assert.equal(in_('en', () => q.approva(1)), 'Approve')
  assert.equal(in_('en', () => q.approva(3)), 'Approve all (3)')
  assert.equal(in_('it', () => q.approva(3)), 'Approva tutto (3)')
  assert.equal(in_('en', () => q.approvata('posta.bozza', 2, 'Bozze')), '2 drafts in your mailbox.')
  assert.equal(in_('en', () => q.approvata('agenda.aggiungi', 1, '')), 'One event in your calendar.')
  assert.equal(in_('en', () => q.approvata('file.crea', 1, 'Quotes.docx')), 'Saved: Quotes.docx')
  assert.doesNotMatch(in_('en', () => q.approvata('posta.bozza', 2, 'x')), /sent/i, 'una bozza non è mandata')
})

test('da una carta: «Fallo ogni settimana» scrive la frase che il costruttore sa leggere', () => {
  const it = in_('it', () => q.fraseOgniSettimana('Richiamare Rossi per il preventivo.'))
  assert.equal(it, 'Ogni lunedì mattina: Richiamare Rossi per il preventivo')
  assert.deepEqual(quandoDetto(it), { ogni: 'settimana', giorno: 1, ora: 8 })
  const en = in_('en', () => q.fraseOgniSettimana('Send the  weekly report to Anna'))
  assert.equal(en, 'Every Monday morning: Send the weekly report to Anna')
  assert.deepEqual(quandoDetto(en), { ogni: 'settimana', giorno: 1, ora: 8 })
  // un nome proprio in testa resta com'è
  assert.equal(in_('en', () => q.fraseOgniSettimana('Anna Rossi: invoice')), 'Every Monday morning: Anna Rossi: invoice')
  assert.equal(q.fraseOgniSettimana('   '), '')
})

test('la frase letta prima del modello: i giorni feriali, il mese, e cosa consegna', () => {
  assert.deepEqual(quandoDetto('Every weekday at 9 chase the quotes'), { ogni: 'feriali', ora: 9 })
  assert.deepEqual(quandoDetto('Nei giorni lavorativi alle 8 guarda la posta'), { ogni: 'feriali', ora: 8 })
  assert.deepEqual(quandoDetto('Dal lunedì al venerdì alle 9 dimmi chi aspetta'), { ogni: 'feriali', ora: 9 })
  assert.deepEqual(quandoDetto('Once a month list the renewals'), { ogni: 'mese', giorno: 1, ora: 8 })
  assert.deepEqual(quandoDetto('Il 15 di ogni mese alle 9 controlla le fatture'), { ogni: 'mese', giorno: 15, ora: 9 })
  assert.deepEqual(quandoDetto('On the 28th of every month at 6pm list what is owed'), { ogni: 'mese', giorno: 28, ora: 18 })
  assert.equal(consegnaDetta('When a quote request arrives, put a reply in my drafts'), 'posta.bozza')
  assert.equal(consegnaDetta('Quando arriva un invito, mettilo in agenda'), 'agenda.aggiungi')
  assert.equal(consegnaDetta('Every Friday write the summary as a note'), 'nota.crea')
  assert.equal(consegnaDetta('Ogni lunedì scrivi il riepilogo in un file'), 'file.crea')
  assert.equal(consegnaDetta('Send the reply to Rossi'), null, 'mandare non è una cosa che si consegna')
  assert.equal(interpreta('Ogni mese, in una nota', []).proponi, 'nota.crea')
})

test('la riga fissa del motore dice l\'ordine fisso che non è riuscito, e porta lì', () => {
  const BASE = { ragiona: true, testa: null, guastoLettura: null, chiedeClaude: 'X', mancanze: [], titoliNegati: false, dopoImpostazioni: false, puoAprire: true, puoRiavviare: true }
  const riprova = new Date(2026, 9, 9, 10, 35).toISOString()
  const una = in_('en', () => sf.rigaFonti({ ...BASE, automazioni: [{ nome: 'Replies to give', riprova }] }))
  assert.equal(una?.frase, '“Replies to give” failed: retrying at 10:35.')
  assert.deepEqual(una?.controllo, { tipo: 'automazioni' })
  const due = in_('it', () => sf.rigaFonti({ ...BASE, automazioni: [{ nome: 'a', riprova: null }, { nome: 'b', riprova }] }))
  assert.equal(due?.frase, '2 ordini fissi non sono riusciti: riprovo alle 10:35.')
  // senza ordini fissi storti la riga non c'è
  assert.equal(in_('en', () => sf.rigaFonti({ ...BASE, automazioni: [] })), null)
  // e una fonte che manca viene prima: il controllo è il suo
  const insieme = in_('en', () => sf.rigaFonti({ ...BASE, ragiona: false, automazioni: [{ nome: 'x', riprova: null }] }))
  assert.equal(insieme?.controllo.tipo, 'fonti')
})
