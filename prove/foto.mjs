import { attacca, pausa } from './guida.mjs'
const p = await attacca()
const api = (via, opz) => p.valuta(`
  const r = await fetch(${JSON.stringify(via)}, Object.assign({ headers: { authorization: 'Bearer sviluppo-non-in-produzione', 'content-type':'application/json' } }, ${JSON.stringify(opz ?? {})}))
  return await r.json()`)
// una scena vera: una fatta, una in lavorazione, una pronta, una normale
const l = await api('/api/compiti')
for (const c of [...l.compiti, ...l.chiusi]) await api('/api/compiti/' + c.id, { method: 'DELETE' })
for (const [t, q] of [['richiamare lo studio notarile','oggi'], ['rivedere il listino 2027','settimana'], ['pensare al sito nuovo','poi']]) {
  await api('/api/compiti', { method: 'POST', body: JSON.stringify({ testo: t, quando: q }) })
}
const g = await api('/api/compiti', { method: 'POST', body: JSON.stringify({ testo: 'riassumere il documento Gemini', quando: 'oggi' }) })
await api('/api/compiti/' + g.id + '/delega', { method: 'POST' })
await api('/api/feed/fuoco', { method: 'POST', body: JSON.stringify({ testo: 'questa settimana solo i preventivi' }) })
await p.valuta(`location.reload(); return 1`); await pausa(3000)
for (let i = 0; i < 30; i++) {
  await pausa(3000)
  if (/draft ready|bozza pronta/.test(await p.testo())) break
}
await pausa(1200)
await p.scatto(process.argv[2])
console.log('fatto')
p.chiudi()
