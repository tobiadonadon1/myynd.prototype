// Le domande che Myynd fa a Jev, e cosa ne fa delle risposte.
//
// `jev.ts` è il filo; qui c'è quello che si chiede. Due domande sui documenti,
// perché due sono quelle che l'app si faceva già di nascosto con una fila di
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
// E due domande sulle *carte*, quelle che stanno per finire sulla prima
// pagina (`rifinitura.ts`): «si capisce al primo sguardo?» e «quanto conta
// oggi?». Sono giudizi sulla voce, non sul documento da cui viene, e si
// fanno una volta, quando la voce nasce.
//
// Quello che Jev decide, e quello che non decide: sceglie *cosa* far leggere
// al modello grande e in che ordine, e dice quale carta si legge male. Non
// scrive una voce, non scrive una riga, non manda niente: la riscrittura la
// fa il modello grande. Se tace, il materiale resta quello di prima
// nell'ordine di prima, e nessuno se ne accorge.

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as chi from './chi.ts'
import { cartella, leggi } from './config.ts'
import * as jev from './jev.ts'
import { OSPITATO } from './ospitato.ts'
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
const GENERI = new Set<string>(['richiesta', 'scadenza', 'aggiornamento', 'rumore'])
/**
 * Cosa ne pensa Jev di un documento. `peso` è la quarta risposta, quella
 * delle priorità: si chiede insieme alle altre tre, e chi la finge nelle
 * prove può anche non darla.
 */
export type Giudizio = { chiede: number; urgenza: number; genere: Genere; sicurezza: number; peso?: number }

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

/*
 * Quattro domande in una chiamata, non tre più una.
 *
 * `peso` era una domanda a parte con una memoria a parte: la lettura del feed
 * giudicava un documento, e il giro delle priorità lo rigiudicava — stesso
 * materiale, stessa chiamata pagata due volte. Adesso viaggia con le altre
 * tre, e `peso()` legge prima quella memoria. È facoltativa perché chi finge
 * Jev nelle prove più vecchie risponde a tre domande, e tre risposte buone
 * non devono diventare nessuna.
 */
const ATTENZIONE = { chiede: CHIEDE, urgenza: URGENZA, genere: GENERE, peso: PESO }
const FACOLTATIVE = ['peso'] as const

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
 *
 * E vale anche dopo un riavvio: la memoria sta in una Map, che è la strada
 * veloce, e in `giudizi.json` nella cartella del conto, che è quella che
 * sopravvive. L'app sul Mac si riapre più volte al giorno, e ogni apertura
 * rigiudicava gli stessi sessanta documenti — quattro domande l'uno, per
 * dire quello che aveva già detto. Il file tiene al massimo quattromila
 * risposte, le più recenti, e si scrive intero a ogni giro che ne aggiunge:
 * su un file accanto, poi al suo posto, così un'app chiusa a metà scrittura
 * non lascia un file a metà.
 */
const memoria = new Map<string, Giudizio>()
const pesi = new Map<string, number>()
const PER_CONTO = 4000
/** I conti di cui si è già letto il file: una volta per processo, e poi la Map basta. */
const caricati = new Set<string>()

/*
 * `senzaDisco` spegne il file: la prova sui documenti veri (`prova-jev.ts`)
 * legge la cartella di una persona e non deve lasciarci niente.
 */
let disco = true
export function senzaDisco(si = true) { disco = !si }

const conto = () => chi.adesso() ?? 'casa'

/**
 * La chiave porta dentro il conto, e non è una precauzione teorica: gli id dei
 * documenti nascono dalla fonte — un percorso, un `messageId` — e due conti
 * che leggono la stessa casella condivisa avrebbero lo stesso id per la stessa
 * mail. Una risposta giudicata per uno non è mai la risposta dell'altro.
 */
const dove = (id: string) => `${conto()}|${id}`

function fileRicordi(): string | null {
  if (!disco || (OSPITATO && !chi.adesso())) return null
  return join(cartella(), 'giudizi.json')
}

type Ricordo = Partial<Giudizio>

function carica() {
  const c = conto()
  if (caricati.has(c)) return
  caricati.add(c)
  const f = fileRicordi()
  if (!f) return
  try {
    const j = JSON.parse(readFileSync(f, 'utf8')) as { ricordi?: unknown }
    const voci = Array.isArray(j?.ricordi) ? j.ricordi as unknown[] : []
    for (const voce of voci) {
      if (!Array.isArray(voce) || typeof voce[0] !== 'string' || !voce[1] || typeof voce[1] !== 'object') continue
      const [id, r] = voce as [string, Ricordo]
      const k = `${c}|${id}`
      if (typeof r.chiede === 'number' && typeof r.urgenza === 'number' && typeof r.genere === 'string' && GENERI.has(r.genere)) {
        memoria.set(k, {
          chiede: r.chiede, urgenza: r.urgenza, genere: r.genere,
          sicurezza: typeof r.sicurezza === 'number' ? r.sicurezza : 0,
          ...(typeof r.peso === 'number' ? { peso: r.peso } : {})
        })
      }
      if (typeof r.peso === 'number') pesi.set(k, r.peso)
    }
  } catch { /* nessun file, o storto: si riparte da zero e Jev rigiudica */ }
}

function salva() {
  const f = fileRicordi()
  if (!f) return
  const prefisso = `${conto()}|`
  const ricordi = new Map<string, Ricordo>()
  for (const [k, g] of memoria) if (k.startsWith(prefisso)) ricordi.set(k.slice(prefisso.length), g)
  for (const [k, p] of pesi) {
    if (!k.startsWith(prefisso)) continue
    const id = k.slice(prefisso.length)
    ricordi.set(id, { ...ricordi.get(id), peso: p })
  }
  try {
    const dir = cartella()
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 })
    const tmp = `${f}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify({ versione: 1, ricordi: [...ricordi.entries()].slice(-PER_CONTO) }), { mode: 0o600 })
    renameSync(tmp, f)
  } catch (e) {
    console.warn('myynd · jev · non riesco a scrivere giudizi.json:', e instanceof Error ? e.message : e)
  }
}

/**
 * Dimentica i giudizi: la Map e, salvo `soloMemoria`, anche il file del conto.
 *
 * `soloMemoria` è quello che succede a un riavvio, e serve alle prove per
 * dimostrare che il file basta.
 */
export function scorda(opz: { soloMemoria?: boolean } = {}) {
  memoria.clear(); pesi.clear(); caricati.clear()
  if (opz.soloMemoria) return
  const f = fileRicordi()
  if (f) { try { unlinkSync(f) } catch { /* non c'era */ } }
}

/** Una riga nel registro per ogni giro: è l'unico posto dove si vede cosa costa Jev. */
function registra(cosa: string, conti: { giudicati: number; noti: number; muti: number; fuori: number }) {
  const c = jev.consumo()
  console.log(
    `myynd · jev · ${cosa} · ${conti.giudicati} giudicati, ${conti.noti} già noti, ${conti.muti} senza risposta` +
    `${conti.fuori ? `, ${conti.fuori} oltre il tetto del giro` : ''} · oggi ${c.giudizi}/${jev.TETTO_AL_GIORNO} giudizi, ${c.gettoni.toLocaleString('it')} gettoni`
  )
}

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
  carica()
  const daChiedere: Documento[] = []
  let oltre = 0
  for (const d of docs) {
    const gia = memoria.get(dove(d.id))
    if (gia) fuori.set(d.id, gia)
    else if (daChiedere.length < tetto) daChiedere.push(d)
    else oltre++
  }
  if (!daChiedere.length || !jev.collegato()) return fuori
  const risposte = await jev.giudicaTanti(daChiedere, scheda, ATTENZIONE, { facoltative: FACOLTATIVE })
  let giudicati = 0
  for (const [d, r] of risposte) {
    if (!r) continue
    const g: Giudizio = {
      chiede: r.chiede.noul,
      urgenza: r.urgenza.score,
      genere: r.genere.choice as Genere,
      sicurezza: r.genere.confidence,
      ...(r.peso ? { peso: r.peso.score } : {})
    }
    if (memoria.size >= PER_CONTO) memoria.clear()
    memoria.set(dove(d.id), g)
    if (g.peso !== undefined) pesi.set(dove(d.id), g.peso)
    fuori.set(d.id, g)
    giudicati++
  }
  registra('documenti', { giudicati, noti: fuori.size - giudicati, muti: daChiedere.length - giudicati, fuori: oltre })
  if (giudicati) salva()
  return fuori
}

/**
 * Quanto ciascun documento dice sul lavoro che ha in mano, da 0 a 3.
 *
 * Serve alle priorità, che guardano novanta giorni e anche le sue parole.
 * Prima si guarda se la lettura del feed l'ha già chiesto — la quarta
 * domanda di `attenzione` è questa — e solo per il resto si chiama Jev.
 */
export async function peso(docs: readonly Documento[], tetto = 60): Promise<Map<string, number>> {
  const fuori = new Map<string, number>()
  if (!docs.length) return fuori
  carica()
  const daChiedere: Documento[] = []
  let oltre = 0
  for (const d of docs) {
    const gia = pesi.get(dove(d.id)) ?? memoria.get(dove(d.id))?.peso
    if (gia !== undefined) fuori.set(d.id, gia)
    else if (daChiedere.length < tetto) daChiedere.push(d)
    else oltre++
  }
  if (!daChiedere.length || !jev.collegato()) return fuori
  const risposte = await jev.giudicaTanti(daChiedere, scheda, { peso: PESO })
  let giudicati = 0
  for (const [d, r] of risposte) {
    if (!r) continue
    if (pesi.size >= PER_CONTO) pesi.clear()
    pesi.set(dove(d.id), r.peso.score)
    fuori.set(d.id, r.peso.score)
    giudicati++
  }
  registra('peso', { giudicati, noti: fuori.size - giudicati, muti: daChiedere.length - giudicati, fuori: oltre })
  if (giudicati) salva()
  return fuori
}

/**
 * Quanto è urgente il documento dietro una carta, se Jev l'ha già letto.
 *
 * È il punto di partenza del peso di una carta nata da quel documento: la
 * lettura del feed l'ha giudicato prima di far leggere il documento al
 * modello grande, e quella risposta non si paga due volte. `null` se nessuno
 * gliel'ha mai chiesto.
 */
export function priorDelDocumento(id: string): number | null {
  carica()
  return memoria.get(dove(id))?.urgenza ?? null
}

// — cosa farne —

/**
 * Cosa ha già detto Jev di un documento, se gliel'hanno chiesto: quanto
 * «chiede» qualcuno lì dentro. Solo la memoria: non chiama mai Jev. Serve a
 * chi cerca le carte mancate (`mancate.ts`), che non deve mai pagare un
 * giudizio per una domanda sul passato.
 */
export function chiedeNoto(id: string): number | null {
  carica()
  return memoria.get(dove(id))?.chiede ?? null
}

/**
 * Chi aspetta davvero una risposta, davanti; chi non aspetta nessuno, in fondo.
 *
 * Jev ordina, i trenta posti tagliano: qui non esce nessuno. Prima toglieva
 * dalla fila chi «non chiede niente», e una regola di Jev dice che non
 * decide da solo quello che si vede. Quattro fasce, nell'ordine:
 *
 *   · `davanti`: quelli che chi chiama vuole in testa (le persone a cui ha
 *     risposto da solo senza che il feed gliele mostrasse), nell'ordine in cui
 *     sono arrivati;
 *   · la fila normale: giudicati con `chiede` sopra la soglia o una scadenza
 *     (la data la fa scadere da sola, e una fattura non ha un mittente che
 *     insiste), più chi non ha un giudizio, a un punteggio di mezzo; per
 *     urgenza e chiede, e l'ordine di prima a parità;
 *   · in fondo i giudicati sotto la soglia, nell'ordine di prima;
 *   · `dietro`: quelli che chi chiama vuole in coda (una fonte da cui ha
 *     scartato roba vecchia, e questo è più vecchio di quello che scarta).
 *
 * Senza Jev (nessun giudizio): `davanti`, poi la fila com'era, poi `dietro`.
 * Il terzo argomento accetta ancora un numero, la soglia, come prima.
 */
export function primaChiAspetta(
  docs: readonly Documento[],
  giudizi: Map<string, Giudizio>,
  opz: number | { soglia?: number; davanti?: ReadonlySet<string>; dietro?: ReadonlySet<string> } = {}
): Documento[] {
  const o = typeof opz === 'number' ? { soglia: opz } : opz
  const soglia = o.soglia ?? SOGLIA_FEED
  const davanti = o.davanti ?? new Set<string>()
  const dietro = o.dietro ?? new Set<string>()
  const testa = docs.filter(d => davanti.has(d.id))
  const coda = docs.filter(d => !davanti.has(d.id) && dietro.has(d.id))
  const mezzo = docs.filter(d => !davanti.has(d.id) && !dietro.has(d.id))
  if (!giudizi.size) return [...testa, ...mezzo, ...coda]
  const aspetta = (d: Documento) => {
    const g = giudizi.get(d.id)
    return !g || g.chiede >= soglia || g.genere === 'scadenza'
  }
  const fila = mezzo.filter(aspetta)
  const bassi = mezzo.filter(d => !aspetta(d))
  // l'ordine di prima è il criterio di pareggio: due mail ugualmente urgenti
  // restano nell'ordine in cui le ha ricevute
  const posto = new Map(fila.map((d, i) => [d.id, i]))
  const punteggio = (d: Documento) => {
    const g = giudizi.get(d.id)
    // senza giudizio si sta in mezzo: non si scavalca chi è urgente davvero,
    // non si finisce dietro a quello che Jev ha già detto che non chiede niente
    if (!g) return 1.2
    return g.urgenza + g.chiede
  }
  fila.sort((a, b) => punteggio(b) - punteggio(a) || posto.get(a.id)! - posto.get(b.id)!)
  return [...testa, ...fila, ...bassi, ...coda]
}

/** I documenti che il peso mette davanti; chi non ha un peso resta dov'era. */
export function primaQuelloCheConta(docs: readonly Documento[], pesi: Map<string, number>): Documento[] {
  if (!pesi.size) return [...docs]
  const posto = new Map(docs.map((d, i) => [d.id, i]))
  return [...docs].sort((a, b) =>
    (pesi.get(b.id) ?? 1.5) - (pesi.get(a.id) ?? 1.5) || posto.get(a.id)! - posto.get(b.id)!)
}

// — la stessa cosa due volte —

/**
 * Sopra questa probabilità, una carta nuova è una carta che ha già.
 *
 * Misurata il 21 settembre 2026 sulle sue carte vere. Le tre voci nate dalla
 * stessa conversazione con suo padre — «Dad's reply on Myynd needs a
 * response», «Dad's feedback on Myynd needs a response», «Dad's reply on
 * Myynd — feature request»: una fatta, due scartate — si riconoscono a 0.77 e
 * 0.90. Due fatture dello stesso fornitore, due cose diverse per la stessa
 * persona e due carte a caso rispondono «nessuno» fra 0.87 e 0.95. In mezzo
 * non c'è niente, e la soglia sta lì: 0.55.
 */
export const SOGLIA_DOPPIONE = 0.55

/** Quante carte aperte si mettono davanti a Jev per volta: più opzioni, più la scelta si annacqua. */
const APERTE_A_CONFRONTO = 8

export type Carta = { titolo: string; testo?: string | null }

const PAROLE_VUOTE = new Set(('the a an and or of to for on in with your you his her their this that is are be need needs ' +
  'reply respond answer send confirm review about from myynd il lo la le un una di da per con su che non e a').split(' '))
function paroleUtili(s: string): Set<string> {
  return new Set(s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/).filter(p => p.length >= 3 && !PAROLE_VUOTE.has(p)))
}

/**
 * Le candidate: solo quelle che hanno almeno una parola in comune.
 *
 * Non è la decisione — quella la prende Jev — è il modo di non pagarla. Due
 * carte che non condividono nemmeno un nome, un prodotto o un verbo non sono
 * mai la stessa cosa, e chiederlo costerebbe una domanda per ogni coppia.
 */
function vicine(nuova: Carta, aperte: readonly Carta[]): Carta[] {
  const parole = paroleUtili(`${nuova.titolo} ${nuova.testo ?? ''}`)
  return aperte
    .map(c => ({ c, n: [...paroleUtili(`${c.titolo} ${c.testo ?? ''}`)].filter(p => parole.has(p)).length }))
    .filter(x => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, APERTE_A_CONFRONTO)
    .map(x => x.c)
}

/**
 * Quali carte nuove dicono una cosa che ha già sul feed.
 *
 * Oggi lo decide un conto di parole in comune (`stessoTitolo` in `store.ts`),
 * e quel conto non può distinguere «la risposta a papà» da «il riscontro di
 * papà» — che sono la stessa mail — senza confondere anche «fattura 123» con
 * «fattura 124», che sono due soldi diversi. Jev legge la differenza.
 *
 * Il confronto è anche **fra le carte nuove**: il modello ne scrive due
 * uguali nello stesso giro più spesso di quanto si creda, ed è così che sono
 * nate le tre voci su suo padre.
 *
 * Torna solo i doppioni trovati: una carta che non c'è dentro resta, come
 * resterebbe se Jev non esistesse.
 */
export async function doppioni<T extends Carta>(nuove: readonly T[], aperte: readonly Carta[]): Promise<Map<T, string>> {
  const fuori = new Map<T, string>()
  if (!nuove.length || !jev.collegato()) return fuori
  const confronto: Carta[] = [...aperte]
  for (const nuova of nuove) {
    const candidate = vicine(nuova, confronto)
    if (!candidate.length) { confronto.push(nuova); continue }
    const r = await jev.giudica({
      persona: leggi().nome || 'Tobia',
      carta_nuova: { titolo: nuova.titolo, testo: (nuova.testo ?? '').slice(0, 200) }
    }, {
      doppione: {
        type: 'choice',
        instructions:
          'Which card already on his feed would be satisfied by the same single piece of work as the new card: ' +
          'doing one would leave nothing to do for the other.',
        criteria: Object.fromEntries([
          ...candidate.map((c, i) => [`c${i}`, { what: c.titolo, detail: (c.testo ?? '').slice(0, 160) }]),
          ['nessuno', 'None of them: the new card is separate work, even if it touches the same person, project or thread']
        ])
      } as jev.Scelta
    })
    const d = r?.doppione
    // «nessuno» e le risposte incerte lasciano la carta dov'è: il dubbio non
    // toglie niente a nessuno, e una voce in più costa molto meno di una persa
    if (d && d.choice !== 'nessuno' && (d.probabilities[d.choice] ?? 0) >= SOGLIA_DOPPIONE) {
      const quale = candidate[Number(d.choice.slice(1))]
      if (quale) { fuori.set(nuova, quale.titolo); continue }
    }
    confronto.push(nuova)
  }
  return fuori
}

// — di chi è questa carta —

/**
 * Sopra questa probabilità si scrive il progetto sulla carta.
 *
 * Misurata sui suoi documenti: le chat sul prototipo danno Myynd a 0.99-1.00,
 * l'invito all'audit 0.71, una promozione «nessuno» a 0.96. Sotto 0.6 si
 * lascia decidere alla regola di sempre, che guarda se il nome è scritto.
 */
export const SOGLIA_PROGETTO = 0.6

/**
 * Di quale progetto parla ogni carta.
 *
 * Oggi la prima pagina raggruppa le voci per progetto cercando il *nome* del
 * progetto dentro il titolo (`progettoDelTesto`): una carta che parla del
 * deck senza mai scrivere «Evermute» finisce nel blocco di nessuno. Qui si
 * chiede, e si scrive la risposta sulla carta quando nasce — non a ogni
 * apertura della pagina, che deve restare istantanea.
 *
 * La chiave della Map è il nome del progetto come l'ha scritto lui: chi
 * chiama lo traduce nell'id.
 */
export async function progettoDelle<T extends Carta>(
  carte: readonly T[],
  progetti: readonly { nome: string; obiettivo?: string }[]
): Promise<Map<T, string>> {
  const fuori = new Map<T, string>()
  if (!carte.length || progetti.length < 2 || !jev.collegato()) return fuori
  const criteri = Object.fromEntries([
    ...progetti.map(p => [p.nome, { what: p.obiettivo?.slice(0, 200) || p.nome }]),
    ['nessuno', 'None of them: personal, admin, or something outside his projects']
  ])
  const risposte = await jev.giudicaTanti(carte, c => ({
    persona: leggi().nome || 'Tobia',
    carta: { titolo: c.titolo, testo: (c.testo ?? '').slice(0, 300) }
  }), {
    progetto: {
      type: 'choice',
      instructions: 'Which of his projects this card belongs to.',
      criteria: criteri
    } as jev.Scelta
  })
  for (const [c, r] of risposte) {
    const p = r?.progetto
    if (!p || p.choice === 'nessuno') continue
    if ((p.probabilities[p.choice] ?? 0) >= SOGLIA_PROGETTO) fuori.set(c, p.choice)
  }
  return fuori
}

// — si capisce, e quanto conta —

/**
 * Sotto questa probabilità una carta non si capisce al primo sguardo, e il
 * modello grande la riscrive.
 *
 * Misurata il 21 settembre 2026 sulle sue carte vere (`npm run prova:jev --
 * --conto … --carte`), il giorno in cui le ha chiamate «chaotic, confusing».
 * Le sette aperte: «Verify Jev keeps Myynd data local…» (cuce due fonti con
 * un «while») 0.18, «Unblock genuine incoming DM replies in Hermes» 0.18,
 * «Choose the first audience angle…» 0.30, «Approve the X draft…» 0.30,
 * «Record the Myynd walkthrough…» 0.42; e le due che si leggono, «Prepare
 * for Amanda's Myynd audit on September 22» 0.70 e «Fix Evermute's family
 * account issues…» 0.76. Le chiuse da poco stanno fra 0.26 e 0.60. Carte
 * scritte a mano come dovrebbero essere — «Reply to Apple about the Evermute
 * review video / Apple asked for a device recording; nothing went back yet»
 * 0.90, «Pay the Rossi invoice / It is due Friday and Rossi wrote twice»
 * 0.93, «Rispondi a Sara sulla proposta» 0.86, «Paga l'F24 entro il 30» 0.88
 * — stanno sopra 0.68; quelle buone ma senza un perché adesso («Pick an
 * audience for tobiadonadon.com») fra 0.45 e 0.50; una newsletter 0.10, un
 * titolo di gergo 0.19. Fra 0.50 e 0.60 non c'è finito niente: la soglia sta
 * lì. Sbagliare per eccesso costa una riscrittura piccola, che il codice
 * rilegge; sbagliare per difetto lascia sulla pagina la carta che non capiva.
 */
export const SOGLIA_CHIARA = 0.55

export type CartaIntera = Carta & { tipo?: string | null; perche?: string | null; urgenza?: string | null }
export type GiudizioCarta = { chiara: number; peso: number }

const CHIARA = {
  type: 'noul',
  instructions:
    'A busy person reading only the title and the line under it would know at a glance what to do and why it matters now.',
  criteria: {
    true: {
      what:
        'The title names one concrete action on one concrete thing, and the line says who is waiting or why now, ' +
        'in the plain words a colleague would use across a desk',
      examples: [
        'Reply to Apple about the review video. Apple asked for a device recording; nothing went back yet.',
        'Pay the Rossi invoice. It is due Friday and Rossi wrote twice.'
      ]
    },
    false: {
      what:
        'The reader would have to stop and think: two sources stitched together with «while», talk of commits, ' +
        'reviews, lanes, angles or positioning instead of the situation, product or consulting jargon, a line that ' +
        'describes a document instead of saying what to do, or no reason why it matters now',
      examples: [
        'The March commit uses the new parser for imports, while the vendor review says real use calls its service.',
        'Unblock the authorized inbound lane: the upgrade notes say it remains gated despite the restored schedules.'
      ]
    }
  }
} as const satisfies jev.Noul

const PESO_CARTA = {
  type: 'score',
  instructions: 'How much it matters that he sees and acts on this card today, given today’s date.',
  criteria: [
    'Background: nothing of his is waiting; he can read it whenever, or never',
    'Worth doing this week; no date and nobody blocked',
    'A person is waiting on him, or a date lands within a few days',
    'Today or late: money at stake, a deadline today or tomorrow, someone stuck waiting on him'
  ]
} as const satisfies jev.Livelli

const GIORNI = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
/** «Monday 2026-09-21», nel fuso di chi guarda: a mezzanotte l'ISO direbbe ieri. */
function giornoDi(d: Date): string {
  const due = (n: number) => String(n).padStart(2, '0')
  return `${GIORNI[d.getDay()]} ${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`
}

/**
 * Le due domande sulla carta, in una chiamata: si capisce? e quanto conta oggi?
 *
 * La data di oggi sta nel materiale, perché «domani alle 9:30» vale tre solo
 * se domani è domani. Nessuna memoria: una carta si giudica quando nasce, e
 * nasce una volta.
 */
export async function giudicaCarte<T extends CartaIntera>(
  carte: readonly T[],
  opz: { oggi?: Date } = {}
): Promise<Map<T, GiudizioCarta>> {
  const fuori = new Map<T, GiudizioCarta>()
  if (!carte.length || !jev.collegato()) return fuori
  const oggi = opz.oggi ?? new Date()
  const persona = leggi().nome || 'Tobia'
  const risposte = await jev.giudicaTanti(carte, c => ({
    persona,
    oggi: giornoDi(oggi),
    carta: {
      tipo: c.tipo ?? '',
      titolo: c.titolo.slice(0, 200),
      testo: (c.testo ?? '').slice(0, 400),
      perche: (c.perche ?? '').slice(0, 200),
      urgenza: (c.urgenza ?? '').slice(0, 80)
    }
  }), { chiara: CHIARA, peso: PESO_CARTA })
  let giudicati = 0
  for (const [c, r] of risposte) {
    if (!r) continue
    fuori.set(c, { chiara: r.chiara.noul, peso: r.peso.score })
    giudicati++
  }
  registra('carte', { giudicati, noti: 0, muti: carte.length - giudicati, fuori: 0 })
  return fuori
}

// — la freccia del punto —
//
// «It is not file-specific. It links me to the folder, not the file. It'd
// rather be: if it's a single file, if it's readable and it's worthy for the
// user to read, or no link at all. We can have Jev determine that.»
//
// Due porte, non una. La prima è una regola e non costa niente
// (`scrivania.unaCosaSola`): una cartella non si apre, una riga che non porta
// da nessuna parte nemmeno. La seconda è questa, ed è la parte che una regola
// non sa fare — se quel documento, aperto, valga i dieci secondi che ci
// vogliono ad aprirlo.

/**
 * Sotto questa, la freccia non si disegna.
 *
 * Mezzo punto, perché qui sbagliare costa poco da tutt'e due le parti: una
 * freccia in meno è una riga che si legge lo stesso, una freccia di troppo è
 * un documento aperto per niente. Non c'è ragione di pendere da un lato.
 */
export const SOGLIA_DA_APRIRE = 0.5

const VALE_APRIRLO = {
  type: 'noul',
  instructions:
    'Opening this document would put in front of Tobia the very thing the briefing line talks about, ' +
    'and reading it is worth his ten seconds.',
  criteria: {
    true: {
      what:
        'One document he would want open in front of him: the email he has to answer, the page with the ' +
        'news in it, the file with the figures or the text the line is about',
      examples: [
        'The line says a client asks him to confirm the scope, and the document is that email',
        'The line says the Q4 brief changed, and the document is the brief'
      ]
    },
    false: {
      what:
        'Opening it would show him nothing he can use: a folder or a project directory, an index, a log, ' +
        'a build output, a file written by a program, a chat session of his own with an assistant, or a ' +
        'document that does not actually contain what the line says',
      examples: [
        'The line talks about what changed in a project, and the document is the project folder',
        'The line reports a delivery, and the document is a machine-generated notification log'
      ]
    }
  }
} as const satisfies jev.Noul

/**
 * Quali fra queste righe meritano la freccia.
 *
 * Torna solo quelle su cui Jev ha risposto: una che manca vuol dire «non lo
 * so», e chi legge tiene la freccia che aveva — la regola pura l'ha già
 * guardata, e senza Jev il punto resta quello che era.
 */
export async function valeAprire<T extends { testo: string; doc: Documento }>(
  righe: readonly T[]
): Promise<Map<T, number>> {
  const fuori = new Map<T, number>()
  if (!righe.length || !jev.collegato()) return fuori
  const persona = leggi().nome || 'Tobia'
  const risposte = await jev.giudicaTanti(righe, r => ({
    persona,
    riga: r.testo.slice(0, 240),
    documento: {
      fonte: r.doc.fonte,
      tipo: r.doc.tipo,
      da: r.doc.autore ?? '',
      titolo: r.doc.titolo.slice(0, 200),
      testo: corpoAttuale(r.doc).replace(/\s+/g, ' ').slice(0, 700)
    }
  }), { vale: VALE_APRIRLO })
  let giudicati = 0
  for (const [r, risposta] of risposte) {
    if (!risposta) continue
    fuori.set(r, risposta.vale.noul)
    giudicati++
  }
  registra('frecce del punto', { giudicati, noti: 0, muti: righe.length - giudicati, fuori: 0 })
  return fuori
}

// — la rassegna: chi esce quando sono più di dieci —
//
// «We shall never exceed the 10 news; if we reach the cap, we remove the less
// interesting ones with Jev.» La rassegna aggiunge un'infornata ogni venti
// minuti e ne tiene dieci: quando ne arriva un'undicesima, qualcuna deve
// uscire, e l'ordine d'arrivo non basta — un rilascio di due giorni fa vale
// più di un pezzo d'opinione di stamattina.
//
// Si chiede una volta per notizia (il voto resta scritto nella riga), e solo
// quando c'è da scegliere: una rassegna sotto le dieci non costa niente.

const INTERESSE_NOTIZIA = {
  type: 'noul',
  instructions:
    'Given his work and what he follows, this person would want to read this news story today.',
  criteria: {
    true: {
      what:
        'A release or announcement from a frontier AI lab (a new model, product, feature, price or API change from ' +
        'Anthropic, OpenAI, Google DeepMind, Meta, xAI, Mistral and the like), or a fact that changes something he is working on',
      examples: [
        'OpenAI releases a new model to developers, with lower prices in the API',
        'Anthropic launches a new Claude model and a Claude Code feature for teams'
      ]
    },
    false: {
      what:
        'General news, a minor funding round, an opinion or explainer piece, a listicle, a product in a field he does ' +
        'not work in, or one more article on a story he already has',
      examples: [
        'Ten ways to use AI to plan your holidays',
        'A regional startup raises a seed round for an HR tool'
      ]
    }
  }
} as const satisfies jev.Noul

/**
 * Quanto interessa ognuna di queste notizie, da 0 a 1.
 *
 * Torna solo quelle su cui Jev ha risposto: chi chiama ordina le altre come
 * faceva prima, con le parole in comune con il lavoro e la freschezza.
 */
export async function interesseNotizie<T extends { id: string; titolo: string; riassunto: string; fonte: string }>(
  notizie: readonly T[],
  lavoro: readonly string[]
): Promise<Map<string, number>> {
  const fuori = new Map<string, number>()
  if (!notizie.length || !jev.collegato()) return fuori
  const persona = leggi().nome || 'Tobia'
  const segue = lavoro.slice(0, 10).map(l => l.slice(0, 220))
  const risposte = await jev.giudicaTanti(notizie, n => ({
    persona,
    segue,
    notizia: { fonte: n.fonte, titolo: n.titolo.slice(0, 200), riassunto: n.riassunto.slice(0, 320) }
  }), { interessa: INTERESSE_NOTIZIA })
  let giudicati = 0
  for (const [n, r] of risposte) {
    if (!r) continue
    fuori.set(n.id, r.interessa.noul)
    giudicati++
  }
  registra('notizie', { giudicati, noti: 0, muti: notizie.length - giudicati, fuori: 0 })
  return fuori
}

/**
 * Sopra questa probabilità una notizia nuova è lo stesso fatto di una che c'è.
 *
 * Misurata il 22 settembre 2026 sulle notizie vere del giorno. Lo stesso
 * fatto: FT «cheaper AI model ahead of IPO» = Opus 5.5 di Mashable 0.60, i
 * due GPT-6 0.72, i due Gemini hackerati 0.69. Fatti diversi sulla stessa
 * azienda (Muse bloccato da Amazon, Muse corretto da Meta, un'assunzione di
 * Anthropic, Opus 5.5 dentro Copilot) danno «nessuno» fra 0.87 e 1.00: la
 * carta migliore non passa mai 0.13. Mezzo punto sta in mezzo con margine.
 */
export const SOGLIA_STESSO_FATTO = 0.5

const STESSO_FATTO = 'Which story already in his news reports the same event as the new story, so that reading one ' +
  'would leave nothing new in the other: the same launch, deal, incident or decision, even if the headline is worded differently.'

/**
 * Quali notizie nuove raccontano un fatto che la rassegna ha già.
 *
 * Il giorno di un rilascio ne scrivono tutti, e non sempre col nome del
 * modello: «Anthropic releases cheaper AI model ahead of IPO» (FT) è Opus 5.5
 * di Mashable detto con altre parole, e nessuna regola sulle parole lo vede.
 * Torna, per ogni nuova che è un doppione, l'id di quella che c'era. Si
 * confronta anche fra le nuove, come per le carte.
 */
export async function stessoFatto<T extends { id: string; titolo: string; riassunto: string }>(
  nuove: readonly T[],
  presenti: readonly { id: string; titolo: string; riassunto: string }[]
): Promise<Map<string, string>> {
  const fuori = new Map<string, string>()
  if (!nuove.length || !jev.collegato()) return fuori
  const carta = (n: { id: string; titolo: string; riassunto: string }) => ({ id: n.id, titolo: n.titolo, testo: n.riassunto.slice(0, 200) })
  const confronto = presenti.map(carta)
  let chieste = 0
  for (const nuova of nuove) {
    const candidate = vicine(carta(nuova), confronto) as ReturnType<typeof carta>[]
    if (!candidate.length) { confronto.push(carta(nuova)); continue }
    chieste++
    const r = await jev.giudica({
      persona: leggi().nome || 'Tobia',
      notizia_nuova: { titolo: nuova.titolo, riassunto: nuova.riassunto.slice(0, 200) }
    }, {
      stesso: {
        type: 'choice',
        instructions: STESSO_FATTO,
        criteria: Object.fromEntries([
          ...candidate.map((c, i) => [`c${i}`, { what: c.titolo, detail: (c.testo ?? '').slice(0, 160) }]),
          ['nessuno', 'None of them: the new story reports a different event, even if it names the same company or product']
        ])
      } as jev.Scelta
    })
    const d = r?.stesso
    if (d && d.choice !== 'nessuno' && (d.probabilities[d.choice] ?? 0) >= SOGLIA_STESSO_FATTO) {
      const quale = candidate[Number(d.choice.slice(1))]
      if (quale) { fuori.set(nuova.id, quale.id); continue }
    }
    confronto.push(carta(nuova))
  }
  registra(`stesso fatto (${fuori.size} ${fuori.size === 1 ? 'doppione' : 'doppioni'})`, { giudicati: chieste, noti: 0, muti: 0, fuori: 0 })
  return fuori
}
