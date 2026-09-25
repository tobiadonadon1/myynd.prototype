// Il vocabolario delle ragioni, e cosa vale una carta: giusta, sbagliata, o niente.
//
// È l'unica lettura del vocabolario. Il registro della fiducia (P1B, genere
// `feed.carta`) e il resoconto della settimana (P9, K4) importano `esitoCarta`
// da qui invece di rifare il conto per conto loro, così «già fatta» vale
// giusta in tutti e tre i posti: una carta che arriva quando lui ha già fatto
// la cosa era una carta giusta, arrivata tardi. Non è un errore del feed
// (insegna a controllare la posta inviata); è un errore sbagliarla.
//
// `feed.ragione` dice perché una carta è stata chiusa:
//   · scartato: vecchia | fatta | non_mia | non_chiara (le quattro di «Non utile»)
//   · fatto:    lui (il bottone) | lista (passata nella lista) | fuori (ha risposto dalla posta)
//   · scaduto:  tempo (quattro giorni) | data (il giorno dopo la sua data) | tetto (le più leggere oltre le venti) | superata (dal giro delle priorità)
// Le righe di prima della ragione hanno NULL: `ragioneDi` le legge dallo stato e dal motivo.

export const RAGIONI_SCARTO = ['vecchia', 'fatta', 'non_mia', 'non_chiara'] as const
export const RAGIONI_FATTO = ['lui', 'lista', 'fuori'] as const
export const RAGIONI_SCADUTO = ['tempo', 'data', 'tetto', 'superata'] as const
export type RagioneScarto = typeof RAGIONI_SCARTO[number]
export type RagioneFatto = typeof RAGIONI_FATTO[number]
export type RagioneScaduto = typeof RAGIONI_SCADUTO[number]
export type Ragione = RagioneScarto | RagioneFatto | RagioneScaduto

export const eRagioneScarto = (x: unknown): x is RagioneScarto =>
  typeof x === 'string' && (RAGIONI_SCARTO as readonly string[]).includes(x)
export const eRagione = (x: unknown): x is Ragione =>
  typeof x === 'string' && ([...RAGIONI_SCARTO, ...RAGIONI_FATTO, ...RAGIONI_SCADUTO] as readonly string[]).includes(x)

/** Scritto in feed.motivo, sempre in italiano (il modello legge una lingua sola), mai mostrato nell'interfaccia. */
export const MOTIVO_SCARTO: Record<RagioneScarto, string> = {
  vecchia: 'Vecchia: non vale più.',
  fatta: 'Era già fatta.',
  non_mia: 'Non è una cosa sua.',
  non_chiara: 'Non si capiva.'
}
export const MOTIVO_FUORI = 'Hai risposto dalla posta.'

/**
 * La ragione di una riga, anche di quelle nate prima della colonna.
 *
 * Righe di prima (ragione NULL): fatto con motivo «Passata nella lista.» →
 * lista, altro fatto → lui; scaduto → tempo; scartato → null («senza»).
 */
export function ragioneDi(stato: string, ragione: string | null | undefined, motivo: string | null | undefined): Ragione | null {
  if (eRagione(ragione)) return ragione
  if (stato === 'fatto') return motivo === 'Passata nella lista.' ? 'lista' : 'lui'
  if (stato === 'scaduto') return 'tempo'
  return null
}

/** Una risposta mandata dalla sua posta: dopo la nascita della carta, o prima. */
export type Risposta = 'dopo' | 'prima' | null

export type Esito = 'giusta' | 'sbagliata' | 'neutra'

/**
 * Cosa vale una carta, letto dal suo stato:
 *   · fatto (lui, lista, fuori) → giusta;
 *   · scartato: fatta → giusta (una carta giusta arrivata tardi); vecchia, non_mia, non_chiara, senza → sbagliata;
 *   · aperto → neutra, salvo che abbia già risposto dalla posta → giusta;
 *   · scaduto: risposto dalla posta → giusta; superata, data, tetto → neutra;
 *     tempo con `vista` → sbagliata (l'ha vista e l'ha lasciata passare);
 *     tempo senza `vista` → neutra (non è mai stata sullo schermo).
 */
export function esitoCarta(c: { stato: string; ragione: string | null; motivo?: string | null; vista: string | null; risposta?: Risposta }): Esito {
  const r = ragioneDi(c.stato, c.ragione, c.motivo ?? null)
  switch (c.stato) {
    case 'fatto': return 'giusta'
    case 'scartato': return r === 'fatta' ? 'giusta' : 'sbagliata'
    case 'aperto': return c.risposta ? 'giusta' : 'neutra'
    case 'scaduto':
      if (c.risposta) return 'giusta'
      if (r === 'superata' || r === 'data' || r === 'tetto') return 'neutra'
      return c.vista ? 'sbagliata' : 'neutra'
    default: return 'neutra'
  }
}
