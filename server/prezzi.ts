// Quanto costa una chiamata, in dollari veri e non in token.
//
// Il tetto di oggi conta i token, e per il turno di notte non basta: un
// milione di token di Haiku e un milione di Opus sono la stessa riga nel
// registro e cinque volte il conto. Il budget di una notte (F9) si dice in
// dollari, perché è la cosa che lei sa giudicare: «tre dollari per notte» si
// capisce, «duecentomila token» no.
//
// I prezzi sono quelli di listino di Anthropic, in dollari per milione di
// token, letti il 9 ottobre 2026: una stima del conto, non la fattura. I
// modelli di prima restano, per le righe già scritte e per chi li ha ancora
// nel file (`config.SUCCESSORI` li porta ai nuovi). Haiku 5.5 costa così fino
// a centomila token di entrata; sopra ne costa cinque volte tanto, e Myynd
// non gli manda mai tanto.
// La cache letta costa un decimo dell'entrata (Opus 5.5 la mette a 0,20, un
// ventesimo), quella scritta un quarto in più. Un modello che non è qui non ha un prezzo: si contano i token e basta,
// meglio una riga senza cifra che una cifra inventata.

export type Prezzo = { entrata: number; uscita: number; cacheLettura: number; cacheScrittura: number }

/** Listino al 9 ott 2026, USD per milione di token: una stima, non la fattura. */
const listino = (entrata: number, uscita: number): Prezzo =>
  ({ entrata, uscita, cacheLettura: entrata * 0.1, cacheScrittura: entrata * 1.25 })

export const PREZZI: Record<string, Prezzo> = {
  'claude-haiku-5-5': listino(0.1, 0.5),
  'claude-sonnet-5-5': listino(2, 10),
  'claude-opus-5-5': { ...listino(4, 20), cacheLettura: 0.2 },
  'claude-haiku-4-5': listino(1, 5),
  'claude-sonnet-5': listino(2, 10),
  'claude-opus-5': listino(5, 25)
}

/**
 * I token di una chiamata, divisi come li fa pagare il listino: `entrata`
 * sono quelli entrati senza cache (senza gli scritti in cache), `scritti`
 * quelli messi in cache, `cache` quelli letti dalla cache.
 */
export type Consumo = { entrata: number; uscita: number; cache?: number; scritti?: number }

/**
 * Il costo in micro-dollari (un milionesimo di dollaro: un token di Sonnet in
 * entrata costa 2), intero. Null se il modello non ha un prezzo.
 */
export function costo(modello: string | null | undefined, u: Consumo): number | null {
  const p = modello ? PREZZI[modello] : undefined
  if (!p) return null
  const n = (x: number | undefined) => Number.isFinite(x) && (x as number) > 0 ? (x as number) : 0
  // per milione di token × token = micro-dollari
  return Math.round(n(u.entrata) * p.entrata + n(u.uscita) * p.uscita + n(u.cache) * p.cacheLettura + n(u.scritti) * p.cacheScrittura)
}

/** Da dollari (come li dice Claude Code nella busta) a micro-dollari. Null se non è un numero. */
export function daDollari(usd: unknown): number | null {
  return typeof usd === 'number' && Number.isFinite(usd) && usd >= 0 ? Math.round(usd * 1_000_000) : null
}

/** I motori il cui costo è quello vero: una chiave Anthropic col suo modello, o Claude Code che lo dice. */
export function costoEsatto(motore: string): boolean {
  return motore in PREZZI || motore === 'Claude account'
}
