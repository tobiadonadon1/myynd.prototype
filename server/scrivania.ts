// Le mani: quello che Myynd sa mettere sul disco, e aprire.
//
// Fino a qui questa applicazione non aveva mani. Leggeva tutto, ragionava su
// tutto, e produceva testo dentro una finestra sua: per portarlo fuori bisognava
// selezionarlo, copiarlo, aprire Word e incollarlo — cioè fare a mano l'ultimo
// pezzo, che è quello che si ricorda. Un assistente che scrive un documento e
// non lo *sa salvare* non è un assistente, è un campo di testo.
//
// Qui ci sono i primi due verbi veri: scrivere un file e aprirlo. Restano
// dentro la stessa regola di tutto il resto — li fa partire il dito di una
// persona, e finiscono nel registro — e dentro due recinti che non si possono
// scavalcare:
//
// — **solo nelle cartelle che hai collegato tu.** Non «la home», non «dove dice
//   il modello»: le stesse cartelle che hai scelto per farti leggere. Il
//   percorso si risolve e si controlla che stia davvero dentro una di quelle,
//   dopo aver seguito i link simbolici — un `..` dentro un nome di file è il
//   modo più vecchio del mondo per uscire da una cartella.
// — **non sovrascrive mai.** Se il nome è già preso si scrive «nome 2.md». Un
//   assistente che sovrascrive un file è un assistente che una volta ti cancella
//   il lavoro di ieri, e da quel giorno non lo lasci più lavorare.

import { execFile } from 'node:child_process'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { ConfigDesktop } from './config.ts'
import { FONTI_POSTA } from './connettori/registro.ts'

const esegui = promisify(execFile)

/** I formati che sappiamo scrivere. Chiuso, come tutti i vocabolari qui dentro. */
export const FORMATI = ['.md', '.txt', '.rtf'] as const
export type Formato = typeof FORMATI[number]

/**
 * Un nome di file che si può scrivere senza pensarci.
 *
 * Arriva dall'interfaccia, quindi da fuori. Niente barre, niente due punti,
 * niente nomi che cominciano per punto: quello che resta è un nome di file come
 * lo scriverebbe una persona, accenti e spazi compresi.
 */
export function nomePulito(nome: string, formato: Formato): string {
  const senza = nome
    .replace(/[/\\:]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+/, '')
    .trim()
    .slice(0, 120)
  const base = senza.replace(/\.(md|txt|rtf)$/i, '').trim() || 'documento'
  return base + formato
}

/**
 * La cartella è davvero una di quelle collegate?
 *
 * `realpath` prima del confronto, e non è pignoleria: senza, un link simbolico
 * dentro una cartella collegata è una porta verso qualunque punto del disco. E
 * il confronto è sul separatore — `/Users/x/Doc` non deve passare per
 * `/Users/x/Documenti`.
 */
async function dentroLeTue(cartella: string, c: ConfigDesktop | null | undefined): Promise<string> {
  const scelte = c?.cartelle ?? []
  if (!scelte.length) throw new Error('Collega una cartella del desktop e potrò scriverci.')
  const vero = await realpath(resolve(cartella)).catch(() => resolve(cartella))
  for (const s of scelte) {
    const radice = await realpath(resolve(s)).catch(() => resolve(s))
    if (vero === radice || vero.startsWith(radice + '/')) return vero
  }
  throw new Error('Posso scrivere solo nelle cartelle che hai collegato.')
}

/** Se il nome è preso, il seguente: «relazione 2.md». Non si sovrascrive. */
function libero(cartella: string, nome: string): string {
  const est = extname(nome)
  const base = nome.slice(0, nome.length - est.length)
  let p = join(cartella, nome)
  for (let i = 2; existsSync(p) && i < 500; i++) p = join(cartella, `${base} ${i}${est}`)
  return p
}

/** Fuori dall'ASCII l'RTF vuole \\uNNNN — e in italiano «è» c'è ovunque. */
const FUORI_ASCII = new RegExp('[\\u0080-\\uFFFF]', 'g')

/**
 * Markdown in RTF: grassetto, corsivo e titoli che Word e Pages capiscono.
 *
 * Si potrebbe aggiungere una libreria per il .docx vero. Non ancora: l'RTF lo
 * aprono Word, Pages e TextEdit senza installare niente, e una dipendenza in più
 * su un'app firmata costa più di quanto renda finché non la chiede qualcuno.
 */
export function inRtf(md: string): string {
  const fuga = (s: string) => s
    .replace(/[\\{}]/g, m => `\\${m}`)
    .replace(FUORI_ASCII, m => `\\u${m.charCodeAt(0)}?`)

  const righe = md.split('\n').map(r => {
    const t = r.match(/^(#{1,3})\s+(.*)$/)
    if (t) {
      const dim = [32, 28, 24][t[1].length - 1]
      return `{\\b\\fs${dim} ${grassetti(fuga(t[2]))}\\par}`
    }
    if (!r.trim()) return '\\par'
    const lista = r.match(/^\s*[-*]\s+(.*)$/)
    if (lista) return `{\\bullet\\tab ${grassetti(fuga(lista[1]))}\\par}`
    return `${grassetti(fuga(r))}\\par`
  })
  return `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Helvetica;}}\\fs24\n${righe.join('\n')}\n}`
}

function grassetti(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '{\\b $1}')
    .replace(/(^|[^*])\*([^*]+?)\*/g, '$1{\\i $2}')
}

export type Scritto = { percorso: string; nome: string }

/**
 * Scrive il documento e ne restituisce il percorso vero.
 *
 * Il testo arriva come Markdown perché è così che lo scrive il modello. Per
 * `.md` e `.txt` va giù com'è; per `.rtf` si converte, così chi lo apre in Word
 * trova i titoli in grassetto invece dei cancelletti.
 */
export async function scrivi(
  desktop: ConfigDesktop | null | undefined,
  o: { cartella: string; nome: string; testo: string; formato: Formato }
): Promise<Scritto> {
  if (!FORMATI.includes(o.formato)) throw new Error('Non so scrivere quel tipo di file.')
  if (!o.testo.trim()) throw new Error('Non c’è niente da salvare.')
  const dove = await dentroLeTue(o.cartella, desktop)
  await mkdir(dove, { recursive: true })
  const percorso = libero(dove, nomePulito(o.nome, o.formato))
  const corpo = o.formato === '.rtf' ? inRtf(o.testo) : o.testo
  await writeFile(percorso, corpo, 'utf8')
  return { percorso, nome: percorso.slice(dirname(percorso).length + 1) }
}

/**
 * Aprire quello che ha appena scritto.
 *
 * `execFile` e non `exec`: il secondo passa da una shell, e un nome di file con
 * dentro un punto e virgola diventerebbe un comando. Qui il percorso è un
 * argomento, e un argomento non può diventare altro. E si apre solo un file che
 * sta in una cartella collegata — la stessa regola della scrittura, perché
 * «apri» su un file qualsiasi è un modo di far succedere qualsiasi cosa.
 */
export async function apri(desktop: ConfigDesktop | null | undefined, percorso: string): Promise<void> {
  const vero = await dentroLeTue(percorso, desktop)
  if (process.platform !== 'darwin') throw new Error(SOLO_MAC)
  await lancia([vero])
}

// — portami lì —
//
// «Dov'è che mi chiede quale unità di H-Farm guarda l'audit? Perché non c'è un
// bottone che dice "portami lì così la vedo adesso"?» Quella riga veniva da una
// mail e dalle domande di un'altra riga, e l'unica cosa che l'app sapeva fare
// era mostrare il documento *dentro* Myynd — che è un'altra cosa: vederne una
// copia non è essere lì dove si risponde.
//
// Qui sotto c'è quella strada, e sta tutta in due pezzi separati apposta: uno
// che *decide* dove si va — puro, senza disco e senza processi, quindi
// provabile — e uno che lo fa partire. Un `open` con un argomento controllato e
// nient'altro: non c'è nessun altro comando in questo file, e non ce ne deve
// essere nessun altro.

/** Le frasi che possono tornare a chi ha premuto il bottone. Tradotte in `lingua.ts`. */
const SOLO_MAC = 'Posso portarti lì solo sul Mac.'
const DA_NESSUN_POSTO = 'Questa riga non viene da nessun posto che possa aprire.'

/** I connettori che portano posta: l'id del documento dice quale. */
const POSTA = new Set<string>([...FONTI_POSTA, 'gmail', 'outlook', 'imap'])
/** Quelli che si leggono nel browser: lì «aprire la mail» vuol dire una pagina. */
const POSTA_WEB = new Set(['google', 'gmail'])

/** Il connettore di un documento: il pezzo prima dei due punti del suo id. */
export function connettoreDi(doc: string | null | undefined, fonte?: string | null): string {
  return ((doc ?? '').split(':')[0] || (fonte ?? '').split(':')[0] || '').trim().toLowerCase()
}

/**
 * Un `Message-ID` di cui ci si può fidare abbastanza da metterlo in un URL.
 *
 * Le parentesi angolari vanno via — nell'intestazione ci stanno, nell'URL no —
 * e quello che resta deve essere fatto solo dei caratteri con cui si scrive un
 * `unico@dominio`. Non è pignoleria: questo pezzo finisce dentro un indirizzo
 * che il sistema consegna a un'applicazione, e un id con dentro uno spazio, un
 * apice o una barra non è più un id — è la coda di un altro URL. Quando non
 * passa non si inventa niente: si apre il programma di posta e basta.
 */
export function idMessaggio(x: string | null | undefined): string {
  const pulito = String(x ?? '').trim().replace(/^<+|>+$/g, '').trim()
  if (!pulito || pulito.length > 300) return ''
  return /^[A-Za-z0-9._~!$&*+=@-]+$/.test(pulito) ? pulito : ''
}

/**
 * L'indirizzo che apre *quel* messaggio, non la casella.
 *
 * Su Mac è `message://%3C<id>%3E`: lo capiscono Mail e ogni client che si
 * registra per quello schema, ed è il modo in cui un link a una mail funziona
 * da vent'anni. Per Gmail — che qui si legge dal browser, non da Mail — è la
 * ricerca `rfc822msgid:`, che porta sul messaggio preciso.
 *
 * Stringa vuota vuol dire «non so quale»: chi la riceve apre il programma di
 * posta e si ferma lì. È meno di quanto promesso, ma è vero.
 */
export function linkMail(connettore: string, messaggio: string | null | undefined): string {
  const id = idMessaggio(messaggio)
  if (POSTA_WEB.has(connettore)) {
    return id
      ? `https://mail.google.com/mail/u/0/#search/rfc822msgid:${encodeURIComponent(id)}`
      : ''
  }
  return id ? `message://%3C${id}%3E` : ''
}

/** Solo http e https: ogni altro schema è un modo di far partire altro. */
export function paginaBuona(url: string | null | undefined): string {
  const s = String(url ?? '').trim()
  if (!/^https?:\/\//i.test(s)) return ''
  try {
    const u = new URL(s)
    return u.username || u.password ? '' : u.toString()
  } catch { return '' }
}

/** Dove porta una riga. Deciso prima di toccare qualunque cosa. */
export type Destinazione =
  | { dove: 'posta'; url: string }
  | { dove: 'file'; percorso: string }
  | { dove: 'pagina'; url: string }
  | { dove: 'compito'; id: string }
  | { dove: 'progetto'; id: string }
  | { dove: 'niente'; errore: string }

/** Quel poco che serve di una riga della lista per sapere dove porta. */
export type Riga = { doc?: string | null; madre?: string | null; progetto?: string | null }
/** Quel poco che serve del documento da cui viene. */
export type Fonte = { fonte?: string | null; percorso?: string | null; messageId?: string | null; tipo?: string | null } | null

/**
 * Quello che, aperto, mostra *una cosa sola da leggere*.
 *
 * «When you link me to a certain file, it is not specific. It links me to the
 * folder, not the file.» Era vero alla lettera. Una chat di Claude Code porta
 * nel `percorso` la cartella del progetto — il ventidue settembre, nel suo
 * punto, era `/Users/tobiadonadon`, cioè la casa — e una cartella di lavoro
 * è una cartella per definizione: `dovePortare` le manda tutte e due su
 * `file`, e `open` apre il Finder. Una riga che promette un documento e apre
 * una finestra del Finder sulla home è peggio di una riga senza freccia.
 *
 * Qui non si decide *dove* si va — quello lo fa `dovePortare` e resta com'era
 * — si risponde a un'altra domanda: quello che c'è dall'altra parte è una
 * cosa da leggere? Una mail, una pagina, un file sì; una cartella no; una
 * riga che non porta da nessuna parte nemmeno.
 *
 * Pura, e guarda solo il tipo del documento: il tipo lo scrive chi indicizza
 * — `cartella` per le cartelle di lavoro, `chat` per le sessioni degli
 * agenti — e l'estensione non basta, perché `myynd.prototype` è una cartella
 * che a `extname` sembra un file `.prototype`.
 */
export function unaCosaSola(d: Destinazione, fonte: Fonte): boolean {
  const tipo = (fonte?.tipo ?? '').trim().toLowerCase()
  if (tipo === 'cartella' || tipo === 'chat') return false
  return d.dove === 'posta' || d.dove === 'pagina' || d.dove === 'file'
}

/**
 * Le tre strade, nell'ordine in cui si provano.
 *
 * Prima il documento — la mail, il file, la pagina — perché è il posto dove la
 * cosa *è*. Poi la riga che l'ha fatta nascere: le due righe del tredici
 * settembre non avevano nessun documento, venivano dalle domande di un'altra
 * riga, e quella riga è il posto giusto. Poi il progetto. Se non c'è nessuna
 * delle tre lo si dice: un bottone che apre il vuoto è peggio di un bottone che
 * non c'è.
 *
 * Il documento cancellato non è un vicolo cieco: si scende alla riga madre e al
 * progetto come se il documento non ci fosse mai stato.
 *
 * È pura apposta. Decide guardando due oggetti e non fa partire niente: è
 * l'unico modo di provare sei casi senza aprire sei finestre sul Mac di
 * qualcuno.
 */
export function dovePortare(r: Riga, d: Fonte): Destinazione {
  if (r.doc && d) {
    const connettore = connettoreDi(r.doc, d.fonte)
    if (POSTA.has(connettore)) {
      // Outlook supplies the exact message URL. Prefer it to a local Mail link.
      const pagina = paginaBuona(d.percorso)
      if (pagina) return { dove: 'pagina', url: pagina }
      const url = linkMail(connettore, d.messageId)
      if (url) return { dove: 'posta', url }
      // Opening a generic inbox would not fulfil “Take me to it”.
      return { dove: 'niente', errore: DA_NESSUN_POSTO }
    }
    const percorso = String(d.percorso ?? '').trim()
    // un file vero comincia dalla radice; una pagina comincia da http. Non si
    // guarda il nome del connettore: ne arriva uno nuovo ogni mese, e la forma
    // di quello che tiene dentro non cambia
    if (percorso.startsWith('/')) return { dove: 'file', percorso }
    const url = paginaBuona(percorso)
    if (url) return { dove: 'pagina', url }
  }
  if (r.madre) return { dove: 'compito', id: r.madre }
  if (r.progetto) return { dove: 'progetto', id: r.progetto }
  return { dove: 'niente', errore: DA_NESSUN_POSTO }
}

/**
 * Portarcelo davvero, sul suo Mac.
 *
 * `compito` e `progetto` non passano di qui: quelli non sono posti del sistema,
 * sono posti dell'app, e li apre la pagina.
 */
export async function porta(desktop: ConfigDesktop | null | undefined, d: Destinazione): Promise<void> {
  if (process.platform !== 'darwin') throw new Error(SOLO_MAC)
  if (d.dove === 'file') return apri(desktop, d.percorso)
  if (d.dove === 'pagina') {
    const url = paginaBuona(d.url)
    if (!url) throw new Error(DA_NESSUN_POSTO)
    await lancia([url])
    return
  }
  if (d.dove === 'posta') {
    // senza il `Message-ID` non si sa quale messaggio: si apre il programma e
    // si smette di promettere. `-a Mail` è un argomento fisso, non un nome che
    // arriva da fuori
    await lancia(d.url ? [d.url] : ['-a', 'Mail'])
    return
  }
  throw new Error(DA_NESSUN_POSTO)
}

/**
 * L'unico posto da cui parte un processo, in tutto il file.
 *
 * Averne uno solo è quello che rende vera la frase «qui non si esegue niente
 * che non sia `open`»: si legge in dieci righe invece di doverlo controllare a
 * ogni chiamata. E dà alle prove un punto solo dove mettere la mano, invece di
 * aprire davvero una finestra sul computer di chi le fa girare.
 */
async function lancia(argomenti: string[]): Promise<void> {
  const finta = perProva.apri
  if (finta) { finta(argomenti); return }
  await esegui('/usr/bin/open', argomenti)
}

/** La mano delle prove: con `apri` impostata, `open` non parte mai davvero. */
export const perProva: { apri: ((argomenti: string[]) => void) | null } = { apri: null }

/** Il testo di un documento appena scritto, per riaprirlo dove serve. */
export async function rileggi(desktop: ConfigDesktop | null | undefined, percorso: string): Promise<string> {
  const vero = await dentroLeTue(percorso, desktop)
  return readFile(vero, 'utf8')
}
