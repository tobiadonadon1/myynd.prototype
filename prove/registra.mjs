import { attacca, pausa, trova } from './guida.mjs'
const p = await attacca(9223)
await pausa(1200)
const campi = await p.valuta(`
  return [...document.querySelectorAll('input')].map(e => { const r = e.getBoundingClientRect()
    return { x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2) } })`)
await p.clic(campi[0].x, campi[0].y); await p.scrivi('papa@esempio.it')
await p.clic(campi[1].x, campi[1].y); await p.scrivi('unapassword')
const b = trova(await p.cliccabili(), 'accesso')
await p.clic(b.x, b.y); await pausa(2500)
console.log('dopo la registrazione:', (await p.testo()).split('\n').filter(Boolean).slice(0,3).join(' / '))
p.chiudi(); process.exit(0)
