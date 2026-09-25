// Niente lineette nelle frasi che si leggono (P5): «—» e «–» non stanno nel
// testo dell'interfaccia, nei valori inglesi del dizionario, nei dati e
// nell'Aiuto. Si guarda l'albero di TypeScript, non il testo del file: un
// commento con una lineetta (i segni delle fondamenta) non conta.
//
//   node --test src/senza-lineette.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

const SRC = new URL('.', import.meta.url).pathname
const LINEETTA = /[—–]/

function file(d: string, out: string[] = []): string[] {
  for (const n of readdirSync(d)) {
    const p = join(d, n)
    if (statSync(p).isDirectory()) file(p, out)
    else if (/\.tsx?$/.test(n) && !n.endsWith('.test.ts')) out.push(p)
  }
  return out
}

const testoDi = (n: ts.Node): string | null =>
  ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) ? n.text
    : ts.isTemplateExpression(n) ? [n.head.text, ...n.templateSpans.map(s => s.literal.text)].join('')
    : null

/** Le frasi da leggere in un file: testo JSX, argomenti di t(), e in certi file tutte le stringhe dove serve. */
export function frasiConLineette(percorso: string, sorgente: string): string[] {
  const f = ts.createSourceFile(percorso, sorgente, ts.ScriptTarget.Latest, true, percorso.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const nome = percorso.split('/').pop()!
  const tutto = nome === 'data.ts' || nome === 'Aiuto.tsx'
  const trovate: string[] = []
  const guarda = (n: ts.Node) => {
    if (ts.isJsxText(n) && LINEETTA.test(n.text)) trovate.push(n.text.trim())
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 't') {
      const s = n.arguments[0] && testoDi(n.arguments[0])
      if (s && LINEETTA.test(s)) trovate.push(s)
    }
    // il dizionario: i valori inglesi, e le frasi con un numero (entrambe le lingue)
    if (nome === 'lingua.ts' && ts.isPropertyAssignment(n)) {
      const s = testoDi(n.initializer)
      if (s && LINEETTA.test(s)) trovate.push(s)
    }
    if (nome === 'lingua.ts' && (ts.isTemplateExpression(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isStringLiteral(n)) && ts.isConditionalExpression(n.parent)) {
      const s = testoDi(n)
      if (s && LINEETTA.test(s)) trovate.push(s)
    }
    if (tutto) {
      const s = testoDi(n)
      if (s && LINEETTA.test(s)) trovate.push(s)
    }
    ts.forEachChild(n, guarda)
  }
  guarda(f)
  return [...new Set(trovate)]
}

test('controcaso: una lineetta in un commento non conta, una nel testo sì', () => {
  assert.deepEqual(frasiConLineette('x.tsx', '// — P5: inizio —\nconst a = 1 /* – */'), [])
  assert.deepEqual(frasiConLineette('x.tsx', "const e = <p>Una — due</p>"), ['Una — due'])
  assert.deepEqual(frasiConLineette('x.tsx', "t('a — b')"), ['a — b'])
})

test('nessuna lineetta nelle frasi che si leggono', () => {
  const colpevoli: string[] = []
  for (const p of file(SRC)) {
    for (const s of frasiConLineette(p, readFileSync(p, 'utf8'))) colpevoli.push(`${p.slice(SRC.length)} · ${s.slice(0, 90)}`)
  }
  console.log(`senza-lineette · ${colpevoli.length} frasi con una lineetta`)
  assert.deepEqual(colpevoli, [])
})
