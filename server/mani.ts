// Le mani di chi lavora: fuori dall'indice, dentro un recinto.
//
// Le sue parole, del diciotto settembre: «when it does stuff, it still
// doesn't really do it. It should have hands outside of its own container to
// open files in the background. Of course, not cluttering my desktop, but
// open files, write pages, write notes, read, learn, research, whatever it
// is, all of this in the background». Fino a qui `svolgi` aveva due attrezzi,
// `cerca` e `apri`, e tutti e due leggevano l'indice: quello che l'indice non
// aveva, per Myynd non esisteva. Una riga che diceva «leggi il config» o
// «guarda cosa dice quel sito» tornava con una spiegazione di cosa avrebbe
// letto.
//
// Qui ci sono cinque mani e un braccio, e ognuna è un permesso stretto:
//
//   · `leggi_file`: un file di testo o estraibile sotto la sua casa o la
//     cartella del compito. Mai fuori, mai un binario, mai le chiavi.
//   · `leggi_pagina`: una pagina pubblica, http o https, mai un indirizzo di
//     casa o della rete locale, quindici secondi, duecento kilobyte.
//   · `cerca_web`: una ricerca senza chiave, sulla pagina HTML di DuckDuckGo.
//   · `crea_nota`: una nota in Note, senza portare Note davanti.
//   · `scrivi_file`: un file di testo, solo nella cartella Myynd sulla
//     Scrivania o in una copia di lavoro. Mai altrove.
//   · `lavora_nel_codice`: Claude Code dentro una copia della cartella del
//     progetto; la cartella vera non si tocca.
//
// Ogni mano torna con un `Fatto`: cosa ha usato e cosa ha restituito. È la
// lista che permette di scrivere una frase di chiusura vera («Fatto: la nota
// è in Note») e di farla controllare a chi rilegge: una frase che dice
// «salvato» senza un fatto che lo dica non passa.
//
// Le funzioni sono pure quanto possono: la rete, il risolutore dei nomi,
// osascript e Claude Code passano da `ferri`, che le prove sostituiscono. Una
// prova che apre Note sul suo Mac non è una prova, è un'invasione.

import type Anthropic from '@anthropic-ai/sdk'
import { execFile } from 'node:child_process'
import { lookup } from 'node:dns/promises'
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { isIP } from 'node:net'
import { homedir } from 'node:os'
import { basename, dirname, extname, isAbsolute, join, resolve, sep } from 'node:path'
import { RADICE, cartella as cartellaProfilo, leggi, lingua as cfgLingua } from './config.ts'
import { OSPITATO } from './ospitato.ts'
import { daBuffer, daHtml, RICCHI } from './connettori/estrai.ts'
import { riflua } from './testo.ts'
import * as lavoro from './lavoro.ts'
import { landReport } from './esecuzione-isolata.ts'
import { detectRuntime } from './agent-runtime.ts'
import { openInProva } from './senza-open.ts'

// — cosa è stato fatto —

export type Attrezzo = 'leggi_file' | 'leggi_pagina' | 'cerca_web' | 'crea_nota' | 'scrivi_file' | 'lavora' | 'crea_documento_app' | 'cerca' | 'apri'

/**
 * Un attrezzo usato, e cosa ha restituito.
 *
 * `dettaglio` è la cosa che si può controllare: il percorso scritto, il
 * titolo della nota, l'indirizzo letto, la copia in cui Claude Code ha
 * lavorato. Un fatto con esito «errore» conta lo stesso: dice che ci ha
 * provato e non è riuscito, che è una cosa diversa dal non averci provato.
 */
export type Fatto = {
  attrezzo: Attrezzo
  esito: 'ok' | 'errore'
  dettaglio: string
  /**
   * Quello che una mano che legge ha letto, in estratto: la pagina, il file,
   * i risultati. Va a chi rilegge, che altrimenti vedrebbe un riassunto di
   * una pagina senza la pagina e lo boccerebbe come inventato: è successo
   * alla prima prova dal vivo, e la riga è tornata con una domanda.
   */
  testo?: string
}

/** Quanto di una lettura arriva a chi rilegge. */
export const TETTO_LETTURA = 6000

/** Le mani che producono qualcosa fuori da Myynd: quelle che una frase di chiusura può nominare. */
export const CHE_PRODUCONO: Attrezzo[] = ['crea_documento_app', 'crea_nota', 'scrivi_file', 'lavora']

// — le mani sostituibili —

type Rete = typeof fetch
type Risolutore = (host: string) => Promise<{ address: string }[]>
type Esecutore = (argomenti: string[], signal?: AbortSignal) => Promise<string>
type Ferri = {
  rete: Rete
  risolvi: Risolutore
  osascript: Esecutore
  fai: typeof lavoro.fai
  /** Posa il lavoro fatto nella copia dentro il progetto vero, tenendo da parte com'era. */
  posa: typeof landReport
  runtime: () => Promise<{ status: string }>
  installato: () => string | null
  casa: () => string
  scrivania: () => string
  scaricati: () => string
  documenti: () => string
  /** Apre un file con l'app predefinita del Mac, senza portare niente davanti a forza. */
  apri: (percorso: string) => Promise<void>
  copie: () => string
  piattaforma: () => string
  ospitato: () => boolean
}
const VERI: Ferri = {
  rete: (...a) => fetch(...a),
  posa: landReport,
  risolvi: host => lookup(host, { all: true }),
  osascript: (argomenti, signal) => new Promise((ok, no) => {
    execFile('/usr/bin/osascript', argomenti, { encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024, signal }, (errore, stdout, stderr) => {
      if (!errore) return ok(stdout)
      if (signal?.aborted) return no(new Error('Il lavoro è stato fermato.'))
      if (/(-1743|not authorized|not permitted)/i.test(stderr)) return no(new Error('Permetti a Myynd di controllare Note in Impostazioni di Sistema, Privacy e sicurezza, Automazione, poi riprova.'))
      // la diagnostica di AppleScript può contenere il testo della nota: non si rilancia
      no(new Error('Note non ha creato la nota. Controlla che sia installata e che non ci sia una finestra di permesso aperta.'))
    })
  }),
  fai: (...a) => lavoro.fai(...a),
  runtime: () => detectRuntime('claude'),
  installato: () => lavoro.installato(),
  casa: () => homedir(),
  scrivania: () => join(homedir(), 'Desktop'),
  scaricati: () => join(homedir(), 'Downloads'),
  documenti: () => join(homedir(), 'Documents'),
  apri: percorso => apriSulMac(percorso),
  copie: () => join(cartellaProfilo(), 'project-work'),
  piattaforma: () => process.platform,
  ospitato: () => OSPITATO
}
let ferri: Ferri = VERI

/**
 * La mano vera di «Apri»: `open` sul Mac, o solo una riga nel registro in una
 * scena delle prove (MYYND_PROVA_NIENTE_OPEN=1, come «Portami lì»).
 */
export function apriSulMac(percorso: string): Promise<void> {
  if (openInProva('mani', [percorso])) return Promise.resolve()
  return new Promise((ok, no) => execFile('/usr/bin/open', [percorso], { timeout: 15_000 }, e => e ? no(new Error('Non sono riuscito ad aprire il file.')) : ok()))
}

/** Solo per le prove: sostituisce le mani, o le rimette (con `null`). */
export function perProva(f: Partial<Ferri> | null) {
  ferri = f ? { ...VERI, ...f } : VERI
}

const en = () => cfgLingua() === 'en'

// — leggere un file —

/** Quanto si legge da un file, in byte, e quanto se ne dà al modello, in caratteri. */
export const TETTO_FILE = 8 * 1024 * 1024
export const TETTO_TESTO_FILE = 60_000

/**
 * Quello che non si legge mai, nemmeno dentro la sua casa.
 *
 * Le chiavi, i portachiavi, le variabili d'ambiente con dentro le password, la
 * memoria di Myynd stessa (che ha le credenziali cifrate e i suoi dati), e la
 * Libreria intera: là stanno la posta, i messaggi e i cookie di ogni app, e
 * un modello che li legge «per capire meglio» è esattamente il buco che
 * questo prodotto non si può permettere.
 */
const SEGRETI = /(^|\/)(\.ssh|\.gnupg|\.aws|\.azure|\.kube|\.docker|\.netrc|\.npmrc|\.pypirc|\.git|\.env(?:\.[^/]*)?|id_rsa[^/]*|id_ed25519[^/]*|id_ecdsa[^/]*|\.pgpass|\.bash_history|\.zsh_history|Keychains)(\/|$)/

function espandi(percorso: string): string {
  const p = percorso.trim()
  if (p === '~' || p.startsWith('~/')) return join(ferri.casa(), p.slice(1))
  return p
}

function dentro(radice: string, percorso: string): boolean {
  return percorso === radice || percorso.startsWith(radice + sep)
}

const vera = (p: string) => { try { return realpathSync(p) } catch { return resolve(p) } }

/** Il percorso reale anche di quello che non esiste ancora: l'antenato che c'è, risolto, più il resto. */
function realeAnche(p: string): string {
  let antenato = p
  while (!existsSync(antenato) && dirname(antenato) !== antenato) antenato = dirname(antenato)
  return join(vera(antenato), p.slice(antenato.length))
}

/**
 * Il percorso di un file che si può leggere, o il motivo per cui no.
 *
 * Si risolvono i collegamenti prima di guardare dove sta: un link dentro
 * casa che punta fuori è fuori. Le radici sono la casa e, se c'è, la cartella
 * del compito; un percorso relativo si intende dalla cartella del compito,
 * o da casa.
 */
export function percorsoLeggibile(percorso: string, cartella?: string | null): string {
  if (typeof percorso !== 'string' || !percorso.trim() || percorso.includes('\0')) throw new Error('Manca il percorso del file.')
  const casa = vera(ferri.casa())
  const base = cartella ? vera(cartella) : casa
  const chiesto = espandi(percorso)
  const assoluto = isAbsolute(chiesto) ? chiesto : resolve(base, chiesto)
  if (!existsSync(assoluto)) throw new Error('Non esiste nessun file a questo percorso.')
  const reale = realpathSync(assoluto)
  const radici = [casa, ...(cartella ? [vera(cartella)] : [])]
  if (!radici.some(r => dentro(r, reale))) throw new Error('Posso leggere solo dentro la tua cartella personale o la cartella del compito.')
  const profilo = vera(RADICE)
  const libreria = join(casa, 'Library')
  if (dentro(profilo, reale) || dentro(libreria, reale) || SEGRETI.test(reale) || SEGRETI.test(assoluto)) {
    throw new Error('Questo file è riservato: chiavi, credenziali o dati di sistema non si leggono.')
  }
  if (!statSync(reale).isFile()) throw new Error('Questo percorso è una cartella, non un file.')
  return reale
}

/** Un buffer che non è testo: uno zero nei primi ottomila byte. */
function sembraBinario(buf: Buffer): boolean {
  return buf.subarray(0, 8000).includes(0)
}

/** Il testo di un file, tagliato al tetto con la misura detta. */
export async function leggiFile(percorso: string, cartella?: string | null): Promise<{ percorso: string; testo: string }> {
  if (ferri.ospitato()) throw new Error('Su un server non ho un disco da leggere.')
  const reale = percorsoLeggibile(percorso, cartella)
  const dimensione = statSync(reale).size
  if (dimensione > TETTO_FILE) throw new Error('Questo file è troppo grande per essere letto qui.')
  const buf = readFileSync(reale)
  const ext = extname(reale).toLowerCase()
  let testo: string
  if (RICCHI.includes(ext)) testo = await daBuffer(buf, basename(reale))
  else {
    if (sembraBinario(buf)) throw new Error('Questo file non è testo: non lo so leggere.')
    testo = ext === '.html' || ext === '.htm' ? daHtml(buf.toString('utf8')) : riflua(buf.toString('utf8'))
  }
  if (testo.length > TETTO_TESTO_FILE) testo = testo.slice(0, TETTO_TESTO_FILE) + `\n[tagliato a ${TETTO_TESTO_FILE} caratteri su ${testo.length}]`
  return { percorso: reale, testo }
}

// — leggere una pagina —

export const ATTESA_PAGINA = 15_000
export const TETTO_PAGINA = 200 * 1024
export const TETTO_TESTO_PAGINA = 30_000
const UTENTE = 'Myynd/0.2 (page reader)'

/** Un indirizzo IP che sta in casa o nella rete locale: non si chiama. */
export function indirizzoPrivato(ip: string): boolean {
  const v = isIP(ip)
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
  }
  if (v === 6) {
    const basso = ip.toLowerCase()
    if (basso === '::1' || basso === '::') return true
    if (basso.startsWith('::ffff:')) return indirizzoPrivato(basso.slice(7))
    return /^f[cd]/.test(basso) || /^fe[89ab]/.test(basso)
  }
  return true
}

/**
 * Un indirizzo pubblico e basta: http o https, senza credenziali dentro, e
 * con un nome che non è di casa. Il nome si guarda qui; gli indirizzi a cui
 * risolve li guarda `pagina`, che è dove si fa la chiamata.
 */
export function indirizzoPubblico(url: string): URL {
  let u: URL
  try { u = new URL(String(url).trim()) } catch { throw new Error('Questo non è un indirizzo web valido.') }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Posso leggere solo indirizzi http o https.')
  if (u.username || u.password) throw new Error('Un indirizzo con dentro delle credenziali non si legge.')
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!host || host === 'localhost' || /\.(?:local|localhost|internal|lan|home|intranet|corp)$/.test(host) || (isIP(host) && indirizzoPrivato(host))) {
    throw new Error('Questo indirizzo è di casa o della rete locale: non lo leggo.')
  }
  return u
}

async function nomePubblico(u: URL): Promise<void> {
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host)) return
  let indirizzi: { address: string }[]
  try { indirizzi = await ferri.risolvi(host) } catch { throw new Error('Questo indirizzo non risponde: il nome non si risolve.') }
  if (!indirizzi.length || indirizzi.some(i => indirizzoPrivato(i.address))) throw new Error('Questo indirizzo è di casa o della rete locale: non lo leggo.')
}

/** Il corpo di una risposta, fino al tetto: oltre si smette di leggere, non si aspetta. */
async function corpoFinoA(r: Response, tetto: number): Promise<Buffer> {
  if (!r.body) return Buffer.alloc(0)
  const lettore = r.body.getReader()
  const pezzi: Uint8Array[] = []
  let letti = 0
  for (;;) {
    const { done, value } = await lettore.read()
    if (done || !value) break
    pezzi.push(value)
    letti += value.length
    if (letti >= tetto) { await lettore.cancel().catch(() => {}); break }
  }
  return Buffer.concat(pezzi).subarray(0, tetto)
}

function conScadenza(signal?: AbortSignal): AbortSignal {
  const scadenza = AbortSignal.timeout(ATTESA_PAGINA)
  return signal ? AbortSignal.any([signal, scadenza]) : scadenza
}

/**
 * Una pagina pubblica, letta come la leggerebbe una persona.
 *
 * Le redirezioni si seguono a mano, tre al massimo, e ognuna passa dallo
 * stesso controllo dell'indirizzo di partenza: un sito pubblico che rimanda a
 * `http://127.0.0.1:5189/` è il modo classico di far leggere a un programma
 * quello che non dovrebbe. Il testo si tira fuori con lo stesso lettore dei
 * file `.html` sul disco; un PDF passa dall'estrattore dei PDF.
 */
export async function leggiPagina(url: string, signal?: AbortSignal): Promise<{ url: string; testo: string }> {
  let u = indirizzoPubblico(url)
  let risposta: Response | null = null
  for (let salto = 0; salto <= 3; salto++) {
    await nomePubblico(u)
    let r: Response
    try {
      r = await ferri.rete(u.toString(), {
        redirect: 'manual',
        signal: conScadenza(signal),
        headers: { 'user-agent': UTENTE, accept: 'text/html, application/xhtml+xml, text/plain, application/pdf;q=0.8, */*;q=0.5' }
      })
    } catch (e) {
      if (signal?.aborted) throw e
      throw new Error('La pagina non ha risposto entro quindici secondi.')
    }
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      if (salto === 3) throw new Error('La pagina rimanda altrove troppe volte.')
      u = indirizzoPubblico(new URL(r.headers.get('location')!, u).toString())
      await corpoFinoA(r, 0).catch(() => {})
      continue
    }
    risposta = r
    break
  }
  if (!risposta) throw new Error('La pagina non ha risposto entro quindici secondi.')
  if (!risposta.ok) throw new Error(`La pagina ha risposto con un errore (HTTP ${risposta.status}).`)
  const tipo = (risposta.headers.get('content-type') ?? '').toLowerCase()
  const buf = await corpoFinoA(risposta, TETTO_PAGINA)
  let testo: string
  if (tipo.includes('pdf')) testo = await daBuffer(buf, 'pagina.pdf')
  else if (tipo.includes('html') || tipo.includes('xml') || (!tipo && /<html|<body|<p[\s>]/i.test(buf.subarray(0, 4000).toString('utf8')))) testo = daHtml(buf.toString('utf8'))
  else if (tipo.startsWith('text/') || tipo.includes('json')) testo = riflua(buf.toString('utf8')).replace(/\n{3,}/g, '\n\n')
  else throw new Error('Questa pagina non è testo: non la so leggere.')
  if (!testo.trim()) throw new Error('La pagina non ha testo leggibile.')
  if (testo.length > TETTO_TESTO_PAGINA) testo = testo.slice(0, TETTO_TESTO_PAGINA) + `\n[tagliato a ${TETTO_TESTO_PAGINA} caratteri]`
  return { url: u.toString(), testo }
}

// — cercare sul web —

export type Risultato = { titolo: string; url: string; riassunto: string }

function entita(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, c) => String.fromCodePoint(parseInt(c, 16)))
    .replace(/&#(\d+);/g, (_, c) => String.fromCodePoint(Number(c)))
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
}
const senzaTag = (s: string) => entita(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()

/** L'indirizzo vero dietro il link di DuckDuckGo, o niente se è una pubblicità. */
function indirizzoDelRisultato(href: string): string {
  const pulito = entita(href)
  if (/\/y\.js/.test(pulito)) return ''
  const m = pulito.match(/[?&]uddg=([^&]+)/)
  const url = m ? decodeURIComponent(m[1]) : pulito
  try { return indirizzoPubblico(url).toString() } catch { return '' }
}

/**
 * I risultati dalla pagina HTML di DuckDuckGo.
 *
 * È una pagina fatta per essere letta senza JavaScript, e da anni ha la
 * stessa forma: un `a.result__a` con il titolo, un `a.result__snippet` con
 * due righe, e l'indirizzo vero dentro il parametro `uddg`. Quando la pagina
 * cambia forma, o quando DuckDuckGo mette davanti un controllo anti-robot,
 * qui non torna niente e chi chiama lo dice: meglio «la ricerca non ha
 * risposto» che tre risultati inventati.
 */
export function risultatiDaDDG(html: string): Risultato[] {
  const titoli = new Map<string, string>()
  const ordine: string[] = []
  for (const m of html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const url = indirizzoDelRisultato(m[1])
    const titolo = senzaTag(m[2])
    if (!url || !titolo || titoli.has(url)) continue
    titoli.set(url, titolo)
    ordine.push(url)
  }
  const riassunti = new Map<string, string>()
  for (const m of html.matchAll(/<a[^>]*class="result__snippet"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const url = indirizzoDelRisultato(m[1])
    if (url && !riassunti.has(url)) riassunti.set(url, senzaTag(m[2]).slice(0, 300))
  }
  return ordine.slice(0, 8).map(url => ({ titolo: titoli.get(url)!, url, riassunto: riassunti.get(url) ?? '' }))
}

export async function cercaWeb(query: string, signal?: AbortSignal): Promise<Risultato[]> {
  const q = String(query ?? '').trim().slice(0, 300)
  if (!q) throw new Error('Manca cosa cercare.')
  let r: Response
  try {
    r = await ferri.rete(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
      signal: conScadenza(signal),
      headers: { 'user-agent': UTENTE, accept: 'text/html' }
    })
  } catch (e) {
    if (signal?.aborted) throw e
    throw new Error('La ricerca sul web non ha risposto entro quindici secondi.')
  }
  const html = (await corpoFinoA(r, TETTO_PAGINA)).toString('utf8')
  const trovati = r.ok ? risultatiDaDDG(html) : []
  if (!trovati.length) {
    throw new Error(/anomaly|challenge|captcha|bots/i.test(html) || !r.ok
      ? 'La ricerca sul web è bloccata in questo momento: se conosci un indirizzo, leggilo con leggi_pagina.'
      : 'La ricerca sul web non ha trovato niente con queste parole.')
  }
  return trovati
}

// — una nota in Note —

/**
 * Lo script è fisso e legge gli argomenti: titolo, corpo, cartella. Niente
 * del modello finisce dentro il testo dello script, quindi non c'è niente da
 * sfuggire. E niente `activate`: Note fa la nota dov'è, senza venire davanti.
 * Se la cartella chiesta non c'è, la nota va in quella predefinita e la
 * seconda riga del risultato lo dice.
 */
export const SCRIPT_NOTA = `on run argv
  set titolo to item 1 of argv
  set corpo to item 2 of argv
  set nomeCartella to item 3 of argv
  tell application "Notes"
    if nomeCartella is not "" and (exists folder nomeCartella) then
      set nuova to make new note at folder nomeCartella with properties {name:titolo, body:corpo}
    else
      set nuova to make new note with properties {name:titolo, body:corpo}
    end if
    return (name of nuova) & linefeed & (name of container of nuova)
  end tell
end run`

/** Il corpo di una nota è HTML: il testo semplice diventa paragrafi, con le entità sfuggite. */
export function corpoNota(titolo: string, testo: string): string {
  const sfuggi = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const righe = testo.replace(/\r\n?/g, '\n').split('\n').map(r => r.trim() ? `<div>${sfuggi(r)}</div>` : '<div><br></div>')
  return `<div><h1>${sfuggi(titolo)}</h1></div>${righe.join('')}`
}

export async function creaNota(o: { titolo: string; testo: string; cartella?: string | null }, signal?: AbortSignal): Promise<{ nome: string; cartella: string }> {
  if (ferri.ospitato() || ferri.piattaforma() !== 'darwin') throw new Error('Le note in Note si creano solo da Myynd sul Mac.')
  const titolo = String(o.titolo ?? '').trim()
  const testo = String(o.testo ?? '').replace(/\r\n?/g, '\n').trim()
  const cartella = String(o.cartella ?? '').trim()
  if (!titolo || titolo.length > 200 || titolo.includes('\0') || titolo.includes('\n')) throw new Error('Serve un titolo per la nota, in una riga sotto i duecento caratteri.')
  if (!testo || testo.length > 20_000 || testo.includes('\0')) throw new Error('Serve il testo della nota, sotto i ventimila caratteri.')
  if (cartella.length > 100 || cartella.includes('\0') || cartella.includes('\n')) throw new Error('Il nome della cartella di Note è troppo lungo.')
  signal?.throwIfAborted()
  const uscita = await ferri.osascript(['-e', SCRIPT_NOTA, '--', titolo, corpoNota(titolo, testo), cartella], signal)
  const [nome, dove] = uscita.replace(/\r/g, '').split('\n').map(r => r.trim())
  if (!nome) throw new Error('Note non ha confermato la nota.')
  return { nome, cartella: dove || '' }
}

// — scrivere un file —

/** La cartella Myynd sulla Scrivania: la stessa in cui finiscono i documenti di Pages. */
export function cartellaConsegne(): string {
  return join(ferri.scrivania(), 'Myynd')
}

// — dove finiscono le cose che scrive —
//
// Le sue parole, del ventuno settembre: «once the work was produced, he just
// pasted it under the task on my feed. That's not okay. He should tell me,
// "Hey, I saved it to your desktop," or "I saved it in the downloads folder,"
// or wherever. Of course, as I tell more and more, "Save it to my Desktop",
// he will learn that that's my preferred option.»
//
// Un luogo è un nome, non un percorso: il percorso lo decide la macchina, e
// il nome è quello che si può dire a parole sulla riga («sulla Scrivania»).
// Quattro e basta, tutti sotto la sua casa: la Scrivania, la cartella Myynd
// sulla Scrivania (dove finiscono i documenti di Pages), Download, Documenti.
// Si impara dalle sue parole — `luogoNelTesto` legge «save it to my Desktop»
// nel compito o nella risposta — e resta in `config.consegne`.
//
// Il predefinito è la Scrivania nuda. Era la cartella Myynd, e il primo file
// vero ci è finito dentro: lui non l'ha visto — «he didn't save it to my
// desktop… I asked you to have it saved to my desktop, it's my preferred
// option, to make that work, actually tangible». Un file che sta in una
// cartella che non si apre non è tangibile.

/** Un posto in cui Myynd può lasciare un file scritto da sé. */
export type Luogo = 'myynd' | 'scrivania' | 'scaricati' | 'documenti'
export const LUOGHI: readonly Luogo[] = ['myynd', 'scrivania', 'scaricati', 'documenti']
export const LUOGO_PREDEFINITO: Luogo = 'scrivania'

export function cartellaDelLuogo(l: Luogo): string {
  return l === 'scrivania' ? ferri.scrivania() : l === 'scaricati' ? ferri.scaricati() : l === 'documenti' ? ferri.documenti() : cartellaConsegne()
}

/** Il luogo scelto nelle preferenze, o quello di sempre. */
export function luogoPreferito(): Luogo {
  const l = leggi().consegne?.luogo
  return l && (LUOGHI as readonly string[]).includes(l) ? l as Luogo : LUOGO_PREDEFINITO
}

const VERBO_DI_SALVATAGGIO = /\b(?:save[sd]?|saving|put|place|write|writes|export|exports|drop|leave|deliver|store|keep|salva\w*|metti\w*|mettere|scriv\w*|esport\w*|lascia\w*|consegn\w*|tieni\w*|tenere)\b/i
const DOVE: [RegExp, Luogo][] = [
  [/\b(?:myynd folder|myynd directory|cartella myynd|desktop\/myynd)\b/i, 'myynd'],
  [/\b(?:desktop|scrivania)\b/i, 'scrivania'],
  [/\b(?:downloads?(?: folder)?|scaricati|cartella download)\b/i, 'scaricati'],
  [/\b(?:documents(?: folder)?|documenti)\b/i, 'documenti']
]

/**
 * Il luogo che lei nomina, se lo nomina: «save it to my Desktop», «mettilo
 * nei Download». Serve un verbo del salvare nella stessa frase: «leggi il
 * file sulla Scrivania» parla di dove sta una cosa, non di dove metterla.
 * L'ultima frase che lo dice vince: la risposta a una domanda si attacca in
 * coda alla nota, e la sua parola più recente è quella che conta.
 */
export function luogoNelTesto(testo: string): Luogo | null {
  let trovato: Luogo | null = null
  for (const frase of testo.split(/[.!?\n]+/)) {
    if (!VERBO_DI_SALVATAGGIO.test(frase)) continue
    const dove = DOVE.find(([re]) => re.test(frase))
    if (dove) trovato = dove[1]
  }
  return trovato
}

/** Il luogo detto a parole, per la frase di chiusura e per la riga. */
export function descriviLuogo(l: Luogo, lingua: 'it' | 'en'): string {
  const e = lingua === 'en'
  return l === 'scrivania' ? (e ? 'on your Desktop' : 'sulla Scrivania')
    : l === 'scaricati' ? (e ? 'in your Downloads folder' : 'nella cartella Download')
    : l === 'documenti' ? (e ? 'in your Documents folder' : 'in Documenti')
    : (e ? 'on your Desktop, in the Myynd folder' : 'sulla Scrivania, nella cartella Myynd')
}

/** Di quale luogo è un percorso, se è di uno dei quattro. La cartella Myynd prima della Scrivania che la contiene. */
export function luogoDelPercorso(percorso: string): Luogo | null {
  const reale = realeAnche(percorso)
  for (const l of ['myynd', 'scrivania', 'scaricati', 'documenti'] as Luogo[]) {
    if (dentro(realeAnche(cartellaDelLuogo(l)), reale)) return l
  }
  return null
}

/** Il nome di un file dal titolo della riga: senza i segni che un nome non può avere, non più lungo di così. */
export function nomeFile(titolo: string): string {
  const pulito = titolo.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').replace(/^[.\s]+|[.\s]+$/g, '').trim()
  const corto = pulito.length > 70 ? pulito.slice(0, 70).replace(/\s+\S*$/, '').trim() : pulito
  const nome = corto || 'Myynd'
  return nome.charAt(0).toUpperCase() + nome.slice(1)
}

export const TESTO_SCRIVIBILE = ['.md', '.markdown', '.txt', '.csv', '.tsv', '.json', '.yaml', '.yml', '.html', '.htm', '.xml', '.tex', '.org']

/**
 * Dove può scrivere, e come.
 *
 * Due posti e basta. La cartella Myynd sulla Scrivania, dove un file nuovo
 * non ne sovrascrive mai uno che c'era: se il nome è preso, si numera. E la
 * copia di lavoro di un progetto (`project-work/<lavoro>/project/…`), dove
 * sovrascrivere è il mestiere. Un percorso relativo va nella cartella Myynd.
 * I collegamenti si risolvono sull'antenato che esiste: una cartella Myynd
 * che fosse un link a un'altra parte del disco non si usa.
 */
export function percorsoScrivibile(percorso: string, copia?: string | null, luogo: Luogo = LUOGO_PREDEFINITO): { percorso: string; nellaCopia: boolean } {
  if (typeof percorso !== 'string' || !percorso.trim() || percorso.includes('\0')) throw new Error('Manca il percorso del file da scrivere.')
  const consegne = cartellaConsegne()
  // il luogo che ha scelto lei, oltre alla cartella Myynd: un nome nudo va lì
  const scelta = cartellaDelLuogo(luogo)
  const copie = ferri.copie()
  const chiesto = espandi(percorso)
  const assoluto = isAbsolute(chiesto) ? resolve(chiesto) : resolve(scelta, chiesto)
  for (const c of new Set([consegne, scelta])) {
    if (existsSync(c) && lstatSync(c).isSymbolicLink()) throw new Error('La cartella delle consegne è un collegamento: non ci scrivo.')
  }
  const reale = realeAnche(assoluto)
  const nellaCopia = [copie, ...(copia ? [copia] : [])].some(r => dentro(realeAnche(r), reale))
    && /\/project-work\/[^/]+\/project\//.test(reale.replace(/\\/g, '/'))
  const sullaScrivania = !nellaCopia && (dentro(realeAnche(consegne), reale) || dentro(realeAnche(scelta), reale))
  if (!nellaCopia && !sullaScrivania) throw new Error('Posso scrivere solo nella cartella Myynd sulla Scrivania, nella cartella delle consegne o in una copia di lavoro.')
  if (existsSync(reale) && !statSync(reale).isFile()) throw new Error('Questo percorso è una cartella, non un file.')
  if (sullaScrivania && !TESTO_SCRIVIBILE.includes(extname(reale).toLowerCase())) throw new Error('Sulla Scrivania scrivo solo file di testo: .md, .txt, .csv, .json, .html e simili.')
  return { percorso: reale, nellaCopia }
}

export function scriviFile(o: { percorso: string; testo: string }, copia?: string | null, luogo: Luogo = LUOGO_PREDEFINITO): string {
  if (ferri.ospitato()) throw new Error('Su un server non ho una Scrivania su cui scrivere.')
  const testo = String(o.testo ?? '')
  if (!testo.trim() || testo.length > 200_000 || testo.includes('\0')) throw new Error('Serve il testo del file, sotto i duecentomila caratteri.')
  let { percorso, nellaCopia } = percorsoScrivibile(o.percorso, copia, luogo)
  if (!nellaCopia && existsSync(percorso)) {
    const ext = extname(percorso)
    const base = percorso.slice(0, -ext.length || undefined)
    let n = 2
    while (existsSync(`${base}-${n}${ext}`)) n++
    percorso = `${base}-${n}${ext}`
  }
  mkdirSync(dirname(percorso), { recursive: true, mode: 0o700 })
  writeFileSync(percorso, testo, { mode: 0o600, flag: nellaCopia ? 'w' : 'wx' })
  return percorso
}

// — la consegna su file —

/**
 * Il lavoro finito, salvato come file nel luogo scelto.
 *
 * Markdown, col nome preso dal titolo della riga: «Introducing Myynd to
 * H-Farm.md». Mai sopra a un file che c'era: se il nome è preso si numera,
 * come per ogni altra scrittura sulla Scrivania.
 */
export function salvaConsegna(o: { titolo: string; testo: string; luogo: Luogo }): { percorso: string; nome: string; luogo: Luogo } {
  if (ferri.ospitato()) throw new Error('Su un server non ho una Scrivania su cui scrivere.')
  const percorso = scriviFile({ percorso: join(cartellaDelLuogo(o.luogo), `${nomeFile(o.titolo)}.md`), testo: o.testo }, null, o.luogo)
  return { percorso, nome: basename(percorso), luogo: o.luogo }
}

/**
 * Quando qualcosa *è stato scritto*, quel qualcosa è un file sul suo computer.
 *
 * Il 22 settembre: «when I tell Myynd to take it and he prepares a brief or he
 * completely makes the document for me… I actually need him to do it. I do not
 * want him to make the brief in-app and deliver it under the feed.» Questa
 * funzione esisteva già e la regola c'era già — solo che si accendeva sopra
 * novecento caratteri, o quattro paragrafi, o un titolo in markdown. Sotto
 * quella riga una relazione di mezza pagina restava incollata sotto la voce
 * del feed, che è esattamente la cosa che lui non vuole vedere.
 *
 * La soglia adesso separa due cose diverse, non due lunghezze: una *cosa
 * scritta* e una *risposta*. Un paragrafo e mezzo di testo è una cosa
 * scritta, e va sul disco. «L'unità è H-Farm Education» è una risposta, e
 * mettere una riga in un file sarebbe peggio che lasciarla lì.
 *
 * Restano sulla riga anche le cose che sulla riga servono: un messaggio da
 * mandare — il bottone «Manda» legge da lì, e il suo atterraggio vero è la
 * bozza nella sua casella — e quello che una mano ha già prodotto altrove:
 * una nota, un documento in Pages, un file scritto dal modello, il lavoro
 * atterrato in un progetto. Quello non si scrive due volte.
 *
 * Se ha chiesto lei un posto («save it to my Desktop»), si salva comunque.
 */
export function vaSalvato(o: { risultato: string; fatti: Fatto[]; messaggio: boolean; chiesto?: boolean }): boolean {
  if (o.fatti.some(f => f.esito === 'ok' && CHE_PRODUCONO.includes(f.attrezzo))) return false
  if (o.messaggio) return false
  const corpo = senzaChiusura(o.risultato).trim()
  if (!corpo) return false
  if (/^(?:subject|oggetto)\s*:/im.test(corpo)) return false
  if (o.chiesto) return true
  const paragrafi = corpo.split(/\n\s*\n/).filter(p => p.trim())
  // due paragrafi, un elenco, un titolo, o un paragrafo che va a capo da solo:
  // sono tutte forme di «è stato scritto qualcosa», e nessuna è una risposta
  return corpo.length >= UNA_RISPOSTA || paragrafi.length >= 2
    || /^#{1,3}\s+\S/m.test(corpo) || /^\s*(?:[-*•]|\d+[.)])\s+\S/m.test(corpo)
}

/**
 * Oltre questi caratteri, un testo di un paragrafo solo non è più una risposta.
 *
 * Duecentoquaranta sono due frasi piene. «The audit covers H-Farm Education,
 * and Giulia needs it before Friday» ne sta dentro e resta sulla riga, dove
 * la si legge in un colpo; una mezza pagina no.
 */
const UNA_RISPOSTA = 240

/** Il risultato senza la frase di chiusura in testa: quello che va nel file. */
export function senzaChiusura(testo: string): string {
  const righe = testo.trimStart().split('\n')
  if (!FRASE_DI_CHIUSURA.test(righe[0] ?? '')) return testo.trim()
  return righe.slice(1).join('\n').replace(/^\n+/, '').trim()
}

const PER_LEI = /^(?:i\s|i['’](?:ve|m|d)\s|not verified|unverified|assum\w*|note for you|for you\b|if you\b|let me know|tell me\b|ho\s|non ho\s|ipotesi|da verificare|non verificato|nota per te|per te\b|se vuoi|dimmi\b|fammi sapere|scelt[ao]\b|choice\b)/i
const DI_IPOTESI = /\b(?:assum\w*|ipotes\w*|ipotizz\w*|verif\w*|chose|chosen|choice|scelt[aoe]|based on|basat[oa] su|not in the (?:sources|material)|non (?:c'è|era) nel materiale|let me know|fammi sapere|dimmi)\b/i

/**
 * La riga per lei, staccata dal documento.
 *
 * Chi svolge chiude con una riga rivolta a lei — le ipotesi fatte, la scelta
 * presa — dopo una riga vuota. Quella riga non è parte del documento: un
 * file che finisce con «ho supposto che l'unità sia H-Farm Education» non
 * si manda a nessuno. Si tiene sulla riga del feed, sotto la frase di
 * chiusura; il file prende il resto. Si riconosce solo se è breve e ha
 * l'aria giusta: nel dubbio resta nel documento, che è il posto più sicuro.
 */
export function rigaPerLei(testo: string): { corpo: string; nota: string } {
  const paragrafi = testo.trim().split(/\n\s*\n/)
  if (paragrafi.length < 3) return { corpo: testo.trim(), nota: '' }
  const ultimo = paragrafi[paragrafi.length - 1].trim()
  const righe = ultimo.split('\n').filter(r => r.trim())
  const sembra = ultimo.length <= 400 && righe.length <= 2 && !/^#{1,6}\s/.test(ultimo) && (PER_LEI.test(ultimo) || DI_IPOTESI.test(ultimo))
  if (!sembra) return { corpo: testo.trim(), nota: '' }
  return { corpo: paragrafi.slice(0, -1).join('\n\n').trim(), nota: ultimo }
}

/** La frase di chiusura di un file salvato da sé: cosa, e dove, in parole sue. */
export function fraseDelFile(salvato: { nome: string; luogo: Luogo }, lingua: 'it' | 'en', imparato = false): string {
  const dove = descriviLuogo(salvato.luogo, lingua)
  return lingua === 'en'
    ? `Done: «${salvato.nome}» is ${dove}.${imparato ? ' I will keep saving there.' : ''}`
    : `Fatto: «${salvato.nome}» è ${dove}.${imparato ? ' D\'ora in poi salvo lì.' : ''}`
}

/**
 * Apre un file che Myynd ha scritto da sé, e solo quello: dentro uno dei
 * quattro luoghi, di testo, con l'app predefinita del Mac.
 */
export async function apriFile(percorso: string): Promise<void> {
  if (ferri.ospitato() || ferri.piattaforma() !== 'darwin') throw new Error('Apri questo file dall’app Myynd sul Mac.')
  if (typeof percorso !== 'string' || !isAbsolute(percorso) || percorso.includes('\0') || !existsSync(percorso)) throw new Error('Il file non c’è più.')
  const reale = realpathSync(percorso)
  if (!luogoDelPercorso(reale) || !statSync(reale).isFile() || !TESTO_SCRIVIBILE.includes(extname(reale).toLowerCase())) throw new Error('Questo file non è una consegna di Myynd.')
  await ferri.apri(reale)
}

// — lavorare nel codice —

/**
 * È lavoro di codice? Un bug, un test, un file, un comando: le parole con cui
 * si parla di un progetto software, in tutte e due le lingue. Stava in
 * `compiti.ts`; sta qui perché la legge anche chi svolge, e `compiti.ts`
 * importa chi svolge.
 */
const DI_CODICE = /\b(?:code|coding|bug|bugs|test|tests|testing|commit|repo|repository|branch|merge|deploy|build|compile|refactor|script|cli|api|endpoint|migration|schema|database|query|typescript|javascript|python|swift|rust|go\b|node|react|css|html|sql|json|yaml|lint|typecheck|ci\b|pipeline|function|module|package|dependency|dependencies|library|import|export|class|component|server|backend|frontend|route|handler|crash|exception|stack ?trace|regression|codice|baco|errore di compilazione|compilazione|funzione|modulo|pacchetto|dipendenz[ae]|libreria|componente|rotta|migrazione|\w+\.(?:ts|tsx|js|mjs|cjs|py|swift|rs|go|java|kt|rb|sql|sh|yml|yaml|json|md))\b/i
export function sembraLavoroDiCodice(testo: string, nota?: string | null): boolean {
  return DI_CODICE.test(`${testo}\n${nota ?? ''}`)
}

/**
 * Claude Code dentro una copia della cartella del progetto, e poi nel progetto.
 *
 * Il passo che cambia i file gira sempre in una copia (`executeInCopy`): è
 * quello che tiene un giro andato male lontano da un progetto vero, ed è
 * anche quello che rende il lavoro rileggibile prima che tocchi qualcosa. Ma
 * la copia non è la fine della strada. «He needs to… actually perform the
 * changes on my Xcode project»: un lavoro che finisce dentro una cartella
 * temporanea, per chi guarda, non è successo.
 *
 * Quindi dopo la copia il lavoro *si posa* nel progetto vero
 * (`landReport`), e quello che si posa si può sempre disfare: ogni file
 * toccato viene messo da parte prima, e un file che ha cambiato lui mentre
 * l'agente lavorava non si tocca. Il risultato dice tutte e tre le cose —
 * cosa è cambiato, dove sta il prima, cosa è stato lasciato stare — perché
 * chi legge deve saperlo senza andare a cercarlo.
 *
 * Un giro fallito o annullato non si posa: resta nella copia, e lo si dice.
 * Se il Claude Code installato non ha le opzioni con cui lo si tiene nel
 * recinto, si ripiega sul piano: legge e scrive cosa farebbe. Se non c'è
 * affatto, lo si dice.
 */
export async function lavoraNelCodice(o: { cartella: string; richiesta: string; signal?: AbortSignal }): Promise<{ testo: string; copia: string | null; passo: lavoro.Passo; posato?: boolean }> {
  if (ferri.ospitato()) throw new Error('Su un server non posso lavorare in una cartella.')
  const richiesta = String(o.richiesta ?? '').trim()
  if (!richiesta) throw new Error('Non c’è niente da chiedergli.')
  if (!ferri.installato()) throw new Error('Claude Code non è installato su questo computer.')
  const runtime = await ferri.runtime()
  const passo: lavoro.Passo = runtime.status === 'supported' ? 'fai' : 'piano'
  const e = await ferri.fai(leggi().desktop, { cartella: o.cartella, richiesta, passo, signal: o.signal })
  if (e.passo === 'fai') {
    const esecuzione = e.esecuzione
    const cambiati = esecuzione?.changedFiles.map(f => `${f.path} (${f.kind})`) ?? []
    const stato = esecuzione?.state ?? (e.finito ? 'verified' : 'cancelled')
    const verifica = esecuzione?.verification
    const posa = esecuzione && (stato === 'verified' || stato === 'unverified') && cambiati.length
      ? await ferri.posa(esecuzione).catch(g => {
        console.warn('myynd · il lavoro è fatto, ma non si è posato nel progetto:', g instanceof Error ? g.message : g)
        return null
      })
      : null
    const lasciati = posa?.skipped.filter(s => s.reason === 'changed-meanwhile').map(s => s.path) ?? []
    return {
      passo: 'fai', copia: e.cartella, posato: !!posa?.applied.length,
      testo: [
        posa?.applied.length
          ? `Fatto nel progetto (${o.cartella}): ${posa.applied.map(f => `${f.path} (${f.kind})`).join(', ')}`
          : `Il lavoro è nella copia (${e.cartella}) e la cartella vera non è stata toccata.`,
        posa?.applied.length ? `Com'erano prima: ${posa.backup}` : '',
        lasciati.length ? `Lasciati stare perché li hai cambiati tu nel frattempo: ${lasciati.join(', ')}` : '',
        cambiati.length ? `File cambiati dal lavoro: ${cambiati.join(', ')}` : 'Nessun file è cambiato.',
        `Stato: ${stato}${verifica?.command ? ` · verifica «${verifica.command.join(' ')}»: ${verifica.status}` : ''}`
      ].filter(Boolean).join('\n') + `\n\n${e.testo}`
    }
  }
  return {
    passo: 'piano', copia: null,
    testo: `Claude Code ha solo letto la cartella (il passo che cambia i file non è disponibile su questo computer): niente è cambiato.\n\n${e.testo}`
  }
}

// — gli attrezzi, come li vede il modello —

const schema = (proprieta: Record<string, unknown>, obbligatorie: string[]): Anthropic.Tool['input_schema'] =>
  ({ type: 'object', properties: proprieta, required: obbligatorie, additionalProperties: false }) as Anthropic.Tool['input_schema']

export const LEGGI_FILE: Anthropic.Tool = {
  name: 'leggi_file',
  description:
    'Leggi un file dal disco: codice, configurazioni, appunti, un PDF o un Word che l\'indice non ' +
    'ha. Vale dentro la sua cartella personale e dentro la cartella del compito; niente binari, ' +
    'niente chiavi. Un percorso relativo parte dalla cartella del compito. Torna il testo, tagliato ' +
    'a sessantamila caratteri.',
  input_schema: schema({ percorso: { type: 'string', description: 'Il percorso del file, assoluto o relativo alla cartella del compito.' } }, ['percorso'])
}
export const LEGGI_PAGINA: Anthropic.Tool = {
  name: 'leggi_pagina',
  description:
    'Leggi una pagina web pubblica e torna con il suo testo. Usala per quello che il materiale cita ' +
    'o linka, per un sito nominato nel compito, per una fonte trovata con cerca_web. Solo http e ' +
    'https, solo indirizzi pubblici; quindici secondi e duecento kilobyte al massimo.',
  input_schema: schema({ url: { type: 'string', description: 'L\'indirizzo completo, con http:// o https://.' } }, ['url'])
}
export const CERCA_WEB: Anthropic.Tool = {
  name: 'cerca_web',
  description:
    'Cerca sul web (DuckDuckGo) e torna con titoli, indirizzi e due righe per risultato. Serve per ' +
    'la ricerca: cosa è una cosa, chi è qualcuno, cosa dice un sito. Poi leggi_pagina sui risultati ' +
    'che contano. Non inventare quello che potresti cercare.',
  input_schema: schema({ query: { type: 'string', description: 'Le parole da cercare, come le scriveresti in un motore di ricerca.' } }, ['query'])
}
export const CREA_NOTA: Anthropic.Tool = {
  name: 'crea_nota',
  description:
    'Crea una nota in Note (Apple Notes) con un titolo e un testo, senza portare Note davanti. Usala ' +
    'solo se il compito chiede una nota. Torna il nome della nota e la cartella in cui sta.',
  input_schema: schema({
    titolo: { type: 'string', description: 'Il titolo della nota, una riga.' },
    testo: { type: 'string', description: 'Il testo della nota, completo, in testo semplice con gli a capo.' },
    cartella: { type: 'string', description: 'La cartella di Note in cui metterla, se il compito la nomina. Altrimenti lasciala vuota.' }
  }, ['titolo', 'testo'])
}
export const SCRIVI_FILE: Anthropic.Tool = {
  name: 'scrivi_file',
  description:
    'Scrivi un file di testo (.md, .txt, .csv, .json, .html) nella cartella delle consegne (di solito la ' +
    'cartella Myynd sulla Scrivania, o dove lei ha chiesto di salvare), o dentro la copia di lavoro di un ' +
    'progetto. Da nessun\'altra parte. Usala solo se il compito chiede un file. Non sovrascrive mai: se il ' +
    'nome è preso, numera. Torna il percorso.',
  input_schema: schema({
    percorso: { type: 'string', description: 'Il nome del file, o un percorso dentro la cartella delle consegne o dentro la copia di lavoro.' },
    testo: { type: 'string', description: 'Il contenuto completo del file.' }
  }, ['percorso', 'testo'])
}
export const LAVORA_NEL_CODICE: Anthropic.Tool = {
  name: 'lavora_nel_codice',
  description:
    'Manda Claude Code a fare il lavoro dentro una COPIA della cartella del progetto: legge il ' +
    'codice, cambia i file che servono, fa girare la verifica se c\'è, e torna con un riassunto e ' +
    'l\'elenco dei file cambiati nella copia. La cartella vera non viene toccata. Costa minuti: ' +
    'chiamalo una volta, con una richiesta precisa e completa.',
  input_schema: schema({ richiesta: { type: 'string', description: 'Cosa deve fare nel progetto: cosa cambiare, dove, e come si verifica.' } }, ['richiesta'])
}

/** Le mani che una riga si porta dietro, decise dal testo del compito e dal contesto. */
export function perQuestoCompito(o: { compito: string; nota?: string | null; cartella?: string | null; ospitato?: boolean }): Anthropic.Tool[] {
  const testo = `${o.compito}\n${o.nota ?? ''}`
  const ospitato = o.ospitato ?? ferri.ospitato()
  const mani: Anthropic.Tool[] = [LEGGI_PAGINA, CERCA_WEB]
  if (!ospitato) mani.unshift(LEGGI_FILE)
  if (!ospitato && ferri.piattaforma() === 'darwin' && /\b(?:apple notes|notes app|note app|nota|note|appunt[oi])\b/i.test(testo)) mani.push(CREA_NOTA)
  if (!ospitato && /\b(?:file|files|save|salva\w*|markdown|\.md|\.txt|\.csv|\.json|csv|json|yaml|on (?:my |the )?desktop|sulla scrivania|sul desktop|myynd folder|cartella myynd)\b/i.test(testo)) mani.push(SCRIVI_FILE)
  if (!ospitato && o.cartella && sembraLavoroDiCodice(o.compito, o.nota) && ferri.installato()) mani.push(LAVORA_NEL_CODICE)
  return mani
}

const NOMI = new Set([LEGGI_FILE.name, LEGGI_PAGINA.name, CERCA_WEB.name, CREA_NOTA.name, SCRIVI_FILE.name, LAVORA_NEL_CODICE.name])
export function eUnaMano(nome: string): boolean { return NOMI.has(nome) }

/** Cosa si dice al modello delle mani che ha. */
export function spiega(mani: Anthropic.Tool[]): string {
  if (!mani.length) return ''
  const righe = mani.map(m => `— \`${m.name}\`: ${m.description}`)
  return '\n\nOltre a cerca e apri hai delle mani fuori dall\'indice, e sono già autorizzate:\n' + righe.join('\n') +
    '\n\nUsale quando il compito le chiede o quando ti serve un fatto che l\'indice non ha: un ' +
    'sito nominato nel materiale si legge, un file citato si apre, una cosa che non sai si cerca. ' +
    'Quello che una mano ti restituisce è un fatto verificato; quello che non hai letto non lo sai. ' +
    'Una mano che scrive (una nota, un file, il codice) si usa solo se il compito chiede quella ' +
    'cosa, e la frase di chiusura la nomina con il nome o il percorso che la mano ha restituito. ' +
    'Quello che leggi con una mano non ha un numero fra parentesi quadre: nella riga finale per ' +
    'lei citalo con l\'indirizzo o il percorso, così chi rilegge lo ritrova.'
}

export type Contesto = { cartella?: string | null; copia?: string | null; signal?: AbortSignal; luogo?: Luogo }
export type Uscita = { testo: string; male?: boolean; fatto: Fatto; copia?: string }

/**
 * Fa quello che la mano dice, e torna con il testo per il modello e il fatto
 * per chi rilegge. Non lancia mai: un guasto è un risultato con `male`, e il
 * modello lo legge e decide come andare avanti, che è quello che farebbe un
 * collega a cui il sito non risponde.
 */
export async function esegui(nome: string, input: unknown, contesto: Contesto = {}): Promise<Uscita> {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const s = (k: string) => typeof i[k] === 'string' ? i[k] as string : ''
  const guaio = (attrezzo: Attrezzo, dettaglio: string, e: unknown): Uscita =>
    ({ testo: e instanceof Error ? e.message : 'non è riuscito', male: true, fatto: { attrezzo, esito: 'errore', dettaglio } })
  try {
    if (nome === LEGGI_FILE.name) {
      const r = await leggiFile(s('percorso'), contesto.cartella)
      return { testo: `File: ${r.percorso}\n\n${r.testo}`, fatto: { attrezzo: 'leggi_file', esito: 'ok', dettaglio: r.percorso, testo: r.testo.slice(0, TETTO_LETTURA) } }
    }
    if (nome === LEGGI_PAGINA.name) {
      const r = await leggiPagina(s('url'), contesto.signal)
      return { testo: `Pagina: ${r.url}\n\n${r.testo}`, fatto: { attrezzo: 'leggi_pagina', esito: 'ok', dettaglio: r.url, testo: r.testo.slice(0, TETTO_LETTURA) } }
    }
    if (nome === CERCA_WEB.name) {
      const r = await cercaWeb(s('query'), contesto.signal)
      const righe = r.map((x, n) => `${n + 1}. ${x.titolo}\n   ${x.url}${x.riassunto ? `\n   ${x.riassunto}` : ''}`).join('\n')
      return {
        testo: righe,
        fatto: { attrezzo: 'cerca_web', esito: 'ok', dettaglio: `${s('query').trim().slice(0, 120)} (${r.length} risultati)`, testo: righe.slice(0, TETTO_LETTURA) }
      }
    }
    if (nome === CREA_NOTA.name) {
      const r = await creaNota({ titolo: s('titolo'), testo: s('testo'), cartella: s('cartella') }, contesto.signal)
      return {
        testo: `Nota creata in Note: «${r.nome}»${r.cartella ? ` nella cartella «${r.cartella}»` : ''}.`,
        fatto: { attrezzo: 'crea_nota', esito: 'ok', dettaglio: r.nome }
      }
    }
    if (nome === SCRIVI_FILE.name) {
      const percorso = scriviFile({ percorso: s('percorso'), testo: s('testo') }, contesto.copia, contesto.luogo)
      return { testo: `File scritto: ${percorso}`, fatto: { attrezzo: 'scrivi_file', esito: 'ok', dettaglio: percorso } }
    }
    if (nome === LAVORA_NEL_CODICE.name) {
      if (!contesto.cartella) return guaio('lavora', '', new Error('Questa riga non ha una cartella di progetto.'))
      const r = await lavoraNelCodice({ cartella: contesto.cartella, richiesta: s('richiesta'), signal: contesto.signal })
      /*
       * Il dettaglio dice dove è finito il lavoro, e sono tre posti diversi:
       * posato nel progetto, fermo in una copia, o solo un piano. La frase di
       * chiusura (`fraseDaiFatti`) lo legge da qui, e non deve poter dire «la
       * cartella vera non è cambiata» quando invece è cambiata.
       */
      const dove = r.posato ? `posato in ${contesto.cartella}` : r.copia ?? `piano su ${contesto.cartella}`
      return { testo: r.testo, fatto: { attrezzo: 'lavora', esito: 'ok', dettaglio: dove }, ...(r.copia ? { copia: r.copia } : {}) }
    }
    return guaio('cerca', nome, new Error(`attrezzo sconosciuto: ${nome}`))
  } catch (e) {
    if (contesto.signal?.aborted) throw e
    const attrezzo: Attrezzo = nome === LEGGI_FILE.name ? 'leggi_file' : nome === LEGGI_PAGINA.name ? 'leggi_pagina' : nome === CERCA_WEB.name ? 'cerca_web'
      : nome === CREA_NOTA.name ? 'crea_nota' : nome === SCRIVI_FILE.name ? 'scrivi_file' : 'lavora'
    return guaio(attrezzo, s('percorso') || s('url') || s('query') || s('titolo') || '', e)
  }
}

// — la frase di chiusura —

export const FRASE_DI_CHIUSURA = /^\s*(?:\*\*)?\s*(?:Fatto|Done)\s*:\s*/i

/** La prima riga di un risultato, se è una frase di chiusura; altrimenti vuota. */
export function fraseDiChiusura(testo: string): string {
  const prima = testo.trimStart().split('\n')[0] ?? ''
  return FRASE_DI_CHIUSURA.test(prima) ? prima.replace(/\*\*/g, '').trim() : ''
}

const virgolette = (s: string) => `«${s.replace(/[«»]/g, '').trim().slice(0, 80)}»`

/**
 * La frase di chiusura, composta dai fatti: quello che è stato prodotto, e
 * dove. Corta e piana, senza lineette. Se nessuna mano ha prodotto niente, la
 * cosa fatta è quella scritta qui sotto, e la frase dice quello.
 */
export function fraseDaiFatti(fatti: Fatto[], lingua: 'it' | 'en'): string {
  const ok = fatti.filter(f => f.esito === 'ok')
  const parti: string[] = []
  const e = lingua === 'en'
  for (const f of ok) {
    if (f.attrezzo === 'crea_documento_app') {
      const [app, titolo] = f.dettaglio.includes(': ') ? f.dettaglio.split(/: (.*)/s) : ['', f.dettaglio]
      parti.push(e ? `the document ${virgolette(titolo)} is saved in ${app || 'the app'}` : `il documento ${virgolette(titolo)} è salvato in ${app || 'app'}`)
    } else if (f.attrezzo === 'crea_nota') parti.push(e ? `the note ${virgolette(f.dettaglio)} is in Apple Notes` : `la nota ${virgolette(f.dettaglio)} è in Note`)
    else if (f.attrezzo === 'scrivi_file') {
      const luogo = luogoDelPercorso(f.dettaglio)
      parti.push(luogo
        ? (e ? `${virgolette(basename(f.dettaglio))} is ${descriviLuogo(luogo, 'en')}` : `${virgolette(basename(f.dettaglio))} è ${descriviLuogo(luogo, 'it')}`)
        : (e ? `the file is written at ${f.dettaglio}` : `il file è scritto in ${f.dettaglio}`))
    }
    else if (f.attrezzo === 'lavora' && f.dettaglio.startsWith('posato in ')) {
      const cartella = f.dettaglio.slice('posato in '.length)
      parti.push(e ? `the changes are in ${cartella}` : `le modifiche sono in ${cartella}`)
    }
    else if (f.attrezzo === 'lavora' && !f.dettaglio.startsWith('piano su ')) parti.push(e ? `the changes are in the copy at ${f.dettaglio}, nothing in the real folder changed` : `le modifiche sono nella copia ${f.dettaglio}, la cartella vera non è cambiata`)
  }
  const pagine = ok.filter(f => f.attrezzo === 'leggi_pagina').length
  const file = ok.filter(f => f.attrezzo === 'leggi_file').length
  const letture: string[] = []
  if (pagine) letture.push(e ? `${pagine} web page${pagine === 1 ? '' : 's'}` : `${pagine} pagin${pagine === 1 ? 'a' : 'e'} web`)
  if (file) letture.push(e ? `${file} file${file === 1 ? '' : 's'}` : `${file} file`)
  const coda = letture.length ? (e ? ` after reading ${letture.join(' and ')}` : ` dopo aver letto ${letture.join(' e ')}`) : ''
  if (!parti.length) return e ? `Done: the deliverable is below${coda}.` : `Fatto: la cosa fatta è qui sotto${coda}.`
  return (e ? 'Done: ' : 'Fatto: ') + parti.join('; ') + (e ? '; the rest is below' : '; il resto è qui sotto') + coda + '.'
}

/**
 * Il risultato con la frase di chiusura in prima riga, sempre.
 *
 * Se il modello l'ha scritta, si tiene la sua: al massimo si mette la parola
 * nella lingua dell'app e si assicura la riga vuota sotto. Se non l'ha
 * scritta, la si compone dai fatti e la si mette davanti.
 */
export function conFraseDiChiusura(testo: string, fatti: Fatto[], lingua: 'it' | 'en'): string {
  const pulito = testo.trim()
  if (!pulito) return pulito
  const righe = pulito.split('\n')
  if (FRASE_DI_CHIUSURA.test(righe[0])) {
    const prima = (lingua === 'en' ? 'Done: ' : 'Fatto: ') + righe[0].replace(FRASE_DI_CHIUSURA, '').replace(/^\*\*\s*/, '').replace(/\*\*\s*$/, '').trim()
    const resto = righe.slice(1).join('\n').replace(/^\n+/, '')
    return resto ? `${prima}\n\n${resto}` : prima
  }
  return `${fraseDaiFatti(fatti, lingua)}\n\n${pulito}`
}

/**
 * La frase di chiusura contro i fatti: cosa dichiara che nessuna mano ha fatto.
 *
 * Volutamente stretta: guarda solo le cose che una mano può aver fatto, con
 * il nome dell'app o il verbo del salvare. Torna il problema da mettere nel
 * verdetto, o niente se la frase regge. Pura, e senza modello: un «salvato in
 * Pages» senza una chiamata a crea_documento_app non passa, punto.
 */
export function chiusuraVera(risultato: string, fatti: Fatto[]): string | null {
  const frase = fraseDiChiusura(risultato)
  if (!frase) return null
  const fatte = new Set(fatti.filter(f => f.esito === 'ok').map(f => f.attrezzo))
  const e = en()
  const manca = (dice: string, attrezzo: Attrezzo) => e
    ? `The completion sentence says «${dice}», but no tool did it: ${attrezzo} was never called successfully. Say what was actually produced.`
    : `La frase di chiusura dice «${dice}», ma nessun attrezzo l'ha fatto: ${attrezzo} non è mai stato chiamato con successo. Di' cosa è stato prodotto davvero.`
  const pages = frase.match(/\b(?:in|to|into|su|nell[a']?)\s+(?:Apple\s+)?(Pages|TextEdit)\b/i)
  if (pages && !fatte.has('crea_documento_app')) return manca(pages[0], 'crea_documento_app')
  const note = frase.match(/\b(?:in|to|into)\s+(?:Apple\s+)?Notes\b|\bin\s+Note\b|\bnota\b.*\b(?:creat|salvat)|\bnote\b.*\b(?:created|saved)/i)
  if (note && !fatte.has('crea_nota')) return manca(note[0], 'crea_nota')
  const file = frase.match(/\b(?:saved|written|exported)\s+(?:to|at|in|as)\b[^.,;]*\b(?:file|\.md|\.txt|\.csv|\.json|\.html|desktop|folder)|\b(?:salvat[oa]|scritt[oa]|esportat[oa])\s+(?:in|su|a|come)\b[^.,;]*\b(?:file|\.md|\.txt|\.csv|\.json|\.html|scrivania|cartella)/i)
  if (file && !fatte.has('scrivi_file') && !fatte.has('crea_documento_app') && !fatte.has('lavora')) return manca(file[0], 'scrivi_file')
  const copia = frase.match(/\b(?:changes|edits|patch|modifiche)\b[^.;]*\b(?:copy|copia|repository|repo|branch)\b/i)
  if (copia && !fatte.has('lavora')) return manca(copia[0], 'lavora')
  return null
}

/**
 * Le letture fatte con le mani, in estratto, per chi rilegge.
 *
 * Valgono come fonti: un riassunto di una pagina si controlla contro la
 * pagina. Numerate a parte (L1, L2) perché non stanno nella numerazione
 * dell'indice, e il lavoro le cita con l'indirizzo o il percorso.
 */
export function lettureInEstratto(fatti: Fatto[]): string {
  return fatti
    .filter(f => f.esito === 'ok' && f.testo)
    .map((f, i) => `[L${i + 1}] ${f.attrezzo} · ${f.dettaglio}\n${f.testo}`)
    .join('\n\n')
}

/** I fatti in righe, per chi rilegge. */
export function fattiInRighe(fatti: Fatto[], lingua: 'it' | 'en'): string {
  if (!fatti.length) return lingua === 'en'
    ? 'No tool was used beyond the index: no file written, no note, no document in an app, no web page read.'
    : 'Nessun attrezzo usato oltre all\'indice: nessun file scritto, nessuna nota, nessun documento in un\'app, nessuna pagina letta.'
  return fatti.map(f => `- ${f.attrezzo} (${f.esito === 'ok' ? 'ok' : lingua === 'en' ? 'failed' : 'fallito'}): ${f.dettaglio || (lingua === 'en' ? 'no detail' : 'senza dettaglio')}`).join('\n')
}
