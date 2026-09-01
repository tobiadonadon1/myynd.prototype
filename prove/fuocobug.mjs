import { attacca, pausa } from './guida.mjs'
const p = await attacca()
await pausa(2000)
// vado in Preferenze dal menù dell'account
await p.valuta(`
  const tutti = [...document.querySelectorAll('div')].filter(e => e.innerText?.trim().includes('Tobia'))
  tutti.sort((a,b) => a.innerText.length - b.innerText.length)
  tutti[0]?.click(); return tutti[0]?.innerText.slice(0,30)`)
await pausa(600)
await p.valuta(`
  const voci = [...document.querySelectorAll('div')].filter(e => /^(Preferences|Preferenze)$/.test(e.innerText?.trim()))
  voci.sort((a,b) => a.innerText.length - b.innerText.length)
  voci[0]?.click(); return 1`)
await pausa(1000)
console.log('— schermata:', await p.valuta(`return document.querySelector('h1,div')?.innerText?.slice(0,40) ?? ''`))
// il campo del fuoco
const campo = await p.valuta(`
  const i = [...document.querySelectorAll('input')].find(e => /preventivi|focus|concentr/i.test(e.placeholder || '') || true)
  if (!i) return null
  const r = i.getBoundingClientRect()
  return { x: Math.round(r.x+20), y: Math.round(r.y+r.height/2), valore: i.value, ph: i.placeholder }
`)
console.log('— campo:', JSON.stringify(campo))
// svuoto e scrivo un fuoco nuovo
await p.clic(campo.x, campo.y)
await p.valuta(`
  const i = [...document.querySelectorAll('input')][0]
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(i, 'SOLO le fatture di settembre')
  i.dispatchEvent(new Event('input', { bubbles: true }))
  return i.value`)
await pausa(300)
// premo Salva
await p.valuta(`
  const b = [...document.querySelectorAll('button')].find(e => /^(Salva|Save)$/.test(e.innerText.trim()))
  b?.click(); return b?.innerText`)
await pausa(1200)
const api = (via) => p.valuta(`return await (await fetch(${JSON.stringify(via)}, { headers: { authorization: 'Bearer sviluppo-non-in-produzione' } })).json()`)
console.log('— sul server dopo Salva:', (await api('/api/feed/fuoco')).fuoco)
// ricarico e torno in preferenze
await p.valuta(`location.reload(); return 1`); await pausa(3000)
console.log('— sul server dopo il ricaricamento:', (await api('/api/feed/fuoco')).fuoco)
await p.valuta(`
  const tutti = [...document.querySelectorAll('div')].filter(e => e.innerText?.trim().includes('Tobia'))
  tutti.sort((a,b) => a.innerText.length - b.innerText.length)
  tutti[0]?.click(); return 1`); await pausa(600)
await p.valuta(`
  const voci = [...document.querySelectorAll('div')].filter(e => /^(Preferences|Preferenze)$/.test(e.innerText?.trim()))
  voci.sort((a,b) => a.innerText.length - b.innerText.length)
  voci[0]?.click(); return 1`); await pausa(1000)
console.log('— nel campo dopo il ricaricamento:', await p.valuta(`return [...document.querySelectorAll('input')][0]?.value`))
p.chiudi(); process.exit(0)
