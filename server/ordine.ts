// L'ordine di una lista che si riordina a mano.
//
// Il problema sembra banale finché non lo si guarda: se l'ordine è un numero
// intero, spostare una riga in cima significa riscrivere ogni riga sotto. Su
// una lista sola non si nota; su due dispositivi che si sincronizzano diventa
// un conflitto per ogni riga toccata, ogni volta.
//
// La soluzione è tenere l'ordine come una *chiave frazionaria*: una stringa che
// si confronta alfabeticamente, e fra due stringhe qualsiasi ce n'è sempre
// un'altra in mezzo. Spostare una riga tocca quella riga e basta — le altre non
// sanno che è successo qualcosa, e due telefoni che riordinano pezzi diversi
// della stessa lista non si pestano i piedi.
//
// L'algoritmo è quello descritto da Figma per i loro livelli, riscritto qui.
// La parte delicata è l'invariante sullo zero finale: una chiave non può
// finire con la cifra più bassa, altrimenti non esiste più niente fra lei e
// quella prima — ed è esattamente il caso che si presenta dopo qualche decina
// di trascinamenti, cioè quando ormai nessuno sta più guardando.

const CIFRE = '0123456789abcdefghijklmnopqrstuvwxyz'
const ZERO = CIFRE[0]

/**
 * Una chiave a metà fra `prima` e `dopo`.
 *
 * `prima` vuota significa «non c'è niente sopra», `dopo` vuota «non c'è niente
 * sotto». Con tutte e due vuote — la prima riga di una lista vuota — torna la
 * cifra di mezzo, così c'è spazio da entrambe le parti fin dall'inizio.
 */
export function fra(prima: string, dopo: string): string {
  // Le due guardie che l'algoritmo originale ha e che è facile lasciare
  // indietro. Non servono finché le chiavi le genera solo questo file — servono
  // il giorno che ne arriva una da un telefono, che è il motivo per cui il file
  // esiste. Senza, `fra('', '0')` torna '00i', che sta DOPO il suo stesso
  // limite: l'ordine si rompe e nessuno se ne accorge.
  for (const k of [prima, dopo]) {
    if (k && [...k].some(ch => !CIFRE.includes(ch))) {
      throw new Error(`ordine: «${k}» non è una chiave`)
    }
    if (k.endsWith(ZERO)) {
      throw new Error(`ordine: «${k}» finisce con lo zero, sotto non c'è più spazio`)
    }
  }
  if (prima && dopo && prima >= dopo) {
    throw new Error(`ordine: «${prima}» non viene prima di «${dopo}»`)
  }
  return mezzo(prima, dopo || undefined)
}

function mezzo(a: string, b?: string): string {
  if (b !== undefined) {
    // il prefisso in comune si porta avanti tale e quale: il punto in cui le
    // due chiavi si separano è l'unico dove c'è una decisione da prendere
    let n = 0
    while ((a[n] || ZERO) === b[n]) n++
    if (n > 0) return b.slice(0, n) + mezzo(a.slice(n), b.slice(n))
  }

  const ia = a ? CIFRE.indexOf(a[0]) : 0
  const ib = b !== undefined ? CIFRE.indexOf(b[0]) : CIFRE.length

  if (ib - ia > 1) return CIFRE[Math.round((ia + ib) / 2)]

  // le due cifre sono attaccate: non c'è spazio qui, si scende di un livello.
  // Sotto, il limite di sopra sparisce — «fra 49 e 5» diventa «dopo 9», e la
  // chiave cresce di un carattere invece di non esistere.
  if (b !== undefined && b.length > 1) return b.slice(0, 1)
  return CIFRE[ia] + mezzo(a.slice(1), undefined)
}

/** La chiave per una riga messa in fondo a una lista che finisce con `ultima`. */
export function dopo(ultima: string): string {
  return fra(ultima, '')
}

/** La chiave per una riga messa in cima a una lista che comincia con `prima`. */
export function prima(primaChiave: string): string {
  return fra('', primaChiave)
}
