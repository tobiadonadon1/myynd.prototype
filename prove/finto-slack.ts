// Uno Slack finto, per le prove e per le misure: uno spazio di lavoro intero,
// con canali, gruppi, messaggi diretti, fili con risposte, file e un 429 a
// comando. Parla HTTP come quello vero (`/api/<metodo>`), così il connettore
// non sa di essere in prova: cambia solo l'indirizzo (`MYYND_SLACK_URL`).
//
//   FINTO_PORTA=18920 node prove/finto-slack.ts
//
// Le persone e le aziende sono inventate. Niente qui parla con Slack vero.

import { createServer, type Server } from 'node:http'

export const ME = 'U0ME'
export const NORA = 'U0NORA'
export const TOM = 'U0TOM'
export const LISA = 'U0LISA'
export const TOKEN = 'xoxp-finto-1'

export type FileFinto = { id: string; name: string; filetype: string; mimetype: string; size: number; contenuto?: string; mode?: string }
export type MsgFinto = {
  ts: string; user?: string; bot_id?: string; text: string; subtype?: string; thread_ts?: string
  edited?: { user: string; ts: string }; reactions?: { name: string; users: string[]; count: number }[]
  files?: FileFinto[]
}
export type ConvFinta = {
  id: string; name?: string; is_channel?: boolean; is_group?: boolean; is_im?: boolean; is_mpim?: boolean
  is_private?: boolean; is_archived?: boolean; user?: string; membro: boolean; updated: number; messaggi: MsgFinto[]
}

const UTENTI = [
  { id: ME, name: 'alex', real_name: 'Alex Rivera' },
  { id: NORA, name: 'nora', real_name: 'Nora Vance' },
  { id: TOM, name: 'tom', real_name: 'Tom Brill' },
  { id: LISA, name: 'lisa', real_name: 'Lisa Park' },
  { id: 'U0EXT', name: 'sam', real_name: 'Sam Ortega' }
]

/** Un `ts` di Slack per un istante in secondi, con un numero per non ripetersi. */
export function tsDi(secondi: number, n = 0): string {
  return `${Math.floor(secondi)}.${String(100000 + n).slice(1).padStart(6, '0')}`
}

/**
 * Lo spazio di lavoro, intorno a `ora` (secondi).
 *
 * Settantuno posti: due canali veri, sessanta canali di riempimento (oltre il
 * tetto dei sessanta del connettore di prima), un privato, un archiviato,
 * uno di cui non fa parte, un gruppo e tre messaggi diretti. Quattro fili con
 * risposte, di cui uno vecchio di cinque giorni.
 */
export function spazio(ora = Date.now() / 1000): ConvFinta[] {
  const h = 3600, g = 86_400
  let n = 0
  const m = (sec: number, user: string | undefined, text: string, extra: Partial<MsgFinto> = {}): MsgFinto =>
    ({ ts: tsDi(ora - sec, ++n), ...(user ? { user } : {}), text, ...extra })

  const generale: MsgFinto[] = []
  for (let i = 0; i < 250; i++) {
    const chi = i % 2 ? TOM : LISA
    generale.push(m(20 * g - i * 6600, chi, i === 3
      ? 'Il brief sta in <#C0ACME|proj-acme>, vedi <https://example.com/brief|il brief> :tada:'
      : `Aggiornamento ${i}: tutto procede sul calendario della settimana`))
  }
  generale.push(m(2 * h, undefined, 'Deploy finished', { bot_id: 'B0BOT', subtype: 'bot_message' }))
  generale.push(m(2 * h - 10, LISA, 'Lisa has joined the channel', { subtype: 'channel_join' }))

  // i fili di #proj-acme
  const t1 = m(30 * h, NORA, `<@${ME}> can you send the revised deck by Friday?`)
  const t2 = m(6 * h, ME, 'Draft budget is in the doc')
  const t3 = m(3 * g, LISA, 'Options for the logo: A or B')
  const t4 = m(5 * g, NORA, 'Kickoff notes: scope, timeline, owners')
  const acme: MsgFinto[] = [
    t1,
    m(29 * h, TOM, 'I can help with slides', { thread_ts: t1.ts }),
    m(28 * h, ME, 'Sure, I\'ll send it by Friday :+1:', { thread_ts: t1.ts }),
    t2,
    m(5 * h, NORA, 'What about the travel costs? Can you add them?', { thread_ts: t2.ts }),
    t3,
    m(3 * g - h, ME, 'B looks stronger', { thread_ts: t3.ts }),
    m(3 * g - 2 * h, NORA, 'Agreed, we decided to go with option B.', { thread_ts: t3.ts }),
    t4,
    m(5 * g - h, TOM, 'Timeline looks right to me', { thread_ts: t4.ts }),
    m(2 * h, LISA, 'Lunch anyone?'),
    m(90 * 60, ME, 'Notes from the call', { files: [{ id: 'F0NOTE', name: 'notes.txt', filetype: 'text', mimetype: 'text/plain', size: 40, contenuto: 'Scope: three screens and a login.' }] }),
    m(80 * 60, NORA, 'Signed copy attached', { files: [{ id: 'F0PDF', name: 'contract.pdf', filetype: 'pdf', mimetype: 'application/pdf', size: 300_000 }] })
  ]

  const conv: ConvFinta[] = [
    { id: 'C0GEN', name: 'general', is_channel: true, membro: true, updated: ora * 1000, messaggi: generale },
    { id: 'C0ACME', name: 'proj-acme', is_channel: true, membro: true, updated: ora * 1000, messaggi: acme }
  ]
  for (let i = 1; i <= 60; i++) {
    const nome = `team-${String(i).padStart(2, '0')}`
    conv.push({
      id: `C0T${String(i).padStart(3, '0')}`, name: nome, is_channel: true, membro: true, updated: (ora - 10 * g) * 1000,
      messaggi: [m(7 * g + i * 60, TOM, `Settimana ${nome}: niente di nuovo`), m(7 * g + i * 60 - 30, LISA, 'Ok, grazie')]
    })
  }
  conv.push(
    { id: 'G0LEAD', name: 'leadership', is_group: true, is_private: true, membro: true, updated: ora * 1000,
      messaggi: [m(4 * h, LISA, 'Margins for Q4 are on the sheet'), m(4 * h - 60, ME, 'Thanks, reviewing now')] },
    { id: 'C0OLD', name: 'old-project', is_channel: true, is_archived: true, membro: true, updated: 0,
      messaggi: [m(2 * g, TOM, 'archived stuff'), m(2 * g - 1, TOM, 'more archived stuff')] },
    { id: 'C0NOTME', name: 'random-other', is_channel: true, membro: false, updated: ora * 1000,
      messaggi: [m(h, TOM, 'not for Alex'), m(h - 1, LISA, 'still not')] },
    { id: 'G0MP', name: 'mpdm-alex--nora--tom-1', is_mpim: true, is_group: true, is_private: true, membro: true, updated: ora * 1000,
      messaggi: [m(50 * h, TOM, 'Ci sentiamo lunedì?'), m(49 * h, ME, 'Sì, va bene'), m(48 * h, NORA, 'Decidiamo: si parte il 3 novembre.')] },
    { id: 'D0NORA', is_im: true, user: NORA, membro: true, updated: ora * 1000,
      messaggi: [
        m(26 * h, NORA, 'Ciao Alex, riesci a mandarmi il preventivo aggiornato?'),
        m(25 * h, ME, 'Certo, ti mando il preventivo entro venerdì'),
        m(40 * 60, NORA, 'Hai visto la mia mail sul contratto?')
      ] },
    { id: 'D0TOM', is_im: true, user: TOM, membro: true, updated: ora * 1000,
      messaggi: [m(3 * h, TOM, 'Are you free tomorrow for a quick call?')] },
    { id: 'D0LISA', is_im: true, user: LISA, membro: true, updated: (ora - 4 * g) * 1000,
      messaggi: [m(4 * g, LISA, 'thanks!'), m(4 * g - 60, ME, 'np')] }
  )
  return conv
}

export type Finto = {
  url: string
  conv: ConvFinta[]
  /** Quante chiamate per metodo. */
  conteggi: Map<string, number>
  /** Ogni chiamata, col metodo e i parametri (mai il token). */
  richieste: { metodo: string; q: Record<string, string>; http: string }[]
  /** I file scaricati, e con quale autorizzazione si è bussato. */
  scaricati: string[]
  /** Le prossime `n` chiamate a `metodo` rispondono 429 con questo Retry-After. */
  limita: (metodo: string, n: number, dopo?: number) => void
  /** Un messaggio nuovo, adesso o a `sec` secondi fa. */
  aggiungi: (canale: string, user: string, text: string, o?: Partial<MsgFinto> & { fa?: number }) => MsgFinto
  trova: (canale: string, ts: string) => MsgFinto | undefined
  togli: (canale: string, ts: string) => void
  chiudi: () => Promise<void>
}

export async function avvia(o: { ora?: number; porta?: number; ambiti?: string } = {}): Promise<Finto> {
  const ora = o.ora ?? Date.now() / 1000
  const conv = spazio(ora)
  const conteggi = new Map<string, number>()
  const richieste: Finto['richieste'] = []
  const scaricati: string[] = []
  const limiti = new Map<string, { n: number; dopo: number }>()
  let contatore = 900
  const ambiti = o.ambiti ?? 'channels:history,groups:history,im:history,mpim:history,channels:read,groups:read,im:read,mpim:read,users:read,team:read,search:read,files:read,reactions:read,chat:write'

  const daId = (id: string) => conv.find(c => c.id === id)
  const nomeConv = (c: ConvFinta) => c.name ?? c.id
  const radice = (x: MsgFinto) => !x.thread_ts || x.thread_ts === x.ts || x.subtype === 'thread_broadcast'
  const conRisposte = (c: ConvFinta, x: MsgFinto) => {
    const risposte = c.messaggi.filter(r => r.thread_ts === x.ts && r.ts !== x.ts)
    if (!risposte.length) return { ...x, files: x.files?.map(fileOut) }
    return {
      ...x, files: x.files?.map(fileOut), thread_ts: x.ts, reply_count: risposte.length,
      latest_reply: risposte.map(r => r.ts).sort().at(-1), reply_users: [...new Set(risposte.map(r => r.user))]
    }
  }
  const fileOut = (f: FileFinto) => ({
    id: f.id, name: f.name, title: f.name, filetype: f.filetype, mimetype: f.mimetype, size: f.size, mode: f.mode ?? 'hosted',
    url_private: `${base}/files/${f.id}`, permalink: `https://northwind-studio.slack.com/files/${ME}/${f.id}/${f.name}`
  })
  const pagina = <T>(tutti: T[], q: URLSearchParams, def = 100) => {
    const limit = Math.min(1000, Number(q.get('limit') || def))
    const da = Number(q.get('cursor') || 0)
    const fetta = tutti.slice(da, da + limit)
    const prossimo = da + limit < tutti.length ? String(da + limit) : ''
    return { fetta, prossimo }
  }

  let base = ''
  const server: Server = createServer(async (req, res) => {
    const u = new URL(req.url ?? '/', 'http://x')
    const fuori = (stato: number, corpo: unknown, h: Record<string, string> = {}) => {
      res.writeHead(stato, { 'content-type': 'application/json', ...h }); res.end(JSON.stringify(corpo))
    }
    const auth = req.headers.authorization ?? ''
    if (u.pathname.startsWith('/files/')) {
      if (auth !== `Bearer ${TOKEN}`) { res.writeHead(403); return res.end('no') }
      const id = u.pathname.split('/')[2]!
      scaricati.push(id)
      const f = conv.flatMap(c => c.messaggi.flatMap(x => x.files ?? [])).find(x => x.id === id)
      res.writeHead(f ? 200 : 404, { 'content-type': f?.mimetype ?? 'text/plain' })
      return res.end(f?.contenuto ?? '')
    }
    const metodo = u.pathname.replace(/^\/api\//, '')
    conteggi.set(metodo, (conteggi.get(metodo) ?? 0) + 1)
    let corpo = ''
    for await (const pezzo of req) corpo += pezzo
    const q = new URLSearchParams(u.search)
    if (corpo) {
      if (String(req.headers['content-type']).includes('json')) {
        for (const [k, v] of Object.entries(JSON.parse(corpo) as Record<string, unknown>)) q.set(k, String(v))
      } else for (const [k, v] of new URLSearchParams(corpo)) q.set(k, v)
    }
    richieste.push({ metodo, q: Object.fromEntries(q), http: req.method ?? 'GET' })
    const lim = limiti.get(metodo)
    if (lim && lim.n > 0) {
      lim.n--
      return fuori(429, { ok: false, error: 'ratelimited' }, { 'retry-after': String(lim.dopo) })
    }
    if (auth !== `Bearer ${TOKEN}`) return fuori(200, { ok: false, error: 'invalid_auth' })

    switch (metodo) {
      case 'auth.test':
        return fuori(200, { ok: true, url: 'https://northwind-studio.slack.com/', team: 'Northwind Studio', user: 'alex', team_id: 'T0NW', user_id: ME }, { 'x-oauth-scopes': ambiti })
      case 'team.info':
        return fuori(200, { ok: true, team: { id: 'T0NW', name: 'Northwind Studio', domain: 'northwind-studio' } })
      case 'users.list': {
        const { fetta, prossimo } = pagina(UTENTI, q, 2)
        return fuori(200, { ok: true, members: fetta, response_metadata: { next_cursor: prossimo } })
      }
      case 'users.info': {
        const x = UTENTI.find(x => x.id === q.get('user'))
        return x ? fuori(200, { ok: true, user: x }) : fuori(200, { ok: false, error: 'user_not_found' })
      }
      case 'users.conversations': {
        const tipi = (q.get('types') ?? 'public_channel').split(',')
        const tipo = (c: ConvFinta) => c.is_im ? 'im' : c.is_mpim ? 'mpim' : c.is_private ? 'private_channel' : 'public_channel'
        const tutti = conv.filter(c => c.membro && tipi.includes(tipo(c)) && !(q.get('exclude_archived') === 'true' && c.is_archived))
          .map(({ messaggi: _m, membro: _b, ...c }) => c)
        const { fetta, prossimo } = pagina(tutti, q, 100)
        return fuori(200, { ok: true, channels: fetta, response_metadata: { next_cursor: prossimo } })
      }
      case 'conversations.info': {
        const c = daId(q.get('channel') ?? '')
        if (!c) return fuori(200, { ok: false, error: 'channel_not_found' })
        const { messaggi: _m, membro: _b, ...resto } = c
        return fuori(200, { ok: true, channel: resto })
      }
      case 'conversations.history': {
        const c = daId(q.get('channel') ?? '')
        if (!c || !c.membro) return fuori(200, { ok: false, error: c ? 'not_in_channel' : 'channel_not_found' })
        const oldest = Number(q.get('oldest') || 0), latest = Number(q.get('latest') || Infinity)
        const tutti = c.messaggi.filter(radice).filter(x => Number(x.ts) > oldest && Number(x.ts) < latest)
          .sort((a, b) => Number(b.ts) - Number(a.ts)).map(x => conRisposte(c, x))
        const { fetta, prossimo } = pagina(tutti, q, 100)
        return fuori(200, { ok: true, messages: fetta, has_more: !!prossimo, response_metadata: { next_cursor: prossimo } })
      }
      case 'conversations.replies': {
        const c = daId(q.get('channel') ?? '')
        if (!c) return fuori(200, { ok: false, error: 'channel_not_found' })
        const ts = q.get('ts') ?? ''
        const r = c.messaggi.find(x => x.ts === ts)
        if (!r) return fuori(200, { ok: false, error: 'thread_not_found' })
        const oldest = Number(q.get('oldest') || 0)
        const risposte = c.messaggi.filter(x => x.thread_ts === ts && x.ts !== ts && Number(x.ts) > oldest).sort((a, b) => Number(a.ts) - Number(b.ts))
        const tutti = [conRisposte(c, r), ...risposte.map(x => ({ ...x, files: x.files?.map(fileOut) }))]
        const { fetta, prossimo } = pagina(tutti, q, 100)
        return fuori(200, { ok: true, messages: fetta, has_more: !!prossimo, response_metadata: { next_cursor: prossimo } })
      }
      case 'search.messages': {
        const query = q.get('query') ?? ''
        const menz = /<@([A-Z0-9]+)>/.exec(query)?.[1]
        const dopo = /after:(\d{4}-\d{2}-\d{2})/.exec(query)?.[1]
        const da = dopo ? Date.parse(`${dopo}T00:00:00`) / 1000 + 86_400 : 0
        const tutti = conv.filter(c => c.membro).flatMap(c => c.messaggi
          .filter(x => (!menz || x.text.includes(`<@${menz}>`)) && Number(x.ts) >= da)
          .map(x => ({
            ts: x.ts, text: x.text, user: x.user, type: 'message',
            channel: { id: c.id, name: nomeConv(c), is_im: !!c.is_im, is_mpim: !!c.is_mpim },
            permalink: `https://northwind-studio.slack.com/archives/${c.id}/p${x.ts.replace('.', '')}${x.thread_ts && x.thread_ts !== x.ts ? `?thread_ts=${x.thread_ts}&cid=${c.id}` : ''}`
          })))
          .sort((a, b) => Number(b.ts) - Number(a.ts))
        const count = Math.min(100, Number(q.get('count') || 20))
        const page = Number(q.get('page') || 1)
        return fuori(200, { ok: true, messages: { total: tutti.length, matches: tutti.slice((page - 1) * count, page * count), paging: { count, total: tutti.length, page, pages: Math.max(1, Math.ceil(tutti.length / count)) } } })
      }
      case 'chat.postMessage': {
        if (req.method !== 'POST') return fuori(200, { ok: false, error: 'invalid_method' })
        const c = daId(q.get('channel') ?? '')
        if (!c) return fuori(200, { ok: false, error: 'channel_not_found' })
        const x: MsgFinto = { ts: tsDi(Date.now() / 1000, ++contatore), user: ME, text: q.get('text') ?? '', ...(q.get('thread_ts') ? { thread_ts: q.get('thread_ts')! } : {}) }
        c.messaggi.push(x)
        return fuori(200, { ok: true, channel: c.id, ts: x.ts, message: x })
      }
      default:
        return fuori(200, { ok: false, error: 'unknown_method' })
    }
  })
  await new Promise<void>(r => server.listen(o.porta ?? 0, '127.0.0.1', () => r()))
  const indirizzo = server.address()
  base = `http://127.0.0.1:${typeof indirizzo === 'object' && indirizzo ? indirizzo.port : 0}`
  return {
    url: `${base}/api/`,
    conv,
    conteggi,
    richieste,
    scaricati,
    limita: (metodo, n, dopo = 1) => { limiti.set(metodo, { n, dopo }) },
    aggiungi: (canale, user, text, extra = {}) => {
      const { fa = 0, ...resto } = extra
      const x: MsgFinto = { ts: tsDi(Date.now() / 1000 - fa, ++contatore), user, text, ...resto }
      daId(canale)!.messaggi.push(x)
      return x
    },
    trova: (canale, ts) => daId(canale)?.messaggi.find(x => x.ts === ts),
    togli: (canale, ts) => { const c = daId(canale)!; c.messaggi = c.messaggi.filter(x => x.ts !== ts) },
    chiudi: () => new Promise<void>(r => { server.closeAllConnections(); server.close(() => r()) })
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const f = await avvia({ porta: Number(process.env.FINTO_PORTA || 18920) })
  console.log(`Slack finto su ${f.url} (token ${TOKEN})`)
}
