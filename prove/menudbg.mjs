import { attacca, pausa } from './guida.mjs'
const p = await attacca()
await pausa(2000)
const c = await p.valuta(`
  const t = [...document.querySelectorAll('div')].filter(e => /^TO\\nTobia · CEO$/.test(e.innerText?.trim()))
  const b = t[0]?.getBoundingClientRect()
  return b ? { x: Math.round(b.x+b.width/2), y: Math.round(b.y+b.height/2), quanti: t.length } : { quanti: t.length }`)
console.log('account:', c)
await p.clic(c.x, c.y)
for (const attesa of [200, 600, 1200]) {
  await pausa(attesa)
  console.log(`dopo +${attesa}ms:`, await p.valuta(`
    return [...document.querySelectorAll('div')]
      .map(e=>e.innerText?.trim()).filter(x=>x && x.length<14)
      .filter(x=>/Prefer|Map|Sources|Sign|Esci|Conn/.test(x)).slice(0,6)`))
}
p.chiudi(); process.exit(0)
