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
 * error codes» e «Unexpected consent prompt»:
 *
 *   · 65001: nessuno ha dato il consenso a questa app per questi permessi;
 *   · 90094: un amministratore ha messo un criterio che impedisce di darlo
 *     da soli («Need admin approval»). Dal 2026 è il caso normale: con le
 *     impostazioni di serie una persona non può acconsentire da sola a
 *     Mail.Read e Calendars.Read;
 *   · 90095: c'è il flusso d'approvazione («Approval required», «Request
 *     approval»);
 *   · 50105: la persona non è assegnata all'app;
 *   · 53003 e 530035: accesso condizionale, o le impostazioni di sicurezza di
 *     serie del tenant.
 *
 * 65004 («User declined to consent») no: vuol dire anche «ha detto di no», e
 * a volte «ha chiesto l'approvazione ed è tornato indietro». Resta un no suo.
 */
const ENTRA_AMMINISTRATORE = /AADSTS(65001|90094|90095|50105|53003|530035)\b/

export function daMicrosoft(errore: string | null, descrizione: string | null, app?: { clientId: string; tenant?: string; dominio?: string }): CasoAmministratore | null {
  const e = (errore ?? '').toLowerCase()
  const suo = ENTRA_AMMINISTRATORE.test(descrizione ?? '') || e === 'consent_required' || e === 'admin_consent_required'
  if (!suo) return null
  return {
    servizio: 'microsoft-oauth',
    ...(app?.dominio ? { dominio: app.dominio } : {}),
    ...(app?.clientId ? { app: app.clientId, consenso: consensoMicrosoft(app.clientId, app.tenant || app.dominio) } : {})
  }
}

/**
 * L'indirizzo del consenso per tutta l'organizzazione, da mandare a chi amministra.
 *
 * È la forma che Microsoft stessa dà da incollare a un amministratore
 * (learn.microsoft.com, «Grant tenant-wide admin consent to an application»):
 * `…/{organizzazione}/adminconsent?client_id=…`, dove l'organizzazione è l'ID
 * del tenant o un suo dominio verificato. Senza né l'uno né l'altro si usa
 * `common`: l'amministratore, aprendolo, entra nel suo.
 */
export function consensoMicrosoft(clientId: string, tenant = ''): string {
  const t = tenant.trim()
  const dove = t && t !== 'common' && t !== 'organizations' ? t : 'common'
  return `https://login.microsoftonline.com/${encodeURIComponent(dove)}/adminconsent?client_id=${encodeURIComponent(clientId)}`
}

/**
 * Il no di Google quando l'app la deve approvare l'amministratore.
 *
 * `admin_policy_enforced` («Access blocked: Authorization Error»),
 * `org_internal` e `access_not_configured` (support.google.com/accounts,
 * answer 16668185). Google di solito li mostra sulla sua pagina e non torna
 * indietro; ma quando torna, torna così, e allora si dice.
 */
export function daGoogle(errore: string | null, descrizione: string | null, app?: { clientId?: string; dominio?: string }): CasoAmministratore | null {
  const e = (errore ?? '').toLowerCase()
  const codici = /^(admin_policy_enforced|org_internal|access_not_configured)$/
  if (codici.test(e) || /admin_policy_enforced|org_internal/i.test(descrizione ?? '')) {
    return {
      servizio: 'google-oauth',
      ...(app?.dominio ? { dominio: app.dominio } : {}),
      ...(app?.clientId ? { app: app.clientId } : {})
    }
  }
  return null
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

/** Il caso dentro un errore qualunque, se c'è. */
export function casoDi(e: unknown): CasoAmministratore | null {
  return e instanceof DaApprovare ? e.caso : null
}

/** Le frasi che accompagnano il caso, per chi legge solo la riga. */
export const APPROVA_GOOGLE = 'La tua azienda deve approvare Myynd su Google prima che tu possa collegarlo.'
export const APPROVA_MICROSOFT = 'La tua azienda deve approvare Myynd su Microsoft prima che tu possa collegarlo.'
export const IMAP_SPENTO = 'La tua azienda non permette ad altre app di leggere la posta di Gmail. Può permetterlo il tuo amministratore.'
