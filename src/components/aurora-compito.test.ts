// La riga su cui Myynd lavora: la posa dura quanto dice il CSS, e finisce
// prima che la lista smetta di tenere ferma la riga appena finita.
//
// Il componente importa un foglio di stile e disegna JSX, due cose che Node
// non sa caricare: il gancio qui sotto traduce il `.tsx` e risponde al foglio
// con un modulo vuoto.
//
//   node --test src/components/aurora-compito.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import * as ts from 'typescript'

const componente = new URL('./AuroraCompito.tsx', import.meta.url).href
const ganci = registerHooks({
  load(url, contesto, poi) {
    if (url.endsWith('.css')) return { format: 'module', shortCircuit: true, source: 'export default {}' }
    if (url !== componente) return poi(url, contesto)
    const sorgente = readFileSync(new URL(url), 'utf8')
    return {
      format: 'module',
      shortCircuit: true,
      source: ts.transpileModule(sorgente, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX }
      }).outputText
    }
  }
})
const { DURATA_POSA_MS } = await import('./AuroraCompito.tsx')
ganci.deregister()

const css = readFileSync(new URL('./aurora-compito.css', import.meta.url), 'utf8')
const useCompiti = readFileSync(new URL('../oggi/useCompiti.ts', import.meta.url), 'utf8')

test('la posa dura nel CSS quanto dice il componente', () => {
  const m = /\.task-aurora\[data-fase="finita"\] \{ animation: aurora-si-posa ([\d.]+)s/.exec(css)
  assert.ok(m, 'la regola della posa non c’è')
  assert.equal(Number(m[1]) * 1000, DURATA_POSA_MS)
})

test('la posa finisce prima che la lista lasci salire la riga finita', () => {
  const m = /const FERMA_MS = (\d+)/.exec(useCompiti)
  assert.ok(m)
  assert.ok(DURATA_POSA_MS < Number(m[1]), `posa ${DURATA_POSA_MS} ms, riga ferma ${m[1]} ms`)
})

test('niente più righe verticali: nessuna tela, nessuna striscia ripetuta', () => {
  assert.doesNotMatch(css, /repeating-linear-gradient/)
  const sorgente = readFileSync(new URL('./AuroraCompito.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(sorgente, /<canvas/)
})
