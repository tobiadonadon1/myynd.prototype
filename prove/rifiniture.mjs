import { attacca, pausa, trova } from './guida.mjs'
const p = await attacca()
await p.valuta(`window.__guai=null`); await p.ascoltaGuai()
const api = (via, opz) => p.valuta(`
  const r = await fetch(${JSON.stringify(via)}, Object.assign({ headers: { authorization: 'Bearer sviluppo-non-in-produzione', 'content-type':'application/json' } }, ${JSON.stringify(opz ?? {})}))
  return await r.json()`)
const l0 = await api('/api/compiti')
for (const c of [...l0.compiti, ...l0.chiusi]) await api('/api/compiti/' + c.id, { method: 'DELETE' })
await api('/api/compiti', { method: 'POST', body: JSON.stringify({ testo: 'mandare il preventivo a Rossi', quando: 'oggi' }) })
await p.valuta(`location.reload(); return 1`); await pausa(2500)

console.log('— i comandi, nella lingua giusta —')
const campo = (await p.cliccabili()).find(e => e.tag === 'input')
await p.clic(campo.x, campo.y); await p.scrivi('/'); await pausa(400)
console.log(await p.valuta(`
  const m = document.querySelector('[role="listbox"]')
  return [...m.querySelectorAll('[role="option"]')].map(e => e.innerText.split('\\n').pop().trim())
`))

console.log('\n— «/today»: la targhetta verde bosco —')
await p.scrivi('today'); await pausa(300); await p.tasto('Enter'); await pausa(400)
console.log(await p.valuta(`
  const s = [...document.querySelectorAll('span')].filter(e => e.innerText.trim() === 'Today' && e.innerText.length < 12)
  if (!s.length) return 'NESSUNA TARGHETTA'
  const st = getComputedStyle(s[s.length-1])
  return { testo: s[s.length-1].innerText, colore: st.color, fondo: st.backgroundColor }
`))
await p.tasto('Escape'); await pausa(200)

console.log('\n— la colonna si chiama Myynd —')
console.log(await p.valuta(`
  return [...document.querySelectorAll('span')].map(e=>e.innerText.trim()).filter(x => ['ME','DRAFT','MYYND','ALL'].includes(x))
`))

console.log('\n— cambio colonna a lavoro in corso: bozza → Myynd —')
const cella = (quale) => p.valuta(`
  const li = [...document.querySelectorAll('li')].find(e => e.innerText.includes('Rossi'))
  const b = [...li.querySelectorAll('button[role="radio"]')][${quale}]
  const r = b.getBoundingClientRect()
  return { x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2) }
`)
let c = await cella(1); await p.clic(c.x, c.y); await pausa(1000)
let s = (await api('/api/compiti')).compiti[0]
console.log('   dopo «bozza»:', s.stato, s.modo)
c = await cella(2); await p.clic(c.x, c.y); await pausa(1400)
s = (await api('/api/compiti')).compiti[0]
console.log('   dopo «Myynd»:', s.stato, s.modo, s.modo === 'tutto' ? '✓ cambiata' : '✗ non è cambiata')

console.log('\nerrori:', (await p.guai()).length || 'nessuno')
await p.scatto(process.argv[2])
p.chiudi(); process.exit(0)
