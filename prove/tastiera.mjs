import { attacca, pausa } from './guida.mjs'
const p = await attacca()
// parto dal campo di scrittura e tabulo, guardando cosa prende il fuoco
await p.valuta(`document.querySelector('input')?.focus(); return 1`)
const giro = []
for (let i = 0; i < 14; i++) {
  await p.tasto('Tab')
  giro.push(await p.valuta(`
    const a = document.activeElement
    const st = getComputedStyle(a)
    const box = a.closest('[style*="opacity"]')
    return {
      cosa: (a.innerText || a.placeholder || a.getAttribute('aria-label') || a.tagName).trim().slice(0,34),
      visibile: box ? getComputedStyle(box).opacity : '1'
    }
  `))
}
console.log('il giro del tabulatore:')
for (const g of giro) console.log(`   ${g.visibile === '0' ? '✗ invisibile' : '✓ visibile  '} ${g.cosa}`)
const invisibili = giro.filter(g => g.visibile === '0').length
console.log(invisibili ? `\n✗ ${invisibili} bersagli presi dal fuoco ma invisibili` : '\n✓ tutto quello che prende il fuoco si vede')
p.chiudi()
