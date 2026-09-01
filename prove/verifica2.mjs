import { attacca, pausa } from './guida.mjs'
const p = await attacca()
await p.valuta(`window.__guai=null`); await p.ascoltaGuai()
await p.valuta(`localStorage.setItem('mind2do.giro','fatto'); return 1`)
const api = (via, opz) => p.valuta(`
  const r = await fetch(${JSON.stringify(via)}, Object.assign({ headers: { authorization: 'Bearer sviluppo-non-in-produzione', 'content-type':'application/json' } }, ${JSON.stringify(opz ?? {})}))
  return await r.json()`)

console.log('— il sito: nessuna parola italiana dov\'era —')
await p.valuta(`location.href='http://127.0.0.1:5173/'; return 1`); await pausa(3500)
const t1 = await p.testo()
const italiane = ['posta ·', 'Posta ·', 'documenti letti', 'collegato', 'Da decidere', 'Da leggere', 'Già gestito', 'Altro']
console.log('  parole italiane a schermo:', italiane.filter(w => t1.includes(w)).join(', ') || 'nessuna ✓')
console.log('  testata:', t1.split('\n').filter(Boolean).slice(4,7).join(' / '))

console.log('\n— le fonti —')
await p.valuta(`
  const a = [...document.querySelectorAll('a,div')].find(e => /^(Sources|Connettori)$/.test(e.innerText?.trim()))
  a?.click(); return 1`)
await pausa(400)
await p.valuta(`
  const b = [...document.querySelectorAll('div')].find(e => e.innerText?.trim() === 'Myynd')
  return 1`)
const fonti = await api('/api/stato')
console.log('  attive:', fonti.connettori.filter(c=>c.collegato).map(c=>c.nome).join(', '))

console.log('\n— la lista —')
await p.valuta(`location.href='http://127.0.0.1:5173/#oggi'; return 1`); await pausa(3000)
console.log((await p.testo()).split('\n').filter(Boolean).slice(0,8).join('\n'))
console.log('\nerrori:', (await p.guai()).length || 'nessuno')
await p.scatto(process.argv[2])
p.chiudi(); process.exit(0)
