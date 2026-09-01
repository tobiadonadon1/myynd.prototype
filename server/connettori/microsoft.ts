// Microsoft: Outlook, SharePoint e OneDrive, da un'app registrata sola.
//
// Un file e due connettori, e la ragione non è pigrizia. Su Microsoft
// l'attrito non è il consenso — quello è un clic — è la **registrazione
// dell'app** su Entra ID: si crea, si sceglie la piattaforma, si copia un id.
// Chiedere di farlo due volte, una per la posta e una per i file, sarebbe
// dieci minuti di lavoro noioso per una distinzione che esiste solo dentro
// questo codice. L'app è una; quello che cambia è **cosa le si concede**.
//
// E quello sì che resta diviso, perché è la cosa che conta:
//
//   · collegare Outlook chiede `Mail.Read` e `Calendars.Read` — e nient'altro.
//   · collegare SharePoint chiede `Files.Read.All` e `Sites.Read.All`.
//
// Chi collega solo la posta non concede i file, e la schermata del consenso di
// Microsoft glielo scrive in faccia riga per riga. Chi poi collega anche i
// file rifà il consenso con l'unione delle due — Microsoft lo chiama consenso
// incrementale ed è fatto apposta — e da lì in avanti il token duraturo copre
// tutte e due. Staccarne una toglie la sua parte e lascia in piedi l'altra.
//
// **Tutto in sola lettura.** Non c'è un ambito di scrittura in questo file, e
// non c'è perché non deve esserci: da qui non parte una mail, non si sposta un
// file, non si cancella niente.

import { leggi, scrivi as scriviConfig } from '../config.ts'
import type { Documento } from '../store.ts'
import { consenso, chiediGettoni, Vivo, type Sportello } from './oauth.ts'
import { daBuffer, leggibile, tipoDi } from './estrai.ts'
import { riflua } from '../testo.ts'

/** Le due metà, e cosa chiede ciascuna. */
export const PARTI = {
  posta: ['Mail.Read', 'Calendars.Read'],
  file: ['Files.Read.All', 'Sites.Read.All']
} as const

export type Parte = keyof typeof PARTI

/** Quello che serve sempre: chi sei, e il permesso di durare. */
const SEMPRE = ['offline_access', 'User.Read']

export type ConfigMicrosoft = {
  clientId: string
  /** `common`, `organizations`, o l'id del tenant. Vuoto = common. */
  tenant?: string
  refresh: string
  email?: string
  nome?: string
  /** Quali metà sono collegate. Una sola è normale. */
  parti: Parte[]
  /** Quante giornate di posta leggere. */
  giorni?: number
}

const GRAFO = 'https://graph.microsoft.com/v1.0'
const MAX_FILE = 12_000_000
const MAX_MESSAGGI = 400
const MAX_FILE_TOTALI = 900

function ambiti(parti: Parte[]): string[] {
  const fuori = new Set(SEMPRE)
  for (const p of parti) for (const a of PARTI[p] ?? []) fuori.add(a)
  return [...fuori]
}

function traduci(j: Record<string, unknown>, _stato: number): string | null {
  const e = String(j.error ?? '')
  const detto = String(j.error_description ?? '')
  if (e === 'invalid_grant') return 'Il collegamento con Microsoft è scaduto: rifallo.'
  if (e === 'unauthorized_client' || /AADSTS7000218/.test(detto)) {
    return 'L’app su Entra ID non è registrata come applicazione desktop.'
  }
  if (/AADSTS65001/.test(detto)) return 'Manca il consenso dell’amministratore per questi permessi.'
  return null
}

function sportello(clientId: string, tenant: string, parti: Parte[]): Sportello {
  const base = `https://login.microsoftonline.com/${encodeURIComponent(tenant || 'common')}/oauth2/v2.0`
  return {
    nome: 'Microsoft',
    gettoni: `${base}/token`,
    campi: { client_id: clientId },
    traduci,
    autorizza: ({ redirect, sfida, stato }) => {
      const u = new URL(`${base}/authorize`)
      u.searchParams.set('client_id', clientId)
      u.searchParams.set('response_type', 'code')
      u.searchParams.set('redirect_uri', redirect)
      u.searchParams.set('scope', ambiti(parti).join(' '))
      u.searchParams.set('state', stato)
      u.searchParams.set('code_challenge', sfida)
      u.searchParams.set('code_challenge_method', 'S256')
      // rifare il consenso quando si aggiunge una metà: senza, Microsoft
      // riusa quello di prima e il token torna senza i permessi nuovi — con
      // un 403 che arriva alla prima lettura e parla di tutt'altro
      u.searchParams.set('prompt', 'consent')
      return u.toString()
    }
  }
}

// — chi è collegato, e a cosa —

export function parti(): Parte[] {
  return leggi().microsoft?.parti ?? []
}

export function collegato(p?: Parte): boolean {
  const m = leggi().microsoft
  if (!m?.refresh) return false
  return p ? m.parti.includes(p) : m.parti.length > 0
}

/**
 * Collega una metà, tenendo quella che c'era già.
 *
 * L'unione è il punto: chi ha già Outlook e aggiunge SharePoint rifà il
 * consenso su tutte e due, e il token nuovo copre tutto. Se si chiedesse solo
 * la metà nuova, Microsoft tornerebbe un token buono per i file e Outlook
 * smetterebbe di funzionare — un collegamento che ne rompe un altro, senza
 * dire niente.
 */
export async function collega(clientId: string, tenant: string, parte: Parte): Promise<{ email: string }> {
  const id = clientId.trim()
  if (!id) throw new Error('Serve l’ID applicazione di Entra ID.')
  const gia = leggi().microsoft
  const tutte = [...new Set([...(gia?.parti ?? []), parte])] as Parte[]
  const t = String(tenant || gia?.tenant || 'common').trim()

  const g = await consenso(sportello(id, t, tutte))
  if (!g.refresh_token) throw new Error('Microsoft non ha dato il permesso duraturo: riprova.')

  scriviConfig({
    ...leggi(),
    microsoft: { clientId: id, tenant: t, refresh: g.refresh_token, parti: tutte, giorni: gia?.giorni ?? 30 }
  })
  vivo.scorda()

  const chi = await chiEra().catch(() => ({ email: '', nome: '' }))
  if (chi.email || chi.nome) {
    scriviConfig({ ...leggi(), microsoft: { ...leggi().microsoft!, email: chi.email, nome: chi.nome } })
  }
  return { email: chi.email }
}

/**
 * Stacca una metà sola.
 *
 * Il token resta quello di prima: continua a *poter* fare anche l'altra cosa
 * finché Microsoft non lo revoca, e fingere il contrario sarebbe una bugia
 * comoda. Quello che cambia davvero è che Myynd smette di guardarci — e
 * quando non resta nessuna metà, il token si butta per davvero.
 */
export function scollega(parte?: Parte) {
  const c = leggi()
  const m = c.microsoft
  if (!m) return
  const restano = parte ? m.parti.filter(p => p !== parte) : []
  if (!restano.length) {
    const { microsoft: _via, ...resto } = c
    scriviConfig(resto)
  } else {
    scriviConfig({ ...c, microsoft: { ...m, parti: restano } })
  }
  vivo.scorda()
}

const vivo = new Vivo(async () => {
  const m = leggi().microsoft
  if (!m?.refresh) throw new Error('Collega Microsoft e potrò farlo.')
  return chiediGettoni(sportello(m.clientId, m.tenant ?? 'common', m.parti), {
    refresh_token: m.refresh,
    grant_type: 'refresh_token',
    scope: ambiti(m.parti).join(' ')
  })
})

export function scordaIlToken() { vivo.scorda() }

// — parlare con Graph —

async function chiama(url: string): Promise<Response> {
  const r = await fetch(url.startsWith('http') ? url : `${GRAFO}${url}`, {
    headers: { authorization: `Bearer ${await vivo.dammi()}` },
    signal: AbortSignal.timeout(45_000)
  })
  if (r.status === 429 || r.status === 503) {
    const aspetta = Math.min(30, Number(r.headers.get('retry-after') ?? 5))
    await new Promise(f => setTimeout(f, aspetta * 1000))
    return chiama(url)
  }
  if (!r.ok) {
    if (r.status === 401) throw new Error('Microsoft non mi lascia leggere: ricollega l’account.')
    if (r.status === 403) throw new Error('A questo collegamento mancano dei permessi: rifallo.')
    throw new Error('Microsoft non ha risposto.')
  }
  return r
}

async function api<T>(url: string): Promise<T> {
  return await (await chiama(url)).json() as T
}

async function chiEra(): Promise<{ email: string; nome: string }> {
  const j = await api<{ mail?: string; userPrincipalName?: string; displayName?: string }>('/me')
  return { email: j.mail || j.userPrincipalName || '', nome: j.displayName || '' }
}

export async function prova(_c: ConfigMicrosoft): Promise<
  { ok: true; email: string; nome: string } | { ok: false; errore: string }
> {
  try {
    return { ok: true, ...await chiEra() }
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : String(e) }
  }
}

// — la posta —

type Messaggio = {
  id: string
  subject?: string
  bodyPreview?: string
  receivedDateTime?: string
  isDraft?: boolean
  from?: { emailAddress?: { name?: string; address?: string } }
  toRecipients?: { emailAddress?: { name?: string; address?: string } }[]
  body?: { contentType?: string; content?: string }
  parentFolderId?: string
}

/**
 * L'HTML di una mail, spogliato.
 *
 * Graph sa tornare il testo semplice — `Prefer: outlook.body-content-type` —
 * ma non tutte le caselle lo rispettano, e un corpo HTML indicizzato com'è
 * riempie la ricerca di nomi di tag e di fogli di stile. Meglio spogliarlo
 * sempre: su un corpo già semplice queste sostituzioni non trovano niente e
 * non costano niente.
 */
export function spoglia(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    // il tag che apre una riga lascia dietro uno spazio, e quello spazio resta
    // in testa a ogni riga del testo indicizzato: brutto da leggere, e in più
    // fa somigliare due copie della stessa mail a due documenti diversi
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export type EsitoPosta = { docs: Documento[]; troncato: boolean }

export async function sincronizzaPosta(
  c: ConfigMicrosoft,
  avanzamento?: (fatti: number, totale: number) => void
): Promise<EsitoPosta> {
  const giorni = Math.min(365, Math.max(1, c.giorni ?? 30))
  const dal = new Date(Date.now() - giorni * 86_400_000).toISOString()

  const u = new URL(`${GRAFO}/me/messages`)
  u.searchParams.set('$filter', `receivedDateTime ge ${dal}`)
  u.searchParams.set('$orderby', 'receivedDateTime desc')
  u.searchParams.set('$select', 'id,subject,receivedDateTime,from,toRecipients,body,isDraft')
  u.searchParams.set('$top', '50')

  const docs: Documento[] = []
  let prossima: string | undefined = u.toString()
  let troncato = false
  let fatti = 0

  while (prossima) {
    const r: { value?: Messaggio[]; '@odata.nextLink'?: string } = await api(prossima)
    for (const m of r.value ?? []) {
      // una bozza non è posta arrivata: è un pensiero a metà, e in un indice
      // di documenti si comporta come se fosse stata mandata
      if (m.isDraft) continue
      const grezzo = m.body?.content ?? m.bodyPreview ?? ''
      const testo = riflua(m.body?.contentType === 'html' ? spoglia(grezzo) : grezzo.trim())
      if (!testo) continue
      const da = m.from?.emailAddress
      docs.push({
        id: `microsoft:${m.id}`,
        fonte: 'microsoft',
        tipo: 'email',
        titolo: m.subject?.trim() || '(senza oggetto)',
        corpo: testo.slice(0, 20_000),
        autore: da ? (da.name ? `${da.name} <${da.address ?? ''}>` : da.address ?? null) : null,
        percorso: 'Posta in arrivo',
        quando: m.receivedDateTime ?? null,
        gruppo: 'posta'
      })
      avanzamento?.(++fatti, MAX_MESSAGGI)
      if (docs.length >= MAX_MESSAGGI) { troncato = true; return { docs, troncato } }
    }
    prossima = r['@odata.nextLink']
  }
  return { docs, troncato }
}

// — l'agenda —

export type Evento = { titolo: string; inizio: string; minuti?: number; dove?: string; calendario?: string }

/**
 * Quello che ha in calendario nei prossimi giorni.
 *
 * Esiste per una ragione che non si vede da qui: `agenda.ts` legge il
 * calendario del Mac, e su Windows quindi non legge niente. Un'automazione che
 * dice «guarda cos'ho domani» era una cosa che su metà dei computer non poteva
 * funzionare — e non lo diceva. Con Outlook collegato adesso funziona ovunque.
 */
export async function prossimi(giorni = 7): Promise<Evento[]> {
  const da = new Date()
  const a = new Date(Date.now() + Math.min(30, Math.max(1, giorni)) * 86_400_000)
  const u = new URL(`${GRAFO}/me/calendarView`)
  u.searchParams.set('startDateTime', da.toISOString())
  u.searchParams.set('endDateTime', a.toISOString())
  u.searchParams.set('$select', 'subject,start,end,location')
  u.searchParams.set('$orderby', 'start/dateTime')
  u.searchParams.set('$top', '50')

  type Ev = {
    subject?: string
    start?: { dateTime?: string; timeZone?: string }
    end?: { dateTime?: string }
    location?: { displayName?: string }
  }
  const r = await api<{ value?: Ev[] }>(u.toString())
  return (r.value ?? []).map(e => {
    const inizio = e.start?.dateTime ? new Date(`${e.start.dateTime}Z`) : null
    const fine = e.end?.dateTime ? new Date(`${e.end.dateTime}Z`) : null
    return {
      titolo: e.subject?.trim() || '(senza titolo)',
      inizio: inizio ? inizio.toISOString() : '',
      minuti: inizio && fine ? Math.round((fine.getTime() - inizio.getTime()) / 60_000) : undefined,
      dove: e.location?.displayName || undefined,
      calendario: 'Outlook'
    }
  }).filter(e => e.inizio)
}

// — i file: OneDrive e SharePoint —

type Voce = {
  id: string
  name: string
  size?: number
  lastModifiedDateTime?: string
  webUrl?: string
  file?: { mimeType?: string }
  folder?: unknown
  lastModifiedBy?: { user?: { displayName?: string } }
  parentReference?: { driveId?: string; path?: string }
}

/** I drive da guardare: il proprio, e quelli dei siti che segue. */
async function drive(): Promise<{ id: string; dove: string }[]> {
  const fuori: { id: string; dove: string }[] = []
  try {
    const mio = await api<{ id?: string }>('/me/drive?$select=id')
    if (mio.id) fuori.push({ id: mio.id, dove: 'OneDrive' })
  } catch { /* niente OneDrive: restano i siti */ }

  /*
   * I siti che *segue*, non tutti quelli che esistono.
   *
   * Un'azienda su SharePoint ha centinaia di siti, e la stragrande maggioranza
   * non c'entra niente con chi sta collegando: indicizzarli tutti vorrebbe dire
   * ore di lettura per riempire la mente di roba di altri reparti, e una
   * ricerca su «contratto» che torna il contratto di qualcun altro. Quelli
   * seguiti sono la scelta che una persona ha già fatto.
   */
  try {
    const siti = await api<{ value?: { id: string; displayName?: string; name?: string }[] }>('/me/followedSites')
    for (const s of (siti.value ?? []).slice(0, 20)) {
      try {
        const d = await api<{ value?: { id: string; name?: string }[] }>(`/sites/${s.id}/drives?$select=id,name`)
        for (const x of d.value ?? []) fuori.push({ id: x.id, dove: s.displayName || s.name || 'SharePoint' })
      } catch { /* un sito che non si apre non ferma gli altri */ }
    }
  } catch { /* niente siti seguiti: resta OneDrive */ }
  return fuori
}

export type EsitoFile = {
  docs: Documento[]
  falliti: number
  troncato: boolean
  visti: string[]
  /** Vero solo se tutti i drive si sono lasciati percorrere fino in fondo. */
  completo: boolean
}

export async function sincronizzaFile(
  c: ConfigMicrosoft,
  avanzamento?: (fatti: number, totale: number) => void
): Promise<EsitoFile> {
  const giorni = Math.min(3650, Math.max(1, c.giorni ?? 90))
  const dal = Date.now() - giorni * 86_400_000
  const docs: Documento[] = []
  const visti: string[] = []
  let falliti = 0
  let troncato = false
  let completo = true
  let fatti = 0

  for (const d of await drive()) {
    if (docs.length >= MAX_FILE_TOTALI) { troncato = true; completo = false; break }
    const voci: Voce[] = []
    try {
      // `delta` percorre tutto l'albero senza doverlo scendere a mano, ed è
      // l'unica chiamata che non si perde nelle cartelle profonde
      let prossima: string | undefined = `/drives/${d.id}/root/delta?$top=200`
      while (prossima) {
        const r: { value?: Voce[]; '@odata.nextLink'?: string } = await api(prossima)
        voci.push(...(r.value ?? []))
        prossima = r['@odata.nextLink']
        if (voci.length >= MAX_FILE_TOTALI * 3) { troncato = true; completo = false; break }
      }
    } catch {
      // un drive che non risponde non prova che i suoi file siano spariti
      completo = false
      falliti++
      continue
    }

    const file = voci
      .filter(v => v.file && !v.folder)
      .filter(v => !v.lastModifiedDateTime || Date.parse(v.lastModifiedDateTime) >= dal)
      .sort((a, b) => (b.lastModifiedDateTime ?? '').localeCompare(a.lastModifiedDateTime ?? ''))

    for (const v of file) {
      if (docs.length >= MAX_FILE_TOTALI) { troncato = true; completo = false; break }
      const id = `sharepoint:${d.id}:${v.id}`
      if (!leggibile(v.name) || (v.size ?? 0) > MAX_FILE || (v.size ?? 0) === 0) {
        // c'è, non l'abbiamo letto: le due cose insieme, o `riconcilia` lo
        // cancella dall'indice senza che nessuno abbia sbagliato niente
        visti.push(id)
        continue
      }
      try {
        const buf = Buffer.from(await (await chiama(`/drives/${d.id}/items/${v.id}/content`)).arrayBuffer())
        const corpo = await daBuffer(buf, v.name)
        if (corpo.trim().length < 20) { visti.push(id); continue }
        docs.push({
          id,
          fonte: 'sharepoint',
          tipo: tipoDi(v.name),
          titolo: v.name,
          corpo: corpo.slice(0, 20_000),
          autore: v.lastModifiedBy?.user?.displayName ?? null,
          percorso: v.webUrl ?? d.dove,
          quando: v.lastModifiedDateTime ?? null,
          gruppo: 'documenti'
        })
      } catch {
        falliti++
        visti.push(id)
      }
      avanzamento?.(++fatti, file.length)
    }
  }

  return { docs, falliti, troncato, visti, completo: completo && !troncato }
}
