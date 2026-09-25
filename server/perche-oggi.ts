// Il «perché oggi»: la riga che lui legge sotto il titolo, controllata dove nasce.
//
// Era «per quale progetto o obiettivo conta», e sulla prima pagina diceva
// «Conta per il progetto H-Farm» sotto ogni carta: una riga che non dice
// niente che lui non sappia. Adesso è una riga presa dal documento che dice
// chi aspetta e da quando, la data, o cosa si ferma senza di lui: «Sara
// aspetta il sì da lunedì per chiudere il preventivo.» Questi controlli
// valgono **solo dove le carte nascono** (la lettura, il giro delle priorità,
// la riscrittura): mai al caricamento della pagina, che non deve nascondere
// una carta che ieri vedeva.

import { conRelativi } from './data-carta.ts'
import { giornoFondato } from './rilevanza.ts'
import * as progetti from './progetti.ts'

/** Sopra queste parole il perché si riscrive (`rifinitura.controlla`). */
export const PERCHE_PAROLE = 12
/** Sopra queste parole il perché non nasce. */
export const PERCHE_PAROLE_MAX = 20

// la descrizione negli schemi sta in data-carta.ts, una foglia: chi la legge
// per comporre uno schema (le priorità) non deve passare da qui
export { PERCHE_DESCRIZIONE } from './data-carta.ts'

export type Guaio = 'vuoto' | 'lungo' | 'relativo' | 'giorno' | 'numero' | 'obiettivo'

/** «Conta per il progetto», «fa avanzare il sito»: il perché di prima, che non è un perché oggi. */
const PARLA_DELL_OBIETTIVO = /\b(?:conta per|fa avanzare|muove|serve al progetto|per il progetto|matters for|moves|advances|for the project|towards the goal|verso l'obiettivo)\b/i

const parole = (s: string) => s.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length
const normalizza = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * Perché un «perché oggi» non regge, o null se passa. Nell'ordine: troppo
 * corto, troppo lungo, con «oggi» o «domani», con un giorno che la fonte
 * non nomina, con un numero che nella fonte non c'è, o che parla del
 * progetto e dell'obiettivo invece che di chi aspetta.
 */
export function percheFondato(
  perche: string,
  fonte: { titolo?: string; testo: string; autore?: string | null; quando?: string | null },
  suoi: readonly { nome: string; obiettivo?: string | null }[] = []
): Guaio | null {
  const p = perche.trim()
  if (p.length < 12) return 'vuoto'
  if (p.length > 200 || parole(p) > PERCHE_PAROLE_MAX) return 'lungo'
  if (conRelativi(p)) return 'relativo'
  if (!giornoFondato(p, { titolo: fonte.titolo ?? '', corpo: fonte.testo, autore: fonte.autore ?? null, quando: fonte.quando ?? null })) return 'giorno'
  const testoFonte = normalizza(`${fonte.titolo ?? ''}\n${fonte.autore ?? ''}\n${fonte.testo}`)
  const numeri = p.match(/\b\d+(?:[.,]\d+)*\b/g) ?? []
  if (numeri.some(n => !new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(testoFonte))) return 'numero'
  if (PARLA_DELL_OBIETTIVO.test(p)) return 'obiettivo'
  if (suoi.length && progetti.eUnObiettivo(p, suoi.map(x => ({ nome: x.nome, obiettivo: x.obiettivo ?? '' })) as never)) return 'obiettivo'
  return null
}
