// La ricevuta della mattina: cosa è stato fatto, cosa aspetta lui, la settimana.
//
//   node --test server/mattina.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-mattina-'))
process.env.MYYND_DATI = join(CASA, 'dati')

const store = await import('./store.ts')
const cfg = await import('./config.ts')
const mattina = await import('./mattina.ts')
const lavoroDati = await import('./lavoro-dati.ts')
const { BLOCCHI } = await import('./domanda-sola.ts')

before(() => { store.azzeraTutto() })
after(() => {
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

type C = import('./store.ts').Compito
const ADESSO = '2026-10-09T08:30:00.000Z'
const DAL = '2026-10-08T23:00:00.000Z'
/** Una carta come la legge `componi`: solo i campi che servono, il resto vuoto. */
function carta(x: Partial<C> & { id: string }): C {
  return {
    testo: x.id, nota: null, quando: 'oggi', stato: 'aperto', modo: 'tutto', ordine: 'a', origine: 'mano', voce: null, doc: null,
    chiesto: null, risultato: null, fonti: null, guaio: null, creato: DAL, aggiornato: ADESSO, chiuso: null, esito: null, sparito: null,
    versione: 1, proposta: null, chieste: null, attrezzi: null, email: null, ...x
  } as C
}
const notte = (ultimo: string) => ({ da: 'tu' as const, quando: 'notte' as const, dal: DAL, tentativi: 1, ultimo, notte: true })
const vuoto = { consegnati: new Map<string, string>(), domanda: null, iniziative: [], invii: [], turno: { inCoda: 0, prossimaNotte: null, acceso: true, motore: true } }

test('una notte di lavoro: il file, la bozza nella casella e la carta finita sono fatte; la domanda aspetta lui', () => {
  const m = mattina.componi({
    ...vuoto,
    compiti: [
      carta({ id: 'file', testo: 'Write the course outline', stato: 'fatto', chiuso: '2026-10-09T06:00:00.000Z', turno: notte('2026-10-09T02:00:00.000Z'),
        consegna: { app: 'File', titolo: 'Course outline.md', percorso: '/Users/x/Desktop/Course outline.md', dove: 'scrivania' } }),
      carta({ id: 'bozza', testo: 'Reply to Nora', stato: 'pronto', turno: notte('2026-10-09T03:00:00.000Z'),
        email: { a: 'nora@x', oggetto: 'Re', corpo: 'Hi', casella: { stato: 'salvata' } } as C['email'] }),
      carta({ id: 'turno', testo: 'Summarise the feedback', stato: 'pronto', turno: notte('2026-10-09T04:00:00.000Z'), prova: { esito: 'pass', perche: 'ok', controlli: [], quando: ADESSO } }),
      carta({ id: 'chiede', testo: 'Draft the release notes', stato: 'chiede', turno: notte('2026-10-09T05:00:00.000Z'),
        chieste: [{ domanda: 'Which build number goes in the notes?', opzioni: ['1.0.4'], multipla: false }] as C['chieste'] })
    ]
  }, { dal: DAL, mattina: true })
  assert.equal(m.mattina, true)
  assert.deepEqual(m.done.map(f => f.id), ['turno', 'bozza', 'file'], 'il più recente prima')
  assert.deepEqual(m.done.find(f => f.id === 'file')?.dove, { genere: 'file', nome: 'Course outline.md', percorso: '/Users/x/Desktop/Course outline.md', luogo: 'scrivania' })
  assert.deepEqual(m.done.find(f => f.id === 'bozza')?.dove, { genere: 'casella' })
  assert.deepEqual(m.done.find(f => f.id === 'turno')?.dove, { genere: 'carta' })
  assert.deepEqual(m.needsYou, [{ genere: 'carta', id: 'chiede', titolo: 'Draft the release notes', perche: 'Which build number goes in the notes?', motivo: 'domanda' }])
})

test('una carta sta in una lista sola: bocciata dalla prova aspetta, non è fatta', () => {
  const m = mattina.componi({
    ...vuoto,
    compiti: [carta({ id: 'x', stato: 'pronto', turno: notte('2026-10-09T02:00:00.000Z'), prova: { esito: 'fail', perche: 'Only three modules.', controlli: [], quando: ADESSO },
      consegna: { app: 'File', titolo: 'x.md', percorso: '/tmp/x.md' } })]
  }, { dal: DAL, mattina: true })
  assert.deepEqual(m.done, [])
  assert.equal(m.needsYou.length, 1)
  assert.equal(m.needsYou[0].genere === 'carta' && m.needsYou[0].motivo, 'blocco')
})

test('quello che è fatto prima di «dal» non è notizia; quello che aspetta, aspetta da qualunque ora', () => {
  const m = mattina.componi({
    ...vuoto,
    compiti: [
      carta({ id: 'ieri', stato: 'fatto', chiuso: '2026-10-08T10:00:00.000Z', consegna: { app: 'File', titolo: 'old.md', percorso: '/tmp/old.md' }, aggiornato: '2026-10-08T10:00:00.000Z' }),
      carta({ id: 'ferma', stato: 'aperto', guaio: BLOCCHI.posta, aggiornato: '2026-10-07T10:00:00.000Z' }),
      carta({ id: 'sua', stato: 'aperto', modo: 'io' }),
      carta({ id: 'via', stato: 'chiede', sparito: ADESSO })
    ]
  }, { dal: DAL, mattina: true })
  assert.deepEqual(m.done, [])
  assert.deepEqual(m.needsYou.map(a => a.id), ['ferma'], 'una riga sua non aspetta nessuno, una tolta non c’è')
})

test('al massimo cinque, il più importante prima: domande, blocchi, da approvare, poi le domande di Myynd', () => {
  const m = mattina.componi({
    ...vuoto,
    domanda: { id: 'd1', testo: 'Which project matters most this month?' },
    iniziative: [{ id: 'i1', title: 'Move Northwind', question: 'What ships next?', projectId: 'nw' }],
    compiti: [
      carta({ id: 'approva', stato: 'pronto', aggiornato: '2026-10-09T08:00:00.000Z' }),
      carta({ id: 'blocco', stato: 'aperto', guaio: BLOCCHI.file }),
      carta({ id: 'chiede1', stato: 'chiede', aggiornato: '2026-10-09T07:00:00.000Z' }),
      carta({ id: 'chiede2', stato: 'chiede', aggiornato: '2026-10-09T07:30:00.000Z' })
    ]
  }, { dal: DAL, mattina: false })
  assert.deepEqual(m.needsYou.map(a => a.id), ['chiede2', 'chiede1', 'blocco', 'approva', 'd1'])
  assert.equal(m.needsYou.length, mattina.ASPETTANO_MAX)
})

test('la settimana: partite così com’erano contro ritoccate; una mail scritta da capo non è una bozza partita', () => {
  const m = mattina.componi({
    ...vuoto, compiti: [],
    invii: [
      { via: 'smtp', classe: 'identico' }, { via: 'casella', classe: 'identico' }, { via: 'casella', classe: 'ritocco' },
      { via: 'smtp', classe: 'modificato' }, { via: 'propria', classe: 'riscritto' }
    ]
  }, { dal: DAL, mattina: false })
  assert.deepEqual(m.week, { mandate: 4, comeEra: 2, ritoccate: 2 })
})

test('niente da dire: la prossima cosa che farà, mai un allarme', () => {
  const base = { ...vuoto, compiti: [] }
  assert.deepEqual(mattina.componi({ ...base, turno: { inCoda: 2, prossimaNotte: '2026-10-09T23:00:00.000Z', acceso: true, motore: true } }, { dal: DAL, mattina: false }).prossima,
    { genere: 'notte', quando: '2026-10-09T23:00:00.000Z', carte: 2 })
  assert.deepEqual(mattina.componi({ ...base, turno: { inCoda: 0, prossimaNotte: '2026-10-09T23:00:00.000Z', acceso: true, motore: true } }, { dal: DAL, mattina: false }).prossima,
    { genere: 'notte', quando: '2026-10-09T23:00:00.000Z', carte: 0 }, 'anche senza carte, la notte è la prossima cosa')
  assert.equal(mattina.componi({ ...base, turno: { inCoda: 0, prossimaNotte: null, acceso: true, motore: true } }, { dal: DAL, mattina: false }).prossima, null)
  assert.equal(mattina.componi({ ...base, turno: { inCoda: 2, prossimaNotte: '2026-10-09T23:00:00.000Z', acceso: false, motore: true } }, { dal: DAL, mattina: false }).prossima, null, 'spento non promette niente')
  assert.equal(mattina.componi({ ...base, turno: { inCoda: 3, prossimaNotte: null, acceso: true, motore: true, fermo: true } }, { dal: DAL, mattina: false }).prossima, null, 'fermato col bottone non promette niente')
})

test('la finestra: la mattina conta dalla notte; il pomeriggio da quando se n’è andato, mai oltre un giorno e mezzo', () => {
  const n = { da: '23:00', a: '07:00' }
  const alle = (h: number, m = 0) => { const d = new Date(2026, 9, 9, h, m); return d }
  const presto = mattina.finestra(alle(8, 30), n, null)
  assert.equal(presto.mattina, true)
  assert.equal(presto.dal, new Date(2026, 9, 8, 23, 0).toISOString())
  const dopo = mattina.finestra(alle(15), n, new Date(2026, 9, 9, 12, 10).toISOString())
  assert.equal(dopo.mattina, false)
  assert.equal(dopo.dal, new Date(2026, 9, 9, 12, 10).toISOString())
  assert.equal(mattina.finestra(alle(15), n, null).dal, new Date(2026, 9, 9, 7, 0).toISOString(), 'senza la finestra, dall’inizio della giornata')
  assert.equal(mattina.finestra(alle(15), n, '2026-09-01T00:00:00.000Z').dal, new Date(2026, 9, 9, 7, 0).toISOString(), 'troppo vecchio')
  assert.equal(mattina.finestra(alle(15), n, 'domani').dal, new Date(2026, 9, 9, 7, 0).toISOString(), 'illeggibile')
  assert.equal(mattina.finestra(alle(23, 30), n, null).mattina, false, 'di notte non è mattina')
})

test('mattina(): dal database di chi chiede, con le bozze partite questa settimana', () => {
  cfg.scrivi({ lingua: 'en', turno: { notteDa: '23:00', notteA: '07:00' } } as Parameters<typeof cfg.scrivi>[0])
  const ora = new Date()
  const unOraFa = new Date(ora.getTime() - 3_600_000).toISOString()
  store.scriviCompito({ id: 'f1', testo: 'Write the brief', quando: 'oggi', ordine: 'a' })
  store.affidaCompito('f1', 'tutto')
  store.risultatoCompito('f1', 'Saved the brief.', [])
  store.scriviConsegnaCompito('f1', { app: 'File', titolo: 'Brief.md', percorso: '/tmp/Brief.md', dove: 'scrivania' })
  store.scriviCompito({ id: 'q1', testo: 'Draft the notes', quando: 'oggi', ordine: 'b' })
  store.affidaCompito('q1', 'tutto')
  store.risultatoCompito('q1', 'Which build?', [], 'chiede')
  lavoroDati.registraInvio('f1', { via: 'smtp', inviato: ora.toISOString(), classe: 'identico' })
  const m = mattina.mattina(unOraFa, ora)
  assert.ok(m.done.some(f => f.id === 'f1' && f.dove.genere === 'file'), JSON.stringify(m.done))
  assert.deepEqual(m.needsYou.map(a => a.id), ['q1'])
  assert.equal(m.week.mandate, 1)
  assert.equal(m.week.comeEra, 1)
})
