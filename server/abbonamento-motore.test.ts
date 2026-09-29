// L'account Claude come motore del lavoro affidato (F8).
//
// `abbonamento.motore()` fa parlare Claude Code come l'API: gli attrezzi detti
// come dati, la risposta `{ text, calls }` che torna un `tool_use`. Qui il
// processo non parte mai: `perProva({ lancia })` riceve gli argomenti e la
// domanda e restituisce la busta, e per l'arresto un `spawn` finto che non
// finisce mai. Si guardano il recinto (nessun attrezzo nativo), la
// traduzione delle chiamate, lo schema che non va con `tool_choice: none`,
// il conto nel registro e il tetto di oggi.
//
//   node --test server/abbonamento-motore.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Anthropic from '@anthropic-ai/sdk'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-abbonamento-motore-'))
process.env.MYYND_DATI = join(CASA, 'dati')
delete process.env.ANTHROPIC_API_KEY

const cfg = await import('./config.ts')
const store = await import('./store.ts')
const abbonamento = await import('./abbonamento.ts')
const bandiere = await import('./bandiere-cli.ts')
const { delTetto } = await import('./tetto.ts')

// un `claude` che sa dire le sue opzioni: così `--tools ''` entra negli argomenti
const EXE = join(CASA, 'claude')
writeFileSync(EXE, '#!/bin/sh\necho "  --tools <tools>  --effort <level>  --no-session-persistence"\n')
chmodSync(EXE, 0o755)

type Lancio = { args: string[]; domanda: string; sistema: string }
let lanci: Lancio[] = []
/** Le risposte in ordine: una stringa è il `result` della busta. */
let risposte: string[] = []
const busta = (result: string) => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result, usage: { input_tokens: 120, cache_creation_input_tokens: 30, cache_read_input_tokens: 400, output_tokens: 25 }, total_cost_usd: 0.004 })

before(async () => {
  cfg.scrivi({ lingua: 'en', claudeCon: 'abbonamento', tetto: 0 })
  await bandiere.sonda(EXE)
  abbonamento.perProva({
    installato: () => EXE,
    lancia: async (args, domanda) => {
      const i = args.indexOf('--system-prompt')
      lanci.push({ args, domanda, sistema: i >= 0 ? args[i + 1] : '' })
      return busta(risposte.shift() ?? 'Done.')
    }
  })
})
after(() => {
  abbonamento.perProva(null)
  bandiere.perProva()
  store.chiudiIndici()
  rmSync(CASA, { recursive: true, force: true })
})

const CERCA_WEB: Anthropic.Tool = { name: 'cerca_web', description: 'Search the web.', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } }
const richiesta = (sopra: Partial<Anthropic.MessageCreateParamsNonStreaming> = {}): Anthropic.MessageCreateParamsNonStreaming => ({
  model: 'claude-sonnet-5', max_tokens: 16000, system: 'Svolgi il compito.',
  messages: [{ role: 'user', content: 'Find the H-Farm address.' }], tools: [CERCA_WEB], ...sopra
})

test('il recinto è quello di sempre: --tools vuoto, gli attrezzi nativi negati, niente MCP', async () => {
  lanci = []; risposte = [JSON.stringify({ text: 'Here.', calls: [] })]
  await abbonamento.motore().crea(richiesta())
  const a = lanci[0].args
  const t = a.indexOf('--tools')
  assert.ok(t >= 0 && a[t + 1] === '', '`--tools \'\'` quando la versione lo conosce')
  const d = a.indexOf('--disallowed-tools')
  assert.ok(d >= 0)
  for (const n of ['Read', 'Write', 'Edit', 'Bash', 'WebFetch', 'WebSearch', 'Task']) assert.ok(a.slice(d).includes(n), `«${n}» non è negato`)
  assert.ok(a.includes('--strict-mcp-config') && a.includes('--restricted'))
  assert.equal(a[a.indexOf('--setting-sources') + 1], 'user')
  assert.ok(!a.includes('--allowedTools') && !a.includes('--allowed-tools') && !a.includes('--mcp-config'))
  // la conversazione entra dallo stdin, gli attrezzi come dati nel prompt di sistema
  assert.match(lanci[0].domanda, /Find the H-Farm address/)
  assert.match(lanci[0].sistema, /cerca_web/)
  assert.match(lanci[0].sistema, /Do not use native Claude Code tools/)
})

test('una chiamata detta come dati torna un tool_use; un attrezzo che non c’è si rifiuta', async () => {
  lanci = []; risposte = [JSON.stringify({ text: '', calls: [{ name: 'cerca_web', arguments: '{"query":"x"}' }] })]
  const m = await abbonamento.motore().crea(richiesta())
  assert.equal(m.stop_reason, 'tool_use')
  const uso = m.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
  assert.ok(uso)
  assert.equal(uso.name, 'cerca_web')
  assert.deepEqual(uso.input, { query: 'x' })

  lanci = []; risposte = [JSON.stringify({ text: '', calls: [{ name: 'rm_rf', arguments: '{}' }] }), JSON.stringify({ text: '', calls: [{ name: 'rm_rf', arguments: '{}' }] })]
  await assert.rejects(abbonamento.motore().crea(richiesta()), /unavailable action/)
  assert.equal(lanci.length, 2, 'una sola seconda domanda, poi l’errore')
})

test('una risposta di sola prosa è la risposta finale; un JSON rotto si richiede una volta, dicendo perché', async () => {
  lanci = []; risposte = ['Done: H-Farm is in Roncade [1].']
  const prosa = await abbonamento.motore().crea(richiesta())
  assert.equal(lanci.length, 1)
  assert.deepEqual(prosa.content.map(b => b.type === 'text' ? b.text : b.type), ['Done: H-Farm is in Roncade [1].'])

  lanci = []; risposte = ['{"text":"x","calls":[{"name":', '```json\n{"text":"The address is Roncade.","calls":[]}\n```']
  const m = await abbonamento.motore().crea(richiesta())
  assert.equal(lanci.length, 2)
  assert.match(lanci[1].domanda, /non era un oggetto JSON valido/)
  assert.equal(m.stop_reason, 'end_turn')
  assert.deepEqual(m.content.map(b => b.type === 'text' ? b.text : b.type), ['The address is Roncade.'])
})

test('con tool_choice «none» non si manda nessuno schema, e il testo torna com’è', async () => {
  lanci = []; risposte = ['Final text for her.']
  const m = await abbonamento.motore().crea(richiesta({ tool_choice: { type: 'none' } }))
  assert.doesNotMatch(lanci[0].sistema, /LA FORMA DELLA RISPOSTA/)
  assert.doesNotMatch(lanci[0].sistema, /calls \(requested Myynd functions\)/)
  assert.deepEqual(m.content.map(b => b.type === 'text' ? b.text : b.type), ['Final text for her.'])
})

test('l’uso finisce nel registro come «Claude account», con i token veri, e sul messaggio', async () => {
  const prima = (store.default.prepare('SELECT COUNT(*) AS n FROM uso').get() as { n: number }).n
  lanci = []; risposte = [JSON.stringify({ text: 'Ok.', calls: [] })]
  const m = await abbonamento.motore().crea(richiesta())
  const righe = store.default.prepare('SELECT lavoro, motore, entrata, cache, uscita FROM uso ORDER BY rowid').all() as { lavoro: string; motore: string; entrata: number; cache: number; uscita: number }[]
  assert.equal(righe.length, prima + 1)
  assert.deepEqual({ ...righe.at(-1) }, { lavoro: 'bozza', motore: 'Claude account', entrata: 150, cache: 400, uscita: 25 })
  assert.equal(m.usage.input_tokens, 120)
  assert.equal(m.usage.output_tokens, 25)
})

test('il tetto di oggi raggiunto è un errore del tetto, e Claude Code non parte', async () => {
  cfg.scrivi({ ...cfg.leggi(), tetto: 10 })
  lanci = []; risposte = ['{}']
  try {
    await assert.rejects(abbonamento.motore().crea(richiesta()), e => delTetto(e))
    assert.equal(lanci.length, 0)
  } finally { cfg.scrivi({ ...cfg.leggi(), tetto: 0 }) }
})

test('fermato, il processo muore con il suo gruppo e chi aspettava lo sa subito', async () => {
  let figlio: ChildProcess | null = null
  abbonamento.perProva({
    installato: () => EXE,
    spawn: ((_exe: string, _a: string[], o: Record<string, unknown>) => {
      figlio = spawn(process.execPath, ['-e', 'process.stdin.resume(); setInterval(() => {}, 1000)'], o as never)
      return figlio
    }) as never
  })
  try {
    const c = new AbortController()
    const giro = abbonamento.motore().flusso(richiesta() as Anthropic.MessageStreamParams, () => {}, 60_000, c.signal)
    await new Promise(r => setTimeout(r, 300))
    assert.ok(figlio, 'il processo è partito')
    const uscito = new Promise<NodeJS.Signals | null>(r => (figlio as unknown as ChildProcess).once('exit', (_c, s) => r(s)))
    const t0 = Date.now()
    c.abort()
    await assert.rejects(giro)
    assert.ok(Date.now() - t0 < 1000)
    assert.equal(await uscito, 'SIGTERM')
  } finally {
    abbonamento.perProva({ installato: () => EXE, lancia: async (args, domanda) => { lanci.push({ args, domanda, sistema: '' }); return busta(risposte.shift() ?? 'Done.') } })
  }
})
