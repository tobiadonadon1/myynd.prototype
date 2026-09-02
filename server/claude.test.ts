// I pezzi di `claude.ts` che si possono provare senza un modello.
//
// Il ragionamento vero sta dentro chiamate a un modello, e quello non si prova
// qui. Ma attorno a ogni chiamata ci sono quattro cose meccaniche, e ognuna ha
// un modo di sbagliare *in silenzio* che è già successo almeno una volta:
//
//   · `inMano` diceva «la posta NON è collegata» a chi aveva Gmail, e il
//     modello — obbediente — rispondeva «collegami la casella» invece di scrivere;
//   · `contesto` che ricomincia da [1] a ogni giro fa puntare la citazione [2]
//     al documento sbagliato;
//   · `fontiCitate` con `includes('[1]')` contava [10] come [1], e senza
//     citazioni attaccava tre fonti inventate sotto un «non ho trovato niente»;
//   · `testoDi` è quello che decide cosa arriva all'abbonamento al posto dei
//     blocchi dell'SDK.
//
//   node --test server/claude.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Documento } from './store.ts'

// come in piupersone.test.ts: la cartella dei dati è finta e nasce prima che
// config.ts la legga
const CASA = mkdtempSync(join(tmpdir(), 'myynd-claude-'))
process.env.MYYND_DATI = CASA

const cfg = await import('./config.ts')
const store = await import('./store.ts')
const claude = await import('./claude.ts')

after(() => {
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

const doc = (id: string, titolo: string, sopra: Partial<Documento> = {}): Documento => ({
  id, fonte: 'posta', tipo: 'email', titolo, corpo: `Il testo di ${titolo}.`,
  autore: 'Rossi <rossi@esempio.it>', percorso: 'INBOX',
  quando: '2026-03-01T10:00:00.000Z', gruppo: 'posta', ...sopra
})

// — inMano: cosa è collegato davvero —

test('senza niente collegato lo dice, e nomina la posta fra quello che manca', () => {
  cfg.scrivi({})
  const r = claude.inMano()
  assert.match(r, /Non hai nessuna fonte collegata/)
  assert.match(r, /NON è collegato[^.]*la posta/)
})

test('la posta via Gmail conta come collegata', () => {
  cfg.scrivi({ google: { clientId: 'x', refresh: 'y', email: 'io@gmail.com' } })
  const r = claude.inMano()
  assert.match(r, /Quello che puoi leggere: la posta/)
  assert.doesNotMatch(r, /NON è collegato[^.]*la posta/)
})

test('la posta via Outlook conta come collegata solo se è stata concessa quella metà', () => {
  cfg.scrivi({ microsoft: { clientId: 'x', refresh: 'y', parti: ['posta'] } })
  assert.match(claude.inMano(), /Quello che puoi leggere: la posta/)

  // solo i file: SharePoint sì, la posta no
  cfg.scrivi({ microsoft: { clientId: 'x', refresh: 'y', parti: ['file'] } })
  const r = claude.inMano()
  assert.match(r, /Quello che puoi leggere:[^.]*SharePoint/)
  assert.match(r, /NON è collegato[^.]*la posta/)
})

test('la posta via IMAP conta come sempre', () => {
  cfg.scrivi({ posta: { host: 'imap.esempio.it', porta: 993, utente: 'io@esempio.it', password: 'x' } })
  assert.match(claude.inMano(), /Quello che puoi leggere: la posta/)
  cfg.scrivi({})
})

// — contesto: la numerazione continua —

test('la numerazione parte da «da», e va avanti da lì', () => {
  const testo = claude.contesto([doc('a', 'Primo'), doc('b', 'Secondo')], 5)
  assert.match(testo, /^\[5\] Primo/m)
  assert.match(testo, /^\[6\] Secondo/m)
  assert.doesNotMatch(testo, /^\[1\]/m)
})

test('senza «da» parte da uno, e porta id e fonte di ogni documento', () => {
  const testo = claude.contesto([doc('posta:INBOX:1', 'Oggetto')])
  assert.match(testo, /^\[1\] Oggetto/m)
  assert.match(testo, /^id: posta:INBOX:1$/m)
  assert.match(testo, /^Fonte: posta · Rossi <rossi@esempio.it> · /m)
})

test('il corpo si taglia al tetto, e una data illeggibile non fa esplodere niente', () => {
  const lungo = doc('l', 'Lungo', { corpo: 'x'.repeat(10_000), quando: 'non è una data' })
  const testo = claude.contesto([lungo], 1, 100)
  assert.ok(testo.length < 400, 'non ha tagliato il corpo')
  assert.match(testo, /senza data/)
})

// — fontiCitate: solo quello che ha citato davvero —

test('tornano solo i documenti citati, con il loro numero', () => {
  const docs = [doc('a', 'A'), doc('b', 'B'), doc('c', 'C')]
  const f = claude.fontiCitate('La cifra viene da qui [2], il resto no.', docs)
  assert.deepEqual(f, [{ id: 'b', label: '[2] B' }])
})

test('[10] non è [1], e senza citazioni non si inventa niente', () => {
  const docs = Array.from({ length: 10 }, (_, i) => doc(`d${i + 1}`, `D${i + 1}`))
  const f = claude.fontiCitate('Vedi [10].', docs)
  assert.deepEqual(f.map(x => x.id), ['d10'])
  assert.deepEqual(claude.fontiCitate('Non ho trovato niente su questo.', docs), [])
})

test('una citazione oltre l’elenco si ignora invece di puntare a caso', () => {
  assert.deepEqual(claude.fontiCitate('Guarda [7].', [doc('a', 'A')]), [])
})

// — testoDi: dai blocchi al testo —

test('una stringa passa com’è, i blocchi si appiattiscono, il resto è vuoto', () => {
  assert.equal(claude.testoDi('ciao'), 'ciao')
  assert.equal(claude.testoDi([
    { type: 'text', text: 'prima' },
    { type: 'tool_use', id: 't', name: 'cerca', input: {} },
    { type: 'text', text: 'dopo' }
  ]), 'prima\ndopo')
  assert.equal(claude.testoDi(undefined), '')
  assert.equal(claude.testoDi({ type: 'text', text: 'non è una lista' }), '')
  assert.equal(claude.testoDi([null, { type: 'text' }, { type: 'text', text: 'ok' }]), 'ok')
})
