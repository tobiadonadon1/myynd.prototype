// La salute di ogni motore, non solo di Claude: il modello sul Mac che non
// risponde, ChatGPT da cui si è usciti, il ponte dell'AI inclusa che rifiuta,
// e «non riesco a pensare» quando ogni chiamata fallisce da dieci minuti. Poi
// il cambio: il motore scelto morto e un altro che risponde, si lavora con
// l'altro e si torna appena il primo risponde; un motore che lavora non si
// tocca mai, e una scelta sua cancella il ricordo del cambio.
//
//   node --test server/salute-motori.test.ts

import { test, after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Config } from './config.ts'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-motori-'))
const HOME_VERA = process.env.HOME
process.env.HOME = CASA
process.env.MYYND_DATI = join(CASA, 'dati')
delete process.env.ANTHROPIC_API_KEY
delete process.env.MYYND_INCLUSO_URL
// il componente di ChatGPT, finto: basta che ci sia il file (le bussate sono finte)
const runtime = join(CASA, 'Library', 'Caches', 'myynd-binari', 'codex', '0.145.0', `${process.platform}-${process.arch}`)
mkdirSync(join(runtime, 'bin'), { recursive: true })
writeFileSync(join(runtime, 'bin', 'codex'), '#!/bin/sh\nexit 1\n')
writeFileSync(join(runtime, 'runtime.json'), JSON.stringify({ version: '0.145.0', platform: process.platform, arch: process.arch }))

// Anthropic finto: risponde 500 finché `giu`, poi un messaggio vero
let anthropic: Server
let giu = true
before(async () => {
  anthropic = createServer((req, res) => {
    req.resume()
    req.on('end', () => {
      res.setHeader('content-type', 'application/json')
      if (giu) { res.statusCode = 500; res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'boom' } })); return }
      res.end(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', stop_reason: 'end_turn',
        content: [{ type: 'text', text: '{"ok":true}' }], usage: { input_tokens: 1, output_tokens: 1 } }))
    })
  })
  await new Promise<void>(r => anthropic.listen(0, '127.0.0.1', r))
  const a = anthropic.address()
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}`
})

const cfg = await import('./config.ts')
const store = await import('./store.ts')
const mod = await import('./modello.ts')
const teste = await import('./salute-teste.ts')

after(() => {
  anthropic?.close()
  delete process.env.ANTHROPIC_BASE_URL
  process.env.HOME = HOME_VERA
  store.chiudiIndici()
  rmSync(CASA, { recursive: true, force: true })
})

const VIA = ['claude', 'openai', 'compatibile', 'claudeCon', 'motore', 'motorePrima', 'chatgpt', 'abbonamento', 'incluso']
const usa = (c: Record<string, unknown>) => cfg.scrivi({ lingua: 'en', ...c } as Config, { togli: VIA })
const LOCALE = { url: 'http://127.0.0.1:11434/v1', modello: 'qwen3' }
let vivo = true
let chiesteAlLocale = 0
beforeEach(() => {
  usa({}); teste.perProva(); mod.perProvaVisti(); vivo = true; chiesteAlLocale = 0; giu = true
  teste.perProvaFerri({ risponde: async () => { chiesteAlLocale++; return vivo } })
})

test('il modello sul Mac spento: la riga lo dice al primo «no», col posto nelle Fonti; acceso, niente', async () => {
  usa({ motore: 'compatibile', compatibile: LOCALE })
  vivo = false
  await teste.sonda({ forza: true })
  assert.deepEqual(teste.testaDaMostrare(), { id: 'compatibile', via: 'compatibile', rimedio: 'spento', locale: true })
  // e la sua scheda nelle Fonti: sul Mac si riapre l'app del modello
  assert.equal(teste.problemaScheda('compatibile'), 'apri-app')
  assert.equal(teste.problemaScheda('openai'), null)
  vivo = true
  await teste.sonda({ forza: true })
  assert.equal(teste.testaDaMostrare(), null)
  assert.equal(teste.problemaScheda('compatibile'), null)
})

test('si bussa al massimo ogni tre minuti, e solo al motore scelto', async () => {
  usa({ motore: 'compatibile', compatibile: LOCALE })
  const t0 = Date.now()
  await teste.sonda({ adesso: t0 })
  await teste.sonda({ adesso: t0 + 60_000 })
  assert.equal(chiesteAlLocale, 1, 'un minuto dopo non si bussa')
  await teste.sonda({ adesso: t0 + teste.MINUTI_SONDA * 60_000 })
  assert.equal(chiesteAlLocale, 2)
  // con Claude scelto, il modello sul Mac collegato non si bussa mai
  usa({ motore: 'claude', claude: { apiKey: 'sk-ant-a' }, compatibile: LOCALE })
  await teste.sonda({ forza: true })
  assert.equal(chiesteAlLocale, 2)
})

test('morto alla seconda bussata, con Claude collegato: lavora Claude, e la riga dice chi lavora intanto; poi si torna', async () => {
  usa({ motore: 'compatibile', compatibile: LOCALE, claude: { apiKey: 'sk-ant-a' } })
  vivo = false
  await teste.sonda({ forza: true })
  assert.equal(cfg.leggi().motore, 'compatibile', 'una bussata a vuoto può essere un attimo: non si cambia')
  await teste.sonda({ forza: true })
  assert.equal(cfg.leggi().motore, 'claude', 'due di fila: lavora Claude')
  assert.equal(cfg.leggi().motorePrima, 'compatibile', 'e si ricorda da dove si veniva')
  assert.deepEqual(teste.testaDaMostrare(), { id: 'compatibile', via: 'compatibile', rimedio: 'spento', locale: true, intanto: { via: 'claude' } })
  // la pagina ripara a ogni giro: finché il locale è morto non si torna
  assert.equal(mod.riparaIlMotore(), false)
  assert.equal(cfg.leggi().motore, 'claude')
  // il locale risponde di nuovo: la bussata va al motore scelto da lei, e si torna
  vivo = true
  await teste.sonda({ forza: true })
  assert.equal(cfg.leggi().motore, 'compatibile')
  assert.equal(cfg.leggi().motorePrima, undefined)
  assert.equal(teste.testaDaMostrare(), null)
})

test('dopo un riavvio il cambio resta: si torna solo quando il motore di prima ha risposto', async () => {
  usa({ motore: 'compatibile', compatibile: LOCALE, claude: { apiKey: 'sk-ant-a' } })
  vivo = false
  await teste.sonda({ forza: true }); await teste.sonda({ forza: true })
  assert.equal(cfg.leggi().motore, 'claude')
  // il riavvio: niente bussate in memoria, la configurazione scritta resta
  teste.perProva(); mod.perProvaVisti()
  assert.equal(mod.riparaIlMotore(), false, 'il primo /api/stato non rimette il motore spento')
  assert.equal(cfg.leggi().motore, 'claude')
  assert.equal(cfg.leggi().motorePrima, 'compatibile')
  // ancora spento alla prima bussata: si resta
  await teste.sonda({ forza: true })
  assert.equal(cfg.leggi().motore, 'claude')
  // risponde: si torna alla bussata dopo
  vivo = true
  await teste.sonda({ forza: true })
  assert.equal(cfg.leggi().motore, 'compatibile')
})

test('il motore scelto morto: non si passa a uno che si bussa e non ha mai risposto', async () => {
  // il locale morto, ChatGPT acceso in Myynd ma mai bussato con un «sì»
  usa({ motore: 'compatibile', compatibile: LOCALE, chatgpt: { attivo: true, email: 'a@example.com' } })
  teste.perProvaFerri({ risponde: async () => false, statoChatGPT: async () => ({ installato: true, entrato: false, errore: 'giù' }) })
  await teste.sonda({ forza: true }); await teste.sonda({ forza: true })
  assert.equal(mod.morta('compatibile'), true)
  assert.notEqual(mod.statoVia('chatgpt')?.vivo, true)
  assert.equal(cfg.leggi().motore, 'compatibile', 'nessuno ha risposto: resta il suo, e la riga lo dice')
  assert.equal(mod.riparaIlMotore(), false)
  // ChatGPT risponde: adesso sì
  teste.perProvaFerri({ risponde: async () => false, statoChatGPT: async () => ({ installato: true, entrato: true }) })
  await teste.sonda({ forza: true })
  assert.equal(cfg.leggi().motore, 'chatgpt')
  assert.equal(cfg.leggi().motorePrima, 'compatibile')
})

test('un motore che lavora non si tocca, e senza un altro che risponda non si cambia', async () => {
  usa({ motore: 'compatibile', compatibile: LOCALE, claude: { apiKey: 'sk-ant-a' } })
  await teste.sonda({ forza: true }); await teste.sonda({ forza: true })
  assert.equal(cfg.leggi().motore, 'compatibile', 'vivo: resta il suo')
  // morto, ma nessun altro motore collegato: resta, e la riga lo dice
  usa({ motore: 'compatibile', compatibile: LOCALE })
  vivo = false
  await teste.sonda({ forza: true }); await teste.sonda({ forza: true })
  assert.equal(cfg.leggi().motore, 'compatibile')
  assert.equal(teste.testaDaMostrare()?.rimedio, 'spento')
})

test('Claude con la chiave respinta e il modello sul Mac che risponde: si passa al locale, e la chiave nuova riporta Claude', async () => {
  usa({ motore: 'claude', claude: { apiKey: 'sk-ant-vecchia' }, compatibile: LOCALE })
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  mod.notaRifiuto(new Anthropic.AuthenticationError(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid' } }, 'invalid', new Headers()), 'claude')
  await teste.sonda({ forza: true })
  assert.equal(cfg.leggi().motore, 'compatibile', 'il locale ha appena risposto: lavora lui')
  assert.equal(teste.testaDaMostrare()?.rimedio, 'credenziale')
  assert.deepEqual(teste.testaDaMostrare()?.intanto, { via: 'compatibile', locale: true })
  // la chiave nuova: Claude torna
  const c = cfg.leggi(); c.claude = { apiKey: 'sk-ant-nuova' }; cfg.scrivi(c)
  assert.equal(mod.riparaIlMotore(), true)
  assert.equal(cfg.leggi().motore, 'claude')
})

test('una scelta sua dimentica il cambio: Myynd non la rimette com’era', () => {
  usa({ motore: 'claude', motorePrima: 'compatibile', compatibile: LOCALE, claude: { apiKey: 'sk-ant-a' } })
  mod.scegliIlMotore('claude')
  assert.equal(cfg.leggi().motorePrima, undefined)
  mod.segnaVia('compatibile', true)
  assert.equal(mod.riparaIlMotore(), false)
  assert.equal(cfg.leggi().motore, 'claude')
})

test('dopo un cambio, il motore che lei sceglie di nuovo a mano resta: un «morto» di prima non lo rimanda su Claude', async () => {
  usa({ motore: 'compatibile', compatibile: LOCALE, claude: { apiKey: 'sk-ant-a' } })
  vivo = false
  await teste.sonda({ forza: true }); await teste.sonda({ forza: true })
  assert.equal(cfg.leggi().motore, 'claude')
  assert.equal(cfg.leggi().motorePrima, 'compatibile')
  // il locale si è riacceso e lei lo sceglie dalle Preferenze, prima della bussata dopo
  vivo = true
  mod.scegliIlMotore('compatibile')
  assert.equal(mod.riparaIlMotore(), false, '/api/stato ripara a ogni giro: non deve toccare la sua scelta')
  assert.equal(cfg.leggi().motore, 'compatibile')
  assert.equal(teste.testaDaMostrare(), null, 'e la riga non dice più «non risponde»')
  // se poi muore davvero, servono bussate nuove
  vivo = false
  await teste.sonda({ forza: true })
  assert.equal(cfg.leggi().motore, 'compatibile', 'una bussata sola non basta')
})

test('ChatGPT da cui si è usciti: «accedi», sulla scheda di OpenAI', async () => {
  usa({ motore: 'chatgpt', chatgpt: { attivo: true, email: 'a@example.com' } })
  teste.perProvaFerri({ statoChatGPT: async () => ({ installato: true, entrato: false }) })
  await teste.sonda({ forza: true })
  assert.deepEqual(teste.testaDaMostrare(), { id: 'openai', via: 'chatgpt', rimedio: 'accedi' })
  // la scheda dove porta la riga dice lo stesso, non «Collegato»
  assert.equal(teste.problemaScheda('openai'), 'accedi')
  teste.perProvaFerri({ statoChatGPT: async () => ({ installato: true, entrato: true }) })
  await teste.sonda({ forza: true })
  assert.equal(teste.testaDaMostrare(), null)
  assert.equal(teste.problemaScheda('openai'), null)
})

test('il ponte dell’AI inclusa: 401 rientrare, 402 il piano, 429 la dose, 5xx giù; anche da una chiamata vera', async () => {
  process.env.MYYND_INCLUSO_URL = 'https://ponte.example.test'
  try {
    usa({ motore: 'incluso', incluso: { token: 'gettone' } })
    const dice = (s: Awaited<ReturnType<typeof import('./incluso.ts').salute>>) => teste.perProvaFerri({ saluteIncluso: async () => s })
    dice({ stato: 'assente', codice: 401 }); await teste.sonda({ forza: true })
    assert.deepEqual(teste.testaDaMostrare(), { id: 'incluso', via: 'incluso', rimedio: 'accedi' })
    dice({ stato: 'assente', codice: 402 }); await teste.sonda({ forza: true })
    assert.equal(teste.testaDaMostrare()?.rimedio, 'pagamento')
    dice({ stato: 'finito' }); await teste.sonda({ forza: true })
    assert.equal(teste.testaDaMostrare()?.rimedio, 'finito')
    // la dose del mese ha la sua frase, non «domani»
    dice({ stato: 'finito', usati: 1, tetto: 10, mese: true }); await teste.sonda({ forza: true })
    assert.equal(teste.testaDaMostrare()?.rimedio, 'finitoMese')
    dice({ stato: 'assente', codice: 503 }); await teste.sonda({ forza: true })
    assert.equal(teste.testaDaMostrare()?.rimedio, 'ponte')
    dice({ stato: 'pronto', usati: 1, tetto: 10 }); await teste.sonda({ forza: true })
    assert.equal(teste.testaDaMostrare(), null)
    // una chiamata vera che prende un 402 lo dice senza aspettare la bussata
    const ponte = createServer((req, res) => { req.resume(); req.on('end', () => { res.statusCode = 402; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ type: 'error', error: { type: 'payment_required', message: 'plan' } })) }) })
    await new Promise<void>(r => ponte.listen(0, '127.0.0.1', r))
    process.env.MYYND_INCLUSO_URL = `http://127.0.0.1:${(ponte.address() as { port: number }).port}`
    try {
      await assert.rejects(mod.chiedi({ lavoro: 'titolo', system: 's', messages: [{ role: 'user', content: 'x' }], max_tokens: 20 }))
      assert.equal(teste.testaDaMostrare()?.rimedio, 'pagamento')
    } finally { ponte.close() }
    // e una chiamata vera che prende «finita la dose del mese» lo dice col mese
    const mese = createServer((req, res) => { req.resume(); req.on('end', () => { res.statusCode = 429; res.setHeader('content-type', 'application/json'); res.setHeader('x-should-retry', 'false'); res.end(JSON.stringify({ type: 'error', error: { type: 'budget_exhausted', message: 'This month’s included AI allowance is used up.' } })) }) })
    await new Promise<void>(r => mese.listen(0, '127.0.0.1', r))
    process.env.MYYND_INCLUSO_URL = `http://127.0.0.1:${(mese.address() as { port: number }).port}`
    try {
      await assert.rejects(mod.chiedi({ lavoro: 'titolo', system: 's', messages: [{ role: 'user', content: 'x' }], max_tokens: 20 }))
      assert.equal(teste.testaDaMostrare()?.rimedio, 'finitoMese')
    } finally { mese.close() }
  } finally { delete process.env.MYYND_INCLUSO_URL }
})

test('ogni chiamata fallisce da dieci minuti: «non riesco a pensare»; chiediJSON non lo nasconde più; una risposta chiude la serie', async () => {
  usa({ motore: 'claude', claude: { apiKey: 'sk-ant-a' } })
  assert.equal(await mod.chiediJSON({ lavoro: 'titolo', system: 's', messages: [{ role: 'user', content: 'x' }], max_tokens: 20, formato: { type: 'object' } }), null)
  const t0 = Date.parse(mod.ultimeMancate()[0].dal)
  assert.equal(mod.pensieroFermo(t0), null, 'un guasto solo, adesso: niente riga')
  assert.equal(teste.testaDaMostrare(t0), null)
  const fra = t0 + (mod.MINUTI_FERMO + 1) * 60_000
  assert.equal(mod.pensieroFermo(fra)?.minuti, mod.MINUTI_FERMO + 1)
  assert.deepEqual(teste.testaDaMostrare(fra), { id: 'claude', via: 'claude', rimedio: 'fermo', minuti: mod.MINUTI_FERMO + 1 })
  assert.equal(mod.ultimeMancate()[0]?.lavoro, 'titolo', 'il guasto è scritto sotto il suo lavoro')
  // una risposta, anche di un altro lavoro: la serie si chiude
  giu = false
  assert.deepEqual(await mod.chiediJSON({ lavoro: 'classifica', system: 's', messages: [{ role: 'user', content: 'x' }], max_tokens: 20, formato: { type: 'object' } }), { ok: true })
  assert.equal(mod.pensieroFermo(fra), null)
})

test('la lettura del feed e la chat chiamano il motore da sé, e contano lo stesso per «non riesco a pensare»', async () => {
  usa({ motore: 'claude', claude: { apiKey: 'sk-ant-a' } })
  const claude = await import('./claude.ts')
  // la chat senza streaming passa da `rispondi`: Anthropic finto risponde 500
  await assert.rejects(claude.rispondi('Quanto abbiamo fatturato col progetto Orsini rispetto al trimestre scorso?', []))
  const m = mod.ultimeMancate().find(x => x.lavoro === 'risposta')
  assert.ok(m, 'il guasto della chat è nella serie')
  assert.ok(mod.pensieroFermo(Date.parse(m.dal) + (mod.MINUTI_FERMO + 1) * 60_000))
  // e un feed che legge chiude la serie, come qualunque risposta
  await mod.conEsito('lettura', async () => 'letto')
  assert.equal(mod.pensieroFermo(Date.parse(m.dal) + (mod.MINUTI_FERMO + 1) * 60_000), null)
  await assert.rejects(mod.conEsito('lettura', async () => { throw new Error('boom') }))
  assert.equal(mod.ultimeMancate().find(x => x.lavoro === 'lettura')?.perche, 'boom')
})
