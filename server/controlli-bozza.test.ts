// I controlli fissi di una bozza: allegati che non ci sono, ore inventate, istruzioni nei segnaposti.
//
//   node --import ./build/test-profile.mjs --test server/controlli-bozza.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { controlliFissi, oreNel } from './controlli-bozza.ts'

test('le ore si leggono in ogni forma, e si confrontano su 24 ore', () => {
  assert.deepEqual(oreNel('alle 10, poi 14:30, or at 3pm, e 9.15').sort(), ['10:00', '14:30', '15:00', '9:15'])
  assert.ok(oreNel('3 pm').includes('15:00'))
  assert.deepEqual(oreNel('il 20 ottobre, 84 mq, 60x60'), [])
})

test('un allegato che non c\'è, un\'ora che non sta nelle fonti, un\'istruzione in un segnaposto', () => {
  assert.match(controlliFissi('Vi trasmetto in allegato la relazione.', '')[0]!, /in allegato/)
  assert.match(controlliFissi('Facciamo venerdì alle 10:00?', 'Chiara: non prima delle 10.')[0]!, /10:00 non sta nelle fonti/)
  assert.deepEqual(controlliFissi('Ci vediamo giovedì alle 9:00.', 'Riunione di cantiere: giovedì 9:00.'), [], 'un\'ora delle fonti va bene')
  assert.match(controlliFissi('Prices: EUR 14,000 [to fill: confirm prices still valid]', '', 'en')[0]!, /holds an instruction/)
  assert.deepEqual(controlliFissi('Lo studio chiude dal [data] al [data].', ''), [], 'un segnaposto col dato che manca va bene')
  assert.deepEqual(controlliFissi('Hi Nora, revised quote below: EUR 13,200, 40% on signature.', 'Total EUR 13,200', 'en'), [])
})
