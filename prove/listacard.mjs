import { attacca, pausa } from './guida.mjs'
const p = await attacca()
await pausa(2000)
await p.valuta(`localStorage.setItem('mind2do.giro','fatto'); return 1`)
const api = (via, opz) => p.valuta(`
  const r = await fetch(${JSON.stringify(via)}, Object.assign({ headers: { authorization: 'Bearer sviluppo-non-in-produzione', 'content-type':'application/json' } }, ${JSON.stringify(opz ?? {})}))
  return await r.json()`)
// una riga scritta «dall'app»
const r = await api('/api/compiti', { method: 'POST', body: JSON.stringify({ testo: 'prova del ponte fra le due facce', quando: 'oggi' }) })
// guardo il SITO (la schermata Myynd), non la lista
await p.valuta(`location.href='http://127.0.0.1:5173/'; return 1`); await pausa(3500)
const t = await p.testo()
console.log('— la card Myynd2Do nel feed —')
console.log(t.includes('MYYND2DO') || t.includes('Myynd2Do') ? '  ✓ la sezione c\'è' : '  ✗ manca')
console.log(t.includes('prova del ponte') ? '  ✓ la riga dell\'app si vede nel feed' : '  ✗ la riga NON si vede')
// e se ne aggiungo un'altra, il sito si aggiorna da solo?
await api('/api/compiti', { method: 'POST', body: JSON.stringify({ testo: 'seconda riga, senza ricaricare', quando: 'oggi' }) })
await pausa(1500)
const t2 = await p.testo()
console.log(t2.includes('seconda riga, senza ricaricare') ? '  ✓ si aggiorna da solo, senza ricaricare' : '  ✗ serve ricaricare')
// il conto dei documenti non si muove aggiungendo compiti
const st = await api('/api/stato')
console.log('  documenti totali:', st.conteggi.totale, '· Myynd2Do come fonte:', st.connettori.find(c=>c.id==='mind2do')?.nome)
// pulizia
for (const c of (await api('/api/compiti')).compiti.filter(x => /prova del ponte|seconda riga/.test(x.testo))) {
  await api('/api/compiti/' + c.id, { method: 'DELETE' })
}
await p.scatto(process.argv[2])
p.chiudi(); process.exit(0)
