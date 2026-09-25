// L'archivio della prova delle risposte: i file sotto `valutazioni/risposte/`.
//
// Solo file, nessun modello e nessun modulo pesante: lo legge la rotta delle
// preferenze a ogni apertura, lo scrive la prova, lo toglie «svuota la mente»
// e l'addio al conto. Dentro la cartella del conto (0700), ogni file 0600,
// scritto su un temporaneo e poi rinominato: una prova interrotta a metà non
// lascia un JSON a metà.
//
//   domande.json    l'insieme delle domande (domande-prova.ts)
//   stato.json      l'ultima prova, l'ultima completa, l'ultimo salto, quella in corso
//   storico.json    gli ultimi 52 riassunti
//   <iso>.json      i rapporti interi, gli ultimi 12
//   .in-corso       il lucchetto: pid e quando, stantio dopo due ore o a pid morto

import { chmodSync, closeSync, existsSync, linkSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import * as cfg from './config.ts'
import type { Via } from './ancoraggio.ts'

/** Perché una prova si è fermata: il budget, i minuti, il tetto di oggi, il segnale, o un guasto della strada (rete, motore). */
export type Interrotta = 'budget' | 'tempo' | 'tetto' | 'annullata' | 'errore'

export type Riassunto = {
  quando: string
  origine: 'comando' | 'settimana'
  via: Via | 'misto'
  /** Le domande giudicate. */
  fatte: number
  /** Le giudicate senza quelle da rivedere: il denominatore della riga. */
  quante: number
  /** Quante domande la prova doveva fare: per la riga di una prova fermata. Manca nei riassunti più vecchi. */
  totale?: number
  giuste: number
  senzaFonte: number
  sbagliate: number
  inventate: number
  rifiutateMale: number
  daRivedere: number
  passa: boolean
  interrotta?: Interrotta
  gettoni: number
  file: string
}

export type Salto = 'tetto' | 'motore' | 'locale' | 'insieme'

/**
 * Sotto queste domande attive non c'è un insieme: la riga delle preferenze
 * non si disegna e il lavoro settimanale salta. Sei e non dieci: la scena di
 * prova committata ne ha sei, e quello che lo schermo mostra deve poter
 * girare davvero.
 */
export const INSIEME_MINIMO = 6

export type StatoProva = {
  ultima?: Riassunto
  ultimaCompleta?: string
  /** L'ultima prova della settimana, finita o no: anche una fermata a metà aspetta sette giorni. */
  ultimaSettimanale?: string
  saltata?: { quando: string; motivo: Salto }
  inCorso?: { dal: string; fatte: number; quante: number }
}

/** La cartella di questo conto, o quella data. */
export function cartellaRisposte(cartella?: string): string {
  return join(cartella ?? cfg.cartella(), 'valutazioni', 'risposte')
}

function assicura(dove: string) {
  if (!existsSync(dove)) mkdirSync(dove, { recursive: true, mode: 0o700 })
  try { chmodSync(dove, 0o700) } catch { /* non è nostra */ }
}

function scriviAtomico(file: string, contenuto: string) {
  const tmp = `${file}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
  writeFileSync(tmp, contenuto, { mode: 0o600 })
  renameSync(tmp, file)
  try { chmodSync(file, 0o600) } catch { /* c'è già */ }
}

function leggiJSON<T>(file: string): T | null {
  try { return JSON.parse(readFileSync(file, 'utf8')) as T } catch { return null }
}

// — il lucchetto —

const STANTIO = 2 * 3_600_000

export type Lucchetto = { pid: number; dal: string }

function vivo(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch (e) {
    // EPERM: c'è, ma non è nostro; ESRCH: non c'è più
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function stantio(l: Lucchetto | null): boolean {
  if (!l || !Number.isFinite(l.pid)) return true
  const eta = Date.now() - new Date(l.dal).getTime()
  if (!Number.isFinite(eta) || eta > STANTIO) return true
  return !vivo(l.pid)
}

/**
 * Porta via un lucchetto stantio, e dice se ci è riuscito.
 *
 * Un `rename` a un nome unico, e poi si rilegge quello che si è spostato: se
 * non è più quello letto prima (pid o ora diversi), un altro l'aveva già
 * portato via e rifatto nel frattempo, e quello spostato è il suo, vivo. Si
 * rimette al suo posto con un `link`, che non sovrascrive (se nel frattempo
 * ne è nato un altro ancora, resta quello), e si risponde no. Torna true solo
 * se quello sparito era davvero lo stantio.
 */
export function portaViaStantio(file: string, vecchio: Lucchetto | null): boolean {
  const via = `${file}.stantio-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
  try { renameSync(file, via) } catch { return false /* l'ha portato via un altro */ }
  const spostato = leggiJSON<Lucchetto>(via)
  const stesso = !!spostato && !!vecchio && spostato.pid === vecchio.pid && spostato.dal === vecchio.dal
  if (spostato && !stesso) {
    try { linkSync(via, file) } catch { /* ce n'è già un altro: resta quello */ }
    try { unlinkSync(via) } catch { /* già via */ }
    return false
  }
  try { unlinkSync(via) } catch { /* già via */ }
  return true
}

/**
 * Il lucchetto della prova: uno solo per cartella.
 *
 * `O_EXCL` sul file: chi lo apre per primo lo tiene. Uno lasciato lì da un
 * processo morto, o più vecchio di due ore, si porta via (`portaViaStantio`,
 * che controlla di aver spostato proprio quello) e si riprova una volta: se
 * nel frattempo un altro l'ha rifatto, al giro dopo si trova il suo, vivo, e
 * ci si ferma. Torna null se un altro lo tiene davvero.
 */
export function prendi(cartella?: string): { lascia(): void } | null {
  const dove = cartellaRisposte(cartella)
  assicura(dove)
  const file = join(dove, '.in-corso')
  for (let tentativo = 0; tentativo < 2; tentativo++) {
    try {
      const fd = openSync(file, 'wx', 0o600)
      writeSync(fd, JSON.stringify({ pid: process.pid, dal: new Date().toISOString() }))
      closeSync(fd)
      return { lascia: () => { try { unlinkSync(file) } catch { /* già via */ } } }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
      const vecchio = leggiJSON<Lucchetto>(file)
      if (!stantio(vecchio)) return null
      if (!portaViaStantio(file, vecchio)) continue
    }
  }
  return null
}

/** Una prova sta girando: il lucchetto c'è e non è stantio. */
export function inCorso(cartella?: string): boolean {
  const file = join(cartellaRisposte(cartella), '.in-corso')
  if (!existsSync(file)) return false
  return !stantio(leggiJSON<Lucchetto>(file))
}

// — i file —

export function leggiStato(cartella?: string): StatoProva {
  return leggiJSON<StatoProva>(join(cartellaRisposte(cartella), 'stato.json')) ?? {}
}

export function scriviStato(s: StatoProva, cartella?: string) {
  const dove = cartellaRisposte(cartella)
  assicura(dove)
  scriviAtomico(join(dove, 'stato.json'), JSON.stringify(s, null, 2))
}

export const STORICO_MAX = 52
export const RAPPORTI_MAX = 12

export function leggiStorico(cartella?: string): Riassunto[] {
  const s = leggiJSON<Riassunto[]>(join(cartellaRisposte(cartella), 'storico.json'))
  return Array.isArray(s) ? s : []
}

/** In coda allo storico, tenendo gli ultimi 52. */
export function aggiungiAlloStorico(r: Riassunto, cartella?: string) {
  const dove = cartellaRisposte(cartella)
  assicura(dove)
  const tutti = [...leggiStorico(cartella), r].slice(-STORICO_MAX)
  scriviAtomico(join(dove, 'storico.json'), JSON.stringify(tutti, null, 2))
}

const nomeRapporto = (quando: string) => `${quando.replace(/[:.]/g, '-')}.json`
const eUnRapporto = (n: string) => /^\d{4}-\d{2}-\d{2}T[\d-]+Z?\.json$/.test(n)

/** Il rapporto intero, e via i più vecchi oltre i dodici. Torna il percorso. */
export function salvaRapporto(rapporto: unknown, quando: string, cartella?: string): string {
  const dove = cartellaRisposte(cartella)
  assicura(dove)
  const file = join(dove, nomeRapporto(quando))
  scriviAtomico(file, JSON.stringify(rapporto, null, 2))
  const vecchi = readdirSync(dove).filter(eUnRapporto).sort()
  for (const n of vecchi.slice(0, Math.max(0, vecchi.length - RAPPORTI_MAX))) {
    try { unlinkSync(join(dove, n)) } catch { /* già via */ }
  }
  return file
}

/** L'ultimo rapporto intero, se c'è. */
export function ultimoRapporto(cartella?: string): unknown | null {
  const dove = cartellaRisposte(cartella)
  if (!existsSync(dove)) return null
  const n = readdirSync(dove).filter(eUnRapporto).sort().at(-1)
  return n ? leggiJSON<unknown>(join(dove, n)) : null
}

export function leggiInsieme<T = unknown>(cartella?: string): T | null {
  return leggiJSON<T>(join(cartellaRisposte(cartella), 'domande.json'))
}

export function scriviInsieme(insieme: unknown, cartella?: string) {
  const dove = cartellaRisposte(cartella)
  assicura(dove)
  scriviAtomico(join(dove, 'domande.json'), JSON.stringify(insieme, null, 2))
}

/** Via tutto: `valutazioni/risposte`, e solo quella. */
export function togli(cartella?: string) {
  rmSync(cartellaRisposte(cartella), { recursive: true, force: true })
}

/** Per «Scarica i miei dati»: l'insieme, lo storico e l'ultimo rapporto; null se non c'è niente. */
export function perIlFascicolo(): { domande: unknown; storico: unknown; ultimo: unknown } | null {
  if (!existsSync(cartellaRisposte())) return null
  return { domande: leggiInsieme(), storico: leggiStorico(), ultimo: ultimoRapporto() }
}

// — la riga delle preferenze —

const MESI = {
  it: ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
}

/** «22 set» o «Sep 22», dalla data ISO, nell'ora di questa macchina. */
export function giornoCorto(iso: string, en: boolean): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const mese = MESI[en ? 'en' : 'it'][d.getMonth()]
  return en ? `${mese} ${d.getDate()}` : `${d.getDate()} ${mese}`
}

/**
 * La riga sotto l'interruttore, costruita qui nella lingua dell'app.
 *
 * In ordine: la prova in corso; un salto più recente dell'ultima prova, ma
 * solo con l'interruttore acceso; un'ultima prova fermata a metà; l'ultima
 * prova. Niente lineette, niente parentesi. `lucchetto` dice se il lucchetto
 * è vivo: senza, lo si guarda su disco.
 */
export function rigaDiStato(s: StatoProva, attiva: boolean, en: boolean, lucchetto = inCorso()): string | null {
  if (lucchetto && s.inCorso) {
    return en ? `Checking now: ${s.inCorso.fatte} of ${s.inCorso.quante}.` : `Prova in corso: ${s.inCorso.fatte} su ${s.inCorso.quante}.`
  }
  if (attiva && s.saltata && s.saltata.motivo !== 'insieme' && (!s.ultima || s.saltata.quando > s.ultima.quando)) {
    const g = giornoCorto(s.saltata.quando, en)
    const perche = {
      tetto: en ? 'today’s token limit reached' : 'tetto di token di oggi raggiunto',
      motore: en ? 'no engine connected' : 'nessun motore collegato',
      locale: en ? 'not run on a local model' : 'su un modello locale non la faccio'
    }[s.saltata.motivo]
    return en ? `Skipped on ${g}: ${perche}.` : `Saltata il ${g}: ${perche}.`
  }
  const u = s.ultima
  if (!u) return null
  const g = giornoCorto(u.quando, en)
  if (u.interrotta) {
    // le fatte su tutte quelle da fare; un riassunto vecchio senza `totale` ha solo le giudicate
    const su = u.totale ?? u.quante
    return en ? `Check on ${g} stopped at ${u.fatte} of ${su}.` : `Prova del ${g} fermata a ${u.fatte} su ${su}.`
  }
  const inventate = u.inventate === 0
    ? (en ? 'none invented' : 'nessuna inventata')
    : u.inventate === 1 ? (en ? '1 invented' : '1 inventata') : (en ? `${u.inventate} invented` : `${u.inventate} inventate`)
  return en
    ? `Last check on ${g}: ${u.giuste} of ${u.quante} right, ${inventate}.`
    : `Ultima prova il ${g}: ${u.giuste} su ${u.quante} giuste, ${inventate}.`
}
