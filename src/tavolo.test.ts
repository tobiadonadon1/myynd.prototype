// Il titolone conta quello che la pagina mostra, non quello che il feed sa.
//
//   node --test src/tavolo.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sulTavolo } from './tavolo.ts'

test('due voci sopra sei righe di lista e una domanda sono nove cose, non due', () => {
  assert.equal(sulTavolo({ voci: 2, compiti: 17, domanda: true }), 9)
  assert.equal(sulTavolo({ voci: 2, compiti: 17, domanda: false }), 8)
})

test('con poche righe in lista si contano quelle che ci sono', () => {
  assert.equal(sulTavolo({ voci: 3, compiti: 2, domanda: false }), 5)
  assert.equal(sulTavolo({ voci: 1, compiti: 0, domanda: false }), 1)
})

test('senza voci in cima va una riga della lista, e sotto ne stanno altre sei', () => {
  assert.equal(sulTavolo({ voci: 0, compiti: 17, domanda: false }), 7)
  assert.equal(sulTavolo({ voci: 0, compiti: 3, domanda: true }), 4)
  assert.equal(sulTavolo({ voci: 0, compiti: 0, domanda: false }), 0)
})

test('la riga scelta da lui in cima non si conta due volte', () => {
  // la voce scende fra le righe: 1 in cima + 6 righe + 2 voci
  assert.equal(sulTavolo({ voci: 2, compiti: 17, domanda: false, inCimaUnCompito: true }), 9)
})
