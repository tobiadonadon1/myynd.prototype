// Una lettura sola, che va fino in fondo (P4), provata sul server vero.
//
// Un server acceso in una casa finta, con un calendario iCal finto che
// risponde solo quando lo si lascia andare, una cartella del Mac finta, una
// Mail del Mac finta e un modello finto che può trattenere le risposte. Si
// guarda quello che una pagina vede: la lettura che continua quando la pagina
// se ne va, la seconda pagina che si attacca, il 409 per una fonte sola, e la
// prima pagina che tiene la serratura dopo «fine».
//
//   node --test server/lettura-viva.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { costruisciMail } from './posta-mac-finta.ts'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-viva-casa-'))
const DATI = mkdtempSync(join(tmpdir(), 'myynd-viva-dati-'))
const TOKEN = 'sviluppo-non-in-produzione'
const CARTELLA = join(CASA, 'Lavoro')

// — l'agenda finta: risponde solo quando la si lascia andare —
let trattieni = false
let inAttesa: (() => void)[] = []
const lasciaAgenda = () => { trattieni = false; const x = inAttesa; inAttesa = []; for (const f of x) f() }
function ics(): string {
  const riga = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const ev = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.now() + (i - 6) * 3 * 86_400_000)
    return `BEGIN:VEVENT\r\nUID:ev${i}@finto\r\nDTSTART:${riga(d)}\r\nDTEND:${riga(new Date(d.getTime() + 3_600_000))}\r\nSUMMARY:Riunione ${i}\r\nEND:VEVENT`
  }).join('\r\n')
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nX-WR-CALNAME:Lavoro\r\n${ev}\r\nEND:VCALENDAR\r\n`
}

// — il modello finto: conta le richieste, e sa trattenerle —
let richiesteModello = 0
let trattieniModello = false
let modelloInAttesa: (() => void)[] = []
const lasciaModello = () => { trattieniModello = false; const x = modelloInAttesa; modelloInAttesa = []; for (const f of x) f() }
const risposta = (res: ServerResponse) => {
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify({ id: 'c1', object: 'chat.completion', model: 'finto', choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify({ voci: [] }) }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }))
}

let finto: Server
let fintoUrl = ''
let server: ChildProcess
let base = ''
let registro = ''

before(async () => {
  mkdirSync(CARTELLA, { recursive: true })
  for (let i = 0; i < 4; i++) writeFileSync(join(CARTELLA, `appunti-${i}.md`), `Appunti ${i} sul sito nuovo: la pagina iniziale va scritta entro venerdì, con le foto del team.`)
  costruisciMail(CASA, { caselle: 1, inArrivo: 6, inviate: 2, vecchie: 0, spazzatura: 1 })
  finto = createServer((req, res) => {
    let corpo = ''
    req.on('data', d => { corpo += d })
    req.on('end', () => {
      if (req.url?.startsWith('/agenda.ics')) {
        const manda = () => { res.setHeader('content-type', 'text/calendar'); res.end(ics()) }
        if (trattieni) inAttesa.push(manda); else manda()
        return
      }
      if (req.url?.endsWith('/models')) { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ data: [{ id: 'finto' }] })) }
      if (req.url?.includes('/chat/completions')) {
        richiesteModello++
        if (trattieniModello) { modelloInAttesa.push(() => risposta(res)); return }
        return risposta(res)
      }
      res.statusCode = 404; res.end('{}')
    })
  })
  await new Promise<void>(r => finto.listen(0, '127.0.0.1', r))
  const a = finto.address()
  fintoUrl = `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}`
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.ts'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { PATH: process.env.PATH ?? '', HOME: CASA, MYYND_DATI: DATI, MYYND_DEV: '1', PORT: '0', NODE_ENV: 'test', MYYND_SENZA_APP_MAC: '1' },
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
  let p = await chiama('POST', '/api/profilo', { onboarding: true, giro: true, lingua: 'en', nome: 'Prova' })
  for (let i = 0; p.stato === 401 && i < 100; i++) {
    await new Promise(r => setTimeout(r, 100))
    p = await chiama('POST', '/api/profilo', { onboarding: true, giro: true, lingua: 'en', nome: 'Prova' })
  }
  assert.equal(p.stato, 200, JSON.stringify(p.json))
})

after(async () => {
  lasciaAgenda(); lasciaModello()
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

type Evento = Record<string, any>
/** Una lettura in streaming, come la apre la pagina: gli eventi arrivano, e si può aspettarne uno. */
function leggi(fonte?: string) {
  const ferma = new AbortController()
  const eventi: Evento[] = []
  let stato = 0
  const attese: { se: (e: Evento) => boolean; ok: (e: Evento) => void }[] = []
  const finito = (async () => {
    const r = await fetch(`${base}/api/sincronizza${fonte ? `?fonte=${fonte}` : ''}`, { headers: { authorization: `Bearer ${TOKEN}` }, signal: ferma.signal })
    stato = r.status
    if (r.status !== 200) return
    const lettore = r.body!.getReader()
    let resto = ''
    for (;;) {
      const { value, done } = await lettore.read()
      if (done) break
      resto += Buffer.from(value).toString('utf8')
      let i: number
      while ((i = resto.indexOf('\n\n')) >= 0) {
        const pezzo = resto.slice(0, i); resto = resto.slice(i + 2)
        if (!pezzo.startsWith('data: ')) continue
        const e = JSON.parse(pezzo.slice(6)) as Evento
        eventi.push(e)
        for (const a of [...attese]) if (a.se(e)) { attese.splice(attese.indexOf(a), 1); a.ok(e) }
      }
    }
  })().catch(() => {})
  const aspetta = (se: (e: Evento) => boolean, ms = 15_000) => new Promise<Evento>((ok, no) => {
    const gia = eventi.find(se)
    if (gia) return ok(gia)
    const t = setTimeout(() => no(new Error(`evento mai arrivato; visti: ${JSON.stringify(eventi).slice(0, 600)}`)), ms)
    attese.push({ se, ok: e => { clearTimeout(t); ok(e) } })
  })
  return { eventi, aspetta, finito, stato: () => stato, chiudi: () => ferma.abort() }
}

const conteggio = async (fonte: string) => {
  const { json } = await chiama('GET', '/api/stato')
  return (json.connettori as { id: string; documenti: number }[]).find(c => c.id === fonte)?.documenti ?? 0
}
const aspettaChe = async (f: () => Promise<boolean>, ms = 15_000) => {
  const fine = Date.now() + ms
  while (Date.now() < fine) { if (await f()) return; await new Promise(r => setTimeout(r, 100)) }
  throw new Error('la condizione non si è mai avverata')
}

test('la prima lettura va avanti quando la pagina si chiude, e dice «leggendo» solo mentre legge', async () => {
  assert.equal((await chiama('POST', '/api/connettori/calendario', { url: `${fintoUrl}/agenda.ics` })).stato, 200)
  assert.equal((await chiama('POST', '/api/connettori/desktop', { cartelle: [CARTELLA] })).stato, 200)
  trattieni = true
  const l = leggi()
  const inizio = await l.aspetta(e => e.fase === 'inizio')
  assert.deepEqual([...inizio.fonti].sort(), ['calendario', 'desktop'])
  await l.aspetta(e => e.fase === 'calendario')
  assert.equal((await chiama('GET', '/api/avvio')).json.leggendo, true)
  l.chiudi()
  await new Promise(r => setTimeout(r, 100))
  lasciaAgenda()
  // il Mac viene dopo l'agenda: si legge anche se nessuno guarda più
  await aspettaChe(async () => await conteggio('desktop') >= 4)
  await aspettaChe(async () => (await chiama('GET', '/api/avvio')).json.leggendo === false)
  assert.equal(await conteggio('calendario'), 12)
  // prima l'agenda, poi il Mac, e il tempo di ognuno nel registro
  const a = registro.indexOf('prima lettura · calendario ·'), m = registro.indexOf('prima lettura · desktop ·')
  assert.ok(a >= 0 && m > a, 'l’agenda prima del Mac')
})

test('una seconda pagina si attacca, una fonte sola aspetta il suo turno, e una fonte collegata dopo non è fra quelle lette', async () => {
  await aspettaChe(async () => (await chiama('GET', '/api/avvio/pagina')).json.lettura === null)
  trattieni = true
  const a = leggi()
  await a.aspetta(e => e.fase === 'calendario')
  // non è più una prima lettura (counter-case)
  assert.equal((await chiama('GET', '/api/avvio')).json.leggendo, false)
  const b = leggi()
  const inizio = await b.aspetta(e => e.fase === 'inizio')
  assert.deepEqual([...inizio.fonti].sort(), ['calendario', 'desktop'])
  await b.aspetta(e => e.fase === 'calendario' && e.stato === 'apro l’agenda')
  const una = leggi('desktop')
  await una.finito
  assert.equal(una.stato(), 409)
  // Mail del Mac, collegata mentre si legge: questa lettura non la conosce
  assert.equal((await chiama('POST', '/api/connettori/postamac', {})).stato, 200)
  lasciaAgenda()
  const [fa, fb] = await Promise.all([a.aspetta(e => e.fase === 'fine'), b.aspetta(e => e.fase === 'fine')])
  assert.equal(fa.totale, fb.totale)
  assert.ok(!b.eventi.some(e => e.fase === 'postamac'), 'la fonte collegata dopo non era in questa lettura')
})

test('la prima pagina tiene la serratura dopo «fine»: l’occhio risponde «già» senza chiamare il modello', async () => {
  // la lettura in sottofondo di Mail del Mac, partita dopo quella di prima, deve aver finito
  await aspettaChe(async () => (await chiama('GET', '/api/avvio/pagina')).json.lettura === null, 20_000)
  // Mail del Mac torna a essere una prima lettura
  assert.equal((await chiama('DELETE', '/api/connettori/postamac')).stato, 200)
  assert.equal((await chiama('POST', '/api/connettori/postamac', {})).stato, 200)
  assert.equal((await chiama('POST', '/api/connettori/compatibile', { url: `${fintoUrl}/v1`, modello: 'finto', chiave: 'sk-finta' })).stato, 200)
  trattieniModello = true
  const prima = richiesteModello
  const l = leggi()
  await l.aspetta(e => e.fase === 'fine', 20_000)
  await aspettaChe(async () => richiesteModello > prima)
  const trattenute = richiesteModello
  const occhio = await chiama('POST', '/api/feed/genera')
  assert.equal(occhio.json.gia, true)
  assert.equal(richiesteModello, trattenute, 'l’occhio non ha chiamato il modello')
  assert.equal((await chiama('GET', '/api/avvio/pagina')).json.pagina, 'lavoro')
  assert.ok(registro.indexOf('prima pagina · comincia') < registro.lastIndexOf('prima lettura · desktop ·'), 'la pagina comincia prima del Mac')
  lasciaModello()
  await aspettaChe(async () => (await chiama('GET', '/api/avvio/pagina')).json.pagina === 'pronta', 20_000)
  const pagina = await chiama('GET', '/api/avvio/pagina')
  assert.equal(pagina.json.trovato.email, 8)
  assert.equal(pagina.json.trovato.evento, 12)
  assert.ok(pagina.json.trovato.file >= 4)
})
