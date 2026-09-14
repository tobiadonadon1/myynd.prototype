// Un documento vero, e non un file qualunque.
//
// Dal disco arriva quasi solo rumore, e per un pezzo lo raccontava il punto:
// «il dev server di tobiaweb è ripartito più volte», che veniva da un log di
// terminale entrato nell'indice come tutti gli altri file. La regola era già
// scritta — stava dentro `punto.ts` — e valeva solo per il punto. Poi la
// stessa cosa è tornata dal feed: una voce «Da leggere» su «large-object
// promisors» in Git, nata da un file di documentazione dentro l'albero di un
// installatore. Due schermate diverse, lo stesso difetto, e una regola sola
// che ne copriva una.
//
// Quindi la regola sta qui, dove la può chiamare chiunque scelga cosa mostrare
// a una persona: il punto, il feed, e quello che verrà dopo. Il disco resta
// tutto cercabile e tutto leggibile quando serve — non è un filtro
// sull'indice, è un filtro su *cosa si racconta*.

import type { Documento } from './store.ts'

/**
 * Dove le cose vere arrivano.
 *
 * La scrivania, i documenti, gli scaricati, iCloud: sono le quattro cartelle
 * in cui una persona mette — o riceve — le cose che contano. Tutto il resto
 * del disco esiste, si cerca, si legge quando serve: semplicemente non si
 * racconta.
 */
const CARTELLE_DOC = ['Desktop', 'Documents', 'Downloads', 'Library/Mobile Documents/com~apple~CloudDocs']
/** Il file, o una cartella sola sotto: più giù è archivio, non è arrivato adesso. */
const PROFONDITA_DOC = 2
/** Una fattura, un contratto, una bozza. Non un txt, non un markdown, non un csv. */
const ESTENSIONE_DOC = /\.(pdf|docx?|xlsx?|pptx?|pages|numbers|key|odt|ods|odp|rtf)$/i

/**
 * Questo documento si può raccontare a una persona.
 *
 * Le altre fonti passano tutte: una mail, un impegno, una nota, una pagina di
 * Notion, una trascrizione sono già, per come sono arrivate, cose che qualcuno
 * ha mandato o scritto apposta. Dal disco invece passa solo quello che ha la
 * forma di un documento — un'estensione da documento, in una delle cartelle
 * dove le cose arrivano, e non dieci cartelle più sotto.
 */
export function documentoVero(d: Documento): boolean {
  if (d.fonte !== 'desktop') return true
  const p = (d.percorso || d.id.replace(/^desktop:/, '')).replace(/\\/g, '/')
  if (!ESTENSIONE_DOC.test(p)) return false
  return CARTELLE_DOC.some(c => {
    const i = p.indexOf(`/${c}/`)
    if (i < 0) return false
    const dentro = p.slice(i + c.length + 2)
    return !!dentro && dentro.split('/').length <= PROFONDITA_DOC
  })
}
