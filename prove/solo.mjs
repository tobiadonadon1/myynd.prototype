import { attacca, pausa } from './guida.mjs'
const p = await attacca()
await p.valuta(`window.__guai=null`); await p.ascoltaGuai()
await pausa(1500)
console.log('— l\'app da sola, senza terminale —')
console.log((await p.testo()).split('\n').filter(Boolean).slice(0,7).join('\n'))
console.log('\n— posso scrivere una riga? —')
const campo = (await p.cliccabili()).find(e => e.tag === 'input')
if (campo) {
  await p.clic(campo.x, campo.y)
  await p.scrivi('funziona da sola')
  await p.tasto('Enter'); await pausa(900)
  console.log((await p.testo()).includes('funziona da sola') ? '  ✓ sì' : '  ✗ no')
}
console.log('\n— errori —', (await p.guai()).length || 'nessuno')
await p.scatto(process.argv[2])
p.chiudi(); process.exit(0)
