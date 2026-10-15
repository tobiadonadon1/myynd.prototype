// X: quello che ha pubblicato, quello che gli è piaciuto, la sua timeline, e le note dello stratega.
//
// Tobia ha un motore che scrive su X per lui: sta in `~/x-engine` e tiene
// tutto in un SQLite — i post usciti con i loro numeri, le bozze in attesa di
// approvazione, quello che lo stratega ha concluso dopo ogni giro, il conto
// dei follower, i mi piace messi dal suo account e quello che passa nella sua
// timeline. È lavoro suo, fatto da un programma suo, e Myynd non ne sapeva
// niente: «a che punto è X?» non aveva risposta.
//
// **Si legge e basta.** Il database è dell'altro programma, che ci scrive
// mentre gira: si apre in sola lettura, e un PRAGMA lo ribadisce. Niente si
// cambia, niente si crea — se il file non c'è, si dice, non si fa nascere un
// database vuoto al suo posto. E niente API di X: costa, e Tobia non la vuole.
//
// **Cinque tipi di documento.** Un suo post (`x:mio:<id del post>`), con il
// link e, quando i numeri si sono fermati, i numeri; un mi piace
// (`x:like:<id del post>`), con il testo se il motore l'ha visto passare; un
// giorno di timeline (`x:timeline:<AAAA-MM-GG>`) in un documento solo; una
// nota di strategia; e un riepilogo per settimana. Gli id dei primi tre sono
// quelli di X, non le righe del motore: un secondo lettore (il browser dentro
// Myynd, più avanti) scrive gli stessi documenti con gli stessi id, e
// `documentoMio`, `documentoLike` e `documentoTimeline` sono la forma che
// tutti e due usano.
//
// **Le bozze non entrano, e i numeri entrano solo fermi.** Il primo giorno le
// bozze in attesa erano documenti, e il conto dei documenti in prima pagina è
// passato da settecento a quattrocentottanta in una mattina: il motore ne
// scrive a lotti e le annulla a lotti. Una coda di un altro programma non è
// un documento. E i numeri di un post cambiano a ogni giro: messi nel corpo
// subito facevano risultare «cambiati» venti post ogni dieci minuti, e ogni
// volta partiva la lettura del feed con il modello. Il motore smette di
// rileggerli dopo tre giorni: dal quarto i numeri sono quelli, ed entrano.
// Per la stessa ragione la timeline entra solo a giorno chiuso.
//
// **I post sono suoi, non arrivati.** Un post pubblicato è `inviato`, come
// la posta che ha scritto lei: entra nell'indice ma non è una novità da
// raccontare in prima pagina. Così i mi piace, e la timeline: è contesto, non
// qualcosa che gli è arrivato.
//
// **Un motore fermo è un guaio.** Il motore può girare e non scrivere niente
// (il 15 ottobre il lettore del feed falliva da settimane, e il file del
// database cambiava lo stesso, per i registri). Conta l'ultima cosa vera che
// ha scritto: un post, un mi piace, un post visto, una nota. Più di tre giorni
// fa, e la fonte lo dice fra quelle da sistemare.

import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import * as store from '../store.ts'
import type { Documento } from '../store.ts'
import { lingua, type ConfigX } from '../config.ts'
import { GuaioFonte } from './guaio.ts'

/** Post e bozze più vecchi di così non entrano: il quadro guarda novanta giorni. */
export const GIORNI = 90
/** I mi piace: un mese basta a dire cosa gli interessa adesso. */
export const GIORNI_MIPIACE = 30
/** La timeline: due settimane, un documento per giorno. */
export const GIORNI_TIMELINE = 14
/** Il motore rilegge i numeri di un post per tre giorni; dal quarto sono fermi. */
export const GIORNI_ASSESTATO = 4
/** Oltre questi giorni senza niente di nuovo nel database, il motore è fermo. */
export const GIORNI_FERMO = 3
/** Dove si ricorda l'ultima cosa scritta dal motore, se è fermo: la scheda la dice. */
export const CURSORE_FERMO = 'x:fermo'
const TITOLO_MAX = 80
/** Nessuna tabella di questo motore arriva a tanto; è un tetto contro un database che non è il suo. */
const TETTO = 5000
/** I mi piace in indice, al massimo, da chiunque arrivino: `riconcilia` toglie i più vecchi oltre il tetto. */
export const TETTO_MIPIACE = 200
/** In un giorno di timeline: chi compare di più, e i post più ripresi. */
const AUTORI_GIORNO = 8
const POST_GIORNO = 8

/** Dove il motore tiene il suo database, sul Mac di chi lo fa girare. */
export function percorsoPredefinito(): string {
  return join(homedir(), 'x-engine', 'data', 'engine.db')
}

/** C'è un motore di X su questo computer: è quello che fa accendere la fonte da sola. */
export function possibile(): boolean {
  return existsSync(percorsoPredefinito())
}

type Post = {
  id: number; posted_at: string; tweet_id: string | null; url: string | null; kind: string | null; body: string | null
  likes: number | null; reposts: number | null; replies: number | null; bookmarks: number | null; views: number | null
}
type Bozza = {
  id: number; created_at: string; kind: string | null; body: string | null; status: string | null
  target_author: string | null; target_url: string | null; scheduled_for: string | null
}
type Nota = { id: number; created_at: string; note: string | null }
type Conto = { checked_at: string; followers: number | null }
type MiPiace = { tweet_id: string; liked_at: string | null; why: string | null }
type Impegno = { at: string; url: string; author: string | null }
type Visto = {
  seen_at: string; author: string | null; tweet_id: string | null; body: string | null
  replies: number | null; reposts: number | null; likes: number | null; views: number | null
}

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

/** Le tabelle che ci sono: un motore più vecchio non ha i mi piace né la timeline, e non è un guaio. */
function tabelle(db: DatabaseSync): Set<string> {
  return new Set(righe<{ name: string }>(db, "SELECT name FROM sqlite_master WHERE type = 'table'").map(r => r.name))
}

const numero = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0)

/**
 * Il motore scrive le date in ISO con sei decimali e `+00:00`: JavaScript ne
 * legge tre. Si tagliano. Qualche tabella ha invece la data di SQLite
 * («2026-09-15 17:29:52», senza fuso): è UTC, e si dice. Una data che non si
 * legge resta nulla.
 */
export function istante(s: unknown): string | null {
  if (typeof s !== 'string' || !s.trim()) return null
  let v = s.trim().replace(/(\.\d{3})\d+/, '$1')
  if (/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d(:\d\d(\.\d+)?)?$/.test(v)) v = `${v.replace(' ', 'T')}Z`
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function accorcia(s: string, n: number): string {
  if (s.length <= n) return s
  const taglio = s.slice(0, n)
  const spazio = taglio.lastIndexOf(' ')
  return `${spazio > n / 2 ? taglio.slice(0, spazio) : taglio}…`
}

/** La prima riga del testo, corta abbastanza da fare da titolo. */
function titoloDi(testo: string, n = TITOLO_MAX): string {
  const prima = testo.split('\n').map(r => r.trim()).find(Boolean) ?? ''
  return accorcia(prima, n)
}

/** L'id di un post di X: solo cifre. Un segnaposto del motore («browser:12») non lo è. */
export function idPost(x: unknown): string | null {
  return typeof x === 'string' && /^\d{1,25}$/.test(x.trim()) ? x.trim() : null
}

/** L'id del post dentro un link `…/status/<id>`. */
export function idDaLink(url: unknown): string | null {
  const m = typeof url === 'string' ? /\/status(?:es)?\/(\d{1,25})/.exec(url) : null
  return m ? m[1]! : null
}

const maniglia = (x: unknown): string | null => {
  const m = typeof x === 'string' ? /@?([A-Za-z0-9_]{1,30})/.exec(x.trim()) : null
  return m ? m[1]! : null
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

// — i numeri di un post —

export type Numeri = { visualizzazioni: number; mipiace: number; repost: number; risposte: number; segnalibri: number }

/**
 * La riga dei numeri, sempre nello stesso ordine: visualizzazioni, mi piace,
 * repost, risposte, segnalibri. La scrive chiunque scriva un post (vedi in
 * testa), e `numeriDa` la rilegge in tutte e due le lingue.
 */
export function rigaNumeri(n: Numeri, it = lingua() === 'it'): string {
  return it
    ? `Numeri: ${n.visualizzazioni} visualizzazioni · ${n.mipiace} mi piace · ${n.repost} repost · ${n.risposte} risposte · ${n.segnalibri} segnalibri`
    : `Numbers: ${n.visualizzazioni} views · ${n.mipiace} likes · ${n.repost} reposts · ${n.risposte} replies · ${n.segnalibri} bookmarks`
}

/** I numeri scritti da `rigaNumeri` dentro il corpo di un post, o niente. */
export function numeriDa(corpo: string): Numeri | null {
  const riga = corpo.split('\n').find(r => /^(?:Numeri|Numbers): \d/.test(r))
  const c = riga?.match(/\d+/g)?.map(Number)
  if (!c || c.length !== 5) return null
  return { visualizzazioni: c[0]!, mipiace: c[1]!, repost: c[2]!, risposte: c[3]!, segnalibri: c[4]! }
}

// — i documenti —

/** Un suo post, da chiunque arrivi: il motore, o più avanti il browser dentro Myynd. */
export type PostMio = { postId: string; testo: string; url: string | null; risposta: boolean; quando: string; numeri: Numeri | null }

/**
 * Il documento di un suo post. Il corpo è il testo, una riga vuota, e la
 * coda: che cos'è, i numeri se sono fermi, il link. `recenti` lo rilegge
 * così, e la coda non ha mai righe vuote.
 */
export function documentoMio(p: PostMio, it = lingua() === 'it'): Documento | null {
  const testo = p.testo.trim()
  const postId = idPost(p.postId)
  const quando = istante(p.quando)
  if (!testo || !postId || !quando) return null
  const cosa = p.risposta ? (it ? 'Risposta pubblicata su X' : 'Reply published on X') : (it ? 'Post pubblicato su X' : 'Post published on X')
  const coda = [`${cosa}.`, p.numeri ? rigaNumeri(p.numeri, it) : '', p.url ?? ''].filter(Boolean).join('\n')
  return {
    id: `x:mio:${postId}`,
    fonte: 'x',
    tipo: p.risposta ? 'risposta' : 'post',
    titolo: titoloDi(testo),
    corpo: `${testo}\n\n${coda}`,
    autore: null,
    percorso: p.url || null,
    quando,
    gruppo: 'note',
    inviato: true
  }
}

function postDelMotore(p: Post, it: boolean, adesso: number): Documento | null {
  const postId = idPost(p.tweet_id) ?? idDaLink(p.url)
  const quando = istante(p.posted_at)
  if (!postId || !quando) return null
  const fermi = Date.parse(quando) <= adesso - GIORNI_ASSESTATO * 86_400_000
  return documentoMio({
    postId, testo: p.body ?? '', url: p.url, risposta: p.kind === 'reply', quando,
    numeri: fermi ? { visualizzazioni: numero(p.views), mipiace: numero(p.likes), repost: numero(p.reposts), risposte: numero(p.replies), segnalibri: numero(p.bookmarks) } : null
  }, it)
}

/** Un post che gli è piaciuto: di chi, quando, e il testo se qualcuno l'ha visto passare. */
export type Like = { postId: string; autore: string | null; testo: string | null; url: string | null; quando: string }

export function documentoLike(l: Like, it = lingua() === 'it'): Documento | null {
  const postId = idPost(l.postId)
  const quando = istante(l.quando)
  if (!postId || !quando) return null
  const autore = maniglia(l.autore)
  const url = l.url || (autore ? `https://x.com/${autore}/status/${postId}` : `https://x.com/i/status/${postId}`)
  const testo = (l.testo ?? '').trim()
  const di = autore ? `@${autore}` : (it ? 'qualcuno' : 'someone')
  const cosa = it ? `Ti è piaciuto un post di ${di} su X.` : `You liked a post by ${di} on X.`
  return {
    id: `x:like:${postId}`,
    fonte: 'x',
    tipo: 'mipiace',
    titolo: testo ? `${autore ? `@${autore}: ` : ''}${titoloDi(testo)}` : (it ? `Mi piace su X: un post di ${di}` : `Liked on X: a post by ${di}`),
    corpo: `${testo ? `${testo}\n\n` : ''}${cosa}\n${url}`,
    autore: autore ? `@${autore}` : null,
    percorso: url,
    quando,
    gruppo: 'note',
    inviato: true
  }
}

/** Un post visto passare nella timeline. */
export type PostVisto = { postId: string | null; autore: string | null; testo: string; quando: string; mipiace: number; repost: number; risposte: number; visualizzazioni: number }

const ripresa = (p: PostVisto) => p.mipiace + p.repost * 2 + p.risposte * 3

function giornoBreve(giorno: string, it: boolean): string {
  return new Date(`${giorno}T12:00:00Z`).toLocaleDateString(it ? 'it-IT' : 'en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/**
 * Un giorno di timeline in un documento: quanti post e da quanti autori, chi
 * è comparso di più, i più ripresi con il link. Millequattrocento post non
 * sono millequattrocento documenti: sono il clima di un giorno.
 */
export function documentoTimeline(giorno: string, visti: PostVisto[], it = lingua() === 'it'): Documento | null {
  if (!/^\d{4}-\d\d-\d\d$/.test(giorno)) return null
  const validi = visti.filter(v => v.testo.trim() && istante(v.quando))
  if (!validi.length) return null
  const perAutore = new Map<string, number>()
  for (const v of validi) {
    const a = maniglia(v.autore)
    if (a) perAutore.set(a, (perAutore.get(a) ?? 0) + 1)
  }
  const autori = [...perAutore].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, AUTORI_GIORNO)
  const top = [...validi].sort((a, b) => ripresa(b) - ripresa(a)).slice(0, POST_GIORNO).map((v, i) => {
    const a = maniglia(v.autore)
    const link = v.postId ? ` · https://x.com/${a ?? 'i'}/status/${v.postId}` : ''
    const numeri = it ? `${v.mipiace} mi piace · ${v.risposte} risposte` : `${v.mipiace} likes · ${v.risposte} replies`
    return `${i + 1}. ${a ? `@${a}` : '?'} · ${numeri} · ${titoloDi(v.testo.trim(), 140)}${link}`
  })
  const ultimo = validi.map(v => istante(v.quando)!).sort().at(-1)!
  const corpo = [
    it ? `${validi.length} post visti nella tua timeline, da ${perAutore.size} autori.` : `${validi.length} posts seen in your timeline, from ${perAutore.size} authors.`,
    autori.length ? `${it ? 'Chi è comparso di più' : 'Showed up most'}: ${autori.map(([a, n]) => `@${a} (${n})`).join(', ')}` : '',
    `${it ? 'I più ripresi' : 'Most engaged'}:\n${top.join('\n')}`
  ].filter(Boolean).join('\n\n')
  return {
    id: `x:timeline:${giorno}`,
    fonte: 'x',
    tipo: 'riepilogo',
    titolo: it ? `X, la tua timeline del ${giornoBreve(giorno, it)}` : `X, your timeline on ${giornoBreve(giorno, it)}`,
    corpo,
    autore: null,
    percorso: null,
    quando: ultimo,
    gruppo: 'note',
    inviato: true
  }
}

function documentoBozza(b: Bozza): boolean {
  return !!(b.body ?? '').trim() && !!istante(b.created_at)
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

export type EsitoX = {
  docs: Documento[]; post: number; bozze: number; note: number; settimane: number; mipiace: number; timeline: number
  /** L'ultima cosa vera scritta dal motore, se è più vecchia di `GIORNI_FERMO`: il motore è fermo. */
  fermoDal: string | null
}

/** L'ultima volta che il motore ha scritto qualcosa di suo: un post, un mi piace, un post visto, una nota. */
function ultimaScrittura(db: DatabaseSync, ci: Set<string>): string | null {
  const colonne: [string, string][] = [['posted', 'posted_at'], ['feed_posts', 'seen_at'], ['likes', 'liked_at'], ['engagement', 'at'], ['strategy_notes', 'created_at']]
  let ultima: string | null = null
  for (const [t, c] of colonne) {
    if (!ci.has(t)) continue
    for (const r of righe<{ q: string | null }>(db, `SELECT ${c} AS q FROM ${t} WHERE ${c} IS NOT NULL ORDER BY ${c} DESC LIMIT 3`)) {
      const q = istante(r.q)
      if (q && (!ultima || q > ultima)) ultima = q
    }
  }
  return ultima
}

export function leggi(cfg: ConfigX, adesso = Date.now(), giorni = GIORNI): EsitoX {
  const db = apri(cfg.db)
  const it = lingua() === 'it'
  try {
    const ci = tabelle(db)
    const da = new Date(adesso - giorni * 86_400_000).toISOString()
    const post = righe<Post>(db,
      'SELECT id, posted_at, tweet_id, url, kind, body, likes, reposts, replies, bookmarks, views FROM posted WHERE posted_at >= ? ORDER BY posted_at LIMIT ?', [da, TETTO])
    const bozze = righe<Bozza>(db,
      "SELECT id, created_at, kind, body, status, target_author, target_url, scheduled_for FROM drafts WHERE status IN ('pending', 'approved') AND created_at >= ? ORDER BY created_at LIMIT ?", [da, TETTO])
    const note = righe<Nota>(db, 'SELECT id, created_at, note FROM strategy_notes ORDER BY created_at LIMIT ?', [TETTO])
    const conti = righe<Conto>(db, 'SELECT checked_at, followers FROM follower_log ORDER BY checked_at LIMIT ?', [TETTO])

    const docs: Documento[] = []
    const esito: EsitoX = { docs, post: 0, bozze: 0, note: 0, settimane: 0, mipiace: 0, timeline: 0, fermoDal: null }
    for (const p of post) { const d = postDelMotore(p, it, adesso); if (d) { docs.push(d); esito.post++ } }
    // le bozze si contano e basta: vedi in testa
    for (const b of bozze) { if (documentoBozza(b)) esito.bozze++ }
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

    // la timeline, prima dei mi piace: è lì che il testo di un post piaciuto si trova
    const testi = new Map<string, { autore: string | null; testo: string }>()
    if (ci.has('feed_posts')) {
      const daT = new Date(adesso - GIORNI_TIMELINE * 86_400_000).toISOString()
      const visti = righe<Visto>(db,
        'SELECT seen_at, author, tweet_id, body, replies, reposts, likes, views FROM feed_posts WHERE seen_at >= ? ORDER BY seen_at LIMIT ?', [daT, TETTO])
      // solo i giorni chiusi: quello di oggi cresce a ogni sessione di lettura
      const oggi = new Date(adesso).toISOString().slice(0, 10)
      const perGiorno = new Map<string, PostVisto[]>()
      for (const v of visti) {
        const q = istante(v.seen_at)
        const postId = idPost(v.tweet_id)
        if (postId && v.body) testi.set(postId, { autore: v.author, testo: v.body })
        if (!q || q.slice(0, 10) >= oggi) continue
        const g = q.slice(0, 10)
        perGiorno.set(g, [...(perGiorno.get(g) ?? []), {
          postId, autore: v.author, testo: v.body ?? '', quando: q,
          mipiace: numero(v.likes), repost: numero(v.reposts), risposte: numero(v.replies), visualizzazioni: numero(v.views)
        }])
      }
      for (const [g, suoi] of perGiorno) {
        const d = documentoTimeline(g, suoi, it)
        if (d) { docs.push(d); esito.timeline++ }
      }
    }

    // i mi piace: quelli del motore di risposta (`likes`) e quelli del giro di impegno (`engagement`)
    const daM = new Date(adesso - GIORNI_MIPIACE * 86_400_000).toISOString()
    const piaciuti = new Map<string, Like>()
    const metti = (l: Like) => {
      const q = istante(l.quando)
      if (!q || q < daM) return
      const prima = piaciuti.get(l.postId)
      if (!prima || q > (istante(prima.quando) ?? '')) piaciuti.set(l.postId, { ...l, autore: l.autore ?? prima?.autore ?? null, url: l.url ?? prima?.url ?? null, quando: q })
    }
    if (ci.has('likes')) {
      for (const r of righe<MiPiace>(db, 'SELECT tweet_id, liked_at, why FROM likes ORDER BY liked_at DESC LIMIT ?', [TETTO])) {
        const postId = idPost(r.tweet_id)
        if (!postId || !r.liked_at) continue
        metti({ postId, autore: /@([A-Za-z0-9_]{1,30})/.exec(r.why ?? '')?.[1] ?? null, testo: null, url: null, quando: r.liked_at })
      }
    }
    if (ci.has('engagement')) {
      for (const r of righe<Impegno>(db, "SELECT at, url, author FROM engagement WHERE kind = 'like' ORDER BY at DESC LIMIT ?", [TETTO])) {
        const postId = idDaLink(r.url)
        if (postId) metti({ postId, autore: r.author, testo: null, url: r.url, quando: r.at })
      }
    }
    // il testo, se qualcuno l'ha visto: la timeline, o i post studiati dallo stratega
    const studiati = new Map<string, { autore: string | null; testo: string }>()
    if (ci.has('scraped')) {
      for (const r of righe<{ url: string | null; author: string | null; text: string | null }>(db, 'SELECT url, author, text FROM scraped ORDER BY scraped_at DESC LIMIT ?', [TETTO])) {
        const postId = idDaLink(r.url)
        if (postId && r.text) studiati.set(postId, { autore: r.author, testo: r.text })
      }
    }
    const ultimi = [...piaciuti.values()].sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, TETTO_MIPIACE)
    for (const l of ultimi) {
      const visto = testi.get(l.postId) ?? studiati.get(l.postId)
      const d = documentoLike({ ...l, testo: visto?.testo ?? null, autore: l.autore ?? visto?.autore ?? null }, it)
      if (d) { docs.push(d); esito.mipiace++ }
    }

    const ultima = ultimaScrittura(db, ci)
    if (ultima && Date.parse(ultima) < adesso - GIORNI_FERMO * 86_400_000) esito.fermoDal = ultima
    return esito
  } finally {
    db.close()
  }
}

export async function sincronizza(cfg: ConfigX): Promise<EsitoX> {
  return leggi(cfg)
}

/**
 * Il guaio di un motore fermo, per la salute delle fonti. La frase è nostra,
 * e il rimedio è guardare: non c'è niente da ricollegare in Myynd. Il
 * giorno non sta nella frase (che si traduce intera): lo porta `fermoDal`.
 */
export function guaioFermo(archivio = false): GuaioFonte {
  // con un archivio importato il motore fermo non conta: è l'archivio a essere vecchio (vedi `x-archivio.ts`)
  return new GuaioFonte(archivio ? 'Il tuo archivio di X ha più di un mese.' : 'Il motore di X non scrive niente di nuovo da più di tre giorni.', 'guarda')
}

// — l'indice —

/** I documenti che scrive solo il motore: una lettura li ha tutti, e quello che manca non c'è più. */
const SOLO_DEL_MOTORE = ['x:nota:', 'x:settimana:', 'x:posted:', 'x:draft:']
/**
 * I documenti che un altro lettore può scrivere con gli stessi id: il motore
 * non li cancella perché non li ha visti, li lascia uscire quando escono dalla
 * loro finestra.
 */
const CON_FINESTRA: [string, number, number][] = [['x:mio:', GIORNI, Infinity], ['x:like:', GIORNI_MIPIACE, TETTO_MIPIACE], ['x:timeline:', GIORNI_TIMELINE, Infinity]]

/**
 * Toglie dall'indice quello che il motore non ha più, quello che è uscito
 * dalla sua finestra, e i mi piace più vecchi oltre il tetto: due lettori
 * che ne scrivono duecento a testa non ne fanno quattrocento.
 */
export function riconcilia(visti: string[], adesso = Date.now()): number {
  const vivi = new Set(visti)
  const via: string[] = []
  for (const p of SOLO_DEL_MOTORE) via.push(...store.idsConPrefisso(p).filter(id => !vivi.has(id)))
  for (const [p, giorni, tetto] of CON_FINESTRA) {
    const soglia = adesso - giorni * 86_400_000
    const restano: [string, number][] = []
    for (const [id, quando] of store.quandoPerPrefisso(p)) {
      const q = Date.parse(quando ?? '')
      if (!vivi.has(id) && (!Number.isFinite(q) || q < soglia)) via.push(id)
      else restano.push([id, Number.isFinite(q) ? q : 0])
    }
    if (restano.length > tetto) via.push(...restano.sort((a, b) => b[1] - a[1]).slice(tetto).map(([id]) => id))
  }
  return store.scordaDocumenti(via)
}

// — per gli altri: cosa ha pubblicato e cosa gli piace —

export type PostRecente = { id: string; postId: string; testo: string; url: string | null; risposta: boolean; quando: string; numeri: Numeri | null }
export type RecentiX = {
  post: PostRecente[]
  /** Quanti mi piace nel periodo. */
  mipiace: number
  /** Chi gli piace di più, e le parole che tornano nei post che gli sono piaciuti. */
  autori: { autore: string; n: number }[]
  parole: { parola: string; n: number }[]
}

const VUOTE = new Set(('the and for that this with you your are was were have has had not but all can will just from they them their what when ' +
  'about into more than then there here also only like been being some very much make made does done its it\'s i\'m don\'t ' +
  'before after need should would could while where which who how why our out over under again because these those other ' +
  'each every most less many such even still ever never always really thing things people time today ' +
  'che per con una uno gli delle della dello degli sono come anche più non questo questa quello quella cosa fare hai ' +
  'https http www com status').split(' '))

/** Il testo di un documento di X, senza la coda: tutto quello che sta prima dell'ultima riga vuota. */
function testoDi(corpo: string): string {
  const i = corpo.lastIndexOf('\n\n')
  return (i > 0 ? corpo.slice(0, i) : '').trim()
}

/**
 * I suoi post degli ultimi `giorni`, i più nuovi prima, con i numeri quando
 * sono fermi; e i suoi gusti dai mi piace: gli autori e le parole che tornano.
 * Legge l'indice di chi chiede, non il database del motore: vale anche per
 * quello che scriverà il browser.
 */
export function recenti(giorni: number, adesso = Date.now()): RecentiX {
  const soglia = adesso - Math.max(0, giorni) * 86_400_000
  const dentro = (prefisso: string) => [...store.quandoPerPrefisso(prefisso)]
    .filter(([, q]) => { const t = Date.parse(q ?? ''); return Number.isFinite(t) && t >= soglia && t <= adesso + 86_400_000 })
    .map(([id]) => store.documento(id))
    .filter((d): d is Documento => !!d)

  const post = dentro('x:mio:').map(d => ({
    id: d.id, postId: d.id.slice('x:mio:'.length), testo: testoDi(d.corpo), url: d.percorso ?? null,
    risposta: d.tipo === 'risposta', quando: d.quando ?? '', numeri: numeriDa(d.corpo)
  })).sort((a, b) => b.quando.localeCompare(a.quando))

  const piaciuti = dentro('x:like:')
  const perAutore = new Map<string, number>()
  const perParola = new Map<string, number>()
  for (const d of piaciuti) {
    const a = maniglia(d.autore)
    if (a) perAutore.set(`@${a}`, (perAutore.get(`@${a}`) ?? 0) + 1)
    const parole = new Set((testoDi(d.corpo).toLowerCase().replace(/https?:\/\/\S+|@\w+/g, ' ').match(/[\p{L}][\p{L}'’-]{3,}/gu) ?? [])
      .map(w => w.replace(/[’]/g, '\''))
      .filter(w => !VUOTE.has(w)))
    for (const w of parole) perParola.set(w, (perParola.get(w) ?? 0) + 1)
  }
  const ordina = <K extends string>(m: Map<string, number>, chiave: K, minimo: number) => [...m]
    .filter(([, n]) => n >= minimo).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10)
    .map(([k, n]) => ({ [chiave]: k, n }) as { [P in K]: string } & { n: number })
  return { post, mipiace: piaciuti.length, autori: ordina(perAutore, 'autore', 1), parole: ordina(perParola, 'parola', 2) }
}
