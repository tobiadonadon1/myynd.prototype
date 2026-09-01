import { attacca, pausa, trova } from './guida.mjs'
const p = await attacca(9223)
await pausa(1200)
console.log('1. accesso:', await p.valuta(`
  return [...document.querySelectorAll('button')].map(e=>e.innerText.trim()).filter(Boolean)`))
// mi registro come farebbe lui
const campi = await p.valuta(`
  return [...document.querySelectorAll('input')].map(e => { const r = e.getBoundingClientRect()
    return { x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2), tipo: e.type } })`)
await p.clic(campi[0].x, campi[0].y); await p.scrivi('papa@esempio.it')
await p.clic(campi[1].x, campi[1].y); await p.scrivi('unapassword')
const b = trova(await p.cliccabili(), 'Crea') ?? trova(await p.cliccabili(), 'accesso')
if (b) { await p.clic(b.x, b.y); await pausa(2500) }
console.log('\n2. dopo la registrazione:')
console.log((await p.testo()).split('\n').filter(Boolean).slice(0,10).join('\n'))
console.log('\n   bottoni:', await p.valuta(`
  return [...document.querySelectorAll('button')].map(e=>e.innerText.trim()).filter(Boolean).slice(0,8)`))
await p.scatto(process.argv[2])
p.chiudi(); process.exit(0)
