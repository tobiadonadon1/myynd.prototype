// Granola: le riunioni, già scritte, senza chiedere niente a nessuno.
//
// Granola sta sul Mac di chi lo usa, ascolta le riunioni e ne scrive le note.
// Quelle note sono la fonte più densa che una persona abbia — quello che si è
// detto a voce, che non esiste in nessuna email e in nessun file — e finché
// restano dentro Granola, Myynd ragiona su tutto tranne che su quello.
//
// **Si legge la sua cache, non la sua API.** È lo stesso ragionamento del
// calendario, e per le stesse ragioni: Granola tiene tutto quello che ha
// scritto in un file su questo disco, e leggere un file non chiede un token,
// non chiede un consenso, non chiede a chi usa Myynd di andare a registrare
// un'applicazione da qualche parte. Si collega premendo un bottone.
//
// **Il prezzo, e va detto qui perché è l'unica cosa che invecchierà.** Quel
// file è roba interna di Granola: nessuno l'ha documentato e nessuno ha
// promesso che resti com'è. Il nome ha già un numero di versione in fondo —
// `cache-v3.json` — che è Granola stessa che avvisa che ce n'è stata una due.
// Quindi qui dentro non si dà per scontato niente sulla forma: ogni pezzo si
// prende se c'è e si salta se non c'è, e quando la forma non si riconosce più
// il connettore lo *dice* — «Granola ha cambiato il modo in cui salva le
// note» — invece di collegarsi e restare a zero per sempre, che è il modo in
// cui una fonte rotta si scopre dopo un mese.
//
// **Si legge e basta.** Non si scrive dentro Granola, non si cancella, non si
// tocca il file: si apre in lettura e si chiude.

import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Documento } from '../store.ts'
import { lingua } from '../config.ts'

export type ConfigGranola = {
  /** Quante note ha letto l'ultima volta, per la scheda. */
  note?: number
}

/** Il tetto di note. Chi fa riunioni tutto il giorno da due anni ci arriva. */
const TETTO = 4000

/** Quanto testo si tiene per nota. Oltre, è una trascrizione, non una nota. */
const TESTO_MAX = 24_000

/**
 * Dove Granola tiene quello che ha scritto.
 *
 * Un percorso solo, e fisso: **non si prende da chi collega**. Sembrerebbe
 * gentile lasciar scegliere il file — «se l'hai installato altrove» — e
 * sarebbe invece l'unico modo per far leggere a Myynd un file qualunque di
 * questo disco scrivendone il percorso in una casella. Granola è un'app del
 * Mac App Store: sta dove sta.
 */
export function percorso(): string {
  return join(homedir(), 'Library', 'Application Support', 'Granola', 'cache-v3.json')
}

/** Su Windows e su un server Granola non c'è: la scheda lo dice invece di fallire. */
export function possibile(): boolean {
  return process.platform === 'darwin'
}

// — il file —

/**
 * La cache, aperta.
 *
 * Il file è un JSON che dentro ne contiene un altro **come stringa**: la
 * chiave `cache` non è un oggetto, è il testo di un oggetto. Non è un capriccio
 * di Granola — è come salva lo store che usa — ma è la prima cosa contro cui
 * sbatte chi prova a leggerlo, perché `JSON.parse` riesce, non dà errore, e
 * quello che si ha in mano è una stringa dove ci si aspettava una mappa.
 *
 * Si accetta anche la forma non annidata, per due ragioni oneste: non abbiamo
 * modo di sapere se tutte le versioni la scrivano così, e se un domani
 * Granola smette di annidarla questa funzione continua a funzionare invece di
 * dire che il file è rotto.
 */
function apri(grezzo: string): Record<string, unknown> | null {
  let primo: unknown
  try { primo = JSON.parse(grezzo) } catch { return null }
  if (!primo || typeof primo !== 'object') return null
  const dentro = (primo as { cache?: unknown }).cache
  let vero: unknown = primo
  if (typeof dentro === 'string') {
    try { vero = JSON.parse(dentro) } catch { return null }
  } else if (dentro && typeof dentro === 'object') {
    vero = dentro
  }
  if (!vero || typeof vero !== 'object') return null
  const stato = (vero as { state?: unknown }).state
  return (stato && typeof stato === 'object' ? stato : vero) as Record<string, unknown>
}

/**
 * Le note, in un elenco, comunque siano scritte.
 *
 * Granola le tiene in una mappa da id a nota — perché è così che si cerca una
 * nota per id — ma un elenco è una forma altrettanto plausibile per chi
 * scriverà la versione dopo, e distinguerle costa tre righe.
 */
function elenco(x: unknown): Record<string, unknown>[] {
  if (Array.isArray(x)) return x.filter(v => v && typeof v === 'object') as Record<string, unknown>[]
  if (x && typeof x === 'object') {
    return Object.values(x as Record<string, unknown>).filter(v => v && typeof v === 'object') as Record<string, unknown>[]
  }
  return []
}

// — il testo —

/** I nodi che vanno a capo: senza, un elenco puntato diventa una riga sola. */
const A_CAPO = new Set([
  'paragraph', 'heading', 'listItem', 'list_item', 'blockquote',
  'codeBlock', 'code_block', 'horizontalRule', 'horizontal_rule'
])

/**
 * Il testo dentro un documento ProseMirror.
 *
 * Le note di Granola non sono testo: sono l'albero dell'editor in cui le hai
 * viste. Preso com'è, nell'indice ci finisce `{"type":"doc","content":[…]}` —
 * cioè una nota che non si trova cercando nessuna delle parole che contiene, e
 * che il modello legge come una struttura dati. Qui si scende nell'albero e si
 * tengono le foglie, con un a capo dove l'editor ne mostrava uno.
 *
 * `visti` non è prudenza generica: è un albero che arriva da un file, e un
 * riferimento circolare — o solo molto profondo — qui dentro sarebbe uno
 * stack che finisce durante una sincronizzazione notturna.
 */
function testoDi(nodo: unknown, dentro = 0, visti = new Set<unknown>()): string {
  if (typeof nodo === 'string') return nodo
  if (!nodo || typeof nodo !== 'object' || dentro > 40) return ''
  if (visti.has(nodo)) return ''
  visti.add(nodo)

  if (Array.isArray(nodo)) return nodo.map(n => testoDi(n, dentro + 1, visti)).join('')

  const n = nodo as { type?: unknown; text?: unknown; content?: unknown }
  if (typeof n.text === 'string') return n.text

  const sotto = testoDi(n.content, dentro + 1, visti)
  const tipo = typeof n.type === 'string' ? n.type : ''
  if (!sotto.trim()) return ''
  if (tipo === 'listItem' || tipo === 'list_item') return `— ${sotto.trim()}\n`
  return A_CAPO.has(tipo) ? `${sotto}\n` : sotto
}

/** Righe vuote di fila e spazi in coda: una nota, non un file. */
function ripulisci(s: string): string {
  return s.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Il testo di una nota, prendendo la versione migliore che c'è.
 *
 * Granola ne tiene più d'una della stessa riunione: quello che hai scritto tu
 * mentre parlavate, e quello che ha riscritto lei dopo — i «pannelli», che
 * sono il riassunto vero e la ragione per cui una persona usa Granola. Si
 * tengono tutti e due, in quest'ordine, perché rispondono a due domande
 * diverse: il riassunto dice cos'è stato deciso, gli appunti dicono cosa hai
 * pensato tu mentre lo decidevate.
 */
function corpoDi(nota: Record<string, unknown>, pannelli: Record<string, unknown>[]): string {
  const pezzi: string[] = []

  for (const p of pannelli) {
    const testo = typeof p.original_content === 'string' && p.original_content.trim()
      ? p.original_content
      : testoDi(p.content)
    const pulito = ripulisci(typeof testo === 'string' ? testo : '')
    if (pulito) pezzi.push(pulito)
  }

  const miei = typeof nota.notes_markdown === 'string' && nota.notes_markdown.trim()
    ? nota.notes_markdown
    : typeof nota.notes_plain === 'string' && nota.notes_plain.trim()
      ? nota.notes_plain
      : testoDi(nota.notes)
  const mieiPuliti = ripulisci(miei)
  if (mieiPuliti && !pezzi.some(p => p === mieiPuliti)) pezzi.push(mieiPuliti)

  const tutto = pezzi.join('\n\n')
  return tutto.length > TESTO_MAX ? `${tutto.slice(0, TESTO_MAX)}…` : tutto
}

/** Chi c'era, se il file lo dice. Serve a cercare una riunione per il nome di una persona. */
function conChi(nota: Record<string, unknown>): string[] {
  const evento = nota.google_calendar_event
  if (!evento || typeof evento !== 'object') return []
  const invitati = (evento as { attendees?: unknown }).attendees
  if (!Array.isArray(invitati)) return []
  const nomi: string[] = []
  for (const i of invitati.slice(0, 40)) {
    if (!i || typeof i !== 'object') continue
    const v = i as { displayName?: unknown; email?: unknown }
    const nome = typeof v.displayName === 'string' ? v.displayName.trim() : ''
    const posta = typeof v.email === 'string' ? v.email.trim() : ''
    const scritto = nome && nome !== posta ? `${nome} <${posta}>` : nome || posta
    if (scritto) nomi.push(scritto)
  }
  return nomi
}

function quandoDi(nota: Record<string, unknown>): string | null {
  for (const chiave of ['created_at', 'updated_at', 'created', 'date']) {
    const v = nota[chiave]
    if (typeof v !== 'string' && typeof v !== 'number') continue
    const d = new Date(v)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  return null
}

// — leggere —

export type EsitoGranola = {
  docs: Documento[]
  /** Le note che c'erano ma senza una parola dentro: esistono, non si indicizzano. */
  vuote: number
  troncato: boolean
}

/**
 * Le note di Granola, lette dal disco.
 *
 * `troncato` vuol dire «non le ho viste tutte», e da qui va fino a
 * `riconcilia`: senza, una lettura fermata al tetto cancellerebbe
 * dall'indice tutte le riunioni che non ha fatto in tempo a rileggere.
 */
export async function leggi(): Promise<EsitoGranola> {
  let grezzo: string
  try {
    grezzo = await readFile(percorso(), 'utf8')
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code === 'ENOENT') throw new Error('Non trovo le note di Granola su questo computer. Apri Granola una volta e riprova.')
    if (code === 'EACCES' || code === 'EPERM') throw new Error('Non ho il permesso di leggere le note di Granola.')
    throw new Error('Non riesco a leggere le note di Granola.')
  }

  /*
   * Un `null` invece di un errore, e non è pedanteria.
   *
   * Qui dentro «il file non si capisce» e «il file dice che non ci sono note»
   * sono lo stesso guasto e devono dire la stessa frase — quella sotto — a chi
   * legge. Un `throw` con un messaggio tecnico in mezzo sarebbe una seconda
   * frase, in italiano, che nessuno traduce perché nessuno la vede mai finché
   * un giorno la vede qualcuno.
   */
  const stato = apri(grezzo)
  const note = stato ? elenco(stato.documents ?? stato.notes) : []
  if (!stato || (!note.length && !('documents' in stato))) {
    // né note né il posto dove starebbero: è un file che non parla più la
    // nostra lingua, e dirlo è meglio che collegarsi e restare a zero
    throw new Error('Granola ha cambiato il modo in cui salva le note: questo collegamento va aggiornato.')
  }

  /*
   * I pannelli stanno in un'altra mappa, indicizzata per nota.
   *
   * È dove vive il riassunto scritto da Granola — cioè il pezzo che una
   * persona considera «la nota» — e sta separato dalla nota stessa perché di
   * pannelli ce n'è più d'uno. Se la mappa non c'è, si va avanti con quello
   * che ha scritto lei a mano: meno, ma vero.
   */
  const perNota = new Map<string, Record<string, unknown>[]>()
  const grezziPannelli = stato.documentPanels ?? stato.document_panels
  if (grezziPannelli && typeof grezziPannelli === 'object' && !Array.isArray(grezziPannelli)) {
    for (const [id, suoi] of Object.entries(grezziPannelli as Record<string, unknown>)) {
      const p = elenco(suoi)
      if (p.length) perNota.set(id, p)
    }
  }

  const senzaTitolo = lingua() === 'it' ? 'Riunione senza titolo' : 'Untitled meeting'
  const con = lingua() === 'it' ? 'Con' : 'With'

  const docs: Documento[] = []
  let vuote = 0
  let troncato = false

  for (const nota of note) {
    if (docs.length >= TETTO) { troncato = true; break }

    const id = typeof nota.id === 'string' ? nota.id.trim() : ''
    if (!id) continue
    // una nota buttata in Granola è buttata anche qui: sta nel file, non è più sua
    if (nota.deleted_at || nota.deleted === true) continue

    const testo = corpoDi(nota, perNota.get(id) ?? [])
    if (!testo) { vuote++; continue }

    const invitati = conChi(nota)
    const titolo = typeof nota.title === 'string' && nota.title.trim() ? nota.title.trim() : senzaTitolo

    docs.push({
      id: `granola:${id}`,
      fonte: 'granola',
      tipo: 'nota',
      titolo,
      /*
       * Chi c'era va dentro il corpo, non solo accanto.
       *
       * È l'indice a parole intere che cerca qui: «cosa ci siamo detti con
       * Marco» trova questa riunione solo se «Marco» è una delle parole del
       * documento. Fuori dal corpo il nome sta in un campo che la ricerca non
       * guarda, e la riunione con Marco si trova solo ricordandosi il titolo.
       */
      corpo: invitati.length ? `${con}: ${invitati.join(', ')}\n\n${testo}` : testo,
      autore: invitati[0] ?? null,
      quando: quandoDi(nota),
      gruppo: 'note'
    })
  }

  return { docs, vuote, troncato }
}

/** La prova è già una lettura vera: se passa, il collegamento funziona. */
export async function prova(): Promise<{ ok: true; note: number } | { ok: false; errore: string }> {
  if (!possibile()) return { ok: false, errore: 'Granola è un’app per Mac: su questo computer non c’è niente da leggere.' }
  try {
    const e = await leggi()
    return { ok: true, note: e.docs.length }
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : String(e) }
  }
}

export async function sincronizza(): Promise<EsitoGranola> {
  return leggi()
}

export function collegato(c: { granola?: ConfigGranola }): boolean {
  return !!c.granola
}

/** Quando Granola ha scritto l'ultima volta. Serve solo a dirlo sulla scheda. */
export async function ultimaVolta(): Promise<Date | null> {
  try { return (await stat(percorso())).mtime } catch { return null }
}
