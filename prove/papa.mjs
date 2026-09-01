import { attacca, pausa } from './guida.mjs'
const p = await attacca(9223)
await pausa(1500)
console.log('— la prima schermata, installazione pulita —')
console.log((await p.testo()).split('\n').filter(Boolean).slice(0,12).join('\n'))
console.log('\n— cosa gli si chiede —')
console.log(await p.valuta(`
  return [...document.querySelectorAll('input,button')].map(e =>
    (e.placeholder || e.innerText || e.type || '').trim()).filter(Boolean).slice(0,10)
`))
await p.scatto(process.argv[2])
p.chiudi(); process.exit(0)
