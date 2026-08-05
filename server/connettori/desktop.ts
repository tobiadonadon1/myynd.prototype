// Il desktop: legge le cartelle che scegli tu e indicizza i file di testo.
// Non esce dalle cartelle indicate e non tocca niente — legge e basta.

import { readdir, readFile, stat } from 'node:fs/promises'
import { join, extname, basename, resolve } from 'node:path'
import { homedir } from 'node:os'
import type { ConfigDesktop } from '../config.ts'
import type { Documento } from '../store.ts'

const ESTENSIONI = ['.md', '.txt', '.markdown', '.rtf', '.csv', '.json', '.yaml', '.yml', '.org', '.tex']
const SALTA = new Set([
  'node_modules', '.git', '.svn', 'Library', 'System', '.Trash', '.cache',
  'dist', 'build', 'out', '.next', 'venv', '.venv', '__pycache__', 'vendor', '.DS_Store'
])
const MAX_FILE = 400_000
const MAX_TOTALE = 3000

export function suggerimenti(): string[] {
  const h = homedir()
  return [join(h, 'Desktop'), join(h, 'Documents'), join(h, 'Downloads')]
}

async function cammina(radice: string, fuori: Documento[], profondita = 0) {
  if (fuori.length >= MAX_TOTALE || profondita > 6) return
  let voci
  try {
    voci = await readdir(radice, { withFileTypes: true })
  } catch {
    return // cartella senza permessi: la salto
  }
  for (const v of voci) {
    if (fuori.length >= MAX_TOTALE) return
    if (v.name.startsWith('.') || SALTA.has(v.name)) continue
    const p = join(radice, v.name)
    if (v.isDirectory()) {
      await cammina(p, fuori, profondita + 1)
    } else if (v.isFile() && ESTENSIONI.includes(extname(v.name).toLowerCase())) {
      try {
        const s = await stat(p)
        if (s.size > MAX_FILE || s.size === 0) continue
        const corpo = await readFile(p, 'utf8')
        if (!corpo.trim()) continue
        fuori.push({
          id: `desktop:${p}`,
          fonte: 'desktop',
          tipo: 'file',
          titolo: basename(p),
          corpo: corpo.slice(0, 20_000),
          autore: null,
          percorso: p,
          quando: s.mtime.toISOString(),
          gruppo: 'documenti'
        })
      } catch {
        // file binario travestito da testo, o permessi mancanti
      }
    }
  }
}

export async function prova(c: ConfigDesktop): Promise<{ ok: true; cartelle: string[] } | { ok: false; errore: string }> {
  const buone: string[] = []
  for (const cartella of c.cartelle) {
    try {
      const s = await stat(resolve(cartella))
      if (s.isDirectory()) buone.push(cartella)
    } catch {
      return { ok: false, errore: `Non riesco ad aprire ${cartella}` }
    }
  }
  if (!buone.length) return { ok: false, errore: 'Nessuna cartella valida.' }
  return { ok: true, cartelle: buone }
}

export async function sincronizza(c: ConfigDesktop): Promise<Documento[]> {
  const docs: Documento[] = []
  for (const cartella of c.cartelle) await cammina(resolve(cartella), docs)
  return docs
}
