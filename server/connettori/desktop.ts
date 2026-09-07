// Il desktop: legge le cartelle che scegli tu.
//
// Legge i documenti veri — PDF, Word, testo, Markdown — e salta i progetti di
// codice, che altrimenti riempirebbero l'indice di file macchina invece che
// delle tue cose.

import { readdir, readFile, stat } from 'node:fs/promises'
import { join, extname, basename, resolve, relative, sep } from 'node:path'
import type { Stats } from 'node:fs'
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
/** Sotto la radice: le cartelle fino a questa profondità si percorrono, oltre no. */
const MAX_PROFONDITA = 6

export function suggerimenti(): string[] {
  const h = homedir()
  return [join(h, 'Desktop'), join(h, 'Documents'), join(h, 'Downloads')]
}

async function eProgetto(cartella: string, voci: { name: string }[]): Promise<boolean> {
  const nomi = new Set(voci.map(v => v.name))
  return SEGNI_PROGETTO.some(s => nomi.has(s))
}

/**
 * Un percorso che la lettura salterebbe: la stessa regola di `cammina`, ma
 * per un file solo.
 *
 * Serve alla vedetta, che riceve un percorso alla volta e non percorre
 * niente: senza questa funzione avrebbe avuto le sue regole, e un file
 * ignorato dalla lettura delle sei ore sarebbe entrato dal vivo — un
 * `README.md` dentro un progetto di codice, per dire. Non pretende che il
 * percorso esista ancora: per un file appena cancellato si giudica dal nome,
 * e una cartella madre che non si apre più non è un progetto.
 */
export async function daSaltare(percorso: string, radice: string, eCartella = false): Promise<boolean> {
  const rel = relative(resolve(radice), resolve(percorso))
  if (!rel || rel.startsWith('..')) return true
  const pezzi = rel.split(sep)
  if (pezzi.some(n => n.startsWith('.') || SALTA.has(n))) return true
  // le cartelle: quelle in mezzo, e la cartella stessa se è una cartella
  const cartelle = eCartella ? pezzi : pezzi.slice(0, -1)
  if (cartelle.length > MAX_PROFONDITA) return true
  if (!eCartella && !LETTI.includes(extname(pezzi[pezzi.length - 1]!).toLowerCase())) return true
  let qui = resolve(radice)
  for (const n of cartelle) {
    qui = join(qui, n)
    let voci: { name: string }[]
    try { voci = await readdir(qui, { withFileTypes: true }) } catch { return false }
    if (await eProgetto(qui, voci)) return true
  }
  return false
}

/**
 * Un file solo, con le stesse regole e gli stessi limiti di `cammina`.
 *
 * `null` è «esiste ma non è un documento»: troppo grande, vuoto, o senza
 * niente da leggere dentro. Un errore di lettura si lancia, non si ingoia —
 * chi chiama sa distinguere «non l'ho letto» da «non c'è niente».
 */
export async function leggiUno(percorso: string, s?: Stats): Promise<Documento | null> {
  const p = resolve(percorso)
  const nome = basename(p)
  const st = s ?? await stat(p)
  if (!st.isFile() || st.size > MAX_FILE || st.size === 0) return null
  /*
   * La corsa resta, ma adesso è una rete e non *la* rete.
   *
   * Fin qui era l'unico riparo contro un PDF che manda pdfjs in bambola, e
   * non poteva funzionare: l'estrazione girava su questo stesso filo, quindi
   * il timer per suonare avrebbe avuto bisogno del giro degli eventi che
   * quell'estrazione teneva bloccato. Adesso il cronometro vero sta dentro
   * `estrai`, dall'altra parte di un filo a parte. Questo qui copre quello
   * che resta di questo lato: la lettura dal disco, che su una cartella di
   * rete staccata può restare appesa da sola.
   */
  // il cronometro si spegne quando si è finito: lasciato acceso teneva in
  // vita il processo per venticinque secondi dopo l'ultimo file
  let cronometro: NodeJS.Timeout | undefined
  const corpo = await Promise.race([
    readFile(p).then(b => daBuffer(b, nome)),
    new Promise<string>((_, no) => { cronometro = setTimeout(() => no(new Error('troppo lento')), 25_000) })
  ]).finally(() => clearTimeout(cronometro))
  // un file vuoto non è un documento — ma esiste, e va detto
  if (corpo.length < 20) return null
  return {
    id: `desktop:${p}`,
    fonte: 'desktop',
    tipo: tipoDi(nome),
    titolo: nome,
    corpo: corpo.slice(0, MAX_TESTO),
    autore: null,
    percorso: p,
    quando: st.mtime.toISOString(),
    gruppo: 'documenti'
  }
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
  /**
   * I file che c'erano già, uguali: stessa data di modifica di quella in
   * indice, quindi non riletti. Stanno anche fra i `visti`; qui si contano.
   */
  invariati: number
}

/** La data di modifica già in indice, per id: chi ce l'ha uguale non si rilegge. */
export type GiaIndicizzati = Map<string, string | null | undefined>

/** Quanti file questa lettura ha «consumato»: letti o saltati perché uguali, il tetto vale per tutti. */
const letti = (e: Esito) => e.docs.length + e.invariati

async function cammina(radice: string, fuori: Esito, tetto: number, gia?: GiaIndicizzati, profondita = 0) {
  // fermarsi è legittimo, farlo in silenzio no: chi si ferma qui senza dirlo
  // fa credere a riconcilia() che il resto della cartella non esista più
  if (letti(fuori) >= tetto) { fuori.troncato = true; return }
  if (profondita > MAX_PROFONDITA) { fuori.troncato = true; return }
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
    if (letti(fuori) >= tetto) { fuori.troncato = true; return }
    if (v.name.startsWith('.') || SALTA.has(v.name)) continue
    const p = join(radice, v.name)

    if (v.isDirectory()) {
      await cammina(p, fuori, tetto, gia, profondita + 1)
      continue
    }
    if (!v.isFile()) continue

    const ext = extname(v.name).toLowerCase()
    if (!LETTI.includes(ext)) continue

    try {
      const s = await stat(p)
      /*
       * Uguale a com'era: la data di modifica è quella già in indice, quindi
       * non si riestrae. Prima ogni giro delle sei ore rileggeva tutti i PDF
       * da capo per scoprire, uno per uno, che erano identici — e `salvaDocumenti`
       * lo scopriva dopo che l'estrazione era già costata. Il file resta fra i
       * visti, come tutto quello che c'è ma che stavolta non si è letto, e
       * conta per il tetto come se fosse stato letto: la stessa cartella
       * grande si ferma allo stesso punto di prima.
       */
      const id = `desktop:${p}`
      if (gia && gia.has(id) && gia.get(id) === s.mtime.toISOString()) {
        fuori.visti.push(id); fuori.invariati++; continue
      }
      // Un file che esiste ma che stavolta non indicizziamo va comunque
      // dichiarato vivo. Senza questa riga finiva fuori dall'elenco dei visti,
      // la radice veniva lo stesso dichiarata «completa» — nessun errore,
      // nessun permesso negato — e `riconcilia` lo cancellava dall'indice.
      // Cioè: un PDF cresciuto oltre i dodici mega spariva dalla mente, e
      // spariva *perché era diventato grande*.
      const d = await leggiUno(p, s)
      if (!d) { fuori.visti.push(id); continue }
      fuori.docs.push(d)
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

/**
 * Una cartella sola, fino in fondo, con le regole di sempre.
 *
 * Per la vedetta, quando una cartella intera compare di colpo — spostata
 * dentro, o ripristinata: gli eventi arrivano per la cartella e non sempre
 * per quello che c'è dentro. Il tetto è basso apposta: è una lettura dal
 * vivo, non il giro delle sei ore.
 */
export async function leggiCartella(cartella: string, tetto = 200): Promise<Esito> {
  const esito: Esito = { docs: [], saltatiProgetti: [], falliti: 0, illeggibili: [], troncato: false, complete: [], visti: [], invariati: 0 }
  await cammina(resolve(cartella), esito, tetto)
  return esito
}

export async function sincronizza(
  c: ConfigDesktop,
  avanzamento?: (fatti: number) => void,
  gia?: GiaIndicizzati
): Promise<Esito> {
  const esito: Esito = { docs: [], saltatiProgetti: [], falliti: 0, illeggibili: [], troncato: false, complete: [], visti: [], invariati: 0 }
  // il tetto è per cartella: una cartella enorme non deve affamare le altre
  const perCartella = Math.max(200, Math.floor(MAX_TOTALE / Math.max(1, c.cartelle.length)))
  for (const cartella of c.cartelle) {
    const prima = esito.docs.length
    const illeggibiliPrima = esito.illeggibili.length
    const fallitiPrima = esito.falliti
    const radice = resolve(cartella)

    await cammina(radice, esito, letti(esito) + perCartella, gia)

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
