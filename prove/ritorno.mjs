import { attacca, pausa } from './guida.mjs'
const p = await attacca()
await pausa(2000)
await p.valuta(`localStorage.setItem('mind2do.giro','fatto'); return 1`)
await p.valuta(`location.href='http://127.0.0.1:5173/'; return 1`); await pausa(3500)
let t = await p.testo()
console.log('— appena caricato —')
console.log(t.includes('arrange FunctionHealth') ? '  ✓ la riga dell\'app è nel feed' : '  ✗ non c\'è')
// simulo: scrivi nell'app (altro processo), poi torni sul sito
const api = (via, opz) => p.valuta(`
  const r = await fetch(${JSON.stringify(via)}, Object.assign({ headers: { authorization: 'Bearer sviluppo-non-in-produzione', 'content-type':'application/json' } }, ${JSON.stringify(opz ?? {})}))
  return await r.json()`)
// scrivo direttamente in banca dati come farebbe l'ALTRO server: senza annuncio
const r = await api('/api/compiti', { method: 'POST', body: JSON.stringify({ testo: 'scritta mentre guardavi altrove', quando: 'oggi' }) })
await pausa(600)
// il ritorno sulla finestra
await p.valuta(`window.dispatchEvent(new Event('focus')); return 1`)
await pausa(1200)
t = await p.testo()
console.log('— dopo il ritorno sulla finestra —')
console.log(t.includes('scritta mentre guardavi altrove') ? '  ✓ rilegge da sola al ritorno' : '  ✗ non rilegge')
// dov'è la card? sopra il resto?
const posizioni = await p.valuta(`
  const t = document.body.innerText
  return { lista: t.indexOf('MYYND2DO'), resto: t.indexOf('TO READ') }
`)
console.log('  card a', posizioni.lista, '· resto a', posizioni.resto,
  posizioni.lista > 0 && (posizioni.resto === -1 || posizioni.lista < posizioni.resto) ? '✓ la lista sta sopra' : '✗')
await api('/api/compiti/' + r.id, { method: 'DELETE' })
await p.valuta(`location.href='http://127.0.0.1:5173/#oggi'; return 1`); await pausa(1500)
await p.scatto(process.argv[2])
p.chiudi(); process.exit(0)
