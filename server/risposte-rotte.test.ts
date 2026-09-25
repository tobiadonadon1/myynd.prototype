// Le rotte di P7, sul server vero: la riga delle preferenze senza e con un
// insieme, l'interruttore che persiste (e rifiuta un «si» scritto), la chat
// che salva il verbale e un testo senza lineette né segni fuori elenco,
// «svuota la mente» che porta via la cartella, e il fascicolo che porta
// `risposte` e il verbale di ogni risposta.
//
//   node --test server/risposte-rotte.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const casa = mkdtempSync(join(tmpdir(), 'myynd-risposte-rotte-'))
process.env.MYYND_DATI = casa
const home = join(casa, 'casa-finta')
mkdirSync(join(home, 'Documents'), { recursive: true })
const conti = await import('./conti.ts')
const chi = await import('./chi.ts')
const store = await import('./store.ts')
const cfg = await import('./config.ts')
const archivio = await import('./risposte-archivio.ts')
const fascicolo = await import('./fascicolo.ts')

let servizio: ChildProcess | undefined
let modello: ChildProcess | undefined
let base = ''
let id = ''
let cartella = ''
const token = 'p7-rotte-token'
const EMAIL = 'p7@example.com'

/** Un fornitore compatibile finto, in un processo suo: risponde in streaming con una lineetta e un [9]. */
const FINTO = `
import { createServer } from 'node:http'
createServer((req, res) => {
  let s = ''
  req.on('data', d => { s += d })
  req.on('end', () => {
    if (req.method === 'GET') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ data: [{ id: 'finto' }] })) }
    const corpo = JSON.parse(s || '{}')
    const testo = 'The Harbor pilot starts on 14 October 2026 [1] — with Brightline and Keel. The fee is €4,800 [1][9].'
    if (!corpo.stream) {
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ id: 'x', model: 'finto', choices: [{ index: 0, message: { role: 'assistant', content: corpo.response_format ? '{}' : 'Harbor pilot start' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }))
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write('data: ' + JSON.stringify({ choices: [{ index: 0, delta: { content: testo } }] }) + '\\n\\n')
    res.write('data: ' + JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }) + '\\n\\n')
    res.end('data: [DONE]\\n\\n')
  })
}).listen(0, '127.0.0.1', function () { console.log('finto su ' + this.address().port) })
`

function porta(p: ChildProcess, quale: RegExp, cosa: string): Promise<string> {
  return new Promise((ok, no) => {
    const scade = setTimeout(() => no(new Error(`${cosa} non è partito`)), 20000)
    let fuori = ''
    p.stdout!.on('data', c => { fuori += String(c); const m = fuori.match(quale); if (m) { clearTimeout(scade); ok(m[1]) } })
    p.on('exit', code => { clearTimeout(scade); if (!fuori.match(quale)) no(new Error(`${cosa} è uscito ${code}`)) })
    p.on('error', no)
  })
}

const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
const get = (p: string) => fetch(base + p, { headers: H }).then(r => r.json() as Promise<Record<string, unknown>>)
const post = (p: string, corpo: unknown) => fetch(base + p, { method: 'POST', headers: H, body: JSON.stringify(corpo) })

before(async () => {
  modello = spawn(process.execPath, ['--input-type=module', '-e', FINTO], { stdio: ['ignore', 'pipe', 'pipe'] })
  const portaFinto = await porta(modello, /finto su (\d+)/, 'il fornitore finto')
  const account = await conti.registra(EMAIL, 'isolated-test-password')
  assert.ok(account.ok)
  id = account.id
  await conti.perProva.apriCon(token, id)
  chi.dentro(id, () => {
    cartella = cfg.cartella()
    cfg.scrivi({ lingua: 'en', diSerie: false, onboarding: true, giro: true, nome: 'Alex', desktop: { cartelle: [join(home, 'Documents')], scelte: true }, motore: 'compatibile', compatibile: { url: `http://127.0.0.1:${portaFinto}/v1/`, chiave: 'sk-finta', modello: 'finto' } })
    store.salvaDocumenti([{ id: 'posta:INBOX:701', fonte: 'posta', tipo: 'email', titolo: 'Harbor pilot kickoff', corpo: 'Hi Alex, we confirm the Harbor pilot starts on 14 October 2026 with two suppliers, Brightline and Keel. The fee is €4,800 for the first phase. Nora', autore: 'Nora Vance <nora@harbor.example>', quando: new Date().toISOString(), percorso: 'INBOX', messageId: 'k701@harbor.example' }])
  })
  store.chiudiIndici()
  servizio = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', fileURLToPath(new URL('./index.ts', import.meta.url))], {
    env: { PATH: process.env.PATH, HOME: home, MYYND_DATI: casa, MYYND_PORT: '0', NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe']
  })
  base = `http://127.0.0.1:${await porta(servizio, /server su http:\/\/127\.0\.0\.1:(\d+)/, 'il server')}`
})

after(async () => {
  for (const p of [servizio, modello]) {
    if (p && p.exitCode === null) { const spento = new Promise<void>(r => p.once('exit', () => r())); p.kill('SIGTERM'); await spento }
  }
  store.chiudiIndici()
  rmSync(casa, { recursive: true, force: true })
})

test('senza un insieme la riga non c’è; l’interruttore persiste su disco e rifiuta un «si» scritto', async () => {
  assert.deepEqual(await get('/api/risposte/valutazione'), { insieme: false, attiva: false, riga: null, inCorso: false })
  const r = await post('/api/risposte/attiva', { attiva: true })
  assert.equal(r.status, 200)
  assert.deepEqual(await r.json(), { ok: true, attiva: true })
  assert.equal(JSON.parse(readFileSync(join(cartella, 'config.json'), 'utf8')).provaRisposte?.attiva, true, 'scritto nella configurazione')
  assert.equal((await get('/api/risposte/valutazione')).attiva, true)
  const male = await post('/api/risposte/attiva', { attiva: 'si' })
  assert.equal(male.status, 400)
  assert.deepEqual(await male.json(), { errore: 'Serve un sì o un no.' })
  // con un insieme e un'ultima prova, la riga arriva nella lingua dell'app
  const domande = Array.from({ length: 12 }, (_, i) => ({ id: `q${i}`, domanda: `q ${i}?`, tipo: 'non_ce', attesa: '', genere: 'stato', doc: null, citazione: '', scarto: null, origine: 'costruita', interlingua: false, verificata: 'persona', creata: new Date().toISOString() }))
  archivio.scriviInsieme({ versione: 1, lingua: 'en', creato: 'x', aggiornato: 'x', domande }, cartella)
  archivio.scriviStato({ ultima: { quando: '2026-09-22T10:00:00.000Z', origine: 'comando', via: 'claude', fatte: 50, quante: 50, giuste: 46, senzaFonte: 1, sbagliate: 3, inventate: 0, rifiutateMale: 0, daRivedere: 0, passa: true, gettoni: 1, file: 'x' } }, cartella)
  const s = await get('/api/risposte/valutazione')
  assert.equal(s.insieme, true)
  assert.equal(s.riga, 'Last check on Sep 22: 46 of 50 right, none invented.')
})

test('la chat salva un testo pulito e il verbale, e scrive la riga di registro senza la domanda', async () => {
  const r = await fetch(`${base}/api/chat/p7-pilota`, { method: 'POST', headers: H, body: JSON.stringify({ testo: 'When does the Harbor pilot start?' }) })
  assert.equal(r.status, 200)
  const corpo = await r.text()
  assert.match(corpo, /"fase":"fine"/)
  const fine = JSON.parse(corpo.split('\n\n').filter(p => p.startsWith('data: ')).map(p => p.slice(6)).find(p => p.includes('"fine"'))!) as { messaggi: { role: string; text: string; sources: { id: string; passo: string }[] }[] }
  const risposta = fine.messaggi.find((m: { role: string }) => m.role === 'a')!
  assert.ok(!risposta.text.includes('[9]') && !/[—–]/.test(risposta.text), risposta.text)
  assert.equal(risposta.sources[0].id, 'posta:INBOX:701')
  assert.ok(risposta.sources[0].passo.includes('14 October 2026'))
  const db = new DatabaseSync(join(cartella, 'mente.db'), { readOnly: true })
  const riga = db.prepare("SELECT verifica FROM messaggi WHERE chat = 'p7-pilota' AND ruolo = 'a'").get() as { verifica: string }
  db.close()
  const v = JSON.parse(riga.verifica)
  assert.deepEqual(v.nonValide, [9])
  assert.equal(v.via, 'compatibile')
  assert.equal(v.citazioni, 1)
  // il fascicolo porta il verbale e la sezione «risposte»
  const testo = chi.dentro(id, () => [...fascicolo.scrivi([])].join(''))
  const f = JSON.parse(testo) as { chat: { messaggi: { verifica?: unknown }[] }[]; risposte: { domande: unknown; storico: unknown } }
  assert.ok(f.chat.some(c => c.messaggi.some(m => m.verifica && (m.verifica as { nonValide: number[] }).nonValide[0] === 9)))
  assert.ok(f.risposte && f.risposte.domande, 'il fascicolo non porta la prova delle risposte')
})

test('«svuota la mente» porta via anche la cartella della prova', async () => {
  assert.ok(existsSync(join(cartella, 'valutazioni', 'risposte')))
  const r = await post('/api/azzera', { conferma: EMAIL })
  assert.equal(r.status, 200)
  assert.ok(!existsSync(join(cartella, 'valutazioni', 'risposte')))
  assert.deepEqual(await get('/api/risposte/valutazione'), { insieme: false, attiva: true, riga: null, inCorso: false })
})
