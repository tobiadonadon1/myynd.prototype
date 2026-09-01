import { attacca, pausa } from './guida.mjs'
const p = await attacca()
await p.valuta(`location.href='http://127.0.0.1:5173/'; return 1`); await pausa(3500)
await p.scatto(process.argv[2])
await p.valuta(`location.href='http://127.0.0.1:5173/#oggi'; return 1`); await pausa(2000)
p.chiudi(); process.exit(0)
