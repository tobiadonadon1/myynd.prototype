// I progetti: su cosa sta lavorando, e a cosa punta ciascuno.
//
// Fin qui un progetto era una cosa che il punto *indovinava* dal materiale e
// teneva in `punto.json`: un nome, una data, l'angolo dell'ultima volta. Non
// c'era scritto da nessuna parte l'obiettivo — e senza obiettivo nessuna delle
// tre cose che scelgono per lui poteva scegliere bene. Il feed non sa se un
// documento muove qualcosa; la rassegna non sa quale notizia c'entra; il punto
// propone mosse che non dicono verso cosa. E quando il modello si inventava un
// progetto, non c'era un posto dove dire «questo non lo è».
//
// Adesso un progetto è una riga: nome, obiettivo in una riga, e uno stato.
// L'obiettivo lo scrive lui nella Memoria — è la cosa che nessun documento sa
// dire — e lo stato è quello che rende reversibile ogni errore del modello:
// «chiuso» non cancella, lascia scritto, e quello che è scritto non torna.
//
// Questo file è l'unica porta sulla tabella: chi vuole i progetti passa da
// qui, e la prima volta che qualcuno bussa i progetti che il punto aveva già
// capito entrano dal foglio vecchio, con la loro data. Gli angoli tenuti no:
// quelli stanno già nella memoria, sotto `progetto:<nome>`, ed è lì che
// restano.

import { recordProjectField, recordTaskOutcome, projectMemoryContext, riassegnaMemoriaProgetto, dimenticaProgetto } from './project-memory.ts'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cartella, leggi as leggiConfig, aggiorna as aggiornaConfig, lingua as linguaApp } from './config.ts'
import { nominaAmbito, nomeNormalizzato } from './ambiti-memoria.ts'
import db, { compito, riassegnaProgetto, type Compito } from './store.ts'
import { compitiAttuali } from './attenzione.ts'
import { senzaTrattini } from './testo.ts'

export type Stato = 'attivo' | 'fermo' | 'chiuso'
export const STATI: Stato[] = ['attivo', 'fermo', 'chiuso']

/**
 * La priorità di un progetto: «alta», o niente, che vuol dire normale.
 *
 * La parola è quella delle righe della lista (`store.PRIORITA`), e la
 * pastiglia che la mostra è la stessa: la stessa cosa si scrive allo stesso
 * modo. Il gradino basso invece non c'è. Per un progetto che conta meno degli
 * altri esiste già «fermo», e due modi di dire «non adesso» sarebbero una
 * domanda in più («bassa o in pausa?») senza una risposta diversa.
 */
export type Priorita = 'alta'
export const PRIORITA: readonly Priorita[] = ['alta']

export type Progetto = {
  id: string
  nome: string
  obiettivo: string
  stato: Stato
  /** La prima volta che è comparso: un progetto che dura si vede da qui. */
  dal: string
  aggiornato: string
  note: string
  /** Chi l'ha scritto: lui, o il punto dal materiale. */
  origine: 'mano' | 'punto' | 'conversazione'
  /** Il colore scelto da lui, `#RRGGBB`, o vuoto: allora la pagina ne prende uno stabile dall'id. */
  colore: string
  /**
   * Gli altri nomi con cui lo chiama: la cartella («everwave» per Evermute),
   * il soprannome, il nome vecchio. Valgono come i nomi fra parentesi del
   * riferimento: un testo che ne nomina uno parla di questo progetto.
   */
  alias: string[]
  /** L'id del progetto di cui fa parte (H-Brain è uno spin-off di Myynd), o null. */
  genitore: string | null
  /** «alta» se l'ha segnato lui come più importante degli altri; null è normale. */
  priorita: Priorita | null
}

const COLORE_VALIDO = /^#[0-9a-f]{6}$/i

/** Quanti se ne nominano al modello: oltre, non è più «su cosa sta lavorando». */
const PER_IL_MODELLO = 8

/** Quanti altri nomi può avere un progetto: oltre, non sono più nomi. */
export const ALIAS_MAX = 12
/** Quanti blocchi può ordinare a mano sulla prima pagina. */
export const ORDINE_BLOCCHI_MAX = 50

type Riga = {
  id: string; nome: string; obiettivo: string | null; stato: string; dal: string
  aggiornato: string; note: string | null; origine: string | null; colore?: string | null
  alias?: string | null; genitore?: string | null; priorita?: string | null
}

/** La colonna `alias` è JSON: un elenco di parole, o niente. Una colonna storta è un elenco vuoto. */
function aliasDaColonna(s: string | null | undefined): string[] {
  if (!s) return []
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : []
  } catch { return [] }
}

const daRiga = (r: Riga): Progetto => ({
  id: r.id,
  nome: r.nome,
  obiettivo: r.obiettivo ?? '',
  stato: (STATI as string[]).includes(r.stato) ? (r.stato as Stato) : 'attivo',
  dal: r.dal,
  aggiornato: r.aggiornato,
  note: r.note ?? '',
  origine: r.origine === 'punto' || r.origine === 'conversazione' ? r.origine : 'mano',
  colore: r.colore && COLORE_VALIDO.test(r.colore) ? r.colore : '',
  alias: aliasDaColonna(r.alias),
  genitore: r.genitore?.trim() || null,
  priorita: r.priorita === 'alta' ? 'alta' : null
})

const chiave = (s: string) => s.trim().toLowerCase()

/**
 * Gli altri nomi, puliti: senza spazi attorno, senza doppioni (a meno di
 * maiuscole), mai il nome del progetto stesso, al massimo dodici. Si tiene
 * la grafia con cui li ha scritti: si confrontano in minuscolo, si mostrano
 * come sono. Pura.
 */
export function normalizzaAlias(alias: readonly string[], nome: string): string[] {
  const visti = new Set<string>([chiave(nome)])
  const puliti: string[] = []
  for (const a of alias) {
    const pulito = String(a ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
    const k = chiave(pulito)
    if (!k || visti.has(k)) continue
    visti.add(k)
    puliti.push(pulito)
    if (puliti.length >= ALIAS_MAX) break
  }
  return puliti
}

/** Il progetto ha questo nome, o questo altro nome: a meno di maiuscole, accenti e punteggiatura. */
export function haQuestoNome(p: Pick<Progetto, 'nome' | 'alias'>, nome: string): boolean {
  const n = nomeNormalizzato(nome)
  if (!n) return false
  return nomeNormalizzato(p.nome) === n || p.alias.some(a => nomeNormalizzato(a) === n)
}

/** Il testo nomina il progetto, con il suo nome o con uno degli altri. */
export function nominaProgetto(testo: string, p: Pick<Progetto, 'nome' | 'alias'>): boolean {
  return nominaAmbito(testo, p.nome) || p.alias.some(a => nominaAmbito(testo, a))
}

/**
 * I progetti che il punto aveva già capito entrano una volta sola.
 *
 * Il segno che non è ancora successo è una tabella vuota: dopo, anche un
 * progetto chiuso è una riga, e la tabella non torna vuota — «chiudi» non
 * cancella apposta. Il foglio vecchio resta com'è: `punto.ts` non lo legge
 * più per i progetti, e riscriverlo qui vorrebbe dire due posti che sanno
 * la stessa cosa.
 */
function importaDalPunto() {
  const vuota = (db.prepare('SELECT COUNT(*) AS n FROM progetti').get() as { n: number }).n === 0
  if (!vuota) return
  const file = join(cartella(), 'punto.json')
  if (!existsSync(file)) return
  let vecchi: { nome?: string; dal?: string }[] = []
  try {
    vecchi = (JSON.parse(readFileSync(file, 'utf8')) as { progetti?: { nome?: string; dal?: string }[] }).progetti ?? []
  } catch { return }
  const ora = new Date().toISOString()
  const visti = new Set<string>()
  for (const v of vecchi) {
    const nome = (v.nome ?? '').trim()
    if (!nome || visti.has(chiave(nome))) continue
    visti.add(chiave(nome))
    db.prepare(`
      INSERT INTO progetti (id, nome, obiettivo, stato, dal, aggiornato, note, origine)
      VALUES (?, ?, NULL, 'attivo', ?, ?, NULL, 'punto')
    `).run(nuovoId(), nome, v.dal ?? ora, ora)
  }
}

const nuovoId = () => `p${randomUUID().replace(/-/g, '').slice(0, 12)}`

/**
 * Dentro gli attivi, quelli segnati alti davanti. Un fermo o un chiuso con una
 * priorità scritta non passa davanti a niente: la priorità vale per il lavoro
 * che si fa adesso, e un progetto in pausa non è quello.
 */
const PRIMA_LE_ALTE = "CASE WHEN priorita = 'alta' AND stato = 'attivo' THEN 0 ELSE 1 END"

/** La priorità che vale adesso: solo un progetto attivo ne ha una. */
export const eAlto = (p: Pick<Progetto, 'stato' | 'priorita'>) => p.stato === 'attivo' && p.priorita === 'alta'

/**
 * Chi deve sapere che l'ordine dei progetti è cambiato.
 *
 * La priorità cambia l'ordine dei blocchi della prima pagina e l'elenco della
 * Memoria, in ogni finestra aperta. Il gesto arriva da due strade (la rotta e
 * lo strumento della chat) e l'annuncio sta in `compiti.ts`, che questo file
 * non può importare senza un giro: lo registra `index.ts` all'avvio.
 */
let alCambioDiPriorita: (() => void) | null = null
export function quandoCambiaLaPriorita(f: (() => void) | null) { alCambioDiPriorita = f }

/**
 * Tutti, o quelli in uno stato. Gli attivi prima, poi i fermi, i chiusi in fondo;
 * dentro ogni stato quelli a priorità alta davanti, poi il più toccato di recente.
 *
 * L'ordine è questo per tutti quelli che leggono da qui: la Memoria, il
 * modello (`perIlModello` tiene i primi otto, e un progetto segnato alto non
 * deve restare fuori dal tetto perché nessuno lo tocca da una settimana), la
 * rassegna che sceglie su quali progetti cercare notizie.
 */
export function elenco(stato?: Stato): Progetto[] {
  importaDalPunto()
  const righe = (stato
    ? db.prepare(`SELECT * FROM progetti WHERE stato = ? ORDER BY ${PRIMA_LE_ALTE}, aggiornato DESC`).all(stato)
    : db.prepare(`
        SELECT * FROM progetti
        ORDER BY CASE stato WHEN 'attivo' THEN 0 WHEN 'fermo' THEN 1 ELSE 2 END, ${PRIMA_LE_ALTE}, aggiornato DESC
      `).all()) as unknown as Riga[]
  return righe.map(daRiga)
}

/**
 * L'ordine dei blocchi con questo progetto in cima. Pura.
 *
 * Sulla prima pagina l'ordine l'aveva già dato lui trascinando i blocchi, e il
 * suo vince sempre (`ordinaBlocchi` nel client). Ma segnare un progetto «alto»
 * è anche quello un ordine suo, e il più recente: se il blocco restasse dov'era
 * la pagina direbbe che il gesto non è servito a niente. Quindi sale in cima
 * all'ordine salvato, e da lì si può ancora trascinare dove vuole.
 */
export function inCimaAllOrdine(ordine: readonly string[], id: string): string[] {
  return [id, ...ordine.filter(x => x !== id)]
}

/** Quelli che contano adesso: attivi e fermi. Un chiuso non è più un progetto. */
export function vivi(): Progetto[] {
  return elenco().filter(p => p.stato !== 'chiuso')
}

/** Imported goals were sometimes used as project names. Keep the original
 * records editable, but do not give a second vote to an inferred alias. */
export function eUnAlias(nome: string, base: Progetto): boolean {
  // un altro nome scritto da lui («everwave» per Evermute) vale come il nome
  if (base.alias.some(a => nomeNormalizzato(a) === nomeNormalizzato(nome))) return true
  // «Myynd for Dad», «Myynd per la casa»: è il progetto, con dentro una cosa
  // da fare. Il punto lo faceva nascere come progetto a sé, e lui lo vedeva
  // doppio: «è lo stesso progetto, è solo una delle attività»
  const perQualcuno = nome.match(/^(.+?)\s+(?:for|per|di|del|della|dei|delle|of)\s+\S/i)
  if (perQualcuno && nomeNormalizzato(perQualcuno[1]) === nomeNormalizzato(base.nome)) return true
  const [prefisso, ...resto] = nome.split(/\s*[:—–]\s*/)
  const coda = resto.join(' ').trim()
  if (!coda || nomeNormalizzato(prefisso) !== nomeNormalizzato(base.nome)) return false
  return /\b(?:i want|i am|my goal|we want|our goal|voglio|vogliamo|il mio obiettivo|obiettivo)\b/i.test(coda) || eLObiettivo(base, coda)
}

export function perContesto(includiChiusi = false): Progetto[] {
  const tutti = elenco()
  return tutti.filter(p => {
    if (!includiChiusi && p.stato === 'chiuso') return false
    return p.origine === 'mano' || !tutti.some(base => base.id !== p.id && base.nome.length < p.nome.length && eUnAlias(p.nome, base))
  })
}

export function trovaPerNome(nome: string): Progetto | undefined {
  const k = chiave(nome)
  if (!k) return undefined
  return elenco().find(p => chiave(p.nome) === k)
}

export function trova(id: string): Progetto | null {
  importaDalPunto()
  const r = db.prepare('SELECT * FROM progetti WHERE id = ?').get(id) as Riga | undefined
  return r ? daRiga(r) : null
}

/**
 * Un progetto da come lo nomina lei in chat.
 *
 * L'id, se il modello l'ha copiato dal contesto; il nome preciso; il nome
 * scritto senza trattini e spazi («HBrain» per «H-Brain»); o un alias come li
 * intende `eUnAlias` («H-Brain for the lab» è H-Brain). Anche un progetto
 * chiuso si trova: «riapri H-Brain» deve poterlo riaprire.
 */
export function risolvi(nomeOId: string): Progetto | null {
  const s = nomeOId.trim()
  if (!s) return null
  const perId = trova(s)
  if (perId) return perId
  const preciso = trovaPerNome(s)
  if (preciso) return preciso
  const compatto = (x: string) => nomeNormalizzato(x).replace(/ /g, '')
  const k = compatto(s)
  if (k.length < 3) return null
  const tutti = elenco()
  // gli altri nomi scritti da lui valgono come il nome, anche compatti
  return tutti.find(p => compatto(p.nome) === k)
    ?? tutti.find(p => p.alias.some(a => compatto(a) === k))
    ?? tutti.find(p => eUnAlias(s, p)) ?? null
}

/**
 * Mettere `id` dentro `genitore` chiuderebbe un anello?
 *
 * Si risale la catena dei padri a partire dal genitore proposto: se si
 * ritrova `id`, il progetto finirebbe dentro un suo sottoprogetto. Un anello
 * già scritto nel database (non dovrebbe esserci) ferma la salita invece di
 * farla girare per sempre.
 */
function chiuderebbeUnAnello(id: string, genitore: string): boolean {
  const visti = new Set<string>()
  let corrente: string | null = genitore
  while (corrente) {
    if (corrente === id) return true
    if (visti.has(corrente)) return true
    visti.add(corrente)
    corrente = trova(corrente)?.genitore ?? null
  }
  return false
}

/**
 * Un progetto nuovo.
 *
 * Lo stesso nome due volte è lo stesso progetto: se c'è già, si aggiorna
 * l'obiettivo che manca e si torna quello. Se lo aveva *chiuso* e lo riapre
 * lui a mano, si riapre — è una sua scelta, con un dito. Il punto invece non
 * passa di qui per un nome chiuso: lo filtra prima, ed è la promessa che un
 * progetto che ha detto di non essere non ricompare.
 */
export function scrivi(p: { nome: string; obiettivo?: string; origine?: Progetto['origine']; dal?: string; note?: string }): Progetto {
  return crea(p).progetto
}

/** Com'è andata una creazione: il progetto, e se c'era già (e se era chiuso, riaperto). */
export type Creazione = { progetto: Progetto; esisteva: boolean; riaperto: boolean }

/**
 * `scrivi`, detto per intero a chi deve rispondere a una persona.
 *
 * «Nuovo progetto: Evermute» quando Evermute c'è già non faceva niente e non
 * diceva niente; su uno chiuso lo riapriva in silenzio, con la priorità alta
 * di mesi prima. Adesso chi chiama sa com'è andata e lo può dire; e un
 * progetto riaperto riparte normale, perché la priorità era di quando c'era.
 */
export function crea(p: { nome: string; obiettivo?: string; origine?: Progetto['origine']; dal?: string; note?: string }): Creazione {
  const nome = p.nome.trim()
  if (!nome) throw new Error('Un progetto ha bisogno di un nome.')
  const ora = new Date().toISOString()
  const gia = trovaPerNome(nome) ?? (p.origine && p.origine !== 'mano'
    ? elenco().find(base => eUnAlias(nome, base)) : undefined)
  if (gia) {
    const obiettivo = gia.obiettivo || (p.obiettivo ?? '').trim()
    const stato: Stato = p.origine && p.origine !== 'mano' ? gia.stato : (gia.stato === 'chiuso' ? 'attivo' : gia.stato)
    const riaperto = gia.stato === 'chiuso' && stato !== 'chiuso'
    const origine = !p.origine || p.origine === 'mano' ? 'mano' : gia.origine
    db.prepare('UPDATE progetti SET obiettivo = ?, stato = ?, origine = ?, priorita = ?, aggiornato = ? WHERE id = ?')
      .run(obiettivo || null, stato, origine, riaperto ? null : gia.priorita, ora, gia.id)
    if (obiettivo !== gia.obiettivo && origine !== 'punto') recordProjectField(gia.id, 'goal', obiettivo, ora, origine === 'conversazione' ? 'user-chat' : 'user-field')
    return { progetto: trova(gia.id)!, esisteva: true, riaperto }
  }
  const id = nuovoId()
  db.prepare(`
    INSERT INTO progetti (id, nome, obiettivo, stato, dal, aggiornato, note, origine)
    VALUES (?, ?, ?, 'attivo', ?, ?, ?, ?)
  `).run(id, nome, (p.obiettivo ?? '').trim() || null, p.dal ?? ora, ora, (p.note ?? '').trim() || null, p.origine ?? 'mano')
  if (p.origine !== 'punto') {
    if (p.obiettivo?.trim()) recordProjectField(id, 'goal', p.obiettivo.trim(), ora, p.origine === 'conversazione' ? 'user-chat' : 'user-field')
    if (p.note?.trim()) recordProjectField(id, 'note', p.note.trim(), ora, p.origine === 'conversazione' ? 'user-chat' : 'user-field')
  }
  return { progetto: trova(id)!, esisteva: false, riaperto: false }
}

/**
 * Cambia quello che c'è da cambiare. Torna `null` se il progetto non esiste.
 *
 * `provenienza` dice da dove arriva il cambio, per la memoria del progetto:
 * dal campo della Memoria (`user-field`, il predefinito) o dalle sue parole in
 * chat (`user-chat`). Un obiettivo detto in chat segna il progetto come
 * «dichiarato nella conversazione», a meno che non l'avesse già scritto lei a
 * mano: quello resta suo.
 */
export type Cambio = {
  nome?: string; obiettivo?: string; stato?: string; note?: string; colore?: string
  /** «alta», o normale: null o vuoto. */
  priorita?: string | null
  /** Gli altri nomi, per intero: quello che manda sostituisce quello che c'era. */
  alias?: unknown
  /** L'id del progetto di cui fa parte; null o vuoto lo toglie. */
  genitore?: string | null
}

export function cambia(id: string, c: Cambio, provenienza: 'user-field' | 'user-chat' = 'user-field'): Progetto | null {
  const p = trova(id)
  if (!p) return null
  const nome = c.nome !== undefined ? c.nome.trim() : p.nome
  if (!nome) throw new Error('Un progetto ha bisogno di un nome.')
  const omonimo = trovaPerNome(nome)
  if (omonimo && omonimo.id !== id) throw new Error('Esiste già un progetto con questo nome.')
  if (c.stato !== undefined && !(STATI as string[]).includes(c.stato)) {
    throw new Error('Lo stato di un progetto è attivo, fermo o chiuso.')
  }
  // vuoto toglie la scelta: la pagina torna al colore stabile dall'id
  if (c.colore !== undefined && c.colore !== '' && !COLORE_VALIDO.test(c.colore)) {
    throw new Error('Il colore di un progetto si scrive #RRGGBB.')
  }
  if (c.alias !== undefined && (!Array.isArray(c.alias) || c.alias.some(a => typeof a !== 'string'))) {
    throw new Error('Gli altri nomi di un progetto sono un elenco di parole.')
  }
  // «alta», o normale (null, vuoto o «normale»): un valore che non si conosce
  // non diventa normale in silenzio
  const scritta = c.priorita === undefined ? p.priorita
    : (c.priorita === null || c.priorita === '' || c.priorita === 'normale' ? null : c.priorita)
  if (scritta !== null && !(PRIORITA as readonly string[]).includes(scritta)) {
    throw new Error('La priorità di un progetto è alta o normale.')
  }
  const chiesta = scritta as Priorita | null
  // un progetto chiuso non ha priorità: chiuderlo la toglie, e non se ne dà una a un chiuso
  const statoDopo = (c.stato ?? p.stato) as Stato
  if (statoDopo === 'chiuso' && c.stato === undefined && c.priorita === 'alta') {
    throw new Error('Un progetto chiuso non ha priorità.')
  }
  // e riaprirlo lo fa ripartire normale: la priorità di prima era di quando c'era
  const riaperto = p.stato === 'chiuso' && statoDopo !== 'chiuso' && c.priorita === undefined
  const priorita = statoDopo === 'chiuso' || riaperto ? null : chiesta
  // un padre che non c'è, sé stesso, o un anello: nessuno dei tre si scrive
  const genitore = c.genitore === undefined ? p.genitore : (String(c.genitore ?? '').trim() || null)
  if (genitore && genitore !== p.genitore) {
    if (genitore === id) throw new Error('Un progetto non può far parte di sé stesso.')
    if (!trova(genitore)) throw new Error('Il progetto di cui farebbe parte non esiste.')
    if (chiuderebbeUnAnello(id, genitore)) throw new Error('Un progetto non può far parte di un suo sottoprogetto.')
  }
  // ripuliti anche quando non cambiano: un nome nuovo uguale a un altro nome lo toglie dagli altri
  const alias = normalizzaAlias(c.alias !== undefined ? (c.alias as string[]) : p.alias, nome)
  if (c.colore !== undefined) db.prepare('UPDATE progetti SET colore = ? WHERE id = ?').run(c.colore || null, id)
  const origine = c.nome !== undefined || c.obiettivo !== undefined
    ? (p.origine === 'mano' || provenienza !== 'user-chat' ? 'mano' : 'conversazione')
    : p.origine
  db.prepare('UPDATE progetti SET nome = ?, obiettivo = ?, stato = ?, note = ?, origine = ?, alias = ?, genitore = ?, priorita = ?, aggiornato = ? WHERE id = ?').run(
    nome,
    (c.obiettivo !== undefined ? c.obiettivo.trim() : p.obiettivo) || null,
    c.stato ?? p.stato,
    (c.note !== undefined ? c.note.trim() : p.note) || null,
    origine,
    alias.length ? JSON.stringify(alias) : null,
    genitore,
    priorita,
    new Date().toISOString(),
    id
  )
  // appena segnato alto, il suo blocco sale in cima anche all'ordine che lui
  // aveva trascinato; tornare normale non lo sposta: dove sta, l'ha visto salire.
  // Solo per un attivo: un fermo non ha un blocco, e non deve prendersi il posto
  const altoPrima = eAlto(p)
  const altoDopo = eAlto({ stato: statoDopo, priorita })
  if (altoDopo && !altoPrima) {
    const ordine = leggiConfig().ordineBlocchi
    if (ordine?.length) aggiornaConfig({ ordineBlocchi: inCimaAllOrdine(ordine, id) })
  }
  if (altoDopo !== altoPrima || priorita !== p.priorita) alCambioDiPriorita?.()
  const ora = new Date().toISOString()
  if (c.obiettivo !== undefined && c.obiettivo.trim() !== p.obiettivo) recordProjectField(id, 'goal', c.obiettivo.trim(), ora, provenienza)
  if (c.note !== undefined && c.note.trim() !== p.note) recordProjectField(id, 'note', c.note.trim(), ora, provenienza)
  if (nome !== p.nome) {
    db.prepare('UPDATE convinzioni SET ambito = ? WHERE ambito = ?')
      .run(`progetto:${nome}`, `progetto:${p.nome}`)
  }
  return trova(id)
}

/** «Non è un progetto», o «è finito»: resta scritto, e non torna. */
export function chiudi(id: string): boolean {
  return cambia(id, { stato: 'chiuso' }) !== null
}

/** Cosa si è spostato unendo due progetti: per dirlo, e per provarlo. */
export type Unione = { progetto: Progetto; spostati: { compiti: number; feed: number; domande: number; chat: number; memoria: number; figli: number } }

/**
 * Due progetti che sono la stessa cosa diventano uno.
 *
 * Il punto ne faceva nascere uno da una cartella e lui ne aveva già scritto
 * uno a mano con un altro nome: «everwave» ed «Evermute» con le attività
 * divise a metà. Tutto quello che stava sotto il primo passa sotto il
 * secondo: le righe della lista, le voci del feed, le domande, le chat, la
 * memoria del progetto (con la sua provenienza), i sottoprogetti e le
 * convinzioni con il suo ambito. Il nome e gli altri nomi del primo
 * diventano altri nomi del secondo, così un testo che lo nomina continua a
 * trovarlo; l'obiettivo e le note del primo si accodano alle note del
 * secondo, con la data, perché non si perda una parola sua.
 *
 * Il primo poi si *cancella*, non si chiude. È l'unica riga di questo file
 * che cancella, ed è una scelta: un progetto chiuso resta scritto perché
 * «non torni», e i chiusi si dicono al modello come «non sono progetti».
 * Qui è il contrario: quel nome È un progetto, l'altro. Una riga chiusa con
 * lo stesso nome si prenderebbe «riapri everwave» in chat e direbbe al
 * modello una cosa falsa. Niente di suo va perso: sta tutto nel secondo.
 */
export function unisci(daId: string, inId: string): Unione {
  const da = trova(daId)
  const dentro = trova(inId)
  if (!da || !dentro) throw new Error('Questo progetto non c’è.')
  if (da.id === dentro.id) throw new Error('Un progetto non si unisce a sé stesso.')

  const spostati = riassegnaProgetto(da.id, dentro.id)
  const memoria = riassegnaMemoriaProgetto(da.id, dentro.id)
  // le decisioni tenute sotto il suo nome seguono il nome nuovo, come in un cambio di nome
  db.prepare('UPDATE convinzioni SET ambito = ? WHERE ambito = ?').run(`progetto:${dentro.nome}`, `progetto:${da.nome}`)
  // i sottoprogetti del primo diventano sottoprogetti del secondo; e se il
  // secondo stava dentro il primo, adesso non sta dentro niente
  const figli = (db.prepare('UPDATE progetti SET genitore = ? WHERE genitore = ? AND id != ?').run(dentro.id, da.id, dentro.id) as { changes: number }).changes
  if (dentro.genitore === da.id) db.prepare('UPDATE progetti SET genitore = NULL WHERE id = ?').run(dentro.id)

  const giorno = new Date().toISOString().slice(0, 10)
  // la nota si legge nella Memoria, nella lingua dell'app: scritta in italiano
  // spuntava in mezzo all'interfaccia inglese
  const en = linguaApp() === 'en'
  const righe = [en
    ? `${giorno}: merged the project “${da.nome}”${da.obiettivo ? `. Goal: ${da.obiettivo}` : ''}`
    : `${giorno}: unito il progetto «${da.nome}»${da.obiettivo ? `. Obiettivo: ${da.obiettivo}` : ''}`]
  if (da.note) righe.push(da.note)
  const note = senzaTrattini([dentro.note, ...righe].filter(Boolean).join('\n'))
  cambia(dentro.id, { alias: [...dentro.alias, da.nome, ...da.alias], note })
  // la priorità alta di uno dei due resta: scritta direttamente, e non con
  // `cambia`, che la porterebbe in cima all'ordine dei blocchi scelto da lui
  if (!dentro.priorita && da.priorita && dentro.stato !== 'chiuso') {
    db.prepare('UPDATE progetti SET priorita = ? WHERE id = ?').run(da.priorita, dentro.id)
  }

  db.prepare('DELETE FROM progetti WHERE id = ?').run(da.id)
  // e sulla prima pagina il blocco del primo era dove lui l'aveva messo: lì resta, con il nome del secondo
  const ordine = leggiConfig().ordineBlocchi
  if (ordine?.includes(da.id)) {
    aggiornaConfig({ ordineBlocchi: ordine.includes(dentro.id) ? ordine.filter(x => x !== da.id) : ordine.map(x => x === da.id ? dentro.id : x) })
  }
  return { progetto: trova(dentro.id)!, spostati: { ...spostati, memoria, figli } }
}

/** Cosa si è staccato cancellando un progetto: per dirlo, e per provarlo. */
export type Cancellazione = { staccati: { compiti: number; feed: number; domande: number; chat: number; memoria: number; figli: number } }

/**
 * Via del tutto, per sua scelta.
 *
 * Chiudere è per un progetto finito, o che non era un progetto: la riga resta
 * e il modello sa che non deve riproporlo. Cancellare è per una riga che non
 * doveva esserci, un doppione con un nome storto, una prova: qui non deve
 * restare traccia. Le attività, le voci del feed, le domande e le chat che
 * stavano sotto non si perdono: restano, senza progetto, dove stavano. La
 * memoria del progetto si dimentica, perché parlerebbe di un id che non c'è;
 * i sottoprogetti restano, senza padre; le convinzioni con il suo ambito
 * restano sue. Un nome cancellato può rinascere: se il punto ritrova la
 * cartella la propone di nuovo, ed è giusto così, perché cancellare non è
 * «non è un progetto». Per quello c'è chiuso.
 */
export function elimina(id: string): Cancellazione {
  const p = trova(id)
  if (!p) throw new Error('Questo progetto non c’è.')
  const staccati = riassegnaProgetto(p.id, null)
  const memoria = dimenticaProgetto(p.id)
  const figli = (db.prepare('UPDATE progetti SET genitore = NULL WHERE genitore = ?').run(p.id) as { changes: number }).changes
  db.prepare('DELETE FROM progetti WHERE id = ?').run(p.id)
  const ordine = leggiConfig().ordineBlocchi
  if (ordine?.includes(p.id)) aggiornaConfig({ ordineBlocchi: ordine.filter(x => x !== p.id) })
  return { staccati: { ...staccati, memoria, figli } }
}

/**
 * L'ordine dei blocchi della prima pagina, pulito: id di progetti che
 * esistono e «resto», ognuno una volta, al massimo cinquanta. Null se non è
 * un elenco di parole: quello è un client che non sappiamo leggere.
 */
export function ordineBlocchiValido(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.some(x => typeof x !== 'string')) return null
  const visti = new Set<string>()
  const puliti: string[] = []
  for (const x of v as string[]) {
    const id = x.trim()
    if (!id || visti.has(id) || (id !== 'resto' && !trova(id))) continue
    visti.add(id)
    puliti.push(id)
    if (puliti.length >= ORDINE_BLOCCHI_MAX) break
  }
  return puliti
}

export type Progresso = {
  aperte: number
  inCorso: number
  daRivedere: number
  completate: number
  lasciate: number
  prossima: Compito | null
  attivita: Compito[]
}

/** Stati letti dalle attività reali, mai una percentuale indovinata dell'obiettivo. */
export function progresso(id: string): Progresso {
  const ids = db.prepare(`SELECT id FROM compiti WHERE progetto = ? AND sparito IS NULL
    ORDER BY CASE stato WHEN 'chiede' THEN 0 WHEN 'pronto' THEN 1 WHEN 'delegato' THEN 2
      WHEN 'aperto' THEN 3 ELSE 4 END, CASE WHEN giorno IS NULL THEN 1 ELSE 0 END,
      giorno ASC, aggiornato DESC`).all(id) as { id: string }[]
  const attuali = new Set(compitiAttuali().map(c => c.id))
  // The same current work as To do, plus its completed/left history. Hidden,
  // untouched Brief suggestions stay stored without inflating project work.
  const tutte = ids.flatMap(r => compito(r.id) ?? []).filter(c =>
    c.stato === 'fatto' || c.stato === 'lasciato' || attuali.has(c.id))
  const conta = (...stati: string[]) => tutte.filter(c => stati.includes(c.stato)).length
  return {
    aperte: conta('aperto'), inCorso: conta('delegato'), daRivedere: conta('pronto', 'chiede'),
    completate: conta('fatto'), lasciate: conta('lasciato'),
    prossima: tutte.find(c => !['fatto', 'lasciato'].includes(c.stato)) ?? null,
    attivita: tutte.slice(0, 30)
  }
}

/**
 * I progetti come li legge il modello: una riga l'uno, attivi prima.
 *
 * È la stessa riga per il feed, la rassegna e il punto, e ha un tetto: otto.
 * Non è un limite tecnico — è che «su cosa sta lavorando» con venti voci non
 * vuol dire più niente, e ogni riga è prompt pagato tre volte al giorno.
 */
export function perIlModello(discorso = '', tetto = PER_IL_MODELLO, soloNominati = false): string {
  const tutti = perContesto()
  const nominati = tutti.filter(p => nominaProgetto(discorso, p))
  const rilevanza = (p: Progetto) => nominaProgetto(discorso, p) ? 2 : Number(tocca(p, discorso))
  // a parità di quanto c'entrano con il discorso: gli attivi prima dei fermi,
  // e dentro ognuno quelli che ha segnato alti. Sono i primi a entrare nel
  // tetto, e i primi che il modello legge
  const rango = (p: Progetto) => (p.stato === 'attivo' ? 0 : 2) + (eAlto(p) ? 0 : 1)
  return (soloNominati && nominati.length ? nominati : tutti)
    .sort((a, b) => rilevanza(b) - rilevanza(a) || rango(a) - rango(b)).slice(0, tetto)
    .map(p => {
      const a = progresso(p.id)
      const stato = a.attivita.length ? ` · ${a.completate} attività concluse${a.prossima ? `; prossima: ${a.prossima.testo.slice(0, 160)} [${a.prossima.stato}]` : ''}` : ''
      const origine = p.origine === 'mano' ? 'registrato dalla persona' : p.origine === 'conversazione' ? 'dichiarato nella conversazione'
        : 'inferito dalle fonti, non confermato dalla persona'
      // gli altri nomi e il padre: il modello deve riconoscere «everwave» e sapere che H-Brain sta dentro Myynd
      const altri = p.alias.length ? ` · Altri nomi: ${p.alias.join(', ')}` : ''
      const padre = p.genitore ? trova(p.genitore) : null
      const dentro = padre ? ` · Fa parte di ${padre.nome}` : ''
      for (const task of a.attivita) recordTaskOutcome(task.id)
      const evidence = projectMemoryContext(p.id)
      const priorita = eAlto(p) ? '; priorità alta, segnata dalla persona: viene prima degli altri' : ''
      return `— Progetto: ${p.nome} (${p.stato}${priorita}; ${origine}). Obiettivo di ${p.nome}: ${p.obiettivo || 'non registrato; non dedurlo da altri progetti'}.${stato}${altri}${dentro} · Aggiornato ${p.aggiornato}` +
        (p.note ? `\n${p.origine === 'punto' ? 'Note inferite, non confermate' : 'Note salvate dalla persona'}: ${JSON.stringify(p.note.slice(0,900))}` : '') +
        (evidence ? `\n${evidence}` : '')
    })
    .join('\n')
}

/** I nomi che ha chiuso: al modello si dicono come «non sono progetti». */
export function chiusi(): string[] {
  return elenco('chiuso').map(p => p.nome)
}

/**
 * Le parole dell'obiettivo che contano.
 *
 * Sotto le quattro lettere ci sono articoli e preposizioni; e ci sono parole
 * lunghe che stanno in ogni obiettivo — «progetto», «fare», «lavoro» — e non
 * distinguono niente. Quello che resta è quello che un documento che c'entra
 * userebbe anche lui.
 */
const VUOTE = new Set([
  'progetto', 'progetti', 'fare', 'lavoro', 'lavorare', 'cosa', 'cose', 'anche', 'come', 'dove', 'quando',
  'questo', 'questa', 'quello', 'quella', 'della', 'dello', 'delle', 'degli', 'nella', 'sulla', 'entro',
  'prima', 'dopo', 'sono', 'essere', 'avere', 'tutto', 'tutti', 'ogni', 'senza', 'with', 'from', 'that',
  'this', 'have', 'make', 'project', 'work', 'into', 'about', 'over', 'their', 'there', 'what', 'when', 'where'
])

export function paroleDi(p: { nome: string; obiettivo: string }): string[] {
  return [...new Set(
    p.obiettivo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !VUOTE.has(w))
  )]
}

/**
 * Questo testo *è* l'obiettivo, riscritto.
 *
 * Non «ne parla»: lo ripete. L'obiettivo di un progetto sta nell'istruzione
 * del feed per una ragione sola — far capire al modello cosa NON riproporre —
 * e la ragione è scritta lì in chiaro. Il quattordici settembre l'ha
 * riproposto lo stesso, due volte nella stessa lettura: «Ship the finished
 * site copy and offers live» è tornato indietro come «Ship live site copy for
 * tobiadonadon.com» e «Ship finished site copy for tobiadonadon.com».
 *
 * Una frase in prosa il modello la disattende; un conto no. La soglia è alta
 * apposta: una voce che parla davvero di quel progetto condivide due o tre
 * parole con l'obiettivo, non quasi tutte. «Il cliente ha rimandato il testo
 * del sito» ne condivide due e passa; l'obiettivo ricopiato ne condivide
 * quattro su cinque e non passa.
 */
export function eLObiettivo(p: { nome: string; obiettivo: string }, testo: string): boolean {
  const sue = paroleDi(p)
  if (sue.length < 3) return false
  const parole = new Set(
    testo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !VUOTE.has(w))
  )
  if (parole.size < 3) return false
  const comuni = sue.filter(w => parole.has(w)).length
  return comuni >= 3 && comuni / Math.min(sue.length, parole.size) >= 0.75
}

/** Uno qualunque dei progetti vivi si riconosce riscritto in questo testo. */
export function eUnObiettivo(testo: string, progetti = vivi()): boolean {
  return progetti.some(p => eLObiettivo(p, testo))
}

/**
 * Questo testo tocca il progetto?
 *
 * Il nome intero, oppure due parole distintive dell'obiettivo: una sola
 * sarebbe troppo poco — «prezzo» sta in metà della posta — e tre sarebbero
 * troppe per un oggetto di email. Niente modello qui: è il criterio con cui
 * si decide *cosa fargli leggere*, e deve costare zero.
 */
export function tocca(p: { nome: string; obiettivo: string; alias?: string[] }, testo: string): boolean {
  const paroleTesto = new Set(nomeNormalizzato(testo).split(' '))
  if (nominaProgetto(testo, { nome: p.nome, alias: p.alias ?? [] })) return true
  const parole = paroleDi(p)
  if (parole.length < 2) return false
  let trovate = 0
  for (const w of parole) {
    if (paroleTesto.has(w) && ++trovate >= 2) return true
  }
  return false
}

/** Il testo tocca uno dei progetti vivi? Per ordinare, non per escludere. */
export function toccaUnProgetto(testo: string, progetti = vivi()): boolean {
  return progetti.some(p => tocca(p, testo))
}
