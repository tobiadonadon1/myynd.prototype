// Scaldare il modello di questo Mac (P10): solo su questo Mac, un token, mai negli usi.
//
//   node --import ./build/test-profile.mjs --test server/scalda.test.ts

import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

delete process.env.ANTHROPIC_API_KEY
const cfg = await import('./config.ts')
const store = await import('./store.ts')
const compatibile = await import('./compatibile.ts')
const scalda = await import('./scalda.ts')

type Arrivata = { percorso: string; corpo: Record<string, unknown> }
let arrivate: Arrivata[] = []
let ollama = false
let trattieni = false
let chiuse = 0
let server: Server
let porta = 0

before(async () => {
  server = createServer((req, res) => {
    let s = ''
    req.on('data', d => { s += d })
    req.on('end', () => {
      const percorso = (req.url ?? '').split('?')[0]
      if (percorso === '/api/tags') {
        if (!ollama) { res.writeHead(404); return res.end('{}') }
        res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"models":[]}')
      }
      arrivate.push({ percorso, corpo: s ? JSON.parse(s) : {} })
      const rispondi = () => {
        if (res.writableEnded) return
        res.writeHead(200, { 'content-type': 'application/json' })
        if (percorso === '/api/chat') return res.end(JSON.stringify({ model: 'finto', message: { role: 'assistant', content: '.' }, done: true, prompt_eval_count: 1, eval_count: 1 }))
        res.end(JSON.stringify({ id: 'x', model: 'finto', choices: [{ index: 0, message: { role: 'assistant', content: '.' }, finish_reason: 'length' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }))
      }
      req.socket.on('close', () => { chiuse++ })
      if (trattieni) return
      rispondi()
    })
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  porta = (server.address() as AddressInfo).port
})
after(async () => {
  server.closeAllConnections()
  await new Promise(r => server.close(r))
  store.chiudiIndici()
})
beforeEach(() => {
  arrivate = []; ollama = false; trattieni = false; chiuse = 0
  scalda.perProva({ ospitato: false })
  compatibile.scordaOllama()
  store.default.exec('DELETE FROM uso')
})
const aspetta = (ms: number) => new Promise(r => setTimeout(r, ms))
const suQuestoMac = () => cfg.scrivi({ lingua: 'en', motore: 'compatibile', compatibile: { url: `http://127.0.0.1:${porta}/v1/`, chiave: 'sk-finta', modello: 'finto' } })

test('solo un indirizzo di questo Mac', () => {
  for (const u of ['http://localhost:11434', 'http://127.0.0.1:1234/v1', 'http://[::1]:11434', 'http://ollama.localhost:11434'])
    assert.equal(scalda.sulQuestoMac(u), true, u)
  for (const u of ['http://192.168.1.5:11434', 'http://10.0.0.2:11434', 'https://openrouter.ai/api/v1', 'http://localhost.example.com', 'non è un indirizzo'])
    assert.equal(scalda.sulQuestoMac(u), false, u)
})

test('con la chiave di Claude non si scalda niente', async () => {
  cfg.scrivi({ lingua: 'en', claude: { apiKey: 'sk-ant-finta' } })
  assert.deepEqual(scalda.scalda(), { avviato: false, perche: 'motore' })
  await aspetta(30)
  assert.equal(arrivate.length, 0)
})

test('un fornitore in rete non si scalda', () => {
  cfg.scrivi({ lingua: 'en', motore: 'compatibile', compatibile: { url: 'http://192.168.1.5:11434/v1/', chiave: 'x', modello: 'finto' } })
  assert.deepEqual(scalda.scalda(), { avviato: false, perche: 'lontano' })
  assert.deepEqual((scalda.perProva({ ospitato: true }), scalda.scalda()), { avviato: false, perche: 'ospitato' })
})

test('sul Mac: una richiesta sola da un token, niente negli usi, e la seconda entro cinque minuti è presto', async () => {
  suQuestoMac()
  assert.deepEqual(scalda.scalda(), { avviato: true })
  await aspetta(80)
  assert.equal(arrivate.length, 1)
  assert.equal(arrivate[0].percorso, '/v1/chat/completions')
  const c = arrivate[0].corpo
  assert.equal(c.max_tokens ?? c.max_completion_tokens, 1)
  assert.equal((store.default.prepare('SELECT COUNT(*) AS n FROM uso').get() as { n: number }).n, 0, 'lo scaldare non si scrive fra gli usi')
  assert.deepEqual(scalda.scalda(), { avviato: false, perche: 'presto' })
  await aspetta(30)
  assert.equal(arrivate.length, 1)
})

test('con Ollama: num_predict 1 e la stessa finestra della chat', async () => {
  ollama = true
  suQuestoMac()
  assert.equal(scalda.scalda().avviato, true)
  await aspetta(80)
  const chat = arrivate.find(a => a.percorso === '/api/chat')
  assert.ok(chat, JSON.stringify(arrivate.map(a => a.percorso)))
  const o = chat!.corpo.options as { num_predict?: number; num_ctx?: number }
  assert.equal(o.num_predict, 1)
  assert.equal(o.num_ctx, compatibile.CTX_FISSO)
  assert.equal(o.num_ctx, 16384)
})

test('la domanda vera ferma lo scaldare che sta aspettando', async () => {
  trattieni = true
  suQuestoMac()
  assert.equal(scalda.scalda().avviato, true)
  await aspetta(60)
  assert.equal(arrivate.length, 1)
  scalda.ferma()
  await aspetta(60)
  assert.ok(chiuse >= 1, 'la richiesta trattenuta non è stata chiusa')
})
