// Slack dalle rotte vere: collegare, leggere, la scheda, le esclusioni, e
// l'invio che parte solo da un tocco. Un server vero in una casa finta, e uno
// Slack finto (`prove/finto-slack.ts`) al posto di quello vero.
//
//   node --test server/slack-rotte.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as finto from '../prove/finto-slack.ts'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-slack-casa-'))
const DATI = mkdtempSync(join(tmpdir(), 'myynd-slack-dati-'))
const SESSIONE = 'sviluppo-non-in-produzione'
let f: finto.Finto
let server: ChildProcess
let base = ''

before(async () => {
  f = await finto.avvia()
  const { ANTHROPIC_API_KEY: _a, OPENAI_API_KEY: _o, MYYND_POSTGRES: _p, MYYND_TYPESAFE: _t, RAILWAY_ENVIRONMENT: _r, ...ambiente } = process.env
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.ts'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...ambiente, HOME: CASA, MYYND_DATI: DATI, MYYND_DEV: '1', PORT: '0', MYYND_SLACK_URL: f.url, MYYND_PRIMA_RILETTURA_MS: String(3_600_000) },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  base = await new Promise<string>((risolvi, rifiuta) => {
    let fuori = ''
    const tetto = setTimeout(() => rifiuta(new Error(`il server non è partito:\n${fuori}`)), 20_000)
    server.stdout!.on('data', d => {
      fuori += String(d)
      const m = fuori.match(/server su (http:\/\/127\.0\.0\.1:\d+)/)
      if (m) { clearTimeout(tetto); risolvi(m[1]!) }
    })
    server.stderr!.on('data', d => { fuori += String(d) })
    server.on('exit', c => { clearTimeout(tetto); rifiuta(new Error(`il server è uscito (${c}):\n${fuori}`)) })
  })
  let p = await chiama('POST', '/api/profilo', { onboarding: true, giro: true, lingua: 'en', nome: 'Prova' })
  for (let i = 0; p.stato === 401 && i < 100; i++) {
    await new Promise(r => setTimeout(r, 100))
    p = await chiama('POST', '/api/profilo', { onboarding: true, giro: true, lingua: 'en', nome: 'Prova' })
  }
  assert.equal(p.stato, 200, JSON.stringify(p.json))
})

after(async () => {
  server?.kill('SIGKILL')
  await f?.chiudi()
  rmSync(CASA, { recursive: true, force: true })
  rmSync(DATI, { recursive: true, force: true })
})

async function chiama(metodo: string, percorso: string, corpo?: unknown, intestazioni: Record<string, string> = {}): Promise<{ stato: number; json: Record<string, any> }> {
  const r = await fetch(base + percorso, {
    method: metodo,
    headers: { authorization: `Bearer ${SESSIONE}`, 'content-type': 'application/json', ...intestazioni },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) })
  })
  return { stato: r.status, json: await r.json().catch(() => ({})) as Record<string, any> }
}

test('collegare, leggere, la scheda, le esclusioni, e l’invio solo da un tocco', async () => {
  // un token sbagliato non entra
  const no = await chiama('POST', '/api/connettori/slack', { token: 'xoxp-sbagliato' })
  assert.equal(no.stato, 400)
  assert.equal(no.json.errore, 'Il token di Slack non è valido.')

  const si = await chiama('POST', '/api/connettori/slack', { token: finto.TOKEN })
  assert.equal(si.stato, 200, JSON.stringify(si.json))
  assert.equal(si.json.squadra, 'Northwind Studio')
  assert.deepEqual(si.json.mancano, [])

  // la lettura della sola fonte: il flusso finisce con «fine»
  const r = await fetch(`${base}/api/sincronizza?fonte=slack`, { headers: { authorization: `Bearer ${SESSIONE}` } })
  const flusso = await r.text()
  assert.match(flusso, /"fase":"fine"/, flusso.slice(-500))

  const s = await chiama('GET', '/api/slack/stato')
  assert.equal(s.stato, 200)
  assert.equal(s.json.squadra, 'Northwind Studio')
  assert.equal(s.json.utente, 'alex')
  assert.equal(s.json.conversazioni, 67)
  assert.equal(s.json.fili, 4)
  assert.equal(s.json.aperte, 3)
  assert.ok(s.json.ultima)
  assert.match(s.json.manifesto, /^https:\/\/api\.slack\.com\/apps\?new_app=1&manifest_json=/)
  assert.ok(!JSON.stringify(s.json).includes(finto.TOKEN), 'il token non esce')
  assert.ok(s.json.posti.some((p: { id: string; nome: string }) => p.id === 'D0NORA' && p.nome === 'Nora Vance'))

  const d = await chiama('GET', '/api/slack/da-rispondere')
  assert.equal(d.json.domande.length, 3)
  assert.equal(d.json.promesse.length, 2)

  // l'invio senza il segno del tocco non parte, e Slack non lo vede
  const acme = f.conv.find(c => c.id === 'C0ACME')!
  const radice = acme.messaggi.find(m => m.text === 'Draft budget is in the doc')!
  const senza = await chiama('POST', '/api/slack/invia', { conversazione: 'C0ACME', filo: radice.ts, testo: 'Added them.' })
  assert.equal(senza.stato, 403)
  assert.equal(f.conteggi.get('chat.postMessage') ?? 0, 0)
  const con = await chiama('POST', '/api/slack/invia', { conversazione: 'C0ACME', filo: radice.ts, testo: 'Added them.' }, { 'x-myynd-tocco': '1' })
  assert.equal(con.stato, 200, JSON.stringify(con.json))
  assert.match(con.json.permalink, /^https:\/\/northwind-studio\.slack\.com\/archives\/C0ACME\/p\d+\?thread_ts=/)
  assert.equal(f.conteggi.get('chat.postMessage'), 1)
  assert.equal((await chiama('GET', '/api/slack/stato')).json.aperte, 2, 'la domanda a cui ha risposto da qui si chiude subito')

  // escludere un posto lo toglie anche da quello che sa già
  const e = await chiama('POST', '/api/slack/esclusi', { esclusi: ['C0ACME', 'nonvalido!'] })
  assert.deepEqual(e.json.esclusi, ['C0ACME'])
  assert.ok(e.json.tolti > 0)
  assert.equal((await chiama('GET', '/api/slack/stato')).json.aperte, 2, 'i messaggi diretti restano')
  const inviato = await chiama('POST', '/api/slack/invia', { conversazione: 'C0ACME', testo: 'x' }, { 'x-myynd-tocco': '1' })
  assert.equal(inviato.stato, 400, 'un posto escluso non riceve niente')
  // il nome dell'escluso resta nella scheda, per poterlo togliere
  assert.ok((await chiama('GET', '/api/slack/stato')).json.posti.some((p: { id: string }) => p.id === 'C0ACME'))

  // scollegato: niente più domande, promesse o decisioni di Slack
  assert.equal((await chiama('DELETE', '/api/connettori/slack')).stato, 200)
  const dopo = await chiama('GET', '/api/slack/da-rispondere')
  assert.deepEqual([dopo.json.domande.length, dopo.json.promesse.length, dopo.json.decisioni.length], [0, 0, 0])
})
