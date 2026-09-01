import { attacca, pausa } from './guida.mjs'
const p = await attacca()
// chiudo la bozza e guardo la struttura sotto
await p.valuta(`
  const e = [...document.querySelectorAll('button')].find(x => /draft ready|bozza pronta/.test(x.innerText))
  e?.click(); return 1
`)
await pausa(600)
await p.valuta(`window.scrollTo(0, 400); document.querySelector('div[style*="overflow"]')?.scrollTo(0,400); return 1`)
await pausa(500)
await p.scatto(process.argv[2])
console.log(await p.testo())
p.chiudi()
