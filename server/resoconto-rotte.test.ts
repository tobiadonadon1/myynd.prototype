// Le rotte del resoconto (P9), provate fuori dal processo.
//
//   node --test server/resoconto-rotte.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const casa = mkdtempSync(join(tmpdir(), 'myynd-resoconto-rotte-'))
process.env.MYYND_DATI = casa
const home = join(casa, 'casa-finta')
mkdirSync(join(home, 'Documents'), { recursive: true })
const conti = await import('./conti.ts')
const chi = await import('./chi.ts')
const store = await import('./store.ts')
const cfg = await import('./config.ts')

let servizio: ChildProcess | undefined
let base = ''
let cartella = ''
let utente = ''
const token = 'resoconto-rotte-token-di-prova'

function porta(p: ChildProcess): Promise<string> {
  return new Promise((ok, no) => {
    const scade = setTimeout(() => no(new Error('il server non è partito')), 20000)
    let fuori = ''
    p.stdout!.on('data', c => {
      fuori += String(c)
      const m = fuori.match(/server su http:\/\/127\.0\.0\.1:(\d+)/)
      if (m) { clearTimeout(scade); ok(m[1]) }
    })
    p.on('exit', code => { clearTimeout(scade); no(new Error(`il server è uscito ${code}`)) })
    p.on('error', no)
  })
}

before(async () => {
  const k = await conti.registra('resoconto-rotte@esempio.test', 'parola-di-prova-lunga')
  assert.ok(k.ok)
  utente = k.id
  await conti.perProva.apriCon(token, k.id)
  chi.dentro(k.id, () => {
    cfg.scrivi({ lingua: 'en', fuso: 'Europe/Rome', diSerie: false, onboarding: true, giro: true, desktop: { cartelle: [join(home, 'Documents')], scelte: true } })
    cartella = cfg.cartella()
    store.scriviCompito({ id: 'm1', testo: 'Reply to Dana', quando: 'oggi', ordine: 'a0' })
    store.default.prepare("UPDATE compiti SET stato = 'fatto', creato = '2026-09-02T08:00:00.000Z', chiesto = ?, chiuso = ? WHERE id = 'm1'").run('2026-09-15T08:00:00.000Z', '2026-09-17T09:00:00.000Z')
    store.default.prepare("INSERT INTO azioni (id, tipo, verso, cosa, compito, esito, quando) VALUES ('az1','email','dana@northwind.example','Re: October quote','m1','fatta','2026-09-17T09:00:00.000Z')").run()
  })
  store.chiudiIndici()
  servizio = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', fileURLToPath(new URL('./index.ts', import.meta.url))], {
    env: { PATH: process.env.PATH, HOME: home, MYYND_DATI: casa, MYYND_PORT: '0', NODE_ENV: 'test', MYYND_DEV: '1', MYYND_ADESSO: '2026-09-21T09:00:00+02:00' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  base = `http://127.0.0.1:${await porta(servizio)}`
})

after(async () => {
  if (servizio && servizio.exitCode === null) {
    const spento = new Promise<void>(r => servizio!.once('exit', () => r()))
    servizio.kill('SIGTERM')
    await spento
  }
  store.chiudiIndici()
  rmSync(casa, { recursive: true, force: true })
})

const chiama = (via: string, metodo = 'GET', corpo?: unknown, conSessione = true) => fetch(`${base}${via}`, {
  method: metodo, headers: { ...(conSessione ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
  body: corpo === undefined ? undefined : JSON.stringify(corpo)
})

test('GET /api/resoconto?quale=scorsa: la forma, con l’orologio della scena', async () => {
  const r = await chiama('/api/resoconto?quale=scorsa')
  assert.equal(r.status, 200)
  const { resoconto } = await r.json() as { resoconto: Record<string, unknown> & { numeri: { mail: number }; voci: { titolo: string }[] } }
  assert.equal(resoconto.quale, 'scorsa')
  assert.equal(resoconto.lunedi, '2026-09-21')
  assert.equal(resoconto.da, '2026-09-13T22:00:00.000Z')
  assert.equal(resoconto.numeri.mail, 1)
  assert.equal(resoconto.voci[0]!.titolo, 'October quote')
  for (const k of ['inizio', 'preparate', 'stime', 'riscritte', 'punteggio', 'notato', 'segnalate', 'automazioni', 'copertura', 'vuoto']) assert.ok(k in resoconto, k)
})

test('un periodo sconosciuto è un 400 tradotto', async () => {
  const r = await chiama('/api/resoconto?quale=x')
  assert.equal(r.status, 400)
  assert.equal((await r.json() as { errore: string }).errore, 'Non conosco questo periodo.')
  const v = await chiama('/api/resoconto/visto', 'POST', { lunedi: '2026-9-1' })
  assert.equal(v.status, 400)
  assert.equal((await v.json() as { errore: string }).errore, 'Non conosco questo periodo.')
})

test('sommario e lunedì, poi visto', async () => {
  const s = await (await chiama('/api/resoconto/sommario')).json() as { righe: { quale: string }[] }
  assert.deepEqual(s.righe.map(x => x.quale), ['scorsa', 'inizio'])
  const l = await (await chiama('/api/resoconto/lunedi')).json() as { mostra: boolean; lunedi?: string }
  assert.deepEqual(l, { mostra: true, lunedi: '2026-09-21', numeri: { mail: 1, lavori: 0, scadenze: 0 } })
  const v = await chiama('/api/resoconto/visto', 'POST', { lunedi: '2026-09-21' })
  assert.equal(v.status, 200)
  assert.ok(existsSync(join(cartella, 'resoconto.json')))
  assert.deepEqual(JSON.parse(readFileSync(join(cartella, 'resoconto.json'), 'utf8')), { visto: '2026-09-21' })
  assert.deepEqual(await (await chiama('/api/resoconto/lunedi')).json(), { mostra: false })
})

test('con l’orologio fermo della scena, il fuso del client (App.tsx dilloIlFuso) non sovrascrive quello seminato', async () => {
  const prima = chi.dentro(utente, () => cfg.leggi().fuso)
  assert.equal(prima, 'Europe/Rome')
  const p = await chiama('/api/profilo', 'POST', { fuso: 'America/New_York' })
  assert.equal(p.status, 200)
  const dopo = chi.dentro(utente, () => cfg.leggi().fuso)
  assert.equal(dopo, 'Europe/Rome')
  // il resoconto resta quello della scena, calcolato nel fuso seminato
  const r = await (await chiama('/api/resoconto?quale=scorsa')).json() as { resoconto: { lunedi: string } }
  assert.equal(r.resoconto.lunedi, '2026-09-21')
})

test('senza sessione: 401', async () => {
  for (const via of ['/api/resoconto?quale=scorsa', '/api/resoconto/sommario', '/api/resoconto/lunedi']) {
    assert.equal((await chiama(via, 'GET', undefined, false)).status, 401, via)
  }
  assert.equal((await chiama('/api/resoconto/visto', 'POST', { lunedi: '2026-09-21' }, false)).status, 401)
})
