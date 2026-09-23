// Il no che non è suo: quando a dire di no è l'amministratore dell'azienda.
//
// In un'azienda con Google Workspace o Microsoft 365 le stesse strade che una
// persona da sola percorre in due minuti — IMAP con una password per le app,
// l'indirizzo segreto dell'agenda, il consenso a un'app — possono essere
// chiuse da chi amministra il dominio. E il server che le rifiuta lo dice a
// modo suo, in una riga che somiglia moltissimo a «password sbagliata».
//
// Confonderle costa caro in tutti e due i versi. Dire «password sbagliata» a
// chi ha la password giusta lo manda a rifarla tre volte, e poi a pensare che
// Myynd non funzioni; dire «chiedi al tuo amministratore» a chi ha solo
// sbagliato una lettera lo manda a disturbare qualcuno per niente. Quindi qui
// si riconosce solo quello che il servizio dice *esplicitamente* — una frase,
// un codice — e tutto il resto resta com'era. Dove il servizio risponde
// uguale ai due casi (l'indirizzo segreto di un'agenda che dà 404, un token
// GitHub d'organizzazione che non vede niente) il caso esce con `forse`, e la
// scheda lo dice come una delle due spiegazioni, non come la sola.
//
// Quello che esce non è una frase ma un caso: la scheda ne fa una riga e una
// richiesta già scritta, nella lingua di chi la manda (`src/amministratore.ts`).
// Questo file non importa niente di Node: la scheda ne prende il tipo.

export type ServizioAmministrato =
  /**
   * Gmail di Workspace: IMAP spento per il dominio, o ristretto ai soli
   * programmi OAuth, o la verifica in due passaggi (e con lei le password per
   * le app) non permessa. La correzione sta in due pagine della stessa
   * console, e la richiesta le nomina tutte e due.
   */
  | 'gmail'
  /** L'indirizzo segreto dell'agenda non c'è: la condivisione esterna è chiusa (Workspace o Microsoft 365). */
  | 'calendario'
  /** Workspace: le app di terze parti vanno approvate prima (API controls). */
  | 'google-oauth'
  /** Entra ID: serve il consenso di un amministratore per i permessi chiesti. */
  | 'microsoft-oauth'
  /** Entra ID: l'app chiede l'assegnazione, e questa persona non è assegnata (AADSTS50105). */
  | 'microsoft-assegnazione'
  /** Entra ID: un criterio di accesso condizionale, o le impostazioni di sicurezza predefinite, bloccano l'accesso (AADSTS53003, 530035). */
  | 'microsoft-accesso'
  /** GitHub: l'organizzazione deve approvare il token a grana fine. */
  | 'github-org'

export type CasoAmministratore = {
  servizio: ServizioAmministrato
  /** Il dominio dell'azienda, se si sa: dice all'amministratore di quale si parla. */
  dominio?: string
  /** L'ID dell'app da approvare, quando c'è: l'amministratore la cerca per quello. */
  app?: string
  /**
   * Dove l'amministratore dà il consenso con un clic, quando esiste.
   *
   * Solo Microsoft ce l'ha: un indirizzo che apre la schermata del consenso
   * per tutta l'organizzazione. Si mette nella richiesta così com'è, perché
   * è la cosa che gli fa risparmiare dieci minuti di menu.
   */
  consenso?: string
  /**
   * Non è certo che sia l'amministratore: è una delle due spiegazioni.
   *
   * Succede quando il servizio non dice niente di esplicito — GitHub, per un
   * token di un'organizzazione in attesa d'approvazione, risponde come se il
   * token non vedesse nessun repository. La scheda allora non dice «la tua
   * azienda deve approvarlo»: dice «se è di un'organizzazione», e offre la
   * richiesta come seconda strada.
   */
  forse?: boolean
}

/** Il dominio di un indirizzo, se non è uno di quelli personali. */
export function dominioAziendale(indirizzo: string): string | undefined {
  const d = indirizzo.trim().toLowerCase().split('@')[1]
  if (!d || !d.includes('.')) return undefined
  if (/^(gmail|googlemail)\.com$/.test(d)) return undefined
  if (/^(outlook|hotmail|live|msn)\.[a-z.]+$/.test(d)) return undefined
  if (/^(icloud|me|mac)\.com$/.test(d) || /^yahoo\./.test(d)) return undefined
  return d
}

// — la posta, via IMAP —

/**
 * Il no di Gmail quando IMAP l'ha spento l'amministratore.
 *
 * Gmail lo dice in chiaro, nella risposta al login: «[ALERT] IMAP access is
 * disabled for your domain. Please contact your domain administrator for
 * questions about this feature. (Failure)» (help.cloudiway.com, «IMAP access
 * is disabled for your domain»; la correzione è in
 * knowledge.workspace.google.com, «Turn POP and IMAP on or off for users»).
 *
 * Non è lo stesso no di «[AUTHENTICATIONFAILED] Invalid credentials», che
 * Gmail dà a una password sbagliata, a una password per le app revocata e
 * a una revocata dall'amministratore senza distinguerle: quello resta
 * «password non accettata», perché il caso di gran lunga più comune è l'altro.
 */
export function daImap(testo: string, utente = ''): CasoAmministratore | null {
  if (/IMAP access is disabled for your domain/i.test(testo)) {
    const dominio = dominioAziendale(utente)
    return { servizio: 'gmail', ...(dominio ? { dominio } : {}) }
  }
  return null
}

// — il consenso OAuth —

/**
 * I codici di Entra ID che vogliono dire «da solo non puoi».
 *
 * Da learn.microsoft.com, «Microsoft Entra authentication and authorization
 * error codes» e «Unexpected consent prompt». Sono tre no diversi, e ognuno
 * chiede all'amministratore una cosa diversa: per questo sono tre casi, non
 * uno con dentro sempre il link del consenso, che per due su tre non serve.
 *
 *   · consenso (65001, 90094, 90095, `consent_required`): nessuno ha
 *     approvato l'app per questi permessi, e la persona da sola non può. Dal
 *     2026 è il caso normale: con le impostazioni di serie non si acconsente
 *     da soli a Mail.Read e Calendars.Read. Si risolve con il consenso per
 *     tutta l'organizzazione;
 *   · assegnazione (50105): l'app chiede che le persone le siano assegnate, e
 *     questa non lo è. Il consenso c'è già: serve aggiungerla fra gli utenti;
 *   · accesso (53003, 530035): un criterio di accesso condizionale, o le
 *     impostazioni di sicurezza predefinite, hanno fermato l'accesso. Il
 *     perché sta nei log di accesso di Entra, e lo vede solo lui.
 *
 * 65004 («User declined to consent») no: vuol dire anche «ha detto di no», e
 * a volte «ha chiesto l'approvazione ed è tornato indietro». Resta un no suo.
 */
const ENTRA_CONSENSO = /AADSTS(65001|90094|90095)\b/
const ENTRA_ASSEGNAZIONE = /AADSTS50105\b/
const ENTRA_ACCESSO = /AADSTS(53003|530035)\b/

export type AppMicrosoft = {
  clientId: string
  tenant?: string
  /** Il dominio dell'indirizzo di chi collega, se è di un'azienda. */
  dominio?: string
  /** I permessi che l'app chiede: finiscono nel link del consenso. */
  ambiti?: readonly string[]
  /** Il ritorno registrato per l'app: `http://localhost` in casa, il nostro dominio ospitati. */
  ritorno?: string
}

export function daMicrosoft(errore: string | null, descrizione: string | null, app?: AppMicrosoft): CasoAmministratore | null {
  const e = (errore ?? '').toLowerCase()
  const d = descrizione ?? ''
  const base = {
    ...(app?.dominio ? { dominio: app.dominio } : {}),
    ...(app?.clientId ? { app: app.clientId } : {})
  }
  if (ENTRA_ASSEGNAZIONE.test(d)) return { servizio: 'microsoft-assegnazione', ...base }
  if (ENTRA_ACCESSO.test(d)) return { servizio: 'microsoft-accesso', ...base }
  if (!ENTRA_CONSENSO.test(d) && e !== 'consent_required' && e !== 'admin_consent_required') return null
  return {
    servizio: 'microsoft-oauth',
    ...base,
    ...(app?.clientId ? { consenso: consensoMicrosoft(app) } : {})
  }
}

/**
 * L'indirizzo del consenso per tutta l'organizzazione, con l'endpoint v2.
 *
 * `…/{tenant}/v2.0/adminconsent?client_id=…&scope=…&redirect_uri=…`
 * (learn.microsoft.com, «Admin consent on the Microsoft identity platform»).
 * Tre regole, dalla stessa pagina:
 *
 *   · il tenant non è mai `common`: è l'ID o un dominio verificato
 *     dell'organizzazione, e senza nessuno dei due `organizations`, che fa
 *     entrare l'amministratore nel suo;
 *   · lo scope sono i permessi di Graph che l'app chiede davvero, scritti per
 *     intero; `offline_access` e gli altri di OpenID non si approvano così;
 *   · il ritorno deve essere uno di quelli registrati per l'app.
 */
export function consensoMicrosoft(app: AppMicrosoft): string {
  const t = (app.tenant ?? '').trim()
  const generico = !t || ['common', 'organizations', 'consumers'].includes(t.toLowerCase())
  const dove = !generico ? t : (app.dominio || 'organizations')
  const graph = (app.ambiti ?? ['User.Read'])
    .filter(a => !['offline_access', 'openid', 'profile', 'email'].includes(a))
    .map(a => a.startsWith('https://') ? a : `https://graph.microsoft.com/${a}`)
  const q = new URLSearchParams({
    client_id: app.clientId,
    scope: graph.join(' '),
    redirect_uri: app.ritorno || 'http://localhost'
  })
  return `https://login.microsoftonline.com/${encodeURIComponent(dove)}/v2.0/adminconsent?${q.toString()}`
}

/**
 * Il no di Google quando l'app la deve approvare l'amministratore.
 *
 * `admin_policy_enforced` («Access blocked: Authorization Error») e
 * `access_not_configured` (support.google.com/accounts, answer 16668185).
 * Google di solito li mostra sulla sua pagina e non torna indietro; ma quando
 * torna, torna così, e allora si dice.
 *
 * `org_internal` non sta qui, anche se sembra dell'azienda: vuol dire che
 * l'app è «interna» all'organizzazione che la gestisce, e che questo account
 * non ne fa parte. L'amministratore di chi collega non può farci niente; la
 * frase giusta è `SOLO_ORGANIZZAZIONE`, sotto.
 */
export function daGoogle(errore: string | null, descrizione: string | null, app?: { clientId?: string; dominio?: string }): CasoAmministratore | null {
  const e = (errore ?? '').toLowerCase()
  if (e === 'admin_policy_enforced' || e === 'access_not_configured' || /admin_policy_enforced/i.test(descrizione ?? '')) {
    return {
      servizio: 'google-oauth',
      ...(app?.dominio ? { dominio: app.dominio } : {}),
      ...(app?.clientId ? { app: app.clientId } : {})
    }
  }
  return null
}

/** `org_internal`: l'app accetta solo gli account dell'organizzazione che la gestisce. */
export function soloOrganizzazione(errore: string | null): boolean {
  return (errore ?? '').toLowerCase() === 'org_internal'
}

/**
 * Un errore che porta con sé il caso.
 *
 * Serve dove il no nasce in fondo a una catena di chiamate — il ritorno del
 * browser, lo scambio del codice — e deve arrivare alla rotta intatto: la
 * rotta lo riconosce e lo mette accanto alla frase.
 */
export class DaApprovare extends Error {
  caso: CasoAmministratore
  constructor(messaggio: string, caso: CasoAmministratore) {
    super(messaggio)
    this.caso = caso
  }
}

/**
 * La riga che accompagna il caso, per chi legge solo la riga.
 *
 * Per il consenso il nome del servizio sta nella frase (Google, Google Drive,
 * Microsoft); l'assegnazione e l'accesso bloccato esistono solo su Microsoft.
 */
export function fraseDelCaso(caso: CasoAmministratore, nome: string): string {
  if (caso.servizio === 'microsoft-assegnazione') return NON_ASSEGNATO
  if (caso.servizio === 'microsoft-accesso') return ACCESSO_BLOCCATO
  return `La tua azienda deve approvare Myynd su ${nome} prima che tu possa collegarlo.`
}

/** Il caso dentro un errore qualunque, se c'è. */
export function casoDi(e: unknown): CasoAmministratore | null {
  return e instanceof DaApprovare ? e.caso : null
}

/** Le frasi che accompagnano il caso, per chi legge solo la riga. */
export const APPROVA_GOOGLE = 'La tua azienda deve approvare Myynd su Google prima che tu possa collegarlo.'
export const APPROVA_MICROSOFT = 'La tua azienda deve approvare Myynd su Microsoft prima che tu possa collegarlo.'
export const SOLO_ORGANIZZAZIONE = 'Questa app di Google accetta solo gli account dell’organizzazione che la gestisce: accedi con un account di quell’organizzazione.'
export const NON_ASSEGNATO = 'La tua azienda deve assegnarti Myynd su Microsoft prima che tu possa collegarlo.'
export const ACCESSO_BLOCCATO = 'Un criterio di accesso della tua azienda ha bloccato Myynd su Microsoft. Il tuo amministratore può vedere perché e permetterlo.'
export const IMAP_SPENTO = 'La tua azienda non permette ad altre app di leggere la posta di Gmail. Può permetterlo il tuo amministratore.'
