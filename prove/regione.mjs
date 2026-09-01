import { attacca } from './guida.mjs'
const p = await attacca()
const via = await p.valuta(`
  const v = []
  let e = document.querySelector('h1')
  while (e && e !== document.documentElement) {
    v.push({ tag: e.tagName.toLowerCase(), inline: e.style.webkitAppRegion || '—' })
    e = e.parentElement
  }
  return v
`)
console.log(via)
p.chiudi()
process.exit(0)
