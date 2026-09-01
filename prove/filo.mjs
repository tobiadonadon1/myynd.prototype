import { attacca, pausa } from './guida.mjs'
const p = await attacca()
const api = (via, opz) => p.valuta(`
  const r = await fetch(${JSON.stringify(via)}, Object.assign({ headers: { authorization: 'Bearer sviluppo-non-in-produzione', 'content-type':'application/json' } }, ${JSON.stringify(opz ?? {})}))
  return await r.json()`)

// mi metto in ascolto del filo dalla pagina stessa
await p.valuta(`
  window.__eventi = []
  const es = new EventSource('/api/compiti/flusso?t=sviluppo-non-in-produzione')
  es.onmessage = e => window.__eventi.push(e.data)
  window.__es = es
  return true
`)
await pausa(700)

const l = await api('/api/compiti')
const m = l.compiti[0]
console.log('delego:', m.testo, '(stato', m.stato + ')')
await api('/api/compiti/' + m.id + '/delega', { method: 'POST' })
await pausa(2000)

console.log('eventi ricevuti:', await p.valuta(`return window.__eventi`))
console.log('stato server ora:', (await api('/api/compiti')).compiti.find(c => c.id === m.id)?.stato)
console.log('la pagina mostra:', await p.valuta(`
  return /working on it|ci sta lavorando/.test(document.body.innerText) ? 'lavorazione' : 'NIENTE'
`))
await p.valuta(`window.__es.close(); return 1`)
p.chiudi()
