/** Validate a civil date without allowing Date's silent month/day rollover. */
export function giornoValido(valore: unknown): valore is string {
  if (typeof valore !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valore)) return false
  const [anno, mese, giorno] = valore.split('-').map(Number)
  if (anno < 1900 || anno > 9999) return false
  const d = new Date(Date.UTC(anno, mese - 1, giorno))
  return d.getUTCFullYear() === anno && d.getUTCMonth() === mese - 1 && d.getUTCDate() === giorno
}

/**
 * L'ora di un'attività: «HH:MM», niente altro.
 *
 * Un compito ha un giorno, e da adesso può avere anche un'ora dentro quel
 * giorno. Non è un istante e non ha un fuso: è quello che si legge sull'orologio
 * lì dove sei, come il giorno è quello del calendario appeso al muro. Chi scrive
 * un'ora la scrive così o non la scrive: «9», «09:00:00», «21.30» e un istante
 * ISO intero sono tre modi di dire la stessa cosa, e tre modi vogliono dire che
 * fra un mese la griglia ne disegna due e ne sbaglia uno.
 *
 * Null è una cosa diversa da un'ora sbagliata: è «senza ora», cioè una riga che
 * vale per tutto il giorno. Quella la decide chi chiama, non questa.
 */
export function oraValida(valore: unknown): valore is string {
  if (typeof valore !== 'string' || !/^\d{2}:\d{2}$/.test(valore)) return false
  const [ore, minuti] = valore.split(':').map(Number)
  return ore >= 0 && ore <= 23 && minuti >= 0 && minuti <= 59
}
