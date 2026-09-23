// Un server MCP, dalla parte di chi chiede: quanto basta per leggere.
//
// Ci sono servizi che non hanno un'API da chiamare ma hanno un server MCP —
// Granola è il primo — e il protocollo, per chi deve solo leggere, è piccolo:
// JSON-RPC 2.0 in POST su un indirizzo solo, una sessione da tenere, tre
// metodi (`initialize`, `tools/list`, `tools/call`). Il pacchetto ufficiale
// porta dentro tutto il resto — server, trasporti, validatori di schemi — per
// usarne un decimo, su un'app da firmare. Qui ci sono le venti righe che
// servono davvero, come per Google.
//
// **L'autorizzazione è quella della specifica MCP** (2025-06-18, «Authorization»):
// il server dice chi autorizza (Protected Resource Metadata, RFC 9728), chi
// autorizza dice come (RFC 8414), e l'app si registra da sola (Dynamic Client
// Registration, RFC 7591) come client pubblico. Niente da incollare, niente
// app da creare su una console: è la ragione per cui questa strada esiste.
// Il ballo del consenso resta quello di `oauth.ts`, con PKCE.
//
// **Il trasporto è lo Streamable HTTP**: la risposta a un POST può essere un
// JSON o un flusso SSE, a scelta del server, e bisogna saper leggere tutti e
// due; la sessione arriva in `Mcp-Session-Id` con la risposta a `initialize`
// e va rimandata a ogni richiesta; un 404 con la sessione vuol dire che il
// server l'ha dimenticata, e si ricomincia da `initialize`.
//
// Quello che non c'è, apposta: il flusso GET per i messaggi che il server
// manda da sé, la ripresa di un flusso interrotto (`Last-Event-ID`), e le
// richieste del server al client (campionamento, radici). Per leggere delle
// note non servono, e non si dichiarano fra le capacità.

export const VERSIONE_PROTOCOLLO = '2025-06-18'

/**
 * Un guaio con un nome, perché chi usa questo modulo deve poterlo tradurre.
 *
 * I messaggi qui dentro sono per il registro, non per una persona: la frase
 * che si legge la sceglie il connettore, che sa di chi sta parlando.
 */
export type TipoGuaio = 'rete' | 'accesso' | 'limite' | 'protocollo' | 'strumento' | 'registrazione'

export class ErroreMcp extends Error {
  tipo: TipoGuaio
  stato: number
  // campi scritti a mano: node toglie i tipi e basta, e la scorciatoia nel
  // costruttore è l'unica cosa che genererebbe codice
  constructor(tipo: TipoGuaio, messaggio: string, stato = 0) {
    super(messaggio)
    this.tipo = tipo
    this.stato = stato
  }
}

/**
 * Un indirizzo a cui si può mandare un segreto.
 *
 * https, e basta — tranne sul proprio computer, dove le prove mettono i loro
 * server finti. Un metadato che rimanda a un http qualunque è un metadato di
 * cui non ci si fida: il token viaggerebbe in chiaro.
 */
export function sicuro(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol === 'https:') return true
    return u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)
  } catch { return false }
}

/** Lo stesso indirizzo, con o senza la barra in fondo. */
function stesso(a: string, b: string): boolean {
  const n = (x: string) => x.trim().replace(/\/+$/, '')
  return n(a) === n(b)
}

async function prendi(url: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(20_000) })
  } catch (e) {
    throw new ErroreMcp('rete', `${url}: ${e instanceof Error ? e.message : String(e)}`)
  }
}

async function jsonDa(url: string): Promise<Record<string, unknown> | null> {
  const r = await prendi(url, { headers: { accept: 'application/json' } })
  if (!r.ok) return null
  const j = await r.json().catch(() => null)
  return j && typeof j === 'object' && !Array.isArray(j) ? j as Record<string, unknown> : null
}

// — chi autorizza —

export type Scoperta = {
  /** Il server MCP, com'è scritto nei suoi metadati: va nel parametro `resource`. */
  risorsa: string
  /** Gli ambiti da chiedere. */
  ambiti: string[]
  emittente: string
  autorizza: string
  gettoni: string
  /** Dove ci si registra da soli. Senza, questa strada non si può fare. */
  registra: string | null
  metodi: string[]
}

/**
 * I parametri di un'intestazione `WWW-Authenticate: Bearer a="b", c="d"`.
 *
 * Il 401 del server MCP è il primo posto in cui la specifica dice di cercare:
 * dentro c'è `resource_metadata`, e a volte `scope`.
 */
export function parametriBearer(h: string | null): Record<string, string> {
  const fuori: Record<string, string> = {}
  if (!h) return fuori
  for (const m of h.matchAll(/([a-zA-Z_][\w-]*)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^\s,]+))/g)) {
    fuori[m[1]!.toLowerCase()] = (m[2] ?? m[3] ?? '').replace(/\\(.)/g, '$1')
  }
  return fuori
}

/**
 * Chi autorizza, e come: dal server MCP fino all'indirizzo del consenso.
 *
 * L'ordine è quello della specifica. Prima si bussa senza token: il 401 dice
 * dove stanno i metadati della risorsa. Se non lo dice, si cercano ai due
 * indirizzi ben noti — con il percorso del server dentro, e senza. Da lì si
 * prende il primo server d'autorizzazione e se ne leggono i metadati, di nuovo
 * ai loro indirizzi ben noti (RFC 8414 prima, OpenID dopo).
 *
 * Tre controlli, perché ognuno ferma un modo di mandare il token altrove:
 * la risorsa dichiarata è proprio questo server; l'emittente è proprio quello
 * a cui si è chiesto; gli indirizzi sono https. E uno perché lo chiede la
 * specifica: senza S256 fra i metodi di PKCE non si parte.
 *
 * Gli ambiti: quello che dice il 401, se lo dice; altrimenti quelli che la
 * risorsa dichiara (Granola: «mcp»). In più `offline_access` quando chi
 * autorizza lo conosce, ed è una scelta: senza, il token dura minuti e non si
 * rinnova, e il collegamento andrebbe rifatto a ogni lettura.
 */
export async function scopri(endpoint: string): Promise<Scoperta> {
  if (!sicuro(endpoint)) throw new ErroreMcp('protocollo', `endpoint non sicuro: ${endpoint}`)
  const base = new URL(endpoint)

  let indirizzoMetadati: string | null = null
  let ambitiDalServer: string[] = []
  const r401 = await prendi(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 0, method: 'initialize',
      params: { protocolVersion: VERSIONE_PROTOCOLLO, capabilities: {}, clientInfo: { name: 'Myynd', version: '1' } }
    })
  })
  await r401.body?.cancel().catch(() => {})
  if (r401.status === 401) {
    const p = parametriBearer(r401.headers.get('www-authenticate'))
    if (p.resource_metadata && sicuro(p.resource_metadata)) indirizzoMetadati = p.resource_metadata
    if (p.scope) ambitiDalServer = p.scope.split(/\s+/).filter(Boolean)
  }

  const percorso = base.pathname.replace(/\/+$/, '')
  const candidati = indirizzoMetadati ? [indirizzoMetadati] : [
    ...(percorso ? [`${base.origin}/.well-known/oauth-protected-resource${percorso}`] : []),
    `${base.origin}/.well-known/oauth-protected-resource`
  ]
  let risorsa: Record<string, unknown> | null = null
  for (const u of candidati) {
    risorsa = await jsonDa(u)
    if (risorsa) break
  }
  if (!risorsa) throw new ErroreMcp('protocollo', 'metadati della risorsa assenti')
  const dichiarata = typeof risorsa.resource === 'string' ? risorsa.resource : endpoint
  if (!stesso(dichiarata, endpoint) && !stesso(dichiarata, base.origin)) {
    throw new ErroreMcp('protocollo', `la risorsa dichiarata (${dichiarata}) non è questo server`)
  }
  const chi = Array.isArray(risorsa.authorization_servers) ? risorsa.authorization_servers.find(x => typeof x === 'string' && sicuro(x)) as string | undefined : undefined
  if (!chi) throw new ErroreMcp('protocollo', 'nessun server di autorizzazione')

  const as = new URL(chi)
  const dopo = as.pathname.replace(/\/+$/, '')
  const indirizziAs = dopo
    ? [`${as.origin}/.well-known/oauth-authorization-server${dopo}`, `${as.origin}/.well-known/openid-configuration${dopo}`, `${as.origin}${dopo}/.well-known/openid-configuration`]
    : [`${as.origin}/.well-known/oauth-authorization-server`, `${as.origin}/.well-known/openid-configuration`]
  let meta: Record<string, unknown> | null = null
  for (const u of indirizziAs) {
    meta = await jsonDa(u)
    if (meta) break
  }
  if (!meta) throw new ErroreMcp('protocollo', 'metadati del server di autorizzazione assenti')
  if (typeof meta.issuer === 'string' && !stesso(meta.issuer, chi)) {
    throw new ErroreMcp('protocollo', `l'emittente (${meta.issuer}) non è quello chiesto (${chi})`)
  }
  const autorizza = String(meta.authorization_endpoint ?? '')
  const gettoni = String(meta.token_endpoint ?? '')
  if (!sicuro(autorizza) || !sicuro(gettoni)) throw new ErroreMcp('protocollo', 'indirizzi di autorizzazione mancanti o non sicuri')
  const pkce = Array.isArray(meta.code_challenge_methods_supported) ? meta.code_challenge_methods_supported : []
  if (!pkce.includes('S256')) throw new ErroreMcp('protocollo', 'PKCE S256 non dichiarato')
  const registra = typeof meta.registration_endpoint === 'string' && sicuro(meta.registration_endpoint) ? meta.registration_endpoint : null

  const dichiarati = Array.isArray(risorsa.scopes_supported) ? risorsa.scopes_supported.filter((x): x is string => typeof x === 'string') : []
  const ambiti = [...(ambitiDalServer.length ? ambitiDalServer : dichiarati)]
  const noti = Array.isArray(meta.scopes_supported) ? meta.scopes_supported : []
  if (noti.includes('offline_access') && !ambiti.includes('offline_access')) ambiti.push('offline_access')

  return {
    risorsa: dichiarata,
    ambiti,
    emittente: typeof meta.issuer === 'string' ? meta.issuer : chi,
    autorizza,
    gettoni,
    registra,
    metodi: Array.isArray(meta.token_endpoint_auth_methods_supported) ? meta.token_endpoint_auth_methods_supported.filter((x): x is string => typeof x === 'string') : []
  }
}

export type Registrazione = { clientId: string; clientSecret?: string; metodo: string }

/**
 * L'app si registra da sola, con l'indirizzo di ritorno di questo giro.
 *
 * Client pubblico (`none`): sul computer di qualcuno un segreto non è un
 * segreto, e PKCE fa quel lavoro meglio. Senza `scope` nella registrazione:
 * è facoltativo, e chi autorizza può rifiutare un ambito che conosce solo la
 * risorsa («mcp» non è fra quelli del server di Granola) — si chiede dopo, nel
 * consenso, dove quel rifiuto non capita.
 *
 * Se torna un segreto lo stesso, si usa nel modo che il server dice.
 */
export async function registra(s: Scoperta, redirect: string, nome = 'Myynd'): Promise<Registrazione> {
  if (!s.registra) throw new ErroreMcp('registrazione', 'il server non accetta registrazioni')
  const r = await prendi(s.registra, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      client_name: nome,
      redirect_uris: [redirect],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none'
    })
  })
  const j = await r.json().catch(() => ({})) as Record<string, unknown>
  if (!r.ok || typeof j.client_id !== 'string' || !j.client_id) {
    throw new ErroreMcp('registrazione', `registrazione rifiutata (${r.status}${typeof j.error === 'string' ? `: ${j.error}` : ''})`, r.status)
  }
  return {
    clientId: j.client_id,
    ...(typeof j.client_secret === 'string' && j.client_secret ? { clientSecret: j.client_secret } : {}),
    metodo: typeof j.token_endpoint_auth_method === 'string' ? j.token_endpoint_auth_method : 'none'
  }
}

// — il cliente —

export type Strumento = { name: string; description?: string; inputSchema?: Record<string, unknown> }

/**
 * Quello che torna uno strumento: `content[]` e/o `structuredContent`.
 *
 * `isError` vero vuol dire che lo strumento ha risposto «no» — con un 200,
 * e il perché dentro `content` — ed è diverso da un errore del protocollo.
 */
export type Risultato = {
  content?: { type?: string; text?: string; [k: string]: unknown }[]
  structuredContent?: unknown
  isError?: boolean
  [k: string]: unknown
}

/** Il testo di un risultato, con i pezzi di testo uno dopo l'altro. */
export function testoDi(r: Risultato | null | undefined): string {
  if (!r || !Array.isArray(r.content)) return ''
  return r.content.filter(c => c && c.type === 'text' && typeof c.text === 'string').map(c => c.text as string).join('\n')
}

const aspetta = (ms: number) => new Promise(f => setTimeout(f, ms))

/**
 * Una sessione con un server MCP, a nome di una persona.
 *
 * `token` dà il token d'accesso buono adesso; `scaduto` dice di buttarlo,
 * perché il server l'ha rifiutato. Il primo 401 fa rinnovare una volta e
 * riprovare: un token scaduto in volo non è un collegamento rotto. Il
 * secondo 401 lo è.
 */
export class ClienteMcp {
  private endpoint: string
  private token: () => Promise<string>
  private scaduto: () => void
  private attesa: number
  private sessione: string | null = null
  private versione = VERSIONE_PROTOCOLLO
  private prossimo = 1
  private pronto: Promise<void> | null = null
  /** Quante richieste sono partite: le prove lo guardano, il registro anche. */
  richieste = 0

  constructor(o: { endpoint: string; token: () => Promise<string>; scaduto?: () => void; attesa?: number }) {
    this.endpoint = o.endpoint
    this.token = o.token
    this.scaduto = o.scaduto ?? (() => {})
    this.attesa = o.attesa ?? 45_000
  }

  async strumenti(): Promise<Strumento[]> {
    const fuori: Strumento[] = []
    let cursore: string | undefined
    for (let pagina = 0; pagina < 20; pagina++) {
      const r = await this.rpc('tools/list', cursore ? { cursor: cursore } : {}) as { tools?: unknown; nextCursor?: unknown }
      if (Array.isArray(r?.tools)) for (const t of r.tools) if (t && typeof t === 'object' && typeof (t as Strumento).name === 'string') fuori.push(t as Strumento)
      cursore = typeof r?.nextCursor === 'string' && r.nextCursor ? r.nextCursor : undefined
      if (!cursore) break
    }
    return fuori
  }

  async chiama(nome: string, argomenti: Record<string, unknown> = {}): Promise<Risultato> {
    const r = await this.rpc('tools/call', { name: nome, arguments: argomenti })
    return (r && typeof r === 'object' ? r : {}) as Risultato
  }

  /** La sessione non serve più: si dice al server, se la vuole sapere. Mai un errore. */
  async chiudi(): Promise<void> {
    if (!this.sessione) return
    const sessione = this.sessione
    this.sessione = null
    this.pronto = null
    try {
      const r = await fetch(this.endpoint, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${await this.token()}`, 'mcp-session-id': sessione, 'mcp-protocol-version': this.versione },
        signal: AbortSignal.timeout(5_000)
      })
      await r.body?.cancel().catch(() => {})
    } catch { /* il server la dimenticherà da solo */ }
  }

  private assicura(): Promise<void> {
    if (!this.pronto) {
      this.pronto = (async () => {
        const r = await this.invia('initialize', {
          protocolVersion: VERSIONE_PROTOCOLLO,
          capabilities: {},
          clientInfo: { name: 'Myynd', version: '1' }
        }, false) as { protocolVersion?: unknown }
        if (typeof r?.protocolVersion === 'string' && r.protocolVersion) this.versione = r.protocolVersion
        await this.invia('notifications/initialized', undefined, true)
      })()
      this.pronto.catch(() => { this.pronto = null })
    }
    return this.pronto
  }

  private async rpc(metodo: string, params: unknown): Promise<unknown> {
    await this.assicura()
    try {
      return await this.invia(metodo, params, false)
    } catch (e) {
      // la sessione dimenticata dal server: si rifà `initialize` una volta
      if (e instanceof ErroreMcp && e.tipo === 'protocollo' && e.stato === 404 && this.sessione) {
        this.sessione = null
        this.pronto = null
        await this.assicura()
        return await this.invia(metodo, params, false)
      }
      throw e
    }
  }

  private async invia(metodo: string, params: unknown, notifica: boolean): Promise<unknown> {
    const id = notifica ? undefined : this.prossimo++
    const corpo = JSON.stringify({ jsonrpc: '2.0', ...(id !== undefined ? { id } : {}), method: metodo, ...(params !== undefined ? { params } : {}) })
    let rinnovato = false
    let rallentato = 0
    for (;;) {
      const intestazioni: Record<string, string> = {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${await this.token()}`
      }
      if (this.sessione) intestazioni['mcp-session-id'] = this.sessione
      if (metodo !== 'initialize') intestazioni['mcp-protocol-version'] = this.versione
      this.richieste++
      let r: Response
      try {
        r = await fetch(this.endpoint, { method: 'POST', headers: intestazioni, body: corpo, signal: AbortSignal.timeout(this.attesa) })
      } catch (e) {
        throw new ErroreMcp('rete', `${metodo}: ${e instanceof Error ? e.message : String(e)}`)
      }
      if (r.status === 401 && !rinnovato) {
        await r.body?.cancel().catch(() => {})
        rinnovato = true
        this.scaduto()
        continue
      }
      /*
       * Rallentare, non rinunciare: il limite di Granola è una media al
       * minuto, e aspettare quello che dice `Retry-After` è la risposta che
       * chiede. Tre volte, e mai più di mezzo minuto: oltre, se ne riparla al
       * giro dopo.
       */
      if ((r.status === 429 || r.status === 503) && rallentato < 3) {
        await r.body?.cancel().catch(() => {})
        rallentato++
        const detto = Number(r.headers.get('retry-after'))
        await aspetta(Math.min(30, Number.isFinite(detto) && detto >= 0 ? detto : 5) * 1000)
        continue
      }
      if (r.status === 401 || r.status === 403) { await r.body?.cancel().catch(() => {}); throw new ErroreMcp('accesso', `${metodo}: ${r.status}`, r.status) }
      if (r.status === 429) { await r.body?.cancel().catch(() => {}); throw new ErroreMcp('limite', `${metodo}: 429`, 429) }
      if (!r.ok) { await r.body?.cancel().catch(() => {}); throw new ErroreMcp('protocollo', `${metodo}: ${r.status}`, r.status) }

      const sessione = r.headers.get('mcp-session-id')
      if (metodo === 'initialize' && sessione) this.sessione = sessione
      if (notifica || id === undefined) { await r.body?.cancel().catch(() => {}); return null }

      const tipo = (r.headers.get('content-type') ?? '').toLowerCase()
      const messaggio = tipo.includes('text/event-stream') ? await dalFlusso(r, id) : await r.json().catch(() => null)
      return risposta(messaggio, id, metodo)
    }
  }
}

/** La risposta con il nostro `id`, anche dentro un lotto. */
function risposta(m: unknown, id: number, metodo: string): unknown {
  const tutti = Array.isArray(m) ? m : [m]
  const nostra = tutti.find(x => x && typeof x === 'object' && (x as { id?: unknown }).id === id) as { result?: unknown; error?: { message?: unknown; code?: unknown } } | undefined
  if (!nostra) throw new ErroreMcp('protocollo', `${metodo}: nessuna risposta`)
  if (nostra.error) {
    throw new ErroreMcp('protocollo', `${metodo}: ${String(nostra.error.message ?? 'errore')}`, Number(nostra.error.code) || 0)
  }
  return nostra.result
}

/** Il tetto di un flusso: oltre, non è una risposta, è un guasto. */
const FLUSSO_MAX = 20_000_000

/**
 * Un flusso SSE, letto fino alla risposta che aspettiamo.
 *
 * Gli eventi sono separati da una riga vuota; di ogni evento contano le righe
 * `data:`, unite. Dentro possono arrivare altre cose prima della risposta —
 * avanzamenti, un `ping` — e si lasciano passare. Appena arriva la nostra si
 * chiude il flusso: il server non deve tenerlo aperto per noi.
 */
async function dalFlusso(r: Response, id: number): Promise<unknown> {
  if (!r.body) throw new ErroreMcp('protocollo', 'flusso vuoto')
  const lettore = r.body.getReader()
  const dec = new TextDecoder()
  let resto = ''
  let letti = 0
  const evento = (blocco: string): unknown => {
    const dati = blocco.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).replace(/^ /, '')).join('\n')
    if (!dati) return undefined
    try { return JSON.parse(dati) } catch { return undefined }
  }
  const nostro = (m: unknown) => (Array.isArray(m) ? m : [m]).some(x => x && typeof x === 'object' && (x as { id?: unknown }).id === id && ('result' in x || 'error' in x))
  try {
    for (;;) {
      const { value, done } = await lettore.read()
      if (value) {
        letti += value.length
        if (letti > FLUSSO_MAX) throw new ErroreMcp('protocollo', 'flusso troppo lungo')
        resto += dec.decode(value, { stream: true })
      }
      if (done) resto += '\n\n'
      let taglio: RegExpExecArray | null
      while ((taglio = /\r?\n\r?\n/.exec(resto))) {
        const blocco = resto.slice(0, taglio.index)
        resto = resto.slice(taglio.index + taglio[0].length)
        const m = evento(blocco)
        if (m !== undefined && nostro(m)) return m
      }
      if (done) throw new ErroreMcp('protocollo', 'il flusso è finito senza risposta')
    }
  } finally {
    lettore.cancel().catch(() => {})
  }
}
