// Mentre non c'eri: quello che Myynd ha fatto da quando lui è andato via.
//
// «When I hop on it, there's not such a big cluster.» La prima pagina apriva
// con una carta che ripeteva le righe dei blocchi sotto; adesso apre con una
// frase sola e dei numeri: ho letto 41 cose, preparato 2 bozze, scritto un
// file, aggiornato una pagina di Notion, messo da parte 29. Ogni numero si
// apre, e le cose da guardare sono al più tre.
//
// Tre cose stanno qui, e nessuna tocca lo schema del database:
//
// — `via`: i conti, da righe già scritte da altri. Letto e messo da parte
//   vengono dal registro dell'esame (`feed_esame`, che la lettura scrive per
//   ogni documento guardato); il lavoro dalle carte; le pagine di Notion dal
//   registro qui sotto, perché una pagina scritta da un lavoro di fondo non
//   sta su nessuna carta.
// — Visto: le cose fatte che lui ha già aperto. Un file per conto, perché è
//   una bandiera sola per riga e non serve una migrazione per tenerla.
// — Messo da parte: dove la lettura ha deciso che una cosa non valeva il suo
//   tempo, con il perché in una parola (`ragioneDaParte`), che la pagina dice.

import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import db from './store.ts'
import type { Compito } from './store.ts'
import * as cfg from './config.ts'

/** Per quanti giorni si ricorda che una cosa è stata vista: oltre, non è più in nessuna ricevuta. */
export const GIORNI_VISTI = 60
/** Quante bandiere al più, per conto. */
export const VISTI_MAX = 2000
/** Quante cose fatte porta la ricevuta: il resto si conta e basta. */
export const LAVORI_MAX = 40
/** Quante righe porta l'elenco di un numero. */
export const ELENCO_MAX = 200
/** Quante pagine di Notion si ricordano. */
const PAGINE_MAX = 200

const GIORNO = 86_400_000

export type GenereLavoro = 'bozza' | 'file' | 'notion' | 'nota' | 'testo'
export type LavoroVia = {
  /** L'id della carta, o `notion:<chiave>` per una pagina scritta fuori da una carta. */
  id: string
  titolo: string
  genere: GenereLavoro
  /** Il nome della cosa: il file, la pagina. */
  nome: string | null
  quando: string
  visto: boolean
  /** Fatta ma non ancora andata da nessuna parte: aspetta il suo sì. */
  aspetta: boolean
  url?: string | null
}
export type Via = { dal: string; letti: number; daParte: number; lavori: LavoroVia[] }

/**
 * Perché una cosa è stata messa da parte, in una parola che la pagina
 * traduce in una riga. Null: non è stata messa da parte (è diventata una
 * carta, era già fatta, era roba sua), o non è una cosa che lui avrebbe mai
 * guardato (un file tecnico, una mail che ha mandato lui).
 */
export type Ragione =
  | 'in_serie' | 'letta' | 'sconosciuto' | 'archiviato'
  | 'tacere' | 'regola' | 'non_tua' | 'niente_da_fare' | 'non_regge' | 'fuori_obiettivo' | 'meno_urgente'

const DALLE_REGOLE: Record<string, Ragione> = {
  posta_in_serie: 'in_serie',
  letta_senza_richiesta: 'letta',
  mittente_sconosciuto: 'sconosciuto',
  mittente_archiviato_dalla_persona: 'archiviato'
}
const DALLE_FASI: Record<string, Ragione> = {
  scartati: 'tacere',
  filtro: 'regola',
  non_suo: 'non_tua',
  modello: 'niente_da_fare',
  verifica: 'non_regge',
  obiettivo: 'fuori_obiettivo',
  posti: 'meno_urgente'
}

export function ragioneDaParte(fase: string, motivo: string | null | undefined): Ragione | null {
  if (fase === 'regole') return (motivo && DALLE_REGOLE[motivo]) || null
  return DALLE_FASI[fase] ?? null
}

/**
 * Le regole che non sono una lettura: la mail che ha mandato lui, il file
 * che Myynd stesso ha consegnato, un file tecnico. Contarle direbbe «ho letto
 * 2.000 cose» il primo giorno, e non sarebbe vero in nessun senso che conti.
 */
const NON_LETTE = new Set(['gia_inviato', 'consegna_gia_preparata', 'file_tecnico'])
export const letta = (fase: string, motivo: string | null | undefined): boolean => !(fase === 'regole' && !!motivo && NON_LETTE.has(motivo))

/** I due conti dell'esame: quante lette, quante messe da parte. */
export function contaEsame(righe: readonly { fase: string; motivo: string | null }[]): { letti: number; daParte: number } {
  let letti = 0
  let daParte = 0
  for (const r of righe) {
    if (!letta(r.fase, r.motivo)) continue
    letti++
    if (ragioneDaParte(r.fase, r.motivo)) daParte++
  }
  return { letti, daParte }
}

/** Una carta consegnata da qualche parte: un file, la casella, Notion. */
const consegnata = (c: Compito): boolean => !!c.consegna || c.email?.casella?.stato === 'salvata'

function genereDi(c: Compito): { genere: GenereLavoro; nome: string | null } {
  if (c.consegna) return { genere: 'file', nome: c.consegna.titolo }
  if (c.email) return { genere: 'bozza', nome: null }
  const nota = c.diario?.find(v => v.tipo === 'nota')
  if (nota) return { genere: 'nota', nome: nota.dettaglio ?? null }
  return { genere: 'testo', nome: null }
}

export type PaginaScritta = { chiave: string; titolo: string; url: string | null; quando: string }

/**
 * Quello che ha fatto da `dal`, la più recente prima.
 *
 * Una carta conta se il lavoro è suo (affidata, del turno, o con qualcosa
 * consegnato) ed è finita: pronta o chiusa, e non bocciata dalla sua prova.
 * Una carta che lui ha chiuso è vista per forza: l'ha avuta davanti.
 */
export function lavoriVia(compiti: readonly Compito[], o: {
  dal: string; consegnati?: ReadonlyMap<string, string>; visti: ReadonlySet<string>; pagine?: readonly PaginaScritta[]
}): LavoroVia[] {
  const dal = Date.parse(o.dal)
  const fuori: LavoroVia[] = []
  for (const c of compiti) {
    if (c.sparito || c.esito === 'lasciato' || c.stato === 'lasciato') continue
    if (c.stato !== 'pronto' && c.stato !== 'fatto') continue
    if (c.prova?.esito === 'fail') continue
    const sua = c.modo !== 'io' || !!c.turno || consegnata(c)
    if (!sua || (!c.risultato && !c.consegna && !c.email)) continue
    const quando = o.consegnati?.get(c.id) ?? c.turno?.ultimo ?? c.chiuso ?? c.aggiornato
    if (!(Date.parse(quando) >= dal)) continue
    const { genere, nome } = genereDi(c)
    fuori.push({
      id: c.id, titolo: (c.titolo || c.testo).trim(), genere, nome, quando,
      visto: c.stato === 'fatto' || o.visti.has(c.id),
      aspetta: c.stato === 'pronto' && (!consegnata(c) || !!c.proposta)
    })
  }
  for (const p of o.pagine ?? []) {
    if (!(Date.parse(p.quando) >= dal)) continue
    const id = `notion:${p.chiave}`
    fuori.push({ id, titolo: p.titolo, genere: 'notion', nome: p.titolo, quando: p.quando, visto: o.visti.has(id), aspetta: false, url: p.url })
  }
  return fuori.sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, LAVORI_MAX)
}

// — su disco, per conto —

function leggiJson<T>(nome: string, vuoto: T): T {
  try { return JSON.parse(readFileSync(join(cfg.cartella(), nome), 'utf8')) as T } catch { return vuoto }
}
function scriviJson(nome: string, x: unknown) {
  // prima un file accanto, poi lo scambio: un'uscita a metà non lascia un file rotto
  const f = join(cfg.cartella(), nome)
  writeFileSync(`${f}.nuovo`, JSON.stringify(x))
  renameSync(`${f}.nuovo`, f)
}

const FILE_VISTI = 'lavori-visti.json'
const FILE_PAGINE = 'via-notion.json'

/** Le cose fatte che ha già aperto, con quando. */
export function visti(): Map<string, string> {
  const x = leggiJson<Record<string, unknown>>(FILE_VISTI, {})
  const m = new Map<string, string>()
  if (x && typeof x === 'object') for (const [id, q] of Object.entries(x)) if (typeof q === 'string') m.set(id, q)
  return m
}

/**
 * Le segna viste: una volta sola, con l'ora della prima. Torna quante sono
 * nuove. Le più vecchie di sessanta giorni se ne vanno, e il file non passa
 * le duemila righe.
 */
export function segnaVisti(ids: readonly unknown[], quando = new Date().toISOString()): number {
  const buoni = [...new Set(ids.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 200))]
  if (!buoni.length) return 0
  const m = visti()
  let nuovi = 0
  for (const id of buoni) if (!m.has(id)) { m.set(id, quando); nuovi++ }
  if (!nuovi) return 0
  const soglia = new Date(Date.parse(quando) - GIORNI_VISTI * GIORNO).toISOString()
  const tenuti = [...m].filter(([, q]) => q >= soglia).sort((a, b) => b[1].localeCompare(a[1])).slice(0, VISTI_MAX)
  scriviJson(FILE_VISTI, Object.fromEntries(tenuti))
  return nuovi
}

/** Le pagine di Notion scritte, una per chiave, la più recente. */
export function pagineNotion(): PaginaScritta[] {
  const x = leggiJson<unknown>(FILE_PAGINE, [])
  return Array.isArray(x) ? x.filter((p): p is PaginaScritta => !!p && typeof p.chiave === 'string' && typeof p.quando === 'string') : []
}

/** Una pagina di Notion appena scritta: la chiama `notion-scrivi.ts`, e un guaio qui non ferma la scrittura. */
export function segnaPagina(p: { chiave: string; titolo: string; url: string | null }, quando = new Date().toISOString()) {
  const resto = pagineNotion().filter(x => x.chiave !== p.chiave)
  scriviJson(FILE_PAGINE, [{ chiave: p.chiave, titolo: p.titolo, url: p.url, quando }, ...resto].slice(0, PAGINE_MAX))
}

// — dal registro dell'esame —

type RigaEsame = { doc: string; fase: string; motivo: string | null; quando: string }

function esameDal(dal: string): RigaEsame[] {
  try {
    return db.prepare('SELECT doc, fase, motivo, quando FROM feed_esame WHERE quando >= ?').all(dal) as RigaEsame[]
  } catch { return [] }
}

/** I conti e il lavoro di chi chiede, da `dal`. */
export function via(dal: string, compiti: readonly Compito[], consegnati?: ReadonlyMap<string, string>): Via {
  const { letti, daParte } = contaEsame(esameDal(dal))
  const v = new Set(visti().keys())
  return { dal, letti, daParte, lavori: lavoriVia(compiti, { dal, consegnati, visti: v, pagine: pagineNotion() }) }
}

export type RigaElenco = { doc: string; titolo: string; fonte: string; autore: string | null; quando: string; ragione: Ragione | null; fase: string }

/**
 * L'elenco dietro un numero: le lette, o le messe da parte con il perché.
 * La più recente prima, e solo quelle che hanno un titolo da dire.
 */
export function elenco(dal: string, genere: 'letti' | 'daParte'): RigaElenco[] {
  let righe: (RigaEsame & { titolo: string | null; fonte: string | null; autore: string | null })[] = []
  try {
    righe = db.prepare(`
      SELECT e.doc, e.fase, e.motivo, e.quando, d.titolo, d.fonte, d.autore
      FROM feed_esame e LEFT JOIN documenti d ON d.id = e.doc
      WHERE e.quando >= ? ORDER BY e.quando DESC
    `).all(dal) as typeof righe
  } catch { return [] }
  const fuori: RigaElenco[] = []
  for (const r of righe) {
    if (!letta(r.fase, r.motivo) || !r.titolo?.trim()) continue
    const ragione = ragioneDaParte(r.fase, r.motivo)
    if (genere === 'daParte' && !ragione) continue
    fuori.push({ doc: r.doc, titolo: r.titolo.trim(), fonte: r.fonte ?? '', autore: r.autore ?? null, quando: r.quando, ragione, fase: r.fase })
    if (fuori.length >= ELENCO_MAX) break
  }
  return fuori
}
