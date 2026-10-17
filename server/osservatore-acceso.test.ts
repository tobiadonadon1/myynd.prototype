// Acceso di serie con più conti sul Mac: è di chi apre la finestra, e il guscio lo sa subito.
//
//   node --import ./build/test-profile.mjs --test server/osservatore-acceso.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-osservatore-acceso-'))
process.env.MYYND_DATI = CASA
process.env.MYYND_APP = '1'

const conti = await import('./conti.ts')
const chi = await import('./chi.ts')
const cfg = await import('./config.ts')
const store = await import('./store.ts')
const oss = await import('./osservatore.ts')
const davanti = await import('./davanti.ts')

let anna = '', bruno = ''
const mandati: Record<string, unknown>[] = []

before(async () => {
  const a = await conti.registra('anna@esempio.it', 'passwordlunga1')
  const b = await conti.registra('bruno@esempio.it', 'passwordlunga2')
  anna = a.ok ? a.id : ''; bruno = b.ok ? b.id : ''
  for (const u of [anna, bruno]) chi.dentro(u, () => { cfg.scrivi({ lingua: 'en', fuso: 'Europe/Rome' }); store.azzeraTutto() })
  // anna l'aveva spento a mano, prima
  chi.dentro(anna, () => cfg.aggiorna({ osservatore: { acceso: false } }))
  davanti.azzera()
  oss.ascolta({ on() {}, postMessage(m: unknown) { mandati.push(m as Record<string, unknown>) } })
})
after(() => { store.chiudiIndici(); rmSync(CASA, { recursive: true, force: true }) })

test('due conti e nessuno davanti: di nessuno', () => {
  assert.equal(oss.proprietario(), null)
})

test('davanti c’è chi l’ha spento: resta spento', () => {
  davanti.segna(anna)
  assert.equal(oss.proprietario(), null)
})

test('davanti c’è un conto di prima, senza niente nella configurazione: diventa suo, acceso, e il guscio lo riceve', () => {
  mandati.length = 0
  davanti.segna(bruno)
  assert.equal(oss.proprietario(), bruno)
  assert.equal(mandati.at(-1)?.acceso, true)
  assert.equal(mandati.at(-1)?.testi, false)
  // poi anna davanti: il Mac resta di bruno finché lui non lo spegne o lei non lo accende
  davanti.segna(anna)
  assert.equal(oss.proprietario(), bruno)
})
