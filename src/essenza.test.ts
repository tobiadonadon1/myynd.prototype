// L'essenza di una bozza, separata dal resto.
//
//   node --test src/essenza.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { primoParagrafo } from './essenza.ts'

test('si ferma alla prima riga vuota', () => {
  assert.equal(
    primoParagrafo('Il succo in due righe.\n\nGentile Rossi,\nquesto è il resto della bozza.'),
    'Il succo in due righe.'
  )
})

test('senza una riga vuota torna tutto il testo, con gli a capo spianati', () => {
  assert.equal(primoParagrafo('Un paragrafo solo,\nspezzato su due righe.'), 'Un paragrafo solo, spezzato su due righe.')
})

test('leviga gli spazi di apertura e chiusura', () => {
  assert.equal(primoParagrafo('\n\n  Il succo.  \n\nIl resto.'), 'Il succo.')
})

test('una riga vuota fatta di soli spazi conta come vuota', () => {
  assert.equal(primoParagrafo('Il succo.\n   \nIl resto.'), 'Il succo.')
})

test('il testo vuoto torna vuoto', () => {
  assert.equal(primoParagrafo(''), '')
})
