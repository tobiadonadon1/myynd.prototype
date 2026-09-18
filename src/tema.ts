// Il tema: i pochi valori da cui discende tutto il resto.
//
// Un'identità sola, due mondi. Il palco — l'accesso e il primo avvio — è
// inchiostro con la luce di rame; la scrivania — l'app — è avorio con lo
// stesso rame come unico accento. Stesso marchio, stesso carattere per i
// titoli, stessi raggi, stessa pastiglia: cambia solo il fondo, come fra la
// copertina e le pagine di uno stesso libro.
//
// Il verde salvia non è più un colore d'identità: resta solo dove vuol dire
// una cosa — «collegato», «pronto» — e mai come decorazione.

/** Il rame: l'unico accento. */
export const RAME = '#C4623B'
export const RAME_CUPO = '#8E3F1F'
export const AMBRA = '#D98A5A'
export const RAME_PROFONDO = '#B24E2E'
/** L'inchiostro del testo, e il fondo del palco. */
export const INCHIOSTRO = '#22271F'
export const PALCO = '#090706'
/** L'avorio: la carta della scrivania, e il testo sul palco. */
export const AVORIO = '#FFF7F0'
export const AVORIO_PALCO = '#F6F2EB'
export const SABBIA = '#EFE6DA'
/** Solo per gli stati: collegato, pronto, fatto. */
export const SALVIA = '#5C7660'

/** Il gradiente dell'azione principale: rame che scalda verso l'ambra. */
export const GRADIENTE = `linear-gradient(120deg,${RAME_PROFONDO},${AMBRA})`

/** I titoli: un serif con le grazie, lo stesso del primo avvio. Il resto è Helvetica Neue. */
export const SERIF = "'Iowan Old Style','Baskerville','Times New Roman',serif"

/** Tre raggi e una pastiglia: ogni riquadro ne usa uno. */
export const RAGGIO = { piccolo: 10, medio: 14, carta: 20, pastiglia: 99 } as const

/* ————— Chiaro, scuro, o come il sistema ————— */

/**
 * La scelta sull'ora del giorno.
 *
 * `sistema` è il valore di serie e non è un ripiego: chi mette il Mac in scuro
 * la sera vuole che anche Myynd la smetta di illuminargli la stanza, senza
 * doverglielo dire due volte.
 *
 * Quello che cambia davvero sta in `index.css`, non qui: la tavolozza è un
 * elenco di variabili, questo mette solo `data-theme` sulla radice e le fa
 * cambiare tutte insieme.
 */
export type TemaScelto = 'sistema' | 'chiaro' | 'scuro'

export function temaValido(x: unknown): TemaScelto {
  return x === 'chiaro' || x === 'scuro' ? x : 'sistema'
}

/**
 * La chiave nel browser.
 *
 * Il tema sta anche sul server — è una preferenza come la lingua, e chi entra
 * da un altro computer se la ritrova — ma il server risponde dopo il primo
 * disegno, e un lampo di panna prima della notte è esattamente la cosa che
 * questa riga esiste per evitare. Qui c'è l'ultima scelta fatta, e si legge
 * prima di montare qualsiasi cosa.
 */
const CHIAVE_TEMA = 'myynd.tema'

export function temaSalvato(): TemaScelto {
  try { return temaValido(localStorage.getItem(CHIAVE_TEMA)) } catch { return 'sistema' }
}

/**
 * Mette la scelta sulla pagina.
 *
 * `sistema` non scrive niente: senza attributo comanda la media query, che è
 * l'unica che sa cosa ha scelto chi usa il computer — e che continua a saperlo
 * se lo cambia mentre Myynd è aperto.
 */
export function applicaTema(scelto: TemaScelto) {
  const html = document.documentElement
  if (scelto === 'sistema') html.removeAttribute('data-theme')
  else html.setAttribute('data-theme', scelto === 'scuro' ? 'dark' : 'light')
}

/** La scelta, applicata e ricordata. */
export function ricordaTema(scelto: TemaScelto) {
  applicaTema(scelto)
  try { localStorage.setItem(CHIAVE_TEMA, scelto) } catch { /* incognito */ }
}
