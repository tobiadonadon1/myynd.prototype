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
// La parte che cresce sono i progetti. Il modello li riconosce dal materiale,
// li chiama per nome, e a ogni punto dice dove stanno e propone un angolo —
// un'idea che potrebbe prendere su quel progetto, sua e non da manuale. Un
// angolo tenuto diventa una convinzione nella memoria, cioè una cosa che Myynd
// sa di lui da lì in poi; uno scartato resta scritto qui, per non tornare.
//
// Tutto sta in un file JSON nella cartella della persona, come le automazioni:
// non è materiale da cercare, è un foglio che si riscrive.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type Anthropic from '@anthropic-ai/sdk'
import { cartella, nellaLingua } from './config.ts'
import { attesaDi, conLaLingua, estraiJSON, motore, parametri, segnaUso } from './modello.ts'
import * as store from './store.ts'
import { attendibile, carta } from './memoria.ts'
import { fuoco } from './timone.ts'
import { affinita, gusto } from './gusto.ts'

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
  nome: string
  /** La prima volta che è comparso: un progetto che dura si vede da qui. */
  dal: string
  doveSei: string
  angolo: string
  /** Gli angoli che ha tenuto: suoi, e il modello ci costruisce sopra. */
  angoliTenuti: string[]
}

export type Punto = {
  quando: string
  saluto: string
  mentreNonCeri: Riga[]
  adesso: Riga[]
  daLeggere: { titolo: string; perche: string; link: string | null }[]
  progetti: Progetto[]
}

export type Esito = {
  punto: Punto | null
  /** Vero se il modello è stato chiamato adesso; falso se è quello di prima. */
  generatoAdesso: boolean
  /** Vero se ha chiesto un punto nuovo e per oggi il conto è finito. */
  tetto: boolean
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
  progetti: Progetto[]
  /** Gli angoli che ha detto che non sono così: non tornano. */
  scartati: string[]
  /** Quando il modello è stato chiamato, per contare quelli di oggi. */
  chiamate: string[]
}

const VUOTO: Archivio = { ultimo: null, progetti: [], scartati: [], chiamate: [] }

const FILE = () => join(cartella(), 'punto.json')

function leggiArchivio(): Archivio {
  try {
    const letto = JSON.parse(readFileSync(FILE(), 'utf8')) as Partial<Archivio>
    return { ...VUOTO, ...letto }
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
  const chi = (d.autore ?? '').toLowerCase()
  return IN_MASSA.test(chi) || IN_MASSA.test(d.titolo.toLowerCase())
}

export type Materiale = {
  dal: string
  arrivati: store.Documento[]
  /** Quanti ne sono entrati in tutto, anche quelli che non si elencano. */
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
}

function daAllora(quando: string | null | undefined, dal: string): boolean {
  return !!quando && quando >= dal
}

/** Tutto quello che il punto guarda, raccolto in un posto per poterlo provare. */
export function raccogli(dal: string): Materiale {
  const arrivati = store.appenaArrivati(dal, 200)
  const azioni = store.azioni(200).filter(a => a.quando >= dal)
  const vive = store.elencoCompiti()
  const chiuse = store.compitiChiusi(40).filter(c => daAllora(c.chiuso, dal))

  // le notizie di oggi che non ha ancora aperto, dalla più vicina al suo gusto
  const g = gusto()
  const notizie = store.notizie(1)
    .filter(n => !n.letta)
    .map(n => ({ n, punti: affinita(g, n.titolo, n.fonte) }))
    .sort((a, b) => b.punti - a.punti || b.n.presa.localeCompare(a.n.presa))
    .slice(0, 3)
    .map(x => x.n)

  return {
    dal,
    arrivati: arrivati.filter(d => !inMassa(d)).slice(0, DOCS_MAX),
    indicizzati: arrivati.length,
    azioni,
    attendono: vive.filter(c => c.stato === 'pronto' || c.stato === 'chiede'),
    perOggi: vive.filter(c => c.stato === 'aperto' && c.quando === 'oggi'),
    chiuse,
    preparate: vive.filter(c => (c.stato === 'pronto' || c.stato === 'chiede') && daAllora(c.aggiornato, dal)),
    feed: store.elencoFeed('aperto').slice(0, 12).map(v => ({ id: v.id, titolo: v.titolo, doc: v.doc ?? null, quando: v.quando })),
    notizie,
    fuoco: fuoco(),
    carta: carta(),
    convinzioni: store.convinzioni('persona').filter(attendibile).slice(0, 8),
    tenuti: store.convinzioni()
      .filter(k => k.ambito.startsWith('progetto:'))
      .map(k => ({ nome: k.ambito.slice('progetto:'.length), angolo: k.enunciato }))
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

const schema = (compiti: string[], docs: string[]) => {
  const riga = {
    type: 'object',
    properties: {
      testo: { type: 'string', description: 'Una riga sola, piana.' },
      compito: { type: 'string', enum: ['', ...compiti], description: 'L’id della riga della lista di cui parla, o vuoto.' },
      doc: { type: 'string', enum: ['', ...docs], description: 'L’id del documento di cui parla, o vuoto.' }
    },
    required: ['testo', 'compito', 'doc'],
    additionalProperties: false
  }
  return {
    type: 'object',
    properties: {
      saluto: { type: 'string', description: 'Una riga: da quanto manca e quante cose sono cambiate.' },
      mentreNonCeri: { type: 'array', items: riga, description: 'Fino a quattro righe.' },
      adesso: { type: 'array', items: riga, description: 'Fino a tre mosse.' },
      daLeggere: {
        type: 'array',
        description: 'Fino a due, solo fra le notizie elencate.',
        items: {
          type: 'object',
          properties: {
            titolo: { type: 'string', description: 'Il titolo della notizia, copiato alla lettera.' },
            perche: { type: 'string', description: 'Una riga: perché conta per quello su cui lavora.' }
          },
          required: ['titolo', 'perche'],
          additionalProperties: false
        }
      },
      progetti: {
        type: 'array',
        description: 'Da uno a tre.',
        items: {
          type: 'object',
          properties: {
            nome: { type: 'string', description: 'Corto e stabile: lo stesso della volta scorsa, se è lo stesso progetto.' },
            doveSei: { type: 'string', description: 'Una riga: a che punto sta.' },
            angolo: { type: 'string', description: 'Un’idea distintiva che potrebbe prendere. Vuoto se non ne hai una buona.' }
          },
          required: ['nome', 'doveSei', 'angolo'],
          additionalProperties: false
        }
      }
    },
    required: ['saluto', 'mentreNonCeri', 'adesso', 'daLeggere', 'progetti'],
    additionalProperties: false
  }
}

/**
 * L'istruzione: chi è, cosa sa di lui, i progetti come li aveva capiti, gli
 * angoli già suoi e quelli rifiutati. Cambia poco fra un punto e l'altro, ed è
 * per questo che va nel blocco che si mette in cache; il materiale del giorno
 * sta nel messaggio.
 */
export function istruzione(m: Materiale, progetti: Progetto[], scartati: string[]): string {
  const tenuti = [
    ...progetti.flatMap(p => p.angoliTenuti.map(a => ({ nome: p.nome, angolo: a }))),
    ...m.tenuti
  ]
  const visti = new Set<string>()
  const suoi = tenuti.filter(t => {
    const k = `${t.nome}|${t.angolo}`.toLowerCase()
    if (visti.has(k)) return false
    visti.add(k)
    return true
  })

  return [
    `Sei Myynd. Questa persona torna all'app dopo un po' e tu le fai il punto: cosa è
successo mentre non c'era, cosa hai fatto tu nel frattempo, cosa conviene fare
adesso, e dove stanno i suoi progetti.`,
    m.carta ? `Chi è:\n${m.carta}` : '',
    m.convinzioni.length
      ? 'Quello che sai di come lavora:\n' + m.convinzioni.map(k => `— ${k.enunciato}`).join('\n')
      : '',
    m.fuoco ? `Ti ha chiesto di concentrarti su questo, e viene prima di tutto il resto:\n${m.fuoco}` : '',
    progetti.length
      ? 'I suoi progetti, come li avevi capiti l\'ultima volta. Tieni gli stessi nomi; ' +
        'aggiorna «dove sei» con quello che è successo; aggiungine uno solo se il materiale lo ' +
        'mostra davvero, e lascia cadere quello di cui non c\'è più traccia da settimane.\n' +
        progetti.map(p => `— ${p.nome} (dal ${p.dal.slice(0, 10)}): ${p.doveSei}` +
          (p.angolo ? `\n  angolo proposto la volta scorsa: ${p.angolo}` : '')).join('\n')
      : 'Non hai ancora dato un nome ai suoi progetti: fallo adesso, dal materiale. Un progetto è una cosa su cui sta lavorando da più di un giorno, con un nome che userebbe lui.',
    suoi.length
      ? 'Angoli che ha già tenuto — sono suoi, non riproporli: costruisci sopra, o proponi un passo oltre.\n' +
        suoi.map(t => `— [${t.nome}] ${t.angolo}`).join('\n')
      : '',
    scartati.length
      ? 'Angoli che ha detto che NON sono così. Non riproporli, nemmeno riformulati.\n' +
        scartati.map(a => `— ${a}`).join('\n')
      : '',
    `Regole:
— Tono piano, niente entusiasmo, niente «io», niente cappelli. Frasi corte.
— Il saluto è una riga sola: da quanto manca, se lo sai, e quante cose sono
  cambiate. Così: «Sei stato via quattro ore. Tre cose sono cambiate.» Se non è
  successo niente, dillo in quattro parole.
— «mentreNonCeri»: fino a quattro righe — quello che è arrivato e conta, e
  quello che hai fatto tu (bozze preparate, mail mandate, automazioni girate).
  Metti l'id del compito o del documento quando c'è, così si apre con un dito.
— «adesso»: fino a tre mosse che fanno andare avanti il suo lavoro, ognuna con
  la ragione in poche parole. Una riga pronta da approvare viene prima di tutto.
— «daLeggere»: fino a due notizie, solo fra quelle elencate e solo se c'entrano
  con quello su cui lavora, con una riga sul perché. Vuoto è una risposta giusta.
— «progetti»: da uno a tre. «doveSei» in una riga. «angolo» è UN'idea
  distintiva che potrebbe prendere su quel progetto — radicata nel suo
  materiale e in quello che crede, mai generica, mai un consiglio da manuale.
  Se non ne hai una buona, lascia l'angolo vuoto.
— Concreto: nomi, cifre e date che hai letto davvero. Niente inventato. Meno
  righe piuttosto che righe di riempimento.
— Gli id di compiti e documenti li prendi SOLO da quelli elencati nel
  materiale; altrimenti stringa vuota.
Scrivi in ${nellaLingua()}.`
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
    `— [${c.id}] ${c.testo} (${c.stato}${c.quando === 'oggi' ? ', per oggi' : ''})` +
    (c.stato === 'pronto' && c.risultato ? `\n  bozza: ${c.risultato.slice(0, 200).replace(/\s+/g, ' ')}` : '') +
    (c.stato === 'chiede' && c.chieste?.length ? `\n  chiede: ${c.chieste.map(x => x.domanda).join(' · ')}` : '')

  return [
    `Da quando: ${m.dal} (${ore(m.dal, adesso)} ore fa)` +
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
  saluto?: string
  mentreNonCeri?: Partial<Riga>[]
  adesso?: Partial<Riga>[]
  daLeggere?: { titolo?: string; perche?: string }[]
  progetti?: { nome?: string; doveSei?: string; angolo?: string }[]
}

/**
 * Da quello che ha scritto il modello a un punto che si può mostrare.
 *
 * Gli id passano solo se stanno nel materiale — cintura oltre alle bretelle
 * dell'enum — e i progetti si ricuciono con quelli di prima per nome: `dal` e
 * gli angoli tenuti sono suoi, non del modello, e non si perdono a ogni giro.
 */
export function ricuci(g: Grezzo, m: Materiale, prima: Progetto[], scartati: string[], quando: string): Punto {
  const compiti = new Set([...m.attendono, ...m.perOggi, ...m.preparate].map(c => c.id))
  const docs = new Set(m.arrivati.map(d => d.id))
  const riga = (r: Partial<Riga>): Riga | null => {
    const testo = (r.testo ?? '').trim()
    if (!testo) return null
    return {
      testo,
      compito: r.compito && compiti.has(r.compito) ? r.compito : null,
      doc: r.doc && docs.has(r.doc) ? r.doc : null
    }
  }
  const righe = (xs: Partial<Riga>[] | undefined, max: number) =>
    (xs ?? []).map(riga).filter((r): r is Riga => !!r).slice(0, max)

  const chiave = (s: string) => s.trim().toLowerCase()
  const rifiutati = new Set(scartati.map(chiave))
  const progetti: Progetto[] = []
  for (const p of g.progetti ?? []) {
    const nome = (p.nome ?? '').trim()
    if (!nome || progetti.length >= 3) continue
    const vecchio = prima.find(x => chiave(x.nome) === chiave(nome))
    const angolo = (p.angolo ?? '').trim()
    progetti.push({
      nome: vecchio?.nome ?? nome,
      dal: vecchio?.dal ?? quando,
      doveSei: (p.doveSei ?? '').trim(),
      // un angolo che ha già rifiutato, o già tenuto, non si ripropone: resta vuoto
      angolo: rifiutati.has(chiave(angolo)) || vecchio?.angoliTenuti.some(a => chiave(a) === chiave(angolo)) ? '' : angolo,
      angoliTenuti: vecchio?.angoliTenuti ?? []
    })
  }

  const daLeggere = (g.daLeggere ?? []).slice(0, 2).flatMap(n => {
    const titolo = (n.titolo ?? '').trim()
    if (!titolo) return []
    const vera = m.notizie.find(x => chiave(x.titolo) === chiave(titolo))
      ?? m.notizie.find(x => chiave(x.titolo).includes(chiave(titolo)) || chiave(titolo).includes(chiave(x.titolo)))
    return [{ titolo: vera?.titolo ?? titolo, perche: (n.perche ?? '').trim(), link: vera?.link ?? null }]
  })

  return {
    quando,
    saluto: (g.saluto ?? '').trim(),
    mentreNonCeri: righe(g.mentreNonCeri, 4),
    adesso: righe(g.adesso, 3),
    daLeggere,
    progetti
  }
}

/** Le chiamate di oggi, nel giorno solare UTC — lo stesso del tetto dei token. */
function diOggi(chiamate: string[], adesso: number): string[] {
  const giorno = new Date(adesso).toISOString().slice(0, 10)
  return chiamate.filter(c => c.slice(0, 10) === giorno)
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

async function fai(r: Richiesta, adesso: number): Promise<Esito> {
  const a = leggiArchivio()
  const fermo: Esito = { punto: a.ultimo, generatoAdesso: false, tetto: false }

  const m = motore()
  if (!m) return fermo

  if (!r.forza && a.ultimo && adesso - new Date(a.ultimo.quando).getTime() < ORE_FRA * 3600_000) return fermo

  const dal = a.ultimo?.quando ?? new Date(adesso - GIORNI_PRIMO * 86_400_000).toISOString()
  const mat = raccogli(dal)
  // il primo punto su una mente vuota non ha niente da dire, e non lo finge
  if (!successoQualcosa(mat) && (!r.forza || !a.ultimo)) return fermo

  if (diOggi(a.chiamate, adesso).length >= AL_GIORNO) return { ...fermo, tetto: true }

  const quando = new Date(adesso).toISOString()
  // si conta prima di chiamare: una risposta che non si legge è costata lo stesso
  a.chiamate = [...diOggi(a.chiamate, adesso), quando]
  scriviArchivio(a)

  const risposta = await m.crea({
    ...parametri('punto', 6000, schema(
      [...mat.attendono, ...mat.perOggi, ...mat.preparate].map(c => c.id),
      mat.arrivati.map(d => d.id)
    )),
    system: [{ type: 'text', text: conLaLingua(istruzione(mat, a.progetti, a.scartati)), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: materiale(mat, r.via, adesso) }]
  }, attesaDi('punto'))
  segnaUso('punto', risposta.usage, m.nome)
  if (risposta.stop_reason === 'refusal') return fermo

  const testo = risposta.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text).join('')
  let grezzo: Grezzo
  try {
    grezzo = JSON.parse(estraiJSON(testo)) as Grezzo
  } catch {
    console.warn('myynd · il punto non è arrivato in una forma leggibile')
    return fermo
  }

  const nuovo = ricuci(grezzo, mat, a.progetti, a.scartati, quando)
  // i progetti che il modello ha lasciato cadere restano nel foglio ancora un
  // giro: un nome che sparisce e ricompare non deve perdere la sua data
  const nomi = new Set(nuovo.progetti.map(p => p.nome.toLowerCase()))
  const caduti = a.progetti.filter(p => !nomi.has(p.nome.toLowerCase()) && p.dal >= new Date(adesso - 14 * 86_400_000).toISOString())
  a.progetti = [...nuovo.progetti, ...caduti.map(p => ({ ...p, angolo: '' }))]
  a.ultimo = nuovo
  scriviArchivio(a)
  return { punto: nuovo, generatoAdesso: true, tetto: false }
}

// — gli angoli —

function progettoNelFoglio(a: Archivio, nome: string): Progetto | undefined {
  const k = nome.trim().toLowerCase()
  return a.progetti.find(p => p.nome.toLowerCase() === k)
}

/**
 * «Tienilo»: l'angolo diventa una cosa che Myynd sa di lui.
 *
 * Passa dalla stessa porta di una convinzione scritta a mano — `ricorda`, con
 * genere esplicito, perché l'ha scelto lui con un dito — e resta anche nel
 * foglio dei progetti, così il prossimo punto lo trova sotto il nome giusto.
 * L'ambito è il progetto: un'idea su Myynd non deve entrare nel ritratto che
 * guida ogni email, ma deve esserci quando si parla di Myynd.
 */
export function tieni(nome: string, angolo: string): { ok: true; id: string } {
  const a = leggiArchivio()
  const p = progettoNelFoglio(a, nome)
  if (!p) throw new Error('Questo progetto non c’è nel punto.')
  const testo = angolo.trim()
  if (!testo) throw new Error('Non c’è nessun angolo da tenere.')
  const id = store.ricorda({
    enunciato: testo,
    ambito: `progetto:${p.nome}`,
    genere: 'esplicita',
    fiducia: 0.9,
    origine: 'punto'
  })
  if (!p.angoliTenuti.some(x => x.toLowerCase() === testo.toLowerCase())) p.angoliTenuti.push(testo)
  // anche nell'ultimo punto, che è quello che la pagina mostra
  const mostrato = a.ultimo?.progetti.find(x => x.nome.toLowerCase() === p.nome.toLowerCase())
  if (mostrato) mostrato.angoliTenuti = [...p.angoliTenuti]
  scriviArchivio(a)
  return { ok: true, id }
}

/** «Non è così»: resta scritto, e il modello non lo ripropone. */
export function scarta(nome: string, angolo: string): { ok: true } {
  const a = leggiArchivio()
  const p = progettoNelFoglio(a, nome)
  if (!p) throw new Error('Questo progetto non c’è nel punto.')
  const testo = angolo.trim()
  if (!testo) throw new Error('Non c’è nessun angolo da scartare.')
  if (!a.scartati.some(x => x.toLowerCase() === testo.toLowerCase())) a.scartati = [...a.scartati, testo].slice(-40)
  if (p.angolo.toLowerCase() === testo.toLowerCase()) p.angolo = ''
  const mostrato = a.ultimo?.progetti.find(x => x.nome.toLowerCase() === p.nome.toLowerCase())
  if (mostrato && mostrato.angolo.toLowerCase() === testo.toLowerCase()) mostrato.angolo = ''
  scriviArchivio(a)
  return { ok: true }
}

/** Per le prove: dove sta il foglio di chi chiede. */
export const perProva = { file: FILE }
