// Il filo di una email: la chiave che tiene insieme una conversazione.
//
// Una ricerca trova *un* messaggio — quello con le parole giuste — e quasi mai
// è quello che serve da solo: il preventivo che si sta scrivendo sta nella
// risposta di Rossi, ma il prezzo che aveva chiesto sta due messaggi prima, e
// quello che gli si era già promesso sta nella risposta che gli aveva mandato
// lei. Senza un filo, tre documenti che parlano della stessa cosa sono tre
// documenti qualunque, e il modello lavora su uno solo.
//
// La posta ha già questo filo scritto dentro, ed è la stessa cosa che usa
// qualunque programma di posta per raggruppare: la catena degli identificativi.
// Ogni risposta cita il messaggio a cui risponde (`In-Reply-To`) e tutta la
// catena da cui viene (`References`), e il primo della catena è la radice.
// Quando i due campi mancano — capita con i programmi più vecchi, e con certe
// caselle aziendali che li strappano — resta l'oggetto, ripulito dei «Re:» che
// gli si accumulano davanti.

/** Quello che serve per ricavare la chiave, comunque arrivi dai connettori. */
export type Intestazioni = {
  messageId?: string | null
  inReplyTo?: string | null
  references?: string | string[] | null
  oggetto?: string | null
}

/**
 * Un identificativo pulito: senza le parentesi angolari e gli spazi attorno.
 *
 * Vuoto se non c'è niente da tenere: uno spazio o due parentesi vuote non sono
 * una chiave, e diventerebbero il filo di *tutte* le email senza identificativo.
 */
export function idPulito(x: string | null | undefined): string {
  return String(x ?? '').trim().replace(/^<+|>+$/g, '').trim()
}

/**
 * Il primo identificativo di un campo che ne può contenere più d'uno.
 *
 * `References` è una lista, e mailparser la consegna già spezzata; Gmail e
 * Graph la danno come testo, con gli id in fila separati da spazi o a capo. Si
 * prende il primo, che per convenzione è la radice della conversazione.
 */
function primoId(x: string | string[] | null | undefined): string {
  if (Array.isArray(x)) {
    for (const v of x) { const p = idPulito(v); if (p) return p }
    return ''
  }
  const testo = String(x ?? '')
  // gli id sono fra parentesi angolari: si prende il primo che c'è, e se non
  // ce ne sono si ripiega sulla prima parola
  const fra = testo.match(/<[^<>\s]+>/)
  return idPulito(fra ? fra[0] : testo.trim().split(/[\s,]+/)[0])
}

/** I prefissi che una risposta o un inoltro si mettono davanti all'oggetto. */
const PREFISSI = /^\s*(?:(?:re|r|fwd|fw|i|aw)(?:\s*\[\d+\])?\s*:\s*)+/i

/**
 * L'oggetto senza le stratificazioni: minuscolo, senza «Re: R: Fwd:», senza
 * spazi doppi. Vuoto se dopo la pulizia non resta niente, cioè se non c'era un
 * oggetto vero — «(senza oggetto)» non è una conversazione.
 */
export function oggettoNormalizzato(oggetto: string | null | undefined): string {
  return String(oggetto ?? '')
    .toLowerCase()
    .replace(PREFISSI, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * La chiave del filo, o null se non se ne ricava una.
 *
 * Nell'ordine: la radice di `References`, poi `In-Reply-To`, poi il
 * `Message-ID` del messaggio stesso — che per il primo messaggio di una
 * conversazione è esattamente la radice che tutte le risposte citeranno. Se
 * manca tutto, l'oggetto normalizzato con `s:` davanti, così non si confonde
 * mai con un identificativo vero.
 */
export function filoDi(h: Intestazioni): string | null {
  const radice = primoId(h.references) || primoId(h.inReplyTo) || idPulito(h.messageId)
  if (radice) return radice
  const oggetto = oggettoNormalizzato(h.oggetto)
  return oggetto ? `s:${oggetto}` : null
}
