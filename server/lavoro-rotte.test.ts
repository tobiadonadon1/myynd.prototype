// Le rotte del lavoro senza domande (P3), sul server vero con il modello finto:
// «Cambia» sotto l'ipotesi (la riga si rifà, o parte la revisione), il 409 su
// una bozza già partita dalla sua posta, e le misure.
//
//   node --test server/lavoro-rotte.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer as creaTcp, type Server as Tcp } from 'node:net'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const casa = mkdtempSync(join(tmpdir(), 'myynd-lavoro-rotte-'))
process.env.MYYND_DATI = casa
delete process.env.ANTHROPIC_API_KEY
const home = join(casa, 'casa-finta')
const cartella = join(home, 'Documents')
mkdirSync(cartella, { recursive: true })
const conti = await import('./conti.ts')
const chi = await import('./chi.ts')
const store = await import('./store.ts')
const cfg = await import('./config.ts')
const chiavi = await import('./ordine.ts')

let servizio: ChildProcess | undefined
let modello: ChildProcess | undefined
let base = ''
/** Un SMTP finto che dice sempre di sì e tiene il messaggio: «Manda» deve poter partire senza che parta niente. */
let smtp: Tcp | undefined
const mandate: string[] = []
function smtpFinto(): Promise<number> {
  smtp = creaTcp(socket => {
    let dati = false
    let corpo = ''
    socket.write('220 finto ESMTP\r\n')
    socket.on('data', d => {
      for (const riga of String(d).split('\r\n')) {
        if (dati) {
          if (riga === '.') { dati = false; mandate.push(corpo); corpo = ''; socket.write('250 OK\r\n') }
          else corpo += riga + '\n'
          continue
        }
        if (!riga) continue
        const c = riga.toUpperCase()
        if (c.startsWith('EHLO') || c.startsWith('HELO')) socket.write('250-finto\r\n250 AUTH PLAIN LOGIN\r\n')
        else if (c.startsWith('AUTH')) socket.write('235 OK\r\n')
        else if (c.startsWith('MAIL') || c.startsWith('RCPT')) socket.write('250 OK\r\n')
        else if (c.startsWith('DATA')) { dati = true; socket.write('354 go\r\n') }
        else if (c.startsWith('QUIT')) { socket.write('221 bye\r\n'); socket.end() }
        else socket.write('250 OK\r\n')
      }
    })
  })
  return new Promise(ok => smtp!.listen(0, '127.0.0.1', () => ok((smtp!.address() as { port: number }).port)))
}
const token = 'lavoro-rotte-token'
const QUI = fileURLToPath(new URL('.', import.meta.url))

function porta(p: ChildProcess, quale: RegExp, cosa: string): Promise<string> {
  return new Promise((ok, no) => {
    const scade = setTimeout(() => no(new Error(`${cosa} non è partito`)), 20000)
    let fuori = ''
    p.stdout!.on('data', c => { fuori += String(c); const m = fuori.match(quale); if (m) { clearTimeout(scade); ok(m[1]) } })
    p.on('exit', code => { clearTimeout(scade); if (!fuori.match(quale)) no(new Error(`${cosa} è uscito ${code}`)) })
    p.on('error', no)
  })
}

const FILE_PIANO = join(cartella, 'q4-plan.md')

before(async () => {
  const copione = join(casa, 'copione.json')
  writeFileSync(copione, JSON.stringify({
    modello: 'finto',
    risposte: [
      { se: 'Guardi il risultato di un compito affidato', in: 'system', json: { chiede: false, manca: [], domanda: '', visto: '' } },
      { se: 'Sei il revisore di un lavoro', in: 'system', json: { esito: 'pass', per: 'Dana', comeTe: 'ok', comeLoro: 'ok', problemi: [], verificato: ['x'] } },
      { se: 'Un assistente ha appena finito un lavoro', in: 'system', json: { prossimo: '' } },
      { se: 'Il compito: Write to Dana[\\s\\S]*Monday', in: 'utente', testo: 'Done: the note to Dana, with the new date.\n\nHi Dana,\n\nthe note says Monday, October 5, and that is all it says for now.\n\nBest\n\nFrom the mail [1].' },
      { se: 'Il compito: Write to Dana', in: 'utente', testo: 'Done: the note to Dana.\n\nHi Dana,\n\nthe note says Friday, and that is all it says for now.\n\nBest\n\nFrom the mail [1].\nI assumed Friday as the deadline.' }
    ],
    predefinita: 'Done: the deliverable is below.\n\nThe fake model wrote this.'
  }))
  modello = spawn(process.execPath, [join(QUI, '..', 'prove', 'finto-modello.mjs')], { env: { PATH: process.env.PATH, FINTO_PORTA: '0', FINTO_COPIONE: copione, FINTO_REGISTRO: join(casa, 'modello.jsonl') }, stdio: ['ignore', 'pipe', 'pipe'] })
  const portaFinto = await porta(modello, /finto su (\d+)/, 'il modello finto')
  const portaSmtp = await smtpFinto()

  const account = await conti.registra('lavoro-rotte@example.com', 'isolated-test-password')
  assert.ok(account.ok)
  await conti.perProva.apriCon(token, account.id)
  writeFileSync(FILE_PIANO, 'The Q4 plan.\n\nFour weeks, two engineers.\n')
  chi.dentro(account.id, () => {
    cfg.scrivi({
      lingua: 'en', diSerie: false, onboarding: true, giro: true,
      desktop: { cartelle: [cartella], scelte: true },
      // una posta «collegata» il cui SMTP è finto: «Manda» parte, e non parte niente
      posta: { host: '127.0.0.1', porta: 1, utente: 'alex@harbor.example', password: 'x', smtp: { host: '127.0.0.1', porta: portaSmtp } },
      motore: 'compatibile', compatibile: { url: `http://127.0.0.1:${portaFinto}/v1/`, chiave: 'sk-finta', modello: 'finto' }
    })
    store.salvaDocumenti([{ id: 'posta:INBOX:503', fonte: 'posta', tipo: 'email', titolo: 'Logo files', corpo: 'Can you send me the logo files?', autore: 'Leo Marsh <leo@studio.example>', quando: new Date().toISOString(), messageId: 'l1@studio.example', filo: 'f-leo' }])
    // una bozza già partita dalla posta: la mandata è più recente della delega
    store.scriviCompito({ id: 'c-s1', testo: 'Reply to Leo about the logo files', ordine: chiavi.dopo(store.ultimoOrdine('oggi')), doc: 'posta:INBOX:503' })
    const email = { casella: { stato: 'salvata', id: 'd1' }, a: 'leo@studio.example', oggetto: 'Re: Logo files', corpo: 'Hi Leo,\n\nHere they are.\n\nBest', conosciuto: true, rispondeA: { messageId: 'l1@studio.example' } }
    store.default.prepare("UPDATE compiti SET stato = 'pronto', chiesto = ?, risultato = ?, email = ?, mandata = ?, ipotesi = ? WHERE id = 'c-s1'")
      .run(new Date(Date.now() - 3_600_000).toISOString(), 'Done: the reply.\n\nHi Leo,\n\nHere they are.\n\nBest\n\nI assumed all three formats.', JSON.stringify(email), JSON.stringify({ doc: 'posta:Sent:61', quando: new Date().toISOString(), certezza: 'filo', ritocco: 0.1 }), JSON.stringify(['I assumed all three formats.']))
    // un file consegnato con un'ipotesi: «Cambia» passa dalla revisione
    store.scriviCompito({ id: 'c-l1', testo: 'Write the Q4 plan', ordine: chiavi.dopo(store.ultimoOrdine('oggi')) })
    store.default.prepare("UPDATE compiti SET stato = 'pronto', chiesto = ?, risultato = ?, ipotesi = ?, consegna = ? WHERE id = 'c-l1'")
      .run(new Date(Date.now() - 3_600_000).toISOString(), 'Done: «q4-plan.md» is in Documents.\n\nI assumed four weeks.', JSON.stringify(['I assumed four weeks.']), JSON.stringify({ app: 'File', titolo: 'q4-plan.md', percorso: FILE_PIANO, dove: 'documenti' }))
    // una riga aperta: niente da cambiare
    store.scriviCompito({ id: 'c-a1', testo: 'An open task', ordine: chiavi.dopo(store.ultimoOrdine('oggi')) })
    // una bozza pronta da mandare da qui: il risultato intero e il corpo dell'email sono due cose diverse
    store.scriviCompito({ id: 'c-m1', testo: 'Reply to Leo about the invoice', ordine: chiavi.dopo(store.ultimoOrdine('oggi')), doc: 'posta:INBOX:503' })
    const bozza = 'Hi Leo,\n\nthe invoice is attached, with the two lines you asked about.\n\nBest,\nAlex'
    store.default.prepare("UPDATE compiti SET stato = 'pronto', chiesto = ?, risultato = ?, email = ? WHERE id = 'c-m1'")
      .run(new Date(Date.now() - 3_600_000).toISOString(), `Done: the reply to Leo, with the invoice.\n\n${bozza}\n\nFrom the mail [1].`,
        JSON.stringify({ a: 'leo@studio.example', oggetto: 'Re: Invoice', corpo: bozza, conosciuto: true, rispondeA: { messageId: 'l1@studio.example' } }))
  })
  store.chiudiIndici()

  servizio = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', join(QUI, 'index.ts')], {
    env: { PATH: process.env.PATH, HOME: home, MYYND_DATI: casa, MYYND_PORT: '0', NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe']
  })
  // il registro del server, per leggere cosa ha fatto dopo aver risposto
  servizio.stdout!.on('data', d => appendFileSync(join(casa, 'server.log'), d))
  servizio.stderr!.on('data', d => appendFileSync(join(casa, 'server.log'), d))
  base = `http://127.0.0.1:${await porta(servizio, /server su http:\/\/127\.0\.0\.1:(\d+)/, 'il server')}`
})

after(async () => {
  smtp?.close()
  for (const p of [servizio, modello]) {
    if (p && p.exitCode === null) { const spento = new Promise<void>(r => p.once('exit', () => r())); p.kill('SIGTERM'); await spento }
  }
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(casa, { recursive: true, force: true })
})

const h = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
const post = async (via: string, corpo?: unknown) => { const r = await fetch(`${base}${via}`, { method: 'POST', headers: h, body: JSON.stringify(corpo ?? {}) }); return { stato: r.status, corpo: await r.json() as Record<string, unknown> } }
const get = async (via: string) => { const r = await fetch(`${base}${via}`, { headers: h }); return { stato: r.status, corpo: await r.json() as Record<string, unknown> } }
type Riga = { id: string; stato: string; ipotesi?: string[] | null; madre?: string | null; risultato?: string | null; modo?: string; nota?: string | null }
async function riga(id: string, finche: (c: Riga | undefined) => boolean, ms = 75000): Promise<Riga | undefined> {
  const fine = Date.now() + ms
  for (;;) {
    const r = await get('/api/compiti')
    const c = ((r.corpo.compiti ?? r.corpo) as Riga[]).find(x => x.id === id)
    if (finche(c) || Date.now() > fine) return c
    await new Promise(x => setTimeout(x, 250))
  }
}

test('«Cambia» su una riga semplice la rifà con la correzione, conta la correzione, e non chiude mai', async () => {
  const nuova = await post('/api/compiti', { id: 'c-n1', testo: 'Write to Dana about the note', quando: 'oggi' })
  assert.equal(nuova.stato, 200, JSON.stringify(nuova.corpo))
  assert.equal((await post('/api/compiti/c-n1/delega', { modo: 'tutto' })).stato, 200)
  const pronta = await riga('c-n1', c => c?.stato === 'pronto')
  assert.equal(pronta?.stato, 'pronto')
  assert.deepEqual(pronta?.ipotesi, ['I assumed Friday as the deadline.'])

  // vuoto, e una riga che non ha niente da cambiare
  assert.deepEqual(await post('/api/compiti/c-n1/correggi', { testo: '  ' }), { stato: 400, corpo: { errore: 'Scrivi cosa cambia.' } })
  assert.deepEqual(await post('/api/compiti/c-a1/correggi', { testo: 'Monday' }), { stato: 400, corpo: { errore: 'Questa riga non ha niente da cambiare.' } })

  // «not now» non chiude: è una correzione, e la riga si rifà con quella
  const r = await post('/api/compiti/c-n1/correggi', { testo: 'Monday, not now' })
  assert.equal(r.stato, 200, JSON.stringify(r.corpo))
  const subito = ((r.corpo.compiti) as Riga[]).find(x => x.id === 'c-n1')
  assert.equal(subito?.stato, 'delegato')
  // la nota dice cosa cambia e al posto di cosa, nella lingua dell'app: chi rifà il lavoro sa dove va la correzione
  assert.equal(subito?.nota, 'Instead of «I assumed Friday as the deadline.»: Monday, not now')
  const rifatta = await riga('c-n1', c => c?.stato === 'pronto')
  assert.equal(rifatta?.stato, 'pronto')
  assert.match(rifatta?.risultato ?? '', /Monday, October 5/)
  assert.equal(rifatta?.ipotesi ?? null, null)
  const m = await get('/api/lavoro/misura?giorni=30')
  assert.equal(m.stato, 200)
  const lavori = m.corpo.lavori as { arrivati: number; correzioni: number; max: number; senzaDomande: number }
  assert.equal(lavori.correzioni, 1)
  assert.equal(lavori.max, 0)
  assert.ok(lavori.arrivati >= 1)
})

test('«Cambia» su un file consegnato apre una revisione figlia e lascia la riga com\'è', async () => {
  const r = await post('/api/compiti/c-l1/correggi', { testo: 'Six weeks, not four' })
  assert.equal(r.stato, 200, JSON.stringify(r.corpo))
  const righe = r.corpo.compiti as Riga[]
  const madre = righe.find(x => x.id === 'c-l1')
  assert.equal(madre?.stato, 'pronto')
  const figlia = righe.find(x => x.madre === 'c-l1' && x.id.startsWith('rev-'))
  assert.ok(figlia, 'nessuna riga figlia di revisione')
  assert.equal(figlia!.modo, 'tutto')
})

test('«Manda» su una bozza già partita dalla sua posta risponde 409, e la riga resta; «Cambia» lì non ha niente da cambiare', async () => {
  const r = await post('/api/compiti/c-s1/invia')
  assert.equal(r.stato, 409)
  assert.equal(r.corpo.errore, 'L\'hai già mandata dalla tua posta.')
  const c = await riga('c-s1', () => true, 0)
  assert.equal(c?.stato, 'pronto')
  // la mail è già andata con quello che diceva: il server dice di no come lo schermo, che non disegna «Cambia»
  assert.deepEqual(await post('/api/compiti/c-s1/correggi', { testo: 'Only the SVG' }), { stato: 400, corpo: { errore: 'Questa riga non ha niente da cambiare.' } })
  assert.deepEqual((await riga('c-s1', () => true, 0))?.ipotesi, ['I assumed all three formats.'])
})

test('la rotta «invia» manda, registra l\'invio via smtp misurato sul corpo dell\'email, e impara da quel corpo e non dal risultato intero', async () => {
  // una parola cambiata: contro il corpo dell'email è un ritocco; contro il risultato intero («Done: …», la riga delle fonti) non lo sarebbe
  const corretto = 'Hi Leo,\n\nthe invoice is attached, with the three lines you asked about.\n\nBest,\nAlex'
  const r = await post('/api/compiti/c-m1/invia', { corpo: corretto })
  assert.equal(r.stato, 200, JSON.stringify(r.corpo))
  assert.equal(mandate.length, 1, 'niente è arrivato allo SMTP finto')
  assert.match(mandate[0], /the three lines/)
  const chiusa = ((r.corpo.chiusi ?? []) as Riga[]).find(x => x.id === 'c-m1')
  assert.equal(chiusa?.stato, 'fatto')

  // le misure: via smtp, e una distanza piccola, perché il confronto è con il corpo dell'email e non con «Done: …» e la riga delle fonti
  const m = await get('/api/lavoro/misura?giorni=30')
  const bozze = m.corpo.bozze as { inviate: number; via: { smtp: number } }
  assert.equal(bozze.via.smtp, 1)
  const misure = readMisure('c-m1')
  assert.equal(misure?.via, 'smtp')
  assert.equal(misure?.classe, 'ritocco', `distanza ${misure?.distanza}`)

  // la memoria ha ricevuto la coppia giusta: il corpo preparato contro quello mandato, senza la cornice
  const inizio = Date.now()
  const fine = inizio + 60000
  let richiesta: string | undefined
  while (!richiesta && Date.now() < fine) {
    const registro = readFileSync(join(casa, 'modello.jsonl'), 'utf8').trim().split('\n').filter(Boolean)
    richiesta = registro.find(x => x.includes('Avevo preparato questo') && x.includes('the three lines'))
    if (!richiesta) await new Promise(x => setTimeout(x, 250))
  }
  assert.ok(richiesta, 'nessuna correzione è arrivata alla memoria:\n' + readFileSync(join(casa, 'modello.jsonl'), 'utf8').trim().split('\n').filter(x => x.includes('Avevo preparato') || x.includes('Ho mandato invece')).map(x => String((JSON.parse(x) as { utente: string }).utente).slice(0, 1500)).join('\n') + '\n---\n' + readFileSync(join(casa, 'server.log'), 'utf8').split('\n').slice(-8).join('\n'))
  console.log(`la correzione è arrivata alla memoria dopo ${Date.now() - inizio} ms`)
  const testo = JSON.parse(richiesta!) as unknown
  const piatto = JSON.stringify(testo)
  assert.match(piatto, /Avevo preparato questo:[^"]*Hi Leo,/)
  assert.doesNotMatch(piatto, /Done: the reply to Leo/)
  assert.doesNotMatch(piatto, /From the mail \[1\]/)
})

/** Le misure di una riga, lette dall'indice del conto della prova (il server ha il suo processo: si rilegge da disco). */
function readMisure(id: string): { via: string | null; classe: string | null; distanza: number | null } | null {
  const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite')
  const file = readdirSync(join(casa, 'utenti')).map(u => join(casa, 'utenti', u, 'mente.db')).find(f => existsSync(f))
  if (!file) return null
  const d = new DatabaseSync(file, { readOnly: true })
  try { return (d.prepare('SELECT via, classe, distanza FROM misure_compiti WHERE compito = ?').get(id) as { via: string | null; classe: string | null; distanza: number | null } | undefined) ?? null }
  finally { d.close() }
}
