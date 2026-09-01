// L'icona della scheda del browser è lo stesso marchio dell'app.
//
// Il tracciato è scritto due volte: in `marchio-forma.ts`, che disegna il
// marchio dentro l'app, e in `public/marchio.svg`, che è quello che il browser
// mette nella linguetta. Due copie della stessa cosa si separano — è già
// successo due volte con questa sagoma, che negli ultimi commit è passata da
// corallo a cervello e ritorno — e la copia dimenticata non fa rumore: nessuno
// guarda la propria favicon.
//
// Questo test è il rumore.
//
//   node --test src/marchio.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PREDEFINITA } from './components/marchio-forma.ts'

const SVG = join(new URL('.', import.meta.url).pathname, '..', 'public', 'marchio.svg')

test('la favicon è la sagoma che usa l’app', () => {
  const svg = readFileSync(SVG, 'utf8')
  const d = svg.match(/\sd="([^"]+)"/)?.[1]
  assert.ok(d, 'public/marchio.svg non ha un tracciato')
  assert.equal(d, PREDEFINITA.tracciato,
    'il marchio dell’app è cambiato e la favicon è rimasta quella di prima')
})

test('la tela è quadrata, o nella linguetta il marchio si rimpicciolisce', () => {
  const svg = readFileSync(SVG, 'utf8')
  const vb = svg.match(/viewBox="([^"]+)"/)?.[1].split(/\s+/).map(Number)
  assert.ok(vb && vb.length === 4, 'manca il viewBox')
  assert.equal(vb![2], vb![3], `la tela è ${vb![2]}×${vb![3]}`)
  assert.ok(Math.abs(vb![3] - PREDEFINITA.altezza) < 0.01, 'la tela non è alta quanto il marchio')
})
