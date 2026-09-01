// Gli attrezzi: il vocabolario chiuso, e il recinto che ne esce.
//
// Quello che si prova qui non è che il codice giri: è che i tre modi in cui un
// permesso si annacqua restino chiusi. Sono tre, e nessuno dei tre darebbe un
// errore — l'app resterebbe aperta, l'automazione girerebbe, e farebbe una cosa
// diversa da quella scritta sulla sua scheda:
//
//   · un nome inventato che passa e diventa un attrezzo che non esiste;
//   · una ricerca «nella posta» che riporta indietro un file del disco;
//   · un attrezzo eseguito da un'automazione che non l'aveva chiesto.
//
//   node --test server/*.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Documento } from './store.ts'

// come in store.test.ts: la casa finta esiste prima che config.ts la legga
const CASA = mkdtempSync(join(tmpdir(), 'myynd-attrezzi-'))
const CASA_VERA = process.env.HOME
process.env.HOME = CASA

/*
 * Un config con la posta e il disco collegati, e Notion no.
 *
 * Va scritto prima di importare i moduli, e non è un dettaglio di comodità: la
 * metà interessante di `esegui` è proprio cosa succede quando la connessione
 * manca, e senza un config *non manca niente in particolare* — manca tutto, e
 * ogni prova finirebbe sullo stesso ramo. Con Notion scollegato apposta, la
 * differenza fra «non ce l'hai» e «non te l'hanno concesso» si può provare.
 */
mkdirSync(join(CASA, '.myynd'), { recursive: true })
writeFileSync(join(CASA, '.myynd', 'config.json'), JSON.stringify({
  posta: { host: 'imap.esempio.it', utente: 'prova@esempio.it', password: 'x' },
  desktop: { cartelle: [CASA] }
}), { mode: 0o600 })

const store = await import('./store.ts')
const attrezzi = await import('./attrezzi.ts')

const doc = (id: string, fonte: string, titolo: string, corpo: string): Documento => ({
  id, fonte, tipo: 'file', titolo, corpo,
  autore: null, percorso: `/prova/${id}`,
  quando: '2026-01-01T00:00:00.000Z', gruppo: 'documenti'
})

before(() => {
  store.salvaDocumenti([
    doc('posta:1', 'posta', 'Fattura di marzo', 'La fattura di marzo, scadenza il trenta.'),
    doc('google:2', 'google', 'Fattura di aprile', 'La fattura di aprile, stesso importo.'),
    doc('desktop:3', 'desktop', 'Fattura da rifare', 'Bozza della fattura, da rivedere.'),
    doc('notion:4', 'notion', 'Note sulla fattura', 'Appunti sulla fattura del cliente.')
  ])
})

after(() => {
  process.env.HOME = CASA_VERA
  rmSync(CASA, { recursive: true, force: true })
})

// — il vocabolario —

test('un attrezzo che non esiste non esiste', () => {
  assert.equal(attrezzi.esiste('posta.leggi'), true)
  // il caso che conta: un verbo che *manda* qualcosa. Non c'è, e non dev'esserci
  assert.equal(attrezzi.esiste('posta.manda'), false)
  assert.equal(attrezzi.esiste('posta.cancella'), false)
  assert.equal(attrezzi.esiste(''), false)
})

test('ripulisci butta quello che non conosce e non inventa niente', () => {
  assert.deepEqual(attrezzi.ripulisci(['posta.leggi', 'posta.manda']), ['posta.leggi'])
  assert.deepEqual(attrezzi.ripulisci([]), [])
  assert.deepEqual(attrezzi.ripulisci(undefined), [])
  assert.deepEqual(attrezzi.ripulisci('posta.leggi'), [])
  assert.deepEqual(attrezzi.ripulisci([1, null, {}]), [])
})

test('i doppioni non raddoppiano il permesso, e l’ordine è quello del catalogo', () => {
  assert.deepEqual(attrezzi.ripulisci(['posta.leggi', 'posta.leggi']), ['posta.leggi'])
  // scritti al contrario, tornano nell'ordine in cui si leggono sulla scheda
  assert.deepEqual(
    attrezzi.ripulisci(['chat.leggi', 'posta.leggi']),
    ['posta.leggi', 'chat.leggi']
  )
})

test('al modello arrivano solo gli attrezzi concessi', () => {
  const t = attrezzi.tools(['posta.leggi'])
  assert.equal(t.length, 1)
  assert.equal(t[0].name, 'posta_leggi')
  assert.equal(attrezzi.tools([]).length, 0)
})

test('il nome che usa il modello torna indietro a quello vero', () => {
  assert.equal(attrezzi.daNomeTool('posta_leggi'), 'posta.leggi')
  assert.equal(attrezzi.daNomeTool('claude_lavora'), 'claude.lavora')
  // un nome che il modello si è inventato non deve mappare su niente
  assert.equal(attrezzi.daNomeTool('posta_manda'), null)
})

// — il recinto delle fonti —

test('cercare nella posta non riporta indietro il disco', () => {
  const trovati = store.cerca('fattura', 20, ['posta', 'google'])
  assert.ok(trovati.length > 0, 'nella posta la fattura c’è')
  assert.deepEqual([...new Set(trovati.map(d => d.fonte))].sort(), ['google', 'posta'])
})

test('senza recinto si guarda tutto, come si è sempre fatto', () => {
  const fonti = new Set(store.cerca('fattura', 20).map(d => d.fonte))
  assert.ok(fonti.has('desktop') && fonti.has('posta'), 'senza filtro ci sono tutte')
})

test('un recinto su una fonte vuota torna vuoto, non torna tutto', () => {
  // il guasto vero: un filtro ignorato in silenzio è peggio di zero risultati,
  // perché l'automazione lavora su documenti che non aveva il permesso di aprire
  assert.deepEqual(store.cerca('fattura', 20, ['notion']).map(d => d.id), ['notion:4'])
  assert.deepEqual(store.cerca('fattura', 20, ['agenda']), [])
})

// — eseguirli —

test('un attrezzo non concesso non si esegue, nemmeno se glielo chiedi', async () => {
  const e = await attrezzi.esegui('posta.leggi', { query: 'fattura' }, ['desktop.leggi'])
  assert.equal(e.male, true)
  assert.equal(e.docs.length, 0)
  assert.match(e.testo, /permesso/)
})

test('concesso, torna quello che c’è nella sua fonte e basta', async () => {
  const e = await attrezzi.esegui('desktop.leggi', { query: 'fattura' }, ['desktop.leggi'])
  assert.equal(e.male, undefined)
  assert.deepEqual(e.docs.map(d => d.id), ['desktop:3'])
})

test('una query vuota è un errore, non una ricerca su tutto', async () => {
  const e = await attrezzi.esegui('desktop.leggi', { query: '  ' }, ['desktop.leggi'])
  assert.equal(e.male, true)
  assert.equal(e.docs.length, 0)
})

test('claude.lavora senza una cartella si ferma e lo dice', async () => {
  const e = await attrezzi.esegui(
    'claude.lavora', { richiesta: 'guarda cosa manca' }, ['claude.lavora'], { cartella: null }
  )
  assert.equal(e.male, true)
  // non deve provarci «tanto per»: senza cartella non c'è niente da guardare
  assert.match(e.testo, /cartella/)
})

test('un attrezzo su una connessione che non c’è lo dice, e non cerca lo stesso', async () => {
  // Notion non è nel config finto. Il modo sbagliato di fallire sarebbe cercare
  // comunque e non trovare niente: da fuori è identico a «non c'era nulla da
  // fare», ed è come un'automazione resta rotta per settimane senza dirlo.
  const e = await attrezzi.esegui('notion.leggi', { query: 'fattura' }, ['notion.leggi'])
  assert.equal(e.male, true)
  assert.equal(e.docs.length, 0)
  assert.match(e.testo, /Non è collegato/)
})

// — le chat —

test('le chat si cercano, e solo con tutte le parole', () => {
  store.creaChat('c1', 'Il preventivo per Rossi')
  store.salvaMessaggio({ id: 'm1', chat: 'c1', ruolo: 'user', testo: 'Facciamo il preventivo a Rossi da tremila' })
  store.salvaMessaggio({ id: 'm2', chat: 'c1', ruolo: 'assistant', testo: 'Va bene, lo preparo per domani' })

  assert.equal(store.cercaChat('preventivo Rossi').length, 1)
  // una parola sola in comune non basta: riporterebbe indietro mezza cronologia
  assert.equal(store.cercaChat('preventivo Bianchi').length, 0)
  assert.equal(store.cercaChat('').length, 0)
})

// — le cartelle —

test('una cartella esiste anche da vuota', () => {
  assert.equal(store.creaRaccolta('Fatture'), true)
  // la seconda volta no: due cartelle con lo stesso nome sono una sola
  assert.equal(store.creaRaccolta('Fatture'), false)
  assert.deepEqual(store.raccolte().map(r => r.nome), ['Fatture'])
})

test('rinominarla si porta dietro quello che c’è dentro', () => {
  store.creaRaccolta('Clienti')
  store.mettiInRaccolta('auto-1', 'Clienti')
  assert.equal(store.rinominaRaccolta('Clienti', 'I clienti'), true)
  assert.equal(store.statoAutomazione('auto-1')?.raccolta, 'I clienti')
  // senza questo l'automazione resterebbe in una cartella che non esiste: invisibile
  assert.ok(store.raccolte().some(r => r.nome === 'I clienti'))
})

test('buttare la cartella non butta quello che c’era dentro', () => {
  store.creaRaccolta('Da togliere')
  store.mettiInRaccolta('auto-2', 'Da togliere')
  assert.equal(store.buttaRaccolta('Da togliere'), true)
  assert.equal(store.statoAutomazione('auto-2')?.raccolta, null)
  assert.ok(!store.raccolte().some(r => r.nome === 'Da togliere'))
})

// — il permesso scritto sulla riga —

test('il compito si porta dietro il permesso, cartella compresa', () => {
  store.scriviCompito({
    id: 'k1', testo: 'Guarda le fatture', ordine: 'a0', origine: 'auto:fatture',
    attrezzi: { nomi: ['posta.leggi'], cartella: '/Users/x/progetto' }
  })
  const c = store.compito('k1')
  assert.deepEqual(c?.attrezzi, { nomi: ['posta.leggi'], cartella: '/Users/x/progetto' })
})

test('un compito scritto a mano non porta nessun permesso', () => {
  store.scriviCompito({ id: 'k2', testo: 'Richiamare Rossi', ordine: 'a1' })
  assert.equal(store.compito('k2')?.attrezzi, null)
})
