// Le conversazioni: quello che hai già detto a ChatGPT, a Claude, a Claude Code e a Codex.
//
// Una persona che lavora con un modello ci lascia dentro mesi di ragionamenti
// — cosa ha provato, cosa ha scartato, come voleva scritta una cosa — e tutto
// quello resta chiuso nella chat in cui l'ha detto. Myynd ragiona su posta,
// file e riunioni e non sa niente della metà del lavoro che è stata pensata
// a voce alta con un altro modello. Questo connettore la porta dentro.
//
// **Quattro fonti, un documento per conversazione.** ChatGPT e Claude non hanno
// un'API per rileggere le proprie chat, ma tutti e due mandano via email un
// archivio con dentro un `conversations.json`: è quel file che si sceglie qui.
// Claude Code invece scrive ogni sessione in `~/.claude/projects`, e Codex in
// `~/.codex/sessions`, sul disco di chi li usa: si leggono da lì — come
// Granola, senza chiedere niente — e l'interruttore `codice` li accende tutti
// e due, perché sono la stessa cosa: un agente di codice che ha lavorato con
// lei in una cartella. Ogni sessione sa in quale (`cwd`), e il documento la
// porta nel corpo e in `percorso`, così le priorità la legano alla cartella
// di lavoro giusta.
//
// **Non si rilegge quello che non è cambiato.** Le sessioni sono un gigabyte
// e passa, e un giro ogni sei ore che le riapre tutte per scoprire che sono
// uguali è il modo in cui l'app scalda il computer a vuoto. Per ogni file si
// ricorda la data di modifica letta e il documento che ne è uscito — nel
// cursore della fonte, per conto — e un file con la stessa data si dichiara
// vivo senza aprirlo. Si guardano solo gli ultimi novanta giorni: quello che
// è più vecchio esce dall'indice, com'è giusto per un quadro di adesso.
//
// **Le sessioni di Myynd non sono sue.** Myynd parla con Claude Code e con
// Codex — sono due delle sue teste — da una cartella vuota sotto `~/.myynd`,
// e le prove dell'app girano in profili usa e getta nella cartella
// temporanea. Sono sessioni vere, ma è il programma che parla con un modello:
// se entrassero, la mente si riempirebbe dei prompt di Myynd.
//
// **Le chat di claude.ai non stanno su questo disco.** L'app Claude per Mac
// è una finestra sul sito: quello che ci si scrive vive dai loro, e l'unica
// strada resta l'esportazione. Quello che l'app tiene qui — in
// `~/Library/Application Support/Claude/claude-code-sessions` — sono le
// *schede* delle sessioni di Claude Code aperte da lì: titolo, cartella,
// modello, e l'id della sessione vera, che è uno dei `.jsonl` di
// `~/.claude/projects`. Quindi non c'è una seconda fonte da leggere: si
// prendono i titoli, che sono migliori di una prima riga, e basta.
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
import { homedir, tmpdir } from 'node:os'
import { basename, extname, isAbsolute, join } from 'node:path'
import type { Documento } from '../store.ts'
import { lingua, type ConfigConversazioni } from '../config.ts'

/** Da quale delle quattro arriva una conversazione: finisce nell'id del documento. */
export type Origine = 'chatgpt' | 'claude' | 'codice' | 'codex'
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
  /** Solo Claude Code e Codex: la cartella del progetto, com'è scritta nel file. È il `percorso` del documento. */
  cartella?: string
  /** Solo Claude Code e Codex: il file della sessione, la chiave della memoria di lettura. */
  percorso?: string
  /** Solo Claude Code e Codex: la data di modifica del file, quella che la memoria ricorda. */
  modificata?: string
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
/**
 * Una sessione di Codex tiene dentro anche le schermate che le si mandano, e
 * pesa dieci volte tanto: le battute vere stanno proprio nei file più grossi,
 * quindi il tetto è largo. Si legge in streaming, e il peso costa tempo, non
 * memoria.
 */
const SESSIONE_CODEX_MAX = 512 * 1024 * 1024
/** Le sessioni modificate prima di così non si leggono, ed escono dall'indice: il quadro guarda novanta giorni. */
export const GIORNI_SESSIONI = 90
/** Un filo le cui battute stanno tutte nello stesso istante non è stato scritto lì: è un'importazione. */
const STESSO_ISTANTE = 2_000

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

/**
 * Quante sessioni ci sono, per dirlo sulla scheda prima di collegare.
 *
 * «Trovate 361 sessioni di Claude Code su questo Mac» è la riga che fa capire
 * cosa si sta per accendere; un interruttore muto no. Si contano i file e
 * basta, senza aprirli: è una riga della schermata, non una lettura.
 */
export async function contaSessioni(cartella = cartellaCodice()): Promise<number> {
  let n = 0
  try {
    for (const d of await readdir(cartella, { withFileTypes: true })) {
      if (!d.isDirectory()) continue
      try {
        n += (await readdir(join(cartella, d.name))).filter(f => f.endsWith('.jsonl')).length
      } catch { /* una cartella di progetto che non si sfoglia non conta */ }
    }
  } catch {
    return 0
  }
  return n
}

/** Dove l'app Claude tiene le schede delle sessioni di Claude Code aperte da lì. */
export function cartellaSchedeClaude(): string {
  return join(homedir(), 'Library', 'Application Support', 'Claude', 'claude-code-sessions')
}

/** Oltre questa taglia una scheda non è una scheda. */
const SCHEDA_MAX = 4_000_000

/**
 * I titoli che l'app Claude ha dato alle sessioni, per id di sessione.
 *
 * Le schede stanno due cartelle sotto, una per file, e ognuna è un JSON con
 * `cliSessionId` — l'id del `.jsonl` in `~/.claude/projects` — e `title`. Non
 * c'è dentro nessuna battuta: è metadato, e si prende solo quello. Una
 * cartella che manca, o un file che non si capisce, non è un guaio: si va
 * avanti con i titoli che si trovano nei `.jsonl`.
 */
export async function titoliClaude(cartella = cartellaSchedeClaude(), tetto = 5000): Promise<Map<string, string>> {
  const titoli = new Map<string, string>()
  let livello1: string[] = []
  try {
    livello1 = (await readdir(cartella, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => join(cartella, d.name))
  } catch {
    return titoli
  }
  for (const a of livello1) {
    let livello2: string[] = []
    try {
      livello2 = (await readdir(a, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => join(a, d.name))
    } catch { continue }
    for (const b of livello2) {
      let file: string[] = []
      try {
        file = (await readdir(b, { withFileTypes: true })).filter(d => d.isFile() && d.name.endsWith('.json')).map(d => join(b, d.name))
      } catch { continue }
      for (const f of file) {
        if (titoli.size >= tetto) return titoli
        try {
          if ((await stat(f)).size > SCHEDA_MAX) continue
          const o = oggetto(JSON.parse(await readFile(f, 'utf8')))
          const id = typeof o?.cliSessionId === 'string' ? o.cliSessionId.trim() : ''
          const titolo = typeof o?.title === 'string' ? o.title.trim() : ''
          if (id && titolo) titoli.set(id, titolo)
        } catch { /* non è una scheda: si salta */ }
      }
    }
  }
  return titoli
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
/**
 * Le cartelle in cui una sessione non è sua.
 *
 * Myynd stesso parla con Claude Code e con Codex da una cartella vuota sotto
 * `~/.myynd` (o sotto `MYYND_DATI`), e le prove dell'app girano in profili
 * usa e getta nella cartella temporanea. Sono sessioni vere, ma è il
 * programma che parla con un modello, non lei: fuori.
 */
export function cartellaNonSua(cwd: string): boolean {
  if (!cwd) return false
  const radici = [
    join(homedir(), '.myynd'), (process.env.MYYND_DATI ?? '').trim(),
    tmpdir(), '/tmp', '/private/tmp', '/var/folders', '/private/var/folders'
  ].filter(Boolean).map(r => r.replace(/\/+$/, ''))
  return radici.some(r => cwd === r || cwd.startsWith(`${r}/`))
}

export async function sessione(percorso: string): Promise<Conversazione | null> {
  // il flusso si tiene a parte: se si esce prima della fine — una sessione di
  // Myynd, riconosciuta dalla prima riga — va chiuso a mano, o il file resta aperto
  const flusso = createReadStream(percorso, 'utf8')
  const righe = createInterface({ input: flusso, crlfDelay: Infinity })
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
      if (!cartella && typeof o.cwd === 'string') {
        cartella = o.cwd
        if (cartellaNonSua(cartella)) return null
      }
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
    flusso.destroy()
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

// — la memoria di quello che si è letto —

/**
 * Per file di sessione: la data di modifica letta e l'id del documento che ne
 * è uscito — vuoto se il file si è letto ma non valeva un documento, così non
 * si riapre nemmeno quello.
 *
 * Sta nel cursore della fonte (`store.cursore`), che è per conto e non si
 * interpreta lì: qui è un JSON. Non è la data del documento: `quando` di una
 * sessione è l'ultima battuta, e la data del file le va dietro anche di
 * giorni — Claude Code ci scrive una riga di sistema quando la si riapre.
 */
export type Memoria = Record<string, { m: string; id: string }>
/** La chiave con cui la memoria sta fra i cursori dell'indice. */
export const CURSORE = 'conversazioni:sessioni'

export function memoriaDa(grezzo: string | null | undefined): Memoria {
  if (!grezzo) return {}
  let dati: unknown
  try { dati = JSON.parse(grezzo) } catch { return {} }
  const fuori: Memoria = {}
  for (const [k, v] of Object.entries(oggetto(dati) ?? {})) {
    const e = oggetto(v)
    if (e && typeof e.m === 'string' && typeof e.id === 'string') fuori[k] = { m: e.m, id: e.id }
  }
  return fuori
}

export function memoriaScritta(m: Memoria): string {
  return JSON.stringify(m)
}

export type OpzioniSessioni = {
  /** Che cosa si sapeva al giro prima, per file. Senza, si legge tutto. */
  memoria?: Memoria
  /**
   * Il documento è ancora nell'indice. Senza questa risposta la memoria da
   * sola non basta a saltare un file: un indice svuotato e ricostruito ha
   * ancora il cursore di prima, e fidarsi vorrebbe dire dichiarare vivo un
   * documento che non c'è.
   */
  inIndice?: (id: string) => boolean
  giorni?: number
  adesso?: number
}

export type EsitoCodice = {
  conversazioni: Conversazione[]
  saltate: number
  troncato: boolean
  /** File uguali a com'erano: l'id del documento che ne era uscito, da dichiarare vivo. */
  invariate: { percorso: string; m: string; id: string }[]
  /** File letti da cui non è uscito niente: si ricordano, per non riaprirli. */
  vuote: { percorso: string; m: string }[]
  /** Più vecchie della finestra: non lette, e non più vive. */
  vecchie: number
}

const esitoVuoto = (): EsitoCodice => ({ conversazioni: [], saltate: 0, troncato: false, invariate: [], vuote: [], vecchie: 0 })

/**
 * Un file di sessione: si salta se è vecchio, si dichiara vivo se è uguale a
 * com'era, e si legge solo altrimenti. Uguale a Claude Code e a Codex.
 */
async function unaSessione(
  f: string, max: number, apri: (f: string) => Promise<Conversazione | null>,
  o: OpzioniSessioni, fuori: EsitoCodice, adesso: number
): Promise<void> {
  let s
  try { s = await stat(f) } catch { fuori.saltate++; return }
  if (s.mtimeMs < adesso - (o.giorni ?? GIORNI_SESSIONI) * 86_400_000) { fuori.vecchie++; return }
  const m = s.mtime.toISOString()
  const prima = o.memoria?.[f]
  if (prima && prima.m === m && (!prima.id || o.inIndice?.(prima.id))) {
    fuori.invariate.push({ percorso: f, m, id: prima.id })
    return
  }
  if (s.size > max) { fuori.saltate++; return }
  try {
    const c = await apri(f)
    if (c) {
      c.modificata = m
      fuori.conversazioni.push(c)
    } else {
      fuori.vuote.push({ percorso: f, m })
    }
  } catch { fuori.saltate++ }
}

/**
 * Tutte le sessioni sotto la cartella: una sottocartella per progetto, dentro i `.jsonl`.
 *
 * `titoli` sono quelli dell'app Claude, per id: valgono solo dove il file
 * non ha un titolo suo, perché quello del file l'ha scritto il modello
 * guardando la conversazione e quello dell'app è lo stesso o più vecchio.
 */
export async function sessioni(cartella = cartellaCodice(), tetto = TETTO, titoli?: Map<string, string>, opzioni: OpzioniSessioni = {}): Promise<EsitoCodice> {
  const fuori = esitoVuoto()
  const adesso = opzioni.adesso ?? Date.now()
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
      if (fuori.conversazioni.length >= tetto) { fuori.troncato = true; break }
      await unaSessione(f, SESSIONE_MAX, sessione, opzioni, fuori, adesso)
    }
    if (fuori.troncato) break
  }
  for (const c of fuori.conversazioni) if (!c.titolo && titoli?.has(c.id)) c.titolo = titoli.get(c.id)!
  return fuori
}

// — Codex —

/** Dove Codex tiene le sessioni: una cartella per giorno, `anno/mese/giorno`, e un `rollout-*.jsonl` per filo. */
export function cartellaCodex(): string {
  return join(homedir(), '.codex', 'sessions')
}

export function codexPossibile(): boolean {
  return existsSync(cartellaCodex())
}

/** C'è un agente di codice su questo computer, l'uno o l'altro: è quello che fa accendere la fonte da sola. */
export function agentiPossibili(): boolean {
  return codicePossibile() || codexPossibile()
}

/** Le righe che possono portare la testata o una battuta: le altre — attrezzi, ragionamento, token — non si parsano. */
const RIGA_UTILE_CODEX = /"type":\s*"session_meta"|"role":\s*"(?:user|assistant)"/

/**
 * Quello che ha scritto la persona, senza quello che Codex ci mette intorno.
 *
 * Codex infila nel ruolo `user` anche roba sua: il contesto d'ambiente, i
 * plugin consigliati, lo stato del browser dell'app, e le risposte a una
 * domanda fatta con un modulo, che arrivano come JSON. I blocchi con un tag
 * in testa si tolgono; se resta un «## My request:» — è come l'app scrive
 * una richiesta con dei file allegati — si tiene quello che viene dopo; di
 * una risposta a un modulo si tengono la domanda e la risposta, che sono le
 * uniche parole sue lì dentro.
 */
function testoUtenteCodex(grezzo: string): string {
  let t = grezzo.trim()
  const risposta = t.match(/^<send_user_message_question_reply>\s*([\s\S]*?)\s*<\/send_user_message_question_reply>$/)
  if (risposta) {
    let voci: unknown
    try { voci = JSON.parse(risposta[1]!) } catch { return '' }
    if (!Array.isArray(voci)) return ''
    return voci.map(v => {
      const o = oggetto(v)
      const q = typeof o?.question === 'string' ? o.question.trim() : ''
      const a = typeof o?.answer === 'string' ? o.answer.trim() : ''
      return a ? (q ? `${q}\n${a}` : a) : ''
    }).filter(Boolean).join('\n').trim()
  }
  t = t.replace(/^(?:<([a-z_][\w-]*)(?:\s[^>]*)?>[\s\S]*?<\/\1>\s*)+/, '').trim()
  const i = t.indexOf('## My request:')
  if (i >= 0) t = t.slice(i + '## My request:'.length).trim()
  else if (t.startsWith('# Files mentioned by the user:')) return ''
  return t.startsWith('<') ? '' : t
}

/** Il testo di un messaggio di Codex: i blocchi `input_text` e `output_text`, non le immagini. */
function testoCodex(contenuto: unknown): string {
  if (typeof contenuto === 'string') return contenuto.trim()
  if (!Array.isArray(contenuto)) return ''
  return contenuto.map(b => {
    const o = oggetto(b)
    return o && (o.type === 'input_text' || o.type === 'output_text' || o.type === 'text') && typeof o.text === 'string' ? o.text : ''
  }).filter(Boolean).join('\n').trim()
}

/**
 * Un filo di Codex, letto riga per riga.
 *
 * La prima riga è `session_meta`, con la cartella (`cwd`), l'id del filo e da
 * dove viene: `thread_source` è `user` per quelli aperti da lei e `subagent`
 * per quelli che Codex apre da solo. Un sotto-agente riceve il compito da un
 * altro agente, non da lei, quindi entra solo se ha battute sue davvero. Un
 * messaggio può comparire due volte con lo stesso id — quando un filo viene
 * ripreso — e si tiene una volta.
 */
export async function sessioneCodex(percorso: string): Promise<Conversazione | null> {
  const flusso = createReadStream(percorso, 'utf8')
  const righe = createInterface({ input: flusso, crlfDelay: Infinity })
  let id = ''
  let cartella = ''
  let quando: number | null = null
  let sottoAgente = false
  const visti = new Set<string>()
  const battute: Battuta[] = []
  try {
    for await (const riga of righe) {
      if (!RIGA_UTILE_CODEX.test(riga)) continue
      let o: Record<string, unknown> | null
      try { o = oggetto(JSON.parse(riga)) } catch { continue }
      const p = oggetto(o?.payload)
      if (!o || !p) continue
      if (o.type === 'session_meta') {
        if (typeof p.id === 'string') id = p.id
        if (typeof p.cwd === 'string') cartella = p.cwd
        quando = istante(p.timestamp) ?? istante(o.timestamp)
        sottoAgente = p.thread_source === 'subagent'
        if (cartellaNonSua(cartella)) return null
        continue
      }
      if (o.type !== 'response_item' || p.type !== 'message') continue
      if (p.role !== 'user' && p.role !== 'assistant') continue
      if (typeof p.id === 'string' && p.id) {
        if (visti.has(p.id)) continue
        visti.add(p.id)
      }
      const grezzo = testoCodex(p.content)
      const testo = p.role === 'user' ? testoUtenteCodex(grezzo) : grezzo
      if (!testo) continue
      battute.push({ tu: p.role === 'user', testo, quando: istante(o.timestamp) })
    }
  } finally {
    righe.close()
    flusso.destroy()
  }
  if (!battute.length) return null
  if (sottoAgente && !battute.some(b => b.tu)) return null
  // tutte le battute nello stesso istante: un filo importato da altrove, non scritto qui
  const tempi = battute.map(b => b.quando).filter((t): t is number => t != null)
  if (battute.length >= 3 && tempi.length === battute.length && Math.max(...tempi) - Math.min(...tempi) < STESSO_ISTANTE) return null
  return { id: id || basename(percorso, extname(percorso)), titolo: '', battute, quando, cartella, percorso }
}

/** Tutti i fili sotto la cartella, a qualunque profondità: Codex li mette per giorno. */
export async function sessioniCodex(cartella = cartellaCodex(), tetto = TETTO, opzioni: OpzioniSessioni = {}): Promise<EsitoCodice> {
  const fuori = esitoVuoto()
  const adesso = opzioni.adesso ?? Date.now()
  const file: string[] = []
  const cammina = async (dir: string, profondita: number): Promise<void> => {
    let voci
    try { voci = await readdir(dir, { withFileTypes: true }) } catch {
      if (!profondita) throw new Error('Non trovo le sessioni di Codex su questo computer.')
      return
    }
    for (const v of voci) {
      const p = join(dir, v.name)
      if (v.isDirectory()) { if (profondita < 4) await cammina(p, profondita + 1) }
      else if (v.isFile() && v.name.endsWith('.jsonl')) file.push(p)
    }
  }
  await cammina(cartella, 0)
  for (const f of file) {
    if (fuori.conversazioni.length >= tetto) { fuori.troncato = true; break }
    await unaSessione(f, SESSIONE_CODEX_MAX, sessioneCodex, opzioni, fuori, adesso)
  }
  return fuori
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
 * Per Claude Code e Codex ci sta anche la cartella del progetto, per la
 * stessa ragione per cui Granola mette dentro chi c'era: l'indice cerca nel
 * testo. E la cartella è anche il `percorso` del documento — non il file
 * della sessione, che non apre nessuno — perché è così che le priorità
 * legano una conversazione alla cartella di lavoro, come fanno con le righe
 * `lavoro:`. Il file resta la chiave della memoria di lettura, e basta.
 */
export function documento(c: Conversazione, origine: Origine, percorso: string): Documento | null {
  const battute = unisci(c.battute)
  const tuo = battute.filter(b => b.tu).reduce((n, b) => n + b.testo.length, 0)
  if (tuo < MINIMO_TUO) return null

  const it = lingua() === 'it'
  const agente = origine === 'codice' || origine === 'codex'
  const lui = origine === 'chatgpt' ? 'ChatGPT' : origine === 'codex' ? 'Codex' : 'Claude'
  let titolo = c.titolo || titoloDa(battute) || (it ? 'Conversazione senza titolo' : 'Untitled conversation')
  let corpo = trascrizione(battute, lui)
  if (agente) {
    const progetto = c.cartella ? basename(c.cartella) : ''
    titolo = progetto ? `${progetto} · ${titolo}` : `${origine === 'codex' ? 'Codex' : 'Claude Code'} · ${titolo}`
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
    percorso: agente && c.cartella ? c.cartella : percorso,
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
  /** Le sessioni di Codex lette. */
  codex: number
  /** Le sessioni lasciate com'erano perché il file non è cambiato. */
  invariate: number
  /** Gli id dei documenti delle sessioni invariate: vivi, da dichiarare a `riconcilia`. */
  visti: string[]
  /** La memoria da scrivere nel cursore per il giro dopo. */
  memoria: Memoria
}

export type OpzioniLettura = OpzioniSessioni & {
  /** La cartella delle sessioni di Codex, se non è quella di casa. */
  codex?: string
}

/**
 * Tutto quello che la configurazione dice di leggere.
 *
 * Un file che non si apre non ferma gli altri, ma va fino a `riconcilia`: se
 * un file manca oggi, i suoi documenti non sono spariti — non li abbiamo
 * visti — e cancellarli vorrebbe dire perdere un anno di chat perché qualcuno
 * ha spostato una cartella. Le cartelle degli agenti invece si leggono solo
 * se ci sono: chi ha solo Codex non deve vedere un guaio su Claude Code.
 */
export async function leggi(cfg: ConfigConversazioni, cartella = cartellaCodice(), schede = cartellaSchedeClaude(), opzioni: OpzioniLettura = {}): Promise<EsitoConversazioni> {
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
  let codex = 0
  let invariate = 0
  const visti: string[] = []
  const memoria: Memoria = {}
  if (cfg.codice) {
    /**
     * Le sessioni di un agente diventano documenti, e la memoria si riscrive:
     * solo i file visti stavolta.
     *
     * Una sessione ripresa (`claude --resume`) è un file nuovo con lo stesso
     * `sessionId` e dentro le battute di prima più quelle nuove: due file, un
     * id, una conversazione. Vince quella che arriva più avanti nel tempo, che
     * è quella intera — non l'ultima che il disco ha elencato.
     */
    const raccogli = (s: EsitoCodice, origine: 'codice' | 'codex'): number => {
      let n = 0
      if (s.troncato) troncato = true
      saltate += s.saltate
      for (const c of s.conversazioni) {
        const d = documento(c, origine, c.percorso ?? '')
        if (d) {
          const prima = docs.get(d.id)
          if (!prima || (d.quando ?? '') >= (prima.quando ?? '')) docs.set(d.id, d)
          n++
        } else saltate++
        if (c.percorso && c.modificata) memoria[c.percorso] = { m: c.modificata, id: d?.id ?? '' }
      }
      for (const v of s.vuote) memoria[v.percorso] = { m: v.m, id: '' }
      for (const v of s.invariate) {
        memoria[v.percorso] = { m: v.m, id: v.id }
        if (v.id) visti.push(v.id)
      }
      invariate += s.invariate.length
      return n
    }
    if (existsSync(cartella)) {
      try {
        codice = raccogli(await sessioni(cartella, Math.max(0, TETTO - docs.size), await titoliClaude(schede), opzioni), 'codice')
      } catch (e) {
        guasti.push({ file: cartella, errore: e instanceof Error ? e.message : String(e) })
      }
    }
    const cartellaDiCodex = opzioni.codex ?? cartellaCodex()
    if (existsSync(cartellaDiCodex)) {
      try {
        codex = raccogli(await sessioniCodex(cartellaDiCodex, Math.max(0, TETTO - docs.size), opzioni), 'codex')
      } catch (e) {
        guasti.push({ file: cartellaDiCodex, errore: e instanceof Error ? e.message : String(e) })
      }
    }
  }

  return { docs: [...docs.values()], saltate, troncato, guasti, perFile, codice, codex, invariate, visti, memoria }
}

export async function sincronizza(cfg: ConfigConversazioni, opzioni: OpzioniLettura = {}): Promise<EsitoConversazioni> {
  return leggi(cfg, cartellaCodice(), cartellaSchedeClaude(), opzioni)
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
    // basta uno dei due agenti: chi ha solo Codex accende lo stesso interruttore
    if (!agentiPossibili()) return { ok: false, errore: 'Non trovo le sessioni di Claude Code su questo computer.' }
    // la cartella c'è ma non si sfoglia: zero, e lo dirà la lettura
    codice = await contaSessioni()
  }
  return { ok: true, file, codice }
}

export function collegato(c: { conversazioni?: ConfigConversazioni }): boolean {
  return !!c.conversazioni
}
