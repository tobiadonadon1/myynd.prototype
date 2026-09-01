import { attacca, pausa, trova } from './guida.mjs'
const p = await attacca()
await p.valuta(`window.__guai=null`); await p.ascoltaGuai()
await p.valuta(`localStorage.removeItem('mind2do.giro'); location.reload(); return 1`)
await pausa(3000)
console.log('— il giro si apre da solo la prima volta —')
console.log(await p.valuta(`return document.querySelector('[role="dialog"]') ? 'sì ✓' : 'NO'`))
console.log('\n— i cinque passi —')
for (let i = 0; i < 5; i++) {
  const t = await p.valuta(`
    const d = document.querySelector('[role="dialog"]')
    return d ? d.innerText.split('\\n').slice(0,2).join(' — ') : null
  `)
  console.log(`   ${i+1}. ${t}`)
  if (i === 2) {
    // provo a premere le colonne dentro il giro
    const c = await p.valuta(`
      const d = document.querySelector('[role="dialog"]')
      const b = [...d.querySelectorAll('button')].filter(e => e.offsetHeight === 28)
      if (b.length < 3) return null
      const r = b[2].getBoundingClientRect()
      return { x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2) }
    `)
    if (c) { await p.clic(c.x, c.y); await pausa(400)
      console.log('      · premuta la terza colonna →', await p.valuta(`
        const d = document.querySelector('[role="dialog"]')
        return d.innerText.split('\\n').pop().trim().slice(0,60)`)) }
  }
  const avanti = trova(await p.cliccabili(), 'Next') ?? trova(await p.cliccabili(), 'Avanti') ?? trova(await p.cliccabili(), 'Got it') ?? trova(await p.cliccabili(), 'Ho capito')
  if (avanti) { await p.clic(avanti.x, avanti.y); await pausa(600) }
}
console.log('\n— si è chiuso? —', await p.valuta(`return document.querySelector('[role="dialog"]') ? 'NO' : 'sì ✓'`))
console.log('— e non torna al ricaricamento —')
await p.valuta(`location.reload(); return 1`); await pausa(2500)
console.log('  ', await p.valuta(`return document.querySelector('[role="dialog"]') ? 'RITORNA (sbagliato)' : 'no ✓'`))
console.log('errori:', (await p.guai()).length || 'nessuno')
await p.scatto(process.argv[2])
p.chiudi(); process.exit(0)
