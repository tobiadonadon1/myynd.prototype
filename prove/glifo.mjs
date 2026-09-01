import { attacca, pausa } from './guida.mjs'
const p = await attacca()
const api = (via, opz) => p.valuta(`
  const r = await fetch(${JSON.stringify(via)}, Object.assign({ headers: { authorization: 'Bearer sviluppo-non-in-produzione', 'content-type':'application/json' } }, ${JSON.stringify(opz ?? {})}))
  return await r.json()`)
const l = await api('/api/compiti')
let c = l.compiti[0]
if (!c) { const r = await api('/api/compiti', { method: 'POST', body: JSON.stringify({ testo: 'una prova lunga da fare', quando: 'oggi' }) }); c = { id: r.id } }
await api('/api/compiti/' + c.id + '/delega', { method: 'POST', body: JSON.stringify({ modo: 'tutto' }) })
await pausa(1400)
const box = await p.valuta(`
  const s = document.querySelector('li button[role="radio"] svg')
  if (!s) return null
  const r = s.getBoundingClientRect()
  return { x: Math.round(r.x-16), y: Math.round(r.y-16), w: Math.round(r.width+32), h: Math.round(r.height+32) }
`)
console.log('glifo:', box)
if (box) {
  const { data } = await p.manda('Page.captureScreenshot', { format: 'png',
    clip: { x: box.x, y: box.y, width: box.w, height: box.h, scale: 7 } })
  const { writeFileSync } = await import('node:fs')
  writeFileSync(process.argv[2], Buffer.from(data, 'base64'))
  console.log('ingrandito')
}
p.chiudi(); process.exit(0)
