// «Leggi» che si attacca al giro di fondo, con una fonte collegata dopo che
// il giro è partito, sul server vero (P4).
//
// Il caso vero: lui è sul passo delle fonti, il giro dei dieci minuti parte e
// cammina sull'agenda e sul Mac; intanto collega Mail di questo Mac (dopo il
// riavvio per l'accesso completo al disco) e preme «Leggi», che si attacca.
// Il giro non ha la posta fra le sue fonti: se facesse lui la prima pagina,
// uscirebbe senza, e con una carta non si rifarebbe più. La pagina aspetta la
// lettura che il client fa partire per la riga rimasta «In coda», e lì la
// posta c'è.
//
//   node --test server/prima-pagina-attacco.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { costruisciMail } from './posta-mac-finta.ts'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-pagina-attacco-casa-'))
const DATI = mkdtempSync(join(tmpdir(), 'myynd-pagina-attacco-dati-'))
const TOKEN = 'sviluppo-non-in-produzione'
const CARTELLA = join(CASA, 'Lavoro')
const PRIMO_GIRO_MS = 6000

// — l'agenda finta: risponde solo quando la si lascia andare —
let trattieni = false
let inAttesa: (() => void)[] = []
const lasciaAgenda = () => { trattieni = false; const x = inAttesa; inAttesa = []; for (const f of x) f() }
function ics(): string {
  const riga = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const ev = Array.from({ length: 4 }, (_, i) => {
    const d = new Date(Date.now() + (i - 2) * 86_400_000)
    return `BEGIN:VEVENT\r\nUID:ev${i}@finto\r\nDTSTART:${riga(d)}\r\nDTEND:${riga(new Date(d.getTime() + 3_600_000))}\r\nSUMMARY:Riunione ${i}\r\nEND:VEVENT`
  }).join('\r\n')
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nX-WR-CALNAME:Lavoro\r\n${ev}\r\nEND:VCALENDAR\r\n`
}

/** Le chiamate al modello: se erano per le priorità, e se avevano davanti la posta del Mac. */
const chiamate: { priorita: boolean; posta: boolean }[] = []
function risposta(corpo: string): unknown {
  const priorita = corpo.includes('capo di gabinetto')
  chiamate.push({ priorita, posta: corpo.includes('postamac:') })
  if (!priorita) return { voci: [] }
  // una carta dall'agenda o dal Mac: basta una carta perché la pagina sia fatta per sempre
  const doc = corpo.match(/desktop:[^\s"\\]*appunti-0\.md/)?.[0] ?? ''
  return {
    priorita: doc ? [{
      genere: 'priorita', titolo: 'Write the homepage', testo: 'The homepage notes are waiting for the new website.',
      perche: 'Your notes say it is due this week.', progetto: 'New website', doc,
      offerta: 'I can draft it.', quando: '', prova: 'Appunti sulla pagina iniziale'
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
  for (let i = 0; i < 3; i++) writeFileSync(join(CARTELLA, `appunti-${i}.md`), `Appunti ${i} sul sito nuovo: la pagina iniziale va scritta entro venerdì.`)
  costruisciMail(CASA, { caselle: 1, inArrivo: 12, inviate: 3, vecchie: 0, spazzatura: 0 })
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
const fontiDellInizio = (testo: string) => JSON.parse(testo.match(/"fase":"inizio","fonti":(\[[^\]]*\])/)?.[1] ?? 'null') as string[] | null

test('la posta collegata a giro già partito: «Leggi» si attacca, ma la prima pagina aspetta la lettura che la legge', async () => {
  let p = await chiama('POST', '/api/profilo', { lingua: 'en', nome: 'Prova' })
  for (let i = 0; p.stato === 401 && i < 100; i++) { await dorme(100); p = await chiama('POST', '/api/profilo', { lingua: 'en', nome: 'Prova' }) }
  assert.equal(p.stato, 200, JSON.stringify(p.json))
  assert.equal((await chiama('POST', '/api/connettori/compatibile', { url: `${fintoUrl}/v1`, modello: 'finto', chiave: 'sk-finta' })).stato, 200)
  // la prova del collegamento parla col modello: da qui si contano solo le chiamate delle letture
  chiamate.length = 0
  assert.equal((await chiama('POST', '/api/connettori/desktop', { cartelle: [CARTELLA] })).stato, 200)
  assert.equal((await chiama('POST', '/api/connettori/calendario', { url: `${fintoUrl}/agenda.ics` })).stato, 200)
  const a = await chiama('GET', '/api/avvio')
  assert.equal((await chiama('POST', '/api/avvio/progetto', { nome: 'New website', obiettivo: 'Launch the new website by October', revisione: a.json.revisione })).json.fase, 'fonte')

  // il giro di fondo parte e si ferma sull'agenda; la posta del Mac si collega adesso
  trattieni = true
  await aspettaChe(() => inAttesa.length > 0)
  const pm = await chiama('POST', '/api/connettori/postamac')
  assert.equal(pm.stato, 200, JSON.stringify(pm.json))

  // «Leggi» si attacca: la lettura è sua, ma la posta non è fra le fonti del giro
  const r = await fetch(`${base}/api/sincronizza`, { headers: { authorization: `Bearer ${TOKEN}` } })
  assert.equal(r.status, 200)
  const testo = r.text()
  await aspettaChe(async () => (await chiama('GET', '/api/avvio')).json.leggendo === true, 5000)
  lasciaAgenda()
  const inizio = fontiDellInizio(await testo)
  assert.ok(inizio && !inizio.includes('postamac'), `il giro è partito prima della posta: ${JSON.stringify(inizio)}`)

  // il giro finisce senza la pagina: la posta del Mac non l'ha ancora letta nessuno
  await aspettaChe(() => /prima pagina · aspetta la lettura di postamac/.test(registro))
  assert.doesNotMatch(registro, /prima pagina · comincia/, 'la pagina non si fa senza la posta')
  assert.equal(chiamate.length, 0, 'nessun modello prima della lettura della posta')

  // il client rilegge per la riga rimasta «In coda», come `giroTutte`: al 409 riprova
  let r2 = await fetch(`${base}/api/sincronizza`, { headers: { authorization: `Bearer ${TOKEN}` } })
  for (let i = 0; r2.status === 409 && i < 40; i++) { await r2.text(); await dorme(500); r2 = await fetch(`${base}/api/sincronizza`, { headers: { authorization: `Bearer ${TOKEN}` } }) }
  assert.equal(r2.status, 200)
  const seconda = await r2.text()
  assert.ok(fontiDellInizio(seconda)?.includes('postamac'), 'la seconda lettura è di tutte le fonti, la posta compresa')

  // la prima pagina è di questa lettura, e la posta del Mac è arrivata al modello
  await aspettaChe(async () => (await chiama('GET', '/api/avvio/pagina')).json.pagina === 'pronta')
  const feed = chiamate.filter(c => !c.priorita)
  assert.ok(feed.length >= 1 && feed.every(c => c.posta), `la lettura del feed della pagina ha davanti la posta del Mac: ${JSON.stringify(chiamate)}`)
  assert.equal(chiamate.filter(c => c.priorita).length, 1, 'un giro di priorità, quello della pagina')
  assert.equal((registro.match(/prima pagina · comincia/g) ?? []).length, 1, 'una pagina sola')
  const pagina = (await chiama('GET', '/api/avvio/pagina')).json
  assert.ok((pagina.trovato?.email ?? 0) >= 15, JSON.stringify(pagina))
})

test('«Continua» mentre la sua lettura aspetta ancora il turno (dietro al resto): gli estratti sono «a metà lettura», perché lo dice il client', async () => {
  // nessuna lettura di tutte in corso: il registro non lo sa, il client sì
  const a = await chiama('GET', '/api/avvio')
  assert.equal(a.json.fase, 'fonte')
  const fonti = ['calendario', 'desktop', 'postamac']
  const durante = await chiama('POST', '/api/avvio/fonte', { fonti, revisione: a.json.revisione, durante: true })
  assert.equal(durante.stato, 200, JSON.stringify(durante.json))
  assert.equal(durante.json.aMetaLettura, true)
  // a lettura finita, il salvataggio senza `durante` non lo dice (counter-case)
  const dopo = await chiama('POST', '/api/avvio/fonte', { fonti, revisione: durante.json.revisione })
  assert.equal(dopo.stato, 200, JSON.stringify(dopo.json))
  assert.equal(dopo.json.aMetaLettura, undefined)
})
