// Il primo giorno (F6): un gemello dal primo giorno.
//
// «I don't feel like it's learning from how I work.» All'installazione Myynd
// legge novanta giorni di posta mandata, di agenda, di commit e di chat, ma le
// righe di «Come lavori» le contava solo la notte, dalle tre: il primo giorno
// la Memoria era vuota, e la prima mattina non c'era niente di pronto. Qui, il
// primo giorno e una volta sola:
//
//   1. il ritratto (`ritratto`): appena la posta e l'agenda della prima
//      lettura sono dentro, il registro della posta a pezzi fino in fondo, le
//      cartelle di lavoro, i commit, e le righe contate. Nessun modello;
//   2. le carte (`carte`): fino a cinque cose vere da preparare, scelte con
//      le righe appena contate (a chi risponde sempre prima di tutto), scritte
//      sulla bacheca e messe in coda per la notte. Il turno le lavora dentro
//      il suo tetto di dodici; ognuna costa il contratto, la bozza e la
//      rilettura. Meno di cinque candidate vere, meno carte: mai inventate.
//      Il primo giorno le prepara anche con le proposte spente (di serie):
//      è l'unica volta;
//   3. chi c'era già (`rileggiUnaVolta`): se la posta mandata nell'indice non
//      arriva a ottanta giorni, la prima lettura della posta e di GitHub
//      ricomincia una volta, e il ritratto e le carte aspettano lei.
//
// Lo stato sta nei cursori del conto, un segno per passo: un processo che
// muore a metà riparte dal passo che mancava, e due conti non si vedono.

import { createHash } from 'node:crypto'
import { setImmediate as unGiroDopo } from 'node:timers/promises'
import db from './store.ts'
import * as store from './store.ts'
import * as cfg from './config.ts'
import * as chi from './chi.ts'
import * as ospitato from './ospitato.ts'
import * as cancellati from './cancellati.ts'
import * as segnali from './segnali.ts'
import * as abitudini from './abitudini.ts'
import * as gemello from './gemello.ts'
import * as primaLettura from './prima-lettura.ts'
import * as iniziativa from './iniziativa.ts'
import * as progetti from './progetti.ts'
import * as compiti from './compiti.ts'
import * as contratto from './contratto.ts'
import * as turno from './turno.ts'
import { fra } from './ordine.ts'
import { puoLavorare } from './modello.ts'
import { indirizzoAttenzione } from './rilevanza.ts'
import { fonteCollegata } from './fonti-collegate.ts'
import { FONTI_POSTA } from './connettori/registro.ts'

export const CURS = {
  ritratto: 'primo-giorno:ritratto',
  /** Il ritratto rifatto quando tutte le prime letture sono finite (anche il Mac, GitHub, Slack). */
  novanta: 'primo-giorno:novanta',
  carte: 'primo-giorno:carte',
  rilettura: 'primo-giorno:rilettura'
} as const

export const ORIGINE = 'primo-giorno'
/** Le carte del primo giorno, al massimo. */
export const CARTE_MAX = 5
/** Quanto indietro si cercano le cose da preparare: la prima settimana di lei. */
export const GIORNI_CANDIDATI = 7
/** Una carta in coda regge ancora se la sua mail non è più vecchia di così: la notte arriva dopo. */
export const GIORNI_VALIDA = 10
/** Le prime letture che il ritratto aspetta: la posta e l'agenda. */
export const POSTA_E_AGENDA: string[] = [...FONTI_POSTA, 'calendario', 'agendamac']
/** Una fonte ferma da tanti giri (il Calendario del Mac chiuso, una casella che non risponde) non trattiene il ritratto: lo rifà `novanta`. */
export const GIRI_CHE_ASPETTANO = 4
/** Le fonti che ricominciano la prima lettura, una volta, per chi c'era già. Il Mac no: è lungo, e le sue righe non sono di posta. */
export const RILEGGI: string[] = [...FONTI_POSTA, 'github']
/** Sotto questi giorni di posta mandata nell'indice, chi c'era già rilegge. */
export const GIORNI_RILETTURA = 80
/** Quanto conta una candidata: a chi risponde sempre, un'offerta o una fattura, un progetto alto. */
export const PUNTI = { rispondeSempre: 3, offerta: 2, fattura: 2, alto: 1 } as const
/** Da questa quota di risposte in su un mittente è uno a cui risponde sempre. */
export const RISPONDE_SEMPRE = 0.85
/** Fino a questa quota, uno a cui di solito non risponde: una bozza di risposta per lui sarebbe lavoro buttato. */
export const LASCIA = 0.1

const GIORNO = 86_400_000

/** Le mani, sostituibili solo nelle prove. */
type Ferri = {
  /** C'è un modello che può lavorare le carte. */
  motore: () => boolean
  cartelle: () => Promise<void>
  codice: (adesso: Date) => Promise<unknown>
  contratto: (id: string) => unknown
  annuncia: () => void
}
const VERI: Ferri = {
  motore: () => puoLavorare(),
  cartelle: () => gemello.aggiornaCartelle(),
  codice: adesso => segnali.raccogliCodice(adesso),
  contratto: id => contratto.subito(id),
  annuncia: () => compiti.annunciaCambio()
}
let ferri: Ferri = VERI
/** Solo per le prove: sostituisce le mani, o le rimette (con `null`). */
export function perProva(f: Partial<Ferri> | null) { ferri = f ? { ...VERI, ...f } : VERI }

const via = () => cancellati.cancellata(cfg.cartella())
const giri = (f: string) => Number(store.cursore(`prima:${f}:giri`) ?? 0)

/** Le prime letture di posta e agenda che il ritratto aspetta ancora. */
export function aspettaLaLettura(): string[] {
  return primaLettura.inCorso().filter(f => POSTA_E_AGENDA.includes(f) && giri(f) < GIRI_CHE_ASPETTANO)
}

// — chi c'era già —

/**
 * Una volta sola per conto: chi aveva già la posta nell'indice prima dei
 * novanta giorni del primo avvio (la sua lettura era di trenta) rilegge la
 * posta e GitHub da novanta giorni indietro, se la posta mandata più vecchia
 * che l'indice conosce ha meno di ottanta giorni. Solo le fonti collegate e
 * già «fatto»: una che sta ancora leggendo va avanti da sé. Torna le fonti
 * che ricominciano.
 */
export function rileggiUnaVolta(adesso = new Date()): string[] {
  if (store.cursore(CURS.rilettura)) return []
  const c = cfg.leggi()
  const qui = (f: string) => !((f === 'postamac') && (ospitato.OSPITATO || process.platform !== 'darwin'))
  const fonti = RILEGGI.filter(f => qui(f) && fonteCollegata(f, c) && store.cursore(`prima:${f}`) === 'fatto')
  let rilette: string[] = []
  if (fonti.length) {
    const r = db.prepare("SELECT MIN(quando) AS q FROM documenti WHERE tipo = 'email' AND inviato = 1 AND quando IS NOT NULL").get() as { q: string | null }
    const t = Date.parse(r.q ?? '')
    const corta = !Number.isFinite(t) || adesso.getTime() - t < GIORNI_RILETTURA * GIORNO
    if (corta) {
      for (const f of fonti) { store.segnaCursore(`prima:${f}`, 'in-corso'); store.segnaCursore(`prima:${f}:giri`, null) }
      rilette = fonti
      console.log(`myynd · primo giorno · rileggo da novanta giorni: ${fonti.join(', ')}`)
    }
  }
  store.segnaCursore(CURS.rilettura, adesso.toISOString())
  return rilette
}

// — il ritratto —

/**
 * Le righe di «Come lavori», adesso, senza aspettare la notte. Solo quando la
 * posta e l'agenda della prima lettura sono dentro: una riga contata su metà
 * posta direbbe «non risponde» a chi ha risposto. Zero token. Torna quante
 * righe ci sono, o null se non era il momento.
 */
export async function ritratto(adesso = new Date()): Promise<number | null> {
  if (via() || aspettaLaLettura().length) return null
  // il registro della posta cammina a pezzi (meno di un secondo ciascuno): qui fino in fondo, cedendo il passo fra un pezzo e l'altro
  let finito = false
  for (let i = 0; i < 500 && !finito; i++) {
    if (via()) return null
    finito = segnali.raccogliPosta(adesso).finito
    if (!finito) await unGiroDopo()
  }
  await ferri.cartelle()
  if (via()) return null
  await ferri.codice(adesso)
  if (via()) return null
  // il conto è sincrono e passa novanta giorni di posta, agenda e codice: prima si
  // lascia passare quello che aspetta (una richiesta della finestra), e si misura
  await unGiroDopo()
  if (via()) return null
  const t0 = Date.now()
  // con il registro ancora indietro le righe sulla posta aspettano la notte, come nel giro del gemello
  abitudini.ricalcola(adesso, finito && !segnali.ripassoInCorso() ? {} : { senzaPosta: true })
  const ms = Date.now() - t0
  if (ms > 200) console.warn(`myynd · primo giorno · il conto di «Come lavori» ha tenuto il server fermo ${ms} ms`)
  const ora = adesso.toISOString()
  store.segnaCursore(CURS.ritratto, ora)
  if (!primaLettura.inCorso().length) store.segnaCursore(CURS.novanta, ora)
  ferri.annuncia()
  const n = righe(adesso)
  console.log(`myynd · primo giorno · il ritratto · ${n} righe`)
  return n
}

/** Le righe di «Come lavori» che si vedono, senza le superate. */
function righe(adesso = new Date()): number {
  return abitudini.tutte(adesso).filter(a => a.stato !== 'superata').length
}

// — le carte —

type Scelta = {
  doc: store.Documento
  testo: string
  nota: string
  progetto: string | null
  /** La carta del feed da cui nasce, se nasce da un'offerta. */
  voce: string | null
  punti: number
}

const perMittente = (d: store.Documento) => {
  const a = indirizzoAttenzione(d.autore)
  return a ? abitudini.perMittente(a) : null
}

/** Un progetto chiuso, o fermo, di cui parla il documento: lì non si prepara niente. */
function toccaUnProgettoChiuso(d: store.Documento): boolean {
  const testo = `${d.titolo}\n${String(d.corpo ?? '').slice(0, 6000)}`
  const attivi = progetti.elenco('attivo')
  if (attivi.some(p => progetti.tocca(p, testo))) return false
  return progetti.elenco().some(p => p.stato !== 'attivo' && progetti.tocca(p, testo))
}

/**
 * Le candidate del primo giorno, in ordine: le cose che la sua prima
 * settimana chiede (una mail con una richiesta, una fattura da pagare, un
 * passo di un progetto attivo) e le carte del feed che portano un'offerta.
 * Le stesse regole delle proposte: niente filo già risposto, niente scartato,
 * niente con una riga, niente posta in serie, niente progetti chiusi; e
 * nessuna risposta a chi, secondo le righe appena contate, non risponde mai.
 */
export function scegli(adesso = Date.now(), quante = CARTE_MAX): Scelta[] {
  const en = cfg.lingua() === 'en'
  const alti = new Set(progetti.elenco('attivo').filter(p => progetti.eAlto(p)).map(p => p.id))
  const perDoc = new Map<string, Scelta>()
  const punti = (d: store.Documento, base: number, progetto: string | null) =>
    base + ((perMittente(d)?.risponde ?? 0) >= RISPONDE_SEMPRE ? PUNTI.rispondeSempre : 0) + (progetto && alti.has(progetto) ? PUNTI.alto : 0)

  const dallaPosta = iniziativa.liberi(iniziativa.candidatiDettagli(store.recenti(400), adesso, { giorni: GIORNI_CANDIDATI }))
  for (const c of dallaPosta) {
    if (toccaUnProgettoChiuso(c.doc)) continue
    // «Come lavori» appena contato dice che a lui di solito non risponde: la risposta non si prepara
    const pm = c.tipo === 'risposta' ? perMittente(c.doc) : null
    if (pm && pm.risponde <= LASCIA) continue
    const s = iniziativa.schedaPer(c.tipo, c.doc, en)
    const progetto = c.progetto?.id ?? null
    perDoc.set(c.doc.id, { doc: c.doc, testo: s.testo, nota: s.nota, progetto, voce: null, punti: punti(c.doc, c.tipo === 'fattura' ? PUNTI.fattura : 0, progetto) })
  }

  for (const v of store.feedAperto(80)) {
    if (!v.offerta?.trim() || !v.doc) continue
    const d = store.documento(v.doc)
    if (!d || d.massa || d.inviato) continue
    const riga = store.voceFeed(v.id)
    const progetto = riga?.progetto || null
    const p = progetto ? progetti.trova(progetto) : null
    if (p && p.stato !== 'attivo') continue
    if (!p && toccaUnProgettoChiuso(d)) continue
    if (!iniziativa.liberi([{ doc: d, tipo: 'risposta' }]).length) continue
    // anche un'offerta del feed è una risposta da preparare: a chi non risponde mai, no.
    // Mancava, e la bacheca del primo giorno mostrava «Send Leo the launch checklist»
    // accanto a «Leo Martin's mail usually goes unanswered (9 of 9)».
    const pm = perMittente(d)
    if (pm && pm.risponde <= LASCIA) continue
    const offerta = v.offerta.trim()
    perDoc.set(d.id, {
      doc: d, testo: v.titolo, progetto: p?.id ?? null, voce: v.id,
      nota: `DAY ONE PREPARATION from a card on her first page. What Myynd offered to do: ${offerta} Prepare exactly that as a reviewable draft, grounded in the source. ${iniziativa.REGOLE_PREPARAZIONE}`,
      punti: punti(d, PUNTI.offerta, p?.id ?? null)
    })
  }

  const quando = (d: store.Documento) => Date.parse(d.quando ?? '') || 0
  return [...perDoc.values()]
    .sort((a, b) => b.punti - a.punti || quando(b.doc) - quando(a.doc) || a.doc.id.localeCompare(b.doc.id))
    .slice(0, Math.max(0, quante))
}

/** L'id di una carta del primo giorno: dal documento, così la stessa cosa non nasce due volte. */
export const idCarta = (d: Pick<store.Documento, 'fonte' | 'id' | 'messageId'>) =>
  `primo-giorno-${createHash('sha256').update(`${d.fonte}:${d.messageId || d.id}`).digest('hex').slice(0, 24)}`

/** Il turno la prenderebbe: acceso e non in pausa, e lei non ha chiesto di essere interpellata prima. */
function inCodaSiPuo(): boolean {
  if (cfg.autonomia() === 'chiedere') return false
  const imp = turno.impostazioni()
  return imp.acceso && !imp.pausaFino
}

/**
 * Le carte del primo giorno: scritte sulla bacheca e messe in coda per la
 * notte, con la base del contratto. Senza un modello aspettano (null). Con
 * «Chiedimi prima», o il turno spento o in pausa, si scrivono e basta: le fa
 * partire lei. Una carta del feed che diventa una carta qui esce dal feed come
 * «superata»: non è una risposta sua, e il punteggio del gemello non la conta.
 * Torna gli id delle carte nate.
 */
export async function carte(adesso = new Date(), quante = CARTE_MAX): Promise<string[] | null> {
  if (via()) return null
  if (!ferri.motore()) return null
  const scelte = scegli(adesso.getTime(), quante)
  const coda = inCodaSiPuo()
  const nate: string[] = []
  for (const s of scelte) {
    if (via()) return nate
    const id = idCarta(s.doc)
    if (store.compito(id)) continue
    store.scriviCompito({
      id, testo: s.testo, nota: s.nota, doc: s.doc.id, progetto: s.progetto, voce: s.voce,
      origine: ORIGINE, quando: 'oggi', ordine: fra(store.ultimoOrdine('oggi'), '')
    })
    if (s.voce) store.cambiaStatoFeed(s.voce, 'scaduto', undefined, 'superata')
    if (coda && store.mettiCompitoInCoda(id, 'bozza', { da: 'myynd', quando: 'notte', dal: adesso.toISOString(), tentativi: 0 })) ferri.contratto(id)
    nate.push(id)
  }
  store.segnaCursore(CURS.carte, adesso.toISOString())
  if (nate.length) { ferri.annuncia(); compiti.annunciaFeed() }
  console.log(`myynd · primo giorno · ${nate.length} carte${coda ? ' in coda per la notte' : ''}`)
  return nate
}

/**
 * Una carta del primo giorno regge ancora (per il turno, prima di partire): il
 * documento c'è, non l'ha scartato, nessuno ha risposto nel filo, ed è ancora
 * una cosa da preparare. Una carta nata da un'offerta del feed la regge
 * l'offerta, non una richiesta scritta nella mail. Non guarda se le proposte
 * sono accese: il primo giorno le carte ci sono anche senza.
 */
export function fonteValida(c: Pick<store.Compito, 'doc' | 'voce'>, adesso = Date.now()): boolean {
  if (!c.doc) return false
  const d = store.documento(c.doc)
  if (!d || store.docsIgnoratiDalFeed([d]).has(d.id) || iniziativa.rispostoNelFilo(d)) return false
  // una carta nata da un'offerta del feed è una risposta: regge finché lui, per quello che dice
  // «Come lavori», a quel mittente risponde
  if (c.voce) { const pm = perMittente(d); return !(pm && pm.risponde <= LASCIA) }
  return iniziativa.candidati([d], adesso, { giorni: GIORNI_VALIDA }).length > 0
}

// — quando —

/** I passi dovuti, uno dopo l'altro, dentro il conto di chi chiama. */
async function passi(adesso: Date): Promise<void> {
  if (via()) return
  rileggiUnaVolta(adesso)
  const tutteFinite = () => !primaLettura.inCorso().length
  if (!store.cursore(CURS.ritratto) || (!store.cursore(CURS.novanta) && tutteFinite())) await ritratto(adesso)
  if (via()) return
  if (store.cursore(CURS.ritratto) && !store.cursore(CURS.carte)) await carte(adesso)
}

/** Per conto: il giro in volo. Due chiamate insieme (la prima pagina e il quarto d'ora) ne fanno una. */
const inVolo = new Map<string, Promise<void>>()

/**
 * Quello che è dovuto adesso, per questo conto: la rilettura una volta, il
 * ritratto quando la posta e l'agenda sono dentro, le carte quando c'è un
 * modello. La chiamano la prima pagina appena pronta, la fine della prima
 * lettura, e il giro del quarto d'ora (per chi aspettava). Non lancia mai.
 */
export function forse(conto = chi.adesso() ?? '', adesso?: Date): Promise<void> {
  const gia = inVolo.get(conto)
  if (gia) return gia
  const lavoro = () => passi(adesso ?? new Date())
  const p = Promise.resolve().then(async () => {
    try { await (conto ? chi.dentro(conto, lavoro) : lavoro()) }
    catch (e) { console.warn('myynd · primo giorno:', e instanceof Error ? e.message : e) }
    finally { inVolo.delete(conto) }
  })
  inVolo.set(conto, p)
  return p
}

export type Fase = 'attesa' | 'ritratto' | 'carte' | 'fatto'

/**
 * A che punto è, per la riga «Imparo come lavori»: `attesa` finché la posta e
 * l'agenda della prima lettura non sono dentro, `ritratto` mentre conta,
 * `carte` finché le carte non sono scritte (solo con un modello: senza,
 * aspettano in silenzio), poi `fatto`. Con le righe che ci sono e le carte nate.
 */
export function stato(): { fase: Fase; righe: number; carte: number } {
  const nate = store.elencoCompiti().filter(c => c.origine === ORIGINE).length
  const n = righe()
  const fatto = { fase: 'fatto' as Fase, righe: n, carte: nate }
  if (!store.cursore(CURS.ritratto)) {
    if (aspettaLaLettura().length) return { fase: 'attesa', righe: n, carte: nate }
    // un conto nuovo (la sua prima lettura è cominciata) la vede subito; chi c'era già, prima che si sia
    // deciso se rilegge, no: il ritratto parte al giro dopo, in silenzio
    return store.cursore(CURS.rilettura) || store.cursore('prima:iniziata') ? { fase: 'ritratto', righe: n, carte: nate } : fatto
  }
  if (!store.cursore(CURS.carte) && ferri.motore()) return { fase: 'carte', righe: n, carte: nate }
  return fatto
}

/** Solo per le prove: dimentica i giri in volo. */
export function dimentica(): void { inVolo.clear() }
