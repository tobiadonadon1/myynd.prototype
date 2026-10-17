// Il recinto intorno a quello che gira dentro la copia di un progetto.
//
// La copia teneva lontano dal progetto vero quello che l'agente scriveva, ma
// non quello che *faceva girare*: `npm test` lanciava gli script del progetto
// (codice qualunque, e magari appena cambiato dall'agente) con l'ambiente
// intero di Myynd. Ogni chiave API, ogni gettone, la cartella di casa e la
// rete erano a portata di un `console.log(process.env)`.
//
// Due mura, e la seconda vale anche se la prima cade:
//
//   · **l'ambiente minimo.** PATH ripulito, HOME e TMPDIR in una cartella
//     nuova e vuota, LANG, CI=1. Nient'altro: niente ANTHROPIC_*, OPENAI_*,
//     MYYND_*, gettoni, credenziali del cloud.
//   · **sandbox-exec, sul Mac.** Niente rete se non verso questo computer,
//     niente scritture fuori dalla copia e dalla sua cartella temporanea, e si
//     legge solo un elenco: il sistema, node, la copia, la sua casa finta.
//     Niente cronologia della shell, niente profili del browser, niente
//     Documenti. Niente app da lanciare (`open`, `osascript`, …) e niente
//     LaunchServices o Apple Events: da lì si usciva dal recinto aprendo il
//     Terminale. Se sandbox-exec manca o non parte, resta il primo muro, e il
//     risultato lo dice: contenimento «parziale».
//
// Claude Code ha un recinto suo, più largo: deve parlare con Anthropic,
// leggere la cartella del progetto e scrivere il suo stato. Ma non scrive
// fuori dalla copia, non tocca le sue impostazioni (hook, comandi, CLAUDE.md),
// non riscrive i suoi eseguibili, e non legge i segreti di Myynd né quelli
// della persona.

import { execFile } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { DATI } from './ospitato.ts'

export type Contenimento = 'sandbox' | 'parziale'

export const SANDBOX_EXEC = '/usr/bin/sandbox-exec'

/** Il percorso vero: sul Mac /tmp e /var sono collegamenti, e il profilo guarda i percorsi veri. */
export function vero(p: string): string {
  const assoluto = resolve(p)
  try { return realpathSync(assoluto) } catch {
    // non esiste ancora: il genitore vero, e il nome in fondo
    const su = dirname(assoluto)
    return su === assoluto ? assoluto : join(vero(su), assoluto.slice(su.length + 1))
  }
}

/**
 * Le cartelle dove un comando si cerca: quella di node, e quelle di sistema.
 * Mai la PATH di chi ha lanciato Myynd, e mai `~/.local/bin` così com'è: è
 * una cartella scrivibile, e un `npm` messo lì sarebbe il primo a rispondere.
 * Se il node di casa sta lì, entra la cartella vera dove punta.
 */
export function pathPulita(): string {
  // nell'app impacchettata execPath è Electron, non node: allora node si cerca dove lo mettono le installazioni comuni
  const locale = join(homedir(), '.local/bin/node')
  const dirs = [dirname(process.execPath), ...(existsSync(locale) ? [dirname(vero(locale))] : []),
    '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']
  return [...new Set(dirs)].filter(d => d !== join(homedir(), '.local/bin')).join(delimiter)
}

/**
 * L'ambiente di un comando di verifica: questo e nient'altro.
 *
 * `casa` è una cartella nuova e vuota: HOME e TMPDIR stanno lì, così npm
 * scrive la sua cache e i suoi registri dentro il recinto, e non trova né un
 * `.npmrc` né niente di suo.
 */
export function ambienteMinimo(casa: string): NodeJS.ProcessEnv {
  return {
    PATH: pathPulita(),
    HOME: casa,
    TMPDIR: casa,
    LANG: process.env.LANG && /^[\w.@-]+$/.test(process.env.LANG) ? process.env.LANG : 'en_US.UTF-8',
    CI: '1'
  }
}

/** I nomi che Claude Code legge per entrare e per lavorare; gli altri restano fuori. */
const PER_CLAUDE = new Set(['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'TERM', 'TMPDIR', 'NODE_EXTRA_CA_CERTS',
  'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy'])

/**
 * L'ambiente di Claude Code: quello che gli serve per autenticarsi e girare,
 * e le sue impostazioni (`CLAUDE_*`). Senza la chiave di Myynd, senza i
 * gettoni delle fonti, senza niente di `MYYND_*`. L'aggiornamento automatico
 * è spento: i suoi eseguibili, dentro il recinto, non si riscrivono.
 */
export function ambienteClaude(env: NodeJS.ProcessEnv = process.env, temp?: string): NodeJS.ProcessEnv {
  const fuori: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) continue
    if (PER_CLAUDE.has(k) || k.startsWith('LC_') || k.startsWith('CLAUDE_')) fuori[k] = v
  }
  fuori.DISABLE_AUTOUPDATER = '1'
  if (temp) fuori.TMPDIR = temp
  return fuori
}

/**
 * Le cartelle e i file dei segreti, in casa e di Myynd. Quelli che non
 * esistono non fanno male. Per Claude Code, che legge per elenco negato, c'è
 * anche quello che è suo e non c'entra col progetto: i browser, la posta, la
 * cronologia, i Documenti.
 */
export function segreti(casa = homedir()): string[] {
  const h = (p: string) => join(casa, p)
  return [
    DATI, h('.myynd'),
    h('.ssh'), h('.aws'), h('.gnupg'), h('.azure'), h('.kube'), h('.docker'), h('.config'),
    h('.netrc'), h('.npmrc'), h('.pypirc'), h('.git-credentials'), h('.gitconfig'), h('.codex'), h('.hermes'),
    h('.zsh_history'), h('.bash_history'), h('.zsh_sessions'), h('.python_history'), h('.node_repl_history'),
    h('Library/Keychains'), h('Library/Cookies'), h('Library/Mail'), h('Library/Messages'), h('Library/Safari'),
    h('Library/Application Support/Myynd'), h('Library/Application Support/myynd'),
    h('Library/Application Support/Google'), h('Library/Application Support/Arc'), h('Library/Application Support/BraveSoftware'),
    h('Library/Application Support/Microsoft Edge'), h('Library/Application Support/Firefox'), h('Library/Containers/com.apple.Safari'),
    h('Documents'), h('Desktop'), h('Downloads'),
    h('.claude'), h('.claude.json')
  ]
}

/** La cartella dell'installazione di node (…/node per …/node/bin/node): si legge sempre, anche dentro un segreto. */
export function installazioniDiNode(): string[] {
  const trovati = [process.execPath, ...pathPulita().split(delimiter).map(d => join(d, 'node'))]
    .filter(p => /(^|\/)node$/.test(p) && existsSync(p))
  return [...new Set(trovati.map(p => dirname(dirname(vero(p)))))]
}

/** Quello che un `npm test` deve poter leggere oltre alla copia: il sistema e gli strumenti di sviluppo. */
const SISTEMA = ['/System', '/usr', '/bin', '/sbin', '/private/etc', '/etc', '/dev', '/opt/homebrew', '/private/var/db/timezone',
  '/private/var/db/dyld', '/Library/Preferences', '/Library/Developer', '/Library/Apple']

/**
 * Le porte per uscire dal recinto senza la rete: lanciare un'app (`open -a
 * Terminal x.command`), parlarle con Apple Events (`osascript`), o chiedere a
 * launchd di far partire qualcosa. Gli eseguibili e i servizi, chiusi tutti.
 */
export const LANCIATORI = ['/usr/bin/open', '/usr/bin/osascript', '/usr/bin/osacompile', '/usr/bin/automator', '/usr/bin/shortcuts',
  '/usr/bin/launchctl', '/usr/bin/lsappinfo', '/usr/bin/screencapture', '/usr/sbin/screencapture']
export const SERVIZI_CHIUSI = ['com.apple.coreservices.launchservicesd', 'com.apple.coreservices.appleevents', 'com.apple.CoreServices.coreservicesd',
  'com.apple.coreservices.quarantine-resolver', 'com.apple.lsd.mapdb', 'com.apple.lsd.modifydb', 'com.apple.lsd.open', 'com.apple.lsd.xpc',
  'com.apple.ScriptingAdditions', 'com.apple.AppleEvents']

/** Una stringa dentro il profilo: tra virgolette, con le virgolette e le barre protette. */
const q = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
const regexDi = (s: string, fine = '') => `#"^${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/"/g, '\\"')}${fine}"`

/**
 * Il profilo di sandbox-exec.
 *
 * L'ordine conta: in un profilo vale l'ultima regola che combacia, e solo se
 * nomina la stessa operazione (un `file-read*` largo non scavalca un
 * `file-read-data` preciso). Prima si nega, poi si apre il poco che serve.
 */
export function profilo(o: {
  /** Dove si può scrivere. Tutto il resto no. */
  scrivibili: string[]
  /** Si leggono sempre, anche dentro un segreto (la copia, sotto ~/.myynd). */
  leggibili?: string[]
  /** Non si leggono, e non si scrivono. */
  segreti: string[]
  /** Si legge solo un elenco (il sistema, node, `leggibili`, `scrivibili`) invece di tutto meno i segreti. */
  soloElenco?: boolean
  /** «locale»: solo questo computer. «libera»: tutta la rete (Claude Code deve parlare con Anthropic). */
  rete: 'locale' | 'libera'
  /** File singoli scrivibili per prefisso (il `.claude.json` di Claude Code, che si riscrive con un suffisso). */
  scrivibiliPrefisso?: string[]
  /** Dentro le scrivibili, questi no (le impostazioni di Claude Code: hook, comandi, CLAUDE.md). */
  nonScrivibili?: string[]
}): string {
  const righe = ['(version 1)', '(allow default)']
  if (o.rete === 'locale') {
    righe.push('(deny network*)')
    righe.push('(allow network-bind network-inbound (local ip "localhost:*"))')
    righe.push('(allow network-outbound (remote ip "localhost:*"))')
  }
  righe.push('(deny file-write*)')
  const scrivi = [...o.scrivibili.map(p => `(subpath ${q(vero(p))})`), ...(o.scrivibiliPrefisso ?? []).map(p => `(regex ${regexDi(vero(p))})`),
    '(literal "/dev/null")', '(literal "/dev/zero")', '(literal "/dev/tty")', '(literal "/dev/dtracehelper")', '(regex #"^/dev/fd/")', '(regex #"^/dev/tty")']
  righe.push(`(allow file-write* ${scrivi.join(' ')})`)

  const chiusi = o.segreti.map(p => vero(p))
  const aperti = [...new Set([...(o.leggibili ?? []), ...o.scrivibili, ...installazioniDiNode()].map(p => vero(p)))]
  if (o.soloElenco) {
    // i metadati restano (risalire le cartelle per trovare un percorso vero li chiede), il contenuto no
    righe.push('(deny file-read-data file-read-xattr)')
    const elenco = [...SISTEMA.map(p => `(subpath ${q(p)})`), '(literal "/")', '(regex #"^/Applications/Xcode[^/]*\\.app/")',
      ...aperti.map(p => `(subpath ${q(p)})`)]
    righe.push(`(allow file-read-data file-read-xattr ${elenco.join(' ')})`)
  }
  if (chiusi.length) righe.push(`(deny file-read-data file-read-xattr file-write* ${chiusi.map(p => `(subpath ${q(p)})`).join(' ')})`)
  const riaperti = aperti.filter(p => chiusi.some(s => p === s || p.startsWith(s + '/')))
  if (riaperti.length) {
    righe.push(`(allow file-read-data file-read-xattr ${riaperti.map(p => `(subpath ${q(p)})`).join(' ')})`)
    const scrivibiliChiusi = o.scrivibili.map(p => vero(p)).filter(p => chiusi.some(s => p === s || p.startsWith(s + '/')))
    if (scrivibiliChiusi.length) righe.push(`(allow file-write* ${scrivibiliChiusi.map(p => `(subpath ${q(p)})`).join(' ')})`)
  }
  if (o.nonScrivibili?.length) righe.push(`(deny file-write* ${o.nonScrivibili.map(p => `(regex ${regexDi(vero(p), '($|/)')})`).join(' ')})`)

  // niente app da lanciare e niente LaunchServices o Apple Events
  // le app installate (il Terminale, il Finder…), non gli eseguibili dentro gli strumenti di sviluppo (il Python di Xcode)
  righe.push(`(deny process-exec ${LANCIATORI.map(p => `(literal ${q(p)})`).join(' ')} (regex #"^(/System)?/Applications/[^/]+\\.app/Contents/MacOS/") (regex #"^/Users/[^/]+/Applications/[^/]+\\.app/Contents/MacOS/") (regex #"^/System/Library/CoreServices/[^/]+\\.app/Contents/MacOS/"))`)
  righe.push(`(deny mach-lookup ${SERVIZI_CHIUSI.map(s => `(global-name ${q(s)})`).join(' ')} (global-name-regex #"^com\\.apple\\.lsd\\."))`)
  return righe.join('\n')
}

/** sandbox-exec c'è e parte davvero: si prova una volta per processo. */
let provato: Promise<boolean> | null = null
export function sandboxDisponibile(): Promise<boolean> {
  if (process.platform !== 'darwin' || !existsSync(SANDBOX_EXEC)) return Promise.resolve(false)
  provato ??= new Promise(risolvi => {
    execFile(SANDBOX_EXEC, ['-p', '(version 1)(allow default)', '/usr/bin/true'], { timeout: 5000 }, e => risolvi(!e))
  })
  return provato
}

/** Per le prove: dimentica l'esito, o lo forza. */
export function perProvaSandbox(esito?: boolean): void {
  provato = esito === undefined ? null : Promise.resolve(esito)
}

/** L'argv dentro sandbox-exec, col profilo scritto in riga. */
export function avvolgi(argv: string[], prof: string): string[] {
  return [SANDBOX_EXEC, '-p', prof, ...argv]
}

/**
 * La cartella delle cache di questo utente (/var/folders/…/C): il portachiavi
 * e i framework ci scrivono. Sta accanto a quella temporanea (…/T), senza
 * chiedere niente a nessuno: nel server niente comandi sincroni.
 */
function cacheDiSistema(): string | null {
  if (process.platform !== 'darwin') return null
  const t = vero(process.env.TMPDIR || tmpdir())
  return /^\/private\/var\/folders\/[^/]+\/[^/]+\/T$/.test(t.replace(/\/$/, '')) ? join(dirname(t.replace(/\/$/, '')), 'C') : null
}

/**
 * Dove Claude Code scrive il suo stato: le sue cartelle di sessione, le
 * cache e i portachiavi (per rinnovare l'accesso), e la sua cartella
 * temporanea. Non `~/.local` (i suoi eseguibili, e `~/.local/bin` che sta
 * sulla PATH), non `/tmp` intero.
 */
export function scrivibiliDiClaude(casa = homedir(), temp?: string): { cartelle: string[]; prefissi: string[]; vietate: string[] } {
  const h = (p: string) => join(casa, p)
  const cache = cacheDiSistema()
  return {
    cartelle: [h('.claude'), h('.cache/claude'), h('Library/Caches/claude-cli-nodejs'), h('Library/Caches/com.anthropic.claude-code'),
      h('Library/Keychains'), ...(cache ? [cache] : []), ...(temp ? [temp] : [])],
    prefissi: [h('.claude.json')],
    // le impostazioni di Claude Code dentro ~/.claude: chi le scrive decide cosa parte da solo la volta dopo
    vietate: [h('.claude/settings.json'), h('.claude/settings.local.json'), h('.claude/CLAUDE.md'), h('.claude/commands'), h('.claude/agents'),
      h('.claude/skills'), h('.claude/hooks'), h('.claude/plugins'), h('.claude/output-styles'), h('.claude/keybindings.json')]
  }
}

/**
 * Il recinto di Claude Code: rete aperta (Anthropic), scritture solo nella
 * copia e nel suo stato, segreti chiusi tranne i suoi (`.claude`, i
 * portachiavi da cui legge l'accesso). La cartella del lavoro si legge anche
 * se sta nei Documenti o sulla Scrivania: per il piano è la cartella vera.
 */
export function profiloClaude(copia: string, scrittura: boolean, casa = homedir(), temp?: string): string {
  const suoi = scrivibiliDiClaude(casa, temp)
  const propri = new Set([join(casa, '.claude'), join(casa, '.claude.json'), join(casa, 'Library/Keychains')].map(vero))
  return profilo({
    rete: 'libera',
    scrivibili: [...(scrittura ? [copia] : []), ...suoi.cartelle],
    scrivibiliPrefisso: suoi.prefissi,
    nonScrivibili: suoi.vietate,
    leggibili: [copia, join(casa, '.config/claude')],
    segreti: segreti(casa).filter(s => !propri.has(vero(s)))
  })
}
