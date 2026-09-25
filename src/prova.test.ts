// Le frasi della prova e del vassoio (P6), in tutte e due le lingue.
//
//   node --test src/prova.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'

;(globalThis as unknown as { document: unknown }).document = { documentElement: { lang: '' } }
const { impostaLingua } = await import('./lingua.ts')
const { frasiProva, intestazione, data } = await import('./prova.ts')
type R = import('./api.ts').RiassuntoProva

function in_<T>(l: 'it' | 'en', f: () => T): T {
  impostaLingua(l)
  try { return f() } finally { impostaLingua('en') }
}
const D = '2026-09-14T10:00:00.000Z'
const OTTO = '2026-10-08T10:00:00.000Z'

test('le frasi con un numero, al singolare, al plurale e a zero', () => {
  assert.equal(in_('it', () => frasiProva.giuste(9, 10)), '9 su 10 giuste')
  assert.equal(in_('en', () => frasiProva.giuste(9, 10)), '9 of 10 right')
  assert.equal(in_('it', () => frasiProva.poche(3)), '3 risultati: ancora pochi per giudicare')
  assert.equal(in_('it', () => frasiProva.poche(1)), '1 risultato: ancora pochi per giudicare')
  assert.equal(in_('en', () => frasiProva.poche(1)), '1 result: not enough to judge yet')
  assert.equal(in_('it', () => frasiProva.poche(0)), 'Ancora pochi risultati per giudicare')
  assert.equal(in_('en', () => frasiProva.poche(0)), 'Not enough results to judge yet')
  assert.equal(in_('it', () => frasiProva.letti(1)), 'Ha letto 1 documento e non avrebbe fatto niente.')
  assert.equal(in_('en', () => frasiProva.letti(42)), 'It read 42 documents and would have done nothing.')
  assert.equal(in_('en', () => frasiProva.altri(14)), 'and 14 more')
  assert.equal(in_('it', () => frasiProva.altri(14)), 'e altri 14')
  assert.equal(in_('it', () => frasiProva.neProvo(1)), 'Ne provo una…')
  assert.equal(in_('en', () => frasiProva.neProvo(2)), 'Testing 2…')
  assert.equal(in_('it', () => frasiProva.conto(9, 10, 4)), '9 su 10 giuste · ultimi 30 giorni · 4 le hai decise tu')
  assert.equal(in_('en', () => frasiProva.conto(9, 10, 1)), '9 of 10 right · last 30 days · 1 decided by you')
  assert.equal(in_('it', () => frasiProva.conto(9, 10, 1)), "9 su 10 giuste · ultimi 30 giorni · 1 l'hai decisa tu")
  assert.equal(in_('en', () => frasiProva.conto(5, 5, 0)), '5 of 5 right · last 30 days')
  assert.equal(in_('en', () => frasiProva.contoIdea(9, 10)), '9 of 10 right in practice')
  assert.equal(in_('it', () => frasiProva.contoEditor(9, 10)), '9 su 10 giuste negli ultimi 30 giorni')
})

test('le date: «14 set», «14 Sep», «all\'8 ott», le date piegate', () => {
  assert.equal(in_('it', () => data(D)), '14 set')
  assert.equal(in_('en', () => data(D)), '14 Sep')
  assert.equal(in_('it', () => frasiProva.inProvaFino(OTTO)), "In prova fino all'8 ott")
  assert.equal(in_('en', () => frasiProva.inProvaFino(OTTO)), 'In practice until 8 Oct')
  assert.equal(in_('it', () => frasiProva.fermata(D)), 'Fermata al limite della prova, arrivata al 14 set.')
  assert.equal(in_('en', () => frasiProva.fermata(D)), 'Stopped at the practice limit, up to 14 Sep.')
  const due = ['2026-09-13T10:00:00.000Z', D]
  assert.equal(in_('it', () => frasiProva.anche(due)), 'anche il 13 e il 14 set')
  assert.equal(in_('en', () => frasiProva.anche(due)), 'also 13 and 14 Sep')
  assert.equal(in_('en', () => frasiProva.anche([D, D, D, D, D])), 'also 5 more days')
  assert.equal(in_('it', () => frasiProva.anche([D, D, D, D, D])), 'anche altri 5 giorni')
  assert.equal(frasiProva.anche([]), '')
  assert.equal(in_('it', () => frasiProva.risposto(D)), 'Hai risposto il 14 set')
  assert.equal(in_('en', () => frasiProva.fatta(D)), 'You marked it done on 14 Sep')
  assert.equal(in_('en', () => frasiProva.riga(D)), 'You made it a row on 14 Sep')
  assert.equal(in_('it', () => frasiProva.scartata(D)), "L'hai scartata il 14 set")
  assert.equal(in_('en', () => frasiProva.giaRisposto(D)), 'You already replied on 14 Sep.')
  assert.equal(in_('it', () => frasiProva.inCoda('Fatture in arrivo')), 'In coda dopo «Fatture in arrivo»')
  assert.equal(in_('en', () => frasiProva.inCoda('Invoices arriving')), 'Queued after “Invoices arriving”')
})

const base: R = { id: 'p', stato: 'finita', esito: 'pronta', giusti: 9, giudicati: 10, tue: 4, documenti: 40, risultati: 12, bozze: 3, al: D, cambiata: false, parziale: [], davanti: null }

test('l\'intestazione per ogni stato: una riga vera, al più un bottone', () => {
  const i = (p: Partial<R>, l: 'it' | 'en' = 'en') => in_(l, () => intestazione({ ...base, ...p }))
  assert.deepEqual(i({}), { testo: '9 of 10 right · last 30 days · 4 decided by you', verde: true, bottone: null, seconda: null })
  assert.equal(i({ esito: 'non passa', giusti: 8, giudicati: 10 }).verde, false)
  assert.equal(i({ esito: 'poco', giudicati: 3 }).testo, '3 results: not enough to judge yet')
  assert.equal(i({ esito: 'poco', giudicati: 0 }).testo, 'Not enough results to judge yet')
  assert.equal(i({ risultati: 0, documenti: 0 }).testo, 'It found nothing to read in the last 30 days.')
  assert.equal(i({ risultati: 0, documenti: 42 }).testo, 'It read 42 documents and would have done nothing.')
  assert.equal(i({ stato: 'in coda', davanti: 'Invoices arriving' }).testo, 'Queued after “Invoices arriving”')
  assert.equal(i({ stato: 'in corso' }).testo, 'Trying it on the last 30 days…')
  assert.deepEqual(i({ stato: 'fermata' }).bottone, 'riprova')
  assert.equal(i({ stato: 'tetto' }).testo, 'Stopped at today\'s spending cap.')
  assert.deepEqual([i({ stato: 'occupato' }).testo, i({ stato: 'occupato' }).bottone], ['Stopped: your Claude account is busy.', 'riprova'])
  assert.equal(i({ stato: 'interrotta' }).testo, 'Interrupted: Myynd closed.')
  assert.equal(i({ stato: 'guaio' }).testo, 'The practice didn\'t finish.')
  assert.deepEqual([i({ stato: 'senza modello' }).testo, i({ stato: 'senza modello' }).bottone], ['Connect a model to try it.', 'fonti'])
  assert.equal(i({ stato: 'scollegata' }).bottone, 'collega')
  assert.equal(i({ stato: 'basta per oggi' }).testo, 'Six practices today. The next one tomorrow.')
  assert.deepEqual([i({ cambiata: true }).testo, i({ cambiata: true }).bottone], ['Changed since this practice.', 'di nuovo'])
  assert.equal(i({ parziale: ['agenda'] }).seconda, 'Without the calendar: it can\'t be read in the past.')
  assert.equal(i({ parziale: ['agenda', 'codice'] }, 'it').seconda, 'Senza agenda: nel passato non si legge. · Senza Claude Code: nel passato non gira.')
  assert.equal(i({ stato: 'in corso' }, 'it').testo, 'La provo sugli ultimi 30 giorni…')
})

test('nessuna lineetta in nessuna frase, e gli stessi numeri in tutte e due le lingue', () => {
  const tutte = (l: 'it' | 'en') => in_(l, () => [
    frasiProva.giuste(9, 10), frasiProva.poche(3), frasiProva.letti(2), frasiProva.fermata(D), frasiProva.inCoda('X'),
    frasiProva.inProvaFino(OTTO), frasiProva.anche(['2026-09-13T10:00:00.000Z', D]), frasiProva.altri(7), frasiProva.risposto(D),
    frasiProva.fatta(D), frasiProva.riga(D), frasiProva.scartata(D), frasiProva.giaRisposto(D), frasiProva.neProvo(3),
    frasiProva.conto(9, 10, 4), frasiProva.contoEditor(9, 10), frasiProva.contoIdea(9, 10), frasiProva.avrebbeChiesto('Q?'),
    ...['finita', 'in coda', 'in corso', 'fermata', 'tetto', 'occupato', 'interrotta', 'guaio', 'annullata', 'senza modello', 'scollegata', 'basta per oggi']
      .map(stato => intestazione({ ...base, stato, parziale: ['agenda', 'codice'] })).flatMap(x => [x.testo, x.seconda ?? ''])
  ])
  const it = tutte('it'), en = tutte('en')
  for (const s of [...it, ...en]) assert.doesNotMatch(s, /[—–]/, s)
  const numeri = (s: string) => (s.match(/\d+/g) ?? []).join(',')
  it.forEach((s, k) => assert.equal(numeri(s), numeri(en[k]), `${s} / ${en[k]}`))
})
