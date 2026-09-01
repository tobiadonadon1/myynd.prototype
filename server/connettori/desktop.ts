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
import { daBuffer, LETTI, tipoDi } from './estrai.ts'

export { LETTI }


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

export type Esito = {
  docs: Documento[]
  saltatiProgetti: string[]
  falliti: number
  illeggibili: string[]
  troncato: boolean
  /** Le radici percorse fino in fondo: solo queste si possono riconciliare. */
  complete: string[]
  /**
   * I file che ci sono ancora ma che stavolta non abbiamo indicizzato.
   *
   * Esistere ed essere stato riletto sono due cose diverse, e `riconcilia`
   * conosceva solo la seconda: un file saltato perché troppo grande o perché
   * vuoto finiva fuori dagli id visti e veniva cancellato dall'indice — con la
   * cartella dichiarata «completa» e zero errori, quindi senza che niente
   * lasciasse traccia. Questo elenco tiene in vita quello che c'è ma che
   * stavolta non abbiamo letto.
   */
  visti: string[]
}

async function cammina(radice: string, fuori: Esito, tetto: number, profondita = 0) {
  // fermarsi è legittimo, farlo in silenzio no: chi si ferma qui senza dirlo
  // fa credere a riconcilia() che il resto della cartella non esista più
  if (fuori.docs.length >= tetto) { fuori.troncato = true; return }
  if (profondita > 6) { fuori.troncato = true; return }
  let voci
  try {
    voci = await readdir(radice, { withFileTypes: true })
  } catch (e) {
    // permessi negati (tipico con la privacy di macOS) o disco staccato:
    // vanno detti, non ingoiati — sono la differenza fra «non c'è più» e
    // «non sono riuscito a guardare»
    const code = (e as { code?: string }).code
    if (code === 'EACCES' || code === 'EPERM' || code === 'ENOENT' || code === 'ENOTDIR') {
      fuori.illeggibili.push(radice)
    } else {
      fuori.falliti++
    }
    return
  }

  // un progetto di codice non è materiale tuo: lo salto intero
  if (profondita > 0 && await eProgetto(radice, voci)) {
    fuori.saltatiProgetti.push(radice)
    return
  }

  for (const v of voci) {
    if (fuori.docs.length >= tetto) { fuori.troncato = true; return }
    if (v.name.startsWith('.') || SALTA.has(v.name)) continue
    const p = join(radice, v.name)

    if (v.isDirectory()) {
      await cammina(p, fuori, tetto, profondita + 1)
      continue
    }
    if (!v.isFile()) continue

    const ext = extname(v.name).toLowerCase()
    if (!LETTI.includes(ext)) continue

    try {
      const s = await stat(p)
      // Un file che esiste ma che stavolta non indicizziamo va comunque
      // dichiarato vivo. Senza questa riga finiva fuori dall'elenco dei visti,
      // la radice veniva lo stesso dichiarata «completa» — nessun errore,
      // nessun permesso negato — e `riconcilia` lo cancellava dall'indice.
      // Cioè: un PDF cresciuto oltre i dodici mega spariva dalla mente, e
      // spariva *perché era diventato grande*.
      if (s.size > MAX_FILE || s.size === 0) { fuori.visti.push(`desktop:${p}`); continue }
      const corpo = await Promise.race([
        readFile(p).then(b => daBuffer(b, v.name)),
        new Promise<string>((_, no) => setTimeout(() => no(new Error('troppo lento')), 25_000))
      ])
      // un file vuoto non è un documento — ma esiste, e va detto
      if (corpo.length < 20) { fuori.visti.push(`desktop:${p}`); continue }
      fuori.docs.push({
        id: `desktop:${p}`,
        fonte: 'desktop',
        tipo: tipoDi(v.name),
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
  const esito: Esito = { docs: [], saltatiProgetti: [], falliti: 0, illeggibili: [], troncato: false, complete: [], visti: [] }
  // il tetto è per cartella: una cartella enorme non deve affamare le altre
  const perCartella = Math.max(200, Math.floor(MAX_TOTALE / Math.max(1, c.cartelle.length)))
  for (const cartella of c.cartelle) {
    const prima = esito.docs.length
    const illeggibiliPrima = esito.illeggibili.length
    const fallitiPrima = esito.falliti
    const radice = resolve(cartella)

    await cammina(radice, esito, prima + perCartella)

    // Una radice si può riconciliare solo se è stata percorsa tutta: niente
    // tetto raggiunto, nessuna cartella figlia illeggibile, nessun file caduto.
    // `troncato` è appiccicoso di proposito — dopo il primo tetto nessuna
    // radice successiva è più affidabile, perché il tetto è condiviso.
    const pulita = !esito.troncato
      && esito.illeggibili.length === illeggibiliPrima
      && esito.falliti === fallitiPrima
    if (pulita) esito.complete.push(radice)

    if (avanzamento) avanzamento(esito.docs.length - prima)
  }
  return esito
}
