// Le quattro di partenza, dove si vedono (E).
//
// Pura: il pacchetto e gli ordini fissi suoi dentro, quello che resta da
// offrire fuori. Stava dentro la pagina, e nascondeva dalla griglia ogni
// ordine acceso dal pacchetto finché erano tutti di lì: acceso, spariva
// sotto il suo interruttore, senza scheda, senza «Falla girare adesso»,
// senza ricevuta, e la riga fissa del motore che diceva «non è riuscito»
// portava su una pagina che non ne mostrava traccia. Adesso uno preso dal
// pacchetto è una scheda come le altre, e il pacchetto offre solo il resto.

import type { DelPacchetto } from '../api.ts'

/** Quelle ancora da prendere, finché tutte le sue vengono dal pacchetto; nessuna dalla prima che si è scritto da sé. */
export function daOffrire(pacchetto: DelPacchetto[], sue: { id: string }[]): DelPacchetto[] {
  const delPacchetto = new Set(pacchetto.map(p => p.id))
  if (!sue.every(a => delPacchetto.has(a.id))) return []
  const prese = new Set(sue.map(a => a.id))
  return pacchetto.filter(p => !prese.has(p.id))
}
