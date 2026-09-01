import { attacca, pausa } from './guida.mjs'
const p = await attacca(9223)
await pausa(1500)
const t = (await p.testo()).split('\n').filter(Boolean)
const chiedePassword = t.some(r => /PASSWORD|Crea l'accesso|Entra/.test(r))
console.log('  schermata:', t.slice(0,4).join(' / '))
console.log(chiedePassword ? '  ✗ chiede di nuovo la password' : '  ✓ entra da sola, niente password')
p.chiudi(); process.exit(0)
