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
//     niente scritture fuori dalla copia e dalla sua cartella temporanea,
//     niente letture delle cartelle dei segreti (~/.myynd, ~/.ssh, ~/.aws, i
//     portachiavi…). Se sandbox-exec manca o non parte, resta il primo muro, e
//     il risultato lo dice: contenimento «parziale».
//
// Claude Code ha un recinto suo, più largo: deve parlare con Anthropic e
// scrivere il suo stato, ma non scrive fuori dalla copia e non legge i segreti
// di Myynd né quelli della persona.

import { execFile } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
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

/** Le cartelle dove un comando si cerca: quella di node, e quelle di sistema. Mai la PATH di chi ha lanciato Myynd. */
export function pathPulita(): string {
  // nell'app impacchettata execPath è Electron, non node: allora node si cerca dove lo mettono le installazioni comuni
  const dirs = [dirname(process.execPath), join(homedir(), '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']
  return [...new Set(dirs)].join(delimiter)
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
 * gettoni delle fonti, senza niente di `MYYND_*`.
 */
export function ambienteClaude(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const fuori: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) continue
    if (PER_CLAUDE.has(k) || k.startsWith('LC_') || k.startsWith('CLAUDE_')) fuori[k] = v
  }
  return fuori
}

/** Le cartelle e i file dei segreti, in casa e di Myynd. Quelli che non esistono non fanno male. */
export function segreti(casa = homedir()): string[] {
  const h = (p: string) => join(casa, p)
  return [
    DATI, h('.myynd'),
    h('.ssh'), h('.aws'), h('.gnupg'), h('.azure'), h('.kube'), h('.docker'), h('.config/gcloud'), h('.config/gh'),
    h('.netrc'), h('.npmrc'), h('.pypirc'), h('.git-credentials'), h('.codex'), h('.hermes'),
    h('Library/Keychains'), h('Library/Cookies'), h('Library/Mail'), h('Library/Messages'),
    h('Library/Application Support/Myynd'), h('Library/Application Support/myynd'),
    h('.claude'), h('.claude.json')
  ]
}

/** La cartella dell'installazione di node (…/node per …/node/bin/node): si legge sempre, anche dentro un segreto. */
export function installazioniDiNode(): string[] {
  const trovati = [process.execPath, ...pathPulita().split(delimiter).map(d => join(d, 'node'))]
    .filter(p => /(^|\/)node$/.test(p) && existsSync(p))
  return [...new Set(trovati.map(p => dirname(dirname(vero(p)))))]
}

/** Una stringa dentro il profilo: tra virgolette, con le virgolette e le barre protette. */
const q = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
const regexDi = (s: string) => `#"^${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/"/g, '\\"')}"`

/**
 * Il profilo di sandbox-exec.
 *
 * L'ordine conta: in un profilo vale l'ultima regola che combacia. Prima si
 * nega, poi si apre il poco che serve: la copia si legge anche se sta dentro
 * la cartella di Myynd, che per tutto il resto è chiusa.
 */
export function profilo(o: {
  /** Dove si può scrivere. Tutto il resto no. */
  scrivibili: string[]
  /** Si leggono anche se stanno dentro un segreto (la copia, sotto ~/.myynd). */
  leggibili?: string[]
  /** Non si leggono, e non si scrivono. */
  segreti: string[]
  /** «locale»: solo questo computer. «libera»: tutta la rete (Claude Code deve parlare con Anthropic). */
  rete: 'locale' | 'libera'
  /** File singoli scrivibili per espressione (il `.claude.json` di Claude Code, che si riscrive con un suffisso). */
  scrivibiliPrefisso?: string[]
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
  if (chiusi.length) righe.push(`(deny file-read-data file-read-xattr file-write* ${chiusi.map(p => `(subpath ${q(p)})`).join(' ')})`)
  // node stesso può stare dentro una cartella chiusa (~/.hermes/node): senza, npm muore all'avvio
  const aperti = [...new Set([...(o.leggibili ?? []), ...o.scrivibili, ...installazioniDiNode()].map(p => vero(p)))]
    .filter(p => chiusi.some(s => p === s || p.startsWith(s + '/')))
  if (aperti.length) {
    // le stesse operazioni del divieto: un `file-read*` largo non scavalca un `file-read-data` preciso
    righe.push(`(allow file-read-data file-read-xattr ${aperti.map(p => `(subpath ${q(p)})`).join(' ')})`)
    const scrivibiliChiusi = o.scrivibili.map(p => vero(p)).filter(p => chiusi.some(s => p === s || p.startsWith(s + '/')))
    if (scrivibiliChiusi.length) righe.push(`(allow file-write* ${scrivibiliChiusi.map(p => `(subpath ${q(p)})`).join(' ')})`)
  }
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
 * Dove Claude Code scrive il suo stato: le sue cartelle, le cache e i
 * portachiavi (per rinnovare l'accesso). Tutto il resto della casa è chiuso.
 */
export function scrivibiliDiClaude(casa = homedir()): { cartelle: string[]; prefissi: string[] } {
  const h = (p: string) => join(casa, p)
  return {
    cartelle: [h('.claude'), h('.local/share/claude'), h('.local/state/claude'), h('.local/bin'), h('.cache'), h('Library/Caches'),
      h('Library/Keychains'), h('.config/claude'), '/private/tmp', '/private/var/folders'],
    prefissi: [h('.claude.json')]
  }
}

/**
 * Il recinto di Claude Code: rete aperta (Anthropic), scritture solo nella
 * copia e nel suo stato, segreti chiusi tranne i suoi (`.claude`, i
 * portachiavi da cui legge l'accesso).
 */
export function profiloClaude(copia: string, scrittura: boolean, casa = homedir()): string {
  const suoi = scrivibiliDiClaude(casa)
  const propri = new Set([join(casa, '.claude'), join(casa, '.claude.json'), join(casa, 'Library/Keychains')].map(vero))
  return profilo({
    rete: 'libera',
    scrivibili: [...(scrittura ? [copia] : []), ...suoi.cartelle],
    scrivibiliPrefisso: suoi.prefissi,
    leggibili: [copia],
    segreti: segreti(casa).filter(s => !propri.has(vero(s)))
  })
}
