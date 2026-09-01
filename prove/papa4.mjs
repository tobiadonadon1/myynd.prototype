import { attacca, pausa, trova } from './guida.mjs'
const p = await attacca(9223)
const avanti = async (etichette) => {
  for (const e of etichette) {
    const b = trova(await p.cliccabili(), e)
    if (b) { await p.clic(b.x, b.y); await pausa(1400); return true }
  }
  return false
}
for (let i = 0; i < 9; i++) {
  const t = (await p.testo()).split('\n').filter(Boolean)
  console.log(`\n— schermata ${i+1} —`)
  console.log('  ' + t.slice(0, 6).join('\n  '))
  const bott = await p.valuta(`return [...document.querySelectorAll('button')].map(e=>e.innerText.trim()).filter(Boolean).slice(0,6)`)
  console.log('  bottoni:', bott.join(' · '))
  const campi = await p.valuta(`return [...document.querySelectorAll('input')].map(e=>e.placeholder||e.type).slice(0,5)`)
  if (campi.length) console.log('  campi:', campi.join(' · '))
  if (!await avanti(['Cominciamo', 'Lo collego dopo', 'Avanti', 'Salta', 'Skip', 'Continua', 'Vai'])) break
}
await p.scatto(process.argv[2])
p.chiudi(); process.exit(0)
