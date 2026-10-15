// Notion, in scrittura: una pagina sola dove Myynd può mettere le sue.
//
// Un attrezzo è un permesso, e qui il permesso è stretto apposta. Lui sceglie
// una pagina del suo Notion (`notion.paginaMyynd`); Myynd scrive solo pagine
// figlie di quella, una per chiave stabile (`progetto:<id>`), e le tiene
// aggiornate riscrivendone il corpo. Tre regole che questo file tiene ferme:
//
//   · Senza pagina scelta non si scrive niente, e non si dice niente.
//   · Si scrive solo dentro la pagina scelta: una pagina già scritta si
//     riprende solo se Notion conferma che è ancora sua figlia e non è nel
//     cestino; se no se ne fa una nuova, lì sotto.
//   · Non si cancella mai una pagina. Riscrivere vuol dire mettere nel cestino
//     i blocchi vecchi della pagina di Myynd, e solo quelli che non sono a loro
//     volta pagine o database: una sottopagina che lui ci ha messo dentro resta.
//
// Il corpo arriva in Markdown, il modo in cui il modello scrive, e diventa
// blocchi di Notion qui sotto (`blocchi`), a pezzi da cento come vuole l'API.

import type { Client } from '@notionhq/client'
import * as chi from '../chi.ts'
import * as cfg from '../config.ts'
import { vietato } from '../prova-chiusa.ts'
import { senzaTrattini, senzaTrattiniFuoriCodice } from '../testo.ts'
import { cliente, conCalma, stessoId, titolo as titoloDi } from './notion.ts'
import { segnaPagina } from '../via.ts'

/** Quanti blocchi per richiesta: il tetto di Notion. */
export const PER_RICHIESTA = 100
/** Quanti caratteri in un pezzo di testo: il tetto di Notion. */
export const PER_TESTO = 2000
/** Quanti pezzi di testo in un blocco: il tetto di Notion. */
export const PEZZI_PER_BLOCCO = 100
/** Una pagina di Myynd non è un libro: oltre, si taglia. */
export const TETTO_BLOCCHI = 1000

export type Pagina = { id: string; titolo: string }
export type Scritta = { id: string; url: string | null; creata: boolean; blocchi: number }

/** Un guaio che si racconta: la scrittura è spenta, o la richiesta non va. */
export class NonScrive extends Error {
  constructor(m: string) { super(m); this.name = 'NonScrive' }
}

// — il convertitore —

type Stile = { bold?: boolean; italic?: boolean; code?: boolean; link?: string }
export type RichText = {
  type: 'text'
  text: { content: string; link?: { url: string } }
  annotations?: { bold?: boolean; italic?: boolean; code?: boolean }
}
export type Blocco = { object: 'block'; type: string; [k: string]: unknown }

/** Solo gli indirizzi che Notion accetta come link: il resto resta testo. */
function linkBuono(url: string): boolean {
  return /^(?:https?:\/\/|mailto:)\S+$/i.test(url)
}

/** Un pezzo di testo con il suo stile, spezzato ai duemila caratteri. */
function pezzi(testo: string, s: Stile): RichText[] {
  const fuori: RichText[] = []
  const annotazioni = { ...(s.bold ? { bold: true } : {}), ...(s.italic ? { italic: true } : {}), ...(s.code ? { code: true } : {}) }
  for (let i = 0; i < testo.length; i += PER_TESTO) {
    const content = testo.slice(i, i + PER_TESTO)
    fuori.push({
      type: 'text',
      text: { content, ...(s.link ? { link: { url: s.link } } : {}) },
      ...(Object.keys(annotazioni).length ? { annotations: annotazioni } : {})
    })
  }
  return fuori
}

/*
 * Le forme in riga, nell'ordine in cui si provano: il codice prima di tutto
 * (dentro gli apici niente è grassetto), poi il grassetto, il link, il corsivo.
 * Il corsivo con il trattino basso vuole un confine di parola, perché
 * `nome_file_lungo` non è corsivo.
 */
const IN_RIGA = /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*|__[^_\n]+?__)|(\[[^\]\n]+\]\([^)\s]+\))|(\*[^*\s][^*\n]*?\*|(?<![\p{L}\p{N}_])_[^_\s][^_\n]*?_(?![\p{L}\p{N}_]))/u

/** Il testo di una riga, con grassetto, corsivo, codice e link. */
export function inRiga(testo: string, s: Stile = {}): RichText[] {
  const fuori: RichText[] = []
  let resto = testo
  while (resto) {
    const m = IN_RIGA.exec(resto)
    if (!m) { fuori.push(...pezzi(resto, s)); break }
    if (m.index) fuori.push(...pezzi(resto.slice(0, m.index), s))
    const [tutto, codice, grassetto, link, corsivo] = m
    if (codice) fuori.push(...pezzi(codice.slice(1, -1), { ...s, code: true }))
    else if (grassetto) fuori.push(...inRiga(grassetto.slice(2, -2), { ...s, bold: true }))
    else if (link) {
      const l = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(link)!
      fuori.push(...(linkBuono(l[2]) ? inRiga(l[1], { ...s, link: l[2] }) : pezzi(link, s)))
    } else if (corsivo) fuori.push(...inRiga(corsivo.slice(1, -1), { ...s, italic: true }))
    resto = resto.slice(m.index + tutto.length)
  }
  return fuori
}

/** I linguaggi che Notion conosce, per i nomi che si scrivono davvero dopo i tre apici. */
const LINGUAGGI: Record<string, string> = {
  js: 'javascript', javascript: 'javascript', jsx: 'javascript', mjs: 'javascript',
  ts: 'typescript', typescript: 'typescript', tsx: 'typescript',
  py: 'python', python: 'python', sh: 'shell', shell: 'shell', zsh: 'shell', bash: 'bash',
  json: 'json', html: 'html', css: 'css', sql: 'sql', yaml: 'yaml', yml: 'yaml',
  md: 'markdown', markdown: 'markdown', swift: 'swift', go: 'go', rust: 'rust', rs: 'rust',
  java: 'java', kotlin: 'kotlin', ruby: 'ruby', rb: 'ruby', php: 'php', c: 'c', cpp: 'c++', 'c++': 'c++',
  csharp: 'c#', cs: 'c#', xml: 'xml', diff: 'diff', graphql: 'graphql', dockerfile: 'docker', docker: 'docker'
}

function blocco(type: string, corpo: Record<string, unknown>): Blocco {
  return { object: 'block', type, [type]: corpo }
}

/** Un blocco di testo; oltre i cento pezzi diventa più blocchi uguali di seguito. */
function diTesto(type: string, rich: RichText[], altro: Record<string, unknown> = {}): Blocco[] {
  if (!rich.length) return [blocco(type, { rich_text: [], ...altro })]
  const fuori: Blocco[] = []
  for (let i = 0; i < rich.length; i += PEZZI_PER_BLOCCO) fuori.push(blocco(type, { rich_text: rich.slice(i, i + PEZZI_PER_BLOCCO), ...altro }))
  return fuori
}

/**
 * Markdown → blocchi di Notion.
 *
 * Quello che un modello scrive davvero: titoli (oltre il terzo livello
 * restano al terzo), paragrafi, elenchi puntati e numerati, cose da fare
 * `- [ ]`, citazioni, separatori e codice fra tre apici. Un elenco rientrato
 * si appiattisce: meglio una riga in più al primo livello che una richiesta
 * annidata che Notion rifiuta. Pura.
 */
export function blocchi(markdown: string): Blocco[] {
  const righe = markdown.replace(/\r\n?/g, '\n').split('\n')
  const fuori: Blocco[] = []
  let paragrafo: string[] = []
  const chiudi = () => {
    if (paragrafo.length) fuori.push(...diTesto('paragraph', inRiga(paragrafo.join('\n'))))
    paragrafo = []
  }
  for (let i = 0; i < righe.length; i++) {
    const riga = righe[i]
    const recinto = /^\s*```\s*([\w+#-]*)\s*$/.exec(riga)
    if (recinto) {
      chiudi()
      const dentro: string[] = []
      while (++i < righe.length && !/^\s*```\s*$/.test(righe[i])) dentro.push(righe[i])
      const lingua = LINGUAGGI[recinto[1].toLowerCase()] ?? 'plain text'
      fuori.push(...diTesto('code', pezzi(dentro.join('\n'), {}), { language: lingua }))
      continue
    }
    if (!riga.trim()) { chiudi(); continue }
    let m: RegExpExecArray | null
    if ((m = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(riga))) {
      chiudi()
      fuori.push(...diTesto(`heading_${Math.min(3, m[1].length)}`, inRiga(m[2])))
    } else if (/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(riga)) {
      chiudi()
      fuori.push(blocco('divider', {}))
    } else if ((m = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(riga))) {
      chiudi()
      fuori.push(...diTesto('to_do', inRiga(m[2]), { checked: m[1] !== ' ' }))
    } else if ((m = /^\s*[-*+]\s+(.*)$/.exec(riga))) {
      chiudi()
      fuori.push(...diTesto('bulleted_list_item', inRiga(m[1])))
    } else if ((m = /^\s*\d{1,9}[.)]\s+(.*)$/.exec(riga))) {
      chiudi()
      fuori.push(...diTesto('numbered_list_item', inRiga(m[1])))
    } else if ((m = /^\s{0,3}>\s?(.*)$/.exec(riga))) {
      chiudi()
      fuori.push(...diTesto('quote', inRiga(m[1])))
    } else paragrafo.push(riga.trim())
  }
  chiudi()
  return fuori.slice(0, TETTO_BLOCCHI)
}

/** A pezzi da `n`: le richieste di Notion ne vogliono cento al massimo. */
export function aPezzi<T>(xs: readonly T[], n = PER_RICHIESTA): T[][] {
  const fuori: T[][] = []
  for (let i = 0; i < xs.length; i += n) fuori.push(xs.slice(i, i + n))
  return fuori
}

// — la pagina scelta —

export { stessoId }

/** La pagina dove Myynd scrive, se lui l'ha scelta. */
export function paginaMyynd(c: cfg.Config = cfg.leggi()): Pagina | null {
  const p = c.notion?.paginaMyynd
  return c.notion?.token && p?.id ? { id: p.id, titolo: p.titolo || '' } : null
}

/** La scrittura è accesa: Notion collegato e una pagina scelta. */
export function attiva(): boolean {
  try { return !!paginaMyynd() } catch { return false }
}

/**
 * Le pagine che si possono scegliere: quelle condivise con l'integrazione,
 * solo i titoli. Fuori quelle nel cestino e quelle scritte da Myynd (figlie
 * della pagina scelta adesso), che come casa di Myynd non hanno senso.
 */
export async function candidate(): Promise<Pagina[]> {
  const c = cfg.leggi()
  if (!c.notion?.token) throw new NonScrive('Notion non è collegato.')
  const notion = cliente(c.notion)
  const madre = c.notion.paginaMyynd?.id
  const fuori: Pagina[] = []
  let cursore: string | undefined
  // trecento bastano a scegliere: chi ne ha di più scrive il nome nella ricerca di Notion
  for (let giro = 0; giro < 3; giro++) {
    const r: any = await conCalma(() => notion.search({
      filter: { property: 'object', value: 'page' },
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
      start_cursor: cursore,
      page_size: 100
    }))
    for (const p of r.results as any[]) {
      if (p.object !== 'page' || p.archived || p.in_trash) continue
      if (madre && stessoId(p.parent?.page_id, madre)) continue
      fuori.push({ id: p.id, titolo: titoloDi(p) })
    }
    if (!r.has_more || !r.next_cursor) break
    cursore = r.next_cursor
  }
  return fuori
}

/**
 * Sceglie la pagina dove Myynd scrive, o la toglie (`null`).
 *
 * L'id deve essere di una pagina che Notion dà a questa integrazione, viva:
 * si chiede a Notion e si salva il titolo che dice lui, non quello che arriva
 * dalla richiesta.
 */
export async function scegli(id: string | null): Promise<Pagina | null> {
  const c = cfg.leggi()
  if (!c.notion?.token) throw new NonScrive('Notion non è collegato.')
  if (!id) {
    const { paginaMyynd: _via, ...resto } = c.notion
    cfg.aggiorna({ notion: resto })
    return null
  }
  if (typeof id !== 'string' || !/^[0-9a-f-]{32,36}$/i.test(id)) throw new NonScrive('Questa non è una pagina di Notion.')
  const notion = cliente(c.notion)
  let p: any
  try {
    p = await conCalma(() => notion.pages.retrieve({ page_id: id }))
  } catch (e) {
    if (nonTrovata(e)) throw new NonScrive('Notion non dà questa pagina a Myynd: condividila con l’integrazione.')
    throw e
  }
  if (p?.object !== 'page' || p.archived || p.in_trash) throw new NonScrive('Questa pagina è nel cestino di Notion.')
  const scelta = { id: p.id as string, titolo: titoloDi(p) }
  cfg.aggiorna({ notion: { ...c.notion, paginaMyynd: scelta } })
  return scelta
}

/**
 * Ricollegando Notion con un token nuovo, la pagina scelta resta solo se il
 * token nuovo la vede ancora, viva: un altro spazio di lavoro, o una pagina
 * non più condivisa, la toglie, e la scheda non mostra una scelta che non
 * vale più. Lo stesso token la tiene senza chiedere niente.
 */
export async function tienePagina(prima: cfg.ConfigNotion | undefined, token: string): Promise<Pagina | undefined> {
  const p = prima?.paginaMyynd
  if (!p?.id) return undefined
  if (prima?.token === token) return p
  try {
    const r: any = await conCalma(() => cliente({ token }).pages.retrieve({ page_id: p.id }))
    if (r?.object !== 'page' || r.archived || r.in_trash) return undefined
    return { id: r.id, titolo: titoloDi(r) }
  } catch {
    return undefined
  }
}

function nonTrovata(e: unknown): boolean {
  const x = e as { code?: unknown; status?: unknown } | null
  return x?.code === 'object_not_found' || x?.status === 404
}

// — la scrittura —

/** Una scrittura per chiave alla volta: due giri insieme farebbero due pagine. */
const inCorso = new Map<string, Promise<Scritta>>()

/**
 * La pagina che Myynd aveva scritto per questa chiave, se è ancora sua: figlia
 * della pagina scelta, e non nel cestino. Una pagina che non c'è più, o che
 * lui ha spostato altrove, non si tocca: se ne fa una nuova al posto giusto.
 */
async function ancoraSua(notion: Client, id: string, madre: string): Promise<{ url: string | null } | null> {
  let p: any
  try {
    p = await conCalma(() => notion.pages.retrieve({ page_id: id }))
  } catch (e) {
    if (nonTrovata(e)) return null
    throw e
  }
  if (!p || p.archived || p.in_trash) return null
  if (p.parent?.type !== 'page_id' || !stessoId(p.parent.page_id, madre)) return null
  return { url: p.url ?? null }
}

/** I blocchi di primo livello della pagina che si possono mettere nel cestino: mai pagine o database. */
async function blocchiVecchi(notion: Client, id: string): Promise<string[]> {
  const fuori: string[] = []
  let cursore: string | undefined
  do {
    const r: any = await conCalma(() => notion.blocks.children.list({ block_id: id, start_cursor: cursore, page_size: 100 }))
    for (const b of r.results as any[]) {
      if (b.type === 'child_page' || b.type === 'child_database') continue
      fuori.push(b.id)
    }
    cursore = r.has_more ? (r.next_cursor ?? undefined) : undefined
  } while (cursore)
  return fuori
}

/** Il titolo è testo e basta: niente Markdown dentro. */
function titoloNotion(t: string) {
  return { title: pezzi(t, {}) }
}

/**
 * Scrive (o riscrive) la pagina di Myynd per questa chiave.
 *
 * La prima volta crea una figlia della pagina scelta; le volte dopo riprende
 * la stessa, ne aggiorna il titolo e ne sostituisce il corpo: prima si
 * aggiunge il nuovo, poi si mettono nel cestino i blocchi vecchi, così un
 * guaio a metà lascia una pagina con troppo, mai una pagina vuota.
 *
 * Lancia `NonScrive` se la scrittura è spenta o la richiesta non va; un
 * guaio di Notion arriva com'è.
 */
export async function scrivi(o: { chiave: string; titolo: string; markdown: string }): Promise<Scritta> {
  vietato('notion.scrivi')
  const chiave = String(o.chiave ?? '').trim()
  if (!chiave || chiave.length > 200) throw new NonScrive('Serve una chiave per la pagina.')
  const di = `${chi.adesso() ?? ''}\u0000${chiave}`
  const gia = inCorso.get(di)
  // in fila dietro a quella di prima, che sia andata bene o no
  const lavoro = (gia ? gia.catch(() => null) : Promise.resolve(null)).then(() => scriviOra(chiave, o))
  inCorso.set(di, lavoro)
  try {
    const r = await lavoro
    // per «mentre non c'eri»: una pagina aggiornata è una cosa fatta, anche da un lavoro di fondo
    try { segnaPagina({ chiave, titolo: senzaTrattini(String(o.titolo ?? '').replace(/\s+/g, ' ').trim()).slice(0, 200) || chiave, url: r.url }) } catch { /* il conto è un di più */ }
    return r
  } finally { if (inCorso.get(di) === lavoro) inCorso.delete(di) }
}

async function scriviOra(chiave: string, o: { titolo: string; markdown: string }): Promise<Scritta> {
  const c = cfg.leggi()
  if (!c.notion?.token) throw new NonScrive('Notion non è collegato.')
  const madre = paginaMyynd(c)
  if (!madre) throw new NonScrive('Nessuna pagina di Notion scelta per Myynd.')
  const titolo = senzaTrattini(String(o.titolo ?? '').replace(/\s+/g, ' ').trim()).slice(0, 200) || chiave
  const corpo = blocchi(senzaTrattiniFuoriCodice(String(o.markdown ?? '')))
  const notion = cliente(c.notion)

  const prima = c.notionScritte?.[chiave] ?? null
  const sua = prima ? await ancoraSua(notion, prima, madre.id) : null

  if (!prima || !sua) {
    const [primi = [], ...resto] = aPezzi(corpo)
    const p: any = await conCalma(() => notion.pages.create({
      parent: { page_id: madre.id },
      properties: { title: titoloNotion(titolo) },
      ...(primi.length ? { children: primi } : {})
    } as any))
    // ricordata subito: se un pezzo dopo non passa, il giro dopo la riscrive invece di farne un'altra
    ricorda(chiave, p.id)
    for (const pezzo of resto) await conCalma(() => notion.blocks.children.append({ block_id: p.id, children: pezzo } as any))
    return { id: p.id, url: p.url ?? null, creata: true, blocchi: corpo.length }
  }

  await conCalma(() => notion.pages.update({ page_id: prima, properties: { title: titoloNotion(titolo) } } as any))
  const vecchi = await blocchiVecchi(notion, prima)
  for (const pezzo of aPezzi(corpo)) await conCalma(() => notion.blocks.children.append({ block_id: prima, children: pezzo } as any))
  // nel cestino di Notion, da dove si riprendono: mai una pagina, mai fuori da questa
  for (const id of vecchi) await conCalma(() => notion.blocks.delete({ block_id: id }))
  return { id: prima, url: sua.url, creata: false, blocchi: corpo.length }
}

/** Ricorda la pagina della chiave, per questo conto. */
function ricorda(chiave: string, id: string) {
  const c = cfg.leggi()
  cfg.aggiorna({ notionScritte: { ...(c.notionScritte ?? {}), [chiave]: id } })
}
