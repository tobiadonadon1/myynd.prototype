import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compitoInEsecuzione } from './compito-attivo.ts'

test('only a real worker event lights a delegated task; queued, finished, failed and recalled stay quiet', () => {
  assert.equal(compitoInEsecuzione({ stato: 'delegato' }, undefined), false)
  const passo = { passo: 'scrivo' }
  assert.equal(compitoInEsecuzione({ stato: 'delegato' }, passo), true)
  for (const stato of ['aperto', 'pronto', 'chiede', 'fatto', 'lasciato']) {
    assert.equal(compitoInEsecuzione({ stato }, passo), false, stato)
  }
})
