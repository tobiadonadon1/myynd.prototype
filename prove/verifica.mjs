// Il verbale finale: si preme tutto, si guarda tutto, si conta.
import { attacca, pausa, trova } from './guida.mjs'
const p = await attacca()
await p.valuta(`window.__guai=null`); await p.ascoltaGuai()
const nota = console.log
const api = (via, opz) => p.valuta(`
  const r = await fetch(${JSON.stringify(via)}, Object.assign({ headers: { authorization: 'Bearer sviluppo-non-in-produzione', 'content-type':'application/json' } }, ${JSON.stringify(opz ?? {})}))
  return { stato: r.status, corpo: await r.json() }`)

nota('— pulisco —')
const l0 = (await api('/api/compiti')).corpo
for (const c of [...l0.compiti, ...l0.chiusi]) await api('/api/compiti/' + c.id, { method: 'DELETE' })
await p.valuta(`location.reload(); return 1`); await pausa(2500)

nota('\n— la lista vuota dice la cosa giusta —')
let t = await p.testo()
nota(/Nothing on the list|Niente in lista/.test(t) ? '   ✓ «niente in lista»' : '   ✗ ' + t.slice(0,100))
nota(/three buckets|TODAY/.test(t) ? '   · i secchi non si disegnano su lista vuota (giusto)' : '   · ok')

nota('\n— tutti i bersagli sono raggiungibili da tastiera? —')
let b = await p.cliccabili()
nota('   ' + b.length + ' bersagli visibili a lista vuota')

nota('\n— aggiungo tre righe —')
const campo = b.find(e => e.tag === 'input' && /da fare|needs doing/i.test(e.testo))
await p.clic(campo.x, campo.y)
for (const x of ['comprare il latte', 'scrivere a Marta', 'riassumere il documento Gemini']) {
  await p.scrivi(x); await p.tasto('Enter'); await pausa(500)
}

nota('\n— il secchio torna a «oggi» dopo ogni aggiunta? —')
const dove = (await api('/api/compiti')).corpo.compiti.map(c => c.quando)
nota(dove.every(d => d === 'oggi') ? '   ✓ sì, tutte in «oggi»' : '   ✗ ' + dove.join(','))

nota('\n— i bottoni della riga esistono anche senza mouse? —')
const nascosti = await p.valuta(`
  const b = [...document.querySelectorAll('button')].filter(e => /to Myynd|a Myynd/.test(e.innerText))
  return b.map(e => ({ nel_documento: true, opacita: getComputedStyle(e.closest('div[style*="opacity"]') ?? e).opacity }))
`)
nota(nascosti.length ? `   ✓ ${nascosti.length} bottoni «a Myynd» nel documento (opacità ${nascosti[0].opacita}) — raggiungibili col tabulatore` : '   ✗ non sono nel documento')

nota('\n— l\'anello del fuoco della tastiera —')
const anello = await p.valuta(`
  const i = document.querySelector('input')
  i.focus()
  const s = getComputedStyle(i)
  return { outline: s.outlineStyle, larghezza: s.outlineWidth }
`)
nota(anello.outline !== 'none' ? `   ✓ c'è (${anello.outline} ${anello.larghezza})` : '   ✗ nessun anello: chi usa la tastiera non sa dov\'è')

nota('\n— la struttura del documento —')
const sem = await p.valuta(`
  return { h1: document.querySelectorAll('h1').length, h2: document.querySelectorAll('h2').length,
           liste: document.querySelectorAll('ul').length, voci: document.querySelectorAll('li').length }
`)
nota(`   h1:${sem.h1} h2:${sem.h2} ul:${sem.liste} li:${sem.voci} ` + (sem.h1 && sem.h2 && sem.voci ? '✓' : '✗'))

nota('\n— una riga si può cambiare —')
const sp = await p.valuta(`
  const e = [...document.querySelectorAll('button')].find(x => x.innerText?.trim() === 'comprare il latte')
  if (!e) return null
  const r = e.getBoundingClientRect(); return { x: Math.round(r.x+30), y: Math.round(r.y+r.height/2) }
`)
if (sp) {
  await p.clic(sp.x, sp.y); await pausa(400)
  const campi = await p.valuta(`return [...document.querySelectorAll('input')].map(e=>e.value)`)
  nota(campi.includes('comprare il latte') ? '   ✓ si apre in modifica' : '   ✗ ' + JSON.stringify(campi))
  const dett = trova(await p.cliccabili(), 'detail')
  if (dett) {
    await p.clic(dett.x, dett.y); await pausa(300)
    const n = await p.valuta(`return document.querySelectorAll('input').length`)
    nota(n >= 3 ? '   ✓ si può aggiungere un dettaglio' : '   ✗ nessun campo per il dettaglio')
  }
  const lascia = trova(await p.cliccabili(), 'Never mind')
  if (lascia) { await p.clic(lascia.x, lascia.y); await pausa(300); nota('   ✓ «lascia stare» chiude senza salvare') }
}

nota('\n— rotte che non esistono —')
for (const [via, opz, atteso] of [
  ['/api/compiti/inventato', { method: 'DELETE' }, 404],
  ['/api/compiti/inventato', { method: 'PATCH', body: '{"testo":"x"}' }, 404],
  ['/api/compiti/inventato/riapri', { method: 'POST' }, 404],
  ['/api/compiti/inventato/richiama', { method: 'POST' }, 404]
]) {
  const r = await api(via, opz)
  nota(`   ${via.split('/').pop()} → ${r.stato} ${r.stato === atteso ? '✓' : '✗ atteso ' + atteso}`)
}

nota('\n— un secchio senza niente accetta comunque un rilascio —')
await api('/api/compiti', { method: 'POST', body: JSON.stringify({ testo: 'una per settimana', quando: 'settimana' }) })
await pausa(600)
const zona = await p.valuta(`
  const e = [...document.querySelectorAll('div')].filter(x => /^(nothing here|niente qui)$/.test(x.innerText?.trim()))
  return e.map(x => { const r = x.getBoundingClientRect(); return { alto: Math.round(r.height), bordo: getComputedStyle(x).borderStyle } })
`)
nota(zona.length ? `   ✓ ${zona.length} zone di rilascio vuote, alte ${zona[0].alto}px, ${zona[0].bordo}` : '   ✗ nessuna')

nota('\n— errori in console durante tutto il giro —')
const g = await p.guai()
nota(g.length ? g.map(x => '   ✗ ' + x).join('\n') : '   ✓ nessuno')
await p.scatto(process.argv[2] ?? '/tmp/verifica.png')
p.chiudi()
