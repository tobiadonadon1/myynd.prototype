// C'è o non c'è (F2): il numero che manda il guscio, e quando vale.
//
//   node --test server/presenza.test.ts

import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import * as presenza from './presenza.ts'

afterEach(() => presenza.perProva(null))

test('senza notizie dal guscio non si sa, e allora lei c’è', () => {
  assert.equal(presenza.assente(), false)
})

test('un quarto d’ora di Mac fermo, detto di recente, vuol dire che non c’è', () => {
  const t = Date.now()
  presenza.registra(presenza.ASSENTE_DOPO, t)
  assert.equal(presenza.assente(t + 1000), true)
  presenza.registra(presenza.ASSENTE_DOPO - 1, t)
  assert.equal(presenza.assente(t + 1000), false)
})

test('una notizia vecchia non vale: il guscio può essere morto', () => {
  const t = Date.now()
  presenza.registra(3600, t)
  assert.equal(presenza.assente(t + 4 * 60_000), false)
})

test('il filo del guscio: solo il messaggio «presenza», e solo un numero valido', () => {
  const filo = new EventEmitter()
  assert.equal(presenza.ascolta(filo as never), true)
  filo.emit('message', { data: { tipo: 'altro', inattivo: 9999 } })
  assert.equal(presenza.ultimaNotizia(), null)
  filo.emit('message', { data: { tipo: 'presenza', inattivo: 'molto' } })
  assert.equal(presenza.ultimaNotizia(), null)
  filo.emit('message', { data: { tipo: 'presenza', inattivo: 1200.7 } })
  assert.equal(presenza.ultimaNotizia()?.inattivo, 1200)
  assert.equal(presenza.assente(), true)
})
