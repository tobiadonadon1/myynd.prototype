// Il desktop: legge le cartelle che scegli tu.
//
// Legge i documenti veri — PDF, Word, testo, Markdown — e salta i progetti di
// codice, che altrimenti riempirebbero l'indice di file macchina invece che
// delle tue cose.
//
// **Tutto il computer** — «Il mio Mac», «Il mio PC» — è la stessa lettura con
// la casa intera come radice, ed è il modo normale di collegare questa fonte:
// Scrivania, Documenti, Download e il resto stanno tutti lì dentro. È la
// ragione per cui esiste l'app da scrivania: un server non ha le tue cartelle,
// l'app ce le ha tutte. Cambiano tre cose e basta — le radici (la casa, e il
// disco in nuvola che le sta fuori o sotto `Library` e va detto a parte), i
// tetti (più documenti, più profondità) e l'elenco delle cartelle che non
// contengono mai documenti tuoi: le app, la musica, i film, le foto, le cache.
// Le regole per un file restano quelle di sempre.

import { readdir, readFile, stat } from 'node:fs/promises'
import { join, extname, basename, resolve, relative, sep } from 'node:path'
import { existsSync, type Stats } from 'node:fs'
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

/**
 * Con tutto il computer, in più: cartelle della casa dove i documenti non stanno.
 *
 * Solo con `tutto`, di proposito. Chi sceglie a mano `~/Pictures` perché ci
 * tiene gli scontrini scansionati deve trovarla letta; è quando la radice è
 * la casa intera che «Pictures» vuol dire la libreria di Foto, e «Music» i
 * file di Logic. `Library` e `.Trash` stanno già in `SALTA`, e i nomi con il
 * punto davanti non si aprono mai.
 *
 * **Le app restano fuori, e non è una dimenticanza.** Chi chiede «tutto il
 * computer» pensa anche alle applicazioni, ma un'app non è un documento: è un
 * pacchetto di binari, con dentro qualche `leggimi.txt` e le traduzioni di
 * chi l'ha scritta. Indicizzarle riempirebbe la mente di roba di altri —
 * migliaia di file che nessuno ha mai scritto né letto — e spingerebbe fuori
 * dal tetto i documenti veri. Quello che una persona *fa* con un'app sta nei
 * file che l'app salva, e quelli stanno nella casa: quelli si leggono.
 *
 * `Downloads` non sta qui e non deve starci: è la cartella dove finisce metà
 * di quello che una persona riceve — contratti, biglietti, fatture — e con
 * `tutto` si percorre come le altre.
 *
 * `AppData` è la `Library` di Windows: cache, registri, i dati interni dei
 * programmi. Fuori per la stessa ragione.
 */
const SALTA_TUTTO = new Set([
  'Applications', 'Music', 'Movies', 'Pictures', 'Public', 'Photos Library.photoslibrary',
  'Caches', 'Cache', 'caches', 'cache', 'tmp', 'temp', 'Temp', 'go',
  'Parallels', 'VirtualBox VMs', 'Virtual Machines',
  'AppData'
])

/**
 * I file lasciati fuori, divisi per quello che sono davvero.
 *
 * «2.400 file di altri tipi lasciati fuori» rispondeva a «ma ne ho molti di
 * più» senza rispondere alla domanda che viene subito dopo: perché così
 * tanti? Sul Mac di Tobia il grosso sono foto e video, poi codice, poi roba di
 * app e di sistema — tre mondi diversi, e dirli separati è quello che rende
 * la cifra alta una spiegazione invece di un sospetto. `MEDIA_SALTATI` prende
 * anche l'audio e il video, non solo le immagini: sono lo stesso «non è un
 * documento, è un file da guardare o ascoltare».
 */
const MEDIA_SALTATI = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.heic', '.heif', '.webp', '.tiff', '.tif', '.bmp', '.svg',
  '.psd', '.ai', '.raw', '.cr2', '.dng',
  '.mov', '.mp4', '.m4v', '.mp3', '.m4a', '.wav', '.aiff', '.aac', '.flac'
])
/** Codice sorgente e quello che lo circonda: mai un documento di una persona. */
const CODICE_SALTATI = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.yaml', '.yml', '.toml',
  '.swift', '.py', '.rb', '.go', '.rs', '.java', '.kt', '.c', '.h', '.cpp', '.hpp',
  '.m', '.mm', '.cs', '.php', '.sh', '.zsh', '.sql', '.css', '.scss', '.less',
  '.xml', '.lock', '.map'
])
/** Binari e file interni di app e sistema operativo. */
const SISTEMA_SALTATI = new Set([
  '.pak', '.plist', '.dylib', '.so', '.dll', '.exe', '.app', '.pkg', '.dmg',
  '.zip', '.tar', '.gz', '.7z', '.rar', '.bin', '.dat', '.db', '.sqlite',
  '.icns', '.ico', '.ttf', '.otf', '.woff', '.woff2', '.essentialsound',
  '.nib', '.storyboard', '.xib', '.car', '.strings'
])
/** In quale dei quattro cassetti sta un'estensione lasciata fuori. */
function classificaSalto(ext: string): 'media' | 'codice' | 'sistema' | 'altro' {
  if (MEDIA_SALTATI.has(ext)) return 'media'
  if (CODICE_SALTATI.has(ext)) return 'codice'
  if (SISTEMA_SALTATI.has(ext)) return 'sistema'
  return 'altro'
}

const MAX_FILE = 12_000_000     // i PDF pesano
const MAX_TESTO = 20_000
const MAX_TOTALE = 4000
/** Sotto la radice: le cartelle fino a questa profondità si percorrono, oltre no. */
const MAX_PROFONDITA = 6
/*
 * I tetti con tutto il Mac. Misurati su una casa vera con dieci anni dentro:
 * la lettura a secco delle sole cartelle — senza estrarre niente — sta sotto
 * il minuto, e quello che costa sono i PDF. Venticinquemila documenti e dieci
 * livelli tengono la prima lettura nell'ordine dei minuti; dal giro dopo la
 * data di modifica fa saltare quasi tutto.
 */
const MAX_TOTALE_TUTTO = 25_000
const MAX_PROFONDITA_TUTTO = 10

/** Le regole che cambiano fra «le cartelle scelte» e «tutto il Mac». */
type Regole = { profondita: number; salta: (nome: string) => boolean }
const REGOLE: Regole = { profondita: MAX_PROFONDITA, salta: n => SALTA.has(n) }
const REGOLE_TUTTO: Regole = { profondita: MAX_PROFONDITA_TUTTO, salta: n => SALTA.has(n) || SALTA_TUTTO.has(n) }
const regoleDi = (tutto?: boolean): Regole => (tutto ? REGOLE_TUTTO : REGOLE)

export function suggerimenti(): string[] {
  const h = homedir()
  return [join(h, 'Desktop'), join(h, 'Documents'), join(h, 'Downloads')]
}

/** `p` sta fuori da `radice`, cioè percorrerlo non è ripercorrere quella. */
function fuoriDa(p: string, radice: string): boolean {
  return relative(resolve(radice), resolve(p)).startsWith('..')
}

/**
 * Le radici di «tutto il computer»: la casa, più il disco in nuvola.
 *
 * Sul Mac la casa è `~` e il secondo è iCloud Drive, che sta in
 * `~/Library/Mobile Documents/com~apple~CloudDocs`, cioè dentro la cartella
 * che si salta per prima: senza dirla a parte, chi tiene i documenti su
 * iCloud — che è la metà delle persone — leggerebbe la casa intera e non
 * troverebbe niente. Si aggiunge solo se c'è.
 *
 * Su Windows la casa è `%USERPROFILE%` — che è quello che `homedir()`
 * risponde — e il secondo è OneDrive. Quasi sempre OneDrive sta *dentro* la
 * casa (`%USERPROFILE%\OneDrive`) e allora è già percorso: aggiungerlo lo
 * stesso vorrebbe dire leggerlo due volte e dimezzare il tetto per cartella.
 * Si aggiunge quando sta fuori — chi l'ha spostato su un altro disco — e solo
 * se c'è davvero: una radice che non si apre fa fallire `prova`, cioè il
 * collegamento intero, per una variabile d'ambiente rimasta indietro.
 *
 * `piattaforma` si passa da fuori perché è l'unico modo di provare il caso
 * Windows da un Mac.
 */
export function radiciTutto(casa = homedir(), piattaforma: string = process.platform): string[] {
  const radici = [casa]
  if (piattaforma === 'win32') {
    const onedrive = process.env.OneDrive
    if (onedrive && existsSync(onedrive) && fuoriDa(onedrive, casa)) radici.push(onedrive)
    return radici
  }
  const icloud = join(casa, 'Library', 'Mobile Documents', 'com~apple~CloudDocs')
  if (existsSync(icloud)) radici.push(icloud)
  return radici
}

/** Le cartelle da percorrere per questa configurazione: quelle scelte, o la casa intera. */
export function radici(c: Pick<ConfigDesktop, 'cartelle' | 'tutto'>): string[] {
  return c.tutto ? radiciTutto() : c.cartelle
}

/**
 * Questo collegamento va portato a tutto il computer, una volta sola?
 *
 * Chi ha collegato il computer *prima* che «collega il mio Mac» esistesse si
 * ritrova tre cartelle — Scrivania, Documenti, Download — e un Myynd che dice
 * «66 documenti» su una macchina che ne ha migliaia. Non è un'impostazione
 * sbagliata: è una scheda vecchia, e la persona non ha scelto niente. Al primo
 * avvio della versione nuova quella configurazione diventa tutto il computer.
 *
 * Chi invece ha *scelto* — «Solo alcune cartelle», una cartella di lavoro sola,
 * un disco di rete — ha `scelte`, e non gli si tocca niente: è la differenza fra
 * aggiornare un'ipotesi e disfare una decisione.
 *
 * Il conto si fa qui, fuori dall'avvio, perché è l'unica riga in cui si può
 * sbagliare: scritta dentro il giro dei conti si proverebbe accendendo un
 * server, cioè mai. Ed è idempotente per costruzione — dopo la scrittura
 * `tutto` è vero, quindi al secondo avvio risponde no.
 */
export function daAggiornare(c: ConfigDesktop | undefined): boolean {
  if (!c) return false
  return c.tutto !== true && !c.scelte
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
export async function daSaltare(percorso: string, radice: string, eCartella = false, tutto = false): Promise<boolean> {
  if (saltaDalNome(percorso, radice, tutto, eCartella)) return true
  const pezzi = relative(resolve(radice), resolve(percorso)).split(sep)
  // le cartelle: quelle in mezzo, e la cartella stessa se è una cartella
  const cartelle = eCartella ? pezzi : pezzi.slice(0, -1)
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
 * La parte di `daSaltare` che si decide dal nome, senza toccare il disco.
 *
 * Con la casa intera sotto ascolto gli eventi arrivano anche da `Library` —
 * che è dove il Mac scrive in continuazione: cache, registri, la posta — e
 * ognuno di quelli costava un timer e poi uno `stat`. Qui si guardano i
 * pezzi del percorso e basta: un nome con il punto davanti, una cartella
 * dell'elenco, una profondità oltre il tetto, e l'evento muore prima di
 * costare qualcosa. È il filtro che la vedetta applica *prima* di segnare —
 * senza sapere se il percorso è un file o una cartella, quindi con la regola
 * più larga: quello che passa di qui viene comunque rigiudicato da `daSaltare`.
 */
export function saltaDalNome(percorso: string, radice: string, tutto = false, eCartella = false): boolean {
  const rel = relative(resolve(radice), resolve(percorso))
  if (!rel || rel.startsWith('..')) return true
  const pezzi = rel.split(sep)
  const regole = regoleDi(tutto)
  if (pezzi.some(n => n.startsWith('.') || regole.salta(n))) return true
  // le cartelle: quelle in mezzo, e la cartella stessa se è una cartella
  const cartelle = eCartella ? pezzi : pezzi.slice(0, -1)
  return cartelle.length > regole.profondita
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
  /** Quanti sono già stati versati a chi li salva, e non stanno più in `docs`. */
  versati: number
  /** Dove versare i documenti a lotti, se chi chiama non vuole tenerli tutti in memoria. */
  versa?: (docs: Documento[]) => Promise<void>
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
  /**
   * I file visti e lasciati fuori perché non sappiamo aprirli: il totale.
   *
   * Non è una statistica: è la risposta alla frase che una persona dice
   * guardando «66 documenti» su un Mac pieno — «ma ne ho molti di più».
   * Senza questo numero quella frase resta senza risposta e il collegamento
   * sembra rotto. Il totale da solo lascia aperta la domanda che viene
   * subito dopo — «perché così tanti?» — e la risposta sta in `saltati`.
   */
  saltatiPerTipo: number
  /**
   * Lo stesso conto, diviso per quello che è: la ragione dietro il totale.
   *
   * Vedi `classificaSalto`: foto e video sotto `media`, sorgenti sotto
   * `codice`, binari e file interni di app e sistema sotto `sistema`, e
   * tutto il resto sotto `altro`.
   */
  saltati: { media: number; codice: number; sistema: number; altro: number }
  /** Le cartelle non aperte di proposito: gli elenchi dei salti, e i nomi col punto davanti. */
  saltateCartelle: number
}

/** La data di modifica già in indice, per id: chi ce l'ha uguale non si rilegge. */
export type GiaIndicizzati = Map<string, string | null | undefined>

/** Quanti file questa lettura ha «consumato»: letti o saltati perché uguali, il tetto vale per tutti. */
/** Quanti documenti si tengono in mano prima di versarli. */
const LOTTO = 400
const letti = (e: Esito) => e.docs.length + e.versati + e.invariati

async function cammina(radice: string, fuori: Esito, tetto: number, gia?: GiaIndicizzati, profondita = 0, regole: Regole = REGOLE) {
  // fermarsi è legittimo, farlo in silenzio no: chi si ferma qui senza dirlo
  // fa credere a riconcilia() che il resto della cartella non esista più
  if (letti(fuori) >= tetto) { fuori.troncato = true; return }
  if (profondita > regole.profondita) { fuori.troncato = true; return }
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
    if (v.name.startsWith('.') || regole.salta(v.name)) {
      // una cartella lasciata fuori di proposito si conta: è la differenza fra
      // «non ho guardato» e «ho guardato e ho deciso di no», e sono le due
      // frasi che una persona vuole distinguere quando i documenti sono meno
      // di quanti se ne aspettava
      if (v.isDirectory()) fuori.saltateCartelle++
      continue
    }
    const p = join(radice, v.name)

    if (v.isDirectory()) {
      await cammina(p, fuori, tetto, gia, profondita + 1, regole)
      continue
    }
    /*
     * I link simbolici restano fuori, e resta fuori di proposito.
     *
     * `isFile()` è falso per un link: seguirli vorrebbe dire indicizzare due
     * volte la stessa cosa e, con un link che punta indietro, girare in tondo
     * finché il tetto non salva la situazione.
     *
     * I file «senza corpo» di iCloud — quelli con la nuvoletta, scaricati solo
     * su richiesta — invece si comportano da file normali: `readdir` e `stat`
     * li danno per quello che sono, e `readFile` fa scendere i byte. Costa
     * banda e tempo, ma leggerli è quello che una persona si aspetta: non si
     * fa niente di speciale, e questa riga esiste per dire che è una scelta.
     */
    if (!v.isFile()) continue

    const ext = extname(v.name).toLowerCase()
    // visto e lasciato fuori: un `.png`, un `.swift`, un `.zip`. Si conta,
    // perché è la metà del computer di cui altrimenti non si dice niente
    if (!LETTI.includes(ext)) { fuori.saltatiPerTipo++; fuori.saltati[classificaSalto(ext)]++; continue }

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
      // a lotti: tutto il computer sono migliaia di documenti, e tenerli
      // tutti in memoria fino alla fine della camminata è un rischio inutile
      if (fuori.versa && fuori.docs.length >= LOTTO) {
        const lotto = fuori.docs.splice(0, fuori.docs.length)
        fuori.versati += lotto.length
        await fuori.versa(lotto)
      }
    } catch {
      fuori.falliti++
    }
  }
}

export async function prova(c: ConfigDesktop): Promise<{ ok: true; cartelle: string[] } | { ok: false; errore: string }> {
  const buone: string[] = []
  for (const cartella of radici(c)) {
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
export async function leggiCartella(cartella: string, tetto = 200, tutto = false): Promise<Esito> {
  const esito: Esito = { docs: [], versati: 0, saltatiProgetti: [], falliti: 0, illeggibili: [], troncato: false, complete: [], visti: [], invariati: 0, saltatiPerTipo: 0, saltati: { media: 0, codice: 0, sistema: 0, altro: 0 }, saltateCartelle: 0 }
  await cammina(resolve(cartella), esito, tetto, undefined, 0, regoleDi(tutto))
  return esito
}

export async function sincronizza(
  c: ConfigDesktop,
  avanzamento?: (fatti: number) => void,
  gia?: GiaIndicizzati,
  versa?: (docs: Documento[]) => Promise<void>
): Promise<Esito> {
  const esito: Esito = { docs: [], versati: 0, versa, saltatiProgetti: [], falliti: 0, illeggibili: [], troncato: false, complete: [], visti: [], invariati: 0, saltatiPerTipo: 0, saltati: { media: 0, codice: 0, sistema: 0, altro: 0 }, saltateCartelle: 0 }
  const cartelle = radici(c)
  const regole = regoleDi(c.tutto)
  // il tetto è per cartella: una cartella enorme non deve affamare le altre
  const totale = c.tutto ? MAX_TOTALE_TUTTO : MAX_TOTALE
  const perCartella = Math.max(200, Math.floor(totale / Math.max(1, cartelle.length)))
  for (const cartella of cartelle) {
    const prima = esito.docs.length + esito.versati
    const illeggibiliPrima = esito.illeggibili.length
    const fallitiPrima = esito.falliti
    const radice = resolve(cartella)

    await cammina(radice, esito, letti(esito) + perCartella, gia, 0, regole)

    // Una radice si può riconciliare solo se è stata percorsa tutta: niente
    // tetto raggiunto, nessuna cartella figlia illeggibile, nessun file caduto.
    // `troncato` è appiccicoso di proposito — dopo il primo tetto nessuna
    // radice successiva è più affidabile, perché il tetto è condiviso.
    const pulita = !esito.troncato
      && esito.illeggibili.length === illeggibiliPrima
      && esito.falliti === fallitiPrima
    if (pulita) esito.complete.push(radice)

    if (avanzamento) avanzamento(esito.docs.length + esito.versati - prima)
  }
  delete esito.versa
  return esito
}
