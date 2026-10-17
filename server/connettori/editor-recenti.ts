// Le cartelle e i file aperti di recente negli editor: VS Code, Cursor, Windsurf.
//
// Tutti e tre tengono la stessa memoria: `User/globalStorage/state.vscdb`, un
// SQLite con una tabella chiave-valore, dove `history.recentlyOpenedPathsList`
// è l'elenco di «Apri recenti»; e `User/workspaceStorage/<impronta>/`, una
// cartella per spazio di lavoro con un `workspace.json` che dice quale
// cartella è, e una data che dice quando è stato toccato. Si legge una copia
// del file (l'editor aperto lo tiene bloccato) e si tengono solo percorsi.

import { DatabaseSync } from 'node:sqlite'
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

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

/** Il valore di una chiave nel `state.vscdb`, letto da una copia. */
export function valoreDi(file: string, chiave: string): string | null {
  if (!existsSync(file)) return null
  const dir = mkdtempSync(join(tmpdir(), 'myynd-editor-'))
  let db: DatabaseSync | null = null
  try {
    const dentro = join(dir, 'state.vscdb')
    copyFileSync(file, dentro)
    if (existsSync(file + '-wal')) { try { copyFileSync(file + '-wal', dentro + '-wal') } catch { /* il resto basta */ } }
    db = new DatabaseSync(dentro, { readOnly: true })
    const r = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get(chiave) as { value: unknown } | undefined
    if (!r) return null
    return typeof r.value === 'string' ? r.value : r.value instanceof Uint8Array ? Buffer.from(r.value).toString('utf8') : null
  } catch {
    return null
  } finally {
    try { db?.close() } catch { /* già chiuso */ }
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Gli spazi di lavoro, ognuno con la data dell'ultima volta che l'editor ci ha scritto. */
export function spaziDiLavoro(cartella: string, editor: string): VoceEditor[] {
  let voci: string[] = []
  try { voci = readdirSync(cartella) } catch { return [] }
  const fuori: VoceEditor[] = []
  for (const v of voci) {
    const dir = join(cartella, v)
    try {
      const w = JSON.parse(readFileSync(join(dir, 'workspace.json'), 'utf8')) as { folder?: unknown; workspace?: unknown }
      const percorso = daUri(w.folder) ?? daUri(w.workspace)
      if (!percorso) continue
      const stato = join(dir, 'state.vscdb')
      const quando = statSync(existsSync(stato) ? stato : dir).mtime.toISOString()
      fuori.push({ editor, percorso, genere: daUri(w.folder) ? 'cartella' : 'spazio', quando })
    } catch { /* uno spazio senza workspace.json, o illeggibile */ }
  }
  return fuori.sort((a, b) => (b.quando ?? '').localeCompare(a.quando ?? ''))
}

/**
 * Tutto quello che gli editor ricordano, il più recente prima: gli spazi con
 * la loro data, poi gli «Apri recenti» che non c'erano già.
 */
export function leggiEditor(o: { casa?: string; tetto?: number } = {}): VoceEditor[] {
  const casa = o.casa ?? homedir()
  const tetto = o.tetto ?? 60
  const fuori: VoceEditor[] = []
  const visti = new Set<string>()
  for (const e of EDITOR) {
    const utente = join(casa, 'Library', 'Application Support', e.cartella, 'User')
    if (!existsSync(utente)) continue
    for (const s of spaziDiLavoro(join(utente, 'workspaceStorage'), e.editor).slice(0, tetto)) {
      const k = `${e.editor}\u0000${s.percorso}`
      if (visti.has(k)) continue
      visti.add(k); fuori.push(s)
    }
    const valore = valoreDi(join(utente, 'globalStorage', 'state.vscdb'), 'history.recentlyOpenedPathsList')
    for (const r of valore ? leggiRecenti(valore, e.editor) : []) {
      const k = `${e.editor}\u0000${r.percorso}`
      if (visti.has(k)) continue
      visti.add(k); fuori.push(r)
    }
  }
  return fuori.slice(0, tetto * EDITOR.length)
}
