import { attacca, pausa } from './guida.mjs'
const p = await attacca()
await p.valuta(`window.__guai=null`); await p.ascoltaGuai()
await p.valuta(`location.href='http://127.0.0.1:5173/'; return 1`); await pausa(3500)
const b = await p.valuta(`
  const e = [...document.querySelectorAll('div')].find(x => /^(Open the document|Apri il documento)$/.test(x.innerText?.trim()))
  if (!e) return null
  const r = e.getBoundingClientRect()
  return { x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2) }
`)
console.log('bottone «apri il documento»:', b ? 'trovato' : 'assente')
if (b) {
  await p.clic(b.x, b.y); await pausa(1200)
  const esito = await p.valuta(`
    const t = document.body.innerText
    if (/can't find that document|Non trovo più il documento/.test(t)) return 'ERRORE: non lo trova'
    // il documento si apre in un foglio: cerco il titolo grande e il corpo
    const sheet = [...document.querySelectorAll('div')].find(x => x.innerText?.length > 400 && /\\.md|\\.pdf|deck|brief/i.test(x.innerText.slice(0,120)))
    return sheet ? 'APERTO: ' + sheet.innerText.slice(0,110).replace(/\\n/g,' / ') : 'niente di riconoscibile'
  `)
  console.log(esito)
}
console.log('errori:', (await p.guai()).length || 'nessuno')
await p.scatto(process.argv[2])
await p.valuta(`location.href='http://127.0.0.1:5173/#oggi'; return 1`); await pausa(1500)
p.chiudi(); process.exit(0)
