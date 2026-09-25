// Le rotte della Memoria di P5 su un server vero: correggere una convinzione,
// il sommario delle note, il punto che si spegne dopo la visita, il gusto
// della rassegna senza prepararla, e i progetti nati dalle sue parole.
//
//   node --test server/memoria-p5.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-p5-casa-'))
const DATI = mkdtempSync(join(tmpdir(), 'myynd-p5-dati-'))
const TOKEN = 'sviluppo-non-in-produzione'
const QUI = new URL('.', import.meta.url).pathname

let server: ChildProcess | null = null
let base = ''

async function chiama(metodo: string, percorso: string, corpo?: unknown): Promise<{ stato: number; json: Record<string, unknown> }> {
  const r = await fetch(base + percorso, {
    method: metodo,
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo)
  })
  const testo = await r.text()
  let json: Record<string, unknown> = {}
  try { json = JSON.parse(testo) } catch { /* non JSON */ }
  return { stato: r.status, json }
}

/** Il database del conto di sviluppo, aperto accanto al server (WAL: due connessioni vanno bene). */
function mente(): DatabaseSync {
  const cerca = (d: string): string | null => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (n === 'mente.db') return p
      if (statSync(p).isDirectory()) { const r = cerca(p); if (r) return r }
    }
    return null
  }
  const f = cerca(DATI)
  assert.ok(f, 'manca mente.db')
  return new DatabaseSync(f!)
}

before(async () => {
  const { ANTHROPIC_API_KEY: _a, OPENAI_API_KEY: _o, MYYND_POSTGRES: _p, MYYND_TYPESAFE: _t, RAILWAY_ENVIRONMENT: _r, MYYND_VERSIONE: _v, MYYND_APP: _app, ...ambiente } = process.env
  const s = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.ts'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...ambiente, HOME: CASA, MYYND_DATI: DATI, MYYND_DEV: '1', PORT: '0', ANTHROPIC_BASE_URL: 'http://127.0.0.1:9', MYYND_PROVA_NIENTE_OPEN: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  server = s
  base = await new Promise<string>((risolvi, rifiuta) => {
    let fuori = ''
    const tetto = setTimeout(() => rifiuta(new Error(`il server non è partito:\n${fuori}`)), 20_000)
    s.stdout!.on('data', d => {
      fuori += String(d)
      const m = fuori.match(/server su (http:\/\/127\.0\.0\.1:\d+)/)
      if (m) { clearTimeout(tetto); risolvi(m[1]) }
    })
    s.stderr!.on('data', d => { fuori += String(d) })
    s.on('exit', c => { clearTimeout(tetto); rifiuta(new Error(`il server è uscito (${c}):\n${fuori}`)) })
  })
  let p = await chiama('GET', '/api/stato')
  for (let i = 0; p.stato === 401 && i < 100; i++) {
    await new Promise(r => setTimeout(r, 100))
    p = await chiama('GET', '/api/stato')
  }
  assert.equal(p.stato, 200, JSON.stringify(p.json))
})

after(async () => {
  const s = server
  server = null
  if (s && s.exitCode === null) await new Promise<void>(r => { s.once('exit', () => r()); s.kill('SIGKILL') })
  rmSync(CASA, { recursive: true, force: true })
  rmSync(DATI, { recursive: true, force: true })
})

test('correggi: la vecchia va in «Prima pensava», la nuova è sua', async () => {
  const s = await chiama('POST', '/api/memoria/convinzione', { enunciato: 'Risponde ai fornitori entro sera' })
  assert.equal(s.stato, 200, JSON.stringify(s.json))
  const m0 = await chiama('GET', '/api/memoria')
  const vecchia = (m0.json.convinzioni as { id: string; enunciato: string }[]).find(c => c.enunciato === 'Risponde ai fornitori entro sera')!
  assert.ok(vecchia)
  const r = await chiama('POST', `/api/memoria/convinzione/${vecchia.id}/correggi`, { testo: 'Risponde ai fornitori entro un’ora' })
  assert.equal(r.stato, 200, JSON.stringify(r.json))
  assert.ok(r.json.id && r.json.id !== vecchia.id)
  const m = await chiama('GET', '/api/memoria')
  const vive = m.json.convinzioni as { id: string; genere: string; origine: string }[]
  const storiche = m.json.storiche as { id: string; al: string | null }[]
  const nuova = vive.find(c => c.id === r.json.id)!
  assert.equal(nuova.genere, 'esplicita')
  assert.equal(nuova.origine, 'mano')
  assert.ok(!vive.some(c => c.id === vecchia.id))
  assert.ok(storiche.find(c => c.id === vecchia.id)?.al)
})

test('correggi: vuoto è 400, una che non c’è è 404', async () => {
  const v = await chiama('POST', '/api/memoria/convinzione/qualcosa/correggi', { testo: '   ' })
  assert.equal(v.stato, 400); assert.equal(v.json.errore, 'Scrivi la convinzione.')
  const n = await chiama('POST', '/api/memoria/convinzione/non-esiste/correggi', { testo: 'Una frase' })
  assert.equal(n.stato, 404); assert.equal(n.json.errore, 'Questa convinzione non c’è più.')
})

test('il sommario conta progetti attivi, cose che sa e da guardare', async () => {
  await chiama('POST', '/api/progetti', { nome: 'Northwind', obiettivo: 'Ship Northwind 1.0' })
  const db = mente()
  const ora = new Date().toISOString()
  db.prepare(`INSERT INTO convinzioni (id, enunciato, ambito, genere, fiducia, origine, dal, creata) VALUES ('cx1','Replies to Harbor Labs within the hour','persona','indotta',0.6,'chiusura',?,?)`).run(ora, ora)
  db.close()
  const r = await chiama('GET', '/api/memoria/sommario')
  assert.equal(r.stato, 200, JSON.stringify(r.json))
  const s = r.json as { progettiAttivi: number; ritratto: { sa: number; daGuardare: number }; comeLavori: { daGuardare: number } | null; fatto: unknown }
  assert.ok(s.progettiAttivi >= 1)
  assert.equal(s.ritratto.daGuardare, 1)
  assert.ok(s.ritratto.sa >= 1)
  assert.deepEqual(s.comeLavori, { daGuardare: 0 })
  assert.equal(s.fatto, null)
})

test('dopo la visita il punto è spento; una nuova dopo lo riaccende', async () => {
  const v = await chiama('POST', '/api/memoria/vista')
  assert.equal(v.stato, 200)
  const s = await chiama('GET', '/api/stato')
  assert.deepEqual(s.json.memoriaNuove, { quante: 0, dove: null })
  await new Promise(r => setTimeout(r, 5))
  const db = mente()
  const ora = new Date().toISOString()
  db.prepare(`INSERT INTO convinzioni (id, enunciato, ambito, genere, fiducia, origine, dal, creata) VALUES ('cx2','Prefers calls to email with suppliers','persona','indotta',0.55,'scarti',?,?)`).run(ora, ora)
  db.close()
  const d = await chiama('GET', '/api/stato')
  assert.deepEqual(d.json.memoriaNuove, { quante: 1, dove: 'ritratto' })
})

test('lo stato regge anche se il conto del punto si rompe', async () => {
  const db = mente()
  db.exec('ALTER TABLE abitudini RENAME TO abitudini_via')
  db.close()
  try {
    const s = await chiama('GET', '/api/stato')
    assert.equal(s.stato, 200)
    assert.deepEqual(s.json.memoriaNuove, { quante: 0, dove: null })
  } finally {
    const d = mente(); d.exec('ALTER TABLE abitudini_via RENAME TO abitudini'); d.close()
  }
})

test('il gusto: con pochi gesti niente testo, con abbastanza la frase del server e mai la scusa', async () => {
  const poco = await chiama('GET', '/api/rassegna/gusto')
  assert.equal(poco.stato, 200)
  assert.deepEqual(poco.json, { vale: false, testo: '' })
  const db = mente()
  const ora = new Date().toISOString()
  const ins = db.prepare(`INSERT INTO notizie (id, titolo, riassunto, perche, fonte, link, argomento, quando, presa, letta) VALUES (?,?,?,?,?,?,?,?,?,?)`)
  for (let i = 0; i < 12; i++) ins.run(`n${i}`, `Startup funding round ${i} for AI agents`, 'r', 'p', 'TechCrunch', `https://esempio.invalid/${i}`, 'ai', ora, ora, ora)
  db.close()
  const molto = await chiama('GET', '/api/rassegna/gusto')
  assert.equal(molto.json.vale, true)
  assert.ok(String(molto.json.testo).length > 0)
  assert.doesNotMatch(String(molto.json.testo), /Not enough yet|Non basta ancora/)
  assert.doesNotMatch(String(molto.json.testo), /[—–]/)
})

test('il gusto non prepara la rassegna: la rotta non chiama né la rassegna né la rete', () => {
  const sorgente = readFileSync(join(QUI, 'index.ts'), 'utf8')
  const i = sorgente.indexOf("app.get('/api/rassegna/gusto'")
  assert.ok(i > 0)
  const corpo = sorgente.slice(i, sorgente.indexOf('\n})', i))
  assert.doesNotMatch(corpo, /rassegna\.|fetch\(|prepara/)
})

test('riferimento: vuoto è 400, e la risposta porta i progetti nuovi', async () => {
  const v = await chiama('POST', '/api/riferimento', { testo: '  ' })
  assert.equal(v.stato, 400); assert.equal(v.json.errore, 'Scrivi qualcosa.')
  // una riga che nomina una cartella di lavoro che non è ancora un progetto
  const db = mente()
  const ora = new Date().toISOString()
  db.prepare(`INSERT INTO documenti (id, fonte, tipo, titolo, corpo, quando, indicizzato) VALUES ('lavoro:/casa/codice/Nextas','desktop','cartella','Nextas','',?,?)`).run(ora, ora)
  db.close()
  const r = await chiama('POST', '/api/riferimento', { testo: 'Nextas: la beta a ottobre.' })
  assert.equal(r.stato, 200, JSON.stringify(r.json))
  assert.deepEqual(r.json.nuovi, ['Nextas'])
  const di = await chiama('POST', '/api/riferimento', { testo: 'Northwind: app review, then launch.' })
  assert.deepEqual(di.json.nuovi, [])
})
