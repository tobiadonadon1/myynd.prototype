import { attacca, pausa } from './guida.mjs'
const p = await attacca()
await pausa(1500)
await p.valuta(`window.__guai=[]; const v=console.error; console.error=(...a)=>{window.__guai.push(a.join(' '));v(...a)}; return 1`)
console.log('clic su:', await p.valuta(`
  const a = [...document.querySelectorAll('a')].find(e => /To do|Da fare/.test(e.innerText))
  a.click(); return a.innerText.trim()
`))
await pausa(1200)
console.log(await p.valuta(`
  return {
    campoLista: !!document.querySelector('input[aria-label]'),
    testi: [...document.querySelectorAll('h1,h2')].map(e=>e.innerText.trim()).slice(0,4),
    dialogo: !!document.querySelector('[role="dialog"]'),
    errori: window.__guai.slice(0,3)
  }
`))
p.chiudi(); process.exit(0)
