// La lingua scelta creando il conto è quella del conto, provata dalla rotta vera.
//
// Un conto nuovo nasceva in inglese: chi faceva tutto il primo avvio in
// italiano entrava in un'app inglese, perché l'app applica la lingua del
// server appena entra, e la schermata dell'accesso non la mandava.
//
//   node --test server/registrazione-lingua.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-registra-casa-'))
const DATI = mkdtempSync(join(tmpdir(), 'myynd-registra-dati-'))
let server: ChildProcess
let base = ''

before(async () => {
  // l'ambiente di chi fa girare le prove resta fuori: niente chiavi, niente posta vera
  const { ANTHROPIC_API_KEY: _a, OPENAI_API_KEY: _o, MYYND_POSTGRES: _p, MYYND_TYPESAFE: _t, RAILWAY_ENVIRONMENT: _r,
    MYYND_SMTP_HOST: _s, MYYND_REGISTRAZIONE: _g, MYYND_DEV: _d, ...ambiente } = process.env
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.ts'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...ambiente, HOME: CASA, MYYND_DATI: DATI, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  base = await new Promise<string>((risolvi, rifiuta) => {
    let fuori = ''
    const tetto = setTimeout(() => rifiuta(new Error(`il server non è partito:\n${fuori}`)), 20_000)
    server.stdout!.on('data', d => {
      fuori += String(d)
      const m = fuori.match(/server su (http:\/\/127\.0\.0\.1:\d+)/)
      if (m) { clearTimeout(tetto); risolvi(m[1]) }
    })
    server.stderr!.on('data', d => { fuori += String(d) })
    server.on('exit', c => { clearTimeout(tetto); rifiuta(new Error(`il server è uscito (${c}):\n${fuori}`)) })
  })
})

after(() => {
  server?.kill('SIGKILL')
  rmSync(CASA, { recursive: true, force: true })
  rmSync(DATI, { recursive: true, force: true })
})

async function registra(corpo: Record<string, string>) {
  const r = await fetch(base + '/api/auth/registra', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) })
  const json = await r.json() as { token?: string; errore?: string }
  assert.equal(r.status, 200, JSON.stringify(json))
  assert.ok(json.token, 'no verification here: the new account is signed in')
  const s = await fetch(base + '/api/stato', { headers: { authorization: `Bearer ${json.token}` } })
  return (await s.json() as { config: { lingua: string; nome: string | null } }).config
}

test('an account created in Italian is an Italian account', async () => {
  const c = await registra({ email: 'luca@esempio.invalid', password: 'una-password-lunga-1', nome: 'Luca', lingua: 'it' })
  assert.equal(c.lingua, 'it')
  assert.equal(c.nome, 'Luca', 'the name still travels with it')
})

test('without a language, or with one the app does not know, the default stays', async () => {
  assert.equal((await registra({ email: 'anna@esempio.invalid', password: 'una-password-lunga-2' })).lingua, 'en')
  assert.equal((await registra({ email: 'marie@esempio.invalid', password: 'une-longue-phrase-3', lingua: 'fr' })).lingua, 'en')
})
