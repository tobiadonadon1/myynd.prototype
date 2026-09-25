// La prima pagina che parte da `GET /api/avvio/pagina` (P4), sul server vero.
//
// Chi legge le fonti senza un modello non ha una prima pagina, e la riga non
// promette niente. Appena collega un modello, la prossima domanda della
// pagina la fa partire: lavora, e poi è pronta. Nessun «Leggi» da ripremere.
//
//   node --test server/prima-pagina-rotta.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-pagina-casa-'))
const DATI = mkdtempSync(join(tmpdir(), 'myynd-pagina-dati-'))
const TOKEN = 'sviluppo-non-in-produzione'
const CARTELLA = join(CASA, 'Lavoro')

// — il modello finto: conta le richieste, e sa trattenerle —
let richieste = 0
let trattieni = false
let inAttesa: (() => void)[] = []
const lascia = () => { trattieni = false; const x = inAttesa; inAttesa = []; for (const f of x) f() }
const risposta = (res: ServerResponse) => {
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify({ id: 'c1', object: 'chat.completion', model: 'finto', choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify({ voci: [] }) }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }))
}

let finto: Server
let fintoUrl = ''
let server: ChildProcess
let base = ''
let registro = ''

before(async () => {
  mkdirSync(CARTELLA, { recursive: true })
  for (let i = 0; i < 4; i++) writeFileSync(join(CARTELLA, `appunti-${i}.md`), `Appunti ${i} sul sito nuovo: la pagina iniziale va scritta entro venerdì, con le foto del team.`)
  finto = createServer((req, res) => {
    req.resume()
    req.on('end', () => {
      if (req.url?.endsWith('/models')) { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ data: [{ id: 'finto' }] })) }
      if (req.url?.includes('/chat/completions')) {
        richieste++
        if (trattieni) { inAttesa.push(() => risposta(res)); return }
        return risposta(res)
      }
      res.statusCode = 404; res.end('{}')
    })
  })
  await new Promise<void>(r => finto.listen(0, '127.0.0.1', r))
  const a = finto.address()
  fintoUrl = `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}`
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.ts'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { PATH: process.env.PATH ?? '', HOME: CASA, MYYND_DATI: DATI, MYYND_DEV: '1', PORT: '0', NODE_ENV: 'test', MYYND_SENZA_APP_MAC: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  base = await new Promise<string>((risolvi, rifiuta) => {
    const tetto = setTimeout(() => rifiuta(new Error(`il server non è partito:\n${registro}`)), 20_000)
    server.stdout!.on('data', d => {
      registro += String(d)
      const m = registro.match(/server su (http:\/\/127\.0\.0\.1:\d+)/)
      if (m) { clearTimeout(tetto); risolvi(m[1]!) }
    })
    server.stderr!.on('data', d => { registro += String(d) })
    server.on('exit', c => { clearTimeout(tetto); rifiuta(new Error(`il server è uscito (${c}):\n${registro}`)) })
  })
  let p = await chiama('POST', '/api/profilo', { onboarding: true, giro: true, lingua: 'en', nome: 'Prova' })
  for (let i = 0; p.stato === 401 && i < 100; i++) {
    await new Promise(r => setTimeout(r, 100))
    p = await chiama('POST', '/api/profilo', { onboarding: true, giro: true, lingua: 'en', nome: 'Prova' })
  }
  assert.equal(p.stato, 200, JSON.stringify(p.json))
})

after(async () => {
  lascia()
  server?.kill('SIGKILL')
  await new Promise<void>(r => finto?.close(() => r()))
  rmSync(CASA, { recursive: true, force: true })
  rmSync(DATI, { recursive: true, force: true })
})

async function chiama(metodo: string, percorso: string, corpo?: unknown): Promise<{ stato: number; json: Record<string, any> }> {
  const r = await fetch(base + percorso, {
    method: metodo,
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) })
  })
  return { stato: r.status, json: await r.json().catch(() => ({})) as Record<string, any> }
}
const aspettaChe = async (f: () => Promise<boolean>, ms = 15_000) => {
  const fine = Date.now() + ms
  while (Date.now() < fine) { if (await f()) return; await new Promise(r => setTimeout(r, 100)) }
  throw new Error(`la condizione non si è mai avverata:\n${registro.slice(-1500)}`)
}

test('senza modello nessuna pagina; collegato il modello, la domanda della pagina la fa partire, e diventa pronta', async () => {
  assert.equal((await chiama('POST', '/api/connettori/desktop', { cartelle: [CARTELLA] })).stato, 200)
  // la lettura intera, fino in fondo
  const r = await fetch(`${base}/api/sincronizza`, { headers: { authorization: `Bearer ${TOKEN}` } })
  assert.equal(r.status, 200)
  const testo = await r.text()
  assert.match(testo, /"fase":"fine"/)
  await aspettaChe(async () => (await chiama('GET', '/api/avvio/pagina')).json.lettura === null)
  // nessun modello: la riga non promette niente, e nessuno ha chiamato un modello (counter-case)
  const senza = await chiama('GET', '/api/avvio/pagina')
  assert.equal(senza.json.pagina, 'senza-motore')
  assert.ok(senza.json.trovato.file >= 4)
  assert.equal(richieste, 0)

  assert.equal((await chiama('POST', '/api/connettori/compatibile', { url: `${fintoUrl}/v1`, modello: 'finto', chiave: 'sk-finta' })).stato, 200)
  const prima = richieste
  trattieni = true
  // la prima domanda dopo il modello fa partire la pagina, senza un altro «Leggi»
  const dopo = await chiama('GET', '/api/avvio/pagina')
  assert.equal(dopo.json.pagina, 'lavoro')
  await aspettaChe(async () => richieste > prima)
  // mentre lavora tiene la serratura: una lettura aspetta il suo turno
  assert.equal((await chiama('GET', '/api/avvio/pagina')).json.pagina, 'lavoro')
  const una = await fetch(`${base}/api/sincronizza?fonte=desktop`, { headers: { authorization: `Bearer ${TOKEN}` } })
  assert.equal(una.status, 409)
  await una.body?.cancel()
  lascia()
  await aspettaChe(async () => (await chiama('GET', '/api/avvio/pagina')).json.pagina === 'pronta', 20_000)
  assert.match(registro, /prima pagina · pronta in \d+ ms/)
})
