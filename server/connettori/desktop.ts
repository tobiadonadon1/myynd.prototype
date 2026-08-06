// Il desktop: legge le cartelle che scegli tu.
//
// Legge i documenti veri — PDF, Word, testo, Markdown — e salta i progetti di
// codice, che altrimenti riempirebbero l'indice di file macchina invece che
// delle tue cose.

import { readdir, readFile, stat } from 'node:fs/promises'
import { join, extname, basename, resolve } from 'node:path'
import { homedir } from 'node:os'
import type { ConfigDesktop } from '../config.ts'
import type { Documento } from '../store.ts'

/** Quello che è un documento per una persona, non per un compilatore. */
const TESTO = ['.md', '.markdown', '.txt', '.rtf', '.csv', '.org', '.tex']
const RICCHI = ['.pdf', '.docx']
export const LETTI = [...RICCHI, ...TESTO]

/** Cartelle che non contengono mai roba tua. */
const SALTA = new Set([
  'node_modules', '.git', '.svn', '.hg', 'Library', 'System', '.Trash', '.cache',
  'dist', 'build', 'out', '.next', '.nuxt', 'target', 'venv', '.venv', 'env',
  '__pycache__', 'vendor', 'Pods', 'DerivedData', '.gradle', '.idea', '.vscode',
  'coverage', '.pytest_cache', '.mypy_cache', 'site-packages', 'bower_components'
])

/** Se una cartella ha uno di questi, è un progetto di codice: la salto tutta. */
const SEGNI_PROGETTO = [
  'package.json', 'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle',
  'requirements.txt', 'pyproject.toml', 'Gemfile', 'composer.json',
  'CMakeLists.txt', 'Makefile', '.git'
]

const MAX_FILE = 12_000_000     // i PDF pesano
const MAX_TESTO = 20_000
const MAX_TOTALE = 4000

export function suggerimenti(): string[] {
  const h = homedir()
  return [join(h, 'Desktop'), join(h, 'Documents'), join(h, 'Downloads')]
}

async function eProgetto(cartella: string, voci: { name: string }[]): Promise<boolean> {
  const nomi = new Set(voci.map(v => v.name))
  return SEGNI_PROGETTO.some(s => nomi.has(s))
}

/** Tira fuori il testo da un PDF o da un .docx. */
async function estrai(percorso: string, ext: string): Promise<string> {
  const buf = await readFile(percorso)
  if (ext === '.pdf') {
    const { PDFParse } = await import('pdf-parse')
    const p = new PDFParse({ data: new Uint8Array(buf) })
    try {
      const r = await p.getText()
      return (r.text || '').trim()
    } finally {
      await p.destroy()
    }
  }
  if (ext === '.docx') {
    const { default: mammoth } = await import('mammoth')
    const r = await mammoth.extractRawText({ buffer: buf })
    return (r.value || '').trim()
  }
  return buf.toString('utf8').trim()
}

export type Esito = { docs: Documento[]; saltatiProgetti: string[]; falliti: number }

async function cammina(radice: string, fuori: Esito, profondita = 0) {
  if (fuori.docs.length >= MAX_TOTALE || profondita > 6) return
  let voci
  try {
    voci = await readdir(radice, { withFileTypes: true })
  } catch {
    return
  }

  // un progetto di codice non è materiale tuo: lo salto intero
  if (profondita > 0 && await eProgetto(radice, voci)) {
    fuori.saltatiProgetti.push(radice)
    return
  }

  for (const v of voci) {
    if (fuori.docs.length >= MAX_TOTALE) return
    if (v.name.startsWith('.') || SALTA.has(v.name)) continue
    const p = join(radice, v.name)

    if (v.isDirectory()) {
      await cammina(p, fuori, profondita + 1)
      continue
    }
    if (!v.isFile()) continue

    const ext = extname(v.name).toLowerCase()
    if (!LETTI.includes(ext)) continue

    try {
      const s = await stat(p)
      if (s.size > MAX_FILE || s.size === 0) continue
      const corpo = await estrai(p, ext)
      if (corpo.length < 20) continue     // un file vuoto non è un documento
      fuori.docs.push({
        id: `desktop:${p}`,
        fonte: 'desktop',
        tipo: ext === '.pdf' ? 'pdf' : ext === '.docx' ? 'documento' : 'file',
        titolo: basename(p),
        corpo: corpo.slice(0, MAX_TESTO),
        autore: null,
        percorso: p,
        quando: s.mtime.toISOString(),
        gruppo: 'documenti'
      })
    } catch {
      fuori.falliti++
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

export async function sincronizza(
  c: ConfigDesktop,
  avanzamento?: (fatti: number) => void
): Promise<Esito> {
  const esito: Esito = { docs: [], saltatiProgetti: [], falliti: 0 }
  for (const cartella of c.cartelle) {
    const prima = esito.docs.length
    await cammina(resolve(cartella), esito)
    if (avanzamento) avanzamento(esito.docs.length - prima)
  }
  return esito
}
