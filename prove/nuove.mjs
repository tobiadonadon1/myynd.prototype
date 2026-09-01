import { attacca, pausa, trova } from './guida.mjs'
const p = await attacca()
await p.valuta(`window.__guai = null`); await p.ascoltaGuai()
const nota = console.log

const api = (via, opz) => p.valuta(`
  const r = await fetch(${JSON.stringify(via)}, Object.assign({ headers: { authorization: 'Bearer sviluppo-non-in-produzione', 'content-type':'application/json' } }, ${JSON.stringify(opz ?? {})}))
  return await r.json()
`)

nota('— parto pulito —')
const l0 = await api('/api/compiti')
for (const c of [...l0.compiti, ...l0.chiusi]) await api('/api/compiti/' + c.id, { method: 'DELETE' })
await p.valuta(`location.reload(); return 1`); await pausa(2500)

nota('\n— aggiungo due righe —')
let b = await p.cliccabili()
const campo = b.find(e => e.tag === 'input' && /da fare|needs doing/i.test(e.testo))
await p.clic(campo.x, campo.y); await p.scrivi('comprare il latte'); await p.tasto('Enter'); await pausa(600)
await p.scrivi('scrivere a Marta'); await p.tasto('Enter'); await pausa(600)

nota('\n— i tre secchi ci sono tutti? —')
const secchi = await p.valuta(`
  return [...document.querySelectorAll('div')]
    .filter(e => /^(TODAY|THIS WEEK|SOONER OR LATER|OGGI|QUESTA SETTIMANA|PRIMA O POI)$/.test(e.innerText?.trim()))
    .map(e => e.innerText.trim())
`)
nota('   ' + (secchi.length === 3 ? '✓ ' : '✗ ') + secchi.join(' · '))

nota('\n— il secchio vuoto è un bersaglio di rilascio? —')
const zona = await p.valuta(`
  const e = [...document.querySelectorAll('div')].find(x => /nothing here|niente qui/.test(x.innerText?.trim()))
  if (!e) return null
  const st = getComputedStyle(e); const r = e.getBoundingClientRect()
  return { bordo: st.borderStyle, alto: Math.round(r.height) }
`)
nota(zona ? `   ✓ c'è, tratteggiato (${zona.bordo}), alto ${zona.alto}px` : '   ✗ manca')

nota('\n— clic sul testo: si può cambiare la riga? —')
const testo = await p.valuta(`
  const e = [...document.querySelectorAll('span')].find(x => x.innerText?.trim() === 'comprare il latte')
  if (!e) return null
  const r = e.getBoundingClientRect()
  return { x: Math.round(r.x + 30), y: Math.round(r.y + r.height/2) }
`)
if (!testo) nota('   ✗ non trovo il testo')
else {
  await p.clic(testo.x, testo.y); await pausa(400)
  const campi = await p.valuta(`return [...document.querySelectorAll('input')].map(e => e.value)`)
  nota(campi.includes('comprare il latte') ? '   ✓ diventa modificabile' : '   ✗ non si apre: ' + JSON.stringify(campi))

  const bott = await p.cliccabili()
  nota('   bottoni disponibili: ' + bott.filter(e => /Today|This week|Sooner|detail|Never mind|Salva|Save/i.test(e.testo)).map(e => e.testo).join(' · '))

  // cambio testo e secchio
  await p.tasto('Backspace'); await p.scrivi('X')
  const sett = trova(await p.cliccabili(), 'This week') ?? trova(await p.cliccabili(), 'Questa settimana')
  const dentroModifica = (await p.cliccabili()).filter(e => /This week|Questa settimana/i.test(e.testo))
  if (dentroModifica.length > 1) { await p.clic(dentroModifica[1].x, dentroModifica[1].y); await pausa(200) }
  const salva = trova(await p.cliccabili(), 'Salva') ?? trova(await p.cliccabili(), 'Save')
  if (salva) { await p.clic(salva.x, salva.y); await pausa(800) }
  const t = await p.testo()
  nota(/comprare il lattX|comprare il latt/.test(t) ? '   ✓ il testo cambiato è salvato' : '   ✗ non salvato')
}

nota('\n— aggiungo un dettaglio —')
const stato2 = await api('/api/compiti')
nota('   righe: ' + stato2.compiti.map(c => `${c.quando}/${c.testo}`).join(' · '))

nota('\n— richiamo una delega —')
const marta = stato2.compiti.find(c => /Marta/.test(c.testo))
if (marta) {
  await api('/api/compiti/' + marta.id + '/delega', { method: 'POST' })
  await pausa(900)
  const r = await p.valuta(`
    const e = [...document.querySelectorAll('div')].find(x => x.innerText?.trim().startsWith('scrivere a Marta'))
    if (!e) return null
    const b = e.getBoundingClientRect()
    return { x: Math.round(b.x + 40), y: Math.round(b.y + 16) }
  `)
  if (r) {
    await p.passaSopra(r.x, r.y); await pausa(300)
    const rich = trova(await p.cliccabili(), 'take it back') ?? trova(await p.cliccabili(), 'richiamalo')
    if (!rich) nota('   ✗ nessun modo di richiamarla')
    else {
      await p.clic(rich.x, rich.y); await pausa(1000)
      const dopo = await api('/api/compiti')
      const m = dopo.compiti.find(c => /Marta/.test(c.testo))
      nota(m?.stato === 'aperto' ? '   ✓ tornata aperta' : '   ✗ stato: ' + m?.stato)
    }
  }
}

nota('\n— errori —')
const g = await p.guai()
nota(g.length ? g.map(x => '   ✗ ' + x).join('\n') : '   ✓ nessuno')
await p.scatto(process.argv[2] ?? '/tmp/nuove.png')
p.chiudi()
