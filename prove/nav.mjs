import { attacca, pausa } from './guida.mjs'
const p = await attacca()
await pausa(1500)
console.log('candidati account:', await p.valuta(`
  const t = [...document.querySelectorAll('div')].filter(e => e.innerText?.trim().includes('Tobia'))
  t.sort((a,b)=>a.innerText.length-b.innerText.length)
  return t.slice(0,3).map(e => JSON.stringify(e.innerText.trim().slice(0,28)))
`))
await p.valuta(`
  const t = [...document.querySelectorAll('div')].filter(e => e.innerText?.trim().includes('Tobia'))
  t.sort((a,b)=>a.innerText.length-b.innerText.length); t[0]?.click(); return 1`)
await pausa(700)
console.log('menù aperto, voci:', await p.valuta(`
  return [...document.querySelectorAll('div')].map(e=>e.innerText?.trim()).filter(x=>x && /^(Preferences|Preferenze|Map|Mappa|Sources|Connettori|Sign out|Esci)$/.test(x)).slice(0,6)
`))
await p.scatto(process.argv[2])
p.chiudi(); process.exit(0)
