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

import { recordProjectField, recordTaskOutcome, projectMemoryContext } from './project-memory.ts'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cartella } from './config.ts'
import { nominaAmbito, nomeNormalizzato } from './ambiti-memoria.ts'
import db, { compito, type Compito } from './store.ts'
import { compitiAttuali } from './attenzione.ts'

export type Stato = 'attivo' | 'fermo' | 'chiuso'
export const STATI: Stato[] = ['attivo', 'fermo', 'chiuso']

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
}

const COLORE_VALIDO = /^#[0-9a-f]{6}$/i

/** Quanti se ne nominano al modello: oltre, non è più «su cosa sta lavorando». */
const PER_IL_MODELLO = 8

type Riga = {
  id: string; nome: string; obiettivo: string | null; stato: string; dal: string
  aggiornato: string; note: string | null; origine: string | null; colore?: string | null
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
  colore: r.colore && COLORE_VALIDO.test(r.colore) ? r.colore : ''
})

const chiave = (s: string) => s.trim().toLowerCase()

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

/** Tutti, o quelli in uno stato. Gli attivi prima, poi i fermi, i chiusi in fondo. */
export function elenco(stato?: Stato): Progetto[] {
  importaDalPunto()
  const righe = (stato
    ? db.prepare('SELECT * FROM progetti WHERE stato = ? ORDER BY aggiornato DESC').all(stato)
    : db.prepare(`
        SELECT * FROM progetti
        ORDER BY CASE stato WHEN 'attivo' THEN 0 WHEN 'fermo' THEN 1 ELSE 2 END, aggiornato DESC
      `).all()) as unknown as Riga[]
  return righe.map(daRiga)
}

/** Quelli che contano adesso: attivi e fermi. Un chiuso non è più un progetto. */
export function vivi(): Progetto[] {
  return elenco().filter(p => p.stato !== 'chiuso')
}

/** Imported goals were sometimes used as project names. Keep the original
 * records editable, but do not give a second vote to an inferred alias. */
export function eUnAlias(nome: string, base: Progetto): boolean {
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
  return tutti.find(p => compatto(p.nome) === k) ?? tutti.find(p => eUnAlias(s, p)) ?? null
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
  const nome = p.nome.trim()
  if (!nome) throw new Error('Un progetto ha bisogno di un nome.')
  const ora = new Date().toISOString()
  const gia = trovaPerNome(nome) ?? (p.origine && p.origine !== 'mano'
    ? elenco().find(base => eUnAlias(nome, base)) : undefined)
  if (gia) {
    const obiettivo = gia.obiettivo || (p.obiettivo ?? '').trim()
    const stato: Stato = p.origine && p.origine !== 'mano' ? gia.stato : (gia.stato === 'chiuso' ? 'attivo' : gia.stato)
    const origine = !p.origine || p.origine === 'mano' ? 'mano' : gia.origine
    db.prepare('UPDATE progetti SET obiettivo = ?, stato = ?, origine = ?, aggiornato = ? WHERE id = ?')
      .run(obiettivo || null, stato, origine, ora, gia.id)
    if (obiettivo !== gia.obiettivo && origine !== 'punto') recordProjectField(gia.id, 'goal', obiettivo, ora, origine === 'conversazione' ? 'user-chat' : 'user-field')
    return trova(gia.id)!
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
  return trova(id)!
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
export function cambia(id: string, c: { nome?: string; obiettivo?: string; stato?: string; note?: string; colore?: string }, provenienza: 'user-field' | 'user-chat' = 'user-field'): Progetto | null {
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
  if (c.colore !== undefined) db.prepare('UPDATE progetti SET colore = ? WHERE id = ?').run(c.colore || null, id)
  const origine = c.nome !== undefined || c.obiettivo !== undefined
    ? (p.origine === 'mano' || provenienza !== 'user-chat' ? 'mano' : 'conversazione')
    : p.origine
  db.prepare('UPDATE progetti SET nome = ?, obiettivo = ?, stato = ?, note = ?, origine = ?, aggiornato = ? WHERE id = ?').run(
    nome,
    (c.obiettivo !== undefined ? c.obiettivo.trim() : p.obiettivo) || null,
    c.stato ?? p.stato,
    (c.note !== undefined ? c.note.trim() : p.note) || null,
    origine,
    new Date().toISOString(),
    id
  )
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
  const nominati = tutti.filter(p => nominaAmbito(discorso, p.nome))
  const rilevanza = (p: Progetto) => nominaAmbito(discorso, p.nome) ? 2 : Number(tocca(p, discorso))
  return (soloNominati && nominati.length ? nominati : tutti)
    .sort((a, b) => rilevanza(b) - rilevanza(a)).slice(0, tetto)
    .map(p => {
      const a = progresso(p.id)
      const stato = a.attivita.length ? ` · ${a.completate} attività concluse${a.prossima ? `; prossima: ${a.prossima.testo.slice(0, 160)} [${a.prossima.stato}]` : ''}` : ''
      const origine = p.origine === 'mano' ? 'registrato dalla persona' : p.origine === 'conversazione' ? 'dichiarato nella conversazione'
        : 'inferito dalle fonti, non confermato dalla persona'
      for (const task of a.attivita) recordTaskOutcome(task.id)
      const evidence = projectMemoryContext(p.id)
      return `— Progetto: ${p.nome} (${p.stato}; ${origine}). Obiettivo di ${p.nome}: ${p.obiettivo || 'non registrato; non dedurlo da altri progetti'}.${stato} · Aggiornato ${p.aggiornato}` +
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
export function tocca(p: { nome: string; obiettivo: string }, testo: string): boolean {
  const paroleTesto = new Set(nomeNormalizzato(testo).split(' '))
  if (nominaAmbito(testo, p.nome)) return true
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
