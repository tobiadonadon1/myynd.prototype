// Le domande che Myynd fa a Jev, e cosa ne fa delle risposte.
//
// `jev.ts` è il filo; qui c'è quello che si chiede. Due domande sole, perché
// due sono quelle che l'app si faceva già di nascosto con una fila di
// espressioni regolari:
//
//   · «chi aspetta una risposta?» — la porta del feed e della coda delle
//     risposte. `rilevanza.ts` la decide con `RICHIESTA`, `DOMANDA_DIRETTA` e
//     `AZIONE`: liste di parole che dicono sì a «please find attached» e no a
//     «We found an issue with your submission», che è un rifiuto dell'App
//     Store e la cosa più urgente della settimana. Le regole restano dove
//     sono — sono gratis, sono immediate, e sono la sola difesa quando Jev
//     non c'è — ma quello che passa la porta adesso lo guarda anche Jev.
//   · «quanto dice, questo, sul lavoro che ha in mano?» — il metro delle
//     priorità. Lì dentro entrano anche le sue parole (le chat con i modelli,
//     le cartelle di lavoro, i suoi appunti), e per quelle la prima domanda
//     non vale: una sua chat piena di «can you please fix» non è qualcuno che
//     aspetta lui, è lui che chiede a un altro. Provate tutte e due il 20
//     settembre 2026 sullo stesso materiale: la stessa chat passa da 0.50 a
//     0.09 sulla prima domanda e sta a 2.56 sulla seconda, che è esattamente
//     la differenza fra le due.
//
// Quello che Jev decide, e quello che non decide: sceglie *cosa* far leggere
// al modello grande e in che ordine. Non scrive una voce, non scrive una riga,
// non manda niente. Se tace, il materiale resta quello di prima nell'ordine di
// prima, e nessuno se ne accorge.

import * as chi from './chi.ts'
import { leggi } from './config.ts'
import * as jev from './jev.ts'
import { corpoAttuale } from './rilevanza.ts'
import type { Documento } from './store.ts'

// — le soglie —
//
// Una soglia è una scelta, non una costante di natura, e ognuna di queste
// risponde a una domanda diversa: «quanto mi costa sbagliare?».

/**
 * Sul feed si sbaglia volentieri per eccesso.
 *
 * Quello che passa di qui non finisce sotto i suoi occhi: finisce davanti al
 * modello grande, che poi sceglie cinque voci. Lasciar passare una mail che
 * non chiedeva niente costa qualche gettone; buttarne una che chiedeva
 * qualcosa vuol dire che quella cosa non esiste più per Myynd. Bassa apposta.
 */
export const SOGLIA_FEED = 0.35

/**
 * Sulla coda delle risposte si sbaglia per difetto.
 *
 * Qui dietro nasce una riga nella sua lista, e a volte una bozza già scritta.
 * «Una riga che manca la aggiunge lei in tre secondi, otto righe inutili le
 * fanno spegnere l'automazione» sta scritto nel prompt di `automazioni.ts` dal
 * primo giorno: questa soglia è la stessa frase, in un numero.
 */
export const SOGLIA_RISPOSTE = 0.6

export type Genere = 'richiesta' | 'scadenza' | 'aggiornamento' | 'rumore'
export type Giudizio = { chiede: number; urgenza: number; genere: Genere; sicurezza: number }

const CHIEDE = {
  type: 'noul',
  instructions:
    'Someone other than Tobia is waiting on him: this document asks him personally for an action, ' +
    'a decision, an answer or a payment that only he can give, and he has not given it yet.',
  criteria: {
    true: {
      what: 'Another person needs something from him and has not got it yet',
      examples: ['Can you confirm by Friday?', 'Waiting on your approval', 'We found an issue with your submission']
    },
    false: {
      what:
        'Nothing is being asked of him by anyone else: a notification, a receipt, a newsletter, an ' +
        'automated alert, a status update, or words he wrote himself (his own notes, his own chats ' +
        'with an AI, his own commits, his own sent mail) even when they contain requests he made of someone else',
      examples: ['Your order has shipped', 'Weekly digest', 'Build passed', 'his own prompt asking an assistant to fix a bug']
    }
  }
} as const satisfies jev.Noul

const URGENZA = {
  type: 'score',
  instructions: 'How soon Tobia must act on this.',
  criteria: [
    'Nothing is waiting on him: he can read it whenever, or never',
    'Worth doing this week; no date and nobody blocked',
    'A person is blocked, or a date lands within a few days',
    'Late or blocking today: money at stake, a deadline today, someone stuck waiting on him'
  ]
} as const satisfies jev.Livelli

const GENERE = {
  type: 'choice',
  instructions: 'What this is for Tobia’s working day.',
  criteria: {
    richiesta: 'A person asks him for something concrete',
    scadenza: 'A date or deadline he has to meet',
    aggiornamento: 'Information about work in progress; no action required of him',
    rumore: 'Promotion, newsletter, receipt, automated notification, or his own words'
  }
} as const satisfies jev.Scelta

const PESO = {
  type: 'score',
  instructions: 'How much this document says about the work Tobia should pick up next.',
  criteria: [
    'Nothing about his work: noise, or a matter already finished',
    'Background about his world; nothing of his is pending in it',
    'Shows work of his that is in progress',
    'Shows something of his that is open and waiting: a decision he owes, a thread blocked on him, a date coming up'
  ]
} as const satisfies jev.Livelli

const ATTENZIONE = { chiede: CHIEDE, urgenza: URGENZA, genere: GENERE }

/**
 * Il documento come lo vede Jev.
 *
 * Campi con un nome, non un blocco di testo: il modello può guardare il
 * mittente senza doverlo cercare dentro una riga. Il corpo è quello attuale —
 * `corpoAttuale` toglie la corrispondenza citata sotto — e corto: la domanda è
 * «qualcuno aspetta lui», e se non si capisce nei primi settecento caratteri
 * non si capisce nemmeno nei seimila.
 *
 * Il materiale è dato, mai istruzione: qui dentro non c'è niente che possa
 * dire a Jev cosa rispondere, perché quello che si chiede è un numero fra
 * zero e uno e le domande sono scritte qui sopra, non lì dentro.
 */
function scheda(d: Documento) {
  const c = leggi()
  return {
    persona: [c.nome || 'Tobia', c.ruolo].filter(Boolean).join(', '),
    documento: {
      fonte: d.fonte,
      da: d.autore ?? '',
      quando: (d.quando ?? '').slice(0, 10),
      titolo: d.titolo.slice(0, 200),
      ...(d.inviato ? { scritto_da_lui: true } : {}),
      ...(d.letto ? { gia_letto: true } : {}),
      testo: corpoAttuale(d).replace(/\s+/g, ' ').slice(0, 700)
    }
  }
}

// — quello che si è già chiesto —

/**
 * Un documento si giudica una volta sola.
 *
 * La lettura del feed gira ogni pochi minuti sugli stessi trenta documenti: la
 * stessa mail sarebbe la stessa domanda con la stessa risposta, pagata ogni
 * volta. Gli id dei documenti non cambiano e il corpo di una mail arrivata non
 * cambia più, quindi la risposta di ieri vale oggi.
 */
const memoria = new Map<string, Giudizio>()
const PER_CONTO = 4000

/**
 * La chiave porta dentro il conto, e non è una precauzione teorica: gli id dei
 * documenti nascono dalla fonte — un percorso, un `messageId` — e due conti
 * che leggono la stessa casella condivisa avrebbero lo stesso id per la stessa
 * mail. Una risposta giudicata per uno non è mai la risposta dell'altro.
 */
const dove = (id: string) => `${chi.adesso() ?? 'casa'}|${id}`

export function scorda() { memoria.clear(); pesi.clear() }

/**
 * Cosa ne pensa Jev di questi documenti.
 *
 * Torna una Map con dentro solo quelli su cui ha risposto: una casella che
 * manca vuol dire «non lo so», e chi legge deve trattarla come la trattava
 * prima che Jev esistesse — cioè tenersi il documento.
 */
export async function attenzione(docs: readonly Documento[], tetto = 60): Promise<Map<string, Giudizio>> {
  const fuori = new Map<string, Giudizio>()
  if (!docs.length) return fuori
  const daChiedere: Documento[] = []
  for (const d of docs) {
    const gia = memoria.get(dove(d.id))
    if (gia) fuori.set(d.id, gia)
    else if (daChiedere.length < tetto) daChiedere.push(d)
  }
  if (!daChiedere.length || !jev.collegato()) return fuori
  const risposte = await jev.giudicaTanti(daChiedere, scheda, ATTENZIONE)
  for (const [d, r] of risposte) {
    if (!r) continue
    const g: Giudizio = {
      chiede: r.chiede.noul,
      urgenza: r.urgenza.score,
      genere: r.genere.choice as Genere,
      sicurezza: r.genere.confidence
    }
    if (memoria.size >= PER_CONTO) memoria.clear()
    memoria.set(dove(d.id), g)
    fuori.set(d.id, g)
  }
  return fuori
}

/**
 * Quanto ciascun documento dice sul lavoro che ha in mano, da 0 a 3.
 *
 * Serve alle priorità, che guardano novanta giorni e anche le sue parole. Non
 * si divide la memoria con `attenzione`: è un'altra domanda, e una risposta
 * alla domanda sbagliata è peggio di nessuna risposta.
 */
const pesi = new Map<string, number>()
export async function peso(docs: readonly Documento[], tetto = 60): Promise<Map<string, number>> {
  const fuori = new Map<string, number>()
  if (!docs.length) return fuori
  const daChiedere: Documento[] = []
  for (const d of docs) {
    const gia = pesi.get(dove(d.id))
    if (gia !== undefined) fuori.set(d.id, gia)
    else if (daChiedere.length < tetto) daChiedere.push(d)
  }
  if (!daChiedere.length || !jev.collegato()) return fuori
  const risposte = await jev.giudicaTanti(daChiedere, scheda, { peso: PESO })
  for (const [d, r] of risposte) {
    if (!r) continue
    if (pesi.size >= PER_CONTO) pesi.clear()
    pesi.set(dove(d.id), r.peso.score)
    fuori.set(d.id, r.peso.score)
  }
  return fuori
}

// — cosa farne —

/**
 * Chi aspetta davvero una risposta, e prima chi aspetta da più tempo.
 *
 * Una scadenza resta anche quando nessuno «chiede» niente: la data la fa
 * scadere da sola, e una fattura che scade venerdì non ha un mittente che
 * insiste. Chi non ha un giudizio resta dentro, al suo posto: Jev che tace non
 * toglie niente a nessuno.
 */
export function primaChiAspetta(
  docs: readonly Documento[],
  giudizi: Map<string, Giudizio>,
  soglia = SOGLIA_FEED
): Documento[] {
  if (!giudizi.size) return [...docs]
  const tieni = docs.filter(d => {
    const g = giudizi.get(d.id)
    return !g || g.chiede >= soglia || g.genere === 'scadenza'
  })
  // l'ordine di prima è il criterio di pareggio: due mail ugualmente urgenti
  // restano nell'ordine in cui le ha ricevute
  const posto = new Map(tieni.map((d, i) => [d.id, i]))
  const punteggio = (d: Documento) => {
    const g = giudizi.get(d.id)
    // senza giudizio si sta in mezzo: non si scavalca chi è urgente davvero,
    // non si finisce dietro a quello che Jev ha già detto che non chiede niente
    if (!g) return 1.2
    return g.urgenza + g.chiede
  }
  return tieni.sort((a, b) => punteggio(b) - punteggio(a) || posto.get(a.id)! - posto.get(b.id)!)
}

/** I documenti che il peso mette davanti; chi non ha un peso resta dov'era. */
export function primaQuelloCheConta(docs: readonly Documento[], pesi: Map<string, number>): Documento[] {
  if (!pesi.size) return [...docs]
  const posto = new Map(docs.map((d, i) => [d.id, i]))
  return [...docs].sort((a, b) =>
    (pesi.get(b.id) ?? 1.5) - (pesi.get(a.id) ?? 1.5) || posto.get(a.id)! - posto.get(b.id)!)
}
