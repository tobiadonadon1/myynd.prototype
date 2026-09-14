// Un fornitore che parla la lingua di OpenAI, visto da qui come se fosse Claude.
//
// Myynd è scritto contro l'SDK di Anthropic: i giri degli strumenti in
// `claude.ts` leggono blocchi `tool_use`, rispondono con blocchi `tool_result`,
// guardano `stop_reason`. Sono quattro cicli che funzionano e che non vale la
// pena riscrivere due volte. Quindi qui non si adatta Myynd al fornitore: si
// adatta il fornitore a Myynd. Dentro si parla OpenAI — `chat/completions`,
// `tool_calls`, `finish_reason` — e fuori esce un `Anthropic.Message` uguale a
// quello che uscirebbe dall'SDK. Chi chiama non sa con chi ha parlato.
//
// «Compatibile con OpenAI» non è un fornitore: è una lingua che parlano in
// tanti — OpenAI stessa, OpenRouter, Groq, Mistral — e che parlano anche i
// modelli che girano su questa macchina con Ollama o LM Studio. È quello che
// rende questo file interessante: la stessa porta apre sia il conto di
// un'azienda di San Francisco sia un processo sulla porta 11434 di casa.
//
// Nessuna dipendenza nuova: `fetch` e basta. Ogni fornitore ha le sue piccole
// differenze e si scoprono solo con un 400 in mano; il modo di conviverci è
// leggere il 400, ritoccare la richiesta e riprovare una volta — non un
// pacchetto in più che le conosce tutte e le conoscerà finché lo aggiornano.

import type Anthropic from '@anthropic-ai/sdk'

export type Fornitore = { url: string; chiave?: string; modello: string; nome?: string }

/**
 * Una richiesta come la costruisce `claude.ts`.
 *
 * È la richiesta dell'SDK con due campi allargati: `stream` lo decide la
 * funzione che si chiama, non il parametro, e `output_config` accetta anche la
 * forma «analizzabile» che l'SDK usa per lo streaming — a noi serve solo lo
 * schema che c'è dentro.
 */
export type Richiesta = Omit<Anthropic.MessageCreateParamsNonStreaming, 'stream' | 'output_config'> & {
  stream?: boolean
  output_config?: {
    effort?: string | null
    format?: { type?: string; schema?: Record<string, unknown> } | null
  } | null
}

// — la rete, sostituibile —

let rete: typeof fetch | null = null

/** Per i test: un `fetch` finto. `null` torna a quello vero. */
export function usaRete(f: typeof fetch | null) { rete = f }

function chiama(dove: string, come: RequestInit): Promise<Response> {
  return (rete ?? globalThis.fetch)(dove, come)
}

// — quello che si manda —

type ToolCallOA = { id: string; type: 'function'; function: { name: string; arguments: string } }

export type MessaggioOA =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCallOA[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export type AttrezzoOA = {
  type: 'function'
  function: { name: string; description?: string; parameters: Record<string, unknown> }
}

/** Il testo dentro un contenuto che può essere una stringa o una fila di blocchi. */
function testoDi(contenuto: unknown): string {
  if (typeof contenuto === 'string') return contenuto
  if (!Array.isArray(contenuto)) return ''
  return contenuto
    .filter((b): b is { type: 'text'; text: string } => !!b && b.type === 'text' && typeof b.text === 'string')
    .map(b => b.text)
    .join('\n')
}

/**
 * Il risultato di un attrezzo, in una stringa sola.
 *
 * OpenAI non ha un `is_error`: si scrive in testa, così il modello lo legge
 * come lo leggerebbe Claude — «questo tentativo è andato male» — e non come un
 * risultato qualunque.
 */
function risultato(b: Anthropic.ToolResultBlockParam): string {
  const testo = testoDi(b.content ?? '')
  return b.is_error ? `Errore: ${testo}` : testo
}

/**
 * I messaggi, da una forma all'altra.
 *
 * Le regole che contano:
 *   · il `system` diventa un messaggio con ruolo `system`, in testa; se è una
 *     fila di blocchi (quella con `cache_control`) si appiattisce, perché di là
 *     la cache non si chiede così;
 *   · un turno dell'assistente con dentro `tool_use` diventa `tool_calls`, con
 *     gli argomenti come stringa JSON — è così che OpenAI li vuole;
 *   · un turno dell'utente con dentro `tool_result` diventa un messaggio con
 *     ruolo `tool` per ciascun risultato, e vengono *prima* del testo: OpenAI
 *     esige che i risultati seguano subito la chiamata.
 */
export function messaggi(
  sistema: string | Anthropic.TextBlockParam[] | undefined,
  turni: Anthropic.MessageParam[]
): MessaggioOA[] {
  const fuori: MessaggioOA[] = []
  const inTesta = testoDi(sistema)
  if (inTesta) fuori.push({ role: 'system', content: inTesta })

  for (const m of turni) {
    if (m.role === 'system') {
      const t = testoDi(m.content)
      if (t) fuori.push({ role: 'system', content: t })
      continue
    }
    if (typeof m.content === 'string') {
      fuori.push({ role: m.role, content: m.content })
      continue
    }
    if (m.role === 'assistant') {
      const testo = testoDi(m.content)
      const chiamate: ToolCallOA[] = m.content
        .filter((b): b is Anthropic.ToolUseBlockParam => b.type === 'tool_use')
        .map(b => ({
          id: b.id, type: 'function',
          function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) }
        }))
      fuori.push({
        role: 'assistant',
        // `null` e non '' quando c'è solo una chiamata: è la forma che la
        // specifica prevede, e quella che i server in casa accettano tutti
        content: testo || (chiamate.length ? null : ''),
        ...(chiamate.length ? { tool_calls: chiamate } : {})
      })
      continue
    }
    for (const b of m.content) {
      if (b.type === 'tool_result') fuori.push({ role: 'tool', tool_call_id: b.tool_use_id, content: risultato(b) })
    }
    const testo = testoDi(m.content)
    if (testo) fuori.push({ role: 'user', content: testo })
  }
  return fuori
}

/**
 * Gli attrezzi. Solo quelli con uno schema: gli attrezzi «di casa» di Anthropic
 * — la ricerca web, l'editor — non hanno un equivalente di là e si tacciono.
 */
export function attrezzi(tools: Anthropic.ToolUnion[] | undefined): AttrezzoOA[] {
  if (!tools) return []
  return tools
    .filter((t): t is Anthropic.Tool => 'input_schema' in t && !!t.input_schema)
    .map(t => ({
      type: 'function',
      function: {
        name: t.name,
        ...(t.description ? { description: t.description } : {}),
        parameters: t.input_schema as unknown as Record<string, unknown>
      }
    }))
}

function sceltaAttrezzo(s: Anthropic.ToolChoice): unknown {
  if (s.type === 'any') return 'required'
  if (s.type === 'none') return 'none'
  if (s.type === 'tool') return { type: 'function', function: { name: s.name } }
  return 'auto'
}

/**
 * I modelli che ragionano davvero, e a cui `effort` dice qualcosa.
 *
 * Su tutti gli altri `reasoning_effort` è un 400, e su un modello in casa è
 * semplicemente una parola che non conosce. Si manda solo dove ha senso.
 */
export function ragiona(modello: string): boolean {
  return /^(o1|o3|o4|gpt-5)/i.test(modello)
}

/**
 * Il corpo della richiesta, nella forma di OpenAI.
 *
 * Quello che si perde per strada, e perché non è una perdita: il pensiero
 * adattivo di Claude non esiste di là e si toglie; la cache si chiede in un
 * altro modo (o non si chiede) e si toglie; `effort` diventa
 * `reasoning_effort` solo dove esiste. Il resto — messaggi, attrezzi, tetto
 * di token, schema d'uscita — passa intero.
 */
export function corpo(f: Fornitore, p: Richiesta, inStreaming: boolean): Record<string, unknown> {
  const fuori: Record<string, unknown> = {
    model: f.modello,
    messages: messaggi(p.system, p.messages),
    // il nome nuovo, che i modelli che ragionano esigono; se il server non lo
    // conosce, `ritocca` lo rimette a quello vecchio al primo 400
    max_completion_tokens: p.max_tokens
  }
  if (inStreaming) {
    fuori.stream = true
    fuori.stream_options = { include_usage: true }
  }
  const ferri = attrezzi(p.tools)
  if (ferri.length) {
    fuori.tools = ferri
    if (p.tool_choice) fuori.tool_choice = sceltaAttrezzo(p.tool_choice)
  }
  if (p.stop_sequences?.length) fuori.stop = p.stop_sequences

  const schema = p.output_config?.format?.schema
  if (schema) {
    fuori.response_format = { type: 'json_schema', json_schema: { name: 'risposta', schema, strict: false } }
  }
  const sforzo = p.output_config?.effort
  if (sforzo && ragiona(f.modello)) {
    fuori.reasoning_effort = sforzo === 'xhigh' || sforzo === 'max' ? 'high' : sforzo
  }
  return fuori
}

// — quello che torna —

export type SceltaOA = {
  index?: number
  message?: {
    role?: string
    content?: string | { type?: string; text?: string }[] | null
    tool_calls?: { id?: string; type?: string; function?: { name?: string; arguments?: unknown } }[]
    refusal?: string | null
  }
  finish_reason?: string | null
}

export type UsoOA = {
  prompt_tokens?: number
  completion_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number } | null
}

export type RispostaOA = {
  id?: string
  model?: string
  choices?: SceltaOA[]
  usage?: UsoOA | null
  error?: { message?: string; type?: string; code?: string } | string
}

let contatore = 0
function idNuovo(prefisso = 'call'): string {
  contatore = (contatore + 1) % 1_000_000
  return `${prefisso}_${Date.now().toString(36)}${contatore.toString(36)}`
}

/** Gli argomenti di una chiamata: una stringa JSON, o già un oggetto. Se non si legge, vuoto. */
function argomenti(a: unknown): Record<string, unknown> {
  if (a && typeof a === 'object' && !Array.isArray(a)) return a as Record<string, unknown>
  if (typeof a !== 'string' || !a.trim()) return {}
  try {
    const j = JSON.parse(a) as unknown
    return j && typeof j === 'object' && !Array.isArray(j) ? j as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function motivo(finish: string | null | undefined, rifiuto: boolean, conAttrezzi: boolean): Anthropic.StopReason {
  if (rifiuto || finish === 'content_filter') return 'refusal'
  // qualche server in casa dice `stop` anche quando ha chiamato un attrezzo:
  // conta quello che c'è nel messaggio, non l'etichetta
  if (finish === 'tool_calls' || conAttrezzi) return 'tool_use'
  if (finish === 'length') return 'max_tokens'
  return 'end_turn'
}

function uso(u: UsoOA | null | undefined): Anthropic.Usage {
  // `prompt_tokens` comprende anche quelli letti dalla cache; Anthropic li
  // tiene fuori. Si tolgono, o il tetto del giorno li contava due volte
  const cache = u?.prompt_tokens_details?.cached_tokens ?? 0
  return {
    input_tokens: Math.max(0, (u?.prompt_tokens ?? 0) - cache),
    output_tokens: u?.completion_tokens ?? 0,
    cache_read_input_tokens: cache,
    cache_creation_input_tokens: 0,
    cache_creation: null,
    inference_geo: null,
    output_tokens_details: null,
    server_tool_use: null,
    service_tier: null
  }
}

/**
 * Da una risposta di OpenAI a un `Anthropic.Message`.
 *
 * Un blocco di testo se c'è testo, un `tool_use` per ogni `tool_calls`, e lo
 * `stop_reason` che i giri di `claude.ts` sanno leggere. È l'unica funzione
 * che i cicli degli strumenti vedono davvero, e per questo è quella con più
 * prove addosso.
 */
export function inMessaggio(r: RispostaOA, modello: string): Anthropic.Message {
  const scelta = r.choices?.[0]
  const m = scelta?.message ?? {}
  const testo = testoDi(m.content ?? '')
  const content: Array<Anthropic.TextBlock | Anthropic.ToolUseBlock> = []
  if (testo) content.push({ type: 'text', text: testo, citations: null })
  for (const c of m.tool_calls ?? []) {
    content.push({
      type: 'tool_use',
      id: c.id || idNuovo(),
      name: c.function?.name ?? '',
      input: argomenti(c.function?.arguments),
      caller: { type: 'direct' }
    })
  }
  return {
    id: r.id ?? idNuovo('msg'),
    type: 'message',
    role: 'assistant',
    model: r.model ?? modello,
    content,
    stop_reason: motivo(scelta?.finish_reason, !!m.refusal, content.some(b => b.type === 'tool_use')),
    stop_sequence: null,
    stop_details: null,
    container: null,
    usage: uso(r.usage)
  }
}

// — gli errori, come li direbbe lui —

/** Il messaggio dentro un corpo d'errore, se il corpo è JSON; altrimenti il corpo. */
function detto(testo: string): string {
  try {
    const j = JSON.parse(testo) as RispostaOA
    if (typeof j.error === 'string') return j.error
    if (j.error?.message) return `${j.error.message}${j.error.code ? ` (${j.error.code})` : ''}`
  } catch { /* non è JSON: si legge com'è */ }
  return testo.trim().slice(0, 300)
}

/**
 * Da uno stato HTTP a una frase.
 *
 * Il 404 è il caso ambiguo: lo dà un modello che non esiste, e lo dà un
 * indirizzo scritto male. Si guarda se il server parla di «model»: OpenAI e
 * Ollama lo fanno tutti e due, e un indirizzo sbagliato no.
 *
 * Il credito finito arriva come un 429 da OpenAI — `insufficient_quota` — e
 * come un 402 da altri: si legge il corpo, perché mandare a «riprovare fra
 * poco» chi deve ricaricare il conto è un pomeriggio perso.
 */
export function erroreDelFornitore(stato: number, testo: string): Error {
  const d = detto(testo)
  if (stato === 401 || stato === 403) return new Error('La chiave del fornitore non è valida.')
  if (stato === 402 || /insufficient_quota|quota|billing|credit/i.test(d)) {
    return new Error('Il conto del fornitore è senza credito.')
  }
  if (stato === 404) {
    return /model/i.test(d)
      ? new Error('Il fornitore non conosce questo modello.')
      : new Error('Non riesco a raggiungere il fornitore. Controlla l’indirizzo.')
  }
  if (stato === 429) return new Error('Il fornitore è sotto sforzo. Riprova fra poco.')
  if (stato === 400 || stato === 422) {
    // la ragione vera è per chi guarda il terminale: al fornitore non si può
    // chiedere di scriverla in italiano
    console.warn('myynd · il fornitore compatibile ha rifiutato la richiesta:', d)
    return new Error('Il fornitore ha rifiutato la richiesta. Controlla il modello nelle preferenze.')
  }
  if (stato >= 500) return new Error('Il fornitore ha un problema. Riprova fra poco.')
  return new Error('Il fornitore non ha risposto. Riprova.')
}

/**
 * Il nome che porta l'errore di chi non ha cominciato in tempo.
 *
 * Serve a chi chiama per distinguerlo da tutti gli altri: il tetto sulla
 * *prima parola* in chat è quindici secondi, e la frase da dire lì non è
 * «riprova» — è «questo modello è troppo grosso per il tuo computer». Chi non
 * ha un budget suo continua a leggere la frase generica.
 */
export const ATTESA_SCADUTA = 'AttesaScaduta'

/** Quando `fetch` stesso non ce l'ha fatta: nessuno in ascolto, o troppo tempo. */
function erroreDiRete(e: unknown, perche: 'attesa' | 'silenzio' | null): Error {
  if (perche === 'silenzio') return new Error('La risposta si è interrotta a metà. Riprova.')
  const nome = e instanceof Error ? e.name : ''
  if (perche === 'attesa' || nome === 'TimeoutError' || nome === 'AbortError') {
    const troppo = new Error('Ci ha messo troppo e ho lasciato perdere. Riprova.')
    troppo.name = ATTESA_SCADUTA
    return troppo
  }
  return new Error('Non riesco a raggiungere il fornitore. Controlla l’indirizzo.')
}

// — la richiesta, con i ritocchi —

/** L'indirizzo base, senza barre in coda e senza il pezzo finale se l'ha incollato tutto. */
export function base(url: string): string {
  return url.trim().replace(/\/+$/, '').replace(/\/chat\/completions$/, '')
}

function intestazioni(f: Fornitore): Record<string, string> {
  return {
    'content-type': 'application/json',
    ...(f.chiave ? { authorization: `Bearer ${f.chiave}` } : {})
  }
}

/**
 * Un 400 letto e una richiesta ritoccata, una volta per ritocco.
 *
 * Ogni voce è una differenza vera fra fornitori, incontrata o documentata:
 *   · `max_completion_tokens` è il nome nuovo; i server più vecchi conoscono
 *     solo `max_tokens` e lo dicono nel messaggio;
 *   · `json_schema` non lo accettano tutti; `json_object` quasi tutti, e lo
 *     schema si mette a parole nel system — è quello che Ollama fa da sé;
 *   · `stream_options`, `reasoning_effort` e `tool_choice` sono facoltativi
 *     per noi: se uno li rifiuta, si tolgono.
 *
 * Torna `true` se ha cambiato qualcosa — cioè se vale la pena riprovare.
 */
export function ritocca(c: Record<string, unknown>, messaggio: string): boolean {
  if ('max_completion_tokens' in c && /max_completion_tokens/i.test(messaggio)) {
    c.max_tokens = c.max_completion_tokens
    delete c.max_completion_tokens
    return true
  }
  const formato = c.response_format as { type?: string; json_schema?: { schema?: unknown } } | undefined
  // solo se è dello schema che si lamenta: senza questo controllo un 400 su
  // `tool_choice` bruciava il primo tentativo togliendo il vincolo sull'uscita,
  // che con quel rifiuto non c'entrava niente
  if (formato?.type === 'json_schema' && /response_format|json[_ ]?schema|schema|structured|format/i.test(messaggio)) {
    const schema = formato.json_schema?.schema
    c.response_format = { type: 'json_object' }
    const righe = c.messages as MessaggioOA[]
    const aggiunta = '\n\nRispondi solo con un oggetto JSON valido, senza testo attorno, che rispetti questo schema:\n' +
      JSON.stringify(schema ?? {})
    const primo = righe.find(m => m.role === 'system')
    if (primo && primo.role === 'system') primo.content += aggiunta
    else righe.unshift({ role: 'system', content: aggiunta.trim() })
    return true
  }
  if ('stream_options' in c && /stream_options/i.test(messaggio)) { delete c.stream_options; return true }
  if ('reasoning_effort' in c && /reasoning_effort/i.test(messaggio)) { delete c.reasoning_effort; return true }
  if ('tool_choice' in c && /tool_choice/i.test(messaggio)) { delete c.tool_choice; return true }
  return false
}

/**
 * Manda, e se è un 400 che si può sistemare, sistema e rimanda.
 *
 * Al massimo tre ritocchi: sono quattro le cose che si possono togliere, e un
 * server che rifiuta tutto ha un problema che non è nostro.
 */
async function spedisci(
  f: Fornitore,
  dove: string,
  c: Record<string, unknown>,
  segnale: AbortSignal,
  perche: () => 'attesa' | 'silenzio' | null,
  conRitocchi = true
): Promise<Response> {
  for (let ritocchi = 0; ; ) {
    let r: Response
    try {
      r = await chiama(dove, {
        method: 'POST', headers: intestazioni(f), body: JSON.stringify(c), signal: segnale
      })
    } catch (e) {
      throw erroreDiRete(e, perche())
    }
    if (r.ok) return r
    const testo = await r.text().catch(() => '')
    // i ritocchi sono differenze fra fornitori che parlano OpenAI: sulla porta
    // di casa di Ollama non c'è niente da ritoccare, e riprovare sarebbe solo
    // la stessa richiesta due volte
    if (conRitocchi && r.status === 400 && ritocchi < 3 && ritocca(c, detto(testo))) { ritocchi++; continue }
    throw erroreDelFornitore(r.status, testo)
  }
}

// — Ollama, che parla anche la lingua sua —

/**
 * Perché a Ollama si parla nella sua lingua e non in quella di OpenAI.
 *
 * Sulla porta `/v1` Ollama fa finta di essere OpenAI, e funziona. Ma due cose
 * che contano non passano da lì, e sono esattamente le due che decidono se la
 * chat risponde in un secondo o in venti:
 *
 *   · `think: false`. I modelli nuovi ragionano a voce alta prima di
 *     rispondere, e quel monologo lo si paga tutto in attesa — in chat non lo
 *     legge nessuno. Sulla porta compatibile non c'è modo di spegnerlo.
 *   · `num_ctx`. Ollama alloca la finestra che gli si chiede, e il valore di
 *     serie di un modello moderno è enorme: con 262k dichiarati la macchina
 *     prepara una finestra che non userà mai, e il primo token arriva dopo.
 *
 * Fuori da Ollama non cambia niente: si continua a parlare `chat/completions`
 * con tutti, che è il motivo per cui questo file esiste.
 */
/** Un nome che sta su questa macchina o sulla rete di casa. Vedi `indirizzoAmmesso`. */
function hostInCasa(host: string): boolean {
  return host === 'localhost' || host.endsWith('.localhost') ||
    host.endsWith('.local') || host.endsWith('.internal') ||
    host === '::1' || /^fe80:/i.test(host) || /^fd/i.test(host) ||
    /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^169\.254\./.test(host) ||
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) || /^0\./.test(host)
}

const ORIGINE_OLLAMA = new Map<string, { ollama: boolean; quando: number }>()

/** Quanto si crede a quello che si è scoperto bussando. Dieci minuti: un'app che si accende in mezzo. */
const RICORDO_OLLAMA = 10 * 60_000

/** Per i test, e per quando l'indirizzo cambia sotto i piedi. */
export function scordaOllama() { ORIGINE_OLLAMA.clear() }

/** La radice del server, senza il pezzo `/v1`: le API native di Ollama stanno lì. */
export function origine(url: string): string {
  try { return new URL(base(url)).origin } catch { return base(url) }
}

/** La porta di serie di Ollama, in casa: si riconosce senza chiedere niente a nessuno. */
function sembraOllama(url: string): boolean {
  try {
    const u = new URL(base(url))
    const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase()
    return u.port === '11434' && (host === '127.0.0.1' || host === 'localhost' || host === '::1')
  } catch { return false }
}

/** Vale la pena bussare? Solo in casa: Ollama sta lì, e un fornitore in rete non deve pagare una GET in più. */
function daBussare(url: string): boolean {
  try {
    const u = new URL(base(url))
    return u.protocol === 'http:' || hostInCasa(u.hostname.replace(/^\[|\]$/g, '').toLowerCase())
  } catch { return false }
}

/**
 * È Ollama?
 *
 * Prima dall'indirizzo, che copre il caso normale senza costare niente — la
 * porta 11434 su questa macchina. Se non basta, e solo se l'indirizzo è di
 * casa, si bussa una volta a `/api/tags` — che esiste solo lì — e si tiene a
 * mente la risposta per dieci minuti: un fornitore in rete non deve pagare una
 * chiamata in più a ogni domanda.
 *
 * Non basta che risponda: deve rispondere *come Ollama*, cioè con l'elenco dei
 * modelli. Un server qualunque che dice 200 a tutto non è Ollama, e trattarlo
 * come tale vorrebbe dire mandargli un corpo che non capisce e leggere una
 * risposta che non c'è.
 */
export async function eOllama(url: string): Promise<boolean> {
  if (sembraOllama(url)) return true
  if (!daBussare(url)) return false
  const chiave = base(url)
  const visto = ORIGINE_OLLAMA.get(chiave)
  if (visto && Date.now() - visto.quando < RICORDO_OLLAMA) return visto.ollama
  let ollama = false
  try {
    const r = await chiama(`${origine(url)}/api/tags`, { signal: AbortSignal.timeout(2_000) })
    if (r.ok) {
      const j = await r.json() as { models?: unknown }
      ollama = Array.isArray(j?.models)
    }
  } catch { ollama = false }
  ORIGINE_OLLAMA.set(chiave, { ollama, quando: Date.now() })
  return ollama
}

/** I messaggi, come li vuole `/api/chat`: gli argomenti sono oggetti, non stringhe. */
export function messaggiOllama(righe: MessaggioOA[]): Record<string, unknown>[] {
  return righe.map(m => {
    if (m.role === 'assistant') {
      const chiamate = m.tool_calls ?? []
      return {
        role: 'assistant',
        content: m.content ?? '',
        ...(chiamate.length
          ? { tool_calls: chiamate.map(c => ({ function: { name: c.function.name, arguments: argomenti(c.function.arguments) } })) }
          : {})
      }
    }
    // di là il risultato di un attrezzo si riconosce dall'ordine, non da un id
    if (m.role === 'tool') return { role: 'tool', content: m.content }
    return { role: m.role, content: m.content }
  })
}

/** La finestra minima, e quella oltre cui non si va. */

/**
 * Quanta finestra chiedere.
 *
 * Ottomila token bastano alla chat — il prompt compatto è fatto apposta per
 * starci — ed è il valore che tiene la prima parola vicina. Ma gli altri
 * lavori (la rassegna, il feed) mandano molto di più, e una finestra troppo
 * stretta Ollama non la segnala: taglia il prompt in silenzio, e il modello
 * risponde su metà materiale. Quindi si parte da ottomila e si raddoppia
 * finché ci sta, con un tetto.
 */
/*
 * Una finestra sola, sempre la stessa.
 *
 * Misurato il 14 settembre 2026 sul suo Mac: ogni volta che `num_ctx` cambia
 * fra una richiesta e l'altra Ollama ricarica il modello, dieci secondi buoni;
 * con la stessa finestra il modello caldo risponde in meno di tre. Una finestra
 * che si adatta al prompt (la chat piccola, il punto grande) ricaricava a ogni
 * passaggio. Quindi: 16k per tutto, e un prompt che non ci sta si accorcia
 * prima di partire (`entroLaFinestra`), invece di farselo tagliare in silenzio.
 */
export const CTX_FISSO = 16_384
export function finestra(_righe: Record<string, unknown>[], _max = 0): number {
  return CTX_FISSO
}

/** Quanti token, a occhio: tre caratteri e mezzo l'uno. */
const stimaToken = (testo: string) => Math.ceil(testo.length / 3.5)

/**
 * Le righe accorciate quanto basta a stare nella finestra, con un margine per
 * la risposta. Si taglia in mezzo alla riga più lunga (di solito il materiale
 * dentro il messaggio della persona), e si lascia scritto che manca un pezzo:
 * un modello che legge «[…]» sa di non avere tutto, uno a cui Ollama toglie
 * la testa del prompt non lo sa nemmeno.
 */
export function entroLaFinestra(righe: Record<string, unknown>[], max = 0): Record<string, unknown>[] {
  const spazio = CTX_FISSO - Math.max(max, 512) - 256
  const peso = () => stimaToken(JSON.stringify(righe))
  let giri = 0
  while (peso() > spazio && giri++ < 8) {
    let i = -1, lung = 0
    righe.forEach((r, k) => { const c = typeof r.content === 'string' ? r.content : ''; if (c.length > lung) { lung = c.length; i = k } })
    if (i < 0 || lung < 400) break
    const c = righe[i].content as string
    const tolgo = Math.min(c.length - 300, Math.ceil((peso() - spazio) * 3.5) + 200)
    const meta = Math.floor(c.length / 2)
    righe[i] = { ...righe[i], content: c.slice(0, meta - Math.floor(tolgo / 2)) + '\n[…]\n' + c.slice(meta + Math.ceil(tolgo / 2)) }
  }
  return righe
}

/** Il corpo per `/api/chat`, che è un'altra forma dalla stessa richiesta. */
export function corpoOllama(f: Fornitore, p: Richiesta, inStreaming: boolean): Record<string, unknown> {
  const righe = entroLaFinestra(messaggiOllama(messaggi(p.system, p.messages)), p.max_tokens)
  const fuori: Record<string, unknown> = {
    model: f.modello,
    messages: righe,
    stream: inStreaming,
    think: false,
    options: {
      num_ctx: finestra(righe, p.max_tokens),
      ...(typeof p.temperature === 'number' ? { temperature: p.temperature } : {}),
      ...(p.max_tokens ? { num_predict: p.max_tokens } : {}),
      ...(p.stop_sequences?.length ? { stop: p.stop_sequences } : {})
    }
  }
  const ferri = attrezzi(p.tools)
  if (ferri.length) fuori.tools = ferri
  // lo schema d'uscita di là si chiama `format`, e si passa intero
  const schema = p.output_config?.format?.schema
  if (schema) fuori.format = schema
  return fuori
}

type PezzoOllama = {
  model?: string
  message?: {
    content?: string
    tool_calls?: { function?: { name?: string; arguments?: unknown } }[]
  }
  done?: boolean
  done_reason?: string | null
  prompt_eval_count?: number
  eval_count?: number
  error?: string
}

/**
 * Quello che arriva da `/api/chat`, rimesso nella forma che leggono tutti.
 *
 * Si accumula come per l'SSE — testo, chiamate, motivo della fine, conto dei
 * token — e poi si passa da `inMessaggio`, che è l'unica funzione che i giri
 * degli strumenti vedono davvero.
 */
function daOllama(pezzi: PezzoOllama[], modello: string): Anthropic.Message {
  let testo = ''
  let finish: string | null = null
  let entrata = 0
  let uscita = 0
  const chiamate: { id?: string; type?: string; function?: { name?: string; arguments?: unknown } }[] = []
  for (const p of pezzi) {
    if (p.message?.content) testo += p.message.content
    for (const c of p.message?.tool_calls ?? []) {
      chiamate.push({ type: 'function', function: { name: c.function?.name, arguments: c.function?.arguments } })
    }
    if (p.prompt_eval_count) entrata = p.prompt_eval_count
    if (p.eval_count) uscita = p.eval_count
    if (p.done) finish = p.done_reason ?? 'stop'
  }
  return inMessaggio({
    model: modello,
    usage: { prompt_tokens: entrata, completion_tokens: uscita },
    choices: [{ message: { role: 'assistant', content: testo, tool_calls: chiamate }, finish_reason: finish }]
  }, modello)
}

/** Una riga di NDJSON: o è un pezzo, o è un errore detto in mezzo al flusso. */
function pezzoOllama(riga: string): PezzoOllama | null {
  const pulita = riga.trim()
  if (!pulita) return null
  let j: PezzoOllama
  try { j = JSON.parse(pulita) as PezzoOllama } catch { return null }
  if (j.error) throw erroreDelFornitore(/model/i.test(j.error) ? 404 : 500, JSON.stringify({ error: j.error }))
  return j
}

/**
 * Una chiamata secca: si aspetta tutto, torna un messaggio.
 *
 * `attesa` è quanto si aspetta *in tutto*: qui non c'è streaming, e una
 * risposta che non è finita in quel tempo non finirà.
 */
export async function crea(f: Fornitore, p: Richiesta, attesa = 60_000): Promise<Anthropic.Message> {
  const controllo = new AbortController()
  let perche: 'attesa' | 'silenzio' | null = null
  const sveglia = setTimeout(() => { perche = 'attesa'; controllo.abort() }, attesa)
  const nativo = await eOllama(f.url)
  try {
    const r = await spedisci(
      f,
      nativo ? `${origine(f.url)}/api/chat` : `${base(f.url)}/chat/completions`,
      nativo ? corpoOllama(f, p, false) : corpo(f, p, false),
      controllo.signal, () => perche, !nativo
    )
    let j: RispostaOA | PezzoOllama
    try {
      j = await r.json() as RispostaOA | PezzoOllama
    } catch (e) {
      if (controllo.signal.aborted) throw erroreDiRete(e, perche)
      throw new Error('Il fornitore ha risposto con qualcosa che non so leggere.')
    }
    return nativo ? daOllama([j as PezzoOllama], f.modello) : inMessaggio(j as RispostaOA, f.modello)
  } finally {
    clearTimeout(sveglia)
  }
}

/**
 * Il corpo letto riga per riga, con la guardia riarmata a ogni pezzo.
 *
 * SSE e NDJSON sono due modi di scrivere la stessa cosa — righe che arrivano
 * quando arrivano — e la parte difficile è la stessa per tutti e due: un pezzo
 * può finire a metà riga fra due letture, e chi lo dimentica perde una parola
 * ogni tanto, senza che nessuno se ne accorga.
 */
async function perRiga(r: Response, riarma: () => void, riga: (l: string) => void): Promise<void> {
  if (!r.body) throw new Error('Il fornitore ha risposto con qualcosa che non so leggere.')
  const lettore = r.body.getReader()
  const dec = new TextDecoder()
  let resto = ''
  for (;;) {
    const { value, done } = await lettore.read()
    if (done) break
    riarma()
    resto += dec.decode(value, { stream: true })
    let i: number
    while ((i = resto.indexOf('\n')) >= 0) {
      riga(resto.slice(0, i))
      resto = resto.slice(i + 1)
    }
  }
  resto += dec.decode()
  if (resto) riga(resto)
}

/**
 * Una chiamata in streaming: il testo arriva a pezzi, e in fondo c'è lo
 * stesso messaggio che darebbe `crea`.
 *
 * Due tempi, come nell'SDK: `attesa` vale finché non arrivano le intestazioni,
 * poi smette di contare — una risposta lunga che arriva bene non va tagliata.
 * Da lì in avanti conta `silenzio`, che si riarma a ogni pezzo: taglia solo un
 * filo che ha smesso di parlare. È la stessa guardia di `senzaSilenzi`, e con
 * lo stesso motivo — una chat che resta a «cerco tra le fonti» finché non
 * ricarichi è il difetto che il brief chiama fatale.
 */
export async function flusso(
  f: Fornitore,
  p: Richiesta,
  onTesto: (delta: string) => void,
  attesa = 60_000,
  silenzio = 45_000,
  segnale?: AbortSignal
): Promise<Anthropic.Message> {
  const controllo = new AbortController()
  let perche: 'attesa' | 'silenzio' | null = null
  // chi ascoltava se n'è andato: si chiude il rubinetto, non si finisce di pagare
  if (segnale?.aborted) controllo.abort()
  segnale?.addEventListener('abort', () => controllo.abort(), { once: true })
  let sveglia = setTimeout(() => { perche = 'attesa'; controllo.abort() }, attesa)
  const riarma = () => {
    clearTimeout(sveglia)
    sveglia = setTimeout(() => { perche = 'silenzio'; controllo.abort() }, silenzio)
  }

  try {
    const nativo = await eOllama(f.url)
    return nativo
      ? await flussoOllama(f, p, onTesto, controllo, () => perche, riarma)
      : await flussoOA(f, p, onTesto, controllo, () => perche, riarma)
  } finally {
    clearTimeout(sveglia)
  }
}

/** Il flusso nella lingua nativa di Ollama: NDJSON, una riga per pezzo. */
async function flussoOllama(
  f: Fornitore,
  p: Richiesta,
  onTesto: (delta: string) => void,
  controllo: AbortController,
  quando: () => 'attesa' | 'silenzio' | null,
  riarma: () => void
): Promise<Anthropic.Message> {
  const r = await spedisci(f, `${origine(f.url)}/api/chat`, corpoOllama(f, p, true), controllo.signal, quando, false)
  riarma()
  const pezzi: PezzoOllama[] = []
  try {
    await perRiga(r, riarma, l => {
      const pezzo = pezzoOllama(l)
      if (!pezzo) return
      pezzi.push(pezzo)
      if (pezzo.message?.content) onTesto(pezzo.message.content)
    })
  } catch (e) {
    if (controllo.signal.aborted) throw erroreDiRete(e, quando())
    throw e
  }
  return daOllama(pezzi, f.modello)
}

/** Il flusso nella lingua di OpenAI: SSE, un evento per blocco di righe. */
async function flussoOA(
  f: Fornitore,
  p: Richiesta,
  onTesto: (delta: string) => void,
  controllo: AbortController,
  quando: () => 'attesa' | 'silenzio' | null,
  riarma: () => void
): Promise<Anthropic.Message> {
  const r = await spedisci(f, `${base(f.url)}/chat/completions`, corpo(f, p, true), controllo.signal, quando)
  riarma()

  // quello che si accumula
  let id: string | undefined
  let model: string | undefined
  let testo = ''
  let finish: string | null = null
  let rifiuto = false
  let usato: UsoOA | null | undefined
  const chiamate = new Map<number, { id: string; name: string; arguments: string }>()

  const evento = (dato: string) => {
    if (dato === '[DONE]') return
    let j: RispostaOA & { choices?: (SceltaOA & { delta?: SceltaOA['message'] & { tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: unknown } }[] } })[] }
    try { j = JSON.parse(dato) } catch { return }   // una riga rotta non ferma le altre
    if (j.error) throw erroreDelFornitore(500, JSON.stringify({ error: j.error }))
    if (j.id) id = j.id
    if (j.model) model = j.model
    if (j.usage) usato = j.usage
    const s = j.choices?.[0]
    if (!s) return
    const d = s.delta ?? {}
    const pezzo = testoDi(d.content ?? '')
    if (pezzo) { testo += pezzo; onTesto(pezzo) }
    if (d.refusal) rifiuto = true
    for (const tc of d.tool_calls ?? []) {
      // per indice quando c'è; altrimenti per id, e un id mai visto è una
      // chiamata nuova — due chiamate parallele senza indice si fondevano in una
      const i = tc.index ?? (tc.id ? ([...chiamate].find(([, v]) => v.id === tc.id)?.[0] ?? chiamate.size) : 0)
      const voce = chiamate.get(i) ?? { id: '', name: '', arguments: '' }
      if (tc.id) voce.id = tc.id
      // si assegna e non si accoda: qualche server rimanda il nome intero a
      // ogni pezzo, e accodarlo darebbe «cercacercacerca»
      if (tc.function?.name) voce.name = tc.function.name
      const a = tc.function?.arguments
      if (typeof a === 'string') voce.arguments += a
      else if (a && typeof a === 'object') voce.arguments += JSON.stringify(a)
      chiamate.set(i, voce)
    }
    if (s.finish_reason) finish = s.finish_reason
  }

  let dati: string[] = []
  const riga = (l: string) => {
    const pulita = l.replace(/\r$/, '')
    if (pulita === '') {
      if (dati.length) { evento(dati.join('\n')); dati = [] }
      return
    }
    if (pulita.startsWith(':')) return                        // un battito
    if (pulita.startsWith('data:')) dati.push(pulita.slice(5).replace(/^ /, ''))
  }
  try {
    await perRiga(r, riarma, riga)
    if (dati.length) evento(dati.join('\n'))
  } catch (e) {
    if (controllo.signal.aborted) throw erroreDiRete(e, quando())
    throw e
  }

  const tool_calls = [...chiamate.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => ({
    id: v.id, type: 'function', function: { name: v.name, arguments: v.arguments }
  }))
  return inMessaggio({
    id, model, usage: usato,
    choices: [{
      message: { role: 'assistant', content: testo, tool_calls, ...(rifiuto ? { refusal: 'refusal' } : {}) },
      finish_reason: finish
    }]
  }, f.modello)
}

// — collegarlo —

/**
 * Dove può stare un fornitore, e dove no.
 *
 * `https` sempre. `http` solo in casa — 127.0.0.1, localhost, la rete locale —
 * perché è lì che girano Ollama e LM Studio, e perché una chiave che viaggia in
 * chiaro verso Internet non è una chiave. Su un server ospitato nemmeno la
 * rete locale: lì «locale» vuol dire la rete di chi ospita, e un indirizzo
 * scritto da una persona non deve poter bussare a una porta che non è sua.
 *
 * Torna la frase da mostrare, o `null` se va bene.
 */
export function indirizzoAmmesso(url: string, ospitato: boolean): string | null {
  let u: URL
  try { u = new URL(base(url)) } catch { return 'L’indirizzo del fornitore non è valido.' }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'L’indirizzo del fornitore non è valido.'
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  /*
   * Quello che non si raggiunge da un server.
   *
   * Oltre alle reti private ci sono due cose che qui pesano di più:
   * `169.254.169.254`, che su ogni fornitore di hosting è il servizio che
   * racconta le credenziali della macchina, e i nomi `.internal` che le
   * piattaforme danno ai servizi vicini — su Railway un database si chiama
   * così. Senza queste due righe un indirizzo `https://…​.internal/v1` passava,
   * e chiunque si fosse registrato poteva far parlare il server con la rete di
   * chi lo ospita e leggersi la risposta. `ospitato.hostRaggiungibile` fa lo
   * stesso per la posta: le due difese devono dire la stessa cosa.
   */
  const inCasa = hostInCasa(host)
  if (ospitato && (inCasa || u.protocol === 'http:')) {
    return 'Su un server il fornitore deve stare su https, fuori dalla rete interna.'
  }
  if (u.protocol === 'http:' && !inCasa) {
    return 'Con http:// si resta in casa: 127.0.0.1, localhost o la rete locale.'
  }
  return null
}

/**
 * La prova, fatta con una richiesta vera e piccolissima.
 *
 * Un token basta a scoprire tutto quello che si può scoprire prima di usarlo
 * davvero: la chiave, il modello, l'indirizzo. Non passa da `parametri()`
 * perché quelli sono i parametri di Claude, e qui la differenza la fa il
 * fornitore, non il lavoro.
 */
export async function prova(f: Fornitore): Promise<{ ok: true; latenzaMs: number } | { ok: false; errore: string }> {
  const partito = Date.now()
  try {
    await crea(f, {
      model: f.modello, max_tokens: 4,
      messages: [{ role: 'user', content: 'ok' }]
    }, 30_000)
    return { ok: true, latenzaMs: Date.now() - partito }
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * C'è qualcuno, adesso?
 *
 * Due secondi, una GET, niente ragionamento. Serve prima di una domanda in
 * chat: con Ollama spento il `fetch` fallisce subito, ma dentro il giro degli
 * strumenti quel fallimento diventava «non riesco a raggiungere il fornitore»
 * dopo che la persona aveva già guardato la rotella. Chiederlo prima costa un
 * decimo di secondo in casa, e permette di dire la cosa vera: *accendilo*.
 *
 * Una risposta qualunque basta. Un 401 vuol dire che il server c'è e la chiave
 * no, ed è un'altra frase — quella la dirà la richiesta vera. Qui si risponde
 * solo a «c'è qualcuno in ascolto su quella porta».
 */
export async function risponde(f: Pick<Fornitore, 'url' | 'chiave'>, attesa = 2_000): Promise<boolean> {
  const dove = (await eOllama(f.url)) ? `${origine(f.url)}/api/tags` : `${base(f.url)}/models`
  try {
    const r = await chiama(dove, {
      headers: intestazioni({ ...f, modello: '' }), signal: AbortSignal.timeout(attesa)
    })
    return !!r
  } catch {
    return false
  }
}

/**
 * I modelli che il fornitore dice di avere, per il menu a tendina.
 *
 * Su Ollama è l'elenco di quello che è installato — cioè esattamente quello
 * che serve a chi non ricorda come si chiama il modello che ha scaricato.
 * Su OpenAI sono centinaia e si mostrano lo stesso. Se non risponde, la lista
 * è vuota e il campo si scrive a mano: non è un errore.
 */
export async function modelli(f: Pick<Fornitore, 'url' | 'chiave'>): Promise<string[]> {
  try {
    const r = await chiama(`${base(f.url)}/models`, {
      headers: intestazioni({ ...f, modello: '' }), signal: AbortSignal.timeout(8_000)
    })
    if (!r.ok) return []
    const j = await r.json() as { data?: { id?: string }[] } | { id?: string }[]
    const voci = Array.isArray(j) ? j : (j.data ?? [])
    return voci.map(m => m.id).filter((x): x is string => typeof x === 'string' && !!x).sort()
  } catch {
    return []
  }
}
