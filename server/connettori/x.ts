// X: quello che il suo agente ha pubblicato, le bozze che aspettano il suo sì, e le note dello stratega.
//
// Tobia ha un motore che scrive su X per lui: sta in `~/x-engine` e tiene
// tutto in un SQLite — i post usciti con i loro numeri, le bozze in attesa di
// approvazione, quello che lo stratega ha concluso dopo ogni giro, e il conto
// dei follower. È lavoro suo, fatto da un programma suo, e Myynd non ne
// sapeva niente: «a che punto è X?» non aveva risposta.
//
// **Si legge e basta.** Il database è dell'altro programma, che ci scrive
// mentre gira: si apre in sola lettura, e un PRAGMA lo ribadisce. Niente si
// cambia, niente si crea — se il file non c'è, si dice, non si fa nascere un
// database vuoto al suo posto.
//
// **Tre tipi di documento.** Un post pubblicato, con il link; una nota di
// strategia, così com'è; e un riepilogo per settimana: quanti post e quante
// risposte, i follower guadagnati o persi, i tre post più visti con i loro
// numeri. Novanta giorni per i post, tutte le note: sono poche e sono la
// testa del motore.
//
// **Le bozze non entrano, e i numeri stanno solo nel riepilogo.** Il primo
// giorno le bozze in attesa erano documenti, e il conto dei documenti in
// prima pagina è passato da settecento a quattrocentottanta in una mattina:
// il motore ne scrive a lotti e le annulla a lotti, e ogni giro le toglieva
// dall'indice. Una coda di un altro programma non è un documento. E i numeri
// di un post — visualizzazioni, mi piace — cambiano a ogni giro: messi nel
// corpo facevano risultare «cambiati» venti post ogni dieci minuti, e ogni
// volta partiva la lettura del feed con il modello. Si contano le bozze,
// per il registro, ma non si indicizzano; i numeri vivono nel riepilogo.
//
// **I post sono suoi, non arrivati.** Un post pubblicato è `inviato`, come
// la posta che ha scritto lei: entra nell'indice ma non è una novità da
// raccontare in prima pagina.

import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Documento } from '../store.ts'
import { lingua, type ConfigX } from '../config.ts'

/** Post e bozze più vecchi di così non entrano: il quadro guarda novanta giorni. */
export const GIORNI = 90
const TITOLO_MAX = 80
/** Nessuna tabella di questo motore arriva a tanto; è un tetto contro un database che non è il suo. */
const TETTO = 5000

/** Dove il motore tiene il suo database, sul Mac di chi lo fa girare. */
export function percorsoPredefinito(): string {
  return join(homedir(), 'x-engine', 'data', 'engine.db')
}

/** C'è un motore di X su questo computer: è quello che fa accendere la fonte da sola. */
export function possibile(): boolean {
  return existsSync(percorsoPredefinito())
}

type Post = {
  id: number; posted_at: string; url: string | null; kind: string | null; body: string | null
  likes: number | null; reposts: number | null; replies: number | null; views: number | null
}
type Bozza = {
  id: number; created_at: string; kind: string | null; body: string | null; status: string | null
  target_author: string | null; target_url: string | null; scheduled_for: string | null
}
type Nota = { id: number; created_at: string; note: string | null }
type Conto = { checked_at: string; followers: number | null }

function apri(percorso: string): DatabaseSync {
  if (!existsSync(percorso)) throw new Error('Non trovo il database di X su questo computer.')
  try {
    const db = new DatabaseSync(percorso, { readOnly: true })
    db.exec('PRAGMA query_only = 1')
    return db
  } catch {
    throw new Error('Non riesco ad aprire il database di X.')
  }
}

function righe<T>(db: DatabaseSync, sql: string, parametri: (string | number)[] = []): T[] {
  try {
    return db.prepare(sql).all(...parametri) as unknown as T[]
  } catch {
    throw new Error('Non riesco a leggere il database di X.')
  }
}

const numero = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0)

/**
 * Il motore scrive le date in ISO con sei decimali e `+00:00`: JavaScript ne
 * legge tre. Si tagliano, e una data che non si legge resta nulla.
 */
export function istante(s: unknown): string | null {
  if (typeof s !== 'string' || !s.trim()) return null
  const d = new Date(s.trim().replace(/(\.\d{3})\d+/, '$1'))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function accorcia(s: string, n: number): string {
  if (s.length <= n) return s
  const taglio = s.slice(0, n)
  const spazio = taglio.lastIndexOf(' ')
  return `${spazio > n / 2 ? taglio.slice(0, spazio) : taglio}…`
}

/** La prima riga del testo, corta abbastanza da fare da titolo. */
function titoloDi(testo: string): string {
  const prima = testo.split('\n').map(r => r.trim()).find(Boolean) ?? ''
  return accorcia(prima, TITOLO_MAX)
}

// — le settimane —

/** La settimana ISO di una data, `2026-38`: quella che finisce nell'id del riepilogo. */
export function settimana(iso: string): string {
  const d = new Date(iso)
  // al giovedì della stessa settimana: è lui che decide l'anno ISO
  const giovedi = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const giorno = giovedi.getUTCDay() || 7
  giovedi.setUTCDate(giovedi.getUTCDate() + 4 - giorno)
  const primo = new Date(Date.UTC(giovedi.getUTCFullYear(), 0, 1))
  const n = Math.ceil(((giovedi.getTime() - primo.getTime()) / 86_400_000 + 1) / 7)
  return `${giovedi.getUTCFullYear()}-${String(n).padStart(2, '0')}`
}

/** Il lunedì alle 00:00 UTC della settimana di questa data. */
function lunedi(iso: string): number {
  const d = new Date(iso)
  const giorno = d.getUTCDay() || 7
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - (giorno - 1))
}

// — i documenti —

function documentoPost(p: Post, it: boolean): Documento | null {
  const corpo = (p.body ?? '').trim()
  const quando = istante(p.posted_at)
  if (!corpo || !quando) return null
  const cosa = p.kind === 'reply' ? (it ? 'Risposta pubblicata su X' : 'Reply published on X') : (it ? 'Post pubblicato su X' : 'Post published on X')
  return {
    id: `x:posted:${p.id}`,
    fonte: 'x',
    tipo: 'post',
    titolo: titoloDi(corpo),
    corpo: `${corpo}\n\n${cosa}.${p.url ? `\n${p.url}` : ''}`,
    autore: null,
    percorso: p.url || null,
    quando,
    gruppo: 'note',
    inviato: true
  }
}

function documentoBozza(b: Bozza, it: boolean): Documento | null {
  const corpo = (b.body ?? '').trim()
  const quando = istante(b.created_at)
  if (!corpo || !quando) return null
  const stato = b.status === 'approved'
    ? (it ? 'Bozza approvata, in coda per uscire' : 'Approved draft, queued to go out')
    : (it ? 'Bozza in attesa del tuo sì' : 'Draft waiting for your approval')
  const a = b.kind === 'reply' && b.target_author ? ` · ${it ? 'risposta a' : 'reply to'} ${b.target_author}` : ''
  const prevista = istante(b.scheduled_for)
  const quandoEsce = prevista ? ` · ${it ? 'prevista per il' : 'scheduled for'} ${prevista.slice(0, 16).replace('T', ' ')}` : ''
  return {
    id: `x:draft:${b.id}`,
    fonte: 'x',
    tipo: 'bozza',
    titolo: `${it ? 'Bozza per X' : 'Draft for X'}: ${titoloDi(corpo)}`,
    corpo: `${corpo}\n\n${stato}${a}${quandoEsce}${b.target_url ? `\n${b.target_url}` : ''}`,
    autore: null,
    percorso: b.target_url || null,
    quando,
    gruppo: 'note'
  }
}

function documentoNota(n: Nota, it: boolean): Documento | null {
  const corpo = (n.note ?? '').trim()
  const quando = istante(n.created_at)
  if (!corpo || !quando) return null
  return {
    id: `x:nota:${n.id}`,
    fonte: 'x',
    tipo: 'nota',
    titolo: `${it ? 'Strategia X' : 'X strategy'}: ${titoloDi(corpo)}`,
    corpo,
    autore: null,
    percorso: null,
    quando,
    gruppo: 'note'
  }
}

/**
 * Una settimana di X in un documento: quanti post, come vanno i follower, i
 * tre più visti. È la riga che risponde a «come sta andando X», che nessun
 * post da solo può dare. La data è l'ultima cosa successa nella settimana,
 * non la sua fine: un riepilogo datato domenica prossima sarebbe nel futuro.
 */
function documentoSettimana(chiave: string, post: Post[], conti: Conto[], it: boolean, adesso = Date.now()): Documento | null {
  const validi = post.filter(p => istante(p.posted_at))
  if (!validi.length) return null
  const inizio = lunedi(istante(validi[0]!.posted_at)!)
  const fine = inizio + 7 * 86_400_000
  // la settimana in corso non ha ancora i suoi numeri: le visualizzazioni
  // salgono di ora in ora e i follower pure, e un riepilogo che li porta
  // risulta «cambiato» a ogni giro. Fino a domenica, solo il conto dei post;
  // chiusa la settimana, tutto.
  const chiusa = fine <= adesso
  const nPost = validi.filter(p => p.kind !== 'reply').length
  const nRisposte = validi.length - nPost
  const ultimo = validi.map(p => istante(p.posted_at)!).sort().at(-1)!

  // i follower: l'ultimo conto della settimana contro l'ultimo di prima
  const contiValidi = conti
    .map(c => ({ t: Date.parse(istante(c.checked_at) ?? ''), n: c.followers }))
    .filter(c => Number.isFinite(c.t) && typeof c.n === 'number')
    .sort((a, b) => a.t - b.t)
  const dentro = contiValidi.filter(c => c.t >= inizio && c.t < fine)
  const prima = contiValidi.filter(c => c.t < inizio).at(-1) ?? dentro[0]
  const dopo = dentro.at(-1)
  let follower = ''
  if (dopo && prima) {
    const delta = dopo.n! - prima.n!
    follower = it
      ? `Follower: ${dopo.n} (${delta >= 0 ? '+' : ''}${delta} nella settimana)`
      : `Followers: ${dopo.n} (${delta >= 0 ? '+' : ''}${delta} this week)`
  }

  const top = [...validi].sort((a, b) => numero(b.views) - numero(a.views)).slice(0, 3)
    .map((p, i) => `${i + 1}. ${numero(p.views)} ${it ? 'visualizzazioni' : 'views'} · ${titoloDi((p.body ?? '').trim())}${p.url ? ` · ${p.url}` : ''}`)

  const [anno, n] = chiave.split('-')
  const righeCorpo = [
    it ? `${nPost} post e ${nRisposte} risposte pubblicate su X.` : `${nPost} posts and ${nRisposte} replies published on X.`,
    chiusa ? follower : (it ? 'Settimana in corso: i numeri arrivano a settimana chiusa.' : 'Week in progress: the numbers come once the week is over.'),
    chiusa && top.length ? `${it ? 'I più visti' : 'Most viewed'}:\n${top.join('\n')}` : ''
  ].filter(Boolean)
  return {
    id: `x:settimana:${chiave}`,
    fonte: 'x',
    tipo: 'riepilogo',
    titolo: it ? `X, settimana ${Number(n)} del ${anno}` : `X, week ${Number(n)} of ${anno}`,
    corpo: righeCorpo.join('\n\n'),
    autore: null,
    percorso: null,
    quando: ultimo,
    gruppo: 'note'
  }
}

// — leggere —

export type EsitoX = { docs: Documento[]; post: number; bozze: number; note: number; settimane: number }

export function leggi(cfg: ConfigX, adesso = Date.now(), giorni = GIORNI): EsitoX {
  const db = apri(cfg.db)
  const it = lingua() === 'it'
  try {
    const da = new Date(adesso - giorni * 86_400_000).toISOString()
    const post = righe<Post>(db,
      'SELECT id, posted_at, url, kind, body, likes, reposts, replies, views FROM posted WHERE posted_at >= ? ORDER BY posted_at LIMIT ?', [da, TETTO])
    const bozze = righe<Bozza>(db,
      "SELECT id, created_at, kind, body, status, target_author, target_url, scheduled_for FROM drafts WHERE status IN ('pending', 'approved') AND created_at >= ? ORDER BY created_at LIMIT ?", [da, TETTO])
    const note = righe<Nota>(db, 'SELECT id, created_at, note FROM strategy_notes ORDER BY created_at LIMIT ?', [TETTO])
    const conti = righe<Conto>(db, 'SELECT checked_at, followers FROM follower_log ORDER BY checked_at LIMIT ?', [TETTO])

    const docs: Documento[] = []
    const esito: EsitoX = { docs, post: 0, bozze: 0, note: 0, settimane: 0 }
    for (const p of post) { const d = documentoPost(p, it); if (d) { docs.push(d); esito.post++ } }
    // le bozze si contano e basta: vedi in testa
    for (const b of bozze) { if (documentoBozza(b, it)) esito.bozze++ }
    for (const n of note) { const d = documentoNota(n, it); if (d) { docs.push(d); esito.note++ } }

    const perSettimana = new Map<string, Post[]>()
    for (const p of post) {
      const q = istante(p.posted_at)
      if (!q) continue
      const k = settimana(q)
      perSettimana.set(k, [...(perSettimana.get(k) ?? []), p])
    }
    for (const [k, suoi] of perSettimana) {
      const d = documentoSettimana(k, suoi, conti, it, adesso)
      if (d) { docs.push(d); esito.settimane++ }
    }
    return esito
  } finally {
    db.close()
  }
}

export async function sincronizza(cfg: ConfigX): Promise<EsitoX> {
  return leggi(cfg)
}
