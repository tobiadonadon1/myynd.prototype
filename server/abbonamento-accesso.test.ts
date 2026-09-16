import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { syncBuiltinESMExports } from 'node:module'
import fs from 'node:fs'
import childProcess from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('a cold unknown credential check retries without asking for login; concurrent requests share one probe', async t => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'myynd-auth-check-'))
  process.env.MYYND_DATI = dir
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const exists = fs.existsSync
  t.mock.method(fs, 'existsSync', (path: fs.PathLike) => String(path).endsWith('/claude') || exists(path))
  let checks = 0
  let answer = '{}'
  t.mock.method(childProcess, 'spawn', () => {
    checks++
    const p = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill() { return true } })
    const result = answer
    if (result !== '<timeout>') setImmediate(() => { p.stdout.emit('data', result); p.emit('close', 0) })
    return p
  })
  let now = Date.now()
  t.mock.method(Date, 'now', () => now)
  syncBuiltinESMExports()
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports() })
  const a = await import('./abbonamento.ts')
  const first = await Promise.all([a.stato(), a.stato(), a.stato()])
  assert.equal(checks, 1)
  assert.ok(first.every(s => s.verificaInSospeso && !s.entrato))
  answer = '{"loggedIn":true}'
  now += 5_001
  const recovered = await a.stato()
  assert.equal(checks, 2)
  assert.equal(recovered.entrato, true)
  assert.equal(recovered.verificaInSospeso, false)
  // A slow native process is uncertainty, not an instruction to reconnect.
  answer = '<timeout>'
  now += 30_001
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const waiting = a.stato()
  t.mock.timers.tick(15_000)
  const timedOut = await waiting
  t.mock.timers.reset()
  assert.equal(timedOut.entrato, true)
  assert.equal(timedOut.verificaInSospeso, true)
  // A malformed response must not be treated as an explicit logout.
  answer = '{}'
  now += 30_001
  const uncertain = await a.stato()
  assert.equal(uncertain.entrato, true)
  assert.equal(uncertain.verificaInSospeso, true)
  answer = '{"loggedIn":false}'
  now += 5_001
  const signedOut = await a.stato()
  assert.equal(signedOut.entrato, false)
  assert.equal(signedOut.verificaInSospeso, false)
})
