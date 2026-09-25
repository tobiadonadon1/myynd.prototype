// La forma del file dell'imbuto della macchina e la sua riga: nessun
// import che apra qualcosa, così `npm run imbuto` non tocca nessun indice
// né nessun conto (vedi `imbuto.ts` per chi lo scrive).

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export type Passo = 'conto' | 'fonte' | 'lettura' | 'pagina' | 'gesto'
export type Dopo = Exclude<Passo, 'conto'>
export type Aggregato = { versione: 1; dal: string; passi: Record<Passo, number>; giornoUno: Record<Dopo, number> }

/** Non `RADICE/imbuto.json`: la cartella del conto di prima è `RADICE` stessa. */
export const fileMacchinaIn = (radice: string) => join(radice, 'misure', 'imbuto.json')

export const vuoto = (adesso: Date): Aggregato => ({
  versione: 1, dal: adesso.toISOString(),
  passi: { conto: 0, fonte: 0, lettura: 0, pagina: 0, gesto: 0 },
  giornoUno: { fonte: 0, lettura: 0, pagina: 0, gesto: 0 }
})

/** Il file della macchina sotto `radice`, se c'è. */
export function leggiAggregatoIn(radice: string): Aggregato | null {
  try {
    const a = JSON.parse(readFileSync(fileMacchinaIn(radice), 'utf8')) as Aggregato
    return a && a.versione === 1 && a.passi && a.giornoUno ? a : null
  } catch { return null }
}

const numero = (n: number, lingua: 'it' | 'en') => new Intl.NumberFormat(lingua === 'en' ? 'en-GB' : 'it-IT', { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions).format(n)

/** La riga di `npm run imbuto`. La quota è quella che conta: prima pagina vista il primo giorno, su conti nuovi. */
export function riga(a: Aggregato | null, lingua: 'it' | 'en' = 'it'): string {
  const x = a ?? vuoto(new Date())
  const n = (v: number) => numero(Math.max(0, Math.floor(Number(v) || 0)), lingua)
  const quota = x.passi.conto > 0 ? Math.round((x.giornoUno.pagina / x.passi.conto) * 100) : 0
  return lingua === 'en'
    ? `New accounts ${n(x.passi.conto)} · first source ${n(x.passi.fonte)} · first read ${n(x.passi.lettura)} · first page seen ${n(x.passi.pagina)} (day one ${n(x.giornoUno.pagina)}, ${quota}%) · first gesture ${n(x.passi.gesto)}`
    : `Conti nuovi ${n(x.passi.conto)} · prima fonte ${n(x.passi.fonte)} · prima lettura ${n(x.passi.lettura)} · prima pagina vista ${n(x.passi.pagina)} (giorno uno ${n(x.giornoUno.pagina)}, ${quota}%) · primo gesto ${n(x.passi.gesto)}`
}
