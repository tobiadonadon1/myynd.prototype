// Il riassunto del banco: la quota di lavori mandabili così come sono, il voto
// medio, per genere, e i difetti che tornano. Legge i JSON di banco.ts.
//
//   node prove/banco/riassunto.mjs uscita-alex.json uscita-chiara.json

import { readFileSync } from 'node:fs'

const esiti = process.argv.slice(2).flatMap(f => JSON.parse(readFileSync(f, 'utf8')).esiti.map(e => ({ ...e, cliente: JSON.parse(readFileSync(f, 'utf8')).cliente })))
const giudicati = esiti.filter(e => e.giudizio?.punteggio)
const media = xs => xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : '-'
const mandabili = giudicati.filter(e => e.giudizio.mandabile).length
console.log(`Lavori: ${esiti.length} · giudicati ${giudicati.length} · mandabili così ${mandabili}/${giudicati.length} (${Math.round(100 * mandabili / Math.max(1, giudicati.length))}%) · voto medio ${media(giudicati.map(e => e.giudizio.punteggio))}`)
for (const tipo of [...new Set(esiti.map(e => e.tipo))]) {
  const g = giudicati.filter(e => e.tipo === tipo)
  console.log(`  ${tipo}: ${g.filter(e => e.giudizio.mandabile).length}/${g.length} mandabili · voto ${media(g.map(e => e.giudizio.punteggio))}`)
}
const conta = {}
for (const e of giudicati) for (const c of e.giudizio.categorie ?? []) conta[c] = (conta[c] ?? 0) + 1
console.log('Difetti:', Object.entries(conta).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(' · ') || 'nessuno')
const raccolte = esiti.filter(e => e.cercato?.length).length
console.log(`Raccolta prima di scrivere: ${raccolte}/${esiti.length} lavori`)
for (const e of giudicati.filter(e => !e.giudizio.mandabile)) console.log(`- [${e.cliente} ${e.i}] ${e.giudizio.punteggio} · ${e.testo}: ${(e.giudizio.problemi ?? []).slice(0, 2).join(' | ')}`)
for (const e of esiti.filter(e => !e.giudizio?.punteggio)) console.log(`- [${e.cliente} ${e.i}] senza giudizio · ${e.stato} · ${e.testo}${e.guaio ? ` · ${JSON.stringify(e.guaio).slice(0, 120)}` : ''}`)
