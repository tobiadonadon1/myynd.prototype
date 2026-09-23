// «Pronto» è l'ultima risposta certa di Claude Code, non la sua presenza sul disco.
//
// Un «no» detto da `claude auth status` spegne la strada dell'account; un
// silenzio o una risposta storta non cambiano quello che si sapeva; e prima
// della prima risposta vale quello di sempre: scelto e installato basta.
//
//   node --test server/abbonamento-pronto.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { syncBuiltinESMExports } from 'node:module'
import fs from 'node:fs'
import childProcess from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('un «no» certo spegne l’account, un silenzio no, e il «sì» lo riaccende', async t => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'myynd-pronto-'))
  process.env.MYYND_DATI = dir
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const esiste = fs.existsSync
  t.mock.method(fs, 'existsSync', (p: fs.PathLike) => String(p).endsWith('/claude') || esiste(p))
  let risposta = '{"loggedIn":false}'
  t.mock.method(childProcess, 'spawn', () => {
    const p = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill() { return true } })
    const r = risposta
    setImmediate(() => { p.stdout.emit('data', r); p.emit('close', 0) })
    return p
  })
  let ora = Date.now()
  t.mock.method(Date, 'now', () => ora)
  syncBuiltinESMExports()
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports() })

  const cfg = await import('./config.ts')
  const a = await import('./abbonamento.ts')
  cfg.scrivi({ claudeCon: 'abbonamento', abbonamento: { attivo: true } } as never)

  const cambi: number[] = []
  a.quandoCambia(() => cambi.push(ora))

  assert.equal(a.pronto(), true, 'prima di sapere, vale quello di sempre: scelto e installato')
  assert.equal(await a.entrato(), false)
  assert.equal(a.pronto(), false, 'Claude Code ha detto «non sei entrato» e la strada resta accesa')
  assert.equal(cambi.length, 1, 'la pagina va avvisata: la tessera e la prima pagina devono spegnersi')

  // una risposta storta, mezzo minuto dopo: non è un «sì»
  risposta = '{}'
  ora += 30_001
  await a.entrato()
  assert.equal(a.pronto(), false, 'un silenzio ha riacceso una strada da cui si è usciti')

  risposta = '{"loggedIn":true}'
  ora += 30_001
  assert.equal(await a.entrato(), true)
  assert.equal(a.pronto(), true)
  assert.equal(cambi.length, 2)

  // e un «sì» ripetuto non disturba nessuno
  ora += 30_001
  await a.entrato()
  assert.equal(cambi.length, 2)
})
