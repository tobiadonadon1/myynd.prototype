// Il giro dei dieci minuti sul passo delle fonti, sul server vero (P4).
//
// Tre cose che si vedevano solo con un giro di fondo che parte mentre lui
// sceglie ancora le fonti: chi ricarica non deve ritrovarsi a guardare una
// lettura che non ha chiesto (e poi al passo dopo); un file entrato dalla
// vedetta prima della lettura non deve chiudere la prima lettura del Mac; e
// «Leggi» premuto mentre il giro legge si attacca, e da lì la lettura è sua:
// la prima pagina si fa alla fine, con la sua priorità.
//
//   node --test server/prima-pagina-sfondo.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-pagina-sfondo-casa-'))
const DATI = mkdtempSync(join(tmpdir(), 'myynd-pagina-sfondo-dati-'))
const TOKEN = 'sviluppo-non-in-produzione'
const CARTELLA = join(CASA, 'Lavoro')
/** Il primo giro di fondo: dopo che la vedetta ha visto il file nuovo. */
const PRIMO_GIRO_MS = 9000

// — l'agenda finta: risponde solo quando la si lascia andare —
let trattieni = false
let inAttesa: (() => void)[] = []
const lasciaAgenda = () => { trattieni = false; const x = inAttesa; inAttesa = []; for (const f of x) f() }
function ics(): string {
  const riga = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const ev = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.now() + (i - 3) * 2 * 86_400_000)
    return `BEGIN:VEVENT\r\nUID:ev${i}@finto\r\nDTSTART:${riga(d)}\r\nDTEND:${riga(new Date(d.getTime() + 3_600_000))}\r\nSUMMARY:Riunione ${i}\r\nEND:VEVENT`
  }).join('\r\n')
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nX-WR-CALNAME:Lavoro\r\n${ev}\r\nEND:VCALENDAR\r\n`
}

/** Le chiamate al modello per le priorità. */
let priorita = 0
function risposta(corpo: string): unknown {
  if (!corpo.includes('capo di gabinetto')) return { voci: [] }
  priorita++
  // la pagina parte prima del Mac: il file che c'è già è quello della vedetta
  const doc = corpo.match(/desktop:[^\s"\\]*scaricato\.md/)?.[0] ?? ''
  return {
    priorita: doc ? [{
      genere: 'priorita', titolo: 'File the downloaded note', testo: 'The note you downloaded belongs to the new website.',
      perche: 'You downloaded it while setting up.', progetto: 'New website', doc,
      offerta: 'I can file it for you.', quando: '', prova: 'Un file scaricato mentre sceglie le fonti'
    }] : [],
    domande: [], superate: []
  }
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
    let corpo = ''
    req.on('data', d => { corpo += String(d) })
    req.on('end', () => {
      if (req.url?.startsWith('/agenda.ics')) {
        const manda = () => { res.setHeader('content-type', 'text/calendar'); res.end(ics()) }
        if (trattieni) inAttesa.push(manda); else manda()
        return
      }
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
  lasciaAgenda()
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
  throw new Error(`la condizione non si è mai avverata:\n${registro.slice(-2500)}`)
}
const dorme = (ms: number) => new Promise(r => setTimeout(r, ms))

test('sul passo delle fonti il giro di fondo non è una lettura sua; il Mac visto dalla vedetta resta una prima lettura; «Leggi» che si attacca fa la pagina', async () => {
  let p = await chiama('POST', '/api/profilo', { lingua: 'en', nome: 'Prova' })
  for (let i = 0; p.stato === 401 && i < 100; i++) { await dorme(100); p = await chiama('POST', '/api/profilo', { lingua: 'en', nome: 'Prova' }) }
  assert.equal(p.stato, 200, JSON.stringify(p.json))
  assert.equal((await chiama('POST', '/api/connettori/compatibile', { url: `${fintoUrl}/v1`, modello: 'finto', chiave: 'sk-finta' })).stato, 200)
  assert.equal((await chiama('POST', '/api/connettori/desktop', { cartelle: [CARTELLA] })).stato, 200)
  // un file nuovo sotto la cartella guardata, prima di qualunque lettura: lo indicizza la vedetta
  await dorme(500)
  writeFileSync(join(CARTELLA, 'scaricato.md'), 'Un file scaricato mentre sceglie le fonti: la vedetta lo mette nell’indice.')
  assert.equal((await chiama('POST', '/api/connettori/calendario', { url: `${fintoUrl}/agenda.ics` })).stato, 200)
  const a = await chiama('GET', '/api/avvio')
  const s = await chiama('POST', '/api/avvio/progetto', { nome: 'New website', obiettivo: 'Launch the new website by October', revisione: a.json.revisione })
  assert.equal(s.json.fase, 'fonte')
  assert.doesNotMatch(registro, /rilettura automatica/, 'il conto era pronto prima del giro di fondo')

  // il giro di fondo parte e si ferma sull'agenda: sta leggendo, ma non per lui
  trattieni = true
  await aspettaChe(() => inAttesa.length > 0)
  assert.equal((await chiama('GET', '/api/avvio')).json.leggendo, false, 'chi ricarica sul passo delle fonti resta sulle schede')
  assert.equal((await chiama('GET', '/api/avvio/pagina')).json.lettura, null)

  // lui preme «Leggi»: si attacca al giro, e da qui la lettura è sua (counter-case)
  const r = await fetch(`${base}/api/sincronizza`, { headers: { authorization: `Bearer ${TOKEN}` } })
  assert.equal(r.status, 200)
  const testo = r.text()
  await aspettaChe(async () => (await chiama('GET', '/api/avvio')).json.leggendo === true, 5000)
  lasciaAgenda()
  assert.match(await testo, /"fase":"fine"/)

  // la prima pagina la fa il giro a cui si è attaccato, con la priorità
  await aspettaChe(async () => (await chiama('GET', '/api/avvio/pagina')).json.pagina === 'pronta')
  assert.equal(priorita, 1, 'un giro di priorità, quello della pagina')
  const feed = (await chiama('GET', '/api/feed')).json.aperti as { titolo: string }[]
  assert.deepEqual(feed.map(v => v.titolo), ['File the downloaded note'], registro.slice(-3000))

  // e il Mac, anche con il file della vedetta già dentro, ha fatto la sua prima lettura
  assert.match(registro, /prima lettura · desktop completa/, 'il segno del Mac era «in corso» prima che la vedetta scrivesse')
})
