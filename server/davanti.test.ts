// La barra dei menu ferma il turno di chi c'era davanti, non di tutti i conti del Mac.
//
//   node --test server/davanti.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-davanti-'))
process.env.MYYND_DATI = CASA
process.env.MYYND_REGISTRAZIONE = 'aperta'
const conti = await import('./conti.ts')
const store = await import('./store.ts')
const davanti = await import('./davanti.ts')
const guscio = await import('./turno-guscio.ts')

before(async () => { await conti.avvia() })
after(() => { store.chiudiIndici(); rmSync(CASA, { recursive: true, force: true }) })

test('con due conti, «Stop» ferma quello di chi ha usato la finestra per ultimo; senza saperlo, tutti', async () => {
  const a = await conti.registra('anna@esempio.test', 'una-password-lunga')
  const b = await conti.registra('bruno@esempio.test', 'una-password-lunga')
  const ida = typeof a === 'string' ? a : (a as { id: string }).id
  const idb = typeof b === 'string' ? b : (b as { id: string }).id
  davanti.azzera()
  assert.deepEqual(new Set(guscio.contiDaFermare()), new Set([ida, idb]), 'senza nessuno davanti si fermano tutti')
  davanti.segna(idb)
  assert.deepEqual(guscio.contiDaFermare(), [idb])
  // un conto che non c'è più non conta
  davanti.segna('nessuno')
  assert.equal(guscio.contiDaFermare().length, 2)
})
