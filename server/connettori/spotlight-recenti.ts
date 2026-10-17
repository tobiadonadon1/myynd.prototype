// I file usati di recente, come li sa Spotlight: nessun permesso, nessun contenuto.
//
// `mdfind` risponde con i file aperti negli ultimi sette giorni sotto la
// cartella di casa, con quando e quante volte. Si tiene il percorso e quei
// due numeri: mai il contenuto, mai un'anteprima. Library, le cache,
// node_modules e le cartelle `.git` non sono lavoro suo e restano fuori.
//
// Le cartelle `.git` che Spotlight conosce (a tre livelli al massimo sotto
// casa) dicono dove stanno i repository: li legge `git-profondo.ts`.
//
// La lettura dell'uscita è pura e provata su esempi scritti a mano: il comando
// vero non gira mai in una prova, guarderebbe il Mac di chi le fa girare.

import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { sep } from 'node:path'

export type FileRecente = { percorso: string; usato: string; volte: number }

/** Le cartelle e i nomi che non sono lavoro: Library, cache, dipendenze, storia di git. */
const FUORI = /(^|\/)(Library|\.Trash|\.cache|Caches|node_modules|\.git|\.npm|\.cargo|\.rustup|\.venv|venv|__pycache__|DerivedData|\.next|dist|build)(\/|$)/
const NASCOSTO = /(^|\/)\.[^/]+/

/** Gli argomenti di `mdfind` per i file usati negli ultimi `giorni` giorni sotto `casa`. */
export function argomentiRecenti(casa: string, giorni = 7): string[] {
  return ['-onlyin', casa, '-attr', 'kMDItemLastUsedDate', '-attr', 'kMDItemUseCount', `kMDItemLastUsedDate >= $time.today(-${Math.max(1, Math.floor(giorni))})`]
}

/** Gli argomenti per le cartelle `.git` che Spotlight conosce sotto casa. */
export function argomentiRepository(casa: string): string[] {
  return ['-onlyin', casa, 'kMDItemFSName == ".git"']
}

/**
 * Una data di Spotlight, «2026-10-16 09:12:33 +0000», in ISO; null se non lo è.
 */
export function dataSpotlight(s: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/.exec(s.trim())
  if (!m) return null
  const t = Date.parse(`${m[1]}T${m[2]}${m[3]}:${m[4]}`)
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}

/** Un percorso che non è lavoro: fuori da casa, dentro Library o una cache, o nascosto. */
export function daSaltare(percorso: string, casa: string): boolean {
  if (!percorso.startsWith(casa + sep) && !percorso.startsWith(casa + '/')) return true
  const dentro = percorso.slice(casa.length)
  return FUORI.test(dentro) || NASCOSTO.test(dentro)
}

/**
 * L'uscita di `mdfind -attr kMDItemLastUsedDate -attr kMDItemUseCount`, una
 * riga per file:
 *
 *   /Users/x/Documents/Offerta.pages   kMDItemLastUsedDate = 2026-10-16 09:12:33 +0000   kMDItemUseCount = 4
 *
 * I percorsi possono avere spazi: il percorso è tutto quello che sta prima
 * del primo attributo. Un valore «(null)» vuol dire che Spotlight non lo sa.
 */
export function leggiUscita(testo: string, casa: string, tetto = 400): FileRecente[] {
  const fuori: FileRecente[] = []
  for (const riga of testo.split('\n')) {
    if (fuori.length >= tetto) break
    const i = riga.search(/\s+kMDItem\w+ = /)
    if (i <= 0) continue
    const percorso = riga.slice(0, i).trim()
    const attributi = riga.slice(i)
    const data = /kMDItemLastUsedDate = (.+?)(?=\s+kMDItem|\s*$)/.exec(attributi)?.[1] ?? ''
    const volte = Number(/kMDItemUseCount = (\d+)/.exec(attributi)?.[1] ?? 1)
    const usato = dataSpotlight(data)
    if (!usato || daSaltare(percorso, casa)) continue
    fuori.push({ percorso, usato, volte: Number.isFinite(volte) && volte > 0 ? volte : 1 })
  }
  return fuori.sort((a, b) => b.usato.localeCompare(a.usato))
}

/** Le cartelle dei repository dall'uscita di `mdfind … .git`: tre livelli al massimo sotto casa. */
export function leggiRepository(testo: string, casa: string, profondita = 3): string[] {
  const fuori = new Set<string>()
  for (const riga of testo.split('\n')) {
    const p = riga.trim()
    if (!p.endsWith('/.git') || !p.startsWith(casa + '/')) continue
    const cartella = p.slice(0, -'/.git'.length)
    const livelli = cartella.slice(casa.length + 1).split('/').filter(Boolean)
    if (!livelli.length || livelli.length > profondita) continue
    if (FUORI.test('/' + livelli.join('/')) || livelli.some(l => l.startsWith('.'))) continue
    fuori.add(cartella)
  }
  return [...fuori]
}

export type Esegui = (cmd: string, argomenti: string[]) => Promise<string>

/**
 * Il comando, con un tetto all'uscita. Oltre il tetto non si butta tutto:
 * si tiene quello che è arrivato fino all'ultima riga intera, che basta
 * (le righe sono già i file usati per ultimi, e il resto si legge al giro dopo).
 */
export function creaEsegui(tetto = 8 << 20): Esegui {
  return (cmd, argomenti) => new Promise(risolvi => {
    execFile(cmd, argomenti, { timeout: 20_000, maxBuffer: tetto }, (errore, stdout) => {
      const uscita = String(stdout ?? '')
      if (!errore) return risolvi(uscita)
      const pieno = (errore as NodeJS.ErrnoException).code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
      risolvi(pieno ? uscita.slice(0, uscita.lastIndexOf('\n') + 1) : '')
    })
  })
}
const eseguiVero = creaEsegui()

/** I file usati negli ultimi sette giorni. `esegui` si cambia solo nelle prove. */
export async function recenti(o: { casa?: string; giorni?: number; esegui?: Esegui } = {}): Promise<FileRecente[]> {
  const casa = o.casa ?? homedir()
  return leggiUscita(await (o.esegui ?? eseguiVero)('mdfind', argomentiRecenti(casa, o.giorni)), casa)
}

/** I repository che Spotlight conosce sotto casa. */
export async function repository(o: { casa?: string; esegui?: Esegui } = {}): Promise<string[]> {
  const casa = o.casa ?? homedir()
  return leggiRepository(await (o.esegui ?? eseguiVero)('mdfind', argomentiRepository(casa)), casa)
}
