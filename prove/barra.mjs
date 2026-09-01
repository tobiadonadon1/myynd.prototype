import { attacca, pausa } from './guida.mjs'
const p = await attacca()
await p.valuta(`window.__guai=null`); await p.ascoltaGuai()
const api = (via, opz) => p.valuta(`
  const r = await fetch(${JSON.stringify(via)}, Object.assign({ headers: { authorization: 'Bearer sviluppo-non-in-produzione', 'content-type':'application/json' } }, ${JSON.stringify(opz ?? {})}))
  return await r.json()`)
const l0 = await api('/api/compiti')
for (const c of [...l0.compiti, ...l0.chiusi]) await api('/api/compiti/' + c.id, { method: 'DELETE' })
await p.valuta(`location.reload(); return 1`); await pausa(2500)

const campo = (await p.cliccabili()).find(e => e.tag === 'input')
await p.clic(campo.x, campo.y)

console.log('— apro il menù con «/» —')
await p.scrivi('/')
await pausa(400)
console.log(await p.valuta(`
  const m = document.querySelector('[role="listbox"]')
  if (!m) return 'NESSUN MENÙ'
  return [...m.querySelectorAll('[role="option"]')].map(e => e.innerText.replace(/\\n/g,' · '))
`))

console.log('\n— filtro con «/sett» —')
await p.scrivi('sett'); await pausa(300)
console.log(await p.valuta(`
  const m = document.querySelector('[role="listbox"]')
  return m ? [...m.querySelectorAll('[role="option"]')].map(e => e.innerText.split('\\n')[0]) : 'NESSUNO'
`))

console.log('\n— invio: applica e pulisce —')
await p.tasto('Enter'); await pausa(300)
console.log('campo:', JSON.stringify(await p.valuta(`return document.querySelector('input').value`)))
console.log('etichetta:', await p.valuta(`
  const s = [...document.querySelectorAll('span')].filter(e => /This week|Questa settimana/.test(e.innerText.trim()) && e.innerText.trim().length < 20)
  return s.length ? s[0].innerText.trim() : 'nessuna'
`))

console.log('\n— scrivo e aggiungo —')
await p.scrivi('rivedere il listino'); await p.tasto('Enter'); await pausa(900)
let l = await api('/api/compiti')
console.log('riga:', l.compiti.map(c => c.quando + '/' + c.testo).join(' · '))

console.log('\n— «/tutto» aggiunge e affida in un gesto —')
await p.scrivi('/tutto'); await pausa(300); await p.tasto('Enter'); await pausa(200)
await p.scrivi('riassumere il documento Gemini'); await p.tasto('Enter'); await pausa(1400)
l = await api('/api/compiti')
const g = l.compiti.find(c => /Gemini/.test(c.testo))
console.log('stato:', g?.stato, '· modo:', g?.modo, g?.modo === 'tutto' ? '✓' : '✗')

console.log('\nerrori:', (await p.guai()).length || 'nessuno')
await p.scatto(process.argv[2])
p.chiudi(); process.exit(0)
