// Le cartelle e i file aperti di recente negli editor: VS Code, Cursor, Windsurf.
//
// Tutti e tre tengono la stessa memoria: `User/globalStorage/state.vscdb`, un
// SQLite con una tabella chiave-valore, dove `history.recentlyOpenedPathsList`
// è l'elenco di «Apri recenti»; e `User/workspaceStorage/<impronta>/`, una
// cartella per spazio di lavoro con un `workspace.json` che dice quale
// cartella è, e una data che dice quando è stato toccato. Si legge una copia
// del file (l'editor aperto lo tiene bloccato) e si tengono solo percorsi.

import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
import { readdir, readFile, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { copiaBloccato, quandoCambiato } from './cronologia-browser.ts'

export type VoceEditor = { editor: string; percorso: string; genere: 'cartella' | 'file' | 'spazio'; quando: string | null }

export const EDITOR: { editor: string; cartella: string }[] = [
  { editor: 'VS Code', cartella: 'Code' },
  { editor: 'Cursor', cartella: 'Cursor' },
  { editor: 'Windsurf', cartella: 'Windsurf' }
]

/** Un `file://` in un percorso; null per tutto il resto (remoti, contenitori, vsls). */
export function daUri(uri: unknown): string | null {
  if (typeof uri !== 'string' || !uri.startsWith('file://')) return null
  try { return fileURLToPath(uri) } catch { return null }
}

/** Il valore di `history.recentlyOpenedPathsList`: gli elementi, nell'ordine dell'editor. */
export function leggiRecenti(valore: string, editor: string): VoceEditor[] {
  let v: unknown
  try { v = JSON.parse(valore) } catch { return [] }
  const voci = (v as { entries?: unknown })?.entries
  if (!Array.isArray(voci)) return []
  const fuori: VoceEditor[] = []
  for (const e of voci.slice(0, 50)) {
    if (!e || typeof e !== 'object') continue
    const x = e as { folderUri?: unknown; fileUri?: unknown; workspace?: { configPath?: unknown } }
    const cartella = daUri(x.folderUri)
    if (cartella) { fuori.push({ editor, percorso: cartella, genere: 'cartella', quando: null }); continue }
    const file = daUri(x.fileUri)
    if (file) { fuori.push({ editor, percorso: file, genere: 'file', quando: null }); continue }
    const spazio = daUri(x.workspace?.configPath)
    if (spazio) fuori.push({ editor, percorso: spazio, genere: 'spazio', quando: null })
  }
  return fuori
}

/** Oltre questa grandezza il `state.vscdb` non si copia: si dice una volta, e si va avanti senza. */
export const STATO_MASSIMO = 50 * 1024 * 1024
const troppoGrandi = new Set<string>()
/** L'ultima lettura di ogni file, con la sua data: un file che non cambia non si ricopia. */
const letti = new Map<string, { mtime: number; valore: string | null }>()

/** Il valore di una chiave nel `state.vscdb`, letto da una copia, e solo se il file è cambiato. */
export async function valoreDi(file: string, chiave: string): Promise<string | null> {
  let info
  try { info = await stat(file) } catch { return null }
  if (info.size > STATO_MASSIMO) {
    if (!troppoGrandi.has(file)) { troppoGrandi.add(file); console.warn(`myynd · editor: ${file} è troppo grande, non lo leggo`) }
    return null
  }
  const mtime = await quandoCambiato(file)
  const k = `${file}\u0000${chiave}`
  const prima = letti.get(k)
  if (prima && prima.mtime === mtime) return prima.valore
  const c = await copiaBloccato(file, 'state.vscdb', 'myynd-editor-')
  if (!c) return null
  let db: DatabaseSync | null = null
  let valore: string | null = null
  try {
    db = new DatabaseSync(c.file, { readOnly: true })
    const r = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get(chiave) as { value: unknown } | undefined
    valore = !r ? null : typeof r.value === 'string' ? r.value : r.value instanceof Uint8Array ? Buffer.from(r.value).toString('utf8') : null
  } catch {
    valore = null
  } finally {
    try { db?.close() } catch { /* già chiuso */ }
    await rm(c.dir, { recursive: true, force: true })
  }
  letti.set(k, { mtime, valore })
  return valore
}

/** Gli spazi di lavoro, ognuno con la data dell'ultima volta che l'editor ci ha scritto. */
export async function spaziDiLavoro(cartella: string, editor: string): Promise<VoceEditor[]> {
  let voci: string[] = []
  try { voci = await readdir(cartella) } catch { return [] }
  const fuori: VoceEditor[] = []
  for (const v of voci) {
    const dir = join(cartella, v)
    try {
      const w = JSON.parse(await readFile(join(dir, 'workspace.json'), 'utf8')) as { folder?: unknown; workspace?: unknown }
      const percorso = daUri(w.folder) ?? daUri(w.workspace)
      if (!percorso) continue
      let quando: string
      try { quando = (await stat(join(dir, 'state.vscdb'))).mtime.toISOString() } catch { quando = (await stat(dir)).mtime.toISOString() }
      fuori.push({ editor, percorso, genere: daUri(w.folder) ? 'cartella' : 'spazio', quando })
    } catch { /* uno spazio senza workspace.json, o illeggibile */ }
  }
  return fuori.sort((a, b) => (b.quando ?? '').localeCompare(a.quando ?? ''))
}

/**
 * Tutto quello che gli editor ricordano, il più recente prima: gli spazi con
 * la loro data, poi gli «Apri recenti» che non c'erano già (senza data).
 */
export async function leggiEditor(o: { casa?: string; tetto?: number } = {}): Promise<VoceEditor[]> {
  const casa = o.casa ?? homedir()
  const tetto = o.tetto ?? 60
  const fuori: VoceEditor[] = []
  const visti = new Set<string>()
  for (const e of EDITOR) {
    const utente = join(casa, 'Library', 'Application Support', e.cartella, 'User')
    if (!existsSync(utente)) continue
    for (const s of (await spaziDiLavoro(join(utente, 'workspaceStorage'), e.editor)).slice(0, tetto)) {
      const k = `${e.editor}\u0000${s.percorso}`
      if (visti.has(k)) continue
      visti.add(k); fuori.push(s)
    }
    const valore = await valoreDi(join(utente, 'globalStorage', 'state.vscdb'), 'history.recentlyOpenedPathsList')
    for (const r of valore ? leggiRecenti(valore, e.editor) : []) {
      const k = `${e.editor}\u0000${r.percorso}`
      if (visti.has(k)) continue
      visti.add(k); fuori.push(r)
    }
  }
  return fuori.slice(0, tetto * EDITOR.length)
}
