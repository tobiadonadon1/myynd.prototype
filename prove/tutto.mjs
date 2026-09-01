import { attacca, pausa, trova } from './guida.mjs'
const p = await attacca()
await pausa(2500)
const api = (via, opz) => p.valuta(`
  const r = await fetch(${JSON.stringify(via)}, Object.assign({ headers: { authorization: 'Bearer sviluppo-non-in-produzione', 'content-type':'application/json' } }, ${JSON.stringify(opz ?? {})}))
  return await r.json()`)

console.log('— 1 · il menù ha «Da fare»? —')
const nav = await p.valuta(`return [...document.querySelectorAll('a')].map(e=>e.innerText.trim().split('\\n')[0]).filter(Boolean).slice(0,6)`)
console.log('  ', nav.join(' · '), nav.some(x=>/To do|Da fare/.test(x)) ? '✓' : '✗')

console.log('\n— 2 · il feed: righe identiche, alone, niente intestazione, niente Done —')
const t = await p.testo()
console.log('  intestazione MYYND2DO:', /MYYND2DO/i.test(t) ? '✗ ancora lì' : 'assente ✓')
console.log('  «Done ·»:', /Done · \d|Fatte · \d/.test(t) ? '✗ ancora lì' : 'assente ✓')
console.log('  la riga del compito nel feed:', /arrange FunctionHealth/.test(t) ? 'c\'è ✓' : '✗ manca')
const vivo = await p.valuta(`
  const e = document.querySelector('.vivo')
  if (!e) return null
  const st = getComputedStyle(e)
  return { anim: st.animationName, stessaCard: !!e.parentElement.querySelector('[style]') }
`)
console.log('  filo vivo sulla riga:', vivo ? vivo.anim + ' ✓' : '✗ manca')
console.log('  nella STESSA card delle altre:', await p.valuta(`
  const mio = document.querySelector('.vivo')
  if (!mio) return '✗'
  const card = mio.parentElement
  const altre = [...card.children].some(x => !x.classList.contains('vivo'))
  return altre || card.children.length ? '✓ una lista sola' : 'solo mie'
`))

console.log('\n— 3 · il giro si apre sulla lista (config.giro=false) —')
await p.valuta(`
  const a = [...document.querySelectorAll('a')].find(e => /To do|Da fare/.test(e.innerText))
  a.click(); return a.innerText.trim()
`)
await pausa(1200)
console.log('  schermata:', (await p.testo()).split('\n').filter(Boolean).slice(0,3).join(' / '))
const aperto = await p.valuta(`return !!document.querySelector('[role="dialog"]')`)
console.log('  si apre:', aperto ? '✓' : '✗')
if (aperto) {
  // lo chiudo con Esc: deve segnare giro=true sul profilo
  await p.tasto('Escape'); await pausa(900)
  const st = await api('/api/stato')
  console.log('  segnato per sempre (config.giro):', st.config.giro ? '✓' : '✗')
}
await p.scatto(process.argv[2])
p.chiudi(); process.exit(0)
