// Il rapporto di diagnosi: un file di testo sulla Scrivania, per chi prova Myynd.
//
// «Non funziona» detto da una tester vale poco senza sapere cosa ha visto
// l'app: che versione, che macOS, che motore, cosa è andato storto e quando.
// Il registro lo sa, ma sta in una cartella che nessuno apre, ed è pieno di
// cose sue: indirizzi, chiavi, i nomi dei suoi file. Qui se ne fa un file
// solo, leggibile, con tutto quello che è di lei coperto prima di scriverlo:
// gli indirizzi email, le chiavi e i gettoni, e i percorsi dentro la sua
// cartella di casa. Niente esce dal Mac: il file si scrive e basta, e lo
// manda lei se vuole.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { arch, homedir, release, userInfo } from 'node:os'
import { format } from 'node:util'
import { join } from 'node:path'

/** Quante righe del registro entrano nel rapporto. */
export const RIGHE = 500

// — il registro in memoria —

/*
 * Dentro l'app il registro sta su disco (`MYYND_REGISTRO`, lo passa il
 * guscio). Lanciato a mano non c'è: allora le ultime righe si tengono qui, a
 * partire dall'avvio. Uno per processo, ed è giusto così: il registro è del
 * processo, non di chi chiede.
 */
const memoria: string[] = []
let ascolto = false

/** Da qui in poi ogni riga di `console` si tiene anche in memoria, le ultime `RIGHE`. */
export function ascolta(): void {
  if (ascolto) return
  ascolto = true
  for (const k of ['log', 'warn', 'error'] as const) {
    const prima = console[k].bind(console)
    console[k] = (...a: unknown[]) => {
      try {
        memoria.push(`[${new Date().toISOString()}] ${format(...a)}`)
        if (memoria.length > RIGHE) memoria.splice(0, memoria.length - RIGHE)
      } catch { /* tenere una riga non deve mai rompere chi scrive */ }
      prima(...a)
    }
  }
}

/** Le ultime righe: dal file del guscio (con la sua copia `.1`), o da quelle tenute in memoria. */
export function ultimeRighe(percorso = process.env.MYYND_REGISTRO, quante = RIGHE): string[] {
  const leggi = (p: string) => { try { return readFileSync(p, 'utf8').split('\n').filter(Boolean) } catch { return [] } }
  if (percorso && existsSync(percorso)) {
    let righe = leggi(percorso)
    if (righe.length < quante) righe = [...leggi(`${percorso}.1`), ...righe]
    return righe.slice(-quante)
  }
  return memoria.slice(-quante)
}

// — coprire quello che è suo —

const segreto = '[secret]'

/**
 * Il testo, con quello che è suo coperto: chiavi e gettoni, indirizzi email,
 * percorsi dentro la cartella di casa (la sua e quelle di chiunque altro in
 * `/Users`), e il suo nome utente. Prima i segreti, che possono contenere una
 * chiocciola o una barra; poi le email; poi i percorsi.
 */
export function oscura(testo: string, o: { casa?: string; utente?: string } = {}): string {
  const casa = (o.casa ?? homedir()).replace(/\/+$/, '')
  const utente = o.utente ?? (() => { try { return userInfo().username } catch { return '' } })()
  let s = testo
  // chiavi dai formati noti: Anthropic, OpenAI, GitHub, Slack, AWS, Google, i JWT
  s = s.replace(/\b(?:sk-(?:ant-|proj-)?[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,}|xox[abprs]-[A-Za-z0-9-]{8,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,}|ya29\.[0-9A-Za-z._-]+|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+)/g, segreto)
  // «Bearer …», «Basic …»
  s = s.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{6,}/gi, `$1 ${segreto}`)
  // chiave=valore, "chiave": "valore", con i nomi che di solito tengono un segreto
  s = s.replace(/\b((?:x-)?api[_-]?key|apikey|token|access[_-]?token|refresh[_-]?token|id[_-]?token|secret|client[_-]?secret|password|passwd|pass|chiave|gettone|authorization|cookie|session|sessione)(["']?\s*[:=]\s*["']?)(?!(?:Bearer|Basic)\s)([^\s"',;&}]+)/gi, `$1$2${segreto}`)
  // i valori nelle query degli indirizzi: l'iCal privato, un codice OAuth
  s = s.replace(/([?&][A-Za-z0-9_.-]+=)[^\s&#"')]+/g, `$1${segreto}`)
  // indirizzi email
  s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
  // la sua cartella di casa, e quella di chiunque in /Users o /home: il percorso intero, spazi compresi
  if (casa && casa !== '/') s = s.split(casa).join('/~HOME~')
  s = copriPercorsi(s)
  // stringhe lunghe e opache, con lettere e cifre: gettoni senza nome (dopo i percorsi, che ne sembrerebbero)
  s = s.replace(/(?<![\w+])(?=[A-Za-z0-9_+-]*\d)(?=[A-Za-z0-9_+-]*[A-Za-z])[A-Za-z0-9_+-]{32,}={0,2}/g, segreto)
  // il nome utente rimasto in giro (una riga di `ps`, un nome macchina)
  if (utente && utente.length >= 3) s = s.replace(new RegExp(`\\b${utente.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), '[user]')
  return s
}

/** Dove finisce un percorso: una virgoletta, una parentesi, una virgola, un « · », o una parola che riprende la frase. */
const FINE_PERCORSO = /^(?:["'`)\]>,;\n]|\s+[·—-]\s|\s+(?:e|ed|o|and|or|per|for|non|not|in|on|da|from|to|a|con|with|is|è)\s)/i

/**
 * I percorsi nella casa coperti per intero. Su un Mac i nomi delle cartelle
 * hanno spazi («Progetti segreti/Contratto Rossi.pdf»), quindi il percorso
 * non finisce al primo spazio: finisce dove riprende la frase.
 */
function copriPercorsi(s: string): string {
  const inizio = /\/~HOME~|\/(?:Users|home)\/[^\s/"'`)\],;]+/g
  let fuori = ''
  let da = 0
  for (let m = inizio.exec(s); m; m = inizio.exec(s)) {
    if (m.index < da) continue
    let i = m.index + m[0].length
    while (i < s.length && !FINE_PERCORSO.test(s.slice(i, i + 12))) i++
    // gli spazi in coda non sono del percorso
    while (i > m.index + m[0].length && /\s/.test(s[i - 1])) i--
    fuori += s.slice(da, m.index) + '~/[path]'
    da = i
    inizio.lastIndex = i
  }
  return fuori + s.slice(da)
}

// — il rapporto —

export type Contenuto = {
  versione: string | null
  macos: string
  motore: string
  modelli: Record<string, string>
  salute: string
  mancate: { lavoro: string; volte: number; dal: string; ultima: string; perche: string }[]
  fonti: { fonte: string; rimedio?: string | null }[]
  righe: string[]
  adesso?: Date
}

/** La versione di macOS, chiesta a `sw_vers`; fuori da un Mac il sistema com'è. */
export function versioneMacOS(): string {
  if (process.platform !== 'darwin') return `${process.platform} ${release()} (${arch()})`
  try {
    const v = execFileSync('/usr/bin/sw_vers', ['-productVersion'], { encoding: 'utf8', timeout: 3000 }).trim()
    return `macOS ${v} (Darwin ${release()}, ${arch()})`
  } catch { return `macOS (Darwin ${release()}, ${arch()})` }
}

/** Il testo del rapporto, già coperto. In inglese: lo legge chi aiuta, non lei. */
export function rapporto(c: Contenuto, o: { casa?: string; utente?: string } = {}): string {
  const adesso = c.adesso ?? new Date()
  const testo = [
    'Myynd diagnostics report',
    `Created: ${adesso.toISOString()}`,
    `App version: ${c.versione ?? 'unknown'}`,
    `System: ${c.macos}`,
    `Node: ${process.version}`,
    '',
    `Engine: ${c.motore}`,
    `Models: ${Object.entries(c.modelli).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`,
    `Engine health: ${c.salute}`,
    '',
    'Model calls that failed (last failure per job):',
    ...(c.mancate.length ? c.mancate.map(m => `  ${m.lavoro}: ${m.volte}x since ${m.dal}, last ${m.ultima}: ${m.perche}`) : ['  none']),
    '',
    'Sources not read in full:',
    ...(c.fonti.length ? c.fonti.map(f => `  ${f.fonte}${f.rimedio ? ` (${f.rimedio})` : ''}`) : ['  none']),
    '',
    `Last ${c.righe.length} log lines:`,
    ...c.righe
  ].join('\n') + '\n'
  return oscura(testo, o)
}

/** Il nome del file: «Myynd diagnostics 2026-10-09 14.32.txt», con un numero se c'è già. */
export function nomeFile(dove: string, adesso = new Date()): string {
  const d = (n: number) => String(n).padStart(2, '0')
  const base = `Myynd diagnostics ${adesso.getFullYear()}-${d(adesso.getMonth() + 1)}-${d(adesso.getDate())} ${d(adesso.getHours())}.${d(adesso.getMinutes())}`
  let nome = `${base}.txt`
  for (let i = 2; existsSync(join(dove, nome)); i++) nome = `${base} ${i}.txt`
  return nome
}

/** Scrive il rapporto nella cartella data (la Scrivania) e torna il percorso. */
export function salva(dove: string, testo: string, adesso = new Date()): string {
  mkdirSync(dove, { recursive: true })
  const p = join(dove, nomeFile(dove, adesso))
  writeFileSync(p, testo, { mode: 0o600, flag: 'wx' })
  return p
}
