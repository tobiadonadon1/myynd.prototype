// Il ciclo di vita di un compito, premuto a mano dall'inizio alla fine.
import { attacca, pausa, trova } from './guida.mjs'

const p = await attacca()
await p.ascoltaGuai()
const nota = console.log

const rigaDi = (testo) => p.valuta(`
  const d = [...document.querySelectorAll('div')]
    .filter(e => e.innerText?.trim().startsWith(${JSON.stringify(testo)}))
    .sort((a,b) => a.innerText.length - b.innerText.length)[0]
  if (!d) return null
  const r = d.getBoundingClientRect()
  return { x: Math.round(r.x + 40), y: Math.round(r.y + 18), alto: Math.round(r.height) }
`)

nota('— aggiungo un compito delegabile —')
let b = await p.cliccabili()
const campo = b.find(e => e.tag === 'input' && /da fare|needs doing/i.test(e.testo))
await p.clic(campo.x, campo.y)
await p.scrivi('riassumere cosa dice il documento Gemini')
await p.tasto('Enter')
await pausa(800)

const r = await rigaDi('riassumere cosa dice')
nota(r ? '   ✓ riga creata' : '   ✗ riga assente')

nota('\n— la delego —')
await p.passaSopra(r.x, r.y)
await pausa(250)
const aMyynd = trova(await p.cliccabili(), 'myynd')
if (!aMyynd) { nota('   ✗ nessun bottone «a Myynd»'); process.exit(1) }
await p.clic(aMyynd.x, aMyynd.y)
await pausa(900)
let t = await p.testo()
nota(/working on it|ci sta lavorando/i.test(t) ? '   ✓ dice che ci sta lavorando' : '   ✗ nessuno stato di lavorazione: ' + t.slice(0,120))

nota('\n— posso ancora spuntarla o toglierla mentre lavora? —')
await p.passaSopra(r.x, r.y)
await pausa(250)
const mentreLavora = await p.cliccabili()
nota('   bersagli sulla riga: ' + mentreLavora.filter(e => Math.abs(e.y - r.y) < 30).map(e => e.testo || e.tag).join(' · ') || '   (nessuno)')

nota('\n— aspetto la bozza —')
let pronto = false
for (let i = 0; i < 25; i++) {
  await pausa(2000)
  t = await p.testo()
  if (/draft ready|bozza pronta/i.test(t)) { pronto = true; nota(`   ✓ pronta dopo ~${(i+1)*2}s`); break }
}
if (!pronto) { nota('   ✗ non è mai arrivata'); nota(t.slice(0,300)) }

nota('\n— la bozza si apre da sola? —')
nota(/Va bene così|Good as it is/i.test(t) ? '   ✓ sì, già aperta' : '   ✗ no, resta chiusa')

nota('\n— i bottoni della bozza —')
b = await p.cliccabili()
for (const e of b.filter(x => /bene|Correggi|Edit|Rifallo|again/i.test(x.testo))) nota('   · ' + e.testo)

nota('\n— provo Correggi —')
const correggi = trova(b, 'Correggi') ?? trova(b, 'Edit')
if (!correggi) nota('   ✗ manca')
else {
  await p.clic(correggi.x, correggi.y)
  await pausa(400)
  const ta = await p.valuta(`return document.querySelectorAll('textarea').length`)
  nota(ta ? '   ✓ compare la casella modificabile' : '   ✗ nessuna casella')
  const dopo = trova(await p.cliccabili(), 'Fatto') ?? trova(await p.cliccabili(), 'Done')
  if (dopo) { await p.clic(dopo.x, dopo.y); await pausa(300); nota('   ✓ torna alla lettura') }
}

nota('\n— chiudo con «Va bene così» —')
const bene = trova(await p.cliccabili(), 'bene') ?? trova(await p.cliccabili(), 'Good as it')
if (!bene) nota('   ✗ manca')
else {
  await p.clic(bene.x, bene.y)
  await pausa(900)
  t = await p.testo()
  nota(!/riassumere cosa dice/.test(t.split(/Done|Fatte/)[0]) ? '   ✓ sparita dalla lista' : '   ✗ è ancora in lista')
}

nota('\n— la sezione delle fatte —')
const fatte = trova(await p.cliccabili(), 'Done') ?? trova(await p.cliccabili(), 'Fatte')
if (!fatte) nota('   ✗ non c\'è')
else {
  await p.clic(fatte.x, fatte.y)
  await pausa(500)
  t = await p.testo()
  nota(/riassumere cosa dice/.test(t) ? '   ✓ si apre e la contiene' : '   ✗ vuota')
  const rimetti = trova(await p.cliccabili(), 'rimetti') ?? trova(await p.cliccabili(), 'put it back')
  if (!rimetti) nota('   ✗ manca «rimettila»')
  else {
    await p.clic(rimetti.x, rimetti.y)
    await pausa(800)
    nota('   ✓ rimessa in lista')
  }
}

nota('\n— errori —')
const guai = await p.guai()
nota(guai.length ? guai.map(g => '   ✗ ' + g).join('\n') : '   ✓ nessuno')
await p.scatto(process.argv[2] ?? '/tmp/ciclo.png')
p.chiudi()
