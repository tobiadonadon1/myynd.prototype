import { attacca, pausa } from './guida.mjs'
const p = await attacca()
await p.valuta(`location.href='http://127.0.0.1:5173/'; return 1`); await pausa(3500)
await p.valuta(`
  const a = [...document.querySelectorAll('a,div')].find(e => /^(Sources|Connettori)$/.test(e.innerText?.trim()))
  a?.click(); return 1`)
await pausa(900)
console.log(await p.valuta(`return document.body.innerText.slice(0, 700)`))
p.chiudi(); process.exit(0)
