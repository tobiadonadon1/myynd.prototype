// Lo stato di Claude, provato dalle rotte vere.
//
// Un server vero, acceso in una casa finta: un `claude` finto in
// `~/.local/bin` (risponde a `auth status` e `auth login` senza aprire
// niente), una finta API di Anthropic qui dentro, e un fornitore compatibile
// finto. Le prove che leggono il sorgente dicono che una riga c'è; queste
// dicono che cosa risponde `/api/stato` dopo ogni gesto, che è quello che la
// pagina mostra.
//
//   node --test server/collegamento-rotte.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-rotte-casa-'))
const DATI = mkdtempSync(join(tmpdir(), 'myynd-rotte-dati-'))
const STATO_CLAUDE = join(CASA, '.fc')
const TOKEN = 'sviluppo-non-in-produzione'

/** Claude Code finto: entra quando glielo si chiede, e dice se c'è entrato. */
const FINTO_CLAUDE = `#!/bin/sh
echo "$*" >> "$HOME/.fc/chiamate"
if [ "$1" = "auth" ] && [ "$2" = "status" ]; then
  if [ -f "$HOME/.fc/entrato" ]; then echo '{"loggedIn":true}'; else echo '{"loggedIn":false}'; fi
  exit 0
fi
if [ "$1" = "auth" ] && [ "$2" = "login" ]; then
  echo "visit: https://claude.ai/oauth/authorize?finto=1"
  sleep 0.3
  touch "$HOME/.fc/entrato"
  exit 0
fi
cat > /dev/null
echo '{"type":"result","subtype":"success","is_error":false,"result":"ok"}'
`

let anthropic: Server
let modo: 'ok' | 'credito' = 'ok'
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
      if (modo === 'credito') {
        res.statusCode = 400
        return res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } }))
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

async function stato() {
  const { json } = await chiama('GET', '/api/stato')
  return {
    ragiona: json.ragiona as boolean,
    motore: json.config.motore as string,
    claude: !!json.connettori.find((c: { id: string; collegato: boolean }) => c.id === 'claude')?.collegato,
    credito: json.credito as string | null
  }
}

/** Il file della configurazione di chi è entrato: scritto a mano per le configurazioni vecchie. */
function fileConfig(): string {
  const utenti = join(DATI, 'utenti')
  const dir = existsSync(utenti) ? readdirSync(utenti).map(d => join(utenti, d)).find(d => existsSync(join(d, 'config.json'))) : null
  return dir ? join(dir, 'config.json') : join(DATI, 'config.json')
}
function correggiConfig(f: (c: Record<string, any>) => void) {
  const p = fileConfig()
  const c = JSON.parse(readFileSync(p, 'utf8')) as Record<string, any>
  f(c)
  writeFileSync(p, JSON.stringify(c, null, 2))
}

/** Da capo: niente Claude, niente fornitore, Claude Code non entrato. */
async function daCapo() {
  modo = 'ok'
  rmSync(join(STATO_CLAUDE, 'entrato'), { force: true })
  for (const id of ['claude', 'compatibile', 'openai']) await chiama('DELETE', `/api/connettori/${id}`)
  correggiConfig(c => { delete c.motore; delete c.claudeCon; c.chatgpt = { attivo: false }; c.abbonamento = { attivo: false } })
}

/** L'accesso all'account, fino in fondo, col `claude` finto. */
async function accedi() {
  const { json } = await chiama('POST', '/api/modello/abbonamento/accesso')
  for (let i = 0; i < 50; i++) {
    const r = await chiama('GET', `/api/modello/abbonamento/accesso/${json.loginId}`)
    if (r.json.stato === 'completed') {
      assert.ok(readFileSync(join(STATO_CLAUDE, 'chiamate'), 'utf8').includes('auth login'), 'deve rispondere il `claude` finto, e nessun altro')
      return
    }
    assert.equal(r.json.stato, 'pending', JSON.stringify(r.json))
    await new Promise(r => setTimeout(r, 100))
  }
  assert.fail('l’accesso finto non è finito')
}

test('scollegato Claude, il «niente credito» se ne va con lui', async () => {
  await daCapo()
  modo = 'credito'
  const r = await chiama('POST', '/api/connettori/claude', { apiKey: 'sk-ant-prova' })
  assert.equal(r.stato, 200)
  assert.ok(r.json.avviso, 'la premessa: chiave buona, conto senza credito')
  assert.ok((await stato()).credito)
  await chiama('DELETE', '/api/connettori/claude')
  const dopo = await stato()
  assert.equal(dopo.ragiona, false)
  assert.equal(dopo.credito, null, 'l’avviso del credito parla di una chiave che non c’è più')
})

test('Claude Code che ha detto «non sei entrato» non è collegato, da nessuna parte', async () => {
  await daCapo()
  await chiama('POST', '/api/modello/claude-con', { con: 'abbonamento' })
  const scheda = await chiama('GET', '/api/modello/claude')
  assert.equal(scheda.json.abbonamento.entrato, false, 'la premessa: Claude Code risponde «non entrato»')
  const prima = await stato()
  assert.equal(prima.claude, false, 'la tessera dice «collegato» mentre la scheda dice «non entrato»')
  assert.equal(prima.ragiona, false, 'la prima pagina e la chat si aprono su un account da cui si è usciti')
  // e appena ci entra, torna collegato senza aspettare mezzo minuto
  await accedi()
  const dopo = await stato()
  assert.equal(dopo.claude, true)
  assert.equal(dopo.ragiona, true)
})

test('finire l’accesso all’account non toglie di mezzo un motore che lavora', async () => {
  await daCapo()
  const c = await chiama('POST', '/api/connettori/compatibile', { url: `${fintoUrl}/compat/v1`, modello: 'finto-locale', nome: 'Finto' })
  assert.equal(c.stato, 200, JSON.stringify(c.json))
  assert.equal((await stato()).motore, 'compatibile')
  await accedi()
  const dopo = await stato()
  assert.equal(dopo.motore, 'compatibile', 'l’accesso a Claude ha preso il posto del modello che lavorava')
  assert.equal(dopo.claude, true)
})

test('ChatGPT scelto e spento, rimasto in una configurazione vecchia, si cura leggendo lo stato', async () => {
  await daCapo()
  await chiama('POST', '/api/connettori/claude', { apiKey: 'sk-ant-prova' })
  correggiConfig(c => { c.motore = 'chatgpt'; c.chatgpt = { attivo: false } })
  const s = await stato()
  assert.equal(s.claude, true)
  assert.equal(s.ragiona, true, 'le Fonti dicono Claude collegato, la prima pagina dice «serve Claude»')
  assert.equal(s.motore, 'claude')
})

test('spegnere ChatGPT in Myynd, con Claude collegato, lascia lavorare Claude', async () => {
  await daCapo()
  await chiama('POST', '/api/connettori/claude', { apiKey: 'sk-ant-prova' })
  correggiConfig(c => { c.motore = 'chatgpt'; c.chatgpt = { attivo: true, email: 'prova@esempio.it' } })
  const r = await chiama('POST', '/api/modello/chatgpt', { attivo: false })
  assert.equal(r.stato, 200, JSON.stringify(r.json))
  const letto = JSON.parse(readFileSync(fileConfig(), 'utf8')) as Record<string, any>
  assert.equal(letto.motore, 'claude', 'spento ChatGPT, il motore resta su uno che non può lavorare')
})

test('scollegato Claude, lavora il modello sul computer che è ancora collegato', async () => {
  await daCapo()
  const c = await chiama('POST', '/api/connettori/compatibile', { url: `${fintoUrl}/compat/v1`, modello: 'finto-locale', nome: 'Finto' })
  assert.equal(c.stato, 200, JSON.stringify(c.json))
  await chiama('POST', '/api/connettori/claude', { apiKey: 'sk-ant-prova' })
  await chiama('POST', '/api/modello/motore', { motore: 'claude' })
  assert.equal((await stato()).motore, 'claude')
  await chiama('DELETE', '/api/connettori/claude')
  const dopo = await stato()
  assert.equal(dopo.ragiona, true, 'c’è un modello collegato e Myynd dice che non può ragionare')
  assert.equal(dopo.motore, 'compatibile')
})

test('un collegamento cambiato arriva anche a un’altra finestra, sul filo dei compiti', async () => {
  await daCapo()
  const ctrl = new AbortController()
  const r = await fetch(`${base}/api/compiti/flusso`, { headers: { authorization: `Bearer ${TOKEN}` }, signal: ctrl.signal })
  const lettore = r.body!.getReader()
  let letto = ''
  const arriva = (async () => {
    while (!letto.includes('"fase":"collegamento"')) {
      const { value, done } = await lettore.read()
      if (done) break
      letto += new TextDecoder().decode(value)
    }
  })()
  await chiama('POST', '/api/connettori/claude', { apiKey: 'sk-ant-prova' })
  await Promise.race([arriva, new Promise(r => setTimeout(r, 3000))])
  ctrl.abort()
  assert.match(letto, /"fase":"collegamento"/, 'le altre finestre restano a «da collegare»')
})

test('il server e la pagina riconoscono le stesse richieste che cambiano un collegamento', async () => {
  const { cambiaUnCollegamento } = await import('./collegamenti.ts')
  const { cambiaIlCollegamento } = await import('../src/collegamenti.ts')
  for (const [metodo, percorso] of [
    ['POST', '/api/connettori/claude'], ['POST', '/api/connettori/claude/ambiente'], ['DELETE', '/api/connettori/claude'],
    ['POST', '/api/modello/claude-con'], ['POST', '/api/modello/abbonamento'], ['POST', '/api/modello/motore'],
    ['POST', '/api/modello/chatgpt'], ['POST', '/api/connettori/compatibile'], ['POST', '/api/connettori/desktop'],
    ['POST', '/api/modello/abbonamento/accesso'], ['POST', '/api/modello/abbonamento/accesso/x/annulla'],
    ['POST', '/api/modello/chatgpt/login'], ['POST', '/api/modello/chatgpt/login/x/cancel'],
    ['POST', '/api/connettori/google/avvia'], ['POST', '/api/connettori/dropbox/inizia'],
    ['POST', '/api/connettori/openai/modelli'], ['POST', '/api/modello/openai/modelli'],
    ['POST', '/api/connettori/desktop/carica-file'], ['GET', '/api/stato'], ['POST', '/api/profilo']
  ]) assert.equal(cambiaUnCollegamento(metodo, percorso, {}), cambiaIlCollegamento(metodo, percorso, {}), `${metodo} ${percorso}`)
  // i file della cartella: solo l'ultimo pezzo cambia il collegamento
  assert.equal(cambiaUnCollegamento('POST', '/api/connettori/desktop/carica-file', { completo: false }), false)
  assert.equal(cambiaUnCollegamento('POST', '/api/connettori/desktop/carica-file', { completo: true }), true)
})
