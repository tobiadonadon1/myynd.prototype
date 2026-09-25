import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, lstat, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { OSPITATO } from './ospitato.ts'

export type RuntimeId = 'claude' | 'hermes'
export type RuntimeDetection = { id: RuntimeId; executable: string | null; status: 'supported' | 'missing' | 'incompatible'; version?: string; reason?: string }
export type RuntimeResult = { text: string; exitCode: number | null; finished: boolean; failure?: 'authentication' | 'model' | 'runtime' }
export type RuntimeProvenance = { runtime: RuntimeId; executable: string; version?: string; scope: 'copy-files'; model?: string; provider?: string }
const HERMES_CREDENTIAL_NAMES = new Set(['ANTHROPIC_API_KEY', 'ANTHROPIC_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'GROQ_API_KEY', 'DEEPSEEK_API_KEY', 'ZAI_API_KEY'])
export async function hasHermesInferenceCredentials(home=join(homedir(),'.hermes')):Promise<boolean> {
  const lines=(await readFile(join(home,'.env'),'utf8').catch(()=> '')).split(/\r?\n/)
  return lines.some(line=>{const match=line.match(/^\s*(?:export\s+)?([A-Z_]+)\s*=\s*(.+)/);return !!match && HERMES_CREDENTIAL_NAMES.has(match[1]) && !!match[2].replace(/['"\s]/g,'')})
}

/** Read only simple model/provider names. No config or credential payload is returned. */
export async function hermesDefaults(path = join(homedir(), '.hermes', 'config.yaml')): Promise<{ model?: string; provider?: string }> {
  const raw = await readFile(path, 'utf8').catch(() => '')
  let inModel = false
  const result: { model?: string; provider?: string } = {}
  for (const line of raw.split(/\r?\n/)) {
    if (/^model:\s*(?:#.*)?$/.test(line)) { inModel = true; continue }
    if (inModel && /^\S/.test(line)) break
    if (!inModel) continue
    const match = line.match(/^  (default|provider):\s*['"]?([a-zA-Z0-9./:_-]{1,150})['"]?\s*(?:#.*)?$/)
    if (match) result[match[1] === 'default' ? 'model' : 'provider'] = match[2]
  }
  return result
}

export function runtimeCandidates(id: RuntimeId, home = homedir()): string[] {
  return [join(home, '.local', 'bin', id), `/opt/homebrew/bin/${id}`, `/usr/local/bin/${id}`]
}

/*
 * P10 · la risposta si tiene: due `--help` e un `--version` per ogni volta
 * che la pagina chiedeva «c'è Claude Code?» erano secondi. Un runtime trovato
 * vale dieci minuti, finché il file resta lo stesso (percorso vero, data,
 * dimensione); uno che manca quindici secondi, così installarlo si vede presto.
 */
const TROVATO_MS = 10 * 60_000
const MANCA_MS = 15_000
const giaVisti = new Map<string, { quando: number; firma: string | null; esito: RuntimeDetection }>()
async function firmaDi(path: string | null): Promise<string | null> {
  if (!path) return null
  try { const vero = await realpath(path); const s = await lstat(vero); return `${vero}·${s.mtimeMs}·${s.size}` } catch { return null }
}
/** Per le prove: dimentica le risposte tenute. */
export function dimenticaRuntime() { giaVisti.clear() }

export async function detectRuntime(id: RuntimeId, candidates = runtimeCandidates(id)): Promise<RuntimeDetection> {
  if (OSPITATO) return { id, executable: null, status: 'missing', reason: 'Local agent runtimes require the desktop.' }
  const chiave = `${id}|${candidates.join('|')}`
  const visto = giaVisti.get(chiave)
  if (visto) {
    const eta = Date.now() - visto.quando
    if (visto.esito.executable === null ? eta < MANCA_MS : eta < TROVATO_MS && visto.firma !== null && await firmaDi(visto.esito.executable) === visto.firma) return visto.esito
  }
  const esito = await rilevaDavvero(id, candidates)
  giaVisti.set(chiave, { quando: Date.now(), firma: await firmaDi(esito.executable), esito })
  return esito
}

async function rilevaDavvero(id: RuntimeId, candidates: string[]): Promise<RuntimeDetection> {
  for (const path of candidates) {
    try {
      await access(path, constants.X_OK)
      if (!(await lstat(await realpath(path))).isFile()) continue
      const result = await runRuntimeProcess(path, id === 'hermes' ? ['chat', '--help'] : ['--help'], dirname(path), process.env, undefined, 8000)
      const required = id === 'hermes' ? ['--query-file', '--oneshot', '--safe-mode', '--toolsets', '--run-budget', '--source'] : ['--permission-mode', '--strict-mcp-config', '--disallowedTools', '--setting-sources']
      if (result.exitCode !== 0 || required.some(flag => !result.text.includes(flag))) return { id, executable: path, status: 'incompatible', reason: 'This installed CLI lacks the required scoped execution flags.' }
      // Version probes may emit diagnostic paths; only the first line is kept.
      const version = await runRuntimeProcess(path, ['--version'], dirname(path), process.env, undefined, 8000)
      return { id, executable: path, status: 'supported', version: version.text.split(/\r?\n/)[0]?.slice(0, 200) }
    } catch { /* try the next fixed location */ }
  }
  return { id, executable: null, status: 'missing' }
}

export function hermesArguments(queryFile: string, workspace: string, options: { model: string; provider: string }): string[] {
  if (!options.model.trim() || !options.provider.trim() || /^-/.test(options.model) || /^-/.test(options.provider)) throw new Error('Choose a Hermes model and provider for this run.')
  return ['chat', '--query-file', queryFile, '--oneshot', '--quiet', '--safe-mode', '--toolsets', 'none', '--in', workspace,
    '--max-turns', '4', '--run-budget', '180', '--source', 'tool', '--model', options.model, '--provider', options.provider]
}

export async function runRuntimeProcess(executable: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, signal?: AbortSignal, timeoutMs = 180_000): Promise<RuntimeResult> {
  if (signal?.aborted) return { text: '', exitCode: null, finished: false }
  return new Promise((resolveResult, reject) => {
    const child = spawn(executable, args, { cwd, env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] })
    let text = '', diagnostic = '', finished = true, settled = false
    const stop = () => {
      finished = false
      const kill = (kind: NodeJS.Signals) => { try { if (child.pid && process.platform !== 'win32') process.kill(-child.pid, kind); else child.kill(kind) } catch { /* process already stopped */ } }
      kill('SIGTERM')
      setTimeout(() => kill('SIGKILL'), 2000).unref()
    }
    const timer = setTimeout(stop, timeoutMs)
    signal?.addEventListener('abort', stop, { once: true })
    const append = (data: Buffer) => { if (text.length < 200_000) text += String(data).slice(0, 200_000 - text.length) }
    child.stdout.on('data', append)
    // Error output can carry account data. Do not include it in user artifacts.
    child.stderr.on('data', data => { if (diagnostic.length < 16_000) diagnostic += String(data).slice(0, 16_000 - diagnostic.length) })
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', stop) }
    child.on('error', error => { if (!settled) { settled = true; cleanup(); reject(error) } })
    child.on('close', exitCode => {
      if (!settled) {
        settled = true; cleanup()
        const errors = diagnostic + text
        const failure = exitCode === 0 ? undefined : /auth|credential|api.?key|login|unauthorized|401|403/i.test(errors) ? 'authentication' : /model.*(invalid|not found|unsupported)|unknown model/i.test(errors) ? 'model' : 'runtime'
        resolveResult({ text: text.trim(), exitCode, finished, ...(failure ? { failure } : {}) })
      }
    })
  })
}

function safeRelative(path: string): boolean {
  return !!path && !isAbsolute(path) && !path.split(/[\\/]/).some(part => part === '..' || part === '.git' || part === '.env' || part.startsWith('.env.'))
}

/** Only explicit existing text files are exposed; no broad repository scan. */
export async function patchContext(workspace: string, files: string[]): Promise<{ files: Record<string, string>; prompt: string }> {
  workspace = await realpath(workspace)
  if (!files.length || files.length > 20 || new Set(files).size !== files.length) throw new Error('Choose 1 to 20 project files for Hermes.')
  const content: Record<string, string> = {}
  let bytes = 0
  for (const path of files) {
    if (!safeRelative(path)) throw new Error('Hermes context must use relative project file paths.')
    const full = join(workspace, path)
    const actual = await realpath(full)
    const rel = relative(workspace, actual)
    if (rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel) || !(await lstat(full)).isFile()) throw new Error('Hermes context must stay inside the project copy.')
    const data = await readFile(full)
    bytes += data.length
    if (bytes > 80_000 || data.includes(0)) throw new Error('Hermes context is too large or contains binary files.')
    content[path] = data.toString('utf8')
  }
  return { files: content, prompt: JSON.stringify(content) }
}

/** Apply full replacements only to the explicitly shared file set. */
export async function applyHermesPatch(workspace: string, response: string, baseline: Record<string, string>): Promise<string> {
  workspace = await realpath(workspace)
  const raw = response.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
  const parsed = JSON.parse(raw) as { summary?: unknown; changes?: unknown }
  if (typeof parsed.summary !== 'string' || !Array.isArray(parsed.changes) || parsed.changes.length > 20) throw new Error('Hermes did not return a valid scoped patch.')
  const paths = new Set<string>()
  const checked: { path: string; content: string }[] = []
  for (const change of parsed.changes as { path?: unknown; content?: unknown }[]) {
    if (typeof change.path !== 'string' || typeof change.content !== 'string' || !safeRelative(change.path)
      || !Object.hasOwn(baseline, change.path) || paths.has(change.path) || Buffer.byteLength(change.content) > 100_000 || change.content.includes('\0')) throw new Error('Hermes patch exceeds the explicitly shared file scope.')
    paths.add(change.path)
    const full = join(workspace, change.path)
    const actual = await realpath(full)
    if (actual !== full || !(await lstat(full)).isFile() || await readFile(full, 'utf8') !== baseline[change.path]) throw new Error('A shared copy file changed before applying the Hermes patch.')
    checked.push({ path: full, content: change.content })
  }
  // Validate every replacement before any file is changed.
  for (const change of checked) await writeFile(change.path, change.content)
  return parsed.summary.slice(0, 2000)
}

export async function runHermesPatch(runtime: RuntimeDetection, workspace: string, request: string,
  options: { files: string[]; model: string; provider: string; signal?: AbortSignal; credentialHome?: string }): Promise<RuntimeResult> {
  if (runtime.id !== 'hermes' || runtime.status !== 'supported' || !runtime.executable) throw new Error('A compatible Hermes CLI is required.')
  const context = await patchContext(workspace, options.files)
  const taskDir = dirname(workspace)
  const stateRoot = join(taskDir, 'hermes-run-state')
  const isolatedHome = join(stateRoot, 'home')
  const profile = join(isolatedHome, '.hermes', 'profiles', 'myynd')
  const queryFile = join(stateRoot, 'request.txt')
  await mkdir(profile, { recursive: true, mode: 0o700 })
  try {
    // API keys/access tokens do not need account-state mutation. Do not copy
    // auth.json: refreshing a rotating OAuth grant in a copy could invalidate
    // the original account's saved refresh chain.
    const credentialHome = options.credentialHome ?? join(homedir(), '.hermes')
    const credentialLines = (await readFile(join(credentialHome, '.env'), 'utf8').catch(() => '')).split(/\r?\n/)
      .filter(line => { const match = line.match(/^\s*(?:export\s+)?([A-Z_]+)\s*=/); return !!match && HERMES_CREDENTIAL_NAMES.has(match[1]) })
    await writeFile(join(profile, '.env'), credentialLines.join('\n'), { mode: 0o600 })
    const prompt = `${request}\n\nYou have no tools. Return only JSON: {"summary":"brief result","changes":[{"path":"one supplied path","content":"complete new text"}]}. Change only the supplied paths. Do not request shell, network, publishing, training, live agent changes, credentials or new files. Supplied copy files:\n${context.prompt}`
    await writeFile(queryFile, prompt, { mode: 0o600 })
    const args = hermesArguments(queryFile, workspace, options)
    // Do not inherit dispatch flags, arbitrary terminal overrides or Myynd
    // API keys. Only the copied account credential store supplies inference.
    const env: NodeJS.ProcessEnv = {}
    for (const key of ['PATH', 'LANG', 'LC_ALL', 'TMPDIR', 'SYSTEMROOT', 'WINDIR']) if (process.env[key]) env[key] = process.env[key]
    const result = await runRuntimeProcess(runtime.executable, args, workspace, { ...env, HOME: isolatedHome, HERMES_HOME: profile, TERMINAL_CWD: workspace }, options.signal)
    if (!result.finished || result.exitCode !== 0) return { ...result, text: `Hermes did not finish a scoped patch (${result.failure ?? 'interrupted'}). Check its account/model setup.` }
    return { ...result, text: await applyHermesPatch(workspace, result.text, context.files) }
  } finally { await rm(stateRoot, { recursive: true, force: true }) }
}
