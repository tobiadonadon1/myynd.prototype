// La barra sta dove deve, su ogni schermo.
//
//   node --test desktop/posizione.test.ts
//
// E il mostriciattolo, che resta su uno schermo anche quando uno se ne va,
// guarda verso il cursore, e apre la casella sotto di lui (o sopra, se sotto non c'è posto).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ALTEZZA_MASSIMA, ALTEZZA_MINIMA, ALTEZZA_SCATOLA, ALTO_COMPAGNO, LARGHEZZA, LARGHEZZA_SCATOLA, LARGHEZZA_SCATOLA_MAX, LARGHEZZA_SCATOLA_MIN,
  LATO_COMPAGNO, MARGINE_COMPAGNO, misureCompagno,
  corpoDelCompagno, doveSiApre, posizioneCompagno, posizioneRichiamo, posizioneScatola, sguardoVerso, trascinaCompagno
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
  const atteso = { x: 1440 - LATO_COMPAGNO - MARGINE_COMPAGNO, y: 25 + 875 - ALTO_COMPAGNO - MARGINE_COMPAGNO }
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
  assert.deepEqual(trascinaCompagno(aree, { x: 100, y: 700 }, 0, 100), { x: 100, y: 25 + 875 - ALTO_COMPAGNO })
  assert.deepEqual(trascinaCompagno(aree, { x: 100, y: 800 }, -500, 0), { x: 100, y: 800 })
  assert.deepEqual(trascinaCompagno(aree, { x: 100, y: 800 }, -500, 0, { x: 60, y: 800 }), { x: 60, y: 800 }, 'fuori da tutto: resta dov’è adesso')
})

test('mostriciattolo spinto contro il bordo e riportato indietro: torna sotto il puntatore', () => {
  const aree = [PRINCIPALE, SECONDO]
  const presa = { x: 100, y: 650 }
  const giu = { x: 100, y: 25 + 875 - ALTO_COMPAGNO }
  // il puntatore scende di 400 punti oltre il fondo: il mostriciattolo si ferma al bordo
  assert.deepEqual(trascinaCompagno(aree, presa, 0, 120), giu)
  assert.deepEqual(trascinaCompagno(aree, presa, 0, 400, giu), giu)
  // e risale: appena il puntatore torna sopra il bordo, il mostriciattolo è di nuovo sotto di lui
  assert.deepEqual(trascinaCompagno(aree, presa, 0, 50, giu), { x: 100, y: 700 })
  assert.deepEqual(trascinaCompagno(aree, presa, 0, 0, giu), presa)
})

test('il corpo è il quadrato in alto: la striscia della pastiglia non conta per sguardo e casella', () => {
  assert.equal(ALTO_COMPAGNO > LATO_COMPAGNO, true)
  assert.deepEqual(corpoDelCompagno({ x: 10, y: 20, width: LATO_COMPAGNO, height: ALTO_COMPAGNO }),
    { x: 10, y: 20, width: LATO_COMPAGNO, height: LATO_COMPAGNO })
  const grande = misureCompagno('grande')
  assert.deepEqual(corpoDelCompagno({ x: 0, y: 0, width: grande.lato, height: grande.alto }), { x: 0, y: 0, width: grande.lato, height: grande.lato })
})

test('le taglie: la stessa finestra in scala, e una taglia sconosciuta vale media', () => {
  assert.deepEqual(misureCompagno('medio'), { lato: LATO_COMPAGNO, alto: ALTO_COMPAGNO, scala: 1 })
  assert.deepEqual(misureCompagno(undefined), misureCompagno('medio'))
  assert.deepEqual(misureCompagno('enorme'), misureCompagno('medio'))
  const p = misureCompagno('piccolo'), g = misureCompagno('grande')
  assert.ok(p.lato < LATO_COMPAGNO && g.lato > LATO_COMPAGNO && g.alto > ALTO_COMPAGNO)
  // grande in basso a destra: resta dentro con le sue misure
  const q = posizioneCompagno([PRINCIPALE], undefined, PRINCIPALE, g)
  assert.deepEqual(q, { x: 1440 - g.lato - MARGINE_COMPAGNO, y: 25 + 875 - g.alto - MARGINE_COMPAGNO })
  assert.deepEqual(trascinaCompagno([PRINCIPALE], q, 0, 30, q, g), { x: q.x, y: 25 + 875 - g.alto })
})

/* ------------------------------------------------------------ lo sguardo e la casella */

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

test('casella: lui in alto, sta sotto di lui centrata, attaccata ai piedi, e cresce in giù', () => {
  const lui = { x: 600, y: 100, width: LATO_COMPAGNO, height: LATO_COMPAGNO }
  const c = posizioneScatola(PRINCIPALE, lui, 60)
  assert.equal(c.verso, 'giu')
  assert.equal(c.width, LARGHEZZA_SCATOLA)
  assert.equal(c.x, Math.round(600 + 72 - LARGHEZZA_SCATOLA / 2), 'centrata sotto di lui')
  assert.ok(c.y >= lui.y + lui.height * 0.9 && c.y <= lui.y + lui.height, `attaccata ai piedi: ${c.y}`)
  const lunga = posizioneScatola(PRINCIPALE, lui, 300)
  assert.equal(lunga.y, c.y, 'la cima resta ferma')
  assert.equal(lunga.height, 300)
  assert.equal(posizioneScatola(PRINCIPALE, lui, 5000).height, ALTEZZA_SCATOLA, 'oltre il tetto scorre dentro')
})

test('casella: lui in basso (dove sta di serie), va sopra la testa e cresce in su', () => {
  const finestra = { ...posizioneCompagno([PRINCIPALE], undefined, PRINCIPALE), width: LATO_COMPAGNO, height: ALTO_COMPAGNO }
  const lui = corpoDelCompagno(finestra)
  const c = posizioneScatola(PRINCIPALE, lui, 60)
  assert.equal(c.verso, 'su')
  assert.ok(c.y + c.height <= lui.y + lui.height * 0.1, JSON.stringify({ c, lui }))
  const lunga = posizioneScatola(PRINCIPALE, lui, 300)
  assert.equal(lunga.y + lunga.height, c.y + c.height, 'il fondo resta fermo sopra le antenne')
  // contro il bordo destro: spinta dentro, non tagliata
  assert.ok(c.x + c.width <= 1440 - 12)
})

test('casella: la misura tirata dalla persona vale, dentro i limiti e dentro lo schermo', () => {
  const lui = { x: 600, y: 100, width: LATO_COMPAGNO, height: LATO_COMPAGNO }
  const tirata = posizioneScatola(PRINCIPALE, lui, 5000, { larghezza: 500, altezza: 520 })
  assert.equal(tirata.width, 500)
  assert.equal(tirata.height, 520)
  assert.equal(posizioneScatola(PRINCIPALE, lui, 60, { larghezza: 10 }).width, LARGHEZZA_SCATOLA_MIN)
  assert.equal(posizioneScatola(PRINCIPALE, lui, 60, { larghezza: 9000 }).width, LARGHEZZA_SCATOLA_MAX)
  assert.equal(posizioneScatola(PRINCIPALE, lui, 5000, { altezza: 9000 }).height <= 875 - 24, true)
  const piccolo = { x: 0, y: 0, width: 400, height: 300 }
  for (const p of [{ x: 0, y: 0 }, { x: 256, y: 156 }, { x: 128, y: 60 }]) {
    const c = posizioneScatola(piccolo, { ...p, width: LATO_COMPAGNO, height: LATO_COMPAGNO }, 1000)
    assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.width <= 400 && c.y + c.height <= 300 && c.height >= ALTEZZA_MINIMA, JSON.stringify(c))
  }
  assert.equal(posizioneScatola(PRINCIPALE, lui, Number.NaN).height, ALTEZZA_MINIMA)
})

test('casella: su un secondo schermo resta su quello', () => {
  const lui = { x: SECONDO.x + 1700, y: 900, width: LATO_COMPAGNO, height: LATO_COMPAGNO }
  const c = posizioneScatola(SECONDO, lui, 200)
  assert.ok(c.x >= SECONDO.x && c.x + c.width <= SECONDO.x + SECONDO.width, JSON.stringify(c))
})
