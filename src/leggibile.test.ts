// Il Markdown che torna leggibile.
//
//   node --test src/leggibile.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leggibile } from './leggibile.ts'

const righe = (md: string) => leggibile(md).map(b => `${b.tipo}:${b.testo}`)

test('i titoli diventano titoli, senza cancelletti', () => {
  assert.deepEqual(righe('# Contratto Rossi\n\nTesto.'), [
    'titolo:Contratto Rossi',
    'vuota:',
    'riga:Testo.'
  ])
})

test('i cancelletti in coda a un titolo se ne vanno con gli altri', () => {
  assert.deepEqual(righe('### Note ###'), ['titolo:Note'])
})

test('grassetto e corsivo restano parole', () => {
  assert.deepEqual(righe('Il **listino** è *nuovo* e __vale__ da _lunedì_.'), [
    'riga:Il listino è nuovo e vale da lunedì.'
  ])
})

test('un link diventa il testo con l’indirizzo accanto', () => {
  assert.deepEqual(righe('Vedi [il preventivo](https://x.it/p.pdf) prima.'), [
    'riga:Vedi il preventivo (https://x.it/p.pdf) prima.'
  ])
})

test('un’immagine lascia la sua didascalia', () => {
  assert.deepEqual(righe('![Grafico](https://x.it/g.png)'), ['riga:Grafico (https://x.it/g.png)'])
})

test('un indirizzo fra parentesi angolari resta un indirizzo', () => {
  assert.deepEqual(righe('Scrivi a <mailto:rossi@x.it> oggi.'), ['riga:Scrivi a mailto:rossi@x.it oggi.'])
})

test('le voci di un elenco prendono il puntino di mezzo', () => {
  assert.deepEqual(righe('- primo\n- secondo\n  * terzo'), [
    'riga:· primo',
    'riga:· secondo',
    'riga:· terzo'
  ])
})

test('un elenco numerato resta numerato', () => {
  assert.deepEqual(righe('1. primo\n2. secondo'), ['riga:1. primo', 'riga:2. secondo'])
})

test('una tabella diventa righe separate dal puntino', () => {
  assert.deepEqual(righe('| Voce | Prezzo |\n| --- | --- |\n| Corso | 900 |'), [
    'riga:Voce · Prezzo',
    'riga:Corso · 900'
  ])
})

test('il codice recintato resta intatto, in un blocco solo', () => {
  assert.deepEqual(righe('Prima.\n\n```js\nconst a = **1**\nconst b = 2\n```\n\nDopo.'), [
    'riga:Prima.',
    'vuota:',
    'codice:const a = **1**\nconst b = 2',
    'vuota:',
    'riga:Dopo.'
  ])
})

test('gli apici singoli del codice in riga se ne vanno', () => {
  assert.deepEqual(righe('Lancia `npm run build` e aspetta.'), ['riga:Lancia npm run build e aspetta.'])
})

test('una riga vuota resta, dieci diventano una', () => {
  assert.deepEqual(righe('Uno.\n\n\n\nDue.'), ['riga:Uno.', 'vuota:', 'riga:Due.'])
})

test('niente aria in cima e in fondo', () => {
  assert.deepEqual(righe('\n\nSolo questa.\n\n\n'), ['riga:Solo questa.'])
})

test('la riga di trattini divide e basta', () => {
  assert.deepEqual(righe('Uno.\n\n***\n\nDue.'), ['riga:Uno.', 'vuota:', 'riga:Due.'])
})

test('il frontespizio del file non è il documento', () => {
  assert.deepEqual(righe('---\ntitolo: Appunti\nlayout: post\n---\n\nIl testo vero.'), [
    'riga:Il testo vero.'
  ])
})

test('una citazione perde il segno e tiene le parole', () => {
  assert.deepEqual(righe('> Rossi scrive:\n>> ci vediamo martedì'), [
    'riga:Rossi scrive:',
    'riga:ci vediamo martedì'
  ])
})

test('una mail di solo testo esce come è entrata', () => {
  const mail = 'Ciao Tobia,\nti mando il listino.\n\nA presto,\nRossi'
  assert.deepEqual(righe(mail), [
    'riga:Ciao Tobia,',
    'riga:ti mando il listino.',
    'vuota:',
    'riga:A presto,',
    'riga:Rossi'
  ])
})

test('un asterisco fra due spazi non è corsivo', () => {
  assert.deepEqual(righe('3 * 4 = 12'), ['riga:3 * 4 = 12'])
})

test('il testo vuoto non produce niente', () => {
  assert.deepEqual(leggibile(''), [])
})
