// Il ballo dell'autorizzazione, una volta sola per tutti quelli che lo fanno.
//
// Google lo faceva già, per conto suo, dentro `google.ts`: si apre il browser,
// la persona dice di sì al servizio, il servizio rimanda un codice a un server
// che vive dodici secondi su 127.0.0.1, e quel codice si scambia con un token.
// È lo stesso identico ballo per Drive, per Microsoft e per Dropbox — e
// copiarlo quattro volte vorrebbe dire quattro copie di una cosa che sbaglia
// in silenzio quando sbaglia: un OAuth scritto male non dà errore, dà un
// collegamento che smette di funzionare dopo un'ora e nessuno sa perché.
//
// Quindi sta qui, una volta, e ogni connettore porta solo quello che ha di
// suo: l'indirizzo dove mandare la gente, l'indirizzo dove scambiare il
// codice, e come si legge un suo errore.
//
// Due cose che la versione dentro `google.ts` non aveva, e che sono vere per
// tutti:
//
//   · **lo `state`.** Il server che aspetta il codice è in ascolto su una
//     porta locale, e su quella porta può bussare chiunque giri su questa
//     macchina — compresa una pagina web aperta in un'altra scheda. Senza
//     `state` non c'è modo di distinguere il codice che è tornato dal browser
//     *nostro* da uno infilato lì da qualcun altro. È la difesa standard, e
//     costa sei righe.
//   · **una porta sola risponde.** Il browser, appena atterra, chiede anche la
//     favicon. Quella richiesta non ha nessun codice dentro, e la versione di
//     prima la trattava come un fallimento — se fosse arrivata per prima
//     avrebbe fatto saltare un collegamento perfettamente riuscito. Qui
//     risponde solo la radice, e tutto il resto prende un 404 e viene ignorato.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import * as chi from '../chi.ts'
import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const esegui = promisify(execFile)

export type Gettoni = {
  access_token: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  [k: string]: unknown
}

/** Il verificatore di PKCE e la sua sfida. */
function pkce() {
  const verifica = randomBytes(48).toString('base64url')
  const sfida = createHash('sha256').update(verifica).digest('base64url')
  return { verifica, sfida }
}

export async function apriIlBrowser(url: string) {
  if (process.platform === 'darwin') await esegui('/usr/bin/open', [url])
  else if (process.platform === 'win32') await esegui('cmd', ['/c', 'start', '', url])
  else await esegui('xdg-open', [url])
}

/** Confronto che non racconta niente sul tempo che ci mette. */
function uguali(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

function pagina(bene: boolean, nome: string): string {
  return '<!doctype html><meta charset="utf-8"><title>Myynd</title>' +
    '<body style="font:16px -apple-system,Helvetica,sans-serif;background:#191715;color:#F4EFE8;' +
    'display:grid;place-items:center;height:100vh;margin:0;text-align:center">' +
    `<div>${bene
      ? 'Fatto. Puoi chiudere questa pagina e tornare su Myynd.'
      : `Non è andata con ${nome}. Torna su Myynd e riprova.`}</div>`
}

/**
 * Si mette in ascolto e dice su che porta.
 *
 * L'ordine conta: la porta serve *prima* di aprire il browser, perché entra
 * nell'indirizzo di ritorno. Perciò questa funzione torna appena è in ascolto,
 * con dentro la promessa del codice che arriverà dopo — invece di una promessa
 * sola che si risolve alla fine, quando ormai è tardi per sapere dove mandare
 * la gente.
 */
function ascolta(atteso: string, nome: string): Promise<{
  porta: number; codice: Promise<string>; chiudi: () => void
}> {
  return new Promise((pronto, male) => {
    let dai: (c: string) => void
    let no: (e: Error) => void
    const codice = new Promise<string>((a, b) => { dai = a; no = b })

    const s = createServer((req, res) => {
      const u = new URL(req.url ?? '/', 'http://127.0.0.1')
      // solo la radice: la favicon e qualunque altra bussata non sono la
      // risposta che stiamo aspettando, e non devono poterla rovinare
      if (u.pathname !== '/') { res.writeHead(404); res.end(); return }

      const c = u.searchParams.get('code')
      const stato = u.searchParams.get('state') ?? ''
      const errore = u.searchParams.get('error')
      const buono = !!c && uguali(stato, atteso)

      res.writeHead(buono ? 200 : 400, { 'content-type': 'text/html; charset=utf-8' })
      res.end(pagina(buono, nome))

      if (buono) dai(c!)
      else if (c) no(new Error('La risposta non è quella che aspettavo: riprova.'))
      else if (errore === 'access_denied') no(new Error(`Hai detto di no a ${nome}.`))
      else no(new Error(`${nome} non ha mandato il codice.`))
    })

    s.on('error', male)
    // porta 0: la sceglie il sistema fra quelle libere
    s.listen(0, '127.0.0.1', () => {
      const porta = (s.address() as { port: number }).port
      const chiudi = () => { try { s.close() } catch { /* già chiusa */ } }
      setTimeout(() => { chiudi(); no(new Error(`Nessuna risposta da ${nome}: riprova.`)) }, 120_000).unref()
      pronto({ porta, codice, chiudi })
    })
  })
}

export type Sportello = {
  /** Come si chiama, per le frasi che legge una persona. */
  nome: string
  /** L'indirizzo a cui mandare la gente a dire di sì. */
  autorizza: (p: { redirect: string; sfida: string; stato: string }) => string
  /** L'indirizzo a cui si scambia il codice, e più tardi si rinfresca. */
  gettoni: string
  /** Campi in più nella richiesta del token: client_id, e il segreto se serve. */
  campi: Record<string, string>
  /** Intestazioni in più, per chi vuole il Basic invece dei campi. */
  intestazioni?: Record<string, string>
  /** Da un errore del servizio a una frase che si può leggere. */
  traduci?: (j: Record<string, unknown>, stato: number) => string | null
}

/**
 * Chiede i token, e traduce il no.
 *
 * Il messaggio che tornano questi servizi è per chi sviluppa — «invalid_grant»,
 * «unauthorized_client» — e non va mostrato a nessuno così com'è. Ogni
 * connettore porta il suo `traduci` per i due o tre casi che capitano davvero;
 * per tutti gli altri c'è una frase che almeno dice di chi è la colpa.
 */
export async function chiediGettoni(s: Sportello, corpo: Record<string, string>): Promise<Gettoni> {
  const r = await fetch(s.gettoni, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
      ...(s.intestazioni ?? {})
    },
    body: new URLSearchParams({ ...s.campi, ...corpo }).toString(),
    signal: AbortSignal.timeout(20_000)
  })
  const j = await r.json().catch(() => ({})) as Record<string, unknown>

  // Slack risponde 200 con `ok: false`: un controllo sul solo stato HTTP
  // lascerebbe passare un fallimento come se fosse un collegamento riuscito
  const andata = r.ok && j.ok !== false
  if (!andata) {
    const detto = s.traduci?.(j, r.status)
    if (detto) throw new Error(detto)
    throw new Error(`${s.nome} ha rifiutato il collegamento.`)
  }
  return j as Gettoni
}

/**
 * Il giro intero: apre il browser, aspetta il sì, torna i token.
 *
 * Quello che torna non si scrive da nessuna parte: sta a chi chiama decidere
 * cosa conservare. Quasi sempre è il solo `refresh_token` — l'unica chiave che
 * dura — e mai il token d'accesso, che vale un'ora e su disco diventa solo una
 * copia scaduta di un segreto.
 */
export async function consenso(s: Sportello): Promise<Gettoni> {
  const { verifica, sfida } = pkce()
  const stato = randomBytes(24).toString('base64url')
  const { porta, codice, chiudi } = await ascolta(stato, s.nome)
  const redirect = `http://127.0.0.1:${porta}`

  try {
    await apriIlBrowser(s.autorizza({ redirect, sfida, stato }))
    return await chiediGettoni(s, {
      code: await codice,
      redirect_uri: redirect,
      grant_type: 'authorization_code',
      code_verifier: verifica
    })
  } finally {
    chiudi()
  }
}

/**
 * Un token d'accesso vivo, tenuto in memoria e non su disco.
 *
 * Ogni connettore ne vuole uno e ognuno lo scriveva a modo suo. La differenza
 * che conta è il margine: si rinnova un minuto *prima* della scadenza, perché
 * un token che scade mentre è in volo dà un 401 in mezzo a una lettura, e quel
 * 401 assomiglia in tutto a «ricollega l'account» — cioè al messaggio
 * sbagliato, dato a chi non ha fatto niente di male.
 */
/*
 * Per persona, non per processo.
 *
 * Con più conti sullo stesso server il giro di sfondo li legge uno dopo
 * l'altro, e un token tenuto in una variabile sola sopravviveva al cambio di
 * persona: `rinnova()` controllava che *questa* avesse un refresh token, poi
 * restituiva il token d'accesso di quella prima — e la casella di A finiva
 * nell'indice di B, con le proposte di B che archiviavano la posta di A. Qui
 * la chiave è chi sta chiedendo, e fuori da una richiesta è la stringa vuota.
 */
export class Vivo {
  private vivi = new Map<string, { token: string; scade: number }>()
  private rinnova: () => Promise<Gettoni>

  // il campo si dichiara e si assegna a mano, invece che con la scorciatoia
  // `constructor(private rinnova…)`: node esegue questo TypeScript togliendo i
  // tipi e basta, e quella scorciatoia è l'unica cosa che *genera* codice
  constructor(rinnova: () => Promise<Gettoni>) {
    this.rinnova = rinnova
  }

  async dammi(): Promise<string> {
    const di = chi.adesso() ?? ''
    const v = this.vivi.get(di)
    if (v && v.scade > Date.now() + 60_000) return v.token
    const g = await this.rinnova()
    const nuovo = { token: g.access_token, scade: Date.now() + Number(g.expires_in ?? 3600) * 1000 }
    this.vivi.set(di, nuovo)
    return nuovo.token
  }

  /** Da usare quando si scollega, e nei test: dimentica quello di chi sta chiedendo. */
  scorda() { this.vivi.delete(chi.adesso() ?? '') }
}
