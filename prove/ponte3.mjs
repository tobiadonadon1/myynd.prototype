import { attacca, pausa } from './guida.mjs'
const p = await attacca()
await p.valuta(`location.href='http://127.0.0.1:5173/'; return 1`); await pausa(3500)
// conto le riletture dello stato
await p.valuta(`
  window.__stati = 0
  const vero = window.fetch
  window.fetch = (...a) => { if (String(a[0]).includes('/api/stato')) window.__stati++; return vero(...a) }
  return true
`)
const api = (via, opz) => p.valuta(`
  const r = await fetch(${JSON.stringify(via)}, Object.assign({ headers: { authorization: 'Bearer sviluppo-non-in-produzione', 'content-type':'application/json' } }, ${JSON.stringify(opz ?? {})}))
  return await r.json()`)

console.log('riletture prima:', await p.valuta(`return window.__stati`))
const r = await api('/api/compiti', { method: 'POST', body: JSON.stringify({ testo: 'nata nell\'app', quando: 'oggi' }) })
await pausa(1600)
const dopo = await p.valuta(`return window.__stati`)
console.log('riletture dopo aver aggiunto una riga:', dopo, dopo > 1 ? '✓ il sito se n\'è accorto' : '✗ non se n\'è accorto')

// e il conto della fonte è cambiato davvero?
const st = await api('/api/stato')
console.log('Mind2Do:', st.connettori.find(c => c.id === 'mind2do').documenti, 'documenti')
await api('/api/compiti/' + r.id, { method: 'DELETE' })
await p.valuta(`location.href='http://127.0.0.1:5173/#oggi'; return 1`); await pausa(1500)
p.chiudi(); process.exit(0)
