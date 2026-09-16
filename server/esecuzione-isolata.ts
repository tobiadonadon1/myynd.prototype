// A connected project is copied before an agent may edit it. The copy and its
// report stay together so a person can inspect the result without changing the
// project they connected.
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, realpath, symlink, writeFile, copyFile } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { cartella as profileFolder } from './config.ts'

const MAX_FILES = 100_000
const MAX_BYTES = 2_000_000_000
const MAX_OUTPUT = 24_000
const VERIFY_MS = 5 * 60_000

export type ChangedFile = { path: string; kind: 'added' | 'modified' | 'deleted' }
export type Verification = { status: 'passed' | 'failed' | 'unavailable' | 'cancelled'; command?: string[]; exitCode?: number | null; output?: string }
export type ExecutionReport = {
  id: string
  source: string
  workspace: string
  reportFile: string
  state: 'verified' | 'unverified' | 'failed' | 'cancelled' | 'no_changes'
  changedFiles: ChangedFile[]
  /** Hashes of the files that still exist, and 'deleted' for removals. */
  artifactHashes: Record<string, string>
  verification: Verification
  agentExitCode: number | null
  agentFinished: boolean
  agentText: string
  createdAt: string
}

export type AgentResult = { exitCode: number | null; finished: boolean; text: string }
type Manifest = Map<string, string>

function within(root: string, path: string): boolean {
  const rel = relative(root, path)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

/** This is deliberately a full copy, including the current working tree. */
async function copyProject(source: string, destination: string, signal?: AbortSignal): Promise<void> {
  let files = 0
  let bytes = 0
  const seen = new Set<string>()
  // Generated folders can dwarf the project. Root-level literal ignore rules
  // are safe to omit; dependencies are the one exception, because tests may
  // need the existing local installation without a network install.
  const ignoredAtRoot = new Set((await readFile(join(source, '.gitignore'), 'utf8').catch(() => ''))
    .split(/\r?\n/).map(line => line.trim())
    .filter(line => /^[A-Za-z0-9._-]+\/?$/.test(line) && !line.startsWith('#'))
    .map(line => line.replace(/\/$/, '')))
  ignoredAtRoot.delete('node_modules')
  async function visit(from: string, to: string): Promise<void> {
    if (signal?.aborted) throw new Error('Lavoro annullato.')
    const stat = await lstat(from)
    if (stat.isSymbolicLink()) {
      const target = await readlink(from)
      if (isAbsolute(target)) throw new Error(`Il progetto contiene un collegamento assoluto: ${relative(source, from)}`)
      const actual = await realpath(from).catch(() => null)
      if (!actual) throw new Error(`Il progetto contiene un collegamento interrotto: ${relative(source, from)}`)
      if (!within(source, actual)) throw new Error(`Il progetto contiene un collegamento fuori cartella: ${relative(source, from)}`)
      files++
      await symlink(target, to)
    } else if (stat.isDirectory()) {
      const actual = await realpath(from)
      if (seen.has(actual)) throw new Error('Il progetto contiene un ciclo di cartelle.')
      seen.add(actual)
      await mkdir(to, { recursive: true, mode: stat.mode })
      for (const name of await readdir(from)) {
        // Git metadata may point at a common worktree and is never needed in
        // the isolated copy. Its absence also prevents accidental commits.
        if (name === '.git' || (from === source && ignoredAtRoot.has(name))) continue
        await visit(join(from, name), join(to, name))
      }
      seen.delete(actual)
    } else if (stat.isFile()) {
      files++
      bytes += stat.size
      if (files > MAX_FILES || bytes > MAX_BYTES) throw new Error('Il progetto è troppo grande per una copia sicura.')
      await copyFile(from, to)
    } else throw new Error(`Il progetto contiene un file speciale: ${relative(source, from)}`)
    if (files > MAX_FILES) throw new Error('Il progetto contiene troppi file per una copia sicura.')
  }
  await visit(source, destination)
}

async function manifest(root: string): Promise<Manifest> {
  const found: Manifest = new Map()
  async function visit(path: string): Promise<void> {
    for (const name of await readdir(path)) {
      const full = join(path, name)
      const rel = relative(root, full)
      const stat = await lstat(full)
      if (stat.isDirectory()) await visit(full)
      else if (stat.isFile()) found.set(rel, createHash('sha256').update(await readFile(full)).digest('hex'))
      else if (stat.isSymbolicLink()) found.set(rel, `link:${await readlink(full)}`)
      else found.set(rel, 'special')
    }
  }
  await visit(root)
  return found
}

async function validateWorkspaceLinks(root: string): Promise<void> {
  async function visit(path: string): Promise<void> {
    for (const name of await readdir(path)) {
      const full = join(path, name)
      const info = await lstat(full)
      if (info.isDirectory()) await visit(full)
      else if (info.isSymbolicLink()) {
        const target = await readlink(full)
        const actual = await realpath(full).catch(() => null)
        if (isAbsolute(target) || !actual || !within(root, actual)) throw new Error(`La copia contiene un collegamento fuori cartella: ${relative(root, full)}`)
      }
    }
  }
  await visit(root)
}

function changes(before: Manifest, after: Manifest): ChangedFile[] {
  const all = new Set([...before.keys(), ...after.keys()])
  return [...all].sort().flatMap(path => {
    const a = before.get(path), b = after.get(path)
    if (a === b) return []
    return [{ path, kind: a === undefined ? 'added' : b === undefined ? 'deleted' : 'modified' }]
  })
}

function changedHashes(files: ChangedFile[], after: Manifest): Record<string, string> {
  return Object.fromEntries(files.map(file => [file.path, after.get(file.path) ?? 'deleted']))
}

function verificationCommand(workspace: string): Promise<string[] | null> {
  return readFile(join(workspace, 'package.json'), 'utf8').then(raw => {
    const pkg = JSON.parse(raw) as { scripts?: Record<string, unknown> }
    if (typeof pkg.scripts?.test === 'string') return ['npm', 'test']
    if (typeof pkg.scripts?.typecheck === 'string') return ['npm', 'run', 'typecheck']
    return null
  }).catch(() => null)
}

/** Runs a fixed argv in the copy, with cancellation and a hard timeout. */
export async function runCommand(argv: string[], cwd: string, signal?: AbortSignal, timeoutMs = VERIFY_MS): Promise<{ exitCode: number | null; output: string; finished: boolean }> {
  if (signal?.aborted) return { exitCode: null, output: '', finished: false }
  return await new Promise((resolveResult, reject) => {
    const child = spawn(argv[0], argv.slice(1), { cwd, env: process.env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    let finished = true
    let done = false
    const stop = () => {
      finished = false
      try { if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM'); else child.kill('SIGTERM') } catch { /* already gone */ }
      setTimeout(() => {
        try { if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL') } catch { /* already gone */ }
      }, 2000).unref()
    }
    const timer = setTimeout(stop, timeoutMs)
    const onAbort = () => stop()
    signal?.addEventListener('abort', onAbort, { once: true })
    const append = (data: Buffer) => { if (output.length < MAX_OUTPUT) output += String(data).slice(0, MAX_OUTPUT - output.length) }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    child.on('error', e => { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', onAbort); reject(e) })
    child.on('close', code => { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', onAbort); resolveResult({ exitCode: code, output: output.trim(), finished }) })
  })
}

export async function executeInCopy(
  sourcePath: string,
  agent: (workspace: string, signal?: AbortSignal) => Promise<AgentResult>,
  options: { signal?: AbortSignal; baseDir?: string; verify?: (workspace: string, signal?: AbortSignal) => Promise<Verification> } = {}
): Promise<ExecutionReport> {
  const source = await realpath(resolve(sourcePath))
  if (!(await lstat(source)).isDirectory()) throw new Error('La cartella del progetto non esiste.')
  if (options.signal?.aborted) throw new Error('Lavoro annullato.')
  const base = options.baseDir ?? join(profileFolder(), 'project-work')
  await mkdir(base, { recursive: true })
  const taskDir = await mkdtemp(join(base, `${basename(source).replace(/[^a-zA-Z0-9_-]/g, '_')}-`))
  const workspace = join(taskDir, 'project')
  const reportFile = join(taskDir, 'report.json')
  const id = randomUUID()
  const createdAt = new Date().toISOString()
  let before: Manifest = new Map()
  let agentResult: AgentResult = { exitCode: null, finished: false, text: '' }
  let verification: Verification = { status: 'unavailable' }
  let state: ExecutionReport['state'] = 'failed'
  try {
    await copyProject(source, workspace, options.signal)
    before = await manifest(workspace)
    agentResult = await agent(workspace, options.signal)
    const after = await manifest(workspace)
    const changedFiles = changes(before, after)
    const artifactHashes = changedHashes(changedFiles, after)
    await validateWorkspaceLinks(workspace)
    if (options.signal?.aborted || !agentResult.finished) state = 'cancelled'
    else if (agentResult.exitCode !== 0) state = 'failed'
    else if (!changedFiles.length) state = 'no_changes'
    else {
      if (options.verify) verification = await options.verify(workspace, options.signal)
      else {
        const argv = await verificationCommand(workspace)
        if (argv) {
          const result = await runCommand(argv, workspace, options.signal)
          verification = { status: options.signal?.aborted || !result.finished ? 'cancelled' : result.exitCode === 0 ? 'passed' : 'failed', command: argv, exitCode: result.exitCode, output: result.output }
        }
      }
      state = verification.status === 'passed' ? 'verified' : verification.status === 'unavailable' ? 'unverified' : verification.status === 'cancelled' ? 'cancelled' : 'failed'
    }
    const report: ExecutionReport = { id, source, workspace, reportFile, state, changedFiles, artifactHashes, verification, agentExitCode: agentResult.exitCode, agentFinished: agentResult.finished, agentText: agentResult.text, createdAt }
    await writeFile(reportFile, JSON.stringify(report, null, 2), { mode: 0o600 })
    return report
  } catch (e) {
    // Even a partially produced copy has an inspectable failure record.
    const after = await manifest(workspace).catch(() => new Map())
    const changedFiles = before.size ? changes(before, after) : []
    const report: ExecutionReport = { id, source, workspace, reportFile, state: options.signal?.aborted ? 'cancelled' : 'failed', changedFiles, artifactHashes: changedHashes(changedFiles, after), verification, agentExitCode: agentResult.exitCode, agentFinished: agentResult.finished, agentText: e instanceof Error ? e.message : String(e), createdAt }
    await writeFile(reportFile, JSON.stringify(report, null, 2), { mode: 0o600 })
    return report
  }
}
