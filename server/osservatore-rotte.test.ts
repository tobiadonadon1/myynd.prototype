// Le rotte dell'osservatore fuori dall'app: un server vero, acceso senza
// MYYND_APP (come `node server/index.ts` a mano, o un server ospitato), deve
// rispondere 404 { disponibile: false } a tutte e cinque, senza toccare niente.
//
// Il caso ospitato non si accende qui: un server ospitato si mette in ascolto
// su 0.0.0.0, e sul Mac di chi fa girare le prove aprirebbe una porta alla
// rete (e il firewall lo chiederebbe con una finestra). La stessa guardia
// (`disponibile()`) è provata coi due casi forzati in server/osservatore.test.ts.
//
//   node --test server/osservatore-rotte.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-oss-rotte-casa-'))
const DATI = mkdtempSync(join(tmpdir(), 'myynd-oss-rotte-dati-'))
const TOKEN = 'sviluppo-non-in-produzione'

let server: ChildProcess | null = null
let base = ''

async function chiama(metodo: string, percorso: string, corpo?: unknown): Promise<{ stato: number; json: Record<string, unknown> }> {
  const r = await fetch(base + percorso, {
    method: metodo,
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo)
  })
  const testo = await r.text()
  let json: Record<string, unknown> = {}
  try { json = JSON.parse(testo) } catch { /* non JSON */ }
  return { stato: r.status, json }
}

before(async () => {
  const { ANTHROPIC_API_KEY: _a, OPENAI_API_KEY: _o, MYYND_POSTGRES: _p, MYYND_TYPESAFE: _t, RAILWAY_ENVIRONMENT: _r, MYYND_VERSIONE: _v, MYYND_APP: _app, ...ambiente } = process.env
  const s = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.ts'], {
    cwd: new URL('..', import.meta.url).pathname,
    // senza MYYND_APP: come un server acceso a mano; nessuna API vera
    env: { ...ambiente, HOME: CASA, MYYND_DATI: DATI, MYYND_DEV: '1', PORT: '0', ANTHROPIC_BASE_URL: 'http://127.0.0.1:9' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  server = s
  base = await new Promise<string>((risolvi, rifiuta) => {
    let fuori = ''
    const tetto = setTimeout(() => rifiuta(new Error(`il server non è partito:\n${fuori}`)), 20_000)
    s.stdout!.on('data', d => {
      fuori += String(d)
      const m = fuori.match(/server su (http:\/\/127\.0\.0\.1:\d+)/)
      if (m) { clearTimeout(tetto); risolvi(m[1]) }
    })
    s.stderr!.on('data', d => { fuori += String(d) })
    s.on('exit', c => { clearTimeout(tetto); rifiuta(new Error(`il server è uscito (${c}):\n${fuori}`)) })
  })
  // la sessione di sviluppo nasce dopo la password del conto: si bussa finché non apre
  let p = await chiama('GET', '/api/stato')
  for (let i = 0; p.stato === 401 && i < 100; i++) {
    await new Promise(r => setTimeout(r, 100))
    p = await chiama('GET', '/api/stato')
  }
  assert.equal(p.stato, 200, JSON.stringify(p.json))
})

after(async () => {
  const s = server
  server = null
  if (s && s.exitCode === null) await new Promise<void>(r => { s.once('exit', () => r()); s.kill('SIGKILL') })
  rmSync(CASA, { recursive: true, force: true })
  rmSync(DATI, { recursive: true, force: true })
})

test('senza MYYND_APP tutte e cinque le rotte dell’osservatore rispondono 404 { disponibile: false }', async () => {
  const rotte: [string, string, unknown?][] = [
    ['GET', '/api/osservatore'],
    ['POST', '/api/osservatore', { acceso: true }],
    ['POST', '/api/osservatore/pausa', { minuti: 60 }],
    ['POST', '/api/osservatore/riprendi', {}],
    ['DELETE', '/api/osservatore/osservazioni']
  ]
  for (const [metodo, percorso, corpo] of rotte) {
    const r = await chiama(metodo, percorso, corpo)
    assert.equal(r.stato, 404, `${metodo} ${percorso}`)
    assert.deepEqual(r.json, { disponibile: false }, `${metodo} ${percorso}`)
  }
  // e il gemello risponde lo stesso: la pagina «Come lavori» non dipende dall'osservatore
  const g = await chiama('GET', '/api/gemello')
  assert.equal(g.stato, 200)
  assert.deepEqual(g.json.abitudini, [])
})
