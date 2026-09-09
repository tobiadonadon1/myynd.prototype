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
