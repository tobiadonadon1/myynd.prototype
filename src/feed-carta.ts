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
