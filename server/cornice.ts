// La cornice di una consegna: le righe che sono per lei e non per chi riceve.
//
// Quello che torna da un lavoro affidato ha tre strati: la prima riga («Fatto:»
// o «Done:»), la cosa consegnata, e in fondo un paragrafo per lei con le fonti
// fra parentesi quadre e, dal 24 settembre, l'ipotesi in una riga sola («Ho
// supposto venerdì come scadenza»). Chi riceve la mail non deve leggere
// nessuno dei tre; lei deve vedere l'ipotesi da sola, sotto la riga, con un
// modo per cambiarla.
//
// Zero import, apposta: lo legge il server e lo legge anche il client
// (`src/`), e le stesse tre funzioni devono dare le stesse risposte da tutte e
// due le parti. Le espressioni sono esportate perché le prove le guardano.

/** Una riga che dichiara un'ipotesi, nelle due lingue. */
export const IPOTESI = /^(?:ho supposto|ho ipotizzato|ho dato per scontato|i assumed|i['’]ve assumed|i have assumed|assuming)\b/i
/**
 * Le forme che sono un'ipotesi dichiarata e basta. «Assuming you agree, we
 * start Monday.» è una frase che una mail può finire con: conta come cornice
 * solo sotto una prima riga «Fatto:»/«Done:», cioè dentro una consegna che ha
 * la forma della cornice; in un corpo nudo resta la frase di chi scrive.
 */
const IPOTESI_FORTE = /^(?:ho supposto|ho ipotizzato|ho dato per scontato|i assumed|i['’]ve assumed|i have assumed)\b/i
/** Una riga che dice cosa manca, quando nel testo c'è un segnaposto. */
export const MANCA = /^(?:manca|mancano|missing)\b/i
/** Il segnaposto lasciato al posto di un dato che nessuna fonte contiene. */
export const SEGNAPOSTO = /\[(?:da completare|to fill):[^\]\n]{1,80}\]/i
/** La riga con cui chi svolge propone la strada, sotto una domanda: non fa parte della domanda. */
export const SE_NON_RISPONDI = /^(?:se non rispondi|otherwise,? i(?:['’]ll| will) assume|if you don['’]t answer)\b[:,]?\s*/i

/** La prima riga di un risultato, quando è la frase di chiusura. */
const CHIUSURA = /^(?:fatto|done)\s*(?::|\.?\s*$)/i
/** Il numero di una fonte, come lo scrive chi svolge: [2]. */
const CITAZIONE = /\s*\[\d{1,2}\]/g
/** Quanto è lunga al massimo la riga che si mostra sotto la riga della lista. */
const RIGA_MAX = 160

export function haSegnaposto(t: string | null | undefined): boolean {
  return !!t && SEGNAPOSTO.test(t)
}

function paragrafi(testo: string): string[] {
  return testo.replace(/\r\n?/g, '\n').trim().split(/\n\s*\n/)
}

function righeDi(paragrafo: string): string[] {
  return paragrafo.split('\n').map(r => r.trim()).filter(Boolean)
}

/** Una riga per lei, pulita: senza i numeri delle fonti, non oltre il tetto. */
function pulita(riga: string): string {
  const senza = riga.replace(CITAZIONE, '').replace(/\s+/g, ' ').trim()
  if (senza.length <= RIGA_MAX) return senza
  const taglio = senza.slice(0, RIGA_MAX - 1)
  const spazio = taglio.lastIndexOf(' ')
  return `${(spazio > 60 ? taglio.slice(0, spazio) : taglio).replace(/[\s,;:]+$/, '')}…`
}

/**
 * La riga dell'ipotesi, com'è scritta nel testo: la prima riga del paragrafo
 * finale che comincia con «Ho supposto» (o le sue sorelle), oppure, se nel
 * testo c'è un segnaposto, la riga che comincia con «Manca». Null se non c'è.
 *
 * Solo il paragrafo finale: un «ho supposto» dentro il corpo di una mail è
 * una frase della mail, non la cornice. Serve a `senzaRigaIpotesi`, che deve
 * togliere esattamente quella riga.
 */
function rigaGrezza(testo: string): string | null {
  const p = paragrafi(testo)
  if (!p.length || !p[0]) return null
  const ultimo = righeDi(p[p.length - 1])
  const ipotesi = ultimo.find(r => IPOTESI_FORTE.test(r)) ?? (conChiusura(p) ? ultimo.find(r => IPOTESI.test(r)) : undefined)
  if (ipotesi) return ipotesi
  if (!haSegnaposto(testo)) return null
  const manca = ultimo.find(r => MANCA.test(r))
  if (manca) return manca
  // il segnaposto c'è ma la riga «Manca» non sta in fondo: si cerca ovunque
  for (const paragrafo of p) {
    const r = righeDi(paragrafo).find(x => MANCA.test(x))
    if (r) return r
  }
  return null
}

/**
 * La riga per lei: la prima riga «Ho supposto» del paragrafo finale, o una
 * riga «Manca» quando il testo ha un segnaposto. Senza i numeri delle fonti,
 * non oltre i 160 caratteri (con «…»). Null se non c'è.
 */
export function rigaIpotesi(testo: string): string | null {
  const riga = rigaGrezza(testo)
  return riga ? pulita(riga) : null
}

/** Il testo comincia con la frase di chiusura: ha la forma di una consegna, cornice compresa. */
function conChiusura(p: string[]): boolean {
  return CHIUSURA.test((p[0] ?? '').split('\n')[0].trim())
}

/**
 * Una riga della cornice: fonti con i numeri, un'ipotesi dichiarata, un
 * «manca» quando c'è un segnaposto; e, sotto una prima riga «Fatto:», anche
 * un «assuming» e un «manca» nudi.
 */
function eDellaCornice(riga: string, o: { chiusura: boolean; segnaposto: boolean }): boolean {
  return /\[\d{1,2}\]/.test(riga) || IPOTESI_FORTE.test(riga)
    || (MANCA.test(riga) && (o.segnaposto || o.chiusura))
    || (o.chiusura && IPOTESI.test(riga))
}

/** Quanti paragrafi di cornice si tolgono dal fondo, al massimo: le fonti e l'ipotesi, quando stanno in due. */
const CORNICE_MAX = 2

/**
 * Il testo per chi riceve: senza la prima riga «Fatto:»/«Done:», senza i
 * paragrafi finali (al massimo due) in cui ogni riga è una riga della
 * cornice, e senza nessun [n]. Il segnaposto resta: è la cosa che lei deve
 * ancora riempire, e togliendolo la mail sembrerebbe finita.
 */
export function corpoPerChiRiceve(testo: string): string {
  const p = paragrafi(testo)
  if (!p.length || !p[0]) return ''
  const cornice = { chiusura: conChiusura(p), segnaposto: haSegnaposto(testo) }
  // la frase di chiusura sta sulla prima riga del primo paragrafo, da sola o no
  const primeRighe = p[0].split('\n')
  if (cornice.chiusura) {
    const resto = primeRighe.slice(1).join('\n').trim()
    if (resto) p[0] = resto
    else p.shift()
  }
  for (let tolti = 0; tolti < CORNICE_MAX && p.length > 1; tolti++) {
    const ultime = righeDi(p[p.length - 1])
    if (!ultime.length || !ultime.every(r => eDellaCornice(r, cornice))) break
    p.pop()
  }
  return p.map(x => x.replace(CITAZIONE, '')).join('\n\n').trim()
}

/**
 * Il testo da mostrare quando la riga dell'ipotesi è già mostrata da sola:
 * lo stesso testo senza quella riga. Se il paragrafo finale resta vuoto, se
 * ne va anche lui.
 */
export function senzaRigaIpotesi(testo: string): string {
  const riga = rigaGrezza(testo)
  if (!riga) return testo.trim()
  const p = paragrafi(testo)
  const fuori = p
    .map(paragrafo => paragrafo.split('\n').filter(r => r.trim() !== riga).join('\n').replace(/^\n+|\n+$/g, ''))
    .filter(paragrafo => paragrafo.trim())
  return fuori.join('\n\n').trim()
}
