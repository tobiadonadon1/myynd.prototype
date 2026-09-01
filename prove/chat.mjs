import { attacca, pausa } from './guida.mjs'
const p = await attacca()
await p.valuta(`
  const a = [...document.querySelectorAll('a')].find(e => /^(Chat)$/.test(e.innerText.trim()))
  a?.click(); return 1
`)
await pausa(1200)
console.log('— la schermata della chat —')
console.log(await p.valuta(`return document.body.innerText.split('\\n').filter(Boolean).slice(4,10).join('\\n')`))
console.log('\n— la frase «ho letto N documenti» —')
console.log(await p.valuta(`
  const t = document.body.innerText
  return /I have read|Ho letto \\d/.test(t) ? 'ANCORA LÌ' : 'tolta ✓'
`))
await p.scatto(process.argv[2])
// la finestra torna a essere quello che deve essere
await p.valuta(`location.href = 'http://127.0.0.1:5173/#oggi'; return 1`)
await pausa(2000)
p.chiudi(); process.exit(0)
