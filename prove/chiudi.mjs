import { attacca, pausa } from './guida.mjs'
const p = await attacca()
await p.ascoltaGuai()

const stato = () => p.valuta(`
  const r = await fetch('/api/compiti', { headers: { authorization: 'Bearer sviluppo-non-in-produzione' } })
  const d = await r.json()
  return d.compiti.map(c => c.stato + ':' + c.testo.slice(0,32))
`)
console.log('prima :', await stato())

// prendo le coordinate e clicco SUBITO, senza cambiare niente in mezzo
const b = await p.valuta(`
  const e = [...document.querySelectorAll('button')].find(x => /Good as it is|Va bene così/.test(x.innerText))
  if (!e) return null
  const r = e.getBoundingClientRect()
  return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2), testo: e.innerText }
`)
console.log('bottone:', b)
if (b) { await p.clic(b.x, b.y); await pausa(1200) }
console.log('dopo  :', await stato())
console.log('errori:', await p.guai())
p.chiudi()
