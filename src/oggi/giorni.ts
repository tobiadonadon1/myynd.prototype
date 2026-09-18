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

/* ————— La settimana aperta: la griglia a ore, il mesetto, gli eventi ————— */

/** Le sette colonne di una settimana: lunedì, e poi gli altri sei. */
export function colonneSettimana(giorno: string): string[] {
  return giorniVisibili(giorno, 7)
}

/**
 * Le righe della griglia: un'ora ciascuna, tutte e ventiquattro.
 *
 * La griglia tiene il giorno intero e si scorre; quello che si vede all'inizio
 * è un'altra cosa — sta in `ORE_IN_VISTA` — e si ottiene mettendo quella fascia
 * in cima allo scorrimento. Disegnare solo dalle sei alle ventidue avrebbe
 * voluto dire che una cena alle ventitré non esiste: c'è, e basta scendere.
 */
export function righeOre(da = 0, a = 24): number[] {
  return Array.from({ length: Math.max(0, a - da) }, (_, i) => da + i)
}

/** Quello che si vede senza scorrere: la giornata di chi lavora. */
export const ORE_IN_VISTA = { da: 6, a: 22 }

/** La mezzanotte civile di un giorno. */
export function mezzanotte(giorno: string): Date {
  const [anno, mese, data] = giorno.split('-').map(Number)
  return new Date(anno, mese - 1, data)
}

/** Minuti dalla mezzanotte di quel giorno: negativi se comincia il giorno prima. */
export function minutiDa(giorno: string, iso: string): number {
  return (new Date(iso).getTime() - mezzanotte(giorno).getTime()) / 60000
}

/**
 * Dove cade un evento dentro la griglia, in frazione dell'altezza.
 *
 * Torna `null` quando l'evento non tocca la fascia disegnata: una riunione di
 * ieri notte non deve lasciare un blocco alto zero appiccicato in cima. Quello
 * che entra solo per metà si taglia ai bordi, così un evento che comincia alle
 * ventitré e finisce all'una comincia dov'è e finisce col giorno.
 *
 * Il quarto d'ora minimo non è cosmesi: un evento di dieci minuti disegnato
 * alto dieci minuti è una riga che non si legge e non si clicca.
 */
export function posaEvento(giorno: string, inizio: string, fine: string, da = 0, a = 24):
  { top: number; altezza: number } | null {
  const primo = da * 60
  const ultimo = a * 60
  if (ultimo <= primo) return null
  const i = minutiDa(giorno, inizio)
  const f = Math.max(minutiDa(giorno, fine), i + 15)
  if (f <= primo || i >= ultimo) return null
  const alto = Math.max(i, primo)
  const basso = Math.min(f, ultimo)
  return { top: (alto - primo) / (ultimo - primo), altezza: (basso - alto) / (ultimo - primo) }
}

/** Dov'è adesso nella colonna di un giorno, o `null` se adesso è altrove. */
export function posaAdesso(giorno: string, adesso = new Date(), da = 0, a = 24): number | null {
  const m = (adesso.getTime() - mezzanotte(giorno).getTime()) / 60000
  if (m < da * 60 || m > a * 60) return null
  return (m - da * 60) / ((a - da) * 60)
}

/**
 * Gli eventi che si accavallano, messi uno accanto all'altro.
 *
 * Sovrapposti vuol dire illeggibili: due riunioni alle dieci diventano un
 * blocco solo e una delle due sparisce. Si raggruppano quelli che si toccano a
 * catena — A tocca B, B tocca C, e allora sono tre colonne anche se A e C non
 * si sfiorano — e dentro il gruppo ognuno prende la prima colonna libera.
 * Fuori dal gruppo si ricomincia da una colonna sola, così la settimana non si
 * stringe tutta per una mattina affollata.
 */
export function affianca<T extends { inizio: string; fine: string }>(eventi: T[]):
  { evento: T; colonna: number; colonne: number }[] {
  const ordinati = [...eventi].sort((x, y) =>
    x.inizio < y.inizio ? -1 : x.inizio > y.inizio ? 1 : x.fine < y.fine ? -1 : x.fine > y.fine ? 1 : 0)
  const fuori: { evento: T; colonna: number; colonne: number }[] = []
  let gruppo: { evento: T; colonna: number; colonne: number }[] = []
  let libere: number[] = []   // per ogni colonna, il momento in cui si libera
  let finisce = -Infinity

  const chiudi = () => {
    for (const r of gruppo) r.colonne = libere.length
    fuori.push(...gruppo)
    gruppo = []
    libere = []
    finisce = -Infinity
  }

  for (const e of ordinati) {
    const i = new Date(e.inizio).getTime()
    const f = Math.max(new Date(e.fine).getTime(), i)
    if (i >= finisce) chiudi()
    let colonna = libere.findIndex(q => q <= i)
    if (colonna < 0) { colonna = libere.length; libere.push(f) } else libere[colonna] = f
    finisce = Math.max(finisce, f)
    gruppo.push({ evento: e, colonna, colonne: 1 })
  }
  chiudi()
  return fuori
}

/**
 * Il mesetto della colonna: sei righe da sette, sempre.
 *
 * `celleDelMese` ne dà quattro, cinque o sei a seconda di come cade il mese, e
 * una colonna che cambia altezza quando si gira pagina fa saltare tutto quello
 * che sta sotto. Si aggiunge la settimana che segue: sono giorni veri,
 * cliccabili, e smorti come gli altri fuori dal mese.
 */
export function miniMese(giorno: string): string[][] {
  const celle = [...celleDelMese(giorno)]
  while (celle.length < 42) celle.push(spostaGiorno(celle[celle.length - 1], 1))
  return Array.from({ length: 6 }, (_, r) => celle.slice(r * 7, r * 7 + 7))
}
