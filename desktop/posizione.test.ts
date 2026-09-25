// La barra sta dove deve, su ogni schermo.
//
//   node --test desktop/posizione.test.ts
//
// E il mostriciattolo, che resta su uno schermo anche quando uno se ne va.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ALTEZZA_MASSIMA, ALTEZZA_MINIMA, LARGHEZZA, LATO_COMPAGNO, MARGINE_COMPAGNO, doveSiApre, posizioneCompagno,
  posizioneRichiamo, trascinaCompagno
} from './posizione.ts'

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

/* ------------------------------------------------------------ il mostriciattolo */

const PRINCIPALE = { x: 0, y: 25, width: 1440, height: 875 }
const SECONDO = { x: 1440, y: 0, width: 1920, height: 1080 }

test('mostriciattolo: senza posto salvato, in basso a destra dello schermo principale', () => {
  const atteso = { x: 1440 - LATO_COMPAGNO - MARGINE_COMPAGNO, y: 25 + 875 - LATO_COMPAGNO - MARGINE_COMPAGNO }
  assert.deepEqual(posizioneCompagno([PRINCIPALE], undefined, PRINCIPALE), atteso)
  assert.deepEqual(posizioneCompagno([PRINCIPALE], {}, PRINCIPALE), atteso)
  assert.deepEqual(posizioneCompagno([PRINCIPALE], { x: Number.NaN, y: 3 }, PRINCIPALE), atteso)
})

test('mostriciattolo: un posto salvato dentro uno schermo resta', () => {
  assert.deepEqual(posizioneCompagno([PRINCIPALE], { x: 100, y: 200 }, PRINCIPALE), { x: 100, y: 200 })
  assert.deepEqual(posizioneCompagno([PRINCIPALE], { x: 0, y: 25 }, PRINCIPALE), { x: 0, y: 25 }, 'proprio nell’angolo')
})

test('mostriciattolo: su uno schermo che non c’è più torna al suo posto', () => {
  assert.deepEqual(posizioneCompagno([PRINCIPALE], { x: 2000, y: 500 }, PRINCIPALE),
    posizioneCompagno([PRINCIPALE], undefined, PRINCIPALE))
})

test('mostriciattolo: mezzo fuori viene spinto dentro', () => {
  assert.deepEqual(posizioneCompagno([PRINCIPALE], { x: 1400, y: 500 }, PRINCIPALE), { x: 1440 - LATO_COMPAGNO, y: 500 })
  assert.deepEqual(posizioneCompagno([PRINCIPALE], { x: 10, y: 10 }, PRINCIPALE), { x: 10, y: 25 }, 'sotto la barra dei menu')
})

test('mostriciattolo: due schermi affiancati', () => {
  const aree = [PRINCIPALE, SECONDO]
  assert.deepEqual(posizioneCompagno(aree, { x: 2000, y: 500 }, PRINCIPALE), { x: 2000, y: 500 })
  // a cavallo del bordo, col centro sul secondo: sul secondo
  assert.deepEqual(posizioneCompagno(aree, { x: 1420, y: 500 }, PRINCIPALE), { x: 1440, y: 500 })
  // a cavallo, col centro sul primo: sul primo
  assert.deepEqual(posizioneCompagno(aree, { x: 1400, y: 500 }, PRINCIPALE), { x: 1440 - LATO_COMPAGNO, y: 500 })
})

test('mostriciattolo trascinato: segue, resta dentro, e fuori da tutto sta fermo', () => {
  const aree = [PRINCIPALE, SECONDO]
  assert.deepEqual(trascinaCompagno(aree, { x: 100, y: 200 }, 30, -40), { x: 130, y: 160 })
  assert.deepEqual(trascinaCompagno(aree, { x: 1300, y: 200 }, 200, 0), { x: 1500, y: 200 }, 'passa sul secondo schermo')
  assert.deepEqual(trascinaCompagno(aree, { x: 100, y: 800 }, 0, 50), { x: 100, y: 25 + 875 - LATO_COMPAGNO })
  assert.deepEqual(trascinaCompagno(aree, { x: 100, y: 800 }, -500, 0), { x: 100, y: 800 })
})
