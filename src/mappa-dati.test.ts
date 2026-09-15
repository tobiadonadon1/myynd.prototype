import { test } from 'node:test'
import assert from 'node:assert/strict'
import { costruisciDaGrafo, documentiCollegati, evidenzaMappa, type Grafo } from './brain.ts'
import { dataDocumentoMappa, motivoMappa } from './mappa-testo.ts'

const nodi: Grafo['nodi'] = Array.from({ length: 8 }, (_, i) => ({ id: `note:${i}`, titolo: `Document ${i}`, gruppo: i % 2 ? 'note' : 'email', fonte: 'note', quando: null }))

test('the sphere contains real exact document IDs with deterministic finite positions', () => {
  const g: Grafo = { nodi, archi: [[0, 1, 2], [1, 2, 1], [3, 4, 2]] }
  const ball = costruisciDaGrafo(g)
  assert.deepEqual(ball.nodes.map(n => n.doc), nodi.map(n => n.id))
  assert.deepEqual(ball.nodes.map(n => n.titolo), nodi.map(n => n.titolo))
  assert.deepEqual(costruisciDaGrafo(g), ball)
  for (const n of ball.nodes) assert.ok(Number.isFinite(n.x + n.y + n.z) && Math.hypot(n.x, n.y, n.z) <= 1.040001)
  assert.deepEqual(costruisciDaGrafo({ nodi: [], archi: [] }), { nodes: [], edges: [] })
})

test('invalid edges cannot corrupt the shape or invent related documents', () => {
  const g: Grafo = { nodi, archi: [[0, 1, 2], [-1, 0, 2], [0, 99, 4], [0, 0, 3], [.5, 0, 2], [0, 2, NaN], [0, 3, -1]] }
  assert.deepEqual(costruisciDaGrafo(g).edges, [[0, 1]])
  assert.deepEqual(documentiCollegati(g, 'note:0').map(n => n.id), ['note:1'])
})

test('related documents are actual shared-topic neighbours, ranked and deduplicated', () => {
  const g: Grafo = { nodi, archi: [[0, 1, 1], [2, 0, 5], [0, 1, 4], [3, 4, 10]] }
  assert.deepEqual(documentiCollegati(g, 'note:0').map(n => n.id), ['note:2', 'note:1'])
  assert.deepEqual(documentiCollegati(g, 'note:0', 1).map(n => n.id), ['note:2'])
  assert.deepEqual(documentiCollegati(g, 'missing'), [])
  assert.deepEqual(documentiCollegati(null, 'note:0'), [])
})

test('classification codes become readable explanations and unknown codes never leak', () => {
  assert.match(motivoMappa('fonte_non_recente'), /historical|storico/)
  assert.match(motivoMappa('feedback_fatto'), /complet/)
  assert.match(motivoMappa('feedback_scartato'), /consultabile|available/)
  assert.equal(motivoMappa('internal_unknown_classifier'), '')
  assert.equal(motivoMappa(undefined), '')
})

test('selecting an exact document highlights only its incident edges and neighbours, not its entire source', () => {
  const ball = costruisciDaGrafo({ nodi, archi: [[0, 1, 2], [0, 2, 2], [2, 4, 2], [1, 3, 2], [4, 6, 2]] })
  const evidenza = evidenzaMappa(ball, 'note:0', 'email')
  assert.deepEqual([...evidenza.archi], [0, 1])
  assert.deepEqual([...evidenza.nodi], [0, 1, 2])
  assert.equal(evidenza.nodi.has(4), false, 'unrelated documents from the same source stay dim')
  assert.equal(evidenza.nodi.has(1), true, 'actual neighbours from other sources remain visible')
  assert.deepEqual([...evidenzaMappa(ball, 'note:7', 'note').nodi], [7], 'an isolated document highlights itself alone')
})

test('source filters still work without a document selection, and reset has no highlight', () => {
  const ball = costruisciDaGrafo({ nodi, archi: [[0, 1, 1], [1, 3, 1], [2, 4, 1]] })
  assert.deepEqual([...evidenzaMappa(ball, 'email', 'email').nodi], [0, 2, 4, 6])
  assert.deepEqual([...evidenzaMappa(ball, 'email', 'email').archi], [0, 2])
  assert.deepEqual([...evidenzaMappa(ball, 'email', null).archi], [])
})

test('selected source dates always include the year and do not invent dates for missing metadata', () => {
  assert.match(dataDocumentoMappa('2025-09-24T12:00:00Z'), /2025/)
  assert.match(dataDocumentoMappa('2026-09-14T12:00:00Z'), /2026/)
  assert.equal(dataDocumentoMappa(null), '')
  assert.equal(dataDocumentoMappa(undefined), '')
  assert.equal(dataDocumentoMappa('not a date'), '')
})
