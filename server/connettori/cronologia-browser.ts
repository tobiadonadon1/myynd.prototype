// La cronologia dei browser: cosa ha guardato, senza chiedere permessi.
//
// Chrome, Arc, Brave ed Edge tengono la cronologia in un file SQLite
// `History`, uno per profilo, bloccato finché il browser è aperto. Qui lo si
// copia in una cartella temporanea (col suo `-wal`, se c'è) e si legge la
// copia: indirizzo, titolo, quando e quanto, dall'ultima passata. Safari solo
// se il Mac ha dato a Myynd l'accesso completo al disco: senza, il file non si
// apre e Safari non c'è, senza errori.
//
// Quello che si tiene è poco e per giorno: un indirizzo perde la query (che è
// dove stanno token, ricerche e numeri di conto), tranne quando la query o il
// percorso sono l'identità del documento (un Google Doc, una pagina di Notion,
// un file di Figma, una PR di GitHub, un'issue di Linear, un design di Canva).
// Banche, salute, siti per adulti e quelli che lui esclude non entrano
// nemmeno nel conto.
//
// Niente di qui va in rete. Le prove usano file SQLite costruiti a mano.

import { DatabaseSync } from 'node:sqlite'
import { existsSync, readdirSync } from 'node:fs'
import { copyFile, mkdtemp, rm, stat } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

export type Visita = {
  browser: string
  profilo: string
  /** L'indirizzo ripulito: senza query e frammento, tranne quando sono l'identità del documento. */
  url: string
  dominio: string
  /** L'identità del documento (`gdoc:…`, `notion:…`, `figma:…`, `github:…`, `linear:…`, `canva:…`), o null. */
  documento: string | null
  titolo: string
  /** Epoch ms. */
  quando: number
  /** Secondi passati sulla pagina, se il browser lo sa (0 altrimenti). */
  secondi: number
}

export type ProfiloBrowser = { browser: string; profilo: string; file: string; tipo: 'chromium' | 'safari' }

/** Dove stanno i browser della famiglia di Chrome, sotto Application Support. */
export const CHROMIUM: { browser: string; cartella: string[] }[] = [
  { browser: 'Chrome', cartella: ['Google', 'Chrome'] },
  { browser: 'Arc', cartella: ['Arc', 'User Data'] },
  { browser: 'Brave', cartella: ['BraveSoftware', 'Brave-Browser'] },
  { browser: 'Edge', cartella: ['Microsoft Edge'] }
]

/** Millisecondi fra il 1601 (l'epoca di Chrome) e il 1970. Chrome conta in microsecondi, oltre 2^53: si divide in SQL. */
const DA_1601_MS = 11_644_473_600_000
/** Secondi fra il 1970 e il 2001 (l'epoca di Safari). */
const DA_2001 = 978_307_200

/** Da millisecondi dal 1601 a epoch ms. */
export function daChrome(ms1601: number): number { return Math.round(ms1601 - DA_1601_MS) }
/** Da epoch ms ai microsecondi di Chrome (per scrivere le prove). */
export function aChrome(ms: number): number { return (ms + DA_1601_MS) * 1000 }

/* --------------------------------------------------------------- domini */

/*
 * I domini che non si guardano mai: banche e pagamenti, salute, adulti,
 * incontri. La lista dei nomi è corta e certa; le parole prendono il resto
 * (una banca locale che nessuna lista conosce si chiama quasi sempre «bank»
 * o «banca»).
 */
export const DOMINI_ESCLUSI = new Set([
  'paypal.com', 'revolut.com', 'wise.com', 'n26.com', 'monzo.com', 'chase.com', 'wellsfargo.com', 'bankofamerica.com',
  'citi.com', 'americanexpress.com', 'capitalone.com', 'schwab.com', 'fidelity.com', 'vanguard.com', 'robinhood.com',
  'intesasanpaolo.com', 'unicredit.it', 'fineco.it', 'bancobpm.it', 'mediolanum.it', 'poste.it', 'satispay.com', 'hype.it',
  'ing.com', 'ing.it', 'bnpparibas.com', 'hsbc.com', 'barclays.co.uk', 'lloydsbank.com', 'santander.com', 'bbva.com',
  'coinbase.com', 'binance.com', 'kraken.com', 'klarna.com', 'agenziaentrate.gov.it', 'irs.gov',
  'mychart.org', 'doctolib.fr', 'doctolib.it', 'zocdoc.com', 'webmd.com', 'patient.info', 'salute.gov.it', 'fascicolosanitario.gov.it',
  'betterhelp.com', 'talkspace.com', 'healthline.com', 'goodrx.com',
  'pornhub.com', 'xvideos.com', 'xhamster.com', 'xnxx.com', 'onlyfans.com', 'redtube.com', 'youporn.com', 'chaturbate.com',
  'tinder.com', 'bumble.com', 'hinge.co', 'grindr.com', 'okcupid.com', 'match.com', 'meetic.it'
])
export const DOMINIO_ESCLUSO = /(^|[.-])(bank|banca|banco|banque|sparkasse|volksbank|creditunion|fintech|wallet|health|salute|sanita|clinic|clinica|hospital|ospedale|pharma|farmacia|medical|medico|therapy|terapia|porn|xxx|sex|adult|dating|casino|bet|scommesse)([.-]|$)/i
/** «mybank», «credembanca»: la banca in coda al nome. «bankside» no. */
export const BANCA_IN_CODA = /[a-z0-9](bank|banca|banco|banque)([.-]|$)/i

/** Il dominio senza `www.` e in minuscolo; null se l'indirizzo non è http(s). */
export function dominioDi(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.hostname.toLowerCase().replace(/^www\./, '') || null
  } catch { return null }
}

/** Un dominio escluso: dalla lista, dalle parole, o dalle esclusioni sue (anche i sottodomini). */
export function dominioEscluso(dominio: string, suoi: readonly string[] = []): boolean {
  const d = dominio.toLowerCase()
  const dentro = (lista: Iterable<string>) => {
    for (const x of lista) {
      const e = x.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
      if (e && (d === e || d.endsWith(`.${e}`))) return true
    }
    return false
  }
  return dentro(DOMINI_ESCLUSI) || DOMINIO_ESCLUSO.test(d) || BANCA_IN_CODA.test(d) || dentro(suoi)
}

/* ------------------------------------------------------- l'indirizzo pulito */

/**
 * L'indirizzo che si può tenere, e l'identità del documento quando c'è.
 *
 * Tutto quello che sta dopo `?` e `#` se ne va, sempre: è lì che stanno i
 * gettoni di accesso, le ricerche, i numeri. L'identità dei documenti noti
 * sta nel percorso, e il percorso resta tagliato a quello che la fa.
 */
export function pulisciUrl(url: string): { url: string; dominio: string; documento: string | null } | null {
  let u: URL
  try { u = new URL(url) } catch { return null }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  const dominio = u.hostname.toLowerCase().replace(/^www\./, '')
  const pezzi = u.pathname.split('/').filter(Boolean)
  const base = `${u.protocol}//${u.hostname.toLowerCase()}`
  let documento: string | null = null
  let percorso = u.pathname
  // Google Docs, Sheets, Slides: /document/d/<id>/edit
  if (dominio === 'docs.google.com') {
    const i = pezzi.indexOf('d')
    const genere = pezzi[0] === 'document' ? 'doc' : pezzi[0] === 'spreadsheets' ? 'sheet' : pezzi[0] === 'presentation' ? 'slides' : null
    if (genere && i >= 0 && pezzi[i + 1]) { documento = `gdoc:${genere}:${pezzi[i + 1]}`; percorso = `/${pezzi.slice(0, i + 2).join('/')}` }
  } else if (dominio === 'notion.so' || dominio.endsWith('.notion.site')) {
    const ultimo = pezzi[pezzi.length - 1] ?? ''
    const id = /([0-9a-f]{32})$/i.exec(ultimo.replace(/-/g, ''))?.[1]
    if (id) { documento = `notion:${id.toLowerCase()}`; percorso = `/${pezzi.join('/')}` }
  } else if (dominio === 'figma.com') {
    if (['file', 'design', 'board', 'proto', 'slides'].includes(pezzi[0] ?? '') && pezzi[1]) {
      documento = `figma:${pezzi[1]}`; percorso = `/${pezzi.slice(0, 3).join('/')}`
    }
  } else if (dominio === 'github.com') {
    if (pezzi.length >= 4 && (pezzi[2] === 'pull' || pezzi[2] === 'issues') && /^\d+$/.test(pezzi[3]!)) {
      documento = `github:${pezzi[0]}/${pezzi[1]}#${pezzi[3]}`; percorso = `/${pezzi.slice(0, 4).join('/')}`
    }
  } else if (dominio === 'linear.app') {
    const i = pezzi.indexOf('issue')
    if (i >= 0 && pezzi[i + 1]) { documento = `linear:${pezzi[i + 1]!.toUpperCase()}`; percorso = `/${pezzi.slice(0, i + 2).join('/')}` }
  } else if (dominio === 'canva.com') {
    if (pezzi[0] === 'design' && pezzi[1]) { documento = `canva:${pezzi[1]}`; percorso = `/design/${pezzi[1]}` }
  }
  return { url: `${base}${percorso === '/' ? '' : percorso}`, dominio, documento }
}

/* ------------------------------------------------------------- i profili */

/** I profili dei browser installati: `Default`, `Profile 1`, …; Safari solo se il suo file c'è. */
export function profili(casa = homedir()): ProfiloBrowser[] {
  const supporto = join(casa, 'Library', 'Application Support')
  const fuori: ProfiloBrowser[] = []
  for (const b of CHROMIUM) {
    const radice = join(supporto, ...b.cartella)
    let voci: string[] = []
    try { voci = readdirSync(radice) } catch { continue }
    for (const v of voci) {
      if (v !== 'Default' && !/^Profile \d+$/.test(v)) continue
      const file = join(radice, v, 'History')
      if (existsSync(file)) fuori.push({ browser: b.browser, profilo: v, file, tipo: 'chromium' })
    }
  }
  const safari = join(casa, 'Library', 'Safari', 'History.db')
  if (existsSync(safari)) fuori.push({ browser: 'Safari', profilo: 'Default', file: safari, tipo: 'safari' })
  return fuori
}

/**
 * Una copia del file bloccato, col suo diario `-wal` se c'è: il browser
 * aperto tiene le ultime visite lì. Torna la cartella da buttare e il file.
 * Senza permesso (Safari senza accesso completo al disco) torna null.
 */
export async function copiaBloccato(file: string, nome: string, prefisso: string): Promise<{ dir: string; file: string } | null> {
  const dir = await mkdtemp(join(tmpdir(), prefisso))
  try {
    const dentro = join(dir, nome)
    await copyFile(file, dentro)
    for (const coda of ['-wal', '-shm']) {
      try { await copyFile(file + coda, dentro + coda) } catch { /* senza il diario si legge il resto */ }
    }
    return { dir, file: dentro }
  } catch {
    await rm(dir, { recursive: true, force: true })
    return null
  }
}

/** Quando è cambiato per l'ultima volta il file o il suo diario `-wal`: se non cambia, non si ricopia. */
export async function quandoCambiato(file: string): Promise<number> {
  let t = 0
  for (const f of [file, `${file}-wal`]) { try { t = Math.max(t, (await stat(f)).mtimeMs) } catch { /* non c'è */ } }
  return t
}

/** Oltre questa grandezza un file non si copia (un profilo enorme non ferma il server). */
export const COPIA_MASSIMA = 200 * 1024 * 1024

/** Le visite di un profilo dopo `dal` (epoch ms), al massimo `tetto`, dalla più vecchia. */
export async function leggiProfilo(p: ProfiloBrowser, dal: number, o: { tetto?: number; esclusi?: readonly string[] } = {}): Promise<Visita[]> {
  const tetto = o.tetto ?? 5000
  try { if ((await stat(p.file)).size > COPIA_MASSIMA) return [] } catch { return [] }
  const c = await copiaBloccato(p.file, 'History', 'myynd-cronologia-')
  if (!c) return []
  let db: DatabaseSync | null = null
  try {
    db = new DatabaseSync(c.file, { readOnly: true })
    type Riga = { url: string; titolo: string | null; quando: number; durata: number | null }
    const righe = p.tipo === 'chromium'
      ? db.prepare(`SELECT u.url AS url, u.title AS titolo, v.visit_time / 1000 AS quando, v.visit_duration / 1000 AS durata
          FROM visits v JOIN urls u ON u.id = v.url WHERE v.visit_time / 1000 > ? ORDER BY v.visit_time LIMIT ?`).all(dal + DA_1601_MS, tetto) as Riga[]
      : db.prepare(`SELECT i.url AS url, v.title AS titolo, v.visit_time AS quando, NULL AS durata
          FROM history_visits v JOIN history_items i ON i.id = v.history_item WHERE v.visit_time > ? ORDER BY v.visit_time LIMIT ?`).all(dal / 1000 - DA_2001, tetto) as Riga[]
    const fuori: Visita[] = []
    for (const r of righe) {
      const pulito = pulisciUrl(String(r.url ?? ''))
      if (!pulito || dominioEscluso(pulito.dominio, o.esclusi)) continue
      const quando = p.tipo === 'chromium' ? daChrome(Number(r.quando)) : Math.round((Number(r.quando) + DA_2001) * 1000)
      if (!Number.isFinite(quando)) continue
      const secondi = p.tipo === 'chromium' && r.durata ? Math.min(4 * 3600, Math.round(Number(r.durata) / 1000)) : 0
      fuori.push({ browser: p.browser, profilo: p.profilo, ...pulito, titolo: String(r.titolo ?? '').replace(/\s+/g, ' ').trim().slice(0, 200), quando, secondi })
    }
    return fuori
  } catch {
    return []
  } finally {
    try { db?.close() } catch { /* già chiuso */ }
    await rm(c.dir, { recursive: true, force: true })
  }
}

export type GiornoDominio = {
  giorno: string
  dominio: string
  /** L'identità del documento, o null per il dominio intero. */
  documento: string | null
  url: string
  /** I titoli più visti, al massimo cinque. */
  titoli: string[]
  visite: number
  secondi: number
  prima: number
  ultima: number
  browser: string
}

/**
 * Le visite messe insieme per giorno e per dominio: un documento noto ha la
 * sua riga, il resto del dominio una sola. `giornoDi` dà il giorno locale.
 */
export function perGiorno(visite: readonly Visita[], giornoDi: (ms: number) => string): GiornoDominio[] {
  const gruppi = new Map<string, GiornoDominio & { conta: Map<string, number> }>()
  for (const v of visite) {
    const giorno = giornoDi(v.quando)
    const chiave = `${giorno}\u0000${v.dominio}\u0000${v.documento ?? ''}`
    let g = gruppi.get(chiave)
    if (!g) {
      g = { giorno, dominio: v.dominio, documento: v.documento, url: v.documento ? v.url : `https://${v.dominio}`, titoli: [], visite: 0, secondi: 0, prima: v.quando, ultima: v.quando, browser: v.browser, conta: new Map() }
      gruppi.set(chiave, g)
    }
    g.visite++
    g.secondi += v.secondi
    g.prima = Math.min(g.prima, v.quando)
    g.ultima = Math.max(g.ultima, v.quando)
    if (v.titolo) g.conta.set(v.titolo, (g.conta.get(v.titolo) ?? 0) + 1)
  }
  return [...gruppi.values()].map(({ conta, ...g }) => ({
    ...g,
    titoli: [...conta.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t)
  }))
}

export type Lettura = { profilo: ProfiloBrowser; visite: Visita[]; mtime: number; saltato: boolean }

/**
 * Tutte le visite di tutti i profili dopo `dal` (per profilo: il suo
 * cursore). Un profilo il cui file non è cambiato da `visto` (l'ultima data
 * letta) non si copia nemmeno: `saltato`.
 */
export async function leggiTutto(dal: (p: ProfiloBrowser) => number, o: { casa?: string; esclusi?: readonly string[]; visto?: (p: ProfiloBrowser) => number } = {}): Promise<Lettura[]> {
  const fuori: Lettura[] = []
  for (const p of profili(o.casa)) {
    const mtime = await quandoCambiato(p.file)
    if (mtime && o.visto && o.visto(p) === mtime) { fuori.push({ profilo: p, visite: [], mtime, saltato: true }); continue }
    fuori.push({ profilo: p, visite: await leggiProfilo(p, dal(p), { esclusi: o.esclusi }), mtime, saltato: false })
  }
  return fuori
}
