// Una riga scritta sul quaderno, letta: «!», «@ora», «#progetto».
//
//   node --test src/scrivi-riga.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leggiRiga, oraDa, progettoDa } from './oggi/scrivi-riga.ts'

const PROGETTI = [
  { id: 'nw', nome: 'Northwind', alias: ['nw app'] },
  { id: 'hb', nome: 'Harbor Labs' },
  { id: 'ls', nome: 'Lumen Studio' },
  { id: 'old', nome: 'Northstar', stato: 'chiuso' }
]

test('una riga e basta resta com’è', () => {
  assert.deepEqual(leggiRiga('  Call   the bank  '), { testo: 'Call the bank', ora: null, priorita: null, progetto: null })
})

test('«!» in fondo è alta, e sparisce dal testo; una domanda esclamata no', () => {
  assert.deepEqual(leggiRiga('Pay the invoice !'), { testo: 'Pay the invoice', ora: null, priorita: 'alta', progetto: null })
  assert.equal(leggiRiga('Pay the invoice!!').priorita, 'alta')
  assert.equal(leggiRiga('Really?!').priorita, null)
})

test('«@ora»: 10, 10:30, 9pm, 12am', () => {
  assert.equal(oraDa('10'), '10:00')
  assert.equal(oraDa('10:30'), '10:30')
  assert.equal(oraDa('9pm'), '21:00')
  assert.equal(oraDa('12am'), '00:00')
  assert.equal(oraDa('25'), null)
  assert.deepEqual(leggiRiga('Run @7'), { testo: 'Run', ora: '07:00', priorita: null, progetto: null })
  assert.deepEqual(leggiRiga('Team meeting @11:30 with Nora'), { testo: 'Team meeting with Nora', ora: '11:30', priorita: null, progetto: null })
  // un indirizzo non è un'ora
  assert.equal(leggiRiga('Write to nora@harbor.example').ora, null)
})

test('«#progetto»: esatto, per inizio, fra gli altri nomi; un progetto chiuso o un «#1» restano testo', () => {
  assert.equal(progettoDa('northwind', PROGETTI), 'nw')
  assert.equal(progettoDa('harbor', PROGETTI), 'hb')
  assert.equal(progettoDa('nwapp', PROGETTI), 'nw')
  assert.equal(progettoDa('north', PROGETTI), 'nw', 'Northstar è chiuso: l’unico che comincia così è Northwind')
  assert.deepEqual(leggiRiga('Fix the build #Northwind !', PROGETTI), { testo: 'Fix the build', ora: null, priorita: 'alta', progetto: 'nw' })
  assert.deepEqual(leggiRiga('Ship #1 priority', PROGETTI), { testo: 'Ship #1 priority', ora: null, priorita: null, progetto: null })
  assert.deepEqual(leggiRiga('Pilot outline #harbor @9', PROGETTI), { testo: 'Pilot outline', ora: '09:00', priorita: null, progetto: 'hb' })
})

test('una riga fatta solo di segni resta quella scritta', () => {
  assert.deepEqual(leggiRiga('#Northwind', PROGETTI), { testo: '#Northwind', ora: null, priorita: null, progetto: null })
})
