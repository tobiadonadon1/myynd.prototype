import { attacca, pausa } from './guida.mjs'
const p = await attacca()
await p.valuta(`window.__guai = null`)
await p.ascoltaGuai()
// passo sopra ogni bottone: è lì che nasceva l'avviso
const bott = await p.cliccabili()
for (const b of bott) { await p.passaSopra(b.x, b.y) }
await pausa(500)
const g = await p.guai()
console.log(g.length ? g : '✓ nessun avviso passando sopra a tutti i ' + bott.length + ' bersagli')
p.chiudi()
