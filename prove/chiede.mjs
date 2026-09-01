import { attacca, pausa } from './guida.mjs'
const p = await attacca()
await p.valuta(`window.__guai=null`); await p.ascoltaGuai()
const api = (via, opz) => p.valuta(`
  const r = await fetch(${JSON.stringify(via)}, Object.assign({ headers: { authorization: 'Bearer sviluppo-non-in-produzione', 'content-type':'application/json' } }, ${JSON.stringify(opz ?? {})}))
  return await r.json()`)
const l0 = await api('/api/compiti')
for (const c of [...l0.compiti, ...l0.chiusi]) await api('/api/compiti/' + c.id, { method: 'DELETE' })
// il giro non deve mettersi in mezzo alla prova
await p.valuta(`localStorage.setItem('mind2do.giro','fatto'); return 1`)

const r = await api('/api/compiti', { method: 'POST', body: JSON.stringify({ testo: 'mandare una mail a mio padre', quando: 'oggi' }) })
await api('/api/compiti/' + r.id + '/delega', { method: 'POST', body: JSON.stringify({ modo: 'tutto' }) })
await p.valuta(`location.reload(); return 1`); await pausa(2500)

console.log('— aspetto —')
let c
for (let i = 0; i < 30; i++) {
  await pausa(3000)
  c = (await api('/api/compiti')).compiti.find(x => x.id === r.id)
  if (c && c.stato !== 'delegato') break
}
console.log('   stato:', c?.stato, c?.stato === 'chiede' ? '✓ CHIEDE, non finge di aver fatto' : '✗ dice ' + c?.stato)
console.log('   ha detto:', (c?.risultato ?? '').slice(0, 240))
await pausa(900)
console.log('\n— cosa vede a schermo —')
console.log((await p.testo()).split('\n').filter(Boolean).slice(0, 8).join('\n'))
console.log('\n— c\'è il campo per rispondere? —')
console.log(await p.valuta(`
  const i = [...document.querySelectorAll('input')].find(e => /Answer|Rispondi/.test(e.getAttribute('aria-label')||''))
  return i ? 'sì ✓' : 'NO'
`))
console.log('errori:', (await p.guai()).length || 'nessuno')
await p.scatto(process.argv[2])
p.chiudi(); process.exit(0)
