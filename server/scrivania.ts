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
  if (process.platform !== 'darwin') throw new Error('So aprire i file solo su Mac, per ora.')
  await esegui('/usr/bin/open', [vero])
}

/** Il testo di un documento appena scritto, per riaprirlo dove serve. */
export async function rileggi(desktop: ConfigDesktop | null | undefined, percorso: string): Promise<string> {
  const vero = await dentroLeTue(percorso, desktop)
  return readFile(vero, 'utf8')
}
