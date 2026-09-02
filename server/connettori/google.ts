// Google: la posta e il calendario, dalla loro API.
//
// Perché esiste, visto che c'è già l'IMAP. Perché con Google l'IMAP è la porta
// di servizio: vuole una password per le app, non vede le etichette, non sa cosa
// sia un thread, e del calendario non sa niente. Chi lavora su Workspace ha
// quelle tre cose come impianto della giornata, e un assistente che non le vede
// sta guardando metà della scrivania.
//
// Nessuna libreria: OAuth e le due API sono chiamate HTTP, e `fetch` c'è. Il
// pacchetto `googleapis` pesa quindici megabyte e porta dentro tutte le API di
// Google per usarne due — su un'app da firmare e notarizzare è un prezzo che
// non ha senso pagare.
//
// Il ballo dell'autorizzazione è quello delle app installate: si apre il
// browser, la persona dice di sì a Google, Google rimanda il codice a un
// server che vive dodici secondi su 127.0.0.1. Con PKCE, perché su un'app che
// gira sul computer di qualcuno il «segreto» del client non è un segreto — chi
// ha il file lo legge — e PKCE è quello che rende inutile rubarlo.
//
// Quello che Myynd chiede di poter fare, e niente di più:
//   gmail.modify      leggere la posta e spostarla nel cestino quando lo dici tu
//   calendar.events   mettere in agenda quello che approvi
//   userinfo.email    sapere di chi è la casella che sta leggendo

import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { leggi, scrivi as scriviConfig } from '../config.ts'
import * as chi from '../chi.ts'
import type { Documento } from '../store.ts'
import { riflua } from '../testo.ts'

const esegui = promisify(execFile)

export const AMBITI = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email'
]

export type ConfigGoogle = {
  clientId: string
  clientSecret?: string
  /** L'unica cosa che si conserva: il token di aggiornamento. */
  refresh: string
  email?: string
  /** Quante giornate di posta leggere. */
  giorni?: number
}

export function collegato(): boolean {
  return !!leggi().google?.refresh
}

// — il ballo dell'autorizzazione —

/** Il verificatore di PKCE: si tiene in memoria fra l'andata e il ritorno. */
function pkce() {
  const verifica = randomBytes(48).toString('base64url')
  const sfida = createHash('sha256').update(verifica).digest('base64url')
  return { verifica, sfida }
}

async function apriIlBrowser(url: string) {
  if (process.platform === 'darwin') await esegui('/usr/bin/open', [url])
  else if (process.platform === 'win32') await esegui('cmd', ['/c', 'start', '', url])
  else await esegui('xdg-open', [url])
}

/**
 * Si mette in ascolto e dice su che porta.
 *
 * L'ordine conta: la porta serve *prima* di aprire il browser, perché entra
 * nell'indirizzo di ritorno. Quindi questa funzione ritorna appena è in
 * ascolto, con dentro la promessa del codice che arriverà dopo — invece di una
 * promessa sola che si risolve alla fine, quando ormai è tardi per sapere dove
 * mandare la gente.
 *
 * Il server vive il tempo di una risposta, con due minuti di tetto: se qualcuno
 * chiude la finestra del browser a metà, questo processo non deve restare in
 * ascolto per sempre.
 */
function ascolta(): Promise<{ porta: number; codice: Promise<string>; chiudi: () => void }> {
  return new Promise((pronto, male) => {
    let dai: (c: string) => void
    let no: (e: Error) => void
    const codice = new Promise<string>((a, b) => { dai = a; no = b })

    const s = createServer((req, res) => {
      const u = new URL(req.url ?? '/', 'http://127.0.0.1')
      const c = u.searchParams.get('code')
      const errore = u.searchParams.get('error')
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(
        '<meta charset="utf-8"><body style="font:16px -apple-system,Helvetica,sans-serif;' +
        'background:#191715;color:#F4EFE8;display:grid;place-items:center;height:100vh;margin:0">' +
        `<div>${c ? 'Fatto. Puoi chiudere questa pagina e tornare su Myynd.' : 'Non è andata. Torna su Myynd e riprova.'}</div>`
      )
      if (c) dai(c)
      else no(new Error(errore === 'access_denied' ? 'Hai detto di no a Google.' : 'Google non ha mandato il codice.'))
    })

    s.on('error', male)
    // porta 0: la sceglie il sistema fra quelle libere. Fra gli URI di
    // reindirizzamento va registrato `http://127.0.0.1` — per le app installate
    // Google accetta qualunque porta su quell'indirizzo.
    s.listen(0, '127.0.0.1', () => {
      const porta = (s.address() as { port: number }).port
      const chiudi = () => { try { s.close() } catch { /* già chiusa */ } }
      setTimeout(() => { chiudi(); no(new Error('Nessuna risposta da Google: riprova.')) }, 120_000).unref()
      pronto({ porta, codice, chiudi })
    })
  })
}

async function chiediToken(corpo: Record<string, string>): Promise<Record<string, string>> {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(corpo).toString(),
    signal: AbortSignal.timeout(20_000)
  })
  const j = await r.json().catch(() => ({})) as Record<string, string>
  if (!r.ok) {
    // il messaggio di Google è per chi sviluppa: qui serve quello per chi guarda
    if (j.error === 'invalid_grant') throw new Error('Il collegamento con Google è scaduto: rifallo.')
    throw new Error('Google ha rifiutato il collegamento.')
  }
  return j
}

/**
 * Collega l'account: apre il browser, aspetta il sì, si tiene il refresh.
 *
 * `access_type=offline` e `prompt=consent` insieme sono l'unico modo di avere
 * un token di aggiornamento *sicuro*: senza il secondo, Google lo manda solo la
 * primissima volta, e chi ricollega l'account resta senza — con un errore che
 * arriva un'ora dopo e non dice perché.
 */
export async function collega(clientId: string, clientSecret?: string): Promise<{ email: string }> {
  if (!clientId.trim()) throw new Error('Serve il client ID di Google.')
  const { verifica, sfida } = pkce()
  const { porta, codice, chiudi } = await ascolta()
  const redirect = `http://127.0.0.1:${porta}`

  try {
    const u = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    u.searchParams.set('client_id', clientId)
    u.searchParams.set('redirect_uri', redirect)
    u.searchParams.set('response_type', 'code')
    u.searchParams.set('scope', AMBITI.join(' '))
    u.searchParams.set('access_type', 'offline')
    u.searchParams.set('prompt', 'consent')
    u.searchParams.set('code_challenge', sfida)
    u.searchParams.set('code_challenge_method', 'S256')
    await apriIlBrowser(u.toString())

    const t = await chiediToken({
      code: await codice,
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      redirect_uri: redirect,
      grant_type: 'authorization_code',
      code_verifier: verifica
    })
    if (!t.refresh_token) throw new Error('Google non ha dato il permesso duraturo: riprova.')

    const email = await chiEra(t.access_token).catch(() => '')
    const c = leggi()
    scriviConfig({ ...c, google: { clientId, clientSecret, refresh: t.refresh_token, email, giorni: 30 } })
    return { email }
  } finally {
    chiudi()
  }
}

async function chiEra(token: string): Promise<string> {
  const r = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000)
  })
  const j = await r.json().catch(() => ({})) as { email?: string }
  return j.email ?? ''
}

export function scollega() {
  const c = leggi()
  const { google: _via, ...resto } = c
  scriviConfig(resto)
}

// — parlare con le API —

/**
 * Un token d'accesso vivo, per persona. Dura un'ora: si tiene in memoria, non
 * su disco. La chiave è chi chiede: con una variabile sola, il giro di sfondo
 * che passa da un conto all'altro usava il token di A per leggere la casella
 * «di B» — cioè leggeva quella di A, e la metteva nell'indice di B.
 */
const inCorso = new Map<string, { token: string; scade: number }>()

async function token(): Promise<string> {
  const g = leggi().google
  if (!g?.refresh) throw new Error('Collega Google e potrò farlo.')
  const di = chi.adesso() ?? ''
  const vivo = inCorso.get(di)
  if (vivo && vivo.scade > Date.now() + 60_000) return vivo.token
  const t = await chiediToken({
    client_id: g.clientId,
    ...(g.clientSecret ? { client_secret: g.clientSecret } : {}),
    refresh_token: g.refresh,
    grant_type: 'refresh_token'
  })
  const nuovo = { token: t.access_token, scade: Date.now() + Number(t.expires_in ?? 3600) * 1000 }
  inCorso.set(di, nuovo)
  return nuovo.token
}

/** Quando si scollega, e nei test: dimentica il token di chi sta chiedendo. */
export function scordaIlToken() { inCorso.delete(chi.adesso() ?? '') }

async function api<T>(url: string, opz: RequestInit = {}): Promise<T> {
  const r = await fetch(url, {
    ...opz,
    headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json', ...(opz.headers ?? {}) },
    signal: AbortSignal.timeout(30_000)
  })
  if (!r.ok) {
    const j = await r.json().catch(() => ({})) as { error?: { message?: string; status?: string } }
    if (r.status === 401 || r.status === 403) {
      throw new Error('Google non mi lascia fare questa cosa: ricollega l’account.')
    }
    if (r.status === 429) throw new Error('Google ha detto di rallentare. Riprovo più tardi.')
    throw new Error(j.error?.message ?? 'Google non ha risposto.')
  }
  return await r.json() as T
}

// — la posta —

type Parte = { mimeType?: string; body?: { data?: string; size?: number }; parts?: Parte[] }
type Messaggio = {
  id: string
  threadId: string
  internalDate?: string
  labelIds?: string[]
  payload?: { headers?: { name: string; value: string }[] } & Parte
}

function intestazione(m: Messaggio, nome: string): string {
  const h = m.payload?.headers?.find(x => x.name.toLowerCase() === nome.toLowerCase())
  return h?.value ?? ''
}

/**
 * Il testo di un messaggio, scavando fra le parti.
 *
 * Un'email è un albero: `text/plain` e `text/html` fratelli, allegati accanto,
 * e dentro un inoltro tutto un altro albero. Si prende il primo testo semplice
 * che si trova scendendo; se non c'è, si spoglia l'HTML — meglio un testo un po'
 * sporco che una riga vuota nell'indice.
 */
function corpoDi(p: Parte | undefined): string {
  if (!p) return ''
  const dati = (x: Parte) => x.body?.data ? Buffer.from(x.body.data, 'base64url').toString('utf8') : ''
  if (p.mimeType === 'text/plain') return dati(p)
  for (const f of p.parts ?? []) {
    const t = corpoDi(f)
    if (t.trim()) return t
  }
  if (p.mimeType === 'text/html') {
    return dati(p)
      .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
  }
  return ''
}

export type EsitoGoogle = { docs: Documento[]; troncato: boolean }

/**
 * Legge la posta recente. Solo la casella, non il cestino né lo spam.
 *
 * `-in:chats` toglie le conversazioni di Chat, che Gmail tiene nella stessa
 * lista e che non sono documenti: sono messaggini, e riempirebbero l'indice di
 * «ok», «grazie», «arrivo».
 */
export async function sincronizza(
  g: ConfigGoogle,
  avanzamento?: (fatti: number, totale: number) => void
): Promise<EsitoGoogle> {
  const giorni = g.giorni ?? 30
  const q = `newer_than:${giorni}d -in:chats -in:spam -in:trash`
  const docs: Documento[] = []
  let pagina: string | undefined
  let troncato = false

  const ids: { id: string }[] = []
  do {
    const u = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
    u.searchParams.set('q', q)
    u.searchParams.set('maxResults', '100')
    if (pagina) u.searchParams.set('pageToken', pagina)
    const r = await api<{ messages?: { id: string }[]; nextPageToken?: string }>(u.toString())
    ids.push(...(r.messages ?? []))
    pagina = r.nextPageToken
    if (ids.length >= 400) { troncato = true; break }
  } while (pagina)

  let fatti = 0
  for (const { id } of ids) {
    try {
      const m = await api<Messaggio>(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`
      )
      const testo = riflua(corpoDi(m.payload).trim())
      if (!testo) continue
      docs.push({
        id: `google:${m.id}`,
        fonte: 'google',
        tipo: 'email',
        titolo: intestazione(m, 'Subject') || '(senza oggetto)',
        corpo: testo.slice(0, 20_000),
        autore: intestazione(m, 'From') || null,
        percorso: (m.labelIds ?? []).includes('SENT') ? 'Inviata' : 'Posta in arrivo',
        quando: new Date(Number(m.internalDate ?? Date.now())).toISOString(),
        gruppo: 'posta'
      })
    } catch { /* un messaggio illeggibile non ferma la lettura degli altri */ }
    avanzamento?.(++fatti, ids.length)
  }
  return { docs, troncato }
}

/** Nel cestino di Gmail. Che è un'etichetta, quindi si torna indietro. */
export async function cestina(ids: string[]): Promise<number> {
  const soli = ids.filter(i => i.startsWith('google:')).map(i => i.slice('google:'.length))
  if (!soli.length) return 0
  await api('https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify', {
    method: 'POST',
    body: JSON.stringify({ ids: soli, addLabelIds: ['TRASH'], removeLabelIds: ['INBOX'] })
  })
  return soli.length
}

/** Fuori dalla casella, ma non nel cestino: è quello che Gmail chiama archiviare. */
export async function archivia(ids: string[]): Promise<number> {
  const soli = ids.filter(i => i.startsWith('google:')).map(i => i.slice('google:'.length))
  if (!soli.length) return 0
  await api('https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify', {
    method: 'POST',
    body: JSON.stringify({ ids: soli, removeLabelIds: ['INBOX'] })
  })
  return soli.length
}

// — l'agenda —

export type Evento = { titolo: string; inizio: string; minuti?: number; dove?: string; note?: string }

/**
 * Mette gli eventi nel calendario principale.
 *
 * `timeZone` esplicito e non implicito: senza, Google interpreta un'ora senza
 * fuso con quella del calendario, che può non essere quella del computer di chi
 * ha appena detto «sì, alle tre». L'evento comparirebbe, e sarebbe sbagliato.
 */
export async function mettiInAgenda(eventi: Evento[]): Promise<number> {
  const fuso = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome'
  let fatti = 0
  for (const e of eventi) {
    const inizio = quando(e.inizio)
    const fine = new Date(inizio.getTime() + Math.max(5, e.minuti ?? 60) * 60_000)
    await api('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      body: JSON.stringify({
        summary: e.titolo,
        location: e.dove || undefined,
        description: e.note || undefined,
        start: { dateTime: locale(inizio), timeZone: fuso },
        end: { dateTime: locale(fine), timeZone: fuso }
      })
    })
    fatti++
  }
  return fatti
}

/** «2026-09-03T15:00» è le tre del pomeriggio *qui*, non a Greenwich. */
export function quando(iso: string): Date {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/)
  if (!m) throw new Error('Non ho capito la data.')
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 9), Number(m[5] ?? 0), 0, 0)
}

/** L'ora locale come la vuole Google: senza fuso, che viaggia nel campo accanto. */
function locale(d: Date): string {
  const due = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}T${due(d.getHours())}:${due(d.getMinutes())}:00`
}
