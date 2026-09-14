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

// — come la vuole la chat: i segni restano, gli elenchi sono elenchi —
//
// Il quattordici settembre Tobia ha mandato due schermate. Nella prima, una
// risposta in chat che sullo schermo diceva «### Key Observations: 1. **No
// Reference to H-Farm**: The content focuses on:    - Rental move-in
// logistics» — tutto su una riga, con i cancelletti scritti e i rientri
// dentro. Nella seconda, una riga della lista che chiedeva una cosa e la
// chiedeva con un piano numerato appiattito allo stesso modo. Erano la stessa
// cosa: `Testo` conosceva quattro segni su dodici, e gli altri li stampava.
//
// Questi casi sono quelle due schermate, parola per parola.

import { IMPAGINATO } from './leggibile.ts'

const impaginate = (md: string) =>
  leggibile(md, IMPAGINATO).map(b => `${b.tipo}${b.numero != null ? `(${b.numero})` : ''}:${b.testo}`)

test('impaginata: il cancelletto non arriva mai sullo schermo', () => {
  assert.deepEqual(impaginate('### Key Observations:\nIl resto.'), [
    'titolo:Key Observations:',
    'riga:Il resto.'
  ])
})

test('impaginata: il grassetto resta al suo posto, che lo disegna Testo', () => {
  assert.deepEqual(impaginate('Il **listino** è *nuovo*.'), ['riga:Il **listino** è *nuovo*.'])
})

test('impaginata: la schermata della chat, riga per riga', () => {
  const suo = [
    '### Key Observations:',
    '1. **No Reference to H-Farm**: The content focuses on:',
    '   - Rental move-in logistics, lease signing.',
    '   - Tobia Donadon\'s "Myynd" personal AI tool prototype.',
    '2. **Possible Context Confusion**: details are not available here.'
  ].join('\n')
  assert.deepEqual(impaginate(suo), [
    'titolo:Key Observations:',
    'voce(1):**No Reference to H-Farm**: The content focuses on:',
    'voce:Rental move-in logistics, lease signing.',
    'voce:Tobia Donadon\'s "Myynd" personal AI tool prototype.',
    'voce(2):**Possible Context Confusion**: details are not available here.'
  ])
})

test('impaginata: il piano numerato della riga che chiede', () => {
  const suo = [
    "Here's a step-by-step approach:",
    '1. **Understand Your Goal**: Clarify what "solidification" entails.',
    '2. **Review Existing Materials**: Check documents for relevant details.'
  ].join('\n')
  assert.deepEqual(impaginate(suo), [
    "riga:Here's a step-by-step approach:",
    'voce(1):**Understand Your Goal**: Clarify what "solidification" entails.',
    'voce(2):**Review Existing Materials**: Check documents for relevant details.'
  ])
})

test('impaginata: una voce senza riga vuota davanti resta una voce', () => {
  assert.deepEqual(impaginate('Tre cose:\n- una\n- due'), [
    'riga:Tre cose:',
    'voce:una',
    'voce:due'
  ])
})

test('impaginata: una tabella non arriva con le pipe', () => {
  assert.deepEqual(impaginate('| Voce | Prezzo |\n| --- | --- |\n| Sito | 2000 |'), [
    'riga:Voce · Prezzo',
    'riga:Sito · 2000'
  ])
})

test('impaginata: il codice recintato non lascia in giro i tre apici', () => {
  assert.deepEqual(impaginate('Prima.\n```\nnpm run build\n```\nDopo.'), [
    'riga:Prima.',
    'codice:npm run build',
    'riga:Dopo.'
  ])
})

test('impaginata: un numero dentro una frase non è un elenco', () => {
  assert.deepEqual(impaginate('Ne restano 3. Poi si vede.'), ['riga:Ne restano 3. Poi si vede.'])
})

test('per il visualizzatore niente cambia: gli elenchi restano righe col puntino', () => {
  assert.deepEqual(righe('Tre cose:\n- una\n- due'), [
    'riga:Tre cose:',
    'riga:· una',
    'riga:· due'
  ])
  // e un numerato resta numerato, come è sempre stato
  assert.deepEqual(righe('1. prima\n2. seconda'), ['riga:1. prima', 'riga:2. seconda'])
})
