// I pezzi puri del fuoco sulla riga che lavora: il rumore della fiamma,
// l'inviluppo del fascio che gira, le fasi della posa, il conto delle righe.
//
// Sono quattro funzioni di numeri, e sono proprio quelle che si sbagliano
// senza che si veda: un rumore che salta fa una fiamma che sussulta, un
// gradino nell'inviluppo fa un'ombra che gira per la riga una volta ogni
// quattro secondi, una posa che non arriva a zero lascia un velo addosso alla
// riga finita. A occhio, su una tela che si muove, nessuna delle quattro si
// riconosce; qui si vedono tutte.
//
// Il componente importa un foglio di stile e disegna JSX, due cose che Node
// non sa caricare: il gancio qui sotto traduce il `.tsx` e risponde al foglio
// con un modulo vuoto. Quello che si prova sotto non tocca né l'uno né l'altro.
//
//   node --test src/components/aurora-compito.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import * as ts from 'typescript'

const componente = new URL('./AuroraCompito.tsx', import.meta.url).href
const ganci = registerHooks({
  load(url, contesto, poi) {
    if (url.endsWith('.css')) return { format: 'module', shortCircuit: true, source: 'export default {}' }
    if (url !== componente) return poi(url, contesto)
    const sorgente = readFileSync(new URL(url), 'utf8')
    return {
      format: 'module',
      shortCircuit: true,
      source: ts.transpileModule(sorgente, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX }
      }).outputText
    }
  }
})
const { rumore, fiamma, fascio, posaFasi, quanteRighe } = await import('./AuroraCompito.tsx')
ganci.deregister()

test('Flame noise stays in range and repeats exactly at the same seed', () => {
  for (let i = 0; i < 400; i++) {
    const v = rumore(i * .37, 5)
    assert.ok(v >= 0 && v <= 1, `fuori scala: ${v}`)
  }
  assert.equal(rumore(12, 3), rumore(12, 3))
  assert.notEqual(rumore(12, 3), rumore(12, 4))
})

test('Flame noise is continuous: no jump between two near points', () => {
  let massimo = 0
  for (let x = 0; x < 60; x += .01) massimo = Math.max(massimo, Math.abs(rumore(x + .01, 1) - rumore(x, 1)))
  assert.ok(massimo < .03, `salta di ${massimo}`)
})

test('The flame is not a sine: it repeats at no short period', () => {
  const serie = Array.from({ length: 2000 }, (_, i) => fiamma(i * .02, 9))
  for (const periodo of [25, 50, 100, 157, 314]) {
    let differenza = 0
    for (let i = 0; i + periodo < serie.length; i++) differenza += Math.abs(serie[i] - serie[i + periodo])
    assert.ok(differenza / (serie.length - periodo) > .05, `si ripete ogni ${periodo}`)
  }
})

test('The light band is full at its centre and dark at the far side', () => {
  assert.ok(fascio(.5, .5) > .99)
  assert.equal(fascio(0, .5), 0)
})

test('The light band re-enters without a step: no seam travelling round', () => {
  let massimo = 0
  for (let c = 0; c < 1; c += .002) {
    for (let u = 0; u < 1; u += .01) massimo = Math.max(massimo, Math.abs(fascio(u, (c + .002) % 1) - fascio(u, c)))
  }
  assert.ok(massimo < .05, `gradino di ${massimo}`)
})

test('The tail is behind and the edge ahead: the band travels to the right', () => {
  const scia = fascio(.4, .5)
  const fronte = fascio(.6, .5)
  assert.ok(scia > fronte, `scia ${scia} fronte ${fronte}`)
})

test('Settling gathers before it fades, and ends at nothing', () => {
  assert.deepEqual(posaFasi(0), { raccolta: 0, svanire: 0 })
  assert.ok(posaFasi(.2).raccolta > .4)
  assert.equal(posaFasi(.2).svanire, 0)
  assert.ok(posaFasi(.3).raccolta > .99)
  assert.ok(posaFasi(1).svanire > .99)
  assert.deepEqual(posaFasi(2), posaFasi(1))
  let prima = -1
  for (let p = 0; p <= 1; p += .01) {
    const v = posaFasi(p).svanire
    assert.ok(v >= prima - 1e-9, `torna indietro a ${p}`)
    prima = v
  }
})

test('The stripe count stays bounded on a very wide row', () => {
  assert.equal(quanteRighe(760), 117)
  assert.ok(quanteRighe(1600) <= 120)
  assert.ok(quanteRighe(4000) <= 120)
  assert.ok(quanteRighe(80) >= 24)
})
