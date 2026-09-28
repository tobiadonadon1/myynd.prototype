// «Mentre dormivi» (F5): quali carte sono di stanotte, e come si dividono.
//
//   node --test src/stanotte.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Compito, StatoTurno } from './api.ts'
import { carteDiStanotte } from './oggi/bacheca.ts'

const DAL = '2026-09-27T20:00:00.000Z'
const s = { stanotte: { fatte: 0, attende: 0, dal: DAL } } as StatoTurno
const c = (id: string, x: Partial<Compito>): Compito => ({ id, testo: id, stato: 'pronto', modo: 'tutto', ...x } as Compito)
const notte = (ultimo: string, altro: Partial<NonNullable<Compito['turno']>> = {}) => ({ turno: { da: 'tu' as const, quando: 'presto' as const, dal: DAL, tentativi: 1, ultimo, notte: true, ...altro } })

test('le carte del turno di stanotte: finite con la prova, e quelle che aspettano lei', () => {
  const r = carteDiStanotte([
    c('fatta', notte('2026-09-28T01:00:00.000Z')),
    c('non-regge', { ...notte('2026-09-28T02:00:00.000Z'), prova: { esito: 'fail', perche: 'x', controlli: [], quando: '' } }),
    c('chiede', { ...notte('2026-09-28T03:00:00.000Z'), stato: 'chiede' }),
    c('ferma', { ...notte('2026-09-28T03:30:00.000Z'), stato: 'aperto', guaio: 'Collega la posta e la riprendo da qui.' }),
    c('di-giorno', { turno: { da: 'tu', quando: 'presto', dal: DAL, tentativi: 1, ultimo: '2026-09-28T10:00:00.000Z', notte: false } }),
    c('ieri-notte', notte('2026-09-26T23:00:00.000Z')),
    c('a-mano', {})
  ], [c('chiusa', { ...notte('2026-09-28T04:00:00.000Z'), stato: 'fatto' })], s)
  assert.deepEqual(r.fatte.map(x => x.id), ['fatta', 'chiusa'])
  assert.deepEqual(r.attende.map(x => x.id), ['non-regge', 'chiede', 'ferma'])
})

test('senza turno non c’è niente', () => {
  assert.deepEqual(carteDiStanotte([c('x', notte('2026-09-28T01:00:00.000Z'))], [], null), { fatte: [], attende: [] })
})
