// Quando la riga dei mittenti messi via si vede.
//
// Sta fuori dal componente perché si prova da Node, senza React e senza il
// suo foglio di stile. È una regola sola: la riga c'è se c'è qualcosa da
// dire. Senza regole non è una funzione che manca, è una riga in meno su una
// pagina che deve restare piana; chi ne aveva una la trova, chi l'ha aperta
// se la tiene finché non cambia pagina, e un guaio nel caricarle si mostra
// perché non deve sparire in silenzio.

/**
 * @param regole quelle attive, o `null` finché non sono arrivate
 * @param aperta la persona l'ha aperta in questa visita
 * @param guaio il caricamento non è riuscito
 */
export function mostraRegoleMittenti(regole: readonly unknown[] | null, aperta: boolean, guaio: string): boolean {
  if (aperta || guaio) return true
  return !!regole?.length
}
