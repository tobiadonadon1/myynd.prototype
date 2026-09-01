// Aggiungo una riga «dall'app» e guardo se il sito se ne accorge senza ricaricare.
import { attacca, pausa } from './guida.mjs'
const p = await attacca()
await p.valuta(`localStorage.setItem('mind2do.giro','fatto'); return 1`)
const api = (via, opz) => p.valuta(`
  const r = await fetch(${JSON.stringify(via)}, Object.assign({ headers: { authorization: 'Bearer sviluppo-non-in-produzione', 'content-type':'application/json' } }, ${JSON.stringify(opz ?? {})}))
  return await r.json()`)

await p.valuta(`location.href='http://127.0.0.1:5173/'; return 1`); await pausa(3500)
const conta = () => p.valuta(`
  const t = document.body.innerText
  const m = t.match(/Mind2Do[\\s\\S]{0,40}?(\\d+)\\s*(documents|documenti)/i)
  return m ? m[1] : null
`)
await p.valuta(`
  const a = [...document.querySelectorAll('a,div')].find(e => /^(Sources|Connettori)$/.test(e.innerText?.trim()))
  a?.click(); return 1`)
await pausa(900)
console.log('prima :', await conta(), 'documenti in Mind2Do')

await api('/api/compiti', { method: 'POST', body: JSON.stringify({ testo: 'una riga nata nell\'app', quando: 'oggi' }) })
await pausa(1800)
console.log('dopo  :', await conta(), 'documenti — senza aver ricaricato')

await p.valuta(`location.href='http://127.0.0.1:5173/#oggi'; return 1`); await pausa(1500)
p.chiudi(); process.exit(0)
