/*
 * L'ora di un'attività, dentro la settimana aperta.
 *
 * «Dovunque clicco sul calendario mi chiede di aggiungere qualcosa, ma le
 * attività non vengono aggiunte a un'ora precisa della mia giornata.» Era vero
 * e la ragione stava in fondo: un compito aveva il giorno e basta. Si premeva
 * sulle dieci di giovedì, la carta si apriva con dentro le dieci, e la riga
 * nasceva in cima — nella fascia del tutto il giorno — come se quell'ora non
 * fosse mai stata detta.
 *
 * Adesso un compito può avere un'ora, `HH:MM`, dentro il suo giorno. Non è un
 * istante e non ha un fuso: è quello che si legge sull'orologio lì dove sei,
 * come il giorno è quello del calendario appeso al muro. Chi non ce l'ha resta
 * dov'era, nella fascia: la maggior parte delle cose da fare non ha un'ora, e
 * darne una d'ufficio vorrebbe dire inventarsi un impegno che nessuno ha preso.
 *
 * Un compito con l'ora si disegna alto un'ora e non ha una fine scritta da
 * nessuna parte. È una scelta, non una mancanza: una durata da chiedere sarebbe
 * una domanda in più su ogni riga, e un blocco alto dieci minuti non si legge e
 * non si prende col dito.
 */
import { giornoCompito, mezzanotte, posaEvento } from './oggi/giorni.ts'

/** Quanto è alta sulla griglia un'attività con l'ora: un'ora piena. */
export const DURATA_COMPITO = 60

const dueCifre = (n: number) => String(n).padStart(2, '0')

/** Un'ora scritta bene: `HH:MM`, dalle 00:00 alle 23:59. Tutto il resto non è un'ora. */
export function oraValida(valore: unknown): valore is string {
  if (typeof valore !== 'string' || !/^\d{2}:\d{2}$/.test(valore)) return false
  const [ore, minuti] = valore.split(':').map(Number)
  return ore >= 0 && ore <= 23 && minuti >= 0 && minuti <= 59
}

/** L'ora di un'attività, se ne ha una da disegnare. Null vuol dire «tutto il giorno». */
export function oraDi(c: { ora?: string | null }): string | null {
  return oraValida(c.ora) ? c.ora : null
}

/** I minuti dalla mezzanotte di un'ora `HH:MM`. */
export function minutiDaOra(hhmm: string): number {
  const [o, m] = hhmm.split(':').map(Number)
  return (Number.isFinite(o) ? o : 0) * 60 + (Number.isFinite(m) ? m : 0)
}

/** L'ora `HH:MM` di un certo minuto del giorno: oltre la mezzanotte si riavvolge. */
export function oraDaMinuti(minuti: number): string {
  const m = ((Math.round(minuti) % 1440) + 1440) % 1440
  return `${dueCifre(Math.floor(m / 60))}:${dueCifre(m % 60)}`
}

/** L'istante di un certo minuto di un giorno civile, come lo scrive l'agenda. */
export function istante(giorno: string, minuti: number): string {
  return new Date(mezzanotte(giorno).getTime() + minuti * 60000).toISOString()
}

/** Dove cade un'attività con l'ora dentro la griglia, in frazione dell'altezza. */
export function posaCompito(giorno: string, ora: string | null | undefined, da = 0, a = 24):
  { top: number; altezza: number } | null {
  if (!oraValida(ora)) return null
  const i = minutiDaOra(ora)
  return posaEvento(giorno, istante(giorno, i), istante(giorno, i + DURATA_COMPITO), da, a)
}

/** Un compito, per quel tanto che serve a decidere dove va disegnato. */
type Pianificato = { giorno?: string | null; quando: string; ora?: string | null }
/** Un evento dell'agenda, per la stessa ragione. */
type Impegno = { inizio: string; fine: string; tuttoIlGiorno: boolean }

/**
 * Le attività di un giorno, divise in due: quelle con l'ora e quelle senza.
 *
 * È il cuore della cosa e sta qui, fuori dalla schermata, perché è l'unico
 * pezzo che si può sbagliare in silenzio: un'ora storta, un giorno che non è
 * quello, e una riga finisce nella fascia quando doveva stare alle dieci — o,
 * peggio, sparisce da tutt'e due i posti. Una riga di questa lista sta in uno
 * e uno solo dei due mucchi, sempre.
 */
export function compitiDelGiorno<T extends Pianificato>(compiti: T[], giorno: string, oggi: string):
  { aOre: T[]; tuttoIlGiorno: T[] } {
  const suoi = compiti.filter(c => giornoCompito(c, oggi) === giorno)
  return {
    aOre: suoi.filter(c => oraDi(c) !== null),
    tuttoIlGiorno: suoi.filter(c => oraDi(c) === null)
  }
}

/** Quello che sta nella griglia delle ore: un evento del Mac, o un'attività con l'ora. */
export type SullaGriglia<E, C> =
  | { tipo: 'evento'; inizio: string; fine: string; evento: E }
  | { tipo: 'compito'; inizio: string; fine: string; compito: C }

/**
 * Tutto quello che quel giorno va disegnato nelle ore, eventi e attività insieme.
 *
 * Insieme e non in due liste separate perché è così che si affiancano: una
 * chiamata alle dieci e una cosa da fare alle dieci sono due blocchi che si
 * contendono la stessa mezz'ora, e dividerli vorrebbe dire disegnarne uno
 * sopra l'altro. Chi riceve questa lista la passa ad `affianca`, che non
 * distingue fra le due cose — non deve.
 */
export function nellaGriglia<E extends Impegno, C extends Pianificato>(
  giorno: string, eventi: E[], compiti: C[], oggi: string
): SullaGriglia<E, C>[] {
  const fuori: SullaGriglia<E, C>[] = []
  for (const e of eventi) {
    if (e.tuttoIlGiorno || !posaEvento(giorno, e.inizio, e.fine)) continue
    fuori.push({ tipo: 'evento', inizio: e.inizio, fine: e.fine, evento: e })
  }
  for (const c of compitiDelGiorno(compiti, giorno, oggi).aOre) {
    const i = minutiDaOra(oraDi(c)!)
    fuori.push({ tipo: 'compito', inizio: istante(giorno, i), fine: istante(giorno, i + DURATA_COMPITO), compito: c })
  }
  return fuori
}
