// La misura della prova sui dati veri si rifiuta senza una copia (P6).
//
//   node --test server/valuta-prove.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { argomenti, rifiuto } from './valuta-prove.ts'

test('senza --dati, o con la casa vera, si rifiuta; con una copia no', () => {
  assert.match(rifiuto(null) ?? '', /--dati/)
  assert.match(rifiuto('/casa/finta/.myynd', '/casa/finta') ?? '', /copia/)
  assert.match(rifiuto('/casa/finta/.myynd/utenti/x', '/casa/finta') ?? '', /copia/)
  const copia = mkdtempSync(join(tmpdir(), 'myynd-copia-'))
  try { assert.equal(rifiuto(copia, '/casa/finta'), null) } finally { rmSync(copia, { recursive: true, force: true }) }
  assert.deepEqual(argomenti(['--dati', '/x', '--ricette', 'a, b']), { dati: '/x', ricette: ['a', 'b'], utente: null })
})
