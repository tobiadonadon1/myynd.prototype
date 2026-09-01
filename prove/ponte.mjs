// Il ponte fra le due schermate: una voce del feed diventa una riga della lista.
import { attacca, pausa, trova } from './guida.mjs'
const p = await attacca()
await p.valuta(`window.__guai=null`); await p.ascoltaGuai()
const api = (via, opz) => p.valuta(`
  const r = await fetch(${JSON.stringify(via)}, Object.assign({ headers: { authorization: 'Bearer sviluppo-non-in-produzione', 'content-type':'application/json' } }, ${JSON.stringify(opz ?? {})}))
  return { stato: r.status, corpo: await r.json() }`)

let feed = (await api('/api/feed')).corpo
console.log('voci aperte nel feed:', feed.aperti.length)
if (!feed.aperti.length) {
  console.log('ne genero…')
  await api('/api/feed/genera', { method: 'POST' })
  feed = (await api('/api/feed')).corpo
  console.log('adesso:', feed.aperti.length)
}
if (!feed.aperti.length) { console.log('niente feed, salto'); p.chiudi(); process.exit(0) }

const voce = feed.aperti[0]
console.log('promuovo:', voce.titolo.slice(0, 60))

const prima = (await api('/api/compiti')).corpo.compiti.length
const r = await api('/api/compiti', { method: 'POST', body: JSON.stringify({
  testo: voce.titolo, quando: 'oggi', origine: 'feed', voce: voce.id, doc: voce.doc ?? undefined
})})
console.log('risposta:', r.stato)
await pausa(500)

const dopo = (await api('/api/compiti')).corpo.compiti
const nuova = dopo.find(c => c.testo === voce.titolo)
console.log(nuova ? '✓ è in lista' : '✗ non è in lista')
console.log('  origine:', nuova?.origine, '· voce:', nuova?.voce ? 'collegata' : 'no', '· doc:', nuova?.doc ? 'sì' : 'no')

const feedDopo = (await api('/api/feed')).corpo
const ancora = feedDopo.aperti.find(v => v.id === voce.id)
console.log(ancora ? '✗ è ancora aperta anche nel feed (la stessa cosa in due posti)' : '✓ chiusa nel feed: esiste in un posto solo')
const chiusa = feedDopo.fatte.find(v => v.id === voce.id)
console.log('  motivo nel feed:', chiusa?.motivo ?? '—')

console.log('\nerrori:', (await p.guai()).length || 'nessuno')
p.chiudi()
