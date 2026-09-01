import { attacca } from './guida.mjs'
const p = await attacca()
const punti = await p.valuta(`
  const dove = [[400,12],[400,44],[60,300],[700,300],[400,700]]
  return dove.map(([x,y]) => {
    const e = document.elementFromPoint(x,y)
    let r = '—', n = e
    while (n) { if (n.style?.webkitAppRegion) { r = n.style.webkitAppRegion; break } n = n.parentElement }
    return { punto: x+','+y, elemento: e?.tagName.toLowerCase(), regione: r }
  })
`)
for (const q of punti) console.log(' ', q.punto.padEnd(9), q.elemento?.padEnd(6), q.regione)
p.chiudi(); process.exit(0)
