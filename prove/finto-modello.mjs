// Un modello finto, che parla come OpenAI: per le prove, mai per davvero.
//
// Risponde a POST /v1/chat/completions, intero o in streaming (SSE), con
// risposte scritte in un copione JSON e scelte con un'espressione regolare sul
// prompt. Ogni richiesta finisce in un registro JSONL, così una prova può
// guardare cosa è stato chiesto al modello (le regole dei prompt, la lingua,
// l'assenza di trattini) senza spendere un token.
//
//   FINTO_PORTA=18701 FINTO_COPIONE=prove/copioni/base.json FINTO_REGISTRO=/tmp/x.jsonl \
//     node prove/finto-modello.mjs
//
// Il copione:
//   {
//     "modello": "finto",
//     "risposte": [
//       { "se": "regex", "in": "system" | "utente" | "tutto", "testo": "…" },
//       { "se": "regex", "json": { … }, "attesa": 1500 }
//       { "se": "regex", "chiama": "agenda_leggi" }   // una chiamata a quello strumento (P6), se offerto e non già fatto
//     ],
//     "predefinita": "testo quando niente combacia",
//     "predefinitaJSON": { … }        // quando la richiesta vuole uno schema; senza,
//                                     // una risposta vuota ma valida per quello schema
//   }
// La prima regola che combacia vince. `in` manca = "tutto". `attesa` sono
// millisecondi prima di rispondere (per provare le attese e i lucchetti).
//
// Per collegarci un conto seminato: motore «compatibile», con
//   compatibile: { url: 'http://127.0.0.1:<porta>/v1/', chiave: 'sk-finta', modello: 'finto' }
// (lo fa già prove/semina.ts con l'opzione --modello).
//
// /api/tags risponde 404 apposta: Myynd bussa lì per capire se è Ollama, e
// questo non deve sembrarlo.

import { createServer } from 'node:http'
import { appendFileSync, readFileSync } from 'node:fs'

const PORTA = Number(process.env.FINTO_PORTA || process.argv[2] || 0)
const REGISTRO = process.env.FINTO_REGISTRO || ''
const COPIONE = process.env.FINTO_COPIONE || ''

/** Il copione si rilegge a ogni richiesta: si può cambiare mentre la prova gira. */
function copione() {
  if (!COPIONE) return { risposte: [], predefinita: 'Done.', predefinitaJSON: {} }
  try { return JSON.parse(readFileSync(COPIONE, 'utf8')) } catch (e) {
    console.error('finto · copione illeggibile:', e.message)
    return { risposte: [], predefinita: 'Done.', predefinitaJSON: {} }
  }
}

/** Il testo di un contenuto OpenAI: stringa, o elenco di parti. */
function testoDi(c) {
  if (typeof c === 'string') return c
  if (Array.isArray(c)) return c.map(p => typeof p === 'string' ? p : (p?.text ?? '')).join('')
  return ''
}

/**
 * Una risposta vuota ma valida per uno schema JSON: elenchi vuoti, testi vuoti,
 * zeri, il primo valore di un enum. Serve ai lavori di fondo che chiedono una
 * forma precisa e a cui il copione non dice niente: tornano «niente», non un
 * errore di forma.
 */
function dalloSchema(s) {
  if (!s || typeof s !== 'object') return null
  if (Array.isArray(s.enum) && s.enum.length) return s.enum[0]
  if ('const' in s) return s.const
  const alt = s.anyOf ?? s.oneOf
  if (Array.isArray(alt) && alt.length) return dalloSchema(alt[0])
  const tipo = Array.isArray(s.type) ? (s.type.includes('null') ? 'null' : s.type[0]) : s.type
  switch (tipo) {
    case 'object': {
      const o = {}
      for (const [k, v] of Object.entries(s.properties ?? {})) o[k] = dalloSchema(v)
      return o
    }
    case 'array': return []
    case 'string': return ''
    case 'number': case 'integer': return 0
    case 'boolean': return false
    case 'null': return null
    default: return s.properties ? dalloSchema({ ...s, type: 'object' }) : null
  }
}

function scegli(corpo) {
  const c = copione()
  const messaggi = Array.isArray(corpo.messages) ? corpo.messages : []
  const system = messaggi.filter(m => m.role === 'system' || m.role === 'developer').map(m => testoDi(m.content)).join('\n\n')
  const utente = [...messaggi].reverse().find(m => m.role === 'user')
  const tuttoIlTesto = messaggi.map(m => testoDi(m.content)).join('\n\n')
  const vuoleJSON = !!corpo.response_format && corpo.response_format.type !== 'text'
  const dove = { system, utente: testoDi(utente?.content), tutto: tuttoIlTesto }
  const regole = Array.isArray(c.risposte) ? c.risposte : []
  for (let i = 0; i < regole.length; i++) {
    const r = regole[i]
    let re
    try { re = new RegExp(r.se, 'i') } catch { continue }
    if (!re.test(dove[r.in || 'tutto'] ?? '')) continue
    // P6: `chiama` risponde con una chiamata a quello strumento, se la richiesta lo offre e non l'ha già chiamato
    if (r.chiama) {
      const offerto = Array.isArray(corpo.tools) && corpo.tools.some(t => t?.function?.name === r.chiama)
      const giaFatto = messaggi.some(m => m.role === 'tool')
      if (!offerto || giaFatto) continue
      return { regola: i, testo: '', chiama: String(r.chiama), attesa: Number(r.attesa || 0), system, utente: dove.utente }
    }
    const testo = r.json !== undefined ? JSON.stringify(r.json) : String(r.testo ?? '')
    return { regola: i, testo, attesa: Number(r.attesa || 0), system, utente: dove.utente }
  }
  const schema = corpo.response_format?.json_schema?.schema
  const testo = vuoleJSON
    ? JSON.stringify(c.predefinitaJSON ?? dalloSchema(schema) ?? {})
    : String(c.predefinita ?? 'Done.')
  return { regola: null, testo, attesa: 0, system, utente: dove.utente }
}

function registra(voce) {
  if (!REGISTRO) return
  try { appendFileSync(REGISTRO, JSON.stringify(voce) + '\n') } catch { /* il registro è un aiuto */ }
}

const token = t => Math.max(1, Math.ceil(t.length / 4))

function leggiCorpo(req) {
  return new Promise(ok => {
    let s = ''
    req.on('data', d => { s += d })
    req.on('end', () => { try { ok(JSON.parse(s || '{}')) } catch { ok({}) } })
  })
}

const server = createServer(async (req, res) => {
  const percorso = (req.url || '').split('?')[0]
  if (req.method === 'GET' && /\/models$/.test(percorso)) {
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ object: 'list', data: [{ id: copione().modello || 'finto', object: 'model' }] }))
  }
  if (req.method !== 'POST' || !/\/chat\/completions$/.test(percorso)) {
    res.writeHead(404, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ error: { message: 'not found' } }))
  }
  const corpo = await leggiCorpo(req)
  const s = scegli(corpo)
  const modello = corpo.model || copione().modello || 'finto'
  const entrata = token(s.system + s.utente)
  const uscita = token(s.testo)
  registra({
    quando: new Date().toISOString(), modello, stream: !!corpo.stream, regola: s.regola,
    formato: corpo.response_format?.type ?? null, attrezzi: Array.isArray(corpo.tools) ? corpo.tools.length : 0,
    system: s.system, utente: s.utente, risposta: s.testo
  })
  if (s.attesa > 0) await new Promise(r => setTimeout(r, s.attesa))
  const id = 'finto-' + Date.now().toString(36)
  const usage = { prompt_tokens: entrata, completion_tokens: uscita, total_tokens: entrata + uscita }

  const chiamata = s.chiama ? [{ index: 0, id: 'call-' + Date.now().toString(36), type: 'function', function: { name: s.chiama, arguments: '{}' } }] : null
  if (chiamata && !corpo.stream) {
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ id, object: 'chat.completion', model: modello, choices: [{ index: 0, message: { role: 'assistant', content: null, tool_calls: chiamata }, finish_reason: 'tool_calls' }], usage }))
  }
  if (chiamata) {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
    const manda = o => res.write(`data: ${JSON.stringify(o)}\n\n`)
    manda({ id, object: 'chat.completion.chunk', model: modello, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: chiamata } }] })
    manda({ id, object: 'chat.completion.chunk', model: modello, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage })
    res.write('data: [DONE]\n\n')
    return res.end()
  }
  if (!corpo.stream) {
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({
      id, object: 'chat.completion', model: modello,
      choices: [{ index: 0, message: { role: 'assistant', content: s.testo }, finish_reason: 'stop' }], usage
    }))
  }
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
  const manda = o => res.write(`data: ${JSON.stringify(o)}\n\n`)
  manda({ id, object: 'chat.completion.chunk', model: modello, choices: [{ index: 0, delta: { role: 'assistant', content: '' } }] })
  // a pezzi di venti caratteri, con un respiro: la chat deve vedere il testo che arriva
  for (let i = 0; i < s.testo.length; i += 20) {
    manda({ id, object: 'chat.completion.chunk', model: modello, choices: [{ index: 0, delta: { content: s.testo.slice(i, i + 20) } }] })
    await new Promise(r => setTimeout(r, 15))
  }
  manda({ id, object: 'chat.completion.chunk', model: modello, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage })
  res.write('data: [DONE]\n\n')
  res.end()
})

server.on('error', e => { console.error('finto · non parto:', e.message); process.exit(1) })
server.listen(PORTA, '127.0.0.1', () => {
  console.log(`finto su ${server.address().port}`)
})
for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => server.close(() => process.exit(0)))
