// Dove era arrivata la lettura di ieri.
//
// Ogni connettore ha un tetto per giro — quattrocento messaggi, ottocento
// pagine, milleduecento file — e quel tetto è quello che tiene un giro dentro
// una durata onesta: senza, la prima lettura di un Drive aziendale sarebbe un
// pomeriggio di richieste e nessuno saprebbe se è viva o appesa.
//
// Il guaio non era il tetto: era che ogni giro ripartiva dallo stesso punto.
// Un Drive con cinquemila file ne leggeva milleduecento alle sei, gli stessi
// milleduecento a mezzogiorno e gli stessi alle sei di sera; gli altri
// tremilaottocento non li avrebbe letti **mai**, e da fuori l'indice sembrava
// finito. Il brief promette un cervello che ha letto tutto: un cervello che si
// ferma sempre alla stessa riga non è indietro, è bugiardo.
//
// Qui si tiene il segno. Un segno per fonte, una stringa che vuol dire qualcosa
// solo al connettore che l'ha scritta — una data di modifica, l'id di un
// canale, un cursore di Notion — e una regola sola: `null` significa «sono
// arrivato in fondo», e il giro dopo riparte dall'inizio.
//
// Lo tiene `store`, che sta su disco ed è già per persona: con più gente sullo
// stesso server, un segno condiviso vorrebbe dire il Drive di uno che fa saltare
// mezzo Drive a un altro — e sarebbe invisibile, perché un segno sbagliato non
// dà nessun errore. Dà dei documenti che non arrivano.

import * as store from '../store.ts'

/** Da dove riprendere. `null` quando la lettura scorsa era arrivata in fondo. */
export function daDove(fonte: string): string | null {
  return store.cursore(fonte)
}

/** Dove è arrivata questa. `null` vuol dire «finita»: il giro dopo riparte da capo. */
export function segna(fonte: string, valore: string | null): void {
  store.segnaCursore(fonte, valore)
}

/** Da usare nelle prove: torna al punto di partenza per queste fonti. */
export function scorda(...fonti: string[]): void {
  for (const f of fonti) segna(f, null)
}

/**
 * Quanto manca, detto in modo che una schermata possa scriverlo.
 *
 * `troncato` da solo diceva «non ho finito» e basta, ed è la ragione per cui
 * nessuno si è mai accorto dei tremilaottocento file mai letti: una spia che
 * non dice quanto è grande il buco è una spia che si impara a ignorare.
 * «3400 di 5000» invece è una frase che qualcuno guarda e capisce.
 *
 * I campi sono facoltativi perché non tutte le fonti sanno contare: Notion non
 * dice quante pagine ha finché non le ha date tutte, e inventare un totale
 * sarebbe peggio che non darlo.
 */
export type Resto = {
  /** Non è rimasto niente indietro: questa fonte è tutta dentro. */
  aGiorno: boolean
  /** Quanti ce n'erano in tutto, quando la fonte lo sa dire. */
  totale?: number
  /** Quanti ne sono passati per l'indice fin qui, dello stesso totale. */
  letti?: number
  /** Quanti restano fuori. Zero e `aGiorno` vogliono dire la stessa cosa. */
  restano?: number
}

/** Il resto di una fonte che sa contare quello che ha davanti. */
export function resto(letti: number, totale: number): Resto {
  const restano = Math.max(0, totale - letti)
  return { aGiorno: restano === 0, totale, letti, restano }
}

/**
 * Da che punto dell'elenco ripartire.
 *
 * Le fonti di file — Drive, Dropbox, SharePoint — sanno elencare tutto quello
 * che hanno: è aprire i file che costa. Quindi ogni giro l'elenco si rifà
 * intero (poche chiamate, solo nomi e date), e il segno serve a ritrovare la
 * riga a cui ci si era fermati.
 *
 * Cercare il segno per uguaglianza e non per posizione è la parte che conta: fra
 * un giro e l'altro qualcuno aggiunge un file, e una posizione salvata come
 * numero punterebbe a una riga diversa — cioè salterebbe esattamente un
 * documento, in silenzio.
 *
 * `piuVecchio` è il ripiego per quando il file segnato non c'è più: si riparte
 * dal primo più vecchio di lui. Chi non ce l'ha — Slack, che segna un canale e
 * non una data — ricomincia da capo, che per sessanta canali costa poco.
 */
export function riprendi<T>(
  fonte: string,
  elenco: T[],
  segnoDi: (x: T) => string,
  piuVecchio?: (x: T, segno: string) => boolean
): { da: number; ripreso: boolean } {
  const segno = daDove(fonte)
  if (!segno) return { da: 0, ripreso: false }
  const i = elenco.findIndex(x => segnoDi(x) === segno)
  if (i >= 0) return { da: i + 1, ripreso: true }
  if (!piuVecchio) return { da: 0, ripreso: false }
  const j = elenco.findIndex(x => piuVecchio(x, segno))
  return j >= 0 ? { da: j, ripreso: true } : { da: 0, ripreso: false }
}
