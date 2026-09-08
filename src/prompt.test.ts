// Il prompt sotto una riga: quello che si copia e quello che resta a lei.
//
//   node --test src/prompt.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spezzaPrompt } from './oggi/prompt.ts'

test('la riga per lei in fondo si stacca, e non finisce negli appunti', () => {
  const { prompt, nota } = spezzaPrompt(
    'Scrivi un\'email a Rossi.\n\nFonti:\n— [1] Listino 2026: il prezzo\n\nNon ho trovato il preventivo di marzo.\n'
  )
  assert.equal(prompt, 'Scrivi un\'email a Rossi.\n\nFonti:\n— [1] Listino 2026: il prezzo')
  assert.equal(nota, 'Non ho trovato il preventivo di marzo.')
})

test('senza la nota non si taglia niente: il blocco delle fonti resta dentro', () => {
  const testo = 'Scrivi un\'email a Rossi.\n\nFonti:\n— [1] Listino 2026: il prezzo\n— [2] Filo con Rossi: la richiesta'
  assert.deepEqual(spezzaPrompt(testo), { prompt: testo, nota: '' })
})

test('un prompt di un paragrafo solo resta intero', () => {
  assert.deepEqual(spezzaPrompt('Riassumi il contratto in cinque righe.'), { prompt: 'Riassumi il contratto in cinque righe.', nota: '' })
})

test('gli spazi attorno non contano', () => {
  assert.deepEqual(spezzaPrompt('\n\nFai questo.\n\nUna nota.\n\n'), { prompt: 'Fai questo.', nota: 'Una nota.' })
})
