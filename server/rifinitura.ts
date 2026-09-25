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
//   5. la pillola dell'urgenza, scritta assoluta («22 set 9:30») rispetto al
//      giorno in cui la carta è nata, quando dentro c'è una data che si sa
//      leggere: la pagina la legge relativa a oggi («Domani 9:30», poi
//      «Oggi 9:30») con `data-carta.pillolaDi`;
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
import { assoluta, conRelativi, dataNel, oraNel, pillolaDi, inizioDelGiorno, GIORNI_EN, GIORNI_IT, MESI_EN_CORTI, MESI_IT_CORTI, PERCHE_DESCRIZIONE } from './data-carta.ts'
import { PERCHE_PAROLE, percheFondato } from './perche-oggi.ts'

// quando scade una carta: sta in `data-carta.ts`, una foglia; da qui la
// leggono le prove e il resoconto della settimana
export { scadenzaDi } from './data-carta.ts'

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
  /** Quando è nata (ISO): «domani» nella sua urgenza è domani rispetto a questo giorno. */
  nata?: string | null
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
  /** Sotto questa chiarezza si riscrive: sale quando lui scarta carte come «non si capisce» (feed-impara). */
  sogliaChiara?: number
  /** Le carte che ha trovato poco chiare: esempi di come NON scrivere, per la riscrittura. */
  oscure?: readonly { titolo: string; perche: string }[]
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
export function controlla(c: Pick<Carta, 'titolo' | 'testo' | 'urgenza' | 'perche'>): string[] {
  const perche: string[] = []
  const titolo = unaRiga(c.titolo ?? '')
  const testo = unaRiga(c.testo ?? '')
  const urgenza = unaRiga(c.urgenza ?? '')
  const percheOggi = unaRiga(c.perche ?? '')
  if (!titolo) perche.push('titolo vuoto')
  else if (parole(titolo) > TITOLO_PAROLE || titolo.length > TITOLO_CARATTERI) perche.push('titolo lungo')
  if (parole(testo) > TESTO_PAROLE) perche.push('testo lungo')
  if (parole(percheOggi) > PERCHE_PAROLE) perche.push('perché lungo')
  if (CUCITURA.test(testo) || CUCITURA.test(titolo) || CUCITURA.test(percheOggi)) perche.push('due fonti cucite')
  if (conGergo(titolo) || conGergo(testo) || conGergo(percheOggi)) perche.push('gergo')
  if (parole(urgenza) > URGENZA_PAROLE) perche.push('urgenza lunga')
  // «domani» scritto in una carta è vero un giorno solo: si riscrive con il giorno
  if (conRelativi(`${titolo} ${testo} ${percheOggi}`)) perche.push('giorno relativo')
  return perche
}

// — la pillola —
//
// Le date le legge `data-carta.ts` (`dataNel`, `oraNel`): qui resta solo la
// pillola relativa a oggi, che le prove conoscono. Sul feed la pillola si
// salva assoluta (`assoluta`) e si legge relativa (`pillolaDi`).

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

// la descrizione del «perché oggi» sta in perche-oggi.ts (una foglia): da qui la
// leggono le prove di prima
export { PERCHE_DESCRIZIONE }

const FORMA = {
  type: 'object',
  properties: {
    titolo: { type: 'string', description: 'Un verbo all\'inizio e la cosa concreta, al massimo nove parole.' },
    testo: { type: 'string', description: 'Una frase sola, al massimo diciotto parole: il dettaglio, chi aspetta o cosa chiede. Mai oggi, domani o ieri.' },
    urgenza: { type: 'string', description: 'Al massimo tre parole («entro venerdì», «giovedì 9:30», «nessuna fretta»), o vuota.' },
    perche: { type: 'string', description: PERCHE_DESCRIZIONE }
  },
  required: ['titolo', 'testo', 'urgenza', 'perche'],
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
 * Una volta sola, con uno schema di quattro campi. Poi il codice rilegge: gli
 * stessi controlli di `controlla` sui quattro campi, la stessa cosa di cui
 * si parlava (`stessoSoggetto`), nessun giorno inventato (`tempoFondato`: un
 * «venerdì» che nella carta non c'era non entra), un «perché oggi» che regge
 * sulla carta di prima (`percheFondato`), e niente «oggi» o «domani». L'urgenza
 * segue un ordine suo: prima quella del codice, se sa leggere quella di prima
 * (scritta assoluta rispetto alla nascita); poi quella del modello, se corta e
 * fondata; altrimenti resta quella di prima.
 */
async function riscrivi(c: Carta, base: Date, oscure: readonly { titolo: string; perche: string }[] = []): Promise<Pick<Carta, 'titolo' | 'testo' | 'urgenza' | 'perche'> | null> {
  if (!ferri.collegato()) return null
  const out = await ferri.chiediJSON<Record<string, unknown>>({
    lavoro: 'estrazione', max_tokens: 400, formato: FORMA,
    system: `Sei Myynd. Riscrivi UNA carta della prima pagina di questa persona, così che la capisca al primo sguardo: cosa fare, e perché oggi.

— «titolo»: un verbo all'inizio e la cosa concreta. Al massimo ${TITOLO_PAROLE} parole.
— «testo»: UNA frase sola, al massimo ${TESTO_PAROLE} parole: il dettaglio, chi aspetta o cosa chiede. Parole piane, come si parla a un collega. Non cucire due fonti con «mentre»; non raccontare commit, revisioni, corsie, posizionamenti o cosa dice un documento: di' la situazione.
— «urgenza»: al massimo ${URGENZA_PAROLE} parole («entro venerdì», «giovedì 9:30», «nessuna fretta»), o vuota se la carta non dice quando.
— «perche»: UNA riga, al massimo ${PERCHE_PAROLE} parole: perché oggi, cioè chi aspetta e da quando, la data, o cosa si ferma. Mai oggi, domani o ieri: il giorno o la data. Mai il progetto o l'obiettivo.

Nomi, date, cifre e giorni («venerdì») solo se stanno già nella carta: non aggiungere niente, e non cambiare la cosa di cui parla. Niente gergo di prodotto o di consulenza. Niente lineette. Niente virgolette nel titolo.

Male: «Verify Jev keeps Myynd data local before expanding it» / «The September 20 commit uses Jev for reading decisions, while the TypeSafe review says real use calls its service.»
Bene: «Check that Jev keeps Myynd data local» / «Jev's judgments go through TypeSafe's service: decide that before using it more widely.»
Male: «Unblock genuine incoming DM replies in Hermes» / «The September 18 upgrade says this authorized lane remains blocked despite the restored X schedules.»
Bene: «Fix the blocked DM replies in Hermes» / «Real replies to DMs still don't go out since the September 18 upgrade.»
Perché oggi, bene: «Sara aspetta il sì da lunedì per chiudere il preventivo.» «La fattura di Rossi scade venerdì 26.» Male: «Conta per il progetto H-Farm.» «Fa avanzare il sito.»${oscure.length ? `\nMale (le ha trovate poco chiare lui):\n${oscure.map(o => `— «${o.titolo}» / «${o.perche}»`).join('\n')}` : ''}
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
  const perche = testoDi(out.perche, 200)
  const dalModello = testoDi(out.urgenza, 40)
  if (!titolo || !testo || !perche) return null
  if (controlla({ titolo, testo, urgenza: '', perche }).length) return null
  if (!stessoSoggetto(c.titolo, titolo)) return null
  const originale = `${c.titolo} ${c.testo} ${c.urgenza ?? ''} ${c.perche ?? ''}`
  if (!tempoFondato(`${titolo} ${testo}`, originale)) return null
  if (percheFondato(perche, { testo: originale }) !== null) return null
  if (conRelativi(`${titolo} ${testo} ${perche}`)) return null
  const diPrima = unaRiga(c.urgenza ?? '')
  const dalCodice = assoluta(diPrima, base)
  const urgenza = dalCodice !== diPrima ? dalCodice
    : parole(dalModello) <= URGENZA_PAROLE && tempoFondato(dalModello, originale) ? dalModello
    : diPrima
  return { titolo, testo, urgenza, perche }
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
  // la soglia sale quando lui ha scartato carte come «non si capisce»: si riscrive di più
  const soglia = opz.sogliaChiara ?? giudizi.SOGLIA_CHIARA
  const oscure = opz.oscure ?? []
  let daRiscrivere = 0, riscritte = 0, conPeso = 0
  carte = await Promise.all(carte.map(async v => {
    const g = giudicate.get(v)
    let c: T = v
    const nata = v.nata ? new Date(v.nata) : oggi
    const base = Number.isFinite(nata.getTime()) ? nata : oggi
    // la pillola prima del controllo, nella forma in cui si legge: un'urgenza
    // che il codice sa accorciare non è un motivo per pagare una riscrittura
    const guardata = { ...v, urgenza: typeof v.urgenza === 'string' ? pillolaDi(v.urgenza, base.toISOString(), oggi) : v.urgenza }
    if (g && (g.chiara < soglia || controlla(guardata).length)) {
      daRiscrivere++
      const motivi = [...(g.chiara < soglia ? [`chiara ${g.chiara.toFixed(2)}`] : []), ...controlla(guardata)]
      const nuova = await riscrivi(v, base, oscure)
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

  // 5. la pillola, scritta assoluta rispetto alla nascita («22 set 9:30»: la
  // pagina la legge relativa a oggi con `pillolaDi`), e 6. le lineette
  carte = carte.map(v => ({
    ...v,
    titolo: senzaTrattini(unaRiga(v.titolo)),
    testo: senzaTrattini(unaRiga(v.testo)),
    ...(typeof v.urgenza === 'string' ? { urgenza: senzaTrattini(assoluta(v.urgenza, v.nata && Number.isFinite(Date.parse(v.nata)) ? new Date(v.nata) : oggi)) } : {}),
    ...(typeof v.perche === 'string' ? { perche: senzaTrattini(v.perche) } : {}),
    ...(typeof v.offerta === 'string' ? { offerta: senzaTrattini(v.offerta) } : {})
  }))

  console.log(
    `myynd · ${registro} · rifinitura · ${voci.length} carte: ${doppie.size} doppioni, ${conProgetto} con il progetto da Jev, ` +
    `${giudicate.size} giudicate, ${daRiscrivere} da riscrivere, ${riscritte} riscritte, ${conPeso} con il peso`
  )
  return carte
}
