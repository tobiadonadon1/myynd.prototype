import { attacca } from './guida.mjs'
const p = await attacca()
console.log(await p.valuta(`return { url: location.href, stato: document.readyState, corpo: document.body?.innerText?.slice(0,80) ?? '(vuoto)' }`))
p.chiudi(); process.exit(0)
