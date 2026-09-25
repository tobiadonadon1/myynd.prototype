// L'osservatore: il regista, nel processo principale del guscio.
//
// Non decide niente da solo. Guarda solo dopo che il server ha detto
// `acceso: true` in un `osservatore-stato` — nessun messaggio vuol dire
// spento — e con i titoli solo se il server li vuole e il Mac ha dato il
// permesso di Accessibilità. Allora accende una fonte (`fronte.ts`), passa
// ogni evento dal filtro (`sessioni.ts`), chiude le sessioni quando la
// persona si allontana (due minuti fermi), blocca lo schermo o mette a dormire
// il Mac, e ogni minuto le manda al server. Finché il server appena partito
// non ha risposto, le tiene da parte (al massimo 500).
//
// La pausa di un'ora, dal menu della barra o dal mostriciattolo, cambia
// tutto subito — occhi, nuvoletta, menu — e torna indietro se il server non
// la conferma entro cinque secondi: quello che si vede dev'essere vero.
//
// Tutto quello che tocca il Mac arriva da fuori (`Dipendenze`): le prove lo
// guidano con finti, e nessuna prova guarda la persona.

import type { Crea, FonteFronte } from './fronte.ts'
import {
  CHIEDI, INATTIVO_SECONDI, PER_MESSAGGIO, RIPRENDI, creaCoda, creaCostruttore, filtra, inPausa, leggiStato,
  messaggioPausa, messaggioSessioni, minutiPausa, type Coda, type Costruttore, type EventoFronte, type Finestra,
  type StatoServer
} from './sessioni.ts'

export type Dipendenze = {
  /** `server.manda`: falso quando il server non c'è. */
  manda(m: unknown): boolean
  creaFonte: Crea
  /** `powerMonitor.getSystemIdleTime()`. */
  inattivoSecondi(): number
  /** Il permesso di Accessibilità dato all'app (mai chiesto da qui). */
  permesso(): boolean
  adesso(): number
  mioPid: number
  piattaforma: string
  /** Barra e mostriciattolo si ridisegnano. */
  suCambio(s: StatoLocale): void
  registra(riga: string): void
  /** Solo per la prova del canale: ogni quanti millisecondi si guarda l'inattività e si manda. */
  ritmi?: { inattivita?: number; invio?: number }
}

export type StatoLocale = {
  /** Solo su Mac. */
  disponibile: boolean
  /** L'ultimo stato confermato dal server. */
  acceso: boolean
  titoli: boolean
  /** Il valore della pausa, anche quello non ancora confermato. */
  pausaFino: string | null
  /** Acceso e non in pausa: quello che dicono gli occhi del mostriciattolo. */
  guarda: boolean
  permesso: boolean
}

export const OGNI_INATTIVITA = 15_000
export const OGNI_INVIO = 60_000
export const ATTESA_CONFERMA = 5_000
export const ATTESA_USCITA = 1_500
/** Uno stato conferma la pausa se il suo istante sta a meno di due minuti da quello chiesto. */
const TOLLERANZA_PAUSA = 120_000
/** Il ritardo più lungo che `setTimeout` accetta: oltre, Node lo fa diventare un millisecondo. */
export const RITARDO_MASSIMO = 2 ** 31 - 1
const RIAVVII_MASSIMI = 3
const FINESTRA_RIAVVII = 10 * 60_000

let d: Dipendenze | null = null
let disponibile = false
/** L'ultimo stato che il server ha detto. Nessuno stato: spento. */
let confermato: StatoServer = { acceso: false, titoli: false, pausaFino: null }
/** Il server di adesso ha già risposto? Fino ad allora le sessioni aspettano. */
let risposto = false
/** Una pausa (o una ripresa) premuta e non ancora confermata. */
let ottimista: { pausaFino: string | null; orologio: ReturnType<typeof setTimeout> } | null = null
let permesso = false
let fonte: FonteFronte | null = null
let fonteTitoli = false
let generazione = 0
let ripiego = false
let avvisatoRipiego = false
let riavvii: number[] = []
let costruttore: Costruttore = creaCostruttore()
let coda: Coda = creaCoda()
let ultimo: Finestra | null = null
let inattivo = false
/** Schermo bloccato e Mac addormentato sono due cose: si riguarda solo quando nessuna delle due è vera. */
let schermoBloccato = false
let addormentato = false
let fermato = true
let orologi: ReturnType<typeof setInterval>[] = []
let scadenza: ReturnType<typeof setTimeout> | null = null
let ultimoDetto = ''
let ultimoRegistro = ''
let attesaStato: (() => void)[] = []

const ora = () => d!.adesso()
const sospeso = () => schermoBloccato || addormentato

function pausaAttuale(): string | null {
  return ottimista ? ottimista.pausaFino : confermato.pausaFino
}

/** Deve girare una fonte adesso? */
function deveGuardare(): boolean {
  return !fermato && disponibile && confermato.acceso && !inPausa(pausaAttuale(), ora())
}

export function stato(): StatoLocale {
  const pausaFino = pausaAttuale()
  return {
    disponibile,
    acceso: confermato.acceso,
    titoli: confermato.titoli,
    pausaFino,
    guarda: d !== null && disponibile && confermato.acceso && !inPausa(pausaFino, ora()),
    permesso
  }
}

function hhmm(iso: string): string {
  const t = new Date(iso)
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
}

/** Una riga nel registro quando cambia quello che si fa, non a ogni giro. */
function registraCambio() {
  if (!d || !disponibile) return
  const guarda = deveGuardare()
  const pausa = pausaAttuale()
  let riga: string
  if (guarda) riga = `guscio · osservatore acceso (titoli: ${fonteTitoli ? 'sì' : 'no'})`
  else if (confermato.acceso && pausa && inPausa(pausa, ora())) riga = `guscio · osservatore in pausa fino alle ${hhmm(pausa)}`
  else riga = 'guscio · osservatore spento'
  if (riga === ultimoRegistro) return
  // il primo «spento», prima che il server abbia detto qualcosa, non è una notizia
  if (!ultimoRegistro && riga === 'guscio · osservatore spento') return
  ultimoRegistro = riga
  d.registra(riga)
}

/** Accende, spegne o riaccende la fonte secondo lo stato; ridisegna se qualcosa è cambiato. */
function valuta() {
  if (!d) return
  const guarda = deveGuardare()
  const titoliVoluti = confermato.titoli && permesso
  if (fonte && (!guarda || fonteTitoli !== titoliVoluti)) spegniFonte()
  if (guarda && !fonte) accendiFonte(titoliVoluti)
  programmaScadenza()
  registraCambio()
  const s = stato()
  const detto = JSON.stringify(s)
  if (detto !== ultimoDetto) {
    ultimoDetto = detto
    d.suCambio(s)
  }
}

function accendiFonte(titoli: boolean) {
  if (!d) return
  const mia = ++generazione
  fonteTitoli = titoli
  inattivo = false
  let creata: FonteFronte
  try {
    creata = d.creaFonte({
      titoli,
      ripiego,
      suEvento: e => { if (mia === generazione) suEvento(e) },
      suFine: motivo => { if (mia === generazione) suFineFonte(motivo) }
    })
  } catch (e) {
    d.registra(`guscio · la fonte dell'osservatore non parte: ${e instanceof Error ? e.message : e}`)
    return
  }
  if (mia !== generazione) { creata.ferma(); return }
  fonte = creata
  if (creata.tipo === 'ripiego' && !avvisatoRipiego) {
    avvisatoRipiego = true
    d.registra('guscio · aiutante assente: guardo solo le app')
  }
}

function spegniFonte() {
  generazione++
  costruttore.ferma(ora())
  const f = fonte
  fonte = null
  inattivo = false
  try { f?.ferma() } catch { /* già ferma */ }
}

function suEvento(e: EventoFronte) {
  if (!d) return
  const f = filtra(e, { titoli: fonteTitoli, mioPid: d.mioPid })
  // una finestra che non esiste per Myynd non allunga quella di prima
  if (!f) { ultimo = null; costruttore.ferma(e.t); return }
  ultimo = f
  if (sospeso()) return
  // un'altra app davanti, con la tastiera o il mouse appena toccati, vuol
  // dire che la persona è tornata: non si aspetta il giro dei quindici secondi
  if (inattivo) {
    if (!tornata()) return
    inattivo = false
  }
  costruttore.evento(f, e.t)
}

function tornata(): boolean {
  try {
    const secondi = d!.inattivoSecondi()
    return Number.isFinite(secondi) && secondi < INATTIVO_SECONDI
  } catch { return false }
}

/** Il programma è uscito da solo: si riavvia tre volte in dieci minuti, poi il ripiego. */
function suFineFonte(motivo: string) {
  if (!d) return
  generazione++
  costruttore.ferma(ora())
  fonte = null
  if (!deveGuardare()) return
  const adesso = ora()
  riavvii = riavvii.filter(t => adesso - t < FINESTRA_RIAVVII)
  if (!ripiego && riavvii.length < RIAVVII_MASSIMI) {
    riavvii.push(adesso)
    d.registra(`guscio · aiutante uscito, lo riavvio (${riavvii.length}/${RIAVVII_MASSIMI})`)
  } else if (!ripiego) {
    ripiego = true
    avvisatoRipiego = true
    d.registra('guscio · aiutante assente: guardo solo le app')
  }
  valuta()
}

/**
 * Quanto aspettare la fine della pausa. Mai più di `RITARDO_MASSIMO`: una
 * pausa più lontana (un orologio tornato indietro) si riguarda a quel punto e
 * si riprogramma, invece di far girare il processo a vuoto ogni millisecondo.
 */
export function ritardoScadenza(pausaFino: string, adesso: number): number {
  return Math.min(Math.max(0, Date.parse(pausaFino) - adesso) + 50, RITARDO_MASSIMO)
}

/**
 * Alla fine della pausa si ricomincia da soli: nessun messaggio, ognuno guarda
 * il suo orologio. L'orologio di questo timer però si ferma quando il Mac
 * dorme: per questo la pausa si riguarda anche al risveglio e a ogni minuto.
 */
function programmaScadenza() {
  if (scadenza) { clearTimeout(scadenza); scadenza = null }
  const p = pausaAttuale()
  if (!d || fermato || !p || !inPausa(p, ora())) return
  scadenza = setTimeout(() => { scadenza = null; valuta() }, ritardoScadenza(p, ora()))
}

/** Le sessioni chiuse in coda, e la coda al server se il server ha già risposto. */
function spedisci() {
  if (!d) return
  coda.metti(costruttore.chiusi())
  if (!risposto) return
  while (coda.quante() > 0) {
    const pezzo = coda.prendi(PER_MESSAGGIO)
    let andato = false
    try { andato = d.manda(messaggioSessioni(pezzo)) } catch { andato = false }
    if (!andato) {
      // il server se n'è andato: si riprova quando il prossimo risponde
      coda.rimetti(pezzo)
      risposto = false
      return
    }
  }
}

function giroInattivita() {
  if (!d || !fonte || sospeso()) return
  let secondi = 0
  try { secondi = d.inattivoSecondi() } catch { return }
  if (!Number.isFinite(secondi)) return
  if (secondi >= INATTIVO_SECONDI && !inattivo) {
    inattivo = true
    costruttore.ferma(ora() - secondi * 1000)
  } else if (inattivo && secondi < INATTIVO_SECONDI) {
    inattivo = false
    costruttore.riprendi(ultimo, ora())
  }
}

function giroInvio() {
  if (!d) return
  // il permesso di Accessibilità serve solo ai titoli: senza, non lo si guarda
  if (confermato.acceso && confermato.titoli) rileggiPermesso()
  // e la pausa finita mentre l'orologio del timer era fermo
  valuta()
  if (fonte && !inattivo && !sospeso()) costruttore.taglia(ora())
  spedisci()
}

/* ------------------------------------------------------------- da fuori */

export function avvia(dip: Dipendenze): void {
  for (const o of orologi) clearInterval(o)
  if (scadenza) clearTimeout(scadenza)
  if (ottimista) clearTimeout(ottimista.orologio)
  d = dip
  disponibile = dip.piattaforma === 'darwin'
  confermato = { acceso: false, titoli: false, pausaFino: null }
  risposto = false
  ottimista = null
  fonte = null
  fonteTitoli = false
  generazione++
  ripiego = false
  avvisatoRipiego = false
  riavvii = []
  costruttore = creaCostruttore()
  coda = creaCoda()
  ultimo = null
  inattivo = false
  schermoBloccato = false
  addormentato = false
  fermato = false
  scadenza = null
  ultimoDetto = ''
  ultimoRegistro = ''
  attesaStato = []
  orologi = []
  // il permesso si guarda solo quando il server vuole i titoli (daServer)
  permesso = false
  if (disponibile) {
    orologi.push(
      setInterval(giroInattivita, dip.ritmi?.inattivita ?? OGNI_INATTIVITA),
      setInterval(giroInvio, dip.ritmi?.invio ?? OGNI_INVIO))
    for (const o of orologi) o.unref?.()
  }
  valuta()
}

function leggiPermesso(): boolean {
  if (!d || !disponibile) return false
  try { return d.permesso() === true } catch { return false }
}

/** Il permesso si rilegge ogni minuto e quando la pagina lo chiede: se cambia, la fonte riparte. */
export function rileggiPermesso(): boolean {
  const p = leggiPermesso()
  if (p !== permesso) { permesso = p; valuta() }
  return p
}

/** Un server nuovo (a ogni `suPorta`): gli si chiede com'è, e fino alla risposta le sessioni aspettano. */
export function nuovoServer(): void {
  if (!d || fermato) return
  risposto = false
  try { d.manda(CHIEDI) } catch { /* lo si richiede al prossimo */ }
}

/** Un `osservatore-stato` dal server. */
export function daServer(m: unknown): void {
  const s = leggiStato(m)
  if (!s || !d) return
  confermato = s
  risposto = true
  if (s.acceso && s.titoli) permesso = leggiPermesso()
  // spento dal server: una pausa in volo non ha più niente da mettere in pausa
  if (ottimista && !s.acceso) { clearTimeout(ottimista.orologio); ottimista = null }
  if (ottimista && confermaPausa(ottimista.pausaFino, s.pausaFino)) {
    clearTimeout(ottimista.orologio)
    ottimista = null
  }
  const chi = attesaStato
  attesaStato = []
  if (!fermato) {
    valuta()
    spedisci()
  }
  for (const f of chi) f()
}

function confermaPausa(voluta: string | null, detta: string | null): boolean {
  if (voluta === null) return !inPausa(detta, ora())
  if (detta === null) return false
  return Math.abs(Date.parse(detta) - Date.parse(voluta)) <= TOLLERANZA_PAUSA
}

function premuto(pausaFino: string | null, messaggio: unknown, cosa: string) {
  if (!d || fermato) return
  if (ottimista) clearTimeout(ottimista.orologio)
  const orologio = setTimeout(() => annulla(`${cosa}: il server non ha risposto`), ATTESA_CONFERMA)
  orologio.unref?.()
  ottimista = { pausaFino, orologio }
  valuta()
  let andato = false
  try { andato = d.manda(messaggio) } catch { andato = false }
  if (!andato) annulla(`${cosa}: il server non c'è`)
}

function annulla(perche: string) {
  if (!ottimista || !d) return
  clearTimeout(ottimista.orologio)
  ottimista = null
  d.registra(`guscio · ${perche}, torno com'era`)
  valuta()
}

/** Un'ora di pausa (o quanto si chiede): cambia subito, torna indietro senza conferma. */
export function pausa(minuti = 60): void {
  if (!d || !disponibile || !confermato.acceso) return
  const m = minutiPausa(minuti)
  premuto(new Date(ora() + m * 60_000).toISOString(), messaggioPausa(m), 'la pausa')
}

export function riprendi(): void {
  if (!d || !disponibile || !confermato.acceso) return
  premuto(null, RIPRENDI, 'la ripresa')
}

function chiudiAdesso() {
  costruttore.ferma(ora())
  spedisci()
}

/**
 * Di ritorno dal blocco o dal sonno. Prima si riguarda lo stato: una pausa
 * può essere finita mentre il Mac dormiva, e il suo timer dormiva con lui.
 * Poi, se niente tiene ancora fermo (lo schermo ancora bloccato dopo il
 * risveglio), si riapre sull'ultima finestra e si chiede chi c'è davanti. Una
 * fonte appena accesa lo dice da sé.
 */
function riapri(eraFermo: boolean) {
  const cera = fonte
  valuta()
  if (!eraFermo || sospeso()) return
  inattivo = false
  if (!fonte || fonte !== cera) return
  costruttore.riprendi(ultimo, ora())
  fonte.chiedi()
}

/** Schermo bloccato, o la sessione utente passata a un altro: la sessione si chiude adesso. */
export function bloccato(): void {
  if (!d) return
  schermoBloccato = true
  chiudiAdesso()
}

export function sbloccato(): void {
  if (!d) return
  const era = schermoBloccato
  schermoBloccato = false
  riapri(era)
}

/** Il Mac va a dormire: la sessione si chiude adesso. */
export function dorme(): void {
  if (!d) return
  addormentato = true
  chiudiAdesso()
}

/** Il risveglio non basta se lo schermo è bloccato: si riguarda allo sblocco. */
export function sveglio(): void {
  if (!d) return
  const era = addormentato
  addormentato = false
  riapri(era)
}

function attendiStato(ms: number): Promise<boolean> {
  return new Promise(risolvi => {
    let fatto = false
    const orologio = setTimeout(() => { if (!fatto) { fatto = true; risolvi(false) } }, Math.max(0, ms))
    attesaStato.push(() => { if (!fatto) { fatto = true; clearTimeout(orologio); risolvi(true) } })
  })
}

/**
 * Prima di uscire: la sessione aperta si chiude, tutto quello che c'è va al
 * server, poi `osservatore-chiedi`. Il server tratta i messaggi in ordine,
 * quindi la sua risposta vuol dire che le sessioni sono scritte. Si aspetta
 * al massimo un secondo e mezzo, e si esce comunque.
 */
export async function ferma(): Promise<void> {
  if (!d || fermato) return
  const dip = d
  const limite = Date.now() + ATTESA_USCITA
  if (fonte) spegniFonte()
  else costruttore.ferma(ora())
  fermato = true
  for (const o of orologi) clearInterval(o)
  orologi = []
  if (scadenza) { clearTimeout(scadenza); scadenza = null }
  if (ottimista) { clearTimeout(ottimista.orologio); ottimista = null }
  coda.metti(costruttore.chiusi())
  // un server che non ha mai risposto e niente da consegnare: non c'è niente
  // da confermare, e aspettarlo rallenterebbe l'uscita per niente
  if (!risposto && coda.quante() === 0) return
  for (let giro = 0; giro < 4; giro++) {
    const eraRisposto = risposto
    spedisci()
    let chiesto = false
    try { chiesto = dip.manda(CHIEDI) } catch { chiesto = false }
    if (!chiesto) break
    const resta = limite - Date.now()
    if (resta <= 0 || !(await attendiStato(resta))) break
    if (eraRisposto && coda.quante() === 0) break
  }
  if (coda.quante() > 0) dip.registra(`guscio · esco con ${coda.quante()} sessioni non consegnate`)
}
