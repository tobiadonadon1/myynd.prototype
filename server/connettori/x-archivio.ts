// X dall'archivio ufficiale: quello che ha pubblicato e quello che gli è piaciuto, senza API e senza raschiare.
//
// Il motore di `~/x-engine` si è fermato il 20 settembre, e da lì l'X di
// Myynd è rimasto a quel giorno. X dà a ognuno il suo archivio («Impostazioni ›
// Il tuo account › Scarica un archivio dei tuoi dati»): uno zip che arriva per
// email, con dentro i post, i mi piace, l'account. È suo, è gratis, e leggerlo
// non viola niente. Si legge quello.
//
// **Si leggono cinque file e basta.** `data/tweets.js` (o `tweet.js`, negli
// archivi vecchi), `data/like.js`, `data/bookmark*.js` se c'è, `data/account.js`
// e `data/manifest.js` (la data dell'archivio), con le loro parti
// (`tweets-part1.js`…). Le cartelle delle foto e dei video non si aprono
// nemmeno: un archivio con i media pesa gigabyte, e qui servono pochi mega.
// Per questo lo zip non si scompatta: si legge l'indice in fondo al file, e
// di ogni voce che serve si legge solo quella. Niente finisce su disco, quindi
// un nome con `..` non può uscire da nessuna parte; si scarta lo stesso, con
// i nomi assoluti, e una voce più grande del tetto non si gonfia.
//
// **Si analizza, non si esegue.** Ogni file comincia con
// `window.YTD.<nome>.part0 = [`: si toglie la testa e il resto è JSON. Una
// parte rotta si salta e si dice; le altre entrano.
//
// **Gli stessi documenti del motore.** Un post è `x:mio:<id>` e un mi piace
// `x:like:<id>`, con `documentoMio` e `documentoLike` di `x.ts`: due lettori,
// un documento solo. Le finestre sono quelle: i post degli ultimi novanta
// giorni, i mi piace dell'ultimo mese e al massimo duecento. Quando il motore
// ha già scritto un post, i suoi numeri restano (lui vede le visualizzazioni,
// l'archivio no): per ogni numero si tiene il più alto, e quello che l'archivio
// non sa non diventa uno zero, manca. L'archivio non dice
// quando è stato messo un mi piace, solo l'ordine: la data è quella del post,
// che sta dentro il suo id.
//
// **E la sua voce, per sempre.** Fuori dalle finestre resta un campione: i suoi
// duecento post più ripresi di sempre, in quattro documenti `x:voce:<n>`. È
// quello che servirà per scrivere come lui.
//
// **Un archivio si legge una volta.** Si ricorda quale (l'impronta del
// contenuto, non il nome del file), così lo stesso zip ritrovato fra i
// download non rientra, e un archivio nuovo sì.

import { createHash } from 'node:crypto'
import { open, readdir, lstat, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { inflateRaw } from 'node:zlib'
import { promisify } from 'node:util'
import * as store from '../store.ts'
import * as chi from '../chi.ts'
import type { Documento } from '../store.ts'
import { lingua } from '../config.ts'
import { documentoLike, documentoMio, idPost, istante, numeriDa, GIORNI, GIORNI_MIPIACE, TETTO_MIPIACE, type Numeri } from './x.ts'

const gonfia = promisify(inflateRaw)

/** Dove si ricorda l'ultimo archivio letto, per conto. */
export const CURSORE = 'x:archivio'
/** Gli archivi già visti (impronte, e i file dei download già guardati): restano anche se la fonte si scollega. */
export const CURSORE_VISTI = 'x:archivio:visti'
/** Un archivio più vecchio di così chiede di scaricarne uno nuovo; fino ad allora vale come X aggiornato. */
export const GIORNI_FRESCO = 30
/** Il campione della sua voce: i post più ripresi di sempre, a pezzi da cinquanta. */
export const VOCE_MAX = 200
const VOCE_PEZZO = 50
/** Un post nel campione non supera questi caratteri: un thread incollato non è una voce. */
const VOCE_CARATTERI = 600
/** I segnalibri, come i mi piace: un tetto, e la finestra dei post. */
const TETTO_SEGNALIBRI = 200
/** Una voce dello zip o un file della cartella oltre questo non si legge: nessun archivio vero ci arriva per i testi. */
export const TETTO_VOCE = 256 * 1024 * 1024
/** Tutti i file letti insieme: oltre, il resto si salta. È la memoria che un archivio può chiedere al server. */
export const TETTO_TOTALE = 600 * 1024 * 1024
/** Le parti di un tipo (`tweets-part1`…): oltre, si saltano. X le divide a cinquanta giga, e nessuno ne ha tante. */
export const PARTI_MAX = 20
/** L'indice in fondo allo zip: duecentomila file di media stanno in una ventina di mega. */
const TETTO_INDICE = 64 * 1024 * 1024
const GIORNO = 86_400_000

// — leggere lo zip, solo le voci che servono —

/** Il nome di un file che serve, dentro `data/`: la base senza `.js` (`tweets-part1`), o niente. */
export function nomeUtile(percorso: string): string | null {
  const p = percorso.replace(/\\/g, '/')
  // assoluti e risalite: fuori, anche se qui nessuno scrive su disco
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p) || p.split('/').some(s => s === '..')) return null
  // `data/x.js`, o una cartella sopra se lo zip l'ha rifatto lui da una cartella scompattata
  const m = /^(?:[^/]+\/)?data\/((?:tweets?|like|bookmarks?|account|manifest)(?:-part\d{1,3})?)\.js$/.exec(p)
  return m ? m[1]! : null
}

/** Il numero della parte: `tweets` è la zero, `tweets-part3` la tre. */
const numeroParte = (nome: string) => Number(/-part(\d+)$/.exec(nome)?.[1] ?? 0)

/**
 * Il conto di quello che si è letto: le parti per tipo e i byte in tutto.
 * Una voce che sfora l'uno o l'altro si salta e si dice, le altre entrano.
 */
function contatore() {
  let totale = 0
  return (nome: string, byte: number): boolean => {
    if (numeroParte(nome) >= PARTI_MAX || byte > TETTO_VOCE || totale + byte > TETTO_TOTALE) return false
    totale += byte
    return true
  }
}

type Voce = { nome: string; metodo: number; compressa: number; intera: number; locale: number; cifrata: boolean }

/** Legge `n` byte da `da`, tutti o un errore. */
async function leggiA(fd: Awaited<ReturnType<typeof open>>, da: number, n: number): Promise<Buffer> {
  const b = Buffer.alloc(n)
  let letti = 0
  while (letti < n) {
    const { bytesRead } = await fd.read(b, letti, n - letti, da + letti)
    if (!bytesRead) throw new Error('Lo zip finisce prima del previsto.')
    letti += bytesRead
  }
  return b
}

/** L'indice centrale dello zip, anche ZIP64 (un archivio con i video supera i quattro giga). */
async function indice(fd: Awaited<ReturnType<typeof open>>, dimensione: number): Promise<Voce[]> {
  const coda = Math.min(dimensione, 22 + 65_535 + 20)
  const fondo = await leggiA(fd, dimensione - coda, coda)
  let i = fondo.length - 22
  while (i >= 0 && fondo.readUInt32LE(i) !== 0x06054b50) i--
  if (i < 0) throw new Error('Questo non è uno zip.')
  let quante = fondo.readUInt16LE(i + 10)
  let grande = fondo.readUInt32LE(i + 12)
  let inizio = fondo.readUInt32LE(i + 16)
  if (quante === 0xffff || grande === 0xffffffff || inizio === 0xffffffff) {
    const l = i - 20
    if (l < 0 || fondo.readUInt32LE(l) !== 0x07064b50) throw new Error('Questo zip non si legge.')
    const dove = Number(fondo.readBigUInt64LE(l + 8))
    const z = await leggiA(fd, dove, 56)
    if (z.readUInt32LE(0) !== 0x06064b50) throw new Error('Questo zip non si legge.')
    quante = Number(z.readBigUInt64LE(32))
    grande = Number(z.readBigUInt64LE(40))
    inizio = Number(z.readBigUInt64LE(48))
  }
  if (grande > TETTO_INDICE || inizio + grande > dimensione) throw new Error('Questo zip non si legge.')
  const cd = await leggiA(fd, inizio, grande)
  const voci: Voce[] = []
  let p = 0
  for (let k = 0; k < quante && p + 46 <= cd.length; k++) {
    if (cd.readUInt32LE(p) !== 0x02014b50) break
    const bandiere = cd.readUInt16LE(p + 8)
    const metodo = cd.readUInt16LE(p + 10)
    let compressa = cd.readUInt32LE(p + 20)
    let intera = cd.readUInt32LE(p + 24)
    const ln = cd.readUInt16LE(p + 28), le = cd.readUInt16LE(p + 30), lc = cd.readUInt16LE(p + 32)
    let locale = cd.readUInt32LE(p + 42)
    const nome = cd.subarray(p + 46, p + 46 + ln).toString('utf8')
    // ZIP64: i campi pieni stanno nell'extra 0x0001, in quest'ordine
    let e = p + 46 + ln
    const fineExtra = e + le
    while (e + 4 <= fineExtra) {
      const id = cd.readUInt16LE(e), n = cd.readUInt16LE(e + 2)
      if (id === 0x0001) {
        let q = e + 4
        if (intera === 0xffffffff && q + 8 <= e + 4 + n) { intera = Number(cd.readBigUInt64LE(q)); q += 8 }
        if (compressa === 0xffffffff && q + 8 <= e + 4 + n) { compressa = Number(cd.readBigUInt64LE(q)); q += 8 }
        if (locale === 0xffffffff && q + 8 <= e + 4 + n) { locale = Number(cd.readBigUInt64LE(q)) }
      }
      e += 4 + n
    }
    voci.push({ nome, metodo, compressa, intera, locale, cifrata: (bandiere & 1) === 1 })
    p = fineExtra + lc
  }
  return voci
}

async function contenutoVoce(fd: Awaited<ReturnType<typeof open>>, v: Voce, dimensione: number): Promise<string> {
  if (v.cifrata) throw new Error('voce cifrata')
  if (v.intera > TETTO_VOCE || v.compressa > TETTO_VOCE) throw new Error('voce troppo grande')
  const testa = await leggiA(fd, v.locale, 30)
  if (testa.readUInt32LE(0) !== 0x04034b50) throw new Error('voce senza testa')
  const dati = v.locale + 30 + testa.readUInt16LE(26) + testa.readUInt16LE(28)
  if (dati + v.compressa > dimensione) throw new Error('voce tagliata')
  const grezzo = await leggiA(fd, dati, v.compressa)
  const b = v.metodo === 0 ? grezzo
    : v.metodo === 8 ? await gonfia(grezzo, { maxOutputLength: TETTO_VOCE }) as Buffer
    : null
  if (!b) throw new Error('compressione sconosciuta')
  return b.toString('utf8')
}

/** I file che servono, per nome (`tweets`, `tweets-part1`, `like`…), con il loro testo; e quelli che non si sono letti. */
export type Letto = { file: Map<string, string>; illeggibili: string[] }

async function daZip(percorso: string): Promise<Letto> {
  const fd = await open(percorso, 'r')
  try {
    const { size } = await fd.stat()
    const file = new Map<string, string>()
    const illeggibili: string[] = []
    const entra = contatore()
    for (const v of await indice(fd, size)) {
      const nome = nomeUtile(v.nome)
      if (!nome || file.has(nome)) continue
      // la misura dichiarata decide prima di leggere; quella vera la conferma
      if (!entra(nome, Math.max(v.intera, v.compressa))) { illeggibili.push(nome); continue }
      try { file.set(nome, await contenutoVoce(fd, v, size)) }
      catch { illeggibili.push(nome) }
    }
    return { file, illeggibili }
  } finally {
    await fd.close()
  }
}

/** Una cartella scompattata: la sua `data/`, o lei stessa se è già `data`. Niente collegamenti: si leggono solo file veri. */
async function daCartella(percorso: string): Promise<Letto> {
  const dentro = await lstat(join(percorso, 'data')).then(s => s.isDirectory()).catch(() => false)
  const dati = dentro ? join(percorso, 'data') : percorso
  const file = new Map<string, string>()
  const illeggibili: string[] = []
  const entra = contatore()
  for (const n of (await readdir(dati)).sort()) {
    const nome = nomeUtile(`data/${n}`)
    if (!nome) continue
    const s = await lstat(join(dati, n))
    if (!s.isFile()) continue
    if (!entra(nome, s.size)) { illeggibili.push(nome); continue }
    try { file.set(nome, await readFile(join(dati, n), 'utf8')) } catch { illeggibili.push(nome) }
  }
  return { file, illeggibili }
}

/** Lo zip o la cartella. L'errore è una frase da dire. */
export async function leggiArchivio(percorso: string): Promise<Letto> {
  const s = await stat(percorso).catch(() => null)
  if (!s) throw new Error('Non trovo questo archivio.')
  try { return s.isDirectory() ? await daCartella(percorso) : await daZip(percorso) }
  catch { throw new Error('Non riesco a leggere questo archivio di X.') }
}

/** L'impronta del contenuto che conta: lo stesso archivio, con un altro nome, è lo stesso. */
export function impronta(l: Letto): string {
  const h = createHash('sha256')
  for (const [n, t] of [...l.file].sort((a, b) => a[0].localeCompare(b[0]))) h.update(n).update('\0').update(t).update('\0')
  return h.digest('hex')
}

// — capire i file —

/** `window.YTD.tweets.part0 = [ … ]` → l'elenco. Mai `eval`: si toglie la testa e si legge JSON. */
export function parte(testo: string): unknown[] {
  const t = testo.replace(/^\uFEFF/, '')
  const m = /^\s*window\.YTD\.[A-Za-z0-9_]+\.part\d+\s*=\s*/.exec(t)
  if (!m) throw new Error('parte senza testa')
  const v: unknown = JSON.parse(t.slice(m[0].length).trim().replace(/;\s*$/, ''))
  if (!Array.isArray(v)) throw new Error('parte senza elenco')
  return v
}

/** `window.__THAR_CONFIG = { … }`: la data dell'archivio e il nome dell'account. */
function manifesto(testo: string): { generato: string | null; maniglia: string | null } {
  const t = testo.replace(/^\uFEFF/, '')
  const m = /^\s*window\.__THAR_CONFIG\s*=\s*/.exec(t)
  if (!m) return { generato: null, maniglia: null }
  const v = JSON.parse(t.slice(m[0].length).trim().replace(/;\s*$/, '')) as { archiveInfo?: { generationDate?: unknown }; userInfo?: { userName?: unknown } }
  return { generato: istante(v.archiveInfo?.generationDate), maniglia: typeof v.userInfo?.userName === 'string' ? v.userInfo.userName : null }
}

const MESI: Record<string, string> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' }

/** «Wed Sep 18 14:02:11 +0000 2026», come le scrive X, in ISO. */
export function dataX(s: unknown): string | null {
  const m = typeof s === 'string' ? /^\w{3} (\w{3}) (\d{1,2}) (\d\d:\d\d:\d\d) ([+-])(\d\d)(\d\d) (\d{4})$/.exec(s.trim()) : null
  if (!m) return istante(s)
  const mese = MESI[m[1]!]
  if (!mese) return null
  return istante(`${m[7]}-${mese}-${m[2]!.padStart(2, '0')}T${m[3]}${m[4]}${m[5]}:${m[6]}`)
}

/** Quando è nato un post, dal suo id (gli id di X portano l'istante dal novembre 2010). */
export function nascitaDaId(id: string): string | null {
  try {
    // un id di prima (numeri piccoli) finisce sull'epoca stessa: un'ora dopo è già un id vero
    const ms = Number((BigInt(id) >> 22n) + 1288834974657n)
    return ms > 1288834974657 + 3_600_000 && ms < Date.now() + 365 * GIORNO ? new Date(ms).toISOString() : null
  } catch { return null }
}

const ENTITA: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': '\'' }

type Grezzo = Record<string, unknown>
const testoDi = (x: unknown) => typeof x === 'string' ? x : ''
const intero = (x: unknown) => { const n = typeof x === 'number' ? x : Number(x); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0 }

/** Il testo vero di un post: i t.co sostituiti dal link intero, quelli delle foto tolti, le entità decodificate. */
function testoPulito(t: Grezzo): string {
  let s = testoDi(t.full_text) || testoDi(t.text)
  const ent = (t.entities ?? {}) as { urls?: Grezzo[]; media?: Grezzo[] }
  for (const u of ent.urls ?? []) if (testoDi(u.url) && testoDi(u.expanded_url)) s = s.split(testoDi(u.url)).join(testoDi(u.expanded_url))
  for (const m of ent.media ?? []) if (testoDi(m.url)) s = s.split(testoDi(m.url)).join('')
  return s.replace(/&(?:amp|lt|gt|quot|#39);/g, e => ENTITA[e]!).trim()
}

export type PostArchivio = { postId: string; testo: string; quando: string; risposta: boolean; mipiace: number; repost: number }
export type CosaArchivio = { postId: string; testo: string | null; autore: string | null; url: string | null }

/** Quello che c'è dentro, già capito. */
export type Contenuto = {
  post: PostArchivio[]
  /** Nell'ordine dell'archivio: il più recente prima. */
  mipiace: CosaArchivio[]
  segnalibri: CosaArchivio[]
  maniglia: string | null
  generato: string | null
  /** Le parti che non si sono lette (rotte, troppo grandi). */
  guasti: string[]
}

/** Le parti di un tipo, nell'ordine: `tweets`, `tweets-part1`, `tweets-part2`… */
function parti(file: Map<string, string>, tipi: string[]): [string, string][] {
  return [...file].filter(([n]) => tipi.includes(n.replace(/-part\d+$/, ''))).sort((a, b) => numeroParte(a[0]) - numeroParte(b[0]) || a[0].localeCompare(b[0]))
}

function cosa(v: Grezzo): CosaArchivio | null {
  const postId = idPost(v.tweetId)
  if (!postId) return null
  const url = testoDi(v.expandedUrl) || null
  const autore = url ? /(?:twitter|x)\.com\/([A-Za-z0-9_]{1,30})\/status/.exec(url)?.[1] ?? null : null
  return { postId, testo: (testoDi(v.fullText).replace(/&(?:amp|lt|gt|quot|#39);/g, e => ENTITA[e]!).trim() || null), autore: autore === 'i' ? null : autore, url }
}

export function interpreta(l: Letto): Contenuto {
  const c: Contenuto = { post: [], mipiace: [], segnalibri: [], maniglia: null, generato: null, guasti: [...l.illeggibili] }
  const leggi = (tipi: string[], f: (v: Grezzo) => void) => {
    for (const [nome, testo] of parti(l.file, tipi)) {
      let voci: unknown[]
      try { voci = parte(testo) } catch { c.guasti.push(nome); continue }
      for (const v of voci) if (v && typeof v === 'object') f(v as Grezzo)
    }
  }
  const visti = new Set<string>()
  leggi(['tweets', 'tweet'], v => {
    const t = (v.tweet && typeof v.tweet === 'object' ? v.tweet : v) as Grezzo
    const postId = idPost(t.id_str) ?? idPost(typeof t.id === 'string' ? t.id : null)
    const quando = dataX(t.created_at)
    const testo = testoPulito(t)
    // un repost non è una sua parola
    if (!postId || !quando || !testo || visti.has(postId) || t.retweeted === true || /^RT @/.test(testo)) return
    visti.add(postId)
    c.post.push({
      postId, testo, quando,
      risposta: !!idPost(t.in_reply_to_status_id_str ?? (typeof t.in_reply_to_status_id === 'string' ? t.in_reply_to_status_id : null)),
      mipiace: intero(t.favorite_count), repost: intero(t.retweet_count)
    })
  })
  leggi(['like'], v => { const x = cosa((v.like ?? v) as Grezzo); if (x) c.mipiace.push(x) })
  leggi(['bookmark', 'bookmarks'], v => { const x = cosa((v.bookmark ?? v) as Grezzo); if (x) c.segnalibri.push(x) })
  leggi(['account'], v => {
    const a = (v.account ?? v) as Grezzo
    if (!c.maniglia && typeof a.username === 'string') c.maniglia = a.username
  })
  const man = l.file.get('manifest')
  if (man) {
    try {
      const m = manifesto(man)
      c.generato = m.generato
      c.maniglia = c.maniglia ?? m.maniglia
    } catch { c.guasti.push('manifest') }
  }
  return c
}

/** È un archivio di X: ha il manifesto di X, e i post, i mi piace o l'account. Uno zip qualunque non entra. */
export function eArchivio(l: Letto): boolean {
  return l.file.has('manifest') && [...l.file.keys(), ...l.illeggibili].some(n => /^(tweets?|like|account)(-part\d+)?$/.test(n))
}

// — i documenti —

const ripresa = (p: PostArchivio) => p.mipiace + p.repost * 2

/**
 * Il campione della sua voce: i più ripresi di sempre, i più nuovi a pari
 * merito, a pezzi da cinquanta. Una riga per post, il testo intero su una
 * riga sola; i numeri fra parentesi, che `campioneVoce` sa togliere.
 */
export function documentiVoce(post: PostArchivio[], it: boolean, quando: string): Documento[] {
  const scelti = [...post].sort((a, b) => ripresa(b) - ripresa(a) || b.quando.localeCompare(a.quando)).slice(0, VOCE_MAX)
  const pezzi = Math.ceil(scelti.length / VOCE_PEZZO)
  const docs: Documento[] = []
  for (let k = 0; k < pezzi; k++) {
    const qui = scelti.slice(k * VOCE_PEZZO, (k + 1) * VOCE_PEZZO)
    const righe = qui.map((p, i) => {
      const t = p.testo.replace(/\s+/g, ' ').trim()
      const corto = t.length > VOCE_CARATTERI ? `${t.slice(0, VOCE_CARATTERI)}…` : t
      return `${k * VOCE_PEZZO + i + 1}. ${corto} (${p.mipiace} ${it ? 'mi piace' : 'likes'}, ${p.repost} repost)`
    })
    docs.push({
      id: `x:voce:${k + 1}`,
      fonte: 'x',
      tipo: 'voce',
      titolo: it ? `La tua voce su X, ${k + 1} di ${pezzi}` : `Your voice on X, ${k + 1} of ${pezzi}`,
      corpo: `${it ? 'I tuoi post più ripresi su X, dall’archivio.' : 'Your most engaged posts on X, from your archive.'}\n\n${righe.join('\n')}`,
      autore: null,
      percorso: null,
      quando,
      gruppo: 'note',
      inviato: true
    })
  }
  return docs
}

/** Il più alto di ogni numero; uno che nessuno dei due sa resta sconosciuto. */
const piu = (x: number | null, y: number | null) => x === null ? y : y === null ? x : Math.max(x, y)
const piuAlto = (a: Numeri, b: Numeri): Numeri => ({
  visualizzazioni: piu(a.visualizzazioni, b.visualizzazioni), mipiace: piu(a.mipiace, b.mipiace),
  repost: piu(a.repost, b.repost), risposte: piu(a.risposte, b.risposte), segnalibri: piu(a.segnalibri, b.segnalibri)
})

export type Documenti = { docs: Documento[]; post: number; mipiace: number; segnalibri: number; voce: number; ultimoPost: string | null }

/**
 * I documenti di un archivio, dentro le finestre di `x.ts`, uniti a quelli
 * che ci sono già (`esistente`): i numeri del motore restano, e un mi piace
 * che il motore ha visto tiene la sua data vera.
 */
export function documenti(c: Contenuto, o: { adesso?: number; it?: boolean; esistente?: (id: string) => Documento | null } = {}): Documenti {
  const adesso = o.adesso ?? Date.now()
  const it = o.it ?? lingua() === 'it'
  const esistente = o.esistente ?? (() => null)
  const docs: Documento[] = []
  const esito: Documenti = { docs, post: 0, mipiace: 0, segnalibri: 0, voce: 0, ultimoPost: null }
  const maniglia = c.maniglia ?? 'i'

  const soglia = new Date(adesso - GIORNI * GIORNO).toISOString()
  for (const p of c.post) {
    if (!esito.ultimoPost || p.quando > esito.ultimoPost) esito.ultimoPost = p.quando
    if (p.quando < soglia) continue
    const prima = esistente(`x:mio:${p.postId}`)
    // l'archivio sa i mi piace e i repost, non le visualizzazioni, le risposte né i segnalibri
    const suoi: Numeri = { visualizzazioni: null, mipiace: p.mipiace, repost: p.repost, risposte: null, segnalibri: null }
    const delMotore = prima ? numeriDa(prima.corpo) : null
    const d = documentoMio({
      postId: p.postId, testo: p.testo, risposta: p.risposta, quando: p.quando,
      url: prima?.percorso || `https://x.com/${maniglia}/status/${p.postId}`,
      numeri: delMotore ? piuAlto(delMotore, suoi) : suoi
    }, it)
    if (d) { docs.push(d); esito.post++ }
  }

  // i mi piace: nell'ordine dell'archivio, con la data del post; il tetto vale qui come nell'indice
  const sogliaM = adesso - GIORNI_MIPIACE * GIORNO
  for (const l of c.mipiace) {
    if (esito.mipiace >= TETTO_MIPIACE) break
    const prima = esistente(`x:like:${l.postId}`)
    // il motore l'ha già visto, con la sua data vera: si aggiunge il testo se mancava, e basta
    if (prima) {
      const senzaTesto = !prima.corpo.includes('\n\n')
      if (senzaTesto && l.testo) {
        const d = documentoLike({ postId: l.postId, autore: prima.autore ?? l.autore, testo: l.testo, url: prima.percorso ?? l.url, quando: prima.quando ?? '' }, it)
        if (d) docs.push(d)
      }
      esito.mipiace++
      continue
    }
    const quando = nascitaDaId(l.postId)
    if (!quando || Date.parse(quando) < sogliaM) continue
    const d = documentoLike({ postId: l.postId, autore: l.autore, testo: l.testo, url: l.url, quando }, it)
    if (d) { docs.push(d); esito.mipiace++ }
  }

  // i segnalibri: come i mi piace, con il loro id e la finestra dei post
  for (const s of c.segnalibri) {
    if (esito.segnalibri >= TETTO_SEGNALIBRI) break
    const quando = nascitaDaId(s.postId)
    if (!quando || quando < soglia) continue
    const d = documentoLike({ postId: s.postId, autore: s.autore, testo: s.testo, url: s.url, quando }, it)
    if (!d) continue
    const di = d.autore ?? (it ? 'qualcuno' : 'someone')
    docs.push({
      ...d,
      id: `x:segnalibro:${s.postId}`,
      tipo: 'segnalibro',
      titolo: s.testo ? d.titolo : (it ? `Salvato su X: un post di ${di}` : `Saved on X: a post by ${di}`),
      corpo: d.corpo.replace(/^(?:Ti è piaciuto|You liked) .*$/m, it ? `Hai salvato un post di ${di} su X.` : `You saved a post by ${di} on X.`)
    })
    esito.segnalibri++
  }

  const voce = documentiVoce(c.post, it, c.generato ?? esito.ultimoPost ?? new Date(adesso).toISOString())
  docs.push(...voce)
  esito.voce = Math.min(c.post.length, VOCE_MAX)
  return esito
}

// — lo stato: quale archivio, di quando —

export type StatoArchivio = {
  impronta: string; nome: string; importato: string
  /** La data dell'archivio (dal manifesto), o niente se non c'era. */
  generato: string | null
  ultimoPost: string | null
  /** I suoi post nell'archivio, tutti: è il numero della riga che lo dice. */
  post: number
  documenti: number
  maniglia: string | null
  /** La riga «Imported …» è già stata detta. */
  detto: boolean
}

export function stato(): StatoArchivio | null {
  try {
    const v = JSON.parse(store.cursore(CURSORE) ?? 'null') as StatoArchivio | null
    return v && typeof v.impronta === 'string' ? v : null
  } catch { return null }
}

/** Di quando sono i dati: la data dell'archivio, o l'ultimo post, o il giorno dell'import. */
export function dataDi(s: StatoArchivio): string {
  return s.generato ?? s.ultimoPost ?? s.importato
}

/** Vale come X aggiornato: ha meno di un mese. */
export function fresco(s: StatoArchivio | null, adesso = Date.now()): boolean {
  return !!s && Date.parse(dataDi(s)) >= adesso - GIORNI_FRESCO * GIORNO
}

export function segnaDetto(): void {
  const s = stato()
  if (s && !s.detto) store.segnaCursore(CURSORE, JSON.stringify({ ...s, detto: true }))
}

/** Si scorda l'archivio (la fonte si scollega); quelli già visti restano visti. */
export function scorda(): void {
  store.segnaCursore(CURSORE, null)
}

/**
 * Quello che i download hanno già mostrato, e che resta anche se la fonte si
 * scollega: le impronte lette, i file guardati, la data del più nuovo (uno
 * zip più vecchio non si riapre più), l'account dell'ultimo archivio, il
 * file visto una volta che aspetta il secondo giro, e un archivio di un
 * altro account trovato fra i download.
 */
type Visti = {
  impronte: string[]; file: string[]; mtime: number; maniglia: string | null
  attesa: string | null; altra: { nome: string; maniglia: string } | null
}
function visti(): Visti {
  let v: Partial<Visti> = {}
  try { v = JSON.parse(store.cursore(CURSORE_VISTI) ?? '{}') as Partial<Visti> } catch { /* da capo */ }
  return {
    impronte: Array.isArray(v.impronte) ? v.impronte : [], file: Array.isArray(v.file) ? v.file : [],
    mtime: typeof v.mtime === 'number' ? v.mtime : 0, maniglia: typeof v.maniglia === 'string' ? v.maniglia : null,
    attesa: typeof v.attesa === 'string' ? v.attesa : null, altra: v.altra && typeof v.altra.maniglia === 'string' ? v.altra : null
  }
}
function segnaVisti(cambio: Partial<Visti>) {
  const v = { ...visti(), ...cambio }
  v.impronte = [...new Set(v.impronte)].slice(-200)
  v.file = [...new Set(v.file)].slice(-200)
  store.segnaCursore(CURSORE_VISTI, JSON.stringify(v))
}

/** Un archivio di un altro account aspetta fra i download: la scheda chiede di importarlo a mano, se è suo. */
export function altroAccount(): { nome: string; maniglia: string } | null {
  return visti().altra
}

const stessaManiglia = (a: string | null, b: string | null) => !a || !b || a.toLowerCase() === b.toLowerCase()

// — importare —

export type EsitoImport = Documenti & { stato: StatoArchivio; guasti: string[]; gia: boolean }

/** Per persona: due import dello stesso conto non si accavallano (il bottone e i download). */
const inCorso = new Map<string, Promise<EsitoImport>>()

/**
 * Legge un archivio e lo mette nell'indice. Lo stesso archivio una seconda
 * volta riscrive gli stessi documenti (`gia` lo dice); un archivio che non è
 * di X è un errore da dire. `letto` è l'archivio già letto da chi chiama
 * (i download): non si rilegge.
 */
export function importa(percorso: string, o: { adesso?: number; letto?: { l: Letto; impronta: string; contenuto: Contenuto } } = {}): Promise<EsitoImport> {
  const chiave = chi.adesso() ?? ''
  const prima = inCorso.get(chiave)
  if (prima) return prima
  const p = (async () => {
    const l = o.letto?.l ?? await leggiArchivio(percorso)
    if (!eArchivio(l)) throw new Error('Questo non sembra un archivio di X.')
    const imp = o.letto?.impronta ?? impronta(l)
    const gia = stato()?.impronta === imp
    const c = o.letto?.contenuto ?? interpreta(l)
    const d = documenti(c, { adesso: o.adesso, esistente: id => store.documento(id) })
    await store.salvaDocumentiAPezzi(d.docs)
    // quello che solo l'archivio scrive: il campione e i segnalibri dell'archivio di prima
    const vivi = new Set(d.docs.map(x => x.id))
    store.scordaDocumenti([...store.idsConPrefisso('x:voce:'), ...store.idsConPrefisso('x:segnalibro:')].filter(id => !vivi.has(id)))
    const s: StatoArchivio = {
      impronta: imp, nome: basename(percorso), importato: new Date(o.adesso ?? Date.now()).toISOString(),
      generato: c.generato, ultimoPost: d.ultimoPost, post: c.post.length, documenti: d.docs.length, maniglia: c.maniglia,
      detto: gia ? (stato()?.detto ?? true) : false
    }
    store.segnaCursore(CURSORE, JSON.stringify(s))
    // scelto a mano o no, adesso è questo l'account: la domanda sull'altro è chiusa
    const v = visti()
    segnaVisti({ impronte: [...v.impronte, imp], maniglia: c.maniglia ?? v.maniglia, altra: null })
    return { ...d, stato: s, guasti: c.guasti, gia }
  })()
  inCorso.set(chiave, p)
  return p.finally(() => { if (inCorso.get(chiave) === p) inCorso.delete(chiave) })
}

/**
 * Chi può prendersi un archivio dai download: solo in casa, solo il conto del
 * proprietario del Mac (quello che vive nella radice, o nessun conto), e solo
 * se X c'è già, dal motore o da un archivio importato a mano. Un altro conto
 * con una sessione aperta su questo Mac non si prende l'archivio di chi lo usa.
 */
export function guardaPer(o: { ospitato: boolean; utente: string | null; cartella: string | null; radice: string; motore: boolean; archivio: boolean }): boolean {
  if (o.ospitato) return false
  if (o.utente && o.cartella !== o.radice) return false
  return o.motore || o.archivio
}

/** Il nome che X dà allo zip: `twitter-2026-10-01-<impronta>.zip` (e `x-…` se un giorno cambia). */
export const NOME_ZIP = /^(?:twitter|x)-\d{4}-\d\d-\d\d-[A-Za-z0-9]+\.zip$/i

/**
 * Guarda nei download se è arrivato un archivio di X, e lo legge, una volta.
 *
 * Costa una lettura della cartella: ogni zip col nome di X si guarda per
 * misura e data, e uno già guardato, o più vecchio dell'ultimo guardato, non
 * si riapre più. Il più nuovo entra solo se al giro dopo misura e data sono
 * ancora quelle (il browser potrebbe starlo ancora scrivendo). Non entra uno
 * più vecchio di quello che c'è, uno uguale, uno senza il manifesto di X, né
 * uno di un altro account: quello lo deve scegliere lui (`altroAccount`).
 */
export async function guardaDownload(o: { cartella?: string; adesso?: number } = {}): Promise<EsitoImport | null> {
  const cartella = o.cartella ?? join(homedir(), 'Downloads')
  let nomi: string[]
  try { nomi = (await readdir(cartella)).filter(n => NOME_ZIP.test(n)) } catch { return null }
  if (!nomi.length) return null
  const v = visti()
  const candidati: { percorso: string; segno: string; quando: number }[] = []
  for (const n of nomi) {
    const percorso = join(cartella, n)
    const s = await lstat(percorso).catch(() => null)
    if (!s?.isFile() || s.mtimeMs <= v.mtime) continue
    const segno = `${n}|${s.size}|${Math.round(s.mtimeMs)}`
    if (!v.file.includes(segno)) candidati.push({ percorso, segno, quando: s.mtimeMs })
  }
  // il più nuovo: uno per giro basta
  const c = candidati.sort((a, b) => b.quando - a.quando)[0]
  if (!c) return null
  // la prima volta si guarda e basta: entra se al giro dopo è uguale
  if (v.attesa !== c.segno) { segnaVisti({ attesa: c.segno }); return null }
  segnaVisti({ attesa: null, file: [...v.file, c.segno], mtime: Math.max(v.mtime, c.quando) })
  let l: Letto
  try { l = await leggiArchivio(c.percorso) } catch { return null }
  if (!eArchivio(l)) return null
  const imp = impronta(l)
  if (v.impronte.includes(imp)) return null
  const contenuto = interpreta(l)
  if (!stessaManiglia(stato()?.maniglia ?? v.maniglia, contenuto.maniglia)) {
    segnaVisti({ altra: { nome: basename(c.percorso), maniglia: contenuto.maniglia! } })
    return null
  }
  const attuale = stato()
  if (attuale) {
    const data = contenuto.generato ?? contenuto.post.map(p => p.quando).sort().at(-1) ?? null
    if (data && data <= dataDi(attuale)) return null
  }
  return importa(c.percorso, { adesso: o.adesso, letto: { l, impronta: imp, contenuto } })
}

/**
 * I post del campione della voce, il più ripreso prima: il testo, senza il
 * numero davanti e i numeri in fondo. È quello che userà chi scrive come lui.
 */
export function campioneVoce(): string[] {
  const docs = store.idsConPrefisso('x:voce:')
    .sort((a, b) => Number(a.slice(7)) - Number(b.slice(7)))
    .map(id => store.documento(id))
    .filter((d): d is Documento => !!d)
  return docs.flatMap(d => d.corpo.split('\n').slice(2))
    .map(r => r.replace(/^\d+\. /, '').replace(/ \(\d+ (?:mi piace|likes), \d+ repost\)$/, '').trim())
    .filter(Boolean)
}
