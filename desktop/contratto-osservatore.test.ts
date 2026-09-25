// Il contratto fra il guscio e il server, con i messaggi alla lettera.
//
// Gli stessi esempi stanno nella prova del server (P1B): se uno dei due lati
// cambia forma, una delle due prove si rompe.
//
//   node --test desktop/contratto-osservatore.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CHIEDI, RIPRENDI, creaCostruttore, filtra, leggiStato, messaggioPausa, messaggioSessioni, type EventoFronte
} from './sessioni.ts'

export const DAL_GUSCIO = [
  { tipo: 'osservatore', sessioni: [
    { bundle: 'com.apple.Safari', app: 'Safari', titolo: 'Northwind pricing - Google Docs', inizio: '2026-09-24T07:10:00.000Z', fine: '2026-09-24T07:14:30.000Z', secondi: 270 },
    { bundle: 'com.microsoft.VSCode', app: 'Code', titolo: null, inizio: '2026-09-24T07:14:30.000Z', fine: '2026-09-24T07:40:00.000Z', secondi: 1530 }
  ] },
  { tipo: 'osservatore-chiedi' },
  { tipo: 'osservatore-pausa', minuti: 60 },
  { tipo: 'osservatore-riprendi' }
]
export const DAL_SERVER = [
  { tipo: 'osservatore-stato', acceso: true, titoli: true, pausaFino: null },
  { tipo: 'osservatore-stato', acceso: true, titoli: false, pausaFino: '2026-09-24T08:10:00.000Z' },
  { tipo: 'osservatore-stato', acceso: false, titoli: false, pausaFino: null }
]

test('dal guscio: le sessioni, fatte dagli eventi, sono il primo messaggio alla lettera', () => {
  const c = creaCostruttore()
  const o = { titoli: true, mioPid: 1 }
  const eventi: EventoFronte[] = [
    { bundle: 'com.apple.Safari', app: 'Safari', pid: 10, titolo: 'Northwind pricing - Google Docs', t: Date.parse('2026-09-24T07:10:00.000Z') },
    { bundle: 'com.microsoft.VSCode', app: 'Code', pid: 11, titolo: null, t: Date.parse('2026-09-24T07:14:30.000Z') }
  ]
  for (const e of eventi) c.evento(filtra(e, o)!, e.t)
  c.ferma(Date.parse('2026-09-24T07:40:00.000Z'))
  assert.deepEqual(messaggioSessioni(c.chiusi()), DAL_GUSCIO[0])
})

test('dal guscio: chiedi, pausa e riprendi alla lettera', () => {
  assert.deepEqual(CHIEDI, DAL_GUSCIO[1])
  assert.deepEqual(messaggioPausa(60), DAL_GUSCIO[2])
  assert.deepEqual(RIPRENDI, DAL_GUSCIO[3])
  // e nessun altro `tipo` per l'osservatore
  const tipi = new Set(DAL_GUSCIO.map(m => m.tipo))
  assert.deepEqual([...tipi].sort(), ['osservatore', 'osservatore-chiedi', 'osservatore-pausa', 'osservatore-riprendi'])
})

test('dal server: ogni esempio passa da leggiStato così com’è', () => {
  for (const m of DAL_SERVER) {
    const { tipo: _tipo, ...atteso } = m
    assert.deepEqual(leggiStato(m), atteso)
  }
})

test('i messaggi attraversano il canale intatti (clonazione strutturata)', () => {
  for (const m of [...DAL_GUSCIO, ...DAL_SERVER]) assert.deepEqual(structuredClone(m), m)
})
