// La prima pagina aspetta le fonti che ha scelto (P4), sul server vero.
//
// Il giro dei dieci minuti legge quello che è collegato anche mentre lui è
// ancora sul passo delle fonti: fatta lì, la pagina sarebbe fatta con due
// schede su quattro, senza la posta che sta per collegare, e non si rifarebbe
// più. Il giro di fondo la lascia a dopo; «Leggi», premuto da lui, la fa.
//
//   node --test server/prima-pagina-avvio.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-pagina-avvio-casa-'))
const DATI = mkdtempSync(join(tmpdir(), 'myynd-pagina-avvio-dati-'))
const TOKEN = 'sviluppo-non-in-produzione'
const CARTELLA = join(CASA, 'Lavoro')
/** Il primo giro di fondo parte dopo questo tempo, invece che dopo un minuto. */
const PRIMO_GIRO_MS = 4000

let finto: Server
let fintoUrl = ''
let server: ChildProcess
let base = ''
let registro = ''
/** Le chiamate al modello per le priorità, in ordine: il registro dice quando sono arrivate. */
const priorita: number[] = []

/*
 * Il modello finto. Alle priorità («capo di gabinetto») risponde con una voce
 * vera, che cita un file del Mac con una frase che c'è davvero: una voce così
 * passa i controlli e finisce sul feed. Con `{ voci: [] }` a ogni domanda il
 * giro di fondo non salvava niente, e il guasto non si vedeva.
 */
function risposta(corpo: string): unknown {
  if (!corpo.includes('capo di gabinetto')) return { voci: [] }
  priorita.push(Date.now())
  const doc = corpo.match(/desktop:[^\s"\\]*appunti-0\.md/)?.[0] ?? ''
  return {
    priorita: doc ? [{
      genere: 'priorita', titolo: 'Write the new homepage', testo: 'The homepage is due Friday, with the team photos.',
      perche: 'Your notes say the homepage is due Friday.', progetto: 'New website', doc,
      offerta: 'I can draft the homepage text.', quando: '', prova: 'la pagina iniziale va scritta entro venerdì'
    }] : [],
    domande: [], superate: []
  }
}

before(async () => {
  mkdirSync(CARTELLA, { recursive: true })
  for (let i = 0; i < 4; i++) writeFileSync(join(CARTELLA, `appunti-${i}.md`), `Appunti ${i} sul sito nuovo: la pagina iniziale va scritta entro venerdì, con le foto del team.`)
  finto = createServer((req, res) => {
    let corpo = ''
    req.on('data', d => { corpo += String(d) })
    req.on('end', () => {
      res.setHeader('content-type', 'application/json')
      if (req.url?.endsWith('/models')) return res.end(JSON.stringify({ data: [{ id: 'finto' }] }))
      if (req.url?.includes('/chat/completions')) {
        return res.end(JSON.stringify({ id: 'c1', object: 'chat.completion', model: 'finto', choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(risposta(corpo)) }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }))
      }
      res.statusCode = 404; res.end('{}')
    })
  })
  await new Promise<void>(r => finto.listen(0, '127.0.0.1', r))
  const a = finto.address()
  fintoUrl = `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}`
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.ts'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { PATH: process.env.PATH ?? '', HOME: CASA, MYYND_DATI: DATI, MYYND_DEV: '1', PORT: '0', NODE_ENV: 'test', MYYND_SENZA_APP_MAC: '1', MYYND_PRIMA_RILETTURA_MS: String(PRIMO_GIRO_MS) },
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
})

after(async () => {
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
const aspettaChe = async (f: () => Promise<boolean> | boolean, ms = 20_000) => {
  const fine = Date.now() + ms
  while (Date.now() < fine) { if (await f()) return; await new Promise(r => setTimeout(r, 100)) }
  throw new Error(`la condizione non si è mai avverata:\n${registro.slice(-2000)}`)
}

test('il giro di fondo sul passo delle fonti non consuma la prima pagina; «Leggi» la fa', async () => {
  // un conto nuovo sul passo delle fonti: un modello, il Mac collegato, l'avvio al progetto
  let p = await chiama('POST', '/api/profilo', { lingua: 'en', nome: 'Prova' })
  for (let i = 0; p.stato === 401 && i < 100; i++) {
    await new Promise(r => setTimeout(r, 100))
    p = await chiama('POST', '/api/profilo', { lingua: 'en', nome: 'Prova' })
  }
  assert.equal(p.stato, 200, JSON.stringify(p.json))
  assert.equal((await chiama('POST', '/api/connettori/compatibile', { url: `${fintoUrl}/v1`, modello: 'finto', chiave: 'sk-finta' })).stato, 200)
  assert.equal((await chiama('POST', '/api/connettori/desktop', { cartelle: [CARTELLA] })).stato, 200)
  const a = await chiama('GET', '/api/avvio')
  const s = await chiama('POST', '/api/avvio/progetto', { nome: 'New website', obiettivo: 'Launch the new website by October', revisione: a.json.revisione })
  assert.equal(s.json.fase, 'fonte')
  assert.doesNotMatch(registro, /rilettura automatica/, 'il conto era pronto prima del giro di fondo')

  // il giro di fondo legge il Mac, e la pagina non parte: né le priorità, né il feed
  await aspettaChe(() => /rilettura automatica/.test(registro))
  // quello che viene dopo la lettura (le priorità, il feed degli arrivi) ha il tempo di finire
  await new Promise(r => setTimeout(r, 2000))
  assert.doesNotMatch(registro, /prima pagina · comincia/)
  assert.equal(priorita.length, 0, `il giro di fondo ha chiesto le priorità sul passo delle fonti:\n${registro.slice(-1500)}`)
  assert.equal((await chiama('GET', '/api/feed')).json.aperti?.length ?? 0, 0, 'il giro di fondo ha messo carte sul feed prima di «Leggi»')
  const attesa = await chiama('GET', '/api/avvio/pagina')
  assert.ok(attesa.json.trovato.file >= 4, JSON.stringify(attesa.json))
  // e nemmeno la domanda della pagina la fa partire, finché le fonti non sono scelte
  await new Promise(r => setTimeout(r, 400))
  assert.notEqual((await chiama('GET', '/api/avvio/pagina')).json.pagina, 'pronta')
  assert.doesNotMatch(registro, /prima pagina · comincia/)

  // lui preme «Leggi»: la lettura delle fonti che ha scelto fa la pagina (counter-case)
  const r = await fetch(`${base}/api/sincronizza`, { headers: { authorization: `Bearer ${TOKEN}` } })
  assert.equal(r.status, 200)
  assert.match(await r.text(), /"fase":"fine"/)
  await aspettaChe(async () => (await chiama('GET', '/api/avvio/pagina')).json.pagina === 'pronta')
  assert.match(registro, /prima pagina · comincia/)
  assert.match(registro, /prima pagina · pronta in \d+ ms · 1 carte\n/)
  // e la pagina ha la sua priorità: il giro di fondo non le ha tolto il turno
  assert.equal(priorita.length, 1)
  const feed = (await chiama('GET', '/api/feed')).json.aperti as { titolo: string }[]
  assert.deepEqual(feed.map(v => v.titolo), ['Write the new homepage'])
})
