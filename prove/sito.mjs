// il sito, non la finestra della lista: la stessa pagina, senza l'ancora #oggi
import { attacca, pausa } from './guida.mjs'
const p = await attacca()
await p.valuta(`location.href = 'http://127.0.0.1:5173/'; return 1`)
await pausa(3500)
console.log('URL:', await p.valuta(`return location.href`))
console.log('\n— la testata —')
console.log(await p.valuta(`return document.body.innerText.split('\\n').slice(0,6).join('\\n')`))
console.log('\n— c\'è ancora la pastiglia del fuoco? —')
console.log(await p.valuta(`
  const t = document.body.innerText
  return /I look here first|Guardo prima|Dimmi su cosa/.test(t) ? 'SÌ, ANCORA LÌ' : 'no, tolta ✓'
`))
console.log('\n— spazio fra data e titolo —')
console.log(await p.valuta(`
  const d = [...document.querySelectorAll('span')].find(e => /August|agosto/.test(e.innerText) && e.innerText.length < 40)
  const h = [...document.querySelectorAll('div')].find(e => getComputedStyle(e).fontSize === '40px')
  if (!d || !h) return 'non trovati'
  const rd = d.getBoundingClientRect(), rh = h.getBoundingClientRect()
  return { data: d.innerText, peso: getComputedStyle(d).fontWeight, stacco: Math.round(rh.top - rd.bottom) + 'px' }
`))
await p.scatto(process.argv[2])
p.chiudi(); process.exit(0)
