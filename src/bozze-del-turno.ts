// L'interruttore «Bozze pronte prima che le chieda» nel Turno di notte.
//
// Le bozze le prepara il turno: a turno spento l'interruttore non fa niente, e
// non si mostra; con l'autonomia su «chiedere prima» resta acceso ma fermo, e
// lo dice la riga di stato, come in Automazioni. Mai acceso e muto.

export type Iniziativa = { attiva: boolean; inPausa: boolean }

/** null: la riga non c'è. Altrimenti com'è l'interruttore, e se è fermo. */
export function rigaBozze(turnoAcceso: boolean, b: Iniziativa | null): { acceso: boolean; inPausa: boolean } | null {
  if (!turnoAcceso || !b) return null
  return { acceso: b.attiva, inPausa: b.attiva && b.inPausa }
}
