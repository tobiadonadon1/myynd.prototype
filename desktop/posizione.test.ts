// La barra sta dove deve, su ogni schermo.
//
//   node --test desktop/posizione.test.ts
//
// E il mostriciattolo, che resta su uno schermo anche quando uno se ne va,
// guarda verso il cursore, e apre il fumetto dalla parte dove c'è posto.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ALTEZZA_MASSIMA, ALTEZZA_MASSIMA_FUMETTO, ALTEZZA_MINIMA, LARGHEZZA, LARGHEZZA_FUMETTO, LATO_COMPAGNO, MARGINE_COMPAGNO,
  doveSiApre, posizioneCompagno, posizioneFumetto, posizioneRichiamo, sguardoVerso, trascinaCompagno
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
  assert.deepEqual(posizioneCompagno([PRINCIPALE], { x: 1440 - LATO_COMPAGNO / 2 - 20, y: 500 }, PRINCIPALE), { x: 1440 - LATO_COMPAGNO, y: 500 })
  assert.deepEqual(posizioneCompagno([PRINCIPALE], { x: 10, y: 10 }, PRINCIPALE), { x: 10, y: 25 }, 'sotto la barra dei menu')
})

test('mostriciattolo: due schermi affiancati', () => {
  const aree = [PRINCIPALE, SECONDO]
  assert.deepEqual(posizioneCompagno(aree, { x: 2000, y: 500 }, PRINCIPALE), { x: 2000, y: 500 })
  // a cavallo del bordo, col centro sul secondo: sul secondo
  assert.deepEqual(posizioneCompagno(aree, { x: 1420, y: 500 }, PRINCIPALE), { x: 1440, y: 500 })
  // a cavallo, col centro sul primo: sul primo
  assert.deepEqual(posizioneCompagno(aree, { x: 1440 - LATO_COMPAGNO / 2 - 20, y: 500 }, PRINCIPALE), { x: 1440 - LATO_COMPAGNO, y: 500 })
})

test('mostriciattolo trascinato: segue, resta dentro, e fuori da tutto sta fermo', () => {
  const aree = [PRINCIPALE, SECONDO]
  assert.deepEqual(trascinaCompagno(aree, { x: 100, y: 200 }, 30, -40), { x: 130, y: 160 })
  assert.deepEqual(trascinaCompagno(aree, { x: 1300, y: 200 }, 200, 0), { x: 1500, y: 200 }, 'passa sul secondo schermo')
  assert.deepEqual(trascinaCompagno(aree, { x: 100, y: 700 }, 0, 100), { x: 100, y: 25 + 875 - LATO_COMPAGNO })
  assert.deepEqual(trascinaCompagno(aree, { x: 100, y: 800 }, -500, 0), { x: 100, y: 800 })
  assert.deepEqual(trascinaCompagno(aree, { x: 100, y: 800 }, -500, 0, { x: 60, y: 800 }), { x: 60, y: 800 }, 'fuori da tutto: resta dov’è adesso')
})

test('mostriciattolo spinto contro il bordo e riportato indietro: torna sotto il puntatore', () => {
  const aree = [PRINCIPALE, SECONDO]
  const presa = { x: 100, y: 700 }
  const giu = { x: 100, y: 25 + 875 - LATO_COMPAGNO }
  // il puntatore scende di 400 punti oltre il fondo: il mostriciattolo si ferma al bordo
  assert.deepEqual(trascinaCompagno(aree, presa, 0, 120), giu)
  assert.deepEqual(trascinaCompagno(aree, presa, 0, 400, giu), giu)
  // e risale: appena il puntatore torna sopra il bordo, il mostriciattolo è di nuovo sotto di lui
  assert.deepEqual(trascinaCompagno(aree, presa, 0, 50, giu), { x: 100, y: 750 })
  assert.deepEqual(trascinaCompagno(aree, presa, 0, 0, giu), presa)
})

/* ------------------------------------------------------------ lo sguardo e il fumetto */

const LUI = { x: 1272, y: 732, width: LATO_COMPAGNO, height: LATO_COMPAGNO }

test('sguardo: il cursore sugli occhi è dritto, a destra è positivo, in alto negativo', () => {
  const occhi = { x: LUI.x + LUI.width / 2, y: LUI.y + LUI.height * 0.38 }
  assert.deepEqual(sguardoVerso(LUI, occhi), { x: 0, y: 0 })
  assert.deepEqual(sguardoVerso(LUI, { x: occhi.x + 260, y: occhi.y }), { x: 0.5, y: 0 }, 'a 260 punti è a metà strada')
  const su = sguardoVerso(LUI, { x: occhi.x, y: occhi.y - 520 })
  assert.equal(su.x, 0)
  assert.ok(su.y < -0.6 && su.y > -0.7, `in alto: ${su.y}`)
})

test('sguardo: lontano non va oltre 1, e un cursore strano non lo torce', () => {
  const lontano = sguardoVerso(LUI, { x: -100_000, y: 100_000 })
  assert.ok(lontano.x >= -1 && lontano.x < -0.99 && lontano.y <= 1 && lontano.y > 0.99, JSON.stringify(lontano))
  assert.deepEqual(sguardoVerso(LUI, { x: Number.NaN, y: 3 }), { x: 0, y: 0 })
  // un passo minuscolo non cambia il centesimo: niente di nuovo da mandare
  assert.deepEqual(sguardoVerso(LUI, { x: LUI.x + 72, y: LUI.y + 55 }), sguardoVerso(LUI, { x: LUI.x + 72.4, y: LUI.y + 55 }))
})

test('fumetto: lui in basso a destra, il fumetto a sinistra e cresce verso l’alto', () => {
  const f = posizioneFumetto(PRINCIPALE, LUI, 120)
  assert.equal(f.lato, 'sinistra')
  assert.equal(f.ancora, 'sotto')
  assert.equal(f.width, LARGHEZZA_FUMETTO)
  assert.equal(f.height, 120)
  // entra un po' nel suo quadrato trasparente, ma non fino al corpo
  assert.ok(f.x + f.width > LUI.x && f.x + f.width < LUI.x + LUI.width / 2, `bordo destro ${f.x + f.width}`)
  // il fondo all'altezza della bocca
  assert.equal(f.y + f.height, Math.round(LUI.y + LUI.height * 0.62))
  // più alto: il fondo resta lì, cresce in su
  const alto = posizioneFumetto(PRINCIPALE, LUI, 300)
  assert.equal(alto.y + alto.height, f.y + f.height)
  assert.equal(alto.x, f.x)
})

test('fumetto: lui contro il bordo sinistro in alto, il fumetto a destra e cresce in giù', () => {
  const lui = { x: 0, y: 30, width: LATO_COMPAGNO, height: LATO_COMPAGNO }
  const f = posizioneFumetto(PRINCIPALE, lui, 100)
  assert.equal(f.lato, 'destra')
  assert.equal(f.ancora, 'sopra')
  assert.ok(f.x >= lui.x + lui.width / 2 && f.x < lui.x + lui.width, `x ${f.x}`)
  assert.equal(f.y, Math.round(lui.y + lui.height * 0.22))
  assert.equal(posizioneFumetto(PRINCIPALE, lui, 300).y, f.y, 'la cima resta ferma')
})

test('fumetto: l’altezza fra il minimo e il suo tetto, e sempre dentro lo schermo', () => {
  assert.equal(posizioneFumetto(PRINCIPALE, LUI, 5).height, ALTEZZA_MINIMA)
  assert.equal(posizioneFumetto(PRINCIPALE, LUI, 5000).height, ALTEZZA_MASSIMA_FUMETTO)
  assert.equal(posizioneFumetto(PRINCIPALE, LUI, Number.NaN).height, ALTEZZA_MINIMA)
  const piccolo = { x: 0, y: 0, width: 400, height: 260 }
  for (const lui of [{ x: 0, y: 0 }, { x: 256, y: 116 }, { x: 128, y: 60 }]) {
    const f = posizioneFumetto(piccolo, { ...lui, width: LATO_COMPAGNO, height: LATO_COMPAGNO }, 1000)
    assert.ok(f.x >= 0 && f.y >= 0 && f.x + f.width <= 400 && f.y + f.height <= 260, JSON.stringify(f))
  }
})

test('fumetto: su un secondo schermo resta su quello', () => {
  const lui = { x: SECONDO.x + 1700, y: 900, width: LATO_COMPAGNO, height: LATO_COMPAGNO }
  const f = posizioneFumetto(SECONDO, lui, 200)
  assert.equal(f.lato, 'sinistra')
  assert.ok(f.x >= SECONDO.x && f.x + f.width <= SECONDO.x + SECONDO.width, JSON.stringify(f))
})
