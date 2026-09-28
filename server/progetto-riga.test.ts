// Di quale progetto è una riga scritta da lei: Jev prima, il modello se Jev
// non c'è; «nessuno» resta senza; una riga che ha già un progetto non si tocca.
//
//   node --test server/progetto-riga.test.ts

import { test, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-progetto-riga-'))
process.env.MYYND_DATI = join(CASA, 'dati')

const store = await import('./store.ts')
const progetti = await import('./progetti.ts')
const riga = await import('./progetto-riga.ts')

let LUMEN = ''
let NORTH = ''
before(() => {
  store.azzeraTutto()
  const a = progetti.crea({ nome: 'Lumen Studio', obiettivo: 'Sell the first course' })
  const b = progetti.crea({ nome: 'Northwind', obiettivo: 'Ship 1.0 on the App Store' })
  LUMEN = a.progetto.id; NORTH = b.progetto.id
})
afterEach(() => riga.perProva(null))
after(() => {
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

test('Jev sceglie: la riga prende il progetto', async () => {
  let chiestoAlModello = false
  riga.perProva({ jev: async () => 'Lumen Studio', modello: async () => { chiestoAlModello = true; return null } })
  store.scriviCompito({ id: 'r1', testo: 'Send the pricing one-pager to the list', ordine: 'a1' })
  assert.equal(await riga.trova('r1'), LUMEN)
  assert.equal(store.compito('r1')?.progetto, LUMEN)
  assert.equal(chiestoAlModello, false)
})

test('Jev dice «nessuno»: resta senza, e il modello non si paga', async () => {
  let chiestoAlModello = false
  riga.perProva({ jev: async () => null, modello: async () => { chiestoAlModello = true; return { progetto: 'Northwind', certezza: 0.9 } } })
  store.scriviCompito({ id: 'r2', testo: 'Buy milk', ordine: 'a2' })
  assert.equal(await riga.trova('r2'), null)
  assert.equal(store.compito('r2')?.progetto, null)
  assert.equal(chiestoAlModello, false)
})

test('senza Jev decide il modello, sopra la soglia e con un nome che esiste', async () => {
  riga.perProva({ jev: async () => undefined, modello: async () => ({ progetto: 'northwind', certezza: 0.82 }) })
  store.scriviCompito({ id: 'r3', testo: 'Record the review video', ordine: 'a3' })
  assert.equal(await riga.trova('r3'), NORTH)

  riga.perProva({ jev: async () => undefined, modello: async () => ({ progetto: 'Northwind', certezza: 0.4 }) })
  store.scriviCompito({ id: 'r4', testo: 'Think about things', ordine: 'a4' })
  assert.equal(await riga.trova('r4'), null, 'nel dubbio niente')

  riga.perProva({ jev: async () => undefined, modello: async () => ({ progetto: 'Evermute', certezza: 0.99 }) })
  store.scriviCompito({ id: 'r5', testo: 'Fix Evermute', ordine: 'a5' })
  assert.equal(await riga.trova('r5'), null, 'un progetto che non c’è non si scrive')
})

test('se lei le dà un progetto mentre si chiede, vince lei', async () => {
  store.scriviCompito({ id: 'r6', testo: 'Plan the launch', ordine: 'a6' })
  riga.perProva({ jev: async () => { store.cambiaCompito('r6', { progetto: NORTH }); return 'Lumen Studio' } })
  assert.equal(await riga.trova('r6'), null)
  assert.equal(store.compito('r6')?.progetto, NORTH)
})

test('un guaio del modello non lancia', async () => {
  riga.perProva({ jev: async () => { throw new Error('giù') }, modello: async () => { throw new Error('giù') } })
  store.scriviCompito({ id: 'r7', testo: 'Something', ordine: 'a7' })
  assert.equal(await riga.trova('r7'), null)
})
