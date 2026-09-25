// La frase del passo della lettura (P10), in italiano e in inglese.
//
//   node --test src/lettura-passo.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'

;(globalThis as unknown as { document: unknown }).document = { documentElement: { lang: '' } }
const { impostaLingua } = await import('./lingua.ts')
const { testoPasso } = await import('./lettura-passo.ts')

const tutte = () => [
  testoPasso(null), testoPasso({ passo: 'arrivato', n: null }), testoPasso({ passo: 'scelgo', n: 1 }),
  testoPasso({ passo: 'scelgo', n: 38 }), testoPasso({ passo: 'ordine', n: null }), testoPasso({ passo: 'fonti', n: null }),
  testoPasso({ passo: 'progetti', n: null })
]

test('ogni passo in italiano', () => {
  impostaLingua('it')
  assert.deepEqual(tutte(), [
    'Guardo cosa è arrivato', 'Guardo cosa è arrivato', 'Scelgo cosa conta in un documento',
    'Scelgo cosa conta fra 38 documenti', 'Metto in ordine', 'Aggiorno le fonti', 'Guardo i tuoi progetti'
  ])
})

test('ogni passo in inglese, senza lineette', () => {
  impostaLingua('en')
  const en = tutte()
  assert.deepEqual(en, [
    'Looking at what came in', 'Looking at what came in', 'Choosing what matters in one document',
    'Choosing what matters among 38 documents', 'Putting it in order', 'Refreshing your sources', 'Looking at your projects'
  ])
  for (const s of en) assert.ok(!/[—–]/.test(s), s)
  // «scelgo» senza numero non inventa un numero
  assert.equal(testoPasso({ passo: 'scelgo', n: null }), 'Looking at what came in')
  impostaLingua('it')
})
