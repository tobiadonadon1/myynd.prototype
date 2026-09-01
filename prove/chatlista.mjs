import { attacca, pausa } from './guida.mjs'
const p = await attacca()
await pausa(1500)
console.log('— dico in chat di segnarmi una cosa —')
const esito = await p.valuta(`
  const r = await fetch('/api/chat/th-prova-lista', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer sviluppo-non-in-produzione' },
    body: JSON.stringify({ testo: 'Segnati in lista che devo comprare il latte, e falla fare a te' })
  })
  const lettore = r.body.getReader(); const dec = new TextDecoder()
  let tutto = ''
  for (;;) { const { done, value } = await lettore.read(); if (done) break; tutto += dec.decode(value) }
  const fini = tutto.split('\\n\\n').filter(x => x.startsWith('data: ')).map(x => JSON.parse(x.slice(6)))
  const fine = fini.find(m => m.fase === 'fine')
  return fine ? fine.messaggi.at(-1)?.text?.slice(0, 160) : tutto.slice(0, 160)
`)
console.log('  risposta:', esito)
await pausa(800)
const l = await p.valuta(`return await (await fetch('/api/compiti', { headers: { authorization: 'Bearer sviluppo-non-in-produzione' } })).json()`)
const c = l.compiti.find(x => /latte/i.test(x.testo))
console.log('  in lista:', c ? `«${c.testo}» · stato ${c.stato} · modo ${c.modo} ✓` : '✗ NON è in lista')
// pulizia
if (c) await p.valuta(`return await (await fetch('/api/compiti/' + ${JSON.stringify(c?.id ?? '')}, { method: 'DELETE', headers: { authorization: 'Bearer sviluppo-non-in-produzione' } })).json()`)
p.chiudi(); process.exit(0)
