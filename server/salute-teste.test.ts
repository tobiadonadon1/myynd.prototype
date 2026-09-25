// La salute del motore che lavora: chi lavora, l'account da cui si è usciti,
// la chiave rifiutata (e guarita incollandone un'altra), la riga del giorno
// scritta solo quando lo stato cambia.
//
//   node --test server/salute-teste.test.ts

import { test, after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Config } from './config.ts'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-teste-'))
const HOME_VERA = process.env.HOME
process.env.HOME = CASA
process.env.MYYND_DATI = join(CASA, 'dati')
delete process.env.ANTHROPIC_API_KEY
delete process.env.OPENAI_API_KEY
// Claude Code finto: «non sei entrato»
mkdirSync(join(CASA, '.local', 'bin'), { recursive: true })
writeFileSync(join(CASA, '.local', 'bin', 'claude'), `#!/bin/sh
if [ "$1" = "auth" ] && [ "$2" = "status" ]; then echo '{"loggedIn":false}'; exit 0; fi
exit 1
`)
chmodSync(join(CASA, '.local', 'bin', 'claude'), 0o755)

// Anthropic finto: ogni chiave è rifiutata
let anthropic: Server
before(async () => {
  anthropic = createServer((req, res) => {
    req.resume()
    req.on('end', () => {
      res.statusCode = 401
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }))
    })
  })
  await new Promise<void>(r => anthropic.listen(0, '127.0.0.1', r))
  const a = anthropic.address()
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}`
})

const cfg = await import('./config.ts')
const store = await import('./store.ts')
const mod = await import('./modello.ts')
const abbonamento = await import('./abbonamento.ts')
const teste = await import('./salute-teste.ts')
const Anthropic = (await import('@anthropic-ai/sdk')).default

after(() => {
  anthropic?.close()
  delete process.env.ANTHROPIC_BASE_URL
  process.env.HOME = HOME_VERA
  store.chiudiIndici()
  rmSync(CASA, { recursive: true, force: true })
})

const VIA = ['claude', 'openai', 'compatibile', 'claudeCon', 'motore', 'chatgpt', 'abbonamento']
const usa = (c: Record<string, unknown>) => cfg.scrivi({ fuso: 'Europe/Rome', ...c } as Config, { togli: VIA })
beforeEach(() => { usa({}); teste.perProva(); store.default.exec('DELETE FROM salute_fonti') })
const oggi = () => store.default.prepare("SELECT * FROM salute_fonti WHERE fonte IN ('claude','openai','compatibile')").all() as Record<string, unknown>[]
const respinta = () => new Anthropic.AuthenticationError(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 'invalid x-api-key', new Headers())

test('chi lavora: la chiave di Claude, l’account, la chiave di OpenAI, l’account ChatGPT, il modello sul computer, nessuno', () => {
  usa({ claude: { apiKey: 'sk-ant-a' } }); assert.equal(mod.testaAlLavoro(), 'claude')
  usa({ claudeCon: 'abbonamento' }); assert.equal(mod.testaAlLavoro(), 'claude')
  usa({ motore: 'openai', openai: { chiave: 'sk-o', modello: 'gpt-5' } }); assert.equal(mod.testaAlLavoro(), 'openai')
  usa({ motore: 'openai' }); assert.equal(mod.testaAlLavoro(), null)
  usa({ motore: 'chatgpt' }); assert.equal(mod.testaAlLavoro(), 'openai')
  usa({ motore: 'compatibile', compatibile: { url: 'http://127.0.0.1:1/v1', modello: 'locale' } }); assert.equal(mod.testaAlLavoro(), 'compatibile')
  usa({}); assert.equal(mod.testaAlLavoro(), null)
})

test('uscito dall’account: «accedi», e si mostra solo se è Claude a lavorare', async () => {
  usa({ claudeCon: 'abbonamento' })
  await abbonamento.entrato()
  assert.equal(abbonamento.uscito(), true)
  assert.deepEqual(teste.problemaTesta('claude'), { rimedio: 'accedi' })
  assert.deepEqual(teste.testaDaMostrare(), { id: 'claude', rimedio: 'accedi' })
  // con il modello sul computer al lavoro, l'account uscito non è la riga fissa
  usa({ claudeCon: 'abbonamento', motore: 'compatibile', compatibile: { url: 'http://127.0.0.1:1/v1', modello: 'locale' } })
  assert.equal(teste.testaDaMostrare(), null)
  // e non scelto: non è uscito niente
  usa({})
  assert.equal(abbonamento.uscito(), false)
  assert.equal(teste.problemaTesta('claude'), null)
})

test('una chiave rifiutata dal motore è «credenziale»; incollarne un’altra guarisce subito; una risposta pure', async () => {
  usa({ claude: { apiKey: 'sk-ant-vecchia' } })
  mod.notaRifiuto(respinta(), 'claude')
  assert.deepEqual(teste.problemaTesta('claude'), { rimedio: 'credenziale' })
  assert.deepEqual(teste.testaDaMostrare(), { id: 'claude', rimedio: 'credenziale' })
  usa({ claude: { apiKey: 'sk-ant-nuova' } })
  assert.equal(teste.problemaTesta('claude'), null)
  usa({ claude: { apiKey: 'sk-ant-vecchia' } })
  assert.deepEqual(teste.problemaTesta('claude'), { rimedio: 'credenziale' }, 'la vecchia è ancora quella rifiutata')
  mod.segnaUso('risposta', { input_tokens: 1, output_tokens: 1 } as never)
  assert.equal(teste.problemaTesta('claude'), null)
  // un errore che non è un rifiuto della chiave non segna niente
  mod.notaRifiuto(new Error('rete'), 'claude')
  assert.equal(mod.rifiutata('claude'), null)
})

test('il motore vero segna il rifiuto; la prova di una chiave nuova no (counter-case)', async () => {
  usa({ claude: { apiKey: 'sk-ant-salvata' } })
  const claude = await import('./claude.ts')
  const r = await claude.prova('sk-ant-da-provare')
  assert.equal(r.ok, false)
  assert.equal(mod.rifiutata('claude'), null, 'la prova non tocca la chiave salvata')
  const m = mod.motore()!
  await assert.rejects(() => m.crea({ model: 'claude-sonnet-5', max_tokens: 1, messages: [{ role: 'user', content: 'ok' }] }))
  assert.ok(mod.rifiutata('claude'))
})

test('OpenAI con la chiave: un 401 del fornitore è «credenziale»', () => {
  usa({ motore: 'openai', openai: { chiave: 'sk-o', modello: 'gpt-5' } })
  mod.notaRifiuto(Object.assign(new Error('La chiave del fornitore non è valida.'), { status: 401 }), 'openai')
  assert.deepEqual(teste.testaDaMostrare(), { id: 'openai', rimedio: 'credenziale' })
  mod.notaRifiuto(Object.assign(new Error('Il fornitore ha un problema. Riprova fra poco.'), { status: 500 }), 'openai')
  usa({ motore: 'openai', openai: { chiave: 'sk-o2', modello: 'gpt-5' } })
  assert.equal(teste.testaDaMostrare(), null)
})

test('la riga del giorno: una per cambio di stato, non per chiamata; il modello sul computer non scrive mai', () => {
  usa({ claude: { apiKey: 'sk-ant-a' } })
  teste.segnaTesta('ok'); teste.segnaTesta('ok'); teste.segnaTesta()
  let r = oggi()
  assert.equal(r.length, 1)
  assert.equal(r[0].letture, 1)
  assert.equal(r[0].pulite, 1)
  mod.notaRifiuto(respinta(), 'claude')
  teste.segnaTesta(); teste.segnaTesta()
  r = oggi()
  assert.equal(r[0].letture, 2)
  assert.equal(r[0].guai, 1)
  assert.equal(r[0].rimedio, 'credenziale')
  usa({ motore: 'compatibile', compatibile: { url: 'http://127.0.0.1:1/v1', modello: 'locale' } })
  teste.segnaTesta('ok')
  assert.equal(oggi().length, 1)
  assert.ok(!oggi().some(x => x.fonte === 'compatibile'))
})
