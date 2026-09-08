/** Calendar dates are local civil days, never UTC timestamps. */
export function giornoLocale(data = new Date()): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`
}

export function dataLocale(giorno: string): Date {
  const [anno, mese, data] = giorno.split('-').map(Number)
  return new Date(anno, mese - 1, data, 12)
}

export function spostaGiorno(giorno: string, passi: number): string {
  const data = dataLocale(giorno)
  data.setDate(data.getDate() + passi)
  return giornoLocale(data)
}

export function inizioSettimana(giorno: string): string {
  return spostaGiorno(giorno, -((dataLocale(giorno).getDay() + 6) % 7))
}

export function giornoCompito(c: { giorno?: string | null; quando: string }, oggi: string): string | null {
  return c.giorno || (c.quando === 'oggi' ? oggi : null)
}

export function secchioDelGiorno(giorno: string | null, oggi = giornoLocale()): 'oggi' | 'settimana' | 'poi' {
  return !giorno ? 'poi' : giorno <= oggi ? 'oggi' : 'settimana'
}

export function quantiGiorni(larghezza: number): number {
  return larghezza >= 1220 ? 7 : larghezza >= 650 ? 3 : larghezza >= 400 ? 2 : 1
}

export function giorniVisibili(giorno: string, quanti: number): string[] {
  const primo = quanti === 7 ? inizioSettimana(giorno) : giorno
  return Array.from({ length: quanti }, (_, i) => spostaGiorno(primo, i))
}
