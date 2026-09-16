import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appDocumento, validaDocumento } from './delega-documento.ts'

test('only writing tasks select a native destination; prompt and existing sources do not', () => {
  assert.equal(appDocumento('Write an essay on biodiversity', 'tutto'), 'Pages')
  assert.equal(appDocumento('Scrivi un saggio in Pages sulla biodiversità', 'bozza'), 'Pages')
  assert.equal(appDocumento('Create a memo in TextEdit', 'tutto'), 'TextEdit')
  assert.equal(appDocumento('Write a 700 word essay about gardens', 'tutto'), 'Pages')
  assert.equal(appDocumento('Write a memo in Microsoft Word', 'tutto'), 'Word')
  assert.equal(appDocumento('Read my Pages essay', 'tutto'), null)
  assert.equal(appDocumento('Write an essay in Pages', 'prompt'), null)
  assert.throws(() => validaDocumento({ app: 'TextEdit', titolo: 'A', testo: 'B' }, 'Pages'), /Pages only/)
})

import { pagineDocumento } from './delega-documento.ts'
test('latest explicit page count overrides original brief, including written numbers', () => {
 assert.equal(pagineDocumento('Make it one page. Original task: Write two pages.'), 1)
 assert.equal(pagineDocumento('Portalo a una pagina. Original task: Scrivi 2 pagine.'), 1)
 assert.equal(pagineDocumento('Write a 3-page essay'), 3)
 assert.equal(pagineDocumento('Write an essay'), 0)
})
