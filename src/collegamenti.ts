// Un collegamento è cambiato: chi lo mostra lo rilegge, adesso.
//
// La prima tester esterna ha collegato Claude e la prima pagina ha continuato
// a dirle «serve Claude». La chiave era buona e salvata, ma il conto non aveva
// credito: la scheda si è fermata a dirlo con un «Avanti», e lo stato dell'app
// si rileggeva soltanto da quell'«Avanti». Lei ha chiuso la finestra con la
// croce, e da lì in poi la prima pagina, la chat e l'intestazione della
// scheda stessa sono rimaste alla fotografia di prima.
//
// Il difetto non era quella scheda: era che rileggere lo stato toccava a chi
// ospita il modulo, e ognuno lo faceva a modo suo, quando se ne ricordava. Qui
// il fatto si dice dal posto da cui passano tutti — la risposta del server a
// una richiesta che cambia un collegamento — e chi mostra lo stato si iscrive
// una volta sola. Nessuna scheda deve più ricordarsi di niente.

type Ascoltatore = () => void

const ascoltatori = new Set<Ascoltatore>()

/** Iscriversi al fatto. Torna come disiscriversi, per gli effetti di React. */
export function suCollegamento(f: Ascoltatore): () => void {
  ascoltatori.add(f)
  return () => { ascoltatori.delete(f) }
}

/** Dirlo a tutti. Chi ascolta e sbaglia non ferma gli altri. */
export function annunciaCollegamento(): void {
  for (const f of [...ascoltatori]) {
    try { f() } catch { /* chi ascolta si arrangia */ }
  }
}

/**
 * Le richieste che *non* cambiano niente, pur scrivendo.
 *
 * Aprono un accesso nel browser, lo annullano, chiedono l'elenco dei modelli:
 * lo stato è quello di prima, e rileggerlo non serve. Tutto il resto sotto
 * `/api/connettori/` e `/api/modello/` collega, scollega o cambia chi lavora.
 */
const SOLO_PASSAGGI = /\/(avvia|inizia|modelli|annulla|cancel|scopri)$|^\/api\/modello\/(abbonamento\/accesso|chatgpt\/login)$/

/** La domanda «a che punto è l'accesso?», che una volta risponde «fatto». */
const ACCESSO = /^\/api\/modello\/(abbonamento\/accesso|chatgpt\/login)\/[^/]+$/

/**
 * Questa risposta ha cambiato un collegamento?
 *
 * Si guarda la rotta, non chi chiama: è per questo che vale anche per le
 * schede che arriveranno. Un accesso nel browser finisce su una lettura — il
 * server sceglie l'account mentre risponde «completed» — e quella conta.
 */
export function cambiaIlCollegamento(metodo: string | undefined, url: string, corpo: unknown): boolean {
  const percorso = url.split('?')[0]
  if (!/^\/api\/(connettori|modello)\//.test(percorso)) return false
  if ((metodo ?? 'GET').toUpperCase() === 'GET') {
    return ACCESSO.test(percorso) && (corpo as { stato?: unknown } | null)?.stato === 'completed'
  }
  return !SOLO_PASSAGGI.test(percorso)
}

/**
 * Rileggere, senza mai rimettere in pagina una risposta più vecchia.
 *
 * Dopo un collegamento le letture dello stato si accavallano — quella del
 * fatto, quella della scheda che ha finito, quella del filo del server — e
 * una partita *prima* del cambio può arrivare *dopo*: senza questo
 * rimetterebbe in pagina «da collegare» un attimo dopo il «collegato». Si usa
 * una risposta solo se è partita dopo l'ultima già usata; quando la propria
 * promessa si chiude, in pagina c'è lei o una più fresca.
 */
export function rilettura<T>(chiedi: () => Promise<T>, usa: (v: T) => void): () => Promise<T> {
  let partite = 0
  let usata = 0
  return async () => {
    const mia = ++partite
    const v = await chiedi()
    if (mia > usata) { usata = mia; usa(v) }
    return v
  }
}
