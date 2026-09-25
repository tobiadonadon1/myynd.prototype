// La prova di un'automazione sugli ultimi trenta giorni (P6).
//
// Le sue parole: «maybe it would be cool if there was kind of a sandbox where
// these automations could be tested». Qui la ricetta rigira nel motore vero,
// volta per volta, su una copia di sola lettura dei suoi dati com'erano in quel
// momento (store.nellaProva). Quello che avrebbe messo in lista si annota e
// basta; poche bozze si scrivono dentro lo stesso recinto; ogni risultato si
// giudica prima da quello che lui ha fatto davvero dopo, poi da un modello
// economico; e il conto dice se è pronta (almeno 5 giudicati e 9 su 10).
//
// Scrive solo `prove` ed `esiti`, solo fuori dal recinto. Non importa niente
// che scriva nella lista o fuori dal Mac: una prova statica lo controlla.

import * as store from './store.ts'
import * as chi from './chi.ts'
import * as automazioni from './automazioni.ts'
import * as provaChiusa from './prova-chiusa.ts'
import * as modello from './modello.ts'
import * as giudizi from './giudizi.ts'
import { delTetto, usoDiOggi } from './tetto.ts'
import { stesura, FERRI_STESURA, type FerriStesura, type Riga } from './stesura.ts'
import { senzaTrattini } from './testo.ts'
import * as mani from './mani.ts'
import { rigaIpotesi } from './cornice.ts'
import { withBackgroundWork } from './lavoro-background.ts'
import { ragioneDi } from './feed-esiti.ts'
import { VASSOIO_GIORNI, versoCheRegistra, type Annotato } from './verso.ts'

export { VASSOIO_GIORNI }

export const PROVA_GIORNI = 30
export const PROVA_OCCORRENZE = 12
export const PROVA_RIGHE = 60
export const PROVA_BOZZE = 10
export const PROVA_BOZZE_SUGGERIMENTO = 3
export const PROVA_GETTONI = 300_000
export const PROVA_GETTONI_SUGGERIMENTO = 120_000
export const PROVA_JEV = 80
export const PROVE_AL_GIORNO = 6
export const PRETEST_AL_GIORNO = 3
export const SOGLIA_PROVA = 0.9
export const MINIMO_GIUDICATI = 5
export const PROVE_TENUTE = 5

const GIORNO = 86_400_000

// — i tipi che vede il client (src/api.ts li ripete) —

export type Verdetto = 'giusto' | 'sbagliato' | 'incerto'
export type Da = 'tuo' | 'mosse' | 'modello' | null
export type Voce = {
  doc: string | null; titolo: string; chi: string | null; quando: string | null
  verdetto: Verdetto; da: Da; perche: string | null
  /** Le prime righe del documento, per aprire il risultato sul posto. */
  estratto: string | null
}
export type Prova = { cosa: 'risposto' | 'fatto' | 'riga' | 'scartato'; quando: string }
export type EsitoVista = {
  id: string; quando: string; anche: string[]; tipo: 'riga' | 'proposta'; testo: string; voci: Voce[]
  bozza: string | null; ipotesi: string[]; chiede: string | null; prova: Prova | null
  risposta: { doc: string; quando: string } | null; stato: string; suo: 'giusto' | 'sbagliato' | null; scrive: boolean
  /** Com'è nato: una riga per documento, una riga sola, una proposta. */
  forma: 'documento' | 'riga' | 'proposta'
}
export type Parziale = 'agenda' | 'codice'
export type RiassuntoProva = {
  id: string; stato: string; esito: 'pronta' | 'poco' | 'non passa' | null; giusti: number; giudicati: number
  tue: number; documenti: number; risultati: number; bozze: number; al: string | null; cambiata: boolean
  parziale: Parziale[]; davanti: string | null
}
export type ProvaVista = RiassuntoProva & { esiti: EsitoVista[]; altri: number; puoScrivere: boolean }

// — il verdetto e il conto: puri —

/** Quello che serve per giudicare una voce. */
export type Giudicabile = {
  suo: 'giusto' | 'sbagliato' | null
  prova: Prova['cosa'] | null
  giudice: boolean | null
  /** Com'è nato il risultato: una riga per documento, una riga sola, una proposta. */
  forma: 'documento' | 'riga' | 'proposta'
  /** La rilettura della bozza, se c'è: 'revise' vuol dire che non è passata. */
  revisione: string | null
  /** Avrebbe chiesto (la sua unica domanda) o si è fermato su un blocco. */
  chiede: boolean
}

export function verdetto(v: Giudicabile): { verdetto: Verdetto; da: Da } {
  if (v.suo) return { verdetto: v.suo, da: 'tuo' }
  let r: { verdetto: Verdetto; da: Da }
  if (v.prova === 'scartato') r = { verdetto: 'sbagliato', da: 'mosse' }
  else if (v.prova) r = v.giudice === false ? { verdetto: 'incerto', da: null } : { verdetto: 'giusto', da: 'mosse' }
  else r = v.giudice === null
    ? { verdetto: 'incerto', da: null }
    : { verdetto: v.giudice ? 'giusto' : 'sbagliato', da: 'modello' }
  if (v.revisione === 'revise' && v.forma === 'documento') r = { verdetto: 'sbagliato', da: 'modello' }
  else if (v.revisione === 'revise' && r.verdetto === 'giusto') r = { verdetto: 'incerto', da: null }
  if (v.chiede) r = { verdetto: 'incerto', da: null }
  return r
}

export function record(voci: Pick<Voce, 'verdetto' | 'da'>[]): { giusti: number; giudicati: number; tue: number; esito: 'pronta' | 'poco' | 'non passa' } {
  const giusti = voci.filter(v => v.verdetto === 'giusto').length
  const sbagliati = voci.filter(v => v.verdetto === 'sbagliato').length
  const giudicati = giusti + sbagliati
  const tue = voci.filter(v => v.verdetto !== 'incerto' && (v.da === 'tuo' || v.da === 'mosse')).length
  const esito = giudicati < MINIMO_GIUDICATI ? 'poco' : giusti / giudicati >= SOGLIA_PROVA ? 'pronta' : 'non passa'
  return { giusti, giudicati, tue, esito }
}

/** Al più n volte, distribuite: la prima e l'ultima restano sempre. */
export function campiona<T>(xs: T[], n: number): T[] {
  if (xs.length <= n) return xs
  if (n <= 1) return [xs[xs.length - 1]]
  const fuori: T[] = []
  for (let i = 0; i < n; i++) fuori.push(xs[Math.round(i * (xs.length - 1) / (n - 1))])
  return fuori
}

// — i risultati annotati, piegati —

export type Risultato = Annotato & { quando: string; anche: string[]; nuovi: string[] }

/**
 * Una riga sola che rilegge gli stessi documenti del risultato di prima non è
 * un risultato nuovo: la sua data va nell'«anche» di quello (P6). Le righe per
 * documento e le proposte non si piegano mai.
 */
export function piega(prima: Risultato | null, r: Annotato & { quando: string }, perDocumento: boolean): Risultato | null {
  const visti = new Set(prima?.docs ?? [])
  const nuovi = r.docs.filter(d => !visti.has(d))
  if (!perDocumento && r.tipo === 'riga' && prima && prima.tipo === 'riga' && r.docs.length && !nuovi.length) {
    prima.anche.push(r.quando)
    return null
  }
  return { ...r, anche: [], nuovi: perDocumento || r.tipo === 'proposta' || !prima ? r.docs : nuovi }
}

const nuovoId = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
const leggiJSON = <T>(s: string | null | undefined, x: T): T => { try { return s ? JSON.parse(s) as T : x } catch { return x } }

/** L'errore di un account che non risponde, dentro la prova: nessuna chiave dietro. */
export const OCCUPATO = 'Fermata: il tuo account Claude è occupato.'

// — quello che ha fatto lui, dopo —

/**
 * Cosa è successo davvero a un documento dopo T, dal database vivo e senza
 * modello: una risposta mandata nello stesso filo, una carta del feed a cui ha
 * risposto, una riga vera nata per lui. La prima, e del suo messaggio solo l'id.
 */
export function aPosteriori(docId: string, T: string): (Prova & { risposta?: string }) | null {
  const trovati: (Prova & { risposta?: string })[] = []
  const d = store.documento(docId)
  if (d?.filo) {
    const r = store.stessoFilo(d.filo, [docId], 50)
      .filter(x => x.inviato && (x.quando ?? '') > T)
      .sort((a, b) => (a.quando ?? '').localeCompare(b.quando ?? ''))[0]
    if (r?.quando) trovati.push({ cosa: 'risposto', quando: r.quando, risposta: r.id })
  }
  const carte = store.default.prepare(`SELECT stato, ragione, motivo, risposto FROM feed
    WHERE doc = ? AND risposto IS NOT NULL AND risposto > ? ORDER BY risposto ASC`).all(docId, T) as
    { stato: string; ragione: string | null; motivo: string | null; risposto: string }[]
  for (const c of carte) {
    const r = ragioneDi(c.stato, c.ragione, c.motivo)
    const cosa = r === 'lui' || r === 'lista' || r === 'fuori' || r === 'fatta' ? 'fatto'
      : r === 'non_mia' || r === 'non_chiara' || (r === null && c.stato === 'scartato') ? 'scartato' : null
    if (cosa) { trovati.push({ cosa, quando: c.risposto }); break }
  }
  const riga = store.default.prepare(`SELECT creato FROM compiti WHERE doc = ? AND creato > ? AND sparito IS NULL
    AND stato != 'lasciato' AND COALESCE(esito, '') != 'lasciato' ORDER BY creato ASC LIMIT 1`).get(docId, T) as { creato: string } | undefined
  if (riga) trovati.push({ cosa: 'riga', quando: riga.creato })
  return trovati.sort((a, b) => a.quando.localeCompare(b.quando))[0] ?? null
}

// — il giudice —

type DaGiudicare = { chiave: string; fai: string; riga: string; doc: store.Documento | null; perche?: string }

const SCHEMA_GIUDICE = (k: number) => ({
  type: 'object', additionalProperties: false, required: ['giudizi'],
  properties: {
    giudizi: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['n', 'giusta', 'perche'],
        properties: { n: { type: 'integer', minimum: 0, maximum: Math.max(0, k - 1) }, giusta: { type: 'boolean' }, perche: { type: 'string' } }
      }
    }
  }
})

const GIUDICE = `You check the results of a personal automation, replayed on past documents.
For each numbered item you get the automation's instruction, the result it would have put in the person's list, and the document it came from.
Say giusta true only if a person following the instruction would want this result for this document, the result names the real who and what, and nothing in the document contradicts it.
Newsletters, receipts and automatic notices are wrong for an instruction about requests from people.
Answer for every item with its number n. perche: at most 15 words, plain, no dashes.`

/** Le mani del giudice e della stesura, sostituibili solo nelle prove. */
type Ferri = {
  chiediJSON: (o: Parameters<typeof modello.chiediJSON>[0]) => Promise<unknown>
  stesura: FerriStesura
  collegato: () => boolean
}
const VERI: Ferri = { chiediJSON: o => modello.chiediJSON(o), stesura: FERRI_STESURA, collegato: () => modello.collegato() }
let ferri: Ferri = VERI
export function perProva(f: Partial<Ferri> | null) { ferri = f ? { ...VERI, ...f } : VERI }

async function alGiudice(voci: DaGiudicare[]): Promise<Map<string, { giusta: boolean; perche: string }>> {
  const fuori = new Map<string, { giusta: boolean; perche: string }>()
  for (let i = 0; i < voci.length; i += 20) {
    const pezzo = voci.slice(i, i + 20)
    const testo = pezzo.map((v, n) => [
      `${n}. Instruction: ${v.fai}`,
      `Result: ${v.riga}${v.perche ? ` (${v.perche})` : ''}`,
      v.doc ? `Document: ${v.doc.titolo}\nFrom: ${v.doc.autore ?? ''}\nDate: ${v.doc.quando ?? ''}\n${v.doc.corpo.slice(0, 700)}` : 'Document: not available'
    ].join('\n')).join('\n\n')
    await modello.cediAChiGuarda('collaudo')
    const r = await ferri.chiediJSON({
      lavoro: 'collaudo', severo: true, max_tokens: 1500, system: GIUDICE, formato: SCHEMA_GIUDICE(pezzo.length),
      messages: [{ role: 'user', content: testo }]
    }) as { giudizi?: { n: unknown; giusta: unknown; perche: unknown }[] } | null
    for (const g of r?.giudizi ?? []) {
      const n = Number(g.n)
      if (!Number.isInteger(n) || n < 0 || n >= pezzo.length) continue
      fuori.set(pezzo[n].chiave, { giusta: g.giusta === true, perche: senzaTrattini(String(g.perche ?? '')).slice(0, 160) })
    }
  }
  return fuori
}

// — la fila: una sola, per tutto il processo —

type Origine = 'editor' | 'suggerimento'
type Lavoro = {
  utente: string
  automazione: string
  prova: string
  origine: Origine
  ricetta: automazioni.Automazione
  abort: AbortController
  /** Una bozza in più su un risultato già scritto, invece di una prova intera. */
  bozza?: string
  /** Dove era arrivata una prova d'idea che ha ceduto il passo. */
  corsa?: Corsa
  chiave?: string
}
type Corsa = {
  volte: { al: Date; dal: Date }[]; i: number; prima: Risultato | null; fatti: Set<string>; jev: number
  scritti: number; altri: number; letti: number; conto: provaChiusa.Conto; parziale: Set<Parziale>; inizio: number
}

const fila: Lavoro[] = []
let corrente: Lavoro | null = null
let occupato = false
let occupatoDalVivo: (utente: string) => boolean = () => false
const provate: ((utente: string, chiave: string, r: RiassuntoProva) => void)[] = []

/** compiti.ts non si importa: chi può, dice qui come sapere se c'è lavoro dal vivo. */
export function registraOccupato(f: (utente: string) => boolean) { occupatoDalVivo = f }
/** scoperte.ts si fa chiamare quando una prova d'idea finisce. */
export function quandoProvata(f: (utente: string, chiave: string, r: RiassuntoProva) => void) { provate.push(f) }

/** Il posto del vassoio: libero solo se nessuna prova gira o aspetta. Torna chi lo restituisce. */
export function turno(): (() => void) | null {
  if (occupato || fila.length) return null
  occupato = true
  return () => { occupato = false; gira() }
}

const suo = () => chi.adesso() ?? ''
const nomeDi = (l: Lavoro) => automazioni.nella(l.ricetta).nome

function prossimo(): Lavoro | null {
  const i = fila.findIndex(l => l.origine === 'editor')
  const j = i >= 0 ? i : 0
  return fila.length ? fila.splice(j, 1)[0] : null
}

function gira() {
  if (occupato) return
  // le prove aspettano il suo lavoro dal vivo: si riprova fra poco
  const pronto = fila.find(l => !occupatoDalVivo(l.utente))
  if (!pronto) { if (fila.length) setTimeout(gira, 2000).unref(); return }
  const l = prossimo()
  if (!l) return
  if (occupatoDalVivo(l.utente)) { fila.push(l); setTimeout(gira, 2000).unref(); return }
  occupato = true
  corrente = l
  const lavora = () => l.bozza ? unaBozza(l) : corri(l)
  const esegui = () => l.utente ? chi.dentro(l.utente, lavora) : lavora()
  void Promise.resolve()
    .then(() => l.origine === 'editor' ? withBackgroundWork(esegui) : esegui())
    .catch(e => console.error('myynd · prova', l.prova, e instanceof Error ? e.message : e))
    .finally(() => { corrente = null; occupato = false; setImmediate(gira) })
}

/** Aspetta che la fila si svuoti: solo per le prove. */
export async function finche(ms = 20_000) {
  const fine = Date.now() + ms
  while ((occupato || fila.length) && Date.now() < fine) await new Promise(r => setTimeout(r, 15))
}

// — la corsa —

function contesto(l: Lavoro, al: string | null, c: { conto: provaChiusa.Conto }): provaChiusa.Contesto {
  return { tipo: 'prova', prova: l.prova, al, conto: c.conto, parziale: new Set() }
}

/** Perché ci si ferma, o null se l'errore riguarda solo quel pezzo. */
function perche(e: unknown, l: Lavoro, conto: provaChiusa.Conto): string | null {
  if (l.abort.signal.aborted) return 'annullata'
  if (conto.sforato || (e instanceof Error && e.message === provaChiusa.BUDGET)) return 'fermata'
  if (delTetto(e)) return 'tetto'
  if (provaChiusa.eDellAccount(e)) return 'occupato'
  return null
}

function scriviRisultato(l: Lavoro, r: Risultato): void {
  const prove: Record<string, Prova & { risposta?: string }> = {}
  const chiavi = r.tipo === 'proposta' ? (r.proposta?.proposta && 'voci' in r.proposta.proposta ? r.proposta.proposta.voci.map(v => v.doc) : []) : r.docs
  let risposta: string | null = null
  for (const d of chiavi) {
    const x = aPosteriori(d, r.quando)
    if (x) { prove[d] = x; if (!risposta && x.risposta) risposta = x.risposta }
  }
  store.scriviEsito({
    id: r.id, prova: l.prova, automazione: l.automazione, tipo: r.tipo, stato: 'senza bozza', quando: r.quando,
    testo: r.tipo === 'proposta' ? r.proposta?.riassunto ?? r.testo : r.testo, nota: r.nota, doc: r.doc,
    docs: JSON.stringify({ ids: r.docs, nuovi: r.nuovi, anche: r.anche }), inLista: r.inLista,
    modo: r.scrive ? r.modo : null, attrezzi: r.attrezzi ? JSON.stringify(r.attrezzi) : null,
    proposta: r.proposta ? JSON.stringify(r.proposta) : null,
    aPosteriori: Object.keys(prove).length ? JSON.stringify(prove) : null, risposta
  })
}

async function corri(l: Lavoro): Promise<void> {
  const riga = store.prova(l.prova)
  if (!riga || riga.stato === 'annullata') return
  const a = l.ricetta
  const perDocumento = !!a.metti.perDocumento
  let c = l.corsa
  if (!c) {
    const al = new Date()
    const dal = new Date(al.getTime() - PROVA_GIORNI * GIORNO)
    const volte = campiona(automazioni.occorrenze(a, dal, al), PROVA_OCCORRENZE)
    c = {
      volte, i: 0, prima: null, fatti: new Set(), jev: 0, scritti: 0, altri: 0, letti: 0, parziale: new Set(), inizio: Date.now(),
      conto: { gettoni: 0, tetto: l.origine === 'suggerimento' ? PROVA_GETTONI_SUGGERIMENTO : PROVA_GETTONI, sforato: false }
    }
    store.aggiornaProva(l.prova, { stato: 'in corso', dal: dal.toISOString(), occorrenze: volte.length })
  }
  const inizio = c.volte[0]?.dal.toISOString() ?? null
  for (; c.i < c.volte.length; c.i++) {
    if (l.abort.signal.aborted) return fine(l, c, 'annullata')
    if (c.conto.sforato) return fine(l, c, 'fermata')
    if (usoDiOggi().raggiunto) return fine(l, c, 'tetto')
    // una prova d'idea cede il passo a una che ha premuto lui, fra una volta e l'altra
    if (l.origine === 'suggerimento' && fila.some(x => x.origine === 'editor')) { l.corsa = c; fila.push(l); return }
    const v = c.volte[c.i]
    const T = v.al.toISOString()
    const prima = v.dal.toISOString()
    const fatti = c.fatti
    const conto = c
    const reg = {
      stato: { id: a.id, spenta: 0, quante: 0, esito: null, guaio: null, ultima: prima, vista: prima, dal: inizio } as store.StatoAutomazione,
      arrivati: (dal: string, limite: number) => store.arrivatiFra(dal, T, limite),
      giaFatti: (ids: string[], origine: string) => {
        const s = store.docsConRiga(ids, origine)
        for (const x of ids) if (fatti.has(x)) s.add(x)
        return s
      },
      attenzione: async (docs: store.Documento[], tetto: number) => {
        if (conto.jev >= PROVA_JEV) return new Map<string, giudizi.Giudizio>()
        const pezzo = docs.slice(0, PROVA_JEV - conto.jev)
        conto.jev += pezzo.length
        return giudizi.attenzione(pezzo, tetto)
      },
      annotati: [] as Annotato[], letti: 0
    }
    const ctx = contesto(l, T, c)
    try {
      await modello.cediAChiGuarda('collaudo')
      await store.nellaProva(ctx, () => automazioni.faiCon(a, versoCheRegistra(reg), { adesso: v.al, aMano: true }))
    } catch (e) {
      for (const p of ctx.parziale) c.parziale.add(p)
      const stop = perche(e, l, c.conto)
      if (stop) return fine(l, c, stop)
      console.warn(`myynd · prova · ${l.prova} · volta ${T}:`, e instanceof Error ? e.message : e)
    }
    for (const p of ctx.parziale) c.parziale.add(p)
    c.letti += reg.letti
    for (const x of reg.annotati) {
      if (perDocumento && x.doc) c.fatti.add(x.doc)
      const r = piega(c.prima, { ...x, id: nuovoId('e'), quando: T }, perDocumento)
      if (!r) {
        if (c.prima && c.scritti <= PROVA_RIGHE && store.esito(c.prima.id)) {
          store.aggiornaEsito(c.prima.id, { docs: JSON.stringify({ ids: c.prima.docs, nuovi: c.prima.nuovi, anche: c.prima.anche }) })
        }
        continue
      }
      if (c.scritti >= PROVA_RIGHE) { c.altri++; continue }
      scriviRisultato(l, r)
      c.scritti++
      if (!perDocumento && r.tipo === 'riga') c.prima = r
    }
    store.aggiornaProva(l.prova, { al: T, documenti: c.letti, gettoni: c.conto.gettoni })
    await new Promise(r => setImmediate(r))
  }

  // le bozze: quelle con una sua risposta prima, poi distribuite nella finestra
  const quante = l.origine === 'suggerimento' ? PROVA_BOZZE_SUGGERIMENTO : PROVA_BOZZE
  const vogliono = store.esiti(l.prova).filter(e => e.modo && !e.bozza && e.stato === 'senza bozza').reverse()
  const risposte = vogliono.filter(e => e.risposta)
  const scelte = [...risposte, ...campiona(vogliono.filter(e => !e.risposta), Math.max(0, quante - risposte.length))].slice(0, quante)
  for (const e of scelte) {
    const stop = await stendi(l, e, c)
    if (stop) return fine(l, c, stop)
  }

  // il giudice, su tutto quello che non ha già deciso lui
  const esiti = store.esiti(l.prova)
  const voci: DaGiudicare[] = []
  for (const e of esiti) {
    for (const d of chiaviDi(e, perDocumento)) {
      const x = leggiJSON<{ proposta?: store.Proposta }>(e.proposta, {})
      const item = x.proposta && 'voci' in x.proposta ? x.proposta.voci.find(v => v.doc === d) : undefined
      voci.push({ chiave: `${e.id}|${d}`, fai: automazioni.nella(a).fai, riga: e.testo ?? '', doc: store.documento(d), perche: item?.perche })
    }
  }
  if (voci.length) {
    const ctx = contesto(l, null, c)
    try {
      const giudizi = await store.nellaProva(ctx, () => alGiudice(voci))
      for (const e of esiti) {
        const suoi: Record<string, { giusta: boolean; perche: string }> = {}
        for (const [k, g] of giudizi) if (k.startsWith(`${e.id}|`)) suoi[k.slice(e.id.length + 1)] = g
        if (Object.keys(suoi).length) {
          const sbagliato = Object.values(suoi).find(g => !g.giusta)
          store.aggiornaEsito(e.id, { giudizio: JSON.stringify(suoi), perche: sbagliato?.perche ?? null })
        }
      }
    } catch (e) {
      const stop = perche(e, l, c.conto)
      if (stop) return fine(l, c, stop)
      console.warn(`myynd · prova · ${l.prova} · il giudice non ha risposto:`, e instanceof Error ? e.message : e)
    }
  }
  return fine(l, c, 'finita')
}

/** Le voci di un risultato: il suo documento, i documenti nuovi di una riga sola, le voci di una proposta. */
function chiaviDi(e: store.RigaEsito, perDocumento: boolean): string[] {
  if (e.tipo === 'proposta') {
    const x = leggiJSON<{ proposta?: store.Proposta }>(e.proposta, {})
    return x.proposta && 'voci' in x.proposta ? x.proposta.voci.map(v => v.doc) : []
  }
  if (perDocumento) return e.doc ? [e.doc] : []
  const d = leggiJSON<{ ids?: string[]; nuovi?: string[] }>(e.docs, {})
  return d.nuovi?.length ? d.nuovi : d.ids ?? (e.doc ? [e.doc] : [])
}

/**
 * Una bozza su un risultato, dentro un recinto: all'ora del risultato nella
 * prova, adesso nel vassoio. Torna l'errore che deve fermare chi chiama, o null.
 * `ancora()` si guarda prima di salvare: nel vassoio il risultato può essere
 * andato in lista mentre si scriveva, e allora la bozza si butta.
 */
export async function stendiEsito(e: store.RigaEsito, o: {
  tipo: 'prova' | 'vassoio'; prova: string; al: string | null; signal: AbortSignal
  conto: provaChiusa.Conto; parziale: Set<Parziale>; ancora?: () => boolean
}): Promise<unknown | null> {
  const r: Riga = {
    id: e.id, testo: e.testo ?? '', nota: e.nota, modo: e.modo ?? 'bozza', doc: e.doc,
    attrezzi: leggiJSON<store.Concessione | null>(e.attrezzi, null), progetto: null, materiale: null, cartella: null
  }
  const ctx: provaChiusa.Contesto = { tipo: o.tipo, prova: o.prova, al: o.al, conto: o.conto, parziale: new Set() }
  try {
    await modello.cediAChiGuarda('collaudo')
    const s = await store.nellaProva(ctx, () => stesura(r, ferri.stesura, {
      nativa: false, signal: o.signal, fermato: () => o.signal.aborted, passo: () => {}
    }))
    for (const p of ctx.parziale) o.parziale.add(p)
    if (!s) return new Error('fermata')
    if (o.ancora && !o.ancora()) return null
    const ipotesi = s.ipotesiProposta ?? rigaIpotesi(s.testo)
    store.aggiornaEsito(e.id, {
      // la frase di chiusura («Done: …») è per la riga, non per la bozza
      stato: 'scritta', bozza: senzaTrattini(mani.senzaChiusura(s.testo)), fonti: JSON.stringify(s.fonti ?? []),
      revisione: JSON.stringify({
        esito: s.verdetto?.esito ?? null, problemi: s.verdetto?.problemi ?? [], giri: s.giri,
        ipotesi: ipotesi ? [ipotesi] : [], domanda: s.mossa === 'chiedi' ? s.domanda : null,
        blocco: s.mossa === 'blocco' || s.mossa === 'guaio', parziale: [...ctx.parziale]
      })
    })
    return null
  } catch (err) {
    for (const p of ctx.parziale) o.parziale.add(p)
    if (o.signal.aborted || o.conto.sforato || delTetto(err) || provaChiusa.eDellAccount(err) ||
      (err instanceof Error && err.message === provaChiusa.BUDGET)) return err
    console.warn(`myynd · ${o.tipo} · ${o.prova} · bozza ${e.id}:`, err instanceof Error ? err.message : err)
    if (!o.ancora || o.ancora()) store.aggiornaEsito(e.id, { stato: 'guaio', revisione: JSON.stringify({ parziale: [...ctx.parziale] }) })
    return null
  }
}

async function stendi(l: Lavoro, e: store.RigaEsito, c: { conto: provaChiusa.Conto; parziale: Set<Parziale> }): Promise<string | null> {
  const err = await stendiEsito(e, { tipo: 'prova', prova: l.prova, al: e.quando, signal: l.abort.signal, conto: c.conto, parziale: c.parziale })
  return err === null ? null : perche(err, l, c.conto) ?? 'guaio'
}

async function unaBozza(l: Lavoro): Promise<void> {
  const e = l.bozza ? store.esito(l.bozza) : null
  const p = store.prova(l.prova)
  if (!e || !p) return
  const c = { conto: { gettoni: 0, tetto: PROVA_GETTONI, sforato: false }, parziale: new Set<Parziale>() }
  await stendi(l, e, c)
  store.aggiornaProva(l.prova, { gettoni: (p.gettoni ?? 0) + c.conto.gettoni })
}

function fine(l: Lavoro, c: Corsa, stato: string): void {
  const finita = new Date().toISOString()
  const vecchia = store.prova(l.prova)
  const ricetta = leggiJSON<{ ricetta?: unknown }>(vecchia?.ricetta, {})
  store.aggiornaProva(l.prova, {
    stato, finita, gettoni: c.conto.gettoni, documenti: c.letti,
    ricetta: JSON.stringify({ ...ricetta, altri: c.altri, parziale: [...c.parziale] })
  })
  store.tieniUltimeProve(l.automazione, PROVE_TENUTE)
  const r = riassunto(l.prova)
  console.info(`myynd · prova · ${l.prova} · ${stato} · ${r?.giusti ?? 0}/${r?.giudicati ?? 0} · ${c.conto.gettoni} gettoni · ${Math.round((Date.now() - c.inizio) / 1000)} s`)
  if (l.origine === 'suggerimento' && l.chiave && r) for (const f of provate) { try { f(l.utente, l.chiave, r) } catch (e) { console.warn('myynd · prova d\'idea:', e) } }
}

// — quello che si legge —

const FINITE = new Set(['finita', 'fermata', 'tetto', 'occupato', 'interrotta', 'annullata', 'guaio'])

function ricettaDi(p: store.RigaProva): { ricetta: automazioni.Automazione | null; altri: number; parziale: Parziale[] } {
  const x = leggiJSON<{ ricetta?: automazioni.Automazione; altri?: number; parziale?: Parziale[] }>(p.ricetta, {})
  return { ricetta: x.ricetta ?? null, altri: x.altri ?? 0, parziale: x.parziale ?? [] }
}

export function vistaDiEsito(e: store.RigaEsito, perDocumento: boolean): EsitoVista {
  const prove = leggiJSON<Record<string, Prova & { risposta?: string }>>(e.aPosteriori, {})
  const giudizi = leggiJSON<Record<string, { giusta: boolean; perche: string }>>(e.giudizio, {})
  const rev = leggiJSON<{ esito?: string | null; ipotesi?: string[]; domanda?: string | null; blocco?: boolean }>(e.revisione, {})
  const docs = leggiJSON<{ anche?: string[] }>(e.docs, {})
  const proposta = leggiJSON<{ proposta?: store.Proposta }>(e.proposta, {}).proposta
  const forma: Giudicabile['forma'] = e.tipo === 'proposta' ? 'proposta' : perDocumento ? 'documento' : 'riga'
  const suo = e.suo === 'giusto' || e.suo === 'sbagliato' ? e.suo : null
  const voci: Voce[] = chiaviDi(e, perDocumento).map(d => {
    const doc = store.documento(d)
    const item = proposta && 'voci' in proposta ? proposta.voci.find(v => v.doc === d) : undefined
    const g = giudizi[d]
    const v = verdetto({
      suo, prova: prove[d]?.cosa ?? null, giudice: g ? g.giusta : null, forma,
      revisione: rev.esito ?? null, chiede: !!rev.domanda || !!rev.blocco
    })
    return {
      doc: doc ? d : null, titolo: doc?.titolo ?? item?.titolo ?? '', chi: doc?.autore ?? null, quando: doc?.quando ?? null,
      estratto: doc ? doc.corpo.slice(0, 360) : null,
      ...v, perche: v.verdetto === 'sbagliato' && v.da === 'modello' ? g?.perche ?? null : null
    }
  })
  const primo = Object.values(prove).sort((a, b) => a.quando.localeCompare(b.quando))[0] ?? null
  const risposta = e.risposta ? store.documento(e.risposta) : null
  return {
    id: e.id, quando: e.quando ?? e.creato, anche: docs.anche ?? [], tipo: e.tipo === 'proposta' ? 'proposta' : 'riga',
    testo: e.testo ?? '', voci, bozza: e.bozza, ipotesi: rev.ipotesi ?? [], chiede: rev.domanda ?? null,
    prova: primo ? { cosa: primo.cosa, quando: primo.quando } : null,
    risposta: e.risposta ? { doc: risposta ? e.risposta : '', quando: risposta?.quando ?? primo?.quando ?? '' } : null,
    stato: e.stato, suo, scrive: !!e.modo, forma
  }
}

function davantiA(id: string): string | null {
  const l = fila.find(x => x.prova === id)
  if (!l) return null
  const prima = corrente && corrente.prova !== id ? corrente : fila.slice(0, fila.indexOf(l)).find(x => x.utente === l.utente) ?? null
  return prima ? nomeDi(prima) : null
}

function calcola(p: store.RigaProva): { riassunto: RiassuntoProva; esiti: EsitoVista[]; altri: number } {
  const r = ricettaDi(p)
  const perDocumento = !!r.ricetta?.metti?.perDocumento
  const righe = store.esiti(p.id)
  const esiti = righe.map(e => vistaDiEsito(e, perDocumento))
  const conto = record(esiti.flatMap(e => e.voci))
  const parziale = new Set<Parziale>(r.parziale)
  for (const e of righe) for (const x of leggiJSON<{ parziale?: Parziale[] }>(e.revisione, {}).parziale ?? []) parziale.add(x)
  const attuale = automazioni.ricette().find(x => x.id === p.automazione)
  return {
    riassunto: {
      id: p.id, stato: p.stato, esito: FINITE.has(p.stato) ? conto.esito : null,
      giusti: conto.giusti, giudicati: conto.giudicati, tue: conto.tue,
      documenti: p.documenti ?? 0, risultati: righe.length + r.altri, bozze: righe.filter(e => e.bozza).length,
      al: p.al, cambiata: !!attuale && !!p.impronta && automazioni.impronta(attuale) !== p.impronta,
      parziale: [...parziale], davanti: p.stato === 'in coda' ? davantiA(p.id) : null
    },
    esiti, altri: r.altri
  }
}

export function riassunto(id: string): RiassuntoProva | null {
  const p = store.prova(id)
  return p ? calcola(p).riassunto : null
}

export function vista(id: string): ProvaVista | null {
  const p = store.prova(id)
  if (!p || p.tipo !== 'prova') return null
  const { riassunto, esiti, altri } = calcola(p)
  return { ...riassunto, esiti, altri, puoScrivere: FINITE.has(p.stato) && riassunto.bozze < PROVA_BOZZE }
}

/** L'ultima prova di un'automazione, o null. */
export function ultimaDi(automazione: string): RiassuntoProva | null {
  const p = store.proveDi(automazione, 'prova', 1)[0]
  return p ? calcola(p).riassunto : null
}

export function ultimaVistaDi(automazione: string): ProvaVista | null {
  const p = store.proveDi(automazione, 'prova', 1)[0]
  return p ? vista(p.id) : null
}

// — i gesti —

const finta = (stato: string): ProvaVista => ({
  id: '', stato, esito: null, giusti: 0, giudicati: 0, tue: 0, documenti: 0, risultati: 0, bozze: 0, al: null,
  cambiata: false, parziale: [], davanti: null, esiti: [], altri: 0, puoScrivere: false
})

function inFila(automazione: string, utente: string): Lavoro | null {
  if (corrente && corrente.automazione === automazione && corrente.utente === utente && !corrente.bozza) return corrente
  return fila.find(l => l.automazione === automazione && l.utente === utente && !l.bozza) ?? null
}

function metti(ricetta: automazioni.Automazione, automazione: string, origine: Origine, chiave?: string): string {
  const id = nuovoId('p')
  store.nuovaProva({
    id, automazione, tipo: 'prova', origine, stato: 'in coda', impronta: automazioni.impronta(ricetta),
    ricetta: JSON.stringify({ ricetta, altri: 0 })
  })
  fila.push({ utente: suo(), automazione, prova: id, origine, ricetta, abort: new AbortController(), chiave })
  setImmediate(gira)
  return id
}

/** Il bottone «Provala adesso»: la prova di quella automazione, o quella che già gira. */
export function avvia(ricetta: automazioni.Automazione, origine: Origine = 'editor'): ProvaVista {
  const gia = inFila(ricetta.id, suo())
  if (gia) return vista(gia.prova) ?? finta('in coda')
  if (!ferri.collegato()) return finta('senza modello')
  if (automazioni.salute(ricetta, null).stato === 'scollegata') return finta('scollegata')
  if (store.proveDiOggi('editor') >= PROVE_AL_GIORNO) return finta('basta per oggi')
  return vista(metti(ricetta, ricetta.id, origine)) ?? finta('in coda')
}

/** Una prova d'idea (un suggerimento non ancora adottato). Torna l'id, o null se oggi ne ha già fatte tre. */
export function preprova(ricetta: automazioni.Automazione, chiave: string): string | null {
  const automazione = `idea:${chiave}`
  const gia = inFila(automazione, suo())
  if (gia) return gia.prova
  if (!ferri.collegato() || store.proveDiOggi('suggerimento') >= PRETEST_AL_GIORNO) return null
  return metti(ricetta, automazione, 'suggerimento', chiave)
}

/** Quante prove d'idea di questa persona aspettano o girano. */
export function ideeInProva(): number {
  const u = suo()
  return fila.filter(l => l.utente === u && l.origine === 'suggerimento').length + (corrente?.utente === u && corrente.origine === 'suggerimento' ? 1 : 0)
}

export class Rifiuto extends Error {
  status: number
  constructor(messaggio: string, status = 409) { super(messaggio); this.status = status }
}

/** Il suo segno su un risultato: giusto, sbagliato, o via (null). */
export function giudica(esitoId: string, suoSegno: 'giusto' | 'sbagliato' | null): RiassuntoProva {
  const e = store.esito(esitoId)
  if (!e) throw new Rifiuto('Non conosco questo risultato.', 404)
  store.aggiornaEsito(esitoId, { suo: suoSegno })
  return riassunto(e.prova)!
}

/** Una bozza in più su un risultato della prova, nella stessa fila. Al massimo dieci per prova. */
export function scriviAncora(esitoId: string): void {
  const e = store.esito(esitoId)
  const p = e ? store.prova(e.prova) : null
  if (!e || !p) throw new Rifiuto('Non conosco questo risultato.', 404)
  if (e.bozza || fila.some(l => l.bozza === esitoId)) return
  if (store.esiti(p.id).filter(x => x.bozza).length >= PROVA_BOZZE) throw new Rifiuto('Questa prova ha già dieci bozze.')
  const r = ricettaDi(p).ricetta
  if (!r) throw new Rifiuto('Non conosco questa prova.', 404)
  fila.push({ utente: suo(), automazione: p.automazione, prova: p.id, origine: 'editor', ricetta: r, abort: new AbortController(), bozza: esitoId })
  setImmediate(gira)
}

/** La ricetta è cambiata o è stata buttata: la sua prova in fila o in corso si ferma. */
export function annulla(automazione: string): void {
  const u = suo()
  for (let i = fila.length - 1; i >= 0; i--) {
    const l = fila[i]
    if (l.automazione !== automazione || l.utente !== u) continue
    fila.splice(i, 1)
    if (!l.bozza) store.aggiornaProva(l.prova, { stato: 'annullata', finita: new Date().toISOString() })
  }
  if (corrente && corrente.automazione === automazione && corrente.utente === u) corrente.abort.abort()
}

/** Quelle rimaste a metà quando Myynd si è chiuso. All'avvio, per ogni conto. */
export function riprendiAppese(): number {
  const appese = store.proveInStato(['in coda', 'in corso'])
  for (const p of appese) store.aggiornaProva(p.id, { stato: 'interrotta', finita: new Date().toISOString() })
  return appese.length
}

/** Per Ottimizza: fino a cinque risultati sbagliati e tre giusti, in righe piane. */
export function esempi(automazione: string): string {
  const v = ultimaVistaDi(automazione)
  if (!v) return ''
  const riga = (e: EsitoVista) => {
    const d = e.voci[0]
    return `· ${e.testo}${d?.titolo ? ` (${d.titolo}${d.chi ? `, ${d.chi}` : ''})` : ''}${d?.perche ? `: ${d.perche}` : ''}`
  }
  const sbagliati = v.esiti.filter(e => e.voci.some(x => x.verdetto === 'sbagliato')).slice(0, 5)
  const giusti = v.esiti.filter(e => e.voci.length && e.voci.every(x => x.verdetto === 'giusto')).slice(0, 3)
  if (!sbagliati.length && !giusti.length) return ''
  return [
    'Dalla prova sugli ultimi 30 giorni.',
    ...(sbagliati.length ? ['Risultati sbagliati, da non ripetere:', ...sbagliati.map(riga)] : []),
    ...(giusti.length ? ['Risultati giusti, da tenere:', ...giusti.map(riga)] : [])
  ].join('\n')
}

// — le misure (P6, sezione 8): non si mostrano nell'app oltre al conto sulla scheda —

export type Misura = {
  automazioni: { automazione: string; prova: string; stato: string; esito: string | null; giusti: number; giudicati: number; tue: number }[]
  accordo: { tutte: number; d_accordo: number; quota: number | null; tuo: { n: number; si: number }; mosse: { n: number; si: number } }
  costo: { prova: string; origine: string | null; gettoni: number; secondi: number | null }[]
  perGiorno: Record<string, { editor: number; suggerimento: number }>
  vassoio: { automazione: string; spostati: number; scartati: number; quota: number | null; inAttesa: number; rimastiAllaFine: number }[]
}

export function misura(): Misura {
  const tutte = store.default.prepare("SELECT * FROM prove WHERE tipo = 'prova' ORDER BY creata DESC").all() as unknown as store.RigaProva[]
  const ultime = new Map<string, store.RigaProva>()
  for (const p of tutte) if (!ultime.has(p.automazione)) ultime.set(p.automazione, p)
  const automazioniM = [...ultime.values()].map(p => {
    const r = calcola(p).riassunto
    return { automazione: p.automazione, prova: p.id, stato: p.stato, esito: r.esito, giusti: r.giusti, giudicati: r.giudicati, tue: r.tue }
  })
  const accordo = { tutte: 0, d_accordo: 0, quota: null as number | null, tuo: { n: 0, si: 0 }, mosse: { n: 0, si: 0 } }
  for (const p of tutte) {
    for (const e of store.esiti(p.id)) {
      const g = leggiJSON<Record<string, { giusta: boolean }>>(e.giudizio, {})
      const pr = leggiJSON<Record<string, Prova>>(e.aPosteriori, {})
      for (const [d, x] of Object.entries(g)) {
        const suoSegno = e.suo === 'giusto' ? true : e.suo === 'sbagliato' ? false : null
        const mossa = pr[d] ? pr[d].cosa !== 'scartato' : null
        if (suoSegno !== null) { accordo.tuo.n++; if (suoSegno === x.giusta) accordo.tuo.si++ }
        else if (mossa !== null) { accordo.mosse.n++; if (mossa === x.giusta) accordo.mosse.si++ }
      }
    }
  }
  accordo.tutte = accordo.tuo.n + accordo.mosse.n
  accordo.d_accordo = accordo.tuo.si + accordo.mosse.si
  accordo.quota = accordo.tutte ? accordo.d_accordo / accordo.tutte : null
  const costo = tutte.map(p => ({
    prova: p.id, origine: p.origine, gettoni: p.gettoni ?? 0,
    secondi: p.finita ? Math.round((Date.parse(p.finita) - Date.parse(p.creata)) / 1000) : null
  }))
  const perGiorno: Misura['perGiorno'] = {}
  for (const p of tutte) {
    const g = p.creata.slice(0, 10)
    perGiorno[g] ??= { editor: 0, suggerimento: 0 }
    if (p.origine === 'suggerimento') perGiorno[g].suggerimento++; else perGiorno[g].editor++
  }
  const vassoio = (store.default.prepare(`SELECT e.automazione AS automazione, e.stato AS stato, a.vassoio AS fino
    FROM esiti e JOIN prove p ON p.id = e.prova LEFT JOIN automazioni a ON a.id = e.automazione WHERE p.tipo = 'vassoio'`)
    .all() as { automazione: string; stato: string; fino: string | null }[])
    .reduce((m, r) => {
      const x = m.get(r.automazione) ?? { automazione: r.automazione, spostati: 0, scartati: 0, quota: null as number | null, inAttesa: 0, rimastiAllaFine: 0 }
      if (r.stato === 'in lista') x.spostati++
      else if (r.stato === 'scartata') x.scartati++
      else if (['senza bozza', 'da scrivere', 'scritta'].includes(r.stato)) {
        x.inAttesa++
        if (r.fino && r.fino < new Date().toISOString()) x.rimastiAllaFine++
      }
      x.quota = x.spostati + x.scartati ? x.spostati / (x.spostati + x.scartati) : null
      return m.set(r.automazione, x)
    }, new Map<string, Misura['vassoio'][number]>())
  return { automazioni: automazioniM, accordo, costo, perGiorno, vassoio: [...vassoio.values()] }
}
