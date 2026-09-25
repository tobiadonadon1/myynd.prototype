// L'etichetta dell'uso: dentro il contesto sì, fuori no, mai doppia, e due
// contesti insieme non si mescolano.
//
//   node --test server/etichetta-uso.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-etichetta-'))
process.env.MYYND_DATI = CASA
const { conEtichetta, etichettato, etichettaInCorso } = await import('./etichetta-uso.ts')
const store = await import('./store.ts')
after(() => { store.chiudiIndici(); rmSync(CASA, { recursive: true, force: true }) })

const righe = () => (store.default.prepare('SELECT lavoro FROM uso ORDER BY rowid').all() as { lavoro: string }[]).map(r => r.lavoro)
const pausa = (ms: number) => new Promise(r => setTimeout(r, ms))

test('dentro il contesto l’etichetta c’è, fuori no, e non si raddoppia', () => {
  assert.equal(etichettato('risposta'), 'risposta')
  assert.equal(etichettaInCorso(), null)
  conEtichetta('prova', () => {
    assert.equal(etichettato('risposta'), 'prova:risposta')
    assert.equal(etichettato('prova:verifica'), 'prova:verifica')
    assert.equal(etichettaInCorso(), 'prova')
  })
  assert.equal(etichettato('risposta'), 'risposta')
})

test('le righe dell’uso portano l’etichetta solo dentro il contesto, anche con due contesti insieme', async () => {
  store.default.exec('DELETE FROM uso')
  const segna = (lavoro: string) => store.segnaUso({ lavoro, motore: 'finto', entrata: 1, cache: 0, uscita: 1 })
  await Promise.all([
    conEtichetta('prova', async () => { await pausa(5); segna('risposta'); await pausa(10); segna('verifica') }),
    (async () => { await pausa(8); segna('risposta'); await pausa(10); segna('titolo') })()
  ])
  assert.deepEqual(righe().sort(), ['prova:risposta', 'prova:verifica', 'risposta', 'titolo'])
})
