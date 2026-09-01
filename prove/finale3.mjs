import { attacca, pausa } from './guida.mjs'
const p = await attacca()
await pausa(2500)
const api = (via, opz) => p.valuta(`
  const r = await fetch(${JSON.stringify(via)}, Object.assign({ headers: { authorization: 'Bearer sviluppo-non-in-produzione', 'content-type':'application/json' } }, ${JSON.stringify(opz ?? {})}))
  return await r.json()`)
const rettDi = async (sel) => p.valuta(`
  const e = ${sel}
  if (!e) return null
  const r = e.getBoundingClientRect()
  return { x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2) }`)

console.log('— A · il feed dice la verità —')
let t = await p.testo()
const testata = t.split('\n').filter(Boolean)[4] ?? ''
console.log('  testata:', JSON.stringify(t.match(/(One thing to do\.|Nothing needs you[^\n]*|.*to do\.)/)?.[0] ?? testata))
console.log('  «Nothing left»:', /Nothing left|Read now/.test(t) ? '✗ ancora lì' : 'sparito ✓')
console.log('  filo vivo dentro la riga:', await p.valuta(`
  const v = document.querySelector('.vivo')
  if (!v) return '✗'
  const st = getComputedStyle(v)
  return st.position === 'absolute' && st.animationName === 'vivo' ? '✓' : st.position`))

console.log('\n— B · il fuoco: cambio, salvo, ricarico —')
let c = await rettDi(`[...document.querySelectorAll('div')].filter(e => /^TO\\nTobia · CEO$/.test(e.innerText?.trim())).sort((a,b)=>a.innerText.length-b.innerText.length)[0]`)
await p.clic(c.x, c.y); await pausa(900)
c = await rettDi(`[...document.querySelectorAll('div')].filter(e => /^(Preferences|Preferenze)$/.test(e.innerText?.trim())).sort((a,b)=>a.outerHTML.length-b.outerHTML.length)[0]`)
if (!c) { console.log('  ✗ non trovo la voce Preferenze'); process.exit(1) }
await p.clic(c.x, c.y); await pausa(1200)
const campi = await p.valuta(`return [...document.querySelectorAll('input')].map(e=>e.value)`)
console.log('  campo del fuoco all\'arrivo:', JSON.stringify(campi[0]))
console.log('  card rimaste:', await p.valuta(`
  return [...document.querySelectorAll('div')].map(e=>e.innerText?.trim()).filter(x=>/^(WHAT I FOCUS ON|SU COSA MI CONCENTRO|AUTONOMIA|AUTONOMY|TONO|TONE|MOVIMENTO|MOVEMENT|QUANTO RESTANO|HOW LONG)/.test(x||'')).map(x=>x.split('\\n')[0])`))
// scrivo il fuoco nuovo dentro il campo vero
c = await rettDi(`[...document.querySelectorAll('input')][0]`)
await p.clic(c.x, c.y)
await p.valuta(`
  const i = [...document.querySelectorAll('input')][0]
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); return 1`)
await p.scrivi('SOLO le fatture di settembre')
c = await rettDi(`[...document.querySelectorAll('button')].find(e => /^(Salva|Save)$/.test(e.innerText.trim()))`)
await p.clic(c.x, c.y); await pausa(1500)
console.log('  sul server dopo Salva:', (await api('/api/feed/fuoco')).fuoco)
await p.valuta(`location.reload(); return 1`); await pausa(3200)
c = await rettDi(`[...document.querySelectorAll('div')].filter(e => /^TO\\nTobia · CEO$/.test(e.innerText?.trim())).sort((a,b)=>a.innerText.length-b.innerText.length)[0]`)
await p.clic(c.x, c.y); await pausa(900)
c = await rettDi(`[...document.querySelectorAll('div')].filter(e => /^(Preferences|Preferenze)$/.test(e.innerText?.trim())).sort((a,b)=>a.outerHTML.length-b.outerHTML.length)[0]`)
await p.clic(c.x, c.y); await pausa(1200)
console.log('  nel campo dopo il ricaricamento:', JSON.stringify(await p.valuta(`return [...document.querySelectorAll('input')][0]?.value`)))

console.log('\n— C · le fatte stanno nella scheda To do —')
c = await rettDi(`[...document.querySelectorAll('a')].find(e => /To do|Da fare/.test(e.innerText))`)
await p.clic(c.x, c.y); await pausa(1000)
t = await p.testo()
console.log('  «Done · n» in fondo alla lista:', /Done · \d|Fatte · \d/.test(t) ? '✓ c\'è' : '✗')
await p.scatto(process.argv[2])
p.chiudi(); process.exit(0)
