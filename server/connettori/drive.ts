// Google Drive: i documenti che non sono mai passati da un allegato.
//
// Perché è una fonte a parte e non un pezzo di `google.ts`. Perché è un
// *permesso* a parte, e i permessi non si sommano di nascosto: chi collega la
// posta ha detto di sì alla posta, e allargargli l'accesso a tutti i suoi file
// senza chiederglielo di nuovo sarebbe esattamente la cosa che questo prodotto
// promette di non fare. Due connettori, due consensi, due bottoni per staccarli.
//
// Il progetto su Google Cloud però è lo stesso — le stesse credenziali, la
// stessa schermata di consenso — quindi chi ha già collegato Gmail non deve
// ricreare niente: il modulo qui davanti si porta dietro il client id che c'è
// già, e resta un bottone solo da premere.
//
// **Sola lettura, e si vede nell'ambito.** `drive.readonly` è tutto quello che
// si chiede: nessun file di nessuno può essere toccato da qui, e non perché ci
// si sia ricordati di non farlo — perché Google non lo permetterebbe con
// questo token.
//
// I documenti di Google — Docs, Fogli, Presentazioni — non si scaricano: si
// *esportano*. Un Doc non è un file, è una struttura sui server di Google, e
// chiederne il contenuto grezzo torna dei byte che non vogliono dire niente.
// Si chiede l'esportazione in testo, che è quello che serve a un indice.

import { leggi, scrivi as scriviConfig } from '../config.ts'
import type { Documento } from '../store.ts'
import { consenso, chiediGettoni, Vivo, avviaWeb, type Sportello } from './oauth.ts'
import { APP_GOOGLE } from '../ospitato.ts'
import { daBuffer, leggibile, tipoDi } from './estrai.ts'
import { riprendi, segna, resto, type Resto } from './ripresa.ts'

export const AMBITI = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/userinfo.email'
]

export type ConfigDrive = {
  clientId: string
  clientSecret?: string
  refresh: string
  email?: string
  /** Quante giornate indietro guardare le modifiche. */
  giorni?: number
}

const MAX_FILE = 12_000_000
const MAX_DOCUMENTI = 1200

/**
 * Quanti file si elencano, che è un'altra cosa da quanti se ne aprono.
 *
 * Elencare costa una chiamata ogni mille nomi; aprire costa uno scaricamento e
 * un'estrazione a testa. Erano confusi in un tetto solo, e la confusione
 * costava caro: al milleduecentesimo nome si smetteva pure di *guardare*, e da
 * fuori un Drive da cinquemila file era indistinguibile da uno da
 * milleduecento. Adesso si guarda tutto — venti chiamate — e si aprono
 * milleduecento file per giro, riprendendo dove il giro prima si era fermato.
 * Da lì viene il «tremilaquattrocento di cinquemila» che si può finalmente
 * scrivere sullo schermo.
 */
const MAX_ELENCO = 20_000

/** Cosa diventa un documento di Google quando lo si chiede in testo. */
const ESPORTA: Record<string, { come: string; ext: string }> = {
  'application/vnd.google-apps.document': { come: 'text/plain', ext: '.txt' },
  'application/vnd.google-apps.spreadsheet': { come: 'text/csv', ext: '.csv' },
  'application/vnd.google-apps.presentation': { come: 'text/plain', ext: '.txt' }
}

function traduci(j: Record<string, unknown>, _stato: number): string | null {
  if (j.error === 'invalid_grant') return 'Il collegamento con Google Drive è scaduto: rifallo.'
  return null
}

function sportello(clientId: string, clientSecret?: string): Sportello {
  return {
    nome: 'Google Drive',
    gettoni: 'https://oauth2.googleapis.com/token',
    campi: { client_id: clientId, ...(clientSecret ? { client_secret: clientSecret } : {}) },
    traduci,
    autorizza: ({ redirect, sfida, stato }) => {
      const u = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      u.searchParams.set('client_id', clientId)
      u.searchParams.set('redirect_uri', redirect)
      u.searchParams.set('response_type', 'code')
      u.searchParams.set('scope', AMBITI.join(' '))
      // i due insieme, o il token duraturo arriva solo la primissima volta e
      // chi ricollega l'account resta senza — con un errore che arriva un'ora
      // dopo e non dice perché
      u.searchParams.set('access_type', 'offline')
      u.searchParams.set('prompt', 'consent')
      u.searchParams.set('state', stato)
      u.searchParams.set('code_challenge', sfida)
      u.searchParams.set('code_challenge_method', 'S256')
      return u.toString()
    }
  }
}

export function collegato(): boolean {
  return !!leggi().drive?.refresh
}

/** Ospitati: l'app di chi ospita, il browser della persona, il ritorno dal nostro dominio. */
/**
 * Il segreto con cui rinnovare: quello scritto dalla persona (l'app sua, in
 * casa), o quello di chi ospita quando il clientId è il suo. Non si scrive
 * più nella configurazione di ognuno — usciva con l'esportazione.
 */
function segretoDi(g: { clientId: string; clientSecret?: string }): string | undefined {
  if (g.clientSecret) return g.clientSecret
  return g.clientId === APP_GOOGLE.clientId ? APP_GOOGLE.clientSecret || undefined : undefined
}

export function avvia(): { dove: string; biglietto: string } {
  const app = APP_GOOGLE
  if (!app.clientId) throw new Error('Google Drive non è ancora disponibile su questo server.')
  return avviaWeb(sportello(app.clientId, app.clientSecret), async t => {
    if (!t.refresh_token) throw new Error('Google non ha dato il permesso duraturo: riprova.')
    const email = await chiEra(t.access_token).catch(() => '')
    // il segreto dell'app resta nell'ambiente di chi ospita, non nella configurazione della persona
    scriviConfig({ ...leggi(), drive: { clientId: app.clientId, refresh: t.refresh_token, email, giorni: 90 } })
    vivo.scorda()
  })
}

export async function collega(clientId: string, clientSecret?: string): Promise<{ email: string }> {
  if (!clientId.trim()) throw new Error('Serve il client ID di Google.')
  const s = sportello(clientId.trim(), clientSecret)
  const t = await consenso(s)
  if (!t.refresh_token) throw new Error('Google non ha dato il permesso duraturo: riprova.')

  const email = await chiEra(t.access_token).catch(() => '')
  const c = leggi()
  scriviConfig({ ...c, drive: { clientId: clientId.trim(), clientSecret, refresh: t.refresh_token, email, giorni: 90 } })
  vivo.scorda()
  return { email }
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
  const { drive: _via, ...resto } = leggi()
  scriviConfig(resto)
  vivo.scorda()
}

const vivo = new Vivo(async () => {
  const d = leggi().drive
  if (!d?.refresh) throw new Error('Collega Google Drive e potrò farlo.')
  return chiediGettoni(sportello(d.clientId, segretoDi(d)), {
    refresh_token: d.refresh,
    grant_type: 'refresh_token'
  })
})

/** Da usare nei test: dimentica il token in memoria. */
export function scordaIlToken() { vivo.scorda() }

async function chiama(url: string): Promise<Response> {
  const r = await fetch(url, {
    headers: { authorization: `Bearer ${await vivo.dammi()}` },
    signal: AbortSignal.timeout(45_000)
  })
  if (!r.ok) {
    if (r.status === 401 || r.status === 403) throw new Error('Google Drive non mi lascia leggere: ricollega l’account.')
    if (r.status === 429) throw new Error('Google ha detto di rallentare. Riprovo più tardi.')
    throw new Error('Google Drive non ha risposto.')
  }
  return r
}

async function json<T>(url: string): Promise<T> {
  return await (await chiama(url)).json() as T
}

export async function prova(c: ConfigDrive): Promise<{ ok: true; file: number } | { ok: false; errore: string }> {
  try {
    const r = await json<{ files?: unknown[] }>(
      'https://www.googleapis.com/drive/v3/files?pageSize=5&fields=files(id)'
    )
    return { ok: true, file: (r.files ?? []).length }
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : String(e) }
  }
}

type File = {
  id: string
  name: string
  mimeType: string
  modifiedTime?: string
  size?: string
  webViewLink?: string
  owners?: { displayName?: string; emailAddress?: string }[]
  trashed?: boolean
}

export type EsitoDrive = {
  docs: Documento[]
  falliti: number
  troncato: boolean
  visti: string[]
  /** Quanti file ci sono, quanti sono passati, quanti mancano. */
  resto: Resto
}

/**
 * Legge i file, i più mossi per primi.
 *
 * `visti` non è una decorazione ed è la riga che tiene in vita quello che c'è
 * ma che stavolta non abbiamo letto: un file troppo grande, un formato che non
 * sappiamo aprire, uno che ha dato errore. Senza, `riconcilia` — che decide chi
 * è ancora vivo guardando gli id tornati — lo cancellerebbe dall'indice, e un
 * documento sparirebbe *perché è cresciuto*, senza un errore da nessuna parte.
 */
export async function sincronizza(
  c: ConfigDrive,
  avanzamento?: (fatti: number, totale: number) => void
): Promise<EsitoDrive> {
  const giorni = Math.min(3650, Math.max(1, c.giorni ?? 90))
  const dal = new Date(Date.now() - giorni * 86_400_000).toISOString()
  const q = [
    'trashed = false',
    "mimeType != 'application/vnd.google-apps.folder'",
    `modifiedTime > '${dal}'`
  ].join(' and ')

  const tutti: File[] = []
  let pagina: string | undefined
  let elencoTroncato = false
  do {
    const u = new URL('https://www.googleapis.com/drive/v3/files')
    u.searchParams.set('q', q)
    u.searchParams.set('pageSize', '1000')
    u.searchParams.set('orderBy', 'modifiedTime desc')
    u.searchParams.set('fields', 'nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink,owners(displayName,emailAddress))')
    // i file dei Drive condivisi sono file di lavoro come gli altri: escluderli
    // vorrebbe dire non vedere proprio quelli su cui si lavora in più persone
    u.searchParams.set('includeItemsFromAllDrives', 'true')
    u.searchParams.set('supportsAllDrives', 'true')
    if (pagina) u.searchParams.set('pageToken', pagina)

    const r = await json<{ files?: File[]; nextPageToken?: string }>(u.toString())
    tutti.push(...(r.files ?? []))
    pagina = r.nextPageToken
    if (tutti.length >= MAX_ELENCO) { elencoTroncato = true; break }
  } while (pagina)

  /*
   * Il segno è la data di modifica più l'id, e non la posizione nell'elenco.
   *
   * Fra un giro e l'altro qualcuno salva un documento: l'elenco è ordinato dal
   * più recente, quindi tutto scala di uno, e una posizione salvata come numero
   * ripartirebbe da un file diverso — cioè ne salterebbe uno, per sempre, senza
   * che nessuno lo veda.
   */
  const segnoDi = (f: File) => `${f.modifiedTime ?? ''}|${f.id}`
  const { da, ripreso } = riprendi('drive', tutti, segnoDi,
    (f, s) => (f.modifiedTime ?? '') < (s.split('|')[0] ?? ''))
  const file = tutti.slice(da, da + MAX_DOCUMENTI)
  const arrivati = da + file.length
  // ne restano fuori, o l'elenco stesso non era intero: in tutti e due i casi
  // questa non è una fotografia da cui si possa cancellare niente
  const troncato = elencoTroncato || ripreso || arrivati < tutti.length
  segna('drive', arrivati < tutti.length && file.length ? segnoDi(file[file.length - 1]!) : null)

  const docs: Documento[] = []
  const visti: string[] = []
  let falliti = 0
  let fatti = 0

  for (const f of file) {
    const id = `drive:${f.id}`
    const esporta = ESPORTA[f.mimeType]
    // quello che non sappiamo aprire esiste lo stesso: si dichiara vivo e si
    // passa oltre, invece di lasciarlo cancellare dal silenzio
    if (!esporta && !leggibile(f.name)) { visti.push(id); avanzamento?.(++fatti, file.length); continue }
    if (!esporta && Number(f.size ?? 0) > MAX_FILE) { visti.push(id); avanzamento?.(++fatti, file.length); continue }

    try {
      let corpo: string
      if (esporta) {
        const u = new URL(`https://www.googleapis.com/drive/v3/files/${f.id}/export`)
        u.searchParams.set('mimeType', esporta.come)
        corpo = await daBuffer(Buffer.from(await (await chiama(u.toString())).arrayBuffer()), esporta.ext)
      } else {
        const u = new URL(`https://www.googleapis.com/drive/v3/files/${f.id}`)
        u.searchParams.set('alt', 'media')
        u.searchParams.set('supportsAllDrives', 'true')
        corpo = await daBuffer(Buffer.from(await (await chiama(u.toString())).arrayBuffer()), f.name)
      }

      if (corpo.trim().length < 20) { visti.push(id); avanzamento?.(++fatti, file.length); continue }
      docs.push({
        id,
        fonte: 'drive',
        tipo: esporta ? (f.mimeType.endsWith('spreadsheet') ? 'tabella' : 'documento') : tipoDi(f.name),
        titolo: f.name || '(senza nome)',
        corpo: corpo.slice(0, 20_000),
        autore: f.owners?.[0]?.displayName ?? f.owners?.[0]?.emailAddress ?? null,
        percorso: f.webViewLink ?? null,
        quando: f.modifiedTime ?? null,
        gruppo: 'documenti'
      })
    } catch {
      // un file illeggibile non ferma gli altri, e resta vivo: non sappiamo
      // che sia sparito, sappiamo solo che stavolta non l'abbiamo letto
      falliti++
      visti.push(id)
    }
    avanzamento?.(++fatti, file.length)
  }

  return { docs, falliti, troncato, visti, resto: resto(arrivati, tutti.length) }
}
