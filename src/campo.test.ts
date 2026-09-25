// Il contratto dei campi (P5): tasti e salvataggio, sotto node.
//
//   node --test src/campo.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { daSalvare, iniziale, prossimaVoce, riduci, sporco, tastiCampo, tastiScelte } from './campo.ts'

const riga = { multilinea: false, sporco: true, avanti: false, mac: true }
const lungo = { multilinea: true, sporco: true, avanti: false, mac: true }

test('una riga: Invio salva, e con un campo dopo va avanti', () => {
  assert.equal(tastiCampo({ key: 'Enter' }, riga), 'salva')
  assert.equal(tastiCampo({ key: 'Enter' }, { ...riga, avanti: true }), 'avanti')
})

test('un testo lungo: Invio va a capo, ⌘Invio sul Mac e Ctrl+Invio altrove salvano', () => {
  assert.equal(tastiCampo({ key: 'Enter' }, lungo), 'niente')
  assert.equal(tastiCampo({ key: 'Enter', metaKey: true }, lungo), 'salva')
  assert.equal(tastiCampo({ key: 'Enter', ctrlKey: true }, { ...lungo, mac: false }), 'salva')
})

test('controcaso: Ctrl+Invio sul Mac non salva un testo lungo', () => {
  assert.equal(tastiCampo({ key: 'Enter', ctrlKey: true }, lungo), 'niente')
  assert.equal(tastiCampo({ key: 'Enter', metaKey: true }, { ...lungo, mac: false }), 'niente')
})

test('Esc: sporco rimette com’era, pulito lascia passare', () => {
  assert.equal(tastiCampo({ key: 'Escape' }, riga), 'annulla')
  assert.equal(tastiCampo({ key: 'Escape' }, { ...riga, sporco: false }), 'passa')
})

test('mentre si compone una parola, Invio non fa niente', () => {
  assert.equal(tastiCampo({ key: 'Enter', isComposing: true }, riga), 'niente')
  assert.equal(tastiCampo({ key: 'Escape', isComposing: true }, riga), 'niente')
  assert.equal(tastiCampo({ key: 'a' }, riga), 'niente')
})

test('commit: la spunta c’è prima di qualunque risposta del server', () => {
  let s = riduci(iniziale('vecchio'), { tipo: 'scrivi', testo: 'nuovo' })
  s = riduci(s, { tipo: 'commit' })
  assert.equal(s.fase, 'salvato')
  assert.equal(s.salvato, 'nuovo')
  assert.equal(s.prima, 'vecchio')
  assert.equal(sporco(s), false)
})

test('fallito: resta quello che ha scritto, torna il salvato vero, e il guaio si dice', () => {
  let s = riduci(iniziale('vecchio'), { tipo: 'scrivi', testo: 'nuovo' })
  s = riduci(s, { tipo: 'commit' })
  s = riduci(s, { tipo: 'fallito', guaio: 'Non sono riuscito a salvarlo.' })
  assert.equal(s.testo, 'nuovo')
  assert.equal(s.salvato, 'vecchio')
  assert.equal(s.fase, 'guaio')
  assert.equal(s.guaio, 'Non sono riuscito a salvarlo.')
  assert.equal(daSalvare(s), 'nuovo')
})

test('riuscito non cambia niente di visibile', () => {
  const s = riduci(riduci(riduci(iniziale('a'), { tipo: 'scrivi', testo: 'b' }), { tipo: 'commit' }), { tipo: 'riuscito' })
  assert.equal(s.fase, 'salvato')
  assert.equal(s.testo, 'b')
})

test('controcaso: commit su un campo pulito non cambia niente', () => {
  const s = iniziale('uguale')
  assert.equal(riduci(s, { tipo: 'commit' }), s)
})

test('vuoto dove è vietato: guaio, e niente da salvare', () => {
  let s = riduci(iniziale('qualcosa'), { tipo: 'scrivi', testo: '   ' })
  s = riduci(s, { tipo: 'commit' }, { vuotoVietato: true })
  assert.equal(s.fase, 'guaio')
  assert.equal(s.guaio, 'Scrivi qualcosa.')
  assert.equal(s.salvato, 'qualcosa')
  assert.equal(s.testo, '   ')
  assert.equal(daSalvare(s, { vuotoVietato: true }), null)
  // e senza il divieto, vuoto si salva
  assert.equal(riduci(riduci(iniziale('x'), { tipo: 'scrivi', testo: '' }), { tipo: 'commit' }).salvato, '')
})

test('arriva: ignorato mentre scrive, accettato da pulito o fuori dal campo', () => {
  let s = riduci(riduci(iniziale('a'), { tipo: 'fuoco', si: true }), { tipo: 'scrivi', testo: 'mio' })
  assert.equal(riduci(s, { tipo: 'arriva', valore: 'server' }).testo, 'mio')
  s = riduci(s, { tipo: 'fuoco', si: false })
  assert.equal(riduci(s, { tipo: 'arriva', valore: 'server' }).testo, 'server')
  const pulito = riduci(iniziale('a'), { tipo: 'fuoco', si: true })
  const r = riduci(pulito, { tipo: 'arriva', valore: 'b' })
  assert.equal(r.testo, 'b'); assert.equal(r.salvato, 'b')
})

test('annulla su un testo lungo tiene da parte, e rimetti lo riporta', () => {
  let s = riduci(iniziale('salvato'), { tipo: 'scrivi', testo: 'bozza lunga' })
  s = riduci(s, { tipo: 'annulla', multilinea: true })
  assert.equal(s.testo, 'salvato')
  assert.equal(s.annullato, 'bozza lunga')
  s = riduci(s, { tipo: 'rimetti' })
  assert.equal(s.testo, 'bozza lunga')
  assert.equal(s.annullato, null)
  // su una riga sola non si tiene niente
  assert.equal(riduci(riduci(iniziale('a'), { tipo: 'scrivi', testo: 'b' }), { tipo: 'annulla' }).annullato, null)
})

test('daSalvare: il valore sporco, o null', () => {
  assert.equal(daSalvare(iniziale('a')), null)
  assert.equal(daSalvare(riduci(iniziale('a'), { tipo: 'scrivi', testo: 'b' })), 'b')
})

test('spegni: la spunta se ne va', () => {
  const s = riduci(riduci(riduci(iniziale('a'), { tipo: 'scrivi', testo: 'b' }), { tipo: 'commit' }), { tipo: 'spegni' })
  assert.equal(s.fase, 'fermo')
})

test('scelte a mano: le frecce muovono il fuoco e girano, senza scegliere', () => {
  assert.deepEqual(tastiScelte('ArrowRight', 0, 3, 'manuale'), { fuoco: 1, scegli: false })
  assert.deepEqual(tastiScelte('ArrowRight', 2, 3, 'manuale'), { fuoco: 0, scegli: false })
  assert.deepEqual(tastiScelte('ArrowLeft', 0, 3, 'manuale'), { fuoco: 2, scegli: false })
  assert.deepEqual(tastiScelte('ArrowDown', 1, 3, 'manuale'), { fuoco: 2, scegli: false })
})

test('scelte: Spazio e Invio scelgono quella col fuoco', () => {
  assert.deepEqual(tastiScelte(' ', 1, 3, 'manuale'), { fuoco: 1, scegli: true })
  assert.deepEqual(tastiScelte('Enter', 2, 3, 'manuale'), { fuoco: 2, scegli: true })
  assert.deepEqual(tastiScelte('x', 2, 3, 'manuale'), { fuoco: 2, scegli: false })
})

test('scelte automatiche: le frecce scelgono', () => {
  assert.deepEqual(tastiScelte('ArrowRight', 0, 3, 'automatica'), { fuoco: 1, scegli: true })
  assert.deepEqual(tastiScelte('End', 0, 3, 'automatica'), { fuoco: 2, scegli: true })
})

test('menù: giù, su, Home, Fine, e si gira; un altro tasto è -1', () => {
  assert.equal(prossimaVoce('ArrowDown', 0, 4), 1)
  assert.equal(prossimaVoce('ArrowDown', 3, 4), 0)
  assert.equal(prossimaVoce('ArrowUp', 0, 4), 3)
  assert.equal(prossimaVoce('ArrowUp', -1, 4), 3)
  assert.equal(prossimaVoce('ArrowDown', -1, 4), 0)
  assert.equal(prossimaVoce('Home', 2, 4), 0)
  assert.equal(prossimaVoce('End', 0, 4), 3)
  assert.equal(prossimaVoce('Enter', 0, 4), -1)
  assert.equal(prossimaVoce('a', 0, 4), -1)
})
