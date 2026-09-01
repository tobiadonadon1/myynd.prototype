import { attacca, pausa } from './guida.mjs'
const p = await attacca()
const api = (via, opz) => p.valuta(`
  const r = await fetch(${JSON.stringify(via)}, Object.assign({ headers: { authorization: 'Bearer sviluppo-non-in-produzione', 'content-type':'application/json' } }, ${JSON.stringify(opz ?? {})}))
  return await r.json()`)

const l = await api('/api/compiti')
const m = l.compiti.find(c => /Marta/.test(c.testo)) ?? l.compiti[0]
console.log('compito:', m.testo, '· stato server:', m.stato)

if (m.stato !== 'delegato') { await api('/api/compiti/' + m.id + '/delega', { method: 'POST' }); await pausa(1200) }

console.log('stato in pagina:', await p.valuta(`
  const t = document.body.innerText
  return /working on it|ci sta lavorando/.test(t) ? 'mostra lavorazione' : 'NON mostra lavorazione'
`))

// dove sta esattamente la riga
const box = await p.valuta(`
  const spans = [...document.querySelectorAll('span')].filter(e => e.innerText?.trim() === ${JSON.stringify(m.testo)})
  if (!spans.length) return { trovato: false, campione: document.body.innerText.slice(0,200) }
  const r = spans[0].getBoundingClientRect()
  return { trovato: true, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
`)
console.log('riquadro del testo:', box)
if (!box.trovato) { p.chiudi(); process.exit(0) }

await p.passaSopra(box.x + 20, box.y + box.h / 2)
await pausa(400)
console.log('bottoni dopo il passaggio del mouse:')
console.log(await p.valuta(`
  return [...document.querySelectorAll('button')].map(e => e.innerText).filter(Boolean)
`))
p.chiudi()
