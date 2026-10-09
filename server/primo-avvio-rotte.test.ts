// Il primo avvio, dalle rotte vere: per chi è Myynd, e la password dimenticata sul Mac.
//
// Un server vero in una casa finta, con il segreto del guscio nell'ambiente
// come lo passa `desktop/server.ts`. Le prove dei moduli dicono che le righe
// ci sono; queste dicono che cosa risponde il server a una pagina.
//
//   node --test server/primo-avvio-rotte.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-primo-casa-'))
const DATI = mkdtempSync(join(tmpdir(), 'myynd-primo-dati-'))
const TOKEN = 'sviluppo-non-in-produzione'
const SEGRETO = 'c3'.repeat(32)
let server: ChildProcess
let base = ''

before(async () => {
  const { ANTHROPIC_API_KEY: _a, OPENAI_API_KEY: _o, MYYND_POSTGRES: _p, MYYND_TYPESAFE: _t, RAILWAY_ENVIRONMENT: _r, MYYND_SMTP_HOST: _s, ...ambiente } = process.env
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.ts'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...ambiente, HOME: CASA, MYYND_DATI: DATI, MYYND_DEV: '1', PORT: '0', MYYND_GUSCIO_SEGRETO: SEGRETO },
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
  let p = await chiama('GET', '/api/stato')
  for (let i = 0; p.stato === 401 && i < 100; i++) {
    await new Promise(r => setTimeout(r, 100))
    p = await chiama('GET', '/api/stato')
  }
  assert.equal(p.stato, 200, JSON.stringify(p.json))
})

after(() => {
  server?.kill('SIGKILL')
  rmSync(CASA, { recursive: true, force: true })
  rmSync(DATI, { recursive: true, force: true })
})

async function chiama(metodo: string, percorso: string, corpo?: unknown, intestazioni: Record<string, string> = { authorization: `Bearer ${TOKEN}` }) {
  const r = await fetch(base + percorso, {
    method: metodo,
    headers: { ...intestazioni, 'content-type': 'application/json' },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) })
  })
  return { stato: r.status, json: await r.json().catch(() => ({})) as Record<string, any> }
}

test('who Myynd is for: unknown until said, then persona or azienda, and nothing else', async () => {
  assert.equal((await chiama('GET', '/api/stato')).json.config.pubblico, null)
  assert.equal((await chiama('POST', '/api/profilo', { pubblico: 'azienda' })).stato, 200)
  assert.equal((await chiama('GET', '/api/stato')).json.config.pubblico, 'azienda')
  assert.equal((await chiama('POST', '/api/profilo', { pubblico: 'team' })).stato, 400)
  assert.equal((await chiama('POST', '/api/profilo', { pubblico: 'persona' })).stato, 200)
  assert.equal((await chiama('GET', '/api/stato')).json.config.pubblico, 'persona')
})

test('reading the onboarding page says what was found, with no discovery before there is a project', async () => {
  const p = await chiama('GET', '/api/avvio/pagina')
  assert.equal(p.stato, 200)
  assert.equal(p.json.scoperta ?? null, null)
})

// per ultima: rimettere la password chiude tutte le sessioni, anche quella delle prove
test('the Mac reset route: a page without the shell secret gets 403, the shell gets a new session', async () => {
  const conto = (await chiama('GET', '/api/auth')).json
  const email = conto.account?.email ?? 'sviluppo@myynd.local'
  const senza = await chiama('POST', '/api/auth/reimposta/mac', { email, password: 'nuovapassword1' }, {})
  assert.equal(senza.stato, 403)
  const sbagliato = await chiama('POST', '/api/auth/reimposta/mac', { email, password: 'nuovapassword1' }, { 'x-myynd-guscio': 'd4'.repeat(32) })
  assert.equal(sbagliato.stato, 403)
  const giusto = await chiama('POST', '/api/auth/reimposta/mac', { email, password: 'nuovapassword1' }, { 'x-myynd-guscio': SEGRETO })
  assert.equal(giusto.stato, 200, JSON.stringify(giusto.json))
  assert.ok(giusto.json.token)
  assert.equal(giusto.json.account.email, email)
  const entra = await chiama('POST', '/api/auth/entra', { email, password: 'nuovapassword1' }, {})
  assert.equal(entra.stato, 200)
})
