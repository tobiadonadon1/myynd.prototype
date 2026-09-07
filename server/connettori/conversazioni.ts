// Le conversazioni: quello che hai già detto a ChatGPT, a Claude e a Claude Code.
//
// Una persona che lavora con un modello ci lascia dentro mesi di ragionamenti
// — cosa ha provato, cosa ha scartato, come voleva scritta una cosa — e tutto
// quello resta chiuso nella chat in cui l'ha detto. Myynd ragiona su posta,
// file e riunioni e non sa niente della metà del lavoro che è stata pensata
// a voce alta con un altro modello. Questo connettore la porta dentro.
//
// **Tre fonti, un documento per conversazione.** ChatGPT e Claude non hanno
// un'API per rileggere le proprie chat, ma tutti e due mandano via email un
// archivio con dentro un `conversations.json`: è quel file che si sceglie qui.
// Claude Code invece scrive ogni sessione in `~/.claude/projects`, sul disco
// di chi lo usa, e si legge da lì — come Granola, senza chiedere niente.
//
// **Si tiene il testo, non il resto.** Di una sessione di Claude Code si
// tengono le battute scritte — quello che ha chiesto la persona e quello che
// ha risposto il modello — e non gli attrezzi: il contenuto dei file aperti,
// l'uscita dei comandi, il ragionamento intermedio. Sono la parte grossa del
// file e la parte che non dice niente su cosa voleva la persona. Una
// conversazione dove la persona ha scritto meno di due righe non diventa un
// documento: è un «ciao» a cui nessuno vorrà mai tornare.
//
// **Si legge e basta.** Nessuno dei file si tocca: si apre in lettura e si
// chiude. E un file che non si capisce lo dice in chiaro — «non è
// un'esportazione di ChatGPT né di Claude» — invece di collegarsi a zero.

import { createReadStream, existsSync } from 'node:fs'
import { readFile, readdir, stat } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { homedir } from 'node:os'
import { basename, extname, isAbsolute, join } from 'node:path'
import type { Documento } from '../store.ts'
import { lingua, type ConfigConversazioni } from '../config.ts'

/** Da quale delle tre arriva una conversazione: finisce nell'id del documento. */
export type Origine = 'chatgpt' | 'claude' | 'codice'
/** I due formati che un file può avere. */
export type Formato = 'chatgpt' | 'claude'

/** Una riga della conversazione: chi, cosa, quando (ms dall'epoca). */
export type Battuta = { tu: boolean; testo: string; quando: number | null }

export type Conversazione = {
  id: string
  /** Il titolo dato dall'app, se c'è. Vuoto: si prende dalla prima battuta. */
  titolo: string
  battute: Battuta[]
  /** Quando è stata aggiornata secondo il file: serve se nessuna battuta ha una data. */
  quando: number | null
  /** Solo Claude Code: la cartella del progetto, com'è scritta nel file. */
  cartella?: string
  /** Solo Claude Code: il file della sessione, che è il `percorso` del documento. */
  percorso?: string
}

/** Quanto testo si tiene per conversazione. Oltre, si tengono l'inizio e la fine. */
export const CORPO_MAX = 20_000
/** Sotto questi caratteri scritti dalla persona la conversazione non vale un documento. */
export const MINIMO_TUO = 40
const TITOLO_MAX = 80
/** Il tetto di conversazioni per giro: chi usa ChatGPT da tre anni ci arriva. */
const TETTO = 6000
/** Una sessione di Claude Code oltre questa taglia è quasi tutta uscita di comandi: si salta. */
const SESSIONE_MAX = 64 * 1024 * 1024

// — il tempo —

/** ChatGPT scrive secondi con la virgola, Claude scrive ISO: tutti e due in ms. */
function istante(x: unknown): number | null {
  if (typeof x === 'number' && Number.isFinite(x)) return Math.round(x * 1000)
  if (typeof x === 'string' && x) {
    const d = new Date(x)
    return Number.isNaN(d.getTime()) ? null : d.getTime()
  }
  return null
}

function oggetto(x: unknown): Record<string, unknown> | null {
  return x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null
}

// — ChatGPT —

/**
 * Il testo di un messaggio di ChatGPT, se è testo.
 *
 * `content.parts` è un elenco perché un messaggio può portare anche immagini
 * e file: quelle parti sono oggetti, e si saltano. I contenuti degli attrezzi
 * (`code`, `execution_output`) hanno un altro `content_type` e si saltano
 * tutti: sono quello che il modello ha detto a un interprete, non a lei.
 */
function testoChatgpt(contenuto: unknown): string {
  const c = oggetto(contenuto)
  if (!c) return ''
  if (c.content_type !== 'text' && c.content_type !== 'multimodal_text') return ''
  if (!Array.isArray(c.parts)) return ''
  return c.parts.filter((p): p is string => typeof p === 'string').join('\n').trim()
}

/**
 * Il filo di una conversazione di ChatGPT, dalla fine all'inizio e poi girato.
 *
 * `mapping` non è una lista: è un albero, perché ogni volta che si modifica
 * un messaggio ChatGPT tiene tutti e due i rami. Quello che la persona ha
 * davanti quando chiude la chat è il ramo che finisce in `current_node`, e
 * si ricostruisce salendo di padre in padre. Se `current_node` manca si parte
 * da una foglia qualunque: meglio un ramo che nessuno.
 */
function filoChatgpt(mappa: Record<string, unknown>, attuale: unknown): Record<string, unknown>[] {
  let id = typeof attuale === 'string' && attuale in mappa ? attuale : ''
  if (!id) {
    id = Object.keys(mappa).find(k => {
      const figli = oggetto(mappa[k])?.children
      return !Array.isArray(figli) || !figli.length
    }) ?? ''
  }
  const nodi: Record<string, unknown>[] = []
  // un ciclo nel file — o un albero corrotto — non deve girare per sempre
  const visti = new Set<string>()
  while (id && !visti.has(id)) {
    visti.add(id)
    const n = oggetto(mappa[id])
    if (!n) break
    nodi.push(n)
    id = typeof n.parent === 'string' ? n.parent : ''
  }
  return nodi.reverse()
}

function chatgpt(grezza: Record<string, unknown>, indice: number): Conversazione | null {
  const mappa = oggetto(grezza.mapping)
  if (!mappa) return null
  const battute: Battuta[] = []
  for (const nodo of filoChatgpt(mappa, grezza.current_node)) {
    const m = oggetto(nodo.message)
    if (!m) continue
    const ruolo = oggetto(m.author)?.role
    if (ruolo !== 'user' && ruolo !== 'assistant') continue
    const testo = testoChatgpt(m.content)
    if (!testo) continue
    battute.push({ tu: ruolo === 'user', testo, quando: istante(m.create_time) })
  }
  const id = typeof grezza.id === 'string' && grezza.id
    ? grezza.id
    : typeof grezza.conversation_id === 'string' && grezza.conversation_id
      ? grezza.conversation_id
      // senza un id non c'è modo di riconoscerla al giro dopo: si usa quello
      // che c'è, e che in un'esportazione non cambia
      : `${istante(grezza.create_time) ?? indice}`
  return {
    id,
    titolo: typeof grezza.title === 'string' ? grezza.title.trim() : '',
    battute,
    quando: istante(grezza.update_time) ?? istante(grezza.create_time)
  }
}

// — Claude —

/** Il testo di un messaggio di claude.ai: `text`, o i blocchi di testo dentro `content`. */
function testoClaude(m: Record<string, unknown>): string {
  if (typeof m.text === 'string' && m.text.trim()) return m.text.trim()
  if (!Array.isArray(m.content)) return ''
  return m.content
    .map(b => (oggetto(b)?.type === 'text' && typeof oggetto(b)?.text === 'string' ? (oggetto(b)!.text as string) : ''))
    .filter(Boolean).join('\n').trim()
}

function claude(grezza: Record<string, unknown>, indice: number): Conversazione | null {
  if (!Array.isArray(grezza.chat_messages)) return null
  const battute: Battuta[] = []
  for (const x of grezza.chat_messages) {
    const m = oggetto(x)
    if (!m) continue
    if (m.sender !== 'human' && m.sender !== 'assistant') continue
    const testo = testoClaude(m)
    if (!testo) continue
    battute.push({ tu: m.sender === 'human', testo, quando: istante(m.created_at) })
  }
  const id = typeof grezza.uuid === 'string' && grezza.uuid ? grezza.uuid : `${istante(grezza.created_at) ?? indice}`
  return {
    id,
    titolo: typeof grezza.name === 'string' ? grezza.name.trim() : '',
    battute,
    quando: istante(grezza.updated_at) ?? istante(grezza.created_at)
  }
}

// — il file —

/**
 * Di quale dei due è questo file, e le conversazioni dentro.
 *
 * Si guarda la forma, non il nome: tutti e due si chiamano `conversations.json`.
 * Una conversazione di ChatGPT ha `mapping`, una di Claude ha `chat_messages`,
 * e basta trovarne una per decidere. Un file che non ha né l'una né l'altra
 * lo si dice in chiaro — è la frase che una persona legge dopo aver scelto il
 * file sbagliato dentro l'archivio, ed è meglio di un collegamento a zero.
 */
export function riconosci(grezzo: string): { formato: Formato; conversazioni: Conversazione[] } {
  let dati: unknown
  try { dati = JSON.parse(grezzo) } catch {
    throw new Error('Questo file non è un JSON: non è un’esportazione di ChatGPT né di Claude.')
  }
  if (!Array.isArray(dati)) throw new Error('Questo file non è un’esportazione di ChatGPT né di Claude.')
  const voci = dati.map(oggetto).filter((v): v is Record<string, unknown> => !!v)
  if (!voci.length) throw new Error('Questo file è vuoto: dentro non c’è nessuna conversazione.')

  const formato: Formato | null = voci.some(v => oggetto(v.mapping))
    ? 'chatgpt'
    : voci.some(v => Array.isArray(v.chat_messages)) ? 'claude' : null
  if (!formato) throw new Error('Questo file non è un’esportazione di ChatGPT né di Claude.')

  const conversazioni: Conversazione[] = []
  voci.forEach((v, i) => {
    const c = formato === 'chatgpt' ? chatgpt(v, i) : claude(v, i)
    if (c) conversazioni.push(c)
  })
  return { formato, conversazioni }
}

export async function apriFile(percorso: string): Promise<{ formato: Formato; conversazioni: Conversazione[] }> {
  let grezzo: string
  try {
    grezzo = await readFile(percorso, 'utf8')
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code === 'ENOENT' || code === 'ENOTDIR') throw new Error('Non trovo questo file.')
    if (code === 'EACCES' || code === 'EPERM') throw new Error('Non ho il permesso di leggere questo file.')
    if (code === 'EISDIR') throw new Error('Questo è una cartella: serve il file conversations.json che c’è dentro.')
    throw new Error('Non riesco a leggere questo file.')
  }
  return riconosci(grezzo)
}

// — Claude Code —

/** Dove Claude Code tiene le sessioni: una cartella per progetto, un file per sessione. */
export function cartellaCodice(): string {
  return join(homedir(), '.claude', 'projects')
}

/** C'è qualcosa da leggere su questo computer: la scheda offre l'interruttore solo allora. */
export function codicePossibile(): boolean {
  return existsSync(cartellaCodice())
}

/** I promemoria che il programma infila nei messaggi: non li ha scritti nessuno. */
function senzaPromemoria(s: string): string {
  return s.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim()
}

/**
 * Il testo di una battuta di Claude Code.
 *
 * `content` è una stringa quando l'ha scritta la persona e un elenco di
 * blocchi quando l'ha scritta il modello — o quando è la risposta di un
 * attrezzo, che sta pure sotto `user`. Si tengono i blocchi `text`: gli
 * attrezzi chiamati, i loro risultati e il ragionamento sono il grosso del
 * file e non sono la conversazione. Una riga che comincia con un tag è un
 * comando del programma (`<command-name>`, `<local-command-stdout>`), non
 * una cosa detta.
 */
function testoCodice(contenuto: unknown): string {
  if (typeof contenuto === 'string') {
    const s = senzaPromemoria(contenuto)
    return s.startsWith('<') ? '' : s
  }
  if (!Array.isArray(contenuto)) return ''
  return contenuto
    .map(b => (oggetto(b)?.type === 'text' && typeof oggetto(b)?.text === 'string' ? senzaPromemoria(oggetto(b)!.text as string) : ''))
    .filter(s => s && !s.startsWith('<'))
    .join('\n').trim()
}

/** Solo le righe che possono contenere una battuta: le altre non si parsano nemmeno. */
const RIGA_UTILE = /"type":\s*"(?:user|assistant|ai-title)"/

/**
 * Una sessione, letta riga per riga.
 *
 * Il file si legge in streaming e non tutto insieme: una sessione lunga pesa
 * decine di megabyte, quasi tutti di risultati di attrezzi, e tenerne in
 * memoria dieci alla volta durante una rilettura notturna è il modo in cui il
 * processo muore in silenzio. Si salta il ramo `isSidechain` — i sotto-agenti,
 * che parlano fra loro — e le righe `isMeta`, che sono del programma.
 */
export async function sessione(percorso: string): Promise<Conversazione | null> {
  const righe = createInterface({ input: createReadStream(percorso, 'utf8'), crlfDelay: Infinity })
  let id = ''
  let cartella = ''
  let titolo = ''
  const battute: Battuta[] = []
  try {
    for await (const riga of righe) {
      if (!RIGA_UTILE.test(riga)) continue
      let o: Record<string, unknown> | null
      try { o = oggetto(JSON.parse(riga)) } catch { continue }
      if (!o) continue
      if (!id && typeof o.sessionId === 'string') id = o.sessionId
      if (!cartella && typeof o.cwd === 'string') cartella = o.cwd
      if (o.type === 'ai-title') {
        if (typeof o.aiTitle === 'string') titolo = o.aiTitle.trim()
        continue
      }
      if (o.type !== 'user' && o.type !== 'assistant') continue
      if (o.isMeta || o.isSidechain) continue
      const testo = testoCodice(oggetto(o.message)?.content)
      if (!testo) continue
      battute.push({ tu: o.type === 'user', testo, quando: istante(o.timestamp) })
    }
  } finally {
    righe.close()
  }
  if (!battute.length) return null
  return {
    id: id || basename(percorso, extname(percorso)),
    titolo,
    battute,
    quando: null,
    cartella,
    percorso
  }
}

export type EsitoCodice = { conversazioni: Conversazione[]; saltate: number; troncato: boolean }

/** Tutte le sessioni sotto la cartella: una sottocartella per progetto, dentro i `.jsonl`. */
export async function sessioni(cartella = cartellaCodice(), tetto = TETTO): Promise<EsitoCodice> {
  const conversazioni: Conversazione[] = []
  let saltate = 0
  let troncato = false
  let progetti: string[] = []
  try {
    progetti = (await readdir(cartella, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => join(cartella, d.name))
  } catch {
    throw new Error('Non trovo le sessioni di Claude Code su questo computer.')
  }
  for (const progetto of progetti) {
    let file: string[] = []
    try {
      file = (await readdir(progetto, { withFileTypes: true }))
        .filter(d => d.isFile() && d.name.endsWith('.jsonl'))
        .map(d => join(progetto, d.name))
    } catch { continue }
    for (const f of file) {
      if (conversazioni.length >= tetto) { troncato = true; break }
      try {
        if ((await stat(f)).size > SESSIONE_MAX) { saltate++; continue }
        const c = await sessione(f)
        if (c) conversazioni.push(c)
      } catch { saltate++ }
    }
    if (troncato) break
  }
  return { conversazioni, saltate, troncato }
}

// — il documento —

/** Le battute di fila della stessa voce diventano una: Claude Code ne scrive una per blocco. */
function unisci(battute: Battuta[]): Battuta[] {
  const fuori: Battuta[] = []
  for (const b of battute) {
    const ultima = fuori[fuori.length - 1]
    if (ultima && ultima.tu === b.tu) {
      ultima.testo = `${ultima.testo}\n${b.testo}`
      ultima.quando = b.quando ?? ultima.quando
    } else {
      fuori.push({ ...b })
    }
  }
  return fuori
}

function accorcia(s: string, n: number): string {
  if (s.length <= n) return s
  const taglio = s.slice(0, n)
  const spazio = taglio.lastIndexOf(' ')
  return `${spazio > n / 2 ? taglio.slice(0, spazio) : taglio}…`
}

/** La prima riga scritta dalla persona, corta abbastanza da fare da titolo. */
function titoloDa(battute: Battuta[]): string {
  const prima = battute.find(b => b.tu)?.testo.split('\n').map(r => r.trim()).find(Boolean) ?? ''
  return accorcia(prima, TITOLO_MAX)
}

/**
 * La conversazione scritta come si legge: «Tu: …», «Claude: …».
 *
 * Oltre il tetto si tengono l'inizio e la fine, non solo l'inizio: in una
 * chat lunga la domanda sta all'inizio e la conclusione sta in fondo, e
 * tagliare la fine butta via la parte che una persona torna a cercare. Il
 * taglio cade su un a capo, così nessuna battuta resta a metà parola.
 */
export function trascrizione(battute: Battuta[], lui: string, tetto = CORPO_MAX): string {
  const tu = lingua() === 'it' ? 'Tu' : 'You'
  const tutto = battute.map(b => `${b.tu ? tu : lui}: ${b.testo}`).join('\n\n')
  if (tutto.length <= tetto) return tutto
  const testa = Math.floor(tetto * 0.7)
  const coda = tetto - testa
  const inizio = tutto.slice(0, testa)
  const fine = tutto.slice(tutto.length - coda)
  const i = inizio.lastIndexOf('\n')
  const j = fine.indexOf('\n')
  return `${i > testa / 2 ? inizio.slice(0, i) : inizio}\n\n[…]\n\n${j >= 0 && j < coda / 2 ? fine.slice(j + 1) : fine}`
}

/**
 * Da una conversazione a un documento dell'indice, o `null` se non lo vale.
 *
 * Il nome di chi risponde sta nel corpo perché è quello che si cerca: «cosa
 * mi aveva detto Claude sul contratto» trova questa e non quella di ChatGPT.
 * Per Claude Code ci sta anche la cartella del progetto, per la stessa
 * ragione per cui Granola mette dentro chi c'era: l'indice cerca nel testo.
 */
export function documento(c: Conversazione, origine: Origine, percorso: string): Documento | null {
  const battute = unisci(c.battute)
  const tuo = battute.filter(b => b.tu).reduce((n, b) => n + b.testo.length, 0)
  if (tuo < MINIMO_TUO) return null

  const it = lingua() === 'it'
  const lui = origine === 'chatgpt' ? 'ChatGPT' : 'Claude'
  let titolo = c.titolo || titoloDa(battute) || (it ? 'Conversazione senza titolo' : 'Untitled conversation')
  let corpo = trascrizione(battute, lui)
  if (origine === 'codice') {
    const progetto = c.cartella ? basename(c.cartella) : ''
    titolo = progetto ? `${progetto} · ${titolo}` : `Claude Code · ${titolo}`
    if (c.cartella) corpo = `${it ? 'Progetto' : 'Project'}: ${c.cartella}\n\n${corpo}`
  }

  let ultima: number | null = null
  for (const b of battute) if (b.quando != null) ultima = b.quando
  const quando = ultima ?? c.quando

  return {
    id: `conversazioni:${origine}:${c.id}`,
    fonte: 'conversazioni',
    tipo: 'chat',
    titolo,
    corpo,
    autore: null,
    percorso,
    quando: quando != null ? new Date(quando).toISOString() : null,
    gruppo: 'note'
  }
}

// — leggere —

export type EsitoConversazioni = {
  docs: Documento[]
  /** Conversazioni viste ma troppo corte per valere un documento. */
  saltate: number
  troncato: boolean
  /** I file che non si sono aperti, con il perché: gli altri si leggono lo stesso. */
  guasti: { file: string; errore: string }[]
  perFile: { file: string; formato: Formato; conversazioni: number }[]
  /** Le sessioni di Claude Code lette. */
  codice: number
}

/**
 * Tutto quello che la configurazione dice di leggere.
 *
 * Un file che non si apre non ferma gli altri, ma va fino a `riconcilia`: se
 * un file manca oggi, i suoi documenti non sono spariti — non li abbiamo
 * visti — e cancellarli vorrebbe dire perdere un anno di chat perché qualcuno
 * ha spostato una cartella.
 */
export async function leggi(cfg: ConfigConversazioni, cartella = cartellaCodice()): Promise<EsitoConversazioni> {
  // per id, non in una lista: due esportazioni dello stesso conto — quella di
  // marzo e quella di oggi — contengono le stesse chat, e l'ultima vince
  const docs = new Map<string, Documento>()
  let saltate = 0
  let troncato = false
  const guasti: EsitoConversazioni['guasti'] = []
  const perFile: EsitoConversazioni['perFile'] = []

  for (const f of cfg.file) {
    try {
      const { formato, conversazioni } = await apriFile(f)
      perFile.push({ file: f, formato, conversazioni: conversazioni.length })
      for (const c of conversazioni) {
        if (docs.size >= TETTO) { troncato = true; break }
        const d = documento(c, formato, f)
        if (d) docs.set(d.id, d); else saltate++
      }
    } catch (e) {
      guasti.push({ file: f, errore: e instanceof Error ? e.message : String(e) })
    }
  }

  let codice = 0
  if (cfg.codice) {
    try {
      const s = await sessioni(cartella, Math.max(0, TETTO - docs.size))
      if (s.troncato) troncato = true
      saltate += s.saltate
      for (const c of s.conversazioni) {
        const d = documento(c, 'codice', c.percorso ?? cartella)
        if (d) { docs.set(d.id, d); codice++ } else saltate++
      }
    } catch (e) {
      guasti.push({ file: cartella, errore: e instanceof Error ? e.message : String(e) })
    }
  }

  return { docs: [...docs.values()], saltate, troncato, guasti, perFile, codice }
}

export async function sincronizza(cfg: ConfigConversazioni): Promise<EsitoConversazioni> {
  return leggi(cfg)
}

/**
 * Quello che arriva dalla scheda, messo in ordine — o un errore da mostrare.
 *
 * I percorsi devono essere assoluti: uno relativo sarebbe relativo alla
 * cartella da cui è partito il server, che non è un posto che una persona
 * conosce. `~` si accetta perché è come lo scrive chiunque abbia un terminale.
 */
export function normalizza(corpo: unknown): ConfigConversazioni {
  const b = oggetto(corpo) ?? {}
  const file: string[] = []
  for (const x of Array.isArray(b.file) ? b.file : []) {
    if (typeof x !== 'string') continue
    let p = x.trim()
    if (!p) continue
    if (p === '~' || p.startsWith('~/')) p = join(homedir(), p.slice(2))
    if (!isAbsolute(p)) throw new Error('Un percorso deve essere intero: comincia da / o da ~.')
    if (!file.includes(p)) file.push(p)
  }
  const codice = b.codice === true
  if (!file.length && !codice) throw new Error('Scegli almeno un file, o accendi le sessioni di Claude Code.')
  return { file, codice }
}

export type Prova =
  | { ok: true; file: { file: string; formato: Formato; conversazioni: number }[]; codice: number }
  | { ok: false; errore: string; file?: string }

/**
 * La prova apre ogni file per davvero, e si ferma al primo che non si apre:
 * chi ha scelto il file sbagliato deve saperlo adesso, con il nome accanto,
 * non al prossimo giro di lettura. Per Claude Code si conta e basta — le
 * sessioni si leggono al primo giro, che è subito dopo.
 */
export async function prova(cfg: ConfigConversazioni): Promise<Prova> {
  const file: { file: string; formato: Formato; conversazioni: number }[] = []
  for (const f of cfg.file) {
    try {
      const { formato, conversazioni } = await apriFile(f)
      file.push({ file: f, formato, conversazioni: conversazioni.length })
    } catch (e) {
      return { ok: false, errore: e instanceof Error ? e.message : String(e), file: f }
    }
  }
  let codice = 0
  if (cfg.codice) {
    if (!codicePossibile()) return { ok: false, errore: 'Non trovo le sessioni di Claude Code su questo computer.' }
    try {
      for (const d of await readdir(cartellaCodice(), { withFileTypes: true })) {
        if (!d.isDirectory()) continue
        codice += (await readdir(join(cartellaCodice(), d.name))).filter(n => n.endsWith('.jsonl')).length
      }
    } catch { /* la cartella c'è ma non si sfoglia: lo dirà la lettura */ }
  }
  return { ok: true, file, codice }
}

export function collegato(c: { conversazioni?: ConfigConversazioni }): boolean {
  return !!c.conversazioni
}
