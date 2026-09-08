/** Small, bounded workflow interpreter. Each step consumes the previous result. */
export type Passo = { id: string; tipo: 'condizione' | 'trasforma'; testo: string }
export function validaPassi(value: unknown): Passo[] {
  if (!Array.isArray(value) || value.length > 6) throw new Error('A workflow supports up to six steps.')
  const ids = new Set<string>()
  for (const p of value) {
    if (!p || typeof p.id !== 'string' || !p.id || ids.has(p.id) ||
      !['condizione', 'trasforma'].includes(p.tipo) || typeof p.testo !== 'string' ||
      !p.testo.trim() || p.testo.length > 4000) throw new Error('Each step needs a unique ID, a type and an instruction.')
    ids.add(p.id)
  }
  return value
}
export async function eseguiPassi(passi: Passo[], materiale: string,
  esegui: (passo: Passo, input: string) => Promise<{ continua: boolean; testo: string }>) {
  let testo = materiale
  for (const passo of validaPassi(passi)) {
    const r = await esegui(passo, testo)
    if (!r || typeof r.continua !== 'boolean' || typeof r.testo !== 'string') throw new Error('The workflow step did not return a valid result.')
    if (passo.tipo === 'condizione' && !r.continua) return null
    if (passo.tipo === 'trasforma') {
      if (!r.testo.trim()) throw new Error('The workflow step returned an empty result.')
      testo = r.testo.slice(0, 24000)
    }
  }
  return testo
}
