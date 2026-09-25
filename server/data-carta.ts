// Le date di una carta: quando scade, come si scrive, come si legge oggi.
//
// Una carta nata lunedì sera con «domani 9:30» diceva ancora «domani» il
// mercoledì: la pillola era scritta una volta, relativa al giorno della
// nascita, e da lì non cambiava più. Qui la data si scrive **assoluta** quando
// la carta nasce («22 set 9:30», «Sep 22 9:30») e si legge **relativa** ogni
// volta che la pagina la mostra («Domani 9:30» il lunedì, «Oggi 9:30» il
// martedì): quello che c'è scritto è vero anche domani.
//
// È una foglia: importa solo la lingua dalla configurazione. Lo store la usa
// per far scadere le carte (`scadenzaDi`), la rifinitura per scrivere la
// pillola, la lettura per togliere «oggi» e «domani» dai testi (`assoluto`),
// e il resoconto della settimana (P9) per sapere quando scadeva una carta.

import { lingua } from './config.ts'

const GIORNO = 86_400_000

const MESE_EN = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?'
const MESE_IT = 'gen(?:naio)?|feb(?:braio)?|mar(?:zo)?|apr(?:ile)?|mag(?:gio)?|giu(?:gno)?|lug(?:lio)?|ago(?:sto)?|set(?:tembre)?|ott(?:obre)?|nov(?:embre)?|dic(?:embre)?'
const MESE = `(?:${MESE_EN}|${MESE_IT})`
const MESI_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MESI_IT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
export const MESI_EN_CORTI = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MESI_IT_CORTI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
export const GIORNI_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const GIORNI_IT = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']
const GIORNO_SETTIMANA = /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|domenica|luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato)\b/i

const senzaAccenti = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const unaRiga = (s: string) => s.replace(/\s+/g, ' ').trim()

function meseDa(parola: string): number {
  const p = parola.toLowerCase().slice(0, 3)
  const en = MESI_EN.indexOf(p)
  return en >= 0 ? en : MESI_IT.indexOf(p)
}

export const inizioDelGiorno = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

/**
 * L'ora dentro un'urgenza, se c'è: «9:30am» → «9:30», «3pm» → «15:00»,
 * «alle 14» → «14:00». Solo la prima: «9:30am. 10am Eastern Time» è un'ora
 * sola, detta in due fusi.
 */
export function oraNel(s: string): string | null {
  const m = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(s)
    ?? /\b(\d{1,2}):(\d{2})\b/.exec(s)
    ?? /\b(?:alle|ore|at)\s+(\d{1,2})(?:[:.](\d{2}))?\b/i.exec(s)
  if (!m) return null
  let ore = Number(m[1])
  const minuti = m[2] ? Number(m[2]) : 0
  const mezza = m[3]?.toLowerCase()
  if (ore > 23 || minuti > 59) return null
  if (mezza === 'pm' && ore < 12) ore += 12
  if (mezza === 'am' && ore === 12) ore = 0
  return `${ore}:${String(minuti).padStart(2, '0')}`
}

/**
 * La data dentro un'urgenza, se il codice la sa leggere: ISO, «Sep 22»,
 * «22 settembre», «22/09», «domani», «venerdì». Senza anno vale quest'anno,
 * salvo che sia già passata da più di un mese: allora è l'anno prossimo.
 * «Domani» e «venerdì» sono relativi a `base`: il giorno in cui la carta è
 * nata, o oggi per una pillola che si legge adesso.
 */
export function dataNel(s: string, base: Date): Date | null {
  const piano = senzaAccenti(s)
  const anno = (a: string | undefined) => a ? (a.length === 2 ? 2000 + Number(a) : Number(a)) : null
  const componi = (a: number | null, m: number, g: number): Date | null => {
    if (m < 0 || m > 11 || g < 1 || g > 31) return null
    let d = new Date(a ?? base.getFullYear(), m, g)
    if (d.getMonth() !== m) return null
    if (a === null && d.getTime() < inizioDelGiorno(base).getTime() - 30 * GIORNO) d = new Date(d.getFullYear() + 1, m, g)
    return d
  }
  let m: RegExpExecArray | null
  if ((m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(piano))) return componi(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  // prima «22 set», poi «Sep 22»: in «22 set 9:30» il nove dopo il mese è un'ora, non un giorno
  if ((m = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th|°)?\\s+(?:di\\s+|of\\s+)?(${MESE})\\b(?:\\s+(\\d{4}))?`, 'i').exec(piano))) {
    return componi(anno(m[3]), meseDa(m[2]), Number(m[1]))
  }
  if ((m = new RegExp(`\\b(${MESE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?![:.]\\d)(?:,?\\s*(\\d{4}))?`, 'i').exec(piano))) {
    return componi(anno(m[3]), meseDa(m[1]), Number(m[2]))
  }
  if ((m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(piano))) {
    const a = Number(m[1]), b = Number(m[2])
    // «22/9» è giorno/mese in italiano e in ogni caso in cui il primo numero non può essere un mese
    const [g, mese] = a > 12 || (b <= 12 && lingua() === 'it') ? [a, b] : [b, a]
    return componi(anno(m[3]), mese - 1, g)
  }
  if (/\b(?:today|oggi)\b/i.test(piano)) return inizioDelGiorno(base)
  if (/\b(?:tomorrow|domani)\b/i.test(piano)) return new Date(inizioDelGiorno(base).getTime() + GIORNO)
  if ((m = GIORNO_SETTIMANA.exec(piano))) {
    const nome = m[1].toLowerCase()
    const en = GIORNI_EN.findIndex(g => g.toLowerCase() === nome)
    const it = GIORNI_IT.findIndex(g => senzaAccenti(g).toLowerCase() === nome)
    const giorno = en >= 0 ? en : it
    if (giorno < 0) return null
    const fra = (giorno - base.getDay() + 7) % 7
    return new Date(inizioDelGiorno(base).getTime() + fra * GIORNO)
  }
  return null
}

/**
 * Quando scade una carta: l'inizio del giorno scritto nella sua urgenza,
 * letto rispetto al giorno in cui è nata. Null se non c'è una data che il
 * codice sappia leggere («nessuna fretta», «questa settimana», niente).
 * È il patto con il resoconto della settimana (P9).
 */
export function scadenzaDi(urgenza: string | null | undefined, nata: string | Date): Date | null {
  const s = unaRiga(urgenza ?? '')
  if (!s) return null
  const base = nata instanceof Date ? nata : new Date(nata)
  if (!Number.isFinite(base.getTime())) return null
  const d = dataNel(s, base)
  return d ? inizioDelGiorno(d) : null
}

const PREFISSO = /\b(?:entro|by|before|prima di|within)\b/i
const NESSUNA_FRETTA = /\b(?:no rush|nessuna fretta|senza fretta)\b/i
const QUESTA_SETTIMANA = /\b(?:this week|questa settimana)\b/i

/**
 * L'urgenza come si salva: assoluta. «domani 9:30» nato lunedì 21 →
 * «22 set 9:30»; «entro venerdì» → «entro 25 set»; «by tomorrow» → «by Sep 22».
 * Quello che il codice non sa leggere resta com'è.
 */
export function assoluta(urgenza: string, base: Date): string {
  const s = unaRiga(urgenza)
  if (!s) return ''
  const it = lingua() === 'it'
  if (NESSUNA_FRETTA.test(s)) return it ? 'Nessuna fretta' : 'No rush'
  if (QUESTA_SETTIMANA.test(s)) return it ? 'Questa settimana' : 'This week'
  const data = dataNel(s, base)
  if (!data) return s
  const prefisso = PREFISSO.test(s) ? (it ? 'entro ' : 'by ') : ''
  const giorno = it ? `${data.getDate()} ${MESI_IT_CORTI[data.getMonth()]}` : `${MESI_EN_CORTI[data.getMonth()]} ${data.getDate()}`
  const ora = oraNel(s)
  return `${prefisso}${giorno}${ora ? ` ${ora}` : ''}`
}

/**
 * La pillola come si legge oggi: «Oggi 9:30», «Domani», «Venerdì», «3 ott».
 *
 * La data si legge rispetto alla nascita della carta: così anche una pillola
 * di prima, relativa («Domani 9:30» scritta lunedì), si scioglie nel giorno
 * giusto e il martedì dice «Oggi 9:30». Una data già passata resta scritta
 * com'è: la carta sta comunque per scadere.
 */
export function pillolaDi(urgenza: string | null | undefined, nata: string, oggi = new Date()): string {
  const s = unaRiga(urgenza ?? '')
  if (!s) return ''
  const base = new Date(nata)
  const data = dataNel(s, Number.isFinite(base.getTime()) ? base : oggi)
  if (!data) return s
  const fra = Math.round((inizioDelGiorno(data).getTime() - inizioDelGiorno(oggi).getTime()) / GIORNO)
  if (fra < 0) return s
  const it = lingua() === 'it'
  let giorno: string
  if (fra === 0) giorno = it ? 'Oggi' : 'Today'
  else if (fra === 1) giorno = it ? 'Domani' : 'Tomorrow'
  else if (fra <= 6) giorno = (it ? GIORNI_IT : GIORNI_EN)[data.getDay()]
  else giorno = it ? `${data.getDate()} ${MESI_IT_CORTI[data.getMonth()]}` : `${MESI_EN_CORTI[data.getMonth()]} ${data.getDate()}`
  if (PREFISSO.test(s)) {
    // «Entro venerdì», «By Friday»: in italiano il giorno va minuscolo dopo
    // «Entro»; in inglese solo «today» e «tomorrow», i giorni restano maiuscoli
    giorno = it ? `Entro ${giorno.toLowerCase()}` : `By ${fra <= 1 ? giorno.toLowerCase() : giorno}`
  }
  const ora = oraNel(s)
  return ora ? `${giorno} ${ora}` : giorno
}

// — le parole relative —

/** Le parole che dicono un giorno solo rispetto a chi le legge: domani non è una data. */
export const RELATIVI = /\b(?:oggi|domani|dopodomani|ieri|stamattina|stasera|stanotte|today|tomorrow|yesterday|tonight|this morning|this evening)\b/i

export function conRelativi(s: string): boolean {
  return RELATIVI.test(senzaAccenti(s))
}

/**
 * Le parole relative sciolte nel giorno che vogliono dire, rispetto a `base`:
 * «Rispondi entro domani» letto in una mail di lunedì → «Rispondi entro
 * martedì»; «Reply by tomorrow» → «Reply by Tuesday». In italiano il giorno
 * va minuscolo in mezzo alla frase e maiuscolo in testa; in inglese sempre
 * maiuscolo. «domaniale» e le frasi senza parole relative restano com'erano.
 */
export function assoluto(testo: string, base: Date): string {
  const it = lingua() === 'it'
  const giorni = it ? GIORNI_IT : GIORNI_EN
  const giornoFra = (k: number) => giorni[new Date(inizioDelGiorno(base).getTime() + k * GIORNO + GIORNO / 2).getDay()]
  const quando = (parola: string): { k: number; coda: string } | null => {
    const p = senzaAccenti(parola).toLowerCase().replace(/\s+/g, ' ')
    switch (p) {
      case 'oggi': case 'today': return { k: 0, coda: '' }
      case 'domani': case 'tomorrow': return { k: 1, coda: '' }
      case 'dopodomani': return { k: 2, coda: '' }
      case 'ieri': case 'yesterday': return { k: -1, coda: '' }
      case 'stamattina': return { k: 0, coda: ' mattina' }
      case 'this morning': return { k: 0, coda: ' morning' }
      case 'stasera': return { k: 0, coda: ' sera' }
      case 'tonight': case 'this evening': return { k: 0, coda: ' evening' }
      case 'stanotte': return { k: 0, coda: ' notte' }
      default: return null
    }
  }
  return testo.replace(new RegExp(RELATIVI.source, 'gi'), (parola, posto: number) => {
    const q = quando(parola)
    if (!q) return parola
    const giorno = giornoFra(q.k)
    const prima = testo.slice(0, posto)
    const inTesta = !prima.trim() || /[.!?:;]\s*$/.test(prima)
    // in italiano il giorno è una parola comune: minuscola, salvo in testa alla frase
    const scritto = it && !inTesta ? giorno.toLowerCase() : giorno
    return scritto + q.coda
  })
}
