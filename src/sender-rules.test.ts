// La riga dei mittenti messi via si vede solo se ha qualcosa da dire.
//
// Senza regole non è una funzione che manca, è una riga in meno sulla pagina
// delle automazioni: chi non ne ha una non deve nemmeno sapere che esiste.
//
//   node --test src/sender-rules.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mostraRegoleMittenti } from './components/sender-rules.ts'

test('senza regole la riga non c’è, e non c’è nemmeno mentre le legge', () => {
  assert.equal(mostraRegoleMittenti(null, false, ''), false)
  assert.equal(mostraRegoleMittenti([], false, ''), false)
})

test('con una regola la riga c’è', () => {
  assert.equal(mostraRegoleMittenti([{ id: 'r1' }], false, ''), true)
})

test('aperta, resta anche dopo aver tolto l’ultima; un guaio nel leggerle si mostra', () => {
  assert.equal(mostraRegoleMittenti([], true, ''), true)
  assert.equal(mostraRegoleMittenti(null, false, 'non le leggo'), true)
})
