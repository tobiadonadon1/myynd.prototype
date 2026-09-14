// Il punto: quello che Myynd ti dice quando torni.
//
// Il feed guarda i documenti e dice cosa merita attenzione. La lista tiene
// quello che hai deciso tu. La rassegna porta il mondo. Nessuna delle tre
// risponde alla domanda che si fa aprendo l'app dopo quattro ore: *cosa è
// cambiato mentre non c'ero?* Il punto è quella risposta, e la scrive il
// modello grande — è l'unico posto dell'app dove la qualità del testo è tutto
// il prodotto, e per questo è anche l'unico lavoro di frontiera che si
// concede un tetto suo: tre al giorno, mai a meno di tre ore l'uno
// dall'altro, mai se non è successo niente.
//
// Le domande a cui risponde sono quattro, e le ha scelte lui: i progetti si
// sono mossi; su GitHub è successo qualcosa; c'è una notizia che vale la pena
// leggere; qualcuno ha risposto per email. Quattro sezioni, otto righe in
// tutto, e niente altro.
//
// Quello che NON è il punto sono le cose da fare. Il modello continua a
// notarle nel materiale — una mail che chiede un preventivo, un modulo da
// rimandare — ma non finiscono in questa finestra: diventano righe della sua
// lista, con dentro il documento da cui vengono, e la freccia nel feed apre
// quella mail. Una cosa da fare detta dentro una finestra che poi si chiude è
// un compito che gli abbiamo dato noi; una riga nel feed è una cosa che si
// fa. Era la prima cosa che gli dava fastidio: «quello lo devi mettere nel
// mio feed, non lì».
//
// Il punto stesso sta in un file JSON nella cartella della persona, come le
// automazioni: non è materiale da cercare, è un foglio che si riscrive.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cartella, nellaLingua } from './config.ts'
import { attesaDi, chiedi, collegato, estraiJSON } from './modello.ts'
import { senzaTrattini } from './testo.ts'
import * as store from './store.ts'
import { attendibile, carta } from './memoria.ts'
import { fuoco } from './timone.ts'
import { affinita, gusto } from './gusto.ts'
import * as automazioni from './automazioni.ts'
import { giornoIn, parti } from './fuso.ts'
import * as progetti from './progetti.ts'
import * as compiti from './compiti.ts'
import * as ordine from './ordine.ts'

/** Quanti punti al giorno, per persona. È il lavoro più caro dell'app. */
export const AL_GIORNO = 3
/** Sotto queste ore dall'ultimo non se ne fa un altro, a meno che non lo chieda lei. */
export const ORE_FRA = 3
/** Quanto indietro guarda il primo punto, quando non ce n'è uno precedente. */
const GIORNI_PRIMO = 7
/** I documenti nel materiale: titolo e un pezzo di corpo, non di più. */
const DOCS_MAX = 20
const CORPO_MAX = 200

/**
 * Una riga del punto: una frase, e il documento da cui viene.
 *
 * Il `compito` non c'è più. Una riga del punto non è una cosa da fare — quelle
 * stanno in lista — quindi l'unica cosa che può esserci dietro a una frase è
 * il documento che la dice: la mail, la pagina di GitHub, il file.
 */
export type Riga = { testo: string; doc: string | null }

/** Un progetto che si è mosso: cosa è cambiato, e dove si vede. */
export type Progetto = {
  /** La riga in tabella: il punto non inventa più progetti, parla di quelli che ci sono. */
  id: string
  nome: string
  /** La novità da quando ci siamo visti. Una frase, e dev'essere successa davvero. */
  novita: string
  /** Il documento che la mostra, quando la novità viene da lì. */
  doc: string | null
}

export type Punto = {
  quando: string
  /**
   * Da quanti minuti mancava quando è stato fatto, se la finestra lo sapeva.
   * Il saluto lo compone la pagina da qui: al modello non si chiede di
   * indovinare un'assenza, perché la indovinava dalla finestra del materiale
   * — «sei stato via sette giorni» al primo punto, che guarda sette giorni.
   */
  via: number | null
  /** I progetti che si sono mossi. */
  progetti: Progetto[]
  /** Cosa è successo sui repository. Vuoto quando GitHub non è collegato. */
  github: Riga[]
  daLeggere: { titolo: string; perche: string; link: string | null }[]
  /** Chi ha risposto per email: chi ha scritto, e cosa vuole. */
  risposte: Riga[]
}

export type Esito = {
  punto: Punto | null
  /** Vero se il modello è stato chiamato adesso; falso se è quello di prima. */
  generatoAdesso: boolean
  /** Vero se ha chiesto un punto nuovo e per oggi il conto è finito. */
  tetto: boolean
  /**
   * Quando è di ieri.
   *
   * Un punto è la fotografia di un momento, e il giorno dopo non è più «il
   * punto di oggi»: si torna `punto: null` con qui la data di quello vecchio,
   * così la pagina propone di rifarlo invece di far leggere cose già fatte.
   */
  vecchio?: string | null
  /** Perché non è arrivato: la frase del modello, così com'è, da mostrare. */
  guaio?: string
}

/** Cosa ci si può portare dietro nella richiesta. */
export type Richiesta = {
  /** Anche se è presto, anche se non è cambiato niente. Il tetto del giorno vale lo stesso. */
  forza?: boolean
  /** Da quanti minuti manca, se il client lo sa: il saluto lo dice con le sue parole. */
  via?: number | null
}

/** Il foglio su disco. */
type Archivio = {
  ultimo: Punto | null
  /** Com'erano prima della tabella: `progetti.ts` li importa da qui una volta, poi non si legge più. */
  progetti: { nome: string; dal: string }[]
  /** Gli angoli che ha detto che non sono così: non tornano. */
  scartati: string[]
  /** Quando il modello è stato chiamato, per contare quelli di oggi. */
  chiamate: string[]
  /** Le automazioni accese da qui: non si ripropongono. */
  avviate?: string[]
}

const VUOTO: Archivio = { ultimo: null, progetti: [], scartati: [], chiamate: [], avviate: [] }

const FILE = () => join(cartella(), 'punto.json')

/**
 * Un foglio scritto da una versione di prima.
 *
 * Il punto aveva cinque sezioni e adesso ne ha quattro, e quello che c'era
 * scritto non si converte: «adesso» erano mosse, e le mosse adesso sono righe
 * della lista. Si tiene l'unica cosa che serve ancora — `quando`, che è il
 * cancello e la finestra del materiale — e le sezioni che non c'erano nascono
 * vuote invece di far esplodere la lettura.
 */
function riallinea(p: Punto): Punto {
  const righe = (xs: unknown): Riga[] =>
    Array.isArray(xs)
      ? (xs as Partial<Riga>[])
        .filter(r => !!r && typeof r.testo === 'string')
        .map(r => ({ testo: r.testo as string, doc: r.doc ?? null }))
      : []
  const vecchi = (Array.isArray(p.progetti) ? p.progetti : []) as Partial<Progetto>[]
  return {
    quando: p.quando,
    via: p.via ?? null,
    progetti: vecchi
      .filter(x => !!x && typeof x.novita === 'string' && !!x.id)
      .map(x => ({ id: x.id as string, nome: x.nome ?? '', novita: x.novita as string, doc: x.doc ?? null })),
    github: righe(p.github),
    daLeggere: Array.isArray(p.daLeggere) ? p.daLeggere : [],
    risposte: righe(p.risposte)
  }
}

function leggiArchivio(): Archivio {
  try {
    const letto = JSON.parse(readFileSync(FILE(), 'utf8')) as Partial<Archivio>
    const a = { ...VUOTO, ...letto }
    if (a.ultimo) a.ultimo = riallinea(a.ultimo)
    return a
  } catch {
    return { ...VUOTO }
  }
}

function scriviArchivio(a: Archivio) {
  const dove = cartella()
  if (!existsSync(dove)) mkdirSync(dove, { recursive: true, mode: 0o700 })
  writeFileSync(FILE(), JSON.stringify(a, null, 2), { mode: 0o600 })
}

/** Quello che c'è, senza chiamare nessuno. */
export function ultimo(): Punto | null {
  return leggiArchivio().ultimo
}

/**
 * Il punto come sta adesso, non come stava quando l'ha scritto il modello.
 *
 * È la fotografia di un momento, e il mondo va avanti: un progetto che lui ha
 * chiuso mezz'ora dopo non deve continuare a raccontare le sue novità dentro
 * una finestra che dice «oggi». Le altre righe non scadono — una mail che è
 * arrivata è arrivata, una notizia è uscita — quindi qui si controlla solo
 * quello che può sparire sotto le mani.
 *
 * È una funzione pura: `chiusi` sono i nomi in minuscolo e gli id dei progetti
 * chiusi, e glieli passa chi chiama.
 */
export function aggiornaAlPresente(
  p: Punto,
  chiusi: { nomi: Set<string>; id: Set<string> } = { nomi: new Set(), id: new Set() }
): Punto {
  const nome = (s: string) => s.trim().toLowerCase()
  return {
    ...p,
    progetti: p.progetti.filter(x => !(x.id && chiusi.id.has(x.id)) && !chiusi.nomi.has(nome(x.nome)))
  }
}

/** Lo stesso, con la tabella presa dal vivo: ogni punto che esce passa di qui. */
function alPresente(p: Punto): Punto {
  const spenti = progetti.elenco('chiuso')
  return aggiornaAlPresente(p, {
    nomi: new Set(spenti.map(x => x.nome.trim().toLowerCase())),
    id: new Set(spenti.map(x => x.id))
  })
}

// — il materiale —

/**
 * Chi manda posta in massa: non entra nel materiale.
 *
 * È un'euristica sul mittente, e lo sa. Il giorno che l'indice porterà un
 * segno suo per la posta promozionale, questa riga lo userà al posto del
 * proprio fiuto — ma un punto che apre con «è arrivata la newsletter di
 * Vinted» è un punto che non si legge più dal secondo giorno.
 */
const IN_MASSA = /no-?reply|not?-?reply|newsletter|notifications?@|mailer|donotreply|noreply|marketing@|news@|info@|promo/i

export function inMassa(d: store.Documento): boolean {
  // la posta letta dopo oggi porta il segno dal connettore (`massa`, dalle
  // intestazioni); quella di prima no, e allora si giudica dal mittente
  if (d.massa) return true
  const chi = (d.autore ?? '').toLowerCase()
  return IN_MASSA.test(chi) || IN_MASSA.test(d.titolo.toLowerCase())
}

/**
 * Dal disco arriva quasi solo rumore, e il punto lo raccontava per primo.
 *
 * L'undici settembre il punto apriva così: «il dev server di tobiaweb è
 * ripartito più volte inseguendo il testo dello stile della casa». Era vero,
 * e veniva da un log di terminale sotto `~/terminals/` entrato nell'indice
 * come tutti gli altri file. Il disco è la fonte più grossa che c'è ed è
 * quella che produce meno notizie: log, file di build, appunti scritti da un
 * programma, roba che cambia da sola cento volte al giorno.
 *
 * Una notizia dal disco è un documento vero, appena arrivato, dove le cose
 * vere arrivano — la scrivania, i documenti, gli scaricati, iCloud — e non
 * dieci cartelle più sotto. Tutto il resto del disco esiste, si cerca, si
 * legge quando serve: semplicemente non si racconta.
 *
 * Le altre fonti passano tutte: una mail, un impegno, una nota, una pagina di
 * Notion, una trascrizione sono già, per come sono arrivate, cose che qualcuno
 * ha mandato o scritto apposta.
 */
const CARTELLE_DOC = ['Desktop', 'Documents', 'Downloads', 'Library/Mobile Documents/com~apple~CloudDocs']
/** Il file, o una cartella sola sotto: più giù è archivio, non è arrivato adesso. */
const PROFONDITA_DOC = 2
/** Una fattura, un contratto, una bozza. Non un txt, non un markdown, non un csv. */
const ESTENSIONE_DOC = /\.(pdf|docx?|xlsx?|pptx?|pages|numbers|key|odt|ods|odp|rtf)$/i
/** Quanti file dal disco al massimo, i più recenti: il resto non entra nel punto. */
const DISCO_MAX = 5

export function documentoVero(d: store.Documento): boolean {
  if (d.fonte !== 'desktop') return true
  const p = (d.percorso || d.id.replace(/^desktop:/, '')).replace(/\\/g, '/')
  if (!ESTENSIONE_DOC.test(p)) return false
  return CARTELLE_DOC.some(c => {
    const i = p.indexOf(`/${c}/`)
    if (i < 0) return false
    const dentro = p.slice(i + c.length + 2)
    return !!dentro && dentro.split('/').length <= PROFONDITA_DOC
  })
}

/** Le fonti da cui arriva la posta: da un file o da un impegno non risponde nessuno. */
const FONTI_POSTA = new Set(['posta', 'google', 'microsoft'])
/** «Re:», «R:», «Fwd:»: una mail che continua una conversazione, non una che la comincia. */
const RIMANDO = /^\s*(re|r|rif|fwd|fw)\s*:/i
/** Quante risposte e quante notizie da GitHub si mostrano al modello. */
const FILO_MAX = 8

/**
 * Una risposta è una mail dentro una conversazione che c'era già.
 *
 * Chi sia un cliente non si sa, e non lo si indovina dal dominio. Quello che si
 * sa è se questa mail continua qualcosa di suo: o lo dice l'oggetto, o nel filo
 * c'è un messaggio partito da lui. Tutto il resto è posta in arrivo, e sta dove
 * sta già — nel feed, che è il posto delle cose che arrivano.
 */
export function eUnaRisposta(d: store.Documento): boolean {
  if (!FONTI_POSTA.has(d.fonte) || d.inviato) return false
  if (RIMANDO.test(d.titolo)) return true
  return !!d.filo && store.stessoFilo(d.filo, [d.id], 10).some(x => x.inviato)
}

export type Materiale = {
  dal: string
  /** Il primo punto di sempre: il materiale è una finestra, non un'assenza. */
  primo: boolean
  /** Quello che ha detto che non gli interessa: si toglie dal materiale e si dice al modello. */
  nonInteressa: string[]
  arrivati: store.Documento[]
  /** Quello che è arrivato da GitHub da allora: senza il connettore, vuoto. */
  github: store.Documento[]
  /** Le mail che rispondono a lui, o che stanno in un filo dove ha scritto. */
  risposte: store.Documento[]
  /** Quanti ne sono arrivati di veri, anche quelli che non si elencano. */
  indicizzati: number
  azioni: store.Azione[]
  /** Le righe della lista che aspettano un dito suo. */
  attendono: store.Compito[]
  /** Le righe aperte per oggi. */
  perOggi: store.Compito[]
  /** Le righe chiuse da allora. */
  chiuse: store.Compito[]
  /** Il lavoro che Myynd ha consegnato da allora: le righe diventate pronte, o che chiedono. */
  preparate: store.Compito[]
  feed: { id: string; titolo: string; doc: string | null; quando: string }[]
  notizie: store.Notizia[]
  fuoco: string
  carta: string
  convinzioni: store.Convinzione[]
  /** I suoi progetti, con l'obiettivo: quelli vivi, dalla tabella. */
  progetti: progetti.Progetto[]
}

function daAllora(quando: string | null | undefined, dal: string): boolean {
  return !!quando && quando >= dal
}

/** Tutto quello che il punto guarda, raccolto in un posto per poterlo provare. */
export function raccogli(dal: string, primo = false): Materiale {
  const arrivati = store.appenaArrivati(dal, 200)

  /*
   * Quello che ha già scartato non torna dalla porta di servizio.
   *
   * Una voce del feed buttata con «non mi interessa», una riga lasciata
   * perdere, un mittente che ha scartato più volte: sono le cose che ha detto
   * a Myynd con un dito, e un punto che le rimette in cima — «il gestore
   * dello stabile ha scritto» — dice che non l'ha ascoltato. Si tolgono dal
   * materiale, e le si nominano al modello perché non ci giri intorno.
   */
  const scartate = [...store.elencoFeed('scartato'), ...store.elencoFeed('scaduto')]
  const docsScartati = new Set(scartate.map(v => v.doc).filter((d): d is string => !!d))
  const lasciate = store.compitiChiusi(80).filter(c => c.stato === 'lasciato')
  const docsLasciati = new Set(lasciate.map(c => c.doc).filter((d): d is string => !!d))
  const mittenti = store.mittentiScartati()
  const daMittenteScartato = (d: store.Documento) => {
    const ind = (store.indirizzoDi(d.autore) ?? '').toLowerCase()
    if (!ind) return false
    const dominio = ind.slice(ind.indexOf('@') + 1)
    return mittenti.indirizzi.includes(ind) || mittenti.domini.includes(dominio)
  }
  const fuori = (d: store.Documento) => docsScartati.has(d.id) || docsLasciati.has(d.id) || inMassa(d) || daMittenteScartato(d)
  const nonInteressa = [
    ...scartate.slice(0, 12).map(v => v.titolo),
    ...lasciate.slice(0, 6).map(c => c.testo)
  ].filter(Boolean)
  /*
   * Quello che ha fatto Myynd da solo non è una notizia.
   *
   * «L'automazione Priorità in arrivo è girata due volte mentre non c'eri» era
   * la prima riga del punto dell'undici settembre, e non chiedeva niente a
   * nessuno: un'automazione che gira è Myynd che fa il suo mestiere, e
   * raccontarlo è chiedergli di leggere il nostro registro. Quello che resta è
   * quello che ha bisogno di lui: una cosa andata storta, o una mail partita
   * su sua richiesta. Il lavoro consegnato si vede dove si può toccare, cioè
   * nelle righe della lista (`preparate`).
   */
  const azioni = store.azioni(200)
    .filter(a => a.quando >= dal && !(a.tipo === 'automazione' && a.esito === 'fatta'))
  const vive = store.elencoCompiti()
  const data = parti(new Date())
  const oggi = `${data.anno}-${String(data.mese).padStart(2, '0')}-${String(data.giorno).padStart(2, '0')}`
  const chiuse = store.compitiChiusi(40).filter(c => daAllora(c.chiuso, dal))

  // le notizie di oggi che non ha ancora aperto, dalla più vicina al suo gusto
  const g = gusto()
  const notizie = store.notizie(1)
    .filter(n => !n.letta)
    .map(n => ({ n, punti: affinita(g, n.titolo, n.fonte) }))
    .sort((a, b) => b.punti - a.punti || b.n.presa.localeCompare(a.n.presa))
    .slice(0, 3)
    .map(x => x.n)

  // quello che è arrivato davvero: niente scarti, niente rumore dal disco, e
  // dal disco al massimo cinque, i più recenti (`appenaArrivati` li dà già in
  // ordine). Quelli che restano fuori non sono «notizie non elencate»: non
  // sono notizie, e per questo non contano nemmeno nel conto
  let dalDisco = 0
  const daDire = arrivati.filter(d => {
    if (fuori(d) || !documentoVero(d)) return false
    return d.fonte !== 'desktop' || ++dalDisco <= DISCO_MAX
  })

  /*
   * Le due sezioni che hanno un elenco loro.
   *
   * GitHub e le risposte non si pescano da «ARRIVATO»: sono due delle quattro
   * domande a cui il punto risponde, e se restassero in mezzo agli altri
   * venti documenti il taglio a venti potrebbe mangiarsele. Si prendono prima,
   * e dal mucchio generale escono — dirle due volte costa gettoni e non
   * aggiunge niente.
   */
  const github = daDire.filter(d => d.fonte === 'github').slice(0, FILO_MAX)
  const risposte = daDire.filter(eUnaRisposta).slice(0, FILO_MAX)
  const aParte = new Set([...github, ...risposte].map(d => d.id))

  return {
    dal,
    primo,
    nonInteressa,
    arrivati: daDire.filter(d => !aParte.has(d.id)).slice(0, DOCS_MAX),
    github,
    risposte,
    indicizzati: daDire.length,
    azioni,
    attendono: vive.filter(c => c.stato === 'pronto' || c.stato === 'chiede'),
    perOggi: vive.filter(c => c.stato === 'aperto' && (c.giorno ? c.giorno <= oggi : c.quando === 'oggi')),
    chiuse,
    preparate: vive.filter(c => (c.stato === 'pronto' || c.stato === 'chiede') && daAllora(c.aggiornato, dal)),
    feed: store.elencoFeed('aperto').slice(0, 12).map(v => ({ id: v.id, titolo: v.titolo, doc: v.doc ?? null, quando: v.quando })),
    notizie,
    fuoco: fuoco(),
    carta: carta(),
    convinzioni: store.convinzioni('persona').filter(attendibile).slice(0, 8),
    progetti: progetti.vivi()
  }
}

/**
 * È successo qualcosa da allora?
 *
 * È il cancello che conta di più: un punto rifatto su niente di nuovo è lo
 * stesso punto con parole diverse, pagato al modello grande. Le righe della
 * lista contano se sono state toccate — una diventata pronta, una chiusa —
 * non se esistono.
 */
export function successoQualcosa(m: Materiale): boolean {
  if (m.indicizzati || m.azioni.length || m.chiuse.length || m.preparate.length) return true
  if (m.feed.some(v => daAllora(v.quando, m.dal))) return true
  /*
   * Una riga che ha scritto il punto stesso non è una novità.
   *
   * Ogni cosa da fare che il punto nota diventa una riga della lista, e un
   * punto ne lascia dietro fino a tre appena nate: senza questa riga il giro dopo le
   * troverebbe create da allora, direbbe che è successo qualcosa, e il punto
   * si rifarebbe da solo — a spese sue, per raccontarsi quello che ha appena
   * scritto. Torna a contare appena la tocca lui: la sposta, la chiude, la
   * affida a Myynd. Allora la novità è sua.
   */
  const diLui = (c: store.Compito) => !(c.origine === 'punto' && c.stato === 'aperto' && c.aggiornato <= c.creato)
  return [...m.attendono, ...m.perOggi].filter(diLui).some(c => daAllora(c.aggiornato, m.dal) || daAllora(c.creato, m.dal))
}

// — il prompt —

/** Vale per ogni campo di testo: la stessa frase, detta al modello dove la scrive. */
const PIANA = 'Una frase sola, piana, al massimo dodici parole. Mai la lineetta (—, –), mai le parentesi, mai il corsivo o il grassetto.'

const schema = (
  docs: string[], github: string[], risposte: string[], nomi: string[],
  progettiId: string[], compitiId: string[]
) => {
  /** Una riga con dietro un documento, preso da un elenco preciso. */
  const riga = (ids: string[], quale: string) => ({
    type: 'object',
    properties: {
      testo: { type: 'string', description: PIANA },
      doc: { type: 'string', enum: ['', ...ids], description: quale }
    },
    required: ['testo', 'doc'],
    additionalProperties: false
  })
  return {
    type: 'object',
    properties: {
      progetti: {
        type: 'array',
        description: 'Al massimo tre, uno per progetto, e solo quelli che il materiale ha mosso davvero. Vuoto va benissimo.',
        items: {
          type: 'object',
          properties: {
            nome: { type: 'string', enum: ['', ...nomi], description: 'Il nome del progetto, copiato dall’elenco alla lettera.' },
            novita: { type: 'string', description: `Cosa è successo su quel progetto da allora. ${PIANA}` },
            doc: { type: 'string', enum: ['', ...docs], description: 'L’id del documento che lo mostra, o vuoto se la novità è una riga chiusa.' }
          },
          required: ['nome', 'novita', 'doc'],
          additionalProperties: false
        }
      },
      github: {
        type: 'array',
        description: 'Al massimo tre, e solo dai documenti di GitHub elencati. Senza quelli, vuoto.',
        items: riga(github, 'L’id del documento di GitHub di cui parla la riga. Obbligatorio.')
      },
      daLeggere: {
        type: 'array',
        description: 'Al massimo due, solo fra le notizie elencate, solo se c’entrano con il suo lavoro. Vuoto va benissimo.',
        items: {
          type: 'object',
          properties: {
            titolo: { type: 'string', description: 'Il titolo della notizia, copiato alla lettera.' },
            perche: { type: 'string', description: `Perché conta per quello su cui lavora. ${PIANA}` }
          },
          required: ['titolo', 'perche'],
          additionalProperties: false
        }
      },
      risposte: {
        type: 'array',
        description: 'Al massimo tre, e solo fra le email elencate come risposte. Vuoto va benissimo.',
        items: riga(risposte, 'L’id della mail di cui parla la riga. Obbligatorio.')
      },
      compiti: {
        type: 'array',
        description: 'Al massimo tre cose da fare che vedi nel materiale. NON sono righe del punto: finiscono nella sua lista. Vuoto va benissimo.',
        /*
         * Una cosa da fare deve poter dire da dove viene.
         *
         * Con il solo «doc» le cose nate dalle domande di una riga della lista
         * uscivano nude: la carta non aveva niente da aprire, e lui l’ha detto
         * con una frase sola — «non mi portano alla fonte vera». Adesso le
         * strade sono tre, e almeno una si riempie sempre: il documento, la
         * riga che ha fatto nascere la cosa, il progetto a cui appartiene.
         */
        items: {
          type: 'object',
          properties: {
            testo: { type: 'string', description: PIANA },
            doc: { type: 'string', enum: ['', ...docs], description: 'L’id del documento da cui viene la cosa da fare, così la riga apre quella mail.' },
            compito: { type: 'string', enum: ['', ...compitiId], description: 'L’id della riga della lista da cui viene, quando nasce dalle domande o dal lavoro di quella riga.' },
            progetto: { type: 'string', enum: ['', ...progettiId], description: 'L’id del progetto a cui appartiene, copiato dall’elenco dei progetti.' }
          },
          required: ['testo', 'doc', 'compito', 'progetto'],
          additionalProperties: false
        }
      }
    },
    required: ['progetti', 'github', 'daLeggere', 'risposte', 'compiti'],
    additionalProperties: false
  }
}

/**
 * L'istruzione: chi è, cosa sa di lui, i progetti con il loro obiettivo, gli
 * angoli già suoi e quelli rifiutati. Cambia poco fra un punto e l'altro, ed è
 * per questo che va nel blocco che si mette in cache; il materiale del giorno
 * sta nel messaggio.
 *
 * `prima` sono i progetti dell'ultimo punto: da lì si prende «dove sei» e
 * l'angolo proposto la volta scorsa. I progetti veri — nome, obiettivo, stato
 * — stanno in `m.progetti`, dalla tabella.
 */
export function istruzione(m: Materiale, prima: Progetto[], scartati: string[]): string {
  const ultimo = (nome: string) => prima.find(p => p.nome.toLowerCase() === nome.toLowerCase())

  return [
    `Sei Myynd. Questa persona torna all'app dopo un po' e tu le fai il punto. Il
punto risponde a quattro domande, e a nessun'altra: i suoi progetti si sono
mossi, su GitHub è successo qualcosa, c'è una notizia che vale la pena
leggere, qualcuno le ha risposto per email.`,
    m.carta ? `Chi è:\n${m.carta}` : '',
    m.convinzioni.length
      ? 'Quello che sai di come lavora:\n' + m.convinzioni.map(k => `— ${k.enunciato}`).join('\n')
      : '',
    m.fuoco ? `Ti ha chiesto di concentrarti su questo, e viene prima di tutto il resto:\n${m.fuoco}` : '',
    m.progetti.length
      ? 'I suoi progetti, e a cosa punta ciascuno. Tieni gli stessi nomi, alla lettera, e ' +
        'parla solo di quelli che il materiale ha mosso davvero. Non inventarne di nuovi: ' +
        'se una cosa non è in questo elenco, non è un progetto. Fra parentesi quadre c\'è ' +
        'l\'id: serve solo per il campo «progetto» delle cose da fare, non si scrive mai ' +
        'in una frase e non si copia dentro «nome».\n' +
        m.progetti.map(p => {
          const u = ultimo(p.nome)
          return `— [${p.id}] ${p.nome}${p.obiettivo ? `: ${p.obiettivo}` : ' (obiettivo non scritto)'}` +
            ` (${p.stato}, dal ${p.dal.slice(0, 10)})` +
            (u?.novita ? `\n  l'ultima volta hai detto: ${u.novita}` : '')
        }).join('\n')
      : 'Non ha ancora scritto i suoi progetti: la sezione «progetti» resta vuota.',
    scartati.length
      ? 'Cose che ha detto che NON sono così. Non riproporle, nemmeno riformulate.\n' +
        scartati.map(a => `— ${a}`).join('\n')
      : '',
    m.nonInteressa.length
      ? 'Cose che ha detto che NON gli interessano. Non nominarle, non farne una ' +
        'riga del punto, non farne una cosa da fare — nemmeno se nel materiale ce n\'è traccia:\n' +
        m.nonInteressa.map(x => `— ${x}`).join('\n')
      : '',
    `Come si scrive, senza eccezioni. Vale per ogni campo di testo che riempi:
— Una frase sola per riga, piana, dalle dieci alle dodici parole al massimo,
  con il punto in fondo. Il punto si legge in dieci secondi.
— Nelle frasi che scrivi non compare MAI la lineetta lunga «—» né quella
  media «–». Un inciso o diventa una frase sua, o si toglie: non si attacca
  con un trattino. Vietate anche le parentesi tonde.
— Niente corsivo, niente grassetto, niente markdown, niente due punti per
  incastrare due frasi in una riga, niente elenchi dentro una riga.
— Tono piano, niente entusiasmo, niente «io», niente cappelli.
— NON dire da quanto manca né quanto tempo è passato: non lo sai. Quello lo
  dice la pagina.
— Concreto: nomi, cifre e date che hai letto davvero nel materiale. Niente
  inventato, niente aggettivi al posto dei fatti.
— Meno righe è sempre meglio: una sezione vuota è una risposta giusta, per
  ogni sezione. Non riempire per arrivare al massimo.
— In tutto il punto, al massimo otto righe. Se non ne hai otto che valgono,
  scrivine tre.

Cosa NON è una notizia, mai:
— Quello che ha fatto Myynd da solo (automazioni, letture) non è una notizia.
— Un file sul disco è una notizia solo se è un documento vero arrivato adesso:
  una fattura, un contratto, una bozza.
— Le cose tecniche (server, deploy, log) non entrano nel punto, a meno che non
  vengano da GitHub, e allora stanno nella loro sezione.

Le quattro sezioni, e cosa ci va:
— «progetti»: al massimo tre, uno per progetto, e solo quelli che si sono
  mossi. La novità dev'essere scritta in un documento arrivato da allora o in
  una riga chiusa da allora: se viene da un documento, metti il suo id in
  «doc». Niente «va avanti», niente «prosegue»: cosa è successo, con i nomi e
  le cifre che hai letto. Se nessun progetto si è mosso, la sezione resta
  vuota.
— «github»: al massimo tre, solo dai documenti di GitHub elencati. Ogni riga
  dice il repository e cosa è successo: unita, aperta, fallita, spinta. L'id
  del documento va sempre in «doc». Senza documenti di GitHub la sezione resta
  vuota.
— «daLeggere»: al massimo due, solo fra le notizie elencate e solo se
  c'entrano con quello su cui lavora. Vuoto è la risposta giusta quasi sempre.
— «risposte»: al massimo tre, solo fra le email elencate come risposte. Ogni
  riga dice chi ha scritto e cosa vuole, nella lingua dell'app. L'id della mail
  va sempre in «doc», così si apre con un dito.
— «compiti»: cose da fare che vedi nel materiale (una mail che chiede
  qualcosa, un modulo da rimandare): finiranno nella sua lista, con dentro da
  dove vengono; non sono righe del punto. Al massimo tre, all'imperativo, una
  cosa concreta e fattibile oggi, e mai una cosa che nella lista c'è già.
— Da dove viene una cosa da fare: è obbligatorio dirlo, e si dice con questi
  tre campi. «doc» quando la cosa sta scritta in un documento: l'id di quel
  documento. «compito» quando la cosa nasce da una riga della lista — le
  domande che una riga gli fa, il lavoro che una riga aspetta: l'id di quella
  riga, quello fra parentesi quadre. «progetto» quando la cosa appartiene a un
  progetto: il suo id, quello fra parentesi quadre nell'elenco dei progetti.
  Almeno uno dei tre va riempito, e riempirne due è meglio di uno. Una cosa da
  fare che non apre niente è una cosa da fare che lui non può fare.
— Non ripeterti: la stessa cosa detta in due sezioni è una cosa sola. Se una
  risposta racconta già che il cliente ha scritto, il progetto non lo ripete.
— Gli id — dei documenti, delle righe, dei progetti — li prendi SOLO da quelli
  elencati nel materiale; altrimenti stringa vuota.
Scrivi in ${nellaLingua()}: ogni campo, i compiti compresi.`
  ].filter(Boolean).join('\n\n')
}

function ore(daIso: string, adesso: number): number {
  return Math.max(0, Math.round((adesso - new Date(daIso).getTime()) / 3600_000))
}

/**
 * Il materiale, come lo legge il modello.
 *
 * Quello che ha fatto Myynd da solo non c'è più: non è una delle quattro
 * domande, e finché c'era il modello lo raccontava — «l'automazione Priorità in
 * arrivo è girata due volte mentre non c'eri» era la prima riga di un punto
 * vero, e non chiedeva niente a nessuno.
 */
export function materiale(m: Materiale, via: number | null | undefined, adesso: number): string {
  const documento = (d: store.Documento) =>
    `— id: ${d.id}\n  ${d.titolo}${d.autore ? ` · da ${d.autore}` : ''} · ${d.fonte}\n  ${d.corpo.slice(0, CORPO_MAX).replace(/\s+/g, ' ')}`

  // il progetto sulla riga: è il filo che una cosa nata dalle sue domande
  // eredita, e senza scriverlo qui il modello non ha modo di nominarlo
  const compito = (c: store.Compito) =>
    `— [${c.id}] ${c.testo} (${c.stato}${c.giorno ? `, pianificato per ${c.giorno}` : c.quando === 'oggi' ? ', per oggi' : ''}` +
    `${c.progetto ? `, progetto [${c.progetto}]` : ''})` +
    (c.stato === 'pronto' && c.risultato ? `\n  bozza: ${c.risultato.slice(0, 200).replace(/\s+/g, ' ')}` : '') +
    (c.stato === 'chiede' && c.chieste?.length ? `\n  chiede: ${c.chieste.map(x => x.domanda).join(' · ')}` : '')

  return [
    (m.primo
      ? `Primo punto: il materiale copre gli ultimi ${GIORNI_PRIMO} giorni, ma NON è un'assenza — non dire da quanto manca.`
      : `Da quando: ${m.dal} (${ore(m.dal, adesso)} ore fa).`) +
      (via && via > 0 ? `\nÈ stato via circa ${via < 90 ? `${via} minuti` : `${Math.round(via / 60)} ore`}.` : ''),
    m.arrivati.length
      ? `ARRIVATO (${m.arrivati.length} documenti, i più nuovi prima):\n` + m.arrivati.map(documento).join('\n')
      : 'ARRIVATO: niente.',
    m.github.length
      ? 'SU GITHUB (da allora):\n' + m.github.map(documento).join('\n')
      : 'SU GITHUB: niente. La sezione «github» resta vuota.',
    m.risposte.length
      ? 'HANNO RISPOSTO (email dentro conversazioni dove ha scritto anche lui):\n' + m.risposte.map(documento).join('\n')
      : 'HANNO RISPOSTO: nessuno. La sezione «risposte» resta vuota.',
    'LA SUA LISTA:' +
      (m.attendono.length ? '\nAspettano lui:\n' + m.attendono.map(compito).join('\n') : '') +
      (m.perOggi.length ? '\nAperte per oggi:\n' + m.perOggi.map(compito).join('\n') : '') +
      (m.chiuse.length ? '\nChiuse da allora:\n' + m.chiuse.map(c => `— ${c.testo} (${c.stato})`).join('\n') : '') +
      (!m.attendono.length && !m.perOggi.length && !m.chiuse.length ? ' vuota.' : ''),
    m.feed.length
      ? 'SUL FEED, ANCORA APERTE:\n' + m.feed.map(v => `— ${v.titolo}${daAllora(v.quando, m.dal) ? ' (nuova)' : ''}`).join('\n')
      : '',
    m.notizie.length
      ? 'LA RASSEGNA DI OGGI (le più vicine al suo gusto):\n' +
        m.notizie.map(n => `— ${n.titolo} · ${n.fonte}${n.perche ? `\n  ${n.perche}` : ''}`).join('\n')
      : ''
  ].filter(Boolean).join('\n\n')
}

// — il punto —

type Grezzo = {
  progetti?: { nome?: string; novita?: string; doc?: string }[]
  github?: Partial<Riga>[]
  daLeggere?: { titolo?: string; perche?: string }[]
  risposte?: Partial<Riga>[]
  /** Le cose da fare che ha visto: non sono righe del punto, sono righe della lista. */
  compiti?: Partial<Notata>[]
}

/** Una riga corta resta corta anche se il modello non ha ascoltato. */
const TESTO_MAX = 120
const accorcia = (s: string) => (s.length > TESTO_MAX ? `${s.slice(0, TESTO_MAX - 1).trimEnd()}…` : s)

/**
 * Il testo come lo legge lui: corto, e senza lineette.
 *
 * La lineetta lunga era il difetto che si vedeva prima di tutti gli altri —
 * ogni riga con il suo inciso, e la finestra sembrava una pagina di appunti
 * fitta invece di un foglio da leggere in dieci secondi. Il prompt adesso lo
 * dice chiaro, ma un modello che ricade non deve poterlo far vedere: qui
 * l'inciso torna a essere una frase sua, e quello che avanza si taglia.
 */
const ripulisci = (s: string) => accorcia(senzaTrattini(s.trim()).trim())

/** Quante righe in tutto, sommando tutte le sezioni. Sotto sta, sopra no. */
const RIGHE_MAX = 8

/**
 * Le parole che portano il senso di una riga: senza punteggiatura, senza le corte.
 *
 * Sotto le quattro lettere ci stanno gli articoli, le preposizioni e i verbi
 * di servizio di tutte e due le lingue: tenerli vorrebbe dire che due righe
 * che non c'entrano niente si somigliano perché dicono «che» e «per».
 */
function paroleDi(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .split(/\s+/)
      .filter(p => p.length >= 4)
  )
}

/**
 * Due frasi che dicono la stessa cosa.
 *
 * Il punto dell'undici settembre diceva del dev server di tobiaweb in quattro
 * sezioni diverse: quattro righe su dieci per una cosa sola, e lui l'ha letto
 * come «mi sta dicendo sempre la stessa cosa». Il
 * prompt lo vieta, ma il modello si ripete lo stesso — e allora si conta:
 * metà delle parole che contano in comune (Jaccard) e la seconda riga non
 * esce. Non è una somiglianza di senso, è una rete grossolana: prende il caso
 * che si vede, e lascia passare due righe che parlano davvero di due cose.
 */
export function ridondante(a: string, b: string): boolean {
  const x = paroleDi(a)
  const y = paroleDi(b)
  if (!x.size || !y.size) return false
  let comuni = 0
  for (const p of x) if (y.has(p)) comuni++
  return comuni / (x.size + y.size - comuni) >= 0.5
}

/**
 * Una cosa da fare vista nel materiale, con da dove viene.
 *
 * Il tredici settembre il punto ne ha scritte due — «di' quale unità di H-Farm
 * guarda l'audit», «decidi il passo dopo» — e sulla carta non c'era niente da
 * aprire: nascevano dalle domande di una riga della lista, e quel filo non
 * finiva scritto da nessuna parte. «Non mi portano alla fonte vera», ha detto.
 * Le strade sono tre e almeno una si riempie: il documento che la dice, la
 * riga che l'ha fatta nascere, il progetto a cui appartiene.
 */
export type Notata = {
  testo: string
  /** Il documento da cui viene, quando sta scritta in un documento. */
  doc: string | null
  /** Il progetto a cui appartiene. */
  progetto: string | null
  /** La riga della lista da cui viene: da lì si eredita il documento e il progetto. */
  compito: string | null
}

/** Quello che esce da `ricuci`: il punto da mostrare, e quello che non si mostra. */
export type Ricucito = {
  punto: Punto
  /**
   * Le cose da fare che il modello ha visto nel materiale.
   *
   * Non sono righe del punto e non arrivano mai al client: passano da
   * `ancoraAlleRighe` e diventano righe della sua lista, con dentro il
   * documento da cui vengono. È la differenza fra dirgli «c'è questo da fare»
   * dentro una finestra che si chiude, e metterglielo dove le cose si fanno.
   */
  compiti: Notata[]
}

/**
 * Da quello che ha scritto il modello a un punto che si può mostrare.
 *
 * Gli id passano solo se stanno nel materiale — cintura oltre alle bretelle
 * dell'enum — e ognuna delle due sezioni che vivono di documenti (GitHub, le
 * risposte) prende gli id solo dal suo elenco: una riga di GitHub che punta a
 * una mail non è una riga di GitHub. I progetti si ritrovano per nome fra
 * quelli della tabella: uno che non c'è non entra, perché il punto non inventa
 * più progetti.
 */
export function ricuci(g: Grezzo, m: Materiale, quando: string, via: number | null = null): Ricucito {
  const chiave = (s: string) => s.trim().toLowerCase()
  const tuttiIDoc = new Set([...m.arrivati, ...m.github, ...m.risposte].map(d => d.id))
  const idGithub = new Set(m.github.map(d => d.id))
  const idRisposte = new Set(m.risposte.map(d => d.id))

  /*
   * Una cosa una volta sola.
   *
   * Chi dedupa tiene l'elenco di quello che ha già fatto passare: una riga
   * nuova esce solo se non ripete niente di quello. Il punto ne usa uno per
   * tutte e quattro le sezioni — l'ordine è quello in cui si legge, quindi la
   * prima volta che una cosa viene detta è anche quella più in alto — e i
   * compiti ne usano uno loro, perché una cosa da fare *deve* poter parlare
   * della stessa mail di cui parla una riga: sono due posti diversi.
   */
  const dedupe = () => {
    const viste: string[] = []
    return (testo: string) => {
      if (viste.some(t => ridondante(t, testo))) return false
      viste.push(testo)
      return true
    }
  }
  const nuova = dedupe()
  const nuovoCompito = dedupe()

  const righe = (
    xs: Partial<Riga>[] | undefined,
    max: number,
    ids: Set<string>,
    obbligatorio: boolean,
    passa: (t: string) => boolean
  ) => {
    const tenuta: Riga[] = []
    for (const x of xs ?? []) {
      if (tenuta.length >= max) break
      const testo = ripulisci(x.testo ?? '')
      if (!testo) continue
      const doc = x.doc && ids.has(x.doc) ? x.doc : null
      // GitHub e le risposte vivono del documento: una riga senza non apre
      // niente, e una riga che non apre niente è peggio di una riga in meno
      if (obbligatorio && !doc) continue
      if (!passa(testo)) continue
      tenuta.push({ testo, doc })
    }
    return tenuta
  }

  // si compongono nell'ordine in cui si leggono: quello che viene dopo sa già
  // cos'è stato detto prima
  const fatti: Progetto[] = []
  for (const p of g.progetti ?? []) {
    if (fatti.length >= 3) break
    const nome = (p.nome ?? '').trim()
    const novita = ripulisci(p.novita ?? '')
    if (!nome || !novita) continue
    const vero = m.progetti.find(x => chiave(x.nome) === chiave(nome))
    // un progetto che non sta in tabella non è un progetto: il punto ne parla,
    // non ne inventa
    if (!vero || fatti.some(x => x.id === vero.id)) continue
    if (!nuova(novita)) continue
    fatti.push({
      id: vero.id,
      // il nome di quello in tabella è suo e non si tocca: è la chiave con cui
      // la pagina lo ritrova
      nome: vero.nome,
      novita,
      doc: p.doc && tuttiIDoc.has(p.doc) ? p.doc : null
    })
  }

  const github = righe(g.github, 3, idGithub, true, nuova)

  const daLeggere: Punto['daLeggere'] = []
  for (const n of g.daLeggere ?? []) {
    if (daLeggere.length >= 2) break
    const titolo = (n.titolo ?? '').trim()
    if (!titolo) continue
    const vera = m.notizie.find(x => chiave(x.titolo) === chiave(titolo))
      ?? m.notizie.find(x => chiave(x.titolo).includes(chiave(titolo)) || chiave(titolo).includes(chiave(x.titolo)))
    // una notizia che non sta nella rassegna è inventata: non passa
    if (!vera) continue
    if (daLeggere.some(x => chiave(x.titolo) === chiave(vera.titolo))) continue
    if (!nuova(senzaTrattini(vera.titolo))) continue
    daLeggere.push({ titolo: senzaTrattini(vera.titolo), perche: ripulisci(n.perche ?? ''), link: vera.link ?? null })
  }

  const risposte = righe(g.risposte, 3, idRisposte, true, nuova)

  /*
   * Da dove viene una cosa da fare, controllato.
   *
   * L'enum dello schema è la prima cintura, questa è la seconda: un id che non
   * sta nel materiale — un progetto inventato, una riga della lista che non
   * esiste più — vale quanto un campo vuoto. Meglio una riga senza provenienza
   * che una riga con un link che non apre niente.
   */
  const idProgetti = new Set(m.progetti.map(p => p.id))
  const idCompiti = new Set([...m.attendono, ...m.perOggi, ...m.preparate].map(c => c.id))
  const compiti: Notata[] = []
  for (const x of g.compiti ?? []) {
    if (compiti.length >= NUOVI_MAX) break
    const testo = ripulisci(x.testo ?? '')
    if (!testo) continue
    if (!nuovoCompito(testo)) continue
    compiti.push({
      testo,
      doc: x.doc && tuttiIDoc.has(x.doc) ? x.doc : null,
      progetto: x.progetto && idProgetti.has(x.progetto) ? x.progetto : null,
      compito: x.compito && idCompiti.has(x.compito) ? x.compito : null
    })
  }

  /*
   * Otto righe, e non di più.
   *
   * I tetti di sezione sommati fanno undici, ed è più di quello che si legge in
   * dieci secondi. Quando si sfora si toglie per ordine di importanza, che non
   * è l'ordine in cui si legge: prima le notizie — il mondo torna domani — poi
   * l'ultima riga di GitHub, poi l'ultimo progetto. Le risposte si toccano per
   * ultime: qualcuno sta aspettando.
   */
  const quante = () => fatti.length + github.length + daLeggere.length + risposte.length
  while (quante() > RIGHE_MAX) {
    if (daLeggere.length) daLeggere.pop()
    else if (github.length > 1) github.pop()
    else if (fatti.length > 1) fatti.pop()
    else if (risposte.length > 1) risposte.pop()
    else break
  }

  return {
    punto: {
      quando,
      via: via && via > 0 ? Math.round(via) : null,
      progetti: fatti,
      github,
      daLeggere,
      risposte
    },
    compiti
  }
}

// — quello che nota va in lista —

/**
 * Quante righe nuove può far nascere un punto. Un punto non riempie la lista,
 * al massimo la completa.
 */
export const NUOVI_MAX = 3
/** Quanto indietro si guarda fra le cose chiuse, per non richiedere una cosa già fatta. */
const GIORNI_CHIUSE = 14

/** Il testo di una cosa da fare come si legge in lista: senza il punto in fondo. */
const senzaPunto = (s: string) => s.trim().replace(/[.;:·]+$/, '').trim()

/** Le liste con cui si ancorano le righe, vere o finte: qui dentro non si legge il disco. */
export type Ancora = {
  /**
   * Le righe aperte adesso: il testo, e da dove vengono loro.
   *
   * Il testo serve a riconoscere una cosa che c'è già. Il documento e il
   * progetto servono a quella che nasce: una cosa nata dalle domande di una
   * riga sta sullo stesso progetto e apre lo stesso documento della riga che
   * l'ha generata, altrimenti nasce senza niente da aprire.
   */
  aperti: { id: string; testo: string; doc?: string | null; progetto?: string | null }[]
  /** I testi delle righe chiuse di recente: una cosa già fatta non si riscrive. */
  chiuse: string[]
  /** Scrive la riga nuova, con il documento e il progetto da cui viene, e torna il suo id. */
  crea: (testo: string, doc: string | null, progetto: string | null) => string | null
}

/**
 * Quello che ha notato diventa una riga della lista, o non è.
 *
 * Il tredici settembre il punto diceva tre cose da fare su H-Farm — rispondi
 * alle quattro domande sull'ambito, di' quale unità guarda l'audit, scegli chi
 * tiene il numero — e tutte e tre erano *una* riga della lista che chiedeva
 * quelle quattro cose. Adesso quelle cose non si mostrano nemmeno: vanno in
 * lista, e qui si decide in quale riga.
 *
 * Prima si prova a riconoscerla fra le righe aperte — la stessa rete
 * grossolana di `ridondante`, che è quella che ha preso la parafrasi in primo
 * luogo — e due cose che cadono sulla stessa riga diventano una, perché sono
 * una. Quello che resta e non somiglia a niente di chiuso di recente nasce
 * come riga nuova, con dentro il documento da cui viene: è quel documento che
 * la freccia del feed apre. Il resto si perde.
 *
 * Torna gli id delle righe toccate, nell'ordine: alla pagina non arriva
 * niente di tutto questo, e il posto dove si vede è la lista.
 */
export function ancoraAlleRighe(notate: Notata[], ctx: Ancora): string[] {
  const prese = new Set<string>()
  let nuovi = 0
  for (const r of notate) {
    const id = ctx.aperti.find(c => ridondante(r.testo, c.testo))?.id ?? null
    // due cose sulla stessa riga della lista sono la stessa cosa, detta due volte
    if (id) { prese.add(id); continue }
    // una cosa che ha già fatto non torna a chiedergli di farla
    if (ctx.chiuse.some(t => ridondante(r.testo, t))) continue
    if (nuovi >= NUOVI_MAX) continue
    /*
     * Il filo della riga che l'ha generata.
     *
     * Le due righe che lui non sapeva dove aprire venivano dalle domande di
     * una riga sola — quella su H-Farm — e quella riga sapeva benissimo dove
     * stava: aveva il progetto, e a volte la mail. Qui quel che sa la madre
     * passa alla figlia, e quel che ha detto il modello viene prima.
     */
    const madre = r.compito ? ctx.aperti.find(c => c.id === r.compito) ?? null : null
    const nato = ctx.crea(senzaPunto(r.testo), r.doc ?? madre?.doc ?? null, r.progetto ?? madre?.progetto ?? null)
    if (!nato) continue
    nuovi++
    prese.add(nato)
  }
  return [...prese]
}

/** Le liste vere, con la penna per scrivere le righe nuove. */
function ancoraViva(m: Materiale, adesso: number): { ancora: Ancora; creati: () => number } {
  const limite = new Date(adesso - GIORNI_CHIUSE * 86_400_000).toISOString()
  // le tre liste si sovrappongono — una preparata è anche una che aspetta lui —
  // e una riga sola non deve poter comparire due volte
  const visti = new Map<string, { testo: string; doc: string | null; progetto: string | null }>()
  for (const c of [...m.attendono, ...m.perOggi, ...m.preparate]) {
    if (!visti.has(c.id)) visti.set(c.id, { testo: c.testo, doc: c.doc ?? null, progetto: c.progetto ?? null })
  }
  const aperti = [...visti].map(([id, x]) => ({ id, ...x }))
  let creati = 0
  return {
    creati: () => creati,
    ancora: {
      aperti,
      chiuse: store.compitiChiusi(200).filter(c => (c.chiuso ?? '') >= limite).map(c => c.testo),
      crea: (testo, doc, progetto) => {
        if (!testo) return null
        // l'id come quello della rotta: l'ora in base trentasei e un pizzico di caso
        const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
        store.scriviCompito({
          id, testo, quando: 'oggi', origine: 'punto', doc, progetto,
          ordine: ordine.dopo(store.ultimoOrdine('oggi'))
        })
        creati++
        return id
      }
    }
  }
}

/** Le chiamate di oggi, nel giorno solare UTC — lo stesso del tetto dei token. */
function diOggi(chiamate: string[], adesso: number): string[] {
  // nel fuso del conto, come «scaduto»: a mezzanotte cambia giorno per tutti e due
  const giorno = giornoIn(new Date(adesso))
  return chiamate.filter(c => giornoIn(new Date(c)) === giorno)
}

/*
 * Uno per persona: due richieste vicine — il focus della finestra e il primo
 * caricamento del giorno cadono spesso insieme — non devono pagare due punti.
 */
const inCorso = new Map<string, Promise<Esito>>()

/**
 * Il punto, secondo il cancello.
 *
 * Senza `forza`: quello di prima se ha meno di tre ore, o se da allora non è
 * successo niente. Con `forza`: si rifà, se il conto del giorno lo permette.
 * In tutti e due i casi il tetto giornaliero non si discute — è la promessa
 * che tiene questo lavoro dentro una bolletta ragionevole.
 */
export function punto(r: Richiesta = {}, adesso = Date.now()): Promise<Esito> {
  const chiave = cartella()
  let giro = inCorso.get(chiave)
  if (!giro) {
    giro = fai(r, adesso).finally(() => { inCorso.delete(chiave) })
    inCorso.set(chiave, giro)
  }
  return giro
}

/** Quando non c'è niente con cui ragionare: la stessa frase del resto dell'app. */
const SENZA_MOTORE = 'Collega Claude e potrò ragionare sul tuo materiale.'
const RIFIUTATO = 'Il modello ha rifiutato la richiesta. Prova a cambiarlo nelle preferenze.'
const ILLEGGIBILE = 'Il punto non è arrivato in una forma leggibile. Riprova.'

async function fai(r: Richiesta, adesso: number): Promise<Esito> {
  const a = leggiArchivio()
  /*
   * Il punto di ieri non è il punto di oggi.
   *
   * Il confine è il giorno solare di *casa sua*, non quello del server: una
   * richiesta alle otto di mattina a Roma non deve leggere ancora il foglio di
   * ieri sera solo perché in UTC sono ancora le sei. Quando è di ieri non si
   * mostra: torna `punto: null` con la sua data, e la pagina offre di rifarlo.
   */
  const scaduto = !!a.ultimo && giornoIn(new Date(a.ultimo.quando)) !== giornoIn(new Date(adesso))
  const fermo: Esito = scaduto
    ? { punto: null, generatoAdesso: false, tetto: false, vecchio: a.ultimo!.quando }
    : { punto: a.ultimo ? alPresente(a.ultimo) : null, generatoAdesso: false, tetto: false }

  // niente con cui ragionare: né una chiave, né l'abbonamento, né un altro fornitore.
  // Se è stata lei a chiedere, il perché si dice; su un giro automatico no
  if (!collegato()) return r.forza ? { ...fermo, guaio: SENZA_MOTORE } : fermo

  // le tre ore valgono dentro la giornata: uno di ieri è già da rifare
  if (!r.forza && !scaduto && a.ultimo && adesso - new Date(a.ultimo.quando).getTime() < ORE_FRA * 3600_000) return fermo

  const dal = a.ultimo?.quando ?? new Date(adesso - GIORNI_PRIMO * 86_400_000).toISOString()
  const mat = raccogli(dal, !a.ultimo)
  // il primo punto su una mente vuota non ha niente da dire, e non lo finge
  if (!successoQualcosa(mat) && (!r.forza || !a.ultimo)) return fermo

  // le chiamate di oggi valgono solo se oggi un punto è stato prodotto davvero:
  // un archivio di prima contava anche i tentativi falliti, e tre tentativi a
  // vuoto lasciavano la giornata senza punto e senza bottone
  const prodottoOggi = !!a.ultimo && giornoIn(new Date(a.ultimo.quando)) === giornoIn(new Date(adesso))
  if (prodottoOggi && diOggi(a.chiamate, adesso).length >= AL_GIORNO) return { ...fermo, tetto: true }

  const quando = new Date(adesso).toISOString()
  let esito: { testo: string; rifiutata: boolean }
  try {
    // per la strada di tutti: prima l'abbonamento se è quello scelto, poi la
    // chiave o l'altro fornitore. Prima il punto chiamava il motore da solo e
    // con il solo abbonamento restava senza: la scheda diceva «collegato» e
    // lui rispondeva «collega Claude»
    esito = await chiedi({
      lavoro: 'punto', max_tokens: 6000, cache: true,
      formato: schema(
        [...mat.arrivati, ...mat.github, ...mat.risposte].map(d => d.id),
        mat.github.map(d => d.id),
        mat.risposte.map(d => d.id),
        mat.progetti.map(p => p.nome),
        mat.progetti.map(p => p.id),
        [...new Set([...mat.attendono, ...mat.perOggi, ...mat.preparate].map(c => c.id))]
      ),
      system: istruzione(mat, a.ultimo?.progetti ?? [], a.scartati),
      messages: [{ role: 'user', content: materiale(mat, r.via, adesso) }],
      attesa: attesaDi('punto')
    })
  } catch (e) {
    /*
     * Il giorno in cui la chiave era a secco lui ha premuto «rifai il punto»
     * tre volte: tre chiamate fallite, tre tacche sul conto del giorno, e in
     * pagina sempre il punto di due giorni prima, senza una parola che dicesse
     * perché. Un errore del modello non è un punto: non si conta e si dice.
     */
    const guaio = e instanceof Error ? e.message : String(e)
    console.warn('myynd · il punto non è arrivato:', guaio)
    return { ...fermo, guaio }
  }
  if (esito.rifiutata) return { ...fermo, guaio: RIFIUTATO }

  const testo = esito.testo
  let grezzo: Grezzo
  try {
    grezzo = JSON.parse(estraiJSON(testo)) as Grezzo
  } catch {
    console.warn('myynd · il punto non è arrivato in una forma leggibile')
    return { ...fermo, guaio: ILLEGGIBILE }
  }

  // solo adesso si conta: il tetto è di tre punti al giorno, non di tre
  // tentativi. Una chiamata che non ha prodotto niente non brucia la giornata
  a.chiamate = [...(prodottoOggi ? diOggi(a.chiamate, adesso) : []), quando]

  const nuovo = ricuci(grezzo, mat, quando, r.via ?? null)
  /*
   * Le cose da fare vanno in lista, non in finestra.
   *
   * È il cuore del cambio: quello che il modello ha notato nel materiale — una
   * mail che chiede un preventivo, un modulo da rimandare — o si riconosce in
   * una riga che c'è già, o ne fa nascere una nuova con dentro il documento da
   * cui viene. Al client non arriva: da qui in poi vive dove le cose si fanno,
   * e la freccia del feed apre quella mail.
   */
  const ancora = ancoraViva(mat, adesso)
  ancoraAlleRighe(nuovo.compiti, ancora.ancora)
  // la lista è cambiata sotto le mani di chi ce l'ha aperta: come le rotte, si dice
  if (ancora.creati()) compiti.annunciaCambio()
  a.ultimo = nuovo.punto
  scriviArchivio(a)
  return { punto: alPresente(nuovo.punto), generatoAdesso: true, tetto: false }
}

// — gli avvii —

/**
 * Accende un'automazione da una frase.
 *
 * Il punto non propone più automazioni: le quattro domande a cui risponde non
 * sono quella. La strada resta aperta perché la rotta esiste ed è la stessa di
 * «scrivine una a parole»: il modello ne fa una ricetta, `valida()` la
 * controlla, e quello che ne esce è un'automazione come le altre — si vede
 * nella schermata, si spegne, si butta. Qui si segna solo che è partita da qui.
 *
 * La frase arriva nella lingua dell'app, perché è quella che ha letto lui:
 * `daUnaFrase` la legge in qualunque lingua — è il modello a interpretarla, e
 * la ricetta esce già con il nome, la spiegazione e l'istruzione in italiano e
 * in inglese. Tradurre qui vorrebbe dire far leggere a lui una frase in una
 * lingua che non è la sua per comodità nostra: non si fa.
 */
export async function avvia(frase: string): Promise<{ ok: true; id: string; nome: string; punto: Punto | null }> {
  const detta = frase.trim()
  if (!detta) throw new Error('Dimmi in una frase cosa dovrebbe fare.')
  const ricetta = await automazioni.daUnaFrase(detta)
  const a = leggiArchivio()
  a.avviate = [...(a.avviate ?? []), detta].slice(-40)
  scriviArchivio(a)
  return { ok: true, id: ricetta.id, nome: ricetta.nome, punto: a.ultimo }
}

// — gli angoli —
//
// Il punto non propone più angoli: le sue quattro sezioni raccontano quello
// che è successo, non quello che potrebbe pensare. Queste due restano perché
// sono la metà che vive nella memoria — un'idea tenuta è una cosa che Myynd sa
// di lui da lì in poi, una scartata resta scritta nel foglio e torna al
// modello come «questo NON è così», così nessuna riga del punto ci ricasca.

/** Il progetto di cui parla, fra quelli vivi: un chiuso non ha più angoli da tenere. */
function progettoVivo(nome: string): progetti.Progetto {
  const p = progetti.trovaPerNome(nome)
  if (!p || p.stato === 'chiuso') throw new Error('Questo progetto non c’è nel punto.')
  return p
}

/**
 * «Tienilo»: l'angolo diventa una cosa che Myynd sa di lui.
 *
 * Passa dalla stessa porta di una convinzione scritta a mano — `ricorda`, con
 * genere esplicito, perché l'ha scelto lui con un dito. L'ambito è il
 * progetto: un'idea su Myynd non deve entrare nel ritratto che guida ogni
 * email, ma deve esserci quando si parla di Myynd — ed è da lì, dalla
 * memoria, che il prossimo punto la ritrova sotto il nome giusto.
 */
export function tieni(nome: string, angolo: string): { ok: true; id: string } {
  const p = progettoVivo(nome)
  const testo = angolo.trim()
  if (!testo) throw new Error('Non c’è nessun angolo da tenere.')
  const id = store.ricorda({
    enunciato: testo,
    ambito: `progetto:${p.nome}`,
    genere: 'esplicita',
    fiducia: 0.9,
    origine: 'punto'
  })
  return { ok: true, id }
}

/** «Non è così»: resta scritto, e il modello non lo ripropone. */
export function scarta(nome: string, angolo: string): { ok: true } {
  progettoVivo(nome)
  const testo = angolo.trim()
  if (!testo) throw new Error('Non c’è nessun angolo da scartare.')
  const a = leggiArchivio()
  if (!a.scartati.some(x => x.toLowerCase() === testo.toLowerCase())) a.scartati = [...a.scartati, testo].slice(-40)
  scriviArchivio(a)
  return { ok: true }
}

/**
 * «Non è un progetto»: dal punto, con un dito.
 *
 * Il modello si era inventato «Myynd per papà» e non c'era un posto dove
 * dirglielo. Chiudere è la risposta: la riga resta, con lo stato, e il
 * prossimo punto la riceve fra quelli che NON sono progetti. Sparisce anche
 * dal punto che la pagina sta mostrando, così non lo si dice due volte.
 */
export function nonEUnProgetto(id: string): { ok: true; punto: Punto | null } {
  const vero = progetti.trova(id)
  if (!vero) throw new Error('Questo progetto non c’è nel punto.')
  // uno che ha scritto lui si chiude dalla Memoria, dov'è scritto l'obiettivo
  if (vero.origine !== 'punto') throw new Error('Questo progetto l’hai scritto tu: chiudilo dalla Memoria.')
  if (!progetti.chiudi(id)) throw new Error('Questo progetto non c’è nel punto.')
  return { ok: true, punto: togliDalPunto(id) }
}

/**
 * Via dal foglio, e basta.
 *
 * È la metà di «non è un progetto» che serve anche a chi chiude dalla
 * Memoria: la riga esce dal punto che la pagina sta mostrando, senza il
 * controllo sull'origine, perché lì la decisione è già presa e lo stato
 * l'ha già cambiato progetti.cambia.
 */
export function togliDalPunto(id: string): Punto | null {
  const a = leggiArchivio()
  if (a.ultimo) {
    a.ultimo = { ...a.ultimo, progetti: a.ultimo.progetti.filter(p => p.id !== id) }
    scriviArchivio(a)
  }
  return a.ultimo
}

/** Per le prove: dove sta il foglio di chi chiede. */
export const perProva = { file: FILE }
