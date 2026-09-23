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
 * I file della cartella scelta nel browser arrivano a pezzi di quindici: il
 * fatto lo dice `api.caricaFileDesktop` all'ultimo pezzo, non a ognuno. La
 * stessa lista, dalla parte del server, sta in `server/collegamenti.ts`.
 */
const SOLO_PASSAGGI = /\/(avvia|inizia|modelli|annulla|cancel|scopri|carica-file)$|^\/api\/modello\/(abbonamento\/accesso|chatgpt\/login)$|^\/api\/connettori\/granola\/avvia\/[^/]+$/

/**
 * La domanda «a che punto è l'accesso?», che una volta risponde «fatto».
 *
 * Granola risponde in italiano (`fatto`), gli accessi dei modelli come i loro
 * programmi (`completed`): tutti e due vogliono dire che il collegamento è
 * scritto, e l'intestazione della scheda deve dirlo subito, non all'«Avanti».
 * Annullare quello di Granola (DELETE sulla stessa rotta) è un passaggio.
 */
const ACCESSO = /^\/api\/modello\/(abbonamento\/accesso|chatgpt\/login)\/[^/]+$|^\/api\/connettori\/granola\/avvia\/[^/]+$/

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
    const stato = (corpo as { stato?: unknown } | null)?.stato
    return ACCESSO.test(percorso) && (stato === 'completed' || stato === 'fatto')
  }
  return !SOLO_PASSAGGI.test(percorso)
}

/**
 * Rileggere: una lettura alla volta, e chi chiede mentre ce n'è una in volo
 * riceve quella che parte subito dopo.
 *
 * Dopo un collegamento le richieste di rileggere arrivano a mucchi — il fatto,
 * il filo del server, la scheda che ha finito — e ognuna era una lettura: quattro
 * `/api/stato` per un collegamento solo. Adesso sono al massimo due: quella in
 * volo e una dopo, che serve a chi ha chiesto a cose già cambiate. E siccome
 * non ce ne sono mai due in volo insieme, una risposta vecchia non può
 * arrivare dopo una nuova. Una lettura che fallisce si riprova una volta, poco
 * dopo: un server occupato per un attimo lasciava la pagina com'era prima del
 * collegamento, cioè il difetto di partenza.
 */
export function rilettura<T>(chiedi: () => Promise<T>, usa: (v: T) => void, opz: { riprovaFra?: number } = {}): () => Promise<T> {
  let inVolo: Promise<T> | null = null
  let prossima: Promise<T> | null = null
  const unaLettura = async (): Promise<T> => {
    try { return await chiedi() }
    catch {
      await new Promise(r => setTimeout(r, opz.riprovaFra ?? 400))
      return await chiedi()
    }
  }
  const parti = (): Promise<T> => {
    const p = unaLettura().then(v => { usa(v); return v })
    inVolo = p
    const libera = () => { if (inVolo === p) inVolo = null }
    p.then(libera, libera)
    return p
  }
  return () => {
    if (!inVolo) return parti()
    // quella in volo è partita prima della domanda: chi chiede adesso ne vuole una dopo
    prossima ??= inVolo.then(() => {}, () => {}).then(() => { prossima = null; return parti() })
    return prossima
  }
}

/**
 * Il modulo di una fonte resta aperto dopo che si è collegata?
 *
 * Collegata adesso con il modulo aperto: sì, finché il modulo non ha finito di
 * parlare («la chiave è salvata, ma il conto non ha credito») e chiama `ok()`.
 * Scollegata: no, e si riparte puliti. Prima bastava *qualunque* cambio per
 * tenerlo aperto, anche lo scollegamento, e il modulo restava fermo su un
 * avviso con un «Avanti» che non portava da nessuna parte.
 */
export function moduloDaFinire(daFinire: boolean, eraCollegata: boolean | undefined, collegata: boolean | undefined, eraAperto: boolean): boolean {
  if (!collegata) return false
  if (!eraCollegata && eraAperto) return true
  return daFinire
}

/**
 * Il perché dell'ultimo punto non riuscito, dopo un cambio.
 *
 * Il server dice «collega Claude» solo quando nessuno può ragionare: la frase
 * è falsa appena qualcuno può, e solo allora. Collegare Notion non la toglie,
 * perché resta vera.
 */
export function guaioDelPunto(guaio: string | null, ragionavaPrima: boolean, ragionaAdesso: boolean): string | null {
  return !ragionavaPrima && ragionaAdesso ? null : guaio
}

/**
 * Le teste non sono fonti.
 *
 * Anthropic, OpenAI e un modello sul computer ragionano sul materiale, non ne
 * portano: contarle fra le fonti faceva dire alla prima pagina «3 fonti · 12
 * documenti» a chi aveva collegato il Mac e il calendario. «Da fare» sta
 * dentro l'app e si dichiara sempre collegato. È lo stesso taglio del primo
 * avvio.
 */
export const NON_FONTI = new Set(['claude', 'openai', 'compatibile', 'mind2do'])

/** Le fonti collegate che portano documenti: quelle che la prima pagina conta. */
export function fontiCollegate<C extends { id: string; collegato: boolean }>(connettori: C[]): C[] {
  return connettori.filter(c => c.collegato && !NON_FONTI.has(c.id))
}

/**
 * La riga fissa in cima alla prima pagina: il motore che manca, poi le fonti.
 *
 * Il motore che manca stava solo nella pagina vuota, e dopo il primo avvio la
 * pagina non è mai vuota: chi non aveva collegato Claude non lo leggeva da
 * nessuna parte. Qui c'è finché `ragiona` è falso, una volta sola. Un «Leggi
 * adesso» fallito perché mancava Claude («collega Claude e potrò lavorarci»)
 * non si aggiunge: senza motore lo dice già la prima frase, e con il motore
 * collegato è una frase vecchia che non deve restare in pagina.
 */
export function rigaDelleMancanze(o: {
  ragiona: boolean
  serveClaude: string
  guastoLettura: string | null
  chiedeClaude: string
  fontiNonLette: string | null
}): string | null {
  const guasto = o.guastoLettura === o.chiedeClaude ? null : o.guastoLettura
  const frase = [o.ragiona ? null : o.serveClaude, guasto ?? o.fontiNonLette].filter(Boolean).join(' ')
  return frase || null
}
