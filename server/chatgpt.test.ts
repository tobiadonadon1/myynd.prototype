import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const dir = mkdtempSync(join(tmpdir(), 'myynd-chatgpt-test-'))
process.env.MYYND_DATI = dir
const g = await import('./chatgpt.ts')
process.once('exit', () => rmSync(dir, { recursive: true, force: true }))
const base = { model: 'ignored', max_tokens: 200, messages: [{ role: 'user' as const, content: 'What is current?' }] }
const p = { ...base, tools: [{ name: 'read_project', description: 'Read one saved project.', input_schema: { type: 'object' as const, properties: { id: { type: 'string' } }, required: ['id'] } }] }

test('subscription bridge disables inherited MCPs, native execution and API billing', () => {
  const c = g.recinto({ mcp_servers: { mail: { token: 'private' }, 'file.system': {} } })
  assert.equal(c.mcp_servers.mail.enabled, false)
  assert.equal(c.mcp_servers['file.system'].enabled, false)
  assert.equal(c['features.shell_tool'], false)
  assert.equal(c['features.apps'], false)
  assert.equal(c['features.hooks'], false)
  assert.equal(c['features.multi_agent'], false)
  assert.equal(c.forced_login_method, 'chatgpt')
  assert.equal(c.sandbox_mode, 'read-only')
  assert.equal(c.project_doc_max_bytes, 0)
  assert.equal(c.web_search, 'disabled')
  assert.ok(!JSON.stringify(c).includes('private'))
})
test('subscription process excludes API keys and private Myynd environment', () => {
  process.env.OPENAI_API_KEY = 'test-secret-openai'
  process.env.ANTHROPIC_API_KEY = 'test-secret-claude'
  process.env.MYYND_AUTH_TOKEN = 'test-secret-myynd'
  const e = g.ambiente()
  assert.equal(e.OPENAI_API_KEY, undefined)
  assert.equal(e.ANTHROPIC_API_KEY, undefined)
  assert.equal(e.MYYND_AUTH_TOKEN, undefined)
  delete process.env.OPENAI_API_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.MYYND_AUTH_TOKEN
})
test('tool calls remain data and round-trip through Myynd results', () => {
  const r = g.converti(JSON.stringify({ text: '', calls: [{ name: 'read_project', arguments: '{"id":"actual-project"}' }] }), p, 'account-default')
  assert.equal(r.stop_reason, 'tool_use')
  const tool = r.content[0]
  assert.equal(tool.type, 'tool_use')
  if (tool.type !== 'tool_use') return
  assert.deepEqual(tool.input, { id: 'actual-project' })
  const next = g.prepara({ ...p, messages: [...base.messages, { role: 'assistant', content: r.content }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: tool.id, content: 'Saved goal: publish the proposal.' }] }] })
  assert.ok(next.input.includes('Saved goal: publish the proposal.'))
  assert.ok(next.system.includes('Never claim an action or memory update succeeded'))
})
test('unavailable, malformed and missing required actions fail without claiming success', () => {
  assert.throws(() => g.converti('{"text":"Done","calls":[{"name":"send_money","arguments":"{}"}]}', p, 'test'))
  assert.throws(() => g.converti('{"text":"Done","calls":[{"name":"read_project","arguments":"[]"}]}', p, 'test'))
  assert.throws(() => g.converti('{"text":"Done","calls":[]}', { ...p, tool_choice: { type: 'tool', name: 'read_project' } }, 'test'))
  assert.throws(() => g.converti('not JSON', p, 'test'))
})
test('plain and structured responses preserve content and usage', () => {
  const r = g.converti('Your saved goal is to publish the proposal.', base, 'test', { inputTokens: 200, cachedInputTokens: 50, outputTokens: 15 })
  assert.equal(r.stop_reason, 'end_turn')
  assert.equal(r.usage.input_tokens, 150)
  assert.equal(r.usage.cache_read_input_tokens, 50)
  const schema = { type: 'object', properties: { goal: { type: 'string' } }, required: ['goal'] }
  assert.deepEqual(g.prepara({ ...base, output_config: { format: { schema } } }).schema, schema)
  assert.equal(g.prepara({ ...p, tool_choice: { type: 'none' } }).tools.length, 0)
})

test('selected but disabled subscription cannot fall back to a retained API key', async () => {
  const cfg = await import('./config.ts')
  const mod = await import('./modello.ts')
  cfg.aggiorna({ motore: 'chatgpt', chatgpt: { attivo: false }, claude: { apiKey: 'fake-key-never-used' } })
  assert.equal(g.scelto(), true)
  assert.equal(g.pronto(), false)
  assert.equal(mod.collegato(), false)
  assert.equal(mod.motore()?.tipo, 'chatgpt')
  await assert.rejects(() => mod.motore()!.crea(base), /Turn on ChatGPT/)
})

test('a hosted profile keeps unavailable ChatGPT selection instead of billing the API', () => {
  const code = `const cfg=await import('./server/config.ts'); const mod=await import('./server/modello.ts'); cfg.aggiorna({motore:'chatgpt',chatgpt:{attivo:true},claude:{apiKey:'fake-key-never-used'}}); console.log(JSON.stringify({connected:mod.collegato(),kind:mod.motore()?.tipo}));`
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, MYYND_DATI: join(dir, 'hosted'), MYYND_PUBBLICO: 'https://myynd.test' } })
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(JSON.parse(r.stdout.trim()), { connected: false, kind: 'chatgpt' })
})

test('cancellation during setup rejects immediately and cleans up a late thread', async () => {
  const controller = new AbortController()
  let finish!: (value: string) => void
  let cleaned = ''
  const pending = new Promise<string>(resolve => { finish = resolve })
  const waiting = g.attendi(pending, controller.signal, value => { cleaned = value })
  controller.abort()
  await assert.rejects(waiting, { name: 'AbortError' })
  finish('late-ephemeral-thread')
  await pending; await Promise.resolve()
  assert.equal(cleaned, 'late-ephemeral-thread')
})

test('fast chat uses an available model while delegated work retains the account default', () => {
  const catalog = [{ model: 'gpt-5.6-sol', isDefault: true }, { model: 'gpt-5.6-luna', isDefault: false }]
  assert.equal(g.scegliModello(catalog, true), 'gpt-5.6-luna')
  assert.equal(g.scegliModello(catalog, false), 'gpt-5.6-sol')
  assert.equal(g.scegliModello(catalog.slice(0, 1), true), 'gpt-5.6-sol')
  assert.equal(g.scegliModello([], true), undefined)
})
