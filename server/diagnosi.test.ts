// Il rapporto di diagnosi: quello che è suo resta coperto (le email, le
// chiavi, i gettoni, i percorsi nella sua casa), le righe sono le ultime
// cinquecento, il file va sulla Scrivania e non ne sovrascrive un altro. E la
// rotta vera, con un server in una casa finta: niente rete.
//
//   node --test server/diagnosi.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as diagnosi from './diagnosi.ts'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-diagnosi-'))
after(() => rmSync(CASA, { recursive: true, force: true }))

const SPORCO = [
  'connessione di marta.rossi@example.com a imap.example.com',
  'chiave sk-ant-api03-AbCdEf123456_ghIJKL-7890 rifiutata',
  'OpenAI sk-proj-Zz9Yy8Xx7Ww6Vv5Uu4 e GitHub ghp_abcdefghijklmnopqrstuvwxyz0123456789',
  'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
  '{"apiKey":"abc123segretissimo","token": "t0k3n-di-prova", "password":"hunter2"}',
  'calendario https://p01-caldav.icloud.com/published/2/MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkw?token=XYZ987&lang=it',
  'leggo /Users/tobia/Desktop/Progetti segreti/Contratto Rossi.pdf e /Users/altra/Documents/x.txt',
  'gettone di sessione 9f8e7d6c5b4a39281706f5e4d3c2b1a0f9e8d7c6b5a4',
  'la casa di tobia è piena di cose',
  'agenda https://calendar.google.com/calendar/ical/giulia.bianchi%40example.org/public/basic.ics',
  'cartella ~/Progetti/Fusione Orsini/nota.md, letta',
  'MYYND_SMTP_PASS=pwd-di-posta MYYND_GOOGLE_CLIENT_SECRET=gocspx-prova'
].join('\n')

test('oscura: email, chiavi, gettoni, query, percorsi nella casa e il nome utente', () => {
  const s = diagnosi.oscura(SPORCO, { casa: '/Users/tobia', utente: 'tobia' })
  for (const vietato of ['marta.rossi', 'example.com>', 'sk-ant-api03', 'AbCdEf123456', 'sk-proj', 'ghp_', 'eyJhbGci', 'segretissimo', 't0k3n', 'hunter2',
    'XYZ987', 'MTIzNDU2', 'Progetti segreti', 'Contratto Rossi', '/Users/', 'altra', '9f8e7d6c5b4a', 'tobia',
    'giulia.bianchi', 'Fusione Orsini', 'pwd-di-posta', 'gocspx-prova']) {
    assert.ok(!s.includes(vietato), `«${vietato}» è rimasto:\n${s}`)
  }
  assert.match(s, /\[email\] a imap\.example\.com/, 'l’indirizzo del server resta: dice dove si è rotto')
  assert.match(s, /chiave \[secret\] rifiutata/)
  assert.match(s, /Bearer \[secret\]/)
  assert.match(s, /leggo ~\/\[path\]/)
  assert.match(s, /la casa di \[user\]/)
  assert.match(s, /ical\/\[email\]\/public/)
  assert.match(s, /cartella ~\/\[path\], letta/)
  assert.match(s, /MYYND_SMTP_PASS=\[secret\]/)
  // le righe normali restano leggibili
  for (const normale of [
    '[2026-10-09T10:00:00.000Z] myynd · uso · titolo · entrata 120 · uscita 8',
    'myynd · rassegna · 3 entrate (2 scelte su 14 titoli nuovi) · 10 nel mazzo',
    'myynd · il motore compatibile non risponde: lavora claude finché non torna',
    'calendario https://p01-caldav.icloud.com/published/2'
  ]) assert.equal(diagnosi.oscura(normale, { casa: '/Users/tobia', utente: 'tobia' }), normale)
  assert.equal(diagnosi.oscura('leggo /Users/tobia/Desktop/Progetti segreti/Contratto Rossi.pdf, poi basta', { casa: '/Users/tobia', utente: 'tobia' }),
    'leggo ~/[path], poi basta')
})

test('le ultime cinquecento righe: dal file del guscio e dalla sua copia, o da quelle tenute in memoria', () => {
  const f = join(CASA, 'myynd.log')
  writeFileSync(`${f}.1`, Array.from({ length: 400 }, (_, i) => `vecchia ${i}`).join('\n') + '\n')
  writeFileSync(f, Array.from({ length: 300 }, (_, i) => `nuova ${i}`).join('\n') + '\n')
  const r = diagnosi.ultimeRighe(f)
  assert.equal(r.length, diagnosi.RIGHE)
  assert.equal(r[0], 'vecchia 200')
  assert.equal(r[r.length - 1], 'nuova 299')
  // senza file: quello che è passato da console da quando si ascolta
  diagnosi.ascolta()
  diagnosi.ascolta()
  console.warn('myynd · prova di memoria')
  assert.match(diagnosi.ultimeRighe(join(CASA, 'non-c-e.log')).at(-1) ?? '', /prova di memoria/)
})

test('il rapporto: versione, sistema, motore, guasti, fonti, righe; tutto coperto; il file non ne sovrascrive un altro', () => {
  const testo = diagnosi.rapporto({
    versione: '0.2.42', macos: 'macOS 15.6 (Darwin 24.6.0, arm64)', motore: 'claude', modelli: { casa: 'claude-haiku-5-5', media: 'claude-sonnet-5-5', frontiera: 'claude-sonnet-5-5' },
    salute: 'compatibile: spento, working with claude',
    mancate: [{ lavoro: 'priorita', volte: 3, dal: '2026-10-09T09:00:00.000Z', ultima: '2026-10-09T09:20:00.000Z', perche: 'Non riesco a raggiungere marta@example.com' }],
    fonti: [{ fonte: 'posta', rimedio: 'credenziale' }],
    righe: SPORCO.split('\n'),
    adesso: new Date(2026, 9, 9, 14, 32)
  }, { casa: '/Users/tobia', utente: 'tobia' })
  assert.match(testo, /App version: 0\.2\.42/)
  assert.match(testo, /System: macOS 15\.6/)
  assert.match(testo, /Models: casa claude-haiku-5-5/)
  assert.match(testo, /priorita: 3x since/)
  assert.match(testo, /posta \(credenziale\)/)
  assert.match(testo, /Last 12 log lines:/)
  assert.ok(!/marta|sk-ant|hunter2|\/Users\//.test(testo))
  const scrivania = join(CASA, 'Desktop')
  const a = diagnosi.salva(scrivania, testo, new Date(2026, 9, 9, 14, 32))
  const b = diagnosi.salva(scrivania, testo, new Date(2026, 9, 9, 14, 32))
  assert.equal(a, join(scrivania, 'Myynd diagnostics 2026-10-09 14.32.txt'))
  assert.equal(b, join(scrivania, 'Myynd diagnostics 2026-10-09 14.32 2.txt'))
  assert.equal(readFileSync(a, 'utf8'), testo)
})

// — la rotta vera —

const TOKEN = 'sviluppo-non-in-produzione'
let server: ChildProcess | null = null
after(() => { server?.kill('SIGKILL') })

test('la rotta: un file sulla Scrivania, con le righe del registro del guscio coperte', async () => {
  const casa = join(CASA, 'casa')
  const dati = join(CASA, 'dati')
  mkdirSync(casa, { recursive: true }); mkdirSync(dati, { recursive: true })
  const registro = join(CASA, 'guscio.log')
  writeFileSync(registro, `[2026-10-09T10:00:00.000Z] myynd · posta · ${casa}/Library/Mail/V10 non si apre per luca@example.org\n` +
    '[2026-10-09T10:00:01.000Z] myynd · chiave sk-ant-api03-SEGRETAsegreta1234567 respinta\n')
  const { ANTHROPIC_API_KEY: _a, OPENAI_API_KEY: _o, MYYND_POSTGRES: _p, MYYND_TYPESAFE: _t, RAILWAY_ENVIRONMENT: _r, ...ambiente } = process.env
  const s = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.ts'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...ambiente, HOME: casa, MYYND_DATI: dati, MYYND_DEV: '1', PORT: '0', MYYND_REGISTRO: registro, MYYND_VERSIONE: '9.9.9', ANTHROPIC_BASE_URL: 'http://127.0.0.1:9' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  server = s
  const base = await new Promise<string>((risolvi, rifiuta) => {
    let fuori = ''
    const tetto = setTimeout(() => rifiuta(new Error(`il server non è partito:\n${fuori}`)), 20_000)
    s.stdout!.on('data', d => { fuori += String(d); const m = fuori.match(/server su (http:\/\/127\.0\.0\.1:\d+)/); if (m) { clearTimeout(tetto); risolvi(m[1]) } })
    s.stderr!.on('data', d => { fuori += String(d) })
  })
  const chiama = () => fetch(`${base}/api/diagnosi`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` } })
  let r = await chiama()
  for (let i = 0; r.status === 401 && i < 100; i++) { await new Promise(ok => setTimeout(ok, 100)); r = await chiama() }
  assert.equal(r.status, 200, await r.clone().text())
  const { nome } = await r.json() as { nome: string }
  const file = join(casa, 'Desktop', nome)
  assert.ok(existsSync(file), `${file} non c'è: ${readdirSync(casa).join(', ')}`)
  const testo = readFileSync(file, 'utf8')
  assert.match(testo, /App version: 9\.9\.9/)
  assert.match(testo, /non si apre per \[email\]/)
  assert.match(testo, /myynd · posta · ~\/\[path\]/)
  assert.ok(!testo.includes('luca@example.org') && !testo.includes('SEGRETA') && !testo.includes(casa), testo)
  s.kill('SIGKILL'); server = null
})
