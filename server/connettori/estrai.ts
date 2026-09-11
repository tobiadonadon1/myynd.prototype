// Tirare fuori il testo da un file, ovunque quel file sia arrivato.
//
// Stava dentro `desktop.ts`, e lì bastava: c'era una fonte sola di file e la
// leggeva dal disco. Con Drive, SharePoint e Dropbox le fonti diventano
// quattro e il file non è più un percorso: è un pezzo di memoria appena
// scaricato. Copiare quelle venti righe in quattro posti vorrebbe dire quattro
// versioni che divergono — e la prima a divergere sarebbe la chiamata a
// `riflua`, che non è un abbellimento: senza, il testo di un PDF arriva
// spezzato a metà frase e quella frase spezzata finisce sia sotto gli occhi di
// chi legge sia dentro la domanda che si fa al modello.
//
// **Il lavoro pesante non gira più qui.** Un PDF di dodici mega fatto male
// teneva pdfjs occupato per minuti, e per quei minuti il server non rispondeva
// a nessuno: non alla chat di chi aveva chiesto, non alla posta, non
// all'altra persona che stava lavorando. La rete di sicurezza che c'era — una
// corsa contro un `setTimeout` — non poteva nemmeno scattare, perché un timer
// ha bisogno del giro degli eventi per suonare e il giro degli eventi era la
// cosa bloccata. Adesso l'apertura di PDF e Word succede in un filo a parte
// (`estrai.lavoratore.ts`), il tempo lo conta questo filo — che è libero — e
// alla scadenza quello di là si chiude di forza. Un file cattivo costa un
// documento.

import { extname } from 'node:path'
import { riflua } from '../testo.ts'

/**
 * Quello che è un documento per una persona, non per un compilatore.
 *
 * **Quello che resta fuori, e perché.** `.doc` (il Word di prima del 2007) è
 * un formato binario chiuso: aprirlo vuol dire un pacchetto in più che
 * sbaglia spesso, per dei file che quasi nessuno ha più. `.pages`,
 * `.numbers` e `.key` sono cartelle zippate il cui contenuto vero è un
 * archivio binario di Apple (IWA, protobuf compresso): dentro non c'è nessun
 * XML da leggere, solo un'anteprima PDF che non è il documento. Le immagini —
 * `.png`, `.jpg`, gli screenshot, le scansioni — non hanno testo senza un
 * riconoscimento ottico, che è un altro mestiere e un'altra spesa. E il
 * codice resta fuori di proposito: `cammina` salta già i progetti interi, e
 * indicizzare `.ts` e `.swift` riempirebbe la mente di roba che non è mai
 * stata scritta per essere riletta da una persona.
 */
export const TESTO = ['.md', '.markdown', '.txt', '.rtf', '.csv', '.org', '.tex', '.html', '.htm']
/** Quelli che costano ad aprirsi: vanno nel filo a parte. */
export const RICCHI = ['.pdf', '.docx', '.xlsx', '.pptx']
export const LETTI = [...RICCHI, ...TESTO]

/**
 * Il tetto del testo che si tira fuori da un file solo.
 *
 * Chi indicizza taglia comunque a ventimila caratteri, ma il taglio arriva
 * *dopo*: un foglio di calcolo con centomila righe costruirebbe una stringa
 * da decine di mega per poi buttarne il 99%. Qui ci si ferma prima, mentre si
 * legge.
 */
export const MAX_TESTO = 200_000

/** Il file è di quelli che sappiamo leggere? */
export function leggibile(nome: string): boolean {
  return LETTI.includes(extname(nome).toLowerCase())
}

// — il testo che una macchina ha scritto per un'altra macchina —

/**
 * I formati in cui un registro può nascondersi: testo senza struttura propria.
 *
 * `.rtf` e i formati ricchi restano fuori di proposito. Nessuno salva un
 * registro di sessione in Word, e un documento vero aperto male — un PDF che
 * torna mezzo a pezzi — non deve sparire per colpa di un conteggio di graffe.
 */
export const FIUTATI = ['.txt', '.md', '.markdown', '.csv', '.org', '.tex', '.html', '.htm']

/** La prima riga di un registro di sessione: `pid:`, `cwd:`, `command:`, `started_at:`. */
const INTESTAZIONE = /^(pid|cwd|command|started_at)\s*[:=]/i
/** Una riga di dati e non di prosa: JSON, un elenco, una stringa, una data ISO. */
const RIGA_MACCHINA = /^[{["]|^\d{4}-\d{2}-\d{2}T/
/** Le parole chiave di un processo, dette come le dice un programma. */
const CHIAVI = /\s(pid|cwd|status|exit_code|stderr|stdout)\s*[:=]/gi
/** Le graffe, le quadre, le virgolette e le virgole: la punteggiatura dei dati. */
const STRUTTURA = /[{}[\]":,]/g

/**
 * Questo testo l'ha scritto una macchina per un'altra macchina.
 *
 * Nella casa di Tobia c'era `~/terminals/`, quattordici file di nome
 * `268734.txt`: il registro di ogni sessione di terminale, con dentro `pid`,
 * `cwd`, il comando e poi un blocco di JSON. Sono entrati nell'indice come
 * documenti, e la rassegna del mattino ne ha parlato quattro volte — «il
 * server di sviluppo è stato riavviato più volte» — citando quei file come
 * fonti. Il nome li prende quasi sempre (vedi `nomeDiMacchina` in
 * `desktop.ts`); questo li prende quando il nome è innocente.
 *
 * Quattro segni, e ne basta uno:
 *
 *   · comincia con l'intestazione di una sessione;
 *   · un quarto delle prime sessanta righe piene comincia da dati e non da
 *     una parola;
 *   · quasi un terzo dei primi quattromila caratteri è punteggiatura di dati;
 *   · le parole di un processo — `pid`, `exit_code`, `stderr` — tornano cinque
 *     volte o più.
 *
 * **Il conto delle righe vuole almeno otto righe.** Un appunto di quattro
 * righe che comincia con una citazione fra virgolette è il 25% di righe
 * «macchina» per costruzione: sotto le otto righe quella percentuale non vuol
 * dire niente, e un dump di JSON corto lo prende comunque il conto dei
 * caratteri.
 *
 * `soloIntestazione` è per i `.csv`: una tabella di fatture *è* virgole e
 * virgolette, e la colonna di una data può essere ISO. Lì l'unico segno che
 * resta vero è l'intestazione, e tutto il resto direbbe di no a un documento
 * vero.
 */
export function sembraUnRegistro(testo: string, o: { soloIntestazione?: boolean } = {}): boolean {
  const t = testo.trimStart()
  if (!t) return false
  if (INTESTAZIONE.test(t)) return true
  if (o.soloIntestazione) return false

  const righe = t.split('\n').map(r => r.trim()).filter(Boolean).slice(0, 60)
  if (righe.length >= 8 && righe.filter(r => RIGA_MACCHINA.test(r)).length / righe.length >= 0.25) return true

  const inizio = t.slice(0, 4000)
  if (inizio.length >= 200 && (inizio.match(STRUTTURA)?.length ?? 0) / inizio.length >= 0.30) return true

  return (t.match(CHIAVI)?.length ?? 0) >= 5
}

/**
 * Il testo di un file, aperto qui dentro, sul filo di chi chiama.
 *
 * È il lavoro vero, ed è anche quello che blocca: si chiama da dentro il
 * lavoratore, o come ripiego quando il lavoratore non parte. Chi indicizza
 * chiama `daBuffer`, non questa.
 *
 * `pdf-parse` e `mammoth` si importano qui dentro e non in cima al file
 * apposta: sono due pacchetti pesanti, e importarli all'avvio vorrebbe dire
 * pagarli anche su un'installazione che non ha mai visto un PDF.
 */
export async function quiDentro(buf: Buffer, nome: string): Promise<string> {
  const ext = extname(nome).toLowerCase()

  if (ext === '.pdf') {
    const { PDFParse } = await import('pdf-parse')
    const p = new PDFParse({ data: new Uint8Array(buf) })
    try {
      const r = await p.getText()
      return riflua((r.text || '').trim())
    } finally {
      await p.destroy()
    }
  }

  if (ext === '.docx') {
    const { default: mammoth } = await import('mammoth')
    const r = await mammoth.extractRawText({ buffer: buf })
    return riflua((r.value || '').trim())
  }

  if (ext === '.xlsx') return (await daXlsx(buf)).trim()
  if (ext === '.pptx') return (await daPptx(buf)).trim()

  const grezzo = buf.toString('utf8')
  if (ext === '.html' || ext === '.htm') return daHtml(grezzo)
  if (ext === '.rtf') return daRtf(grezzo)

  return riflua(grezzo.trim())
}

// — i formati che sono un archivio con dentro dell'XML —
//
// `.xlsx` e `.pptx` sono cartelle zippate piene di XML. Non serve una libreria
// che li «capisca»: serve aprire lo zip e tirare fuori il testo dai nodi
// giusti. Quello che si legge è quello che una persona ha scritto — le celle
// di un preventivo, le righe di una slide — e basta: niente formule, niente
// formati, niente note del relatore. `jszip` c'era già (lo porta `mammoth`
// per i `.docx`), e adesso è dichiarato anche qui perché lo si usa davvero.

/** Le entità XML che compaiono davvero dentro un `<t>`. `&amp;` per ultima, o si decodifica due volte. */
function entitaXml(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
}

/** Il testo di tutti i `<t>` dentro un pezzo di XML, in fila. */
function nodiT(xml: string, tag = 't'): string {
  const fuori: string[] = []
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'g')
  for (const m of xml.matchAll(re)) fuori.push(entitaXml(m[1] ?? ''))
  return fuori.join('')
}

/** I file di un archivio che stanno in una serie numerata — `slide1`, `slide2`, `slide10` — nel loro ordine. */
function inOrdine(nomi: string[]): string[] {
  const n = (s: string) => Number(s.match(/(\d+)\.xml$/)?.[1] ?? 0)
  return [...nomi].sort((a, b) => n(a) - n(b))
}

/**
 * Un foglio di calcolo: le celle, riga per riga.
 *
 * Le parole di un `.xlsx` quasi non stanno nei fogli: stanno tutte in un
 * elenco unico — `xl/sharedStrings.xml` — e nella cella c'è solo il numero
 * d'ordine (`t="s"`). Chi legge solo i fogli trova una tabella di indici, che
 * è il modo di indicizzare un preventivo senza una sola parola dentro.
 * L'eccezione sono le celle scritte «in linea» (`<is><t>`), che certi
 * esportatori producono al posto dell'elenco condiviso: ci sono tutte e due,
 * o metà dei file esportati da un gestionale resta vuota.
 */
async function daXlsx(buf: Buffer): Promise<string> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(buf)

  const condivise: string[] = []
  const ss = zip.file('xl/sharedStrings.xml')
  if (ss) {
    const xml = await ss.async('string')
    let peso = 0
    for (const m of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
      // un'esportazione da mezzo milione di righe mette tutto il testo qui: oltre il tetto non si legge più
      if (peso >= MAX_TESTO) break
      const t = nodiT(m[1] ?? ''); peso += t.length; condivise.push(t)
    }
  }

  const fogli = inOrdine(zip.file(/^xl\/worksheets\/sheet\d+\.xml$/).map(f => f.name))
  const righe: string[] = []
  let quanto = 0
  for (const nome of fogli) {
    const xml = await zip.file(nome)!.async('string')
    for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const celle: string[] = []
      for (const c of (r[1] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attributi = c[1] ?? ''
        const dentro = c[2] ?? ''
        let testo = ''
        if (/\bt="s"/.test(attributi)) {
          const i = Number(dentro.match(/<v>(\d+)<\/v>/)?.[1] ?? -1)
          testo = condivise[i] ?? ''
        } else if (dentro.includes('<is>')) {
          testo = nodiT(dentro)
        } else {
          testo = entitaXml(dentro.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '')
        }
        testo = testo.replace(/\s+/g, ' ').trim()
        if (testo) celle.push(testo)
      }
      if (!celle.length) continue
      const riga = celle.join(' ')
      righe.push(riga)
      quanto += riga.length + 1
      if (quanto >= MAX_TESTO) return righe.join('\n').slice(0, MAX_TESTO)
    }
  }
  return righe.join('\n')
}

/**
 * Una presentazione: il testo delle slide, una per riga.
 *
 * Una slide sola è già un paragrafo — un titolo e tre punti elenco — e tenerla
 * insieme è quello che la rende ritrovabile: cercando due parole che stanno
 * sulla stessa slide si vuole quella slide, non il file. L'ordine è quello dei
 * numeri e non quello alfabetico, o `slide10` finisce fra `slide1` e `slide2`.
 * Le note del relatore stanno altrove (`notesSlide*.xml`) e restano fuori: non
 * sono quello che è stato detto, sono quello che uno si era scritto.
 */
async function daPptx(buf: Buffer): Promise<string> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(buf)
  const slide = inOrdine(zip.file(/^ppt\/slides\/slide\d+\.xml$/).map(f => f.name))
  const fuori: string[] = []
  let quanto = 0
  for (const nome of slide) {
    const xml = await zip.file(nome)!.async('string')
    const pezzi: string[] = []
    for (const m of xml.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g)) {
      const t = entitaXml(m[1] ?? '').replace(/\s+/g, ' ').trim()
      if (t) pezzi.push(t)
    }
    if (!pezzi.length) continue
    const riga = pezzi.join(' ')
    fuori.push(riga)
    quanto += riga.length + 1
    if (quanto >= MAX_TESTO) break
  }
  return fuori.join('\n').slice(0, MAX_TESTO)
}

// — i due formati che sono testo con dentro delle istruzioni —

/** Le entità che compaiono davvero in una pagina. `&amp;` per ultima, come sopra. */
function entitaHtml(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Spazi e a capo rimessi in ordine: uno spazio, e mai più di una riga vuota. */
function ricomponi(s: string): string {
  return s
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Una pagina salvata: il testo che si legge, non il codice che la disegna.
 *
 * Un `.html` indicizzato com'è sono novantanove parti di `class=` e di
 * JavaScript e una di testo — cioè una ricerca che trova `flex` e `onclick`
 * in ogni documento. Script e fogli di stile si buttano *interi*, con dentro,
 * perché il loro contenuto non è testo: è codice fra due tag.
 *
 * Il `<title>` va in testa e non nel titolo del documento, perché il titolo
 * qui è il nome del file e lo decide chi indicizza (`leggiUno`): questa
 * funzione sa solo tornare del testo. Prima riga e poi una riga vuota è il
 * modo per cui si legge come un titolo comunque — e, soprattutto, si cerca.
 */
export function daHtml(html: string): string {
  const titolo = ricomponi(entitaHtml((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '')))
  const corpo = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, ' ')
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>|<\/li>|<\/h[1-6]>|<\/blockquote>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  const testo = ricomponi(entitaHtml(corpo))
  return titolo ? `${titolo}\n\n${testo}`.trim() : testo
}

/**
 * Un `.rtf`: le parole, senza le istruzioni.
 *
 * Un RTF è testo semplice con dentro delle parole di comando — `\b`,
 * `\fs24`, `\par` — e dei gruppi fra graffe. Indicizzarlo com'è vuol dire
 * mettere nella mente la tabella dei caratteri di TextEdit e i nomi dei font.
 * Non si scrive un lettore di RTF: si buttano i gruppi che per definizione non
 * contengono testo (`\fonttbl`, `\colortbl`, `\*\…`), si traducono gli
 * accenti — che in RTF sono `\'e8` — e si tolgono le parole di comando. I
 * comandi che *sono* un a capo diventano un a capo, o il documento intero
 * arriva come una riga sola.
 */
export function daRtf(rtf: string): string {
  // TextEdit chiude le righe con una barra rovescia e un a capo, che in RTF
  // vuol dire «paragrafo»: senza tradurlo qui, quella barra resta attaccata
  // alla parola dopo — «Marta\Preventivo» — e le due righe diventano una
  const senzaTabelle = togliIGruppiMuti(rtf).replace(/\\\r?\n/g, '\\par ')
  const testo = senzaTabelle.replace(
    /\\u(-?\d+)\s?\??|\\'([0-9a-fA-F]{2})|\\([\\{}])|\\([a-zA-Z]+)(-?\d+)?[ ]?|[{}]|[\r\n]+/g,
    (_, unicode, esa, letterale, parola) => {
      if (unicode !== undefined) return String.fromCharCode(Number(unicode) & 0xffff)
      if (esa !== undefined) return String.fromCharCode(parseInt(esa, 16))
      if (letterale !== undefined) return letterale
      if (parola !== undefined) {
        if (/^(?:par|line|sect|page|pard)$/.test(parola)) return '\n'
        if (parola === 'tab') return '\t'
        if (/^(?:cell|row|nestcell|nestrow)$/.test(parola)) return ' '
        return ''
      }
      // una graffa rimasta, o gli a capo veri del file: in RTF non vogliono dire niente
      return ''
    }
  )
  return ricomponi(testo)
}

/**
 * I gruppi di un RTF che non contengono testo da leggere.
 *
 * `{\fonttbl…}` è l'elenco dei font, `{\colortbl…}` i colori, `{\*\…}` per
 * definizione una destinazione che un lettore che non la conosce deve
 * ignorare. Togliendo solo le parole di comando resterebbero i loro contenuti
 * — «Helvetica;Times New Roman;» — in cima a ogni documento.
 */
function togliIGruppiMuti(rtf: string): string {
  const MUTI = /^\\(?:\*|fonttbl|colortbl|stylesheet|info|pict|object|themedata|colorschememapping|latentstyles|datastore|listtable|listoverridetable|rsidtbl|xmlnstbl|filetbl|generator|expandedcolortbl)\b/
  let fuori = ''
  for (let i = 0; i < rtf.length; i++) {
    if (rtf[i] !== '{') { fuori += rtf[i]; continue }
    if (!MUTI.test(rtf.slice(i + 1, i + 40))) { fuori += rtf[i]; continue }
    // fino alla graffa che chiude questo gruppo, contando quelle dentro
    let livello = 0
    let j = i
    for (; j < rtf.length; j++) {
      const c = rtf[j]
      if (rtf[j - 1] === '\\') continue
      if (c === '{') livello++
      else if (c === '}') { livello--; if (!livello) break }
    }
    i = j
  }
  return fuori
}

// — il filo a parte —

/** Quanto può durare l'apertura di un file prima che si chiuda quel filo. */
export const TEMPO_MAX = 20_000
let tempoMax = TEMPO_MAX

/**
 * Da usare nelle prove: quanto aspettare, e chi fa il lavoratore.
 *
 * Un PDF che manda davvero pdfjs in bambola non si scrive a mano, e tenerne uno
 * nel repository per provare una scadenza sarebbe dodici mega di zavorra. Con
 * un lavoratore finto che non risponde mai si prova esattamente la cosa che
 * conta: che alla scadenza quel filo venga chiuso e che di là arrivi un guaio
 * invece di un'attesa infinita.
 */
export function perLeProve(o: { tempo?: number | null; lavoratore?: URL | null }) {
  if ('tempo' in o) tempoMax = o.tempo ?? TEMPO_MAX
  if ('lavoratore' in o) { altrove = o.lavoratore ?? null; senzaFilo = false; maiRiuscito = false }
  chiudiIlFilo()
}

/**
 * Quanti lavori possono aspettare il loro turno.
 *
 * Il lavoratore è uno solo e serve un file per volta: senza un tetto, una
 * lettura di Drive con milleduecento file gli metterebbe in fila
 * milleduecento buffer da dodici mega — che non è una coda, è la memoria del
 * server. Chi trova la fila piena si sente dire di no subito, e chi indicizza
 * segna quel file come «c'è ma non l'ho letto»: torna al giro dopo.
 */
export const CODA_MAX = 24

/** Dopo quanto silenzio il filo si chiude da sé, per non tenere pdfjs in memoria. */
const RIPOSO = 60_000

type Lavoro = {
  id: number
  buf: Buffer
  nome: string
  bene: (t: string) => void
  male: (e: Error) => void
}

type Filo = {
  manda: (m: { id: number; byte: ArrayBuffer; nome: string }, trasferisci: ArrayBuffer[]) => void
  /** Mentre lavora tiene in piedi il processo; fermo, no. */
  tieni: (si: boolean) => void
  chiudi: () => void
}

const coda: Lavoro[] = []
let inCorso: Lavoro | null = null
let filo: Filo | null = null
let contatore = 0
let sveglia: NodeJS.Timeout | null = null
let riposo: NodeJS.Timeout | null = null
/** Il lavoratore non parte su questa macchina: si dice una volta e si va avanti. */
let senzaFilo = false
/** Almeno un file è tornato da di là: da qui in poi il filo funziona, è provato. */
let maiRiuscito = false
/** Un lavoratore diverso da quello vero. Solo le prove lo mettono. */
let altrove: URL | null = null

/**
 * Dove sta il lavoratore, anche dentro un pacchetto.
 *
 * `import.meta.url` è l'unico punto di partenza che sopravvive
 * all'impacchettamento: dentro un `.asar` il percorso del processo non dice
 * più niente, ma il modulo sa sempre da dove è stato caricato. Si prova prima
 * il `.ts` — che è quello che c'è quando Node legge i sorgenti così come sono —
 * e poi il `.js`, per il giorno in cui qualcuno compila davvero.
 */
async function dove(): Promise<URL | null> {
  if (altrove) return altrove
  const { stat } = await import('node:fs/promises')
  for (const nome of ['./estrai.lavoratore.ts', './estrai.lavoratore.js']) {
    const u = new URL(nome, import.meta.url)
    try { await stat(u); return u } catch { /* l'altro, allora */ }
  }
  return null
}

/**
 * Il filo, acceso quando serve.
 *
 * `null` vuol dire «su questa macchina non si può», e da lì in poi si apre
 * tutto qui dentro come prima: peggio, ma vivo. Si dice una volta sola nel
 * registro, perché un avviso ripetuto per ogni PDF è rumore che nasconde
 * proprio quello che vorrebbe dire.
 */
async function accendi(): Promise<Filo | null> {
  if (filo) return filo
  if (senzaFilo) return null
  try {
    const { Worker } = await import('node:worker_threads')
    const u = await dove()
    if (!u) throw new Error('lavoratore introvabile')
    const w = new Worker(u)
    const costruito: Filo = {
      manda: (m, t) => w.postMessage(m, t),
      // fermo non deve tenere in piedi il processo, ma mentre sta aprendo un
      // file sì: senza, un `node --test` che aspetta il testo di un PDF si
      // chiuderebbe da solo con la promessa ancora in mano
      tieni: si => { if (si) w.ref(); else w.unref() },
      chiudi: () => { void w.terminate() }
    }
    w.unref()
    w.on('message', (m: { id: number; ok: boolean; testo?: string; errore?: string }) => rispose(m))
    w.on('error', e => {
      const err = e instanceof Error ? e : new Error(String(e))
      /*
       * Un filo che muore *prima di aver mai aperto un file* non è un file
       * cattivo: è una macchina dove i fili non si possono accendere — Node
       * impacchettato senza il lettore di TypeScript, un `.asar` che non
       * espone il file, un permesso. Lì il conto giusto non è «tutti i PDF
       * falliscono per sempre»: è tornare ad aprirli qui dentro, lentamente,
       * dicendolo una volta nel registro.
       */
      if (!maiRiuscito && nonSiAccende(err)) {
        senzaFilo = true
        if (filo === costruito) filo = null
        console.warn('myynd · i PDF si aprono nel filo principale: il lavoratore non parte —', err.message)
        rimetti()
        return
      }
      cadde(err)
    })
    w.on('exit', () => {
      /*
       * L'uscita di un filo che non è più il nostro non riguarda nessuno.
       *
       * Chiudendone uno per sostituirlo, il suo `exit` arriva un attimo dopo —
       * quando il lavoro in corso è già un altro, sul filo nuovo. Senza questo
       * controllo quel lavoro veniva respinto con «troppo lento» senza aver mai
       * avuto il tempo di essere lento: un file su due falliva, e sempre per
       * colpa di quello prima.
       */
      if (filo !== costruito) return
      filo = null
      cadde(new Error('troppo lento'))
    })
    filo = costruito
    return filo
  } catch (e) {
    senzaFilo = true
    console.warn('myynd · i PDF si aprono nel filo principale: il lavoratore non parte —',
      e instanceof Error ? e.message : String(e))
    return null
  }
}

function ferma() {
  if (sveglia) { clearTimeout(sveglia); sveglia = null }
  filo?.tieni(false)
}

/** Il filo non è partito, e non partirà: è un guaio della macchina, non del file. */
function nonSiAccende(e: Error): boolean {
  const codice = (e as { code?: string }).code ?? ''
  if (/^ERR_(MODULE_NOT_FOUND|UNKNOWN_FILE_EXTENSION|INVALID_TYPESCRIPT_SYNTAX|UNSUPPORTED_ESM_URL_SCHEME)$/.test(codice)) return true
  if (codice === 'MODULE_NOT_FOUND' || codice === 'ENOENT') return true
  return /cannot find module|unknown file extension|no such file/i.test(e.message)
}

/** Rimette in testa alla coda il lavoro che il filo morto non ha fatto. */
function rimetti() {
  ferma()
  if (inCorso) { coda.unshift(inCorso); inCorso = null }
  void avanti()
}

function rispose(m: { id: number; ok: boolean; testo?: string; errore?: string }) {
  // una risposta che arriva dopo la scadenza è di un lavoro che non c'è più:
  // si butta, o finirebbe nelle mani del lavoro dopo
  if (!inCorso || inCorso.id !== m.id) return
  const l = inCorso
  inCorso = null
  maiRiuscito = true
  ferma()
  if (m.ok) l.bene(m.testo ?? '')
  else l.male(new Error(m.errore || 'illeggibile'))
  void avanti()
}

function cadde(e: Error) {
  if (!inCorso) return
  const l = inCorso
  inCorso = null
  ferma()
  l.male(e)
  void avanti()
}

async function avanti(): Promise<void> {
  if (inCorso) return
  if (riposo) { clearTimeout(riposo); riposo = null }
  const l = coda.shift()
  if (!l) {
    // niente da fare: fra un minuto si spegne, così pdfjs non resta in memoria
    // su un'installazione che apre tre PDF a settimana
    if (filo) {
      const chi = filo
      riposo = setTimeout(() => { if (filo === chi && !inCorso && !coda.length) { filo = null; chi.chiudi() } }, RIPOSO)
      riposo.unref?.()
    }
    return
  }
  /*
   * Il posto si occupa **prima** di aspettare, non dopo.
   *
   * Fra il `shift` e l'`await` qui sotto c'è un buco, e in quel buco un secondo
   * `avanti` entrava: `inCorso` era ancora vuoto, quindi prendeva un altro
   * lavoro e lo sovrascriveva. Le due risposte tornavano dal filo con l'id
   * giusto e trovavano `inCorso` cambiato: una veniva buttata, e chi l'aspettava
   * restava ad aspettare per sempre. Due file letti nello stesso momento — cioè
   * il caso normale — e uno dei due non tornava più.
   */
  inCorso = l
  const f = await accendi()
  if (!f) {
    // il lavoratore non c'è: si apre qui, e pazienza. Meglio un server lento
    // di un server che non legge i PDF.
    try {
      const t = await quiDentro(l.buf, l.nome)
      if (inCorso === l) inCorso = null
      l.bene(t)
    } catch (e) {
      if (inCorso === l) inCorso = null
      l.male(e instanceof Error ? e : new Error(String(e)))
    }
    void avanti()
    return
  }
  /*
   * Una copia dei byte, non i byte.
   *
   * `buf.buffer` di un Buffer piccolo è il pezzo di memoria che Node riusa per
   * tutti i Buffer piccoli: trasferirlo lo staccherebbe da sotto i piedi a
   * chiunque altro lo stia usando in questo momento. Si taglia la propria
   * fetta e si manda quella.
   */
  const byte = l.buf.buffer.slice(l.buf.byteOffset, l.buf.byteOffset + l.buf.byteLength) as ArrayBuffer
  f.tieni(true)
  sveglia = setTimeout(() => {
    // il filo è appeso dentro pdfjs e non risponderà mai: si chiude di forza e
    // se ne accende un altro al prossimo file
    const chi = filo
    filo = null
    chi?.chiudi()
    cadde(new Error('troppo lento'))
  }, tempoMax)
  // se il filo è morto proprio adesso, `postMessage` lancia: senza questo,
  // il lavoro resterebbe appeso senza che nessuno lo respinga
  try { f.manda({ id: l.id, byte, nome: l.nome }, [byte]) } catch (e) {
    cadde(e instanceof Error ? e : new Error(String(e)))
  }
}

/**
 * Il testo di un file che abbiamo già in mano.
 *
 * I file di testo si aprono qui e basta: leggerli è una conversione di
 * codifica, non un calcolo, e mandarli di là costerebbe più della lettura.
 * PDF e Word passano dal filo a parte.
 */
export async function daBuffer(buf: Buffer, nome: string): Promise<string> {
  const ext = extname(nome).toLowerCase()
  if (!RICCHI.includes(ext)) return quiDentro(buf, nome)
  if (coda.length >= CODA_MAX) throw new Error('coda piena')
  return new Promise<string>((bene, male) => {
    coda.push({ id: ++contatore, buf, nome, bene, male })
    void avanti()
  })
}

/** Da usare nelle prove e alla chiusura: spegne il filo, se è acceso. */
export function chiudiIlFilo() {
  if (riposo) { clearTimeout(riposo); riposo = null }
  const chi = filo
  filo = null
  chi?.chiudi()
  // chi stava aspettando quel filo va respinto qui: la sua uscita non lo farà
  // più, e restare appesi per sempre è peggio di un documento perso
  if (chi) cadde(new Error('troppo lento'))
}

/**
 * Il tipo, come lo chiama Myynd nelle sue schede.
 *
 * Non il MIME e non l'estensione: è la parola che compare accanto al titolo
 * quando quel documento si ritrova cercando, e va detta in una lingua da
 * persone.
 */
export function tipoDi(nome: string): string {
  const ext = extname(nome).toLowerCase()
  if (ext === '.pdf') return 'pdf'
  if (ext === '.docx' || ext === '.rtf') return 'documento'
  if (ext === '.csv' || ext === '.xlsx') return 'tabella'
  if (ext === '.pptx') return 'presentazione'
  if (ext === '.html' || ext === '.htm') return 'pagina'
  return 'file'
}
