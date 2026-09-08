import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { giornoValido } from './giorno-compito.ts'

const casa = mkdtempSync(join(tmpdir(), 'myynd-calendar-'))
process.env.MYYND_DATI = casa
const store = await import('./store.ts')
const punto = await import('./punto.ts')
after(() => { store.chiudiIndici(); delete process.env.MYYND_DATI; rmSync(casa, { recursive: true, force: true }) })

test('reject invalid dates instead of silently shifting them', () => {
  for (const data of ['2026-02-29', '2026-13-01', '2026-04-31', '2026-00-01', '2026-09-08T12:00:00Z', '', 123, '0001-01-01']) assert.equal(giornoValido(data), false)
  for (const data of ['2024-02-29', '2026-09-08', '2026-12-31']) assert.equal(giornoValido(data), true)
})

test('task day survives edits, re-creation and database reopening; clearing is explicit', () => {
  store.scriviCompito({ id: 'planned', testo: 'Review', quando: 'settimana', giorno: '2026-09-09', ordine: 'a' })
  store.cambiaCompito('planned', { nota: 'Keep this note' })
  store.scriviCompito({ id: 'planned', testo: 'Review updated', quando: 'settimana', ordine: 'b' })
  assert.equal(store.compito('planned')?.giorno, '2026-09-09')
  assert.equal(store.compito('planned')?.nota, 'Keep this note')
  store.chiudiIndici()
  assert.equal(store.compito('planned')?.giorno, '2026-09-09')
  store.cambiaCompito('planned', { giorno: null })
  assert.equal(store.compito('planned')?.giorno, null)
})

test('briefing includes overdue scheduled work and excludes future tasks even in a legacy today bucket', () => {
  store.scriviCompito({ id: 'past', testo: 'Overdue', quando: 'settimana', giorno: '2000-01-01', ordine: 'c' })
  store.scriviCompito({ id: 'future', testo: 'Later', quando: 'oggi', giorno: '2999-01-01', ordine: 'd' })
  const raccolto = punto.raccogli(new Date().toISOString())
  assert.equal(raccolto.perOggi.some(c => c.id === 'past'), true)
  assert.equal(raccolto.perOggi.some(c => c.id === 'future'), false)
})
