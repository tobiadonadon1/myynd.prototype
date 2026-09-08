import { test } from 'node:test'
import assert from 'node:assert/strict'
import { eseguiPassi, validaPassi } from './flusso.ts'

test('each transformation receives the preceding output, conditions preserve it', async () => {
  const inputs: string[] = []
  const result = await eseguiPassi([
    { id: 'one', tipo: 'trasforma', testo: 'Extract' },
    { id: 'two', tipo: 'condizione', testo: 'Relevant?' },
    { id: 'three', tipo: 'trasforma', testo: 'Summarize' }
  ], 'source', async (p, input) => {
    inputs.push(input)
    return { continua: true, testo: p.tipo === 'condizione' ? 'do not forward' : `${input}!` }
  })
  assert.deepEqual(inputs, ['source', 'source!', 'source!'])
  assert.equal(result, 'source!!')
})
test('false conditions stop subsequent steps and produce no result', async () => {
  let calls = 0
  const r = await eseguiPassi([{ id: 'a', tipo: 'condizione', testo: 'Relevant?' }, { id: 'b', tipo: 'trasforma', testo: 'Draft' }], 'source', async () => {
    calls++; return { continua: false, testo: '' }
  })
  assert.equal(r, null); assert.equal(calls, 1)
})
test('invalid or failed steps cannot silently continue', async () => {
  const p = { id: 'a', tipo: 'trasforma' as const, testo: 'Extract' }
  assert.throws(() => validaPassi([p, p]))
  assert.throws(() => validaPassi([{ ...p, tipo: 'shell' }]))
  assert.throws(() => validaPassi([{ ...p, testo: '' }]))
  assert.throws(() => validaPassi(Array.from({ length: 7 }, (_, i) => ({ ...p, id: String(i) }))))
  await assert.rejects(eseguiPassi([p], 'source', async () => ({ continua: true, testo: '' })))
  await assert.rejects(eseguiPassi([p], 'source', async () => { throw new Error('offline') }), /offline/)
})
