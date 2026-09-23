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
import type { CasoAmministratore } from './amministratore.ts'

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
 * Di chi sono i repository che si guardano: i suoi, quelli dove collabora, e
 * quelli delle sue organizzazioni.
 *
 * Prima l'ultima voce mancava, e un token a grana fine fatto per
 * un'organizzazione — che è il modo in cui GitHub chiede di farli, uno per
 * proprietario — vedeva i repository del team attraverso l'appartenenza, non
 * come collaboratore: l'elenco tornava vuoto e il collegamento leggeva zero.
 */
const AFFILIAZIONE = 'owner,collaborator,organization_member'

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

/**
 * Una chiamata a GitHub, con la rete che può mancare.
 *
 * Senza questo `try`, una rete giù usciva così com'è dal `fetch` di Node —
 * «fetch failed», «The operation was aborted due to timeout» — cioè una riga
 * inglese e tecnica nella scheda, che non dice cosa fare.
 */
async function grezza(c: ConfigGithub, dove: string): Promise<Response> {
  try {
    return await fetch(dove.startsWith('http') ? dove : `${API}${dove}`, {
      headers: intestazioni(c),
      signal: AbortSignal.timeout(30_000)
    })
  } catch (e) {
    const nome = e instanceof Error ? e.name : ''
    throw new NoDiGithub(nome === 'TimeoutError' || nome === 'AbortError' ? LENTO : IRRAGGIUNGIBILE)
  }
}

/**
 * Un no di GitHub che ha già la sua frase.
 *
 * `Limite` è l'unico che il giro di lettura tratta a parte; questo porta in
 * più, quando c'è, l'indirizzo che GitHub stesso manda per sistemare le cose
 * (l'autorizzazione SSO di un'organizzazione) e il caso da amministratore.
 */
class NoDiGithub extends Error {
  dove?: string
  amministratore?: CasoAmministratore
  /** La durata massima che l'organizzazione accetta, quando GitHub la dice. */
  giorni?: number
  constructor(messaggio: string, extra: { dove?: string; amministratore?: CasoAmministratore; giorni?: number } = {}) {
    super(messaggio)
    if (extra.dove) this.dove = extra.dove
    if (extra.amministratore) this.amministratore = extra.amministratore
    if (extra.giorni) this.giorni = extra.giorni
  }
}

/** Le frasi, scritte una volta: la scheda e il giro di lettura dicono le stesse. */
const TOKEN_NON_VALIDO = 'GitHub non riconosce questo token: è scaduto, è stato cancellato o è stato copiato a metà. Creane uno nuovo e incollalo qui.'
const PERMESSI_MANCANTI = 'A questo token mancano dei permessi. Su GitHub aprilo e, in «Permissions», dai a Contents, Issues e Pull requests l’accesso «Read-only».'
const SSO = 'La tua organizzazione su GitHub chiede l’accesso unico (SSO) per questo token: aprilo su GitHub, premi «Configure SSO» e poi «Authorize» accanto all’organizzazione.'
const CLASSICO_VIETATO = 'Questa organizzazione non accetta i token classici: crea un token a grana fine con il bottone qui sopra.'
const TROPPO_LUNGO = 'Questa organizzazione non accetta token che durano così a lungo: rigeneralo su GitHub con una scadenza più breve.'
const GRANA_FINE_VIETATA = 'Questa organizzazione non accetta i token a grana fine. Chiedi a un suo amministratore di permetterli, in Organization settings › Personal access tokens, oppure usa un token classico con l’ambito «repo».'
const RALLENTA_GIRO = 'GitHub ha detto di rallentare: riprendo al prossimo giro.'
const RALLENTA_COLLEGAMENTO = 'GitHub ha chiesto di rallentare, e il collegamento non è stato salvato. Riprova fra qualche minuto.'
const IRRAGGIUNGIBILE = 'Non riesco a raggiungere GitHub. Controlla la connessione a internet e riprova.'
const LENTO = 'GitHub non ha risposto in tempo. Controlla la connessione a internet e riprova fra poco.'
/** La pagina dei token classici, con l'ambito che serve: per le organizzazioni che non accettano gli altri. */
const PAGINA_CLASSICO = 'https://github.com/settings/tokens/new?scopes=repo&description=Myynd'
const CLASSICO_SENZA_REPO = 'A questo token classico manca l’ambito «repo»: crea invece un token a grana fine con il bottone qui sopra.'
const NOME_STORTO = 'Scrivi i repository come owner/nome, uno per riga.'

/**
 * I modi in cui GitHub dice di no, separati uno per uno.
 *
 * Il 403 è il caso che conta: GitHub ci mette dentro cose diversissime —
 * «hai chiesto troppo», «al token manca un permesso», «l'organizzazione
 * vuole l'SSO», «l'organizzazione non accetta questo tipo di token» — e a
 * distinguerle sono le intestazioni e la frase del corpo. Trattarle uguali
 * vuol dire o mandare qualcuno a rifare un token che andava benissimo, o
 * smettere di leggere una fonte per sempre perché un mercoledì si era
 * esaurito il limite orario. Le frasi di GitHub, e dove sono scritte:
 *
 *   · 401 «Bad credentials»: token sbagliato, scaduto o revocato
 *     (docs.github.com, «Token expiration and revocation»: a scadenza il
 *     token è revocato, e risponde come uno sbagliato);
 *   · 403 «Resource not accessible by personal access token», con
 *     `X-Accepted-GitHub-Permissions`: al token a grana fine manca il permesso
 *     (docs.github.com, «Troubleshooting the REST API»);
 *   · `X-GitHub-SSO: required; url=…`: l'organizzazione usa SAML e il token
 *     classico non è autorizzato; l'indirizzo vale un'ora (docs.github.com,
 *     «Authenticating to the REST API», SAML SSO);
 *   · «forbids access via a personal access token (classic)» e «forbids access
 *     via a fine-grained personal access token(s) if the token's lifetime is
 *     greater than 366 days»: i criteri dell'organizzazione (composer#12711).
 */
async function controlla(r: Response): Promise<void> {
  if (r.ok) return
  if (r.status === 401) throw new NoDiGithub(TOKEN_NON_VALIDO)
  const sso = r.headers.get('x-github-sso') ?? ''
  if (/^required/i.test(sso)) {
    throw new NoDiGithub(SSO, { dove: /url=(\S+)/.exec(sso)?.[1] })
  }
  if (r.status === 403 || r.status === 429) {
    const restano = r.headers.get('x-ratelimit-remaining')
    const detto = await r.clone().json().then((j: unknown) => String((j as { message?: unknown })?.message ?? ''), () => '')
    /*
     * Il limite secondario arriva senza `retry-after` e senza un contatore a
     * zero: lo dice solo la frase, «You have exceeded a secondary rate limit»
     * (docs.github.com, «Rate limits for the REST API»). Letto come permesso
     * mancante, mandava a rifare un token che andava benissimo.
     */
    if (r.headers.get('retry-after') || restano === '0' || /rate limit/i.test(detto)) {
      throw new Limite(RALLENTA_GIRO)
    }
    if (/forbids access via a personal access token \(classic\)/i.test(detto)) throw new NoDiGithub(CLASSICO_VIETATO)
    if (/forbids access via a fine-grained/i.test(detto)) {
      /*
       * La durata massima la decide l'organizzazione, da 1 a 366 giorni, e
       * GitHub la scrive nella frase: «…if the token's lifetime is greater
       * than 90 days. Please adjust your token's lifetime at the following
       * URL: https://github.com/settings/personal-access-tokens/123»
       * (composer#12711). Si prendono tutte e due, il numero e l'indirizzo.
       */
      if (/lifetime/i.test(detto)) {
        const n = Number(/greater than (\d+) days?/i.exec(detto)?.[1]) || 0
        const dove = /https:\/\/github\.com\/settings\/personal-access-tokens\/\d+/.exec(detto)?.[0]
        if (n > 0) {
          throw new NoDiGithub(
            `Questa organizzazione accetta token che durano al massimo ${n} giorni: rigeneralo su GitHub con una scadenza di ${n} giorni o meno.`,
            { giorni: n, ...(dove ? { dove } : {}) })
        }
        throw new NoDiGithub(TROPPO_LUNGO, dove ? { dove } : {})
      }
      // senza la durata di mezzo, l'organizzazione non li accetta proprio
      throw new NoDiGithub(GRANA_FINE_VIETATA, { dove: PAGINA_CLASSICO })
    }
    throw new NoDiGithub(PERMESSI_MANCANTI)
  }
  if (r.status === 404) throw new NoDiGithub('GitHub non trova questo repository, o il token non lo vede.')
  throw new NoDiGithub('GitHub non ha risposto come mi aspettavo.')
}

async function chiama<T>(c: ConfigGithub, dove: string): Promise<T> {
  const r = await grezza(c, dove)
  await controlla(r)
  try {
    return await r.json() as T
  } catch {
    throw new Error('GitHub non ha risposto come mi aspettavo.')
  }
}

export function collegato(c?: { github?: ConfigGithub }): boolean {
  return !!c?.github?.token
}

/** Quanti repository si contano per la conferma: una pagina, e poi «più di». */
const CONTATI = 100

const NESSUN_REPOSITORY = 'Questo token non vede nessun repository. Su GitHub aprilo e, in «Repository access», scegli «All repositories» o «Only select repositories» con quelli da leggere.'

/**
 * Il token va bene, vede qualcosa, e può leggere quello che leggeremo.
 *
 * `/user` dice chi è: è la chiamata più economica che esista e non chiede
 * nessun permesso sui repository, quindi passa anche a un token cieco
 * (docs.github.com: «The fine-grained token does not require any
 * permissions»). Per questo subito dopo si guarda il resto:
 *
 *   · un token classico dichiara gli ambiti in `x-oauth-scopes`, e senza
 *     `repo` quel collegamento resterebbe a zero per sempre;
 *   · si contano i repository che vede. Zero non è un collegamento riuscito
 *     con niente dentro: è quasi sempre «Repository access» lasciato su
 *     «Public repositories», o un token di un'organizzazione che aspetta
 *     l'approvazione — e si dice adesso, non fra sei ore;
 *   · i repository scritti a mano si guardano uno per uno: la conferma li
 *     conta, e contarne uno che il token non vede sarebbe un numero falso;
 *   · sul primo repository si fanno le tre letture che farà il giro, una
 *     riga ciascuna. Un permesso che manca a un token a grana fine lo dice
 *     solo una lettura vera (un 403 «Resource not accessible by personal
 *     access token»), e la prima lettura vera, altrimenti, sarebbe quella
 *     notturna.
 *
 * Tornano due numeri: quanti repository vede (`repos`, e `oltre` se sono più
 * di una pagina) e quanti ne legge davvero a ogni giro (`letti`, al massimo
 * trenta). La conferma li dice tutti e due quando non coincidono.
 *
 * `sso` è il token classico che vede solo una parte delle organizzazioni:
 * GitHub risponde 200 e lo scrive in `X-GitHub-SSO: partial-results`
 * (docs.github.com, «Authenticating to the REST API», SAML SSO). Il
 * collegamento funziona, ma alcuni repository restano fuori finché non lo
 * autorizza: si dice accanto alla conferma.
 */
export async function prova(c: ConfigGithub): Promise<
  { ok: true; login: string; repos: number; oltre: boolean; letti: number; sso: boolean }
  | { ok: false; errore: string; dove?: string; repo?: string; giorni?: number; amministratore?: CasoAmministratore }
> {
  if (!c.token.trim()) return { ok: false, errore: 'Serve il token di GitHub.' }
  const cc: ConfigGithub = { ...c, token: c.token.trim() }
  try {
    const r = await grezza(cc, '/user')
    await controlla(r)
    const ambiti = r.headers.get('x-oauth-scopes')
    if (ambiti !== null && !/\b(repo|public_repo)\b/.test(ambiti)) {
      return { ok: false, errore: CLASSICO_SENZA_REPO }
    }
    const u = await r.json().catch(() => ({})) as { login?: string }
    let sso = /partial-results/i.test(r.headers.get('x-github-sso') ?? '')

    const scelti = (c.repos ?? []).map(x => x.trim()).filter(Boolean).slice(0, MAX_REPOS)
    let elenco: string[]
    let oltre = false
    if (scelti.length) {
      // uno per uno, qualche alla volta: sono al massimo trenta letture brevi
      for (let i = 0; i < scelti.length; i += 6) {
        const gruppo = scelti.slice(i, i + 6)
        const esiti = await Promise.all(gruppo.map(async pieno => {
          const parti = dividi(pieno)
          if (!parti) return { pieno, errore: NOME_STORTO }
          const x = await grezza(cc, `/repos/${parti.owner}/${parti.repo}`)
          if (x.status === 404) return { pieno, errore: 'GitHub non trova questo repository, o il token non lo vede.' }
          await controlla(x)
          return null
        }))
        const guasto = esiti.find(Boolean)
        if (guasto) return { ok: false, errore: guasto.errore, repo: guasto.pieno }
      }
      elenco = scelti
    } else {
      const l = await grezza(cc, `/user/repos?sort=pushed&per_page=${CONTATI}&affiliation=${AFFILIAZIONE}`)
      await controlla(l)
      oltre = /rel="next"/.test(l.headers.get('link') ?? '')
      sso = sso || /partial-results/i.test(l.headers.get('x-github-sso') ?? '')
      const tutti = await l.json().catch(() => []) as Repo[]
      elenco = (Array.isArray(tutti) ? tutti : []).map(x => x.full_name ?? '').filter(Boolean)
      if (!elenco.length) {
        /*
         * Zero repository, e il caso dell'organizzazione accanto.
         *
         * Un token a grana fine creato per un'organizzazione resta «pending»
         * finché un suo amministratore non lo approva, e intanto legge solo
         * quello che è pubblico (docs.github.com, «Managing your personal
         * access tokens»). Da qui non si distingue da «Repository access»
         * lasciato su «Public repositories»: si dicono tutte e due, e la
         * scheda offre la richiesta per l'amministratore come seconda strada.
         */
        return { ok: false, errore: NESSUN_REPOSITORY, amministratore: { servizio: 'github-org', forse: true } }
      }
    }

    // le tre letture del giro, sul primo repository: una riga ciascuna
    const parti = dividi(elenco[0]!)
    if (!parti) return { ok: false, errore: NOME_STORTO, repo: elenco[0]! }
    const base = `/repos/${parti.owner}/${parti.repo}`
    for (const dove of [`${base}/commits?per_page=1`, `${base}/issues?per_page=1`, `${base}/pulls?per_page=1`]) {
      const x = await grezza(cc, dove)
      // 409: repository vuoto, niente da leggere ma nessun permesso che manca;
      // 410: issue spente su quel repository, idem
      if (x.status === 409 || x.status === 410) continue
      await controlla(x)
    }
    return {
      ok: true, login: u.login ?? '', repos: elenco.length, oltre,
      letti: Math.min(elenco.length, MAX_REPOS), sso
    }
  } catch (e) {
    /*
     * Il «rallenta» qui non è quello del giro: collegando non si è salvato
     * niente, e «riprendo al prossimo giro» prometterebbe un giro che non
     * c'è. Si dice che il collegamento non c'è ancora, e di riprovare.
     */
    if (e instanceof Limite) return { ok: false, errore: RALLENTA_COLLEGAMENTO }
    if (e instanceof NoDiGithub) {
      return {
        ok: false, errore: e.message,
        ...(e.dove ? { dove: e.dove } : {}),
        ...(e.giorni ? { giorni: e.giorni } : {}),
        ...(e.amministratore ? { amministratore: e.amministratore } : {})
      }
    }
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
  const r = await chiama<Repo[]>(c, `/user/repos?sort=pushed&per_page=${MAX_REPOS}&affiliation=${AFFILIAZIONE}`)
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
