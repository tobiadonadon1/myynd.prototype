// Granola, con il tuo account: le riunioni dal suo server MCP ufficiale.
//
// **Perché questa strada, e non più la cache.** Da maggio 2026 Granola cifra
// quello che tiene sul Mac e da luglio la chiave sta in un portachiavi che
// solo il suo codice firmato apre (vedi `granola.ts`): su un Granola di oggi
// il file da leggere non c'è più. Granola però ha aperto una porta ufficiale,
// `https://mcp.granola.ai/mcp`, su tutti i piani, con l'accesso via browser e
// senza niente da registrare a mano
// (docs.granola.ai/help-center/sharing/integrations/mcp). È la stessa porta
// da cui passano Claude e ChatGPT, ed è l'unica che Granola ha promesso di
// tenere.
//
// **Cosa si è visto davvero, e cosa no** (23 settembre 2026, senza account):
// i metadati pubblici — la risorsa `https://mcp.granola.ai/mcp`, l'ambito
// `mcp`, il server d'autorizzazione `https://mcp-auth.granola.ai` (WorkOS
// AuthKit) con registrazione dinamica, PKCE S256 e `offline_access` — e il
// 401 con `resource_metadata`. Sono in `review/connessioni/granola-mcp-
// discovery.txt`. Le risposte degli strumenti invece no: servono un account.
// La loro forma viene dallo schema ufficiale ripubblicato da chi lo usa
// (github.com/maton-ai/api-gateway-skill, references/granola-mcp): `content[0]`
// è un testo con dentro un XML leggero —
//
//   <meetings_data from=".." to=".." count="2">
//   <meeting id="uuid" title="Team sync" date="Feb 4, 2026 7:30 PM">
//     <known_participants>
//     John Doe (note creator) from Acme <john@acme.com>
//     </known_participants>
//     <summary>## Key Decisions …</summary>
//   </meeting>
//   </meetings_data>
//
// — e la specifica MCP permette anche `structuredContent`, o un JSON dentro il
// testo. Qui si leggono tutte e tre, e quando nessuna si riconosce il
// connettore lo dice invece di tornare zero riunioni: zero riunioni vuol dire
// «Granola è vuoto», e `riconcilia` butterebbe via l'indice.
//
// **Sola lettura.** Si chiamano `list_meetings`, `get_meetings` e
// `get_account_info`, nient'altro: Granola non ha strumenti che scrivono, e
// questo modulo non ne chiamerebbe comunque.

import { randomBytes } from 'node:crypto'
import * as chi from '../chi.ts'
import { leggi, lingua, scrivi as scriviConfig } from '../config.ts'
import type { Documento } from '../store.ts'
import { oauthWeb } from '../ospitato.ts'
import { avviaLocale, avviaWeb, chiediGettoni, Vivo, type Gettoni, type Sportello } from './oauth.ts'
import { ClienteMcp, ErroreMcp, registra, scopri, testoDi, type Registrazione, type Risultato, type Scoperta, type Strumento } from './mcp.ts'
import { ripulisci, testoLibero, type ConfigGranola, type EsitoGranola } from './granola.ts'

/** Il server di Granola. Le prove ci mettono il loro, finto, con `MYYND_GRANOLA_MCP`. */
export const INDIRIZZO = 'https://mcp.granola.ai/mcp'
export function endpoint(): string {
  return (process.env.MYYND_GRANOLA_MCP ?? '').trim() || INDIRIZZO
}

const GIORNO = 86_400_000
/** Quanto si aspetta chi sta facendo l'accesso: Granola può chiedere un secondo accesso, a Google. */
const ATTESA = 5 * 60_000
/** Una finestra di `list_meetings`: lo strumento non ha pagine, ha date. */
const FINESTRA_GIORNI = 30
/** Quanto indietro si guarda. Oltre due anni, una riunione è archivio. */
const ORIZZONTE_GIORNI = 730
/** Tre mesi di fila senza riunioni: prima di lì Granola non c'era. */
const VUOTE_DI_FILA = 3
/** Le note chieste in un giro: il resto al giro dopo, dalle più nuove. */
const PER_GIRO = 300
/** Una nota di una riunione recente si rilegge: Granola la riscrive nei giorni dopo. */
const FRESCHE_GIORNI = 7
/** Una finestra che ne torna tante così potrebbe essere tagliata: si divide. */
const SOSPETTO = 100
const TETTO = 4000
const TESTO_MAX = 24_000

// — le frasi —

export const RETE = 'Non riesco a raggiungere Granola: controlla la connessione e riprova.'
export const SCADUTO = 'Il collegamento con Granola è scaduto: collegalo di nuovo.'
export const NIENTE_ACCESSO = 'Granola non mi lascia più leggere le riunioni: collegalo di nuovo.'
export const RALLENTA = 'Granola ha chiesto di rallentare: riprovo al prossimo giro.'
export const CAMBIATO = 'Granola ha cambiato il modo in cui si collega: questo collegamento va aggiornato.'
export const REGISTRAZIONE = 'Granola non ha accettato Myynd come app: riprova più tardi.'
export const NON_LEGGE = 'Granola non mi ha dato le riunioni: riprova più tardi.'
export const SENZA_DURATA = 'Granola non ha dato il permesso duraturo: riprova.'

/**
 * Da un guaio a una frase che dice cosa fare. Mai il messaggio tecnico.
 *
 * Quello tecnico va nel registro, una riga: la frase dice cosa fare a chi
 * collega, la riga dice a chi lo aiuta quale passo Granola ha rifiutato. Dentro
 * ci sono indirizzi e stati HTTP, mai un token.
 */
export function frase(e: unknown): string {
  console.error(`myynd · granola · ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`)
  if (e instanceof ErroreMcp) {
    if (e.tipo === 'rete') return RETE
    if (e.tipo === 'accesso') return NIENTE_ACCESSO
    if (e.tipo === 'limite') return RALLENTA
    if (e.tipo === 'registrazione') return REGISTRAZIONE
    if (e.tipo === 'strumento') return NON_LEGGE
    return CAMBIATO
  }
  // `fetch` che non arriva da nessuna parte, o che ci mette troppo
  if (e instanceof TypeError) return RETE
  if (e instanceof Error) return e.name === 'TimeoutError' || e.name === 'AbortError' ? RETE : e.message
  return String(e)
}

// — le chiavi —

/** Quello che serve per parlare con Granola a nome di una persona. */
type Chiavi = {
  clientId: string
  clientSecret?: string
  metodo?: string
  gettoni: string
  risorsa: string
  mcp: string
  refresh: string
}

/** Collegato con l'account: da qui in poi la cache non si legge più (vedi `index.ts`). */
export function conAccount(c: { granola?: ConfigGranola }): boolean {
  return !!chiaviDi(c.granola)
}

function chiaviDi(g: ConfigGranola | undefined): Chiavi | null {
  if (!g?.refresh || !g.clientId || !g.gettoni) return null
  return {
    clientId: g.clientId,
    ...(g.clientSecret ? { clientSecret: g.clientSecret } : {}),
    ...(g.metodo ? { metodo: g.metodo } : {}),
    gettoni: g.gettoni,
    risorsa: g.risorsa || g.mcp || endpoint(),
    mcp: g.mcp || endpoint(),
    refresh: g.refresh
  }
}

function chiaviDa(s: Scoperta, r: Registrazione): Chiavi {
  return {
    clientId: r.clientId,
    ...(r.clientSecret ? { clientSecret: r.clientSecret, metodo: r.metodo } : {}),
    gettoni: s.gettoni,
    risorsa: s.risorsa,
    mcp: endpoint(),
    refresh: ''
  }
}

function traduci(j: Record<string, unknown>): string | null {
  const e = String(j.error ?? '')
  // un codice usato, un refresh già ruotato, una registrazione che Granola ha buttato
  if (e === 'invalid_grant' || e === 'invalid_client') return SCADUTO
  return null
}

/**
 * Lo sportello di `oauth.ts`, scritto con quello che ha detto la scoperta.
 *
 * `resource` in tutte e due le richieste — consenso e token — perché lo vuole
 * la specifica MCP (RFC 8707): il token che torna vale per questo server e
 * per nessun altro.
 */
function sportello(c: Chiavi, s?: Scoperta): Sportello {
  const basic = !!c.clientSecret && c.metodo === 'client_secret_basic'
  return {
    nome: 'Granola',
    gettoni: c.gettoni,
    campi: {
      client_id: c.clientId,
      resource: c.risorsa,
      ...(c.clientSecret && !basic ? { client_secret: c.clientSecret } : {})
    },
    ...(basic ? { intestazioni: { authorization: `Basic ${Buffer.from(`${encodeURIComponent(c.clientId)}:${encodeURIComponent(c.clientSecret!)}`).toString('base64')}` } } : {}),
    traduci,
    autorizza: ({ redirect, sfida, stato }) => {
      if (!s) return ''
      const u = new URL(s.autorizza)
      u.searchParams.set('response_type', 'code')
      u.searchParams.set('client_id', c.clientId)
      u.searchParams.set('redirect_uri', redirect)
      if (s.ambiti.length) u.searchParams.set('scope', s.ambiti.join(' '))
      u.searchParams.set('state', stato)
      u.searchParams.set('code_challenge', sfida)
      u.searchParams.set('code_challenge_method', 'S256')
      u.searchParams.set('resource', s.risorsa)
      return u.toString()
    }
  }
}

/**
 * Un token nuovo, e il refresh nuovo con lui.
 *
 * Il server di Granola è WorkOS, e WorkOS usa ogni refresh una volta sola:
 * quello che torna va tenuto *subito*, perché il vecchio da adesso vale zero.
 * Perderlo vuol dire un collegamento che si rompe al giro dopo, senza che
 * nessuno abbia fatto niente.
 */
async function rinnovaCon(c: Chiavi): Promise<Gettoni> {
  if (!c.refresh) throw new Error(SCADUTO)
  const g = await chiediGettoni(sportello(c), { grant_type: 'refresh_token', refresh_token: c.refresh })
  if (typeof g.refresh_token === 'string' && g.refresh_token) c.refresh = g.refresh_token
  return g
}

/**
 * Un rinnovo alla volta, per persona.
 *
 * Due letture insieme — il giro delle sei ore e un «Rileggi» — chiederebbero
 * due rinnovi con lo stesso refresh: il secondo arriva con un refresh già
 * usato, e WorkOS a quel punto può buttare anche il primo. Chi arriva mentre
 * un rinnovo è in volo aspetta quello.
 */
const inVolo = new Map<string, Promise<Gettoni>>()
const vivo = new Vivo(() => {
  const di = chi.adesso() ?? ''
  let p = inVolo.get(di)
  if (!p) {
    p = (async () => {
      const c = chiaviDi(leggi().granola)
      if (!c) throw new Error(NIENTE_ACCESSO)
      const prima = c.refresh
      const g = await rinnovaCon(c)
      if (c.refresh !== prima) {
        const ora = leggi()
        if (ora.granola) scriviConfig({ ...ora, granola: { ...ora.granola, refresh: c.refresh } })
      }
      return g
    })().finally(() => inVolo.delete(di))
    inVolo.set(di, p)
  }
  return p
})

/** Da usare quando si scollega: il token d'accesso in memoria se ne va con lui. */
export function scorda() { vivo.scorda() }

/**
 * Le chiavi in mano, per la prima lettura: prima di scriverle da qualche parte.
 *
 * Il collegamento si scrive solo quando la prima lettura è andata, come per
 * la cache e per il calendario: la prova è la lettura. Fino a lì il token sta
 * qui, e se scade a metà si rinnova qui.
 */
function inMano(c: Chiavi, g: Gettoni) {
  let token = g.access_token
  let scade = Date.now() + Number(g.expires_in ?? 3600) * 1000
  let volo: Promise<void> | null = null
  return {
    dammi: async (): Promise<string> => {
      if (scade > Date.now() + 60_000) return token
      if (!volo) {
        volo = rinnovaCon(c).then(n => {
          token = n.access_token
          scade = Date.now() + Number(n.expires_in ?? 3600) * 1000
        }).finally(() => { volo = null })
      }
      await volo
      return token
    },
    scorda: () => { scade = 0 }
  }
}

// — la forma delle risposte —

export type Riunione = {
  id: string
  titolo: string
  /** In ISO, o `null` se Granola non l'ha detta o non si capisce. */
  quando: string | null
  persone: string[]
  testo: string
}

const ENTITA: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ' }
function decodifica(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos|#39|nbsp);/g, (_, k: string) => ENTITA[k] ?? '')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
}

function attributi(s: string): Record<string, string> {
  const fuori: Record<string, string> = {}
  for (const m of s.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) fuori[m[1]!.toLowerCase()] = decodifica(m[2]!)
  return fuori
}

function isoDa(v: unknown): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * Chi c'era, dalle righe di `<known_participants>`.
 *
 * Granola le scrive così: «John Doe (note creator) from Acme <john@acme.com>».
 * Si tiene «John Doe <john@acme.com>», che è la stessa forma della cache: la
 * ricerca trova la riunione per il nome e per l'indirizzo, e «note creator» o
 * il nome dell'azienda non sono una persona.
 */
export function partecipanti(blocco: string): string[] {
  const visti = new Map<string, string>()
  for (const riga of blocco.split(/\r?\n|(?<=>)\s*[,;]\s*/)) {
    const pulita = decodifica(riga).trim()
    if (!pulita) continue
    const posta = /<([^<>\s]+@[^<>\s]+)>/.exec(pulita)?.[1] ?? (/^[^\s@<>]+@[^\s@<>]+$/.test(pulita) ? pulita : '')
    const nome = pulita.replace(/<[^<>]*>/g, '').replace(/\([^()]*\)/g, '').replace(/\s+from\s+.+$/i, '')
      .replace(/\s+/g, ' ').trim()
    const chiave = (posta || nome).toLowerCase()
    if (!chiave || visti.has(chiave) || visti.size >= 40) continue
    visti.set(chiave, nome && nome !== posta ? (posta ? `${nome} <${posta}>` : nome) : posta)
  }
  return [...visti.values()]
}

/** La stessa cosa, quando arriva in JSON: stringhe, o oggetti con nome e indirizzo. */
function partecipantiDa(x: unknown): string[] {
  if (typeof x === 'string') return partecipanti(x)
  if (!Array.isArray(x)) return []
  const righe: string[] = []
  for (const p of x) {
    if (typeof p === 'string') righe.push(p)
    else if (p && typeof p === 'object') {
      const v = p as Record<string, unknown>
      const nome = [v.name, v.displayName, v.display_name, v.full_name].find(n => typeof n === 'string' && n.trim()) as string | undefined
      const posta = typeof v.email === 'string' ? v.email.trim() : ''
      righe.push(posta ? `${nome ?? ''} <${posta}>` : nome ?? '')
    }
  }
  return partecipanti(righe.join('\n'))
}

/**
 * Il testo di una riunione, dai pezzi che Granola manda dentro `<meeting>`.
 *
 * Il riassunto prima, poi gli appunti: è l'ordine della cache (i pannelli,
 * poi le note scritte a mano), e rispondono a due domande diverse. La
 * trascrizione solo quando non c'è nient'altro, per la stessa ragione.
 */
function testoDaPezzi(pezzi: { nome: string; testo: string }[]): string {
  const peso = (n: string) => /summary|enhanced|ai_|panel/.test(n) ? 0 : /transcript/.test(n) ? 2 : 1
  const utili = pezzi.map(p => ({ ...p, testo: ripulisci(testoLibero(decodifica(p.testo))) })).filter(p => p.testo)
  const senzaTrascrizione = utili.filter(p => peso(p.nome) < 2)
  const scelti = (senzaTrascrizione.length ? senzaTrascrizione : utili).sort((a, b) => peso(a.nome) - peso(b.nome))
  const tutto: string[] = []
  for (const p of scelti) if (!tutto.includes(p.testo)) tutto.push(p.testo)
  const unito = tutto.join('\n\n')
  return unito.length > TESTO_MAX ? `${unito.slice(0, TESTO_MAX)}…` : unito
}

const PARTECIPANTI = /^(known_participants|participants|attendees|people)$/

function daXml(testo: string): { riunioni: Riunione[]; dichiarate: number | null } | null {
  const busta = /<meetings_data\b([^>]*)>/.exec(testo)
  const riunioni: Riunione[] = []
  for (const m of testo.matchAll(/<meeting\b([^>]*?)(?:\/>|>([\s\S]*?)<\/meeting>)/g)) {
    const a = attributi(m[1] ?? '')
    const id = (a.id ?? '').trim()
    if (!id) continue
    const dentro = m[2] ?? ''
    const persone: string[] = []
    const pezzi: { nome: string; testo: string }[] = []
    for (const s of dentro.matchAll(/<([a-z][a-z0-9_]*)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
      const nome = s[1]!.toLowerCase()
      if (PARTECIPANTI.test(nome)) persone.push(...partecipanti(s[2]!))
      else pezzi.push({ nome, testo: s[2]! })
    }
    riunioni.push({
      id,
      titolo: (a.title ?? '').trim(),
      quando: isoDa(a.date ?? a.created_at ?? a.start),
      persone: [...new Set(persone)],
      testo: testoDaPezzi(pezzi)
    })
  }
  if (!busta && !riunioni.length) return null
  const n = busta ? Number(attributi(busta[1] ?? '').count) : NaN
  return { riunioni, dichiarate: Number.isFinite(n) ? n : null }
}

const CAMPI_TESTO = ['summary', 'enhanced_notes', 'ai_summary', 'notes', 'private_notes', 'my_notes', 'notes_markdown', 'notes_plain', 'content', 'markdown', 'transcript']

function daJson(x: unknown): { riunioni: Riunione[]; dichiarate: number | null } | null {
  let elenco: unknown = x
  let dichiarate: number | null = null
  if (x && typeof x === 'object' && !Array.isArray(x)) {
    const o = x as Record<string, unknown>
    elenco = o.meetings ?? o.notes ?? o.documents ?? o.items ?? o.data ?? o.results
    const n = Number(o.count ?? o.total)
    if (Number.isFinite(n)) dichiarate = n
    // una riunione sola, senza la busta
    if (elenco === undefined && typeof o.id === 'string') elenco = [o]
  }
  if (!Array.isArray(elenco)) return null
  const riunioni: Riunione[] = []
  for (const v of elenco) {
    if (!v || typeof v !== 'object') continue
    const o = v as Record<string, unknown>
    const id = typeof o.id === 'string' ? o.id.trim() : typeof o.meeting_id === 'string' ? o.meeting_id.trim() : ''
    if (!id) continue
    riunioni.push({
      id,
      titolo: typeof o.title === 'string' ? o.title.trim() : '',
      quando: isoDa(o.date ?? o.created_at ?? o.start_time ?? o.start ?? o.meeting_date),
      persone: partecipantiDa(o.known_participants ?? o.participants ?? o.attendees ?? o.people),
      testo: testoDaPezzi(CAMPI_TESTO.filter(k => o[k] != null).map(k => ({
        nome: k, testo: typeof o[k] === 'string' ? o[k] as string : testoLibero(o[k])
      })))
    })
  }
  return { riunioni, dichiarate }
}

/**
 * Le riunioni dentro un risultato, qualunque forma abbia preso.
 *
 * `capito` falso vuol dire «c'era qualcosa, e non so leggerlo»: chi chiama lo
 * tratta come un guasto, non come un elenco vuoto. Un testo vuoto invece è un
 * elenco vuoto.
 */
export function riunioniDa(r: Risultato): { riunioni: Riunione[]; dichiarate: number | null; capito: boolean } {
  if (r.structuredContent !== undefined && r.structuredContent !== null) {
    const j = daJson(r.structuredContent)
    if (j) return { ...j, capito: true }
  }
  const testo = testoDi(r).trim()
  if (!testo) return { riunioni: [], dichiarate: null, capito: true }
  if (/^[[{]/.test(testo)) {
    try {
      const j = daJson(JSON.parse(testo))
      if (j) return { ...j, capito: true }
    } catch { /* non era JSON: si prova l'altra forma */ }
  }
  const x = daXml(testo)
  if (x) return { ...x, capito: true }
  // «nessuna riunione» detto a parole: non è un formato nuovo
  if (/\b(no|0)\s+(meetings|notes)\b/i.test(testo) && testo.length < 300) return { riunioni: [], dichiarate: 0, capito: true }
  return { riunioni: [], dichiarate: null, capito: false }
}

/**
 * Il piano gratuito, solo se Granola lo dice.
 *
 * Il piano «Basic» dà le riunioni degli ultimi trenta giorni; la scheda lo
 * scrive accanto al numero, perché altrimenti chi ne ha trecento e ne vede
 * dodici pensa a un guasto. Ma si scrive solo quando `get_account_info` o un
 * no di Granola lo nominano: indovinarlo da un elenco corto vorrebbe dire
 * dirlo anche a chi le riunioni vecchie non le ha.
 */
export function pianoGratuito(r: Risultato): boolean {
  const testo = `${testoDi(r)}\n${r.structuredContent ? JSON.stringify(r.structuredContent) : ''}`
  return /["']?\b(plan|tier|subscription)\b["']?\s*(?:name)?\s*[:=]\s*["']?(free|basic)\b/i.test(testo) ||
    /\b(free|basic)\s+(plan|tier)\b/i.test(testo)
}

/** Un no di Granola che parla del piano, non di un guasto. */
const LIMITE_PIANO = /\b(paid|plan|tier|upgrade|subscription)\b|\b30[- ]days?\b/i

// — l'elenco —

type Forma = {
  /** Come si chiede una finestra di date, se si può. */
  finestra: 'custom' | 'creati' | null
  /** Il nome del campo con gli id in `get_meetings`, e quanti se ne possono chiedere insieme. */
  campoId: string
  perVolta: number
}

function proprieta(s: Strumento | undefined): Record<string, Record<string, unknown>> {
  const p = s?.inputSchema && typeof s.inputSchema === 'object' ? (s.inputSchema as { properties?: unknown }).properties : undefined
  return (p && typeof p === 'object' ? p : {}) as Record<string, Record<string, unknown>>
}

/**
 * Come chiamare i due strumenti, dal loro schema.
 *
 * Lo schema di oggi è `time_range: "custom"` con `custom_start`/`custom_end`
 * e `meeting_ids` fino a dieci. Leggerlo da `tools/list` invece di scriverlo
 * qui a mano è quello che tiene in piedi il connettore il giorno che Granola
 * rinomina un campo: l'altra forma che circola (`created_after`/
 * `created_before`) è già qui. Senza schema, si usa quella documentata.
 */
function formaDi(elenca: Strumento, prendi: Strumento): Forma {
  const pe = proprieta(elenca)
  const conSchema = Object.keys(pe).length > 0
  const scelte = Array.isArray(pe.time_range?.enum) ? pe.time_range!.enum as unknown[] : []
  const finestra: Forma['finestra'] = !conSchema || (scelte.includes('custom') && 'custom_start' in pe)
    ? 'custom'
    : 'created_after' in pe && 'created_before' in pe ? 'creati' : null

  const pp = proprieta(prendi)
  const campoId = ['meeting_ids', 'document_ids', 'ids', 'note_ids'].find(k => k in pp)
    ?? Object.keys(pp).find(k => pp[k]?.type === 'array') ?? 'meeting_ids'
  const tetto = Number(pp[campoId]?.maxItems)
  return { finestra, campoId, perVolta: Number.isFinite(tetto) && tetto >= 1 ? Math.min(25, Math.floor(tetto)) : 10 }
}

const data = (ms: number) => new Date(ms).toISOString().slice(0, 10)

function argomentiFinestra(f: Forma, da: number, a: number): Record<string, unknown> {
  if (f.finestra === 'creati') return { created_after: new Date(da).toISOString(), created_before: new Date(a).toISOString() }
  return { time_range: 'custom', custom_start: data(da), custom_end: data(a) }
}

type Finestra = { riunioni: Riunione[]; buco: boolean; errore?: string; piano?: boolean }

/**
 * Una finestra di date, divisa in due se sembra tagliata.
 *
 * `list_meetings` non ha pagine: se un giorno taglia l'elenco, lo si vede dal
 * `count` della busta più grande di quello che c'è dentro, o da una finestra
 * piena in modo sospetto. In tutti e due i casi si chiede di nuovo, a metà:
 * costa qualche chiamata a chi fa cento riunioni al mese, e niente agli altri.
 * Quello che resta tagliato dopo quattro divisioni si dichiara `buco`: lì
 * dentro non si cancella niente.
 */
async function elencaFinestra(cliente: ClienteMcp, f: Forma, da: number, a: number, giu = 0): Promise<Finestra> {
  const r = await cliente.chiama('list_meetings', argomentiFinestra(f, da, a))
  if (r.isError) {
    const t = testoDi(r)
    return { riunioni: [], buco: true, errore: t || 'list_meetings', piano: LIMITE_PIANO.test(t) }
  }
  const e = riunioniDa(r)
  if (!e.capito) throw new ErroreMcp('protocollo', 'list_meetings: forma sconosciuta')
  const tagliata = e.dichiarate !== null && e.dichiarate > e.riunioni.length
  if ((tagliata || e.riunioni.length >= SOSPETTO) && a - da > 2 * GIORNO && giu < 4) {
    const meta = da + Math.floor((a - da) / 2)
    const nuove = await elencaFinestra(cliente, f, meta, a, giu + 1)
    const vecchie = await elencaFinestra(cliente, f, da, meta + GIORNO, giu + 1)
    return { riunioni: [...nuove.riunioni, ...vecchie.riunioni], buco: nuove.buco || vecchie.buco }
  }
  return { riunioni: e.riunioni, buco: tagliata }
}

// — leggere —

export type EsitoMcp = EsitoGranola & {
  /**
   * Gli id che non si possono cancellare: quelli che Granola ha elencato, e
   * quelli dell'indice fuori dal tratto di date letto. Vanno a `riconcilia`
   * insieme ai documenti.
   */
  visti: string[]
  /** Il tratto letto non ha buchi: quello che manca lì dentro, Granola non ce l'ha più. */
  completo: boolean
  /** Granola ha detto che il piano dà solo gli ultimi trenta giorni. */
  trentaGiorni: boolean
  /** Quante riunioni ha elencato Granola, con o senza testo. */
  elencate: number
  /**
   * Quelle elencate che erano già nell'indice e non si sono richieste. La riga
   * della lettura le dice accanto al numero, come la posta: «4 documenti» da
   * soli, su un Granola con quaranta riunioni, sembrano un collegamento che
   * perde roba.
   */
  giaLetti: number
}

/**
 * Le riunioni, lette da un cliente già pronto.
 *
 * Tre tempi. **L'elenco**: finestre di trenta giorni all'indietro, fino a due
 * anni o a tre mesi vuoti di fila (trenta giorni in tutto, se il piano è
 * quello gratuito). **Le note**: solo quelle che mancano all'indice e quelle
 * delle riunioni di questa settimana, a dieci per chiamata, trecento per giro,
 * dalle più nuove — le altre sono già dentro, uguali. **Cosa si può
 * cancellare**: solo dentro il tratto elencato, con due giorni di margine sul
 * bordo vecchio. Una riunione più vecchia del tratto non è sparita: è fuori
 * da quello che si è guardato — il piano gratuito, una lettura fermata a
 * metà — e `riconcilia` non la deve toccare.
 */
export async function leggiDa(cliente: ClienteMcp, gia: Map<string, string | null>, opz: {
  adesso?: number
  /**
   * Le note si chiedono anche per le riunioni già nell'indice. Alla prima
   * lettura dopo il collegamento: quelle dentro possono venire dalla cache di
   * un Granola vecchio, che il riassunto non l'aveva.
   */
  tutte?: boolean
} = {}): Promise<EsitoMcp> {
  const adesso = opz.adesso ?? Date.now()
  const strumenti = await cliente.strumenti()
  const elenca = strumenti.find(s => s.name === 'list_meetings')
  const prendi = strumenti.find(s => s.name === 'get_meetings')
  if (!elenca || !prendi) throw new ErroreMcp('protocollo', 'mancano list_meetings o get_meetings')
  const forma = formaDi(elenca, prendi)

  let trenta = false
  if (strumenti.some(s => s.name === 'get_account_info')) {
    try {
      const info = await cliente.chiama('get_account_info', {})
      if (!info.isError && pianoGratuito(info)) trenta = true
    } catch (e) {
      // l'account è un di più: un guasto qui non ferma la lettura, uno d'accesso sì
      if (e instanceof ErroreMcp && e.tipo === 'accesso') throw e
    }
  }

  const elencate = new Map<string, Riunione>()
  let inizioLetto = adesso
  let buchi = false
  let troncato = false

  if (!forma.finestra) {
    // lo strumento non accetta date: quello che dà da solo, cioè gli ultimi trenta giorni
    const r = await cliente.chiama('list_meetings', {})
    if (r.isError) throw new ErroreMcp('strumento', testoDi(r))
    const e = riunioniDa(r)
    if (!e.capito) throw new ErroreMcp('protocollo', 'list_meetings: forma sconosciuta')
    for (const x of e.riunioni) if (!elencate.has(x.id)) elencate.set(x.id, x)
    inizioLetto = adesso - FINESTRA_GIORNI * GIORNO
    buchi = e.dichiarate !== null && e.dichiarate > e.riunioni.length
  } else {
    const limite = adesso - (trenta ? FINESTRA_GIORNI : ORIZZONTE_GIORNI) * GIORNO
    // due giorni avanti: «oggi» in un altro fuso è già domani
    let fine = adesso + 2 * GIORNO
    let vuoteDiFila = 0
    let prima = true
    for (;;) {
      const inizio = Math.max(limite, fine - FINESTRA_GIORNI * GIORNO)
      const w = await elencaFinestra(cliente, forma, inizio, fine)
      if (w.errore) {
        if (w.piano) trenta = true
        // la prima finestra è l'unica senza la quale non c'è niente da dire
        if (prima && !w.piano) throw new ErroreMcp('strumento', w.errore)
        break
      }
      prima = false
      const prime = elencate.size
      for (const x of w.riunioni) if (!elencate.has(x.id)) elencate.set(x.id, x)
      if (w.buco) buchi = true
      inizioLetto = inizio
      vuoteDiFila = elencate.size === prime ? vuoteDiFila + 1 : 0
      if (elencate.size >= TETTO) { troncato = true; break }
      if (inizio <= limite || vuoteDiFila >= VUOTE_DI_FILA) break
      // un giorno di sovrapposizione: una riunione sul bordo non cade fra due finestre
      fine = inizio + GIORNO
    }
  }

  const ms = (r: Riunione) => r.quando ? Date.parse(r.quando) : NaN
  const ordinate = [...elencate.values()].sort((a, b) => (ms(b) || 0) - (ms(a) || 0))
  const daChiedere = ordinate.filter(r => {
    const t = ms(r)
    return opz.tutte || !gia.has(`granola:${r.id}`) || !Number.isFinite(t) || t > adesso - FRESCHE_GIORNI * GIORNO
  })
  if (daChiedere.length > PER_GIRO) troncato = true

  const senzaTitolo = lingua() === 'it' ? 'Riunione senza titolo' : 'Untitled meeting'
  const con = lingua() === 'it' ? 'Con' : 'With'
  const docs: Documento[] = []
  let vuote = 0
  const questo = daChiedere.slice(0, PER_GIRO)
  for (let i = 0; i < questo.length; i += forma.perVolta) {
    const lotto = questo.slice(i, i + forma.perVolta)
    let r: Risultato
    try {
      r = await cliente.chiama('get_meetings', { [forma.campoId]: lotto.map(x => x.id) })
    } catch (e) {
      // a metà: quello letto resta, il resto al giro dopo
      if (!i || (e instanceof ErroreMcp && e.tipo === 'accesso')) throw e
      troncato = true
      break
    }
    if (r.isError) {
      if (!i) throw new ErroreMcp('strumento', testoDi(r))
      troncato = true
      break
    }
    const e = riunioniDa(r)
    if (!e.capito) throw new ErroreMcp('protocollo', 'get_meetings: forma sconosciuta')
    const chiesti = new Set(lotto.map(x => x.id))
    for (const x of e.riunioni) {
      if (!chiesti.has(x.id)) continue
      chiesti.delete(x.id)
      const base = elencate.get(x.id)
      if (!x.testo) { vuote++; continue }
      const persone = [...new Set([...x.persone, ...(base?.persone ?? [])])]
      docs.push({
        // lo stesso id della cache: chi passa da una strada all'altra non si
        // ritrova la stessa riunione due volte nell'indice
        id: `granola:${x.id}`,
        fonte: 'granola',
        tipo: 'nota',
        titolo: x.titolo || base?.titolo || senzaTitolo,
        // chi c'era dentro il corpo, come nella cache: la ricerca guarda lì
        corpo: persone.length ? `${con}: ${persone.join(', ')}\n\n${x.testo}` : x.testo,
        autore: persone[0] ?? null,
        quando: x.quando ?? base?.quando ?? null,
        gruppo: 'note'
      })
    }
  }

  const visti = new Set([...elencate.keys()].map(id => `granola:${id}`))
  const bordo = inizioLetto + 2 * GIORNO
  for (const [id, quando] of gia) {
    const t = quando ? Date.parse(quando) : NaN
    if (!Number.isFinite(t) || t < bordo) visti.add(id)
  }
  return {
    docs, vuote, troncato, visti: [...visti], completo: !buchi, trentaGiorni: trenta,
    elencate: elencate.size, giaLetti: ordinate.length - daChiedere.length
  }
}

/** Il giro di sfondo: le chiavi dalla configurazione, il token rinnovato quando serve. */
export async function sincronizza(gia: Map<string, string | null>): Promise<EsitoMcp> {
  const c = chiaviDi(leggi().granola)
  if (!c) throw new Error(NIENTE_ACCESSO)
  const cliente = new ClienteMcp({ endpoint: c.mcp, token: () => vivo.dammi(), scaduto: () => vivo.scorda() })
  try {
    return await leggiDa(cliente, gia)
  } catch (e) {
    throw new Error(frase(e))
  } finally {
    await cliente.chiudi()
  }
}

// — collegare —

export type Azioni = {
  /** Gli id già nell'indice, con la data: chi legge sa cosa non richiedere. */
  gia: () => Map<string, string | null>
  /** Mette nell'indice quello che si è letto, e dice quante riunioni ci sono adesso. */
  salva: (e: EsitoMcp) => Promise<number>
}

/**
 * La prima lettura, con le chiavi appena avute, e poi la scrittura.
 *
 * Nell'ordine: senza refresh non si parte (il collegamento morirebbe fra
 * qualche minuto); si legge; si mette nell'indice; e solo allora il
 * collegamento si scrive in configurazione. Una lettura che fallisce lascia
 * tutto com'era, e la scheda dice perché.
 */
async function primaLettura(c: Chiavi, g: Gettoni, azioni: Azioni): Promise<{ note: number; trentaGiorni: boolean }> {
  if (typeof g.refresh_token !== 'string' || !g.refresh_token) throw new Error(SENZA_DURATA)
  c.refresh = g.refresh_token
  const mano = inMano(c, g)
  const cliente = new ClienteMcp({ endpoint: c.mcp, token: mano.dammi, scaduto: mano.scorda })
  let e: EsitoMcp
  try {
    e = await leggiDa(cliente, azioni.gia(), { tutte: true })
  } finally {
    await cliente.chiudi()
  }
  const note = await azioni.salva(e)
  const ora = leggi()
  scriviConfig({
    ...ora,
    granola: {
      note,
      clientId: c.clientId,
      ...(c.clientSecret ? { clientSecret: c.clientSecret, metodo: c.metodo } : {}),
      refresh: c.refresh,
      gettoni: c.gettoni,
      risorsa: c.risorsa,
      mcp: c.mcp,
      ...(e.trentaGiorni ? { trentaGiorni: true } : {})
    }
  })
  vivo.scorda()
  return { note, trentaGiorni: e.trentaGiorni }
}

export type StatoTentativo = 'attesa' | 'lettura' | 'fatto' | 'errore' | 'annullato'

type Tentativo = {
  utente: string
  stato: StatoTentativo
  errore?: string
  note?: number
  trentaGiorni?: boolean
  quando: number
  scade: number
  chiudi: () => void
}

/**
 * I collegamenti avviati e non ancora finiti, per id.
 *
 * La chiave è un segreto a caso, e dentro c'è scritto di chi è: la scheda di
 * un'altra persona che indovinasse l'id riceverebbe «non c'è», come per un id
 * che non esiste. Mezz'ora, poi si buttano.
 */
const tentativi = new Map<string, Tentativo>()

/**
 * Primo tempo, in casa: l'indirizzo del consenso, senza aprire niente.
 *
 * Il browser lo apre chi ha premuto: dentro l'app il guscio, fuori la pagina.
 * Da qui si scopre chi autorizza, si registra l'app con l'indirizzo di ritorno
 * di questo giro (`http://localhost:<porta>/callback`, la forma che usano i
 * client MCP che Granola dichiara supportati), e si resta in ascolto. Quello
 * che succede dopo il sì — i token, la prima lettura, la scrittura — gira da
 * solo, dentro il conto di chi ha avviato, e la scheda lo segue con `statoDi`.
 */
export async function avvia(azioni: Azioni): Promise<{ id: string; dove: string; scade: number }> {
  const utente = chi.adesso() ?? ''
  const ora = Date.now()
  for (const [k, t] of tentativi) {
    // uno alla volta per persona: un secondo browser sopra al primo confonde e basta
    if (t.utente === utente && t.stato === 'attesa') { t.stato = 'annullato'; t.chiudi() }
    if (ora - t.quando > 30 * 60_000) tentativi.delete(k)
  }

  let scoperta: Scoperta
  const tenuta: { reg?: Registrazione } = {}
  let l: Awaited<ReturnType<typeof avviaLocale>>
  try {
    scoperta = await scopri(endpoint())
    l = await avviaLocale('Granola', async redirect => {
      tenuta.reg = await registra(scoperta, redirect)
      return sportello(chiaviDa(scoperta, tenuta.reg), scoperta)
    }, { ospite: 'localhost', percorso: '/callback', durata: ATTESA })
  } catch (e) { throw new Error(frase(e)) }

  const id = randomBytes(12).toString('base64url')
  const t: Tentativo = { utente, stato: 'attesa', quando: ora, scade: ora + ATTESA, chiudi: l.chiudi }
  tentativi.set(id, t)
  const dentro = (fn: () => Promise<void>) => utente ? chi.dentro(utente, fn) : fn()
  void dentro(async () => {
    try {
      const g = await l.gettoni
      if (t.stato !== 'attesa') return
      t.stato = 'lettura'
      const fatto = await primaLettura(chiaviDa(scoperta, tenuta.reg!), g, azioni)
      t.stato = 'fatto'
      t.note = fatto.note
      t.trentaGiorni = fatto.trentaGiorni
    } catch (e) {
      if (t.stato === 'annullato') return
      t.stato = 'errore'
      t.errore = frase(e)
    } finally {
      l.chiudi()
    }
  })
  return { id, dove: l.dove, scade: t.scade }
}

/** Com'è andato un collegamento avviato da questa persona; `null` se non è suo o non c'è. */
export function statoDi(id: string): { stato: StatoTentativo; errore?: string; note?: number; trentaGiorni?: boolean } | null {
  const t = tentativi.get(id)
  if (!t || t.utente !== (chi.adesso() ?? '')) return null
  return {
    stato: t.stato,
    ...(t.errore ? { errore: t.errore } : {}),
    ...(t.note !== undefined ? { note: t.note } : {}),
    ...(t.trentaGiorni ? { trentaGiorni: true } : {})
  }
}

/**
 * «Annulla» mentre si aspetta il browser. Durante la prima lettura no: i
 * token sono già arrivati, e fermarla a metà vorrebbe dire metà indice.
 */
export function annulla(id: string): ReturnType<typeof statoDi> {
  const t = tentativi.get(id)
  if (!t || t.utente !== (chi.adesso() ?? '')) return null
  if (t.stato === 'attesa') { t.stato = 'annullato'; t.chiudi() }
  return statoDi(id)
}

/**
 * Ospitati: lo stesso consenso, con il ritorno dal nostro dominio.
 *
 * L'app si registra con `https://<dominio>/api/oauth/ritorno`, e da lì in
 * poi è il ballo di Google e Microsoft: `avviaWeb` tiene lo `state` e il
 * verificatore, `/api/oauth/ritorno` scambia il codice, e qui si fa la prima
 * lettura dentro il conto di chi ha avviato. Nessuna app da registrare per
 * chi ospita: la registrazione è dinamica, e basta che il server sappia il
 * proprio nome.
 */
export async function avviaSulWeb(azioni: Azioni): Promise<{ dove: string; biglietto: string }> {
  const ritorno = oauthWeb().ritorno
  if (!ritorno) throw new Error('Il server non conosce il proprio dominio: chi lo ospita deve impostare MYYND_PUBBLICO.')
  let c: Chiavi
  let s: Scoperta
  try {
    s = await scopri(endpoint())
    c = chiaviDa(s, await registra(s, ritorno))
  } catch (e) { throw new Error(frase(e)) }
  return avviaWeb(sportello(c, s), async g => {
    try { await primaLettura(c, g, azioni) } catch (e) { throw new Error(frase(e)) }
  })
}
