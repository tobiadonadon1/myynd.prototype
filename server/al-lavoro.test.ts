// Sul Mac i lavori di sfondo girano per chi lo usa, non per ogni conto sul disco.
//
//   node --test server/al-lavoro.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-al-lavoro-'))
process.env.MYYND_DATI = CASA

const conti = await import('./conti.ts')
await conti.avvia()

test('la radice e chi ha una sessione: i conti dei clienti senza sessione restano fermi', async () => {
  const tobia = await conti.adotta('t@example.com', 'sale', 'hash', CASA)
  const cliente = await conti.registra('cliente@example.com', 'una-password-lunga', false)
  const ospite = await conti.registra('ospite@example.com', 'un-altra-password', false)
  assert.ok(tobia && 'id' in cliente && 'id' in ospite)
  assert.deepEqual(conti.alLavoro(CASA), [tobia])
  await conti.perProva.apri(ospite.id)
  assert.deepEqual(conti.alLavoro(CASA).sort(), [tobia, ospite.id].sort())
  assert.equal(conti.alLavoro(CASA).includes(cliente.id), false)
})
