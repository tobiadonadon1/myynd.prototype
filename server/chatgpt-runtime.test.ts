import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'myynd-chatgpt-runtime-test-'))
process.env.MYYND_DATI = dir
const runtime = await import('./chatgpt-runtime.ts')
const chi = await import('./chi.ts')
process.once('exit', () => rmSync(dir, { recursive: true, force: true }))

test('ChatGPT auth is stable across restarts and private to each Myynd account', () => {
  const alice = chi.dentro('runtime-alice', () => runtime.ambienteChatGPT())
  const bob = chi.dentro('runtime-bob', () => runtime.ambienteChatGPT())
  assert.notEqual(alice.chiave, bob.chiave)
  assert.notEqual(alice.env.CODEX_HOME, bob.env.CODEX_HOME)
  assert.ok(alice.env.CODEX_HOME!.startsWith(join(dir, 'utenti', 'runtime-alice')))
  assert.equal(statSync(alice.env.CODEX_HOME!).mode & 0o777, 0o700)
  assert.equal(statSync(alice.cwd).mode & 0o777, 0o700)
  const fixture = join(alice.env.CODEX_HOME!, 'auth.json')
  writeFileSync(fixture, 'test-only persisted authentication marker', { mode: 0o600 })
  const restarted = chi.dentro('runtime-alice', () => runtime.ambienteChatGPT())
  assert.equal(restarted.env.CODEX_HOME, alice.env.CODEX_HOME)
  assert.equal(readFileSync(fixture, 'utf8'), 'test-only persisted authentication marker')
  assert.deepEqual(restarted.args, ['-c', 'cli_auth_credentials_store="file"'])
})

test('child environment preserves system home without inheriting credentials or Codex configuration', () => {
  const parentHome = process.env.HOME
  const parentCodex = process.env.CODEX_HOME
  const parentKey = process.env.OPENAI_API_KEY
  const parentEndpoint = process.env.OPENAI_BASE_URL
  process.env.OPENAI_API_KEY = 'fixture-not-a-credential'
  process.env.OPENAI_BASE_URL = 'https://untrusted.test'
  const e = runtime.ambienteChatGPT().env
  assert.equal(e.HOME, parentHome)
  assert.notEqual(e.CODEX_HOME, parentCodex)
  assert.equal(process.env.CODEX_HOME, parentCodex)
  assert.equal(e.OPENAI_API_KEY, undefined)
  assert.equal(e.OPENAI_BASE_URL, undefined)
  assert.equal(e.MYYND_DATI, undefined)
  assert.deepEqual(Object.keys(e).filter(k => k.startsWith('CODEX_')), ['CODEX_HOME'])
  if (parentKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = parentKey
  if (parentEndpoint === undefined) delete process.env.OPENAI_BASE_URL; else process.env.OPENAI_BASE_URL = parentEndpoint
})

test('an account directory cannot redirect authentication through a symlink', () => {
  const base = join(dir, 'utenti', 'runtime-symlink')
  mkdirSync(base, { recursive: true })
  symlinkSync(dir, join(base, 'chatgpt'), 'dir')
  assert.throws(() => chi.dentro('runtime-symlink', () => runtime.ambienteChatGPT()), /folder is unavailable/)
})

test('runtime selection rejects absent, mismatched and symlinked executable bundles', () => {
  const bundle = join(dir, 'bundle')
  mkdirSync(join(bundle, 'bin'), { recursive: true })
  assert.equal(runtime.leggiRuntimeChatGPT(bundle, true), null)
  const meta = { version: runtime.VERSIONE_CHATGPT, platform: process.platform, arch: process.arch }
  writeFileSync(join(bundle, 'runtime.json'), JSON.stringify(meta))
  const binary = join(bundle, 'bin', process.platform === 'win32' ? 'codex.exe' : 'codex')
  writeFileSync(binary, 'test binary')
  assert.deepEqual(runtime.leggiRuntimeChatGPT(bundle, true), { binario: binary, versione: runtime.VERSIONE_CHATGPT, integrato: true })
  writeFileSync(join(bundle, 'runtime.json'), JSON.stringify({ ...meta, arch: 'wrong' }))
  assert.equal(runtime.leggiRuntimeChatGPT(bundle, true), null)
  writeFileSync(join(bundle, 'runtime.json'), JSON.stringify(meta))
  rmSync(binary); symlinkSync(join(bundle, 'runtime.json'), binary)
  assert.equal(runtime.leggiRuntimeChatGPT(bundle, true), null)
})
