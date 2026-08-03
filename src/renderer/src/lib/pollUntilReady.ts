/**
 * Ripete `fetchFn` a intervalli brevi finché `isReady` non è vero o si
 * esauriscono i tentativi, poi si ferma da sola — mai per sempre.
 *
 * Serve allo stato del modello nei primi secondi dopo l'avvio: la CLI è
 * ancora in fase di probe, `getModelStatus()`/`getDashboard()` letti una
 * sola volta al mount tornano "non raggiungibile" e la schermata resta
 * bloccata lì anche quando, un attimo dopo, il modello è pronto e il
 * lavoro preparato è già in attesa. Nessuno spinner: si richiede lo stesso
 * dato onesto già previsto, solo più di una volta.
 *
 * Il budget di default (10 tentativi × 1200ms ≈ 12s) sta sopra ai ~7s che
 * `claude-cli.ts` documenta per uno spawn a freddo, con margine: un budget
 * più stretto del caso peggiore documentato lascia esattamente lo stesso
 * "claude non trovato" bloccato che questa funzione doveva risolvere, solo
 * spostato un po' più in là nel tempo. Chi ha bisogno di aspettare qualcosa
 * di più lento (es. la rigenerazione delle bozze, 40-90s) passa un budget
 * più largo tramite `opts`.
 */
export function pollUntilReady<T>(
  fetchFn: () => Promise<T>,
  isReady: (value: T) => boolean,
  onUpdate: (value: T) => void,
  opts: { attempts?: number; intervalMs?: number; onUnavailable?: () => void } = {},
): () => void {
  const { attempts = 10, intervalMs = 1200, onUnavailable } = opts
  let annullato = false
  let timer: ReturnType<typeof setTimeout> | null = null
  // vero appena `onUpdate` è stato chiamato almeno una volta: serve a
  // distinguere "non ancora pronto" (dato onesto ricevuto, si continua a
  // provare) da "non si riesce proprio a leggere nulla" (ogni tentativo è
  // fallito, non solo l'ultimo).
  let maiRiuscito = false

  const riprova = (rimasti: number): void => {
    if (annullato) return
    if (rimasti <= 0) {
      // tentativi esauriti senza che `onUpdate` sia mai stato chiamato:
      // senza questo avviso il chiamante resterebbe fermo al suo stato
      // iniziale (spesso `null`) per sempre, uno schermo bianco senza
      // spiegazione invece di uno stato onesto di "non raggiungibile".
      if (!maiRiuscito) onUnavailable?.()
      return
    }
    timer = setTimeout(() => giro(rimasti - 1), intervalMs)
  }

  const giro = (rimasti: number): void => {
    fetchFn()
      .then((value) => {
        if (annullato) return
        maiRiuscito = true
        onUpdate(value)
        if (!isReady(value)) riprova(rimasti)
      })
      .catch(() => {
        // un fetch fallito conta come "non ancora pronto", non come un
        // errore fatale che spegne il sondaggio: senza questo catch una
        // singola promessa rifiutata lo interrompe silenziosamente (una
        // rejection non gestita), lasciando lo schermo bloccato esattamente
        // come prima di questa funzione.
        riprova(rimasti)
      })
  }

  giro(attempts)

  return () => {
    annullato = true
    if (timer) clearTimeout(timer)
  }
}
