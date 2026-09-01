import { attacca, pausa } from './guida.mjs'
const p = await attacca()
const api = (via, opz) => p.valuta(`
  const r = await fetch(${JSON.stringify(via)}, Object.assign({ headers: { authorization: 'Bearer sviluppo-non-in-produzione', 'content-type':'application/json' } }, ${JSON.stringify(opz ?? {})}))
  return { stato: r.status, corpo: await r.json() }`)

const l = (await api('/api/compiti')).corpo.compiti
const m = l.find(c => /Gemini|documento|map|lever/i.test(c.testo)) ?? l[0]
console.log('delego:', m.testo)
await api('/api/compiti/' + m.id + '/delega', { method: 'POST' })
for (let i = 0; i < 40; i++) {
  await pausa(3000)
  const c = (await api('/api/compiti')).corpo.compiti.find(x => x.id === m.id)
  if (c?.stato !== 'delegato') {
    console.log('stato:', c?.stato, '· dopo ~' + (i+1)*3 + 's')
    if (c?.guaio) console.log('GUAIO:', c.guaio)
    if (c?.risultato) {
      console.log('fonti:', (c.fonti ?? []).map(f => f.label).join(' · ') || 'nessuna')
      const quadre = (c.risultato.match(/\[\d+\]/g) ?? [])
      const corpo = c.risultato.split('\n\n').slice(0, -1).join('\n\n')
      const quadreNelCorpo = (corpo.match(/\[\d+\]/g) ?? []).length
      console.log('citazioni totali:', quadre.length, '· dentro il corpo della cosa:', quadreNelCorpo)
      console.log('--- la bozza ---')
      console.log(c.risultato.slice(0, 900))
    }
    break
  }
}
p.chiudi()
