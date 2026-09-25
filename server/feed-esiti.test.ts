// Cosa vale una carta, riga per riga della tabella: è l'unica lettura del
// vocabolario, e tre lavori diversi (feed, fiducia, resoconto) contano con
// questa. Se cambia qui cambia dappertutto, e la tabella qui sotto è il patto.
//
//   node --test server/feed-esiti.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esitoCarta, ragioneDi, eRagioneScarto, MOTIVO_SCARTO, MOTIVO_FUORI, RAGIONI_SCARTO, RAGIONI_FATTO, RAGIONI_SCADUTO } from './feed-esiti.ts'

const VISTA = '2026-09-20T10:00:00.000Z'

test('i tre vocabolari sono congelati', () => {
  assert.deepEqual([...RAGIONI_SCARTO], ['vecchia', 'fatta', 'non_mia', 'non_chiara'])
  assert.deepEqual([...RAGIONI_FATTO], ['lui', 'lista', 'fuori'])
  assert.deepEqual([...RAGIONI_SCADUTO], ['tempo', 'data', 'tetto', 'superata'])
  assert.deepEqual(Object.keys(MOTIVO_SCARTO), [...RAGIONI_SCARTO])
  for (const m of [...Object.values(MOTIVO_SCARTO), MOTIVO_FUORI]) assert.doesNotMatch(m, /[—–]/, 'niente lineette nei motivi')
})

test('eRagioneScarto accetta le quattro di «Non utile» e niente altro', () => {
  for (const r of RAGIONI_SCARTO) assert.equal(eRagioneScarto(r), true)
  for (const x of ['lui', 'lista', 'tempo', '', null, undefined, 3, 'VECCHIA']) assert.equal(eRagioneScarto(x), false, String(x))
})

test('fatto è giusta, con qualunque ragione', () => {
  for (const ragione of ['lui', 'lista', 'fuori', null]) {
    assert.equal(esitoCarta({ stato: 'fatto', ragione, vista: null }), 'giusta', String(ragione))
  }
})

test('scartato: «già fatta» è giusta (arrivata tardi), le altre tre e le righe di prima sono sbagliate', () => {
  assert.equal(esitoCarta({ stato: 'scartato', ragione: 'fatta', vista: VISTA }), 'giusta')
  for (const ragione of ['vecchia', 'non_mia', 'non_chiara', null]) {
    assert.equal(esitoCarta({ stato: 'scartato', ragione, vista: VISTA }), 'sbagliata', String(ragione))
  }
  // e una risposta dalla posta non cambia uno scarto esplicito: lui ha deciso
  assert.equal(esitoCarta({ stato: 'scartato', ragione: 'vecchia', vista: VISTA, risposta: 'dopo' }), 'sbagliata')
})

test('aperto è neutra, salvo che abbia già risposto dalla posta', () => {
  assert.equal(esitoCarta({ stato: 'aperto', ragione: null, vista: VISTA }), 'neutra')
  assert.equal(esitoCarta({ stato: 'aperto', ragione: null, vista: null, risposta: 'dopo' }), 'giusta')
  assert.equal(esitoCarta({ stato: 'aperto', ragione: null, vista: null, risposta: 'prima' }), 'giusta')
})

test('scaduto: la risposta dalla posta vince; superata, data e tetto sono neutre; tempo dipende dalla vista', () => {
  assert.equal(esitoCarta({ stato: 'scaduto', ragione: 'tempo', vista: VISTA, risposta: 'dopo' }), 'giusta')
  for (const ragione of ['superata', 'data', 'tetto']) {
    assert.equal(esitoCarta({ stato: 'scaduto', ragione, vista: VISTA }), 'neutra', ragione)
  }
  assert.equal(esitoCarta({ stato: 'scaduto', ragione: 'tempo', vista: VISTA }), 'sbagliata', 'vista e lasciata passare')
  assert.equal(esitoCarta({ stato: 'scaduto', ragione: 'tempo', vista: null }), 'neutra', 'mai sullo schermo')
  // una riga di prima: scaduto senza ragione è tempo
  assert.equal(esitoCarta({ stato: 'scaduto', ragione: null, vista: VISTA }), 'sbagliata')
  assert.equal(esitoCarta({ stato: 'scaduto', ragione: null, vista: null }), 'neutra')
})

test('ragioneDi legge le righe nate prima della colonna', () => {
  assert.equal(ragioneDi('fatto', null, 'Passata nella lista.'), 'lista')
  assert.equal(ragioneDi('fatto', null, 'Già fatto.'), 'lui')
  assert.equal(ragioneDi('fatto', null, null), 'lui')
  assert.equal(ragioneDi('scaduto', null, null), 'tempo')
  assert.equal(ragioneDi('scartato', null, 'Non mi interessa.'), null)
  assert.equal(ragioneDi('aperto', null, null), null)
  // la colonna, quando c'è, vince sul motivo
  assert.equal(ragioneDi('fatto', 'fuori', 'Passata nella lista.'), 'fuori')
  assert.equal(ragioneDi('scartato', 'fatta', null), 'fatta')
  // una parola fuori dal vocabolario non è una ragione
  assert.equal(ragioneDi('scartato', 'boh', null), null)
})

test('uno stato sconosciuto non vale niente', () => {
  assert.equal(esitoCarta({ stato: 'limbo', ragione: null, vista: VISTA }), 'neutra')
})
