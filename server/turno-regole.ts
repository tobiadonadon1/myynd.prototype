// Le regole del turno (F2), pure: quando tocca a una carta, e quale per prima.
//
// Stanno qui, senza indice né modello, perché le leggono in tre — il turno
// che fa partire le carte, la lista che dice sulla carta «stanotte», le prove
// — e perché sono il pezzo che deve essere giusto a ogni ora del giorno: la
// mezzanotte, le sette del mattino, la notte che scavalca il giorno.
//
// Le tre regole che il turno tiene ferme:
//
//   · Una carta sua, per oggi o in ritardo, parte appena può: l'ha passata a
//     Myynd, e oggi è il giorno. Non aspetta la notte.
//   · Una carta per domani parte la notte prima; una per più avanti aspetta
//     la notte prima del suo giorno. Il lavoro di dopodomani fatto oggi alle
//     tre del pomeriggio è lavoro su materiale vecchio di due giorni.
//   · Una proposta di Myynd, e una carta senza giorno, partono di notte o
//     quando lei non c'è: non riempiono la bacheca mentre lavora.

import type { Compito } from './store.ts'

export type Finestra = { da: string; a: string }
export const NOTTE_DI_SERIE: Finestra = { da: '22:00', a: '07:00' }

const ORA = /^([01]\d|2[0-3]):([0-5]\d)$/
export function oraValida(s: unknown): s is string { return typeof s === 'string' && ORA.test(s) }
function minuti(s: string): number { const m = ORA.exec(s); return m ? Number(m[1]) * 60 + Number(m[2]) : 0 }
const minutiDi = (d: Date) => d.getHours() * 60 + d.getMinutes()

/** È notte, per questa finestra? Una finestra che scavalca la mezzanotte (22:00–07:00) vale da tutte e due le parti. */
export function inNotte(adesso: Date, f: Finestra = NOTTE_DI_SERIE): boolean {
  const m = minutiDi(adesso), da = minuti(f.da), a = minuti(f.a)
  if (da === a) return false
  return da > a ? (m >= da || m < a) : (m >= da && m < a)
}

/** Il giorno locale, «AAAA-MM-GG». */
export function giornoDi(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Lo stesso istante, spostato di `n` giorni di calendario. */
export function piuGiorni(d: Date, n: number): Date {
  const x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x
}

/** Quell'ora di quel giorno, in locale. */
function alle(giorno: Date, hhmm: string): Date {
  const x = new Date(giorno.getTime())
  x.setHours(Math.floor(minuti(hhmm) / 60), minuti(hhmm) % 60, 0, 0)
  return x
}

/**
 * Da quando conta la giornata del turno: l'ultima fine della notte
 * (di serie le sette) che è già passata. Il conto delle carte fatte partire
 * riparte da lì: una notte è una giornata sola anche se scavalca la mezzanotte.
 */
export function inizioGiornata(adesso: Date, f: Finestra = NOTTE_DI_SERIE): Date {
  const oggi = alle(adesso, f.a)
  return oggi.getTime() <= adesso.getTime() ? oggi : alle(piuGiorni(adesso, -1), f.a)
}

/** Il prossimo inizio della notte, o null se è già notte. */
export function prossimaNotte(adesso: Date, f: Finestra = NOTTE_DI_SERIE): Date | null {
  if (inNotte(adesso, f)) return null
  const stasera = alle(adesso, f.da)
  return stasera.getTime() > adesso.getTime() ? stasera : alle(piuGiorni(adesso, 1), f.da)
}

/** L'inizio della notte appena finita o in corso: da lì si conta «stanotte». */
export function inizioUltimaNotte(adesso: Date, f: Finestra = NOTTE_DI_SERIE): Date {
  const stasera = alle(adesso, f.da)
  if (stasera.getTime() <= adesso.getTime()) return stasera
  return alle(piuGiorni(adesso, -1), f.da)
}

export type Contesto = {
  adesso: Date
  notte: Finestra
  /** Lei non c'è: il Mac è fermo da un quarto d'ora, o lo schermo è bloccato. */
  assente: boolean
}

/** È una carta in coda per Myynd: aperta, sua, senza guaio. */
export function inCoda(c: Pick<Compito, 'stato' | 'modo' | 'guaio' | 'sparito'>): boolean {
  return c.stato === 'aperto' && !!c.modo && c.modo !== 'io' && !c.guaio && !c.sparito
}

/** Il giorno della carta, se ne ha uno: quello scritto, o oggi per una riga di «Oggi» senza data. */
export function giornoDellaCarta(c: Pick<Compito, 'giorno' | 'quando'>, oggi: string): string | null {
  if (c.giorno) return c.giorno
  return c.quando === 'oggi' ? oggi : null
}

/**
 * Quando tocca a questa carta: adesso, stanotte, quando lei non c'è, o la
 * notte prima del suo giorno. Null se non è in coda.
 */
export type Tocca = 'adesso' | 'notte' | 'via' | `prima:${string}`
export function tocca(c: Pick<Compito, 'stato' | 'modo' | 'guaio' | 'sparito' | 'giorno' | 'quando' | 'turno'>, o: Contesto): Tocca | null {
  if (!inCoda(c)) return null
  const oggi = giornoDi(o.adesso)
  const domani = giornoDi(piuGiorni(o.adesso, 1))
  const notte = inNotte(o.adesso, o.notte)
  const g = giornoDellaCarta(c, oggi)
  // di notte «domani» è il giorno che sta per cominciare: dopo mezzanotte è già oggi
  if (g && g > domani) return `prima:${g}`
  if (g && g === domani) return notte ? 'adesso' : 'notte'
  const daMyynd = c.turno?.da === 'myynd' || c.turno?.quando === 'notte'
  if (daMyynd || !g) return notte || o.assente ? 'adesso' : (daMyynd ? 'via' : 'notte')
  return 'adesso'
}

/** Può partire adesso. */
export function pronta(c: Parameters<typeof tocca>[0], o: Contesto): boolean {
  return tocca(c, o) === 'adesso'
}

/**
 * Quale prima: quella che si pentirebbe di più di non trovare pronta.
 *
 * In ritardo prima di oggi, oggi prima di domani; l'alta prima della normale;
 * una persona che aspetta una risposta prima di un documento; quelle passate
 * da lei prima delle proposte di Myynd; e a parità, quella in coda da più
 * tempo. Un numero, non un ordine fra due: così la stessa lista dà sempre lo
 * stesso ordine, e le prove lo possono dire.
 */
export function punteggio(c: Pick<Compito, 'giorno' | 'quando' | 'priorita' | 'doc' | 'turno' | 'creato'>, o: { adesso: Date; progettoAlto?: boolean }): number {
  const oggi = giornoDi(o.adesso)
  const domani = giornoDi(piuGiorni(o.adesso, 1))
  const g = giornoDellaCarta(c, oggi)
  let p = 0
  if (g && g < oggi) p += 40
  else if (g === oggi) p += 30
  else if (g === domani) p += 15
  else if (!g) p += 10
  if (c.priorita === 'alta') p += 20
  if (c.priorita === 'bassa') p -= 10
  if (c.doc && /^(?:posta|gmail|outlook|imap|postamac)/.test(c.doc)) p += 15
  if (o.progettoAlto) p += 10
  if (c.turno?.da !== 'myynd') p += 5
  const dal = Date.parse(c.turno?.dal ?? c.creato ?? '')
  if (Number.isFinite(dal)) p += Math.min(10, Math.max(0, Math.floor((o.adesso.getTime() - dal) / 86_400_000)))
  return p
}
