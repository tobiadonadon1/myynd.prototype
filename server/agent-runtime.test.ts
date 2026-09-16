import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyHermesPatch, detectRuntime, hermesArguments, hermesDefaults, patchContext, runHermesPatch, runRuntimeProcess } from './agent-runtime.ts'
import { executeInCopy } from './esecuzione-isolata.ts'

async function fixture(fn: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'myynd-agent-runtime-'))
  try { await fn(root) } finally { await rm(root, { recursive: true, force: true }) }
}

test('Hermes argv uses tool-free safe mode without shell interpolation or resume', () => {
  const args = hermesArguments('/tmp/query;echo.txt', '/tmp/project', { model: 'model', provider: 'provider' })
  assert.equal(args[args.indexOf('--query-file') + 1], '/tmp/query;echo.txt')
  assert.equal(args[args.indexOf('--toolsets') + 1], 'none')
  assert.ok(args.includes('--safe-mode'))
  for (const bad of ['--yolo', '--accept-hooks', '--resume', '--skills', '--worktree']) assert.ok(!args.includes(bad))
})

test('runtime detection requires an executable with supported flags', async () => fixture(async root => {
  const executable = join(root, 'hermes')
  await writeFile(executable, '#!/usr/bin/env node\nprocess.stdout.write("old version")\n')
  await chmod(executable, 0o755)
  assert.equal((await detectRuntime('hermes', [executable])).status, 'incompatible')
  assert.equal((await detectRuntime('hermes', [join(root, 'missing')])).status, 'missing')
}))

test('read-only Hermes defaults expose names without credentials or unrelated config', async () => fixture(async root => {
  const path = join(root, 'config.yaml')
  await writeFile(path, 'model:\n  default: claude-haiku-4-5\n  provider: anthropic\n  api_key: private-value\nhooks:\n  provider: unrelated\n')
  assert.deepEqual(await hermesDefaults(path), { model: 'claude-haiku-4-5', provider: 'anthropic' })
}))

test('patch context rejects secret paths and outside symlinks', async () => fixture(async root => {
  const copy = join(root, 'copy')
  await mkdir(copy)
  await writeFile(join(root, 'outside'), 'outside')
  await symlink(join(root, 'outside'), join(copy, 'escape'))
  await assert.rejects(() => patchContext(copy, ['escape']), /inside the project copy/)
  await assert.rejects(() => patchContext(copy, ['.env']), /relative project/)
  await assert.rejects(() => patchContext(copy, ['../outside']), /relative project/)
}))

test('all proposed replacements are validated before writes', async () => fixture(async root => {
  await writeFile(join(root, 'allowed.txt'), 'old')
  const response = JSON.stringify({ summary: 'done', changes: [{ path: 'allowed.txt', content: 'new' }, { path: '../escape', content: 'bad' }] })
  await assert.rejects(() => applyHermesPatch(root, response, { 'allowed.txt': 'old' }), /file scope/)
  assert.equal(await readFile(join(root, 'allowed.txt'), 'utf8'), 'old')
  await assert.rejects(() => applyHermesPatch(root, JSON.stringify({ summary: 'done', changes: [{ path: 'allowed.txt', content: 'new' }] }), { 'allowed.txt': 'stale' }), /changed before/)
}))

test('Hermes subprocess produces real checked artifact in copy and removes account snapshot', async () => fixture(async root => {
  const source = join(root, 'source')
  const credentials = join(root, 'credentials')
  await mkdir(source)
  await mkdir(credentials)
  await writeFile(join(credentials, 'auth.json'), '{}')
  await writeFile(join(credentials, '.env'), 'ANTHROPIC_API_KEY=test-key\nHERMES_KANBAN_TASK=unexpected\n')
  await writeFile(join(source, 'value.mjs'), 'export const value = 1\n')
  await writeFile(join(source, 'package.json'), JSON.stringify({ type: 'module', scripts: { test: 'node --test' } }))
  await writeFile(join(source, 'value.test.mjs'), "import {test} from 'node:test'; import {strict as a} from 'node:assert'; import {value} from './value.mjs'; test('value',()=>a.equal(value,2));\n")
  const executable = join(root, 'hermes')
  await writeFile(executable, `#!/usr/bin/env node
const fs=require('node:fs');const args=process.argv.slice(2);
if(args.includes('--help')) process.stdout.write('--query-file --oneshot --safe-mode --toolsets --run-budget --source');
else if(args.includes('--version')) process.stdout.write('Hermes fake acceptance');
else {if(!process.env.HERMES_HOME.includes('/profiles/myynd')||fs.existsSync(process.env.HERMES_HOME+'/auth.json')||fs.readFileSync(process.env.HERMES_HOME+'/.env','utf8').includes('HERMES_KANBAN_TASK'))process.exit(4);process.stdout.write(JSON.stringify({summary:'Changed value',changes:[{path:'value.mjs',content:'export const value = 2\\n'}]}));}
`)
  await chmod(executable, 0o755)
  const runtime = await detectRuntime('hermes', [executable])
  const report = await executeInCopy(source, async workspace => runHermesPatch(runtime, workspace, 'Change value to 2', { files: ['value.mjs'], model: 'test', provider: 'test', credentialHome: credentials }), { baseDir: join(root, 'work') })
  assert.equal(report.state, 'verified')
  assert.equal(await readFile(join(source, 'value.mjs'), 'utf8'), 'export const value = 1\n')
  assert.equal(await readFile(join(report.workspace, 'value.mjs'), 'utf8'), 'export const value = 2\n')
  await assert.rejects(() => readFile(join(report.workspace, '..', 'hermes-run-state', 'home', '.hermes', 'profiles', 'myynd', 'auth.json')))
}))

test('cancelled runtime cannot apply a patch', async () => fixture(async root => {
  const controller = new AbortController()
  setTimeout(() => controller.abort(), 80)
  const result = await runRuntimeProcess(process.execPath, ['-e', 'setTimeout(()=>{},10000)'], root, process.env, controller.signal, 500)
  assert.equal(result.finished, false)
}))
