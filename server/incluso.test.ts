// L'AI inclusa con Myynd (F8): il ponte, la dose del piano, e un 429 che è il tetto.
//
// Tre cose da non sbagliare mai. Senza ponte e gettone l'AI inclusa non c'è,
// e nessuno dice «in uso». La dose del piano vince su un tetto suo più alto,
// e non si alza dalle preferenze. Un 429 `budget_exhausted` del ponte è un
// errore del tetto: niente ritentativo, niente chiave di riserva. E il ponte
// risponde 503 finché la chiave aziendale non c'è, 401 senza una sessione,
// 429 a dose finita, e inoltra ad Anthropic con la chiave sua, non con il
// gettone di chi chiede.
//
//   node --test server/incluso.test.ts

import { test, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import express from 'express'
import type Anthropic from '@anthropic-ai/sdk'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-incluso-'))
process.env.MYYND_DATI = join(CASA, 'dati')
delete process.env.ANTHROPIC_API_KEY
delete process.env.MYYND_INCLUSO_URL
delete process.env.MYYND_INCLUSO_TETTO

const cfg = await import('./config.ts')
const store = await import('./store.ts')
const mod = await import('./modello.ts')
const tetto = await import('./tetto.ts')
const incluso = await import('./incluso.ts')

after(() => { store.chiudiIndici(); rmSync(CASA, { recursive: true, force: true }) })
afterEach(() => { delete process.env.MYYND_INCLUSO_URL; delete process.env.MYYND_INCLUSO_TETTO })

/** Un server su questa macchina, con il suo indirizzo. */
function suUnaPorta(fai: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void): Promise<{ s: Server; url: string }> {
  return new Promise(ok => { const s = createServer(fai); s.listen(0, '127.0.0.1', () => ok({ s, url: `http://127.0.0.1:${(s.address() as { port: number }).port}` })) })
}

test('senza indirizzo del ponte e gettone l’AI inclusa non c’è', () => {
  cfg.scrivi({ lingua: 'en', motore: 'incluso', incluso: { token: 'gettone-di-prova' } })
  assert.equal(mod.fornitoreIncluso(), null, 'un gettone senza ponte non basta')
  process.env.MYYND_INCLUSO_URL = 'https://ponte.example.test/'
  cfg.scrivi({ lingua: 'en', motore: 'incluso' }, { togli: ['incluso'] })
  assert.equal(mod.fornitoreIncluso(), null, 'un ponte senza gettone non basta')
  assert.equal(mod.collegato(), false)
  cfg.scrivi({ lingua: 'en', motore: 'incluso', incluso: { token: 'gettone-di-prova' } })
  assert.deepEqual(mod.fornitoreIncluso(), { baseURL: 'https://ponte.example.test/api/incluso', chiave: 'gettone-di-prova' })
  assert.equal(mod.inclusoInUso(), true)
  assert.equal(mod.collegato(), true)
  assert.equal(mod.testaAlLavoro(), 'claude')
})

test('la dose del piano vince su un tetto suo più alto, e un tetto suo più basso resta suo', () => {
  cfg.scrivi({ lingua: 'en', motore: 'incluso', tetto: 999_999 })
  assert.equal(tetto.tetto(), tetto.TETTO_DEL_PIANO)
  process.env.MYYND_INCLUSO_TETTO = '5000'
  assert.equal(tetto.tetto(), 5000)
  cfg.scrivi({ lingua: 'en', motore: 'incluso', tetto: 1000 })
  assert.equal(tetto.tetto(), 1000)
  // senza l'AI inclusa il piano non c'entra
  cfg.scrivi({ lingua: 'en', motore: 'claude', tetto: 999_999 })
  assert.equal(tetto.tetto(), 999_999)
})

test('la dose del piano finita dice «domani», non «alzalo nelle preferenze»', () => {
  store.segnaUso({ lavoro: 'bozza', motore: 'prova', entrata: 60, cache: 0, uscita: 60 })
  process.env.MYYND_INCLUSO_TETTO = '100'
  cfg.scrivi({ lingua: 'en', motore: 'incluso', tetto: 0 })
  assert.throws(() => tetto.controllaIlTetto(), e => tetto.delTetto(e) && (e as Error).message === tetto.INCLUSO_FINITO)
  cfg.scrivi({ lingua: 'en', motore: 'claude', tetto: 100 })
  assert.throws(() => tetto.controllaIlTetto(), e => tetto.delTetto(e) && (e as Error).message === tetto.TETTO_RAGGIUNTO)
  cfg.scrivi({ lingua: 'en', motore: 'claude', tetto: 0 })
})

test('un 429 `budget_exhausted` del ponte è un errore del tetto: una richiesta sola, niente chiave di riserva', async () => {
  let richieste = 0
  const { s, url } = await suUnaPorta((req, res) => {
    richieste++
    assert.equal(req.url, '/api/incluso/v1/messages')
    assert.equal(req.headers['x-api-key'], 'gettone-di-prova')
    res.writeHead(429, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ type: 'error', error: { type: 'budget_exhausted', message: 'Today’s included AI allowance is used up.' } }))
  })
  try {
    process.env.MYYND_INCLUSO_URL = url
    // una chiave sua c'è: non deve servire a scavalcare la dose
    cfg.scrivi({ lingua: 'en', motore: 'incluso', tetto: 0, incluso: { token: 'gettone-di-prova' }, claude: { apiKey: 'sk-ant-mai-usata' } })
    const m = mod.motore()
    assert.ok(m && m.tipo === 'claude')
    const p = { ...mod.parametri('bozza', 1000), system: 'x', messages: [{ role: 'user', content: 'y' }] } as Anthropic.MessageStreamParams
    await assert.rejects(m.flusso(p, () => {}), e => tetto.delTetto(e) && (e as Error).message === tetto.INCLUSO_FINITO)
    assert.equal(richieste, 1, 'nessun ritentativo dell’SDK')
    await assert.rejects(mod.chiedi({ lavoro: 'titolo', system: 'x', messages: [{ role: 'user', content: 'y' }], max_tokens: 50 }), e => tetto.delTetto(e))
    assert.equal(richieste, 2, 'una richiesta, al ponte, e basta')
    // e non è un guaio passeggero da riprovare fra due minuti
    assert.doesNotMatch(tetto.INCLUSO_FINITO, /sotto sforzo|ha un problema in questo momento|[Cc]i ha messo troppo|Non riesco a raggiungere|interrotta a metà|Non ce l.ho fatta/)
  } finally { s.close() }
})

// — il ponte, sul server —

type Segnato = Parameters<typeof incluso.PONTE_VERO.segna>[0]
function ponteFinto(o: { chiave?: string; usati?: number; spesa?: number; rete?: typeof fetch } = {}) {
  const segnati: Segnato[] = []
  const f: typeof incluso.PONTE_VERO = {
    chiave: () => o.chiave,
    utente: async g => g === 'sessione-buona' ? 'utente-1' : null,
    dentro: (_u, fai) => fai(),
    usati: () => o.usati ?? 0,
    tetto: () => 1000,
    spesaDelMese: () => o.spesa ?? 0,
    tettoDelMese: () => 5_000_000,
    segna: u => { segnati.push(u) },
    rete: o.rete ?? (async () => { throw new Error('non doveva uscire') })
  }
  const app = express()
  app.use(express.json())
  app.post('/api/incluso/v1/messages', incluso.ponte(f))
  app.get('/api/incluso/stato', incluso.statoDelPonte(f))
  return { app, segnati }
}
async function accendi(app: express.Express): Promise<{ s: Server; url: string }> {
  return new Promise(ok => { const s = app.listen(0, '127.0.0.1', () => ok({ s, url: `http://127.0.0.1:${(s.address() as { port: number }).port}` })) })
}
const corpo = JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 100, messages: [{ role: 'user', content: 'hi' }] })
const manda = (url: string, gettone?: string, b = corpo) => fetch(`${url}/api/incluso/v1/messages`, { method: 'POST', headers: { 'content-type': 'application/json', ...(gettone ? { 'x-api-key': gettone } : {}) }, body: b })

test('il ponte senza la chiave aziendale risponde 503 not_configured, a tutti', async () => {
  const { app } = ponteFinto()
  const { s, url } = await accendi(app)
  try {
    const r = await manda(url, 'sessione-buona')
    assert.equal(r.status, 503)
    assert.equal(((await r.json()) as { error: { type: string } }).error.type, 'not_configured')
    assert.equal((await fetch(`${url}/api/incluso/stato`, { headers: { 'x-api-key': 'sessione-buona' } })).status, 503)
  } finally { s.close() }
})

test('il ponte senza una sessione risponde 401, e a dose finita 429 budget_exhausted senza ritentativi', async () => {
  const { app } = ponteFinto({ chiave: 'sk-ant-aziendale', usati: 1000 })
  const { s, url } = await accendi(app)
  try {
    assert.equal((await manda(url)).status, 401)
    assert.equal((await manda(url, 'sessione-scaduta')).status, 401)
    const r = await manda(url, 'sessione-buona')
    assert.equal(r.status, 429)
    assert.equal(r.headers.get('x-should-retry'), 'false')
    assert.equal(((await r.json()) as { error: { type: string } }).error.type, 'budget_exhausted')
    const st = await fetch(`${url}/api/incluso/stato`, { headers: { authorization: 'Bearer sessione-buona' } })
    assert.deepEqual(await st.json(), { usati: 1000, tetto: 1000 })
  } finally { s.close() }
})

test('il ponte inoltra con la chiave sua, non con il gettone, e segna i token veri; in streaming passa tutto com’è', async () => {
  const chiesti: { url: string; chiave: string | null; corpo: Record<string, unknown> }[] = []
  const rete = (async (u: string | URL | Request, init?: RequestInit) => {
    const h = new Headers(init?.headers)
    const b = JSON.parse(String(init?.body)) as Record<string, unknown>
    chiesti.push({ url: String(u), chiave: h.get('x-api-key'), corpo: b })
    if (b.stream) {
      const sse = 'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":40,"cache_read_input_tokens":300,"output_tokens":1}}}\n\n' +
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}\n\n' +
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":9}}\n\n'
      return new Response(sse, { headers: { 'content-type': 'text/event-stream' } })
    }
    return new Response(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', content: [{ type: 'text', text: 'Hi' }], usage: { input_tokens: 12, cache_creation_input_tokens: 3, output_tokens: 5 } }), { headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  const { app, segnati } = ponteFinto({ chiave: 'sk-ant-aziendale', usati: 10, rete })
  const { s, url } = await accendi(app)
  try {
    const r = await manda(url, 'sessione-buona', JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 999_999, messages: [{ role: 'user', content: 'hi' }] }))
    assert.equal(r.status, 200)
    assert.equal(((await r.json()) as { content: { text: string }[] }).content[0].text, 'Hi')
    assert.equal(chiesti[0].url, incluso.URL_ANTHROPIC)
    assert.equal(chiesti[0].chiave, 'sk-ant-aziendale')
    assert.equal(chiesti[0].corpo.max_tokens, 32_000, 'una risposta sola non passa il tetto del ponte')
    assert.deepEqual(segnati[0], { lavoro: 'incluso', motore: incluso.MOTORE_INCLUSO, entrata: 15, cache: 0, uscita: 5, scritti: 3, modello: 'claude-sonnet-5-5' })

    const flusso = await manda(url, 'sessione-buona', JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 100, stream: true, messages: [{ role: 'user', content: 'hi' }] }))
    assert.match(flusso.headers.get('content-type') ?? '', /event-stream/)
    const testo = await flusso.text()
    assert.match(testo, /text_delta/)
    assert.match(testo, /message_delta/)
    assert.deepEqual(segnati[1], { lavoro: 'incluso', motore: incluso.MOTORE_INCLUSO, entrata: 40, cache: 300, uscita: 9, scritti: 0, modello: 'claude-sonnet-5-5' })
    // una richiesta che non è dei Messaggi non esce
    assert.equal((await manda(url, 'sessione-buona', JSON.stringify({ model: 'gpt-5', messages: [] }))).status, 400)
    assert.equal(chiesti.length, 2)
  } finally { s.close() }
})

test('la salute del ponte: «pronto» solo dopo un 200, «finito» a dose usata, «assente» per tutto il resto', async () => {
  assert.deepEqual(await incluso.salute({ url: '', gettone: 'x' }), { stato: 'assente' })
  assert.deepEqual(await incluso.salute({ url: 'https://ponte.example.test', gettone: '' }), { stato: 'assente' })
  const risposta = (stato: number, corpo: object) => (async () => new Response(JSON.stringify(corpo), { status: stato })) as unknown as typeof fetch
  assert.deepEqual(await incluso.salute({ url: 'https://p.test', gettone: 'g', rete: risposta(200, { usati: 41_000, tetto: 200_000 }) }), { stato: 'pronto', usati: 41_000, tetto: 200_000 })
  assert.deepEqual(await incluso.salute({ url: 'https://p.test', gettone: 'g', rete: risposta(200, { usati: 200_000, tetto: 200_000 }) }), { stato: 'finito', usati: 200_000, tetto: 200_000 })
  assert.deepEqual(await incluso.salute({ url: 'https://p.test', gettone: 'g', rete: risposta(429, {}) }), { stato: 'finito' })
  assert.deepEqual(await incluso.salute({ url: 'https://p.test', gettone: 'g', rete: risposta(503, { error: { type: 'not_configured' } }) }), { stato: 'assente', codice: 503 })
  assert.deepEqual(await incluso.salute({ url: 'https://p.test', gettone: 'g', rete: (async () => { throw new Error('giù') }) as typeof fetch }), { stato: 'assente', codice: 0 })
})

before(() => { cfg.scrivi({ lingua: 'en' }) })

test('il ponte: un modello fuori lista diventa uno permesso, e le richieste in volo si contano prima di finire', async () => {
  let lascia: () => void = () => {}
  const ferma = new Promise<void>(r => { lascia = r })
  const chiesti: string[] = []
  const rete = (async (_u: string | URL | Request, init?: RequestInit) => {
    chiesti.push(String((JSON.parse(String(init?.body)) as { model: string }).model))
    await ferma
    return new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 10, output_tokens: 10 } }), { headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  // tetto 1000: una richiesta prenota quello che manda più fino a 4096 d'uscita
  const { app } = ponteFinto({ chiave: 'sk-ant-aziendale', usati: 0, rete })
  const { s, url } = await accendi(app)
  try {
    const grande = JSON.stringify({ model: 'claude-opus-5', max_tokens: 990, messages: [{ role: 'user', content: 'hi' }] })
    const prima = manda(url, 'sessione-buona', grande)
    // la prima è ancora in volo: la seconda, insieme, non ci sta più
    await new Promise(r => setTimeout(r, 50))
    const seconda = await manda(url, 'sessione-buona', grande)
    assert.equal(seconda.status, 429, 'due richieste insieme hanno letto la stessa dose')
    lascia()
    assert.equal((await prima).status, 200)
    assert.deepEqual(chiesti, ['claude-sonnet-5-5'], 'il modello più caro è passato')
  } finally { s.close() }
})

test('il ponte: i modelli 5.5, i nomi vecchi al successore, Opus solo se chi ospita lo permette', () => {
  delete process.env.MYYND_INCLUSO_MODELLI
  assert.deepEqual(incluso.modelliPermessi(), ['claude-haiku-5-5', 'claude-sonnet-5-5'])
  assert.equal(incluso.modelloPermesso('claude-haiku-5-5'), 'claude-haiku-5-5')
  assert.equal(incluso.modelloPermesso('claude-haiku-4-5'), 'claude-haiku-5-5')
  assert.equal(incluso.modelloPermesso('claude-sonnet-5'), 'claude-sonnet-5-5')
  assert.equal(incluso.modelloPermesso('claude-opus-5-5'), 'claude-sonnet-5-5')
  process.env.MYYND_INCLUSO_MODELLI = 'claude-haiku-5-5,claude-sonnet-5-5,claude-opus-5-5'
  try { assert.equal(incluso.modelloPermesso('claude-opus-5'), 'claude-opus-5-5') } finally { delete process.env.MYYND_INCLUSO_MODELLI }
})

test('la dose conta la cache letta a un decimo, e il mese ha un tetto in dollari', async () => {
  assert.equal(incluso.tokenDellaDose({ entrata: 100, uscita: 50, cache: 30_000 }), 3150)
  delete process.env.MYYND_INCLUSO_MESE_USD
  assert.equal(tetto.tettoDelMeseSulServer(), 20_000_000)
  process.env.MYYND_INCLUSO_MESE_USD = '0'
  assert.equal(tetto.tettoDelMeseSulServer(), 0, 'zero: nessun tetto')
  delete process.env.MYYND_INCLUSO_MESE_USD
  const { app } = ponteFinto({ chiave: 'sk-ant-aziendale', usati: 0, spesa: 5_000_000 })
  const { s, url } = await accendi(app)
  try {
    const r = await manda(url, 'sessione-buona')
    assert.equal(r.status, 429)
    const e = ((await r.json()) as { error: { type: string; message: string } }).error
    assert.equal(e.type, 'budget_exhausted')
    assert.match(e.message, /month/)
    // la bussata di salute lo sa: senza, diceva «pronto» e la riga si spegneva
    const st = await fetch(`${url}/api/incluso/stato`, { headers: { 'x-api-key': 'sessione-buona' } })
    assert.deepEqual(await st.json(), { usati: 0, tetto: 1000, mese: true })
    assert.deepEqual(await incluso.salute({ url, gettone: 'sessione-buona' }), { stato: 'finito', usati: 0, tetto: 1000, mese: true })
  } finally { s.close() }
})

test('il «mese finito» del ponte si dice col mese, non con «domani»', async () => {
  const s = createServer((req, res) => {
    req.resume()
    req.on('end', () => {
      res.statusCode = 429
      res.setHeader('content-type', 'application/json')
      res.setHeader('x-should-retry', 'false')
      res.end(JSON.stringify({ type: 'error', error: { type: 'budget_exhausted', message: 'This month’s included AI allowance is used up.' } }))
    })
  })
  await new Promise<void>(r => s.listen(0, '127.0.0.1', r))
  process.env.MYYND_INCLUSO_URL = `http://127.0.0.1:${(s.address() as { port: number }).port}`
  try {
    cfg.scrivi({ lingua: 'en', motore: 'incluso', incluso: { token: 'gettone-di-prova' } })
    await assert.rejects(mod.chiedi({ lavoro: 'titolo', system: 's', messages: [{ role: 'user', content: 'x' }], max_tokens: 50 }),
      (e: Error) => e.message === tetto.INCLUSO_FINITO_MESE)
  } finally { s.close(); delete process.env.MYYND_INCLUSO_URL }
})
