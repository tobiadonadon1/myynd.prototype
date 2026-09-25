// I conti con il loro nome (P4): ogni genere nelle due lingue, uno e tanti, i
// separatori delle migliaia, l'ordine, al massimo quattro, mai uno zero, e le
// frasi delle schede senza lineette.
//
//   node --test src/conta-fonti.test.ts

import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'

;(globalThis as unknown as { document: unknown }).document = { documentElement: { lang: '' } }
const { impostaLingua } = await import('./lingua.ts')
const { carta, contaGenere, lettiFinora, numero, trovato, trovatoDurante } = await import('./conta-fonti.ts')

afterEach(() => impostaLingua('en'))

const GENERI = ['email', 'evento', 'file', 'nota', 'pagina', 'conversazione', 'riunione', 'documento'] as const

test('every kind, in both languages, one and many', () => {
  impostaLingua('en')
  assert.deepEqual(GENERI.map(g => contaGenere(g, 1)), ['1 email', '1 event', '1 file', '1 note', '1 page', '1 conversation', '1 meeting', '1 document'])
  assert.deepEqual(GENERI.map(g => contaGenere(g, 2)), ['2 emails', '2 events', '2 files', '2 notes', '2 pages', '2 conversations', '2 meetings', '2 documents'])
  impostaLingua('it')
  assert.deepEqual(GENERI.map(g => contaGenere(g, 1)), ['1 email', '1 evento', '1 file', '1 nota', '1 pagina', '1 conversazione', '1 riunione', '1 documento'])
  assert.deepEqual(GENERI.map(g => contaGenere(g, 3)), ['3 email', '3 eventi', '3 file', '3 note', '3 pagine', '3 conversazioni', '3 riunioni', '3 documenti'])
})

test('thousands: 1.204 in Italian, 1,204 in English, even under ten thousand', () => {
  impostaLingua('it')
  assert.equal(numero(1204), '1.204')
  assert.equal(contaGenere('file', 1204), '1.204 file')
  impostaLingua('en')
  assert.equal(numero(1204), '1,204')
  assert.equal(numero(312), '312')
})

test('the found line: emails, events, files first, then by size, at most four, no zeros', () => {
  impostaLingua('it')
  assert.equal(trovato({ file: 1204, evento: 42, email: 312 }), '312 email, 42 eventi, 1.204 file')
  impostaLingua('en')
  assert.equal(trovato({ file: 1204, evento: 42, email: 312 }), '312 emails, 42 events, 1,204 files')
  assert.equal(trovato({ email: 60, evento: 0, file: 6 }), '60 emails, 6 files', 'a zero kind never shows')
  assert.equal(trovato({ riunione: 3, pagina: 40, email: 1, nota: 12, conversazione: 58 }), '1 email, 58 conversations, 40 pages, 12 notes')
})

test('nothing found: no line, not «0 emails» and not «nothing» (counter-case)', () => {
  assert.equal(trovato({}), null)
  assert.equal(trovato({ email: 0, file: 0 }), null)
  assert.equal(trovato(null), null)
})

test('every card phrase, both languages, singular and plural', () => {
  impostaLingua('it')
  assert.equal(carta.posta(312, 90), 'Collegata: 312 email degli ultimi 90 giorni.')
  assert.equal(carta.postaMac(1240, 3), 'Collegata: 1.240 email degli ultimi 90 giorni, da 3 caselle.')
  assert.equal(carta.postaMac(60, 1), 'Collegata: 60 email degli ultimi 90 giorni, da una casella.')
  assert.equal(carta.agendaMac(42, 5), 'Collegata: 42 eventi da 5 calendari.')
  assert.equal(carta.agendaMac(1, 1), 'Collegata: 1 evento da 1 calendario.')
  assert.equal(carta.notion(40), 'Collegata: 40 pagine.')
  assert.equal(carta.slack(12), 'Collegata: 12 canali.')
  assert.equal(carta.slack(200, true), 'Collegata: più di 200 canali.')
  assert.equal(carta.note(412), 'Collegata: 412 note.')
  assert.equal(carta.conversazioni(58), 'Collegata: 58 conversazioni.')
  assert.equal(carta.desktop({ tutto: true, cartelle: 2, mac: true }), 'Collegata: tutto il Mac, in sola lettura.')
  assert.equal(carta.desktop({ tutto: true, cartelle: 1, mac: false }), 'Collegata: tutto il PC, in sola lettura.')
  assert.equal(carta.desktop({ tutto: false, cartelle: 3, mac: true }), 'Collegata: 3 cartelle, in sola lettura.')
  assert.equal(lettiFinora(400, 3000), '400 di 3.000 letti finora')
  impostaLingua('en')
  assert.equal(carta.posta(312, 90), 'Connected: 312 emails from the last 90 days.')
  assert.equal(carta.postaMac(1240, 3), 'Connected: 1,240 emails from the last 90 days, from 3 accounts.')
  assert.equal(carta.postaMac(60, 1), 'Connected: 60 emails from the last 90 days, from 1 account.')
  assert.equal(carta.agendaMac(42, 5), 'Connected: 42 events from 5 calendars.')
  assert.equal(carta.notion(1), 'Connected: 1 page.')
  assert.equal(carta.slack(1), 'Connected: 1 channel.')
  assert.equal(carta.slack(200, true), 'Connected: more than 200 channels.')
  assert.equal(carta.note(412), 'Connected: 412 notes.')
  assert.equal(carta.conversazioni(58), 'Connected: 58 conversations.')
  assert.equal(carta.desktop({ tutto: true, cartelle: 2, mac: true }), 'Connected: your whole Mac, read only.')
  assert.equal(carta.desktop({ tutto: false, cartelle: 1, mac: true }), 'Connected: 1 folder, read only.')
  assert.equal(lettiFinora(400, 3000), '400 of 3,000 read so far')
  // una carta può dire zero: è uno stato vero
  assert.equal(carta.posta(0, 90), 'Connected: 0 emails from the last 90 days.')
})

test('no dash in any phrase', () => {
  for (const l of ['it', 'en']) {
    impostaLingua(l)
    const frasi = [carta.posta(3, 90), carta.postaMac(3, 2), carta.agendaMac(3, 2), carta.notion(3), carta.slack(3), carta.slack(200, true), carta.note(3), carta.conversazioni(3),
      carta.desktop({ tutto: true, cartelle: 1, mac: true }), carta.desktop({ tutto: false, cartelle: 2, mac: true }), trovato({ email: 1, evento: 2, file: 3, nota: 4 })!, lettiFinora(1, 2)]
    for (const f of frasi) assert.doesNotMatch(f, /[—–]/, f)
  }
})

test('while the rows are on screen, a source whose row is still queued is not counted in the line above', () => {
  impostaLingua('en')
  const pagina = { trovato: { email: 60, evento: 42, file: 10 }, perFonte: { postamac: 60, calendario: 42, desktop: 10 } }
  // the drain already read Mail on this Mac, but its row still says «Queued»
  assert.equal(trovatoDurante(pagina, ['postamac']), '42 events, 10 files')
  // with Mail from another account read, the emails of the read source still count
  assert.equal(trovatoDurante({ trovato: {}, perFonte: { posta: 5, postamac: 60 } }, ['postamac']), '5 emails')
  // counter-cases: nothing queued, everything as by kind; an older server without per-source counts; nothing yet
  assert.equal(trovatoDurante(pagina, []), '60 emails, 42 events, 10 files')
  assert.equal(trovatoDurante({ trovato: { email: 60 } }, ['postamac']), '60 emails')
  assert.equal(trovatoDurante(pagina, ['postamac', 'calendario', 'desktop']), null)
  assert.equal(trovatoDurante(null, []), null)
})
