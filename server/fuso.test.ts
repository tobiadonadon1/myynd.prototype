import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parti, istante, giornoIn, oraIn, fusoValido } from './fuso.ts'

test('le sette di Roma sono le cinque UTC d’estate e le sei d’inverno', () => {
  assert.equal(istante(2026, 7, 15, 7, 'Europe/Rome').toISOString(), '2026-07-15T05:00:00.000Z')
  assert.equal(istante(2026, 1, 15, 7, 'Europe/Rome').toISOString(), '2026-01-15T06:00:00.000Z')
})

test('il giorno che sfora il mese si normalizza da sé', () => {
  assert.equal(istante(2026, 1, 32, 9, 'UTC').toISOString(), '2026-02-01T09:00:00.000Z')
})

test('a cavallo del cambio d’ora l’orologio di lì segna comunque l’ora chiesta', () => {
  // in Europa l'ora legale finisce alle 3 del 25 ottobre 2026: le 9 del 24 e
  // le 9 del 25 sono a venticinque ore di distanza, e l'orologio dice 9 tutt'e due
  const prima = istante(2026, 10, 24, 9, 'Europe/Rome')
  const dopo = istante(2026, 10, 25, 9, 'Europe/Rome')
  assert.equal(parti(prima, 'Europe/Rome').ora, 9)
  assert.equal(parti(dopo, 'Europe/Rome').ora, 9)
  assert.equal(dopo.getTime() - prima.getTime(), 25 * 3_600_000)
})

test('parti legge l’orologio di quel fuso, compreso il giorno della settimana', () => {
  const p = parti(new Date('2026-09-04T23:30:00Z'), 'Europe/Rome')
  assert.deepEqual(p, { anno: 2026, mese: 9, giorno: 5, ora: 1, minuti: 30, settimana: 6 })
  assert.equal(giornoIn(new Date('2026-09-04T23:30:00Z'), 'Europe/Rome'), '2026-09-05')
  assert.equal(giornoIn(new Date('2026-09-04T23:30:00Z'), 'UTC'), '2026-09-04')
})

test('l’ora sull’agenda è quella di chi legge, non quella del database', () => {
  assert.equal(oraIn('2026-06-10T13:00:00.000Z', 'Europe/Rome'), '2026-06-10 15:00')
  assert.equal(oraIn('non è una data', 'Europe/Rome'), 'non è una data')
})

test('un fuso storto non passa', () => {
  assert.equal(fusoValido('Europe/Rome'), true)
  assert.equal(fusoValido('Marte/Olympus'), false)
  assert.equal(fusoValido(''), false)
})
