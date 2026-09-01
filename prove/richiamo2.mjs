import { attacca, pausa } from './guida.mjs'
const p = await attacca()
const api = (via, opz) => p.valuta(`
  const r = await fetch(${JSON.stringify(via)}, Object.assign({ headers: { authorization: 'Bearer sviluppo-non-in-produzione', 'content-type':'application/json' } }, ${JSON.stringify(opz ?? {})}))
  return await r.json()`)

let l = await api('/api/compiti')
let m = l.compiti.find(c => c.stato === 'delegato')
if (!m) { m = l.compiti[0]; await api('/api/compiti/' + m.id + '/delega', { method: 'POST' }); await pausa(1500) }
console.log('riga delegata:', m.testo)

const box = await p.valuta(`
  const s = [...document.querySelectorAll('span')].find(e => e.innerText?.trim() === ${JSON.stringify(m.testo)})
  if (!s) return null
  const r = s.getBoundingClientRect()
  return { x: Math.round(r.x + 20), y: Math.round(r.y + r.height/2) }
`)
await p.passaSopra(box.x, box.y)
await pausa(400)
const bott = await p.valuta(`return [...document.querySelectorAll('button')].map(e => e.innerText).filter(Boolean)`)
console.log('bottoni:', bott)

const ok = bott.some(b => /take it back|richiamalo/i.test(b))
console.log(ok ? '✓ il richiamo c\'è' : '✗ il richiamo NON c\'è')

if (ok) {
  const c = await p.valuta(`
    const e = [...document.querySelectorAll('button')].find(x => /take it back|richiamalo/i.test(x.innerText))
    const r = e.getBoundingClientRect()
    return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }
  `)
  await p.clic(c.x, c.y); await pausa(1200)
  const dopo = (await api('/api/compiti')).compiti.find(x => x.id === m.id)
  console.log(dopo?.stato === 'aperto' ? '✓ tornata aperta, e senza bozza' : '✗ stato: ' + dopo?.stato)
  console.log('risultato scritto lo stesso?', dopo?.risultato ? '✗ SÌ — la bozza è comparsa comunque' : '✓ no')
  // e dopo che il modello finisce, non deve scriverla lo stesso
  console.log('aspetto 20s per vedere se la bozza arriva comunque…')
  await pausa(20000)
  const tardi = (await api('/api/compiti')).compiti.find(x => x.id === m.id)
  console.log(tardi?.risultato ? '✗ la bozza è arrivata dopo il richiamo' : '✓ niente bozza: il richiamo ha tenuto')
  console.log('stato finale:', tardi?.stato)
}
p.chiudi()
