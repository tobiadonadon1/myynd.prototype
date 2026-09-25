// L'Aiuto dice il vero sulle etichette (P5): ogni {{chiave}} dei paragrafi è
// in ETICHETTE, e ogni etichetta è una frase che una schermata mostra davvero
// (un t('…') in un file che non sia l'Aiuto stesso). Un bottone rinominato
// senza aggiornare l'Aiuto è un test rosso, non una frase che mente.
//
//   node --test src/aiuto-etichette.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = new URL('.', import.meta.url).pathname
const AIUTO = readFileSync(join(SRC, 'screens', 'Aiuto.tsx'), 'utf8')

function file(d: string, out: string[] = []): string[] {
  for (const n of readdirSync(d)) {
    const p = join(d, n)
    if (statSync(p).isDirectory()) file(p, out)
    else if (/\.tsx?$/.test(n) && !n.endsWith('.test.ts') && n !== 'Aiuto.tsx' && n !== 'lingua.ts') out.push(p)
  }
  return out
}

const blocco = AIUTO.slice(AIUTO.indexOf('const ETICHETTE'), AIUTO.indexOf('\n}\n', AIUTO.indexOf('const ETICHETTE')))
const ETICHETTE = new Map([...blocco.matchAll(/^\s+(\w+): \(\) => t\((['"])(.+?)\2\)/gm)].map(m => [m[1]!, m[3]!]))

test('ogni {{chiave}} dell’Aiuto è un’etichetta', () => {
  const usate = new Set([...AIUTO.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]!))
  const mancano = [...usate].filter(k => !ETICHETTE.has(k))
  assert.deepEqual(mancano, [])
})

test('ogni etichetta è una frase che una schermata mostra', () => {
  const sorgenti = file(SRC).map(p => readFileSync(p, 'utf8')).join('\n')
  const morte = [...ETICHETTE].filter(([, frase]) => !sorgenti.includes(`t('${frase}')`) && !sorgenti.includes(`t("${frase}")`) && !sorgenti.includes(`'${frase}'`) && !sorgenti.includes(`"${frase}"`))
  assert.deepEqual(morte.map(([k, f]) => `${k}: ${f}`), [])
})

test('Come lavori e Il tuo ritratto sono due titoli diversi', () => {
  assert.equal(ETICHETTE.get('comeLavori'), 'Come lavori')
  assert.equal(ETICHETTE.get('ilTuoRitratto'), 'Il tuo ritratto')
})
