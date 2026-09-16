import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const casa = mkdtempSync(join(tmpdir(), 'myynd-consegna-'))
process.env.MYYND_DATI = casa
const store = await import('./store.ts')
after(() => { store.chiudiIndici(); rmSync(casa, { recursive: true, force: true }) })

test('native artifact survives reopen, stays on its own task, and is cleared for a new run', () => {
  store.scriviCompito({ ordine: 'a', id: 'essay', testo: 'Write an essay', quando: 'oggi' })
  store.scriviCompito({ ordine: 'b', id: 'other', testo: 'Unrelated task', quando: 'oggi' })
  assert.equal(store.compito('essay')?.consegna, null)
  const consegna = { app: 'Pages' as const, titolo: 'Essay', percorso: '/tmp/Myynd/Essay.pages', anteprima: '/tmp/Myynd/Essay.pdf', pagine: 3, stile: 'Editorial', revisione: { esito: 'unavailable' as const, problemi: ['Reviewer offline'] } }
  store.scriviConsegnaCompito('essay', consegna)
  store.chiudiIndici()
  assert.deepEqual(store.compito('essay')?.consegna, consegna)
  assert.equal(store.compito('other')?.consegna, null)
  assert.throws(() => store.scriviConsegnaCompito('essay', { ...consegna, percorso: 'https://example.com/file' }))
  assert.throws(() => store.scriviConsegnaCompito('essay', { ...consegna, anteprima: 'https://example.com/preview.pdf' }))
  assert.throws(() => store.scriviConsegnaCompito('essay', { ...consegna, pagine: -1 }))
  assert.deepEqual(store.compito('essay')?.consegna, consegna)
  store.affidaCompito('essay', 'tutto')
  assert.equal(store.compito('essay')?.consegna, null)
})
