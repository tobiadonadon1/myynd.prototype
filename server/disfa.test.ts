// Disfare il lavoro di una notte (F5): il file nel Cestino, la bozza resta,
// la carta torna sua; un file fuori dai luoghi delle consegne non si tocca.
//
//   node --test server/disfa.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-disfa-'))
process.env.MYYND_DATI = join(CASA, 'dati')

const store = await import('./store.ts')
const mani = await import('./mani.ts')
const disfa = await import('./disfa.ts')

const SCRIVANIA = join(CASA, 'Desktop')
const CESTINO = join(CASA, '.Trash')
const ALTROVE = join(CASA, 'Projects')

before(() => {
  store.azzeraTutto()
  for (const d of [SCRIVANIA, ALTROVE]) mkdirSync(d, { recursive: true })
  mani.perProva({ scrivania: () => SCRIVANIA, scaricati: () => join(CASA, 'Downloads'), documenti: () => join(CASA, 'Documents') })
  disfa.perProva({ cestino: () => CESTINO })
})
after(() => {
  mani.perProva(null); disfa.perProva(null)
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

function consegnata(id: string, percorso: string, extra: Record<string, unknown> = {}) {
  store.scriviCompito({ id, testo: `Card ${id}`, ordine: id })
  store.affidaCompito(id, 'tutto')
  store.risultatoCompito(id, 'Done: saved.', [], 'pronto')
  store.scriviConsegnaCompito(id, { app: 'File', titolo: percorso.split('/').pop()!, percorso })
  if (extra.email) store.scriviEmailCompito(id, extra.email as never)
}

test('il file consegnato va nel Cestino, con un nome libero, e la carta torna sua', () => {
  writeFileSync(join(SCRIVANIA, 'Plan.md'), 'one')
  mkdirSync(CESTINO, { recursive: true }); writeFileSync(join(CESTINO, 'Plan.md'), 'già lì')
  consegnata('d1', join(SCRIVANIA, 'Plan.md'))
  const r = disfa.disfaLavoro('d1')
  assert.deepEqual(r, { file: 'cestino', bozzaResta: false })
  assert.equal(existsSync(join(SCRIVANIA, 'Plan.md')), false)
  assert.ok(readdirSync(CESTINO).includes('Plan 2.md'))
  const c = store.compito('d1')!
  assert.equal(c.stato, 'aperto')
  assert.equal(c.modo, 'io')
  assert.equal(c.risultato, null)
})

test('un file fuori dai luoghi delle consegne non si tocca; la bozza nella casella resta e lo si dice', () => {
  writeFileSync(join(ALTROVE, 'main.swift'), 'code')
  consegnata('d2', join(ALTROVE, 'main.swift'), { email: { a: 'n@x.com', oggetto: 'x', corpo: 'y', conosciuto: true, casella: { stato: 'salvata', id: '7' } } })
  const r = disfa.disfaLavoro('d2')
  assert.deepEqual(r, { file: 'fuori', bozzaResta: true })
  assert.equal(existsSync(join(ALTROVE, 'main.swift')), true)
})

test('una carta senza lavoro da disfare lo dice', () => {
  store.scriviCompito({ id: 'd3', testo: 'Nothing done', ordine: 'd3' })
  assert.throws(() => disfa.disfaLavoro('d3'), /lavoro da disfare/)
})
