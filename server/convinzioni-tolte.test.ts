// Una convinzione scordata a mano non torna da sola (P5): la lapide in
// `convinzioni_tolte` ferma la stessa deduzione; quello che dice lei vale.
//
//   node --test server/convinzioni-tolte.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-tolte-'))
process.env.MYYND_DATI = CASA
delete process.env.ANTHROPIC_API_KEY

const store = await import('./store.ts')

after(() => { store.chiudiIndici(); rmSync(CASA, { recursive: true, force: true }) })
before(() => { store.azzeraTutto() })

const FRASE = 'Preferisce le telefonate alle mail con i fornitori'
const dedotta = () => store.ricorda({ enunciato: FRASE, ambito: 'persona', genere: 'indotta', fiducia: 0.55, origine: 'scarti' })
const viva = (id: string) => store.convinzioni().some(k => k.id === id)
const lapide = (id: string) => !!store.default.prepare('SELECT 1 FROM convinzioni_tolte WHERE id = ?').get(id)

test('scordata, la stessa deduzione non si riscrive', () => {
  const id = dedotta()
  assert.ok(viva(id))
  store.scordaConvinzione(id)
  assert.ok(!viva(id))
  assert.ok(lapide(id))
  assert.equal(dedotta(), id)
  assert.ok(!viva(id), 'tornata da sola')
  // né come dedotta con premesse
  store.ricorda({ enunciato: FRASE, ambito: 'persona', genere: 'dedotta', fiducia: 0.9, origine: 'conversazione' })
  assert.ok(!viva(id))
})

test('e nemmeno dopo aver riaperto l’indice', () => {
  const id = dedotta()
  store.chiudiIndici()
  assert.equal(dedotta(), id)
  assert.ok(!viva(id))
  assert.ok(lapide(id))
})

test('controcaso: detta da lei, si scrive e la lapide se ne va', () => {
  const id = store.ricorda({ enunciato: FRASE, ambito: 'persona', genere: 'esplicita', fiducia: 1, origine: 'mano' })
  assert.ok(viva(id))
  assert.ok(!lapide(id))
  // e da lì una deduzione uguale torna a contare
  store.scordaConvinzione(id)
  assert.ok(lapide(id))
})

test('controcaso: una frase diversa non è fermata', () => {
  const id = store.ricorda({ enunciato: 'Risponde a Harbor Labs entro un’ora', ambito: 'persona', genere: 'indotta', fiducia: 0.6, origine: 'chiusura' })
  assert.ok(viva(id))
})

test('azzerare tutto svuota anche le lapidi, e il fascicolo le elenca', () => {
  const id = dedotta()
  store.scordaConvinzione(id)
  assert.ok(lapide(id))
  assert.ok(store.TABELLE_DEL_FASCICOLO.includes('convinzioni_tolte'))
  store.azzeraTutto()
  assert.equal((store.default.prepare('SELECT COUNT(*) AS n FROM convinzioni_tolte').get() as { n: number }).n, 0)
})

test('un indice nuovo arriva all’ultima versione con la tabella', () => {
  const v = (store.default.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
  assert.equal(v, store.perProva.schema().migrazioni)
  assert.ok(store.default.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'convinzioni_tolte'").get())
})
