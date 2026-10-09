// La ricevuta in cima alla prima pagina, dalla parte della pagina: le regole
// piccole, senza React. Il server la compone (`server/mattina.ts`); qui si
// decide da quando chiederla, cosa ci aggiunge la pagina, e come si dice.
//
//   node --test src/mattina.test.ts

import type { AspettaMattina, FattaMattina } from './api'

/** Da quanti minuti di assenza «da quando te ne sei andato» ricomincia. */
export const MINUTI_VIA = 30
/** Quante righe per lista sta sulla carta: il resto è nel foglio. */
export const RIGHE_IN_CARTA = 3

/**
 * Da quando contare, al ritorno.
 *
 * `prima` è quando la finestra ha perso il fuoco l'ultima volta. Un'assenza
 * vera (mezz'ora, o un altro giorno) fa ricominciare la ricevuta da lì; un
 * passaggio su un'altra finestra no, e resta quella di prima. Senza niente,
 * null: il server conta dall'inizio della giornata.
 */
export function dalDopoIlRitorno(prima: number | null, salvato: string | null, ora: number): string | null {
  if (!prima || !Number.isFinite(prima) || prima > ora) return salvato
  const via = ora - prima >= MINUTI_VIA * 60_000 || new Date(prima).toDateString() !== new Date(ora).toDateString()
  return via ? new Date(prima).toISOString() : salvato
}

/**
 * Quello che aspetta lui, con la lettera.
 *
 * Le domande per conoscerlo stanno solo nella pagina (l'intervista è sua):
 * erano una fascia scura sopra tutto, «Myynd ti ha scritto». Adesso sono una
 * riga della ricevuta, dopo le carte ferme, e il tetto vale anche per lei.
 */
export function conLettera(xs: readonly AspettaMattina[], lettera: string | null, max = 5): AspettaMattina[] {
  const tutte: AspettaMattina[] = xs.filter(a => a.genere !== 'lettera')
  if (lettera) {
    const dopoLeCarte = tutte.findIndex(a => a.genere !== 'carta')
    tutte.splice(dopoLeCarte < 0 ? tutte.length : dopoLeCarte, 0, { genere: 'lettera', id: 'lettera', titolo: lettera })
  }
  return tutte.slice(0, max)
}

/** La parte di una cosa fatta che dice dove sta: il nome del file, o la casella. Null se è la carta stessa. */
export function doveSta(f: FattaMattina): { genere: 'file'; nome: string; luogo: string | null } | { genere: 'casella' } | null {
  if (f.dove.genere === 'file') return { genere: 'file', nome: f.dove.nome, luogo: f.dove.luogo }
  if (f.dove.genere === 'casella') return { genere: 'casella' }
  return null
}
