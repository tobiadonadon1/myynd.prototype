/** Validate a civil date without allowing Date's silent month/day rollover. */
export function giornoValido(valore: unknown): valore is string {
  if (typeof valore !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valore)) return false
  const [anno, mese, giorno] = valore.split('-').map(Number)
  if (anno < 1900 || anno > 9999) return false
  const d = new Date(Date.UTC(anno, mese - 1, giorno))
  return d.getUTCFullYear() === anno && d.getUTCMonth() === mese - 1 && d.getUTCDate() === giorno
}
