// Dropbox: la cartella condivisa dove sta il lavoro di tutti.
//
// **Perché qui il browser non torna indietro da solo.** Dropbox vuole che
// l'indirizzo di ritorno sia registrato prima, esatto, porta compresa — e una
// porta fissa su un'app che gira sul computer di qualcuno è una porta che un
// giorno sarà occupata da qualcos'altro, con un collegamento che fallisce per
// una ragione che nessuno può indovinare. Dropbox però ha l'altra strada, ed è
// migliore proprio perché è più stupida: si autorizza senza indirizzo di
// ritorno, Dropbox scrive un codice sullo schermo, e quel codice si incolla
// qui. Un passo in più per chi collega, e in cambio una cosa che funziona
// sempre e che chiede meno da configurare — nessun indirizzo di ritorno da
// registrare, solo la chiave dell'app.
//
// PKCE anche qui, e non per abitudine: senza indirizzo di ritorno il codice
// passa dagli occhi e dagli appunti di una persona, ed è il momento in cui è
// più esposto. Il verificatore resta in questo processo e non esce mai: un
// codice rubato in quei dieci secondi, senza, non vale niente.
//
// **Sola lettura.** `files.metadata.read` e `files.content.read`: da qui non
// si scrive un file, e non perché ci si sia ricordati di non farlo.

import { randomBytes, createHash } from 'node:crypto'
import * as chi from '../chi.ts'
import { leggi, scrivi as scriviConfig } from '../config.ts'
import type { Documento } from '../store.ts'
import { apriIlBrowser, chiediGettoni, Vivo, type Sportello } from './oauth.ts'
import { daBuffer, leggibile, tipoDi } from './estrai.ts'

export const AMBITI = ['account_info.read', 'files.metadata.read', 'files.content.read']

export type ConfigDropbox = {
  chiave: string
  refresh: string
  conto?: string
  /** Quante giornate indietro guardare le modifiche. */
  giorni?: number
}

const MAX_FILE = 12_000_000
const MAX_DOCUMENTI = 1200

function traduci(j: Record<string, unknown>, _stato: number): string | null {
  const e = String(j.error ?? '')
  if (e === 'invalid_grant') return 'Quel codice non è più valido: rifai il collegamento.'
  if (e === 'invalid_client') return 'La chiave dell’app Dropbox non è valida.'
  return null
}

function sportello(chiave: string): Sportello {
  return {
    nome: 'Dropbox',
    gettoni: 'https://api.dropboxapi.com/oauth2/token',
    campi: { client_id: chiave },
    traduci,
    // non si usa: qui l'indirizzo del browser lo costruisce `inizia`
    autorizza: () => ''
  }
}

/**
 * Il verificatore, fra l'andata e il ritorno.
 *
 * Sta in memoria e non su disco: è un segreto che vale mezzo minuto, e
 * scriverlo vorrebbe dire lasciarne una copia scaduta in giro per sempre. Ha
 * una scadenza sua perché una finestra del browser chiusa a metà non deve
 * lasciare questo processo con un segreto vivo in pancia.
 */
// per persona: due collegamenti avviati insieme da due conti non devono
// scambiarsi il verificatore, né la chiave dell'app
const inCorso = new Map<string, { chiave: string; verifica: string; scade: number }>()

export function collegato(): boolean {
  return !!leggi().dropbox?.refresh
}

/** Primo tempo: apre il browser e si tiene il verificatore. */
export async function inizia(chiave: string): Promise<{ dove: string }> {
  const k = chiave.trim()
  if (!k) throw new Error('Serve la chiave dell’app Dropbox.')
  const verifica = randomBytes(48).toString('base64url')
  const sfida = createHash('sha256').update(verifica).digest('base64url')
  inCorso.set(chi.adesso() ?? '', { chiave: k, verifica, scade: Date.now() + 10 * 60_000 })

  const u = new URL('https://www.dropbox.com/oauth2/authorize')
  u.searchParams.set('client_id', k)
  u.searchParams.set('response_type', 'code')
  // `offline` è quello che fa arrivare il token duraturo: senza, il
  // collegamento smette di funzionare dopo quattro ore e nessuno sa perché
  u.searchParams.set('token_access_type', 'offline')
  u.searchParams.set('scope', AMBITI.join(' '))
  u.searchParams.set('code_challenge', sfida)
  u.searchParams.set('code_challenge_method', 'S256')

  const dove = u.toString()
  await apriIlBrowser(dove).catch(() => { /* niente browser: c'è l'indirizzo da copiare */ })
  return { dove }
}

/** Secondo tempo: il codice che Dropbox ha scritto sullo schermo. */
export async function finisci(codice: string): Promise<{ conto: string }> {
  const c = codice.trim()
  if (!c) throw new Error('Incolla il codice che ti ha dato Dropbox.')
  const di = chi.adesso() ?? ''
  const avviato = inCorso.get(di)
  if (!avviato || avviato.scade < Date.now()) {
    inCorso.delete(di)
    throw new Error('È passato troppo tempo: ricomincia il collegamento.')
  }
  const { chiave, verifica } = avviato

  const t = await chiediGettoni(sportello(chiave), {
    code: c,
    grant_type: 'authorization_code',
    code_verifier: verifica
  })
  inCorso.delete(chi.adesso() ?? '')
  if (!t.refresh_token) throw new Error('Dropbox non ha dato il permesso duraturo: riprova.')

  scriviConfig({ ...leggi(), dropbox: { chiave, refresh: t.refresh_token, giorni: 90 } })
  vivo.scorda()

  // il nome del conto è una comodità, non una condizione: se non arriva, il
  // collegamento è comunque riuscito e non va buttato via per un'etichetta
  const conto = await chiEra().catch(() => '')
  if (conto) scriviConfig({ ...leggi(), dropbox: { ...leggi().dropbox!, conto } })
  return { conto }
}

export function scollega() {
  const { dropbox: _via, ...resto } = leggi()
  scriviConfig(resto)
  inCorso.delete(chi.adesso() ?? '')
  vivo.scorda()
}

const vivo = new Vivo(async () => {
  const d = leggi().dropbox
  if (!d?.refresh) throw new Error('Collega Dropbox e potrò farlo.')
  return chiediGettoni(sportello(d.chiave), { refresh_token: d.refresh, grant_type: 'refresh_token' })
})

export function scordaIlToken() { vivo.scorda() }

/**
 * Una chiamata a Dropbox.
 *
 * Il corpo è JSON tranne quando non c'è, e quel caso non è pignoleria: le
 * chiamate senza argomenti vogliono il corpo *vuoto*, e mandare `{}` con un
 * content-type JSON le fa fallire con un errore che parla di parsing e non
 * dice quale sia il problema vero.
 */
async function api<T>(percorso: string, corpo: unknown = null): Promise<T> {
  const r = await fetch(`https://api.dropboxapi.com/2/${percorso}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${await vivo.dammi()}`,
      ...(corpo === null ? {} : { 'content-type': 'application/json' })
    },
    body: corpo === null ? undefined : JSON.stringify(corpo),
    signal: AbortSignal.timeout(45_000)
  })
  if (!r.ok) {
    if (r.status === 401) throw new Error('Dropbox non mi lascia leggere: ricollega l’account.')
    if (r.status === 429) throw new Error('Dropbox ha detto di rallentare. Riprovo più tardi.')
    throw new Error('Dropbox non ha risposto.')
  }
  return await r.json() as T
}

/**
 * L'argomento viaggia in un'intestazione, e le intestazioni sono ASCII.
 *
 * Un file che si chiama «Preventivo Perù.pdf» manda in errore la richiesta —
 * e sarebbe un errore per file, silenzioso, che colpisce proprio i nomi
 * scritti in italiano. Si sfugge tutto quello che sta sopra il settimo bit.
 */
function soloAscii(s: string): string {
  return s.replace(/[\u0080-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
}

async function scarica(percorso: string): Promise<Buffer> {
  const r = await fetch('https://content.dropboxapi.com/2/files/download', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${await vivo.dammi()}`,
      'Dropbox-API-Arg': soloAscii(JSON.stringify({ path: percorso }))
    },
    signal: AbortSignal.timeout(60_000)
  })
  if (!r.ok) throw new Error('Dropbox non ha dato il file.')
  return Buffer.from(await r.arrayBuffer())
}

async function chiEra(): Promise<string> {
  const j = await api<{ email?: string; name?: { display_name?: string } }>('users/get_current_account')
  return j.name?.display_name || j.email || ''
}

export async function prova(_c: ConfigDropbox): Promise<{ ok: true; conto: string } | { ok: false; errore: string }> {
  try {
    return { ok: true, conto: await chiEra() }
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : String(e) }
  }
}

type Voce = {
  '.tag': 'file' | 'folder' | 'deleted'
  id?: string
  name: string
  path_display?: string
  path_lower?: string
  size?: number
  server_modified?: string
}

export type EsitoDropbox = {
  docs: Documento[]
  falliti: number
  troncato: boolean
  visti: string[]
  /** Vero solo se l'elenco è una fotografia intera: solo allora si riconcilia. */
  completo: boolean
}

export async function sincronizza(
  c: ConfigDropbox,
  avanzamento?: (fatti: number, totale: number) => void
): Promise<EsitoDropbox> {
  const giorni = Math.min(3650, Math.max(1, c.giorni ?? 90))
  const dal = Date.now() - giorni * 86_400_000

  const voci: Voce[] = []
  let troncato = false
  let completo = true
  try {
    let r = await api<{ entries: Voce[]; cursor: string; has_more: boolean }>('files/list_folder', {
      path: '', recursive: true, limit: 2000,
      include_deleted: false, include_non_downloadable_files: false
    })
    voci.push(...r.entries)
    while (r.has_more) {
      if (voci.length >= MAX_DOCUMENTI * 4) { troncato = true; completo = false; break }
      r = await api<{ entries: Voce[]; cursor: string; has_more: boolean }>('files/list_folder/continue', { cursor: r.cursor })
      voci.push(...r.entries)
    }
  } catch (e) {
    // un elenco letto a metà non prova che il resto sia sparito: si tiene
    // quello che si è avuto e si dice che non è una fotografia intera
    completo = false
    if (!voci.length) throw e
  }

  const file = voci
    .filter(v => v['.tag'] === 'file')
    .filter(v => !v.server_modified || Date.parse(v.server_modified) >= dal)
    .sort((a, b) => (b.server_modified ?? '').localeCompare(a.server_modified ?? ''))

  // oltre il tetto non è una fotografia intera: dirlo qui, non dopo
  if (file.length > MAX_DOCUMENTI) { troncato = true; completo = false }
  const scelti = file.slice(0, MAX_DOCUMENTI)

  const docs: Documento[] = []
  const visti: string[] = []
  let falliti = 0
  let fatti = 0

  for (const v of scelti) {
    const chiave = v.id ?? v.path_lower ?? v.path_display ?? v.name
    const id = `dropbox:${chiave}`
    if (!leggibile(v.name) || (v.size ?? 0) > MAX_FILE || (v.size ?? 0) === 0) {
      // esiste, non l'abbiamo letto: le due cose insieme, o `riconcilia` lo
      // cancella dall'indice senza che nessuno abbia sbagliato niente
      visti.push(id)
      avanzamento?.(++fatti, scelti.length)
      continue
    }
    try {
      const corpo = await daBuffer(await scarica(v.path_lower ?? v.path_display ?? ''), v.name)
      if (corpo.trim().length < 20) { visti.push(id); avanzamento?.(++fatti, scelti.length); continue }
      docs.push({
        id,
        fonte: 'dropbox',
        tipo: tipoDi(v.name),
        titolo: v.name,
        corpo: corpo.slice(0, 20_000),
        autore: null,
        percorso: v.path_display ?? null,
        quando: v.server_modified ?? null,
        gruppo: 'documenti'
      })
    } catch {
      falliti++
      visti.push(id)
    }
    avanzamento?.(++fatti, scelti.length)
  }

  return { docs, falliti, troncato, visti, completo: completo && !troncato }
}
