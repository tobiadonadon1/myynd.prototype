import { attacca, pausa } from './guida.mjs'
const p = await attacca()
await p.valuta(`window.__guai=null`); await p.ascoltaGuai()
const api = (via, opz) => p.valuta(`
  const r = await fetch(${JSON.stringify(via)}, Object.assign({ headers: { authorization: 'Bearer sviluppo-non-in-produzione', 'content-type':'application/json' } }, ${JSON.stringify(opz ?? {})}))
  return await r.json()`)
const l0 = await api('/api/compiti')
for (const c of [...l0.compiti, ...l0.chiusi]) await api('/api/compiti/' + c.id, { method: 'DELETE' })
for (const [t, q] of [['richiamare lo studio','oggi'], ['mandare il preventivo a Rossi','oggi'], ['rivedere il listino','settimana']]) {
  await api('/api/compiti', { method: 'POST', body: JSON.stringify({ testo: t, quando: q }) })
}
await p.valuta(`location.reload(); return 1`); await pausa(2500)
console.log('— la zona di trascinamento della finestra —')
console.log(await p.valuta(`
  const r = document.body.firstElementChild
  return { radice: getComputedStyle(r).webkitAppRegion,
           lista: getComputedStyle(document.querySelector('ul') ?? r).webkitAppRegion,
           campo: getComputedStyle(document.querySelector('input').closest('div')).webkitAppRegion }
`))
console.log('\n— le colonne —')
console.log(await p.valuta(`return document.body.innerText`))
await p.scatto(process.argv[2])
console.log('\nerrori:', (await p.guai()).length || 'nessuno')
p.chiudi()
