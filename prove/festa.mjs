import { attacca, pausa } from './guida.mjs'
const p = await attacca()
await p.valuta(`window.__guai=null`); await p.ascoltaGuai()
const api = (via, opz) => p.valuta(`
  const r = await fetch(${JSON.stringify(via)}, Object.assign({ headers: { authorization: 'Bearer sviluppo-non-in-produzione', 'content-type':'application/json' } }, ${JSON.stringify(opz ?? {})}))
  return await r.json()`)
const l0 = await api('/api/compiti')
for (const c of [...l0.compiti, ...l0.chiusi]) await api('/api/compiti/' + c.id, { method: 'DELETE' })
for (const t of ['una cosa', 'l\'ultima cosa']) {
  await api('/api/compiti', { method: 'POST', body: JSON.stringify({ testo: t, quando: 'oggi' }) })
}
await p.valuta(`location.reload(); return 1`); await pausa(2500)

const spunta = (quale) => p.valuta(`
  const b = [...document.querySelectorAll('button')].filter(e => /^(Fatto|Done):/.test(e.getAttribute('aria-label') || ''))
  const e = b[${quale}]
  if (!e) return null
  const r = e.getBoundingClientRect()
  return { x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2) }
`)

console.log('— spunto la prima: niente festa —')
let s = await spunta(0)
await p.clic(s.x, s.y); await pausa(900)
console.log('   tela dei coriandoli:', await p.valuta(`return document.querySelectorAll('canvas').length`) > 1 ? 'PRESENTE (sbagliato)' : 'assente ✓')

console.log('\n— spunto l\'ultima: festa —')
s = await spunta(0)
await p.clic(s.x, s.y)
await pausa(320)
const tele = await p.valuta(`return [...document.querySelectorAll('canvas')].map(c => ({ w: c.width, h: c.height, z: c.style.zIndex }))`)
console.log('   tele:', JSON.stringify(tele))
await p.scatto(process.argv[2])
console.log('   scatto preso a metà animazione')

await pausa(2200)
console.log('   dopo due secondi:', await p.valuta(`return [...document.querySelectorAll('canvas')].filter(c => c.style.zIndex === '70').length`) ? 'ANCORA LÌ (sbagliato)' : 'sparita ✓')
console.log('\nerrori:', (await p.guai()).length || 'nessuno')
p.chiudi(); process.exit(0)
