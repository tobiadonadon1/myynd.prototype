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
//     risponde solo la strada di ritorno (la radice, o `/callback` per chi la
//     vuole), e tutto il resto prende un 404 e viene ignorato.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import * as chi from '../chi.ts'
import { oauthWeb } from '../ospitato.ts'
import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { DaApprovare, fraseDelCaso, SOLO_ORGANIZZAZIONE, soloOrganizzazione, type CasoAmministratore } from './amministratore.ts'

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
    // nelle due lingue, come `paginaWeb`: qui non si sa ancora quale
    `<div style="line-height:1.6;padding:0 24px">${bene
      ? 'Fatto. Puoi chiudere questa pagina e tornare su Myynd.<br><span style="opacity:.6">Done. You can close this page and go back to Myynd.</span>'
      : `Non è andata con ${nome}. Torna su Myynd e riprova.<br><span style="opacity:.6">It didn't work with ${nome}. Go back to Myynd and try again.</span>`}</div>`
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
function ascolta(atteso: string, nome: string, approvazione?: Sportello['approvazione'], opz: {
  percorso?: string; durata?: number; ancheIPv6?: boolean
  /** La porta da provare prima di lasciarla scegliere al sistema: quella di un ritorno già registrato. */
  porta?: number
} = {}): Promise<{
  porta: number; codice: Promise<string>; chiudi: () => void
}> {
  const percorso = opz.percorso || '/'
  return new Promise((pronto, male) => {
    let dai: (c: string) => void
    let no: (e: Error) => void
    const codice = new Promise<string>((a, b) => { dai = a; no = b })
    // chi ha smesso di aspettare — un browser che non si è aperto, un
    // «Annulla» — non deve lasciare dietro un rifiuto che nessuno raccoglie
    codice.catch(() => {})

    const risponde = (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => {
      const u = new URL(req.url ?? '/', 'http://127.0.0.1')
      // solo la strada di ritorno: la favicon e qualunque altra bussata non
      // sono la risposta che stiamo aspettando, e non devono poterla rovinare
      if (u.pathname !== percorso) { res.writeHead(404); res.end(); return }

      const c = u.searchParams.get('code')
      const stato = u.searchParams.get('state') ?? ''
      const errore = u.searchParams.get('error')

      /*
       * Solo chi porta lo `state` giusto conta, anche per dire di no.
       *
       * Sulla porta può bussare qualunque cosa giri su questa macchina: una
       * pagina in un'altra scheda, un programma. Prima bastava bussare senza
       * niente, o con `?error=access_denied`, per far saltare un accesso a
       * metà — e la persona tornava dal browser con il sì dato e si sentiva
       * dire che aveva detto di no. Adesso chi non ha lo `state` riceve un 400
       * e il collegamento resta in attesa del ritorno vero. Un fornitore che
       * dice di no lo rimanda (RFC 6749, §4.1.2.1), quindi il no vero conta.
       */
      if (!uguali(stato, atteso)) {
        res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' })
        res.end(pagina(false, nome))
        return
      }
      res.writeHead(c ? 200 : 400, { 'content-type': 'text/html; charset=utf-8' })
      res.end(pagina(!!c, nome))
      if (c) dai(c)
      else no(noDelRitorno(nome, errore, u.searchParams.get('error_description'), approvazione))
    }
    const s = createServer(risponde)
    // la porta non tiene in vita il processo da sola: un accesso lasciato a metà scade col suo tempo
    s.unref()
    let s6: ReturnType<typeof createServer> | null = null

    // la porta chiesta, se c'è e se è libera; altrimenti la sceglie il sistema
    let ripiegato = !opz.porta
    s.on('error', (e: NodeJS.ErrnoException) => {
      if (!ripiegato && e.code === 'EADDRINUSE') { ripiegato = true; s.listen(0, '127.0.0.1'); return }
      male(e)
    })
    s.on('listening', () => {
      const porta = (s.address() as { port: number }).port
      /*
       * `localhost` nell'indirizzo di ritorno, per chi lo vuole così: il
       * browser può provare prima ::1, e trovarlo chiuso. Di solito ripiega da
       * solo su 127.0.0.1; la stessa porta aperta anche su ::1 toglie il «di
       * solito». Se ::1 non c'è o la porta è presa, si resta come prima.
       */
      if (opz.ancheIPv6) {
        s6 = createServer(risponde)
        s6.unref()
        s6.on('error', () => { s6 = null })
        s6.listen(porta, '::1')
      }
      const chiudi = () => {
        try { s.close() } catch { /* già chiusa */ }
        try { s6?.close() } catch { /* già chiusa */ }
        // chi chiude prima del ritorno smette di aspettarlo: dopo, non cambia niente
        no(new Error('Accesso annullato.'))
      }
      // prima la ragione vera, poi la chiusura: una promessa si rifiuta una volta sola
      setTimeout(() => { no(new Error(`Nessuna risposta da ${nome}: riprova.`)); chiudi() }, opz.durata ?? 120_000).unref()
      pronto({ porta, codice, chiudi })
    })
    s.listen(opz.porta ?? 0, '127.0.0.1')
  })
}

/**
 * Il no che torna dal browser, detto per quello che è.
 *
 * Prima di «hai detto di no» si guarda se a dire di no è stata l'azienda:
 * Microsoft rimanda `error=access_denied` anche quando è l'amministratore ad
 * aver chiuso la porta (AADSTS90094), e dire a qualcuno che ha rifiutato lui
 * quando non ha potuto nemmeno scegliere è la frase più sbagliata possibile.
 */
function noDelRitorno(nome: string, errore: string | null, descrizione: string | null, approvazione?: Sportello['approvazione']): Error {
  const caso = approvazione?.(errore, descrizione) ?? null
  if (caso) return new DaApprovare(fraseDelCaso(caso, nome), caso)
  // Google: l'app è interna a un'altra organizzazione, e l'amministratore di
  // chi collega non può farci niente
  if (soloOrganizzazione(errore)) return new Error(SOLO_ORGANIZZAZIONE)
  if (errore === 'access_denied') return new Error(`Hai detto di no a ${nome}.`)
  return new Error(`${nome} non ha mandato il codice.`)
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
  /**
   * Il no dell'amministratore, riconosciuto dal codice che il servizio manda
   * (`error`, `error_description`): nel ritorno dal browser e nello scambio
   * del codice. Vedi `amministratore.ts`.
   */
  approvazione?: (errore: string | null, descrizione: string | null) => CasoAmministratore | null
  /**
   * Ospitati, il consenso si fa in un'altra scheda e la pagina di Myynd resta
   * dov'era, a seguire il collegamento: la pagina del ritorno dice di chiudere
   * quella scheda invece di riportarci dentro una seconda copia di Myynd.
   */
  scheda?: boolean
  /**
   * Il ritorno via web è andato storto prima di `dopo` (un no, un codice
   * rifiutato, troppo tempo): chi segue il collegamento da un'altra scheda lo
   * sa da qui, invece di aspettare fino allo scadere.
   */
  fallito?: (e: unknown) => void
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
    const caso = s.approvazione?.(typeof j.error === 'string' ? j.error : null, typeof j.error_description === 'string' ? j.error_description : null) ?? null
    if (caso) throw new DaApprovare(fraseDelCaso(caso, s.nome), caso)
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
  const l = await avviaLocale(s.nome, () => s)
  try {
    await apriIlBrowser(l.dove)
    return await l.gettoni
  } finally {
    l.chiudi()
  }
}

export type Locale = {
  /** L'indirizzo a cui mandare la persona: lo apre chi chiama, non questo modulo. */
  dove: string
  /** L'indirizzo di ritorno, com'è scritto nella richiesta. */
  redirect: string
  /** I token, quando il browser torna con il codice. */
  gettoni: Promise<Gettoni>
  /** Smette di aspettare: chiude la porta, e `gettoni` si rifiuta se non era già arrivato. */
  chiudi: () => void
}

/**
 * Lo stesso ballo di `consenso`, in due tempi: prima l'indirizzo, poi i token.
 *
 * Serve a chi non può aprire il browser da qui. Dentro l'app lo apre il
 * guscio, fuori lo apre la pagina, e in tutti e due i casi l'indirizzo deve
 * arrivare a chi lo apre prima che il codice torni. `consenso` è questo più
 * `apriIlBrowser`, e resta com'era per chi lo usa.
 *
 * `sportelloPer` riceve l'indirizzo di ritorno perché c'è chi deve saperlo
 * prima di poter scrivere il proprio sportello: un server MCP registra l'app
 * (DCR) con quell'indirizzo dentro, e la porta si conosce solo adesso.
 */
export async function avviaLocale(
  nome: string,
  sportelloPer: (redirect: string) => Sportello | Promise<Sportello>,
  opz: { ospite?: '127.0.0.1' | 'localhost'; percorso?: string; durata?: number; porta?: number } = {}
): Promise<Locale> {
  const { verifica, sfida } = pkce()
  const stato = randomBytes(24).toString('base64url')
  let s: Sportello | null = null
  const { porta, codice, chiudi } = await ascolta(stato, nome, (e, d) => s?.approvazione?.(e, d) ?? null, {
    percorso: opz.percorso, durata: opz.durata, ancheIPv6: opz.ospite === 'localhost', porta: opz.porta
  })
  const redirect = `http://${opz.ospite ?? '127.0.0.1'}:${porta}${opz.percorso ?? ''}`
  try { s = await sportelloPer(redirect) } catch (e) { chiudi(); throw e }
  const sportello = s
  const gettoni = codice.then(code => chiediGettoni(sportello, {
    code,
    redirect_uri: redirect,
    grant_type: 'authorization_code',
    code_verifier: verifica
  }))
  gettoni.catch(() => {})
  return { dove: sportello.autorizza({ redirect, sfida, stato }), redirect, gettoni, chiudi }
}

// — ospitati: il ritorno passa dal nostro dominio, non da 127.0.0.1 —

type Sospeso = {
  utente: string | null
  sportello: Sportello
  verifica: string
  scade: number
  /** Cosa fare dei token: lo decide il connettore, dentro il contesto della persona. */
  dopo: (g: Gettoni) => Promise<void>
}

/**
 * I consensi avviati e non ancora tornati, per `state`.
 *
 * È una mappa del processo, e va bene così: la chiave è un segreto di 24 byte
 * che conosce solo il browser che l'ha ricevuto, e dentro c'è scritto *di chi*
 * è il consenso — così il ritorno, che arriva da Google senza nessun token
 * nostro, sa in quale conto scrivere. Dieci minuti, poi si butta.
 */
const sospesi = new Map<string, Sospeso>()

/**
 * Primo tempo, via web: l'indirizzo a cui mandare la persona.
 *
 * Il browser è il *suo*, non quello del server, quindi non si apre niente da
 * qui: si torna l'indirizzo e il client ci va. Il ritorno bussa a
 * `/api/oauth/ritorno` con lo `state`, e da lì si finisce.
 */
/**
 * Il biglietto: la prova che il browser che torna è quello che è partito.
 *
 * Lo `state` dice *di chi* è il consenso, ma viaggia nell'indirizzo: chi
 * avvia il ballo può passare quell'indirizzo a un'altra persona, che dà il
 * suo consenso a Google e viene rimandata qui — e il suo token finiva nel
 * conto di chi aveva avviato. Il biglietto sta in un cookie che il browser
 * di partenza riceve con l'indirizzo e riporta al ritorno; chi torna con lo
 * `state` di un altro non ce l'ha.
 */
export function biglietto(stato: string): string {
  return createHash('sha256').update(stato).digest('hex')
}

export function avviaWeb(s: Sportello, dopo: (g: Gettoni) => Promise<void>): { dove: string; biglietto: string } {
  const redirect = oauthWeb().ritorno
  if (!redirect) throw new Error('Il server non conosce il proprio dominio: chi lo ospita deve impostare MYYND_PUBBLICO.')
  const { verifica, sfida } = pkce()
  const stato = randomBytes(24).toString('base64url')
  const ora = Date.now()
  for (const [k, v] of sospesi) if (v.scade < ora) sospesi.delete(k)
  sospesi.set(stato, { utente: chi.adesso(), sportello: s, verifica, scade: ora + 10 * 60_000, dopo })
  return { dove: s.autorizza({ redirect, sfida, stato }), biglietto: biglietto(stato) }
}

/**
 * Secondo tempo: il codice è tornato. Lancia con una frase da mostrare.
 *
 * Torna anche di chi era il collegamento (`utente`): questa richiesta arriva
 * dal browser senza sessione, e chi la serve deve poter dire il fatto alle
 * finestre di quella persona (e alle sue righe ferme sulla posta, P3).
 */
export async function completaWeb(stato: string, codice: string | null, errore: string | null, portato = '', descrizione: string | null = null): Promise<{ nome: string; scheda: boolean; utente: string | null }> {
  const s = sospesi.get(stato)
  if (!s) throw new Error('Questo collegamento non lo stavo aspettando, o è passato troppo tempo: riprova da Myynd.')
  const atteso = Buffer.from(biglietto(stato)), avuto = Buffer.from(portato)
  if (atteso.length !== avuto.length || !timingSafeEqual(atteso, avuto)) {
    throw new Error('Questo collegamento è partito da un altro browser: riprova da Myynd, dallo stesso.')
  }
  sospesi.delete(stato)
  let g: Gettoni
  try {
    if (s.scade < Date.now()) throw new Error(`Nessuna risposta da ${s.sportello.nome} in tempo: riprova.`)
    if (!codice) throw noDelRitorno(s.sportello.nome, errore, descrizione, s.sportello.approvazione)
    g = await chiediGettoni(s.sportello, {
      code: codice,
      redirect_uri: oauthWeb().ritorno!,
      grant_type: 'authorization_code',
      code_verifier: s.verifica
    })
  } catch (e) {
    const avvisa = () => s.sportello.fallito?.(e)
    if (s.utente) chi.dentro(s.utente, avvisa)
    else avvisa()
    throw e
  }
  const salva = () => s.dopo(g)
  await (s.utente ? chi.dentro(s.utente, salva) : salva())
  return { nome: s.sportello.nome, scheda: !!s.sportello.scheda, utente: s.utente ?? null }
}

/** La pagina che vede chi torna da Google o Microsoft. Nelle due lingue: qui non si sa ancora quale. */
/** Il testo che finisce dentro l'HTML non deve poterlo cambiare. */
function senzaTag(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

/**
 * La pagina che vede l'amministratore dopo il consenso per tutta l'organizzazione.
 *
 * Il link della richiesta (`consensoMicrosoft`) lo apre lui, non chi collega:
 * al ritorno non c'è nessuno `state` da ritrovare e nessun token da salvare,
 * e mostrargli «questo collegamento non lo stavo aspettando» sarebbe dirgli
 * che ha sbagliato qualcosa proprio quando ha fatto la cosa giusta.
 */
export function paginaConsenso(bene: boolean): string {
  const testo = bene
    ? '<b>Fatto.</b> Myynd è approvato per la tua organizzazione: chi te l’ha chiesto ora può collegarsi.<br><span style="opacity:.6">Done. Myynd is approved for your organization: whoever asked you can now connect.</span>'
    : '<b>Il consenso non è stato dato.</b><br><span style="opacity:.6">Consent was not granted.</span>'
  return '<!doctype html><meta charset="utf-8"><title>Myynd</title>' +
    '<body style="font:16px -apple-system,Helvetica,sans-serif;background:#191715;color:#F4EFE8;' +
    'display:grid;place-items:center;height:100vh;margin:0;text-align:center;padding:0 24px">' +
    `<div style="max-width:420px;line-height:1.6;overflow-wrap:anywhere">${testo}</div>`
}

export function paginaWeb(bene: boolean, nomeGrezzo: string, messaggioGrezzo = '', scheda = false): string {
  const nome = senzaTag(nomeGrezzo)
  const messaggio = senzaTag(messaggioGrezzo)
  const testo = bene
    ? scheda
      ? `<b>Fatto.</b> Puoi chiudere questa scheda e tornare su Myynd.<br><span style="opacity:.6">Done. You can close this tab and go back to Myynd.</span>`
      : `<b>Fatto.</b> ${nome} è collegato. Torno su Myynd…<br><span style="opacity:.6">Done. ${nome} is connected. Taking you back to Myynd…</span>`
    : `<b>Non è andata.</b> ${messaggio}<br><span style="opacity:.6">It didn't work. Go back to Myynd and try again.</span>`
  return '<!doctype html><meta charset="utf-8"><title>Myynd</title>' +
    (bene && !scheda ? '<meta http-equiv="refresh" content="2;url=/?torno=connetti">' : '') +
    '<body style="font:16px -apple-system,Helvetica,sans-serif;background:#191715;color:#F4EFE8;' +
    'display:grid;place-items:center;height:100vh;margin:0;text-align:center;padding:0 24px">' +
    `<div style="max-width:420px;line-height:1.6;overflow-wrap:anywhere">${testo}<br><br>` +
    '<a href="/?torno=connetti" style="color:#E8A87C">Myynd</a></div>'
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
  private chiave: () => string

  // i campi si dichiarano e si assegnano a mano, invece che con la scorciatoia
  // `constructor(private rinnova…)`: node esegue questo TypeScript togliendo i
  // tipi e basta, e quella scorciatoia è l'unica cosa che *genera* codice
  /**
   * `chiave` dice di chi è il token: di serie la persona. Chi può cambiare
   * app registrata mentre un rinnovo è in volo (Granola, rifacendo l'accesso)
   * ci mette anche quella: il token della registrazione di prima finisce sotto
   * la chiave di prima, e non viene più dato a nessuno.
   */
  constructor(rinnova: () => Promise<Gettoni>, opz: { chiave?: () => string } = {}) {
    this.rinnova = rinnova
    this.chiave = opz.chiave ?? (() => chi.adesso() ?? '')
  }

  async dammi(): Promise<string> {
    const di = this.chiave()
    const v = this.vivi.get(di)
    if (v && v.scade > Date.now() + 60_000) return v.token
    const g = await this.rinnova()
    const nuovo = { token: g.access_token, scade: Date.now() + Number(g.expires_in ?? 3600) * 1000 }
    this.vivi.set(di, nuovo)
    return nuovo.token
  }

  /** Da usare quando si scollega, e nei test: dimentica quello di chi sta chiedendo. */
  scorda() { this.vivi.delete(this.chiave()) }
}
