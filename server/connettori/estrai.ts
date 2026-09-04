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

/** Quello che è un documento per una persona, non per un compilatore. */
export const TESTO = ['.md', '.markdown', '.txt', '.rtf', '.csv', '.org', '.tex']
export const RICCHI = ['.pdf', '.docx']
export const LETTI = [...RICCHI, ...TESTO]

/** Il file è di quelli che sappiamo leggere? */
export function leggibile(nome: string): boolean {
  return LETTI.includes(extname(nome).toLowerCase())
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

  return riflua(buf.toString('utf8').trim())
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
  if (ext === '.docx') return 'documento'
  if (ext === '.csv') return 'tabella'
  return 'file'
}
