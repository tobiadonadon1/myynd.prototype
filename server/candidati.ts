// La coda unica: ogni lavoro che Myynd potrebbe fare da sé, e una politica sola.
//
// Prima ogni produttore (le proposte dalla posta, le risposte guadagnate, il
// quadro dei progetti, il lavoro da sé, il primo giorno) scriveva la sua carta
// e la metteva in coda per conto suo, col suo tetto, il suo ritmo e i suoi
// doppioni. La notte la prendeva chi arrivava prima. Adesso un produttore
// propone un candidato (`proponi`) e basta: cosa vale la notte lo decide un
// posto solo (`decidi`), con le stesse regole per tutti.
//
// La politica, deterministica, nell'ordine:
//
//   · scaduto: la sua ora è passata;
//   · doppione: la stessa chiave (lo stesso documento da due produttori), una
//     carta viva sullo stesso documento, o un titolo simile a una carta viva o
//     a un lavoro recente;
//   · già scartato: lei ha buttato una cosa simile nelle ultime due settimane;
//   · prove vecchie: la cosa è successa troppo tempo fa per il suo genere,
//     anche se Myynd l'ha vista adesso (un documento vecchio riaperto oggi);
//   · mandato: una classe che il progetto dice «mai», o il budget del mese del
//     progetto finito (trattenuto: se lei cambia il mandato, torna in gara);
//   · fonte: la fonte non regge più (`valido`, la stessa regola del turno);
//   · poco valore: sotto la soglia non si lavora. Non fare niente è un esito.
//
// Gli altri si ordinano per punteggio (valore × certezza, meno il costo e la
// fatica di rileggerlo, più una spinta per il progetto con un mandato
// confermato e una scadenza vicina) e prendono i posti della notte: il tetto di
// carte della giornata meno quelle già partite e già in coda, dentro quello
// che resta del mese (`restoDelMese`). Chi non entra resta trattenuto, col
// perché, e torna in gara al giro dopo finché non scade.
//
// Un candidato scelto diventa una carta in un modo solo (`promuovi`): la riga,
// il contratto, la coda del turno, la traccia (`tracce.ts`) col suo id.
//
// La mattina, «Mentre non c'eri» legge da qui quello che non è successo:
// le carte che aspettavano il Mac addormentato, quelle che hanno perso la loro
// finestra, quelle trattenute col perché, e la notte senza niente che valesse.

import { createHash } from 'node:crypto'
import db from './store.ts'
import * as store from './store.ts'
import * as quotaMese from './quota-mese.ts'
import * as cfg from './config.ts'
import * as chi from './chi.ts'
import * as progetti from './progetti.ts'
import * as mandato from './mandato.ts'
import * as tracce from './tracce.ts'
import * as contratto from './contratto.ts'
import * as regole from './turno-regole.ts'
import * as budgetNotte from './budget-notte.ts'
import * as turno from './turno.ts'
import * as iniziativa from './iniziativa.ts'
import * as gradino from './gradino.ts'
import * as primoGiorno from './primo-giorno.ts'
import * as daSe from './da-se.ts'
import * as lati from './lato-lati.ts'
import * as latoLavoro from './lato-lavoro.ts'
import { fra } from './ordine.ts'

export type Genere = 'seguito' | 'risposta' | 'passo' | 'lavoro' | 'contenuto' | 'notion' | 'primo-giorno' | 'guadagnata' | 'fattura' | 'modulo'
export const GENERI: readonly Genere[] = ['seguito', 'risposta', 'passo', 'lavoro', 'contenuto', 'notion', 'primo-giorno', 'guadagnata', 'fattura', 'modulo']

export type Candidato = {
  id: string                 // stabile: `${genere}:${chiave}`
  genere: Genere
  progetto: string | null
  titolo: string             // una riga corta
  risultato: string          // cosa sarà pronto la mattina
  perche: string             // perché adesso, una riga
  prove: string[]            // id delle prove: documenti, segnali, osservazioni
  eventAt: string | null     // quando è successa la cosa (non quando Myynd l'ha vista)
  valore: number             // 0..1 utilità attesa
  incertezza: number         // 0..1
  costo: number              // dollari stimati
  classi: string[]           // le classi del mandato che servono (mandato.ts)
  chiave: string             // la chiave dei doppioni
  scade: string              // ISO
  carta: {
    testo: string; nota?: string | null; doc?: string | null; modo: 'bozza' | 'tutto'; origine: string; priorita?: string; contratto?: unknown
    /** L'id della carta che nascerà: di serie dall'id del candidato. */
    id?: string
    /** «oggi» di serie; «poi» resta in coda senza stare nella lista di oggi. */
    quando?: 'oggi' | 'poi'
    /** La voce del feed da cui nasce: diventando una carta, esce dal feed come superata. */
    voce?: string | null
    /** Falso: la carta si scrive e basta, la fa partire lei (il turno spento, il primo giorno). */
    coda?: boolean
  }
  /** Giorni oltre i quali le prove sono vecchie, se il genere ha una regola diversa da quella di serie. */
  fresco?: number | null
}

export type Stato = 'proposto' | 'scelto' | 'trattenuto' | 'scartato' | 'scaduto'
/** Perché un candidato non è stato scelto, in una parola. */
export type Motivo =
  | 'scaduto' | 'doppione' | 'gia_scartato' | 'prove_vecchie' | 'mandato' | 'budget_progetto' | 'fonte'
  | 'poco_valore' | 'mese' | 'notte'

/** Gli stati che tornano in gara al giro dopo. */
const APERTI: readonly Stato[] = ['proposto', 'trattenuto']

// — i numeri della politica —

/** Sotto questo punteggio non si lavora: meglio la notte vuota. */
export const SOGLIA = 0.15
/** Quanto pesa un dollaro stimato, e fin dove. */
export const PESO_COSTO = 0.25
export const COSTO_MAX = 0.2
/** La fatica di rileggerlo, per genere: un file lungo pesa più di una bozza. */
export const REVISIONE: Readonly<Record<Genere, number>> = {
  seguito: 0.03, risposta: 0.03, guadagnata: 0.01, passo: 0.08, lavoro: 0.1, contenuto: 0.06,
  notion: 0.02, 'primo-giorno': 0.03, fattura: 0.05, modulo: 0.06
}
/** La spinta del progetto con un mandato confermato, e della sua scadenza vicina. */
export const SPINTA_MANDATO = 0.1
export const SPINTA_SCADENZA = 0.1
export const GIORNI_SCADENZA = 7
/** Le prove vecchie, per genere, in giorni: null, nessuna regola (il lavoro sui progetti guarda lo stato, non un evento). */
export const FRESCHEZZA: Readonly<Record<Genere, number | null>> = {
  risposta: 3, guadagnata: 3, modulo: 3, passo: 3, seguito: 7, fattura: 10, 'primo-giorno': 10,
  lavoro: null, contenuto: null, notion: null
}
/** I lavori simili già decisi da lei: scartati da meno di così non tornano. */
export const GIORNI_SCARTATI = 14
/** Un lavoro simile fatto da meno di così è un doppione. */
export const GIORNI_FATTI = 3
/**
 * I generi che tornano ogni giorno con lo stesso titolo («Post ideas for X»):
 * il ritmo lo tiene il loro produttore (una volta al giorno, materiale nuovo),
 * e il lavoro fatto ieri non è un doppione di quello di oggi.
 */
export const RICORRENTI: readonly Genere[] = ['contenuto', 'notion']
/** I costi stimati di serie, per chi non sa dire meglio. */
export const COSTO_DI_SERIE: Readonly<Record<Genere, number>> = {
  seguito: 0.1, risposta: 0.1, guadagnata: 0.08, passo: 0.25, lavoro: 0.4, contenuto: 0.3,
  notion: 0.15, 'primo-giorno': 0.15, fattura: 0.15, modulo: 0.15
}

/**
 * Quello che resta, in dollari, dai due tetti: il budget della notte
 * (`budget-notte.ts`) e la quota del mese (`quota-mese.ts`, che conta in
 * micro-dollari). Separati, perché la ricevuta dice quale dei due ha fermato
 * il lavoro: «quota del mese» solo quando è il mese a mancare. Null: nessun tetto.
 */
export function resti(adesso = new Date()): { notte: number | null; mese: number | null } {
  let notte: number | null = null
  let mese: number | null = null
  try {
    // il budget proprio della notte: quando `budget-notte` lo abbassa al resto del mese, a mancare è il mese
    const b = budgetNotte.stato(adesso)
    const proprio = budgetNotte.budget()
    if (proprio) notte = b.finito && !b.dalMese ? 0 : Math.max(0, proprio - b.speso)
  } catch { /* senza budget di notte, conta il mese */ }
  try {
    const m = quotaMese.stato(adesso)
    if (m.resto !== null) mese = m.finita ? 0 : Math.max(0, m.resto / 1_000_000)
  } catch { /* senza quota, conta la notte */ }
  return { notte, mese }
}

/** Il più stretto dei due resti, in dollari; null vuol dire nessun tetto. */
export function restoDelMese(adesso = new Date()): number | null {
  const r = resti(adesso)
  const xs = [r.notte, r.mese].filter((x): x is number => x !== null)
  return xs.length ? Math.min(...xs) : null
}

// — le parole di un titolo, per i simili —

/** Il cuore di un titolo: senza «Draft a reply:», «Re:», e simili davanti. */
export function nucleo(s: string): string {
  let x = s.trim()
  for (let i = 0; i < 4; i++) {
    const m = /^[^:]{1,40}:\s+/.exec(x)
    if (!m) break
    x = x.slice(m[0].length)
  }
  return x
}
function parole(s: string): Set<string> {
  return new Set(nucleo(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(w => w.length > 3))
}
/** Due titoli dicono la stessa cosa: almeno due parole vere, e tre su cinque in comune. */
export function simile(a: string, b: string): boolean {
  const pa = parole(a), pb = parole(b)
  if (pa.size < 2 || pb.size < 2) return false
  let comuni = 0
  for (const w of pa) if (pb.has(w)) comuni++
  return comuni / Math.min(pa.size, pb.size) >= 0.6
}

const limita = (n: unknown, d = 0) => typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : d

// — la parte pura: decidere, dato il mondo —

export type Mondo = {
  adesso: Date
  /** I posti della notte: il tetto meno le carte partite e quelle già in coda. */
  posti: number
  /** Dollari che restano stanotte e nel mese (`resti`), meno quelli già impegnati; null nessun tetto. */
  restoNotte: number | null
  restoMese: number | null
  /** Le carte vive: per i doppioni. Il titolo si confronta solo dentro lo stesso progetto. */
  vive: { id: string; testo: string; doc: string | null; progetto?: string | null }[]
  /** I documenti con una carta viva. */
  conRiga: ReadonlySet<string>
  /** Il lavoro recente e com'è finito: per i doppioni e quello che lei ha buttato. */
  recenti: { testo: string; scartato: boolean; quando: string; progetto?: string | null }[]
  /**
   * Le carte di Myynd in coda e non ancora partite, col punteggio della
   * politica: una più utile che arriva tardi può prendersi il loro posto.
   * Mai le carte sue, mai quelle partite, mai quelle che lei ha chiesto adesso.
   */
  cedibili?: { compito: string; candidato: string; punteggio: number; costo: number }[]
  /** I candidati che lei ha chiesto adesso («Prepara ora»): niente posti né soglia, ma il mandato e la fonte sì. */
  presto?: ReadonlySet<string>
  /** Le chiavi già scelte in passato: la stessa cosa non rinasce. */
  chiaviScelte: ReadonlySet<string>
  regola: (progetto: string | null, classe: string) => mandato.Regola | null
  budgetFinito: (progetto: string | null) => boolean
  valido: (c: Candidato) => boolean
  confermato: (progetto: string | null) => boolean
  scadenza: (progetto: string | null) => string | null
}

/** `cede`: la carta in coda che cede il posto a questo candidato, se ce n'è una. */
export type Decisione = { id: string; stato: Stato; motivo: Motivo | null; punteggio: number; cede?: string }

/** Di quanto un candidato deve valere di più per prendere il posto di una carta già in coda. */
export const MARGINE_CEDERE = 0.05

/** Il punteggio di un candidato: valore per certezza, meno costo e fatica, più la spinta del mandato. */
export function punteggio(c: Candidato, m: Pick<Mondo, 'adesso' | 'confermato' | 'scadenza'>): number {
  let p = limita(c.valore) * (1 - limita(c.incertezza))
  p -= Math.min(COSTO_MAX, Math.max(0, Number(c.costo) || 0) * PESO_COSTO)
  p -= REVISIONE[c.genere] ?? 0.05
  if (c.progetto && m.confermato(c.progetto)) {
    p += SPINTA_MANDATO
    const s = m.scadenza(c.progetto)
    const t = s ? Date.parse(s + 'T23:59:59') : NaN
    if (Number.isFinite(t) && t >= m.adesso.getTime() && t - m.adesso.getTime() <= GIORNI_SCADENZA * 86_400_000) p += SPINTA_SCADENZA
  }
  return Math.round(p * 1000) / 1000
}

/** Le prove sono vecchie per il suo genere: la cosa è successa troppo tempo fa. */
export function proveVecchie(c: Candidato, adesso: Date): boolean {
  const giorni = c.fresco !== undefined ? c.fresco : FRESCHEZZA[c.genere]
  if (giorni == null || !c.eventAt) return false
  const t = Date.parse(c.eventAt)
  return Number.isFinite(t) && adesso.getTime() - t > giorni * 86_400_000
}

/**
 * La politica, pura: per ogni candidato la decisione e il perché. I filtri
 * prima, poi i posti in ordine di punteggio. Non tocca niente.
 */
export function valuta(cs: readonly Candidato[], m: Mondo): Decisione[] {
  const fuori: Decisione[] = []
  const inGara: { c: Candidato; p: number }[] = []
  const adesso = m.adesso.getTime()
  const scarta = (c: Candidato, stato: Stato, motivo: Motivo, p = 0) => fuori.push({ id: c.id, stato, motivo, punteggio: p })
  for (const c of cs) {
    const p = punteggio(c, m)
    if (!(Date.parse(c.scade) > adesso)) { scarta(c, 'scaduto', 'scaduto', p); continue }
    const doc = c.carta.doc ?? null
    const suaCarta = c.carta.id ?? cartaDi(c)
    if (m.chiaviScelte.has(c.chiave)) { scarta(c, 'scartato', 'doppione', p); continue }
    if (doc && m.conRiga.has(doc)) { scarta(c, 'scartato', 'doppione', p); continue }
    // il titolo conta solo per il lavoro senza un documento (due mail diverse con lo stesso oggetto sono due
    // risposte), e solo dentro lo stesso progetto: «Video script for Alpha» e «…for Beta» sono due lavori
    const stesso = (q: string | null | undefined) => (q ?? null) === (c.progetto ?? null)
    if (!doc && m.vive.some(v => v.id !== suaCarta && stesso(v.progetto) && simile(v.testo, c.titolo))) { scarta(c, 'scartato', 'doppione', p); continue }
    const giorno = 86_400_000
    if (!doc && m.recenti.some(r => r.scartato && stesso(r.progetto) && adesso - Date.parse(r.quando) <= GIORNI_SCARTATI * giorno && simile(r.testo, c.titolo))) { scarta(c, 'scartato', 'gia_scartato', p); continue }
    if (!doc && !RICORRENTI.includes(c.genere) && m.recenti.some(r => !r.scartato && stesso(r.progetto) && adesso - Date.parse(r.quando) <= GIORNI_FATTI * giorno && simile(r.testo, c.titolo))) { scarta(c, 'scartato', 'doppione', p); continue }
    if (proveVecchie(c, m.adesso)) { scarta(c, 'scartato', 'prove_vecchie', p); continue }
    if (c.classi.some(k => m.regola(c.progetto, k) === 'mai')) { scarta(c, 'trattenuto', 'mandato', p); continue }
    if (m.budgetFinito(c.progetto)) { scarta(c, 'trattenuto', 'budget_progetto', p); continue }
    if (!m.valido(c)) { scarta(c, 'scartato', 'fonte', p); continue }
    if (p < SOGLIA && !m.presto?.has(c.id)) { scarta(c, 'scartato', 'poco_valore', p); continue }
    inGara.push({ c, p })
  }
  // la stessa chiave due volte nello stesso giro (due produttori, lo stesso documento): resta la più forte
  inGara.sort((a, b) => b.p - a.p || a.c.id.localeCompare(b.c.id))
  const chiavi = new Set<string>()
  let posti = Math.max(0, Math.floor(m.posti))
  let notte = m.restoNotte
  let mese = m.restoMese
  // le carte che possono cedere il posto, dalla meno utile
  const cedibili = [...(m.cedibili ?? [])].sort((a, b) => a.punteggio - b.punteggio || a.compito.localeCompare(b.compito))
  // chiesto da lei adesso: prima di tutti, e fuori dai posti e dai budget (la quota non ferma mai quello che chiede lei)
  inGara.sort((a, b) => Number(!!m.presto?.has(b.c.id)) - Number(!!m.presto?.has(a.c.id)))
  for (const { c, p } of inGara) {
    if (chiavi.has(c.chiave)) { scarta(c, 'scartato', 'doppione', p); continue }
    chiavi.add(c.chiave)
    if (m.presto?.has(c.id)) { fuori.push({ id: c.id, stato: 'scelto', motivo: null, punteggio: p }); continue }
    const costo = Math.max(0, Number(c.costo) || 0)
    // un posto si libera solo da una carta che vale chiaramente meno di questa
    const i = posti > 0 ? -1 : cedibili.findIndex(x => x.punteggio <= p - MARGINE_CEDERE)
    if (posti <= 0 && i < 0) { scarta(c, 'trattenuto', 'notte', p); continue }
    const x = i >= 0 ? cedibili[i] : null
    const libera = x?.costo ?? 0
    // il mese prima: «quota del mese» solo quando è lui a mancare
    if (mese !== null && costo > mese + libera) { scarta(c, 'trattenuto', 'mese', p); continue }
    if (notte !== null && costo > notte + libera) { scarta(c, 'trattenuto', 'notte', p); continue }
    if (x) {
      cedibili.splice(i, 1)
      fuori.push({ id: x.candidato, stato: 'trattenuto', motivo: 'notte', punteggio: x.punteggio })
    } else posti--
    if (notte !== null) notte += libera - costo
    if (mese !== null) mese += libera - costo
    fuori.push({ id: c.id, stato: 'scelto', motivo: null, punteggio: p, ...(x ? { cede: x.compito } : {}) })
  }
  return fuori
}

// — su disco, per persona —

type Riga = {
  id: string; utente: string | null; genere: string; progetto: string | null; chiave: string; titolo: string; dati: string
  punteggio: number | null; stato: string; motivo: string | null; compito: string | null; nato: string; deciso: string | null
  scade: string; eventAt: string | null; ricevuta: string | null; ricevutaQuando: string | null
}
export type Registrato = Candidato & { stato: Stato; motivo: Motivo | null; punteggio: number | null; compito: string | null; nato: string; deciso: string | null; ricevuta: tracce.Ricevuta | null; ricevutaQuando: string | null }

function daRiga(r: Riga): Registrato | null {
  try {
    const c = JSON.parse(r.dati) as Candidato
    return { ...c, stato: r.stato as Stato, motivo: (r.motivo as Motivo | null) ?? null, punteggio: r.punteggio, compito: r.compito, nato: r.nato, deciso: r.deciso, ricevuta: (r.ricevuta as tracce.Ricevuta | null) ?? null, ricevutaQuando: r.ricevutaQuando }
  } catch { return null }
}

/** L'id della carta che nascerà da un candidato. */
export function cartaDi(c: Pick<Candidato, 'id' | 'carta'>): string {
  return c.carta.id ?? `cand-${createHash('sha256').update(c.id).digest('hex').slice(0, 24)}`
}

/** Un candidato pulito: i numeri dentro i loro limiti, i testi corti, l'id che si capisce. */
function pulito(c: Candidato): Candidato {
  const una = (s: unknown, n: number) => (typeof s === 'string' ? s : '').replace(/\s+/g, ' ').trim().slice(0, n)
  return {
    ...c,
    titolo: una(c.titolo, 200) || una(c.carta?.testo, 200),
    risultato: una(c.risultato, 400), perche: una(c.perche, 300),
    prove: [...new Set((c.prove ?? []).filter((x): x is string => typeof x === 'string' && !!x))].slice(0, 40),
    valore: limita(c.valore), incertezza: limita(c.incertezza, 0.5),
    costo: typeof c.costo === 'number' && Number.isFinite(c.costo) && c.costo >= 0 ? c.costo : COSTO_DI_SERIE[c.genere] ?? 0.2,
    classi: [...new Set((c.classi ?? []).filter(x => typeof x === 'string'))]
  }
}

/**
 * Un produttore propone. Una riga per candidato e per persona; uno già deciso
 * (scelto, scartato, scaduto) non torna in gara: la stessa cosa riproposta
 * domani non riapre la decisione di oggi. Uno ancora aperto si aggiorna con le
 * prove più fresche. Non lancia mai.
 */
export function proponi(c: Candidato): void {
  try {
    if (!c || !GENERI.includes(c.genere) || !c.id || !c.chiave || !c.carta?.testo) return
    const x = pulito(c)
    const ora = new Date().toISOString()
    const prima = db.prepare('SELECT stato FROM candidati WHERE id = ?').get(x.id) as { stato: string } | undefined
    if (prima && !(APERTI as readonly string[]).includes(prima.stato)) return
    db.prepare(`
      INSERT INTO candidati (id, utente, genere, progetto, chiave, titolo, dati, stato, nato, scade, eventAt)
      VALUES (?,?,?,?,?,?,?, 'proposto', ?,?,?)
      ON CONFLICT(id) DO UPDATE SET dati = excluded.dati, titolo = excluded.titolo, progetto = excluded.progetto,
        scade = excluded.scade, eventAt = excluded.eventAt
    `).run(x.id, chi.adesso() ?? '', x.genere, x.progetto, x.chiave, x.titolo, JSON.stringify(x), ora, x.scade, x.eventAt)
  } catch (e) { console.warn('myynd · candidato:', e instanceof Error ? e.message : e) }
}

/** Un candidato per id, con la sua decisione. */
export function leggi(id: string): Registrato | null {
  try {
    const r = db.prepare('SELECT * FROM candidati WHERE id = ?').get(id) as Riga | undefined
    return r ? daRiga(r) : null
  } catch { return null }
}

/** Il candidato da cui è nata una carta. */
export function diCarta(compito: string): Registrato | null {
  try {
    const r = db.prepare('SELECT * FROM candidati WHERE compito = ? ORDER BY deciso DESC LIMIT 1').get(compito) as Riga | undefined
    return r ? daRiga(r) : null
  } catch { return null }
}

/** Una chiave che la coda conosce già, in qualunque stato: il produttore non la ripropone. */
export function conosciuta(chiave: string): boolean {
  try { return !!db.prepare('SELECT 1 FROM candidati WHERE chiave = ? LIMIT 1').get(chiave) } catch { return false }
}

/** Quelli ancora in gara: per i tetti dei produttori, che contano anche chi aspetta. */
export function aperti(): Registrato[] {
  try {
    return (db.prepare(`SELECT * FROM candidati WHERE stato IN ('proposto','trattenuto') ORDER BY nato`).all() as Riga[]).map(daRiga).filter((x): x is Registrato => !!x)
  } catch { return [] }
}

function segna(id: string, stato: Stato, motivo: Motivo | null, punteggio: number, compito: string | null, quando: string) {
  db.prepare('UPDATE candidati SET stato = ?, motivo = ?, punteggio = ?, compito = COALESCE(?, compito), deciso = ? WHERE id = ?')
    .run(stato, motivo, punteggio, compito, quando, id)
}

// — la fonte regge ancora: una regola sola, per il candidato e per la carta —

/**
 * La fonte di questo lavoro regge ancora. La stessa regola che il turno usa
 * prima di far partire una carta (`cartaValida`), per genere:
 * le proposte dalla posta finché la mail chiede ancora e nessuno ha risposto,
 * quelle guadagnate finché la persona è sul gradino, quelle del primo giorno
 * anche con le proposte spente, il lavoro sui progetti finché il progetto è vivo.
 */
function regge(o: { genere: Genere | null; origine: string; doc: string | null; voce: string | null; progetto: string | null }, adesso: number): boolean {
  const vivo = (p: string | null) => !p || progetti.trova(p)?.stato === 'attivo'
  if (o.origine === 'iniziativa') return iniziativa.fonteValida(o.doc, adesso)
  if (o.origine === gradino.ORIGINE) return gradino.rigaValida({ doc: o.doc })
  if (o.origine === primoGiorno.ORIGINE) return primoGiorno.fonteValida({ doc: o.doc, voce: o.voce }, adesso)
  if (daSe.suo(o.origine)) return daSe.permesso(() => true) && vivo(o.progetto)
  // il lato (`lato-lavoro.ts`): la risposta finché il filo aspetta lui, la nota finché il progetto è vivo
  if (lati.suo(o.origine)) return vivo(o.progetto) && (o.doc ? latoLavoro.fonteValida(o.doc, adesso) : !!lati.scelto())
  if (o.genere === 'lavoro' || o.origine === 'quadro') return vivo(o.progetto)
  if (o.doc) return !!store.documento(o.doc)
  return true
}

/** Il candidato regge ancora: la sua fonte c'è e chiede ancora. */
export function valido(c: Candidato, adesso = Date.now()): boolean {
  try { return regge({ genere: c.genere, origine: c.carta.origine, doc: c.carta.doc ?? null, voce: c.carta.voce ?? null, progetto: c.progetto }, adesso) } catch { return false }
}

/**
 * La carta di un lavoro proposto regge ancora: per il turno prima di farla
 * partire, e per la coda prima di consegnarla. Le carte scritte da lei reggono sempre.
 */
export function cartaValida(c: Pick<store.Compito, 'origine' | 'doc' | 'voce' | 'progetto'>, adesso = Date.now()): boolean {
  // anche il lavoro del quadro: un progetto messo in pausa dopo la scelta non si lavora quella notte
  const proposte = ['iniziativa', gradino.ORIGINE, primoGiorno.ORIGINE, lati.ORIGINE, 'quadro']
  if (!proposte.includes(c.origine)) return true
  try { return regge({ genere: null, origine: c.origine, doc: c.doc ?? null, voce: c.voce ?? null, progetto: c.progetto ?? null }, adesso) } catch { return false }
}

// — promuovere: un modo solo per far nascere la carta —

/**
 * Il candidato scelto diventa una carta: la riga, il contratto, la coda del
 * turno (di notte, o presto se lei l'ha chiesto adesso), la voce del feed
 * superata, e la traccia col suo id. Null se la carta c'era già.
 */
export function promuovi(c: Candidato, o: { presto?: boolean; adesso?: Date } = {}): string | null {
  const adesso = o.adesso ?? new Date()
  const id = cartaDi(c)
  const esiste = store.compito(id)
  // una carta che ha ceduto il suo posto torna aperta: è la stessa cosa, rientrata in gara
  if (esiste && esiste.stato === 'ritirato' && esiste.esito === CEDUTO) {
    db.prepare(`UPDATE compiti SET stato = 'aperto', esito = NULL, chiuso = NULL, aggiornato = ?, versione = versione + 1 WHERE id = ?`).run(adesso.toISOString(), id)
  } else if (esiste) return null
  const quando = c.carta.quando ?? 'oggi'
  const priorita = c.carta.priorita === 'alta' || c.carta.priorita === 'bassa' ? c.carta.priorita : null
  store.scriviCompito({
    id, testo: c.carta.testo, nota: c.carta.nota ?? null, doc: c.carta.doc ?? null, progetto: c.progetto,
    voce: c.carta.voce ?? null, origine: c.carta.origine, quando, priorita, ordine: fra(store.ultimoOrdine(quando), '')
  })
  if (c.carta.contratto) store.scriviContrattoCompito(id, c.carta.contratto as store.Contratto)
  if (c.carta.voce) store.cambiaStatoFeed(c.carta.voce, 'scaduto', undefined, 'superata')
  const inCoda = c.carta.coda !== false &&
    store.mettiCompitoInCoda(id, c.carta.modo, { da: 'myynd', quando: o.presto ? 'presto' : 'notte', dal: adesso.toISOString(), tentativi: 0 })
  if (inCoda && !c.carta.contratto) contratto.subito(id)
  tracce.inizia({ compito: id, progetto: c.progetto, genere: c.genere, prove: [...c.prove, c.carta.doc], candidato: c.id })
  try { segna(c.id, 'scelto', null, punteggio(c, mondoMandato(adesso)), id, adesso.toISOString()) } catch { /* la carta c'è: la riga del candidato è un di più */ }
  return id
}

/** L'esito di una carta che ha ceduto il posto: la stessa frase la riconosce quando rientra. */
export const CEDUTO = 'Gave its slot to more useful work'

/**
 * Una carta di Myynd in coda, non ancora partita, cede il posto a un lavoro
 * più utile: si ritira col perché, la sua traccia dice «trattenuto», e il suo
 * candidato torna in gara (trattenuto, la notte) per il giro dopo.
 */
function cedi(compito: string, adesso: Date) {
  const c = store.compito(compito)
  if (!c || !cedibile(c)) return false
  store.cambiaStatoCompito(compito, 'ritirato', CEDUTO)
  tracce.ricevuta(compito, 'trattenuto', 'notte')
  db.prepare(`UPDATE candidati SET stato = 'trattenuto', motivo = 'notte', deciso = ? WHERE compito = ? AND stato = 'scelto'`).run(adesso.toISOString(), compito)
  console.info(`myynd · candidati · ${compito} cede il posto a un lavoro più utile`)
  return true
}

/** Può cedere il posto: di Myynd, in coda, mai partita, e non chiesta da lei adesso. */
function cedibile(c: store.Compito): boolean {
  return regole.inCoda(c) && c.turno?.da === 'myynd' && !c.turno.tentativi && c.turno.quando !== 'presto'
}

// — il mondo vero —

const mondoMandato = (adesso: Date): Pick<Mondo, 'adesso' | 'confermato' | 'scadenza'> => ({
  adesso,
  confermato: p => !!p && mandato.di(p).stato === 'confermato',
  scadenza: p => p ? mandato.di(p).scadenza : null
})

/** I posti della notte: il tetto della giornata, meno le carte partite e quelle già in coda. */
export function postiDellaNotte(adesso = new Date()): number {
  const imp = turno.impostazioni(cfg.leggi(), adesso)
  const inCoda = store.elencoCompiti().filter(regole.inCoda).length
  return Math.max(0, imp.carte - turno.avviateOggi(adesso) - inCoda)
}

/** I dollari già impegnati: i candidati scelti la cui carta aspetta ancora in coda senza essere partita. */
function impegnati(adesso: Date): number {
  let n = 0
  try {
    const settimana = new Date(adesso.getTime() - 7 * 86_400_000).toISOString()
    const righe = db.prepare(`SELECT * FROM candidati WHERE stato = 'scelto' AND compito IS NOT NULL AND ricevuta IS NULL AND deciso >= ?`).all(settimana) as Riga[]
    for (const r of righe) {
      const c = store.compito(r.compito!)
      if (c && regole.inCoda(c) && !(c.turno?.tentativi)) n += daRiga(r)?.costo ?? 0
    }
  } catch { /* niente di impegnato */ }
  return n
}

/** Gli stati di una riga che, buttata nel cestino, è un suo «no». */
const APERTE: string[] = ['aperto', 'pronto', 'chiede', 'delegato']

function mondo(adesso: Date): Mondo {
  const vive = store.elencoCompiti()
  const recenti: Mondo['recenti'] = []
  const soglia = new Date(adesso.getTime() - GIORNI_SCARTATI * 86_400_000).toISOString()
  for (const c of store.compitiChiusi(200)) {
    const quando = c.chiuso ?? c.aggiornato
    if (quando < soglia) continue
    const t = tracce.ultimaDi(c.id)
    const scartato = t?.esito === 'scartato' || c.esito === 'lasciato' || c.stato === 'lasciato' || c.stato === 'scartato'
    // ritirata senza un suo gesto (la fonte è cambiata) non dice niente di lei
    if (c.stato === 'ritirato' && !scartato) continue
    recenti.push({ testo: c.titolo || c.testo, scartato, quando, progetto: c.progetto ?? null })
  }
  // il cestino è il suo gesto più chiaro, e la carta buttata resta 'aperto' con `sparito`:
  // senza questa riga «Post ideas for X» buttata ieri tornava stamattina uguale
  // solo le righe ancora aperte: una fatta e poi tolta, o gli impegni che `seguito` riordina da sé, non sono un suo no
  for (const c of store.compitiTolti(GIORNI_SCARTATI, 200)) {
    if (c.sparito! < soglia || !APERTE.includes(c.stato)) continue
    recenti.push({ testo: c.titolo || c.testo, scartato: true, quando: c.sparito!, progetto: c.progetto ?? null })
  }
  const r = resti(adesso)
  const gia = impegnati(adesso)
  const cedibili: NonNullable<Mondo['cedibili']> = []
  try {
    const settimana = new Date(adesso.getTime() - 7 * 86_400_000).toISOString()
    for (const x of db.prepare(`SELECT * FROM candidati WHERE stato = 'scelto' AND compito IS NOT NULL AND ricevuta IS NULL AND deciso >= ?`).all(settimana) as Riga[]) {
      const k = store.compito(x.compito!)
      if (k && cedibile(k)) cedibili.push({ compito: k.id, candidato: x.id, punteggio: x.punteggio ?? 0, costo: daRiga(x)?.costo ?? 0 })
    }
  } catch { /* nessuna */ }
  let chiaviScelte = new Set<string>()
  // le chiavi scelte negli ultimi due mesi: più indietro, la carta stessa (che c'è ancora) ferma il doppione
  const dueMesi = new Date(adesso.getTime() - 60 * 86_400_000).toISOString()
  try { chiaviScelte = new Set((db.prepare(`SELECT chiave FROM candidati WHERE stato = 'scelto' AND deciso >= ?`).all(dueMesi) as { chiave: string }[]).map(r => r.chiave)) } catch { /* nessuna */ }
  const docs = vive.map(c => c.doc).filter((d): d is string => !!d)
  return {
    ...mondoMandato(adesso),
    posti: postiDellaNotte(adesso),
    restoNotte: r.notte === null ? null : Math.max(0, r.notte - gia),
    restoMese: r.mese === null ? null : Math.max(0, r.mese - gia),
    cedibili,
    vive: vive.map(c => ({ id: c.id, testo: c.titolo || c.testo, doc: c.doc, progetto: c.progetto ?? null })),
    conRiga: new Set(docs),
    recenti, chiaviScelte,
    regola: (p, k) => (mandato.CLASSI as readonly string[]).includes(k) ? mandato.regolaPer(p, k as mandato.Classe) : null,
    budgetFinito: p => mandato.budgetFinito(p, adesso),
    valido: c => valido(c, adesso.getTime())
  }
}

// — il giro —

/** Per persona: i lotti aperti (i produttori del quarto d'ora che propongono insieme) e l'ultimo giro. */
const lotti = new Map<string, number>()
/** Per persona: i candidati chiesti da lei dentro un lotto, che la decisione alla fine deve ricordare. */
const prestoNelLotto = new Map<string, Set<string>>()
const ultimoGiro = new Map<string, number>()
const conto = () => chi.adesso() ?? cfg.cartella()

export type Esito = { scelti: string[]; decisioni: Decisione[]; esito: 'scelti' | 'niente_da_fare' | 'attesa' | 'rinviato' }

/**
 * I produttori del quarto d'ora propongono insieme, e la politica decide una
 * volta sola alla fine: così una mail delle nove e un copione delle nove e un
 * quarto si contendono la stessa notte, invece di passare chi arriva prima.
 */
export async function lotto<T>(f: () => Promise<T> | T, o: { adesso?: Date } = {}): Promise<T> {
  const k = conto()
  lotti.set(k, (lotti.get(k) ?? 0) + 1)
  try { return await f() } finally {
    const n = (lotti.get(k) ?? 1) - 1
    if (n > 0) lotti.set(k, n)
    else {
      lotti.delete(k)
      const presto = [...(prestoNelLotto.get(k) ?? [])]
      prestoNelLotto.delete(k)
      decidi(o.adesso ?? new Date(), presto.length ? { presto } : {})
    }
  }
}

/**
 * La politica, sul mondo vero, per chi chiede: i candidati aperti si
 * decidono, gli scelti diventano carte. Dentro un lotto aspetta la fine del
 * lotto. Se niente vale la notte e niente di Myynd è già in coda, lo scrive:
 * «niente da fare» è un esito, non un guasto. Non lancia mai.
 */
export function decidi(adesso = new Date(), o: { presto?: readonly string[] } = {}): Esito {
  if (lotti.get(conto())) {
    // «Prepara ora» dentro un lotto: la richiesta sua si ricorda fino alla decisione
    if (o.presto?.length) prestoNelLotto.set(conto(), new Set([...(prestoNelLotto.get(conto()) ?? []), ...o.presto]))
    return { scelti: [], decisioni: [], esito: 'rinviato' }
  }
  ultimoGiro.set(conto(), adesso.getTime())
  try {
    chiudiNotte(adesso)
    const cs = aperti()
    if (!cs.length) { segnaGiro(adesso, 0); return { scelti: [], decisioni: [], esito: nienteSeVuota(adesso) } }
    const decisioni = valuta(cs, { ...mondo(adesso), presto: new Set(o.presto ?? []) })
    const perId = new Map(cs.map(c => [c.id, c]))
    const scelti: string[] = []
    const quando = adesso.toISOString()
    for (const d of decisioni) {
      const c = perId.get(d.id)
      // la carta che cede il posto lo lascia prima che nasca quella nuova (il suo candidato lo segna `cedi`)
      if (d.cede) cedi(d.cede, adesso)
      if (!c) continue
      if (d.stato === 'scelto') {
        const id = promuovi(c, { presto: !!o.presto?.includes(c.id), adesso })
        if (id) scelti.push(id)
        else segna(c.id, 'scartato', 'doppione', d.punteggio, null, quando)
      } else segna(c.id, d.stato, d.motivo, d.punteggio, null, quando)
    }
    segnaGiro(adesso, scelti.length)
    const tenuti = decisioni.filter(d => d.stato === 'trattenuto').length
    if (scelti.length || tenuti) console.info(`myynd · candidati · ${scelti.length} scelti, ${tenuti} trattenuti, ${decisioni.length - scelti.length - tenuti} lasciati`)
    return { scelti, decisioni, esito: scelti.length ? 'scelti' : tenuti ? 'attesa' : nienteSeVuota(adesso) }
  } catch (e) {
    console.warn('myynd · la coda dei candidati non ha deciso:', e instanceof Error ? e.message : e)
    return { scelti: [], decisioni: [], esito: 'attesa' }
  }
}

/** Il giro del turno, ogni minuto: la politica al più ogni quarto d'ora. */
export const OGNI = 15 * 60_000
export function forseDecidi(adesso = new Date()): Esito | null {
  const prima = ultimoGiro.get(conto())
  if (prima !== undefined && adesso.getTime() - prima < OGNI && adesso.getTime() >= prima) return null
  return decidi(adesso)
}

// — le ricevute della notte —

const CURS_NIENTE = 'candidati:niente'
const CURS_GIRO = 'candidati:giro'
const CURS_CHIUSA = 'candidati:notte-chiusa'
const CURS_VISTA = 'candidati:notte-vista'

function finestraNotte(adesso: Date): regole.Finestra {
  return turno.impostazioni(cfg.leggi(), adesso).notte
}

function segnaGiro(adesso: Date, scelti: number) {
  try { store.segnaCursore(CURS_GIRO, JSON.stringify({ quando: adesso.toISOString(), scelti })) } catch { /* un di più */ }
}

/** Niente in gara, niente di Myynd in coda: la notte non ha niente che valga, e lo si scrive. */
function nienteSeVuota(adesso: Date): 'niente_da_fare' | 'attesa' {
  const inCoda = store.elencoCompiti().some(c => regole.inCoda(c) && c.turno?.da === 'myynd')
  if (inCoda) return 'attesa'
  try { store.segnaCursore(CURS_NIENTE, adesso.toISOString()) } catch { /* un di più */ }
  return 'niente_da_fare'
}

/**
 * Il turno batte ogni minuto, acceso o no: se batte di notte, il Mac era
 * sveglio. Una notte senza nemmeno un battito è una notte col Mac spento o
 * addormentato, anche quando il buco comincia prima della notte e il turno
 * non lo vede (`turno.buchi` conta solo dentro la notte).
 */
export function battito(adesso = new Date()) {
  try {
    const f = finestraNotte(adesso)
    if (!regole.inNotte(adesso, f)) return
    const dal = regole.inizioUltimaNotte(adesso, f)
    const v = vista()
    const quarti = v?.dal === dal.toISOString() ? v.quarti : []
    const q = Math.floor((adesso.getTime() - dal.getTime()) / QUARTO)
    if (quarti.includes(q)) return
    store.segnaCursore(CURS_VISTA, JSON.stringify({ dal: dal.toISOString(), quarti: [...quarti, q].slice(-200) }))
  } catch { /* un di più */ }
}

/** Un quarto d'ora: la notte si conta a quarti, e un quarto con un battito è un quarto sveglio. */
const QUARTO = 15 * 60_000
/** Sotto questa parte della notte con un battito, il Mac ha dormito: un battito alle 6:55 non fa una notte sveglia. */
export const SVEGLIO_MIN = 0.5

/** I quarti d'ora svegli della notte che comincia a `dal`. */
function vista(): { dal: string; quarti: number[] } | null {
  try {
    const x = JSON.parse(store.cursore(CURS_VISTA) ?? 'null')
    return x && typeof x.dal === 'string' && Array.isArray(x.quarti) ? { dal: x.dal, quarti: x.quarti.filter((n: unknown) => typeof n === 'number') } : null
  } catch { return null }
}

/** Quanta parte della notte da `dal` a `fine` il Mac era sveglio, da 0 a 1. */
export function sveglio(dal: Date, fine: Date): number {
  const v = vista()
  const tutti = Math.max(1, Math.ceil((fine.getTime() - dal.getTime()) / QUARTO))
  if (!v || v.dal !== dal.toISOString()) return 0
  return Math.min(1, new Set(v.quarti.filter(q => q >= 0 && q < tutti)).size / tutti)
}

/** La ricevuta di una carta nata da un candidato: nella traccia e nella riga del candidato. */
export function ricevutaDellaCarta(compito: string, stato: tracce.Ricevuta, motivo: string | null, adesso = new Date()) {
  tracce.ricevuta(compito, stato, motivo)
  try { db.prepare('UPDATE candidati SET ricevuta = ?, ricevutaQuando = ?, motivo = COALESCE(?, motivo) WHERE compito = ?').run(stato, adesso.toISOString(), motivo, compito) } catch { /* la traccia c'è */ }
}

/**
 * Finita la notte, una volta: le carte scelte per lei che sono ancora in
 * coda senza essere partite. Se il Mac dormiva (un buco del turno, o nessun
 * battito in tutta la notte) aspettano il Mac; se no hanno perso la loro
 * finestra (il turno spento, in pausa, senza motore). Restano in coda per la
 * notte dopo: la ricevuta dice com'è andata questa.
 */
export function chiudiNotte(adesso = new Date()) {
  try {
    const f = finestraNotte(adesso)
    if (regole.inNotte(adesso, f)) return
    const fine = regole.inizioGiornata(adesso, f)
    const dal = regole.inizioUltimaNotte(new Date(fine.getTime() - 60_000), f)
    if (store.cursore(CURS_CHIUSA) === dal.toISOString()) return
    store.segnaCursore(CURS_CHIUSA, dal.toISOString())
    const righe = db.prepare(`SELECT * FROM candidati WHERE stato = 'scelto' AND compito IS NOT NULL AND ricevuta IS NULL AND deciso < ?`).all(fine.toISOString()) as Riga[]
    if (!righe.length) return
    // il turno fermato dal budget della notte: le carte rimaste sono trattenute dal budget, non saltate
    const fermata = turno.stato(adesso).stanotte.fermata
    const dormiva = sveglio(dal, fine) < SVEGLIO_MIN
    for (const r of righe) {
      const c = store.compito(r.compito!)
      if (!c || !regole.inCoda(c) || c.turno?.tentativi) continue
      if (c.turno?.quando === 'notte' && c.turno.dal >= fine.toISOString()) continue
      if (fermata === 'budget') ricevutaDellaCarta(c.id, 'trattenuto', 'budget', adesso)
      else if (dormiva) ricevutaDellaCarta(c.id, 'in_attesa_del_mac', 'mac', adesso)
      else ricevutaDellaCarta(c.id, 'saltato', 'finestra', adesso)
    }
  } catch (e) { console.warn('myynd · la ricevuta della notte:', e instanceof Error ? e.message : e) }
}

export type RigaRicevuta = { id: string; compito: string | null; titolo: string; motivo: string | null }
export type Ricevute = {
  inAttesaDelMac: RigaRicevuta[]
  saltate: RigaRicevuta[]
  trattenute: RigaRicevuta[]
  /** La politica ha girato e non c'era niente che valesse: è la verità della notte, e si dice. */
  nienteDaFare: boolean
}
/** Quante righe per genere, al più: la carta si legge in dieci secondi. */
export const RICEVUTE_MAX = 20

/**
 * Quello che non è successo da `dal`, per «Mentre non c'eri»: le carte che
 * aspettano il Mac, quelle che hanno perso la finestra (o la fonte), quelle
 * trattenute col perché, e se la notte non aveva niente che valesse.
 */
export function ricevute(dal: string, adesso = new Date()): Ricevute {
  const vuote: Ricevute = { inAttesaDelMac: [], saltate: [], trattenute: [], nienteDaFare: false }
  try {
    chiudiNotte(adesso)
    const riga = (r: Riga): RigaRicevuta => ({ id: r.id, compito: r.compito, titolo: r.titolo, motivo: r.motivo })
    const conRicevuta = (s: tracce.Ricevuta) => (db.prepare(`SELECT * FROM candidati WHERE ricevuta = ? AND ricevutaQuando >= ? ORDER BY ricevutaQuando DESC LIMIT ?`).all(s, dal, RICEVUTE_MAX) as Riga[]).map(riga)
    // trattenute: dalla politica (ancora in gara), o carte rimaste in coda perché il budget della notte ha fermato il turno
    const trattenute = (db.prepare(`SELECT * FROM candidati WHERE (stato = 'trattenuto' AND deciso >= ? AND scade > ?) OR (ricevuta = 'trattenuto' AND ricevutaQuando >= ?) ORDER BY punteggio DESC LIMIT ?`).all(dal, adesso.toISOString(), dal, RICEVUTE_MAX) as Riga[]).map(riga)
    const inAttesaDelMac = conRicevuta('in_attesa_del_mac').filter(r => { const c = r.compito ? store.compito(r.compito) : null; return !!c && regole.inCoda(c) })
    const saltate = conRicevuta('saltato')
    const scelti = Number((db.prepare(`SELECT COUNT(*) AS n FROM candidati WHERE stato = 'scelto' AND deciso >= ?`).get(dal) as { n: number }).n)
    const niente = store.cursore(CURS_NIENTE)
    const nienteDaFare = !!niente && niente >= dal && !scelti && !trattenute.length && !inAttesaDelMac.length && !saltate.length
    return { inAttesaDelMac, saltate, trattenute, nienteDaFare }
  } catch { return vuote }
}

/** Il punteggio della politica per la carta, per l'ordine del turno: zero se non viene da qui. */
export function punteggioDellaCarta(compito: string): number {
  try {
    const r = db.prepare(`SELECT punteggio FROM candidati WHERE compito = ? AND stato = 'scelto' LIMIT 1`).get(compito) as { punteggio: number | null } | undefined
    return r?.punteggio ?? 0
  } catch { return 0 }
}

/** Solo per le prove: dimentica i lotti e gli ultimi giri. */
export function dimentica() { lotti.clear(); ultimoGiro.clear() }
