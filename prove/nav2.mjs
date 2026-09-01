import { attacca, pausa } from './guida.mjs'
const p = await attacca()
await pausa(1500)
const r = await p.valuta(`
  const t = [...document.querySelectorAll('div')].filter(e => e.innerText?.trim() === 'Tobia · CEO' || /^TO\\nTobia · CEO$/.test(e.innerText?.trim()))
  t.sort((a,b)=>a.innerText.length-b.innerText.length)
  const b = t[0]?.getBoundingClientRect()
  return b ? { x: Math.round(b.x+b.width/2), y: Math.round(b.y+b.height/2) } : null
`)
console.log('riquadro account:', r)
await p.clic(r.x, r.y); await pausa(700)
const voci = await p.valuta(`
  return [...document.querySelectorAll('div')].map(e=>e.innerText?.trim()).filter(x=>x && x.length<16 && /(Preferen|Mappa|Map|Connettori|Sources|Esci|Sign)/.test(x)).slice(0,8)
`)
console.log('voci del menù:', voci)
if (voci.length) {
  const pr = await p.valuta(`
    const v = [...document.querySelectorAll('div')].filter(e => /^(Preferences|Preferenze)$/.test(e.innerText?.trim()))
    v.sort((a,b)=>a.innerText.length-b.innerText.length)
    const b = v[0]?.getBoundingClientRect()
    return b ? { x: Math.round(b.x+b.width/2), y: Math.round(b.y+b.height/2) } : null
  `)
  await p.clic(pr.x, pr.y); await pausa(1000)
  console.log('schermata ora:', await p.valuta(`return [...document.querySelectorAll('div')].find(e=>/34px/.test(getComputedStyle(e).fontSize))?.innerText ?? document.body.innerText.split('\\n')[7]`))
  console.log('campi:', await p.valuta(`return [...document.querySelectorAll('input')].map(e=>e.placeholder||e.value).slice(0,3)`))
}
await p.scatto(process.argv[2])
p.chiudi(); process.exit(0)
