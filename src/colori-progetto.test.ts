import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TAVOLOZZA, coloreProgetto, velato } from './colori-progetto.ts'

test('un colore scelto vince; senza scelta ne ha uno della tavolozza, sempre lo stesso', () => {
  assert.equal(coloreProgetto({ id: 'p1', colore: '#123ABC' }), '#123ABC')
  const a = coloreProgetto({ id: 'pe3b10be074f9' })
  assert.ok((TAVOLOZZA as readonly string[]).includes(a))
  assert.equal(coloreProgetto({ id: 'pe3b10be074f9', colore: '' }), a)
  assert.equal(coloreProgetto({ id: 'pe3b10be074f9', colore: 'rosso' }), a)
  assert.equal(coloreProgetto(null), TAVOLOZZA[0])
})

test('fra progetti che si vedono insieme, due non hanno mai la stessa tinta, e le scelte a mano si saltano', () => {
  const tutti = [
    { id: 'b', dal: '2026-09-02' },
    { id: 'a', dal: '2026-09-01' },
    { id: 'c', dal: '2026-09-03', colore: '#C4623B' }
  ]
  // «a» è nato prima: prende la prima tinta libera, cioè non il rame scelto da «c»
  assert.equal(coloreProgetto(tutti[1], tutti), '#5C7660')
  assert.equal(coloreProgetto(tutti[0], tutti), '#4F6D8C')
  assert.equal(coloreProgetto(tutti[2], tutti), '#C4623B')
  // e l'ordine della lista non conta: conta la nascita
  assert.equal(coloreProgetto(tutti[1], [...tutti].reverse()), '#5C7660')
})

test('il velo aggiunge l’alfa in esadecimale', () => {
  assert.equal(velato('#C4623B', 0.1), '#C4623B1a')
  assert.equal(velato('#C4623B', 1), '#C4623Bff')
})
