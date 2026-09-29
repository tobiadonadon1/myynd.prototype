// Il titolo corto di una riga: solo per le righe lunghe, una domanda per
// testo, mai sopra un testo cambiato nel frattempo, e il testo non si tocca.
//
//   node --test server/titolo-riga.test.ts

import { test, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-titolo-riga-'))
process.env.MYYND_DATI = join(CASA, 'dati')

const store = await import('./store.ts')
const riga = await import('./titolo-riga.ts')

const LUNGA = 'Define the specific company efforts AI systems should streamline'

before(() => store.azzeraTutto())
afterEach(() => { riga.perProva(null); store.azzeraTutto() })
after(() => {
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

test('una riga lunga prende il titolo, e il testo resta intero', async () => {
  riga.perProva({ collegato: () => true, modello: async () => '“Pick company areas for AI.”' })
  store.scriviCompito({ id: 't1', testo: LUNGA, ordine: 'a1' })
  let annunci = 0
  assert.equal(await riga.ripassa(() => { annunci++ }), 1)
  assert.equal(store.compito('t1')?.titolo, 'Pick company areas for AI')
  assert.equal(store.compito('t1')?.testo, LUNGA)
  assert.equal(annunci, 1)
})

test('controcaso: una riga corta non si chiede', async () => {
  let chieste = 0
  riga.perProva({ collegato: () => true, modello: async () => { chieste++; return 'Milk' } })
  store.scriviCompito({ id: 't2', testo: 'Buy milk', ordine: 'a1' })
  assert.equal(await riga.ripassa(), 0)
  assert.equal(chieste, 0)
  assert.equal(store.compito('t2')?.titolo ?? null, null)
})

test('una risposta che non è un titolo si scarta, e non si richiede al giro dopo', async () => {
  let chieste = 0
  riga.perProva({ collegato: () => true, modello: async () => { chieste++; return LUNGA + ' as soon as possible' } })
  store.scriviCompito({ id: 't3', testo: LUNGA, ordine: 'a1' })
  assert.equal(await riga.ripassa(), 0)
  assert.equal(await riga.ripassa(), 0)
  assert.equal(chieste, 1)
  assert.equal(store.compito('t3')?.titolo ?? null, null)
})

test('senza modello non si segna niente: quando arriva, la riga si chiede', async () => {
  let c = false
  riga.perProva({ collegato: () => c, modello: async () => 'Pick AI areas' })
  store.scriviCompito({ id: 't4', testo: LUNGA, ordine: 'a1' })
  assert.equal(await riga.ripassa(), 0)
  c = true
  assert.equal(await riga.ripassa(), 1)
  assert.equal(store.compito('t4')?.titolo, 'Pick AI areas')
})

test('lei riscrive la riga: il titolo vecchio si svuota, e uno arrivato tardi non si posa sul testo nuovo', async () => {
  riga.perProva({ collegato: () => true, modello: async () => 'Pick AI areas' })
  store.scriviCompito({ id: 't5', testo: LUNGA, ordine: 'a1' })
  await riga.ripassa()
  store.cambiaCompito('t5', { testo: 'Call Riccardo about the H-Farm pilot next week' })
  assert.equal(store.compito('t5')?.titolo ?? null, null)
  // un titolo nato dal testo di prima non scrive
  assert.equal(store.scriviTitoloCompito('t5', 'Pick AI areas', LUNGA), false)
  assert.equal(store.compito('t5')?.titolo ?? null, null)
})

test('pulisci: via lineette e punto finale, niente titoli vuoti o lunghi quanto la riga', () => {
  assert.equal(riga.pulisci('Hook signup form — leads sheet.', 'Hook the Myynd signup form to your leads sheet'), 'Hook signup form leads sheet')
  assert.equal(riga.pulisci('  ', LUNGA), null)
  assert.equal(riga.pulisci('Buy milk', 'Buy milk'), null)
  assert.equal(riga.serveTitolo('Buy milk'), false)
  assert.equal(riga.serveTitolo(LUNGA), true)
})
