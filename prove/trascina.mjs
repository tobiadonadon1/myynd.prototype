// Il trascinamento verso il basso: quello che finiva sempre un posto più giù.
import { attacca, pausa } from './guida.mjs'
const p = await attacca()
await p.valuta(`window.__guai=null`); await p.ascoltaGuai()
const api = (via, opz) => p.valuta(`
  const r = await fetch(${JSON.stringify(via)}, Object.assign({ headers: { authorization: 'Bearer sviluppo-non-in-produzione', 'content-type':'application/json' } }, ${JSON.stringify(opz ?? {})}))
  return await r.json()`)

const l0 = await api('/api/compiti')
for (const c of [...l0.compiti, ...l0.chiusi]) await api('/api/compiti/' + c.id, { method: 'DELETE' })
for (const t of ['A', 'B', 'C', 'D']) {
  await api('/api/compiti', { method: 'POST', body: JSON.stringify({ testo: t, quando: 'oggi' }) })
}
await p.valuta(`location.reload(); return 1`); await pausa(2500)

const ordine = async () => (await api('/api/compiti')).compiti.filter(c => c.quando === 'oggi').map(c => c.testo).join('')
console.log('partenza:', await ordine())

// il trascinamento vero: HTML5 drag non si simula bene col mouse sintetico,
// quindi si chiama la stessa strada che chiama il gestore del rilascio
const trascina = (chi, primaDi) => p.valuta(`
  const l = await fetch('/api/compiti', { headers:{authorization:'Bearer sviluppo-non-in-produzione'} }).then(r=>r.json())
  const righe = l.compiti.filter(c => c.quando === 'oggi')
  const id = righe.find(c => c.testo === ${JSON.stringify(chi)}).id
  const i = ${primaDi === null ? 'righe.length' : `righe.findIndex(c => c.testo === ${JSON.stringify(primaDi)})`}
  // la stessa aritmetica del gestore, per provarla dov'è
  const senza = righe.filter(r => r.id !== id)
  const mio = righe.findIndex(r => r.id === id)
  const j = mio >= 0 && mio < i ? i - 1 : i
  const sopra = j > 0 ? (senza[j-1]?.id ?? null) : null
  const sotto = senza[j]?.id ?? null
  const res = await fetch('/api/compiti/' + id + '/sposta', {
    method: 'POST', headers: { authorization: 'Bearer sviluppo-non-in-produzione', 'content-type': 'application/json' },
    body: JSON.stringify({ sopra, sotto, quando: 'oggi' })
  })
  return (await res.json()).ok ?? 'errore'
`)

const casi = [
  ['A', 'C', 'BACD'],   // giù di uno
  ['A', null, 'BCDA'],  // in fondo
  ['D', 'B', 'BDCA'],   // su
  ['B', null, 'DCAB']
]
for (const [chi, primaDi, atteso] of casi) {
  await trascina(chi, primaDi)
  const dopo = await ordine()
  console.log(`  ${chi} → ${primaDi ?? 'fondo'}: ${dopo} ${dopo === atteso ? '✓' : '✗ atteso ' + atteso}`)
}
console.log('errori:', (await p.guai()).length || 'nessuno')
p.chiudi()
