import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { executeInCopy, runCommand } from './esecuzione-isolata.ts'

async function project(fn: (root: string, base: string) => Promise<void>): Promise<void> {
  const base = await mkdtemp(join(tmpdir(), 'myynd-isolated-test-'))
  const root = join(base, 'source')
  await mkdir(root)
  try { await fn(root, base) } finally { await rm(base, { recursive: true, force: true }) }
}

test('a real edit runs the representative project test and leaves original untouched', async () => project(async (root, base) => {
  await writeFile(join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }))
  await writeFile(join(root, 'value.mjs'), 'export const value = 1\n')
  await writeFile(join(root, 'value.test.mjs'), "import {test} from 'node:test'; import {strict as assert} from 'node:assert'; import {value} from './value.mjs'; test('value',()=>assert.equal(value,2));\n")
  const report = await executeInCopy(root, async workspace => {
    await writeFile(join(workspace, 'value.mjs'), 'export const value = 2\n')
    return { exitCode: 0, finished: true, text: 'Done' }
  }, { baseDir: join(base, 'copies') })
  assert.equal(report.state, 'verified')
  assert.deepEqual(report.changedFiles, [{ path: 'value.mjs', kind: 'modified' }])
  assert.equal(report.verification.status, 'passed')
  assert.equal(await readFile(join(root, 'value.mjs'), 'utf8'), 'export const value = 1\n')
  assert.equal((JSON.parse(await readFile(report.reportFile, 'utf8')) as { state: string }).state, 'verified')
}))

test('a model success sentence without changed files is not success', async () => project(async (root, base) => {
  await writeFile(join(root, 'file.txt'), 'same')
  const report = await executeInCopy(root, async () => ({ exitCode: 0, finished: true, text: 'I changed it' }), { baseDir: join(base, 'copies') })
  assert.equal(report.state, 'no_changes')
}))

test('the copy includes local uncommitted files but excludes Git metadata', async () => project(async (root, base) => {
  await mkdir(join(root, '.git'))
  await writeFile(join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n')
  await writeFile(join(root, 'tracked.txt'), 'locally edited')
  await writeFile(join(root, 'new-untracked.txt'), 'new work')
  const report = await executeInCopy(root, async workspace => {
    assert.equal(await readFile(join(workspace, 'tracked.txt'), 'utf8'), 'locally edited')
    assert.equal(await readFile(join(workspace, 'new-untracked.txt'), 'utf8'), 'new work')
    await assert.rejects(() => readFile(join(workspace, '.git', 'HEAD')))
    await writeFile(join(workspace, 'tracked.txt'), 'agent edit')
    return { exitCode: 0, finished: true, text: 'Edited' }
  }, { baseDir: join(base, 'copies') })
  assert.equal(report.state, 'unverified')
  assert.equal(await readFile(join(root, 'tracked.txt'), 'utf8'), 'locally edited')
  assert.equal(await readFile(join(root, 'new-untracked.txt'), 'utf8'), 'new work')
}))

test('ignored generated folders stay out while local dependencies remain available', async () => project(async (root, base) => {
  await writeFile(join(root, '.gitignore'), 'dist-app/\nnode_modules/\n')
  await mkdir(join(root, 'dist-app'))
  await mkdir(join(root, 'node_modules'))
  await writeFile(join(root, 'dist-app', 'bundle.bin'), 'generated')
  await writeFile(join(root, 'node_modules', 'dependency.txt'), 'available')
  const report = await executeInCopy(root, async workspace => {
    await assert.rejects(() => readFile(join(workspace, 'dist-app', 'bundle.bin')))
    assert.equal(await readFile(join(workspace, 'node_modules', 'dependency.txt'), 'utf8'), 'available')
    return { exitCode: 0, finished: true, text: '' }
  }, { baseDir: join(base, 'copies') })
  assert.equal(report.state, 'no_changes')
}))

test('failed verification is reported with evidence', async () => project(async (root, base) => {
  await writeFile(join(root, 'file.txt'), 'old')
  const report = await executeInCopy(root, async workspace => {
    await writeFile(join(workspace, 'file.txt'), 'new')
    return { exitCode: 0, finished: true, text: 'Done' }
  }, { baseDir: join(base, 'copies'), verify: async () => ({ status: 'failed', command: ['fake-test'], exitCode: 1, output: 'assertion failed' }) })
  assert.equal(report.state, 'failed')
  assert.equal(report.verification.output, 'assertion failed')
}))

test('cancelled action keeps partial changes as reviewable evidence', async () => project(async (root, base) => {
  await writeFile(join(root, 'file.txt'), 'old')
  const controller = new AbortController()
  const report = await executeInCopy(root, async workspace => {
    await writeFile(join(workspace, 'file.txt'), 'partial')
    controller.abort()
    return { exitCode: null, finished: false, text: 'interrupted' }
  }, { baseDir: join(base, 'copies'), signal: controller.signal })
  assert.equal(report.state, 'cancelled')
  assert.deepEqual(report.changedFiles, [{ path: 'file.txt', kind: 'modified' }])
  assert.equal(await readFile(join(root, 'file.txt'), 'utf8'), 'old')
}))

test('outside symlinks are rejected before action starts', async () => project(async (root, base) => {
  const outside = join(base, 'outside.txt')
  await writeFile(outside, 'outside')
  await symlink(outside, join(root, 'escape'))
  let started = false
  const report = await executeInCopy(root, async () => { started = true; return { exitCode: 0, finished: true, text: '' } }, { baseDir: join(base, 'copies') })
  assert.equal(started, false)
  assert.equal(report.state, 'failed')
  assert.match(report.agentText, /collegamento assoluto|fuori cartella/)
}))

test('an agent-created link escaping the copy cannot be verified', async () => project(async (root, base) => {
  await writeFile(join(root, 'file.txt'), 'old')
  const outside = join(base, 'outside.txt')
  await writeFile(outside, 'outside')
  const report = await executeInCopy(root, async workspace => {
    await symlink(outside, join(workspace, 'escape'))
    return { exitCode: 0, finished: true, text: 'Done' }
  }, { baseDir: join(base, 'copies'), verify: async () => ({ status: 'passed', exitCode: 0 }) })
  assert.equal(report.state, 'failed')
  assert.match(report.agentText, /collegamento fuori cartella/)
  assert.equal(report.verification.status, 'unavailable')
}))

test('bounded commands can be cancelled', async () => project(async (root) => {
  const controller = new AbortController()
  setTimeout(() => controller.abort(), 100)
  const result = await runCommand([process.execPath, '-e', 'setTimeout(()=>{}, 10000)'], root, controller.signal, 1000)
  assert.equal(result.finished, false)
}))
