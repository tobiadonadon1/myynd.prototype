// Quanto è stato ritoccato un testo: la distanza fra la bozza di Myynd e quello
// che è partito davvero.
//
// Serve a tre lavori (P1, P3, P9) per la stessa domanda: la bozza l'ha mandata
// com'era, l'ha sistemata, o l'ha riscritta? La misura è a parole, non a
// lettere: «Ciao Marco» → «Buongiorno Marco» è una parola cambiata su due, non
// sette lettere su dieci, ed è così che lo direbbe una persona.
//
// Le parole si confrontano in minuscolo e senza punteggiatura: una virgola
// aggiunta o una maiuscola non sono un ritocco. La distanza è quella di
// Levenshtein sulle parole (inserire, togliere o cambiare una parola costa uno),
// divisa per la lunghezza del testo più lungo: zero vuol dire identico, uno
// vuol dire che non si è salvata una parola.
//
// Puro, senza stato e senza I/O: si può chiamare da qualunque parte.

/** Sotto questa soglia (compresa) è un ritocco: qualche parola, il senso è quello. */
export const SOGLIA_RITOCCO = 0.15
/** Sotto questa soglia (compresa) è modificato; sopra, riscritto. */
export const SOGLIA_MODIFICATO = 0.5
/**
 * Quante parole si confrontano al massimo, per testo.
 *
 * Il calcolo è quadratico: seimila parole per parte sono trentasei milioni di
 * passi, una frazione di secondo. Oltre, si confronta la testa: una mail di
 * seimila parole cambiata solo in fondo è comunque «quasi identica».
 */
export const PAROLE_MAX = 6000

export type Classe = 'identico' | 'ritocco' | 'modificato' | 'riscritto'

/** Le parole di un testo: minuscole, senza punteggiatura, accenti compresi. */
export function parole(testo: string | null | undefined): string[] {
  return String(testo ?? '')
    .toLowerCase()
    .normalize('NFC')
    // tutto quello che non è una lettera o una cifra separa le parole:
    // punteggiatura, virgolette, trattini, simboli
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

/**
 * La distanza fra due testi, da 0 (identici) a 1 (niente in comune).
 *
 * Due testi vuoti sono identici; uno vuoto e uno no sono all'opposto.
 */
export function ritocco(a: string | null | undefined, b: string | null | undefined): number {
  const x = parole(a).slice(0, PAROLE_MAX)
  const y = parole(b).slice(0, PAROLE_MAX)
  const lungo = Math.max(x.length, y.length)
  if (!lungo) return 0
  if (!x.length || !y.length) return 1

  // le parole diventano numeri: confrontare interi è molto più svelto che
  // confrontare stringhe, ed è la parte che si ripete milioni di volte
  const dizionario = new Map<string, number>()
  const codice = (p: string) => {
    let c = dizionario.get(p)
    if (c === undefined) { c = dizionario.size; dizionario.set(p, c) }
    return c
  }
  const xs = Int32Array.from(x, codice)
  const ys = Int32Array.from(y, codice)

  // le due righe classiche: la precedente e quella che si sta scrivendo
  let prima = new Int32Array(ys.length + 1)
  let ora = new Int32Array(ys.length + 1)
  for (let j = 0; j <= ys.length; j++) prima[j] = j
  for (let i = 1; i <= xs.length; i++) {
    ora[0] = i
    const xi = xs[i - 1]
    for (let j = 1; j <= ys.length; j++) {
      const sostituisci = prima[j - 1] + (xi === ys[j - 1] ? 0 : 1)
      const togli = prima[j] + 1
      const metti = ora[j - 1] + 1
      ora[j] = sostituisci < togli ? (sostituisci < metti ? sostituisci : metti) : (togli < metti ? togli : metti)
    }
    const t = prima; prima = ora; ora = t
  }
  return prima[ys.length] / lungo
}

/** Il nome di una distanza: identico, ritocco, modificato o riscritto. */
export function classe(r: number): Classe {
  if (!(r > 0)) return 'identico'
  if (r <= SOGLIA_RITOCCO) return 'ritocco'
  if (r <= SOGLIA_MODIFICATO) return 'modificato'
  return 'riscritto'
}
