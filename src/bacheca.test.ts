// La bacheca (F1): in quale corsia sta una carta, e in che ordine.
//
//   node --test src/bacheca.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Compito } from './api.ts'
import { consegnata, corsiaDi, cosaAspetta, perCorsia, provenienza, staControllando } from './oggi/bacheca.ts'

const OGGI = '2026-09-28'
let n = 0
function c(x: Partial<Compito>): Compito {
  const id = x.id ?? `b${++n}`
  return {
    id, testo: `Carta ${id}`, nota: null, quando: 'oggi', stato: 'aperto', modo: 'io', ordine: `o${String(n).padStart(3, '0')}`,
    origine: 'mano', voce: null, doc: null, chiesto: null, risultato: null, fonti: null, guaio: null,
    creato: '2026-09-28T08:00:00.000Z', aggiornato: '2026-09-28T08:00:00.000Z', chiuso: null, esito: null, sparito: null,
    versione: 1, proposta: null, chieste: null, email: null, ...x
  } as Compito
}

test('le tue sono tue; una carta di Myynd in fila senza passo è in coda, con il passo è al lavoro', () => {
  assert.equal(corsiaDi(c({})), 'tue')
  assert.equal(corsiaDi(c({ stato: 'delegato', modo: 'tutto' })), 'coda')
  assert.equal(corsiaDi(c({ stato: 'delegato', modo: 'tutto' }), { passo: 'cerco', dettaglio: 'listino' }), 'lavora')
  // aperta ma già di Myynd: aspetta il suo turno (F2)
  assert.equal(corsiaDi(c({ stato: 'aperto', modo: 'bozza' })), 'coda')
})

test('aspetta te: una domanda, un guaio, o un lavoro che non ha passato il suo «fatto»', () => {
  assert.equal(corsiaDi(c({ stato: 'chiede', modo: 'tutto' })), 'attende')
  assert.equal(corsiaDi(c({ stato: 'aperto', modo: 'tutto', guaio: 'Collega la posta e la riprendo da qui.' })), 'attende')
  assert.equal(corsiaDi(c({ stato: 'pronto', modo: 'tutto', prova: { esito: 'fail', perche: 'Manca la cifra.', controlli: [], quando: '' } })), 'attende')
  assert.equal(corsiaDi(c({ stato: 'pronto', modo: 'tutto', prova: { esito: 'pass', perche: 'Regge.', controlli: [], quando: '' } })), 'fatte')
  // senza prova (una riga di prima di F1) è fatta, da guardare
  assert.equal(corsiaDi(c({ stato: 'pronto', modo: 'bozza' })), 'fatte')
})

test('staControllando: solo la rilettura', () => {
  assert.equal(staControllando({ passo: 'rileggo' }), true)
  assert.equal(staControllando({ passo: 'scrivo' }), false)
  assert.equal(staControllando(undefined), false)
})

test('perCorsia: le tue con oggi e le alte prima, la coda nell’ordine in cui è passata, le fatte con le chiuse di oggi in fondo', () => {
  const domani = c({ id: 'domani', giorno: '2026-09-29', quando: 'settimana' })
  const oggiNormale = c({ id: 'oggi-normale', giorno: OGGI })
  const oggiAlta = c({ id: 'oggi-alta', giorno: OGGI, priorita: 'alta' })
  const ieri = c({ id: 'ieri', giorno: '2026-09-27' })
  const primaPassata = c({ id: 'coda-1', stato: 'delegato', modo: 'tutto', chiesto: '2026-09-28T07:00:00.000Z' })
  const dopoPassata = c({ id: 'coda-2', stato: 'delegato', modo: 'tutto', chiesto: '2026-09-28T09:00:00.000Z' })
  const fattaVecchia = c({ id: 'fatta-1', stato: 'pronto', modo: 'tutto', aggiornato: '2026-09-28T06:00:00.000Z' })
  const fattaNuova = c({ id: 'fatta-2', stato: 'pronto', modo: 'tutto', aggiornato: '2026-09-28T10:00:00.000Z' })
  const chiusaOggi = c({ id: 'chiusa', stato: 'fatto', chiuso: new Date(2026, 8, 28, 11, 0).toISOString() })
  const chiusaIeri = c({ id: 'chiusa-ieri', stato: 'fatto', chiuso: new Date(2026, 8, 27, 11, 0).toISOString() })
  const r = perCorsia([domani, oggiNormale, oggiAlta, ieri, dopoPassata, primaPassata, fattaVecchia, fattaNuova], {}, [chiusaOggi, chiusaIeri], OGGI)
  assert.deepEqual(r.tue.map(x => x.id), ['oggi-alta', 'ieri', 'oggi-normale', 'domani'])
  assert.deepEqual(r.coda.map(x => x.id), ['coda-1', 'coda-2'])
  assert.deepEqual(r.fatte.map(x => x.id), ['fatta-2', 'fatta-1', 'chiusa'])
})

test('provenienza: la fonte vera, in due parole', () => {
  assert.equal(provenienza(c({ doc: 'posta:INBOX:1' })), 'posta')
  assert.equal(provenienza(c({ origine: 'iniziativa' })), 'myynd')
  assert.equal(provenienza(c({ origine: 'seguito' })), 'seguito')
  assert.equal(provenienza(c({ origine: 'auto:human-mail' })), 'automazione')
  assert.equal(provenienza(c({ doc: 'granola:abc' })), 'riunione')
  assert.equal(provenienza(c({})), 'tu')
})

test('consegnata e cosaAspetta: il file, la casella, la domanda sola', () => {
  assert.deepEqual(consegnata(c({ consegna: { app: 'File', titolo: 'Policy.md', percorso: '/x/Policy.md' } })), { tipo: 'file', nome: 'Policy.md' })
  assert.deepEqual(consegnata(c({ email: { a: 'a@b.c', oggetto: 'x', corpo: 'y', conosciuto: true, casella: { stato: 'salvata' } } as Compito['email'] })), { tipo: 'casella' })
  assert.equal(cosaAspetta(c({ stato: 'chiede', chieste: [{ domanda: 'Which build?', opzioni: [], multipla: false }] })), 'Which build?')
  assert.equal(cosaAspetta(c({ stato: 'chiede', risultato: 'I read the mail.\nWhich build?' })), 'Which build?')
  assert.equal(cosaAspetta(c({ stato: 'pronto', prova: { esito: 'fail', perche: 'Missing: the amount', controlli: [], quando: '' } })), 'Missing: the amount')
})
