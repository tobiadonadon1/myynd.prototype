// Il turno (F2): Myynd lavora la bacheca da solo.
//
// Hermes ha un dispatcher che ogni sessanta secondi prende una carta pronta e
// la fa partire. Qui è lo stesso, con tre differenze che vengono da chi usa
// questa app, non da chi la programma:
//
//   · Le carte non le scrive solo lei. Una carta che lei passa a Myynd entra
//     «In coda»; una che Myynd propone dal suo materiale (una mail che chiede
//     qualcosa, una fattura da pagare) ci entra da sola, se lei ha acceso le
//     bozze pronte prima che le chieda. Tutte e due le lavora il turno.
//   · Il tempo è quello di una persona. Una carta di oggi parte subito; una
//     di domani la notte prima; le proposte di Myynd di notte o quando lei
//     non c'è. Le regole stanno in `turno-regole.ts`, pure.
//   · C'è un tetto e un bottone. Dodici carte in una giornata, di serie, e
//     la pausa: il turno è una cosa che lei vede e ferma, non un processo.
//
// Una carta alla volta per persona: è la regola della coda di `compiti.ts`,
// e il turno la rispetta. Quando una finisce, il turno guarda se ce n'è
// un'altra pronta (`compiti.quandoLibero`): la bacheca si svuota in fila,
// una dopo l'altra, finché c'è qualcosa di pronto e il tetto lo permette.
//
// Niente di quello che parte da qui manda, paga o cancella: il lavoro è
// quello di una carta affidata, con le mani del suo contratto (F1), e finisce
// in una bozza, un file, una nota o una copia del progetto.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as store from './store.ts'
import * as cfg from './config.ts'
import * as chi from './chi.ts'
import * as progetti from './progetti.ts'
import * as compiti from './compiti.ts'
import * as contratto from './contratto.ts'
import * as presenza from './presenza.ts'
import * as regole from './turno-regole.ts'
import { fonteValida } from './iniziativa.ts'
import * as primoGiorno from './primo-giorno.ts'
import * as gradino from './gradino.ts'
import { puoLavorare, rifiutata, testaAlLavoro } from './modello.ts'
import * as budgetNotte from './budget-notte.ts'
import { conCompito } from './etichetta-uso.ts'

/** Quante carte in una giornata, di serie; e il minimo e il massimo che si possono scegliere. */
export const CARTE_DI_SERIE = 12
export const CARTE_MIN = 1
export const CARTE_MAX = 40
/** Le partenze dopo le quali una carta che si interrompe non riparte da sola. */
export const TENTATIVI_MAX = 2
/** Una pausa dura da un minuto a una giornata. */
export const PAUSA_MAX = 24 * 60

export type Impostazioni = {
  acceso: boolean
  pausaFino: string | null
  carte: number
  notte: regole.Finestra
  /** F9 · fermato col bottone, da quell'istante: non riparte finché lei non lo riprende. */
  fermo: string | null
}

/** F9 · i budget fra cui scegliere nelle preferenze, in dollari; zero è «nessun limite». */
export const BUDGET_SCELTE = [1, 3, 5, 10, 0]

export function impostazioni(c: cfg.Config = cfg.leggi(), adesso = new Date()): Impostazioni {
  const t = c.turno ?? {}
  const carte = Number.isInteger(t.carte) ? Math.min(CARTE_MAX, Math.max(CARTE_MIN, t.carte as number)) : CARTE_DI_SERIE
  const pausa = t.pausaFino && Date.parse(t.pausaFino) > adesso.getTime() ? new Date(Date.parse(t.pausaFino)).toISOString() : null
  return {
    acceso: t.spento !== true,
    pausaFino: pausa,
    carte,
    notte: {
      da: regole.oraValida(t.notteDa) ? t.notteDa : regole.NOTTE_DI_SERIE.da,
      a: regole.oraValida(t.notteA) ? t.notteA : regole.NOTTE_DI_SERIE.a
    },
    fermo: typeof t.fermo === 'string' && Number.isFinite(Date.parse(t.fermo)) ? t.fermo : null
  }
}

/** Cambia le impostazioni del turno. Lancia con una frase sua se un valore non va. */
export function imposta(p: { acceso?: unknown; pausa?: unknown; carte?: unknown; notteDa?: unknown; notteA?: unknown; budget?: unknown }, adesso = new Date()): Impostazioni {
  const c = cfg.leggi()
  const t = { ...(c.turno ?? {}) }
  if (p.acceso !== undefined) {
    if (typeof p.acceso !== 'boolean') throw new Error('Acceso o spento?')
    t.spento = !p.acceso
    // riaccenderlo è anche riprenderlo, dal bottone come dalla pausa
    if (p.acceso) { t.pausaFino = null; t.fermo = null }
  }
  if (p.pausa !== undefined) {
    // zero, o null, riprende (anche dopo «Stop now»); un numero di minuti mette in pausa
    if (p.pausa === null || p.pausa === 0) { t.pausaFino = null; t.fermo = null }
    else if (typeof p.pausa === 'number' && Number.isInteger(p.pausa) && p.pausa >= 1 && p.pausa <= PAUSA_MAX) t.pausaFino = new Date(adesso.getTime() + p.pausa * 60_000).toISOString()
    else throw new Error('Quanto deve durare la pausa?')
  }
  if (p.carte !== undefined) {
    if (typeof p.carte !== 'number' || !Number.isInteger(p.carte) || p.carte < CARTE_MIN || p.carte > CARTE_MAX) throw new Error('Quante carte in una giornata?')
    t.carte = p.carte
  }
  if (p.budget !== undefined) {
    if (typeof p.budget !== 'number' || !Number.isFinite(p.budget) || p.budget < 0 || p.budget > 1000) throw new Error('Quanto può spendere in una notte?')
    t.budget = Math.round(p.budget * 100) / 100
  }
  for (const k of ['notteDa', 'notteA'] as const) {
    if (p[k] === undefined) continue
    if (!regole.oraValida(p[k])) throw new Error('Un’ora come 22:00.')
    t[k] = p[k] as string
  }
  if ((t.notteDa ?? regole.NOTTE_DI_SERIE.da) === (t.notteA ?? regole.NOTTE_DI_SERIE.a)) throw new Error('La notte comincia e finisce alla stessa ora.')
  cfg.aggiorna({ turno: t })
  return impostazioni(cfg.leggi(), adesso)
}

// — il conto della giornata: su disco, per persona —

/** F9 · perché il turno si è fermato: il budget finito, o il bottone. */
export type Fermata = { perche: 'budget' | 'stop'; quando: string }
/** F9 · un tratto di notte in cui il turno non ha battuto: il Mac dormiva, o l'app era chiusa. */
export type Buco = { da: string; a: string }
/**
 * Il conto su disco. `giornata`/`avviate`/`fermata` valgono per la giornata
 * del turno e ripartono con lei; `battito` è l'ultimo giro; `notte` tiene
 * quello che la mattina si racconta dell'ultima notte (la fermata e i buchi),
 * e riparte quando comincia la notte dopo.
 */
type Conto = { giornata: string; avviate: number; fermata?: Fermata | null; battito?: string; notte?: { dal: string; fermata?: Fermata | null; buchi: Buco[] } }
const fileConto = () => join(cfg.cartella(), 'turno.json')

function leggiFile(): Partial<Conto> {
  try {
    if (existsSync(fileConto())) {
      const c = JSON.parse(readFileSync(fileConto(), 'utf8'))
      if (c && typeof c === 'object') return c as Partial<Conto>
    }
  } catch { /* un conto illeggibile riparte da zero: meglio una carta in più che il turno fermo */ }
  return {}
}

function leggiConto(inizio: string): Conto {
  const c = leggiFile()
  const stessa = c.giornata === inizio
  return {
    giornata: inizio,
    avviate: stessa && Number.isInteger(c.avviate) ? c.avviate as number : 0,
    fermata: stessa ? c.fermata ?? null : null,
    ...(typeof c.battito === 'string' ? { battito: c.battito } : {}),
    ...(c.notte && typeof c.notte.dal === 'string' ? { notte: { dal: c.notte.dal, fermata: c.notte.fermata ?? null, buchi: Array.isArray(c.notte.buchi) ? c.notte.buchi : [] } } : {})
  }
}

/** Quello che si ricorda dell'ultima notte, se è quella cominciata a `dal`. */
function laNotte(c: Conto, dal: string): NonNullable<Conto['notte']> {
  return c.notte?.dal === dal ? c.notte : { dal, fermata: null, buchi: [] }
}

function scriviConto(c: Conto) {
  mkdirSync(cfg.cartella(), { recursive: true })
  writeFileSync(fileConto() + '.tmp', JSON.stringify(c), { mode: 0o600 })
  renameSync(fileConto() + '.tmp', fileConto())
}

/** F9 · una fermata scritta nel conto della giornata e, se è notte, in quello della notte. */
function segnaFermata(perche: Fermata['perche'], adesso: Date, notte: regole.Finestra) {
  const c = leggiConto(regole.inizioGiornata(adesso, notte).toISOString())
  const f: Fermata = { perche, quando: adesso.toISOString() }
  c.fermata = f
  if (regole.inNotte(adesso, notte)) {
    const n = laNotte(c, regole.inizioUltimaNotte(adesso, notte).toISOString())
    c.notte = { ...n, fermata: f }
  }
  scriviConto(c)
}

/** Un battito più lontano di così, di notte, è un buco: il Mac dormiva o l'app era chiusa. */
export const BUCO_DOPO = 5 * 60_000

/**
 * F9 · il battito: ogni giro del turno acceso scrive l'ora. Se fra l'ultimo
 * battito e questo, di notte e con carte in coda, sono passati più di cinque
 * minuti, il tratto va fra i buchi della notte: la mattina il punto lo dice
 * («Mac asleep 01:10–05:40»), perché una notte che non ha lavorato deve avere
 * un perché che si vede.
 */
function battito(adesso: Date, notte: regole.Finestra, conCarte: boolean) {
  const c = leggiConto(regole.inizioGiornata(adesso, notte).toISOString())
  const prima = Date.parse(c.battito ?? '')
  const dal = regole.inizioUltimaNotte(adesso, notte)
  if (conCarte && Number.isFinite(prima) && prima >= dal.getTime() && regole.inNotte(new Date(prima), notte) && adesso.getTime() - prima > BUCO_DOPO) {
    // il buco finisce con la notte, se la notte è finita mentre dormiva
    const fine = regole.inizioGiornata(adesso, notte)
    const a = fine.getTime() > prima && fine.getTime() < adesso.getTime() ? fine : adesso
    if (a.getTime() - prima > BUCO_DOPO) {
      const n = laNotte(c, dal.toISOString())
      c.notte = { ...n, buchi: [...n.buchi, { da: new Date(prima).toISOString(), a: a.toISOString() }].slice(-12) }
    }
  }
  c.battito = adesso.toISOString()
  scriviConto(c)
}

/**
 * Le mani, sostituibili solo nelle prove: far partire una carta, sapere se il
 * motore c'è, se la persona ha già un lavoro in corso, se lei c'è.
 */
type Ferri = {
  affida: (id: string, modo: string, nativa: boolean) => void
  motore: () => boolean
  occupato: (utente: string) => boolean
  assente: () => boolean
  /** Il contratto preciso, prima di partire: la carta aspetta il modello al massimo qualche secondo. */
  contratto: (id: string) => Promise<unknown>
}
const VERI: Ferri = {
  affida: (id, modo, nativa) => compiti.affida(id, modo, nativa, { turno: true }),
  motore: () => {
    if (!puoLavorare()) return false
    const t = testaAlLavoro()
    return !((t === 'claude' || t === 'openai') && rifiutata(t))
  },
  occupato: u => compiti.occupatoPer(u),
  assente: () => presenza.assente(),
  contratto: id => contratto.assicura(id, { rifai: true, attesa: 6_000 })
}
let ferri: Ferri = VERI

/** Solo per le prove: sostituisce le mani, o le rimette (con `null`). */
export function perProva(f: Partial<Ferri> | null) { ferri = f ? { ...VERI, ...f } : VERI }

/** Il contesto delle regole, adesso. */
export function contesto(adesso = new Date(), imp = impostazioni(cfg.leggi(), adesso)): regole.Contesto {
  return { adesso, notte: imp.notte, assente: ferri.assente() }
}

/**
 * Una carta nata da un'iniziativa di Myynd la cui fonte non regge più: si ritira invece di lavorarla.
 * Anche quelle del primo giorno (F6), ma senza guardare se le proposte sono accese: il primo giorno ci sono anche spente.
 */
function ritirabile(c: store.Compito, adesso = new Date()): boolean {
  if (c.origine === 'iniziativa') return !fonteValida(c.doc, adesso.getTime())
  // una risposta guadagnata: la fonte non regge più, o la persona è stata ripresa («Take it back»)
  if (c.origine === gradino.ORIGINE) return !gradino.rigaValida(c)
  if (c.origine === primoGiorno.ORIGINE) return !primoGiorno.fonteValida(c, adesso.getTime())
  return false
}

/**
 * Le carte in coda, pronte adesso, nell'ordine in cui partirebbero.
 * Pura rispetto all'indice: non fa partire niente.
 */
export function pronte(adesso = new Date()): store.Compito[] {
  const ctx = contesto(adesso)
  const alti = new Set(progetti.elenco('attivo').filter(p => p.priorita === 'alta').map(p => p.id))
  return store.elencoCompiti()
    .filter(c => regole.pronta(c, ctx) && (c.turno?.tentativi ?? 0) < TENTATIVI_MAX + 1)
    .map(c => ({ c, p: regole.punteggio(c, { adesso, progettoAlto: !!c.progetto && alti.has(c.progetto) }) }))
    .sort((a, b) => b.p - a.p || a.c.ordine.localeCompare(b.c.ordine) || a.c.id.localeCompare(b.c.id))
    .map(x => x.c)
}

const inGiro = new Set<string>()

/**
 * Un giro del turno: se si può, fa partire la carta pronta che conta di più.
 *
 * Non fa niente — e lo dice nel registro solo quando cambia qualcosa — se il
 * turno è spento o in pausa, se non c'è un motore, se la persona ha già un
 * lavoro in corso, se il tetto della giornata è raggiunto, o se niente è
 * pronto. Torna l'id della carta partita, o null. Non lancia mai.
 */
export async function giro(adesso = new Date()): Promise<string | null> {
  const conto = cfg.cartella()
  if (inGiro.has(conto)) return null
  inGiro.add(conto)
  try {
    const imp = impostazioni(cfg.leggi(), adesso)
    if (!imp.acceso || imp.pausaFino || imp.fermo) return null
    // F9 · il battito, prima di tutto il resto: una notte che non ha lavorato deve dire perché
    try { battito(adesso, imp.notte, store.elencoCompiti().some(regole.inCoda)) } catch { /* il battito è un di più */ }
    if (!ferri.motore()) return null
    const utente = chi.adesso() ?? ''
    if (ferri.occupato(utente)) return null
    const inizio = regole.inizioGiornata(adesso, imp.notte).toISOString()
    const c = leggiConto(inizio)
    if (c.avviate >= imp.carte) return null
    const candidate = pronte(adesso)
    /*
     * F9 · il budget della notte, prima di far partire qualunque cosa: se è
     * finito, o se quello che resta non basta per una carta come le ultime,
     * le carte restano in coda per la notte dopo, e il conto lo scrive (una
     * volta sola: il turno guarda ogni minuto).
     */
    if (candidate.length && budgetNotte.stato(adesso).finito) {
      if (c.fermata?.perche !== 'budget') {
        segnaFermata('budget', adesso, imp.notte)
        console.info(`myynd · turno · fermo: finito il budget ($${budgetNotte.budget()}) · ${candidate.length} in coda`)
      }
      return null
    }
    for (const carta of candidate) {
      if (ritirabile(carta, adesso)) {
        store.cambiaStatoCompito(carta.id, 'ritirato', 'Source changed or preparation paused')
        compiti.annunciaCambio()
        continue
      }
      // il contratto preciso prima di partire, se il modello risponde in
      // qualche secondo: chi scrive e chi rilegge guardano la stessa riga
      await conCompito(carta.id, () => ferri.contratto(carta.id), { turno: true })
      // nel frattempo la carta può essere cambiata di mano
      const ora = store.compito(carta.id)
      if (!ora || !regole.inCoda(ora) || ferri.occupato(utente)) return null
      const notte = regole.inNotte(adesso, imp.notte)
      const t: store.TurnoCompito = {
        da: ora.turno?.da ?? 'tu', quando: ora.turno?.quando ?? 'presto', dal: ora.turno?.dal ?? ora.aggiornato,
        tentativi: (ora.turno?.tentativi ?? 0) + 1, ultimo: adesso.toISOString(), notte
      }
      store.scriviTurnoCompito(ora.id, t)
      store.segnaNelDiario(ora.id, { tipo: 'turno', dettaglio: notte ? 'notte' : ferri.assente() ? 'via' : 'giorno' })
      scriviConto({ ...leggiConto(inizio), avviate: c.avviate + 1 })
      console.info(`myynd · turno · parte · ${ora.id} · ${t.da} · ${notte ? 'notte' : 'giorno'} · ${c.avviate + 1}/${imp.carte}`)
      ferri.affida(ora.id, ora.modo && ora.modo !== 'io' ? ora.modo : 'tutto', t.da !== 'myynd')
      return ora.id
    }
    return null
  } catch (e) {
    console.warn('myynd · il turno non è riuscito:', e instanceof Error ? e.message : e)
    return null
  } finally {
    inGiro.delete(conto)
  }
}

/**
 * Una carta in coda per Myynd, messa da lei (o da Myynd, per le sue proposte).
 *
 * Si scrive il turno e la base del contratto nello stesso istante (così la
 * carta in «In coda» ha già il suo «fatto»), poi si guarda se può partire.
 * Solo da aperta: lancia con una frase sua se no.
 */
export function mettiInCoda(id: string, da: 'tu' | 'myynd' = 'tu', quando: 'presto' | 'notte' = 'presto', adesso = new Date()): store.TurnoCompito {
  const c = store.compito(id)
  if (!c) throw new Error('Compito non trovato.')
  if (c.stato !== 'aperto') throw new Error('Questa carta non si mette in coda: rispondile, o cambiala.')
  const modo = c.modo && c.modo !== 'io' ? c.modo : 'tutto'
  const t: store.TurnoCompito = { da, quando, dal: adesso.toISOString(), tentativi: 0 }
  if (!store.mettiCompitoInCoda(id, modo, t)) throw new Error('Questa carta non si mette in coda: rispondile, o cambiala.')
  contratto.subito(id)
  compiti.annunciaCambio()
  const utente = chi.adesso()
  // il giro dopo aver risposto: chi ha trascinato la carta non aspetta il modello
  setTimeout(() => { void per(utente, () => giro()) }, 50).unref?.()
  return t
}

function per<T>(utente: string | null, f: () => T): T {
  return utente ? chi.dentro(utente, f) : f()
}

export type Stato = Impostazioni & {
  avviate: number
  inNotte: boolean
  prossimaNotte: string | null
  assente: boolean
  motore: boolean
  inCoda: number
  prontePerOra: number
  /** F9 · una carta del turno è al lavoro adesso: la bacheca offre «Stop now». */
  lavora: boolean
  /** F9 · il Mac va a batteria: le preferenze dicono di tenerlo in carica, col coperchio aperto. */
  batteria: boolean
  /** F9 · quanto ha speso il turno nella sua giornata, su quanto può, e se è finito. */
  budget: budgetNotte.Budget
  /**
   * Quello che il turno ha fatto da quando è cominciata l'ultima notte: finite
   * e che aspettano lei. F9: quanto è costata (in dollari), il budget di
   * quella notte, quante carte sono rimaste in coda perché si è fermato, il
   * perché della fermata, e i tratti in cui il Mac dormiva.
   */
  stanotte: { fatte: number; attende: number; dal: string; costo: number; limite: number; rimaste: number; fermata: Fermata['perche'] | null; buchi: Buco[] }
}

/** Com'è il turno adesso: quello che la bacheca dice in una riga. Non lancia mai. */
export function stato(adesso = new Date()): Stato {
  const imp = impostazioni(cfg.leggi(), adesso)
  let avviate = 0, inCoda = 0, prontePerOra = 0, fatte = 0, attende = 0, costo = 0
  const dal = regole.inizioUltimaNotte(adesso, imp.notte)
  const giornata = regole.inizioGiornata(adesso, imp.notte)
  const conto = (() => { try { return leggiConto(giornata.toISOString()) } catch { return null } })()
  const notte = conto ? laNotte(conto, dal.toISOString()) : { dal: dal.toISOString(), fermata: null, buchi: [] }
  try {
    avviate = conto?.avviate ?? 0
    // la notte finita si conta fino alla sua fine, non fino a adesso: il lavoro del mattino è di oggi
    costo = store.costoDal(dal.toISOString(), giornata.getTime() > dal.getTime() ? giornata.toISOString() : undefined) / 1_000_000
    const ctx = { adesso, notte: imp.notte, assente: ferri.assente() }
    const vive = store.elencoCompiti()
    for (const c of vive) {
      if (regole.inCoda(c)) { inCoda++; if (regole.pronta(c, ctx)) prontePerOra++ }
    }
    for (const c of [...vive, ...store.compitiChiusi()]) {
      const t = c.turno
      if (!t?.notte || !t.ultimo || Date.parse(t.ultimo) < dal.getTime()) continue
      if (c.stato === 'fatto' || (c.stato === 'pronto' && c.prova?.esito !== 'fail')) fatte++
      else if (c.stato === 'chiede' || c.stato === 'pronto' || (c.stato === 'aperto' && c.guaio)) attende++
    }
  } catch { /* senza indice il turno dice solo come è impostato */ }
  const prossima = regole.prossimaNotte(adesso, imp.notte)
  const fermata = notte.fermata?.perche ?? null
  return {
    ...imp, avviate, inNotte: regole.inNotte(adesso, imp.notte), prossimaNotte: prossima ? prossima.toISOString() : null,
    assente: ferri.assente(), motore: ferri.motore(), inCoda, prontePerOra,
    lavora: compiti.turnoAlLavoro(chi.adesso()),
    batteria: presenza.aBatteria(),
    budget: budgetNotte.stato(adesso),
    stanotte: { fatte, attende, dal: dal.toISOString(), costo, limite: budgetNotte.budget(), rimaste: fermata ? inCoda : 0, fermata, buchi: notte.buchi }
  }
}

/**
 * F9 · «Stop now»: il turno si ferma adesso, e resta fermo finché lei non lo
 * riprende («Resume the shift», o riaccenderlo). La carta al lavoro si
 * interrompe e torna in coda con le altre (`compiti.fermaPer`), i file
 * scritti a metà vanno nel Cestino. Non è la pausa: la pausa finisce da sola,
 * questo no. Torna le carte fermate.
 */
export function ferma(adesso = new Date()): string[] {
  const c = cfg.leggi()
  cfg.aggiorna({ turno: { ...(c.turno ?? {}), fermo: adesso.toISOString() } })
  try { segnaFermata('stop', adesso, impostazioni(cfg.leggi(), adesso).notte) } catch { /* il conto è un di più */ }
  const fermate = compiti.fermaPer(chi.adesso())
  console.info(`myynd · turno · stop · ${fermate.length ? fermate.join(', ') : 'niente al lavoro'}`)
  compiti.annunciaCambio()
  return fermate
}

/** Quanto prima della notte il Mac resta sveglio per lei: un'ora. */
export const VEGLIA_PRIMA = 60 * 60_000

export type Veglia = {
  /** Il Mac non deve addormentarsi: è notte (o manca meno di un'ora), e c'è lavoro con budget. */
  sveglio: boolean
  /** C'è una notte che aspetta: il turno acceso e non fermo, carte in coda, budget. Uscire la salterebbe. */
  inAttesa: boolean
  /** Una carta del turno è al lavoro adesso. */
  lavora: boolean
  fermo: boolean
}

/**
 * F9 · quello che il guscio deve sapere del turno, ogni quindici secondi:
 * tenere sveglio il Mac, avvisare prima di uscire, offrire «Stop» nella
 * barra dei menu. Leggero apposta (niente carte chiuse, niente costi della
 * notte), e non lancia mai.
 */
export function veglia(adesso = new Date()): Veglia {
  try {
    const imp = impostazioni(cfg.leggi(), adesso)
    const lavora = compiti.turnoAlLavoro(chi.adesso())
    if (!imp.acceso || imp.fermo) return { sveglio: false, inAttesa: false, lavora, fermo: !!imp.fermo }
    // le carte che partirebbero stanotte, non tutte quelle in coda: una carta del 20
    // ottobre non tiene sveglio il Mac ogni notte fino al 20 ottobre
    const prossimaNotte = regole.prossimaNotte(adesso, imp.notte)
    const stanotte = regole.inNotte(adesso, imp.notte) ? adesso : (prossimaNotte ?? adesso)
    const inCoda = pronte(stanotte).length > 0
    const conBudget = !budgetNotte.stato(adesso).finito
    const inAttesa = inCoda && conBudget && !imp.pausaFino
    const prossima = regole.prossimaNotte(adesso, imp.notte)
    const vicina = regole.inNotte(adesso, imp.notte) || (!!prossima && prossima.getTime() - adesso.getTime() <= VEGLIA_PRIMA)
    return { sveglio: inAttesa && vicina, inAttesa, lavora, fermo: false }
  } catch {
    return { sveglio: false, inAttesa: false, lavora: false, fermo: false }
  }
}

let avviato = false
/**
 * All'avvio: il turno ascolta la coda. Quando una carta finisce, si guarda se
 * ce n'è un'altra pronta per la stessa persona. Una volta sola per processo.
 */
export function avvia() {
  if (avviato) return
  avviato = true
  compiti.quandoLibero(utente => {
    setTimeout(() => { void per(utente, () => giro()) }, 800).unref?.()
  })
}
