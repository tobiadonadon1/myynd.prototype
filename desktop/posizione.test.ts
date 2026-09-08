// La barra sta dove deve, su ogni schermo.
//
//   node --test desktop/posizione.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ALTEZZA_MASSIMA, ALTEZZA_MINIMA, LARGHEZZA, doveSiApre, posizioneRichiamo } from './posizione.ts'

const SCHERMO = { x: 0, y: 25, width: 1440, height: 875 }

test('centrata, a un quinto dell’altezza, larga 680', () => {
  const r = posizioneRichiamo(SCHERMO, 120)
  assert.equal(r.width, LARGHEZZA)
  assert.equal(r.height, 120)
  assert.equal(r.x, (1440 - 680) / 2)
  assert.equal(r.y, 25 + Math.round(875 * 0.2))
})

test('su un secondo schermo si sposta con lui', () => {
  const r = posizioneRichiamo({ x: 1440, y: -200, width: 1920, height: 1080 }, 100)
  assert.equal(r.x, 1440 + (1920 - 680) / 2)
  assert.equal(r.y, -200 + Math.round(1080 * 0.2))
})

test('l’altezza sta fra il minimo e il massimo, e si arrotonda in su', () => {
  assert.equal(posizioneRichiamo(SCHERMO, 10).height, ALTEZZA_MINIMA)
  assert.equal(posizioneRichiamo(SCHERMO, 5000).height, ALTEZZA_MASSIMA)
  assert.equal(posizioneRichiamo(SCHERMO, 99.2).height, 100)
  assert.equal(posizioneRichiamo(SCHERMO, Number.NaN).height, ALTEZZA_MINIMA)
})

test('su uno schermo stretto o basso resta dentro', () => {
  const r = posizioneRichiamo({ x: 0, y: 0, width: 500, height: 300 }, 400)
  assert.ok(r.width < 500 && r.x >= 0 && r.x + r.width <= 500)
  assert.ok(r.height < 300 && r.y >= 0 && r.y + r.height <= 300)
})

test('il registro dice schermo e riquadro, con il nome dello schermo se c’è', () => {
  const r = posizioneRichiamo(SCHERMO, 120)
  assert.equal(doveSiApre({ id: 2, label: 'DELL U2720Q' }, r), '«DELL U2720Q» #2 a 380,200 680×120')
  assert.equal(doveSiApre({ id: 7 }, r), '#7 a 380,200 680×120')
})
