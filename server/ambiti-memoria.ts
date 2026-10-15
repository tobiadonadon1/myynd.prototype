/*
 * I testi lunghi già normalizzati. Lo stesso documento si confronta con ogni
 * progetto (`progetti.tocca`, tre o quattro volte per progetto): la pagina dei
 * Progetti con dieci progetti normalizzava ogni corpo una quarantina di volte.
 * È una funzione pura del testo, uguale per chiunque chieda; si svuota intera
 * quando si riempie.
 */
const normalizzati = new Map<string, string>()
const NORMALIZZATI_MAX = 2000

/** I nomi sono entità: Acme non è AcmeCloud, né Rossi è Rossini. */
export function nomeNormalizzato(testo: string): string {
  if (testo.length < 200) return normalizza(testo)
  const gia = normalizzati.get(testo)
  if (gia !== undefined) return gia
  const fatto = normalizza(testo)
  if (normalizzati.size >= NORMALIZZATI_MAX) normalizzati.clear()
  normalizzati.set(testo, fatto)
  return fatto
}

const insiemi = new Map<string, Set<string>>()
/** Le parole di un testo normalizzato, come insieme: per i testi lunghi, fatto una volta. Non va cambiato da chi lo riceve. */
export function paroleNormalizzate(testo: string): ReadonlySet<string> {
  if (testo.length < 200) return new Set(normalizza(testo).split(' '))
  const gia = insiemi.get(testo)
  if (gia) return gia
  const fatto = new Set(nomeNormalizzato(testo).split(' '))
  if (insiemi.size >= NORMALIZZATI_MAX) insiemi.clear()
  insiemi.set(testo, fatto)
  return fatto
}

function normalizza(testo: string): string {
  return (testo.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').match(/[\p{L}\p{N}]+/gu) ?? []).join(' ')
}

export function nominaAmbito(testo: string, nome: string): boolean {
  const entita = nomeNormalizzato(nome)
  if (entita.replace(/ /g, '').length < 3) return false
  return ` ${nomeNormalizzato(testo)} `.includes(` ${entita} `)
}
