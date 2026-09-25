// Riconciliare dentro la finestra letta: una prima lettura di novanta giorni
// seguita da una di trenta non cancella i sessanta in mezzo, ma quello che è
// sparito dentro i trenta se ne va.
//
//   node --test server/riconcilia-finestra.test.ts

import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const casa = mkdtempSync(join(tmpdir(), 'myynd-riconcilia-'))
process.env.MYYND_DATI = casa
const store = await import('./store.ts')

const GIORNO = 86_400_000
const adesso = Date.now()
const fa = (g: number) => new Date(adesso - g * GIORNO).toISOString()
const evento = (i: number, giorni: number) => ({ id: `calendario:u${i}:${adesso - giorni * GIORNO}`, fonte: 'calendario', tipo: 'evento', titolo: `Riunione ${i}`, corpo: 'x', quando: fa(giorni), gruppo: 'agenda' })
const quanti = (fonte: string) => store.conteggi().perFonte.find(f => f.fonte === fonte)?.n ?? 0

beforeEach(() => store.azzeraTutto())
after(() => { store.chiudiIndici(); rmSync(casa, { recursive: true, force: true }) })

test('novanta giorni, poi trenta: niente di quello fuori dai trenta se ne va', () => {
  const tutti = Array.from({ length: 90 }, (_, i) => evento(i, i + 0.5))
  store.salvaDocumenti(tutti)
  assert.equal(store.riconcilia('calendario', { completo: true, dal: fa(90), al: fa(-180) }, tutti.map(d => d.id)), 0)
  const trenta = tutti.filter(d => Date.parse(d.quando) >= Date.parse(fa(30)))
  const tolti = store.riconcilia('calendario', { completo: true, dal: fa(30), al: fa(-180) }, trenta.map(d => d.id))
  assert.equal(tolti, 0)
  assert.equal(quanti('calendario'), 90)
})

test('un impegno annullato dentro i trenta giorni sparisce', () => {
  const tutti = Array.from({ length: 60 }, (_, i) => evento(i, i + 0.5))
  store.salvaDocumenti(tutti)
  const trenta = tutti.filter(d => Date.parse(d.quando) >= Date.parse(fa(30)))
  const annullato = trenta[3]!
  const tolti = store.riconcilia('calendario', { completo: true, dal: fa(30), al: fa(-180) }, trenta.filter(d => d !== annullato).map(d => d.id))
  assert.equal(tolti, 1)
  assert.equal(store.documento(annullato.id), null)
  assert.equal(quanti('calendario'), 59)
})

test('un giorno di Slack cancellato dentro la finestra se ne va; quelli prima restano', () => {
  const giorni = Array.from({ length: 80 }, (_, i) => ({ id: `slack:C1:g${i}`, fonte: 'slack', tipo: 'canale', titolo: `#generale ${i}`, corpo: 'a: b\nc: d', quando: fa(i + 0.2), gruppo: 'conversazioni' }))
  store.salvaDocumenti(giorni)
  const dentro = giorni.filter(d => Date.parse(d.quando) >= Date.parse(fa(30)))
  const tolti = store.riconcilia('slack', { completo: true, dal: fa(30) }, dentro.slice(1).map(d => d.id))
  assert.equal(tolti, 1)
  assert.equal(quanti('slack'), 79)
})

test('senza finestra, come sempre: quello che non si è visto se ne va (counter-case)', () => {
  const tutti = Array.from({ length: 20 }, (_, i) => evento(i, i + 0.5))
  store.salvaDocumenti(tutti)
  const tolti = store.riconcilia('calendario', { completo: true }, tutti.slice(0, 5).map(d => d.id))
  assert.equal(tolti, 15)
})

test('un documento senza data conta come dentro la finestra', () => {
  store.salvaDocumenti([{ id: 'calendario:senza', fonte: 'calendario', tipo: 'evento', titolo: 'x', corpo: 'x', quando: null }])
  assert.equal(store.riconcilia('calendario', { completo: true, dal: fa(30) }, []), 1)
})

test('una lettura incompleta non cancella niente, finestra o no', () => {
  const tutti = Array.from({ length: 10 }, (_, i) => evento(i, i + 0.5))
  store.salvaDocumenti(tutti)
  assert.equal(store.riconcilia('calendario', { completo: false, dal: fa(30) }, []), 0)
  assert.equal(quanti('calendario'), 10)
})
