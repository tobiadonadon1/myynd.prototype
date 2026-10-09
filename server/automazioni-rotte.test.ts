// Le rotte degli ordini fissi, della prova e del vassoio (P6, E), su un server vero.
//
// Un ordine fisso nasce acceso e gira dal vivo da subito: «Falla girare
// adesso» risponde 200 appena creato, e anche in pausa (il dito è il suo
// consenso). Prima di crearlo si guarda il mese prima; le quattro di partenza
// si accendono una per una.
//
//   node --test server/automazioni-rotte.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-rotte-p6-casa-'))
const DATI = mkdtempSync(join(tmpdir(), 'myynd-rotte-p6-dati-'))
const STATO_CLAUDE = join(CASA, '.fc')
const TOKEN = 'sviluppo-non-in-produzione'

const FINTO_CLAUDE = `#!/bin/sh
if [ "$1" = "auth" ] && [ "$2" = "status" ]; then echo '{"loggedIn":false}'; exit 0; fi
cat > /dev/null
exit 1
`

let anthropic: Server
let fintoUrl = ''
let server: ChildProcess
let base = ''

before(async () => {
  mkdirSync(join(CASA, '.local', 'bin'), { recursive: true })
  mkdirSync(STATO_CLAUDE, { recursive: true })
  writeFileSync(join(CASA, '.local', 'bin', 'claude'), FINTO_CLAUDE)
  chmodSync(join(CASA, '.local', 'bin', 'claude'), 0o755)

  anthropic = createServer((req, res) => {
    req.resume()
    req.on('end', () => {
      res.setHeader('content-type', 'application/json')
      if (req.url?.includes('/compat/')) {
        if (req.url.endsWith('/models')) return res.end(JSON.stringify({ data: [{ id: 'finto-locale' }] }))
        return res.end(JSON.stringify({ id: 'c1', object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }))
      }
      res.end(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5', content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }))
    })
  })
  await new Promise<void>(r => anthropic.listen(0, '127.0.0.1', r))
  const a = anthropic.address()
  fintoUrl = `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}`

  // l'ambiente di chi fa girare le prove resta fuori: niente chiavi vere
  const { ANTHROPIC_API_KEY: _a, OPENAI_API_KEY: _o, MYYND_POSTGRES: _p, MYYND_TYPESAFE: _t, RAILWAY_ENVIRONMENT: _r, ...ambiente } = process.env
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.ts'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...ambiente, HOME: CASA, MYYND_DATI: DATI, MYYND_DEV: '1', PORT: '0', ANTHROPIC_BASE_URL: fintoUrl },
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
  // la sessione di sviluppo nasce dopo la password del conto, che si calcola
  // con calma: si bussa finché non apre
  let p = await chiama('POST', '/api/profilo', { onboarding: true, giro: true, lingua: 'en', nome: 'Prova' })
  for (let i = 0; p.stato === 401 && i < 100; i++) {
    await new Promise(r => setTimeout(r, 100))
    p = await chiama('POST', '/api/profilo', { onboarding: true, giro: true, lingua: 'en', nome: 'Prova' })
  }
  assert.equal(p.stato, 200, JSON.stringify(p.json))
})

after(async () => {
  server?.kill('SIGKILL')
  await new Promise<void>(r => anthropic?.close(() => r()))
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


test('un ordine fisso nasce acceso e «Falla girare adesso» va subito, anche in pausa', async () => {
  const ricetta = { nome: 'Quote follow-ups', fai: 'Draft a follow-up for each quote.', cerca: 'quote', quando: { ogni: 'feriali', ora: 9 } }
  // prima di crearlo, il mese prima: sola lettura, e la ricetta non c'è ancora
  const mese = await chiama('POST', '/api/automazioni/mese', { ricetta })
  assert.equal(mese.stato, 200, JSON.stringify(mese.json))
  assert.equal(mese.json.cose, 0)
  assert.ok(mese.json.volte >= 20, `nei giorni feriali di un mese gira una ventina di volte, non ${mese.json.volte}`)
  assert.equal((await chiama('GET', '/api/automazioni')).json.automazioni.length, 0, 'guardare il mese prima ha scritto la ricetta')
  assert.equal((await chiama('POST', '/api/automazioni/mese', { ricetta: { nome: 'x' } })).stato, 400)

  const nuova = await chiama('POST', '/api/automazioni/nuova', ricetta)
  assert.equal(nuova.stato, 200, JSON.stringify(nuova.json))
  const id = nuova.json.id as string
  const scheda = (nuova.json.automazioni as { id: string; accesa: boolean; quando: unknown }[]).find(a => a.id === id)!
  assert.equal(scheda.accesa, true, 'una nuova nasce accesa, dal vivo')
  assert.deepEqual(scheda.quando, { ogni: 'feriali', ora: 9 })
  const ora = await chiama('POST', `/api/automazioni/${id}/adesso`)
  assert.equal(ora.stato, 200, JSON.stringify(ora.json))
  assert.equal((await chiama('GET', `/api/automazioni/${id}/mese`)).stato, 200)

  await chiama('POST', `/api/automazioni/${id}/accendi`, { accesa: false })
  const inPausa = await chiama('POST', `/api/automazioni/${id}/adesso`)
  assert.equal(inPausa.stato, 200, JSON.stringify(inPausa.json))
  assert.equal((await chiama('POST', `/api/automazioni/${id}/dalvivo`)).stato, 404, 'la rotta del vassoio è sparita')
  await chiama('DELETE', `/api/automazioni/${id}`)
})

test('le quattro di partenza: un interruttore ciascuna', async () => {
  const p = await chiama('GET', '/api/automazioni/pacchetto')
  assert.equal(p.stato, 200)
  const ids = (p.json.pacchetto as { id: string; accesa: boolean }[]).map(x => x.id)
  assert.deepEqual([...ids].sort(), ['coordinate-cambiate', 'rinnovi-in-scadenza', 'risposte-da-dare', 'sollecito-preventivi'])
  assert.ok((p.json.pacchetto as { accesa: boolean }[]).every(x => !x.accesa))

  const su = await chiama('POST', '/api/automazioni/pacchetto/rinnovi-in-scadenza', { accesa: true })
  assert.equal(su.stato, 200, JSON.stringify(su.json))
  assert.equal((su.json.pacchetto as { id: string; accesa: boolean }[]).find(x => x.id === 'rinnovi-in-scadenza')?.accesa, true)
  const presa = (su.json.automazioni as { id: string; accesa: boolean; mia: boolean; quando: { ogni: string } }[]).find(x => x.id === 'rinnovi-in-scadenza')!
  assert.ok(presa.accesa && presa.mia, 'accesa e sua: si può cambiare e buttare')
  assert.equal(presa.quando.ogni, 'mese', 'dice «il primo del mese» e gira il primo del mese')

  const giu = await chiama('POST', '/api/automazioni/pacchetto/rinnovi-in-scadenza', { accesa: false })
  assert.equal((giu.json.automazioni as { id: string; accesa: boolean }[]).find(x => x.id === 'rinnovi-in-scadenza')?.accesa, false)
  assert.equal((await chiama('POST', '/api/automazioni/pacchetto/posta-di-massa', { accesa: true })).stato, 400)
  assert.ok(Array.isArray((await chiama('GET', '/api/stato')).json.automazioniInGuaio))
})

test('le rotte della prova e del vassoio rispondono', async () => {
  assert.deepEqual((await chiama('GET', '/api/vassoio')).json, { gruppi: [] })
  assert.equal((await chiama('POST', '/api/vassoio/visto')).stato, 200)
  assert.equal((await chiama('GET', '/api/prove/nessuna')).stato, 404)
  assert.equal((await chiama('POST', '/api/prove/esiti/nessuno/giudizio', { suo: 'giusto' })).stato, 404)
  const s = await chiama('GET', '/api/stato')
  assert.equal(s.json.vassoioNuovi, 0)
  const m = await chiama('GET', '/api/collaudo/misura')
  assert.equal(m.stato, 200)
  assert.ok(Array.isArray(m.json.automazioni))
  // senza modello la prova non parte, e lo dice
  const nuova = await chiama('POST', '/api/automazioni/nuova', { nome: 'Invoices arriving', fai: 'Collect the invoices that arrive.', cerca: 'invoice' })
  const p = await chiama('POST', `/api/automazioni/${nuova.json.id}/prova`)
  assert.equal(p.stato, 200)
  assert.equal(p.json.prova.stato, 'senza modello')
})
