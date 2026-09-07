// Un elenco incollato diventa righe pulite.
//
//   node --test src/righe.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { righeDaTesto } from './oggi/righe.ts'

test('una riga sola resta com’è', () => {
  assert.deepEqual(righeDaTesto('chiamare Marta'), ['chiamare Marta'])
  assert.deepEqual(righeDaTesto('  chiamare Marta  '), ['chiamare Marta'])
})

test('più righe: una per riga, senza quelle vuote', () => {
  assert.deepEqual(righeDaTesto('uno\n\ndue\r\n   \ntre\n'), ['uno', 'due', 'tre'])
  assert.deepEqual(righeDaTesto(''), [])
  assert.deepEqual(righeDaTesto('\n\n'), [])
})

test('i segni d’elenco in testa si tolgono', () => {
  assert.deepEqual(righeDaTesto('- uno\n* due\n• tre\n– quattro\n— cinque'), ['uno', 'due', 'tre', 'quattro', 'cinque'])
  assert.deepEqual(righeDaTesto('1. uno\n2) due\n10. dieci'), ['uno', 'due', 'dieci'])
  assert.deepEqual(righeDaTesto('[ ] uno\n[x] due\n- [ ] tre\n- [X] quattro'), ['uno', 'due', 'tre', 'quattro'])
})

test('un trattino dentro la riga, o attaccato, non è un segno d’elenco', () => {
  assert.deepEqual(righeDaTesto('mail a Rossi - preventivo'), ['mail a Rossi - preventivo'])
  assert.deepEqual(righeDaTesto('-5 gradi a Cortina'), ['-5 gradi a Cortina'])
  assert.deepEqual(righeDaTesto('2024 bilancio'), ['2024 bilancio'])
})
