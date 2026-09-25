// Il filtro, le sessioni, la coda e i messaggi dell'osservatore.
//
//   node --test desktop/sessioni.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CODA_MASSIMA, ESCLUSE_SEMPRE, TITOLO_MASSIMO, creaCoda, creaCostruttore, filtra, inPausa, leggiStato,
  messaggioPausa, pulisciTitolo, type EventoFronte, type Sessione
} from './sessioni.ts'

const T0 = Date.parse('2026-09-24T07:00:00.000Z')
const MIO = 4242
const ev = (bundle: string, app: string, titolo: string | null, pid = 100): EventoFronte => ({ bundle, app, pid, titolo, t: T0 })
const conTitoli = { titoli: true, mioPid: MIO }

/* ----------------------------------------------------------------- filtra */

test('filtra: Myynd, il suo processo, i gestori di password e le finestre di accesso non esistono', () => {
  assert.equal(filtra(ev('com.myynd.app', 'Myynd', 'Oggi'), conTitoli), null)
  assert.equal(filtra(ev('com.github.Electron', 'Electron', 'Myynd'), conTitoli), null)
  assert.equal(filtra(ev('com.apple.Safari', 'Safari', 'Qualcosa', MIO), conTitoli), null)
  for (const bundle of ESCLUSE_SEMPRE) assert.equal(filtra(ev(bundle, 'X', 'Vault'), conTitoli), null, bundle)
  for (const b of ['com.1password.1password', 'com.bitwarden.desktop', 'com.apple.Passwords', 'com.apple.SecurityAgent', 'com.apple.loginwindow']) {
    assert.ok(ESCLUSE_SEMPRE.has(b), b)
  }
})

test('filtra: un bundle vuoto o storto non passa', () => {
  assert.equal(filtra(ev('', 'Senza', 'x'), conTitoli), null)
  assert.equal(filtra(ev('com.evil app', 'Spazio', 'x'), conTitoli), null)
  assert.equal(filtra(ev('com/../x', 'Barra', 'x'), conTitoli), null)
  assert.equal(filtra(ev('a'.repeat(201), 'Lungo', 'x'), conTitoli), null)
  assert.equal(filtra({ ...ev('com.x', 'X', null), bundle: 42 as unknown as string }, conTitoli), null)
})

test('filtra: finestre private e di accesso perdono il titolo, l’app resta', () => {
  const casi: [string, string, string][] = [
    ['org.mozilla.firefox', 'Firefox', 'Navigazione anonima di Mozilla Firefox'],
    ['org.mozilla.firefox', 'Firefox', 'Private Browsing'],
    ['com.google.Chrome', 'Google Chrome', 'New Tab - Google Chrome (Incognito)'],
    ['com.microsoft.edgemac', 'Microsoft Edge', 'InPrivate - Microsoft Edge'],
    ['com.apple.Safari', 'Safari', 'Sign in to your account'],
    ['com.apple.Safari', 'Safari', 'Enter verification code'],
    ['com.google.Chrome', 'Google Chrome', 'Accedi a Google'],
    ['com.apple.mail', 'Mail', 'Your one-time passcode']
  ]
  for (const [bundle, app, titolo] of casi) {
    assert.deepEqual(filtra(ev(bundle, app, titolo), conTitoli), { bundle, app, titolo: null }, titolo)
  }
})

test('filtra: il segno segreto conta anche oltre il taglio dei 160 caratteri', () => {
  const lungo = 'a'.repeat(TITOLO_MASSIMO + 20) + ' password'
  assert.equal(filtra(ev('com.apple.Safari', 'Safari', lungo), conTitoli)?.titolo, null)
})

test('filtra, controcasi: i browser e le altre app tengono il titolo', () => {
  assert.deepEqual(filtra(ev('com.google.Chrome', 'Google Chrome', 'Northwind pricing - Google Docs'), conTitoli),
    { bundle: 'com.google.Chrome', app: 'Google Chrome', titolo: 'Northwind pricing - Google Docs' })
  assert.deepEqual(filtra(ev('com.microsoft.Excel', 'Microsoft Excel', 'Quarterly plan.xlsx'), conTitoli),
    { bundle: 'com.microsoft.Excel', app: 'Microsoft Excel', titolo: 'Quarterly plan.xlsx' })
  assert.deepEqual(filtra(ev('com.apple.Safari', 'Safari', 'Inbox (3) - Gmail'), conTitoli),
    { bundle: 'com.apple.Safari', app: 'Safari', titolo: 'Inbox (3) - Gmail' })
  // «Loginov» e «verificato» non sono un accesso né un codice
  assert.equal(filtra(ev('com.apple.Pages', 'Pages', 'Lettera a Loginov'), conTitoli)?.titolo, 'Lettera a Loginov')
  assert.equal(filtra(ev('com.apple.Pages', 'Pages', 'Bilancio verificato'), conTitoli)?.titolo, 'Bilancio verificato')
})

test('filtra: senza titoli, ogni titolo sparisce e ogni app resta', () => {
  const senza = { titoli: false, mioPid: MIO }
  assert.deepEqual(filtra(ev('com.google.Chrome', 'Google Chrome', 'Northwind pricing - Google Docs'), senza),
    { bundle: 'com.google.Chrome', app: 'Google Chrome', titolo: null })
  assert.deepEqual(filtra(ev('com.microsoft.VSCode', 'Code', 'index.ts'), senza),
    { bundle: 'com.microsoft.VSCode', app: 'Code', titolo: null })
  assert.equal(filtra(ev('com.1password.1password', '1Password', null), senza), null)
})

test('filtra: il nome dell’app si pulisce, e senza nome resta il bundle', () => {
  assert.equal(filtra(ev('net.whatsapp.WhatsApp', '‎WhatsApp', null), conTitoli)?.app, 'WhatsApp')
  assert.equal(filtra(ev('com.x.y', '   ', null), conTitoli)?.app, 'com.x.y')
  assert.equal(filtra(ev('com.x.y', 'N'.repeat(300), null), conTitoli)?.app.length, 120)
})

/* ---------------------------------------------------------- pulisciTitolo */

test('pulisciTitolo: controlli e segni di direzione via, spazi compattati, 160 al massimo, vuoto è null', () => {
  assert.equal(pulisciTitolo('‎Whats\u0007App‏'), 'Whats App')
  assert.equal(pulisciTitolo('riga\nuno\t\tdue   tre'), 'riga uno due tre')
  assert.equal(pulisciTitolo('‪dentro‬ ⁦fuori⁩'), 'dentro fuori')
  assert.equal(pulisciTitolo('x'.repeat(400))?.length, TITOLO_MASSIMO)
  assert.equal(Array.from(pulisciTitolo('😀'.repeat(200)) ?? '').length, TITOLO_MASSIMO)
  assert.equal(pulisciTitolo(''), null)
  assert.equal(pulisciTitolo('  ‎ \n '), null)
  assert.equal(pulisciTitolo(null), null)
  assert.equal(pulisciTitolo(undefined), null)
})

/* -------------------------------------------------------------- costruttore */

const A = { bundle: 'com.apple.Safari', app: 'Safari', titolo: 'Doc' }
const B = { bundle: 'com.microsoft.VSCode', app: 'Code', titolo: null }
const s = (sec: number) => T0 + sec * 1000

test('costruttore: A per 30 s poi B fa una sessione A di 30 s', () => {
  const c = creaCostruttore()
  c.evento(A, s(0))
  c.evento(B, s(30))
  assert.deepEqual(c.chiusi(), [{ ...A, inizio: '2026-09-24T07:00:00.000Z', fine: '2026-09-24T07:00:30.000Z', secondi: 30 }])
  assert.deepEqual(c.chiusi(), [], 'chiusi() svuota')
  assert.equal(c.aperta()?.finestra.bundle, B.bundle)
})

test('costruttore: A per 6 s poi B, e A si perde', () => {
  const c = creaCostruttore()
  c.evento(A, s(0))
  c.evento(B, s(6))
  assert.deepEqual(c.chiusi(), [])
  c.evento(A, s(9.9 + 6))
  assert.deepEqual(c.chiusi(), [], '9,9 secondi sono ancora meno di dieci')
})

test('costruttore: la stessa finestra non spezza, un titolo nuovo sì', () => {
  const c = creaCostruttore()
  c.evento(A, s(0))
  c.evento({ ...A }, s(20))
  assert.deepEqual(c.chiusi(), [])
  c.evento({ ...A, titolo: 'Altro doc' }, s(40))
  const fatte = c.chiusi()
  assert.equal(fatte.length, 1)
  assert.equal(fatte[0].secondi, 40)
  assert.equal(c.aperta()?.finestra.titolo, 'Altro doc')
})

test('costruttore: taglia a cinque minuti chiude e continua', () => {
  const c = creaCostruttore()
  c.evento(A, s(0))
  c.taglia(s(299))
  assert.deepEqual(c.chiusi(), [], 'non ancora')
  c.taglia(s(300))
  const [prima] = c.chiusi()
  assert.equal(prima.secondi, 300)
  assert.deepEqual(c.aperta(), { finestra: A, inizio: s(300) })
  c.evento(B, s(420))
  assert.equal(c.chiusi()[0].secondi, 120)
})

test('costruttore: l’inattività chiude a adesso meno l’inattività, e riprendi riapre a adesso', () => {
  const c = creaCostruttore()
  c.evento(A, s(0))
  // l'inattività si nota a 400 s, ma dura da 130: la sessione finisce a 270
  c.ferma(s(400) - 130_000)
  const [a] = c.chiusi()
  assert.equal(a.fine, new Date(s(270)).toISOString())
  assert.equal(a.secondi, 270)
  assert.equal(c.aperta(), null)
  c.riprendi(A, s(500))
  assert.deepEqual(c.aperta(), { finestra: A, inizio: s(500) })
  c.riprendi(B, s(510))
  assert.equal(c.aperta()?.finestra.bundle, A.bundle, 'riprendi non scavalca una sessione già aperta')
  c.ferma(s(520))
  c.riprendi(null, s(530))
  assert.equal(c.aperta(), null, 'senza ultima finestra non si riapre niente')
})

test('costruttore: il blocco chiude; secondi è la differenza arrotondata', () => {
  const c = creaCostruttore()
  c.evento(A, s(0))
  c.ferma(s(61.6))
  assert.equal(c.chiusi()[0].secondi, 62)
  c.evento(A, s(100))
  c.ferma(s(90))
  assert.deepEqual(c.chiusi(), [], 'una fine prima dell’inizio non fa una sessione negativa')
})

test('costruttore: una sessione che passa la mezzanotte resta una (la divide il server)', () => {
  const c = creaCostruttore()
  const sera = Date.parse('2026-09-24T21:58:00.000Z')
  c.evento(A, sera)
  c.ferma(sera + 4 * 60_000)
  const fatte = c.chiusi()
  assert.equal(fatte.length, 1)
  assert.equal(fatte[0].secondi, 240)
})

/* -------------------------------------------------------------------- coda */

const sessione = (i: number): Sessione => ({ bundle: 'b', app: 'a', titolo: String(i), inizio: '', fine: '', secondi: 10 })

test('coda: 501 sessioni tengono le 500 più nuove', () => {
  const q = creaCoda()
  q.metti(Array.from({ length: 501 }, (_, i) => sessione(i)))
  assert.equal(q.quante(), CODA_MASSIMA)
  const tutte = q.prendi()
  assert.equal(tutte[0].titolo, '1')
  assert.equal(tutte.at(-1)?.titolo, '500')
  assert.equal(q.quante(), 0)
})

test('coda: prendi a pezzi, rimetti davanti in ordine', () => {
  const q = creaCoda(5)
  q.metti([sessione(1), sessione(2), sessione(3)])
  const due = q.prendi(2)
  assert.deepEqual(due.map(x => x.titolo), ['1', '2'])
  q.metti([sessione(4)])
  q.rimetti(due)
  assert.deepEqual(q.prendi().map(x => x.titolo), ['1', '2', '3', '4'])
  q.metti([1, 2, 3, 4].map(sessione))
  q.rimetti([sessione(0), sessione(-1)])
  assert.deepEqual(q.prendi().map(x => x.titolo), ['-1', '1', '2', '3', '4'], 'piena: si perdono le più vecchie')
})

/* ------------------------------------------------------------------ stato */

test('leggiStato: le forme sbagliate sono null', () => {
  assert.deepEqual(leggiStato({ tipo: 'osservatore-stato', acceso: true, titoli: false, pausaFino: null }),
    { acceso: true, titoli: false, pausaFino: null })
  assert.equal(leggiStato({ tipo: 'osservatore', acceso: true, titoli: true, pausaFino: null }), null)
  assert.equal(leggiStato({ tipo: 'osservatore-stato', acceso: true, pausaFino: null }), null)
  assert.equal(leggiStato({ tipo: 'osservatore-stato', acceso: 'true', titoli: true, pausaFino: null }), null)
  assert.equal(leggiStato({ tipo: 'osservatore-stato', acceso: true, titoli: true }), null)
  assert.equal(leggiStato({ tipo: 'osservatore-stato', acceso: true, titoli: true, pausaFino: 'ieri' }), null)
  assert.equal(leggiStato({ tipo: 'osservatore-stato', acceso: true, titoli: true, pausaFino: 12 }), null)
  assert.equal(leggiStato(null), null)
  assert.equal(leggiStato('osservatore-stato'), null)
  assert.equal(leggiStato([]), null)
})

test('inPausa: prima, all’istante e dopo', () => {
  const fino = '2026-09-24T08:10:00.000Z'
  const t = Date.parse(fino)
  assert.equal(inPausa(fino, t - 1), true)
  assert.equal(inPausa(fino, t), false)
  assert.equal(inPausa(fino, t + 1), false)
  assert.equal(inPausa(null, t), false)
})

test('messaggioPausa: da 1 a 480 minuti, interi', () => {
  assert.deepEqual(messaggioPausa(60), { tipo: 'osservatore-pausa', minuti: 60 })
  assert.equal(messaggioPausa(0).minuti, 1)
  assert.equal(messaggioPausa(10_000).minuti, 480)
  assert.equal(messaggioPausa(Number.NaN).minuti, 60)
  assert.equal(messaggioPausa(29.6).minuti, 30)
})
