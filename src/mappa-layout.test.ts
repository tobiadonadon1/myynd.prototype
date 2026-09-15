import { test } from 'node:test'
import assert from 'node:assert/strict'
import { disponiEtichette, nodoAlPunto, separaNodi, type PuntoMappa, type Rettangolo } from './mappa-layout.ts'

const sovrapposti = (a: Rettangolo, b: Rettangolo) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

test('dense coincident circles separate without changing the graph or exceeding a local shift', () => {
  const originali = Array.from({ length: 80 }, (_, i) => ({ i, x: 300, y: 240, r: 3, z: i / 80, doc: `note:${i}`, scelto: i === 0 }))
  const copia = structuredClone(originali)
  const punti = separaNodi(originali, 600, 480)
  const visibili = punti.filter(p => p.visibile)
  assert.deepEqual(originali, copia)
  assert.equal(punti.length, originali.length)
  assert.equal(punti[0].visibile, true, 'selected document gets a visible position first')
  assert.ok(visibili.length > 45, 'many documents remain individually visible even when initially coincident')
  for (let i = 0; i < visibili.length; i++) {
    const p = visibili[i]
    assert.ok(Math.hypot(p.x - 300, p.y - 240) <= 36.00001)
    for (const q of visibili.slice(i + 1)) assert.ok(Math.hypot(p.x - q.x, p.y - q.y) >= p.r + q.r + 1.29999)
  }
  assert.deepEqual(separaNodi(originali, 600, 480), punti, 'same input is stable across renders')
})

test('zoomed large circles are spaced across spatial bucket boundaries', () => {
  const punti = separaNodi(Array.from({ length: 12 }, (_, i) => ({ i, x: 170 + i * 21, y: 220, r: 17, z: i / 12 })), 700, 480).filter(p => p.visibile)
  for (let i = 0; i < punti.length; i++) for (const q of punti.slice(i + 1)) {
    assert.ok(Math.hypot(punti[i].x - q.x, punti[i].y - q.y) >= 35.29999)
  }
})

test('hit testing uses visible shifted circles and preserves the exact document index', () => {
  const punti = separaNodi(Array.from({ length: 20 }, (_, i) => ({ i, x: 150, y: 150, r: 4, z: i / 20 })), 300, 300)
  const spostato = punti.find(p => p.visibile && p.x !== 150)!
  assert.equal(nodoAlPunto(punti, spostato.x, spostato.y)?.i, spostato.i)
  assert.equal(nodoAlPunto([{ i: 4, x: 5, y: 5, r: 5, z: 1, visibile: false }], 5, 5), null)
  assert.equal(nodoAlPunto([], 150, 150), null)
})

test('offscreen circles stay cropped when zooming, while in-view circles respect the canvas edge', () => {
  const punti: PuntoMappa[] = [{ i: 0, x: -20, y: 100, r: 4, z: 0 }, { i: 1, x: 299, y: 100, r: 4, z: 0 }]
  const [fuori, bordo] = separaNodi(punti, 300, 300)
  assert.equal(fuori.visibile, false)
  assert.equal(bordo.visibile, true)
  assert.ok(bordo.x <= 288)
})

test('labels occur once, avoid circles and each other, and selected detail gets first place', () => {
  const ostacoli = [{ x: 280, y: 220, w: 40, h: 40 }]
  const etichette = [
    { id: 'email', testo: 'Email', ancora: { x: 300, y: 240 }, w: 80, h: 23 },
    { id: 'email', testo: 'Email', ancora: { x: 305, y: 242 }, w: 80, h: 23 },
    { id: 'note', testo: 'Notes', ancora: { x: 307, y: 245 }, w: 80, h: 23 },
    { id: 'doc:42', testo: 'Launch date', ancora: { x: 300, y: 240 }, w: 180, h: 23, scelta: true }
  ]
  const messe = disponiEtichette(etichette, 600, 480, ostacoli)
  assert.equal(messe.length, 3)
  assert.equal(messe[0].id, 'doc:42')
  assert.equal(messe.filter(e => e.id === 'email').length, 1)
  for (let i = 0; i < messe.length; i++) {
    const e = messe[i]
    assert.ok(e.x >= 12 && e.y >= 48 && e.x + e.w <= 588 && e.y + e.h <= 414)
    assert.equal(ostacoli.some(o => sovrapposti(e, o)), false)
    for (const altra of messe.slice(i + 1)) assert.equal(sovrapposti(e, altra), false)
  }
})
