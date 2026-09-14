// Il fornitore compatibile con OpenAI, provato senza rete.
//
// Quello che può sbagliare qui sbaglia in silenzio: un `tool_result` messo
// dopo il testo invece che prima, e OpenAI rifiuta tutta la conversazione; un
// `finish_reason` letto male, e il giro degli strumenti di `claude.ts` si
// ferma con una chiamata in mano; un pezzo di SSE tagliato a metà fra due
// letture, e la risposta perde una parola senza che nessuno se ne accorga.
// Ogni prova qui sotto è una di queste forme, con un `fetch` finto al posto
// del fornitore: si guarda cosa parte e cosa torna, mai la rete.
//
//   node --test server/compatibile.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import type Anthropic from '@anthropic-ai/sdk'
import * as c from './compatibile.ts'

const F: c.Fornitore = { url: 'https://esempio.test/v1/', chiave: 'sk-prova', modello: 'gpt-prova', nome: 'Prova' }

after(() => c.usaRete(null))

/** Quello che il fetch finto ha ricevuto, chiamata per chiamata. */
type Chiamata = { url: string; init: RequestInit; corpo: Record<string, unknown> }

/** Un fornitore finto: risponde in ordine con quello che gli si dà, e si ricorda cosa ha ricevuto. */
function fornitoreFinto(risposte: ((n: number, ch: Chiamata) => Response)[]): Chiamata[] {
  const viste: Chiamata[] = []
  c.usaRete((async (url: string | URL | Request, init?: RequestInit) => {
    const ch: Chiamata = {
      url: String(url), init: init ?? {},
      corpo: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
    }
    viste.push(ch)
    const r = risposte[Math.min(viste.length - 1, risposte.length - 1)]
    return r(viste.length, ch)
  }) as typeof fetch)
  return viste
}

const rispostaOA = (m: c.SceltaOA['message'], finish = 'stop', usage?: c.UsoOA) =>
  Response.json({ id: 'chatcmpl-1', model: 'gpt-prova', choices: [{ index: 0, message: m, finish_reason: finish }], usage })

// — quello che si manda —

test('il system a blocchi diventa un messaggio solo, senza cache_control', () => {
  const fuori = c.messaggi(
    [
      { type: 'text', text: 'Sei Myynd.', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'Rispondi in italiano.' }
    ],
    [{ role: 'user', content: 'ciao' }]
  )
  assert.deepEqual(fuori, [
    { role: 'system', content: 'Sei Myynd.\nRispondi in italiano.' },
    { role: 'user', content: 'ciao' }
  ])
  assert.ok(!JSON.stringify(fuori).includes('cache_control'))
})

test('un turno a blocchi di testo si appiattisce', () => {
  const fuori = c.messaggi('S', [{
    role: 'user',
    content: [{ type: 'text', text: 'Materiale:', cache_control: { type: 'ephemeral' } }, { type: 'text', text: 'Domanda: quanto?' }]
  }])
  assert.deepEqual(fuori[1], { role: 'user', content: 'Materiale:\nDomanda: quanto?' })
})

test('tool_use e tool_result fanno il giro intero nella forma di OpenAI', () => {
  const fuori = c.messaggi(undefined, [
    { role: 'user', content: 'cerca Rossi' },
    {
      role: 'assistant',
      content: [
        { type: 'text', text: 'Guardo.' },
        { type: 'tool_use', id: 'call_1', name: 'cerca', input: { query: 'Rossi' } }
      ]
    },
    {
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'call_1', content: 'Trovati 2' },
        { type: 'text', text: 'e adesso?' }
      ]
    },
    // una chiamata sola, senza testo: il contenuto va a null, non a stringa vuota
    { role: 'assistant', content: [{ type: 'tool_use', id: 'call_2', name: 'apri', input: { id: 'x' } }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_2', is_error: true, content: [{ type: 'text', text: 'non esiste' }] }] }
  ])
  assert.deepEqual(fuori, [
    { role: 'user', content: 'cerca Rossi' },
    {
      role: 'assistant', content: 'Guardo.',
      tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'cerca', arguments: '{"query":"Rossi"}' } }]
    },
    // il risultato PRIMA del testo: OpenAI vuole i `tool` subito dopo la chiamata
    { role: 'tool', tool_call_id: 'call_1', content: 'Trovati 2' },
    { role: 'user', content: 'e adesso?' },
    {
      role: 'assistant', content: null,
      tool_calls: [{ id: 'call_2', type: 'function', function: { name: 'apri', arguments: '{"id":"x"}' } }]
    },
    { role: 'tool', tool_call_id: 'call_2', content: 'Errore: non esiste' }
  ])
})

test('gli attrezzi cambiano forma, e quelli di casa Anthropic spariscono', () => {
  const tools: Anthropic.ToolUnion[] = [
    { name: 'cerca', description: 'Cerca.', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
    { type: 'web_search_20250305', name: 'web_search' }
  ]
  assert.deepEqual(c.attrezzi(tools), [{
    type: 'function',
    function: {
      name: 'cerca', description: 'Cerca.',
      parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }
    }
  }])
})

test('il corpo: max_completion_tokens, lo schema, e niente pensiero', () => {
  const p: c.Richiesta = {
    model: 'claude-sonnet-5', max_tokens: 500,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: { type: 'object' } } },
    system: 'S',
    messages: [{ role: 'user', content: 'x' }]
  }
  const b = c.corpo(F, p, false)
  assert.equal(b.model, 'gpt-prova', 'il modello è quello del fornitore, non quello di Claude')
  assert.equal(b.max_completion_tokens, 500)
  assert.ok(!('max_tokens' in b))
  assert.ok(!('thinking' in b))
  assert.ok(!('reasoning_effort' in b), 'gpt-prova non ragiona: effort non si manda')
  assert.deepEqual(b.response_format, { type: 'json_schema', json_schema: { name: 'risposta', schema: { type: 'object' }, strict: false } })
  assert.ok(!('stream' in b))

  const s = c.corpo({ ...F, modello: 'o3-mini' }, p, true)
  assert.equal(s.reasoning_effort, 'medium', 'su un modello che ragiona effort passa')
  assert.equal(s.stream, true)
  assert.deepEqual(s.stream_options, { include_usage: true })
})

test('chi ragiona davvero', () => {
  for (const m of ['o1', 'o3-mini', 'o4-mini', 'gpt-5', 'GPT-5-mini']) assert.ok(c.ragiona(m), m)
  for (const m of ['gpt-4.1', 'qwen2.5:14b', 'llama3.1', 'mistral-large']) assert.ok(!c.ragiona(m), m)
})

// — quello che torna —

test('un testo diventa un blocco e finisce con end_turn', () => {
  const m = c.inMessaggio({
    id: 'x', model: 'm', choices: [{ message: { role: 'assistant', content: 'Ciao.' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 3, prompt_tokens_details: { cached_tokens: 7 } }
  }, 'gpt-prova')
  assert.equal(m.type, 'message')
  assert.equal(m.role, 'assistant')
  assert.deepEqual(m.content, [{ type: 'text', text: 'Ciao.', citations: null }])
  assert.equal(m.stop_reason, 'end_turn')
  // OpenAI conta i 7 dalla cache dentro i 10; Anthropic li tiene fuori, e il
  // registro dell'uso parla la forma di Anthropic: 3 entrati, 7 dalla cache
  assert.equal(m.usage.input_tokens, 3)
  assert.equal(m.usage.output_tokens, 3)
  assert.equal(m.usage.cache_read_input_tokens, 7)
})

test('le tool_calls diventano tool_use con gli argomenti già letti', () => {
  const m = c.inMessaggio({
    choices: [{
      message: {
        content: null,
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'cerca', arguments: '{"query":"listino"}' } },
          // argomenti rotti: non si lancia, si passa un oggetto vuoto
          { id: 'call_2', type: 'function', function: { name: 'apri', arguments: '{"id": ' } }
        ]
      },
      finish_reason: 'tool_calls'
    }]
  }, 'gpt-prova')
  assert.equal(m.stop_reason, 'tool_use')
  assert.deepEqual(m.content, [
    { type: 'tool_use', id: 'call_1', name: 'cerca', input: { query: 'listino' }, caller: { type: 'direct' } },
    { type: 'tool_use', id: 'call_2', name: 'apri', input: {}, caller: { type: 'direct' } }
  ])
})

test('i motivi di fine: length, refusal, e uno stop con attrezzi dentro', () => {
  assert.equal(c.inMessaggio({ choices: [{ message: { content: 'a' }, finish_reason: 'length' }] }, 'm').stop_reason, 'max_tokens')
  assert.equal(c.inMessaggio({ choices: [{ message: { content: null, refusal: 'no' }, finish_reason: 'stop' }] }, 'm').stop_reason, 'refusal')
  assert.equal(c.inMessaggio({ choices: [{ message: { content: 'a' }, finish_reason: 'content_filter' }] }, 'm').stop_reason, 'refusal')
  // qualche server in casa dice `stop` anche quando ha chiamato: conta il contenuto
  const m = c.inMessaggio({
    choices: [{ message: { content: '', tool_calls: [{ id: 'c', function: { name: 'cerca', arguments: '{}' } }] }, finish_reason: 'stop' }]
  }, 'm')
  assert.equal(m.stop_reason, 'tool_use')
  assert.equal(m.content.length, 1, 'niente blocco di testo vuoto')
})

// — la chiamata secca —

test('crea: parla con /chat/completions, con la chiave, e torna un messaggio', async () => {
  const viste = fornitoreFinto([() => rispostaOA({ role: 'assistant', content: 'Fatto.' })])
  const m = await c.crea(F, { model: 'claude-sonnet-5', max_tokens: 100, system: 'S', messages: [{ role: 'user', content: 'x' }] })
  assert.equal(viste.length, 1)
  assert.equal(viste[0].url, 'https://esempio.test/v1/chat/completions', 'la barra in coda non raddoppia')
  assert.equal((viste[0].init.headers as Record<string, string>).authorization, 'Bearer sk-prova')
  assert.deepEqual(viste[0].corpo.messages, [{ role: 'system', content: 'S' }, { role: 'user', content: 'x' }])
  assert.equal(m.content[0].type, 'text')
  assert.equal((m.content[0] as Anthropic.TextBlock).text, 'Fatto.')
})

test('senza chiave non parte nessuna intestazione di autorizzazione', async () => {
  const viste = fornitoreFinto([() => rispostaOA({ content: 'ok' })])
  await c.crea({ url: 'http://127.0.0.1:11434/v1', modello: 'qwen2.5:14b' }, { model: 'm', max_tokens: 1, messages: [{ role: 'user', content: 'x' }] })
  assert.ok(!('authorization' in (viste[0].init.headers as Record<string, string>)))
})

test('json_schema rifiutato: si riprova con json_object e lo schema scritto nel system', async () => {
  const viste = fornitoreFinto([
    () => new Response(JSON.stringify({ error: { message: "'response_format.type' must be 'json_object' or 'text'" } }), { status: 400 }),
    () => rispostaOA({ content: '{"voci":[]}' })
  ])
  const m = await c.crea(F, {
    model: 'm', max_tokens: 100, system: 'Leggi.',
    output_config: { format: { type: 'json_schema', schema: { type: 'object', properties: { voci: { type: 'array' } } } } },
    messages: [{ role: 'user', content: 'x' }]
  })
  assert.equal(viste.length, 2)
  assert.deepEqual(viste[1].corpo.response_format, { type: 'json_object' })
  const sistema = (viste[1].corpo.messages as { role: string; content: string }[])[0]
  assert.equal(sistema.role, 'system')
  assert.match(sistema.content, /^Leggi\./)
  assert.match(sistema.content, /"voci"/, 'lo schema è finito nelle istruzioni')
  assert.equal((m.content[0] as Anthropic.TextBlock).text, '{"voci":[]}')
})

test('max_completion_tokens sconosciuto: si riprova con max_tokens', async () => {
  const viste = fornitoreFinto([
    () => new Response(JSON.stringify({ error: { message: 'Unrecognized request argument supplied: max_completion_tokens' } }), { status: 400 }),
    () => rispostaOA({ content: 'ok' })
  ])
  await c.crea(F, { model: 'm', max_tokens: 321, messages: [{ role: 'user', content: 'x' }] })
  assert.equal(viste.length, 2)
  assert.equal(viste[1].corpo.max_tokens, 321)
  assert.ok(!('max_completion_tokens' in viste[1].corpo))
})

test('un 400 che non si sa sistemare non gira all’infinito', async () => {
  const viste = fornitoreFinto([() => new Response(JSON.stringify({ error: { message: 'boh' } }), { status: 400 })])
  await assert.rejects(
    c.crea(F, { model: 'm', max_tokens: 1, messages: [{ role: 'user', content: 'x' }] }),
    /Il fornitore ha rifiutato la richiesta/
  )
  assert.equal(viste.length, 1)
})

// — il flusso —

/** Un fornitore che risponde in SSE, a pezzi arbitrari, e che onora l'abort. */
function fornitoreInFlusso(pezzi: string[], chiudi = true): Chiamata[] {
  return fornitoreFinto([(_, ch) => {
    const enc = new TextEncoder()
    const corpo = new ReadableStream<Uint8Array>({
      start(ctrl) {
        for (const p of pezzi) ctrl.enqueue(enc.encode(p))
        if (chiudi) ctrl.close()
        ch.init.signal?.addEventListener('abort', () => {
          try { ctrl.error(new DOMException('interrotto', 'AbortError')) } catch { /* già chiuso */ }
        })
      }
    })
    return new Response(corpo, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }])
}

const evento = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`

test('flusso: il testo arriva a pezzi, anche spezzati a metà riga, e in fondo c’è il messaggio', async () => {
  const eventi =
    evento({ id: 'chatcmpl-9', model: 'm', choices: [{ index: 0, delta: { role: 'assistant', content: 'Ciao' } }] }) +
    ': battito\n\n' +
    evento({ choices: [{ index: 0, delta: { content: ', mondo' } }] }) +
    evento({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) +
    evento({ choices: [], usage: { prompt_tokens: 5, completion_tokens: 2 } }) +
    'data: [DONE]\n\n'
  // si spezza in punti scomodi: dentro un JSON, dentro «data:»
  const taglio = eventi.indexOf('mondo') + 2
  fornitoreInFlusso([eventi.slice(0, 15), eventi.slice(15, taglio), eventi.slice(taglio)])

  const pezzi: string[] = []
  const m = await c.flusso(F, { model: 'm', max_tokens: 10, messages: [{ role: 'user', content: 'x' }] }, d => pezzi.push(d))
  assert.deepEqual(pezzi, ['Ciao', ', mondo'])
  assert.equal(m.id, 'chatcmpl-9')
  assert.deepEqual(m.content, [{ type: 'text', text: 'Ciao, mondo', citations: null }])
  assert.equal(m.stop_reason, 'end_turn')
  assert.equal(m.usage.input_tokens, 5)
  assert.equal(m.usage.output_tokens, 2)
})

test('flusso: gli argomenti di una tool_call si ricompongono dai pezzi', async () => {
  fornitoreInFlusso([
    evento({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call_7', type: 'function', function: { name: 'cerca', arguments: '' } }] } }] }),
    evento({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{"que' } }] } }] }),
    evento({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: 'ry":"Ro' } }] } }] }),
    // il nome ripetuto non si accoda
    evento({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { name: 'cerca', arguments: 'ssi"}' } }] } }] }),
    evento({ choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] }),
    'data: [DONE]\n\n'
  ])
  const m = await c.flusso(F, { model: 'm', max_tokens: 10, messages: [{ role: 'user', content: 'x' }] }, () => {})
  assert.equal(m.stop_reason, 'tool_use')
  assert.deepEqual(m.content, [
    { type: 'tool_use', id: 'call_7', name: 'cerca', input: { query: 'Rossi' }, caller: { type: 'direct' } }
  ])
})

test('flusso: il corpo chiede lo streaming e l’uso in fondo', async () => {
  const viste = fornitoreInFlusso(['data: [DONE]\n\n'])
  await c.flusso(F, { model: 'm', max_tokens: 10, messages: [{ role: 'user', content: 'x' }] }, () => {})
  assert.equal(viste[0].corpo.stream, true)
  assert.deepEqual(viste[0].corpo.stream_options, { include_usage: true })
})

test('flusso: un filo che smette di parlare si taglia con una frase', async () => {
  fornitoreInFlusso([evento({ choices: [{ index: 0, delta: { content: 'Inizio' } }] })], false)
  const pezzi: string[] = []
  await assert.rejects(
    c.flusso(F, { model: 'm', max_tokens: 10, messages: [{ role: 'user', content: 'x' }] }, d => pezzi.push(d), 1000, 40),
    /La risposta si è interrotta a metà/
  )
  assert.deepEqual(pezzi, ['Inizio'], 'quello che era arrivato è arrivato')
})

// — gli errori —

test('gli stati HTTP diventano frasi', () => {
  assert.match(c.erroreDelFornitore(401, '').message, /chiave del fornitore/)
  assert.match(c.erroreDelFornitore(403, '').message, /chiave del fornitore/)
  assert.match(c.erroreDelFornitore(402, '').message, /senza credito/)
  assert.match(c.erroreDelFornitore(429, JSON.stringify({ error: { message: 'You exceeded your current quota', code: 'insufficient_quota' } })).message, /senza credito/)
  assert.match(c.erroreDelFornitore(429, JSON.stringify({ error: { message: 'Rate limit reached' } })).message, /sotto sforzo/)
  assert.match(c.erroreDelFornitore(404, JSON.stringify({ error: { message: 'model "x" not found, try pulling it first' } })).message, /non conosce questo modello/)
  assert.match(c.erroreDelFornitore(404, '<html>Not Found</html>').message, /Controlla l’indirizzo/)
  assert.match(c.erroreDelFornitore(500, '').message, /ha un problema/)
  assert.match(c.erroreDelFornitore(503, '').message, /ha un problema/)
})

test('nessuno in ascolto: si dice di controllare l’indirizzo', async () => {
  c.usaRete((async () => { throw new TypeError('fetch failed') }) as typeof fetch)
  await assert.rejects(
    c.crea(F, { model: 'm', max_tokens: 1, messages: [{ role: 'user', content: 'x' }] }),
    /Non riesco a raggiungere il fornitore/
  )
})

test('troppo tempo per cominciare: si lascia perdere', async () => {
  c.usaRete(((_: unknown, init?: RequestInit) => new Promise<Response>((_r, rifiuta) => {
    init?.signal?.addEventListener('abort', () => rifiuta(new DOMException('interrotto', 'AbortError')))
  })) as typeof fetch)
  await assert.rejects(
    c.crea(F, { model: 'm', max_tokens: 1, messages: [{ role: 'user', content: 'x' }] }, 30),
    /Ci ha messo troppo/
  )
})

test('prova: un no del fornitore torna come frase, e un sì porta il cronometro', async () => {
  fornitoreFinto([() => new Response('{}', { status: 401 })])
  assert.deepEqual(await c.prova(F), { ok: false, errore: 'La chiave del fornitore non è valida.' })
  const viste = fornitoreFinto([() => rispostaOA({ content: 'ok' })])
  const esito = await c.prova(F)
  assert.equal(esito.ok, true)
  // il numero che la scheda mostra: quanto ha messo a dire la prima parola
  assert.ok(esito.ok && Number.isFinite(esito.latenzaMs) && esito.latenzaMs >= 0)
  // quattro token, non uno: uno può uscire dalla cache del server e non
  // misurare niente
  assert.equal(viste[0].corpo.max_completion_tokens, 4)
})

test('i modelli: la lista del fornitore, in ordine, o niente', async () => {
  fornitoreFinto([() => Response.json({ object: 'list', data: [{ id: 'qwen2.5:14b' }, { id: 'llama3.1:8b' }] })])
  assert.deepEqual(await c.modelli({ url: 'http://127.0.0.1:11434/v1' }), ['llama3.1:8b', 'qwen2.5:14b'])
  fornitoreFinto([() => new Response('', { status: 500 })])
  assert.deepEqual(await c.modelli({ url: 'http://127.0.0.1:11434/v1' }), [])
})

// — Ollama, nella sua lingua —
//
// Sulla porta `/v1` Ollama fa finta di essere OpenAI e funziona, ma due cose
// da lì non passano: spegnere il pensiero a voce alta e dire quanta finestra
// allocare. Sono le due che decidono se la prima parola arriva in un secondo
// o in venti, e sono la ragione per cui esiste questa strada.

const OLLAMA: c.Fornitore = { url: 'http://127.0.0.1:11434/v1', modello: 'qwen3.5:9b' }

/** Un pezzo di NDJSON come lo scrive `/api/chat`. */
const pezzoOllama = (o: Record<string, unknown>) => JSON.stringify(o) + '\n'

test('Ollama si riconosce dalla porta e si parla in nativo, senza pensiero e con la finestra detta', async () => {
  c.scordaOllama()
  const viste = fornitoreFinto([() => new Response(
    pezzoOllama({ message: { content: 'Ciao' } }) +
    pezzoOllama({ message: { content: ' Tobia' }, done: true, done_reason: 'stop', prompt_eval_count: 40, eval_count: 3 })
  )])

  let uscito = ''
  const m = await c.flusso(OLLAMA, {
    model: 'qwen3.5:9b', max_tokens: 300,
    system: 'Sei Myynd.',
    messages: [{ role: 'user', content: 'ciao' }]
  }, d => { uscito += d })

  assert.equal(viste.length, 1, 'una chiamata sola: la porta 11434 non si va a chiedere a nessuno')
  assert.equal(viste[0].url, 'http://127.0.0.1:11434/api/chat', 'la porta nativa, non quella compatibile')
  assert.equal(viste[0].corpo.stream, true)
  assert.equal(viste[0].corpo.think, false, 'il monologo prima della risposta è il grosso dell’attesa')
  assert.deepEqual(viste[0].corpo.options, { num_ctx: c.CTX_FISSO, num_predict: 300 })
  assert.deepEqual(viste[0].corpo.messages, [
    { role: 'system', content: 'Sei Myynd.' },
    { role: 'user', content: 'ciao' }
  ])

  assert.equal(uscito, 'Ciao Tobia', 'il testo arriva a pezzi anche di qui')
  assert.deepEqual(m.content, [{ type: 'text', text: 'Ciao Tobia', citations: null }])
  assert.equal(m.stop_reason, 'end_turn')
  assert.equal(m.usage.input_tokens, 40)
  assert.equal(m.usage.output_tokens, 3)
})

test('un fornitore che non è Ollama resta su /chat/completions', async () => {
  c.scordaOllama()
  const viste = fornitoreFinto([() => new Response(
    'data: ' + JSON.stringify({ choices: [{ delta: { content: 'ok' } }] }) + '\n\ndata: [DONE]\n\n',
    { headers: { 'content-type': 'text/event-stream' } }
  )])
  await c.flusso(F, { model: 'm', max_tokens: 10, messages: [{ role: 'user', content: 'x' }] }, () => {})
  assert.equal(viste.length, 1)
  assert.equal(viste[0].url, 'https://esempio.test/v1/chat/completions')
  assert.equal(viste[0].corpo.think, undefined)
})

test('una porta di casa che non è la 11434: si bussa a /api/tags, e la risposta vale dieci minuti', async () => {
  c.scordaOllama()
  const fuoriPorta: c.Fornitore = { url: 'http://127.0.0.1:12345/v1', modello: 'qwen3.5:9b' }
  const viste = fornitoreFinto([
    () => Response.json({ models: [{ name: 'qwen3.5:9b' }] }),
    () => new Response(pezzoOllama({ message: { content: 'ok' }, done: true, done_reason: 'stop' }))
  ])
  await c.flusso(fuoriPorta, { model: 'q', max_tokens: 10, messages: [{ role: 'user', content: 'x' }] }, () => {})
  assert.deepEqual(viste.map(v => v.url), [
    'http://127.0.0.1:12345/api/tags',
    'http://127.0.0.1:12345/api/chat'
  ])
  // la seconda domanda non bussa più: il ricordo dura dieci minuti
  await c.flusso(fuoriPorta, { model: 'q', max_tokens: 10, messages: [{ role: 'user', content: 'y' }] }, () => {})
  assert.equal(viste.filter(v => v.url.endsWith('/api/tags')).length, 1)
})

test('un server di casa che dice 200 a tutto non è Ollama', async () => {
  c.scordaOllama()
  const lmStudio: c.Fornitore = { url: 'http://127.0.0.1:1234/v1', modello: 'x' }
  const viste = fornitoreFinto([
    () => Response.json({ va: 'bene' }),                           // niente `models`: non è lui
    () => new Response('data: ' + JSON.stringify({ choices: [{ delta: { content: 'ok' } }] }) + '\n\ndata: [DONE]\n\n')
  ])
  await c.flusso(lmStudio, { model: 'x', max_tokens: 10, messages: [{ role: 'user', content: 'x' }] }, () => {})
  assert.equal(viste[1].url, 'http://127.0.0.1:1234/v1/chat/completions')
})

test('di là gli attrezzi portano gli argomenti come oggetti, e tornano come tool_use', async () => {
  c.scordaOllama()
  const viste = fornitoreFinto([() => new Response(
    pezzoOllama({ message: { content: '', tool_calls: [{ function: { name: 'cerca', arguments: { query: 'Rossi' } } }] } }) +
    pezzoOllama({ done: true, done_reason: 'stop' })
  )])
  const m = await c.flusso(OLLAMA, {
    model: 'q', max_tokens: 100,
    messages: [
      { role: 'user', content: 'cerca Rossi' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'call_1', name: 'cerca', input: { query: 'prima' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_1', content: 'niente' }] }
    ],
    tools: [{ name: 'cerca', description: 'cerca', input_schema: { type: 'object', properties: { query: { type: 'string' } } } }]
  }, () => {})

  const righe = viste[0].corpo.messages as Record<string, unknown>[]
  assert.deepEqual(righe[1], {
    role: 'assistant', content: '',
    tool_calls: [{ function: { name: 'cerca', arguments: { query: 'prima' } } }]
  }, 'gli argomenti come oggetto: di là non è una stringa JSON')
  assert.deepEqual(righe[2], { role: 'tool', content: 'niente' })
  assert.ok(Array.isArray(viste[0].corpo.tools), 'gli attrezzi passano')

  assert.equal(m.stop_reason, 'tool_use')
  const chiamata = m.content.find(b => b.type === 'tool_use')
  assert.equal(chiamata?.type === 'tool_use' && chiamata.name, 'cerca')
  assert.deepEqual(chiamata?.type === 'tool_use' ? chiamata.input : null, { query: 'Rossi' })
})

test('gli errori di Ollama sono le stesse frasi', async () => {
  c.scordaOllama()
  fornitoreFinto([() => Response.json({ error: 'model "boh" not found' }, { status: 404 })])
  await assert.rejects(
    c.flusso(OLLAMA, { model: 'boh', max_tokens: 10, messages: [{ role: 'user', content: 'x' }] }, () => {}),
    /non conosce questo modello/
  )
  c.scordaOllama()
  fornitoreFinto([() => { throw new TypeError('fetch failed') }])
  await assert.rejects(
    c.flusso(OLLAMA, { model: 'q', max_tokens: 10, messages: [{ role: 'user', content: 'x' }] }, () => {}),
    /Non riesco a raggiungere il fornitore/
  )
})

test('la finestra di Ollama è una sola, e un prompt che non ci sta si accorcia da solo', async () => {
  const c = await import('./compatibile.ts')
  // sempre la stessa: cambiare num_ctx fra una richiesta e l'altra ricarica il modello
  assert.equal(c.finestra([{ role: 'user', content: 'ciao' }], 300), c.CTX_FISSO)
  assert.equal(c.finestra([{ role: 'user', content: 'x'.repeat(60_000) }], 4000), c.CTX_FISSO)
  // un materiale enorme si taglia in mezzo, con il segno che manca un pezzo
  const righe = c.entroLaFinestra([{ role: 'system', content: 'Sei Myynd.' }, { role: 'user', content: 'a'.repeat(120_000) }], 2000)
  const corpo = righe[1].content as string
  assert.ok(corpo.includes('[…]'), 'manca il segno del taglio')
  assert.ok(corpo.length < 60_000, 'non si è accorciato abbastanza')
  // uno piccolo non si tocca
  const piccole = c.entroLaFinestra([{ role: 'user', content: 'ciao' }], 300)
  assert.equal(piccole[0].content, 'ciao')
})

test('risponde: una GET sola, e un fornitore spento è un no', async () => {
  c.scordaOllama()
  const viste = fornitoreFinto([() => Response.json({ models: [] })])
  assert.equal(await c.risponde(OLLAMA), true)
  assert.equal(viste[0].url, 'http://127.0.0.1:11434/api/tags')
  c.scordaOllama()
  fornitoreFinto([() => { throw new TypeError('fetch failed') }])
  assert.equal(await c.risponde(OLLAMA), false)
})

// — l'indirizzo —

test('l’indirizzo: https ovunque, http solo in casa, e su un server niente rete interna', () => {
  assert.equal(c.indirizzoAmmesso('https://api.openai.com/v1', false), null)
  assert.equal(c.indirizzoAmmesso('https://api.openai.com/v1', true), null)
  assert.equal(c.indirizzoAmmesso('http://127.0.0.1:11434/v1', false), null)
  assert.equal(c.indirizzoAmmesso('http://localhost:1234/v1', false), null)
  assert.equal(c.indirizzoAmmesso('http://192.168.1.20:11434/v1', false), null)
  assert.match(c.indirizzoAmmesso('http://api.esempio.com/v1', false) ?? '', /si resta in casa/)
  assert.match(c.indirizzoAmmesso('http://127.0.0.1:11434/v1', true) ?? '', /Su un server/)
  assert.match(c.indirizzoAmmesso('https://10.0.0.5/v1', true) ?? '', /Su un server/)
  assert.match(c.indirizzoAmmesso('ftp://x', false) ?? '', /non è valido/)
  assert.match(c.indirizzoAmmesso('non un indirizzo', false) ?? '', /non è valido/)
})

test('la base: via le barre in coda e il pezzo finale incollato per intero', () => {
  assert.equal(c.base('https://api.openai.com/v1/'), 'https://api.openai.com/v1')
  assert.equal(c.base('https://api.openai.com/v1/chat/completions'), 'https://api.openai.com/v1')
  assert.equal(c.base('  http://127.0.0.1:11434/v1  '), 'http://127.0.0.1:11434/v1')
})
