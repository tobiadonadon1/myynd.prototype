import { attacca, pausa } from './guida.mjs'
const p = await attacca()
await p.valuta(`[...document.querySelectorAll('a')].find(e => /Myynd/.test(e.innerText))?.click(); return 1`)
await pausa(1200)
await p.scatto(process.argv[2])
console.log('fatto')
p.chiudi(); process.exit(0)
