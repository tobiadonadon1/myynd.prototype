// Le richieste che cambiano un collegamento, dette dal server.
//
// È la metà di `src/collegamenti.ts` che vive qui: la finestra che collega
// rilegge da sé appena il server le risponde, e con questa regola lo sanno
// anche le altre — il richiamo, un'altra scheda del browser — perché il fatto
// passa sul filo dei compiti. Le due liste devono dire la stessa cosa, e una
// prova le confronta (`collegamento-rotte.test.ts`).

/** Scrivono, ma non cambiano niente: aprono un accesso, lo annullano, elencano, caricano un pezzo. */
const SOLO_PASSAGGI = /\/(avvia|inizia|modelli|annulla|cancel|scopri|carica-file)$|^\/api\/modello\/(abbonamento\/accesso|chatgpt\/login)$/

/**
 * Questa richiesta, andata bene, ha cambiato un collegamento?
 *
 * I file della cartella scelta nel browser arrivano a pezzi di quindici: il
 * collegamento è cambiato una volta sola, all'ultimo pezzo.
 */
export function cambiaUnCollegamento(metodo: string, percorso: string, corpo: unknown): boolean {
  if (metodo.toUpperCase() === 'GET' || !/^\/api\/(connettori|modello)\//.test(percorso)) return false
  if (percorso === '/api/connettori/desktop/carica-file') return (corpo as { completo?: unknown } | null)?.completo === true
  return !SOLO_PASSAGGI.test(percorso)
}
