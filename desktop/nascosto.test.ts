// Quando l'app parte da sola, la finestra non compare.
//
//   node --test desktop/nascosto.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ARGOMENTO_NASCOSTO, avvioNascosto } from './nascosto.ts'

test('aperta a mano: si vede', () => {
  assert.equal(avvioNascosto(['/Applications/Myynd.app/Contents/MacOS/Myynd'], { wasOpenedAtLogin: false, wasOpenedAsHidden: false }), false)
  assert.equal(avvioNascosto([], null), false)
  assert.equal(avvioNascosto([], undefined), false)
})

test('aperta dal sistema all’accesso: nascosta', () => {
  assert.equal(avvioNascosto(['Myynd'], { wasOpenedAtLogin: true }), true)
  assert.equal(avvioNascosto(['Myynd'], { wasOpenedAsHidden: true }), true)
  assert.equal(avvioNascosto(['Myynd', ARGOMENTO_NASCOSTO], {}), true)
})
