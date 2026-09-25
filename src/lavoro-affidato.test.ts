// Cosa mostra una riga pronta: le regole piccole del client (P3).
//
//   node --test src/lavoro-affidato.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appenaFinite, bloccoDi, eUnaMancanza, mandataValida, puoMandare, rigaDellaVoce, senzaRigaIpotesi, siCambia, siRivede } from './lavoro-affidato.ts'

test('mandataValida: una mandata più vecchia della delega è di un giro prima', () => {
  assert.equal(mandataValida({ mandata: { doc: 'posta:Sent:61', quando: '2026-09-24T10:00:00.000Z', certezza: 'filo', ritocco: 0.1 }, chiesto: '2026-09-24T09:00:00.000Z' }), true)
  assert.equal(mandataValida({ mandata: { doc: 'posta:Sent:61', quando: '2026-09-23T10:00:00.000Z', certezza: 'filo', ritocco: 0.1 }, chiesto: '2026-09-24T09:00:00.000Z' }), false)
  assert.equal(mandataValida({ mandata: null, chiesto: '2026-09-24T09:00:00.000Z' }), false)
  assert.equal(mandataValida({ mandata: { doc: 'x', quando: '2026-09-24T10:00:00.000Z', certezza: 'id', ritocco: 0 }, chiesto: null }), false)
})

test('rigaDellaVoce solo con almeno tre mail a quella persona, e apre la più recente', () => {
  assert.deepEqual(rigaDellaVoce({ voceScritta: { destinatario: 'Marco', lingua: 'it', quanti: 4, esempi: [{ id: 'posta:Sent:4', label: 'Re: corso' }, { id: 'posta:Sent:3', label: 'x' }] } }), { n: 4, nome: 'Marco', apri: 'posta:Sent:4' })
  assert.equal(rigaDellaVoce({ voceScritta: { destinatario: 'Marco', lingua: 'it', quanti: 2, esempi: [{ id: 'posta:Sent:4', label: 'x' }] } }), null)
  assert.equal(rigaDellaVoce({ voceScritta: { destinatario: 'Marco', lingua: 'it', quanti: 0, esempi: [] } }), null)
  assert.equal(rigaDellaVoce({ voceScritta: null }), null)
})

test('bloccoDi riconosce le quattro frasi fisse e nient\'altro', () => {
  assert.equal(bloccoDi({ guaio: 'Collega la posta e la riprendo da qui.' }), true)
  assert.equal(bloccoDi({ guaio: 'Dai a Myynd il permesso che serve e la riprendo da qui.' }), true)
  assert.equal(bloccoDi({ guaio: 'Non sono riuscito a finirla senza un dato che manca.' }), false)
  assert.equal(bloccoDi({ guaio: null }), false)
})

test('puoMandare: con un segnaposto nel corpo no', () => {
  assert.equal(puoMandare({ email: { a: 'a@b.c', oggetto: 'x', corpo: 'Hi, the price is [to fill: price for 20 people].', conosciuto: true } }), false)
  assert.equal(puoMandare({ email: { a: 'a@b.c', oggetto: 'x', corpo: 'Hi, the price is 890.', conosciuto: true } }), true)
  assert.equal(puoMandare({ email: null }), true)
  assert.equal(eUnaMancanza({ ipotesi: ['Missing: the price. I left it blank.'], email: null }), true)
  assert.equal(eUnaMancanza({ ipotesi: ['I assumed Friday.'], email: null }), false)
})

test('siRivede con una bozza salvata nella posta o un file consegnato', () => {
  assert.equal(siRivede({ email: { a: '', oggetto: '', corpo: '', conosciuto: false, casella: { stato: 'salvata', id: 'd1' } }, consegna: null }), true)
  assert.equal(siRivede({ email: null, consegna: { app: 'File', titolo: 'x', percorso: '/tmp/x.md' } }), true)
  assert.equal(siRivede({ email: { a: '', oggetto: '', corpo: '', conosciuto: false }, consegna: null }), false)
  assert.equal(senzaRigaIpotesi('Done.\n\nBody.\n\nI assumed Friday.'), 'Done.\n\nBody.')
})

test('appenaFinite: da affidata a pronta è finita; rimessa com\'era dopo un errore no, e non si dice «Fatto»', () => {
  const prima = { a: 'delegato', b: 'delegato', c: 'delegato', d: 'pronto' }
  const adesso = [{ id: 'a', stato: 'pronto' }, { id: 'b', stato: 'chiede' }, { id: 'c', stato: 'pronto' }, { id: 'd', stato: 'pronto' }]
  assert.deepEqual(appenaFinite(prima, adesso), { pronte: ['a', 'c'], finite: ['a', 'b', 'c'] })
  // «Cambia» fallito: la riga torna pronta da sola, e non è un lavoro finito
  assert.deepEqual(appenaFinite(prima, adesso, new Set(['c'])), { pronte: ['a'], finite: ['a', 'b'] })
  // la prima lista non è un passaggio
  assert.deepEqual(appenaFinite(null, adesso), { pronte: [], finite: [] })
})

test('testoDellaBozza: il testo della lista è il risultato senza la riga dell\'ipotesi, e intero senza ipotesi', async () => {
  const { testoDellaBozza } = await import('./lavoro-affidato.ts')
  const risultato = 'Done: the quote.\n\nHi Nora,\n\nThe price is 890 EUR.\n\nBest,\nAlex\n\nPrice from the list [2].\nI assumed twelve people.'
  assert.equal(testoDellaBozza({ risultato, ipotesi: ['I assumed twelve people.'] }), 'Done: the quote.\n\nHi Nora,\n\nThe price is 890 EUR.\n\nBest,\nAlex\n\nPrice from the list [2].')
  assert.equal(testoDellaBozza({ risultato, ipotesi: null }), risultato)
  assert.equal(testoDellaBozza({ risultato: null, ipotesi: null }), '')
})

test('siCambia: la riga dell\'ipotesi con «Cambia» solo su una riga pronta con un\'ipotesi e non ancora partita dalla sua posta', () => {
  const ipotesi = ['I assumed Friday as the deadline.']
  const chiesto = '2026-09-24T09:00:00.000Z'
  assert.equal(siCambia({ stato: 'pronto', ipotesi, mandata: null, chiesto }), true)
  // partita dalla sua posta dopo la delega: la bozza non c'è più, «Cambia» fallirebbe sempre
  assert.equal(siCambia({ stato: 'pronto', ipotesi, mandata: { doc: 'posta:Sent:61', quando: '2026-09-24T10:00:00.000Z', certezza: 'filo', ritocco: 0.1 }, chiesto }), false)
  // una mandata di un giro prima non conta
  assert.equal(siCambia({ stato: 'pronto', ipotesi, mandata: { doc: 'posta:Sent:61', quando: '2026-09-23T10:00:00.000Z', certezza: 'filo', ritocco: 0.1 }, chiesto }), true)
  assert.equal(siCambia({ stato: 'pronto', ipotesi: null, mandata: null, chiesto }), false)
  assert.equal(siCambia({ stato: 'chiede', ipotesi, mandata: null, chiesto }), false)
})
