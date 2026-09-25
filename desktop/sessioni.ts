// Quello che l'osservatore tiene di quello che la persona ha davanti.
//
// Il guscio sa quale app e quale finestra stanno davanti (`fronte.ts`); qui
// quegli eventi diventano sessioni — «Safari, questo titolo, dalle 9:10 alle
// 9:14» — e prima ancora passano da un filtro. Myynd stesso, i gestori di
// password e le finestre di accesso del sistema non esistono proprio: né app
// né tempo. Le finestre private dei browser, e quelle che parlano di
// password, codici e accessi, restano come app ma perdono il titolo. Tutto il
// resto, browser compresi, si tiene col suo titolo: i dati restano sul suo
// computer, e lui l'ha voluto così.
//
// Niente Electron qui dentro: è aritmetica e testo, e si prova senza aprire
// niente. Il server rifà lo stesso filtro con le stesse liste — due guardie
// sono meglio di una — e i messaggi sono quelli del contratto con lui
// (`osservatore`, `osservatore-chiedi`, `osservatore-pausa`,
// `osservatore-riprendi` da qui; `osservatore-stato` da là).

/** Sotto questo, una finestra vista di sfuggita: non è una sessione. */
export const MINIMO_SECONDI = 10
/** Una sessione aperta più lunga di così si chiude e ne riparte una uguale. */
export const TAGLIO_SECONDI = 300
/** Oltre questo senza toccare niente, la persona non c'è. */
export const INATTIVO_SECONDI = 120
/** Quante sessioni si tengono mentre il server non c'è; si perdono le più vecchie. */
export const CODA_MASSIMA = 500
export const TITOLO_MASSIMO = 160
export const APP_MASSIMA = 120
/** Quante sessioni in un messaggio al server. */
export const PER_MESSAGGIO = 200

/** Quello che dice la fonte: chi c'è davanti, e da quando (`t`, epoch ms). */
export type EventoFronte = { bundle: string; app: string; pid: number; titolo: string | null; t: number }
/** Un evento passato dal filtro. */
export type Finestra = { bundle: string; app: string; titolo: string | null }
export type Sessione = { bundle: string; app: string; titolo: string | null; inizio: string; fine: string; secondi: number }
export type StatoServer = { acceso: boolean; titoli: boolean; pausaFino: string | null }

/*
 * Le app che non si guardano mai: né il nome né il tempo.
 * Il server ne tiene una copia identica: si cambiano insieme.
 */
export const ESCLUSE_SEMPRE = new Set([
  // Myynd itself, packaged and in development
  'com.myynd.app', 'com.github.Electron',
  // password managers
  'com.1password.1password', 'com.agilebits.onepassword7', 'com.agilebits.onepassword-osx',
  'com.bitwarden.desktop', 'com.lastpass.LastPass', 'com.dashlane.Dashlane', 'com.dashlane.dashlanephonefinal',
  'org.keepassxc.keepassxc', 'com.apple.keychainaccess', 'com.apple.Passwords',
  'me.proton.pass.electron', 'com.nordpass.macos.NordPass', 'in.sinew.Enpass-Desktop',
  // sign-in and system authentication
  'com.apple.SecurityAgent', 'com.apple.LocalAuthentication.UIAgent', 'com.apple.coreauthd',
  'com.apple.loginwindow', 'com.apple.ScreenSaver.Engine', 'com.apple.CoreServicesUIAgent'
])
/** Una finestra privata del browser: l'app sì, il titolo no. */
export const TITOLO_PRIVATO = /private browsing|navigazione (privata|anonima)|in incognito|incognito|inprivate|\bprivat[ea]\b/i
/** Password, codici, accessi: l'app sì, il titolo no. */
export const TITOLO_SEGRETO = /password|passcode|passkey|one.?time|\b2fa\b|two.?factor|verification code|codice di verifica|\bcodice\b|\bverifica\b|\baccedi\b|sign in|log in|\blogin\b|\botp\b/i

const BUNDLE_VALIDO = /^[\w.-]{1,200}$/

/** I segni di direzione del testo: invisibili, e macOS li mette davanti ai nomi di certe app. */
const DIREZIONE = /[‎‏‪-‮⁦-⁩]/g
const CONTROLLO = /\p{Cc}/gu

/** Il testo ripulito ma intero: è su questo che si cercano i segni di privato e segreto. */
function pulito(s: string | null | undefined): string {
  if (typeof s !== 'string') return ''
  return s.replace(DIREZIONE, '').replace(CONTROLLO, ' ').replace(/\s+/g, ' ').trim()
}

/** I primi `n` caratteri veri (non mezze coppie di surrogati). */
function taglia(s: string, n: number): string {
  const c = Array.from(s)
  return c.length > n ? c.slice(0, n).join('').trimEnd() : s
}

/** Via i caratteri di controllo e di direzione, spazi compattati, al massimo 160 caratteri. Vuoto è `null`. */
export function pulisciTitolo(s: string | null | undefined): string | null {
  const p = taglia(pulito(s), TITOLO_MASSIMO)
  return p ? p : null
}

/**
 * Il filtro. `null` vuol dire che quella finestra non esiste per Myynd:
 * nemmeno il tempo passato lì si conta. Altrimenti l'app resta, e il titolo
 * solo se si guardano i titoli e non ha niente di privato o di segreto.
 */
export function filtra(e: EventoFronte, o: { titoli: boolean; mioPid: number }): Finestra | null {
  if (!e || typeof e.bundle !== 'string' || !BUNDLE_VALIDO.test(e.bundle)) return null
  if (ESCLUSE_SEMPRE.has(e.bundle)) return null
  if (e.pid === o.mioPid) return null
  const app = taglia(pulito(e.app), APP_MASSIMA) || e.bundle
  let titolo: string | null = null
  if (o.titoli) {
    const intero = pulito(e.titolo)
    if (intero && !TITOLO_PRIVATO.test(intero) && !TITOLO_SEGRETO.test(intero)) titolo = pulisciTitolo(intero)
  }
  return { bundle: e.bundle, app, titolo }
}

/* ---------------------------------------------------------------- sessioni */

export type Costruttore = {
  /**
   * Una finestra davanti da `t`: se è la stessa di adesso non cambia niente.
   * Un titolo nuovo nella stessa app chiude la sessione, ma solo se il titolo
   * di prima è rimasto davanti almeno dieci secondi: altrimenti quel tempo va
   * col titolo nuovo, e l'app non lo perde (un terminale che cambia titolo a
   * ogni comando, due schede alternate mentre si copia).
   */
  evento(f: Finestra, t: number): void
  /** Chiude quella aperta a `t` (inattività, schermo bloccato, sonno, pausa, uscita). */
  ferma(t: number): void
  /** Riapre sull'ultima finestra nota, a `t` (di ritorno dall'inattività, dal blocco, dal sonno). */
  riprendi(f: Finestra | null, t: number): void
  /** Una sessione aperta da più di cinque minuti si chiude e ne riparte una uguale. */
  taglia(t: number): void
  /** Le sessioni chiuse, tolte dal costruttore. Quelle sotto i dieci secondi non ci sono. */
  chiusi(): Sessione[]
  /** Quella aperta adesso, per chi deve saperlo. */
  aperta(): { finestra: Finestra; inizio: number } | null
}

export function creaCostruttore(): Costruttore {
  // `inizio` è l'inizio della sessione; `titoloDal` da quando c'è davanti il
  // titolo di adesso (più tardi di `inizio` quando un titolo breve si è unito).
  let aperta: { finestra: Finestra; inizio: number; titoloDal: number } | null = null
  let fatte: Sessione[] = []

  const chiudi = (t: number) => {
    if (!aperta) return
    const { finestra, inizio } = aperta
    aperta = null
    // un orologio che torna indietro non fa sessioni negative
    const fine = Math.max(t, inizio)
    if (fine - inizio < MINIMO_SECONDI * 1000) return
    fatte.push({
      bundle: finestra.bundle, app: finestra.app, titolo: finestra.titolo,
      inizio: new Date(inizio).toISOString(), fine: new Date(fine).toISOString(),
      secondi: Math.round((fine - inizio) / 1000)
    })
  }
  const apri = (f: Finestra, t: number, inizio = t) => {
    aperta = { finestra: { bundle: f.bundle, app: f.app, titolo: f.titolo }, inizio, titoloDal: t }
  }

  return {
    evento(f, t) {
      if (aperta && aperta.finestra.bundle === f.bundle) {
        if (aperta.finestra.titolo === f.titolo) return
        // il titolo di prima è durato meno di dieci secondi: la sessione
        // continua col titolo nuovo, dallo stesso inizio
        if (t - aperta.titoloDal < MINIMO_SECONDI * 1000) { apri(f, t, aperta.inizio); return }
      }
      chiudi(t)
      apri(f, t)
    },
    ferma(t) {
      chiudi(t)
    },
    riprendi(f, t) {
      if (!f || aperta) return
      apri(f, t)
    },
    taglia(t) {
      if (!aperta || t - aperta.inizio < TAGLIO_SECONDI * 1000) return
      const f = aperta.finestra
      chiudi(t)
      apri(f, t)
    },
    chiusi() {
      const via = fatte
      fatte = []
      return via
    },
    aperta() {
      return aperta ? { finestra: { ...aperta.finestra }, inizio: aperta.inizio } : null
    }
  }
}

/* ------------------------------------------------------------------- coda */

export type Coda = {
  /** In fondo; se non ci stanno, si perdono le più vecchie. */
  metti(s: Sessione[]): void
  /** Davanti, in ordine: quelle che non sono partite tornano al loro posto. */
  rimetti(s: Sessione[]): void
  /** Le prime `massimo` (tutte, senza), tolte dalla coda. */
  prendi(massimo?: number): Sessione[]
  quante(): number
}

export function creaCoda(massimo = CODA_MASSIMA): Coda {
  let voci: Sessione[] = []
  const pota = () => { if (voci.length > massimo) voci = voci.slice(voci.length - massimo) }
  return {
    metti(s) { if (s.length) { voci = voci.concat(s); pota() } },
    rimetti(s) { if (s.length) { voci = s.concat(voci); pota() } },
    prendi(n) {
      const quante = n === undefined ? voci.length : Math.max(0, Math.floor(n))
      const via = voci.slice(0, quante)
      voci = voci.slice(quante)
      return via
    },
    quante() { return voci.length }
  }
}

/* -------------------------------------------------------------- messaggi */

export function messaggioSessioni(s: Sessione[]): { tipo: 'osservatore'; sessioni: Sessione[] } {
  return { tipo: 'osservatore', sessioni: s }
}

export const CHIEDI = Object.freeze({ tipo: 'osservatore-chiedi' as const })
export const RIPRENDI = Object.freeze({ tipo: 'osservatore-riprendi' as const })

/** Da uno a 480 minuti, interi: il menu manda 60. */
export function minutiPausa(minuti: unknown): number {
  const n = typeof minuti === 'number' && Number.isFinite(minuti) ? Math.round(minuti) : 60
  return Math.min(480, Math.max(1, n))
}

export function messaggioPausa(minuti: number): { tipo: 'osservatore-pausa'; minuti: number } {
  return { tipo: 'osservatore-pausa', minuti: minutiPausa(minuti) }
}

/** Il solo messaggio che il server manda al guscio per l'osservatore. Tutto il resto è `null`. */
export function leggiStato(m: unknown): StatoServer | null {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null
  const { tipo, acceso, titoli, pausaFino } = m as Record<string, unknown>
  if (tipo !== 'osservatore-stato') return null
  if (typeof acceso !== 'boolean' || typeof titoli !== 'boolean') return null
  if (pausaFino !== null && (typeof pausaFino !== 'string' || !Number.isFinite(Date.parse(pausaFino)))) return null
  return { acceso, titoli, pausaFino }
}

/** In pausa adesso? L'istante è assoluto: ciascuno lo confronta col suo orologio. */
export function inPausa(pausaFino: string | null, adesso: number): boolean {
  return pausaFino !== null && Date.parse(pausaFino) > adesso
}
