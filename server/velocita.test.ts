// La velocità (P10), dal vivo su un server vero e un modello finto.
//
// Di serie si prova l'ordine delle cose, mai i millisecondi: la risposta
// all'occhio arriva mentre il modello è ancora fermo, una seconda pressione si
// attacca alla stessa lettura, lo scaldare non tocca la chiave, la chat lascia
// le sue tappe, «Affidalo» non scrive niente se i controlli dicono no.
//
// Con MYYND_VELOCITA=1 anche il banco: ottomila documenti, e una tabella.
//
//   node --import ./build/test-profile.mjs --test server/velocita.test.ts
//   MYYND_VELOCITA=1 node --import ./build/test-profile.mjs --test server/velocita.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BANCO = process.env.MYYND_VELOCITA === '1'
const casa = mkdtempSync(join(tmpdir(), 'myynd-velocita-'))
process.env.MYYND_DATI = casa
const home = join(casa, 'casa-finta')
mkdirSync(home, { recursive: true })
delete process.env.ANTHROPIC_API_KEY

const conti = await import('./conti.ts')
const chi = await import('./chi.ts')
const store = await import('./store.ts')
const cfg = await import('./config.ts')

const REGISTRO = join(casa, 'modello.jsonl')
const COPIONE = join(casa, 'copione.json')
const ORDINE = 'Hi Alex, can you sign the pilot order by Monday? We start right after. Harbor Labs'
writeFileSync(COPIONE, JSON.stringify({
  modello: 'finto',
  risposte: [
    { se: 'MESSAGGIO CORRENTE', in: 'utente', json: { voci: [
      { tipo: 'Da decidere', titolo: 'Sign the Harbor pilot order', testo: 'Harbor starts right after you sign.', urgenza: 'by Monday', fonte: 'posta', doc: 'posta:INBOX:900', perche: 'Harbor waits for your signature by Monday.', prova: 'can you sign the pilot order by Monday?' }
    ] } },
    { se: 'audit call', in: 'utente', testo: 'The audit call is tomorrow at 10:00.' }
  ],
  predefinita: 'Done.'
}))

let servizio: ChildProcess | undefined
let modello: ChildProcess | undefined
let base = '', finto = ''
const token = 'velocita-token-a', tokenB = 'velocita-token-b'
let A = ''

function porta(p: ChildProcess, quale: RegExp, cosa: string): Promise<string> {
  return new Promise((ok, no) => {
    const scade = setTimeout(() => no(new Error(`${cosa} non è partito`)), 20000)
    let fuori = ''
    p.stdout!.on('data', c => { fuori += String(c); const m = fuori.match(quale); if (m) { clearTimeout(scade); ok(m[1]) } })
    p.on('exit', code => { clearTimeout(scade); if (!fuori.match(quale)) no(new Error(`${cosa} è uscito ${code}: ${fuori.slice(-400)}`)) })
  })
}
const avviaServer = async (extra: Record<string, string> = {}) => {
  const prof = BANCO && process.env.MYYND_VELOCITA_PROFILO ? ['--cpu-prof', `--cpu-prof-dir=${process.env.MYYND_VELOCITA_PROFILO}`] : []
  const p = spawn(process.execPath, [...prof, '--disable-warning=ExperimentalWarning', fileURLToPath(new URL('./index.ts', import.meta.url))], {
    env: { PATH: process.env.PATH, HOME: home, MYYND_DATI: casa, MYYND_PORT: '0', NODE_ENV: 'test', ANTHROPIC_BASE_URL: finto, ...extra },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  // nel banco il registro del server si tiene, per leggere le righe «myynd · tempi»
  if (BANCO && process.env.MYYND_VELOCITA_REGISTRO) p.stdout!.on('data', c => { try { writeFileSync(process.env.MYYND_VELOCITA_REGISTRO!, String(c), { flag: 'a' }) } catch { /* solo un aiuto */ } })
  const url = `http://127.0.0.1:${await porta(p, /server su http:\/\/127\.0\.0\.1:(\d+)/, 'il server')}`
  return { p, url }
}
const spegni = async (p?: ChildProcess) => {
  if (p && p.exitCode === null) { const via = new Promise<void>(r => p.once('exit', () => r())); p.kill('SIGTERM'); await via }
}

before(async () => {
  modello = spawn(process.execPath, [fileURLToPath(new URL('../prove/finto-modello.mjs', import.meta.url))], {
    env: { PATH: process.env.PATH, FINTO_PORTA: '0', FINTO_COPIONE: COPIONE, FINTO_REGISTRO: REGISTRO, ...(BANCO ? { FINTO_PRIMA_PAROLA_MS: '400' } : {}) },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  finto = `http://127.0.0.1:${await porta(modello, /finto su (\d+)/, 'il modello finto')}`
  const a = await conti.registra('velocita-a@example.com', 'isolated-test-password')
  const b = await conti.registra('velocita-b@example.com', 'isolated-test-password')
  assert.ok(a.ok && b.ok)
  A = a.id
  await conti.perProva.apriCon(token, a.id)
  await conti.perProva.apriCon(tokenB, b.id)
  const n = BANCO ? 8000 : 50
  const ora = Date.now()
  chi.dentro(a.id, () => {
    cfg.scrivi({ lingua: 'en', diSerie: false, onboarding: true, giro: true, claude: { apiKey: 'sk-ant-finta' } } as Parameters<typeof cfg.scrivi>[0])
    const docs = Array.from({ length: n }, (_, i) => ({
      id: `posta:INBOX:${i}`, fonte: 'posta', tipo: 'email', titolo: `Weekly note ${i}`,
      corpo: `Thanks for the update on item ${i}. Nothing to do here.`, autore: `Person ${i % 30} <p${i % 30}@example.com>`,
      quando: new Date(ora - (i + 50) * 3_600_000 * 24).toISOString(), percorso: 'INBOX'
    }))
    docs.push({ id: 'posta:INBOX:900', fonte: 'posta', tipo: 'email', titolo: 'Pilot order to sign', corpo: ORDINE, autore: 'Harbor Labs <orders@harbor.example>', quando: new Date(ora - 600_000).toISOString(), percorso: 'INBOX' })
    store.salvaDocumenti(docs)
    store.salvaFeed([{ tipo: 'Priority', titolo: 'Fix the three Northwind account issues', testo: 'Unblocks the submission.', urgenza: 'today', fonte: 'posta', doc: 'posta:INBOX:1', offerta: 'I can list the fixes.' }])
  })
  chi.dentro(b.id, () => {
    cfg.scrivi({ lingua: 'en', diSerie: false, onboarding: true, giro: true } as Parameters<typeof cfg.scrivi>[0])
    store.salvaDocumenti([{ id: 'posta:INBOX:5', fonte: 'posta', tipo: 'email', titolo: 'Q3 invoice', corpo: 'Can you call me about the Q3 invoice? Dana', autore: 'Dana <dana@example.com>', quando: new Date(ora - 3_600_000).toISOString(), percorso: 'INBOX' }])
    store.salvaFeed([{ tipo: 'Priority', titolo: 'Call the accountant about the Q3 invoice', testo: 'Dana asks for a call.', urgenza: 'no rush', fonte: 'posta', doc: 'posta:INBOX:5', offerta: 'I can prepare the call notes.' }])
  })
  store.chiudiIndici()
  const s = await avviaServer()
  servizio = s.p; base = s.url
})

after(async () => {
  await spegni(servizio); await spegni(modello)
  store.chiudiIndici()
  rmSync(casa, { recursive: true, force: true })
})

const chiama = async (percorso: string, o: { metodo?: string; corpo?: unknown; chi?: string; a?: string } = {}) => {
  const r = await fetch(`${o.a ?? base}${percorso}`, {
    method: o.metodo ?? 'GET',
    headers: { authorization: `Bearer ${o.chi ?? token}`, 'content-type': 'application/json' },
    ...(o.corpo !== undefined ? { body: JSON.stringify(o.corpo) } : {})
  })
  const testo = await r.text()
  let corpo: Record<string, unknown> = {}
  try { corpo = JSON.parse(testo) } catch { /* un flusso */ }
  return { stato: r.status, corpo, testo }
}
const aspetta = (ms: number) => new Promise(r => setTimeout(r, ms))
const letture = () => existsSync(REGISTRO)
  ? readFileSync(REGISTRO, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as { utente?: string; max_tokens?: number }).filter(x => (x.utente ?? '').includes('MESSAGGIO CORRENTE')).length
  : 0

/** Il filo dei compiti, ascoltato da qui: gli eventi arrivano in `eventi`. */
function ascolta(chiDice = token) {
  const eventi: Record<string, unknown>[] = []
  const ctl = new AbortController()
  void (async () => {
    try {
      const r = await fetch(`${base}/api/compiti/flusso`, { headers: { authorization: `Bearer ${chiDice}` }, signal: ctl.signal })
      const lettore = r.body!.getReader()
      const dec = new TextDecoder()
      let resto = ''
      for (;;) {
        const { value, done } = await lettore.read()
        if (done) break
        resto += dec.decode(value, { stream: true })
        let i: number
        while ((i = resto.indexOf('\n\n')) >= 0) {
          const blocco = resto.slice(0, i); resto = resto.slice(i + 2)
          const d = blocco.split('\n').find(l => l.startsWith('data: '))
          if (d) eventi.push(JSON.parse(d.slice(6)))
        }
      }
    } catch { /* chiuso da noi */ }
  })()
  return { eventi, chiudi: () => ctl.abort() }
}
async function finché(f: () => boolean | Promise<boolean>, ms = 15000, cosa = 'la condizione'): Promise<void> {
  const fino = Date.now() + ms
  while (Date.now() < fino) { if (await f()) return; await aspetta(40) }
  throw new Error(`${cosa} non è arrivata in ${ms} ms`)
}

test('l’occhio: risponde subito mentre il modello è fermo; la seconda pressione si attacca; la fine porta la carta', async () => {
  const filo = ascolta()
  await aspetta(150)
  await fetch(`${finto}/__trattieni`, { method: 'POST' })
  try {
    const r = await chiama('/api/feed/genera', { metodo: 'POST' })
    assert.equal(r.stato, 200, r.testo)
    assert.equal(r.corpo.avviata, true)
    const lettura = r.corpo.lettura as { id: string; passo: string }
    assert.ok(lettura?.id)
    // la lettura del modello è arrivata ed è ferma: la risposta non l'ha aspettata
    await finché(() => letture() === 1, 10000, 'la lettura trattenuta')
    const f = await (await fetch(`${finto}/__richieste`)).json() as { trattenute: number }
    assert.ok(f.trattenute >= 1)
    const seconda = await chiama('/api/feed/genera', { metodo: 'POST' })
    assert.equal(seconda.corpo.gia, true)
    assert.equal((seconda.corpo.lettura as { id: string }).id, lettura.id)
    assert.equal(letture(), 1, 'una lettura sola, anche premendo due volte')
    // e /api/feed la dice, con il fuoco e la domanda nella stessa risposta
    const feed = await chiama('/api/feed')
    assert.equal((feed.corpo.lettura as { id: string }).id, lettura.id)
    assert.ok('fuoco' in feed.corpo && 'domanda' in feed.corpo)
    await fetch(`${finto}/__lascia`, { method: 'POST' })
    await finché(() => filo.eventi.some(e => e.fase === 'lettura' && e.stato === 'fine'), 20000, 'la fine della lettura')
    const fine = filo.eventi.find(e => e.fase === 'lettura' && e.stato === 'fine') as { lettura: { id: string }; nuove: number }
    assert.equal(fine.lettura.id, lettura.id)
    assert.ok(fine.nuove >= 1, JSON.stringify(fine))
    assert.ok(filo.eventi.some(e => e.fase === 'lettura' && e.stato === 'corre'))
    assert.equal((await chiama('/api/feed')).corpo.lettura, null, 'finita, non resta niente')
  } finally {
    await fetch(`${finto}/__lascia`, { method: 'POST' })
    filo.chiudi()
  }
})

test('scaldare con la chiave: niente, e le chat restano quelle di prima', async () => {
  const prima = (await chiama('/api/chat')).testo
  const r = await chiama('/api/modello/scalda', { metodo: 'POST' })
  assert.deepEqual(r.corpo, { ok: true, avviato: false, perche: 'motore' })
  assert.equal((await chiama('/api/chat')).testo, prima)
})

test('una chat lascia le sue tappe in /api/tempi, via chiave; la domanda secca va in uso come rispostaBreve', async () => {
  const r = await chiama('/api/chat/tp1', { metodo: 'POST', corpo: { testo: 'When is the audit call with Priya?' } })
  assert.equal(r.stato, 200)
  assert.match(r.testo, /"fase":"fine"/)
  const t = await chiama('/api/tempi')
  const chat = t.corpo.chat as { via: string; materiale?: number; prompt?: number; primaParola?: number; fine: number; breve: boolean }[]
  const x = chat.at(-1)!
  assert.equal(x.via, 'chiave')
  for (const k of ['materiale', 'prompt', 'primaParola', 'fine'] as const) assert.equal(typeof x[k], 'number', k)
  assert.equal(x.breve, true)
  assert.ok(Array.isArray(t.corpo.richieste))
  assert.ok(t.corpo.bordo && typeof t.corpo.bordo === 'object')
  const righe = chi.dentro(A, () => store.default.prepare("SELECT lavoro FROM uso WHERE lavoro IN ('risposta', 'rispostaBreve')").all() as { lavoro: string }[])
  assert.ok(righe.some(r => r.lavoro === 'rispostaBreve'), JSON.stringify(righe))
})

test('POST /api/tempi: la lista sì, il resto 400', async () => {
  assert.equal((await chiama('/api/tempi', { metodo: 'POST', corpo: { segni: { sconosciuto: 1 } } })).stato, 400)
  assert.equal((await chiama('/api/tempi', { metodo: 'POST', corpo: { segni: { accesso: 40, 'casa-disegnata': 410 } } })).stato, 200)
})

test('Affidalo: senza motore niente si scrive; con il motore la riga nasce affidata e la carta si chiude', async () => {
  // B non ha un motore
  const fb = await chiama('/api/feed', { chi: tokenB })
  const vb = (fb.corpo.aperti as { id: string }[])[0]
  assert.ok(vb, fb.testo.slice(0, 600))
  const primaB = ((await chiama('/api/compiti', { chi: tokenB })).corpo.compiti as unknown[]).length
  const no = await chiama('/api/compiti/affida', { metodo: 'POST', chi: tokenB, corpo: { id: 'c-no', testo: 'Call the accountant', voce: vb.id } })
  assert.equal(no.stato, 400)
  assert.equal(no.corpo.errore, 'Collega Claude e potrò lavorarci.')
  assert.ok(((await chiama('/api/feed', { chi: tokenB })).corpo.aperti as { id: string }[]).some(v => v.id === vb.id), 'la carta è ancora aperta')
  assert.equal(((await chiama('/api/compiti', { chi: tokenB })).corpo.compiti as unknown[]).length, primaB, 'nessuna riga nuova')
  // A sì
  const apertiA = (await chiama('/api/feed')).corpo.aperti as { id: string; titolo: string }[]
  const va = apertiA.find(v => v.titolo.startsWith('Fix the three'))!
  assert.ok(va, JSON.stringify(apertiA.map(v => v.titolo)))
  const si = await chiama('/api/compiti/affida', { metodo: 'POST', corpo: { id: 'c-si', testo: va.titolo, voce: va.id } })
  assert.equal(si.stato, 200, si.testo)
  const riga = (si.corpo.compiti as { id: string; stato: string; origine: string }[]).find(c => c.id === 'c-si')
  assert.ok(riga && ['delegato', 'pronto', 'chiede'].includes(riga.stato), JSON.stringify(riga))
  assert.ok(!((await chiama('/api/feed')).corpo.aperti as { id: string }[]).some(v => v.id === va.id), 'la carta si è chiusa')
  // una carta che non c'è più: 409
  assert.equal((await chiama('/api/compiti/affida', { metodo: 'POST', corpo: { testo: 'x', voce: va.id } })).stato, 409)
})

test('ospitato: /api/tempi non esiste, GET né POST', async () => {
  // un'app piccola con le stesse rotte: un server ospitato vero ascolterebbe su tutte le interfacce del Mac
  const express = (await import('express')).default
  const { rotteTempi } = await import('./tempi-rotte.ts')
  const tempi = await import('./tempi.ts')
  for (const ospitato of [true, false]) {
    const app = express()
    app.use(express.json())
    rotteTempi(app, { ospitato: () => ospitato, bordo: () => tempi.bordo([], []) })
    const srv = app.listen(0, '127.0.0.1')
    await new Promise(r => srv.once('listening', r))
    const url = `http://127.0.0.1:${(srv.address() as { port: number }).port}`
    try {
      const g = await fetch(`${url}/api/tempi`)
      const p = await fetch(`${url}/api/tempi`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ segni: { accesso: 1 } }) })
      assert.deepEqual([g.status, p.status], ospitato ? [404, 404] : [200, 200])
    } finally { await new Promise(r => srv.close(r)) }
  }
})

test('npm run velocita rifiuta la casa vera, una HOME vera e una cartella piena per seminare', async () => {
  const { perche } = await import('./velocita.ts')
  const tmp = mkdtempSync(join(tmpdir(), 'myynd-velocita-cli-'))
  try {
    const casaVera = join(tmp, 'vera')
    mkdirSync(join(casaVera, '.myynd', 'conti'), { recursive: true })
    const h = join(tmp, 'h')
    assert.match(perche({ seme: null, dati: join(casaVera, '.myynd'), conto: 'x@y', json: false, aiuto: false, sbagliato: null }, h, casaVera)!, /cartella vera/)
    assert.match(perche({ seme: null, dati: join(casaVera, '.myynd', 'conti'), conto: 'x@y', json: false, aiuto: false, sbagliato: null }, h, casaVera)!, /cartella vera/)
    assert.match(perche({ seme: null, dati: join(tmp, 'copia'), conto: 'x@y', json: false, aiuto: false, sbagliato: null }, casaVera, casaVera)!, /HOME/)
    assert.match(perche({ seme: null, dati: join(tmp, 'copia'), conto: 'x@y', json: false, aiuto: false, sbagliato: null }, '/Users/qualcuno', casaVera)!, /HOME/)
    mkdirSync(join(tmp, 'piena')); writeFileSync(join(tmp, 'piena', 'x'), '1')
    assert.match(perche({ seme: 10, dati: join(tmp, 'piena'), conto: null, json: false, aiuto: false, sbagliato: null }, h, casaVera)!, /vuota/)
    assert.equal(perche({ seme: 10, dati: join(tmp, 'nuova'), conto: null, json: false, aiuto: false, sbagliato: null }, h, casaVera), null)
    assert.equal(perche({ seme: null, dati: join(tmp, 'copia'), conto: 'x@y', json: false, aiuto: false, sbagliato: null }, h, casaVera), null)
  } finally { rmSync(tmp, { recursive: true, force: true }) }
})

// — il banco, solo con MYYND_VELOCITA=1 —

const mediana = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? NaN }
const p99 = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(s.length * 0.99) - 1)] ?? NaN }

test('il banco: occhio, chat e ciclo con ottomila documenti', { skip: !BANCO }, async () => {
  const tabella: [string, string][] = []
  // l'occhio: la risposta, e la fine meno il modello (che qui risponde subito)
  const ack: number[] = [], fine: number[] = []
  for (let i = 0; i < 3; i++) {
    const filo = ascolta(); await aspetta(150)
    const t0 = performance.now()
    const r = await chiama('/api/feed/genera', { metodo: 'POST' })
    const t1 = performance.now()
    ack.push(t1 - t0)
    const id = (r.corpo.lettura as { id: string } | null)?.id
    if (id) await finché(() => filo.eventi.some(e => e.fase === 'lettura' && e.stato !== 'corre' && (e.lettura as { id: string }).id === id), 60000, 'la fine')
    fine.push(performance.now() - t1)
    filo.chiudi()
  }
  tabella.push(['Leggi adesso · risposta (mediana di 3)', `${Math.round(mediana(ack))} ms`], ['Leggi adesso · fine dopo la risposta (mediana di 3)', `${Math.round(mediana(fine))} ms`])
  // la chat: la prima parola meno i 400 ms del modello finto
  const prima: number[] = []
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now()
    const r = await fetch(`${base}/api/chat/banco${i}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ testo: 'When is the audit call with Priya?' }) })
    const lettore = r.body!.getReader(); const dec = new TextDecoder(); let tutto = ''; let t = NaN
    for (;;) {
      const { value, done } = await lettore.read(); if (done) break
      tutto += dec.decode(value, { stream: true })
      if (Number.isNaN(t) && tutto.includes('"fase":"testo"')) t = performance.now() - t0
    }
    prima.push(t - 400)
  }
  tabella.push(['Chat · prima parola meno il modello (mediana di 3, chiave)', `${Math.round(mediana(prima))} ms`])
  // il ciclo: una lettura del Mac di 400 file da 20k caratteri, e intanto la pagina che chiede
  const cartella = join(home, 'Documents', 'banco')
  mkdirSync(cartella, { recursive: true })
  const riga = 'The pilot order and the launch plan need review before Friday. '
  for (let i = 0; i < 400; i++) writeFileSync(join(cartella, `nota-${i}.md`), `# Nota ${i}\n\n${riga.repeat(Math.ceil(20000 / riga.length)).slice(0, 20000)}`)
  const c = await chiama('/api/connettori/desktop', { metodo: 'POST', corpo: { cartelle: [cartella] } })
  assert.equal(c.stato, 200, c.testo)
  const lettura = fetch(`${base}/api/sincronizza?fonte=desktop`, { headers: { authorization: `Bearer ${token}` } }).then(r => r.text())
  let finita = false
  void lettura.then(() => { finita = true })
  const attese: number[] = []
  while (!finita) {
    const t0 = performance.now()
    await chiama('/api/compiti')
    attese.push(performance.now() - t0)
    await aspetta(50)
  }
  tabella.push(['Mentre legge 400 file · GET /api/compiti p99', `${Math.round(p99(attese))} ms (${attese.length} richieste)`], ['Mentre legge 400 file · mediana', `${Math.round(mediana(attese))} ms`], ['Mentre legge 400 file · le tre più lente', [...attese].sort((a, b) => b - a).slice(0, 3).map(x => `${Math.round(x)} ms`).join(', ')])
  console.log('\nbanco P10\n' + tabella.map(([a, b]) => `  ${a.padEnd(60)} ${b}`).join('\n') + '\n')
})
