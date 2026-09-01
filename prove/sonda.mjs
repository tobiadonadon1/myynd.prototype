import { attacca, pausa } from './guida.mjs'
const p = await attacca()
console.log('— tutti i bottoni, col testo esatto —')
console.log(await p.valuta(`
  return [...document.querySelectorAll('button,a')].map(e => {
    const r = e.getBoundingClientRect()
    return { t: JSON.stringify(e.innerText), w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.y) }
  })
`))
console.log('\n— i secchi che esistono a schermo —')
console.log(await p.valuta(`
  return [...document.querySelectorAll('div')]
    .filter(e => /^(TODAY|THIS WEEK|SOONER OR LATER|OGGI|QUESTA SETTIMANA|PRIMA O POI)$/.test(e.innerText?.trim()))
    .map(e => e.innerText.trim())
`))
console.log('\n— testo in pagina —')
console.log((await p.testo()).slice(0, 700))
p.chiudi()
