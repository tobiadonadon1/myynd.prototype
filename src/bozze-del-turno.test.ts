import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rigaBozze } from './bozze-del-turno.ts'

test('le bozze del turno: a turno spento la riga non c\'è; con l\'autonomia su chiedere è accesa ma in pausa, e lo dice', () => {
  assert.equal(rigaBozze(false, { attiva: true, inPausa: false }), null)
  assert.equal(rigaBozze(true, null), null)
  assert.deepEqual(rigaBozze(true, { attiva: true, inPausa: false }), { acceso: true, inPausa: false })
  assert.deepEqual(rigaBozze(true, { attiva: true, inPausa: true }), { acceso: true, inPausa: true })
  // spenta da lui: niente pausa da dire
  assert.deepEqual(rigaBozze(true, { attiva: false, inPausa: true }), { acceso: false, inPausa: false })
})
