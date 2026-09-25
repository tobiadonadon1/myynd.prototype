// L'osservatore dalla parte del server: chi lo possiede, cosa scarta, come scrive.
//
//   node --test server/osservatore.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Sessione } from './osservatore.ts'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-osservatore-'))
process.env.MYYND_DATI = CASA
process.env.MYYND_APP = '1'
delete process.env.ANTHROPIC_API_KEY

const conti = await import('./conti.ts')
const chi = await import('./chi.ts')
const cfg = await import('./config.ts')
const store = await import('./store.ts')
const oss = await import('./osservatore.ts')
const addio = await import('./addio.ts')
const progetti = await import('./progetti.ts')
const ab = await import('./abitudini.ts')

let anna = '', bruno = ''
const mandati: unknown[] = []
const porta = { on() {}, postMessage(m: unknown) { mandati.push(m) } }

before(async () => {
  const a = await conti.registra('anna@esempio.it', 'passwordlunga1')
  const b = await conti.registra('bruno@esempio.it', 'passwordlunga2')
  assert.ok(a.ok && b.ok)
  anna = a.ok ? a.id : ''; bruno = b.ok ? b.id : ''
  chi.dentro(anna, () => { cfg.scrivi({ lingua: 'en', fuso: 'Europe/Rome' }); store.azzeraTutto() })
  chi.dentro(bruno, () => { cfg.scrivi({ lingua: 'en', fuso: 'Europe/Rome' }); store.azzeraTutto() })
  oss.ascolta(porta)
})
after(() => { store.chiudiIndici(); rmSync(CASA, { recursive: true, force: true }) })

const ADESSO = new Date('2026-09-24T09:00:00.000Z')
const sessione = (x: Partial<Sessione> = {}): Sessione => ({
  bundle: 'com.apple.Safari', app: 'Safari', titolo: 'Northwind pricing - Google Docs',
  inizio: '2026-09-24T07:10:00.000Z', fine: '2026-09-24T07:14:30.000Z', secondi: 270, ...x
})
const righe = () => store.default.prepare('SELECT * FROM sessioni_app ORDER BY id').all() as { bundle: string; titolo: string | null; secondi: number; giorno: string; progetto: string | null; cartella: string | null }[]

/** Il file del guscio (P1A), cercato accanto a questo test, non nella cartella temporanea. */
const GUSCIO = fileURLToPath(new URL('../desktop/sessioni.ts', import.meta.url))
const QUI = fileURLToPath(new URL('./osservatore.ts', import.meta.url))

/** Le tre dichiarazioni, testo per testo: l'insieme fino alla sua parentesi, le due espressioni fino a fine riga. */
function dichiarazioni(testo: string): Record<string, string> {
  const prendi = (re: RegExp) => testo.match(re)?.[0] ?? ''
  return {
    ESCLUSE_SEMPRE: prendi(/export const ESCLUSE_SEMPRE = new Set\(\[[\s\S]*?\]\)/),
    TITOLO_PRIVATO: prendi(/export const TITOLO_PRIVATO = .*$/m),
    TITOLO_SEGRETO: prendi(/export const TITOLO_SEGRETO = .*$/m)
  }
}

test('le tre costanti sono uguali carattere per carattere a desktop/sessioni.ts, quando il file c’è', { skip: !existsSync(GUSCIO) }, () => {
  const guscio = dichiarazioni(readFileSync(GUSCIO, 'utf8'))
  const server = dichiarazioni(readFileSync(QUI, 'utf8'))
  for (const nome of ['ESCLUSE_SEMPRE', 'TITOLO_PRIVATO', 'TITOLO_SEGRETO']) {
    assert.ok(guscio[nome] && server[nome], `${nome} manca da una parte`)
    assert.equal(server[nome], guscio[nome], `${nome} non è lo stesso testo del guscio`)
  }
})

test('disponibile solo dentro l’app e non su un server; e ospitato, o senza app, `ascolta` non registra nessun ascoltatore', () => {
  assert.equal(oss.disponibile(), true)
  const registrati: unknown[] = []
  const portaSpia = { on(_e: string, f: unknown) { registrati.push(f) }, postMessage() {} }
  oss.perProva.forza({ app: true, ospitato: true }); assert.equal(oss.disponibile(), false)
  assert.equal(oss.ascolta(portaSpia), false, 'ospitato: niente ascoltatore')
  oss.perProva.forza({ app: false, ospitato: false }); assert.equal(oss.disponibile(), false)
  assert.equal(oss.ascolta(portaSpia), false, 'senza app: niente ascoltatore')
  assert.equal(registrati.length, 0)
  oss.perProva.forza(null)
  assert.equal(oss.ascolta(portaSpia), true, 'dentro l’app sì')
  assert.equal(registrati.length, 1)
  oss.ascolta(porta)
})

test('accendere scrive il proprietario; il precedente si spegne; gli altri vedono «altro conto»', () => {
  chi.dentro(anna, () => {
    const s = oss.imposta({ acceso: true }, ADESSO)
    assert.equal(s.acceso, true); assert.equal(s.titoli, true); assert.equal(s.altroConto, false)
  })
  assert.equal(oss.proprietario(), anna)
  assert.equal(JSON.parse(readFileSync(join(CASA, 'osservatore.json'), 'utf8')).utente, anna)
  chi.dentro(bruno, () => {
    const s = oss.statoPerChiChiede(ADESSO)
    assert.equal(s.acceso, false); assert.equal(s.altroConto, true); assert.equal(s.osservate, 0)
    // spegnere da chi non è il proprietario non cambia niente
    oss.imposta({ acceso: false }, ADESSO)
  })
  assert.equal(oss.proprietario(), anna)
  chi.dentro(bruno, () => oss.imposta({ acceso: true }, ADESSO))
  assert.equal(oss.proprietario(), bruno)
  chi.dentro(anna, () => {
    assert.equal(cfg.leggi().osservatore?.acceso, false, 'il precedente si è spento nella sua configurazione')
    assert.equal(oss.statoPerChiChiede(ADESSO).altroConto, true)
  })
  chi.dentro(bruno, () => oss.imposta({ acceso: false }, ADESSO))
  assert.equal(oss.proprietario(), null)
  assert.equal(existsSync(join(CASA, 'osservatore.json')), false)
  chi.dentro(anna, () => oss.imposta({ acceso: true }, ADESSO))
  assert.equal(oss.proprietario(), anna)
})

test('scriviSessioni scarta Myynd, un gestore di password, un bundle escluso, uno storto, una fine nel futuro e la 201ª', () => {
  chi.dentro(anna, () => {
    store.default.exec('DELETE FROM sessioni_app')
    cfg.aggiorna({ osservatore: { ...cfg.leggi().osservatore!, escluse: ['com.tinyspeck.slackmacgap'] } })
    const tante = [...Array(201)].map((_, i) => sessione({ inizio: `2026-09-24T0${i % 2 ? '6' : '5'}:00:00.000Z`, fine: `2026-09-24T0${i % 2 ? '6' : '5'}:00:10.000Z`, secondi: 10, titolo: `Foglio ${i}` }))
    const scarti = oss.scriviSessioni([
      sessione({ bundle: 'com.myynd.app', app: 'Myynd' }),
      sessione({ bundle: 'com.1password.1password', app: '1Password' }),
      sessione({ bundle: 'com.tinyspeck.slackmacgap', app: 'Slack' }),
      sessione({ bundle: 'not a bundle!' }),
      sessione({ fine: '2026-09-24T09:10:00.000Z', inizio: '2026-09-24T09:00:00.000Z' }),
      sessione({ secondi: 0 }),
      { niente: true }
    ], ADESSO)
    assert.equal(scarti, 0)
    const n = oss.scriviSessioni(tante, ADESSO)
    assert.equal(n, 200, 'la 201ª si butta')
    assert.equal(righe().length, 200)
    assert.ok(righe().every(r => r.bundle === 'com.apple.Safari'))
  })
})

test('i titoli privati, segreti e di accesso diventano null; quelli normali restano', () => {
  chi.dentro(anna, () => {
    store.default.exec('DELETE FROM sessioni_app')
    oss.scriviSessioni([
      sessione({ titolo: 'Navigazione anonima - Mozilla Firefox' }),
      sessione({ titolo: 'New Tab - Google Chrome (Incognito)' }),
      sessione({ titolo: 'Enter verification code' }),
      sessione({ titolo: 'Northwind pricing - Google Docs' }),
      sessione({ titolo: 'Inbox (3) - Gmail' })
    ], ADESSO)
    assert.deepEqual(righe().map(r => r.titolo), [null, null, null, 'Northwind pricing - Google Docs', 'Inbox (3) - Gmail'])
  })
})

test('un titolo tagliato dal guscio a 160 caratteri con un’emoji resta una sessione intera: gli stessi limiti contano i caratteri, non le unità UTF-16', { skip: !existsSync(GUSCIO) }, async () => {
  const guscio = await import('../desktop/sessioni.ts')
  // un tweet lungo con la nota musicale davanti: il guscio lo taglia a 160 caratteri, che sono 161 unità
  const lungo = '🎵 ' + 'Northwind pricing thread, the long version with every detail spelled out for the team '.repeat(3)
  const titolo = guscio.pulisciTitolo(lungo)!
  assert.equal(Array.from(titolo).length, guscio.TITOLO_MASSIMO)
  assert.ok(titolo.length > guscio.TITOLO_MASSIMO, 'la prova vale solo se il titolo ha un carattere astrale')
  const app = '🎵'.repeat(guscio.APP_MASSIMA)
  chi.dentro(anna, () => {
    store.default.exec('DELETE FROM sessioni_app')
    const n = oss.scriviSessioni([
      sessione({ bundle: 'com.google.Chrome', app: 'Google Chrome', titolo }),
      sessione({ bundle: 'com.google.Chrome', app, titolo: null, secondi: 30 }),
      // più lungo del limite anche in caratteri: si taglia, e i secondi restano
      sessione({ bundle: 'com.google.Chrome', app: 'Google Chrome', titolo: '🎵'.repeat(300), secondi: 40 }),
      sessione({ titolo: 'Inbox (3) - Gmail' })
    ], ADESSO)
    assert.equal(n, 4, 'nessuna sessione cade per il conto dei caratteri')
    const r = righe()
    assert.deepEqual(r.map(x => x.secondi), [270, 30, 40, 270])
    assert.equal(r[0]!.titolo, titolo, 'il titolo del guscio arriva intero')
    assert.equal(Array.from(r[2]!.titolo!).length, guscio.TITOLO_MASSIMO)
    assert.equal(Array.from((store.default.prepare('SELECT app FROM sessioni_app ORDER BY id').all() as { app: string }[])[1]!.app).length, guscio.APP_MASSIMA)
  })
})

test('con i titoli spenti ogni titolo è null', () => {
  chi.dentro(anna, () => {
    store.default.exec('DELETE FROM sessioni_app')
    oss.imposta({ titoli: false }, ADESSO)
    assert.equal(oss.statoPerChiChiede(ADESSO).titoli, false)
    oss.scriviSessioni([sessione(), sessione({ titolo: 'Inbox (3) - Gmail' })], ADESSO)
    assert.deepEqual(righe().map(r => r.titolo), [null, null])
    oss.imposta({ titoli: true }, ADESSO)
  })
})

test('una sessione dalle 23:50 alle 00:20 di Roma diventa due righe, 600 e 1200 secondi', () => {
  chi.dentro(anna, () => {
    store.default.exec('DELETE FROM sessioni_app')
    oss.scriviSessioni([sessione({ inizio: '2026-09-23T21:50:00.000Z', fine: '2026-09-23T22:20:00.000Z', secondi: 1800, titolo: null })], ADESSO)
    assert.deepEqual(righe().map(r => [r.giorno, r.secondi]), [['2026-09-23', 600], ['2026-09-24', 1200]])
  })
})

test('il progetto si legge dal titolo, la cartella dal nome nel titolo', () => {
  chi.dentro(anna, () => {
    store.default.exec('DELETE FROM sessioni_app')
    const p = progetti.scrivi({ nome: 'Northwind', obiettivo: 'Ship it' })
    oss.impostaCartelleNote(['/Users/x/Developer/northwind-app', '/Users/x/Developer/ab'])
    oss.scriviSessioni([sessione({ titolo: 'northwind-app - app.tsx' }), sessione({ titolo: 'Something about ab' })], ADESSO)
    assert.equal(righe()[0]!.progetto, p.id)
    assert.equal(righe()[0]!.cartella, 'northwind-app')
    assert.equal(righe()[1]!.cartella, null, 'due lettere non bastano')
    assert.equal(oss.cartellaNelTitolo('Northwind Pricing', ['northwind']), 'northwind')
    assert.equal(oss.cartellaNelTitolo('northwindx', ['northwind']), null, 'serve un confine di parola')
  })
})

test('pausa 60 mette pausaFino a un’ora; 0 e 481 no; riprendi la toglie; solo il proprietario', () => {
  chi.dentro(anna, () => {
    oss.pausa(60, ADESSO)
    assert.equal(oss.stato(ADESSO).pausaFino, '2026-09-24T10:00:00.000Z')
    assert.equal(oss.stato(new Date('2026-09-24T10:00:01.000Z')).pausaFino, null, 'passata, è null')
    assert.throws(() => oss.pausa(0, ADESSO)); assert.throws(() => oss.pausa(481, ADESSO))
    oss.riprendi()
    assert.equal(oss.stato(ADESSO).pausaFino, null)
  })
  chi.dentro(bruno, () => assert.throws(() => oss.pausa(60, ADESSO), /altro account/))
})

test('la conservazione: dopo trenta giorni una riga al giorno per app e progetto, senza titolo; dopo quattrocento via', () => {
  chi.dentro(anna, () => {
    store.default.exec('DELETE FROM sessioni_app')
    const ins = store.default.prepare('INSERT INTO sessioni_app (bundle, app, titolo, inizio, fine, secondi, giorno, progetto, cartella) VALUES (?,?,?,?,?,?,?,?,?)')
    ins.run('com.apple.Safari', 'Safari', 'Vecchio', '2026-08-01T07:00:00.000Z', '2026-08-01T07:10:00.000Z', 600, '2026-08-01', null, 'nw')
    ins.run('com.apple.Safari', 'Safari', 'Vecchio 2', '2026-08-01T08:00:00.000Z', '2026-08-01T08:10:00.000Z', 600, '2026-08-01', null, null)
    ins.run('com.apple.Safari', 'Safari', 'Recente', '2026-09-23T08:00:00.000Z', '2026-09-23T08:10:00.000Z', 600, '2026-09-23', null, null)
    ins.run('com.apple.Safari', 'Safari', 'Antico', '2025-01-01T08:00:00.000Z', '2025-01-01T08:10:00.000Z', 600, '2025-01-01', null, null)
    const r1 = oss.conserva(ADESSO)
    assert.equal(r1.tolte, 1); assert.equal(r1.fuse, 1)
    const dopo = righe()
    assert.equal(dopo.length, 2)
    const fusa = dopo.find(r => r.giorno === '2026-08-01')!
    assert.equal(fusa.titolo, null); assert.equal(fusa.cartella, null); assert.equal(fusa.secondi, 1200)
    assert.equal(dopo.find(r => r.giorno === '2026-09-23')!.titolo, 'Recente')
    const r2 = oss.conserva(ADESSO)
    assert.equal(r2.fuse, 0, 'un giorno già fuso resta una riga')
  })
})

test('cancella le osservazioni: sessioni, righe app.* e la previsione di oggi sul progetto; una riga app tolta resta tolta e non rinasce', () => {
  chi.dentro(anna, () => {
    store.default.prepare("INSERT INTO abitudini (chiave, genere, dati, prova, fiducia, stato, visto, aggiornato) VALUES ('app.principale','app.principale','{}','{}',1,'osservata','x','x')").run()
    store.default.prepare("INSERT INTO abitudini (chiave, genere, dati, prova, fiducia, stato, visto, aggiornato, tolta) VALUES ('app.giornata','app.giornata','{}','{}',1,'tolta','x','x','x')").run()
    store.default.prepare("INSERT INTO abitudini (chiave, genere, dati, prova, fiducia, stato, visto, aggiornato) VALUES ('posta.tempo','posta.tempo','{}','{}',1,'osservata','x','x')").run()
    store.default.prepare("INSERT INTO previsioni (id, giorno, genere, ref, probabilita, dati, fatta) VALUES ('p1','2026-09-24','progetto.del_giorno','nw',0.8,'{}','x')").run()
    oss.cancellaOsservazioni(ADESSO)
    assert.equal(righe().length, 0)
    assert.deepEqual((store.default.prepare('SELECT chiave, stato FROM abitudini ORDER BY chiave').all() as { chiave: string; stato: string }[]).map(r => [r.chiave, r.stato]), [['app.giornata', 'tolta'], ['posta.tempo', 'osservata']])
    assert.equal((store.default.prepare('SELECT COUNT(*) AS n FROM previsioni').get() as { n: number }).n, 0)
    store.default.exec('DELETE FROM abitudini')
    // dal vivo: sette giorni di Safari, la riga app.principale tolta, «cancella», altri sette giorni: la tolta non torna, l'altra sì
    const ins = store.default.prepare('INSERT INTO sessioni_app (bundle, app, titolo, inizio, fine, secondi, giorno, progetto, cartella) VALUES (?,?,?,?,?,?,?,?,?)')
    const semina = () => { for (let i = 1; i <= 7; i++) { const g = `2026-09-${String(24 - i).padStart(2, '0')}`; ins.run('com.apple.Safari', 'Safari', null, `${g}T07:00:00.000Z`, `${g}T10:00:00.000Z`, 10800, g, null, null) } }
    semina(); ab.ricalcola(ADESSO)
    const stati = () => Object.fromEntries((store.default.prepare("SELECT chiave, stato FROM abitudini WHERE genere LIKE 'app.%'").all() as { chiave: string; stato: string }[]).map(r => [r.chiave, r.stato]))
    assert.deepEqual(stati(), { 'app.principale': 'osservata', 'app.giornata': 'osservata' })
    ab.cambia('app.principale', 'togli', undefined, undefined, ADESSO)
    oss.cancellaOsservazioni(ADESSO); ab.ricalcola(ADESSO)
    assert.deepEqual(stati(), { 'app.principale': 'tolta' }, 'dopo «cancella» resta solo il segno della tolta')
    semina(); ab.ricalcola(ADESSO)
    assert.deepEqual(stati(), { 'app.principale': 'tolta', 'app.giornata': 'osservata' }, 'la riga tolta non torna mai')
    assert.ok(!ab.tutte().some(a => a.chiave === 'app.principale'))
    store.default.exec('DELETE FROM abitudini; DELETE FROM sessioni_app')
  })
})

test('il proprietario cancellato: le sessioni cadono, nessuna cartella nasce, il guscio riceve acceso: false', async () => {
  chi.dentro(anna, () => oss.imposta({ acceso: true }, ADESSO))
  assert.equal(oss.proprietario(), anna)
  mandati.length = 0
  await addio.cancella(anna)
  assert.equal(existsSync(join(CASA, 'osservatore.json')), false)
  assert.deepEqual(mandati.at(-1), { tipo: 'osservatore-stato', acceso: false, titoli: false, pausaFino: null })
  assert.equal(oss.scriviSessioni([sessione()], ADESSO), 0)
  assert.equal(existsSync(join(CASA, 'utenti', anna)), false, 'nessuna cartella per un conto che non c’è più')
})

test('«cancella le osservazioni» è una transazione sola: se il ricalcolo delle righe cade, le sessioni restano e la pagina che dice «non è andata» dice il vero', async () => {
  // un conto suo: quello di anna la prova di prima l'ha cancellato, e un conto cancellato non si riapre (P4)
  const c = await conti.registra('carla@esempio.it', 'passwordlunga3')
  const carla = c.ok ? c.id : ''
  chi.dentro(carla, () => { cfg.scrivi({ lingua: 'en', fuso: 'Europe/Rome' }); store.azzeraTutto() })
  chi.dentro(carla, () => {
    store.default.exec('DELETE FROM abitudini; DELETE FROM sessioni_app')
    const ins = store.default.prepare('INSERT INTO sessioni_app (bundle, app, titolo, inizio, fine, secondi, giorno, progetto, cartella) VALUES (?,?,?,?,?,?,?,?,?)')
    for (let i = 1; i <= 7; i++) { const g = `2026-09-${String(24 - i).padStart(2, '0')}`; ins.run('com.apple.Safari', 'Safari', null, `${g}T07:00:00.000Z`, `${g}T10:00:00.000Z`, 10800, g, null, null) }
    const sessioni = () => (store.default.prepare('SELECT COUNT(*) AS n FROM sessioni_app').get() as { n: number }).n
    const stato = (chiave: string) => (store.default.prepare('SELECT stato FROM abitudini WHERE chiave = ?').get(chiave) as { stato: string } | undefined)?.stato
    assert.equal(sessioni(), 7)
    // una riga sull'agenda che i fatti non reggono più: il ricalcolo la segnerebbe «superata»
    store.default.prepare("INSERT INTO abitudini (chiave, genere, dati, prova, fiducia, stato, visto, aggiornato) VALUES ('agenda.finta','agenda.finta','{}','{}',1,'osservata','x','x')").run()
    // il ricalcolo dentro la cancellazione cade su quella riga: la pressione intera torna indietro
    store.default.exec("CREATE TRIGGER blocca_abitudini BEFORE UPDATE ON abitudini BEGIN SELECT RAISE(ABORT, 'no'); END")
    try { assert.throws(() => oss.cancellaOsservazioni(ADESSO), /no/) } finally { store.default.exec('DROP TRIGGER blocca_abitudini') }
    assert.equal(sessioni(), 7, 'le sessioni non sono sparite: la cancellazione è tornata indietro con il ricalcolo')
    assert.equal(stato('agenda.finta'), 'osservata')
    assert.equal(store.default.isTransaction, false, 'nessuna transazione lasciata aperta')
    // senza l'inciampo, una pressione: sessioni via, righe app.* via, e le altre rifatte dai fatti che restano
    ab.ricalcola(ADESSO)
    assert.ok((store.default.prepare("SELECT COUNT(*) AS n FROM abitudini WHERE genere LIKE 'app.%'").get() as { n: number }).n >= 1)
    store.default.exec("UPDATE abitudini SET stato = 'osservata' WHERE chiave = 'agenda.finta'")
    oss.cancellaOsservazioni(ADESSO)
    assert.equal(sessioni(), 0)
    assert.equal((store.default.prepare("SELECT COUNT(*) AS n FROM abitudini WHERE genere LIKE 'app.%'").get() as { n: number }).n, 0)
    assert.equal(stato('agenda.finta'), 'superata', 'il ricalcolo è passato nella stessa pressione')
    assert.equal(store.default.isTransaction, false)
    store.default.exec('DELETE FROM abitudini; DELETE FROM sessioni_app')
  })
})
