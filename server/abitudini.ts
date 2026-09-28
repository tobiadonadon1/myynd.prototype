// «Come lavori»: le righe contate, non dedotte.
//
// Ogni riga è una frase che il codice può dimostrare con dei numeri: «a Nora
// rispondi sempre, di solito entro tre ore» sono quindici mail e quattordici
// risposte, con la mediana dei tempi. Nessun modello le scrive, nessun modello
// le legge finché non valgono: una riga vale (`inVigore`) quando lui l'ha
// tenuta o corretta, oppure quando i casi sono almeno venti e il genere lo
// permette. Le righe sulle app no: quelle nascono da un sensore, e aspettano
// un tocco.
//
// Gli stati: `osservata` (appena nata), `tenuta` (ha premuto Tienila),
// `corretta` (ha scritto la sua frase in `testoSuo`; i numeri si aggiornano,
// la frase resta sua), `tolta` (via, e non torna mai: `ricalcola` salta la
// chiave), `superata` (non regge più; si vede novanta giorni sotto «Non
// valgono più», poi sparisce). Se una superata torna a reggere, torna
// osservata.
//
// `perIlRitratto()` è l'unica cosa che arriva a un modello: le righe in
// vigore, in italiano, in terza persona, con i numeri negli stessi secchi
// dell'interfaccia (così il testo cambia solo quando cambia un secchio e la
// cache del prompt regge), e mai un titolo, un percorso o un indirizzo.

import { basename } from 'node:path'
import { createHash } from 'node:crypto'
import db, { cursore, documento, DOMINI_DI_TUTTI, segnaCursore } from './store.ts'
import * as chi from './chi.ts'
import * as fuso from './fuso.ts'
import * as segnali from './segnali.ts'
import { senzaTrattini } from './testo.ts'
import { contieneRichiesta, indirizzoAttenzione, mittenteAutomatico } from './rilevanza.ts'
import { cercatoreDiProgetti } from './attenzione.ts'
import * as progetti from './progetti.ts'

const GIORNO = 86_400_000
/** Da qui in su una riga osservata vale da sola (tranne le app). */
export const CASI_DA_SOLA = 20
/** Un giorno attivo: almeno trenta minuti di sessioni. */
export const MINUTI_GIORNO_ATTIVO = 30
/** Quanto resta una riga superata prima di sparire. */
export const GIORNI_SUPERATA = 90
/** Entro quanto si può annullare un «togli». */
export const MINUTI_ANNULLA = 10

export type Stato = 'osservata' | 'tenuta' | 'corretta' | 'tolta' | 'superata'
export type Esempio = { quando: string; testo: string; doc: string | null; trattenuta?: boolean }
/**
 * `soglia`, `mostra` e `dal` sono delle regole nate dai suoi gesti (F7): da
 * quanti casi vale, da quanti si vede, e quando è entrata in vigore.
 */
export type Prova = { casi: number; su: number | null; esempi: Esempio[]; soglia?: number; mostra?: number; dal?: string }
export type Abitudine = {
  chiave: string; genere: string; dati: Record<string, string | number>; prova: Prova; fiducia: number
  stato: Stato; testoSuo: string | null; visto: string; aggiornato: string; tolta: string | null
}
export type AbitudineVista = {
  chiave: string; genere: string; dati: Record<string, string | number>; testoSuo: string | null; casi: number; su: number | null
  stato: 'osservata' | 'tenuta' | 'corretta' | 'superata'; inVigore: boolean; fino: string | null; esempi: Esempio[]
  /** Solo per i filtri del feed: quante cose ha tenuto fuori negli ultimi sette giorni. */
  trattenute?: number
}
type Candidata = { chiave: string; genere: string; dati: Record<string, string | number>; prova: Prova; fiducia: number }

/** I generi che valgono da soli a venti casi. Le app no: sono un sensore. */
const DA_SOLA = new Set(['posta.risponde_sempre', 'posta.lascia', 'posta.tempo', 'posta.ore', 'agenda.sposta', 'agenda.rifiuta', 'codice.con_agenti'])

const genereDi = (chiave: string) => chiave.split(':')[0]!

/** Una regola sul tono delle bozze vale da due correzioni uguali, senza un tocco (F7). */
export const CASI_TONO = 2
/** Un filtro del feed vale da tre scarti dello stesso genere; un mittente automatico da uno (F7). */
export const CASI_FILTRO = 3
/** Le regole nate dai suoi gesti: si contano diversamente e non vanno mai nel ritratto. */
const DAI_GESTI = new Set(['bozza.tono', 'feed.filtro'])

/** La riga conta nel ragionamento di Myynd. */
export function inVigore(a: Pick<Abitudine, 'genere' | 'stato' | 'prova'>): boolean {
  if (a.stato === 'tenuta' || a.stato === 'corretta') return true
  if (a.stato !== 'osservata') return false
  if (DAI_GESTI.has(a.genere)) return a.prova.casi >= (a.prova.soglia ?? (a.genere === 'bozza.tono' ? CASI_TONO : CASI_FILTRO))
  return DA_SOLA.has(a.genere) && (a.prova.su ?? a.prova.casi) >= CASI_DA_SOLA
}

const mediana = (xs: number[]): number => {
  if (!xs.length) return 0
  const s = xs.slice().sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

// — i conti —

type Arr = segnali.SegnaleArrivata
type Inv = segnali.SegnaleInviata

function righePosta(adesso: Date): Candidata[] {
  const fuori: Candidata[] = []
  const da90 = new Date(adesso.getTime() - 90 * GIORNO).toISOString()
  const da30 = new Date(adesso.getTime() - 30 * GIORNO).toISOString()
  const ora = adesso.toISOString()
  const miei = segnali.mieiIndirizzi()
  const arrivate = segnali.arrivate(da90, ora)
  const inviate = segnali.inviate(da90, ora)
  if (!inviate.length) return fuori
  const coppie = segnali.coppieRisposta(arrivate, inviate, miei)
  const risposta = new Map<string, Inv & { latenza: number }>()
  const perId = new Map(inviate.map(s => [s.id, s]))
  for (const c of coppie) { const s = perId.get(c.inviata); if (s) risposta.set(c.arrivata, { ...s, latenza: c.latenza }) }
  // la copertura: da quando c'è posta mandata (con una settimana di margine, perché la
  // prima mandata risponde a una arrivata prima), le mail arrivate si possono giudicare
  const primaInviata = inviate.reduce((m, s) => (s.quando < m ? s.quando : m), ora)
  const copertura = new Date(Date.parse(primaInviata) - 7 * GIORNO).toISOString()
  const giudicabili = new Date(adesso.getTime() - GIORNO).toISOString()

  // per mittente
  const perMittente = new Map<string, Arr[]>()
  for (const a of arrivate) {
    if (a.quando < copertura || a.quando > giudicabili) continue
    const l = perMittente.get(a.chi) ?? []; l.push(a); perMittente.set(a.chi, l)
  }
  for (const [addr, mail] of perMittente) {
    const risposte = mail.filter(m => risposta.has(m.id))
    const rate = risposte.length / mail.length
    const nome = segnali.nomeMostrabile(mail[mail.length - 1]!.dati.nome, addr)
    const esempi = (xs: Arr[]) => xs.slice(-5).reverse().map(m => ({ quando: m.quando, testo: m.dati.titolo, doc: m.ref }))
    if (mail.length >= 5 && rate >= 0.85) {
      const latenzaMin = Math.round(mediana(risposte.map(m => risposta.get(m.id)!.latenza)) / 60)
      fuori.push({ chiave: `posta.risponde_sempre:${addr}`, genere: 'posta.risponde_sempre', dati: { nome, latenzaMin }, prova: { casi: risposte.length, su: mail.length, esempi: esempi(risposte) }, fiducia: rate })
    } else if (mail.length >= 6 && rate <= 0.1) {
      const lasciate = mail.filter(m => !risposta.has(m.id))
      fuori.push({ chiave: `posta.lascia:${addr}`, genere: 'posta.lascia', dati: { nome }, prova: { casi: lasciate.length, su: mail.length, esempi: esempi(lasciate) }, fiducia: 1 - rate })
    }
  }

  // i tempi e le ore, sugli ultimi trenta giorni di risposte
  const recenti = [...risposta.entries()].filter(([, s]) => s.quando >= da30)
  if (recenti.length >= 10) {
    const latenzaMin = Math.round(mediana(recenti.map(([, s]) => s.latenza)) / 60)
    const esempi = recenti.slice(-5).reverse().map(([id, s]) => ({ quando: s.quando, testo: arrivate.find(a => a.id === id)?.dati.titolo ?? '', doc: s.ref }))
    fuori.push({ chiave: 'posta.tempo', genere: 'posta.tempo', dati: { latenzaMin }, prova: { casi: recenti.length, su: null, esempi }, fiducia: 1 })
    const ore = recenti.map(([, s]) => fuso.parti(new Date(s.quando)).ora)
    let meglio = { da: 0, n: 0 }
    for (let h = 0; h < 24; h++) {
      const n = ore.filter(o => (o - h + 24) % 24 < 3).length
      if (n > meglio.n) meglio = { da: h, n }
    }
    if (meglio.n / recenti.length >= 0.35) {
      // il perché: le ultime risposte scritte dentro quelle tre ore
      const dentro = recenti.filter(([, s]) => (fuso.parti(new Date(s.quando)).ora - meglio.da + 24) % 24 < 3)
      const esempiOre = dentro.slice(-5).reverse().map(([id, s]) => ({ quando: s.quando, testo: arrivate.find(a => a.id === id)?.dati.titolo ?? '', doc: s.ref }))
      fuori.push({ chiave: 'posta.ore', genere: 'posta.ore', dati: { da: meglio.da, a: (meglio.da + 3) % 24 }, prova: { casi: meglio.n, su: recenti.length, esempi: esempiOre }, fiducia: meglio.n / recenti.length })
    }
  }
  return fuori
}

type Vista = { uid: string; titolo: string | null; inizio: string | null; originale: string | null; mio: string | null; organizzatore: string | null }

/** La serie di un'occorrenza: il testo prima della prima barra (`UID|inizio originale`), o la chiave intera per un impegno singolo. */
const serieDi = (uid: string) => uid.split('|')[0]!

/**
 * Le righe dell'agenda si contano sul passato: le occorrenze già avvenute
 * nella finestra, mai quelle future (un'agenda ne porta sei mesi). E un
 * invito è una serie, non un'occorrenza: rifiutare una riunione settimanale è
 * una decisione sola, non trenta.
 */
function righeAgenda(adesso: Date): Candidata[] {
  const fuori: Candidata[] = []
  const da30 = new Date(adesso.getTime() - 30 * GIORNO).toISOString()
  const da90 = new Date(adesso.getTime() - 90 * GIORNO).toISOString()
  const ora = adesso.toISOString()
  const viste = db.prepare('SELECT uid, titolo, inizio, originale, mio, organizzatore FROM agenda_viste').all() as Vista[]
  const passate = viste.filter(v => v.originale && v.originale <= ora)
  // gli spostamenti: sulle stesse occorrenze del denominatore, quelle avvenute negli ultimi trenta giorni
  const occorrenze = passate.filter(v => v.originale! >= da30)
  const chiavi = new Set(occorrenze.map(v => v.uid))
  const spostate = segnali.leggi('agenda.spostato', da90, ora).filter(s => s.ref && chiavi.has(s.ref))
  const spostateRef = new Set(spostate.map(s => s.ref))
  if (occorrenze.length >= 10) {
    const quota = spostateRef.size / occorrenze.length
    if (quota >= 0.1) {
      fuori.push({ chiave: 'agenda.sposta', genere: 'agenda.sposta', dati: { ogni: Math.max(1, Math.round(1 / quota)) },
        prova: { casi: spostateRef.size, su: occorrenze.length, esempi: spostate.slice(-5).reverse().map(s => ({ quando: s.quando, testo: String(s.dati.titolo ?? ''), doc: null })) }, fiducia: quota })
    }
  }
  // gli inviti per chi organizza: una serie è un invito; rifiutato se ogni sua occorrenza passata lo è
  const perOrganizzatore = new Map<string, { nome: string; serie: Map<string, Vista[]> }>()
  for (const v of passate) {
    const o = segnali.organizzatoreDi(v.organizzatore)
    if (!o || v.originale! < da90) continue
    const l = perOrganizzatore.get(o.indirizzo) ?? { nome: o.nome, serie: new Map<string, Vista[]>() }
    const s = l.serie.get(serieDi(v.uid)) ?? []
    s.push(v); l.serie.set(serieDi(v.uid), s); l.nome = o.nome; perOrganizzatore.set(o.indirizzo, l)
  }
  for (const [addr, { nome, serie }] of perOrganizzatore) {
    const inviti = [...serie.values()].map(occ => occ.slice().sort((x, y) => x.originale!.localeCompare(y.originale!)))
    const rifiutati = inviti.filter(occ => occ.every(v => v.mio === 'DECLINED'))
    if (inviti.length >= 4 && rifiutati.length / inviti.length >= 0.75) {
      const ultime = rifiutati.map(occ => occ[occ.length - 1]!).sort((x, y) => x.originale!.localeCompare(y.originale!))
      fuori.push({ chiave: `agenda.rifiuta:${addr}`, genere: 'agenda.rifiuta', dati: { nome },
        prova: { casi: rifiutati.length, su: inviti.length, esempi: ultime.slice(-5).reverse().map(v => ({ quando: v.inizio ?? '', testo: v.titolo ?? '', doc: null })) }, fiducia: rifiutati.length / inviti.length })
    }
  }
  return fuori
}

/** Su quanti giorni si contano le cartelle con un agente: un mese, non due settimane (F6: il primo giorno le sessioni ci sono già). */
export const GIORNI_AGENTI = 30

function righeLavoro(adesso: Date): Candidata[] {
  const fuori: Candidata[] = []
  const da14 = fuso.giornoIn(new Date(adesso.getTime() - 14 * GIORNO))
  const oggi = fuso.giornoIn(adesso)
  const righe = db.prepare('SELECT giorno, app, inizio, fine, secondi, cartella FROM sessioni_app WHERE giorno >= ? AND giorno < ?').all(da14, oggi) as
    { giorno: string; app: string; inizio: string; fine: string; secondi: number; cartella: string | null }[]
  const perGiorno = new Map<string, typeof righe>()
  for (const r of righe) { const l = perGiorno.get(r.giorno) ?? []; l.push(r); perGiorno.set(r.giorno, l) }
  const attivi = [...perGiorno.entries()].filter(([, l]) => l.reduce((s, r) => s + r.secondi, 0) >= MINUTI_GIORNO_ATTIVO * 60)
  const giorniAttivi = new Set(attivi.map(([g]) => g))
  if (attivi.length >= 5) {
    const perApp = new Map<string, number>()
    for (const [, l] of attivi) for (const r of l) perApp.set(r.app, (perApp.get(r.app) ?? 0) + r.secondi)
    const [app] = [...perApp.entries()].sort((a, b) => b[1] - a[1])[0]!
    const oreGiorno = Math.round(mediana(attivi.map(([, l]) => l.filter(r => r.app === app).reduce((s, r) => s + r.secondi, 0) / 3600)) * 10) / 10
    fuori.push({ chiave: 'app.principale', genere: 'app.principale', dati: { app, oreGiorno }, prova: { casi: attivi.length, su: null, esempi: [] }, fiducia: 1 })
    const minuto = (iso: string) => { const p = fuso.parti(new Date(iso)); return p.ora * 60 + p.minuti }
    const da = Math.round(mediana(attivi.map(([, l]) => Math.min(...l.map(r => minuto(r.inizio))))))
    const a = Math.round(mediana(attivi.map(([, l]) => Math.max(...l.map(r => minuto(r.fine))))))
    fuori.push({ chiave: 'app.giornata', genere: 'app.giornata', dati: { da, a }, prova: { casi: attivi.length, su: null, esempi: [] }, fiducia: 1 })
  }
  // le cartelle con un agente: i giorni con una sessione, sui giorni attivi
  const sessioniCodice = segnali.leggi('codice.sessione', new Date(adesso.getTime() - GIORNI_AGENTI * GIORNO).toISOString(), adesso.toISOString())
  const commit = segnali.leggi('codice.commit', new Date(adesso.getTime() - GIORNI_AGENTI * GIORNO).toISOString(), adesso.toISOString())
  for (const s of [...sessioniCodice, ...commit]) if (s.giorno && s.giorno < oggi) giorniAttivi.add(s.giorno)
  const perCartella = new Map<string, Map<string, string>>()
  for (const s of sessioniCodice) {
    if (!s.ref || !s.giorno || s.giorno >= oggi) continue
    const c = basename(s.ref)
    const m = perCartella.get(c) ?? new Map<string, string>()
    m.set(s.giorno, s.chi ?? 'Claude Code'); perCartella.set(c, m)
  }
  for (const [cartella, giorni] of perCartella) {
    if (giorni.size >= 5 && giorniAttivi.size && giorni.size / giorniAttivi.size >= 0.6) {
      const agenti = [...giorni.values()]
      const agente = agenti.sort((x, y) => agenti.filter(v => v === y).length - agenti.filter(v => v === x).length)[0]!
      fuori.push({ chiave: `codice.con_agenti:${cartella}`, genere: 'codice.con_agenti', dati: { cartella, agente },
        prova: { casi: giorni.size, su: giorniAttivi.size, esempi: [...giorni.keys()].sort().slice(-5).reverse().map(g => ({ quando: `${g}T12:00:00.000Z`, testo: cartella, doc: null })) }, fiducia: giorni.size / giorniAttivi.size })
    }
  }
  return fuori
}

// — il primo giorno (F6): l'agenda, i commit, le chat —
//
// Tre righe che si contano sui novanta giorni letti all'installazione, così
// «Come lavori» non è vuota la prima sera. Nessuna vale da sola (non stanno in
// `DA_SOLA`): aspettano Tienila prima di arrivare a un modello, come le app.

/** Una riunione di un giorno intero non ha un'ora: la prima riga del corpo lo dice. */
const TUTTO_IL_GIORNO = /, (?:tutto il giorno|all day)\.$/

/** Quante riunioni passate servono, e che quota deve stare nelle tre ore. */
export const RIUNIONI_MIN = 15
export const QUOTA_ORE_RIUNIONI = 0.5

/**
 * Le ore delle riunioni: la fascia di tre ore dove sta almeno metà delle
 * riunioni già avvenute negli ultimi novanta giorni, se sono almeno quindici.
 * Si leggono dall'indice (l'agenda iCal e quella del Mac), non da
 * `agenda_viste`: un evento del Mac non ha un organizzatore, ma ha un'ora.
 */
function righeAgendaOre(adesso: Date): Candidata[] {
  const da90 = new Date(adesso.getTime() - 90 * GIORNO).toISOString()
  const eventi = (db.prepare("SELECT id, titolo, quando, corpo FROM documenti WHERE tipo = 'evento' AND quando >= ? AND quando < ? ORDER BY quando").all(da90, adesso.toISOString()) as
    { id: string; titolo: string; quando: string; corpo: string | null }[])
    .filter(e => !TUTTO_IL_GIORNO.test(String(e.corpo ?? '').split('\n')[0] ?? ''))
  if (eventi.length < RIUNIONI_MIN) return []
  const ore = eventi.map(e => fuso.parti(new Date(e.quando)).ora)
  let meglio = { da: 0, n: 0 }
  for (let h = 0; h < 24; h++) {
    const n = ore.filter(o => (o - h + 24) % 24 < 3).length
    if (n > meglio.n) meglio = { da: h, n }
  }
  if (meglio.n / eventi.length < QUOTA_ORE_RIUNIONI) return []
  const dentro = eventi.filter((_, i) => (ore[i]! - meglio.da + 24) % 24 < 3)
  return [{ chiave: 'agenda.ore', genere: 'agenda.ore', dati: { da: meglio.da, a: (meglio.da + 3) % 24 },
    prova: { casi: meglio.n, su: eventi.length, esempi: dentro.slice(-5).reverse().map(e => ({ quando: e.quando, testo: String(e.titolo ?? '').slice(0, 80), doc: e.id })) },
    fiducia: meglio.n / eventi.length }]
}

/** Quanti commit suoi servono, e che quota deve avere la cartella dove ne fa di più. */
export const COMMIT_MIN = 10
export const QUOTA_COMMIT = 0.5

/** La cartella dove fa la maggior parte dei suoi commit, sui novanta giorni: con i messaggi dei commit come perché. */
function righeCommit(adesso: Date): Candidata[] {
  const commit = segnali.leggi('codice.commit', new Date(adesso.getTime() - 90 * GIORNO).toISOString(), adesso.toISOString())
    .filter(c => c.ref)
  if (commit.length < COMMIT_MIN) return []
  const perCartella = new Map<string, typeof commit>()
  for (const c of commit) { const k = basename(c.ref!); const l = perCartella.get(k) ?? []; l.push(c); perCartella.set(k, l) }
  const [cartella, suoi] = [...perCartella.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0]!
  if (suoi.length / commit.length < QUOTA_COMMIT) return []
  const giorni = new Set(suoi.map(c => c.giorno).filter(Boolean)).size
  return [{ chiave: `codice.commit:${cartella}`, genere: 'codice.commit', dati: { cartella, giorni },
    prova: { casi: suoi.length, su: commit.length, esempi: suoi.slice(-5).reverse().map(c => ({ quando: c.quando, testo: String(c.dati.messaggio ?? '').slice(0, 80), doc: null })) },
    fiducia: suoi.length / commit.length }]
}

/** In quanti giorni diversi un progetto deve tornare nelle chat esportate. */
export const GIORNI_CHAT = 5

/**
 * I progetti di cui parla con ChatGPT e con Claude: le conversazioni esportate
 * (non le sessioni di codice, che hanno già la loro riga) che nominano un
 * progetto attivo, in almeno cinque giorni diversi degli ultimi novanta.
 */
function righeChat(adesso: Date): Candidata[] {
  const da90 = new Date(adesso.getTime() - 90 * GIORNO).toISOString()
  const chat = db.prepare(`SELECT id, titolo, corpo, quando FROM documenti
    WHERE (id LIKE 'conversazioni:chatgpt:%' OR id LIKE 'conversazioni:claude:%') AND quando >= ? AND quando < ? ORDER BY quando`)
    .all(da90, adesso.toISOString()) as { id: string; titolo: string; corpo: string | null; quando: string }[]
  if (!chat.length) return []
  const progetto = cercatoreDiProgetti()
  const perProgetto = new Map<string, typeof chat>()
  for (const c of chat) {
    const p = progetto(`${c.titolo}\n${String(c.corpo ?? '').slice(0, 4000)}`)
    if (!p) continue
    const l = perProgetto.get(p) ?? []; l.push(c); perProgetto.set(p, l)
  }
  const fuori: Candidata[] = []
  for (const [id, xs] of perProgetto) {
    const giorni = new Set(xs.map(c => fuso.giornoIn(new Date(c.quando))))
    const nome = progetti.trova(id)?.nome
    if (giorni.size < GIORNI_CHAT || !nome) continue
    fuori.push({ chiave: `chat.progetto:${id}`, genere: 'chat.progetto', dati: { progetto: id, nome },
      prova: { casi: giorni.size, su: null, esempi: xs.slice(-5).reverse().map(c => ({ quando: c.quando, testo: String(c.titolo ?? '').slice(0, 80), doc: c.id })) }, fiducia: 1 })
  }
  return fuori
}

// — leggere e scrivere —

type Riga = { chiave: string; genere: string; dati: string; prova: string; fiducia: number; stato: Stato; testoSuo: string | null; visto: string; aggiornato: string; tolta: string | null }

const json = <T>(s: string, altrimenti: T): T => { try { return JSON.parse(s) as T } catch { return altrimenti } }
const daRiga = (r: Riga): Abitudine => ({
  ...r, dati: json(r.dati, {}), prova: json(r.prova, { casi: 0, su: null, esempi: [] })
})

function righe(): Abitudine[] {
  return (db.prepare('SELECT * FROM abitudini').all() as Riga[]).map(daRiga)
}

/**
 * Mette le candidate nella tabella, e decide delle righe che non reggono più.
 *
 * `tocca` dice quali righe esistenti questo giro può far decadere: le regole
 * sul tono nascono dalle correzioni, una per volta, e nessun conto di notte le
 * può rifare; i filtri del feed si rifanno dalla tabella del feed, e uno che
 * non regge più (una carta riaperta con «Annulla») se ne va senza passare da
 * «Non valgono più»: era una riga contata, non una cosa che lei ha visto
 * valere. Torna le righe che sono appena entrate in vigore.
 */
function applica(candidate: Candidata[], tocca: (genere: string, chiave: string) => boolean, adesso: Date): { righe: number; entrate: Candidata[] } {
  const ora = adesso.toISOString()
  const esistenti = new Map(righe().map(r => [r.chiave, r]))
  const ins = db.prepare(`INSERT INTO abitudini (chiave, genere, dati, prova, fiducia, stato, testoSuo, visto, aggiornato, tolta) VALUES (?,?,?,?,?,?,?,?,?,NULL)`)
  const upd = db.prepare('UPDATE abitudini SET dati = ?, prova = ?, fiducia = ?, stato = ?, aggiornato = ? WHERE chiave = ?')
  const viste = new Set<string>()
  const entrate: Candidata[] = []
  let n = 0
  const mia = !db.isTransaction
  if (mia) db.exec('BEGIN')
  try {
    for (const c of candidate) {
      viste.add(c.chiave)
      const e = esistenti.get(c.chiave)
      if (e?.stato === 'tolta') continue
      n++
      const stato: Stato = !e || e.stato === 'superata' ? 'osservata' : e.stato
      const prima = !!e && inVigore(e)
      const dopo = inVigore({ genere: c.genere, stato, prova: c.prova })
      const prova: Prova = { ...c.prova }
      if (dopo && DAI_GESTI.has(c.genere)) prova.dal = prima && e?.prova.dal ? e.prova.dal : ora
      if (dopo && !prima) entrate.push(c)
      if (!e) { ins.run(c.chiave, c.genere, JSON.stringify(c.dati), JSON.stringify(prova), c.fiducia, 'osservata', null, ora, ora); continue }
      upd.run(JSON.stringify(c.dati), JSON.stringify(prova), c.fiducia, stato, ora, c.chiave)
    }
    for (const e of esistenti.values()) {
      if (viste.has(e.chiave) || e.stato === 'tolta' || e.stato === 'corretta') continue
      if (!tocca(e.genere, e.chiave)) continue
      if (e.genere === 'feed.filtro') {
        // tenuta da lei resta com'è; una contata e basta si rifà dalla tabella, o non c'è
        if (e.stato !== 'tenuta') db.prepare('DELETE FROM abitudini WHERE chiave = ?').run(e.chiave)
        continue
      }
      if (e.stato === 'superata') {
        if (Date.parse(e.aggiornato) < adesso.getTime() - GIORNI_SUPERATA * GIORNO) db.prepare('DELETE FROM abitudini WHERE chiave = ?').run(e.chiave)
        continue
      }
      db.prepare("UPDATE abitudini SET stato = 'superata', aggiornato = ? WHERE chiave = ?").run(ora, e.chiave)
    }
    scordaTolte(adesso)
    if (mia) db.exec('COMMIT')
  } catch (e) { if (mia) db.exec('ROLLBACK'); throw e }
  return { righe: n, entrate }
}

/** I temi li scrive la deduzione di `domande.ts`, non un conto: nessun giro li fa decadere. */
const eTema = (chiave: string) => chiave.startsWith('feed.filtro:tema:')

/**
 * Rifà tutte le righe dai fatti. Di notte, e dentro «cancella le osservazioni».
 *
 * Una `tolta` non rinasce; una `corretta` tiene le sue parole; una che non regge
 * più diventa `superata` (dalla data in `aggiornato`), e se torna a reggere torna
 * `osservata`. Le superate da più di novanta giorni se ne vanno. Le regole sul
 * tono delle bozze e i temi del feed non si toccano: nascono da un gesto, non
 * da un conto che si possa rifare.
 *
 * Chiamata dentro una transazione già aperta (la cancellazione) si unisce a
 * quella: una pressione, una transazione, e un errore qui riporta indietro
 * anche le cancellazioni. Da sola, apre la sua.
 */
export function ricalcola(adesso = new Date(), o: { senzaPosta?: boolean } = {}): { righe: number } {
  // senza la posta (il registro è indietro): le righe sulla posta non si rifanno e non si toccano
  const candidate = [...(o.senzaPosta ? [] : righePosta(adesso)), ...righeAgenda(adesso), ...righeAgendaOre(adesso), ...righeLavoro(adesso),
    ...righeCommit(adesso), ...righeChat(adesso), ...righeFeed(adesso)]
  const tocca = (genere: string, chiave: string) => genere !== 'bozza.tono' && !eTema(chiave) && !(o.senzaPosta && genere.startsWith('posta.'))
  return { righe: applica(candidate, tocca, adesso).righe }
}

/**
 * Le righe per la pagina: tutte tranne le tolte. Un esempio porta il suo
 * documento solo se è ancora nell'indice: «Portami lì» si mostra solo dove porta.
 */
export function tutte(adesso = new Date()): AbitudineVista[] {
  const c = db.prepare('SELECT 1 FROM documenti WHERE id = ?')
  const esiste = (id: string) => !!c.get(id)
  // una regola dai gesti si vede da `mostra` casi in su: una frase tolta una volta sola non è ancora niente
  return righe().filter(r => r.stato !== 'tolta' && r.prova.casi >= (r.prova.mostra ?? 0)).map(r => {
    const esempi = (r.prova.esempi ?? []).map(e => ({ ...e, doc: e.doc && esiste(e.doc) ? e.doc : null }))
    const v: AbitudineVista = {
      chiave: r.chiave, genere: r.genere, dati: r.dati, testoSuo: r.testoSuo, casi: r.prova.casi, su: r.prova.su,
      stato: r.stato as AbitudineVista['stato'], inVigore: inVigore(r), fino: r.stato === 'superata' ? r.aggiornato : null, esempi
    }
    // un filtro dice anche cosa tiene fuori: le ultime tre, in cima al perché, con «Portami lì»
    if (r.genere === 'feed.filtro' && !eTema(r.chiave)) {
      const t = trattenute(r.chiave, adesso)
      v.trattenute = t.n
      v.esempi = [...t.esempi.map(e => ({ ...e, doc: e.doc && esiste(e.doc) ? e.doc : null })), ...esempi].slice(0, 6)
    }
    return v
  }).sort((a, b) => (b.su ?? b.casi) - (a.su ?? a.casi) || a.chiave.localeCompare(b.chiave))
}

/**
 * Tienila, correggila, toglila, o rimettila com'era (entro dieci minuti).
 * Torna il testo com'è salvato: dopo un «correggi» la pagina mostra quello,
 * senza lineette, non quello battuto.
 */
export function cambia(chiave: string, azione: 'tieni' | 'correggi' | 'togli' | 'ripristina', testo?: string, prima?: string, adesso = new Date()): { testoSuo: string | null } {
  if (!['tieni', 'correggi', 'togli', 'ripristina'].includes(azione)) throw new Error('Azione sconosciuta.')
  const r = db.prepare('SELECT * FROM abitudini WHERE chiave = ?').get(chiave) as Riga | undefined
  if (!r) throw new Error('Non la trovo.')
  const ora = adesso.toISOString()
  switch (azione) {
    case 'tieni':
      db.prepare("UPDATE abitudini SET stato = 'tenuta', tolta = NULL WHERE chiave = ?").run(chiave); break
    case 'correggi': {
      const suo = senzaTrattini(String(testo ?? '')).trim()
      if (suo.length < 3 || suo.length > 300) throw new Error('Scrivila in poche parole.')
      db.prepare("UPDATE abitudini SET stato = 'corretta', testoSuo = ?, tolta = NULL WHERE chiave = ?").run(suo, chiave); break
    }
    case 'togli':
      db.prepare("UPDATE abitudini SET stato = 'tolta', tolta = ? WHERE chiave = ?").run(ora, chiave); break
    case 'ripristina': {
      const ok = prima === 'osservata' || prima === 'tenuta' || prima === 'corretta'
      const fresca = r.stato === 'tolta' && !!r.tolta && adesso.getTime() - Date.parse(r.tolta) <= MINUTI_ANNULLA * 60_000
      if (!ok || !fresca) throw new Error('È passato troppo tempo per annullare.')
      db.prepare('UPDATE abitudini SET stato = ?, tolta = NULL WHERE chiave = ?').run(prima, chiave); break
    }
  }
  return { testoSuo: (db.prepare('SELECT testoSuo FROM abitudini WHERE chiave = ?').get(chiave) as { testoSuo: string | null }).testoSuo }
}

// — le frasi per il modello, in italiano, in secchi —

/** Gli stessi secchi della pagina (src/gemello-frasi.ts): il testo cambia solo se cambia il secchio. */
export function durata(min: number): string {
  if (min <= 60) return 'un’ora'
  if (min <= 180) return '3 ore'
  if (min <= 480) return 'qualche ora'
  if (min <= 1440) return 'un giorno'
  return `${Math.round(min / 1440)} giorni`
}
const oraIt = (minutiDelGiorno: number) => String(Math.round(minutiDelGiorno / 60) % 24)

function fraseIt(a: Abitudine): string {
  const d = a.dati
  // un nome con la chiocciola è un indirizzo: non entra in un prompt, la riga si salta
  if (typeof d.nome === 'string' && d.nome.includes('@')) return ''
  switch (a.genere) {
    case 'posta.risponde_sempre': return `A ${d.nome} risponde sempre, di solito entro ${durata(Number(d.latenzaMin))}.`
    case 'posta.lascia': return `Le mail di ${d.nome} di solito restano senza risposta.`
    case 'posta.tempo': return `Di solito risponde entro ${durata(Number(d.latenzaMin))}.`
    case 'posta.ore': return `Scrive le risposte soprattutto tra le ${d.da} e le ${d.a}.`
    case 'agenda.sposta': return `Sposta una riunione su ${d.ogni}.`
    case 'agenda.rifiuta': return `Rifiuta gli inviti di ${d.nome}.`
    case 'app.principale': return `Passa più tempo in ${d.app}, ${String(d.oreGiorno).replace('.', ',')} ore al giorno.`
    case 'app.giornata': return `Comincia verso le ${oraIt(Number(d.da))} e smette verso le ${oraIt(Number(d.a))}.`
    case 'codice.con_agenti': return `Su ${d.cartella} lavora con ${d.agente} quasi ogni giorno.`
    case 'agenda.ore': return `Le sue riunioni stanno soprattutto tra le ${d.da} e le ${d.a}.`
    case 'codice.commit': return `La maggior parte dei suoi commit va su ${d.cartella}.`
    case 'chat.progetto': return `Parla spesso di ${d.nome} con ChatGPT e Claude.`
    default: return ''
  }
}

/** Al massimo tante righe e tanti caratteri nel ritratto. */
export const RIGHE_RITRATTO = 8
export const CARATTERI_RITRATTO = 500

/**
 * Per `memoria.carta()`: al massimo otto righe e cinquecento caratteri, o niente.
 *
 * Le righe confermate da lei (tenute o scritte da lei) hanno la precedenza
 * sul posto: sono parole sue. Un'intestazione compare solo se sotto ha
 * almeno una riga, anche dopo il taglio dei cinquecento caratteri.
 */
export function perIlRitratto(): string {
  // le regole dai gesti hanno i loro posti (la voce delle bozze, l'ammissione del feed): nel ritratto no
  const valide = righe().filter(r => !DAI_GESTI.has(r.genere) && inVigore(r)).sort((a, b) => a.chiave.localeCompare(b.chiave))
  const pulita = (f: string) => senzaTrattini(f).trim()
  const confermate = valide.filter(a => a.stato !== 'osservata').map(a => a.stato === 'corretta' && a.testoSuo ? a.testoSuo : fraseIt(a)).map(pulita).filter(Boolean).slice(0, RIGHE_RITRATTO)
  const misurate = valide.filter(a => a.stato === 'osservata').map(fraseIt).map(pulita).filter(Boolean).slice(0, RIGHE_RITRATTO - confermate.length)
  const blocchi: { titolo: string; frasi: string[] }[] = [
    { titolo: 'Come lavora, misurato su almeno 20 casi:', frasi: misurate },
    { titolo: 'Come lavora, confermato da lei:', frasi: confermate }
  ]
  const testo = () => blocchi.filter(b => b.frasi.length).flatMap(b => [b.titolo, ...b.frasi.map(f => `· ${f}`)]).join('\n')
  // sopra i cinquecento caratteri si toglie prima una riga misurata, poi una confermata
  let t = testo()
  while (t.length > CARATTERI_RITRATTO) {
    const b = blocchi[0]!.frasi.length ? blocchi[0]! : blocchi[1]!
    if (!b.frasi.length) break
    b.frasi.pop()
    t = testo()
  }
  return t
}

/** Per il feed e la preparazione delle risposte: com'è messo un mittente. */
export function perMittente(addr: string): { risponde: number; latenzaMin: number | null; casi: number; inVigore: boolean } | null {
  const a = addr.trim().toLowerCase()
  const r = righe().find(x => (x.chiave === `posta.risponde_sempre:${a}` || x.chiave === `posta.lascia:${a}`) && x.stato !== 'tolta')
  if (!r) return null
  return { risponde: r.genere === 'posta.lascia' ? 1 - r.fiducia : r.fiducia, latenzaMin: r.dati.latenzaMin != null ? Number(r.dati.latenzaMin) : null, casi: r.prova.su ?? r.prova.casi, inVigore: inVigore(r) }
}

/** Per il resoconto della settimana (P9): le righe nate da quel momento, non tolte. */
export function imparateDal(iso: string): { chiave: string; genere: string; dati: object }[] {
  return righe().filter(r => r.stato !== 'tolta' && r.visto >= iso).map(r => ({ chiave: r.chiave, genere: r.genere, dati: r.dati }))
}


// — le regole nate dai suoi gesti (F7) —
//
// «I don't feel like it's learning from how I work.» Imparava, ma non si
// vedeva e non pesava: una correzione a una bozza diventava una convinzione
// indotta che nessun prompt leggeva finché lei non la teneva; tre scarti di
// fila facevano scrivere in chat «smetto di riproportela» e il feed non lo
// sapeva. Qui i gesti diventano righe come le altre di «Come lavori», con i
// loro numeri, il perché e il cestino, e valgono da sole:
//
//   · `bozza.tono:<tratto>`: due correzioni uguali a una bozza (il saluto
//     tolto, la chiusura cambiata, il tu al posto del Lei, un terzo più corta,
//     gli elenchi via, la stessa frase tolta due volte). Le scrive
//     `regole-tono.ts`, una correzione alla volta; entrano nella voce di chi
//     scrive le bozze (`voce.perRiga`), rilette a ogni bozza.
//   · `feed.filtro:<specie>:<valore>`: tre «Non è mia» (o scarti senza una
//     parola) sullo stesso mittente, sullo stesso dominio di posta automatica,
//     sullo stesso genere di carta da una fonte; un mittente automatico da uno
//     solo, com'era già. Si rifanno dalla tabella del feed a ogni risposta, così
//     «Annulla» ritira la regola senza altro codice. E i temi, che scrive la
//     deduzione di `domande.ts`: quelli spingono in fondo, non tolgono.
//
// Una tolta non torna, e passati i dieci minuti dell'annulla i suoi numeri e
// i suoi esempi si cancellano davvero: resta solo la chiave, perché non rinasca.

/** Dopo quanti giorni una regola del feed smette di contare uno scarto. */
const GIORNI_FILTRO = 90
/** I motivi che non dicono niente: lo scarto è muto. */
const MUTI = new Set(['', 'non mi interessa.', 'non mi interessa'])
/** Quante regole sul tono arrivano a chi scrive, al massimo. */
export const RIGHE_TONO = 8

/** Passati i dieci minuti dell'annulla, di una regola dai gesti resta solo la chiave. */
function scordaTolte(adesso: Date) {
  const prima = new Date(adesso.getTime() - MINUTI_ANNULLA * 60_000).toISOString()
  db.prepare(`UPDATE abitudini SET dati = '{}', prova = '{"casi":0,"su":null,"esempi":[]}', testoSuo = NULL
    WHERE stato = 'tolta' AND tolta IS NOT NULL AND tolta < ? AND genere IN ('bozza.tono', 'feed.filtro') AND prova != '{"casi":0,"su":null,"esempi":[]}'`).run(prima)
}

type Scarto = { titolo: string; quando: string; fonte: string | null; tipo: string | null; indirizzo: string; nome: string; automatico: boolean; fatto: boolean; da: 'feed' | 'compiti' }

/** Chi aveva scritto il documento dietro una carta: dall'istantanea, o dal documento se c'è ancora. */
function autoreDi(doc: string | null, contesto: string | null): string | null {
  if (contesto) {
    try { const c = JSON.parse(contesto) as { autore?: string | null }; if (c.autore !== undefined) return c.autore ?? null } catch { /* un'istantanea storta non ferma niente */ }
  }
  return doc ? documento(doc)?.autore ?? null : null
}
const nomeDi = (autore: string | null, indirizzo: string) => segnali.nomeDaAutore(autore, indirizzo)

/**
 * Gli scarti che parlano del mittente o del genere di carta: «Non è mia», o
 * senza una parola. «Già fatta», «vecchia» e «non si capisce» parlano d'altro.
 * I mittenti automatici si contano come li conta `mittentiScartati` (anche le
 * righe della lista lasciate, e da sempre): la regola che si vede è quella che
 * agisce, non un'altra.
 */
function scarti(adesso: Date): Scarto[] {
  const da = new Date(adesso.getTime() - GIORNI_FILTRO * GIORNO).toISOString()
  const feed = db.prepare(`SELECT titolo, tipo, fonte, doc, contesto, stato, ragione, motivo, quando, risposto FROM feed WHERE stato IN ('fatto', 'scartato')`).all() as
    { titolo: string; tipo: string | null; fonte: string | null; doc: string | null; contesto: string | null; stato: string; ragione: string | null; motivo: string | null; quando: string; risposto: string | null }[]
  const fuori: Scarto[] = []
  for (const r of feed) {
    const autore = autoreDi(r.doc, r.contesto)
    const indirizzo = indirizzoAttenzione(autore)
    const quando = r.risposto ?? r.quando
    const recente = quando >= da
    const automatico = !!indirizzo && mittenteAutomatico(autore)
    if (r.stato === 'fatto') { if (recente) fuori.push({ titolo: r.titolo, quando, fonte: r.fonte, tipo: r.tipo, indirizzo, nome: '', automatico, fatto: true, da: 'feed' }); continue }
    // come `mittentiScartati`: per una macchina basta non aver detto un'altra ragione
    const perMacchina = r.ragione === null || r.ragione === 'non_mia'
    // per una persona e per un genere di carta: «Non è mia», o uno scarto muto
    const muto = r.ragione === 'non_mia' || (r.ragione === null && MUTI.has((r.motivo ?? '').trim().toLowerCase()))
    if (!(automatico ? perMacchina : muto)) continue
    if (!automatico && !recente) continue
    fuori.push({ titolo: r.titolo, quando, fonte: r.fonte, tipo: r.tipo, indirizzo, nome: indirizzo ? nomeDi(autore, indirizzo) : '', automatico, fatto: false, da: 'feed' })
  }
  const lasciate = db.prepare(`SELECT testo, doc, contesto, COALESCE(sparito, quando) AS q FROM compiti WHERE doc IS NOT NULL AND (stato = 'lasciato' OR sparito IS NOT NULL)`).all() as { testo: string; doc: string | null; contesto: string | null; q: string }[]
  for (const r of lasciate) {
    const autore = autoreDi(r.doc, r.contesto)
    const indirizzo = indirizzoAttenzione(autore)
    if (!indirizzo || !mittenteAutomatico(autore)) continue
    fuori.push({ titolo: r.testo, quando: /^\d{4}-/.test(r.q) ? r.q : adesso.toISOString(), fonte: null, tipo: null, indirizzo, nome: nomeDi(autore, indirizzo), automatico: true, fatto: false, da: 'compiti' })
  }
  return fuori
}

const esempiDi = (xs: Scarto[]): Esempio[] => xs.slice().sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, 5).map(x => ({ quando: x.quando, testo: x.titolo.slice(0, 80), doc: null }))
const perChiave = <T>(xs: T[], k: (x: T) => string) => { const m = new Map<string, T[]>(); for (const x of xs) { const c = k(x); if (!c) continue; const l = m.get(c) ?? []; l.push(x); m.set(c, l) } return m }

/** I filtri del feed, dalla tabella del feed. Solo SQL e conti. */
function righeFeed(adesso: Date): Candidata[] {
  const tutti = scarti(adesso)
  const fatti = new Set(tutti.filter(x => x.fatto && x.indirizzo).map(x => x.indirizzo))
  const contati = tutti.filter(x => !x.fatto)
  const fuori: Candidata[] = []
  // (a) un mittente: una macchina vale da uno scarto; una persona da tre, e si vede da due
  for (const [indirizzo, xs] of perChiave(contati, x => x.indirizzo)) {
    const automatico = xs[0]!.automatico
    const nome = xs.find(x => x.nome)?.nome ?? indirizzo
    if (automatico) {
      fuori.push({ chiave: `feed.filtro:mittente:${indirizzo}`, genere: 'feed.filtro', dati: { specie: 'macchina', nome, indirizzo },
        prova: { casi: xs.length, su: null, esempi: esempiDi(xs), soglia: 1 }, fiducia: 1 })
      continue
    }
    // chi le ha dato anche una carta fatta non è «non mia»: la sua posta a volte è sua
    if (fatti.has(indirizzo) || xs.length < 2) continue
    fuori.push({ chiave: `feed.filtro:mittente:${indirizzo}`, genere: 'feed.filtro', dati: { specie: 'persona', nome, indirizzo },
      prova: { casi: xs.length, su: null, esempi: esempiDi(xs), mostra: 2 }, fiducia: 1 })
  }
  // (b) il dominio della posta automatica: almeno due indirizzi diversi, mai un dominio di tutti
  const macchine = contati.filter(x => x.automatico && x.quando >= new Date(adesso.getTime() - GIORNI_FILTRO * GIORNO).toISOString())
  for (const [dominio, xs] of perChiave(macchine, x => x.indirizzo.slice(x.indirizzo.indexOf('@') + 1))) {
    if (DOMINI_DI_TUTTI.has(dominio) || new Set(xs.map(x => x.indirizzo)).size < 2) continue
    fuori.push({ chiave: `feed.filtro:dominio:${dominio}`, genere: 'feed.filtro', dati: { specie: 'dominio', dominio },
      prova: { casi: xs.length, su: null, esempi: esempiDi(xs), mostra: 2 }, fiducia: 1 })
  }
  // (c) un genere di carta da una fonte: solo «Da leggere», le altre chiedono qualcosa a lei. E un genere
  // è un disegno fra mittenti diversi: tre carte di Tom dicono qualcosa di Tom, non di tutta la posta. Si
  // contano i mittenti (le macchine hanno la loro regola), e i casi sono quelli
  const perGenere = contati.filter(x => x.da === 'feed' && x.fonte && x.tipo === 'Da leggere' && !x.automatico)
  for (const [chiave, xs] of perChiave(perGenere, x => `${x.fonte}|${x.tipo}`)) {
    const mittenti = new Set(xs.map(x => x.indirizzo || x.titolo)).size
    if (mittenti < 2) continue
    fuori.push({ chiave: `feed.filtro:tipo:${chiave}`, genere: 'feed.filtro', dati: { specie: 'tipo', fonte: xs[0]!.fonte!, tipo: xs[0]!.tipo! },
      prova: { casi: mittenti, su: null, esempi: esempiDi(xs), mostra: 2 }, fiducia: 1 })
  }
  return fuori
}

export type Imparata = { chiave: string; genere: string; dati: Record<string, string | number> }

/**
 * Rifà i filtri del feed adesso, senza aspettare la notte: dopo ogni scarto,
 * ogni «Fatto» e ogni «Annulla». Torna i filtri appena entrati in vigore: il
 * primo è il «Learned» dell'avviso.
 */
export function ricalcolaFiltri(adesso = new Date()): Imparata[] {
  const { entrate } = applica(righeFeed(adesso), (genere, chiave) => genere === 'feed.filtro' && !eTema(chiave), adesso)
  segnaCursore(CURSORE_FILTRI, adesso.toISOString())
  return entrate.map(c => ({ chiave: c.chiave, genere: c.genere, dati: c.dati }))
}

const CURSORE_FILTRI = 'abitudini:filtri'
const ORA = 3_600_000

/**
 * Il conto dei filtri alla lettura del feed, al massimo una volta l'ora.
 *
 * Rifarlo a ogni lettura voleva dire ripassare tutta la storia del feed, in
 * una scrittura, ogni dieci minuti. Non serve: uno scarto, un «Annulla» e il
 * cestino lo rifanno subito dalle loro rotte, e la notte lo rifà `ricalcola`.
 * Qui resta per quello che cambia senza un gesto nel feed (una riga della
 * lista lasciata, uno scarto che esce dalla finestra dei novanta giorni).
 */
export function ricalcolaFiltriSeServe(adesso = new Date()): void {
  const ultimo = cursore(CURSORE_FILTRI)
  if (ultimo && adesso.getTime() - Date.parse(ultimo) < ORA && adesso.getTime() >= Date.parse(ultimo)) return
  ricalcolaFiltri(adesso)
}

/**
 * Le regole che una carta può far nascere: il suo mittente, il suo dominio, il
 * suo genere. L'avviso dice solo una di queste: un filtro nato da un'altra
 * carta (il primo conto dopo un aggiornamento) non è quello che ha imparato adesso.
 */
export function chiaviDellaCarta(id: string): string[] {
  const r = db.prepare('SELECT doc, contesto, fonte, tipo FROM feed WHERE id = ?').get(id) as { doc: string | null; contesto: string | null; fonte: string | null; tipo: string | null } | undefined
  if (!r) return []
  const a = indirizzoAttenzione(autoreDi(r.doc, r.contesto))
  return [
    ...(a ? [`feed.filtro:mittente:${a}`, `feed.filtro:dominio:${a.slice(a.indexOf('@') + 1)}`] : []),
    ...(r.fonte && r.tipo ? [`feed.filtro:tipo:${r.fonte}|${r.tipo}`] : [])
  ]
}

/** La deduzione di `domande.ts` sui temi scartati: una regola in vigore subito, che spinge in fondo. */
export function regolaTema(tema: string, frase: string, titoli: string[], adesso = new Date()): Imparata | null {
  const chiave = `feed.filtro:tema:${tema}`
  const e = db.prepare('SELECT stato FROM abitudini WHERE chiave = ?').get(chiave) as { stato: Stato } | undefined
  if (e?.stato === 'tolta') return null
  const ora = adesso.toISOString()
  const dati = { specie: 'tema', tema, frase: senzaTrattini(frase).trim().slice(0, 200) }
  const prova: Prova = { casi: titoli.length, su: null, esempi: titoli.slice(0, 5).map(t => ({ quando: ora, testo: t.slice(0, 80), doc: null })), soglia: 1, dal: ora }
  db.prepare(`INSERT INTO abitudini (chiave, genere, dati, prova, fiducia, stato, testoSuo, visto, aggiornato, tolta) VALUES (?, 'feed.filtro', ?, ?, 1, 'osservata', NULL, ?, ?, NULL)
    ON CONFLICT(chiave) DO UPDATE SET dati = excluded.dati, prova = excluded.prova, aggiornato = excluded.aggiornato`).run(chiave, JSON.stringify(dati), JSON.stringify(prova), ora, ora)
  return { chiave, genere: 'feed.filtro', dati }
}

export type Filtri = {
  /** Indirizzi automatici → chiave della regola. */
  macchine: Map<string, string>
  /** Persone → chiave: la loro posta entra solo se chiede qualcosa. */
  persone: Map<string, string>
  /** Domini della posta automatica → chiave. */
  domini: Map<string, string>
  /** «fonte|tipo» → chiave. */
  tipi: Map<string, string>
  /** I temi: spingono in fondo e basta. */
  temi: { chiave: string; tema: string; frase: string }[]
}

/** I filtri in vigore adesso, letti ogni volta: una regola tolta smette alla lettura dopo. */
export function filtriInVigore(): Filtri {
  const f: Filtri = { macchine: new Map(), persone: new Map(), domini: new Map(), tipi: new Map(), temi: [] }
  for (const r of righe()) {
    if (r.genere !== 'feed.filtro' || !inVigore(r)) continue
    const d = r.dati
    if (d.specie === 'macchina') f.macchine.set(String(d.indirizzo), r.chiave)
    else if (d.specie === 'persona') f.persone.set(String(d.indirizzo), r.chiave)
    else if (d.specie === 'dominio') f.domini.set(String(d.dominio), r.chiave)
    else if (d.specie === 'tipo') f.tipi.set(`${d.fonte}|${d.tipo}`, r.chiave)
    else if (d.specie === 'tema') f.temi.push({ chiave: r.chiave, tema: String(d.tema), frase: String(d.frase ?? '') })
  }
  return f
}

/** La regola che tiene fuori la posta di una macchina: il suo indirizzo, o il suo dominio. */
export function filtroMacchina(autore: string | null | undefined, f: Filtri): string | null {
  const a = indirizzoAttenzione(autore)
  if (!a || !mittenteAutomatico(autore)) return null
  return f.macchine.get(a) ?? f.domini.get(a.slice(a.indexOf('@') + 1)) ?? null
}

/** Una carta passata dal modello che un filtro di genere tiene fuori: mai una scadenza, mai chi chiede qualcosa. */
export function filtroTipo(v: { fonte?: string | null; tipo: string }, corpo: string, f: Filtri): string | null {
  const chiave = f.tipi.get(`${v.fonte ?? ''}|${v.tipo}`)
  if (!chiave || v.tipo === 'Scadenza' || contieneRichiesta(corpo)) return null
  return chiave
}

/** Le risponde sempre, secondo «Come lavori»: la sua posta non la tiene fuori nessun filtro. */
export function rispondeSempre(addr: string): boolean {
  return !!db.prepare("SELECT 1 FROM abitudini WHERE chiave = ? AND stato != 'tolta'").get(`posta.risponde_sempre:${addr.trim().toLowerCase()}`)
}

/** Quante cose un filtro ha tenuto fuori negli ultimi sette giorni, e le ultime tre. */
function trattenute(chiave: string, adesso: Date): { n: number; esempi: Esempio[] } {
  const da = new Date(adesso.getTime() - 7 * GIORNO).toISOString()
  const r = db.prepare("SELECT doc, quando FROM feed_esame WHERE motivo = ? AND fase IN ('filtro', 'non_suo') AND quando >= ? ORDER BY quando DESC").all(chiave, da) as { doc: string; quando: string }[]
  const esempi: Esempio[] = []
  for (const x of r) {
    if (esempi.length >= 3) break
    const d = documento(x.doc)
    if (d) esempi.push({ quando: d.quando ?? x.quando, testo: d.titolo.slice(0, 80), doc: d.id, trattenuta: true })
  }
  return { n: r.length, esempi }
}

// — il tono delle bozze —

/** Una riga sola, per chi la vuole leggere prima di aggiungerle un caso. */
export function riga(chiave: string): Abitudine | null {
  const r = db.prepare('SELECT * FROM abitudini WHERE chiave = ?').get(chiave) as Riga | undefined
  return r ? daRiga(r) : null
}

/**
 * Un caso in più per una regola che nasce dai gesti, una correzione alla volta.
 *
 * Una tolta non si tocca. Gli esempi sono gli ultimi cinque; `chi` sono gli
 * indirizzi a cui andavano le bozze corrette («*» per una bozza senza
 * destinatario): se è uno solo, la regola vale solo per quella persona.
 * Torna la riga com'è adesso, e se è appena entrata in vigore.
 */
export function aggiungiCaso(c: { chiave: string; genere: string; dati: Record<string, string | number>; esempio: Esempio; chi?: { indirizzo: string; nome: string } | null; mostra?: number },
  adesso = new Date()): { riga: Abitudine; entrata: boolean } | null {
  const e = riga(c.chiave)
  if (e?.stato === 'tolta') return null
  const ora = adesso.toISOString()
  const prima = !!e && inVigore(e)
  const vecchi = String(e?.dati.chi ?? '').split(',').filter(Boolean)
  const indirizzo = c.chi?.indirizzo?.trim().toLowerCase() || '*'
  const chi = [...new Set([...vecchi, indirizzo])].slice(0, 12)
  const dati: Record<string, string | number> = { ...(e?.dati ?? {}), ...c.dati, chi: chi.join(',') }
  // una persona sola, e con un nome: la regola vale per lei
  if (chi.length === 1 && chi[0] !== '*') { dati.soloA = chi[0]!; if (c.chi?.nome) dati.nome = c.chi.nome }
  else { delete dati.soloA; delete dati.nome }
  const prova: Prova = { casi: (e?.prova.casi ?? 0) + 1, su: null, esempi: [c.esempio, ...(e?.prova.esempi ?? [])].slice(0, 5), ...(c.mostra ? { mostra: c.mostra } : {}) }
  const stato: Stato = !e || e.stato === 'superata' ? 'osservata' : e.stato
  const dopo = inVigore({ genere: c.genere, stato, prova })
  if (dopo) prova.dal = prima && e?.prova.dal ? e.prova.dal : ora
  if (!e) {
    db.prepare(`INSERT INTO abitudini (chiave, genere, dati, prova, fiducia, stato, testoSuo, visto, aggiornato, tolta) VALUES (?,?,?,?,1,'osservata',NULL,?,?,NULL)`)
      .run(c.chiave, c.genere, JSON.stringify(dati), JSON.stringify(prova), ora, ora)
  } else {
    db.prepare('UPDATE abitudini SET dati = ?, prova = ?, stato = ?, aggiornato = ? WHERE chiave = ?').run(JSON.stringify(dati), JSON.stringify(prova), stato, ora, c.chiave)
  }
  scordaTolte(adesso)
  return { riga: riga(c.chiave)!, entrata: dopo && !prima }
}

/** La regola sul tono detta al modello, in italiano: prova di come vuole le sue bozze, senza lineette. */
function fraseTonoIt(a: Pick<Abitudine, 'dati'>): string {
  const d = a.dati
  switch (d.tratto) {
    case 'saluto-via': return 'Non apre con un saluto: comincia subito dal punto.'
    case 'saluto': return `Apre con «${d.a}»${d.da ? `, non con «${d.da}»` : ''}.`
    case 'chiusura-via': return 'Non chiude con una formula di saluto.'
    case 'chiusura': return `Chiude con «${d.a}»${d.da ? `, non con «${d.da}»` : ''}.`
    case 'registro': return d.a === 'lei' ? 'Dà del Lei.' : 'Dà del tu.'
    case 'corta': return `Scrive più corto delle bozze: circa il ${Math.round((1 - Number(d.rapporto || 0.7)) * 10) * 10}% in meno.`
    case 'elenchi-via': return 'Niente elenchi puntati: scrive in frasi.'
    case 'frase': return `Toglie sempre la frase «${d.frase}»: non scriverla.`
    case 'libera': return String(d.frase ?? '')
    default: return ''
  }
}

/**
 * Le regole sul tono in vigore per chi riceve (quelle di tutti, più quelle
 * solo sue), per `voce.perRiga`. Si leggono a ogni bozza: una regola tolta
 * smette alla bozza dopo. Le parole di lei, se l'ha corretta, al posto delle nostre.
 */
export function regoleTono(indirizzo?: string | null): string {
  const a = indirizzo?.trim().toLowerCase() ?? ''
  const valide = righe().filter(r => r.genere === 'bozza.tono' && inVigore(r) && (!r.dati.soloA || r.dati.soloA === a))
    .sort((x, y) => y.prova.casi - x.prova.casi || x.chiave.localeCompare(y.chiave))
  const frasi = valide.map(r => senzaTrattini(r.stato === 'corretta' && r.testoSuo ? r.testoSuo : fraseTonoIt(r)).trim()).filter(Boolean).slice(0, RIGHE_TONO)
  return frasi.length ? `Come corregge le tue bozze, da seguire:\n${frasi.map(f => `· ${f}`).join('\n')}` : ''
}

/** Le regole dai gesti entrate in vigore dopo quel momento: il punto accanto a «Memoria». */
export function entrateDal(iso: string): { chiave: string; dal: string }[] {
  return righe().filter(r => DAI_GESTI.has(r.genere) && r.stato === 'osservata' && inVigore(r) && !!r.prova.dal && r.prova.dal > iso && r.prova.casi >= (r.prova.mostra ?? 0))
    .map(r => ({ chiave: r.chiave, dal: r.prova.dal! }))
}

/** Un'impronta corta per una chiave fatta di testo. */
export const impronta = (testo: string) => createHash('sha256').update(testo).digest('hex').slice(0, 10)

export const perProva = { fraseIt, fraseTonoIt, genereDi, utente: () => chi.adesso() }
