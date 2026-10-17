// Cosa ha visto sul Mac: ripulire, non ripetere, capire di chi è, dimenticare davvero.
//
// Un giorno finto, a Roma, fatto di sessioni davanti alle app (senza titoli,
// come chi non ha dato l'Accessibilità), file usati, cronologia, commit:
// almeno l'80% dei minuti deve finire sul progetto giusto. Poi il diario,
// una chiamata al giorno sul modello economico (finto), e «dimentica
// quest'ora» che porta via tutto quello che ne veniva.
//
//   node --import ./build/test-profile.mjs --test server/osservazioni.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TestoFinestra } from './osservatore.ts'
import type { Visita } from './connettori/cronologia-browser.ts'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-osservazioni-'))
process.env.MYYND_DATI = CASA
process.env.MYYND_APP = '1'
delete process.env.ANTHROPIC_API_KEY

const conti = await import('./conti.ts')
const chi = await import('./chi.ts')
const cfg = await import('./config.ts')
const store = await import('./store.ts')
const osservatore = await import('./osservatore.ts')
const oss = await import('./osservazioni.ts')
const attivita = await import('./attivita.ts')
const diario = await import('./diario.ts')
const progetti = await import('./progetti.ts')
const modello = await import('./modello.ts')
const memoria = await import('./project-memory.ts')
const cron = await import('./connettori/cronologia-browser.ts')

let anna = ''
let nw = '', hb = ''
const db = () => store.default
const dentro = <T>(f: () => T): T => chi.dentro(anna, f)

before(async () => {
  const a = await conti.registra('anna@esempio.it', 'passwordlunga1')
  assert.ok(a.ok); anna = a.ok ? a.id : ''
  dentro(() => {
    cfg.scrivi({ lingua: 'en', fuso: 'Europe/Rome' })
    store.azzeraTutto()
    nw = progetti.crea({ nome: 'Northwind', origine: 'mano' }).progetto.id
    hb = progetti.crea({ nome: 'Harbor Labs', origine: 'mano' }).progetto.id
    progetti.cambia(hb, { alias: ['Harbor'] })
  })
})
after(() => { attivita.perProva(null); diario.perProva(null); store.chiudiIndici(); rmSync(CASA, { recursive: true, force: true }) })

/** Un'ora di Roma il 16 ottobre (UTC+2). */
const R = (hhmm: string, giorno = '2026-10-16') => new Date(`${giorno}T${hhmm}:00+02:00`)
const iso = (hhmm: string, giorno?: string) => R(hhmm, giorno).toISOString()
const SERA = R('20:00')

/* --------------------------------------------------------------- di serie */

test('acceso di serie: un conto solo sul Mac, nessuna configurazione, diventa proprietario e guarda', () => {
  assert.equal(dentro(() => cfg.leggi().osservatore), undefined, 'un conto di prima: niente nella configurazione')
  assert.equal(osservatore.proprietario(), anna)
  assert.ok(existsSync(join(CASA, 'osservatore.json')))
  const s = dentro(() => osservatore.statoPerChiChiede())
  assert.equal(s.acceso, true)
  assert.equal(s.testi, false, 'il testo della finestra resta spento finché non lo accende lui')
  assert.equal(s.ogni, 20)
})

/* --------------------------------------------------------------- ripulire */

test('redigi: carte (solo se passano Luhn), IBAN, chiavi, gettoni, password; il resto resta', () => {
  const t = oss.redigi([
    'Carta 4111 1111 1111 1111 e ordine 1234 5678 9012 3456',
    'IBAN IT60 X054 2811 1010 0000 0123 456',
    'key sk-ant-api03-abcdefghijklmnopqrstuvwx and ghp_abcdefghijklmnopqrstuvwxyz123456',
    'xoxb-1234567890-abcdefghij AKIAABCDEFGHIJKLMNOP',
    'Authorization: Bearer abcdefghijklmnopqrstuvwxyz.123',
    'password: hunter2 e pin=1234',
    'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.c2lnbmF0dXJlLXF1aQ',
    'Northwind offer v2, 3 phases'
  ].join('\n'))
  assert.ok(t.includes('[carta]') && !t.includes('4111 1111'))
  assert.ok(t.includes('1234 5678 9012 3456'), 'un numero che non passa Luhn non è una carta')
  assert.ok(t.includes('[iban]') && !t.includes('IT60 X054'))
  assert.ok(!t.includes('sk-ant-api03') && !t.includes('ghp_') && !t.includes('xoxb-') && !t.includes('AKIA'))
  assert.ok(t.includes('Bearer [gettone]'))
  assert.ok(t.includes('password: [nascosto]') && !t.includes('hunter2') && t.includes('pin=[nascosto]'))
  assert.ok(t.includes('[gettone]') && !t.includes('eyJhbGci'))
  assert.ok(t.includes('Northwind offer v2, 3 phases'))
})

test('impronta e somiglianza: le cifre e gli spazi non sono un cambio, le parole sì', () => {
  assert.equal(oss.impronta('Inbox (3)  unread'), oss.impronta('inbox (4) unread'))
  assert.notEqual(oss.impronta('Inbox'), oss.impronta('Outbox'))
  assert.ok(oss.somiglianza('a b c d e f g h i j', 'a b c d e f g h i k') < 1)
  assert.ok(oss.somiglianza('uno due tre quattro cinque sei sette otto nove dieci undici dodici tredici quattordici quindici sedici diciassette diciotto diciannove venti', 'uno due tre quattro cinque sei sette otto nove dieci undici dodici tredici quattordici quindici sedici diciassette diciotto diciannove ventuno') >= 0.9)
})

/* --------------------------------------------------------- il testo della finestra */

test('il testo della finestra: spento non scrive; acceso ripulisce, non ripete, salta app riservate, private, escluse e siti esclusi', () => {
  const t0 = R('08:00').getTime()
  const testo = (x: Partial<TestoFinestra> = {}) => ({ bundle: 'com.apple.TextEdit', app: 'TextEdit', titolo: 'Northwind offer.rtf', documento: 'file:///Users/anna/Documents/Northwind%20offer.rtf', url: null, testo: 'Offer for the client, three phases, card 4111 1111 1111 1111. ' + 'Scope and timeline for the first delivery, then review. '.repeat(3), t: t0, ...x })
  const righe = () => dentro(() => db().prepare("SELECT * FROM osservazioni WHERE kind = 'finestra' ORDER BY id").all()) as { text: string; projectId: string | null; sourceId: string }[]
  assert.equal(osservatore.scriviTesti([testo()], SERA), 0, 'spento: niente')
  dentro(() => osservatore.imposta({ testi: true, escluse: ['Notes'], siti: ['bank.example'] }))
  assert.equal(osservatore.scriviTesti([testo()], SERA), 1)
  assert.equal(righe()[0]!.projectId, nw, 'il documento dice il progetto')
  assert.ok(righe()[0]!.text.includes('[carta]') && !righe()[0]!.text.includes('4111'))
  // lo stesso testo, e uno quasi uguale: nessuna riga nuova
  assert.equal(osservatore.scriviTesti([testo({ t: t0 + 20_000 }), testo({ t: t0 + 40_000, testo: testo().testo.replace('first', 'second') })], SERA), 0)
  // cambiato davvero: una riga
  assert.equal(osservatore.scriviTesti([testo({ t: t0 + 60_000, testo: 'A completely different page about invoices and payment terms for October' })], SERA), 1)
  // gestore di password, app riservata, app esclusa per nome, finestra privata, sito escluso
  assert.equal(osservatore.scriviTesti([
    testo({ bundle: 'com.1password.1password', app: '1Password', testo: 'vault' }),
    testo({ bundle: 'com.example.MyBank', app: 'MyBank', testo: 'saldo' }),
    testo({ bundle: 'com.apple.Notes', app: 'Notes', testo: 'note private' }),
    testo({ bundle: 'com.google.Chrome', app: 'Chrome', titolo: 'New Incognito Tab', testo: 'x' }),
    testo({ bundle: 'com.google.Chrome', app: 'Chrome', titolo: 'Account', url: 'https://online.bank.example/acc?id=1', testo: 'saldo' })
  ], SERA), 0)
  assert.equal(righe().length, 2)
  dentro(() => osservatore.imposta({ testi: false }))
})

/* ------------------------------------------------------------- il giorno finto */

type Verita = { bundle: string; app: string; da: string; a: string; titolo?: string | null; vero: string | null }
const GIORNO: Verita[] = [
  { bundle: 'com.microsoft.VSCode', app: 'Code', da: '09:00', a: '09:40', vero: 'nw' },
  { bundle: 'com.google.Chrome', app: 'Google Chrome', da: '09:40', a: '09:55', vero: 'nw' },
  { bundle: 'com.tinyspeck.slackmacgap', app: 'Slack', da: '09:55', a: '10:00', vero: 'nw' },
  { bundle: 'com.microsoft.VSCode', app: 'Code', da: '10:00', a: '10:30', vero: 'nw' },
  { bundle: 'com.figma.Desktop', app: 'Figma', da: '10:30', a: '11:30', titolo: 'Harbor site – Figma', vero: 'hb' },
  { bundle: 'com.apple.mail', app: 'Mail', da: '11:30', a: '12:00', vero: null },
  { bundle: 'com.apple.Terminal', app: 'Terminal', da: '14:00', a: '15:00', vero: 'hb' },
  { bundle: 'com.google.Chrome', app: 'Google Chrome', da: '15:00', a: '15:30', vero: 'hb' },
  { bundle: 'com.google.Chrome', app: 'Google Chrome', da: '15:30', a: '16:00', vero: null },
  { bundle: 'com.microsoft.VSCode', app: 'Code', da: '16:00', a: '17:00', vero: 'nw' },
  // il caso difficile: nessuna prova, e nessuno dopo; resta senza progetto
  { bundle: 'com.microsoft.VSCode', app: 'Code', da: '17:00', a: '17:20', vero: 'nw' }
]

const visita = (url: string, titolo: string, hhmm: string, secondi: number): Visita => {
  const p = cron.pulisciUrl(url)!
  return { browser: 'Chrome', profilo: 'Default', ...p, titolo, quando: R(hhmm).getTime(), secondi }
}

function lettoriFinti() {
  attivita.perProva({
    casa: '/Users/anna',
    recenti: async () => [
      { percorso: '/Users/anna/Code/northwind/src/pricing.ts', usato: iso('09:30'), volte: 3 },
      { percorso: '/Users/anna/Code/northwind/src/offer.ts', usato: iso('10:10'), volte: 1 },
      { percorso: '/Users/anna/Code/harbor-labs/app/nav.tsx', usato: iso('14:30'), volte: 2 },
      { percorso: '/Users/anna/Code/northwind/README.md', usato: iso('16:20'), volte: 1 },
      { percorso: '/Users/anna/Documents/tasse 2026.pdf', usato: iso('11:40'), volte: 1 }
    ],
    repository: async () => [],
    cartelle: () => ['/Users/anna/Code/northwind', '/Users/anna/Code/harbor-labs'],
    cronologia: () => [{
      profilo: { browser: 'Chrome', profilo: 'Default', file: '', tipo: 'chromium' },
      visite: [
        visita('https://docs.google.com/document/d/DOC1/edit?usp=x', 'Northwind proposal - Google Docs', '09:41', 400),
        visita('https://docs.google.com/document/d/DOC1/edit', 'Northwind proposal - Google Docs', '09:50', 240),
        visita('https://github.com/acme/harbor-labs/pull/3/files', 'Fix nav · Pull Request #3 · acme/harbor-labs', '15:02', 900),
        visita('https://github.com/acme/harbor-labs/pull/3', 'Fix nav · Pull Request #3 · acme/harbor-labs', '15:20', 300),
        visita('https://news.ycombinator.com/item?id=1', 'Hacker News', '15:31', 600)
      ]
    }],
    statoRepo: async percorso => percorso.endsWith('northwind')
      ? { percorso, nome: 'northwind', ramo: 'feature/offerta', modifiche: 3, rami: [{ nome: 'feature/offerta', quando: iso('09:38') }],
          commit: [{ hash: 'aaaaaaaaaaaa', quando: iso('09:38'), autore: 'Anna', email: 'anna@esempio.it', mio: true, messaggio: 'Prezzi della proposta' },
            { hash: 'bbbbbbbbbbbb', quando: iso('12:30'), autore: 'Marta', email: 'marta@altro.it', mio: false, messaggio: 'Review fixes' }] }
      : { percorso, nome: 'harbor-labs', ramo: 'main', modifiche: 0, rami: [],
          commit: [{ hash: 'cccccccccccc', quando: iso('14:20'), autore: 'Anna', email: 'anna@esempio.it', mio: true, messaggio: 'Nav fix' },
            { hash: 'dddddddddddd', quando: iso('14:50'), autore: 'Anna', email: 'anna@esempio.it', mio: true, messaggio: 'Nav tests' }] },
    editor: () => []
  })
}

function sessioni() {
  return GIORNO.map(g => ({ bundle: g.bundle, app: g.app, titolo: g.titolo ?? null, inizio: iso(g.da), fine: iso(g.a), secondi: (R(g.a).getTime() - R(g.da).getTime()) / 1000 }))
}

test('il giorno finto: almeno l’80% dei minuti attivi sul progetto giusto, dagli episodi', async () => {
  assert.equal(osservatore.scriviSessioni(sessioni(), SERA), GIORNO.length)
  lettoriFinti()
  const nuove = await dentro(() => attivita.raccogli(SERA, { forza: true }))
  assert.ok(nuove >= 10, `scritte ${nuove}`)
  // una seconda passata con le stesse cose non scrive niente di nuovo
  assert.equal(await dentro(() => attivita.raccogli(SERA, { forza: true })), 0)

  const eps = dentro(() => oss.episodi('2026-10-16'))
  const atteso = (v: string | null) => v === 'nw' ? nw : v === 'hb' ? hb : null
  // minuto per minuto: di quale progetto è il minuto secondo gli episodi
  const progettoAl = new Map<number, string | null>()
  for (const e of eps) {
    if (!e.minuti) continue
    const righe = dentro(() => db().prepare(`SELECT observedAt, endAt FROM osservazioni WHERE kind = 'app' AND id IN (${e.prove.join(',')})`).all()) as { observedAt: string; endAt: string }[]
    for (const r of righe) for (let t = Date.parse(r.observedAt); t < Date.parse(r.endAt); t += 60_000) progettoAl.set(t, e.projectId)
  }
  let giusti = 0, totali = 0
  for (const g of GIORNO) {
    for (let t = R(g.da).getTime(); t < R(g.a).getTime(); t += 60_000) {
      totali++
      if ((progettoAl.get(t) ?? null) === atteso(g.vero)) giusti++
    }
  }
  const quota = giusti / totali
  assert.ok(quota >= 0.8, `solo ${(quota * 100).toFixed(1)}% dei minuti al progetto giusto`)
  // gli episodi: Northwind la mattina, unito anche sopra Slack; un vuoto di più di dieci minuti spezza
  const delNw = eps.filter(e => e.projectId === nw && e.minuti > 0)
  assert.equal(delNw[0]!.inizio, iso('09:00'))
  assert.equal(delNw[0]!.fine, iso('10:30'))
  assert.equal(delNw[0]!.minuti, 90)
  assert.ok(delNw[0]!.etichetta.includes('Northwind proposal') || delNw[0]!.etichetta.includes('pricing.ts'), delNw[0]!.etichetta)
  assert.ok(delNw.length >= 2, 'la mattina e il pomeriggio sono due episodi')
  // i minuti per progetto
  const m = oss.minutiPerProgetto(eps)
  assert.equal(m.get(hb), 150)
})

/* ---------------------------------------------------------------- il diario */

test('il diario: una chiamata al giorno, sul livello economico, righe con le prove; la seconda volta niente', async () => {
  const chiamate: { lavoro: string; testo: string }[] = []
  diario.perProva({
    collegato: () => true,
    chiediJSON: (async (o: { lavoro: string; messages: { content: string }[] }) => {
      chiamate.push({ lavoro: o.lavoro, testo: o.messages[0]!.content })
      return {
        progetti: [
          { progetto: nw, righe: [
            // e1 è il testo della finestra delle 8, e2 la mattina di lavoro, e6 lo stato del repository
            { testo: 'Worked on pricing — and the proposal', genere: 'mosso', prove: ['e2'] },
            { testo: 'Three changes not committed yet', genere: 'fermo', prove: ['[e6]'] },
            { testo: 'Invented bullet', genere: 'mosso', prove: ['e99'] }
          ] },
          { progetto: 'non-esiste', righe: [{ testo: 'x', genere: 'mosso', prove: ['e1'] }] }
        ]
      }
    }) as typeof modello.chiediJSON
  })
  // alle cinque del pomeriggio si scriverebbe ieri, che non ha niente: nessuna chiamata
  assert.equal(await dentro(() => diario.forse(R('17:00'))), 0)
  assert.equal(chiamate.length, 0)
  // la sera: il giorno di oggi
  const scritte = await dentro(() => diario.forse(R('19:30')))
  assert.equal(chiamate.length, 1)
  assert.equal(chiamate[0]!.lavoro, 'diario')
  assert.equal(dentro(() => modello.modelloPer('diario')), dentro(() => cfg.modelloDelLivello('casa')), 'il diario va sul modello economico')
  assert.ok(!chiamate[0]!.testo.includes('three phases') && !chiamate[0]!.testo.includes('/Users/anna'), 'né il testo delle finestre né i percorsi')
  assert.ok(chiamate[0]!.testo.includes('Project: Northwind'))
  assert.match(chiamate[0]!.testo, /\[e2\] 09:00-10:30, 90 min/)
  assert.match(chiamate[0]!.testo, /\[e6\] repository northwind: branch feature\/offerta, 3 uncommitted changes/)
  assert.equal(scritte, 2)
  const righe = dentro(() => oss.diarioDelGiorno('2026-10-16'))
  // la lineetta non resta: «senzaTrattini» la scioglie
  assert.deepEqual(righe.map(r => [r.projectId, r.kind, r.text]), [[nw, 'mosso', 'Worked on pricing. And the proposal'], [nw, 'fermo', 'Three changes not committed yet']])
  assert.ok(righe.every(r => r.evidence.length > 0))
  // di nuovo stasera, domattina: niente
  assert.equal(await dentro(() => diario.forse(R('21:00'))), 0)
  assert.equal(await dentro(() => diario.forse(R('08:00', '2026-10-17'))), 0)
  assert.equal(chiamate.length, 1)
  // e il contesto del progetto lo legge
  const contesto = dentro(() => memoria.dayLogContext(nw, R('20:00').getTime()))
  assert.ok(contesto.includes('Worked on pricing') && contesto.includes('[stuck]'))
})

/* ------------------------------------------------------------- dimenticare */

test('dimentica quest’ora: osservazioni, sessioni, righe del diario; e niente rientra da nessuna fonte', async () => {
  const prima = dentro(() => db().prepare("SELECT COUNT(*) AS n FROM osservazioni WHERE day = '2026-10-16'").get()) as { n: number }
  const r = await dentro(() => attivita.dimentica({ ora: R('09:20') }, SERA))
  assert.ok(r.osservazioni >= 4, `tolte ${r.osservazioni}`)
  assert.ok(r.sessioni >= 2)
  assert.equal(r.righe, 1, 'la riga del diario che poggiava sulla mattina se ne va')
  assert.deepEqual(r.progetti, [nw])
  const nell = dentro(() => db().prepare('SELECT COUNT(*) AS n FROM osservazioni WHERE COALESCE(eventAt, observedAt) >= ? AND COALESCE(eventAt, observedAt) < ?').get(iso('09:00'), iso('10:00'))) as { n: number }
  assert.equal(nell.n, 0)
  assert.equal((dentro(() => db().prepare('SELECT COUNT(*) AS n FROM sessioni_app WHERE inizio < ? AND fine > ?').get(iso('10:00'), iso('09:00'))) as { n: number }).n, 0)
  const contesto = dentro(() => memoria.dayLogContext(nw, R('20:00').getTime()))
  assert.ok(!contesto.includes('Worked on pricing'), 'nessun prompt la rivede')
  assert.ok(contesto.includes('Three changes'), 'quella che poggiava sul pomeriggio resta')
  // le stesse fonti rilette, e una sessione rimasta in coda nel guscio: niente torna in quell'ora
  await dentro(() => attivita.raccogli(SERA, { forza: true }))
  assert.equal(osservatore.scriviSessioni(sessioni().slice(0, 2), SERA), 0)
  const ancora = dentro(() => db().prepare('SELECT COUNT(*) AS n FROM osservazioni WHERE COALESCE(eventAt, observedAt) >= ? AND COALESCE(eventAt, observedAt) < ?').get(iso('09:00'), iso('10:00'))) as { n: number }
  assert.equal(ancora.n, 0)
  const dopo = dentro(() => db().prepare("SELECT COUNT(*) AS n FROM osservazioni WHERE day = '2026-10-16'").get()) as { n: number }
  assert.ok(dopo.n < prima.n)
})

test('dimentica oggi: tutto il giorno fino ad adesso, e quello che viene dopo entra', async () => {
  const adesso = R('21:00')
  await dentro(() => attivita.dimentica({ giorno: true }, adesso))
  assert.equal((dentro(() => db().prepare("SELECT COUNT(*) AS n FROM osservazioni WHERE COALESCE(eventAt, observedAt) < ? AND day = '2026-10-16'").get(adesso.toISOString())) as { n: number }).n, 0)
  assert.equal(dentro(() => oss.diarioDelGiorno('2026-10-16')).length, 0)
  assert.equal(osservatore.scriviSessioni([{ bundle: 'com.microsoft.VSCode', app: 'Code', titolo: null, inizio: iso('20:50'), fine: iso('20:58'), secondi: 480 }], R('22:00')), 0, 'prima di adesso: dimenticato')
  assert.equal(osservatore.scriviSessioni([{ bundle: 'com.microsoft.VSCode', app: 'Code', titolo: null, inizio: iso('21:10'), fine: iso('21:30'), secondi: 1200 }], R('22:00')), 1, 'dopo: entra')
})

test('la conservazione: le grezze quattordici giorni, il diario novanta', () => {
  dentro(() => {
    db().prepare("INSERT INTO osservazioni (kind, sourceId, observedAt, day, retention) VALUES ('file','file:/x','2026-10-01T10:00:00.000Z','2026-10-01','grezza')").run()
    db().prepare("INSERT INTO diario (id, day, projectId, kind, text, evidence, createdAt) VALUES ('d1','2026-07-01',NULL,'mosso','vecchia','[1]','x'), ('d2','2026-10-01',NULL,'mosso','recente','[1]','x')").run()
    oss.conserva(new Date('2026-10-20T12:00:00.000Z'))
    assert.equal((db().prepare("SELECT COUNT(*) AS n FROM osservazioni WHERE day = '2026-10-01'").get() as { n: number }).n, 0)
    assert.deepEqual((db().prepare("SELECT id FROM diario WHERE id IN ('d1','d2') ORDER BY id").all() as { id: string }[]).map(r => r.id), ['d2'])
  })
})

test('spento da lui resta spento: un conto con acceso: false non viene adottato', async () => {
  dentro(() => osservatore.imposta({ acceso: false }))
  assert.equal(existsSync(join(CASA, 'osservatore.json')), false)
  assert.equal(osservatore.proprietario(), null, 'l’ha spento lui: niente adozione')
  assert.equal(osservatore.scriviSessioni(sessioni().slice(0, 1), SERA), 0)
  dentro(() => osservatore.imposta({ acceso: true }))
  assert.equal(osservatore.proprietario(), anna)
})

test('cancella le osservazioni: anche quelle nuove e il diario, e il passato resta dimenticato', () => {
  osservatore.scriviSessioni([{ bundle: 'com.microsoft.VSCode', app: 'Code', titolo: null, inizio: iso('19:00'), fine: iso('19:10'), secondi: 600 }], SERA)
  dentro(() => osservatore.cancellaOsservazioni(SERA))
  assert.equal((dentro(() => db().prepare('SELECT COUNT(*) AS n FROM osservazioni').get()) as { n: number }).n, 0)
  assert.equal(osservatore.scriviSessioni([{ bundle: 'com.microsoft.VSCode', app: 'Code', titolo: null, inizio: iso('19:20'), fine: iso('19:30'), secondi: 600 }], SERA), 0)
})

test('la pausa e lo spegnimento: quello che succede intanto non entra nemmeno dopo, da nessuna fonte', () => {
  const file = (hhmm: string) => dentro(() => oss.registra({ kind: 'file', sourceId: `file:/Users/anna/Code/northwind/${hhmm}.ts`, title: `${hhmm}.ts`, observedAt: iso('23:00', '2026-10-18'), eventAt: iso(hhmm, '2026-10-18') }))
  dentro(() => osservatore.pausa(60, R('12:00', '2026-10-18')))
  assert.equal(file('12:30'), 'dimenticata')
  dentro(() => osservatore.riprendi(R('12:10', '2026-10-18')))
  assert.equal(file('12:05'), 'dimenticata', 'i dieci minuti di pausa restano fuori')
  assert.equal(file('12:20'), 'nuova', 'dopo la ripresa si guarda')
  dentro(() => osservatore.imposta({ acceso: false }, R('14:00', '2026-10-18')))
  dentro(() => osservatore.imposta({ acceso: true }, R('16:00', '2026-10-18')))
  assert.equal(file('15:00'), 'dimenticata', 'spento: le due ore non rientrano')
  assert.equal(file('16:30'), 'nuova')
})
