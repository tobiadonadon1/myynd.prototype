// Granola con l'account, contro un Granola finto: il server d'autorizzazione e
// il server MCP girano qui dentro, su 127.0.0.1, e rispondono come quelli veri
// hanno risposto il 23 settembre 2026 ai metadati pubblici
// (review/connessioni/granola-mcp-discovery.txt): il 401 con
// `resource_metadata`, la risorsa `…/mcp` con l'ambito `mcp`, WorkOS con la
// registrazione dinamica, PKCE S256, `offline_access`, e il refresh che vale
// una volta sola. Gli strumenti rispondono con la forma dello schema ufficiale
// ripubblicato (list_meetings a finestre di date, get_meetings a dieci per
// volta, un XML leggero dentro `content[0].text`).
//
// Il browser è finto anche lui: una `fetch` che va all'indirizzo del consenso,
// prende il 302 e bussa al ritorno. Nessun browser vero, nessuna registrazione
// presso Granola.
//
//   node --test --disable-warning=ExperimentalWarning server/granolaMcp.test.ts

import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DATI = mkdtempSync(join(tmpdir(), 'myynd-granola-mcp-'))
process.env.MYYND_DATI = DATI
// ospitati con il dominio noto: così si prova anche il ritorno via web. La
// strada in casa non guarda `ospitato`, e si prova nello stesso file.
process.env.RAILWAY_ENVIRONMENT = 'prova'
process.env.MYYND_PUBBLICO = 'myynd.esempio.it'

const g = await import('./connettori/granolaMcp.ts')
const mcp = await import('./connettori/mcp.ts')
const oauth = await import('./connettori/oauth.ts')
const config = await import('./config.ts')
const chi = await import('./chi.ts')

// — il Granola finto —

const GIORNO = 86_400_000
const MESI = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** La data come la scrive Granola: «Feb 4, 2026 7:30 PM», senza fuso. */
function dataGranola(ms: number): string {
  const d = new Date(ms)
  const h = d.getHours()
  return `${MESI[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

type RiunioneFinta = { id: string; titolo: string; quando: number; persone: string[]; riassunto: string; appunti?: string }
type Chiamata = { metodo: string; nome?: string; argomenti?: Record<string, unknown>; sessione: string | null; versione: string | null }

const f = {
  n: 0,
  registrazioni: [] as Record<string, unknown>[],
  codici: new Map<string, Record<string, string | null>>(),
  consensi: [] as URLSearchParams[],
  token: [] as URLSearchParams[],
  refreshValidi: new Set<string>(),
  accessiValidi: new Set<string>(),
  scadenza: 3600,
  lentezzaRinnovo: 0,
  nega: false,
  senzaRefresh: false,
  rifiutaRegistrazione: false,
  // il server MCP
  riunioni: [] as RiunioneFinta[],
  chiamate: [] as Chiamata[],
  sessioni: new Set<string>(),
  sse: false,
  senzaIntestazione: false,
  dimenticaUnaVolta: false,
  piano: 'Business',
  /** list_meetings ne torna al massimo tante, con il `count` vero nella busta. */
  tagliaA: Infinity,
  forma: 'xml' as 'xml' | 'json' | 'strutturato',
  risorsaDichiarata: null as string | null,
  emittente: null as string | null,
  listaInErrore: null as string | null
}

function azzera() {
  Object.assign(f, {
    registrazioni: [], codici: new Map(), consensi: [], token: [], refreshValidi: new Set(), accessiValidi: new Set(),
    scadenza: 3600, lentezzaRinnovo: 0, nega: false, senzaRefresh: false, rifiutaRegistrazione: false,
    riunioni: [], chiamate: [], sessioni: new Set(), sse: false, senzaIntestazione: false, dimenticaUnaVolta: false,
    piano: 'Business', tagliaA: Infinity, forma: 'xml', risorsaDichiarata: null, emittente: null, listaInErrore: null
  })
}

const corpo = (req: IncomingMessage) => new Promise<string>(ok => { let s = ''; req.on('data', d => { s += d }); req.on('end', () => ok(s)) })
function json(res: ServerResponse, stato: number, j: unknown, extra: Record<string, string> = {}) {
  res.writeHead(stato, { 'content-type': 'application/json', ...extra })
  res.end(JSON.stringify(j))
}
const sha = (s: string) => createHash('sha256').update(s).digest('base64url')

let AS = ''
let MCP = ''

function emetti() {
  const n = ++f.n
  const a = `acc-${n}`
  const r = `ref-${n}`
  f.accessiValidi.add(a)
  if (!f.senzaRefresh) f.refreshValidi.add(r)
  return { access_token: a, ...(f.senzaRefresh ? {} : { refresh_token: r }), token_type: 'Bearer', expires_in: f.scadenza }
}

const serverAs = createServer(async (req, res) => {
  const u = new URL(req.url ?? '/', AS)
  if (req.method === 'GET' && u.pathname === '/.well-known/oauth-authorization-server') {
    return json(res, 200, {
      issuer: f.emittente ?? AS,
      authorization_endpoint: `${AS}/oauth2/authorize`,
      token_endpoint: `${AS}/oauth2/token`,
      registration_endpoint: `${AS}/oauth2/register`,
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['email', 'offline_access', 'openid', 'profile'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
      grant_types_supported: ['authorization_code', 'refresh_token']
    })
  }
  if (req.method === 'POST' && u.pathname === '/oauth2/register') {
    const b = JSON.parse(await corpo(req)) as Record<string, unknown>
    f.registrazioni.push(b)
    if (f.rifiutaRegistrazione) return json(res, 400, { error: 'invalid_client_metadata' })
    return json(res, 201, { client_id: `cli-${++f.n}`, token_endpoint_auth_method: 'none', redirect_uris: b.redirect_uris })
  }
  if (req.method === 'GET' && u.pathname === '/oauth2/authorize') {
    const q = u.searchParams
    f.consensi.push(q)
    const ritorno = new URL(q.get('redirect_uri')!)
    ritorno.searchParams.set('state', q.get('state') ?? '')
    if (f.nega) ritorno.searchParams.set('error', 'access_denied')
    else {
      const codice = `cod-${++f.n}`
      f.codici.set(codice, {
        sfida: q.get('code_challenge'), metodo: q.get('code_challenge_method'), client: q.get('client_id'),
        redirect: q.get('redirect_uri'), risorsa: q.get('resource'), ambiti: q.get('scope')
      })
      ritorno.searchParams.set('code', codice)
    }
    res.writeHead(302, { location: ritorno.toString() })
    return res.end()
  }
  if (req.method === 'POST' && u.pathname === '/oauth2/token') {
    const p = new URLSearchParams(await corpo(req))
    f.token.push(p)
    if (p.get('grant_type') === 'authorization_code') {
      const c = f.codici.get(p.get('code') ?? '')
      f.codici.delete(p.get('code') ?? '')
      const buono = c && c.metodo === 'S256' && c.client === p.get('client_id') && c.redirect === p.get('redirect_uri') &&
        sha(p.get('code_verifier') ?? '') === c.sfida && c.risorsa === p.get('resource')
      return buono ? json(res, 200, emetti()) : json(res, 400, { error: 'invalid_grant' })
    }
    if (p.get('grant_type') === 'refresh_token') {
      const r = p.get('refresh_token') ?? ''
      if (!f.refreshValidi.has(r)) return json(res, 400, { error: 'invalid_grant' })
      // come WorkOS: un refresh si usa una volta sola
      f.refreshValidi.delete(r)
      if (f.lentezzaRinnovo) await new Promise(ok => setTimeout(ok, f.lentezzaRinnovo))
      return json(res, 200, emetti())
    }
    return json(res, 400, { error: 'unsupported_grant_type' })
  }
  res.writeHead(404); res.end()
})

const STRUMENTI = [
  {
    name: 'list_meetings',
    inputSchema: {
      type: 'object',
      properties: {
        time_range: { type: 'string', enum: ['this_week', 'last_week', 'last_30_days', 'custom'], default: 'last_30_days' },
        custom_start: { type: 'string' },
        custom_end: { type: 'string' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'get_meetings',
    inputSchema: {
      type: 'object',
      properties: { meeting_ids: { type: 'array', items: { type: 'string', format: 'uuid' }, minItems: 1, maxItems: 10 } },
      required: ['meeting_ids']
    }
  },
  { name: 'get_meeting_transcript', inputSchema: { type: 'object', properties: { meeting_id: { type: 'string' } } } },
  { name: 'get_account_info', inputSchema: { type: 'object', properties: {} } }
]

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function busta(rr: RiunioneFinta[], conNote: boolean, dichiarate = rr.length): Record<string, unknown> {
  if (f.forma === 'strutturato' || f.forma === 'json') {
    const meetings = rr.map(r => ({
      id: r.id, title: r.titolo, date: new Date(r.quando).toISOString(),
      attendees: r.persone.map(p => { const m = /^(.*) <(.*)>$/.exec(p); return m ? { name: m[1], email: m[2] } : { name: p } }),
      ...(conNote ? { summary: r.riassunto, private_notes: r.appunti ?? '' } : {})
    }))
    const j = { count: dichiarate, meetings }
    return f.forma === 'strutturato'
      ? { content: [{ type: 'text', text: `${rr.length} meetings` }], structuredContent: j }
      : { content: [{ type: 'text', text: JSON.stringify(j) }] }
  }
  const pezzi = rr.map(r => `<meeting id="${r.id}" title="${esc(r.titolo)}" date="${dataGranola(r.quando)}">
    <known_participants>
    ${r.persone.map((p, i) => i === 0 ? p.replace(/ </, ' (note creator) from Acme <') : p).join('\n    ')}
    </known_participants>${conNote ? `
    <summary>
${r.riassunto}
</summary>${r.appunti ? `
    <private_notes>${r.appunti}</private_notes>` : ''}` : ''}
  </meeting>`)
  return { content: [{ type: 'text', text: `<meetings_data from="x" to="y" count="${dichiarate}">\n${pezzi.join('\n\n')}\n</meetings_data>` }], isError: false }
}

function strumento(nome: string, a: Record<string, unknown>): Record<string, unknown> {
  if (nome === 'get_account_info') return { content: [{ type: 'text', text: `Email: ada@example.com\nWorkspace: Example\nPlan: ${f.piano}` }] }
  if (nome === 'list_meetings') {
    if (f.listaInErrore) return { content: [{ type: 'text', text: f.listaInErrore }], isError: true }
    if (a.time_range !== 'custom') return { content: [{ type: 'text', text: 'solo custom qui' }], isError: true }
    const da = Date.parse(`${a.custom_start}T00:00:00Z`)
    const fino = Date.parse(`${a.custom_end}T23:59:59Z`)
    let dentro = f.riunioni.filter(r => r.quando >= da && r.quando <= fino).sort((x, y) => y.quando - x.quando)
    // il piano gratuito: prima di trenta giorni fa non c'è niente
    if (f.piano === 'Basic') dentro = dentro.filter(r => r.quando > Date.now() - 30 * GIORNO)
    return busta(dentro.slice(0, f.tagliaA), false, dentro.length)
  }
  if (nome === 'get_meetings') {
    const ids = a.meeting_ids as string[]
    if (!Array.isArray(ids) || ids.length > 10) return { content: [{ type: 'text', text: 'meeting_ids: max 10' }], isError: true }
    return busta(f.riunioni.filter(r => ids.includes(r.id)), true)
  }
  return { content: [{ type: 'text', text: 'Transcripts are only available to paid Granola tiers' }], isError: true }
}

function rispondi(res: ServerResponse, id: unknown, result: unknown, extra: Record<string, string> = {}) {
  const m = JSON.stringify({ jsonrpc: '2.0', id, result })
  if (!f.sse) return json(res, 200, { jsonrpc: '2.0', id, result }, extra)
  res.writeHead(200, { 'content-type': 'text/event-stream', ...extra })
  // prima un avanzamento, che non è la risposta; poi la risposta, spezzata su due righe `data:`
  res.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/progress', params: { progress: 1 } })}\n\n`)
  const taglio = m.indexOf(',') + 1
  res.write(`id: 1\nevent: message\ndata: ${m.slice(0, taglio)}\ndata: ${m.slice(taglio)}\n\n`)
  res.end()
}

const serverMcp = createServer(async (req, res) => {
  const u = new URL(req.url ?? '/', MCP)
  if (req.method === 'GET' && u.pathname.startsWith('/.well-known/oauth-protected-resource')) {
    return json(res, 200, { resource: f.risorsaDichiarata ?? `${MCP}/mcp`, authorization_servers: [AS], scopes_supported: ['mcp'], bearer_methods_supported: ['header'] })
  }
  if (u.pathname !== '/mcp') { res.writeHead(404); return res.end() }
  const sid = (req.headers['mcp-session-id'] as string | undefined) ?? null
  if (req.method === 'DELETE') { if (sid) f.sessioni.delete(sid); res.writeHead(200); return res.end() }
  const token = String(req.headers.authorization ?? '').replace(/^Bearer /, '')
  if (!f.accessiValidi.has(token)) {
    res.writeHead(401, {
      'content-type': 'application/json',
      ...(f.senzaIntestazione ? {} : { 'www-authenticate': `Bearer error="invalid_token", error_description="Authorization needed", resource_metadata="${MCP}/.well-known/oauth-protected-resource"` })
    })
    return res.end('{"message":"Unauthorized"}')
  }
  const m = JSON.parse(await corpo(req)) as { id?: unknown; method: string; params?: { name?: string; arguments?: Record<string, unknown> } }
  f.chiamate.push({ metodo: m.method, nome: m.params?.name, argomenti: m.params?.arguments, sessione: sid, versione: (req.headers['mcp-protocol-version'] as string | undefined) ?? null })
  if (m.method === 'initialize') {
    const s = `ses-${++f.n}`
    f.sessioni.add(s)
    return rispondi(res, m.id, { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'granola-finto', version: '0' } }, { 'mcp-session-id': s })
  }
  if (!sid || !f.sessioni.has(sid)) { res.writeHead(sid ? 404 : 400); return res.end() }
  if (f.dimenticaUnaVolta && m.method === 'tools/call') {
    f.dimenticaUnaVolta = false
    f.sessioni.delete(sid)
    res.writeHead(404); return res.end()
  }
  if (m.method === 'notifications/initialized') { res.writeHead(202); return res.end() }
  if (m.method === 'tools/list') return rispondi(res, m.id, { tools: STRUMENTI })
  if (m.method === 'tools/call') return rispondi(res, m.id, strumento(m.params?.name ?? '', m.params?.arguments ?? {}))
  return json(res, 200, { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'Method not found' } })
})

const ascolta = (s: Server) => new Promise<number>(ok => s.listen(0, '127.0.0.1', () => ok((s.address() as { port: number }).port)))

before(async () => {
  AS = `http://127.0.0.1:${await ascolta(serverAs)}`
  MCP = `http://127.0.0.1:${await ascolta(serverMcp)}`
  process.env.MYYND_GRANOLA_MCP = `${MCP}/mcp`
})
after(() => {
  serverAs.close(); serverMcp.close()
  rmSync(DATI, { recursive: true, force: true })
})
beforeEach(() => {
  azzera()
  g.scorda()
  const c = config.leggi()
  if (c.granola) { delete c.granola; config.scrivi(c, { togli: ['granola'] }) }
})

// — gli attrezzi delle prove —

const uuid = (n: number) => `0dba4400-50f1-4262-9ac7-${String(n).padStart(12, '0')}`
function riunione(n: number, giorniFa: number, extra: Partial<RiunioneFinta> = {}): RiunioneFinta {
  return {
    id: uuid(n), titolo: `Riunione ${n}`, quando: Date.now() - giorniFa * GIORNO,
    persone: ['John Doe <john@acme.com>', 'Jane Smith <jane@acme.com>'],
    riassunto: `## Decisioni\n- Punto ${n}`, ...extra
  }
}

/** Le azioni di `index.ts`, senza l'indice vero: si tiene quello che arriva. */
function azioni(gia = new Map<string, string | null>()) {
  const salvati: import('./connettori/granolaMcp.ts').EsitoMcp[] = []
  return {
    salvati,
    a: {
      gia: () => gia,
      salva: async (e: import('./connettori/granolaMcp.ts').EsitoMcp) => { salvati.push(e); return e.docs.length }
    }
  }
}

/** Il browser: va al consenso, prende il 302, bussa al ritorno. */
async function browser(dove: string): Promise<Response> {
  const r = await fetch(dove, { redirect: 'manual' })
  assert.equal(r.status, 302)
  return fetch(r.headers.get('location')!)
}

async function finché(id: string) {
  for (let i = 0; i < 400; i++) {
    const s = g.statoDi(id)
    if (s && s.stato !== 'attesa' && s.stato !== 'lettura') return s
    await new Promise(ok => setTimeout(ok, 15))
  }
  throw new Error('il collegamento non è finito')
}

/** Un collegamento già fatto, scritto a mano: per le prove del giro di sfondo. */
function giàCollegato(refresh = 'ref-iniziale') {
  f.refreshValidi.add(refresh)
  config.scrivi({
    ...config.leggi(),
    granola: { note: 0, clientId: 'cli-0', refresh, gettoni: `${AS}/oauth2/token`, risorsa: `${MCP}/mcp`, mcp: `${MCP}/mcp` }
  })
}

// — la scoperta —

test('la scoperta segue il 401 fino a chi autorizza, e chiede «mcp» più offline_access', async () => {
  const s = await mcp.scopri(`${MCP}/mcp`)
  assert.equal(s.risorsa, `${MCP}/mcp`)
  assert.equal(s.emittente, AS)
  assert.equal(s.autorizza, `${AS}/oauth2/authorize`)
  assert.equal(s.gettoni, `${AS}/oauth2/token`)
  assert.equal(s.registra, `${AS}/oauth2/register`)
  assert.deepEqual(s.ambiti, ['mcp', 'offline_access'])
})

test('senza WWW-Authenticate i metadati si cercano agli indirizzi ben noti', async () => {
  f.senzaIntestazione = true
  const s = await mcp.scopri(`${MCP}/mcp`)
  assert.equal(s.autorizza, `${AS}/oauth2/authorize`)
})

test('una risorsa che non è questo server, o un emittente che non è quello chiesto, fermano tutto', async () => {
  f.risorsaDichiarata = 'https://altro.esempio/mcp'
  await assert.rejects(() => mcp.scopri(`${MCP}/mcp`), (e: unknown) => e instanceof mcp.ErroreMcp && e.tipo === 'protocollo')
  f.risorsaDichiarata = null
  f.emittente = 'https://finto.esempio'
  await assert.rejects(() => mcp.scopri(`${MCP}/mcp`), /emittente/)
  // e per chi legge la scheda, una frase sola
  assert.equal(g.frase(new mcp.ErroreMcp('protocollo', 'x')), g.CAMBIATO)
})

test('un indirizzo in chiaro fuori da questo computer non riceve niente', () => {
  assert.equal(mcp.sicuro('https://mcp.granola.ai/mcp'), true)
  assert.equal(mcp.sicuro('http://127.0.0.1:9/x'), true)
  assert.equal(mcp.sicuro('http://mcp.granola.ai/mcp'), false)
  assert.deepEqual(mcp.parametriBearer('Bearer error="invalid_token", resource_metadata="https://a/b", scope="mcp x"'),
    { error: 'invalid_token', resource_metadata: 'https://a/b', scope: 'mcp x' })
})

// — collegare, in casa —

test('in casa: registrazione dinamica pubblica, consenso con PKCE S256, state, risorsa e ambiti', async () => {
  f.riunioni = [riunione(1, 1), riunione(2, 3)]
  const { a, salvati } = azioni()
  const { id, dove, scade } = await g.avvia(a)
  assert.ok(scade > Date.now())

  // la registrazione: client pubblico, con il ritorno di questo giro
  assert.equal(f.registrazioni.length, 1)
  const reg = f.registrazioni[0]!
  assert.equal(reg.token_endpoint_auth_method, 'none')
  assert.deepEqual(reg.grant_types, ['authorization_code', 'refresh_token'])
  const [ritorno] = reg.redirect_uris as string[]
  assert.match(ritorno!, /^http:\/\/localhost:\d+\/callback$/)

  // l'indirizzo del consenso: nessun browser aperto da qui, lo apre chi l'ha chiesto
  const u = new URL(dove)
  assert.equal(u.origin + u.pathname, `${AS}/oauth2/authorize`)
  assert.equal(u.searchParams.get('response_type'), 'code')
  assert.equal(u.searchParams.get('client_id'), 'cli-1')
  assert.equal(u.searchParams.get('redirect_uri'), ritorno)
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256')
  assert.ok((u.searchParams.get('code_challenge') ?? '').length >= 43)
  assert.ok((u.searchParams.get('state') ?? '').length >= 24)
  assert.equal(u.searchParams.get('resource'), `${MCP}/mcp`)
  assert.equal(u.searchParams.get('scope'), 'mcp offline_access')
  assert.equal(g.statoDi(id)?.stato, 'attesa')

  const r = await browser(dove)
  assert.equal(r.status, 200)
  assert.match(await r.text(), /Fatto/)
  const s = await finché(id)
  assert.deepEqual(s, { stato: 'fatto', note: 2 })

  // lo scambio: il verificatore giusto (il finto lo controlla), la risorsa, il client
  const scambio = f.token.find(p => p.get('grant_type') === 'authorization_code')!
  assert.equal(scambio.get('client_id'), 'cli-1')
  assert.equal(scambio.get('resource'), `${MCP}/mcp`)
  assert.ok(scambio.get('code_verifier'))
  assert.equal(scambio.get('client_secret'), null)

  // e solo adesso il collegamento è scritto, con il refresh e senza il token d'accesso
  const c = config.leggi().granola!
  assert.equal(c.refresh, 'ref-3')
  assert.equal(c.clientId, 'cli-1')
  assert.equal(c.gettoni, `${AS}/oauth2/token`)
  assert.equal(c.note, 2)
  assert.ok(!JSON.stringify(c).includes('acc-'))
  assert.equal(salvati.length, 1)
  assert.equal(salvati[0]!.docs.length, 2)
})

test('il no nel browser si legge come un no, e non si scrive niente', async () => {
  f.nega = true
  const { a } = azioni()
  const { id, dove } = await g.avvia(a)
  const r = await browser(dove)
  assert.equal(r.status, 400)
  const s = await finché(id)
  assert.equal(s.stato, 'errore')
  assert.equal(s.errore, 'Hai detto di no a Granola.')
  assert.equal(config.leggi().granola, undefined)
})

test('«Annulla» chiude la porta del ritorno, e il collegamento non si scrive', async () => {
  const { a } = azioni()
  const { id, dove } = await g.avvia(a)
  assert.equal(g.annulla(id)?.stato, 'annullato')
  const consenso = await fetch(dove, { redirect: 'manual' })
  await assert.rejects(() => fetch(consenso.headers.get('location')!))
  assert.equal(g.statoDi(id)?.stato, 'annullato')
  assert.equal(config.leggi().granola, undefined)
})

test('un collegamento avviato da un altro conto non si vede e non si annulla', async () => {
  const { a } = azioni()
  const { id } = await g.avvia(a)
  assert.equal(chi.dentro('bruno', () => g.statoDi(id)), null)
  assert.equal(chi.dentro('bruno', () => g.annulla(id)), null)
  assert.equal(g.statoDi(id)?.stato, 'attesa')
  g.annulla(id)
})

test('senza refresh il collegamento morirebbe fra poco: si dice, e non si scrive', async () => {
  f.senzaRefresh = true
  const { a } = azioni()
  const { id, dove } = await g.avvia(a)
  await browser(dove)
  const s = await finché(id)
  assert.equal(s.errore, g.SENZA_DURATA)
  assert.equal(config.leggi().granola, undefined)
})

test('una registrazione rifiutata, e un Granola che non risponde, hanno ognuno la sua frase', async () => {
  f.rifiutaRegistrazione = true
  await assert.rejects(() => g.avvia(azioni().a), { message: g.REGISTRAZIONE })
  const vero = process.env.MYYND_GRANOLA_MCP
  process.env.MYYND_GRANOLA_MCP = 'http://127.0.0.1:9/mcp'
  try {
    await assert.rejects(() => g.avvia(azioni().a), { message: g.RETE })
  } finally { process.env.MYYND_GRANOLA_MCP = vero }
})

// — collegare, ospitati —

test('ospitati: l’app si registra col ritorno del dominio, e il ritorno scrive nel conto di chi ha avviato', async () => {
  f.riunioni = [riunione(7, 2)]
  const { a } = azioni()
  const { dove, biglietto } = await chi.dentro('anna', () => g.avviaSulWeb(a))
  assert.deepEqual(f.registrazioni[0]!.redirect_uris, ['https://myynd.esempio.it/api/oauth/ritorno'])
  const consenso = await fetch(dove, { redirect: 'manual' })
  const torna = new URL(consenso.headers.get('location')!)
  assert.equal(torna.origin + torna.pathname, 'https://myynd.esempio.it/api/oauth/ritorno')
  const { nome } = await oauth.completaWeb(torna.searchParams.get('state')!, torna.searchParams.get('code'), null, biglietto)
  assert.equal(nome, 'Granola')
  assert.equal(chi.dentro('anna', () => config.leggi().granola?.note), 1)
  // nel conto di chi ha avviato, e non in quello di chi c'era prima
  assert.equal(config.leggi().granola, undefined)
})

// — il giro di sfondo: rinnovi, sessioni, forme —

test('il refresh si rinnova e quello nuovo si tiene subito: WorkOS li usa una volta sola', async () => {
  f.riunioni = [riunione(1, 1)]
  giàCollegato('ref-a')
  const e = await g.sincronizza(new Map())
  assert.equal(e.docs.length, 1)
  const nuovo = config.leggi().granola!.refresh
  assert.notEqual(nuovo, 'ref-a')
  assert.ok(f.refreshValidi.has(nuovo!))
  assert.ok(!f.refreshValidi.has('ref-a'))
  // il token d'accesso non va su disco
  assert.ok(!JSON.stringify(config.leggi().granola).includes('acc-'))
})

test('un token rifiutato a metà si rinnova una volta e si riprova', async () => {
  f.riunioni = [riunione(1, 1)]
  giàCollegato()
  await g.sincronizza(new Map())
  // Granola lo butta prima della scadenza: il 401 dice di rinnovare
  f.accessiValidi.clear()
  const rinnoviPrima = f.token.filter(p => p.get('grant_type') === 'refresh_token').length
  const e = await g.sincronizza(new Map())
  assert.equal(e.docs.length, 1)
  assert.equal(f.token.filter(p => p.get('grant_type') === 'refresh_token').length, rinnoviPrima + 1)
})

test('due letture insieme chiedono un rinnovo solo', async () => {
  f.riunioni = [riunione(1, 1)]
  f.lentezzaRinnovo = 60
  giàCollegato()
  const [x, y] = await Promise.all([g.sincronizza(new Map()), g.sincronizza(new Map())])
  assert.equal(x.docs.length, 1)
  assert.equal(y.docs.length, 1)
  assert.equal(f.token.filter(p => p.get('grant_type') === 'refresh_token').length, 1)
})

test('un refresh che Granola non accetta più dice di ricollegare', async () => {
  giàCollegato('ref-morto')
  f.refreshValidi.clear()
  await assert.rejects(() => g.sincronizza(new Map()), { message: g.SCADUTO })
})

test('JSON o SSE, la sessione torna a ogni richiesta, e initialized arriva prima degli strumenti', async () => {
  for (const sse of [false, true]) {
    azzera()
    g.scorda()
    f.sse = sse
    f.riunioni = [riunione(1, 1), riunione(2, 2)]
    giàCollegato()
    const e = await g.sincronizza(new Map())
    assert.equal(e.docs.length, 2, sse ? 'SSE' : 'JSON')
    const [prima, seconda, ...resto] = f.chiamate
    assert.equal(prima!.metodo, 'initialize')
    assert.equal(prima!.sessione, null)
    assert.equal(seconda!.metodo, 'notifications/initialized')
    for (const c of [seconda!, ...resto]) {
      assert.match(c.sessione ?? '', /^ses-/)
      assert.equal(c.versione, '2025-06-18')
    }
  }
})

test('una sessione dimenticata dal server si riapre da capo, una volta', async () => {
  f.riunioni = [riunione(1, 1)]
  f.dimenticaUnaVolta = true
  giàCollegato()
  const e = await g.sincronizza(new Map())
  assert.equal(e.docs.length, 1)
  assert.equal(f.chiamate.filter(c => c.metodo === 'initialize').length, 2)
})

test('le riunioni diventano note con lo stesso id della cache, chi c’era nel corpo, e la data', async () => {
  const quando = Date.now() - 2 * GIORNO
  f.riunioni = [riunione(1, 2, { titolo: 'Team sync & "roadmap"', quando, appunti: 'da chiamare Marco' })]
  giàCollegato()
  const { docs } = await g.sincronizza(new Map())
  const d = docs[0]!
  assert.equal(d.id, `granola:${uuid(1)}`)
  assert.equal(d.fonte, 'granola')
  assert.equal(d.tipo, 'nota')
  assert.equal(d.gruppo, 'note')
  assert.equal(d.titolo, 'Team sync & "roadmap"')
  // «(note creator) from Acme» non è una persona
  assert.equal(d.corpo.split('\n')[0], 'With: John Doe <john@acme.com>, Jane Smith <jane@acme.com>')
  assert.match(d.corpo, /## Decisioni\n- Punto 1\n\nda chiamare Marco$/)
  assert.equal(d.autore, 'John Doe <john@acme.com>')
  // al minuto: la data di Granola non ha i secondi
  assert.equal(Math.floor(Date.parse(d.quando!) / 60_000), Math.floor(quando / 60_000))
})

test('JSON nel testo e structuredContent si leggono come l’XML', async () => {
  for (const forma of ['json', 'strutturato'] as const) {
    azzera()
    g.scorda()
    f.forma = forma
    f.riunioni = [riunione(1, 1)]
    giàCollegato()
    const { docs } = await g.sincronizza(new Map())
    assert.equal(docs.length, 1, forma)
    assert.match(docs[0]!.corpo, /^With: John Doe <john@acme.com>, Jane Smith <jane@acme.com>\n\n## Decisioni/, forma)
  }
})

test('una forma che non si riconosce non è «zero riunioni»', () => {
  assert.equal(g.riunioniDa({ content: [{ type: 'text', text: 'Here are your meetings: Team sync on Monday.' }] }).capito, false)
  assert.equal(g.riunioniDa({ content: [{ type: 'text', text: '' }] }).capito, true)
  assert.equal(g.riunioniDa({ content: [{ type: 'text', text: '<meetings_data count="0"></meetings_data>' }] }).riunioni.length, 0)
  assert.deepEqual(g.partecipanti('John Doe (note creator) from Acme <john@acme.com>\nbob@y.com\nJohn Doe <john@acme.com>'),
    ['John Doe <john@acme.com>', 'bob@y.com'])
})

test('le finestre vanno indietro fino a tre mesi vuoti, e le note si chiedono a dieci per volta', async () => {
  // 23 riunioni nelle ultime tre settimane, e una di otto mesi fa oltre un buco di sette mesi
  f.riunioni = [...Array.from({ length: 23 }, (_, i) => riunione(i + 1, 1 + i)), riunione(99, 240)]
  giàCollegato()
  const e = await g.sincronizza(new Map())
  const liste = f.chiamate.filter(c => c.nome === 'list_meetings')
  // la prima con le riunioni, poi tre vuote di fila, e basta
  assert.equal(liste.length, 4)
  assert.equal(liste[0]!.argomenti!.time_range, 'custom')
  assert.match(String(liste[0]!.argomenti!.custom_start), /^\d{4}-\d{2}-\d{2}$/)
  const lotti = f.chiamate.filter(c => c.nome === 'get_meetings').map(c => (c.argomenti!.meeting_ids as string[]).length)
  assert.deepEqual(lotti, [10, 10, 3])
  assert.equal(e.docs.length, 23)
  assert.equal(e.elencate, 23)
  assert.equal(e.completo, true)
})

test('una finestra tagliata si divide in due finché non torna tutto', async () => {
  f.riunioni = Array.from({ length: 12 }, (_, i) => riunione(i + 1, 1 + i * 2))
  f.tagliaA = 5
  giàCollegato()
  const e = await g.sincronizza(new Map())
  assert.equal(e.elencate, 12)
  assert.ok(f.chiamate.filter(c => c.nome === 'list_meetings').length > 4)
})

test('le note già nell’indice non si richiedono, tranne quelle di questa settimana', async () => {
  f.riunioni = [riunione(1, 2), riunione(2, 20)]
  giàCollegato()
  const gia = new Map<string, string | null>([
    [`granola:${uuid(1)}`, new Date(Date.now() - 2 * GIORNO).toISOString()],
    [`granola:${uuid(2)}`, new Date(Date.now() - 20 * GIORNO).toISOString()]
  ])
  const e = await g.sincronizza(gia)
  assert.deepEqual(e.docs.map(d => d.id), [`granola:${uuid(1)}`])
  // e si dice: «1 documento, 1 già letto», non un collegamento che perde roba
  assert.equal(e.giaLetti, 1)
  // quella di venti giorni fa c'è ancora: non si rilegge, e non si cancella
  assert.ok(e.visti.includes(`granola:${uuid(2)}`))
})

test('riconcilia: si cancella solo dentro il tratto elencato', async () => {
  f.riunioni = [riunione(1, 2)]
  giàCollegato()
  const gia = new Map<string, string | null>([
    // sparita da Granola, dentro il tratto letto: si può togliere
    [`granola:${uuid(50)}`, new Date(Date.now() - 5 * GIORNO).toISOString()],
    // tre anni fa: fuori da quello che si è guardato, resta
    [`granola:${uuid(51)}`, new Date(Date.now() - 1100 * GIORNO).toISOString()],
    // senza data: non si sa dov'è, resta
    [`granola:${uuid(52)}`, null]
  ])
  const e = await g.sincronizza(gia)
  assert.equal(e.completo, true)
  assert.ok(!e.visti.includes(`granola:${uuid(50)}`))
  assert.ok(e.visti.includes(`granola:${uuid(51)}`))
  assert.ok(e.visti.includes(`granola:${uuid(52)}`))
})

test('una finestra che resta tagliata non lascia cancellare niente', async () => {
  f.riunioni = [riunione(1, 1), riunione(2, 1), riunione(3, 1)]
  // tre nello stesso giorno, due per risposta: dividere non basta mai
  f.tagliaA = 2
  giàCollegato()
  const e = await g.sincronizza(new Map())
  assert.equal(e.completo, false)
})

test('il piano gratuito si dice solo se Granola lo dice, e allora si guarda un mese solo', async () => {
  f.piano = 'Basic'
  f.riunioni = [riunione(1, 3), riunione(2, 60)]
  giàCollegato()
  const e = await g.sincronizza(new Map([[`granola:${uuid(2)}`, new Date(Date.now() - 60 * GIORNO).toISOString()]]))
  assert.equal(e.trentaGiorni, true)
  assert.ok(f.chiamate.filter(c => c.nome === 'list_meetings').length <= 2)
  // la riunione di due mesi fa, letta quando il piano era un altro, resta
  assert.ok(e.visti.includes(`granola:${uuid(2)}`))

  azzera()
  g.scorda()
  f.riunioni = [riunione(1, 3)]
  giàCollegato()
  assert.equal((await g.sincronizza(new Map())).trentaGiorni, false)
  assert.equal(g.pianoGratuito({ content: [{ type: 'text', text: 'Email: a@b.c\nWorkspace: Acme' }] }), false)
  assert.equal(g.pianoGratuito({ content: [], structuredContent: { plan: 'free' } }), true)
})

test('un no di Granola sull’elenco non diventa «zero riunioni»', async () => {
  f.listaInErrore = 'Internal error'
  giàCollegato()
  await assert.rejects(() => g.sincronizza(new Map()), { message: g.NON_LEGGE })
})

test('la sessione si chiude alla fine, e un giro non lascia sessioni aperte', async () => {
  f.riunioni = [riunione(1, 1)]
  giàCollegato()
  await g.sincronizza(new Map())
  assert.equal(f.sessioni.size, 0)
})

test('un 429 fa aspettare quanto dice Retry-After, e poi si riprova', async () => {
  let volte = 0
  const s = createServer((req, res) => {
    if (volte++ === 0) { res.writeHead(429, { 'retry-after': '0' }); return res.end() }
    let b = ''
    req.on('data', d => { b += d })
    req.on('end', () => {
      const m = JSON.parse(b) as { id?: number; method: string }
      if (m.id === undefined) { res.writeHead(202); return res.end() }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: m.method === 'initialize' ? { protocolVersion: '2025-06-18' } : { tools: [] } }))
    })
  })
  const porta = await ascolta(s)
  try {
    const c = new mcp.ClienteMcp({ endpoint: `http://127.0.0.1:${porta}/mcp`, token: async () => 't' })
    assert.deepEqual(await c.strumenti(), [])
    assert.equal(c.richieste, 4)
  } finally { s.close() }
})
