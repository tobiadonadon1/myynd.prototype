// Da un testo incollato alle righe da segnare.
//
// Chi incolla un elenco — da una mail, da un appunto, da una chat — porta
// con sé i segni dell'elenco: trattini, pallini, numeri, caselle. Non sono
// parte della cosa da fare, e una riga che comincia con «- » in lista si
// leggerebbe come un errore. Si tolgono, e le righe vuote con loro.

/** Un segno d'elenco in testa: «-», «*», «•», «–», «—», «1.», «1)», «[ ]», «[x]». */
const SEGNO = /^\s*(?:[-*•–—]|\d{1,3}[.)]|\[[ xX]?\])\s+/
/** Una casella subito dopo il trattino: «- [ ] cosa». */
const CASELLA = /^\s*\[[ xX]?\]\s*/

export function righeDaTesto(testo: string): string[] {
  return testo.split(/\r?\n|\r/)
    .map(r => r.replace(SEGNO, '').replace(CASELLA, '').trim())
    .filter(Boolean)
}
