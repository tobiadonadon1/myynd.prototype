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

/**
 * Quante colonne di giorni: tre al massimo.
 *
 * Su una finestra larga ne mostrava sette, e sette colonne strette sono una
 * settimana che non si legge: «potrebbe farmene vedere tre, così i giorni
 * sono più alti e più larghi e ci sta più roba». La striscia della settimana
 * sopra resta per muoversi; le colonne sono oggi, domani, dopodomani.
 */
export function quantiGiorni(larghezza: number): number {
  return larghezza >= 650 ? 3 : larghezza >= 400 ? 2 : 1
}

export function giorniVisibili(giorno: string, quanti: number): string[] {
  const primo = quanti === 7 ? inizioSettimana(giorno) : giorno
  return Array.from({ length: quanti }, (_, i) => spostaGiorno(primo, i))
}

export function inizioMese(giorno: string): string {
  return `${giorno.slice(0, 7)}-01`
}

/**
 * Un mese avanti o indietro, tenendo il giorno del mese dove esiste.
 *
 * Il 31 di gennaio più un mese è il 28 di febbraio, non il 3 di marzo: si
 * taglia all'ultimo giorno del mese d'arrivo. Serve alle frecce della vista
 * intera, che cambiano mese senza perdere il giorno scelto.
 */
export function spostaMese(giorno: string, passi: number): string {
  const [anno, mese, giornoDelMese] = giorno.split('-').map(Number)
  const ultimo = new Date(anno, mese - 1 + passi + 1, 0).getDate()
  return giornoLocale(new Date(anno, mese - 1 + passi, Math.min(giornoDelMese, ultimo), 12))
}

/**
 * Le caselle della vista intera: settimane intere, da lunedì a domenica.
 *
 * Un mese non comincia di lunedì quasi mai, e una griglia che parte storta non
 * si legge: si parte dal lunedì della settimana in cui cade il primo, si
 * finisce alla domenica della settimana in cui cade l'ultimo. Le caselle dei
 * giorni fuori dal mese restano — hanno le loro cose sopra, e toglierle
 * vorrebbe dire nasconderle.
 */
export function celleDelMese(giorno: string): string[] {
  const ultimo = spostaGiorno(inizioMese(spostaMese(inizioMese(giorno), 1)), -1)
  const celle: string[] = []
  for (let g = inizioSettimana(inizioMese(giorno)); g <= ultimo || celle.length % 7; g = spostaGiorno(g, 1)) celle.push(g)
  return celle
}

/** Quante cose non stanno nella casella: il «+N» sotto le targhette. */
export function quantiInPiu(quante: number, mostrate: number): number {
  return Math.max(0, quante - mostrate)
}
