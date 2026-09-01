import { attacca, pausa } from './guida.mjs'
const p = await attacca()
const api = (via, opz) => p.valuta(`
  const r = await fetch(${JSON.stringify(via)}, Object.assign({ headers: { authorization: 'Bearer sviluppo-non-in-produzione', 'content-type':'application/json' } }, ${JSON.stringify(opz ?? {})}))
  return await r.json()`)
const l0 = await api('/api/compiti')
for (const c of [...l0.compiti, ...l0.chiusi]) await api('/api/compiti/' + c.id, { method: 'DELETE' })
for (const [t, q] of [['richiamare lo studio notarile','oggi'], ['mandare il preventivo a Rossi','oggi'], ['rivedere il listino 2027','settimana'], ['pensare al sito nuovo','poi']]) {
  await api('/api/compiti', { method: 'POST', body: JSON.stringify({ testo: t, quando: q }) })
}
const r = (await api('/api/compiti')).compiti.find(c => /Rossi/.test(c.testo))
await api('/api/compiti/' + r.id + '/delega', { method: 'POST', body: JSON.stringify({ modo: 'bozza' }) })
await p.valuta(`location.reload(); return 1`); await pausa(2500)
// apro il menù dei comandi per farlo vedere
const campo = (await p.cliccabili()).find(e => e.tag === 'input')
await p.clic(campo.x, campo.y); await p.scrivi('/'); await pausa(500)
await p.scatto(process.argv[2])
console.log('fatto')
p.chiudi(); process.exit(0)
