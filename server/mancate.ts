// Le carte mancate: quello che ha fatto lui senza che il feed gliel'avesse detto.
//
// Il feed si misura in due modi. Il primo è facile: di quello che gli mette
// davanti, quanto era giusto (le sue ragioni, `feed-esiti.ts`). Il secondo
// finora non c'era: quello che gli è **sfuggito**. Due segni lo tradiscono:
//
//   · tipo A, «risposta»: una mail mandata da lui, dalla sua posta, in
//     risposta a una persona che chiedeva qualcosa, e di cui il feed non ha
//     mai fatto una carta. La risposta cita il messaggio (`risponde`), o sta
//     nello stesso filo dopo la mail in arrivo. Non è una mancata se Myynd
//     non ha avuto il tempo (venti minuti dall'indicizzazione), se la mail
//     era in serie o automatica, se una riga o una carta c'era, o se era una
//     cortesia («grazie, ricevuto») a una mail che non chiedeva niente.
//   · tipo B, «compito»: una riga scritta a mano o detta in chat, che un
//     documento arrivato nei quattordici giorni prima già chiedeva. Le
//     parole in comune decidono (`paroleRilevanti`), Jev conferma in mezzo,
//     mai da solo.
//
// Senza modello. Jev è un affinamento: senza chiave si tengono solo le
// corrispondenze sicure. Gira dopo ogni rilettura, al massimo ogni mezz'ora
// per conto, e guarda solo quello che è arrivato dall'ultima volta.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import db, { documento, cerca, docsSulFeed, docsConRiga, docsIgnoratiDalFeed, mittentiScartati, type Documento } from './store.ts'
import * as chi from './chi.ts'
import { cartella } from './config.ts'
import { classificaAttenzione, contieneRichiesta, contestoAttenzione, corpoAttuale, indirizzoAttenzione, mittenteAutomatico, paroleRilevanti } from './rilevanza.ts'
import { esameDi } from './feed-dati.ts'
import * as giudizi from './giudizi.ts'
import * as jev from './jev.ts'

export type Mancata = {
  id: string
  genere: 'risposta' | 'compito'
  doc: string
  prova: string
  mittente: string | null
  progetto: string | null
  fase: string
  motivo: string | null
  certezza: 'id' | 'filo' | 'parole' | 'jev'
  /** Quando è arrivato il documento. */
  arrivato: string
  /** Quando ha agito lui: la mail mandata, la riga scritta. */
  agito: string
  contesto: string
  quando: string
}

const GIORNO = 86_400_000
/** Quanto tempo deve aver avuto Myynd per accorgersene: una lettura di fondo, e un po'. */
export const MARGINE_MIN = 20
/** Una risposta a una mail più vecchia di tanto non è una mancata: è un filo ripreso. */
export const GIORNI_RISPOSTA = 30
/** Un documento più vecchio di tanto rispetto alla riga non l'ha suggerita. */
export const GIORNI_COMPITO = 14
/** La prima volta, e quando il segnalibro è storto: quanto indietro si guarda. */
export const GIORNI_PRIMA_VOLTA = 14
/** Ogni quanto, al più, per conto. */
export const OGNI = 30 * 60_000
/** Quante domande a Jev per giro, al massimo. */
export const JEV_PER_GIRO = 20
/** Sopra questa parte di parole in comune è una mancata anche senza Jev. */
export const SOGLIA_PAROLE = 0.8
/** Fra questa e la soglia delle parole decide Jev, se c'è. */
export const SOGLIA_FORSE = 0.6
export const SOGLIA_JEV = 0.6
/** Una risposta lunga almeno tanto non è una cortesia, anche se la mail non chiedeva niente. */
export const RISPOSTA_LUNGA = 200
/** Una riga tolta entro tanti minuti era uno sbaglio, non una cosa da fare. */
export const MINUTI_RIPENSAMENTO = 10

const EMAIL = ['posta', 'gmail', 'outlook']
const SUE = new Set(['conversazioni', 'x', 'lavoro'])
const CAMPI = 'id, fonte, tipo, titolo, corpo, autore, percorso, quando, gruppo, indicizzato, filo, inviato, messageId, letto, massa, risponde, destinatari'

type Doc = Documento & { indicizzato: string; risponde?: string | null; destinatari?: string | null }

const idDi = (genere: string, doc: string, agito: string) =>
  createHash('sha1').update(`${genere}|${doc}|${agito}`).digest('hex').slice(0, 24)

/** Dove è finito quel documento quando il feed l'ha guardato, o dove sarebbe finito. */
function attribuzione(d: Doc, scartati: { indirizzi: string[] }): { fase: string; motivo: string | null } {
  const e = esameDi([d.id]).get(d.id)
  if (e) return { fase: e.fase, motivo: e.motivo }
  const adesso = Date.parse(d.indicizzato ?? '')
  const r = classificaAttenzione(d, { adesso: Number.isFinite(adesso) ? adesso : Date.now() })
  if (r.destinazione !== 'feed') return { fase: 'regole', motivo: r.motivo }
  const addr = indirizzoAttenzione(d.autore)
  if (addr && scartati.indirizzi.includes(addr)) return { fase: 'scartati', motivo: null }
  return { fase: 'ignoto', motivo: null }
}

/** Una carta, una riga, uno scarto: il feed ha già avuto a che fare con questo documento. */
function giaTrattato(d: Doc): boolean {
  if (docsSulFeed([d.id]).size) return true
  if (d.messageId && db.prepare("SELECT 1 FROM feed WHERE json_extract(contesto, '$.messageId') = ? LIMIT 1").get(d.messageId)) return true
  if (docsIgnoratiDalFeed([d]).size) return true
  if (docsConRiga([d.id]).size) return true
  return false
}

const primaFeed = (prima: string) => !!db.prepare('SELECT 1 FROM feed WHERE quando < ? LIMIT 1').get(prima)

// — tipo A: le risposte —

/** La mail in arrivo a cui questa risponde: per «risponde», o per il filo. */
function inArrivo(s: Doc): { doc: Doc; certezza: 'id' | 'filo' } | null {
  if (s.risponde) {
    const d = db.prepare(`SELECT ${CAMPI} FROM documenti WHERE messageId = ? AND inviato = 0 ORDER BY quando DESC LIMIT 1`).get(s.risponde) as unknown as Doc | undefined
    return d ? { doc: d, certezza: 'id' } : null
  }
  if (!s.filo || s.filo.startsWith('s:') || !s.quando) return null
  const nelFilo = db.prepare(`SELECT ${CAMPI} FROM documenti WHERE filo = ? AND inviato = 0 AND quando < ? ORDER BY quando DESC LIMIT 5`).all(s.filo, s.quando) as unknown as Doc[]
  for (const d of nelFilo) {
    const addr = indirizzoAttenzione(d.autore)
    if (s.destinatari === null || s.destinatari === undefined || (addr && `,${s.destinatari.toLowerCase()},`.includes(`,${addr},`))) return { doc: d, certezza: 'filo' }
  }
  return null
}

function risposte(dal: string, adesso: number, su: 'quando' | 'indicizzato', scartati: { indirizzi: string[] }): Mancata[] {
  const fine = new Date(adesso).toISOString()
  const inviate = db.prepare(`
    SELECT ${CAMPI} FROM documenti WHERE inviato = 1 AND fonte IN (${EMAIL.map(() => '?').join(',')})
      AND ${su} > ? AND quando <= ? ORDER BY quando
  `).all(...EMAIL, dal, fine) as unknown as Doc[]
  const fuori: Mancata[] = []
  const adessoIso = new Date(adesso).toISOString()
  for (const s of inviate) {
    if (!s.quando) continue
    const trovata = inArrivo(s)
    if (!trovata) continue
    const i = trovata.doc
    // 1. dentro la finestra
    if (!i.quando || Date.parse(i.quando) < Date.parse(s.quando) - GIORNI_RISPOSTA * GIORNO) continue
    // 2. da una persona
    const addr = indirizzoAttenzione(i.autore)
    if (!EMAIL.includes(i.fonte) && i.tipo !== 'email') continue
    if (i.massa || mittenteAutomatico(i.autore) || !addr) continue
    // 3. nessuna carta, riga o scarto
    if (giaTrattato(i)) continue
    // 4. Myynd ha avuto la sua occasione
    const indicizzato = Date.parse(i.indicizzato ?? '')
    if (!Number.isFinite(indicizzato) || indicizzato > Date.parse(s.quando) - MARGINE_MIN * 60_000) continue
    if (!primaFeed(s.quando)) continue
    // 5. chiedeva qualcosa, o la risposta non è una cortesia
    const corpo = corpoAttuale(i)
    const chiede = contieneRichiesta(corpo) || (giudizi.chiedeNoto(i.id) ?? 0) >= giudizi.SOGLIA_FEED || corpoAttuale(s).length >= RISPOSTA_LUNGA
    if (!chiede) continue
    const dove = attribuzione(i, scartati)
    fuori.push({
      id: idDi('risposta', i.id, s.quando), genere: 'risposta', doc: i.id,
      prova: corpo.replace(/\s+/g, ' ').trim().slice(0, 300), mittente: addr, progetto: null,
      fase: dove.fase, motivo: dove.motivo, certezza: trovata.certezza,
      arrivato: i.quando, agito: s.quando, contesto: JSON.stringify(contestoAttenzione(i)), quando: adessoIso
    })
  }
  return fuori
}

// — tipo B: le righe —

type Compito = { id: string; testo: string; creato: string; sparito: string | null; progetto: string | null }

const numeri = (s: string) => new Set(s.match(/\b\d+(?:[.,]\d+)*\b/g) ?? [])

/** Quanto un documento copre le parole della riga: parte delle parole della riga che stanno nel documento. */
export function copertura(compito: string, doc: { titolo: string; corpo: string }): { comuni: number; parte: number; numeriOk: boolean } {
  const sue = paroleRilevanti(compito)
  const del = paroleRilevanti(`${doc.titolo}\n${corpoAttuale(doc)}`)
  const comuni = [...sue].filter(p => del.has(p)).length
  const testoDoc = `${doc.titolo}\n${doc.corpo}`
  const numeriOk = [...numeri(compito)].every(n => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(testoDoc))
  return { comuni, parte: sue.size ? comuni / sue.size : 0, numeriOk }
}

const DOMANDA_JEV = {
  implicito: {
    type: 'noul',
    instructions: 'Does this document ask the person for exactly this task, or make it plainly necessary?',
    criteria: { true: 'The document asks for this task or makes it necessary.', false: 'The document is about something else, or only mentions the topic.' }
  } as jev.Noul
}

async function compiti(dal: string, adesso: number, opz: { jev: boolean; limiteJev: number }, scartati: { indirizzi: string[] }): Promise<Mancata[]> {
  const righe = db.prepare(`
    SELECT id, testo, creato, sparito, progetto FROM compiti
    WHERE origine IN ('mano', 'chat') AND doc IS NULL AND voce IS NULL AND creato > ? AND creato <= ?
    ORDER BY creato
  `).all(dal, new Date(adesso).toISOString()) as Compito[]
  const fuori: Mancata[] = []
  const adessoIso = new Date(adesso).toISOString()
  const daChiedere: { c: Compito; d: Doc; parte: number }[] = []
  for (const c of righe) {
    const creato = Date.parse(c.creato)
    if (!Number.isFinite(creato)) continue
    if (c.sparito && Date.parse(c.sparito) - creato < MINUTI_RIPENSAMENTO * 60_000) continue
    let trovati: Documento[] = []
    try { trovati = cerca(c.testo, 8) } catch { trovati = [] }
    const candidati = (trovati as Doc[]).filter(d => {
      const q = Date.parse(d.quando ?? '')
      if (!Number.isFinite(q) || q < creato - GIORNI_COMPITO * GIORNO || q > creato) return false
      if (SUE.has(d.fonte) || d.inviato) return false
      const indicizzato = Date.parse(d.indicizzato ?? '')
      if (!Number.isFinite(indicizzato) || indicizzato > creato - MARGINE_MIN * 60_000) return false
      if (docsSulFeed([d.id]).size || docsConRiga([d.id]).size) return false
      return true
    })
    let migliore: { d: Doc; parte: number } | null = null
    for (const d of candidati) {
      const k = copertura(c.testo, d)
      if (k.comuni < 2 || !k.numeriOk) continue
      if (!migliore || k.parte > migliore.parte) migliore = { d, parte: k.parte }
    }
    if (!migliore) continue
    if (migliore.parte >= SOGLIA_PAROLE) {
      fuori.push(mancataCompito(c, migliore.d, 'parole', adessoIso, scartati))
    } else if (migliore.parte >= SOGLIA_FORSE && opz.jev && jev.collegato() && daChiedere.length < opz.limiteJev) {
      daChiedere.push({ c, d: migliore.d, parte: migliore.parte })
    }
  }
  if (daChiedere.length) {
    const esiti = await jev.giudicaTanti(daChiedere, x => ({
      compito: x.c.testo,
      documento: { titolo: x.d.titolo, mittente: x.d.autore ?? '', testo: corpoAttuale(x.d).slice(0, 1500) }
    }), DOMANDA_JEV)
    for (const x of daChiedere) {
      const r = esiti.get(x)
      if (r && r.implicito.noul >= SOGLIA_JEV) fuori.push(mancataCompito(x.c, x.d, 'jev', adessoIso, scartati))
    }
  }
  return fuori
}

function mancataCompito(c: Compito, d: Doc, certezza: 'parole' | 'jev', adessoIso: string, scartati: { indirizzi: string[] }): Mancata {
  const dove = attribuzione(d, scartati)
  return {
    id: idDi('compito', d.id, c.creato), genere: 'compito', doc: d.id,
    prova: c.testo.replace(/\s+/g, ' ').trim().slice(0, 300), mittente: indirizzoAttenzione(d.autore) || null, progetto: c.progetto ?? null,
    fase: dove.fase, motivo: dove.motivo, certezza,
    arrivato: d.quando ?? c.creato, agito: c.creato, contesto: JSON.stringify(contestoAttenzione(d)), quando: adessoIso
  }
}

// — insieme —

/** C'è posta inviata nell'indice, di recente? Senza, il tasso di mancate non vuol dire niente. */
export function postaInviata(adesso = Date.now()): boolean {
  const da = new Date(adesso - 30 * GIORNO).toISOString()
  return !!db.prepare(`SELECT 1 FROM documenti WHERE inviato = 1 AND fonte IN (${EMAIL.map(() => '?').join(',')}) AND indicizzato >= ? LIMIT 1`).get(...EMAIL, da)
}

/**
 * Le carte mancate da `dal` in poi. Legge e basta: non scrive niente.
 *
 * `su` dice su quale data si guarda la posta inviata: `quando` (la data della
 * mail, per una misura su una finestra) o `indicizzato` (quando è entrata
 * nell'indice, per il segnalibro di `forse`). Le righe si guardano sempre
 * per `creato`. Senza `jev` si tengono solo le corrispondenze sicure.
 */
export async function trova(opz: { dal: string; adesso?: number; jev?: boolean; limiteJev?: number; su?: 'quando' | 'indicizzato' }): Promise<{ mancate: Mancata[]; copertura: { postaInviata: boolean } }> {
  const adesso = opz.adesso ?? Date.now()
  const scartati = mittentiScartati()
  const a = risposte(opz.dal, adesso, opz.su ?? 'quando', scartati)
  const b = await compiti(opz.dal, adesso, { jev: opz.jev === true, limiteJev: opz.limiteJev ?? JEV_PER_GIRO }, scartati)
  return { mancate: [...a, ...b], copertura: { postaInviata: postaInviata(adesso) } }
}

/** Scrive le mancate che non c'erano; torna quante. Rifare lo stesso giro non ne aggiunge. */
export function registra(m: readonly Mancata[]): number {
  return registraContando(m).nuove
}

function registraContando(m: readonly Mancata[]): { nuove: number; risposte: number; compiti: number } {
  const conto = { nuove: 0, risposte: 0, compiti: 0 }
  if (!m.length) return conto
  const ins = db.prepare(`
    INSERT OR IGNORE INTO mancate (id, genere, doc, prova, mittente, progetto, fase, motivo, certezza, arrivato, agito, contesto, quando)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `)
  for (const x of m) {
    const scritta = Number(ins.run(x.id, x.genere, x.doc, x.prova, x.mittente, x.progetto, x.fase, x.motivo, x.certezza, x.arrivato, x.agito, x.contesto, x.quando).changes)
    if (!scritta) continue
    conto.nuove++
    if (x.genere === 'risposta') conto.risposte++; else conto.compiti++
  }
  return conto
}

// — il giro —

/** L'ultima volta, per conto: non più di una ogni mezz'ora. */
const ultime = new Map<string, number>()

const FILE = () => join(cartella(), 'mancate.json')
function leggiSegnalibro(): string | null {
  try { return (JSON.parse(readFileSync(FILE(), 'utf8')) as { ultimo?: string }).ultimo ?? null } catch { return null }
}
function scriviSegnalibro(ultimo: string) {
  const dentro = cartella()
  if (!existsSync(dentro)) mkdirSync(dentro, { recursive: true, mode: 0o700 })
  const tmp = `${FILE()}.tmp`
  writeFileSync(tmp, JSON.stringify({ ultimo }), { mode: 0o600 })
  renameSync(tmp, FILE())
}

/**
 * L'ultima cosa che un giro può aver guardato: il documento indicizzato più
 * di recente, o la riga scritta più di recente. È quello che si scrive nel
 * segnalibro, e non l'ora del giro: scrivendo l'ora, in una notte senza posta
 * il segnalibro era «più avanti dell'ultimo documento», quindi storto, e ogni
 * mezz'ora si rileggevano quattordici giorni e si rifacevano a Jev le stesse
 * venti domande.
 */
function ultimoGuardabile(adesso: number): string | null {
  const docs = (db.prepare('SELECT MAX(indicizzato) AS m FROM documenti').get() as { m: string | null } | undefined)?.m ?? null
  const righe = (db.prepare('SELECT MAX(creato) AS m FROM compiti').get() as { m: string | null } | undefined)?.m ?? null
  const max = [docs, righe].filter((x): x is string => !!x && Number.isFinite(Date.parse(x))).sort().at(-1) ?? null
  if (!max) return null
  return Date.parse(max) > adesso ? new Date(adesso).toISOString() : max
}

/**
 * Da dove si riparte: il segnalibro, o quattordici giorni fa la prima volta.
 * Un segnalibro più avanti dell'ultima cosa guardabile è storto (un indice
 * rifatto, un orologio andato avanti): si riparte da quattordici giorni.
 */
export function daDove(adesso = Date.now()): string {
  const primaVolta = new Date(adesso - GIORNI_PRIMA_VOLTA * GIORNO).toISOString()
  const ultimo = leggiSegnalibro()
  if (!ultimo || !Number.isFinite(Date.parse(ultimo))) return primaVolta
  const max = ultimoGuardabile(adesso)
  if (max && ultimo > max) return primaVolta
  return ultimo
}

/** Forse: se è passata mezz'ora. Torna quante mancate nuove ha scritto. */
export async function forse(adesso = Date.now()): Promise<number> {
  const conto = chi.adesso() ?? ''
  const ultima = ultime.get(conto) ?? 0
  if (adesso - ultima < OGNI) return 0
  ultime.set(conto, adesso)
  const dal = daDove(adesso)
  const { mancate } = await trova({ dal, adesso, jev: true, su: 'indicizzato' })
  const { nuove, risposte: a, compiti: b } = registraContando(mancate)
  // il segnalibro è l'ultima cosa guardata, non l'ora: così un giro senza
  // niente di nuovo riparte da lì, e non da quattordici giorni fa
  const guardato = ultimoGuardabile(adesso)
  scriviSegnalibro(guardato && guardato > dal ? guardato : dal)
  if (nuove) console.log(`myynd · mancate · ${nuove} nuove (${a} risposte, ${b} compiti)`)
  return nuove
}

/** Solo per le prove: l'orologio del giro ricomincia. */
export function dimentica() { ultime.clear() }
