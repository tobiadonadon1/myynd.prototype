// GitHub: quello che è successo al lavoro, mentre lui guardava altrove.
//
// Perché è una fonte e non un'integrazione. Un'azienda che scrive software
// tiene su GitHub la metà delle decisioni che Slack non ha: una pull request
// aperta è una proposta, una issue è un problema che qualcuno ha visto, un
// commit è una cosa fatta. Sono tutte e tre *notizie*, e finora la rassegna
// del mattino non ne vedeva nessuna — raccontava la posta e le conversazioni a
// uno che passa le giornate dentro un repository.
//
// **Un token incollato, in sola lettura.** GitHub il ballo del browser lo
// saprebbe ballare, ma vorrebbe dire una GitHub App registrata da chi ospita —
// lo stesso muro di Google, per una fonte che con un token a grana fine si
// collega in tre minuti. Il token è quello di chi collega: vede i suoi
// repository e non uno di più, e i permessi che chiediamo sono tre, tutti di
// lettura. **Qui dentro non si scrive mai**: non c'è una sola chiamata che non
// sia una GET, e non deve comparirne nessuna.
//
// **Un documento per cosa successa, non per repository.** Un repository intero
// è troppo grosso per essere un documento — non ha un «quando», e la ricerca
// pesa proprio la freschezza — mentre una pull request, una issue e un commit
// sono già unità che una persona riconosce: hanno un titolo, un autore, una
// data e un indirizzo dove andare a vederle. Sono esattamente la forma che la
// rassegna sa raccontare.
//
// **Quattordici giorni, e nessuna riconciliazione.** Un giro guarda la
// finestra recente, che è tutto quello che serve per dire «cosa è cambiato».
// Ma una finestra non è un inventario: quello che resta fuori non è sparito da
// GitHub, è solo vecchio — e riconciliare vorrebbe dire svuotare l'indice di
// tutto quello che ha più di due settimane, a ogni giro, in silenzio. Come
// Gmail, che per la stessa ragione non riconcilia.

import type { ConfigGithub } from '../config.ts'
import type { Documento } from '../store.ts'

const API = 'https://api.github.com'

/** Quanti repository si guardano, quando non è stato scelto un elenco a mano. */
const MAX_REPOS = 30
/** Quanti giorni indietro, quando non lo dice chi chiama. */
const GIORNI = 14
/**
 * Il tetto di documenti per giro.
 *
 * Trenta repository vivi fanno al massimo trenta per (venti + venti + trenta),
 * cioè duemila e passa: senza un tetto, un giro di GitHub da solo riempirebbe
 * l'indice e le altre fonti resterebbero indietro per ore.
 */
const MAX_DOCUMENTI = 400

/** Quanto del testo di una pull request o di una issue entra nel documento. */
const MAX_CORPO = 1_500

/**
 * «Rallenta»: non è un guasto, è un limite che passa da solo.
 *
 * Va distinto dagli altri errori perché la reazione giusta è opposta: un token
 * sbagliato va detto e il giro va fermato, un limite orario va assecondato —
 * si tiene quello che si è già letto e si riprende al giro dopo. Confonderli
 * vorrebbe dire o perdere il lavoro fatto, o insistere su un'API che ha già
 * detto di no.
 */
class Limite extends Error {}

function intestazioni(c: ConfigGithub): Record<string, string> {
  return {
    authorization: `Bearer ${c.token}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    // GitHub rifiuta le richieste senza: è scritto nella sua documentazione,
    // e il no che dà è un 403 che sembra un permesso mancante
    'user-agent': 'myynd'
  }
}

async function grezza(c: ConfigGithub, dove: string): Promise<Response> {
  return await fetch(dove.startsWith('http') ? dove : `${API}${dove}`, {
    headers: intestazioni(c),
    signal: AbortSignal.timeout(30_000)
  })
}

/**
 * I modi in cui GitHub dice di no, separati uno per uno.
 *
 * Il 403 è il caso che conta: GitHub ci mette dentro due cose diverse — «non
 * hai il permesso» e «hai chiesto troppo» — e sono le sole intestazioni a
 * distinguerle. Trattarle uguali vuol dire o mandare qualcuno a rifare un
 * token che andava benissimo, o smettere di leggere una fonte per sempre
 * perché un mercoledì si era esaurito il limite orario.
 */
function controlla(r: Response): void {
  if (r.ok) return
  if (r.status === 401) throw new Error('Il token di GitHub non è valido.')
  if (r.status === 403 || r.status === 429) {
    const restano = r.headers.get('x-ratelimit-remaining')
    if (r.headers.get('retry-after') || restano === '0') {
      throw new Limite('GitHub ha detto di rallentare: riprendo al prossimo giro.')
    }
    throw new Error('A questo token mancano dei permessi: serve la lettura di contenuti, issue e pull request.')
  }
  if (r.status === 404) throw new Error('GitHub non trova questo repository, o il token non lo vede.')
  throw new Error('GitHub non ha risposto come mi aspettavo.')
}

async function chiama<T>(c: ConfigGithub, dove: string): Promise<T> {
  const r = await grezza(c, dove)
  controlla(r)
  try {
    return await r.json() as T
  } catch {
    throw new Error('GitHub non ha risposto come mi aspettavo.')
  }
}

export function collegato(c?: { github?: ConfigGithub }): boolean {
  return !!c?.github?.token
}

/**
 * Il token va bene, e vede qualcosa.
 *
 * `/user` dice chi è: è la chiamata più economica che esista e non chiede
 * nessun permesso sui repository, quindi passa anche a un token cieco. Per
 * questo subito dopo si guardano gli ambiti: un token classico li dichiara in
 * `x-oauth-scopes`, e senza `repo` quel collegamento resterebbe a zero per
 * sempre senza che nessun errore lo dica. Uno a grana fine quell'intestazione
 * non la manda affatto — lì il permesso si scopre solo leggendo davvero, e
 * l'errore arriva dalla prima lettura.
 */
export async function prova(c: ConfigGithub): Promise<
  { ok: true; login: string } | { ok: false; errore: string }
> {
  if (!c.token.trim()) return { ok: false, errore: 'Serve il token di GitHub.' }
  try {
    const r = await grezza({ ...c, token: c.token.trim() }, '/user')
    controlla(r)
    const ambiti = r.headers.get('x-oauth-scopes')
    if (ambiti !== null && !/\b(repo|public_repo)\b/.test(ambiti)) {
      return { ok: false, errore: 'A questo token manca l’ambito «repo»: rifallo spuntando la lettura dei repository.' }
    }
    const u = await r.json().catch(() => ({})) as { login?: string }
    return { ok: true, login: u.login ?? '' }
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : String(e) }
  }
}

// — leggere —

type Repo = { full_name?: string }
type Utente = { login?: string }
type Etichetta = { name?: string }

type Proposta = {
  number?: number
  title?: string
  state?: string
  merged_at?: string | null
  updated_at?: string
  html_url?: string
  body?: string | null
  user?: Utente | null
  labels?: Etichetta[]
  comments?: number
  review_comments?: number
  draft?: boolean
  /** C'è solo sulle issue che in realtà sono pull request. */
  pull_request?: unknown
}

type Commit = {
  sha?: string
  html_url?: string
  commit?: { message?: string; author?: { name?: string; date?: string } | null } | null
  author?: Utente | null
  stats?: { total?: number } | null
  files?: unknown[]
}

export type EsitoGithub = {
  docs: Documento[]
  /** I repository che non si sono lasciati leggere: si dicono, non si ingoiano. */
  falliti: string[]
  troncato: boolean
  /** Perché ci si è fermati prima della fine, se ci si è fermati per il limite. */
  limite: string | null
  /** Quanti repository ha guardato davvero. */
  repos: number
}

/** `owner/nome` → le due metà, o niente se non è un nome di repository. */
export function dividi(pieno: string): { owner: string; repo: string } | null {
  const m = /^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)$/.exec(pieno.trim())
  return m ? { owner: m[1]!, repo: m[2]! } : null
}

/**
 * Quali repository guardare.
 *
 * L'elenco scritto a mano vince sempre: chi lo compila sta dicendo «guarda
 * questi tre», e riempirgli l'indice con gli altri quaranta a cui ha accesso
 * sarebbe l'esatto contrario di quello che ha chiesto. Senza elenco si prendono
 * i suoi, ordinati per ultima spinta: i trenta più vivi sono quelli di cui
 * qualcuno vuole sapere qualcosa.
 */
async function repositori(c: ConfigGithub): Promise<string[]> {
  const scelti = (c.repos ?? []).map(r => r.trim()).filter(Boolean)
  if (scelti.length) return scelti.slice(0, MAX_REPOS)
  const r = await chiama<Repo[]>(c, `/user/repos?sort=pushed&per_page=${MAX_REPOS}&affiliation=owner,collaborator`)
  return (Array.isArray(r) ? r : []).map(x => x.full_name ?? '').filter(Boolean).slice(0, MAX_REPOS)
}

/** Aperta, chiusa o unita: per una pull request le ultime due non sono la stessa cosa. */
function statoProposta(p: Proposta): string {
  if (p.merged_at) return 'unita'
  if (p.state === 'closed') return 'chiusa'
  return p.draft ? 'aperta in bozza' : 'aperta'
}

function chi(p: { user?: Utente | null }): string {
  return p.user?.login ?? 'qualcuno'
}

/** Quello che dice una pull request o una issue, in una manciata di righe. */
function corpoProposta(p: Proposta, cosa: string, pieno: string): string {
  const righe = [`${cosa} ${statoProposta(p)} in ${pieno}, di ${chi(p)}.`]
  if (p.updated_at) righe.push(`Aggiornata il ${p.updated_at}.`)
  const etichette = (p.labels ?? []).map(l => l.name ?? '').filter(Boolean)
  if (etichette.length) righe.push(`Etichette: ${etichette.join(', ')}.`)
  /*
   * I commenti si contano, non si aprono.
   *
   * Leggerli vorrebbe dire due chiamate in più per ogni pull request — con
   * trenta repository, qualche centinaio a giro — per portare dentro quasi
   * sempre «lgtm» e un pollice. Il numero invece dice l'unica cosa che conta
   * da fuori: se lì sotto si è discusso o no.
   */
  const commenti = (p.comments ?? 0) + (p.review_comments ?? 0)
  if (commenti) righe.push(`${commenti} commenti.`)
  const testo = (p.body ?? '').trim()
  return testo ? `${righe.join('\n')}\n\n${testo.slice(0, MAX_CORPO)}` : righe.join('\n')
}

function documentoProposta(p: Proposta, pieno: string, nome: string, cosa: 'pr' | 'issue'): Documento | null {
  const n = p.number
  if (!n) return null
  const etichetta = cosa === 'pr' ? 'Pull request' : 'Issue'
  return {
    id: `github:${cosa}:${pieno}#${n}`,
    fonte: 'github',
    tipo: cosa === 'pr' ? 'pull request' : 'issue',
    titolo: `${nome} #${n}: ${(p.title ?? '').trim() || '(senza titolo)'}`,
    corpo: corpoProposta(p, etichetta, pieno),
    autore: p.user?.login ?? null,
    // dove andare a vederla: `apriFonte` apre questo nel browser, come per
    // Notion e Drive
    percorso: p.html_url ?? null,
    quando: p.updated_at ?? null,
    gruppo: 'conversazioni'
  }
}

function documentoCommit(k: Commit, pieno: string, nome: string): Documento | null {
  const sha = k.sha
  if (!sha) return null
  const messaggio = (k.commit?.message ?? '').replace(/\r\n?/g, '\n').trim()
  const prima = messaggio.split('\n')[0]!.trim() || sha.slice(0, 7)
  const autore = k.commit?.author?.name || k.author?.login || 'qualcuno'
  const quando = k.commit?.author?.date ?? null
  const righe = [`Commit in ${pieno}, di ${autore}.`]
  if (quando) righe.push(`Del ${quando}.`)
  // il numero di file toccati c'è solo se GitHub lo manda: l'elenco dei commit
  // non lo porta, il singolo commit sì. Dedurlo da zero direbbe una bugia
  const toccati = Array.isArray(k.files) ? k.files.length : undefined
  if (toccati !== undefined) righe.push(`${toccati} file toccati.`)
  const resto = messaggio.split('\n').slice(1).join('\n').trim()
  return {
    id: `github:commit:${sha}`,
    fonte: 'github',
    tipo: 'commit',
    titolo: `${nome}: ${prima.slice(0, 160)}`,
    corpo: resto ? `${righe.join('\n')}\n\n${resto.slice(0, MAX_CORPO)}` : righe.join('\n'),
    autore,
    percorso: k.html_url ?? null,
    quando,
    gruppo: 'conversazioni'
  }
}

/** È dentro la finestra? Una data che non si legge conta come dentro: meglio in più che in meno. */
function nellaFinestra(quando: string | undefined, da: number): boolean {
  if (!quando) return true
  const t = Date.parse(quando)
  return Number.isNaN(t) || t >= da
}

/**
 * Legge le ultime due settimane di lavoro: proposte, problemi e cose fatte.
 *
 * Tre chiamate per repository e nessuna di più: i commenti si contano dal
 * numero che GitHub manda già dentro la pull request, e il contenuto di un
 * commit non si apre. È la differenza fra un giro da novanta chiamate e uno da
 * mille — cioè fra una fonte che sta dentro il giro delle altre e una che se lo
 * prende tutto.
 */
export async function sincronizza(
  c: ConfigGithub,
  avanzamento?: (fatti: number, totale: number) => void,
  dal?: Date
): Promise<EsitoGithub> {
  const da = dal ?? new Date(Date.now() - GIORNI * 86_400_000)
  const daISO = da.toISOString()
  const daMs = da.getTime()
  const elenco = await repositori(c)
  const docs: Documento[] = []
  const falliti: string[] = []
  let troncato = false
  let limite: string | null = null
  let fatti = 0

  const aggiungi = (d: Documento | null): boolean => {
    if (!d) return true
    if (docs.length >= MAX_DOCUMENTI) { troncato = true; return false }
    docs.push(d)
    return true
  }

  for (const pieno of elenco) {
    if (troncato || limite) break
    const parti = dividi(pieno)
    if (!parti) { falliti.push(pieno); avanzamento?.(++fatti, elenco.length); continue }
    const { owner, repo } = parti
    const base = `/repos/${owner}/${repo}`

    try {
      const prs = await chiama<Proposta[]>(c, `${base}/pulls?state=all&sort=updated&direction=desc&per_page=20`)
      for (const p of Array.isArray(prs) ? prs : []) {
        if (!nellaFinestra(p.updated_at, daMs)) continue
        if (!aggiungi(documentoProposta(p, pieno, repo, 'pr'))) break
      }

      if (!troncato) {
        const issues = await chiama<Proposta[]>(c, `${base}/issues?state=all&sort=updated&direction=desc&per_page=20`)
        for (const i of Array.isArray(issues) ? issues : []) {
          // le pull request compaiono anche fra le issue: lasciarle passare
          // vorrebbe dire lo stesso lavoro contato due volte, con due id
          // diversi, e una rassegna che ripete ogni proposta
          if (i.pull_request) continue
          if (!nellaFinestra(i.updated_at, daMs)) continue
          if (!aggiungi(documentoProposta(i, pieno, repo, 'issue'))) break
        }
      }

      if (!troncato) {
        const commits = await chiama<Commit[]>(c, `${base}/commits?since=${encodeURIComponent(daISO)}&per_page=30`)
        for (const k of Array.isArray(commits) ? commits : []) {
          if (!aggiungi(documentoCommit(k, pieno, repo))) break
        }
      }
    } catch (e) {
      /*
       * Il limite ferma il giro; tutto il resto ferma solo questo repository.
       *
       * Insistere dopo un «rallenta» vuol dire trenta chiamate che tornano
       * tutte 403, e un giro che sembra andato male dappertutto per un limite
       * che passa da solo fra dieci minuti. Quello che si è già letto resta.
       */
      if (e instanceof Limite) { limite = e.message; troncato = true; break }
      falliti.push(pieno)
    }
    avanzamento?.(++fatti, elenco.length)
  }

  return { docs, falliti, troncato, limite, repos: elenco.length }
}
