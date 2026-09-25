// La salute delle fonti, provata dalle rotte vere.
//
// Un server vero in una casa finta: le Note con l'archivio chiuso (mode 000,
// come un Mac senza accesso completo al disco), un calendario su un server
// qui dentro, l'account di Claude scelto e un `claude` finto che dice «non
// sei entrato». Poi i gesti: una lettura, il calendario che comincia a dire
// 403, un riavvio, il permesso che torna, l'accesso rifatto. Ogni volta si
// guarda cosa risponde `/api/stato`, che è quello che la pagina mostra.
//
//   node --test server/salute-rotte.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { corpoNota, scriviDb } from './note-finta.ts'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-salute-casa-'))
const DATI = mkdtempSync(join(tmpdir(), 'myynd-salute-dati-'))
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

const ICAL = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Prova//IT', 'X-WR-CALNAME:Lavoro',
  'BEGIN:VEVENT', 'UID:uno@prova', 'DTSTAMP:20260920T090000Z', 'DTSTART:20260925T090000Z', 'DTEND:20260925T100000Z', 'SUMMARY:Riunione con Northwind', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:due@prova', 'DTSTAMP:20260920T090000Z', 'DTSTART:20260926T140000Z', 'DTEND:20260926T150000Z', 'SUMMARY:Revisione del piano', 'END:VEVENT',
  'END:VCALENDAR', ''
].join('\r\n')

let calendario: Server
let calendarioRisponde: 200 | 403 = 200
let icalUrl = ''
let server: ChildProcess | null = null
let base = ''
let registro = ''

const FILE_NOTE = () => join(CASA, 'Library', 'Group Containers', 'group.com.apple.notes', 'NoteStore.sqlite')

async function accendi() {
  const { ANTHROPIC_API_KEY: _a, OPENAI_API_KEY: _o, MYYND_POSTGRES: _p, MYYND_TYPESAFE: _t, RAILWAY_ENVIRONMENT: _r, MYYND_VERSIONE: _v, ...ambiente } = process.env
  const s = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.ts'], {
    cwd: new URL('..', import.meta.url).pathname,
    // nessuna API vera: Anthropic punta a un indirizzo che non risponde
    env: { ...ambiente, HOME: CASA, MYYND_DATI: DATI, MYYND_DEV: '1', PORT: '0', ANTHROPIC_BASE_URL: 'http://127.0.0.1:9' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  server = s
  base = await new Promise<string>((risolvi, rifiuta) => {
    let fuori = ''
    const tetto = setTimeout(() => rifiuta(new Error(`il server non è partito:\n${fuori}`)), 20_000)
    s.stdout!.on('data', d => {
      fuori += String(d); registro += String(d)
      const m = fuori.match(/server su (http:\/\/127\.0\.0\.1:\d+)/)
      if (m) { clearTimeout(tetto); risolvi(m[1]) }
    })
    s.stderr!.on('data', d => { fuori += String(d); registro += String(d) })
    s.on('exit', c => { clearTimeout(tetto); rifiuta(new Error(`il server è uscito (${c}):\n${fuori}`)) })
  })
  // la sessione di sviluppo nasce dopo la password del conto: si bussa finché non apre
  let p = await chiama('GET', '/api/stato')
  for (let i = 0; p.stato === 401 && i < 100; i++) {
    await new Promise(r => setTimeout(r, 100))
    p = await chiama('GET', '/api/stato')
  }
  assert.equal(p.stato, 200, JSON.stringify(p.json))
}

async function spegni() {
  const s = server
  server = null
  if (!s || s.exitCode !== null) return
  await new Promise<void>(r => { s.once('exit', () => r()); s.kill('SIGKILL') })
}

before(async () => {
  mkdirSync(join(CASA, '.local', 'bin'), { recursive: true })
  mkdirSync(join(CASA, '.fc'), { recursive: true })
  writeFileSync(join(CASA, '.local', 'bin', 'claude'), FINTO_CLAUDE)
  chmodSync(join(CASA, '.local', 'bin', 'claude'), 0o755)
  // le Note ci sono, ma chiuse: come un Mac che non ha dato l'accesso completo al disco
  scriviDb(CASA, [{ pk: 1, titolo: 'Note' }], [])
  chmodSync(FILE_NOTE(), 0o000)

  calendario = createServer((req, res) => {
    req.resume()
    if (calendarioRisponde === 403) { res.statusCode = 403; return res.end('no') }
    res.setHeader('content-type', 'text/calendar')
    res.end(ICAL)
  })
  await new Promise<void>(r => calendario.listen(0, '127.0.0.1', r))
  const a = calendario.address()
  icalUrl = `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}/lavoro.ics`

  await accendi()
  await chiama('POST', '/api/profilo', { onboarding: true, giro: true, lingua: 'en', nome: 'Prova' })
  correggiConfig(c => {
    c.note = {}
    c.calendario = { url: icalUrl, giorni: 30, nome: 'Lavoro' }
    c.claudeCon = 'abbonamento'
    c.motore = 'claude'
    delete c.compatibile; delete c.openai; delete c.claude
  })
})

after(async () => {
  await spegni()
  await new Promise<void>(r => calendario?.close(() => r()))
  try { chmodSync(FILE_NOTE(), 0o600) } catch { /* già tolto */ }
  rmSync(CASA, { recursive: true, force: true })
  rmSync(DATI, { recursive: true, force: true })
})

async function chiama(metodo: string, percorso: string, corpo?: unknown): Promise<{ stato: number; json: Record<string, any>; testo: string }> {
  const r = await fetch(base + percorso, {
    method: metodo,
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) })
  })
  const testo = await r.text()
  let json: Record<string, any> = {}
  try { json = JSON.parse(testo) } catch { /* un flusso, o niente */ }
  return { stato: r.status, json, testo }
}

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

/** Una lettura, fino in fondo: gli eventi del flusso. */
async function leggi(fonte?: string): Promise<Record<string, any>[]> {
  const r = await chiama('GET', `/api/sincronizza${fonte ? `?fonte=${fonte}` : ''}`)
  assert.equal(r.stato, 200, r.testo)
  return r.testo.split('\n').filter(l => l.startsWith('data: ')).map(l => JSON.parse(l.slice(6)))
}

/** Aspetta che lo stato dica una cosa, fino a un tetto. */
async function aspetta<T>(leggi: () => Promise<T>, vale: (x: T) => boolean, ms = 10_000): Promise<T> {
  const fine = Date.now() + ms
  let x = await leggi()
  while (!vale(x) && Date.now() < fine) { await new Promise(r => setTimeout(r, 150)); x = await leggi() }
  return x
}

const stato = async () => (await chiama('GET', '/api/stato')).json
const incompleta = (s: Record<string, any>, id: string) => (s.letturaIncompleta as Record<string, any>[]).find(f => f.fonte === id)
const connettore = (s: Record<string, any>, id: string) => (s.connettori as Record<string, any>[]).find(c => c.id === id)

test('una lettura: le Note senza permesso si dicono subito, il calendario è pulito, Anthropic uscito è un guaio del motore', async () => {
  const eventi = await leggi()
  const guaioNote = eventi.find(e => e.fase === 'note' && e.stato === 'guaio')
  assert.ok(guaioNote, JSON.stringify(eventi))
  assert.equal(guaioNote.rimedio, 'permesso-disco')
  assert.ok(eventi.find(e => e.fase === 'calendario' && e.stato === 'fatto'), JSON.stringify(eventi))
  const s = await aspetta(stato, x => !!x.testa)
  assert.equal(incompleta(s, 'note')?.rimedio, 'permesso-disco')
  assert.equal(incompleta(s, 'note')?.motivo, 'non-disponibile')
  assert.equal(incompleta(s, 'calendario'), undefined)
  assert.equal(connettore(s, 'claude')?.problema, 'accedi')
  assert.equal(connettore(s, 'note')?.problema, 'permesso-disco')
  assert.equal(connettore(s, 'calendario')?.problema, undefined)
  assert.deepEqual(s.testa, { id: 'claude', rimedio: 'accedi' })
  // i motori non stanno mai nell'elenco delle fonti
  assert.equal(incompleta(s, 'claude'), undefined)
  assert.equal(s.osservaTitoli, false)
})

test('il calendario comincia a dire 403: si mostra subito, e le Note restano', async () => {
  calendarioRisponde = 403
  const eventi = await leggi('calendario')
  assert.ok(eventi.find(e => e.fase === 'calendario' && e.stato === 'guaio' && e.rimedio === 'credenziale'), JSON.stringify(eventi))
  const s = await stato()
  assert.equal(incompleta(s, 'calendario')?.rimedio, 'credenziale')
  assert.equal(incompleta(s, 'note')?.rimedio, 'permesso-disco')
  assert.equal(connettore(s, 'calendario')?.problema, 'credenziale')
})

test('dopo un riavvio i due guai ci sono ancora, prima di qualunque lettura', async () => {
  await spegni()
  await accendi()
  const s = await stato()
  assert.equal(incompleta(s, 'calendario')?.rimedio, 'credenziale')
  assert.equal(incompleta(s, 'note')?.rimedio, 'permesso-disco')
})

test('il permesso torna: le Note spariscono dalla riga al primo stato, e si rileggono pulite da sole', async () => {
  rmSync(FILE_NOTE(), { force: true })
  scriviDb(CASA, [{ pk: 1, titolo: 'Note' }], [{ pk: 10, id: 'N1', titolo: 'Piano Northwind', cartella: 1, modificata: 780_000_000, corpo: corpoNota('Piano Northwind\nle tre cose da fare') }])
  chmodSync(FILE_NOTE(), 0o600)
  const s = await stato()
  assert.equal(incompleta(s, 'note'), undefined, 'la riga dice ancora le Note dopo che il permesso è tornato')
  assert.equal(incompleta(s, 'calendario')?.rimedio, 'credenziale')
  const oggi = await aspetta(async () => (await chiama('GET', '/api/fonti/salute?giorni=1&fonte=note')).json,
    j => (j.giorni?.[0]?.fonti?.[0]?.pulite ?? 0) > 0)
  const riga = oggi.giorni[0].fonti[0]
  assert.equal(riga.fonte, 'note')
  assert.ok(riga.pulite >= 1, JSON.stringify(oggi))
  assert.ok(riga.guai >= 1, 'la mattina con il permesso mancante resta scritta')
  assert.equal(riga.verdetto, 'guasto', 'un giorno con un guaio che resta è guasto anche se poi si è sistemato')
  assert.equal(oggi.adesso.length, 0)
})

test('rientrare nell’account di Claude toglie il guaio del motore', async () => {
  const { json } = await chiama('POST', '/api/modello/abbonamento/accesso')
  let fatto = false
  for (let i = 0; i < 60 && !fatto; i++) {
    const r = await chiama('GET', `/api/modello/abbonamento/accesso/${json.loginId}`)
    fatto = r.json.stato === 'completed'
    if (!fatto) await new Promise(r => setTimeout(r, 100))
  }
  assert.ok(fatto, 'l’accesso finto non è finito')
  const chiamate = readFileSync(join(CASA, '.fc', 'chiamate'), 'utf8')
  assert.match(chiamate, /auth status/)
  assert.match(chiamate, /auth login/)
  const s = await aspetta(stato, x => !x.testa)
  assert.equal(s.testa, null)
  assert.equal(connettore(s, 'claude')?.problema, undefined)
  assert.equal(connettore(s, 'claude')?.collegato, true)
})

test('la rotta dei giorni: trenta di serie, oggi per ultimo, e il conto; non è un cambio di collegamento; il fascicolo la porta', async () => {
  const r = await chiama('GET', '/api/fonti/salute')
  assert.equal(r.stato, 200)
  assert.equal(r.json.giorni.length, 30)
  const oggi = r.json.giorni[29]
  assert.equal(oggi.chiuso, false)
  const fonti = oggi.fonti.map((f: { fonte: string }) => f.fonte).sort()
  for (const f of ['calendario', 'claude', 'note']) assert.ok(fonti.includes(f), JSON.stringify(fonti))
  assert.equal(oggi.fonti.find((f: { fonte: string }) => f.fonte === 'calendario').verdetto, 'guasto')
  assert.deepEqual(Object.keys(r.json.sintesi).sort(), ['aperti', 'dopoAggiornamento', 'misurati', 'muti', 'obiettivo', 'puliti'])
  assert.equal(r.json.sintesi.obiettivo, 29)
  // i giorni fuori dall'intervallo e le fonti strane si correggono, non rompono
  assert.equal((await chiama('GET', '/api/fonti/salute?giorni=500')).json.giorni.length, 90)
  assert.equal((await chiama('GET', '/api/fonti/salute?giorni=0')).json.giorni.length, 30)
  const strana = await chiama('GET', '/api/fonti/salute?giorni=2&fonte=../x')
  assert.equal(strana.stato, 200)
  assert.equal(strana.json.giorni.length, 2)

  const { cambiaUnCollegamento } = await import('./collegamenti.ts')
  assert.equal(cambiaUnCollegamento('GET', '/api/fonti/salute', {}), false)

  const dati = await chiama('POST', '/api/conto/dati', { password: TOKEN })
  assert.equal(dati.stato, 200, dati.testo.slice(0, 300))
  assert.match(dati.testo, /"salute_fonti"/)
  assert.match(dati.testo, /"fonte":\s*"calendario"/)
  // nessuna chiamata fuori da qui: il calendario è qui dentro, Claude Code è finto
  assert.doesNotMatch(registro, /api\.anthropic\.com/)
})
