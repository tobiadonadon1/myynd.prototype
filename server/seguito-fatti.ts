// I fatti di una risposta contro le prove, senza modello.
//
// Il seguito (`seguito.ts`) prepara una risposta a un cliente, e la risposta
// non può dire un numero, un prezzo, una data, un'ora, un indirizzo o un link
// che nella conversazione non c'è. Qui il controllo, con quello che serve a non
// bocciare il giusto:
//
//   · le date si confrontano risolte, non a pezzi: «by Thursday» in una nota
//     del lunedì è il giovedì dopo, e una risposta che dice «October 22» per
//     quel giovedì è giusta; «October 25 is a Sunday» è giusta se il 25 è
//     nelle prove ed è domenica davvero;
//   · i numeri si confrontano normalizzati: «5k» e «5,000», «5 200» e «5,200»,
//     «two weeks» e «2 weeks», «10:30» un'ora sola;
//   · i numeri piccoli (fino a dieci) senza valuta, percentuale o mese accanto
//     passano: «I'll send the 2 files» non è un fatto inventato;
//   · e quello che sfuggiva: un link che non c'è, «six thousand» scritto in
//     lettere, la valuta cambiata ($ al posto di €) e il periodo cambiato
//     (al mese invece che all'anno) con le stesse cifre.
//
// Puro: nessun I/O, nessuno stato.

const GIORNO = 86_400_000

// — le parole —

const MESI: [string, number][] = [
  ['january', 0], ['february', 1], ['march', 2], ['april', 3], ['may', 4], ['june', 5], ['july', 6], ['august', 7], ['september', 8], ['october', 9], ['november', 10], ['december', 11],
  ['gennaio', 0], ['febbraio', 1], ['marzo', 2], ['aprile', 3], ['maggio', 4], ['giugno', 5], ['luglio', 6], ['agosto', 7], ['settembre', 8], ['ottobre', 9], ['novembre', 10], ['dicembre', 11]
]
/** Le abbreviazioni valgono solo accanto a una cifra: «set», «mar», «may» da sole sono parole. */
const MESI_CORTI: [string, number][] = [
  ['jan', 0], ['feb', 1], ['mar', 2], ['apr', 3], ['jun', 5], ['jul', 6], ['aug', 7], ['sep', 8], ['sept', 8], ['oct', 9], ['nov', 10], ['dec', 11],
  ['gen', 0], ['mag', 4], ['giu', 5], ['lug', 6], ['ago', 7], ['set', 8], ['ott', 9], ['dic', 11]
]
const GIORNI: [string, number][] = [
  ['sunday', 0], ['monday', 1], ['tuesday', 2], ['wednesday', 3], ['thursday', 4], ['friday', 5], ['saturday', 6],
  ['domenica', 0], ['lunedi', 1], ['martedi', 2], ['mercoledi', 3], ['giovedi', 4], ['venerdi', 5], ['sabato', 6],
  ['sun', 0], ['mon', 1], ['tue', 2], ['tues', 2], ['wed', 3], ['thu', 4], ['thur', 4], ['thurs', 4], ['fri', 5], ['sat', 6],
  ['dom', 0], ['lun', 1], ['mer', 3], ['gio', 4], ['ven', 5], ['sab', 6]
]
const PAROLE_NUMERO: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
  forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, undici: 11, dodici: 12,
  quindici: 15, venti: 20, trenta: 30, quaranta: 40, cinquanta: 50, sessanta: 60, settanta: 70, ottanta: 80, novanta: 90
}
const MOLTIPLICATORI: Record<string, number> = { hundred: 100, thousand: 1000, million: 1_000_000, cento: 100, mille: 1000, mila: 1000, milione: 1_000_000, milioni: 1_000_000 }

const senzaAccenti = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const nomeMese = new Map(MESI)
const nomeMeseCorto = new Map(MESI_CORTI)
const nomeGiorno = new Map(GIORNI)
const RE_MESE = MESI.map(m => m[0]).join('|')
const RE_MESE_CORTO = MESI_CORTI.map(m => m[0]).join('|')
/** I giorni per intero, e le abbreviazioni che non sono parole; «sat» e «sun» solo davanti a una cifra o a un trattino. */
const RE_GIORNO = String.raw`(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|domenica|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|tues|thurs|thur|mon|tue|wed|thu|fri|lun|mer|gio|ven|sab|dom)|(?:sat|sun)(?=\.?\s*(?:\d|[-–]))`

/** I numeri scritti in lettere diventano cifre: «six thousand» → «6000», «two weeks» → «2 weeks», «seimila» → «6000». */
export function cifre(testo: string): string {
  const parole = Object.keys(PAROLE_NUMERO).concat(Object.keys(MOLTIPLICATORI)).sort((a, b) => b.length - a.length).join('|')
  // «seimila», «duecento»: le parole italiane attaccate
  let t = testo.replace(new RegExp(`\\b(${Object.keys(PAROLE_NUMERO).join('|')})(mila|cento)\\b`, 'gi'), (_, a: string, b: string) => `${a} ${b}`)
  t = t.replace(new RegExp(`\\b(?:(?:${parole})(?:[ -](?:and |e )?)?)+\\b`, 'gi'), m => {
    const pezzi = m.toLowerCase().split(/[ -]+/).filter(x => x && x !== 'and' && x !== 'e')
    if (!pezzi.length || pezzi.every(p => p in MOLTIPLICATORI)) return m
    // «una» e «sei» da soli sono parole italiane qualunque («una mail», «sei libero»): servono accanto a un moltiplicatore
    if (pezzi.length === 1 && ['una', 'uno', 'sei', 'one'].includes(pezzi[0]!)) return m
    let totale = 0, parziale = 0
    for (const p of pezzi) {
      if (p in PAROLE_NUMERO) parziale += PAROLE_NUMERO[p]!
      else { const k = MOLTIPLICATORI[p]!; parziale = (parziale || 1) * k; if (k >= 1000) { totale += parziale; parziale = 0 } }
    }
    const fuori = String(totale + parziale)
    return m.endsWith(' ') ? `${fuori} ` : fuori
  })
  return t
}

// — i numeri —

/** Un numero com'è scritto, nella forma che si confronta: senza separatori delle migliaia, senza «,00», «5k» → 5000. */
export function canonico(grezzo: string, k = false): string {
  let x = grezzo.replace(/[\s  ]/g, '')
  if (/^\d{1,3}(?:[.,']\d{3})+(?:[.,]\d{1,2})?$/.test(x)) x = x.replace(/[.,'](?=\d{3}(?:\D|$))/g, '')
  x = x.replace(/[.,]0{1,2}$/, '').replace(',', '.')
  x = x.replace(/^0+(?=\d)/, '')
  if (k) { const n = Number(x) * 1000; return Number.isFinite(n) ? String(Math.round(n)) : x }
  return x
}

const VALUTE: [RegExp, string][] = [[/^(?:€|eur|euro|euros)$/i, 'eur'], [/^(?:\$|usd|dollars?)$/i, 'usd'], [/^(?:£|gbp|pounds?)$/i, 'gbp'], [/^(?:chf|fr\.?)$/i, 'chf']]
const valuta = (s: string | undefined) => s ? VALUTE.find(([r]) => r.test(s.trim()))?.[1] ?? null : null
const PERIODI: [RegExp, string][] = [
  [/^(?:per month|a month|monthly|\/\s?mo(?:nth)?|al mese|mensili?|mensile)$/i, 'mese'],
  [/^(?:per year|a year|yearly|annually|per annum|\/\s?y(?:ea)?r|all'anno|l'anno|annui|annuo|annuale)$/i, 'anno'],
  [/^(?:per hour|an hour|hourly|\/\s?h(?:ou)?r|all'ora|l'ora|orari)$/i, 'ora'],
  [/^(?:per day|a day|daily|\/\s?day|al giorno|giornalieri)$/i, 'giorno'],
  [/^(?:per week|a week|weekly|a settimana|alla settimana|settimanali)$/i, 'settimana']
]
const periodo = (s: string | undefined) => s ? PERIODI.find(([r]) => r.test(s.trim()))?.[1] ?? null : null

const NUM = String.raw`\d{1,3}(?:[   .,']\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d+)?`
const CUR = String.raw`€|\$|£|eur(?:os?)?\b|usd\b|gbp\b|chf\b|dollars?\b|pounds?\b`
const PER = String.raw`per month|a month|monthly|\/\s?mo(?:nth)?\b|al mese|mensil[ei]|per year|a year|yearly|annually|per annum|\/\s?y(?:ea)?r\b|all'anno|l'anno|annu[io]|annuale|per hour|an hour|hourly|\/\s?h(?:ou)?r\b|all'ora|l'ora|orari|per day|a day|daily|al giorno|giornalieri|per week|a week|weekly|a settimana|alla settimana|settimanali`
const RE_IMPORTO = new RegExp(String.raw`(${CUR})?\s?(${NUM})(\s?k\b)?\s?(${CUR})?(?:\s?(?:\+\s?vat|\+\s?iva|vat|iva|excl\.? vat|incl\.? vat))?\s?(${PER})?`, 'gi')

/** Le cose che si contano in un ambito o in un tempo: un numero piccolo accanto a loro è un fatto. */
const CONTATI = /^\s?(?:pages?|screens?|rounds?|revisions?|deliverables?|sessions?|calls?|meetings?|weeks?|days?|hours?|months?|years?|seats?|users?|licen[cs]es?|pagine|schermate|revisioni|consegne|sessioni|incontri|settimane|giorni|ore|mesi|anni|postazioni|utenti|licenze)\b/i

export type Importo = { v: string; valuta: string | null; periodo: string | null; piccolo: boolean }

// — le date —

export type Base = { testo: string; quando: number }
type Trovata = { inizio: number; fine: number; data: string | null; giorno: number | null; mese: number | null }

const p2 = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
/** Il giorno di una data senza anno: l'anno della base, o il prossimo se quello cade più di due mesi prima. */
function risolvi(giorno: number, mese: number, base: number, anno?: number): string | null {
  if (giorno < 1 || giorno > 31 || mese < 0 || mese > 11) return null
  const b = new Date(base)
  let y = anno ?? b.getFullYear()
  if (anno !== undefined && anno < 100) y = 2000 + anno
  let d = new Date(y, mese, giorno, 12)
  if (d.getMonth() !== mese) return null
  if (anno === undefined && d.getTime() < base - 60 * GIORNO) d = new Date(y + 1, mese, giorno, 12)
  return iso(d)
}
/** Il prossimo giorno della settimana dalla base (lo stesso giorno conta). */
function prossimo(giorno: number, base: number): string {
  const d = new Date(base)
  d.setHours(12, 0, 0, 0)
  while (d.getDay() !== giorno) d.setDate(d.getDate() + 1)
  return iso(d)
}

/** Le date, i giorni e i mesi di un testo, risolti rispetto alla sua data. */
export function dateDi(testo: string, base: number, lingua: 'it' | 'en' | null = null): Trovata[] {
  const t = senzaAccenti(testo).toLowerCase()
  const fuori: Trovata[] = []
  const prendi = (re: RegExp, f: (m: RegExpExecArray) => Omit<Trovata, 'inizio' | 'fine'> | null) => {
    for (const m of t.matchAll(re)) {
      if (fuori.some(x => m.index! < x.fine && m.index! + m[0].length > x.inizio)) continue
      const r = f(m as RegExpExecArray)
      if (r) fuori.push({ inizio: m.index!, fine: m.index! + m[0].length, ...r })
    }
  }
  const mese = (s: string) => nomeMese.get(s) ?? nomeMeseCorto.get(s.replace(/\.$/, '')) ?? null
  const anno = (s: string | undefined) => s ? Number(s) : undefined
  prendi(/\b(\d{4})-(\d{2})-(\d{2})\b/g, m => ({ data: risolvi(Number(m[3]), Number(m[2]) - 1, base, Number(m[1])), giorno: null, mese: null }))
  prendi(new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+|di\s+)?(${RE_MESE}|(?:${RE_MESE_CORTO})\.?)(?:,?\s+(\d{4}))?\b`, 'g'), m => {
    const n = mese(m[2]!); return n === null ? null : { data: risolvi(Number(m[1]), n, base, anno(m[3])), giorno: null, mese: n }
  })
  prendi(new RegExp(String.raw`\b(${RE_MESE}|(?:${RE_MESE_CORTO})\.?)\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s+(\d{4}))?`, 'g'), m => {
    const n = mese(m[1]!); return n === null ? null : { data: risolvi(Number(m[2]), n, base, anno(m[3])), giorno: null, mese: n }
  })
  // «24/10»: nella lingua del filo; in inglese tutte e due le letture, e vale quella che c'è
  prendi(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g, m => {
    const a = Number(m[1]), b = Number(m[2])
    const dm = risolvi(a, b - 1, base, anno(m[3]))
    const md = lingua === 'it' ? null : risolvi(b, a - 1, base, anno(m[3]))
    return { data: dm ?? md, giorno: null, mese: null, ...(md && dm && md !== dm ? { altra: md } : {}) } as Omit<Trovata, 'inizio' | 'fine'>
  })
  // un mese da solo: i nomi interi, e «may» solo accanto a una cifra (lì l'ha già preso chi sopra)
  prendi(new RegExp(String.raw`\b(${RE_MESE.replace('may|', '')})\b`, 'g'), m => ({ data: null, giorno: null, mese: nomeMese.get(m[1]!)! }))
  prendi(new RegExp(String.raw`\b(${RE_GIORNO})\b\.?`, 'g'), m => {
    const g = nomeGiorno.get(m[1]!)!
    return { data: prossimo(g, base), giorno: g, mese: null }
  })
  const b = new Date(base)
  b.setHours(12, 0, 0, 0)
  const piu = (n: number) => { const d = new Date(b); d.setDate(d.getDate() + n); return iso(d) }
  prendi(/\b(today|tonight|this (?:morning|afternoon|evening)|oggi|stasera|stamattina)\b/g, () => ({ data: piu(0), giorno: null, mese: null }))
  prendi(/\b(dopodomani|day after tomorrow)\b/g, () => ({ data: piu(2), giorno: null, mese: null }))
  prendi(/\b(tomorrow|domani)\b/g, () => ({ data: piu(1), giorno: null, mese: null }))
  return fuori
}

// — le prove —

export type Evidenza = {
  testo: string
  numeri: Set<string>
  importi: Importo[]
  date: Set<string>
  giorni: Set<number>
  mesi: Set<number>
  ore: Set<string>
  link: string[]
  indirizzi: Set<string>
}

const RE_ORA = /\b(\d{1,2})(?::|h)(\d{2})\b(?:\s?([ap])\.?m\.?)?|\b(\d{1,2})\s?([ap])\.?m\.?\b/gi
function ore(t: string): { inizio: number; fine: number; v: string }[] {
  return [...t.matchAll(RE_ORA)].map(m => {
    let h = Number(m[1] ?? m[4]); const min = m[2] ?? '00'; const ap = (m[3] ?? m[5] ?? '').toLowerCase()
    if (ap === 'p' && h < 12) h += 12
    if (ap === 'a' && h === 12) h = 0
    return { inizio: m.index!, fine: m.index! + m[0].length, v: `${h}:${min}` }
  })
}
const RE_LINK = /\bhttps?:\/\/[^\s<>"')\]]+/gi
const pulisciLink = (s: string) => s.replace(/[.,;:!?]+$/, '').replace(/\/$/, '').toLowerCase()
const RE_EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

/** Toglie dal testo i pezzi già letti (date, ore, link, indirizzi), con spazi al loro posto: gli indici restano. */
function buca(t: string, pezzi: { inizio: number; fine: number }[]): string {
  let s = t
  for (const p of pezzi) s = s.slice(0, p.inizio) + ' '.repeat(p.fine - p.inizio) + s.slice(p.fine)
  return s
}

function leggi(testo: string, base: number, lingua: 'it' | 'en' | null) {
  // gli indici delle date sono sul testo minuscolo senza accenti: si lavora su quello, con le cifre al posto delle parole
  const t = senzaAccenti(cifre(testo)).toLowerCase()
  const link = [...t.matchAll(RE_LINK)].map(m => ({ inizio: m.index!, fine: m.index! + m[0].length, v: pulisciLink(m[0]) }))
  const indirizzi = [...buca(t, link).matchAll(RE_EMAIL)].map(m => ({ inizio: m.index!, fine: m.index! + m[0].length, v: m[0].toLowerCase() }))
  const senzaLink = buca(t, [...link, ...indirizzi])
  // «v2» è una versione, non un numero
  const versioni = [...senzaLink.matchAll(/\bv\d+\b/gi)].map(m => ({ inizio: m.index!, fine: m.index! + m[0].length }))
  const orari = ore(buca(senzaLink, versioni))
  const date = dateDi(buca(senzaLink, [...versioni, ...orari]), base, lingua)
  const resto = buca(senzaLink, [...versioni, ...orari, ...date])
  const importi: (Importo & { inizio: number; fine: number })[] = []
  for (const m of resto.matchAll(RE_IMPORTO)) {
    if (!m[2]) continue
    const prima = resto[m.index! + m[0].indexOf(m[2]) - 1] ?? ''
    if (/[\p{L}\d]/u.test(prima) && !m[1]) continue
    const v = canonico(m[2], !!m[3])
    const cur = valuta(m[1]) ?? valuta(m[4])
    const dopo = resto.slice(m.index! + m[0].length, m.index! + m[0].length + 2)
    const percento = /^\s?%/.test(dopo)
    // «6 pages», «3 rounds», «2 weeks» sono l'ambito e i tempi: si contano anche piccoli
    const conta = CONTATI.test(resto.slice(m.index! + m[0].length, m.index! + m[0].length + 16))
    const piccolo = !cur && !m[3] && !m[5] && !percento && !conta && /^\d+$/.test(v) && Number(v) <= 10
    importi.push({ inizio: m.index!, fine: m.index! + m[0].length, v, valuta: cur, periodo: periodo(m[5]), piccolo })
  }
  return { t, link, indirizzi, orari, date, importi }
}

/** Le prove di una conversazione, lette una volta. Ogni testo con la sua data: le date relative si risolvono da lì. */
export function evidenza(testi: Base[], lingua: 'it' | 'en' | null = null): Evidenza {
  const ev: Evidenza = { testo: '', numeri: new Set(), importi: [], date: new Set(), giorni: new Set(), mesi: new Set(), ore: new Set(), link: [], indirizzi: new Set() }
  for (const { testo, quando } of testi) {
    const l = leggi(testo, quando, lingua)
    ev.testo += `\n${l.t}`
    for (const x of l.link) ev.link.push(x.v)
    for (const x of l.indirizzi) ev.indirizzi.add(x.v)
    for (const x of l.orari) ev.ore.add(x.v)
    for (const d of l.date) {
      if (d.data) { ev.date.add(d.data); ev.giorni.add(new Date(`${d.data}T12:00:00`).getDay()); ev.mesi.add(new Date(`${d.data}T12:00:00`).getMonth()) }
      const altra = (d as Trovata & { altra?: string }).altra
      if (altra) ev.date.add(altra)
      if (d.giorno !== null) ev.giorni.add(d.giorno)
      if (d.mese !== null) ev.mesi.add(d.mese)
      // il giorno del mese di una data è un numero che si può ripetere da solo
      if (d.data) ev.numeri.add(String(Number(d.data.slice(8))))
    }
    for (const i of l.importi) { ev.importi.push(i); ev.numeri.add(i.v) }
  }
  return ev
}

const NOMI_MESI_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * Quello che un testo dice e le prove no: una riga per guaio, vuoto se regge.
 * `dove` apre la riga («Reply», «Document»); `ammessi` sono gli indirizzi che
 * si possono scrivere (il cliente, i suoi).
 */
export function controlla(testo: string, ev: Evidenza, o: { dove: string; adesso: number; lingua?: 'it' | 'en' | null; ammessi?: Set<string>; en?: boolean }): string[] {
  const e = o.en ?? true
  const guai: string[] = []
  const non = (cosa: string) => guai.push(e ? `${o.dove}: «${cosa}» is not in the conversation.` : `${o.dove}: «${cosa}» non è nella conversazione.`)
  const l = leggi(testo, o.adesso, o.lingua ?? null)
  for (const x of l.link) if (!ev.link.some(p => p === x.v || p.startsWith(x.v))) non(x.v)
  for (const x of l.indirizzi) {
    if (!(o.ammessi ?? new Set()).has(x.v) || !ev.indirizzi.has(x.v)) guai.push(e ? `${o.dove}: the address ${x.v} is not the client's.` : `${o.dove}: l'indirizzo ${x.v} non è del cliente.`)
  }
  for (const x of l.orari) if (!ev.ore.has(x.v)) non(x.v)
  for (const d of l.date) {
    const altra = (d as Trovata & { altra?: string }).altra
    if (d.giorno !== null) {
      // un giorno della settimana: nominato nelle prove, o il giorno di una data delle prove
      if (!ev.giorni.has(d.giorno)) guai.push(e ? `${o.dove}: names a day that is not in the conversation.` : `${o.dove}: nomina un giorno che nella conversazione non c'è.`)
      continue
    }
    if (d.data) {
      // le parole relative («today», «tomorrow») scritte da chi risponde sono sue, non fatti del cliente
      const frammento = l.t.slice(d.inizio, d.fine)
      if (/\b(?:today|tonight|tomorrow|oggi|stasera|domani|dopodomani|this )/.test(frammento)) continue
      if (!ev.date.has(d.data) && !(altra && ev.date.has(altra))) non(d.mese !== null ? `${NOMI_MESI_EN[d.mese]} ${Number(d.data.slice(8))}` : frammento.trim())
      continue
    }
    if (d.mese !== null && !ev.mesi.has(d.mese)) non(NOMI_MESI_EN[d.mese]!)
  }
  for (const i of l.importi) {
    if (i.piccolo) continue
    const stessi = ev.importi.filter(p => p.v === i.v)
    if (!stessi.length && !ev.numeri.has(i.v)) { non(`${i.valuta === 'eur' ? '€' : i.valuta === 'usd' ? '$' : i.valuta === 'gbp' ? '£' : ''}${i.v}`); continue }
    if (i.valuta && stessi.length && !stessi.some(p => p.valuta === i.valuta) && stessi.some(p => p.valuta && p.valuta !== i.valuta)) {
      guai.push(e ? `${o.dove}: ${i.v} is in another currency in the conversation.` : `${o.dove}: ${i.v} nella conversazione è in un'altra valuta.`)
    }
    if (i.periodo && stessi.some(p => p.periodo) && !stessi.some(p => p.periodo === i.periodo)) {
      guai.push(e ? `${o.dove}: ${i.v} is for another period in the conversation.` : `${o.dove}: ${i.v} nella conversazione vale per un altro periodo.`)
    }
  }
  return [...new Set(guai)]
}

/** Una data dell'impegno regge solo se è una data delle prove (scritta, o risolta da un giorno o da «domani»). */
export function dataFondata(giorno: string, ev: Evidenza): boolean {
  return ev.date.has(giorno)
}
