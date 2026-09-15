// The desktop app ships an official pinned Codex runtime. Native Codex owns
// its auth.json; Myynd never copies, parses or exports those credentials.
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cartella } from './config.ts'
import { OSPITATO } from './ospitato.ts'

export const VERSIONE_CHATGPT = '0.145.0'
export type RuntimeChatGPT = { binario: string; versione: string; integrato: boolean }

/** Mirrors the build cache, used only while developing the unpackaged app. */
export function cacheRuntimeChatGPT(): string {
  const base = process.platform === 'darwin' ? join(homedir(), 'Library', 'Caches', 'myynd-binari')
    : process.platform === 'win32' ? join(process.env.LOCALAPPDATA || tmpdir(), 'myynd-binari')
      : join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'myynd-binari')
  return join(base, 'codex', VERSIONE_CHATGPT, `${process.platform}-${process.arch}`)
}

/** Fail closed on missing/wrong bundles; never pick up an unrelated user CLI. */
export function runtimeChatGPT(): RuntimeChatGPT | null {
  if (OSPITATO) return null
  const server = dirname(fileURLToPath(import.meta.url))
  const integrato = server.includes('app.asar.unpacked')
  const base = integrato ? resolve(server, '..', '..', 'chatgpt-runtime') : cacheRuntimeChatGPT()
  return leggiRuntimeChatGPT(base, integrato)
}

export function leggiRuntimeChatGPT(base: string, integrato: boolean): RuntimeChatGPT | null {
  try {
    const meta = JSON.parse(readFileSync(join(base, 'runtime.json'), 'utf8'))
    if (meta.version !== VERSIONE_CHATGPT || meta.platform !== process.platform || meta.arch !== process.arch) return null
    const binario = join(base, 'bin', process.platform === 'win32' ? 'codex.exe' : 'codex')
    if (!lstatSync(binario).isFile()) return null
    return { binario, versione: VERSIONE_CHATGPT, integrato }
  } catch { return null }
}

function privata(path: string) {
  if (existsSync(path) && !lstatSync(path).isDirectory()) throw new Error('The ChatGPT account folder is unavailable.')
  mkdirSync(path, { recursive: true, mode: 0o700 })
  chmodSync(path, 0o700)
}

/**
 * CODEX_HOME is the documented runtime configuration directory. Only the
 * child receives this value; the parent/shell environment and HOME stay as-is.
 * Use file credentials so neither the global auth file nor its keyring entry
 * can accidentally select a different account. Restart reuses this same path.
 * https://developers.openai.com/codex/auth
 */
export function ambienteChatGPT(): { env: NodeJS.ProcessEnv; cwd: string; chiave: string; args: string[] } {
  if (OSPITATO) throw new Error('ChatGPT sign-in is available in the desktop app.')
  const chiave = resolve(cartella())
  const base = join(chiave, 'chatgpt')
  const myyndCodexHome = join(base, 'account')
  const cwd = join(base, 'workspace')
  privata(base); privata(myyndCodexHome); privata(cwd)
  const env: NodeJS.ProcessEnv = {}
  // Keep only OS/runtime networking basics. No API credentials, provider URL,
  // inherited Codex session/configuration, Electron or Myynd secrets.
  const ammessi = /^(PATH|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|SYSTEMROOT|WINDIR|COMSPEC|PATHEXT|TEMP|TMP|TMPDIR|LANG|LC_.*|SYSTEMDRIVE|HOMEDRIVE|HOMEPATH|USER|LOGNAME|SHELL|TERM|HTTPS?_PROXY|ALL_PROXY|NO_PROXY|SSL_CERT_FILE|SSL_CERT_DIR)$/i
  for (const [k, v] of Object.entries(process.env)) if (ammessi.test(k) && v !== undefined) env[k] = v
  env.CODEX_HOME = myyndCodexHome
  return { env, cwd, chiave, args: ['-c', 'cli_auth_credentials_store="file"'] }
}
