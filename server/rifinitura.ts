// L'ultimo passaggio prima che una carta finisca sulla prima pagina.
//
// Le sue parole, del 21 settembre 2026: «the tasks on the feed do not appear
// phrased in a simple manner. They are very chaotic, confusing, and don't
// mean much». E aveva ragione, guardando le sue carte di quel giorno: «The
// September 20 commit uses Jev for reading decisions, while the TypeSafe
// review says real use calls its service» cuce due fonti con un «while», parla
// di commit e revisioni invece di chi aspetta e perché adesso, e l'urgenza
// «Tuesday Sep 22, 2026, 9:30am. 10am Eastern Time» è lunga quarantacinque
// caratteri dentro una pillola che ne disegna quindici.
//
// Una carta buona si legge come parla un collega: il titolo è un verbo e la
// cosa concreta, al massimo nove parole; la riga sotto dice chi aspetta o
// perché adesso, al massimo diciotto; la pillola sono due o tre parole. Qui
// si fanno, nell'ordine, sei cose:
//
//   1. via i doppioni di quello che ha già sul feed (Jev);
//   2. a ogni carta il suo progetto, se non ce l'ha già (Jev);
//   3. si chiede a Jev se la carta si capisce al primo sguardo, e si
//      controlla con il codice (lunghezze, «mentre», gergo): quella che non
//      passa la riscrive **una volta** il modello grande, e la riscrittura
//      si tiene solo se passa gli stessi controlli e parla ancora della
//      stessa cosa;
//   4. il peso, da 0 a 3: quanto conta oggi, giudicato sulla carta, con il
//      giudizio già dato sul documento come punto di partenza;
//   5. la pillola dell'urgenza, accorciata dal codice quando dentro c'è una
//      data che si sa leggere;
//   6. via le lineette, da tutto.
//
// Le tre regole di `jev.ts` valgono anche qui, e la prima più di tutte:
// **senza Jev non cambia niente.** Niente chiave, rete giù, tetto finito:
// nessuna riscrittura, nessun peso, la carta esce com'è entrata — meno le
// lineette e una pillola che si accorcia da sola. Jev non scrive mai una
// parola: dice quale carta si legge male, e a scriverla meglio è il modello
// grande, con uno schema stretto e il codice che rilegge dopo di lui.

import { lingua, nellaLingua } from './config.ts'
import * as giudizi from './giudizi.ts'
import { chiediJSON, collegato } from './modello.ts'
import { tempoFondato } from './rilevanza.ts'
import { elencoFeed } from './store.ts'
import { senzaTrattini } from './testo.ts'

export type Carta = {
  tipo?: string | null
  titolo: string
  testo: string
  urgenza?: string | null
  perche?: string | null
  offerta?: string | null
  doc?: string | null
  progetto?: string | null
  peso?: number | null
}

export type Progetto = { id: string; nome: string; obiettivo?: string | null }

export type Opzioni = {
  /** I suoi progetti attivi: con meno di due non c'è niente da scegliere. */
  progetti?: readonly Progetto[]
  /** Le carte già aperte, per i doppioni. Se mancano si leggono dal feed. */
  aperte?: readonly giudizi.Carta[]
  /** Chi chiama, per il registro: «lettura», «priorità». */
  registro?: string
  /** Il giorno di oggi, per le prove: «domani» è domani rispetto a questo. */
  oggi?: Date
}

// — i controlli del codice —

/** Un titolo è un verbo e la cosa: oltre nove parole non si legge in un fiato. */
export const TITOLO_PAROLE = 9
export const TITOLO_CARATTERI = 64
/** La riga sotto: chi aspetta, o perché adesso. Una frase. */
export const TESTO_PAROLE = 18
/** La pillola: «entro venerdì», «domani 9:30», «nessuna fretta». */
export const URGENZA_PAROLE = 3

/**
 * Il gergo che non deve arrivare sulla prima pagina.
 *
 * La prima priorità vera che ha visto proponeva «una specifica UI concisa con
 * layout, gerarchia e criteri di accettazione»: «non capisco, parole semplici e
 * dirette, come tutto il resto della pagina». Il prompt lo chiede; qui si
 * controlla, perché un consiglio nel prompt non è una regola. Stava in
 * `priorita.ts`, e vale per ogni carta, non solo per le sue.
 */
export const GERGO = /\b(?:acceptance criteria|specifications?|spec|hierarch(?:y|ies)|stakeholders?|rubrics?|frameworks?|leverage|synerg\w*|deliverables?|roadmap|workflows?|onboarding flow|UX|UI spec|lanes?|positioning|criteri di accettazione|specifica|gerarchia|flusso di|rubrica|posizionamento)\b/i
export const conGergo = (s: string) => GERGO.test(s)

/** Due fonti cucite in una frase: «il commit dice X, mentre la revisione dice Y». */
const CUCITURA = /\b(?:while|whereas|mentre)\b/i

/** Quante parole: quelle con dentro almeno una lettera o una cifra. */
export function parole(s: string): number {
  return s.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length
}

const unaRiga = (s: string) => s.replace(/\s+/g, ' ').trim()

/**
 * Perché una carta non si legge al primo sguardo, secondo il codice.
 *
 * Vuoto vuol dire «passa». Sono i controlli che un prompt non può garantire:
 * si misurano, e chi li misura è un contatore di parole, non un modello.
 */
export function controlla(c: Pick<Carta, 'titolo' | 'testo' | 'urgenza'>): string[] {
  const perche: string[] = []
  const titolo = unaRiga(c.titolo ?? '')
  const testo = unaRiga(c.testo ?? '')
  const urgenza = unaRiga(c.urgenza ?? '')
  if (!titolo) perche.push('titolo vuoto')
  else if (parole(titolo) > TITOLO_PAROLE || titolo.length > TITOLO_CARATTERI) perche.push('titolo lungo')
  if (parole(testo) > TESTO_PAROLE) perche.push('testo lungo')
  if (CUCITURA.test(testo) || CUCITURA.test(titolo)) perche.push('due fonti cucite')
  if (conGergo(titolo) || conGergo(testo)) perche.push('gergo')
  if (parole(urgenza) > URGENZA_PAROLE) perche.push('urgenza lunga')
  return perche
}

// — la pillola —

const MESE_EN = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?'
const MESE_IT = 'gen(?:naio)?|feb(?:braio)?|mar(?:zo)?|apr(?:ile)?|mag(?:gio)?|giu(?:gno)?|lug(?:lio)?|ago(?:sto)?|set(?:tembre)?|ott(?:obre)?|nov(?:embre)?|dic(?:embre)?'
const MESE = `(?:${MESE_EN}|${MESE_IT})`
const MESI_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MESI_IT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
const MESI_EN_CORTI = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MESI_IT_CORTI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
const GIORNI_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const GIORNI_IT = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']
const GIORNO_SETTIMANA = /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|domenica|luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato)\b/i

function meseDa(parola: string): number {
  const p = parola.toLowerCase().slice(0, 3)
  const en = MESI_EN.indexOf(p)
  return en >= 0 ? en : MESI_IT.indexOf(p)
}

const inizioDelGiorno = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

/**
 * L'ora dentro un'urgenza, se c'è: «9:30am» → «9:30», «3pm» → «15:00»,
 * «alle 14» → «14:00». Solo la prima: «9:30am. 10am Eastern Time» è un'ora
 * sola, detta in due fusi.
 */
function oraNel(s: string): string | null {
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
 */
function dataNel(s: string, oggi: Date): Date | null {
  const senzaAccenti = s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  const anno = (a: string | undefined) => a ? (a.length === 2 ? 2000 + Number(a) : Number(a)) : null
  const componi = (a: number | null, m: number, g: number): Date | null => {
    if (m < 0 || m > 11 || g < 1 || g > 31) return null
    let d = new Date(a ?? oggi.getFullYear(), m, g)
    if (d.getMonth() !== m) return null
    if (a === null && d.getTime() < inizioDelGiorno(oggi).getTime() - 30 * 86_400_000) d = new Date(d.getFullYear() + 1, m, g)
    return d
  }
  let m: RegExpExecArray | null
  if ((m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(senzaAccenti))) return componi(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if ((m = new RegExp(`\\b(${MESE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s*(\\d{4}))?`, 'i').exec(senzaAccenti))) {
    return componi(anno(m[3]), meseDa(m[1]), Number(m[2]))
  }
  if ((m = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th|°)?\\s+(?:di\\s+|of\\s+)?(${MESE})\\b(?:\\s+(\\d{4}))?`, 'i').exec(senzaAccenti))) {
    return componi(anno(m[3]), meseDa(m[2]), Number(m[1]))
  }
  if ((m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(senzaAccenti))) {
    const a = Number(m[1]), b = Number(m[2])
    // «22/9» è giorno/mese in italiano e in ogni caso in cui il primo numero non può essere un mese
    const [g, mese] = a > 12 || (b <= 12 && lingua() === 'it') ? [a, b] : [b, a]
    return componi(anno(m[3]), mese - 1, g)
  }
  if (/\b(?:today|oggi)\b/i.test(senzaAccenti)) return inizioDelGiorno(oggi)
  if (/\b(?:tomorrow|domani)\b/i.test(senzaAccenti)) return new Date(inizioDelGiorno(oggi).getTime() + 86_400_000)
  if ((m = GIORNO_SETTIMANA.exec(senzaAccenti))) {
    const nome = m[1].toLowerCase()
    const en = GIORNI_EN.findIndex(g => g.toLowerCase() === nome)
    const it = GIORNI_IT.findIndex(g => g.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() === nome)
    const giorno = en >= 0 ? en : it
    if (giorno < 0) return null
    const fra = (giorno - oggi.getDay() + 7) % 7
    return new Date(inizioDelGiorno(oggi).getTime() + fra * 86_400_000)
  }
  return null
}

/**
 * La pillola, corta: «Domani 9:30», «Giovedì», «22 set», «No rush».
 *
 * Tocca solo quello che non ci sta — più di tre parole — e solo se dentro
 * c'è una data o un'ora che il codice sa leggere: una pillola che il codice
 * non capisce resta com'è, e ci pensa la riscrittura se Jev l'ha segnata.
 * Il giorno è relativo a oggi: «Sep 22» letto il 21 è «Domani», letto il 15
 * è «Martedì», letto in agosto è «22 set».
 */
export function pillola(urgenza: string, oggi = new Date()): string {
  const s = unaRiga(urgenza)
  if (!s || parole(s) <= URGENZA_PAROLE) return s
  const it = lingua() === 'it'
  if (/\b(?:no rush|nessuna fretta|senza fretta)\b/i.test(s)) return it ? 'Nessuna fretta' : 'No rush'
  if (/\b(?:this week|questa settimana)\b/i.test(s)) return it ? 'Questa settimana' : 'This week'
  const data = dataNel(s, oggi)
  if (!data) return s
  const ora = oraNel(s)
  const fra = Math.round((inizioDelGiorno(data).getTime() - inizioDelGiorno(oggi).getTime()) / 86_400_000)
  let giorno: string
  if (fra === 0) giorno = it ? 'Oggi' : 'Today'
  else if (fra === 1) giorno = it ? 'Domani' : 'Tomorrow'
  else if (fra > 1 && fra <= 6) giorno = (it ? GIORNI_IT : GIORNI_EN)[data.getDay()]
  else giorno = it ? `${data.getDate()} ${MESI_IT_CORTI[data.getMonth()]}` : `${MESI_EN_CORTI[data.getMonth()]} ${data.getDate()}`
  return ora ? `${giorno} ${ora}` : giorno
}

// — la riscrittura —

/**
 * Le mani con cui si riscrive, sostituibili solo nelle prove: la
 * riscrittura chiama un modello, e una prova che chiama un modello non è
 * una prova.
 */
type Ferri = { chiediJSON: typeof chiediJSON; collegato: typeof collegato }
const VERI: Ferri = { chiediJSON: o => chiediJSON(o), collegato: () => collegato() }
let ferri: Ferri = VERI
export function perProva(f: Partial<Ferri> | null) { ferri = f ? { ...VERI, ...f } : VERI }

const FORMA = {
  type: 'object',
  properties: {
    titolo: { type: 'string', description: 'Un verbo all\'inizio e la cosa concreta, al massimo nove parole.' },
    testo: { type: 'string', description: 'Una frase sola, al massimo diciotto parole: chi aspetta, o perché adesso.' },
    urgenza: { type: 'string', description: 'Al massimo tre parole («entro venerdì», «domani 9:30», «nessuna fretta»), o vuota.' }
  },
  required: ['titolo', 'testo', 'urgenza'],
  additionalProperties: false
}

/*
 * Le parole che non dicono di cosa parla un titolo: articoli, preposizioni,
 * e i verbi che potrebbero stare davanti a qualunque cosa. «Rispondi» in
 * comune fra due titoli non vuol dire che parlino della stessa cosa.
 */
const VUOTE = new Set(('the a an and or of to for on in with your you his her their this that is are be it its at by ' +
  'from about into over under before after not now new all any some ' +
  'reply respond answer send confirm review check make fix get set update prepare write choose approve decide ' +
  'record upload verify unblock finish start ' +
  'il lo la le gli un una uno di da per con su che non e ed a al alla ai allo agli del della dei delle nel nella sul sulla ' +
  'rispondi manda conferma scrivi prepara controlla scegli approva decidi fai finisci sistema verifica').split(' '))

function contenuto(s: string): Set<string> {
  return new Set(s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/).filter(p => (p.length >= 3 || /^\d{2,}$/.test(p)) && !VUOTE.has(p)))
}

/** La riscrittura parla ancora della stessa cosa: almeno una parola piena del titolo di prima. */
export function stessoSoggetto(prima: string, dopo: string): boolean {
  const di = contenuto(prima)
  return [...contenuto(dopo)].some(p => di.has(p))
}

const testoDi = (v: unknown, max: number) => typeof v === 'string' ? senzaTrattini(unaRiga(v)).slice(0, max) : ''

/**
 * La carta riscritta dal modello grande, o `null` se è meglio quella di prima.
 *
 * Una volta sola, con uno schema di tre campi. Poi il codice rilegge: gli
 * stessi controlli di `controlla`, la stessa cosa di cui si parlava
 * (`stessoSoggetto`), e nessun giorno inventato (`tempoFondato`: un
 * «venerdì» che nella carta non c'era non entra). L'urgenza segue un ordine
 * suo: prima la pillola del codice, se sa leggere quella di prima; poi
 * quella del modello, se corta e fondata; altrimenti resta quella di prima.
 */
async function riscrivi(c: Carta, oggi: Date): Promise<Pick<Carta, 'titolo' | 'testo' | 'urgenza'> | null> {
  if (!ferri.collegato()) return null
  const out = await ferri.chiediJSON<Record<string, unknown>>({
    lavoro: 'estrazione', max_tokens: 300, formato: FORMA,
    system: `Sei Myynd. Riscrivi UNA carta della prima pagina di questa persona, così che la capisca al primo sguardo: cosa fare, e perché conta adesso.

— «titolo»: un verbo all'inizio e la cosa concreta. Al massimo ${TITOLO_PAROLE} parole.
— «testo»: UNA frase sola, al massimo ${TESTO_PAROLE} parole, che dice chi aspetta o perché adesso. Parole piane, come si parla a un collega. Non cucire due fonti con «mentre»; non raccontare commit, revisioni, corsie, posizionamenti o cosa dice un documento: di' la situazione.
— «urgenza»: al massimo ${URGENZA_PAROLE} parole («entro venerdì», «domani 9:30», «nessuna fretta»), o vuota se la carta non dice quando.

Nomi, date, cifre e giorni («domani», «venerdì») solo se stanno già nella carta: non aggiungere niente, e non cambiare la cosa di cui parla. Niente gergo di prodotto o di consulenza. Niente lineette. Niente virgolette nel titolo.

Male: «Verify Jev keeps Myynd data local before expanding it» / «The September 20 commit uses Jev for reading decisions, while the TypeSafe review says real use calls its service.»
Bene: «Check that Jev keeps Myynd data local» / «Jev's judgments go through TypeSafe's service: decide that before using it more widely.»
Male: «Unblock genuine incoming DM replies in Hermes» / «The September 18 upgrade says this authorized lane remains blocked despite the restored X schedules.»
Bene: «Fix the blocked DM replies in Hermes» / «Real replies to DMs still don't go out since the September 18 upgrade.»
Scrivi in ${nellaLingua()}.`,
    messages: [{
      role: 'user',
      content: 'Carta (dati):\n' + JSON.stringify({
        tipo: c.tipo ?? '', titolo: c.titolo, testo: c.testo, perche: c.perche ?? '', urgenza: c.urgenza ?? ''
      })
    }]
  })
  if (!out) return null
  const titolo = testoDi(out.titolo, 120)
  const testo = testoDi(out.testo, 240)
  const dalModello = testoDi(out.urgenza, 40)
  if (!titolo || !testo) return null
  if (controlla({ titolo, testo, urgenza: '' }).length) return null
  if (!stessoSoggetto(c.titolo, titolo)) return null
  const originale = `${c.titolo} ${c.testo} ${c.urgenza ?? ''} ${c.perche ?? ''}`
  if (!tempoFondato(`${titolo} ${testo}`, originale)) return null
  const diPrima = unaRiga(c.urgenza ?? '')
  const dalCodice = pillola(diPrima, oggi)
  const urgenza = dalCodice !== diPrima ? dalCodice
    : parole(dalModello) <= URGENZA_PAROLE && tempoFondato(dalModello, originale) ? dalModello
    : diPrima
  return { titolo, testo, urgenza }
}

// — il passaggio intero —

/**
 * Le carte come vanno sulla prima pagina: senza doppioni, con il progetto,
 * chiare, con il peso, con la pillola corta, senza lineette.
 *
 * Torna gli stessi oggetti (copiati) nello stesso ordine, meno i doppioni.
 * Senza Jev, tutto quello che chiede un giudizio tace, e resta quello che
 * restava prima: le lineette via e una pillola più corta.
 */
export async function rifinisci<T extends Carta>(voci: readonly T[], opz: Opzioni = {}): Promise<T[]> {
  if (!voci.length) return []
  const registro = opz.registro ?? 'feed'
  const oggi = opz.oggi ?? new Date()

  // 1. i doppioni di quello che ha già
  const aperte = opz.aperte ?? elencoFeed('aperto').map(v => ({ titolo: v.titolo, testo: v.testo }))
  const doppie = await giudizi.doppioni(voci, aperte)
  let carte: T[] = voci.filter(v => {
    const quale = doppie.get(v)
    if (quale) console.warn(`myynd · ${registro} · doppione: «${v.titolo.slice(0, 60)}» è la stessa cosa di «${quale.slice(0, 60)}»`)
    return !quale
  })
  if (!carte.length) return carte

  // 2. il progetto, a chi non ce l'ha
  const progetti = opz.progetti ?? []
  let conProgetto = 0
  if (progetti.length >= 2) {
    const senza = carte.filter(v => !v.progetto)
    const scelti = await giudizi.progettoDelle(senza, progetti.map(p => ({ nome: p.nome, obiettivo: p.obiettivo ?? undefined })))
    const perNome = new Map(progetti.map(p => [p.nome.trim().toLowerCase(), p.id]))
    carte = carte.map(v => {
      const nome = scelti.get(v)
      const id = nome ? perNome.get(nome.trim().toLowerCase()) : undefined
      if (!id) return v
      conProgetto++
      return { ...v, progetto: id }
    })
  }

  // 3. si capisce? e 4. quanto conta: le due domande in una chiamata, per carta
  const giudicate = await giudizi.giudicaCarte(carte, { oggi })
  let daRiscrivere = 0, riscritte = 0, conPeso = 0
  carte = await Promise.all(carte.map(async v => {
    const g = giudicate.get(v)
    let c: T = v
    // la pillola prima del controllo: un'urgenza che il codice sa accorciare
    // non è un motivo per pagare una riscrittura
    const guardata = { ...v, urgenza: typeof v.urgenza === 'string' ? pillola(v.urgenza, oggi) : v.urgenza }
    if (g && (g.chiara < giudizi.SOGLIA_CHIARA || controlla(guardata).length)) {
      daRiscrivere++
      const motivi = [...(g.chiara < giudizi.SOGLIA_CHIARA ? [`chiara ${g.chiara.toFixed(2)}`] : []), ...controlla(guardata)]
      const nuova = await riscrivi(v, oggi)
      if (nuova) {
        riscritte++
        console.log(`myynd · ${registro} · riscritta (${motivi.join(', ')}): «${v.titolo.slice(0, 60)}» → «${nuova.titolo.slice(0, 60)}»`)
        c = { ...v, ...nuova }
      } else {
        console.log(`myynd · ${registro} · non riscritta (${motivi.join(', ')}): «${v.titolo.slice(0, 60)}» resta com'è`)
      }
    }
    const prior = v.doc ? giudizi.priorDelDocumento(v.doc) : null
    const peso = g ? (prior === null ? g.peso : (g.peso + prior) / 2) : prior
    if (peso === null) return c
    conPeso++
    return { ...c, peso: Math.round(peso * 100) / 100 }
  }))

  // 5. la pillola e 6. le lineette
  carte = carte.map(v => ({
    ...v,
    titolo: senzaTrattini(unaRiga(v.titolo)),
    testo: senzaTrattini(unaRiga(v.testo)),
    ...(typeof v.urgenza === 'string' ? { urgenza: senzaTrattini(pillola(v.urgenza, oggi)) } : {}),
    ...(typeof v.perche === 'string' ? { perche: senzaTrattini(v.perche) } : {}),
    ...(typeof v.offerta === 'string' ? { offerta: senzaTrattini(v.offerta) } : {})
  }))

  console.log(
    `myynd · ${registro} · rifinitura · ${voci.length} carte: ${doppie.size} doppioni, ${conProgetto} con il progetto da Jev, ` +
    `${giudicate.size} giudicate, ${daRiscrivere} da riscrivere, ${riscritte} riscritte, ${conPeso} con il peso`
  )
  return carte
}
