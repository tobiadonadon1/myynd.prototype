// La rassegna: il mondo, la mattina, prima del lavoro.
//
// Tutto il resto di Myynd guarda dentro — la tua posta, i tuoi file, le tue
// note. Questa è l'unica cosa che guarda fuori, e per questo va tenuta
// separata da tutto il resto: una notizia non è un compito, non si spunta, non
// aspetta te. Si legge e basta. Il giorno in cui una guerra comparisse fra le
// cose da fare, la lista smetterebbe di voler dire qualcosa.
//
// Da dove arrivano: dai feed RSS dei giornali, che sono pubblici, gratuiti e
// vecchi di vent'anni — cioè l'esatto contrario di un'integrazione da mantenere.
// Non c'è una chiave da chiedere a nessuno e non parte da qui nessun dato:
// queste richieste non portano con sé niente di tuo, e sono le uniche che
// escono da questa macchina senza passare da una cosa che hai collegato tu.
//
// Cosa costa: quasi niente, di proposito. Lo scaricamento è gratis; la scelta
// di cosa vale la pena leggere è l'unico pezzo che passa da un modello, è
// lavoro interno — quindi la fa il modello di casa se c'è — e gira poche volte
// al giorno su una manciata di titoli, non su articoli interi. E se non c'è
// nessun modello, la rassegna esce lo stesso: la scelta la fa il conteggio,
// peggio ma subito. Una pagina che si apre vuota perché manca una chiave non è
// una pagina.

import { createHash } from 'node:crypto'
import { cartella, leggi, nellaLingua, lingua } from './config.ts'
import { chiediJSON } from './modello.ts'
import { affinita, gusto, perIlModello, type Gusto } from './gusto.ts'
import * as store from './store.ts'

/** Quante notizie fanno una rassegna. Poche: si legge in tre minuti o non si legge. */
const QUANTE = 8

/** Quanto vale una rassegna prima di rifarla. */
// Sei ore: quattro rassegne al giorno, che è quello che `modello.ts` dà per
// scontato quando decide che il lavoro non è di frontiera. Con tre ore, su un
// server acceso di notte, erano otto — e ospitati, senza un modello di casa,
// ognuna è una chiamata pagata.
export const ORE_VALIDA = 6

/** Quanto indietro si guarda per chiamarla «di oggi». */
const ORE_FRESCHE = 36

/** Se in quelle ore non c'è quasi niente — un lunedì di ferragosto — si allarga. */
const ORE_LARGHE = 96

/** Dopo quanti giorni una notizia letta e vecchia se ne va dall'indice. */
const GIORNI_ARCHIVIO = 8

/** Quanti titoli si guardano al massimo per ogni giornale. */
const PER_FONTE = 12

/** Quanti titoli finiscono davanti al modello. Oltre, si paga per niente. */
const CANDIDATE = 70

export type Argomento = 'mondo' | 'tecnologia' | 'economia' | 'italia'

type Fonte = {
  nome: string
  url: string
  argomento: Argomento
  /** 'it' e 'en' vanno solo a chi ha l'app in quella lingua; '*' va a tutti. */
  lingua: 'it' | 'en' | '*'
}

/**
 * I giornali.
 *
 * Sono scelti perché il loro feed esiste da anni, risponde senza chiedere
 * niente, e copre cose diverse: il mondo, la tecnologia, i mercati. Non è un
 * elenco sacro — è il punto di partenza, e aggiungerne uno è aggiungere una
 * riga qui. Un feed che non risponde non rompe la rassegna: sparisce da questo
 * giro e torna al prossimo.
 *
 * Le italiane vanno a chi ha l'app in italiano, le anglosassoni a tutti: un
 * lettore italiano vuole comunque sapere cosa scrive Bloomberg, mentre a chi
 * legge in inglese l'ANSA non serve.
 */
export const FONTI: Fonte[] = [
  // il mondo
  { nome: 'BBC', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', argomento: 'mondo', lingua: '*' },
  { nome: 'The Guardian', url: 'https://www.theguardian.com/world/rss', argomento: 'mondo', lingua: '*' },
  { nome: 'New York Times', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', argomento: 'mondo', lingua: '*' },
  { nome: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', argomento: 'mondo', lingua: 'en' },

  // la tecnologia
  { nome: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', argomento: 'tecnologia', lingua: '*' },
  { nome: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', argomento: 'tecnologia', lingua: '*' },
  { nome: 'TechCrunch', url: 'https://techcrunch.com/feed/', argomento: 'tecnologia', lingua: '*' },
  { nome: 'Hacker News', url: 'https://hnrss.org/frontpage', argomento: 'tecnologia', lingua: '*' },
  { nome: 'MIT Technology Review', url: 'https://www.technologyreview.com/feed/', argomento: 'tecnologia', lingua: '*' },
  { nome: 'BBC Tech', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', argomento: 'tecnologia', lingua: 'en' },

  // i soldi
  { nome: 'Bloomberg', url: 'https://feeds.bloomberg.com/markets/news.rss', argomento: 'economia', lingua: '*' },
  { nome: 'Wall Street Journal', url: 'https://feeds.a.dj.com/rss/RSSWorldNews.xml', argomento: 'economia', lingua: '*' },
  { nome: 'Financial Times', url: 'https://www.ft.com/rss/home', argomento: 'economia', lingua: '*' },
  { nome: 'CNBC', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114', argomento: 'economia', lingua: 'en' },

  // l'Italia
  { nome: 'ANSA', url: 'https://www.ansa.it/sito/notizie/topnews/topnews_rss.xml', argomento: 'italia', lingua: 'it' },
  { nome: 'Corriere della Sera', url: 'https://xml2.corriereobjects.it/rss/homepage.xml', argomento: 'italia', lingua: 'it' },
  { nome: 'la Repubblica', url: 'https://www.repubblica.it/rss/homepage/rss2.0.xml', argomento: 'italia', lingua: 'it' },
  { nome: 'Il Sole 24 Ore', url: 'https://www.ilsole24ore.com/rss/mondo.xml', argomento: 'italia', lingua: 'it' },
  { nome: 'ANSA Tecnologia', url: 'https://www.ansa.it/sito/notizie/tecnologia/tecnologia_rss.xml', argomento: 'tecnologia', lingua: 'it' }
]

// — leggere l'XML —
//
// Niente libreria: un feed RSS è cinque tag, e il parser che serve sta in
// quaranta righe. Una dipendenza in più su questo si porta dietro un albero di
// pacchetti e un aggiornamento da seguire per sempre, per risparmiare un
// pomeriggio una volta sola.

const ENTITA: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  laquo: '«', raquo: '»', hellip: '…', mdash: '—', ndash: '–',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', eacute: 'é', egrave: 'è'
}

/** `&#8216;` e `&amp;` sono testo, non markup: qui tornano lettere. */
export function entita(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, c) => String.fromCodePoint(parseInt(c, 16)))
    .replace(/&#(\d+);/g, (_, c) => String.fromCodePoint(Number(c)))
    .replace(/&([a-zA-Z]+);/g, (t, n: string) => ENTITA[n] ?? t)
}

/** Il testo di un tag, CDATA compreso. Il primo che trova, non l'ultimo. */
function tag(dentro: string, nome: string): string {
  const m = dentro.match(new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</${nome}>`, 'i'))
  if (!m) return ''
  const grezzo = m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')
  return entita(grezzo).trim()
}

/**
 * Il testo che una persona leggerebbe: senza tag, senza spazi doppi, corto.
 *
 * I riassunti dei feed arrivano con dentro figure, link e una riga di
 * marketing. Quello che serve sono due frasi, e devono finire dove finisce una
 * frase — un riassunto tagliato a metà parola sembra un guasto.
 */
export function ripulisci(html: string, tetto = 340): string {
  const piano = entita(
    html
      .replace(/<(script|style|figure)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim()
  if (piano.length <= tetto) return piano
  const corto = piano.slice(0, tetto)
  const fine = Math.max(corto.lastIndexOf('. '), corto.lastIndexOf('? '), corto.lastIndexOf('! '))
  return fine > tetto * 0.5 ? corto.slice(0, fine + 1) : `${corto.replace(/\s\S*$/, '')}…`
}

/**
 * Il riassunto che non è un riassunto.
 *
 * Non tutti i feed mettono prosa dentro `description`. Hacker News ci mette una
 * scheda — «Article URL: …  Comments URL: …  Points: 0  # Comments: 0» — e sulla
 * carta finiva esattamente così: due indirizzi lunghi e un punteggio, al posto
 * di dire di cosa parla. Peggio ancora, un indirizzo senza spazi non si spezza,
 * quindi quella roba usciva anche dai bordi.
 *
 * Qui si buttano le righe che sono etichette e gli indirizzi nudi. Se dopo non
 * resta niente, non resta niente: una carta con il solo titolo è onesta, una
 * con dentro un URL è rumore.
 */
const ETICHETTE = /^\s*(article url|comments url|points|#\s*comments|link|source)\s*:/i

export function sensato(testo: string): string {
  const righe = testo.split(/\n|(?=https?:\/\/)/)
    .map(r => r.trim())
    .filter(r => r && !ETICHETTE.test(r) && !/^https?:\/\/\S*$/.test(r))
  const pulito = righe.join(' ').replace(/\s+/g, ' ').trim()
  // quello che resta è ancora per metà indirizzi? allora non era prosa
  const indirizzi = (pulito.match(/https?:\/\/\S+/g) ?? []).join('').length
  if (indirizzi > pulito.length * 0.3) return ''
  return pulito.length < 12 ? '' : pulito
}

/** L'indirizzo senza la coda di tracciamento: due link uguali devono avere lo stesso id. */
export function pulisciLink(url: string): string {
  try {
    const u = new URL(url)
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|ito$|ocid$|cmpid$|at_|fbclid$|gclid$|smid$|partner$)/i.test(k)) u.searchParams.delete(k)
    }
    u.hash = ''
    return u.toString()
  } catch { return url.trim() }
}

/** Il link di una voce: RSS lo mette nel testo, Atom in un attributo. */
function link(dentro: string): string {
  const testo = tag(dentro, 'link')
  if (testo && /^https?:/i.test(testo)) return testo
  // Atom: si preferisce `rel="alternate"`, che è l'articolo; gli altri rel
  // sono l'immagine, i commenti, il feed stesso
  const alt = dentro.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)
    ?? dentro.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']alternate["']/i)
    ?? dentro.match(/<link[^>]*href=["']([^"']+)["']/i)
  return alt ? entita(alt[1]) : ''
}

/** Quando è uscita. Chi non lo dice finisce a «adesso»: meglio in cima che invisibile. */
function quando(dentro: string): string {
  const grezza = tag(dentro, 'pubDate') || tag(dentro, 'published') || tag(dentro, 'updated') || tag(dentro, 'dc:date')
  const d = grezza ? new Date(grezza) : null
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : new Date().toISOString()
}

export type Grezza = {
  id: string
  titolo: string
  riassunto: string
  fonte: string
  link: string
  argomento: Argomento
  quando: string
}

/** Da un feed intero alle sue voci. Un feed illeggibile torna vuoto, non lancia. */
export function leggiFeed(xml: string, fonte: Fonte): Grezza[] {
  const fuori: Grezza[] = []
  const pezzi = xml.match(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi) ?? []
  for (const p of pezzi.slice(0, PER_FONTE)) {
    const titolo = ripulisci(tag(p, 'title'), 200)
    const indirizzo = pulisciLink(link(p))
    if (!titolo || !/^https?:\/\//i.test(indirizzo)) continue
    fuori.push({
      id: createHash('sha1').update(indirizzo).digest('hex').slice(0, 16),
      titolo,
      riassunto: sensato(ripulisci(tag(p, 'description') || tag(p, 'summary') || tag(p, 'content'))),
      fonte: fonte.nome,
      link: indirizzo,
      argomento: fonte.argomento,
      quando: quando(p)
    })
  }
  return fuori
}

// — andare a prenderli —

/**
 * Un giornale che non risponde non è un guasto della rassegna.
 *
 * Dodici richieste in parallelo, otto secondi ciascuna: se tre feed sono giù,
 * la rassegna esce con gli altri nove e nessuno se ne accorge. È l'unico modo
 * di dipendere da diciannove server altrui senza dipendere da nessuno.
 */
async function prendi(f: Fonte): Promise<Grezza[]> {
  try {
    const r = await fetch(f.url, {
      signal: AbortSignal.timeout(8_000),
      headers: {
        // un feed pubblico si legge come lo leggerebbe un lettore di feed;
        // qui non parte nessun cookie e nessun dato di chi usa Myynd
        'user-agent': 'Myynd/0.2 (feed reader)',
        accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
      }
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return leggiFeed(await r.text(), f)
  } catch (e) {
    console.warn(`myynd · ${f.nome} non ha risposto:`, e instanceof Error ? e.message : e)
    return []
  }
}

/** Le fonti che valgono per la lingua dell'app. */
export function fontiPer(lingua: string): Fonte[] {
  const l = lingua === 'it' ? 'it' : 'en'
  return FONTI.filter(f => f.lingua === '*' || f.lingua === l)
}

// — sfoltire —

/**
 * Le parole che portano il senso di un titolo.
 *
 * Sotto le quattro lettere ci sono gli articoli e le preposizioni, in italiano
 * come in inglese, e non distinguono niente: «il», «the», «per», «of». Quello
 * che resta è di cosa parla.
 */
export function impronta(titolo: string): Set<string> {
  return new Set(
    titolo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(p => p.length >= 4)
  )
}

/**
 * Lo stesso fatto, raccontato da due giornali.
 *
 * Il primo tentativo confrontava le prime sei parole del titolo, ed era troppo
 * poco: «Il prezzo del grano vola per la guerra» e «Il prezzo del grano vola:
 * ecco perché» divergono esattamente alla sesta, e nella rassegna finivano
 * tutte e due. Due notizie identiche su otto sono un quarto della pagina buttato.
 *
 * Qui si guarda quanto si sovrappongono le parole che contano. Sopra i due
 * terzi del titolo più corto — e con almeno tre parole in comune, altrimenti
 * due titoli di quattro parole si somiglierebbero per caso — è lo stesso fatto.
 */
export function simili(a: Set<string>, b: Set<string>): boolean {
  const piccolo = Math.min(a.size, b.size)
  if (!piccolo) return false
  let insieme = 0
  for (const p of a) if (b.has(p)) insieme++
  if (insieme >= piccolo) return true            // uno è contenuto nell'altro
  return insieme >= 3 && insieme / piccolo >= 0.66
}

/** Una notizia già uscita in una rassegna recente: l'id, e le parole del titolo. */
export type Gia = { id: string; parole: Set<string> }

/**
 * Quelle da mettere davanti al modello.
 *
 * Quattro cose, in ordine: via le vecchie, via quelle che hai già viste ieri,
 * via i doppioni di oggi, e poi a giro fra i giornali invece che tutte dalla
 * stessa parte. Senza l'ultimo passaggio, un feed che pubblica quaranta pezzi
 * al giorno si prende metà della rassegna solo perché scrive tanto.
 *
 * `gia` è quello che è già uscito nelle rassegne dei giorni scorsi, ed è il
 * filtro che manca a chi guarda una sola infornata alla volta: la rassegna
 * gira ogni poche ore, e senza questo lo stesso fatto rientrava il pomeriggio
 * raccontato dall'altro giornale — due righe sulla stessa cosa, che è il modo
 * più rapido di far sembrare la fascia una macchina invece di una scelta.
 * Lo stesso identico articolo invece passa: si aggiorna al suo posto, e si
 * porta dietro il segno che l'avevi già aperto.
 */
export function cernita(tutte: Grezza[], adesso = Date.now(), gia: Gia[] = []): Grezza[] {
  const dentro = (ore: number) =>
    tutte.filter(n => adesso - new Date(n.quando).getTime() < ore * 3600_000)

  // se nelle ultime trentasei ore non c'è abbastanza per una rassegna, si
  // guarda più indietro invece di uscire mezza vuota
  let fresche = dentro(ORE_FRESCHE)
  if (fresche.length < QUANTE * 2) fresche = dentro(ORE_LARGHE)
  if (!fresche.length) fresche = tutte

  const tenute: Set<string>[] = []
  const visti = new Set<string>()
  const uniche = fresche
    .sort((a, b) => b.quando.localeCompare(a.quando))
    .filter(n => {
      if (visti.has(n.id)) return false
      const parole = impronta(n.titolo)
      if (!parole.size || tenute.some(t => simili(parole, t))) return false
      if (gia.some(g => g.id !== n.id && simili(parole, g.parole))) return false
      tenute.push(parole)
      visti.add(n.id)
      return true
    })

  // a giro: la prima di ogni giornale, poi la seconda di ognuno, e così via
  const code = new Map<string, Grezza[]>()
  for (const n of uniche) {
    const c = code.get(n.fonte) ?? []
    c.push(n)
    code.set(n.fonte, c)
  }
  const fuori: Grezza[] = []
  for (let i = 0; fuori.length < CANDIDATE; i++) {
    let messa = false
    for (const c of code.values()) {
      if (i >= c.length) continue
      fuori.push(c[i])
      messa = true
      if (fuori.length >= CANDIDATE) break
    }
    if (!messa) break
  }
  return fuori
}

// — scegliere —

export type Scelta = { n: number; riga: string }

const schema = () => ({
  type: 'object',
  properties: {
    scelte: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          // 'number' e non 'integer': è il tipo che ogni modello e ogni schema
          // accettano di sicuro, e che sia intero lo si controlla qui sotto —
          // dove va controllato comunque, perché un numero fuori elenco
          // arriverebbe anche dichiarandolo intero
          n: { type: 'number', description: 'Il numero della notizia nell\'elenco.' },
          riga: {
            type: 'string',
            description:
              `Una riga sola in ${nellaLingua()}, massimo venti parole: cosa è successo o ` +
              'perché conta. Non ripetere il titolo con altre parole — aggiungi quello che ' +
              'il titolo non dice.'
          }
        },
        required: ['n', 'riga'],
        additionalProperties: false
      }
    }
  },
  required: ['scelte'],
  additionalProperties: false
})

const ISTRUZIONI = `Stai facendo la rassegna del mattino per una persona che ha cinque minuti.

Scegli le notizie che varrà la pena aver letto stasera. Preferisci quello che è
successo davvero a quello che qualcuno ha detto; una cosa che cambia qualcosa a
una che la commenta. Salta il gossip, le classifiche, le recensioni di prodotto e
i pezzi che esistono per far cliccare.

Non mettere due notizie sullo stesso fatto: scegli la migliore delle due.
Vale la pena coprire più di un argomento, a meno che i suoi interessi non dicano
il contrario — se ha scritto che gli interessa una cosa sola, dagli quella.

Se ti do anche quello che si è visto da come legge, usalo per inclinare la scelta
dentro ogni argomento, non per cancellare gli argomenti che non tocca mai. Una
rassegna che restituisce solo quello che uno ha già letto smette di servire a
qualcosa, e chi la legge non se ne accorge: gli sembra solo che non succeda più
niente.

La riga che scrivi accanto è la parte utile: chi legge il titolo lo ha già
letto. Dì cosa è successo, o cosa cambia, o perché adesso.`

/**
 * Quali leggere, e perché.
 *
 * Torna `null` quando non c'è nessun modello o non ce l'ha fatta — e non è un
 * guasto: chi chiama ha già una rassegna da fare a mano, che è peggiore ma
 * esiste. Vale la pena ripeterlo perché è la ragione per cui questa funzione
 * non lancia mai.
 */
export async function scegli(candidate: Grezza[], interessi: string, g?: Gusto): Promise<Scelta[] | null> {
  if (!candidate.length) return []
  const elenco = candidate
    .map((n, i) => `${i + 1}. [${n.fonte}] ${n.titolo}${n.riassunto ? ` — ${n.riassunto.slice(0, 180)}` : ''}`)
    .join('\n')

  const esito = await chiediJSON<{ scelte: Scelta[] }>({
    lavoro: 'rassegna',
    max_tokens: 2000,
    system: ISTRUZIONI,
    formato: schema(),
    messages: [{
      role: 'user',
      content:
        (interessi.trim()
          ? `Quello che le interessa, con le sue parole:\n«${interessi.trim()}»\n\n`
          : 'Non ha detto cosa le interessa: fa’ una rassegna generale, ben distribuita.\n\n') +
        // quello che *fa*, non quello che dice: vale più della riga qui sopra,
        // ma non la sostituisce — gli argomenti scritti restano una scelta
        (g && perIlModello(g) ? `Quello che si è visto da come legge:\n${perIlModello(g)}\n\n` : '') +
        `Scegline ${QUANTE}, dalle più importanti alle meno.\n\n${elenco}`
    }]
  })
  if (!esito?.scelte?.length) return null

  // un numero fuori elenco è una scelta che non esiste: si butta, non si
  // ripiega su un'altra notizia a caso
  const viste = new Set<number>()
  const buone: Scelta[] = []
  for (const s of esito.scelte) {
    const n = Math.round(Number(s.n))
    if (!Number.isFinite(n) || n < 1 || n > candidate.length || viste.has(n)) continue
    viste.add(n)
    buone.push({ n, riga: String(s.riga ?? '') })
    if (buone.length >= QUANTE) break
  }
  return buone
}

/**
 * La scelta senza modello: parole in comune, freschezza, e un giro di argomenti.
 *
 * Non è brava — non capisce niente di quello che legge — ma esiste sempre, e
 * riempie la pagina della mattina anche a chiave scaduta o a rete lenta. Le sue
 * righe sotto al titolo sono quelle del giornale, che è meglio di una scritta
 * da noi a caso.
 *
 * Il giro fra gli argomenti è la parte che la salva. Con il solo punteggio, e
 * senza interessi scritti, resta la freschezza: e siccome le agenzie
 * finanziarie pubblicano ogni dieci minuti, la rassegna diventava quattro
 * titoli di borsa di fila. Prendendo a turno il migliore di ogni argomento —
 * il mondo, la tecnologia, l'economia, l'Italia — la prima pagina somiglia a
 * una prima pagina anche quando non l'ha pensata nessuno.
 */
export function sceltaAMano(candidate: Grezza[], interessi: string, adesso = Date.now(), g?: Gusto): Scelta[] {
  const senza = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const parole = senza(interessi).split(/[^a-z0-9]+/).filter(p => p.length > 3)

  const punteggio = (n: Grezza) => {
    const centri = parole.filter(p => senza(`${n.titolo} ${n.riassunto}`).includes(p)).length
    const ore = (adesso - new Date(n.quando).getTime()) / 3600_000
    // Gli argomenti scritti pesano più del gusto dedotto, ed è giusto così: una
    // cosa che hai chiesto vale più di una che abbiamo notato. Il gusto muove
    // l'ordine *dentro* l'argomento — la copertura degli argomenti la garantisce
    // il giro fra le code più sotto, e il gusto non la può toccare.
    return centri * 10 + (g ? affinita(g, n.titolo, n.fonte) : 0) - Math.max(0, ore) / 12
  }

  const ordinate = [...candidate.keys()].sort((a, b) => punteggio(candidate[b]) - punteggio(candidate[a]))

  // una coda per argomento, ognuna già in ordine di punteggio
  const code = new Map<string, number[]>()
  for (const i of ordinate) code.set(candidate[i].argomento, [...(code.get(candidate[i].argomento) ?? []), i])

  // Un giornale a testa, finché ce ne sono abbastanza per riempire la rassegna.
  //
  // Il tetto era due, e con otto notizie da scegliere voleva dire quattro
  // giornali su quattordici: due di borsa, due di tecnologia, e la sensazione —
  // giusta — che Myynd leggesse sempre gli stessi due siti. Quando i giornali
  // che hanno qualcosa da dire bastano, se ne prende uno per uno; quando sono
  // pochi si allarga a due, perché una rassegna corta è peggio di una ripetuta.
  const giornali = new Set(candidate.map(n => n.fonte)).size
  const TETTO = giornali >= QUANTE ? 1 : 2
  const quante = new Map<string, number>()
  const presi = new Set<number>()
  const scelte: Scelta[] = []

  while (scelte.length < QUANTE) {
    let messa = false
    for (const coda of code.values()) {
      const i = coda.find(x => !presi.has(x) && (quante.get(candidate[x].fonte) ?? 0) < TETTO)
      if (i === undefined) continue
      presi.add(i)
      quante.set(candidate[i].fonte, (quante.get(candidate[i].fonte) ?? 0) + 1)
      scelte.push({ n: i + 1, riga: '' })
      messa = true
      if (scelte.length >= QUANTE) break
    }
    // nessun argomento ha più niente da dare: si smette invece di girare a vuoto
    if (!messa) break
  }
  return scelte
}

// — il giro —

/** Gli argomenti che ha scritto lei nelle preferenze. Vuoto = «dammi di tutto». */
export function interessi(): string {
  return (leggi().argomenti ?? '').trim()
}

export type Esito = { notizie: store.Notizia[]; quando: string | null; fatta: boolean }

/**
 * Va a prendere le notizie, sceglie, e le scrive nell'indice.
 *
 * `forza` è il bottone: senza, un giro che trova la rassegna di due ore fa non
 * fa niente e non spende niente. È la differenza fra una cosa che gira in
 * sottofondo quattro volte al giorno e una che ricarica a ogni apertura della
 * pagina — e la seconda, con dentro un modello, è una bolletta.
 */
export async function aggiorna(forza = false): Promise<Esito> {
  const ultima = store.ultimaRassegna()
  if (!forza && ultima && Date.now() - new Date(ultima).getTime() < ORE_VALIDA * 3600_000) {
    return { notizie: store.notizie(), quando: ultima, fatta: false }
  }
  // Il bottone e l'orologio possono cadere insieme: due giri in parallelo
  // vorrebbero dire trenta richieste ai giornali e due chiamate al modello per
  // una rassegna sola. Chi arriva secondo aspetta il primo e ne prende l'esito.
  const chiave = cartella()
  let giroInCorso = inCorso.get(chiave)
  if (!giroInCorso) {
    giroInCorso = giro().finally(() => { inCorso.delete(chiave) })
    inCorso.set(chiave, giroInCorso)
  }
  return giroInCorso
}

/*
 * Uno per persona. Con una variabile sola il giro di A, partito un attimo
 * prima, diventava la risposta a B: le notizie scelte sul gusto di A, con i
 * suoi «perché», salvate nell'indice di A e mostrate a B.
 */
const inCorso = new Map<string, Promise<Esito>>()

async function giro(): Promise<Esito> {
  const fonti = fontiPer(lingua())
  const tutte = (await Promise.all(fonti.map(prendi))).flat()
  if (!tutte.length) {
    // nessun giornale ha risposto: non si azzera quello che c'era. Una rassegna
    // di ieri è meglio di una pagina vuota, ed è quasi sempre colpa della rete
    throw new Error('Non sono riuscito a raggiungere nessun giornale.')
  }

  // quello che è già uscito negli ultimi due giorni, per non raccontarlo due volte
  const gia = store.notizie(2).map(n => ({ id: n.id, parole: impronta(n.titolo) }))
  // e quello che hai buttato via non rientra dalla finestra: `notizie()` non
  // lo elenca più, quindi senza questa riga sarebbe l'unica cosa che la
  // rassegna può riproporti all'infinito
  const scartate = new Set(store.notizieScartate())
  const candidate = cernita(tutte.filter(n => !scartate.has(n.id)), Date.now(), gia)
  const miei = interessi()
  // quello che si è imparato da come legge: costa due conteggi sull'indice, e
  // vale sia per il modello sia per la scelta a mano
  const g = gusto()
  const scelte = (await scegli(candidate, miei, g)) ?? sceltaAMano(candidate, miei, Date.now(), g)

  store.salvaNotizie(scelte.map(s => {
    const n = candidate[s.n - 1]
    return { ...n, perche: s.riga.trim() || null }
  }))
  store.potaNotizie(GIORNI_ARCHIVIO)

  return { notizie: store.notizie(), quando: store.ultimaRassegna(), fatta: true }
}

/** Quello che c'è adesso, senza andare a prendere niente. */
export function elenco(): Esito {
  return { notizie: store.notizie(), quando: store.ultimaRassegna(), fatta: false }
}
