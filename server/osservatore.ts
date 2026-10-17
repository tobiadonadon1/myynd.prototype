// L'osservatore, dalla parte del server: chi lo possiede su questo Mac, cosa
// gli arriva dal guscio, e cosa resta scritto.
//
// Il guscio (desktop/osservatore.ts, P1A) guarda le app che ha davanti e ogni
// tanto manda un mazzo di sessioni su `parentPort`. Qui si decide tre cose:
//   · **di chi sono**: su un Mac con più conti l'osservatore appartiene al
//     conto che l'ha acceso, scritto in `RADICE/osservatore.json`. Gli altri
//     vedono «lo usa un altro account» e non ricevono niente.
//   · **cosa si tiene**: il guscio filtra già i titoli privati, i gestori di
//     password e Myynd stesso, e qui si filtra di nuovo con le stesse liste:
//     una riga che arriva da fuori non si crede sulla parola.
//   · **come si scrive**: una sessione a cavallo della mezzanotte diventa due
//     righe, ogni riga sa il suo progetto (dal titolo) e la sua cartella di
//     lavoro (dal nome della cartella nel titolo).
//
// Niente di quello che passa di qui arriva mai a un modello: le righe servono
// ad `abitudini.ts` per contare, e a `osservazioni.ts`, che ne fa gli episodi
// del giorno sul Mac. Al modello va solo il diario corto (`diario.ts`).
//
// Dal 17 ottobre la linea delle app davanti è accesa di serie (non chiede
// permessi al Mac): il Mac è di chi lo usa, cioè dell'unico conto o di chi
// ha aperto la finestra per ultimo, finché qualcuno non la spegne. I titoli
// restano legati all'Accessibilità; il testo della finestra (`testi`) si
// accende solo a mano.
//
// Fuori dall'app (`!APP`) o su un server (`OSPITATO`) non esiste: le rotte
// rispondono 404 e nessuno si mette in ascolto.

import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs'
import { join, basename } from 'node:path'
import * as ospitato from './ospitato.ts'
import * as cfg from './config.ts'
import * as conti from './conti.ts'
import * as chi from './chi.ts'
import db from './store.ts'
import * as store from './store.ts'
import * as fuso from './fuso.ts'
import * as abitudini from './abitudini.ts'
import * as segnali from './segnali.ts'
import { progettoDelTesto } from './attenzione.ts'
import * as davanti from './davanti.ts'
import * as oss from './osservazioni.ts'
import { dominioEscluso, pulisciUrl } from './connettori/cronologia-browser.ts'

// — le liste, uguali carattere per carattere a desktop/sessioni.ts —

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
export const TITOLO_PRIVATO = /private browsing|navigazione (privata|anonima)|in incognito|incognito|inprivate|\bprivat[ea]\b/i
export const TITOLO_SEGRETO = /password|passcode|passkey|one.?time|\b2fa\b|two.?factor|verification code|codice di verifica|\bcodice\b|\bverifica\b|\baccedi\b|sign in|log in|\blogin\b|\botp\b/i

export type StatoOsservatore = {
  acceso: boolean; titoli: boolean; pausaFino: string | null
  /** Il testo della finestra davanti: solo se l'ha acceso lui. */
  testi: boolean
  /** Ogni quanti secondi il testo si rilegge anche senza un cambio. */
  ogni: number
  /** Le app (identificativo o nome) e i siti da non guardare mai, scelti da lui. */
  escluse: string[]
  siti: string[]
  /** Acceso di serie da Myynd e lui non ha ancora visto la riga che lo dice. */
  avviso: boolean
}
export type Sessione = { bundle: string; app: string; titolo: string | null; inizio: string; fine: string; secondi: number }

/** Al massimo tante sessioni per messaggio: oltre, il resto si butta. */
export const SESSIONI_PER_MESSAGGIO = 200
/** Una pausa dura da un minuto a otto ore. */
export const PAUSA_MAX = 480
/** La rilettura del testo della finestra: di serie ogni venti secondi, mai meno di cinque né più di dieci minuti. */
export const OGNI_TESTI = 20
export const OGNI_MIN = 5
export const OGNI_MAX = 600
/** Le esclusioni che tiene: oltre, non sono più esclusioni ma una lista nera di tutto. */
export const ESCLUSE_MAX = 100
/** Dopo tanti giorni una riga perde il titolo e diventa un totale del giorno. */
export const GIORNI_TITOLI = 30
/** Dopo tanti giorni le righe se ne vanno. */
export const GIORNI_SESSIONI = 400

const BUNDLE = /^[\w.-]{1,200}$/
const GIORNO = 86_400_000

// solo per le prove: si può fingere di essere (o non essere) dentro l'app
let forzato: { app: boolean; ospitato: boolean } | null = null

/** L'osservatore esiste solo dentro l'app, sul computer di chi la usa. */
export function disponibile(): boolean {
  if (forzato) return forzato.app && !forzato.ospitato
  return ospitato.APP && !ospitato.OSPITATO
}

// — il proprietario —

const FILE = () => join(cfg.RADICE, 'osservatore.json')

function leggiProprietario(): { utente: string; dal: string } | null {
  try {
    if (!existsSync(FILE())) return null
    const v = JSON.parse(readFileSync(FILE(), 'utf8')) as { utente?: unknown; dal?: unknown }
    if (typeof v.utente !== 'string' || !v.utente) return null
    return { utente: v.utente, dal: typeof v.dal === 'string' ? v.dal : '' }
  } catch { return null }
}

function scriviProprietario(utente: string, dal: string) {
  const tmp = `${FILE()}.tmp-${process.pid}`
  writeFileSync(tmp, JSON.stringify({ utente, dal }), { mode: 0o600 })
  renameSync(tmp, FILE())
}

function togliProprietario() {
  try { unlinkSync(FILE()) } catch { /* non c'era */ }
}

/**
 * Di chi è l'osservatore su questo Mac, o nessuno.
 *
 * Il conto si controlla ogni volta: un conto cancellato lascia il file, e il
 * file da solo farebbe scrivere sessioni in una cartella che non esiste più.
 */
export function proprietario(): string | null {
  const p = leggiProprietario()
  if (!p) return adotta()
  if (!conti.conto(p.utente)) {
    togliProprietario()
    annuncia()
    return null
  }
  return p.utente
}

/**
 * Acceso di serie: senza proprietario, il Mac è dell'unico conto, o di chi
 * ha usato la finestra per ultimo, se non l'ha spento lui. Chi l'ha spento
 * (`acceso: false` nella sua configurazione) resta spento. Solo dentro l'app.
 */
function adotta(): string | null {
  if (!disponibile()) return null
  const tutti = conti.tutti()
  const d = davanti.chi()
  const scelto = d && conti.conto(d) ? d : tutti.length === 1 ? tutti[0]! : null
  if (!scelto) return null
  const o = chi.dentro(scelto, () => cfg.leggi().osservatore)
  if (o?.acceso === false) return null
  const adesso = new Date().toISOString()
  scriviProprietario(scelto, adesso)
  // acceso da noi, non da lui: lo si dice una volta, e i titoli restano come li aveva (spenti se non li aveva mai accesi)
  chi.dentro(scelto, () => cfg.aggiorna({ osservatore: { ...(o ?? {}), acceso: true, titoli: o?.titoli === true, adottato: o?.adottato ?? adesso } }))
  return scelto
}

// — lo stato —

/** La rilettura del testo, dentro i suoi limiti. */
export function ogniDi(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(OGNI_MAX, Math.max(OGNI_MIN, Math.round(v))) : OGNI_TESTI
}

function statoDi(o: cfg.Config['osservatore'] | undefined, adesso: Date): StatoOsservatore {
  // acceso se manca: spento solo quando qualcuno l'ha spento
  const acceso = o?.acceso !== false
  const titoli = acceso && o?.titoli !== false
  let pausaFino: string | null = null
  if (acceso && o?.pausaFino) {
    const t = Date.parse(o.pausaFino)
    if (!Number.isNaN(t) && t > adesso.getTime()) pausaFino = new Date(t).toISOString()
  }
  return { acceso, titoli, pausaFino, testi: acceso && o?.testi === true, ogni: ogniDi(o?.ogni), escluse: [...(o?.escluse ?? [])], siti: [...(o?.siti ?? [])], avviso: acceso && !!o?.adottato && o?.avvisoVisto !== true }
}

const SPENTO: StatoOsservatore = { acceso: false, titoli: false, pausaFino: null, testi: false, ogni: OGNI_TESTI, escluse: [], siti: [], avviso: false }

/** Lo stato del proprietario: `pausaFino` è null appena è passata. */
export function stato(adesso = new Date()): StatoOsservatore {
  const p = proprietario()
  if (!p) return { ...SPENTO }
  return chi.dentro(p, () => statoDi(cfg.leggi().osservatore, adesso))
}

/** Lo stato per chi chiede: il proprietario vede il suo, gli altri vedono che c'è un altro. */
export function statoPerChiChiede(adesso = new Date()): StatoOsservatore & { disponibile: boolean; altroConto: boolean; osservate: number } {
  const me = chi.adesso() ?? ''
  const p = proprietario()
  const osservate = (db.prepare('SELECT COUNT(*) AS n FROM sessioni_app').get() as { n: number }).n
  if (p && p === me) return { ...statoDi(cfg.leggi().osservatore, adesso), disponibile: disponibile(), altroConto: false, osservate }
  // le esclusioni sono sue anche quando il Mac lo guarda un altro conto
  const o = cfg.leggi().osservatore
  return { ...SPENTO, escluse: [...(o?.escluse ?? [])], siti: [...(o?.siti ?? [])], disponibile: disponibile(), altroConto: !!p, osservate }
}

/**
 * Accende, spegne, cambia i titoli: per chi chiede.
 *
 * Accendere da un conto lo fa proprietario e spegne il precedente, nella sua
 * configurazione. Spegnere da un conto che non è il proprietario non cambia
 * niente di quello che il proprietario vede.
 */
export type Impostazioni = { acceso?: boolean; titoli?: boolean; testi?: boolean; ogni?: number; escluse?: string[]; siti?: string[]; avvisoVisto?: boolean }

/** Una lista di esclusioni scritta da lui: voci corte, senza doppioni, al massimo cento. */
export function pulisciEsclusioni(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return [...new Set(v.filter((x): x is string => typeof x === 'string').map(x => x.trim().toLowerCase()).filter(x => x && x.length <= 200))].slice(0, ESCLUSE_MAX)
}

export function imposta(v: Impostazioni, adesso = new Date()): ReturnType<typeof statoPerChiChiede> {
  const me = chi.serve()
  // com'era prima che la domanda stessa facesse adottare il Mac: accenderlo a mano è un gesto suo, e i titoli vanno come sempre
  const primaDiAdottare = cfg.leggi().osservatore
  const p = proprietario()
  const o = v.acceso === true ? primaDiAdottare : cfg.leggi().osservatore
  if (v.acceso === true) {
    if (p && p !== me) {
      chi.dentro(p, () => {
        const suo = cfg.leggi().osservatore
        cfg.aggiorna({ osservatore: { ...(suo ?? {}), acceso: false, pausaFino: null } })
        oss.buio(adesso)
      })
    }
    if (p !== me) scriviProprietario(me, adesso.toISOString())
    cfg.aggiorna({ osservatore: { ...(o ?? {}), acceso: true, titoli: v.titoli ?? o?.titoli ?? true, dal: o?.dal ?? adesso.toISOString(), pausaFino: null } })
    oss.luce(adesso)
  } else if (v.acceso === false) {
    if (p === me) togliProprietario()
    cfg.aggiorna({ osservatore: { ...(o ?? {}), acceso: false, pausaFino: null } })
    oss.buio(adesso)
  } else if (v.titoli !== undefined) {
    cfg.aggiorna({ osservatore: { ...(o ?? { acceso: true }), titoli: v.titoli } })
  }
  // il testo della finestra, il ritmo, le esclusioni: si cambiano insieme a tutto il resto
  const dopo = cfg.leggi().osservatore
  const extra: Partial<NonNullable<cfg.Config['osservatore']>> = {}
  if (v.testi !== undefined) extra.testi = v.testi === true
  if (v.ogni !== undefined) extra.ogni = ogniDi(v.ogni)
  if (v.escluse !== undefined) extra.escluse = pulisciEsclusioni(v.escluse)
  if (v.avvisoVisto === true) extra.avvisoVisto = true
  if (v.siti !== undefined) extra.siti = pulisciEsclusioni(v.siti).map(x => x.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')).filter(Boolean)
  if (Object.keys(extra).length) cfg.aggiorna({ osservatore: { ...(dopo ?? { acceso: true }), ...extra } })
  annuncia()
  return statoPerChiChiede(adesso)
}

/** Una pausa: solo il proprietario. Da un minuto a otto ore. */
export function pausa(minuti: number, adesso = new Date()): void {
  if (!Number.isInteger(minuti) || minuti < 1 || minuti > PAUSA_MAX) throw new Error('Quanto deve durare la pausa?')
  const me = chi.serve()
  if (proprietario() !== me) throw new Error('Lo usa un altro account su questo Mac.')
  const o = cfg.leggi().osservatore
  if (o?.acceso === false) return
  const fino = new Date(adesso.getTime() + minuti * 60_000)
  cfg.aggiorna({ osservatore: { ...(o ?? { acceso: true }), pausaFino: fino.toISOString() } })
  // quello che succede in pausa non entra nemmeno dopo, dalla cronologia o da Spotlight
  oss.luce(adesso)
  oss.buio(adesso, fino)
}

export function riprendi(adesso = new Date()): void {
  const me = chi.serve()
  if (proprietario() !== me) return
  const o = cfg.leggi().osservatore
  if (!o || o.acceso === false || !o.pausaFino) return
  cfg.aggiorna({ osservatore: { ...o, pausaFino: null } })
  oss.luce(adesso)
}

// — le cartelle di lavoro note, per conto: le riempie il giro notturno —

const cartelleNote = new Map<string, string[]>()

/** I nomi delle cartelle di lavoro di questo conto (le basename, almeno tre lettere). */
export function impostaCartelleNote(percorsi: string[]) {
  const nomi = [...new Set(percorsi.map(p => basename(p)).filter(n => n.length >= 3))]
  cartelleNote.set(chi.adesso() ?? '', nomi)
}

export function cartellaNelTitolo(titolo: string | null, nomi: string[]): string | null {
  if (!titolo) return null
  const basso = titolo.toLowerCase()
  const trovata = nomi
    .slice().sort((a, b) => b.length - a.length)
    .find(n => new RegExp(`(^|[^\\p{L}\\p{N}])${n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'u').test(basso))
  return trovata ?? null
}

// — le sessioni —

/** Gli stessi limiti del guscio (desktop/sessioni.ts): caratteri veri, non unità UTF-16. */
export const TITOLO_MASSIMO = 160
export const APP_MASSIMA = 120

/**
 * I primi `n` caratteri veri, come `taglia` nel guscio: un titolo con
 * un'emoji conta 160 caratteri di là e 161 unità di qua, e non per questo
 * la sessione, col suo tempo, deve sparire. Il testo in più si taglia e basta.
 */
function taglia(s: string, n: number): string {
  const c = Array.from(s)
  return c.length > n ? c.slice(0, n).join('').trimEnd() : s
}

function valida(x: unknown, adesso: Date): Sessione | null {
  if (!x || typeof x !== 'object') return null
  const s = x as Record<string, unknown>
  if (typeof s.bundle !== 'string' || !BUNDLE.test(s.bundle)) return null
  if (typeof s.app !== 'string' || !s.app) return null
  if (s.titolo !== null && typeof s.titolo !== 'string') return null
  if (typeof s.inizio !== 'string' || typeof s.fine !== 'string') return null
  const i = Date.parse(s.inizio), f = Date.parse(s.fine)
  if (Number.isNaN(i) || Number.isNaN(f) || !(i < f)) return null
  if (f > adesso.getTime() + 5 * 60_000) return null
  if (typeof s.secondi !== 'number' || !Number.isInteger(s.secondi) || s.secondi < 1 || s.secondi > 86400) return null
  const app = taglia(s.app, APP_MASSIMA)
  if (!app) return null
  const titolo = s.titolo === null ? null : taglia(s.titolo, TITOLO_MASSIMO) || null
  return { bundle: s.bundle, app, titolo, inizio: new Date(i).toISOString(), fine: new Date(f).toISOString(), secondi: s.secondi }
}

/** Una sessione a cavallo della mezzanotte locale diventa due, i secondi in proporzione. */
export function spezzaAMezzanotte(s: Sessione, zona = fuso.fusoDi()): (Sessione & { giorno: string })[] {
  const fuori: (Sessione & { giorno: string })[] = []
  let da = Date.parse(s.inizio)
  const fine = Date.parse(s.fine)
  const totale = fine - da
  for (let giri = 0; giri < 40 && da < fine; giri++) {
    const p = fuso.parti(new Date(da), zona)
    const mezzanotte = fuso.istante(p.anno, p.mese, p.giorno + 1, 0, zona).getTime()
    const a = Math.min(fine, mezzanotte)
    const secondi = Math.max(1, Math.round(s.secondi * (a - da) / totale))
    fuori.push({ ...s, inizio: new Date(da).toISOString(), fine: new Date(a).toISOString(), secondi, giorno: fuso.giornoIn(new Date(da), zona) })
    da = a
  }
  return fuori
}

/**
 * Le sessioni arrivate dal guscio: si filtrano di nuovo e si scrivono al proprietario.
 *
 * Torna quante righe sono state scritte. Senza proprietario, o spento, zero.
 */
export function scriviSessioni(s: unknown[], adesso = new Date()): number {
  const p = proprietario()
  if (!p || !Array.isArray(s)) return 0
  return chi.dentro(p, () => store.senzaToccare(() => {
    const o = cfg.leggi().osservatore
    if (o?.acceso === false) return 0
    const titoli = o?.titoli !== false
    const escluse = new Set(o?.escluse ?? [])
    const nomi = cartelleNote.get(p) ?? []
    const zona = fuso.fusoDi()
    const ins = db.prepare(`INSERT INTO sessioni_app (bundle, app, titolo, inizio, fine, secondi, giorno, progetto, cartella) VALUES (?,?,?,?,?,?,?,?,?)`)
    let scritte = 0
    db.exec('BEGIN')
    try {
      for (const x of s.slice(0, SESSIONI_PER_MESSAGGIO)) {
        const v = valida(x, adesso)
        if (!v) continue
        if (ESCLUSE_SEMPRE.has(v.bundle) || appEsclusa(v.bundle, v.app, escluse)) continue
        const titolo = !titoli || !v.titolo || TITOLO_PRIVATO.test(v.titolo) || TITOLO_SEGRETO.test(v.titolo) ? null : v.titolo
        const progetto = titolo ? progettoDelTesto(titolo) : null
        const cartella = cartellaNelTitolo(titolo, nomi)
        for (const r of spezzaAMezzanotte({ ...v, titolo }, zona)) {
          // un'ora dimenticata non torna, nemmeno da una sessione rimasta in coda nel guscio
          if (oss.dimenticata(r.inizio) || oss.dimenticata(r.fine)) continue
          ins.run(r.bundle, r.app, r.titolo, r.inizio, r.fine, r.secondi, r.giorno, progetto, cartella)
          oss.registra({
            kind: 'app', sourceId: `app:${r.bundle}|${r.titolo ?? ''}`, app: r.app, title: r.titolo,
            observedAt: r.inizio, endAt: r.fine, seconds: r.secondi, projectId: progetto
          })
          scritte++
        }
      }
      db.exec('COMMIT')
    } catch (e) { db.exec('ROLLBACK'); throw e }
    return scritte
  }))
}

/**
 * Via tutto quello che ha osservato di questo conto: le sessioni, le righe
 * «app.*» di Come lavori, la previsione di oggi sul progetto se non è ancora
 * verificata; poi le righe si rifanno dai fatti che restano. Una pressione,
 * una transazione: se il ricalcolo cade, non è sparito niente, e la pagina
 * che dice «non è andata» dice il vero.
 *
 * Le righe sulla posta si rifanno solo col registro in pari: a metà del primo
 * ripasso sarebbero false, in vigore senza un tocco, e la notte dopo
 * resterebbero novanta giorni sotto «Non valgono più» accanto al loro contrario.
 */
export function cancellaOsservazioni(adesso = new Date()): void {
  const oggi = fuso.giornoIn(adesso)
  db.exec('BEGIN')
  try {
    db.exec('DELETE FROM sessioni_app')
    oss.dimenticaTutto(adesso)
    // una riga tolta resta: è l'unico segno che non deve rinascere (e non porta niente del sensore, solo la chiave)
    db.exec("DELETE FROM abitudini WHERE genere LIKE 'app.%' AND stato != 'tolta'")
    db.prepare("DELETE FROM previsioni WHERE giorno = ? AND genere = 'progetto.del_giorno' AND verificata IS NULL").run(oggi)
    abitudini.ricalcola(adesso, { senzaPosta: segnali.postaDaRipassare() })
    db.exec('COMMIT')
  } catch (e) { db.exec('ROLLBACK'); throw e }
}

/**
 * La conservazione: dopo trenta giorni una riga perde il titolo e le righe
 * dello stesso giorno, app e progetto diventano una; dopo quattrocento se ne
 * vanno. Idempotente: un giorno già fuso resta una riga.
 */
export function conserva(adesso = new Date()): { fuse: number; tolte: number } {
  const soglia = fuso.giornoIn(new Date(adesso.getTime() - GIORNI_TITOLI * GIORNO))
  const via = fuso.giornoIn(new Date(adesso.getTime() - GIORNI_SESSIONI * GIORNO))
  let fuse = 0
  db.exec('BEGIN')
  try {
    const tolte = db.prepare('DELETE FROM sessioni_app WHERE giorno < ?').run(via).changes
    const gruppi = db.prepare(`
      SELECT giorno, bundle, app, progetto, COUNT(*) AS n, MIN(inizio) AS inizio, MAX(fine) AS fine, SUM(secondi) AS secondi
      FROM sessioni_app WHERE giorno < ? GROUP BY giorno, bundle, app, progetto
      HAVING n > 1 OR MAX(titolo IS NOT NULL) = 1 OR MAX(cartella IS NOT NULL) = 1
    `).all(soglia) as { giorno: string; bundle: string; app: string; progetto: string | null; inizio: string; fine: string; secondi: number }[]
    const canc = db.prepare('DELETE FROM sessioni_app WHERE giorno = ? AND bundle = ? AND app = ? AND progetto IS ?')
    const ins = db.prepare('INSERT INTO sessioni_app (bundle, app, titolo, inizio, fine, secondi, giorno, progetto, cartella) VALUES (?,?,NULL,?,?,?,?,?,NULL)')
    for (const g of gruppi) {
      canc.run(g.giorno, g.bundle, g.app, g.progetto)
      ins.run(g.bundle, g.app, g.inizio, g.fine, g.secondi, g.giorno, g.progetto)
      fuse++
    }
    oss.conserva(adesso)
    db.exec('COMMIT')
    return { fuse, tolte: Number(tolte) }
  } catch (e) { db.exec('ROLLBACK'); throw e }
}

/** Un'app esclusa da lui: per identificativo o per nome, senza badare alle maiuscole. */
export function appEsclusa(bundle: string, app: string, escluse: Set<string> | readonly string[]): boolean {
  const s = escluse instanceof Set ? escluse : new Set(escluse)
  if (!s.size) return false
  return s.has(bundle) || s.has(bundle.toLowerCase()) || s.has(app.toLowerCase())
}

// — il testo della finestra —

export type TestoFinestra = { bundle: string; app: string; titolo: string | null; documento: string | null; url: string | null; testo: string; t: number }

/** Al massimo tanti testi per messaggio, e tanti caratteri per testo (il programma ne legge otto mila). */
export const TESTI_PER_MESSAGGIO = 50
export const TESTO_LETTO_MAX = 8000

function validaTesto(x: unknown, adesso: Date): TestoFinestra | null {
  if (!x || typeof x !== 'object') return null
  const v = x as Record<string, unknown>
  if (typeof v.bundle !== 'string' || !BUNDLE.test(v.bundle)) return null
  if (typeof v.app !== 'string' || !v.app) return null
  if (typeof v.testo !== 'string') return null
  if (typeof v.t !== 'number' || !Number.isFinite(v.t) || v.t > adesso.getTime() + 5 * 60_000) return null
  const corto = (y: unknown, n: number) => typeof y === 'string' && y ? taglia(y, n) : null
  return {
    bundle: v.bundle, app: taglia(v.app, APP_MASSIMA), titolo: corto(v.titolo, TITOLO_MASSIMO),
    documento: corto(v.documento, 1000), url: corto(v.url, 2000), testo: taglia(v.testo, TESTO_LETTO_MAX), t: v.t
  }
}

/** Il percorso di un `file://` (quello che dà AXDocument), o null. */
function percorsoDi(documento: string | null): string | null {
  if (!documento) return null
  if (documento.startsWith('/')) return documento
  try { const u = new URL(documento); return u.protocol === 'file:' ? decodeURIComponent(u.pathname) : null } catch { return null }
}

/**
 * Il testo delle finestre arrivato dal guscio: solo se il proprietario l'ha
 * acceso e non è in pausa. Si filtra di nuovo tutto quello che il programma
 * dovrebbe aver già saltato (gestori di password, app riservate, le sue
 * esclusioni, finestre private o di accesso, siti esclusi), poi il testo si
 * ripulisce e si scrive solo se è cambiato davvero.
 */
export function scriviTesti(x: unknown[], adesso = new Date()): number {
  const p = proprietario()
  if (!p || !Array.isArray(x)) return 0
  return chi.dentro(p, () => store.senzaToccare(() => {
    const s = statoDi(cfg.leggi().osservatore, adesso)
    if (!s.acceso || !s.testi || s.pausaFino) return 0
    const escluse = new Set(s.escluse)
    let scritte = 0
    for (const y of x.slice(0, TESTI_PER_MESSAGGIO)) {
      const v = validaTesto(y, adesso)
      if (!v || !v.testo.trim()) continue
      if (ESCLUSE_SEMPRE.has(v.bundle) || appEsclusa(v.bundle, v.app, escluse) || oss.APP_RISERVATE.test(v.bundle) || oss.APP_RISERVATE.test(v.app)) continue
      if (v.titolo && (TITOLO_PRIVATO.test(v.titolo) || TITOLO_SEGRETO.test(v.titolo))) continue
      const web = v.url ? pulisciUrl(v.url) : null
      if (web && dominioEscluso(web.dominio, s.siti)) continue
      const percorso = percorsoDi(v.documento)
      const dove = percorso ?? web?.documento ?? web?.url ?? v.titolo ?? ''
      const esito = oss.registra({
        kind: 'finestra', sourceId: `finestra:${v.bundle}|${dove}`, app: v.app, title: v.titolo,
        text: v.testo, observedAt: new Date(v.t).toISOString(), percorso: percorso ?? (web ? `${web.dominio} ${web.url}` : null)
      })
      if (esito === 'nuova') scritte++
    }
    return scritte
  }))
}

/**
 * Dimentica un intervallo per chi chiede: le osservazioni, le sessioni, le
 * righe del diario che ne venivano; poi le righe di «Come lavori» si rifanno
 * da quello che resta, e il quadro dei progetti toccati si rifà al giro
 * dopo. Una transazione sola, come «cancella le osservazioni».
 */
export async function dimenticaIntervallo(da: Date, a: Date, adesso = new Date()): Promise<oss.Dimenticato> {
  let fatto: oss.Dimenticato
  db.exec('BEGIN')
  try {
    fatto = oss.dimentica(da, a, adesso)
    abitudini.ricalcola(adesso, { senzaPosta: segnali.postaDaRipassare() })
    db.exec('COMMIT')
  } catch (e) { db.exec('ROLLBACK'); throw e }
  if (fatto.progetti.length) {
    // il quadro letto da quelle righe non deve sopravvivere a loro
    const quadro = await import('./quadro.ts')
    for (const p of fatto.progetti) quadro.dimenticaQuadro(p)
  }
  return fatto
}

/** Il conto se n'è andato: se era il proprietario, il file va via e il guscio lo sa. */
export function dimentica(utente: string): void {
  const p = leggiProprietario()
  if (p?.utente === utente) {
    togliProprietario()
    annuncia()
  }
}

// — il filo col guscio —

type Filo = {
  on(evento: 'message', f: (m: { data?: unknown }) => void): unknown
  postMessage?(m: unknown): void
}

let porta: Filo | null = null
let ascoltaDavanti = false

function filoDiProcesso(): Filo | null {
  return (process as unknown as { parentPort?: Filo }).parentPort ?? null
}

/** Quello che il guscio riceve: esattamente queste sette chiavi. */
export function annuncia(): void {
  const f = porta ?? filoDiProcesso()
  if (!f?.postMessage) return
  const s = stato()
  try {
    f.postMessage({ tipo: 'osservatore-stato', acceso: s.acceso, titoli: s.titoli, pausaFino: s.pausaFino, testi: s.testi, ogni: s.ogni, escluse: s.escluse })
  } catch { /* il filo è caduto */ }
}

/**
 * Si mette in ascolto sul filo, se c'è; torna `true` se c'era.
 *
 * I messaggi si trattano in ordine e in modo sincrono: un `osservatore-stato`
 * ricevuto dopo un mazzo vuol dire che il mazzo è scritto.
 */
export function ascolta(filo?: Filo | null): boolean {
  // su un server, o fuori dall'app: nessun ascoltatore, qualunque cosa faccia chi chiama
  if (!disponibile()) return false
  const f = filo ?? filoDiProcesso()
  if (!f) return false
  porta = f
  // acceso di serie: quando qualcuno apre la finestra e il Mac non è ancora di nessuno, diventa suo
  if (!ascoltaDavanti) {
    ascoltaDavanti = true
    davanti.quandoCambia(() => { if (!leggiProprietario() && proprietario()) annuncia() })
  }
  f.on('message', m => {
    const d = m?.data as { tipo?: unknown; sessioni?: unknown; minuti?: unknown } | undefined
    if (!d || typeof d !== 'object') return
    try {
      switch (d.tipo) {
        case 'osservatore':
          if (Array.isArray(d.sessioni)) scriviSessioni(d.sessioni)
          return
        case 'osservatore-testi': {
          const testi = (d as { testi?: unknown }).testi
          if (Array.isArray(testi)) scriviTesti(testi)
          return
        }
        case 'osservatore-chiedi':
          annuncia(); return
        case 'osservatore-pausa': {
          const p = proprietario()
          const minuti = d.minuti
          if (p && typeof minuti === 'number' && Number.isInteger(minuti) && minuti >= 1 && minuti <= PAUSA_MAX) {
            chi.dentro(p, () => pausa(minuti))
          }
          annuncia(); return
        }
        case 'osservatore-riprendi': {
          const p = proprietario()
          if (p) chi.dentro(p, () => riprendi())
          annuncia(); return
        }
        default: return
      }
    } catch (e) {
      console.error('myynd · osservatore:', e instanceof Error ? e.message : e)
    }
  })
  return true
}

export const perProva = {
  forza(v: { app: boolean; ospitato: boolean } | null) { forzato = v },
  scollega() { porta = null },
  cartelleNote
}
