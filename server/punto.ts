// Il punto: quello che Myynd ti dice quando torni.
//
// Il feed guarda i documenti e dice cosa merita attenzione. La lista tiene
// quello che hai deciso tu. La rassegna porta il mondo. Nessuna delle tre
// risponde alla domanda che si fa aprendo l'app dopo quattro ore: *cosa è
// cambiato, cosa hai fatto tu nel frattempo, e da dove riprendo?* Il punto è
// quella risposta, in dieci righe, e la scrive il modello grande — è l'unico
// posto dell'app dove la qualità del testo è tutto il prodotto, e per questo è
// anche l'unico lavoro di frontiera che si concede un tetto suo: tre al
// giorno, mai a meno di tre ore l'uno dall'altro, mai se non è successo niente.
//
// La parte che cresce sono i progetti. Stanno in una tabella loro
// (`progetti.ts`), con l'obiettivo scritto da lui: il punto li legge da lì,
// dice dove stanno, e propone un angolo — un'idea che potrebbe prendere su
// quel progetto, sua e non da manuale. Un angolo tenuto diventa una
// convinzione nella memoria, cioè una cosa che Myynd sa di lui da lì in poi;
// uno scartato resta scritto qui, per non tornare. Il modello può ancora
// riconoscere un progetto nuovo dal materiale — uno per punto, con
// l'obiettivo che gli sembra — e quello entra in tabella; ma uno che lui ha
// chiuso non rientra mai, nemmeno con un altro nome.
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

/** Quanti punti al giorno, per persona. È il lavoro più caro dell'app. */
export const AL_GIORNO = 3
/** Sotto queste ore dall'ultimo non se ne fa un altro, a meno che non lo chieda lei. */
export const ORE_FRA = 3
/** Quanto indietro guarda il primo punto, quando non ce n'è uno precedente. */
const GIORNI_PRIMO = 7
/** I documenti nel materiale: titolo e un pezzo di corpo, non di più. */
const DOCS_MAX = 20
const CORPO_MAX = 200

/** Una riga del punto: il testo, e — se c'è — la cosa che si può aprire. */
export type Riga = { testo: string; compito: string | null; doc: string | null }

export type Progetto = {
  /** La riga in tabella. Vuoto solo fra la risposta del modello e la scrittura. */
  id: string
  nome: string
  /** A cosa punta, con le sue parole — o, per uno nuovo, come l'ha capito il modello. */
  obiettivo: string
  /** La prima volta che è comparso: un progetto che dura si vede da qui. */
  dal: string
  doveSei: string
  angolo: string
  /** Gli angoli che ha tenuto: suoi, dalla memoria, e il modello ci costruisce sopra. */
  angoliTenuti: string[]
  /**
   * L'ha tirato fuori il punto dal materiale, e lui non l'ha ancora confermato.
   *
   * È quello che decide se in pagina compare «non è un progetto»: un progetto
   * che ha scritto lui — o su cui ha già tenuto un angolo — non si chiude da
   * una finestra che si legge in dieci secondi.
   */
  proposto: boolean
}

/** Un'automazione da accendere: la frase come la direbbe lui, e il perché. */
export type Avvio = { frase: string; perche: string }

export type Punto = {
  quando: string
  /**
   * Da quanti minuti mancava quando è stato fatto, se la finestra lo sapeva.
   * Il saluto lo compone la pagina da qui: al modello non si chiede di
   * indovinare un'assenza, perché la indovinava dalla finestra del materiale
   * — «sei stato via sette giorni» al primo punto, che guarda sette giorni.
   */
  via: number | null
  mentreNonCeri: Riga[]
  adesso: Riga[]
  daLeggere: { titolo: string; perche: string; link: string | null }[]
  progetti: Progetto[]
  /** Automazioni che potrebbe accendere, pronte per `daUnaFrase`. */
  avvii: Avvio[]
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

function leggiArchivio(): Archivio {
  try {
    const letto = JSON.parse(readFileSync(FILE(), 'utf8')) as Partial<Archivio>
    const a = { ...VUOTO, ...letto }
    // un foglio scritto da una versione che non conosceva ancora `via` e `avvii`
    if (a.ultimo) a.ultimo = { ...a.ultimo, via: a.ultimo.via ?? null, avvii: a.ultimo.avvii ?? [] }
    // ...né la tabella dei progetti: un progetto del punto vecchio ritrova la
    // sua riga per nome, e da lì si sa anche chi l'ha scritto
    if (a.ultimo?.progetti.some(p => !p.id || p.proposto === undefined)) {
      a.ultimo = {
        ...a.ultimo,
        progetti: a.ultimo.progetti.map(p => {
          if (p.id && p.proposto !== undefined) return p
          const vero = p.id ? progetti.trova(p.id) : progetti.trovaPerNome(p.nome)
          return {
            ...p,
            id: p.id || vero?.id || '',
            obiettivo: p.obiettivo ?? vero?.obiettivo ?? '',
            proposto: p.proposto ?? (vero ? vero.origine === 'punto' : true)
          }
        })
      }
    }
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
 * È la fotografia di un momento, e il mondo va avanti: le tre mosse dell'otto
 * settembre erano tutte fatte entro sera, e il giorno dopo la pagina le
 * mostrava ancora sotto «adesso». Una cosa che lui ha già fatto, riproposta
 * come da fare, è il modo più veloce di far sembrare Myynd uno che non
 * ascolta — e non è un difetto del modello, è che nessuno ricontrollava il
 * punto prima di mostrarlo.
 *
 * Qui si ricontrolla, ogni volta che esce, anche quando viene dal foglio: una
 * riga che parla di una cosa chiusa o sparita se ne va, un progetto che ha
 * chiuso lui se ne va. Le righe senza `compito` restano — parlano di quello
 * che è arrivato o di quello che ha fatto Myynd, e quelle non scadono.
 *
 * È una funzione pura: le liste gliele passa chi chiama, e `chiusi` è i nomi
 * in minuscolo e gli id dei progetti chiusi.
 */
export function aggiornaAlPresente(
  p: Punto,
  compiti: { aperti: Set<string>; chiusi: Set<string> },
  chiusi: { nomi: Set<string>; id: Set<string> } = { nomi: new Set(), id: new Set() }
): Punto {
  const viva = (r: Riga) => !r.compito || (compiti.aperti.has(r.compito) && !compiti.chiusi.has(r.compito))
  const nome = (s: string) => s.trim().toLowerCase()
  return {
    ...p,
    mentreNonCeri: p.mentreNonCeri.filter(viva),
    adesso: p.adesso.filter(viva),
    progetti: p.progetti.filter(x => !(x.id && chiusi.id.has(x.id)) && !chiusi.nomi.has(nome(x.nome)))
  }
}

/** Lo stesso, con le liste prese dal vivo: ogni punto che esce passa di qui. */
function alPresente(p: Punto): Punto {
  const spenti = progetti.elenco('chiuso')
  return aggiornaAlPresente(
    p,
    {
      aperti: new Set(store.elencoCompiti().map(c => c.id)),
      chiusi: new Set(store.compitiChiusi(200).map(c => c.id))
    },
    {
      nomi: new Set(spenti.map(x => x.nome.trim().toLowerCase())),
      id: new Set(spenti.map(x => x.id))
    }
  )
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

export type Materiale = {
  dal: string
  /** Il primo punto di sempre: il materiale è una finestra, non un'assenza. */
  primo: boolean
  /** Quello che ha detto che non gli interessa: si toglie dal materiale e si dice al modello. */
  nonInteressa: string[]
  /** Le automazioni che ha già, per nome: non si propongono due volte. */
  automazioni: string[]
  arrivati: store.Documento[]
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
  /** Gli angoli già suoi, dalla memoria: ambito `progetto:<nome>`. */
  tenuti: { nome: string; angolo: string }[]
  /** I suoi progetti, con l'obiettivo: quelli vivi, dalla tabella. */
  progetti: progetti.Progetto[]
  /** Quelli che ha chiuso: al modello si dicono come «non sono progetti». */
  chiusi: string[]
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

  let nomiAutomazioni: string[] = []
  try { nomiAutomazioni = automazioni.elenco().filter(a => a.accesa).map(a => a.nome) } catch { /* senza ricette il punto vive lo stesso */ }

  // quello che è arrivato davvero: niente scarti, niente rumore dal disco, e
  // dal disco al massimo cinque, i più recenti (`appenaArrivati` li dà già in
  // ordine). Quelli che restano fuori non sono «notizie non elencate»: non
  // sono notizie, e per questo non contano nemmeno nel conto
  let dalDisco = 0
  const daDire = arrivati.filter(d => {
    if (fuori(d) || !documentoVero(d)) return false
    return d.fonte !== 'desktop' || ++dalDisco <= DISCO_MAX
  })

  return {
    dal,
    primo,
    nonInteressa,
    automazioni: nomiAutomazioni,
    arrivati: daDire.slice(0, DOCS_MAX),
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
    tenuti: store.convinzioni()
      .filter(k => k.ambito.startsWith('progetto:'))
      .map(k => ({ nome: k.ambito.slice('progetto:'.length), angolo: k.enunciato })),
    progetti: progetti.vivi(),
    chiusi: progetti.chiusi()
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
  return [...m.attendono, ...m.perOggi].some(c => daAllora(c.aggiornato, m.dal) || daAllora(c.creato, m.dal))
}

// — il prompt —

/** Vale per ogni campo di testo: la stessa frase, detta al modello dove la scrive. */
const PIANA = 'Una frase sola, piana, al massimo dieci parole. Mai la lineetta (—, –), mai le parentesi, mai il corsivo o il grassetto.'

const schema = (compiti: string[], docs: string[]) => {
  const riga = {
    type: 'object',
    properties: {
      testo: { type: 'string', description: PIANA },
      compito: { type: 'string', enum: ['', ...compiti], description: 'L’id della riga della lista di cui parla, o vuoto.' },
      doc: { type: 'string', enum: ['', ...docs], description: 'L’id del documento di cui parla, o vuoto.' }
    },
    required: ['testo', 'compito', 'doc'],
    additionalProperties: false
  }
  return {
    type: 'object',
    properties: {
      mentreNonCeri: { type: 'array', items: riga, description: 'Al massimo due righe, e solo cose arrivate da fuori. Meno è meglio: vuoto va benissimo.' },
      adesso: { type: 'array', items: riga, description: 'Al massimo tre mosse, una riga ciascuna. Meno è meglio: vuoto va benissimo.' },
      daLeggere: {
        type: 'array',
        description: 'Una sola, solo fra le notizie elencate, solo se c’entra con il suo lavoro. Vuoto va benissimo.',
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
      progetti: {
        type: 'array',
        description: 'Al massimo due, fra quelli elencati, una riga ciascuno; uno nuovo solo se il materiale lo mostra davvero. Vuoto va benissimo.',
        items: {
          type: 'object',
          properties: {
            nome: { type: 'string', description: 'Lo stesso nome dell’elenco, alla lettera. Per uno nuovo, corto e come lo direbbe lui: nessuna lineetta.' },
            obiettivo: { type: 'string', description: `A cosa punta. Se l’elenco lo dice già, copialo; se manca, proponilo. ${PIANA}` },
            doveSei: { type: 'string', description: `A che punto sta rispetto all’obiettivo. ${PIANA}` },
            angolo: { type: 'string', description: `Un’idea distintiva che potrebbe prendere. Vuoto se non ne hai una buona. ${PIANA}` }
          },
          required: ['nome', 'obiettivo', 'doveSei', 'angolo'],
          additionalProperties: false
        }
      },
      avvii: {
        type: 'array',
        description: `Al massimo una automazione che potrebbe accendere, solo su una cosa che nel materiale si ripete. Vuoto va benissimo. Si scrive in ${nellaLingua()}, come tutto il resto.`,
        items: {
          type: 'object',
          properties: {
            frase: { type: 'string', description: `L’automazione come la direbbe lui, in una frase che comincia con quando: «Ogni lunedì alle 8, …», «Quando arriva una fattura, …». Scritta in ${nellaLingua()}, come ogni altro campo. Niente lineette, niente parentesi.` },
            perche: { type: 'string', description: `Al massimo otto parole: cosa gli toglie di mano. In ${nellaLingua()}. Niente lineette, niente parentesi.` }
          },
          required: ['frase', 'perche'],
          additionalProperties: false
        }
      }
    },
    required: ['mentreNonCeri', 'adesso', 'daLeggere', 'progetti', 'avvii'],
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
  const visti = new Set<string>()
  const suoi = m.tenuti.filter(t => {
    const k = `${t.nome}|${t.angolo}`.toLowerCase()
    if (visti.has(k)) return false
    visti.add(k)
    return true
  })
  const ultimo = (nome: string) => prima.find(p => p.nome.toLowerCase() === nome.toLowerCase())

  return [
    `Sei Myynd. Questa persona torna all'app dopo un po' e tu le fai il punto: cosa è
successo mentre non c'era, cosa hai fatto tu nel frattempo, cosa conviene fare
adesso, e dove stanno i suoi progetti.`,
    m.carta ? `Chi è:\n${m.carta}` : '',
    m.convinzioni.length
      ? 'Quello che sai di come lavora:\n' + m.convinzioni.map(k => `— ${k.enunciato}`).join('\n')
      : '',
    m.fuoco ? `Ti ha chiesto di concentrarti su questo, e viene prima di tutto il resto:\n${m.fuoco}` : '',
    m.progetti.length
      ? 'I suoi progetti, e a cosa punta ciascuno. Tieni gli stessi nomi, alla lettera; ' +
        'parla solo di quelli che il materiale tocca; per ognuno di\' «dove sei» rispetto ' +
        'al suo obiettivo. Uno nuovo solo se il materiale lo mostra davvero, da più di un giorno.\n' +
        m.progetti.map(p => {
          const u = ultimo(p.nome)
          return `— ${p.nome}${p.obiettivo ? `: ${p.obiettivo}` : ' (obiettivo non scritto: proponilo in una riga)'}` +
            ` (${p.stato}, dal ${p.dal.slice(0, 10)})` +
            (u?.doveSei ? `\n  dov'era l'ultima volta: ${u.doveSei}` : '') +
            (u?.angolo ? `\n  angolo proposto la volta scorsa: ${u.angolo}` : '')
        }).join('\n')
      : 'Non ha ancora scritto i suoi progetti: riconoscili dal materiale. Un progetto è una cosa su cui sta lavorando da più di un giorno, con un nome che userebbe lui e un obiettivo in una riga.',
    m.chiusi.length
      ? 'Questi NON sono progetti — li ha chiusi lui. Non nominarli, non riproporli, nemmeno con un altro nome:\n' +
        m.chiusi.map(n => `— ${n}`).join('\n')
      : '',
    suoi.length
      ? 'Angoli che ha già tenuto — sono suoi, non riproporli: costruisci sopra, o proponi un passo oltre.\n' +
        suoi.map(t => `— [${t.nome}] ${t.angolo}`).join('\n')
      : '',
    scartati.length
      ? 'Angoli che ha detto che NON sono così. Non riproporli, nemmeno riformulati.\n' +
        scartati.map(a => `— ${a}`).join('\n')
      : '',
    m.nonInteressa.length
      ? 'Cose che ha detto che NON gli interessano. Non nominarle, non farci un ' +
        'progetto, non metterle fra le mosse — nemmeno se nel materiale ce n\'è traccia:\n' +
        m.nonInteressa.map(x => `— ${x}`).join('\n')
      : '',
    m.automazioni.length
      ? 'Le automazioni che ha già accese — non proporne di uguali:\n' +
        m.automazioni.map(x => `— ${x}`).join('\n')
      : '',
    `Come si scrive, senza eccezioni. Vale per ogni campo di testo che riempi:
— Una frase sola per riga, piana, al massimo dieci parole, con il punto in
  fondo. Il punto si legge in dieci secondi.
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
— Le cose tecniche (server, deploy, log) non entrano nel punto a meno che non
  ci sia un compito aperto che le riguarda, e allora una riga sola.

Quante righe, al massimo:
— «mentreNonCeri»: due. Quello che è arrivato da fuori e conta davvero, o una
  cosa che hai preparato tu e che adesso aspetta una sua risposta. Metti
  l'id del compito o del documento quando c'è, così si apre con un dito.
— «adesso»: tre mosse che fanno andare avanti il suo lavoro. Una riga pronta
  da approvare viene prima di tutto. Se la mossa è per un progetto, il nome
  del progetto sta dentro la frase, non attaccato in coda.
— «daLeggere»: una notizia sola, solo fra quelle elencate e solo se c'entra
  con quello su cui lavora. Vuoto è la risposta giusta quasi sempre.
— «progetti»: uno o due, di quelli elencati e toccati dal materiale. «doveSei»
  è una riga sola, al massimo dieci parole, rispetto all'obiettivo. «angolo» è
  UN'idea distintiva che potrebbe prendere su quel progetto, radicata nel suo
  materiale e in quello che crede, mai generica, mai un consiglio da manuale.
  Se non ne hai una buona, lascia l'angolo vuoto.
— «avvii»: uno, e solo dove il materiale mostra una cosa che si ripete (lo
  stesso tipo di mail, lo stesso lavoro ogni settimana). La frase dev'essere
  una che Myynd sa trasformare in ricetta: quando guardare, cosa guardare,
  cosa farne. Niente di generico. «frase» e «perche» si scrivono in
  ${nellaLingua()}, come ogni altra parola del punto: gli avvii non fanno
  eccezione. La ricetta la traduce Myynd da sola, dopo.
— Non ripeterti: la stessa cosa detta in due sezioni è una cosa sola. Se
  «adesso» dice già di controllare una cosa, «mentreNonCeri» non la racconta,
  «doveSei» non la ripete e l'avvio non ci gira intorno.
— Gli id di compiti e documenti li prendi SOLO da quelli elencati nel
  materiale; altrimenti stringa vuota.
Scrivi in ${nellaLingua()}: ogni campo, avvii compresi.`
  ].filter(Boolean).join('\n\n')
}

function ore(daIso: string, adesso: number): number {
  return Math.max(0, Math.round((adesso - new Date(daIso).getTime()) / 3600_000))
}

/** Il materiale, come lo legge il modello. */
export function materiale(m: Materiale, via: number | null | undefined, adesso: number): string {
  const conteggi: string[] = []
  const perTipo = new Map<string, number>()
  for (const a of m.azioni) if (a.esito === 'fatta') perTipo.set(a.tipo, (perTipo.get(a.tipo) ?? 0) + 1)
  if (m.preparate.length) conteggi.push(`bozze preparate: ${m.preparate.length}`)
  if (perTipo.get('email')) conteggi.push(`email mandate (su sua richiesta): ${perTipo.get('email')}`)
  if (perTipo.get('automazione')) conteggi.push(`automazioni girate: ${perTipo.get('automazione')}`)
  for (const [tipo, n] of perTipo) if (tipo !== 'email' && tipo !== 'automazione') conteggi.push(`${tipo}: ${n}`)
  if (m.indicizzati) conteggi.push(`documenti entrati nell'indice: ${m.indicizzati}`)

  const notevoli = [...m.azioni]
    .sort((a, b) => (a.esito === 'fallita' ? -1 : 0) - (b.esito === 'fallita' ? -1 : 0))
    .slice(0, 5)

  const compito = (c: store.Compito) =>
    `— [${c.id}] ${c.testo} (${c.stato}${c.giorno ? `, pianificato per ${c.giorno}` : c.quando === 'oggi' ? ', per oggi' : ''})` +
    (c.stato === 'pronto' && c.risultato ? `\n  bozza: ${c.risultato.slice(0, 200).replace(/\s+/g, ' ')}` : '') +
    (c.stato === 'chiede' && c.chieste?.length ? `\n  chiede: ${c.chieste.map(x => x.domanda).join(' · ')}` : '')

  return [
    (m.primo
      ? `Primo punto: il materiale copre gli ultimi ${GIORNI_PRIMO} giorni, ma NON è un'assenza — non dire da quanto manca.`
      : `Da quando: ${m.dal} (${ore(m.dal, adesso)} ore fa).`) +
      (via && via > 0 ? `\nÈ stato via circa ${via < 90 ? `${via} minuti` : `${Math.round(via / 60)} ore`}.` : ''),
    m.arrivati.length
      ? `ARRIVATO (${m.arrivati.length} documenti, i più nuovi prima):\n` +
        m.arrivati.map(d =>
          `— id: ${d.id}\n  ${d.titolo}${d.autore ? ` · da ${d.autore}` : ''} · ${d.fonte}\n  ${d.corpo.slice(0, CORPO_MAX).replace(/\s+/g, ' ')}`
        ).join('\n')
      : 'ARRIVATO: niente.',
    'FATTO DA MYYND:' + (conteggi.length ? '\n' + conteggi.map(c => `— ${c}`).join('\n') : ' niente.') +
      (notevoli.length
        ? '\nLe più notevoli:\n' + notevoli.map(a =>
          `— ${a.tipo}: ${a.cosa}${a.verso ? ` → ${a.verso}` : ''} (${a.esito}${a.compito ? `, compito ${a.compito}` : ''})`
        ).join('\n')
        : ''),
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
  mentreNonCeri?: Partial<Riga>[]
  adesso?: Partial<Riga>[]
  daLeggere?: { titolo?: string; perche?: string }[]
  progetti?: { nome?: string; obiettivo?: string; doveSei?: string; angolo?: string }[]
  avvii?: { frase?: string; perche?: string }[]
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
 * Il punto dell'undici settembre diceva del dev server di tobiaweb in
 * «mentreNonCeri», lo richiedeva in «adesso», lo ripeteva in «doveSei» del
 * progetto e ci costruiva sopra un avvio: quattro righe su dieci per una cosa
 * sola, e lui l'ha letto come «mi sta dicendo sempre la stessa cosa». Il
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
 * Da quello che ha scritto il modello a un punto che si può mostrare.
 *
 * Gli id passano solo se stanno nel materiale — cintura oltre alle bretelle
 * dell'enum — e i progetti si ricuciono con quelli della tabella per nome:
 * id, obiettivo e `dal` sono suoi, non del modello; gli angoli tenuti vengono
 * dalla memoria. Un nome che ha chiuso non passa, nemmeno se il modello lo
 * riscrive; uno che non conosce nessuno entra come nuovo, ma uno solo per
 * punto — è il modello che propone, e la Memoria dove si corregge.
 */
export function ricuci(g: Grezzo, m: Materiale, scartati: string[], quando: string, via: number | null = null, avviate: string[] = []): Punto {
  const compiti = new Set([...m.attendono, ...m.perOggi, ...m.preparate].map(c => c.id))
  const docs = new Set(m.arrivati.map(d => d.id))
  const riga = (r: Partial<Riga>): Riga | null => {
    const testo = ripulisci(r.testo ?? '')
    if (!testo) return null
    return {
      testo,
      compito: r.compito && compiti.has(r.compito) ? r.compito : null,
      doc: r.doc && docs.has(r.doc) ? r.doc : null
    }
  }
  /*
   * Una cosa una volta sola.
   *
   * `tenute` è tutto quello che è già stato detto, in qualunque sezione: una
   * riga nuova passa solo se non ripete niente di quello. L'ordine è l'ordine
   * in cui si legge il punto — prima «mentre non c'eri», poi «adesso», poi i
   * progetti, poi gli avvii — così la prima volta che una cosa viene detta è
   * anche quella nel posto più in alto, e quella che se ne va è l'eco.
   */
  const tenute: string[] = []
  const nuova = (testo: string) => {
    if (tenute.some(t => ridondante(t, testo))) return false
    tenute.push(testo)
    return true
  }
  const righe = (xs: Partial<Riga>[] | undefined, max: number) => {
    const tenuta: Riga[] = []
    for (const x of xs ?? []) {
      if (tenuta.length >= max) break
      const r = riga(x)
      if (r && nuova(r.testo)) tenuta.push(r)
    }
    return tenuta
  }

  // si compongono qui, nell'ordine in cui si leggono: quello che viene dopo sa
  // già cos'è stato detto prima
  const mentreNonCeri = righe(g.mentreNonCeri, 2)
  const adesso = righe(g.adesso, 3)

  const chiave = (s: string) => s.trim().toLowerCase()
  const rifiutati = new Set(scartati.map(chiave))
  const chiusi = new Set(m.chiusi.map(chiave))
  const tenutiDi = (nome: string) => m.tenuti.filter(t => chiave(t.nome) === chiave(nome)).map(t => t.angolo)
  const progetti: Progetto[] = []
  let nuovi = 0
  for (const p of g.progetti ?? []) {
    const nome = (p.nome ?? '').trim()
    if (!nome || progetti.length >= 2 || progetti.some(x => chiave(x.nome) === chiave(nome))) continue
    // un progetto che ha chiuso lui non torna: nemmeno se il modello lo riscrive
    if (chiusi.has(chiave(nome))) continue
    const vero = m.progetti.find(x => chiave(x.nome) === chiave(nome))
    if (!vero && nuovi++ >= 1) continue
    const angoliTenuti = tenutiDi(vero?.nome ?? nome)
    const angolo = ripulisci(p.angolo ?? '')
    // «dove sei» che ripete una riga già letta più su non è dove sei, è l'eco:
    // il progetto resta, con il nome e l'angolo, e la riga sparisce
    const doveSei = ripulisci(p.doveSei ?? '')
    progetti.push({
      id: vero?.id ?? '',
      // il nome di uno che è già in tabella è suo e non si tocca: è la chiave
      // con cui «tienilo» e «non è un progetto» lo ritrovano
      nome: vero?.nome ?? ripulisci(nome),
      obiettivo: vero?.obiettivo || ripulisci(p.obiettivo ?? ''),
      dal: vero?.dal ?? quando,
      doveSei: doveSei && nuova(doveSei) ? doveSei : '',
      // un angolo che ha già rifiutato, o già tenuto, non si ripropone: resta vuoto
      angolo: rifiutati.has(chiave(angolo)) || angoliTenuti.some(a => chiave(a) === chiave(angolo)) ? '' : angolo,
      angoliTenuti,
      // uno che ha scritto lui non si chiude da qui: «non è un progetto» è per
      // quelli che il punto ha tirato fuori dal materiale
      proposto: vero ? vero.origine === 'punto' : true
    })
  }

  const daLeggere = (g.daLeggere ?? []).slice(0, 1).flatMap(n => {
    const titolo = (n.titolo ?? '').trim()
    if (!titolo) return []
    const vera = m.notizie.find(x => chiave(x.titolo) === chiave(titolo))
      ?? m.notizie.find(x => chiave(x.titolo).includes(chiave(titolo)) || chiave(titolo).includes(chiave(x.titolo)))
    // una notizia che non sta nella rassegna è inventata: non passa
    if (!vera) return []
    return [{ titolo: senzaTrattini(vera.titolo), perche: ripulisci(n.perche ?? ''), link: vera.link ?? null }]
  })

  // le automazioni già accese da qui, e quelle che ha già: non si ripropongono
  const gia = new Set([...avviate, ...m.automazioni].map(chiave))
  const avvii: Avvio[] = []
  for (const a of g.avvii ?? []) {
    const frase = ripulisci(a.frase ?? '')
    if (frase.length < 12 || gia.has(chiave(frase)) || avvii.length >= 1) continue
    // un avvio che gira intorno a una riga già detta è la quarta volta che la dice
    if (!nuova(frase)) continue
    gia.add(chiave(frase))
    avvii.push({ frase, perche: ripulisci(a.perche ?? '') })
  }

  /*
   * Otto righe, e non di più.
   *
   * I tetti di sezione sommati fanno nove, ed è una riga più di quello che si
   * legge in dieci secondi. Quando si sfora si toglie dal fondo, cioè
   * dall'ordine in cui le cose contano: prima l'avvio — è un suggerimento,
   * tornerà domani — poi la notizia, poi il secondo progetto. Il primo
   * progetto non si tocca: senza, la finestra non dice più dove sta il lavoro.
   */
  while (mentreNonCeri.length + adesso.length + daLeggere.length + progetti.length + avvii.length > RIGHE_MAX) {
    if (avvii.length) avvii.pop()
    else if (daLeggere.length) daLeggere.pop()
    else if (progetti.length > 1) progetti.pop()
    else break
  }

  return {
    quando,
    via: via && via > 0 ? Math.round(via) : null,
    mentreNonCeri,
    adesso,
    daLeggere,
    progetti,
    avvii
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
        [...mat.attendono, ...mat.perOggi, ...mat.preparate].map(c => c.id),
        mat.arrivati.map(d => d.id)
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

  const nuovo = ricuci(grezzo, mat, a.scartati, quando, r.via ?? null, a.avviate ?? [])
  // quello che il modello ha capito entra in tabella: un progetto nuovo con
  // l'obiettivo che gli sembra, e l'obiettivo di uno che ancora non ce l'ha.
  // Il resto — nome, stato, obiettivo scritto da lui — non lo tocca
  for (const p of nuovo.progetti) {
    if (!p.id) {
      const scritto = progetti.scrivi({ nome: p.nome, obiettivo: p.obiettivo, origine: 'punto', dal: quando })
      p.id = scritto.id
      p.dal = scritto.dal
    } else {
      const vero = progetti.trova(p.id)
      if (vero && !vero.obiettivo && p.obiettivo) progetti.cambia(p.id, { obiettivo: p.obiettivo })
    }
  }
  a.ultimo = nuovo
  scriviArchivio(a)
  return { punto: alPresente(nuovo), generatoAdesso: true, tetto: false }
}

// — gli avvii —

/**
 * Accende un'automazione da una frase del punto.
 *
 * La frase passa dalla stessa strada di «scrivine una a parole»: il modello
 * ne fa una ricetta, `valida()` la controlla, e quello che ne esce è
 * un'automazione come le altre — si vede nella schermata, si spegne, si
 * butta. Qui si segna solo che è partita da qui, così non si ripropone.
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
  if (a.ultimo) a.ultimo = { ...a.ultimo, avvii: (a.ultimo.avvii ?? []).filter(x => x.frase !== detta) }
  scriviArchivio(a)
  return { ok: true, id: ricetta.id, nome: ricetta.nome, punto: a.ultimo }
}

// — gli angoli —

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
  // anche nell'ultimo punto, che è quello che la pagina mostra
  const a = leggiArchivio()
  const mostrato = a.ultimo?.progetti.find(x => x.nome.toLowerCase() === p.nome.toLowerCase())
  if (mostrato && !mostrato.angoliTenuti.some(x => x.toLowerCase() === testo.toLowerCase())) {
    mostrato.angoliTenuti = [...mostrato.angoliTenuti, testo]
    // tenere un angolo è dire che il progetto c'è: da qui non si chiude più
    mostrato.proposto = false
    scriviArchivio(a)
  }
  return { ok: true, id }
}

/** «Non è così»: resta scritto, e il modello non lo ripropone. */
export function scarta(nome: string, angolo: string): { ok: true } {
  const p = progettoVivo(nome)
  const testo = angolo.trim()
  if (!testo) throw new Error('Non c’è nessun angolo da scartare.')
  const a = leggiArchivio()
  if (!a.scartati.some(x => x.toLowerCase() === testo.toLowerCase())) a.scartati = [...a.scartati, testo].slice(-40)
  const mostrato = a.ultimo?.progetti.find(x => x.nome.toLowerCase() === p.nome.toLowerCase())
  if (mostrato && mostrato.angolo.toLowerCase() === testo.toLowerCase()) mostrato.angolo = ''
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
