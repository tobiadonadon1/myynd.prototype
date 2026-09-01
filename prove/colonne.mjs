import { attacca, pausa } from './guida.mjs'
const p = await attacca()
await p.valuta(`window.__guai=null`); await p.ascoltaGuai()
const api = (via, opz) => p.valuta(`
  const r = await fetch(${JSON.stringify(via)}, Object.assign({ headers: { authorization: 'Bearer sviluppo-non-in-produzione', 'content-type':'application/json' } }, ${JSON.stringify(opz ?? {})}))
  return await r.json()`)

// clicco la casella «bozza» della prima riga
const cella = (riga, quale) => p.valuta(`
  const li = [...document.querySelectorAll('li')].find(e => e.innerText.includes(${JSON.stringify(riga)}))
  if (!li) return null
  const b = [...li.querySelectorAll('button[role="radio"]')]
  const e = b[${quale}]
  const r = e.getBoundingClientRect()
  return { x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2), etichetta: e.getAttribute('aria-label') }
`)

const c = await cella('richiamare lo studio', 1)
console.log('casella:', c?.etichetta)
await p.clic(c.x, c.y); await pausa(1200)
let s = (await api('/api/compiti')).compiti.find(x => /richiamare/.test(x.testo))
console.log('dopo il clic su «bozza»: stato =', s.stato, '· modo =', s.modo, s.stato === 'delegato' && s.modo === 'bozza' ? '✓' : '✗')

console.log('\n— torno su «io» —')
const c0 = await cella('richiamare lo studio', 0)
await p.clic(c0.x, c0.y); await pausa(1200)
s = (await api('/api/compiti')).compiti.find(x => /richiamare/.test(x.testo))
console.log('stato =', s.stato, '· modo =', s.modo, s.stato === 'aperto' && s.modo === 'io' ? '✓' : '✗')

console.log('\n— «tutto» —')
const c2 = await cella('mandare il preventivo', 2)
await p.clic(c2.x, c2.y); await pausa(1200)
s = (await api('/api/compiti')).compiti.find(x => /preventivo/.test(x.testo))
console.log('stato =', s.stato, '· modo =', s.modo, s.modo === 'tutto' ? '✓' : '✗')

console.log('\n— svuoto oggi per vedere il pungolo —')
for (const x of (await api('/api/compiti')).compiti.filter(c => c.quando === 'oggi')) {
  await api('/api/compiti/' + x.id + '/richiama', { method: 'POST' }).catch(()=>{})
  await api('/api/compiti/' + x.id + '/chiudi', { method: 'POST', body: JSON.stringify({ esito: 'fatta' }) })
}
await pausa(1200)
console.log(await p.valuta(`return document.body.innerText`))
console.log('errori:', (await p.guai()).length || 'nessuno')
await p.scatto(process.argv[2])
p.chiudi(); process.exit(0)
