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
//
// **Com'è andata davvero, e perché la tester del 23 settembre 2026 non si è
// collegata.** Quel file noi non l'avevamo mai visto: la forma era dedotta.
// Chi legge Granola da fuori — server MCP, estensioni di Obsidian, esportatori
// — ha scritto nei suoi bug cosa è successo a partire da febbraio 2026:
//
//   · febbraio 2026: `cache-v3.json` sparisce e diventa `cache-v4.json`, e la
//     chiave `cache` smette di essere una stringa e diventa un oggetto
//     (github.com/proofsh/granola-mcp-server/issues/14);
//   · aprile 2026: `cache-v6.json`, con dentro un numero di versione che non
//     è quello del nome, 6 e poi 8 (github.com/theantichris/granola/issues/22,
//     github.com/openclaw/graincrawl commit 9b4b6da);
//   · da maggio 2026 (7.205): la cache vera va in `cache-v6.json.enc`, cifrata,
//     e le riunioni non ci stanno più nemmeno lì dentro: Granola le chiede al
//     suo cloud. Il `cache-v6.json` in chiaro resta, ma è un moncherino senza
//     `documents` (github.com/mvanhorn/printing-press-library, file
//     granola/internal/granola/safestorage/testdata/scheme.md;
//     github.com/RhysEJF/flow-sales, docs/research/granola-access.md §3.6);
//   · da luglio 2026 (7.427): la chiave della cifratura passa in un portachiavi
//     che solo il codice firmato da Granola può aprire
//     (github.com/openclaw/graincrawl/issues/43).
//
// Il connettore cercava `cache-v3.json` e basta: su un Granola di oggi quel
// file non c'è, e la scheda rispondeva «apri Granola una volta e riprova» a
// chi Granola lo apre tutti i giorni. Adesso si prende la cache più nuova che
// c'è, in tutte e due le forme, e quando le note non ci sono più — il
// moncherino, i file cifrati — lo si dice con la ragione vera, invece di una
// frase che manda a cercare il guasto nel posto sbagliato.

import { readFile, readdir, stat } from 'node:fs/promises'
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
 * Una cartella sola, e fissa: **non si prende da chi collega**. Sembrerebbe
 * gentile lasciar scegliere il file — «se l'hai installato altrove» — e
 * sarebbe invece l'unico modo per far leggere a Myynd un file qualunque di
 * questo disco scrivendone il percorso in una casella. Granola sul Mac si
 * installa da un DMG, e scrive sempre qui (bundle `com.granola.app`).
 */
export function cartella(): string {
  return join(homedir(), 'Library', 'Application Support', 'Granola')
}

export type DoveGranola = {
  /** La cartella c'è: Granola è stato aperto almeno una volta su questo Mac. */
  installato: boolean
  /** La cache in chiaro più nuova, se ce n'è una. */
  file: string | null
  /** Accanto ci sono i file cifrati: è un Granola che le note non le lascia più qui. */
  cifrato: boolean
}

/**
 * Quale cache leggere, fra quelle che ci sono.
 *
 * `cache-v3`, `v4`, `v6`: il nome ha già cambiato numero tre volte in un
 * anno, e la regola che regge è una sola — la più alta. Una cache più vecchia
 * rimasta lì dopo un aggiornamento è una fotografia di mesi fa.
 *
 * `cifrato` guarda i due segni che Granola lascia da maggio 2026: i file
 * `.json.enc` e il database `granola.db`. Da soli non vogliono dire «niente da
 * leggere» — un Mac aggiornato da poco può avere ancora la cache piena — ma
 * accanto a una cache senza note spiegano perché.
 */
export async function trova(): Promise<DoveGranola> {
  let nomi: string[]
  try {
    nomi = await readdir(cartella())
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return { installato: false, file: null, cifrato: false }
    throw e
  }
  let migliore: { n: number; nome: string } | null = null
  for (const nome of nomi) {
    const m = /^cache-v(\d+)\.json$/.exec(nome)
    if (!m) continue
    const n = Number(m[1])
    if (!migliore || n > migliore.n) migliore = { n, nome }
  }
  const cifrato = nomi.some(n => /\.json\.enc$/.test(n) || n === 'granola.db')
  return { installato: true, file: migliore ? join(cartella(), migliore.nome) : null, cifrato }
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
 * La forma non annidata non è più un'ipotesi prudente: da `cache-v4.json`
 * (febbraio 2026) `cache` è un oggetto, con dentro `state` e `version`. Si
 * accettano tutte e due, come fanno gli altri che leggono questo file.
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

/**
 * Il segno davanti a una voce d'elenco: il puntino di mezzo, come nel resto
 * dei testi che Myynd rende leggibili, e non la lineetta.
 */
const PUNTO = '· '

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
  if (tipo === 'listItem' || tipo === 'list_item') return `${PUNTO}${sotto.trim()}\n`
  return A_CAPO.has(tipo) ? `${sotto}\n` : sotto
}

/**
 * Il testo di un pannello scritto in HTML.
 *
 * Nella cache vecchia il riassunto di Granola stava in `original_content`
 * come HTML (`<h3>Decisioni</h3><ul><li>…`), e il connettore lo prendeva così
 * com'era: nell'indice finivano i tag, e una ricerca per «ul» trovava tutte le
 * riunioni. Qui i blocchi vanno a capo, le voci prendono il puntino, i tag se
 * ne vanno e le entità tornano caratteri.
 */
function daHtml(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<li[^>]*>/gi, PUNTO)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|blockquote|pre|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Un contenuto che può arrivare in tre forme: albero dell'editor, HTML, testo. */
function testoLibero(x: unknown): string {
  if (typeof x === 'string') return /<\/?[a-z][^>]*>/i.test(x) ? daHtml(x) : x
  return testoDi(x)
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
 *
 * Di un pannello si prende `content` prima di `original_content`: il primo è
 * quello che si vede (e a volte arriva come testo nudo invece che come albero),
 * il secondo è la prima stesura, spesso in HTML.
 *
 * La trascrizione entra solo quando non c'è nient'altro. Da `cache-v4.json` i
 * pannelli non stanno più nella cache, e molte riunioni restano con la sola
 * trascrizione: senza, sarebbero riunioni vuote, cioè riunioni che non si
 * trovano. Con appunti o riassunto accanto, invece, la trascrizione è la
 * stessa riunione detta tre volte più lunga.
 */
function corpoDi(nota: Record<string, unknown>, pannelli: Record<string, unknown>[], trascrizione: unknown): string {
  const pezzi: string[] = []

  for (const p of pannelli) {
    if (p.deleted_at) continue
    const primo = ripulisci(testoLibero(p.content))
    const pulito = primo || ripulisci(testoLibero(p.original_content))
    if (pulito) pezzi.push(pulito)
  }

  const miei = typeof nota.notes_markdown === 'string' && nota.notes_markdown.trim()
    ? nota.notes_markdown
    : typeof nota.notes_plain === 'string' && nota.notes_plain.trim()
      ? nota.notes_plain
      : testoDi(nota.notes)
  const mieiPuliti = ripulisci(miei)
  if (mieiPuliti && !pezzi.some(p => p === mieiPuliti)) pezzi.push(mieiPuliti)

  if (!pezzi.length && Array.isArray(trascrizione)) {
    const detto = trascrizione
      .map(x => (x && typeof x === 'object' && typeof (x as { text?: unknown }).text === 'string') ? (x as { text: string }).text.trim() : '')
      .filter(Boolean)
      .join(' ')
    if (detto) pezzi.push(detto)
  }

  const tutto = pezzi.join('\n\n')
  return tutto.length > TESTO_MAX ? `${tutto.slice(0, TESTO_MAX)}…` : tutto
}

/**
 * Chi c'era, se il file lo dice. Serve a cercare una riunione per il nome di una persona.
 *
 * Tre posti, perché Granola lo scrive in tre: gli invitati dell'evento del
 * calendario (`displayName`), la sua lista delle persone (`people.attendees`,
 * con `name`), e da `cache-v4` una mappa a parte, `meetingsMetadata`. Un nome
 * visto due volte si scrive una.
 */
function conChi(nota: Record<string, unknown>, meta: unknown): string[] {
  const liste: unknown[] = []
  const evento = nota.google_calendar_event
  if (evento && typeof evento === 'object') liste.push((evento as { attendees?: unknown }).attendees)
  const gente = nota.people
  if (gente && typeof gente === 'object') liste.push((gente as { attendees?: unknown }).attendees)
  if (meta && typeof meta === 'object') liste.push((meta as { attendees?: unknown }).attendees)

  // per indirizzo: la stessa persona può arrivare senza nome da una lista e
  // con il nome da un'altra, e deve restare una, con il nome
  const persone = new Map<string, { nome: string; posta: string }>()
  for (const invitati of liste) {
    if (!Array.isArray(invitati)) continue
    for (const i of invitati.slice(0, 40)) {
      if (!i || typeof i !== 'object') continue
      const v = i as { displayName?: unknown; name?: unknown; email?: unknown }
      const nome = typeof v.displayName === 'string' ? v.displayName.trim() : typeof v.name === 'string' ? v.name.trim() : ''
      const posta = typeof v.email === 'string' ? v.email.trim() : ''
      const chiave = (posta || nome).toLowerCase()
      if (!chiave) continue
      const gia = persone.get(chiave)
      if (gia) { if (!gia.nome && nome) gia.nome = nome; continue }
      if (persone.size < 40) persone.set(chiave, { nome, posta })
    }
  }
  return [...persone.values()].map(({ nome, posta }) =>
    nome && nome !== posta ? (posta ? `${nome} <${posta}>` : nome) : posta)
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
 * Le frasi di quando non si può leggere, scritte una volta.
 *
 * Ognuna dice la ragione vera, perché ognuna manda a fare una cosa diversa:
 * aprire Granola, aspettare, o sapere che da qui non si legge più. Prima ce
 * n'era una sola per tutte — «apri Granola una volta e riprova» — ed era
 * falsa proprio per chi Granola lo usa di più.
 */
export const NON_INSTALLATO = 'Non trovo Granola su questo Mac. Se lo usi, aprilo una volta e riprova.'
export const NIENTE_ANCORA = 'Granola è su questo Mac ma non ha ancora salvato le riunioni. Aprilo, aspetta che le carichi e riprova.'
export const CIFRATO = 'Questa versione di Granola cifra le note su questo Mac e le tiene nel suo cloud: da qui Myynd non le può più leggere.'
export const SENZA_TESTO = 'Granola tiene su questo Mac l’elenco delle riunioni ma non il loro testo, che sta nel suo cloud: da qui Myynd non lo può leggere.'
export const CAMBIATO = 'Granola ha cambiato il modo in cui salva le note: questo collegamento va aggiornato.'

/**
 * Il file, letto. Una seconda volta se la prima è arrivata a metà.
 *
 * Granola riscrive la cache mentre gira: una lettura che capita nel mezzo
 * trova un JSON troncato, che non è un formato nuovo ma un momento sbagliato.
 * Un secondo tentativo, un attimo dopo, costa niente e toglie un «Granola ha
 * cambiato il modo in cui salva le note» che sarebbe una bugia.
 */
async function statoDi(file: string): Promise<Record<string, unknown> | null> {
  for (let volta = 0; volta < 2; volta++) {
    let grezzo: string
    try {
      grezzo = await readFile(file, 'utf8')
    } catch (e) {
      const code = (e as { code?: string }).code
      if (code === 'EACCES' || code === 'EPERM') throw new Error('Non ho il permesso di leggere le note di Granola.')
      throw new Error('Non riesco a leggere le note di Granola.')
    }
    const stato = apri(grezzo)
    if (stato) return stato
    if (!volta) await new Promise(r => setTimeout(r, 250))
  }
  return null
}

/**
 * Le note di Granola, lette dal disco.
 *
 * `troncato` vuol dire «non le ho viste tutte», e da qui va fino a
 * `riconcilia`: senza, una lettura fermata al tetto cancellerebbe
 * dall'indice tutte le riunioni che non ha fatto in tempo a rileggere.
 *
 * Per la stessa ragione, quando le riunioni ci sono ma nessuna ha una parola
 * dentro, si lancia invece di tornare zero documenti: zero documenti con
 * `troncato` spento vuol dire «Granola è vuoto», e `riconcilia` butterebbe
 * via tutte le riunioni lette quando la cache le conteneva ancora.
 */
export async function leggi(): Promise<EsitoGranola> {
  const dove = await trova()
  if (!dove.installato) throw new Error(NON_INSTALLATO)
  if (!dove.file) throw new Error(dove.cifrato ? CIFRATO : NIENTE_ANCORA)

  /*
   * Un `null` invece di un errore, e non è pedanteria.
   *
   * Qui dentro «il file non si capisce» e «il file dice che non ci sono note»
   * sono lo stesso guasto e devono dire la stessa frase a chi legge. Un
   * `throw` con un messaggio tecnico in mezzo sarebbe una seconda frase, in
   * italiano, che nessuno traduce perché nessuno la vede mai finché un giorno
   * la vede qualcuno.
   */
  const stato = await statoDi(dove.file)
  const note = stato ? elenco(stato.documents ?? stato.notes) : []
  if (!stato || (!note.length && !('documents' in stato))) {
    /*
     * Né note né il posto dove starebbero.
     *
     * Accanto ai file cifrati è il moncherino che Granola lascia in chiaro da
     * maggio 2026: `transcripts`, `entities`, e nessun `documents`. Senza, è
     * un file che non parla più la nostra lingua. In tutti e due i casi dirlo
     * è meglio che collegarsi e restare a zero.
     */
    throw new Error(dove.cifrato ? CIFRATO : CAMBIATO)
  }

  /*
   * I pannelli stanno in un'altra mappa, indicizzata per nota.
   *
   * È dove vive il riassunto scritto da Granola — cioè il pezzo che una
   * persona considera «la nota» — e sta separato dalla nota stessa perché di
   * pannelli ce n'è più d'uno: una mappa da id della nota a una mappa da id
   * del pannello al pannello. Se la mappa non c'è — da `cache-v4.json` non
   * c'è più — si va avanti con quello che ha scritto lei a mano: meno, ma vero.
   */
  const perNota = new Map<string, Record<string, unknown>[]>()
  const grezziPannelli = stato.documentPanels ?? stato.document_panels
  if (grezziPannelli && typeof grezziPannelli === 'object' && !Array.isArray(grezziPannelli)) {
    for (const [id, suoi] of Object.entries(grezziPannelli as Record<string, unknown>)) {
      const p = elenco(suoi)
      if (p.length) perNota.set(id, p)
    }
  }
  const trascrizioni = (stato.transcripts && typeof stato.transcripts === 'object' ? stato.transcripts : {}) as Record<string, unknown>
  const metadati = (stato.meetingsMetadata && typeof stato.meetingsMetadata === 'object' ? stato.meetingsMetadata : {}) as Record<string, unknown>

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

    const testo = corpoDi(nota, perNota.get(id) ?? [], trascrizioni[id])
    if (!testo) { vuote++; continue }

    const invitati = conChi(nota, metadati[id])
    const evento = nota.google_calendar_event && typeof nota.google_calendar_event === 'object'
      ? nota.google_calendar_event as { summary?: unknown } : null
    const titolo = typeof nota.title === 'string' && nota.title.trim() ? nota.title.trim()
      : typeof evento?.summary === 'string' && evento.summary.trim() ? evento.summary.trim()
      : senzaTitolo

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

  if (!docs.length && vuote > 0) throw new Error(SENZA_TESTO)
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
  try {
    const { file } = await trova()
    return file ? (await stat(file)).mtime : null
  } catch { return null }
}
