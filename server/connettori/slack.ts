// Slack: quello che si sono detti, che quasi mai è scritto da un'altra parte.
//
// Perché è la fonte che mancava di più. La posta tiene i documenti (fatture,
// contratti, preventivi) ma la *decisione* quasi sempre non sta lì: sta in tre
// righe in un filo, un martedì pomeriggio, fra due persone che si erano
// capite. Per chi vende e consegna il proprio lavoro, Slack è anche dove il
// cliente chiede «mi mandi il preventivo?» e dove lui risponde «entro
// venerdì»: Myynd deve sapere cosa gli hanno chiesto, cosa ha promesso, cosa
// si è deciso, in quale filo, con chi, e se sta ancora aspettando.
//
// **Un token incollato, non un OAuth.** Slack non accetta un indirizzo di
// ritorno su `http://127.0.0.1`, l'unico che un'app sul computer di qualcuno
// può offrire. Si crea un'app nel proprio spazio, già compilata dal manifesto
// (`manifesto()`), la si installa, si incolla il token. Un'app interna non è
// soggetta ai limiti del 2025 per le app fuori dal Marketplace.
//
// **Un token da utente (`xoxp-`).** Un bot vede solo i canali dove lo hanno
// invitato; un token da utente vede quello che vede lui, non un posto di più.
//
// **Un documento è un filo, o un giorno di un messaggio diretto.** Il singolo
// messaggio è «ok», «arrivo»: da solo è rumore. Il filo invece è l'unità in
// cui si decide (la domanda, le risposte, il «va bene, B»), e un giorno di
// messaggi diretti è una conversazione. I messaggi di un canale fuori da un
// filo stanno in un documento per canale e per giorno, come prima.
//
// **Si legge solo il nuovo.** Ogni conversazione ha il suo segno (l'ultimo
// `ts` visto); a ogni giro si rilegge dal segno, o dalle ultime 48 ore se il
// segno è più recente, per vedere le modifiche, le cancellazioni e le risposte
// arrivate tardi. La prima volta trenta giorni, prima i messaggi diretti e le
// menzioni, poi i canali più vivi. E una corsia corta, ogni due minuti
// (`corsiaVeloce`), guarda solo le menzioni, quello che è rivolto a lui
// (`to:me`) e i messaggi diretti: la domanda di un cliente entra in pochi
// minuti, non al giro dopo.
//
// **Il limite che resta.** Una risposta tardiva sotto una radice più vecchia
// delle 48 ore si vede se: lo nomina, o la ricerca `to:me` la trova (Slack
// decide cosa conta come rivolto a lui), o il filo è fra quelli seguiti (con
// risposte, o una radice sua o che lo nomina, nelle ultime due settimane: al
// massimo 25 ricontrolli per giro, a turno). Un filo di un mese fa dove non
// ha mai scritto e che nessuno gli rivolge non si rilegge.

import type { Documento } from '../store.ts'
import * as store from '../store.ts'
import * as chi from '../chi.ts'
import { resto, type Resto } from './ripresa.ts'
import { GuaioFonte, type Rimedio } from './guaio.ts'

export type ConfigSlack = {
  token: string
  /** Come si chiama lo spazio: si mostra, non si usa. */
  squadra?: string
  utente?: string
  /** Quante giornate indietro leggere la prima volta. */
  giorni?: number
  /** L'id di chi ha creato il token (`auth.test`): serve a sapere quali messaggi sono suoi. */
  utenteId?: string
  squadraId?: string
  /** L'indirizzo dello spazio, «https://northwind.slack.com/»: da qui i link ai messaggi. */
  url?: string
  /** Gli ambiti che il token ha davvero, come li dice Slack. */
  ambiti?: string[]
  /** Le conversazioni da non leggere mai: id di Slack. */
  esclusi?: string[]
}

/**
 * Gli ambiti dell'app, tutti utente.
 *
 * I primi nove servono a leggere (senza, `users.conversations` si ferma); gli
 * altri a capire meglio (i nomi dello spazio, la ricerca delle menzioni, i
 * file, le reazioni) e uno solo a scrivere, `chat:write`, per la risposta che
 * parte quando lui la tocca e mai da sola.
 */
export const AMBITI = [
  'channels:history', 'groups:history', 'im:history', 'mpim:history',
  'channels:read', 'groups:read', 'im:read', 'mpim:read',
  'users:read', 'team:read', 'search:read', 'files:read', 'reactions:read', 'chat:write'
]

/** La creazione dell'app su Slack, già compilata: nome, descrizione e ambiti. */
export function manifesto(): string {
  const m = {
    display_information: { name: 'Myynd', description: 'Your twin reads the conversations you are in.' },
    oauth_config: { scopes: { user: AMBITI } },
    settings: { org_deploy_enabled: false, socket_mode_enabled: false, token_rotation_enabled: false }
  }
  return `https://api.slack.com/apps?new_app=1&manifest_json=${encodeURIComponent(JSON.stringify(m))}`
}

const API = 'https://slack.com/api/'
/** Le prove parlano con uno Slack finto (`prove/finto-slack.ts`), e solo in sviluppo. */
function base(): string {
  return (process.env.MYYND_DEV === '1' && process.env.MYYND_SLACK_URL) || API
}

const GIORNO = 86_400
/** Si rilegge sempre questo tratto, per le modifiche e le risposte tardive. */
const RILEGGI = 48 * 3600
/** Quante chiamate in un giro, e quante nella corsia corta. */
const BUDGET_GIRO = 400
const BUDGET_VELOCE = 40
/** Quanto si è disposti ad aspettare Slack in un giro, in tutto. */
const ATTESA_MAX = 60
const PAGINE_PER_CONVERSAZIONE = 5
/** I fili vecchi con una risposta recente: quanti se ne ricontrollano per giro, e fino a quando. */
const FILI_PER_GIRO = 25
const FILI_VIVI = 14 * GIORNO
/** I file di testo si leggono sotto questa misura. */
const FILE_MAX = 200_000
const FILE_PER_GIRO = 20

type Risposta = { ok: boolean; error?: string; response_metadata?: { next_cursor?: string } }

/** Il giro: quante chiamate ha fatto, quanto ha aspettato, e il suo tetto. */
type Giro = { c: ConfigSlack; chiamate: number; budget: number; attesa: number; file: number }

/** Il tetto delle chiamate è arrivato: quello che resta, al giro dopo. */
class Esaurito extends Error {}

const dorme = (s: number) => new Promise(f => setTimeout(f, s * 1000))

/**
 * Una chiamata a Slack, con i suoi due modi di dire di no.
 *
 * Slack risponde quasi sempre 200: il no sta nel corpo, in `ok: false`. E il
 * 429 dice quanti secondi aspettare: si aspetta, ma non oltre un minuto in
 * tutto il giro, perché dietro Slack ci sono le altre fonti in fila.
 */
async function chiama<T>(g: Giro, metodo: string, q: Record<string, string> = {}, o: { post?: boolean } = {}, tentativo = 0):
  Promise<{ j: T & Risposta; intestazioni: Headers }> {
  if (g.chiamate >= g.budget) throw new Esaurito()
  g.chiamate++
  const u = new URL(metodo, base())
  const init: RequestInit = {
    headers: { authorization: `Bearer ${g.c.token}`, ...(o.post ? { 'content-type': 'application/x-www-form-urlencoded; charset=utf-8' } : {}) },
    signal: AbortSignal.timeout(30_000)
  }
  if (o.post) { init.method = 'POST'; init.body = new URLSearchParams(q).toString() }
  else for (const [k, v] of Object.entries(q)) if (v) u.searchParams.set(k, v)

  const r = await fetch(u, init)
  if (r.status === 429) {
    const aspetta = Math.max(0, Number(r.headers.get('retry-after') ?? 5) || 0)
    if (tentativo >= 4 || g.attesa + aspetta > ATTESA_MAX) throw new GuaioFonte(spiega('ratelimited'), 'attendi')
    g.attesa += aspetta
    await dorme(aspetta)
    return chiama<T>(g, metodo, q, o, tentativo + 1)
  }
  // un 5xx è Slack che inciampa: passa da solo, non è un token da rifare
  if (r.status >= 500) throw new GuaioFonte(spiega(''), 'attendi')
  const j = await r.json().catch(() => ({ ok: false, error: 'risposta_illeggibile' })) as T & Risposta
  if (!j.ok) throw new ErroreSlack(j.error ?? '')
  return { j, intestazioni: r.headers }
}

/** Un no di Slack: la frase per lui, il rimedio, e il codice per chi decide se è il canale o il token. */
class ErroreSlack extends GuaioFonte {
  codice: string
  constructor(codice: string) {
    super(spiega(codice), rimedioSlack(codice))
    this.codice = codice
  }
}

async function api<T>(g: Giro, metodo: string, q: Record<string, string> = {}): Promise<T & Risposta> {
  return (await chiama<T>(g, metodo, q)).j
}

const PASSEGGERI = new Set(['ratelimited', 'internal_error', 'fatal_error', 'service_unavailable', 'request_timeout', 'risposta_illeggibile'])
const DEL_TOKEN = ['invalid_auth', 'not_authed', 'token_revoked', 'token_expired', 'account_inactive', 'missing_scope']

/** Cosa serve perché Slack torni a leggersi: un token nuovo, o solo aspettare. */
function rimedioSlack(e: string): Rimedio {
  if (DEL_TOKEN.includes(e)) return 'credenziale'
  if (PASSEGGERI.has(e)) return 'attendi'
  return 'guarda'
}

/** Gli errori di Slack che capitano davvero, detti a chi li subisce. */
function spiega(e: string): string {
  if (e === 'invalid_auth' || e === 'not_authed') return 'Il token di Slack non è valido.'
  if (e === 'token_revoked' || e === 'account_inactive' || e === 'token_expired') return 'Il token di Slack è stato revocato: rifallo.'
  if (e === 'missing_scope') return 'A questo token mancano dei permessi: rifai l’installazione dell’app.'
  if (e === 'ratelimited') return 'Slack ha detto di rallentare. Riprovo più tardi.'
  return 'Slack non ha risposto come mi aspettavo.'
}

export function collegato(c?: { slack?: ConfigSlack }): boolean {
  return !!c?.slack?.token
}

const nuovoGiro = (c: ConfigSlack, budget = BUDGET_GIRO): Giro => ({ c, chiamate: 0, budget, attesa: 0, file: 0 })

type Chi = { utenteId: string; squadraId: string; squadra: string; utente: string; url: string; ambiti?: string[] }

async function chiSono(g: Giro): Promise<Chi> {
  const { j, intestazioni } = await chiama<{ team?: string; user?: string; user_id?: string; team_id?: string; url?: string }>(g, 'auth.test')
  const scritti = intestazioni.get('x-oauth-scopes')
  return {
    utenteId: j.user_id ?? '', squadraId: j.team_id ?? '', squadra: j.team ?? '', utente: j.user ?? '',
    url: (j.url ?? '').replace(/\/?$/, '/'),
    ...(scritti != null ? { ambiti: scritti.split(',').map(x => x.trim()).filter(Boolean) } : {})
  }
}

/**
 * Prova il token: chi è, in quale spazio, con quali permessi, e quanti posti.
 *
 * I permessi si leggono dall'intestazione `x-oauth-scopes` di `auth.test`:
 * quelli che mancano si dicono subito, mentre ha ancora le mani sulla
 * tastiera, invece di scoprirli al primo giro come «mancano dei permessi».
 */
export async function prova(c: ConfigSlack): Promise<
  | { ok: true; squadra: string; utente: string; utenteId: string; squadraId: string; url: string; ambiti?: string[]; mancano?: string[]; canali?: number; oltre: boolean }
  | { ok: false; errore: string }
> {
  if (!/^xox[pbe]-/.test(c.token.trim())) {
    return { ok: false, errore: 'Un token di Slack comincia per xoxp- o xoxb-.' }
  }
  const g = nuovoGiro(c, 10)
  try {
    const io = await chiSono(g)
    const mancano = io.ambiti ? AMBITI.filter(a => !io.ambiti!.includes(a)) : undefined
    // un conto che non riesce non è uno zero: senza numero, la scheda conferma e basta
    let canali: number | undefined, oltre = false
    try {
      const l = await api<{ channels?: Canale[] }>(g, 'users.conversations', {
        types: 'public_channel,private_channel,mpim,im', exclude_archived: 'true', limit: '200'
      })
      canali = (l.channels ?? []).filter(x => !x.is_archived).length
      oltre = !!l.response_metadata?.next_cursor
    } catch { /* il conto è un di più: il token va bene lo stesso */ }
    return { ok: true, ...io, ...(mancano ? { mancano } : {}), canali, oltre }
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : String(e) }
  }
}

// — leggere —

type Canale = {
  id: string
  name?: string
  is_im?: boolean
  is_mpim?: boolean
  is_private?: boolean
  is_archived?: boolean
  user?: string
  updated?: number
}

type FileSlack = { id: string; name?: string; title?: string; filetype?: string; mimetype?: string; size?: number; url_private?: string; permalink?: string; mode?: string }

type Messaggio = {
  ts: string
  user?: string
  bot_id?: string
  username?: string
  text?: string
  subtype?: string
  thread_ts?: string
  reply_count?: number
  latest_reply?: string
  edited?: { ts?: string }
  reactions?: { name: string; users?: string[] }[]
  files?: FileSlack[]
}

/** Una riga letta, già in chiaro: quello che serve ai documenti e ai segnali. */
export type Riga = {
  ts: string
  /** Quando è stato scritto (ISO): l'ora dell'evento, non quella in cui Myynd l'ha visto. */
  quando: string
  chi: string
  nome: string
  testo: string
  mio: boolean
  bot: boolean
  /** Lo nomina con `<@lui>`. */
  menzionaMe: boolean
  reazioni: { nome: string; utenti: string[] }[]
  link: string
  modificato: boolean
}

export type Tipo = 'im' | 'mpim' | 'canale'

/**
 * Un pezzo di conversazione letto per intero: un filo, o i messaggi di un
 * posto fuori dai fili. `dal` è da dove la lettura è completa (`ts`): una riga
 * che c'era prima e adesso no, da lì in poi, è stata cancellata.
 */
export type Ambito = {
  chiave: string
  conversazione: string
  filo: string | null
  tipo: Tipo
  dove: string
  righe: Riga[]
  dal: string
  /** I \`ts\` di tutto quello che c'era nel tratto, anche le radici dei fili: chi manca è stato cancellato. */
  presenti: string[]
}

/** Dove era arrivata la lettura, conversazione per conversazione: sta nell'indice di chi l'ha collegato. */
type StatoSlack = {
  v: 1
  utente: string
  squadra: string
  /** `visto`: l'ultimo messaggio visto; `letto`: l'ultima lettura intera; `controllato`: l'ultima occhiata della corsia corta. */
  conv: Record<string, { visto?: string; fondo?: number; letto?: string; controllato?: string }>
  /**
   * I fili da ricontrollare: quelli con risposte, e i messaggi suoi o che lo
   * nominano nelle ultime due settimane (`risposte: false`), perché una
   * risposta tardiva sotto una radice fuori dalle 48 ore non si vede nella
   * storia del canale.
   */
  fili: Record<string, { ultima: string; controllato: string; risposte?: boolean }>
  /** I fili tolti in questo giro: la fusione del segno non li riporta. */
  tolti?: string[]
  nomi: Record<string, { nome: string; tipo: Tipo | 'privato' }>
  /** Le conversazioni con una menzione da leggere per prime. */
  urgenti?: string[]
  /** L'ultima occhiata della corsia corta, in secondi. */
  veloce?: number
  ultima?: string
  conti?: { conversazioni: number; fili: number }
}

const SEGNO = 'slack:stato'

function leggiStato(io: { utenteId: string; squadraId: string }): StatoSlack {
  try {
    const s = JSON.parse(store.cursore(SEGNO) ?? '') as StatoSlack
    if (s?.v === 1 && s.utente === io.utenteId && s.squadra === io.squadraId) {
      return { ...s, conv: s.conv ?? {}, fili: s.fili ?? {}, nomi: s.nomi ?? {} }
    }
  } catch { /* nessun segno, o un altro spazio: si comincia da capo */ }
  return { v: 1, utente: io.utenteId, squadra: io.squadraId, conv: {}, fili: {}, nomi: {} }
}

/**
 * Scrive il segno, fondendolo con quello che c'è: la corsia corta può essere
 * partita sul segno di prima mentre il giro lungo scriveva i suoi documenti,
 * e il suo segno non deve cancellare quello più nuovo. Per ogni conversazione
 * e ogni filo vince la lettura più recente.
 */
function scriviStato(s: StatoSlack): void {
  const ora = leggiStato({ utenteId: s.utente, squadraId: s.squadra })
  const dopo = (a?: string, b?: string) => (a ?? '') >= (b ?? '')
  const conv = { ...ora.conv }
  for (const [id, x] of Object.entries(s.conv)) {
    const y = conv[id]
    const base = !y || dopo(x.letto, y.letto) ? x : y
    const controllato = [x.controllato, y?.controllato].filter(Boolean).sort().at(-1)
    conv[id] = { ...base, ...(controllato ? { controllato } : {}) }
  }
  const tolti = new Set(s.tolti ?? [])
  const fili = { ...ora.fili }
  for (const [k, f] of Object.entries(s.fili)) if (!fili[k] || dopo(f.controllato, fili[k]!.controllato)) fili[k] = f
  for (const k of Object.keys(fili)) if (!(k in s.fili) && tolti.has(k)) delete fili[k]
  const fuori: StatoSlack = {
    ...s, conv, fili,
    veloce: Math.max(s.veloce ?? 0, ora.veloce ?? 0) || undefined,
    ultima: [s.ultima, ora.ultima].filter((x): x is string => !!x).sort().at(-1)
  }
  delete fuori.tolti
  fuori.conti = {
    conversazioni: Object.values(conv).filter(x => x.letto).length,
    fili: Object.values(fili).filter(f => f.risposte !== false).length
  }
  store.segnaCursore(SEGNO, JSON.stringify(fuori))
}

/** Scollegato: il segno si scorda, e la prossima volta si comincia da capo. */
export function scorda(): void {
  store.segnaCursore(SEGNO, null)
}

/** Quello che la scheda delle Fonti mostra: l'ultimo giro e i conti. */
export function statoPerScheda(): { ultima: string | null; conversazioni: number; fili: number; posti: { id: string; nome: string; tipo: string }[] } {
  try {
    const s = JSON.parse(store.cursore(SEGNO) ?? '') as StatoSlack
    return {
      ultima: s.ultima ?? null,
      conversazioni: s.conti?.conversazioni ?? 0,
      fili: s.conti?.fili ?? 0,
      posti: Object.entries(s.nomi ?? {}).map(([id, x]) => ({ id, nome: x.nome, tipo: x.tipo })).sort((a, b) => a.nome.localeCompare(b.nome))
    }
  } catch { return { ultima: null, conversazioni: 0, fili: 0, posti: [] } }
}

/**
 * I nomi delle persone, presi una volta ogni dodici ore.
 *
 * Senza, ogni riga direbbe `U04J8KQ2M`: illeggibile, e invisibile alla
 * ricerca. Per persona e per spazio: con più conti sullo stesso server, i nomi
 * di uno spazio non devono finire nella cache di un altro.
 */
const NOMI = new Map<string, { per: Map<string, string>; quando: number }>()

async function nomi(g: Giro, squadra: string): Promise<Map<string, string>> {
  const chiave = `${chi.adesso() ?? ''}|${squadra}`
  const gia = NOMI.get(chiave)
  if (gia && Date.now() - gia.quando < 12 * 3600_000) return gia.per
  const per = new Map<string, string>()
  let cursore: string | undefined, pagine = 0
  do {
    const r = await api<{ members?: { id: string; real_name?: string; name?: string; profile?: { display_name?: string; real_name?: string } }[] }>(
      g, 'users.list', { limit: '200', ...(cursore ? { cursor: cursore } : {}) }
    )
    for (const m of r.members ?? []) {
      const nome = m.real_name || m.profile?.real_name || m.profile?.display_name || m.name || m.id
      per.set(m.id, nome)
      // anche per maniglia: i gruppi di messaggi si chiamano «mpdm-alex--nora-1»
      if (m.name) per.set(`@${m.name}`, nome)
    }
    cursore = r.response_metadata?.next_cursor || undefined
  } while (cursore && ++pagine < 15)
  NOMI.set(chiave, { per, quando: Date.now() })
  return per
}

/** Uno che non era nell'elenco (un ospite di Slack Connect): si chiede a parte, poche volte per giro. */
async function nomeDi(g: Giro, per: Map<string, string>, id: string, conti: { n: number }): Promise<string> {
  const gia = per.get(id)
  if (gia) return gia
  if (conti.n >= 20 || g.chiamate >= g.budget - 5) return 'qualcuno'
  conti.n++
  try {
    const r = await api<{ user?: { real_name?: string; name?: string } }>(g, 'users.info', { user: id })
    const n = r.user?.real_name || r.user?.name || 'qualcuno'
    per.set(id, n)
    return n
  } catch { per.set(id, 'qualcuno'); return 'qualcuno' }
}

/** Solo quelli di cui fa parte, non archiviati: le esclusioni si tolgono dopo, perché la scheda ne vuole i nomi. */
async function posti(g: Giro): Promise<Canale[]> {
  const fuori: Canale[] = []
  let cursore: string | undefined, pagine = 0
  do {
    const r = await api<{ channels?: Canale[] }>(g, 'users.conversations', {
      types: 'public_channel,private_channel,mpim,im',
      exclude_archived: 'true',
      limit: '200',
      ...(cursore ? { cursor: cursore } : {})
    })
    fuori.push(...(r.channels ?? []).filter(x => !x.is_archived))
    cursore = r.response_metadata?.next_cursor || undefined
  } while (cursore && ++pagine < 15)
  return fuori
}

const tipoDi = (ch: Canale): Tipo => ch.is_im ? 'im' : ch.is_mpim ? 'mpim' : 'canale'

/** Come si chiama un posto, per chi lo ritrova in un elenco di documenti. */
function comeSiChiama(ch: Canale, chi: Map<string, string>, io = ''): string {
  if (ch.is_im) return chi.get(ch.user ?? '') ?? 'messaggio diretto'
  if (ch.is_mpim) {
    const altri = (ch.name ?? '').replace(/^mpdm-|-\d+$/g, '').split('--').filter(x => x && x !== io)
    return altri.map(x => chi.get(`@${x}`) ?? x).join(', ') || 'gruppo'
  }
  return `#${ch.name ?? ch.id}`
}

/** L'inizio del giorno locale di un istante, in secondi. */
function inizioGiorno(sec: number): number {
  const d = new Date(sec * 1000)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 1000
}

/** Il giorno di un messaggio, come chiave e come data. */
function giornoDi(ts: string): { chiave: string; data: Date } {
  const data = new Date(Number(ts.split('.')[0]) * 1000)
  const due = (n: number) => String(n).padStart(2, '0')
  return { chiave: `${data.getFullYear()}-${due(data.getMonth() + 1)}-${due(data.getDate())}`, data }
}

const isoDi = (ts: string) => new Date(Number(ts) * 1000).toISOString()

/** Il link a un messaggio: `…/archives/<canale>/p<ts senza punto>`, e per una risposta il filo. */
export function linkA(url: string | undefined, canale: string, ts: string, filo?: string | null): string {
  if (!url) return ''
  const radice = url.replace(/\/?$/, '/')
  const coda = filo && filo !== ts ? `?thread_ts=${filo}&cid=${canale}` : ''
  return `${radice}archives/${canale}/p${ts.replace('.', '')}${coda}`
}

/** Le faccine che si scrivono di più, in chiaro: il resto resta `:nome:`, che si legge lo stesso. */
const FACCINE: Record<string, string> = {
  '+1': '👍', thumbsup: '👍', '-1': '👎', thumbsdown: '👎', white_check_mark: '✅', heavy_check_mark: '✔️', ok_hand: '👌',
  pray: '🙏', tada: '🎉', fire: '🔥', eyes: '👀', smile: '😄', slightly_smiling_face: '🙂', joy: '😂', heart: '❤️',
  rocket: '🚀', warning: '⚠️', x: '❌', raised_hands: '🙌', clap: '👏', thinking_face: '🤔', wave: '👋', muscle: '💪',
  sweat_smile: '😅', grinning: '😀', wink: '😉', sob: '😭', calendar: '📅', memo: '📝', point_right: '👉', hourglass: '⌛',
  white_circle: '⚪', red_circle: '🔴', large_green_circle: '🟢', question: '❓', exclamation: '❗', bulb: '💡', moneybag: '💰'
}

/**
 * Le scritte di Slack, ridotte a testo.
 *
 * `<@U04J8KQ2M>` è un nome, `<https://…|il preventivo>` è un link con la sua
 * etichetta, `<#C01|generale>` è un canale, `:+1:` è un pollice. Lasciarli
 * così vorrebbe dire indicizzare dei codici al posto delle parole, e il
 * ricordo che serve ritrovare è quasi sempre proprio il nome fra parentesi.
 */
export function inChiaro(testo: string, chi: Map<string, string>, posti: Map<string, string> = new Map()): string {
  return testo
    .replace(/<@([A-Z0-9]+)(?:\|([^>]*))?>/g, (_, id, n) => chi.get(id) ?? n ?? '@qualcuno')
    .replace(/<#([A-Z0-9]+)\|([^>]*)>/g, (_, _id, n) => `#${n}`)
    .replace(/<#([A-Z0-9]+)>/g, (_, id) => posti.get(id) ?? '#canale')
    .replace(/<!subteam\^[A-Z0-9]+(?:\|([^>]*))?>/g, (_, n) => n ?? '@gruppo')
    .replace(/<!(?:here|channel|everyone)(?:\|[^>]*)?>/g, '@tutti')
    .replace(/<!date\^\d+\^[^|>]*\|([^>]*)>/g, '$1')
    .replace(/<mailto:([^|>]+)\|([^>]*)>/g, '$2')
    .replace(/<(https?:[^|>]+)\|([^>]*)>/g, (_, url, t) => `${t} (${url})`)
    .replace(/<(https?:[^>]+)>/g, '$1')
    .replace(/:skin-tone-\d:/g, '')
    .replace(/:([a-z0-9_+-]+):/g, (tutto, n) => FACCINE[n] ?? tutto)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

/** I messaggi di servizio non sono conversazione: «è entrato nel canale» non lo cercherà nessuno. */
const SERVIZIO = new Set(['channel_join', 'channel_leave', 'group_join', 'group_leave', 'channel_topic', 'channel_purpose',
  'channel_name', 'channel_archive', 'channel_unarchive', 'group_topic', 'group_purpose', 'pinned_item', 'unpinned_item', 'tombstone', 'bot_add', 'bot_remove'])
const conversazione = (m: Messaggio) => !m.subtype || !SERVIZIO.has(m.subtype)

/** Che cosa si può leggere di un file: i testi piccoli sì, il resto si nomina. */
function eTesto(f: FileSlack): boolean {
  return (f.mode === 'snippet' || /^text\//.test(f.mimetype ?? '') || ['text', 'markdown', 'csv', 'json', 'javascript', 'python', 'yaml', 'xml', 'html'].includes(f.filetype ?? ''))
    && (f.size ?? Infinity) < FILE_MAX
}

/**
 * Il testo di un file piccolo.
 *
 * Il token va solo a Slack: un `url_private` che punta altrove (un file
 * esterno, un link strano) non lo riceve mai.
 */
async function testoDelFile(g: Giro, f: FileSlack): Promise<string> {
  const u = f.url_private ?? ''
  const finta = base() !== API ? new URL(base()).origin : null
  const diSlack = /^https:\/\/files\.slack\.com\//.test(u) || (!!finta && u.startsWith(finta + '/'))
  if (!diSlack || g.file >= FILE_PER_GIRO || g.chiamate >= g.budget) return ''
  g.file++; g.chiamate++
  try {
    const r = await fetch(u, { headers: { authorization: `Bearer ${g.c.token}` }, signal: AbortSignal.timeout(20_000) })
    if (!r.ok || /html/.test(r.headers.get('content-type') ?? '')) return ''
    return (await r.text()).slice(0, 4000).trim()
  } catch { return '' }
}

/** Quello che serve a trasformare messaggi in righe. */
type Contesto = { g: Giro; me: string; io: string; url: string; persone: Map<string, string>; nomiPosti: Map<string, string>; ospiti: { n: number } }

async function inRiga(cx: Contesto, ch: Canale, m: Messaggio, filo: string | null): Promise<Riga | null> {
  if (!conversazione(m)) return null
  const grezzo = (m.text ?? '').trim()
  const bot = !!m.bot_id || m.subtype === 'bot_message'
  const nome = m.user ? await nomeDi(cx.g, cx.persone, m.user, cx.ospiti) : (m.username || 'un’app')
  let testo = inChiaro(grezzo, cx.persone, cx.nomiPosti)
  for (const f of m.files ?? []) {
    const nomeFile = f.title || f.name || 'file'
    testo += `${testo ? '\n' : ''}  File: ${nomeFile}${f.filetype ? ` (${f.filetype})` : ''}${f.permalink ? ` ${f.permalink}` : ''}`
    if (eTesto(f)) {
      const dentro = await testoDelFile(cx.g, f)
      if (dentro) testo += `\n  ${dentro.replace(/\n/g, '\n  ')}`
    }
  }
  if (!testo.trim()) return null
  return {
    ts: m.ts, quando: isoDi(m.ts), chi: m.user ?? '', nome, testo, mio: !!m.user && m.user === cx.me, bot,
    menzionaMe: !!cx.me && grezzo.includes(`<@${cx.me}>`),
    reazioni: (m.reactions ?? []).map(r => ({ nome: r.name, utenti: r.users ?? [] })),
    link: linkA(cx.url, ch.id, m.ts, filo), modificato: !!m.edited
  }
}

/** L'ora breve di una riga: «ven 17 ott, 10:02». */
function oraBreve(iso: string): string {
  return new Date(iso).toLocaleString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function corpoDi(righe: Riga[], link: string): string {
  const persone = [...new Set(righe.filter(r => !r.bot).map(r => r.nome))]
  const testa = [`Persone: ${persone.join(', ') || 'nessuno'}`, link ? `Link: ${link}` : ''].filter(Boolean).join('\n')
  const corpo = righe.map(r => `[${oraBreve(r.quando)}] ${r.nome}: ${r.testo}${r.modificato ? ' (modificato)' : ''}`).join('\n')
  return `${testa}\n\n${corpo}`.slice(0, 20_000)
}

function documento(id: string, ch: Canale, dove: string, titolo: string, righe: Riga[], link: string, tipo: string): Documento {
  const persone = [...new Set(righe.filter(r => !r.bot).map(r => r.nome))]
  return {
    id, fonte: 'slack', tipo, titolo, corpo: corpoDi(righe, link),
    autore: persone.slice(0, 4).join(', ') || null,
    percorso: dove,
    // l'ora dell'ultimo messaggio: quando è successo, non quando l'abbiamo visto
    quando: righe.at(-1)!.quando,
    gruppo: 'conversazioni'
  }
}

/** Le pagine di una storia, dalla più nuova: si ferma al tetto e dice se è arrivata in fondo. */
async function storia(g: Giro, ch: Canale, oldest: number, latest?: number): Promise<{ messaggi: Messaggio[]; finita: boolean }> {
  const messaggi: Messaggio[] = []
  let cursore: string | undefined, pagine = 0
  do {
    const r = await api<{ messages?: Messaggio[]; has_more?: boolean }>(g, 'conversations.history', {
      channel: ch.id, oldest: String(oldest), ...(latest ? { latest: String(latest) } : {}), limit: '200',
      ...(cursore ? { cursor: cursore } : {})
    })
    messaggi.push(...(r.messages ?? []))
    cursore = r.has_more !== false ? r.response_metadata?.next_cursor || undefined : undefined
    pagine++
  } while (cursore && pagine < PAGINE_PER_CONVERSAZIONE)
  return { messaggi, finita: !cursore }
}

/** Un filo intero: la radice e tutte le risposte, in ordine. */
async function filoIntero(g: Giro, ch: Canale, ts: string): Promise<Messaggio[] | null> {
  const fuori: Messaggio[] = []
  let cursore: string | undefined, pagine = 0
  try {
    do {
      const r = await api<{ messages?: Messaggio[] }>(g, 'conversations.replies', { channel: ch.id, ts, limit: '200', ...(cursore ? { cursor: cursore } : {}) })
      fuori.push(...(r.messages ?? []).filter(m => !fuori.some(x => x.ts === m.ts)))
      cursore = r.response_metadata?.next_cursor || undefined
    } while (cursore && ++pagine < PAGINE_PER_CONVERSAZIONE)
  } catch (e) {
    // la radice cancellata: il filo non c'è più
    if (e instanceof ErroreSlack && e.codice === 'thread_not_found') return null
    throw e
  }
  return fuori
}

export type EsitoSlack = {
  docs: Documento[]
  /** I documenti da togliere: messaggi cancellati, fili spariti, posti esclusi. */
  tolti: string[]
  /** I pezzi letti per intero, per i segnali (`slack-segnali.ts`). */
  ambiti: Ambito[]
  /** I posti che non si sono lasciati leggere: si dice, non si ingoia. */
  falliti: string[]
  troncato: boolean
  resto: Resto
  /** Da dove la finestra è letta per intero (ISO). */
  dal: string
  /** Chi è, dove: la scheda e i segnali lo usano. */
  io: { utenteId: string; squadraId: string; squadra: string; utente: string; url: string; ambiti?: string[] }
  conti: { conversazioni: number; fili: number }
  chiamate: number
  /** Perché si è fermato prima: il tetto delle chiamate, o Slack che ha detto di rallentare. */
  fermato?: 'tetto' | 'limite'
  /**
   * Scrive il segno di questo giro. Va chiamata *dopo* aver salvato i
   * documenti: se il salvataggio cade, il giro dopo rilegge da dove era, e
   * niente resta segnato come letto senza essere nell'indice.
   */
  conferma: () => void
}

type Opzioni = {
  /** I documenti di Slack già nell'indice (id → quando): da qui si sa cosa è stato cancellato. */
  esistenti?: Map<string, string | null>
  budget?: number
  /** Adesso, in secondi: le prove lo fissano. */
  adesso?: number
}

/** Una fila per persona: la corsia corta non parte mentre gira il giro lungo, e due giri non si sovrappongono. */
const IN_CORSO = new Map<string, Promise<unknown>>()

async function inFila<T>(salta: boolean, fn: () => Promise<T>): Promise<T | null> {
  const chiave = chi.adesso() ?? ''
  const prima = IN_CORSO.get(chiave)
  if (prima && salta) return null
  // in coda dietro l'ultimo, non dietro il primo: due giri lunghi in attesa non partono insieme
  const p = (prima ?? Promise.resolve()).catch(() => {}).then(fn)
  IN_CORSO.set(chiave, p)
  try { return await p } finally { if (IN_CORSO.get(chiave) === p) IN_CORSO.delete(chiave) }
}

/**
 * Il giro lungo: tutte le conversazioni dovute, dal loro segno.
 *
 * L'ordine conta quando il tetto delle chiamate taglia: prima i messaggi
 * diretti e i gruppi, poi i canali dove lo hanno nominato, poi gli altri
 * canali a partire da quello letto meno di recente. Un canale fermo da due
 * settimane si guarda una volta all'ora, non a ogni giro.
 */
export async function sincronizza(
  c: ConfigSlack,
  avanzamento?: (fatti: number, totale: number) => void,
  o: Opzioni = {}
): Promise<EsitoSlack> {
  return (await inFila(false, () => giro(c, { ...o, avanzamento })))!
}

/**
 * La corsia corta, ogni due minuti: le menzioni e i messaggi diretti nuovi.
 *
 * Una ricerca (`search.messages`) per le menzioni dall'ultima occhiata, e
 * un'occhiata ai messaggi diretti vivi; si rileggono solo i posti e i fili
 * dove è arrivato qualcosa. Se gira il giro lungo, salta: lo fa lui.
 */
export async function corsiaVeloce(c: ConfigSlack, o: Opzioni = {}): Promise<EsitoSlack | null> {
  return inFila(true, () => giro(c, { ...o, veloce: true, budget: o.budget ?? BUDGET_VELOCE }))
}

async function giro(c: ConfigSlack, o: Opzioni & { veloce?: boolean; avanzamento?: (fatti: number, totale: number) => void }): Promise<EsitoSlack> {
  const g = nuovoGiro(c, o.budget ?? BUDGET_GIRO)
  const adesso = o.adesso ?? Date.now() / 1000
  const giorni = Math.min(365, Math.max(1, c.giorni ?? 30))
  const da = inizioGiorno(adesso - giorni * GIORNO)

  // chi è: la corsia corta si fida di quello che sa già, il giro lungo lo chiede (e prova il token)
  const io: Chi = o.veloce && c.utenteId && c.url && c.squadraId
    ? { utenteId: c.utenteId, squadraId: c.squadraId, squadra: c.squadra ?? '', utente: c.utente ?? '', url: c.url }
    : await chiSono(g)
  const st = leggiStato(io)
  const esclusi = new Set(c.esclusi ?? [])
  const persone = await nomi(g, io.squadraId)
  const tuttiIPosti = await posti(g)
  const elenco = tuttiIPosti.filter(ch => !esclusi.has(ch.id))
  const perId = new Map(elenco.map(ch => [ch.id, ch]))
  const nomiPosti = new Map(elenco.filter(ch => tipoDi(ch) === 'canale').map(ch => [ch.id, `#${ch.name ?? ch.id}`]))
  const cx: Contesto = { g, me: io.utenteId, io: io.utente, url: io.url, persone, nomiPosti, ospiti: { n: 0 } }

  const docs: Documento[] = []
  const tolti: string[] = []
  const ambiti: Ambito[] = []
  const falliti: string[] = []
  let fermato: EsitoSlack['fermato']
  const fatti = new Set<string>()
  const filiFatti = new Set<string>()

  // i nomi dei posti, per la scheda (le esclusioni si scelgono da qui)
  st.nomi = Object.fromEntries(tuttiIPosti.slice(0, 1000).map(ch => [ch.id, { nome: comeSiChiama(ch, persone, io.utente), tipo: tipoDi(ch) === 'canale' && ch.is_private ? 'privato' as const : tipoDi(ch) }]))
  // un posto escluso esce anche dall'indice
  if (o.esistenti) for (const id of o.esistenti.keys()) if (esclusi.has(id.split(':')[1] ?? '')) tolti.push(id)

  /** Le menzioni dall'ultima occhiata (o dai trenta giorni, la prima volta): posti e fili da leggere per primi. */
  const daMenzioni = new Set<string>(st.urgenti ?? [])
  const filiDaMenzioni = new Set<string>()
  const ultimaOcchiata = st.veloce ?? da
  /*
   * Due ricerche: le menzioni (`<@lui>`), e quello che è rivolto a lui
   * (`to:me`: i messaggi diretti e le risposte nei fili dove c'è anche lui).
   * La seconda vede una risposta tardiva sotto una radice vecchia che non lo
   * nomina.
   */
  const giornoPrima = giornoDi(String(inizioGiorno(ultimaOcchiata) - GIORNO)).chiave
  for (const query of [`<@${io.utenteId}> after:${giornoPrima}`, `to:me after:${giornoPrima}`]) {
    try {
      const r = await api<{ messages?: { matches?: { ts: string; user?: string; channel?: { id?: string }; permalink?: string }[] } }>(g, 'search.messages', {
        query, sort: 'timestamp', sort_dir: 'desc', count: '50'
      })
      for (const m of r.messages?.matches ?? []) {
        const ch = m.channel?.id
        if (!ch || m.user === io.utenteId || esclusi.has(ch) || !perId.has(ch) || Number(m.ts) <= ultimaOcchiata - 60) continue
        const filo = /[?&]thread_ts=([0-9.]+)/.exec(m.permalink ?? '')?.[1]
        // già letto: un giro tagliato dal tetto non deve rileggerlo a ogni passata
        if (filo && filo !== m.ts) { if (Number(st.fili[`${ch}:${filo}`]?.ultima ?? 0) < Number(m.ts)) filiDaMenzioni.add(`${ch}:${filo}`) }
        else if (Number(st.conv[ch]?.visto ?? 0) < Number(m.ts)) daMenzioni.add(ch)
      }
    } catch (e) {
      // la ricerca è un di più (manca `search:read`, o Slack rallenta): si legge lo stesso
      if (e instanceof Esaurito) { fermato = 'tetto'; break }
    }
  }

  /** Quali conversazioni leggere, in che ordine. */
  let coda: Canale[]
  if (o.veloce) {
    /*
     * I messaggi diretti: quelli mai letti si leggono (al massimo cinque per
     * passata); quelli vivi (un messaggio nelle ultime due settimane) si
     * guardano tutti, fino a dodici; quelli fermi tre per passata, a turno,
     * dal guardato meno di recente. Un messaggio diretto vuoto da un mese non
     * costa una chiamata ogni due minuti.
     */
    const diretti = elenco.filter(ch => tipoDi(ch) !== 'canale')
    const mai = diretti.filter(ch => !st.conv[ch.id]).slice(0, 5)
    const vivo = (ch: Canale) => { const v = st.conv[ch.id]?.visto; return !!v && adesso - Number(v) < FILI_VIVI }
    const vivi = diretti.filter(vivo).sort((a, b) => Number(st.conv[b.id]!.visto) - Number(st.conv[a.id]!.visto)).slice(0, 12)
    const quando = (ch: Canale) => st.conv[ch.id]?.controllato ?? st.conv[ch.id]?.letto ?? ''
    const fermi = diretti.filter(ch => st.conv[ch.id] && !vivo(ch)).sort((a, b) => quando(a).localeCompare(quando(b))).slice(0, 3)
    const nuovi: Canale[] = [...mai]
    for (const ch of [...vivi, ...fermi]) {
      const s = st.conv[ch.id]!
      const dal = s.visto ?? String(Math.floor(Date.parse(s.letto ?? '') / 1000 - 120) || Math.floor(da))
      try {
        const r = await api<{ messages?: Messaggio[] }>(g, 'conversations.history', { channel: ch.id, oldest: dal, limit: '1' })
        s.controllato = new Date(adesso * 1000).toISOString()
        if ((r.messages ?? []).some(m => Number(m.ts) > Number(dal))) nuovi.push(ch)
      } catch (e) { if (e instanceof Esaurito) break }
    }
    coda = [...nuovi, ...[...daMenzioni].map(id => perId.get(id)).filter((x): x is Canale => !!x)]
  } else {
    const dovuto = (ch: Canale) => {
      if (tipoDi(ch) !== 'canale' || daMenzioni.has(ch.id)) return true
      const s = st.conv[ch.id]
      if (!s?.letto || s.fondo) return true
      // un canale vivo a ogni giro; uno fermo da tre giorni una volta all'ora
      if (s.visto && adesso - Number(s.visto) < 3 * GIORNO) return true
      return adesso - Date.parse(s.letto) / 1000 >= 3600
    }
    // prima quello mai letto (i messaggi diretti per primi), e le menzioni nuove;
    // poi il resto, dal letto meno di recente: un giro tagliato dal tetto non
    // rilegge gli stessi posti mentre altri aspettano la prima lettura
    const peso = (ch: Canale) => {
      const letto = !!st.conv[ch.id]?.letto
      if (!letto && tipoDi(ch) !== 'canale') return 0
      if (daMenzioni.has(ch.id)) return 1
      return letto ? 3 : 2
    }
    coda = elenco.filter(dovuto).sort((a, b) =>
      peso(a) - peso(b)
      || (st.conv[a.id]?.letto ?? '').localeCompare(st.conv[b.id]?.letto ?? '')
      || (b.updated ?? 0) - (a.updated ?? 0))
  }
  coda = coda.filter((ch, i) => coda.findIndex(x => x.id === ch.id) === i)

  let n = 0
  for (const ch of coda) {
    if (fermato) break
    try {
      await leggiConversazione(cx, ch, st, { da, adesso, esistenti: o.esistenti }, { docs, tolti, ambiti, filiFatti })
      fatti.add(ch.id)
      st.urgenti = (st.urgenti ?? []).filter(x => x !== ch.id)
    } catch (e) {
      if (e instanceof Esaurito) { fermato = 'tetto'; break }
      if (e instanceof GuaioFonte && e.rimedio === 'attendi') { fermato = 'limite'; break }
      if (e instanceof GuaioFonte && e.rimedio === 'credenziale') throw e
      // un posto che non si legge non ferma gli altri, ma non sparisce in silenzio
      falliti.push(comeSiChiama(ch, persone, io.utente))
    }
    o.avanzamento?.(++n, coda.length)
  }

  /*
   * I fili vecchi che hanno ricevuto una risposta adesso. La radice sta fuori
   * dalle 48 ore, quindi la storia del canale non la mostra: si ricontrollano
   * quelli vivi nelle ultime due settimane, quelli guardati meno di recente
   * prima, e quelli dove lo hanno nominato prima di tutti.
   */
  const daRivedere = [
    ...[...filiDaMenzioni],
    ...Object.entries(st.fili)
      .filter(([k, f]) => !filiFatti.has(k) && adesso - Number(f.ultima) < FILI_VIVI && !o.veloce)
      .sort((a, b) => a[1].controllato.localeCompare(b[1].controllato)).map(([k]) => k)
  ].filter((k, i, tutti) => tutti.indexOf(k) === i && !filiFatti.has(k)).slice(0, o.veloce ? 10 : FILI_PER_GIRO)
  for (const k of daRivedere) {
    if (fermato) break
    const [id, ts] = k.split(':')
    const ch = perId.get(id!)
    if (!ch || !ts) { delete st.fili[k]; continue }
    try {
      await leggiFilo(cx, ch, ts, st, { docs, tolti, ambiti, filiFatti }, adesso)
    } catch (e) {
      if (e instanceof Esaurito) { fermato = 'tetto'; break }
      if (e instanceof GuaioFonte && e.rimedio === 'attendi') { fermato = 'limite'; break }
      if (e instanceof GuaioFonte && e.rimedio === 'credenziale') throw e
    }
  }

  // i fili di cui non si sa più niente da un mese escono dal segno
  for (const [k, f] of Object.entries(st.fili)) if (adesso - Number(f.ultima) > giorni * GIORNO) delete st.fili[k]
  if (o.veloce) st.veloce = adesso
  else if (!fermato) st.veloce = Math.max(st.veloce ?? 0, adesso - 60)
  if (fermato) st.urgenti = [...new Set([...(st.urgenti ?? []), ...[...daMenzioni].filter(x => !fatti.has(x))])]

  if (!o.veloce) st.ultima = new Date(adesso * 1000).toISOString()
  st.tolti = [...new Set(tolti)].map(id => /^slack:([^:]+):t([0-9.]+)$/.exec(id)).filter(m => !!m).map(m => `${m![1]}:${m![2]}`)
  const conti = {
    conversazioni: Object.values(st.conv).filter(x => x.letto).length,
    fili: Object.values(st.fili).filter(f => f.risposte !== false).length
  }

  const completi = elenco.filter(ch => st.conv[ch.id]?.letto && !st.conv[ch.id]?.fondo).length
  return {
    docs, tolti: [...new Set(tolti)], ambiti, falliti,
    troncato: !!fermato || completi < elenco.length,
    resto: resto(completi, elenco.length),
    dal: new Date(da * 1000).toISOString(),
    io, conti, chiamate: g.chiamate,
    ...(fermato ? { fermato } : {}),
    // il segno si scrive dopo i documenti: chi li salva lo chiama (`dopoSlack` in index.ts)
    conferma: () => scriviStato(st)
  }
}

type Raccolta = { docs: Documento[]; tolti: string[]; ambiti: Ambito[]; filiFatti: Set<string> }

/**
 * Una conversazione, dal suo segno.
 *
 * Due tratti: quello recente (dal segno, o dalle ultime 48 ore, fino ad
 * adesso) e, se la prima lettura non era finita, quello vecchio sotto il
 * `fondo`. Ogni tratto comincia all'inizio di un giorno, così ogni giorno
 * dentro un tratto finito si può riscrivere intero: un messaggio cancellato
 * non c'è più nel documento, e un giorno rimasto vuoto esce dall'indice.
 */
async function leggiConversazione(
  cx: Contesto, ch: Canale, st: StatoSlack,
  w: { da: number; adesso: number; esistenti?: Map<string, string | null> },
  fuori: Raccolta
): Promise<void> {
  const { g } = cx
  const s = st.conv[ch.id] ?? {}
  const tipo = tipoDi(ch)
  const dove = comeSiChiama(ch, cx.persone, cx.io)

  // il tratto recente
  const daR = s.visto ? Math.max(w.da, inizioGiorno(Math.min(Number(s.visto), w.adesso - RILEGGI))) : w.da
  const recente = await storia(g, ch, daR - 1)
  const tratti: { da: number; a: number; messaggi: Messaggio[] }[] = []
  let fondo = s.fondo
  if (recente.finita) tratti.push({ da: daR, a: Infinity, messaggi: recente.messaggi })
  else {
    // il giorno più vecchio letto è a metà: si tiene dal giorno dopo, e il resto è un fondo da finire
    const piuVecchio = Math.min(...recente.messaggi.map(m => Number(m.ts)))
    const confine = inizioGiorno(piuVecchio) + GIORNO
    tratti.push({ da: confine, a: Infinity, messaggi: recente.messaggi.filter(m => Number(m.ts) >= confine) })
    fondo = Math.max(fondo ?? 0, confine)
  }
  // il tratto vecchio, se la prima lettura è a metà
  if (fondo && fondo > w.da && g.chiamate < g.budget) {
    const vecchio = await storia(g, ch, w.da - 1, fondo)
    if (vecchio.finita) { tratti.push({ da: w.da, a: fondo, messaggi: vecchio.messaggi }); fondo = undefined }
    else {
      const confine = inizioGiorno(Math.min(...vecchio.messaggi.map(m => Number(m.ts)))) + GIORNO
      tratti.push({ da: confine, a: fondo, messaggi: vecchio.messaggi.filter(m => Number(m.ts) >= confine) })
      fondo = confine
    }
  } else if (fondo && fondo <= w.da) fondo = undefined

  const tutti = tratti.flatMap(t => t.messaggi.filter(m => Number(m.ts) >= t.da && Number(m.ts) < t.a))
  const dentro = (sec: number) => tratti.some(t => sec >= t.da && sec < t.a)

  // i fili: radici con risposte. Si rileggono se sono nuovi, se è arrivata una
  // risposta, o se l'ultima risposta è nelle 48 ore (una modifica)
  const radici = tutti.filter(m => (m.reply_count ?? 0) > 0 && (!m.thread_ts || m.thread_ts === m.ts))
  for (const r of radici) {
    const k = `${ch.id}:${r.ts}`
    const noto = st.fili[k]
    const id = `slack:${ch.id}:t${r.ts}`
    const daLeggere = !noto || noto.ultima !== r.latest_reply || w.adesso - Number(r.latest_reply ?? r.ts) < RILEGGI
      || (w.esistenti ? !w.esistenti.has(id) : false)
    if (daLeggere) await leggiFilo(cx, ch, r.ts, st, fuori, w.adesso)
    else fuori.filiFatti.add(k)
  }
  // un filo che non c'è più (la radice cancellata, o senza più risposte), dentro un tratto finito
  const conRisposte = new Set(radici.map(r => r.ts))
  const spariti = new Set<string>()
  if (w.esistenti) for (const id of w.esistenti.keys()) {
    const m = /^slack:([^:]+):t([0-9.]+)$/.exec(id)
    if (m && m[1] === ch.id) spariti.add(m[2]!)
  }
  for (const k of Object.keys(st.fili)) if (k.startsWith(`${ch.id}:`)) spariti.add(k.slice(ch.id.length + 1))
  for (const ts of spariti) {
    if (!dentro(Number(ts)) || conRisposte.has(ts)) continue
    const k = `${ch.id}:${ts}`
    const id = `slack:${ch.id}:t${ts}`
    const radiceViva = tutti.some(m => m.ts === ts)
    const avevaRisposte = st.fili[k]?.risposte !== false || !!w.esistenti?.has(id)
    if (!avevaRisposte) continue
    if (!w.esistenti || w.esistenti.has(id)) fuori.tolti.push(id)
    // la radice c'è ancora, senza risposte: si continua a guardarla; se non c'è più, si scorda
    if (radiceViva) st.fili[k] = { ultima: ts, controllato: new Date(w.adesso * 1000).toISOString(), risposte: false }
    else delete st.fili[k]
    // le domande che stavano nelle risposte non ci sono più: il pezzo vuoto le chiude
    fuori.ambiti.push({ chiave: k, conversazione: ch.id, filo: ts, tipo, dove, righe: [], dal: ts, presenti: radiceViva ? [ts] : [] })
  }

  // fuori dai fili: un giorno per documento
  const sciolti = tutti.filter(m => !conRisposte.has(m.ts) && m.subtype !== 'thread_broadcast' && (!m.thread_ts || m.thread_ts === m.ts))
    .sort((a, b) => Number(a.ts) - Number(b.ts))
  const righe: Riga[] = []
  for (const m of sciolti) { const r = await inRiga(cx, ch, m, null); if (r) righe.push(r) }
  const perGiorno = new Map<string, { righe: Riga[]; data: Date }>()
  for (const r of righe) {
    const { chiave, data } = giornoDi(r.ts)
    const x = perGiorno.get(chiave) ?? { righe: [], data }
    x.righe.push(r)
    perGiorno.set(chiave, x)
  }
  const fatti = new Set<string>()
  for (const [chiave, x] of perGiorno) {
    // in un messaggio diretto anche una riga sola è una conversazione (la
    // domanda di un cliente); in un canale servono due righe, o una che lo
    // nomina, o una lunga: sotto, è un «ok» che non dice niente
    const vere = x.righe.filter(r => !r.bot)
    const tiene = tipo !== 'canale' ? x.righe.length >= 1
      : vere.length >= 2 || x.righe.some(r => r.menzionaMe || r.testo.length >= 80)
    if (!tiene) continue
    const id = `slack:${ch.id}:${chiave}`
    fatti.add(id)
    const giorno = x.data.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })
    fuori.docs.push(documento(id, ch, dove, `${dove} · ${giorno}`, x.righe, linkA(cx.url, ch.id, x.righe[0]!.ts), tipo === 'canale' ? 'canale' : 'messaggi'))
  }
  // un giorno letto per intero che non ha più niente da tenere: via
  if (w.esistenti) for (const id of w.esistenti.keys()) {
    const m = /^slack:([^:]+):(\d{4})-(\d{2})-(\d{2})$/.exec(id)
    if (!m || m[1] !== ch.id || fatti.has(id)) continue
    const inizio = new Date(Number(m[2]), Number(m[3]) - 1, Number(m[4])).getTime() / 1000
    if (dentro(inizio) && dentro(inizio + GIORNO - 1)) fuori.tolti.push(id)
  }

  // i suoi messaggi, e quelli che lo nominano, delle ultime due settimane: una
  // risposta che arriva sotto fra tre giorni non passa dalla storia del canale
  if (tipo === 'canale') for (const r of righe) {
    const k = `${ch.id}:${r.ts}`
    if ((r.mio || r.menzionaMe) && !st.fili[k] && w.adesso - Number(r.ts) < FILI_VIVI) {
      st.fili[k] = { ultima: r.ts, controllato: new Date(w.adesso * 1000).toISOString(), risposte: false }
    }
  }

  // quelli guardati qui (la storia dice già se hanno risposte) non si ricontrollano a parte
  for (const m of tutti) if (st.fili[`${ch.id}:${m.ts}`]) fuori.filiFatti.add(`${ch.id}:${m.ts}`)

  // per i segnali: i messaggi fuori dai fili, letti per intero dal tratto recente
  fuori.ambiti.push({ chiave: ch.id, conversazione: ch.id, filo: null, tipo, dove, righe, dal: String(tratti[0]!.da), presenti: tratti[0]!.messaggi.map(m => m.ts) })

  const visto = tutti.reduce((x, m) => Number(m.ts) > Number(x) ? m.ts : x, s.visto ?? '0')
  st.conv[ch.id] = { ...(visto !== '0' ? { visto } : {}), ...(fondo ? { fondo } : {}), letto: new Date(w.adesso * 1000).toISOString() }
}

/** Un filo per intero: un documento, e un pezzo per i segnali. */
async function leggiFilo(cx: Contesto, ch: Canale, ts: string, st: StatoSlack, fuori: Raccolta, adesso: number): Promise<void> {
  const k = `${ch.id}:${ts}`
  const id = `slack:${ch.id}:t${ts}`
  const tipo = tipoDi(ch)
  const dove = comeSiChiama(ch, cx.persone, cx.io)
  fuori.filiFatti.add(k)
  const messaggi = await filoIntero(cx.g, ch, ts)
  if (!messaggi || messaggi.length < 2) {
    // il filo non c'è più, o è rimasto la radice da sola: il documento esce, e le domande lì dentro si chiudono
    if (st.fili[k]?.risposte !== false) fuori.tolti.push(id)
    if (messaggi?.length === 1 && adesso - Number(ts) < FILI_VIVI) st.fili[k] = { ultima: ts, controllato: new Date(adesso * 1000).toISOString(), risposte: false }
    else delete st.fili[k]
    fuori.ambiti.push({ chiave: k, conversazione: ch.id, filo: ts, tipo, dove, righe: [], dal: ts, presenti: messaggi?.length === 1 ? [ts] : [] })
    return
  }
  const righe: Riga[] = []
  for (const m of messaggi) { const r = await inRiga(cx, ch, m, ts); if (r) righe.push(r) }
  if (!righe.length) return
  const radice = righe[0]!
  const breve = radice.testo.split('\n')[0]!.replace(/\s+/g, ' ').slice(0, 70)
  fuori.docs.push(documento(id, ch, dove, `${dove} · ${breve}`, righe, linkA(cx.url, ch.id, ts), 'filo'))
  fuori.ambiti.push({ chiave: k, conversazione: ch.id, filo: ts, tipo, dove, righe, dal: ts, presenti: messaggi.map(m => m.ts) })
  const ultima = messaggi.reduce((x, m) => Number(m.ts) > Number(x) ? m.ts : x, ts)
  st.fili[k] = { ultima, controllato: new Date(adesso * 1000).toISOString() }
}

// — scrivere: solo quando lui tocca «Manda» —

/**
 * Manda una risposta preparata, in un filo o in un messaggio diretto.
 *
 * La chiama una rotta sola (`POST /api/slack/invia`), e solo con il segno del
 * tocco: nessun lavoro di fondo arriva fin qui. Il posto deve essere uno dei
 * suoi e non escluso; il testo parte com'è, a nome suo.
 */
export async function invia(c: ConfigSlack, m: { conversazione: string; testo: string; filo?: string | null }):
  Promise<{ ts: string; permalink: string }> {
  const testo = m.testo.trim()
  if (!testo) throw new GuaioFonte('Il messaggio è vuoto.', 'guarda')
  if (!/^[A-Z0-9]+$/.test(m.conversazione)) throw new GuaioFonte('Questa conversazione non esiste.', 'guarda')
  if ((c.esclusi ?? []).includes(m.conversazione)) throw new GuaioFonte('Questa conversazione è esclusa.', 'guarda')
  if (m.filo && !/^\d+\.\d+$/.test(m.filo)) throw new GuaioFonte('Questa conversazione non esiste.', 'guarda')
  const g = nuovoGiro(c, 3)
  const { j } = await chiama<{ ts?: string; channel?: string }>(g, 'chat.postMessage', {
    channel: m.conversazione, text: testo, ...(m.filo ? { thread_ts: m.filo } : {})
  }, { post: true })
  const ts = j.ts ?? ''
  return { ts, permalink: linkA(c.url, j.channel ?? m.conversazione, ts, m.filo ?? null) }
}

export const perProva = { inizioGiorno, NOMI, IN_CORSO, SEGNO }
