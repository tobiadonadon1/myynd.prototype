import { leggibile } from './leggibile.ts'

type Carta = { titolo: string; testo: string; perche?: string | null }

const pulisci = (s: unknown) => leggibile(typeof s === 'string' ? s : '').map(r => r.testo).filter(Boolean).join('\n').trim()
const confrontabile = (s: string) => s.toLocaleLowerCase().replace(/\s+/g, ' ').replace(/[.!?]+$/, '').trim()
const stessa = (a: string, b: string) => confrontabile(a) === confrontabile(b)

/** Preserve the task and its constraints; discard only exact duplicate copy. */
export function testoCarta(c: Carta) {
  const titolo = pulisci(c.titolo)
  const testo = pulisci(c.testo)
  const perche = pulisci(c.perche ?? '')
  return {
    titolo,
    testo: stessa(testo, titolo) ? '' : testo,
    perche: stessa(perche, titolo) || stessa(perche, testo) ? '' : perche
  }
}

/** Display the real source date, never the moment an old source was inferred. */
export function dataFonte(c: { doc: string | null; quando: string; fonteQuando?: string | null }): string | null {
  return c.doc ? c.fonteQuando ?? null : c.quando
}

// — «Non utile», con una ragione (P2) —

export type RagioneNonUtile = 'vecchia' | 'fatta' | 'non_mia' | 'non_chiara'

/** Le quattro ragioni, nell'ordine in cui si mostrano. Le etichette sono chiavi del dizionario. */
export const RAGIONI_NON_UTILE: readonly { ragione: RagioneNonUtile; etichetta: string }[] = [
  { ragione: 'vecchia', etichetta: 'Vecchia' },
  { ragione: 'fatta', etichetta: 'Già fatta' },
  { ragione: 'non_mia', etichetta: 'Non è mia' },
  { ragione: 'non_chiara', etichetta: 'Non si capisce' }
]

/**
 * La seconda riga di ogni carta: il perché oggi, per ogni genere, anche per
 * una priorità. Per le carte di prima, senza perché, il testo. Il resto va
 * nel dettaglio, che si apre col clic.
 */
export function secondaRiga(c: Carta): { riga: string; dettaglio: string[] } {
  const carta = testoCarta(c)
  const riga = carta.perche || carta.testo
  const dettaglio = [carta.testo, carta.perche].filter(x => x && x !== riga)
  return { riga, dettaglio }
}
