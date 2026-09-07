// Da un testo incollato alle righe della lista.
//
// Una lista di cose da fare arriva quasi sempre da un altro posto — le note,
// una mail, un foglio — e arriva con i suoi segni: trattini, pallini, numeri,
// caselle. Qui si tolgono, e ogni riga che resta è una cosa da fare. Niente di
// più: chi la chiama decide cosa farne.

/**
 * Il segno in testa a una riga: «- », «* », «• », «1. », «1) », «[ ] », «[x] ».
 *
 * Dopo il numero lo spazio è d'obbligo: «10.5 metri di cavo» è testo, non
 * un elenco. Dopo un trattino o una casella no — «-chiamare Rossi»
 * è scritto così da mezza gente.
 */
const SEGNO = /^\s*(?:[-*•–—]\s*|\d+[.)]\s+|\[\s*[xX]?\s*\]\s*)/

/** Le righe piene di un testo, ripulite dai segni di elenco. */
export function righeDaTesto(testo: string): string[] {
  return testo
    .split(/\r?\n/)
    // un segno può stare davanti a un altro («- [ ] cosa»): si tolgono finché ce ne sono
    .map(r => {
      let pulita = r
      for (;;) {
        const senza = pulita.replace(SEGNO, '')
        if (senza === pulita) break
        pulita = senza
      }
      return pulita.trim()
    })
    .filter(Boolean)
}
