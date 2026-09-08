// Le Note di Apple: quello che ti sei scritto, letto dal Mac.
//
// Note è dove una persona butta le cose che non stanno da nessun'altra parte:
// l'appunto preso al telefono, la lista per il commercialista, il pezzo di
// email da riscrivere. Finché restano lì Myynd ragiona su tutto tranne che
// su quello. Si legge come Granola: dal file che l'app tiene su questo disco,
// senza chiedere niente a nessuno — con una differenza che va detta subito.
//
// **Serve un permesso, e non si può chiedere da qui.** Il database delle
// Note sta in `~/Library/Group Containers`, una cartella che macOS protegge
// anche da chi la casa ce l'ha. Senza «Accesso completo al disco» dato a
// Myynd nelle Impostazioni di Sistema, aprirlo risponde «operazione non
// permessa» — e questo connettore lo dice con quelle parole, invece di
// collegarsi a zero. Lo stato del permesso lo guarda `accesso.ts`.
//
// **Si legge una copia.** Il database è SQLite con un write-ahead log, e Note
// ci scrive mentre la persona scrive: aprire l'originale, anche in sola
// lettura, vuol dire contendersi un lucchetto con l'app. Si copiano i tre file
// (`.sqlite`, `-wal`, `-shm`) in una cartella temporanea, si apre la copia e
// si butta via. L'originale non si tocca mai.
//
// **Il testo è dentro un protobuf dentro un gzip.** Non è un formato
// documentato: è come Note salva il corpo, ed è stato letto da chi ha avuto
// la pazienza di guardarci dentro. La forma è stabile da anni, ma è roba di
// Apple e può cambiare — e quando non si riconosce più, il connettore lo
// dice invece di restare a zero per sempre. Non serve una libreria: si
// cammina il messaggio a mano, che è una trentina di righe.

import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { DatabaseSync } from 'node:sqlite'
import type { Documento } from '../store.ts'
import { lingua, type ConfigNote } from '../config.ts'

/** Il tetto di note. Chi usa Note da dieci anni ci arriva. */
const TETTO = 3000
/** Quanto testo si tiene per nota. Oltre, è un documento incollato, non una nota. */
const TESTO_MAX = 20_000
/** Oltre questa taglia il gzip non si apre nemmeno: non è una nota, è un allegato. */
const DATI_MAX = 8_000_000
/** I secondi fra il 1970 e il 2001: le date di Apple contano da lì. */
const EPOCA_APPLE = 978_307_200

/**
 * Dove Note tiene il suo database. Fisso, come per Granola, e per la stessa
 * ragione: lasciar scrivere il percorso sarebbe l'unico modo per far leggere
 * a Myynd un database qualunque di questo disco.
 */
export function percorso(casa = homedir()): string {
  return join(casa, 'Library', 'Group Containers', 'group.com.apple.notes', 'NoteStore.sqlite')
}

export function possibile(): boolean {
  return process.platform === 'darwin'
}

// — il protobuf —

// Gli errori qui sotto non arrivano a nessuno: `testoDa` li prende tutti e
// risponde `null`. Sono `RangeError` e non `Error` apposta, perché non sono
// frasi da tradurre — sono il segno che i byte non sono quelli attesi.

/** Un varint, e dove finisce. */
function varint(b: Uint8Array, i: number): { valore: number; dopo: number } {
  let valore = 0
  let scala = 1
  while (i < b.length) {
    const byte = b[i++]!
    valore += (byte & 0x7f) * scala
    if (!(byte & 0x80)) return { valore, dopo: i }
    scala *= 128
    if (scala > 2 ** 56) break
  }
  throw new RangeError('varint rotto')
}

/**
 * Il primo campo con questo numero e a lunghezza definita, dentro un messaggio.
 *
 * Non si decodifica tutto: si saltano i campi che non interessano — un varint,
 * un numero a otto o a quattro byte — e ci si ferma al primo che ha il numero
 * giusto. È tutto quello che serve per scendere di tre livelli.
 */
export function campo(b: Uint8Array, numero: number): Uint8Array | null {
  let i = 0
  while (i < b.length) {
    const chiave = varint(b, i)
    i = chiave.dopo
    const n = Math.floor(chiave.valore / 8)
    const tipo = chiave.valore % 8
    if (tipo === 0) { i = varint(b, i).dopo; continue }
    if (tipo === 1) { i += 8; continue }
    if (tipo === 5) { i += 4; continue }
    if (tipo !== 2) throw new RangeError('protobuf che non si capisce')
    const lunghezza = varint(b, i)
    const inizio = lunghezza.dopo
    const fine = inizio + lunghezza.valore
    if (fine > b.length) throw new RangeError('protobuf troncato')
    if (n === numero) return b.subarray(inizio, fine)
    i = fine
  }
  return null
}

/**
 * Il testo di una nota dai byte di `ZDATA`.
 *
 * Gzip, poi tre campi in fila: il documento (2), la nota (3), il testo (2).
 * `null` è «non è la forma che conosco»: chi chiama lo conta, e se sono
 * tutte così lo dice.
 */
export function testoDa(dati: Uint8Array): string | null {
  let aperto: Uint8Array
  try { aperto = gunzipSync(dati, { maxOutputLength: TESTO_MAX * 8 }) } catch { return null }
  try {
    const documento = campo(aperto, 2)
    const nota = documento && campo(documento, 3)
    const testo = nota && campo(nota, 2)
    return testo ? Buffer.from(testo).toString('utf8') : null
  } catch {
    return null
  }
}

/** Gli oggetti incorporati — tabelle, allegati — lasciano un segnaposto: si toglie. */
function ripulisci(s: string): string {
  return s.replace(/￼/g, '').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
}

// — il database —

type Riga = {
  pk: number
  identificatore: string | null
  titolo: string | null
  cartella: string | null
  modificata: number | null
  dati: Uint8Array | null
}

/** Le colonne di una tabella, per scrivere una query che chiede solo quello che c'è. */
function colonne(db: DatabaseSync, tabella: string): Set<string> {
  const righe = db.prepare(`PRAGMA table_info(${tabella})`).all() as { name: string }[]
  return new Set(righe.map(r => r.name))
}

/**
 * Le note vive, dalla copia del database.
 *
 * Tutto sta in una tabella sola — `ZICCLOUDSYNCINGOBJECT` — dove note e
 * cartelle sono righe dello stesso tipo: il titolo di una nota è `ZTITLE1`,
 * quello di una cartella `ZTITLE2`, e la nota punta alla sua cartella con
 * `ZFOLDER`. Il corpo sta a parte, in `ZICNOTEDATA`. Le colonne non sono
 * tutte in tutte le versioni di macOS: si chiedono solo quelle che ci sono.
 */
function righe(db: DatabaseSync): Riga[] {
  const c = colonne(db, 'ZICCLOUDSYNCINGOBJECT')
  const d = colonne(db, 'ZICNOTEDATA')
  if (!c.has('ZTITLE1') || !d.has('ZDATA') || !d.has('ZNOTE')) {
    throw new Error('Note ha cambiato il modo in cui salva le note: questo collegamento va aggiornato.')
  }
  const dove = ['n.ZTITLE1 IS NOT NULL']
  if (c.has('ZMARKEDFORDELETION')) dove.push('COALESCE(n.ZMARKEDFORDELETION, 0) = 0', 'COALESCE(f.ZMARKEDFORDELETION, 0) = 0')
  if (c.has('ZISPASSWORDPROTECTED')) dove.push('COALESCE(n.ZISPASSWORDPROTECTED, 0) = 0')
  // il cestino è una cartella come le altre, con un tipo suo
  if (c.has('ZFOLDERTYPE')) dove.push('COALESCE(f.ZFOLDERTYPE, 0) <> 1')
  const cartella = c.has('ZFOLDER') && c.has('ZTITLE2') ? 'f.ZTITLE2' : 'NULL'
  const unione = c.has('ZFOLDER') ? 'LEFT JOIN ZICCLOUDSYNCINGOBJECT f ON f.Z_PK = n.ZFOLDER' : 'LEFT JOIN ZICCLOUDSYNCINGOBJECT f ON 0'
  const modificata = c.has('ZMODIFICATIONDATE1') ? 'n.ZMODIFICATIONDATE1' : 'NULL'
  const identificatore = c.has('ZIDENTIFIER') ? 'n.ZIDENTIFIER' : 'NULL'
  const sql = `
    SELECT n.Z_PK AS pk, ${identificatore} AS identificatore, n.ZTITLE1 AS titolo,
           ${cartella} AS cartella, ${modificata} AS modificata, d.ZDATA AS dati
    FROM ZICCLOUDSYNCINGOBJECT n
    JOIN ZICNOTEDATA d ON d.ZNOTE = n.Z_PK
    ${unione}
    WHERE ${dove.join(' AND ')}
    ORDER BY ${modificata === 'NULL' ? 'n.Z_PK' : modificata} DESC
    LIMIT ${TETTO + 1}`
  return db.prepare(sql).all() as unknown as Riga[]
}

/**
 * Una copia dei tre file in una cartella temporanea, aperta in sola lettura.
 *
 * `-wal` e `-shm` possono non esserci — Note li scrive solo mentre lavora —
 * e allora si copia il database e basta. Se manca lui, o non si lascia
 * aprire, la frase la decide chi chiama.
 */
async function copia(sorgente: string): Promise<{ db: DatabaseSync; butta: () => Promise<void> }> {
  const dove = await mkdtemp(join(tmpdir(), 'myynd-note-'))
  const butta = () => rm(dove, { recursive: true, force: true })
  try {
    await copyFile(sorgente, join(dove, 'NoteStore.sqlite'))
    for (const coda of ['-wal', '-shm']) {
      try { await copyFile(`${sorgente}${coda}`, join(dove, `NoteStore.sqlite${coda}`)) } catch { /* non c'è: va bene */ }
    }
    const db = new DatabaseSync(join(dove, 'NoteStore.sqlite'), { readOnly: true })
    return { db, butta: async () => { db.close(); await butta() } }
  } catch (e) {
    await butta()
    throw e
  }
}

// — leggere —

export type EsitoNote = {
  docs: Documento[]
  /** Le note che c'erano ma senza una parola dentro. */
  vuote: number
  /** Le note il cui corpo non si è capito: se sono tutte, il formato è cambiato. */
  illeggibili: number
  troncato: boolean
}

/** La frase per chi non ha il permesso: la stessa che l'interfaccia mette accanto al bottone. */
export const SENZA_PERMESSO = 'Per leggere le Note serve l’accesso completo al disco: Impostazioni di Sistema › Privacy e sicurezza › Accesso completo al disco › Myynd.'

/**
 * Le Note, lette da una copia del database.
 *
 * `troncato` va fino a `riconcilia`: una lettura fermata al tetto non deve
 * cancellare dall'indice le note che non ha fatto in tempo a rileggere.
 */
export async function leggi(sorgente = percorso()): Promise<EsitoNote> {
  let aperto: Awaited<ReturnType<typeof copia>>
  try {
    aperto = await copia(sorgente)
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code === 'EPERM' || code === 'EACCES') throw new Error(SENZA_PERMESSO)
    if (code === 'ENOENT') throw new Error('Non trovo le Note su questo Mac. Apri Note una volta e riprova.')
    throw new Error('Non riesco a leggere le Note.')
  }

  const senzaTitolo = lingua() === 'it' ? 'Nota senza titolo' : 'Untitled note'
  const docs: Documento[] = []
  let vuote = 0
  let illeggibili = 0
  let troncato = false
  try {
    const tutte = righe(aperto.db)
    for (const r of tutte) {
      if (docs.length >= TETTO) { troncato = true; break }
      if (!r.dati || r.dati.length === 0 || r.dati.length > DATI_MAX) { vuote++; continue }
      const testo = testoDa(r.dati)
      if (testo == null) { illeggibili++; continue }
      const corpo = ripulisci(testo)
      if (!corpo) { vuote++; continue }
      const titolo = (r.titolo ?? '').trim() || senzaTitolo
      const quando = typeof r.modificata === 'number' && Number.isFinite(r.modificata)
        ? new Date((r.modificata + EPOCA_APPLE) * 1000).toISOString()
        : null
      docs.push({
        id: `note:${r.identificatore?.trim() || r.pk}`,
        fonte: 'note',
        tipo: 'nota',
        titolo,
        corpo: corpo.length > TESTO_MAX ? `${corpo.slice(0, TESTO_MAX)}…` : corpo,
        autore: null,
        percorso: r.cartella?.trim() || null,
        quando,
        gruppo: 'note'
      })
    }
  } finally {
    await aperto.butta()
  }
  // c'erano note, e nessuna si è capita: non è una casa vuota, è un formato
  // che non parla più la nostra lingua — e va detto, non taciuto
  if (!docs.length && illeggibili > 0) {
    throw new Error('Note ha cambiato il modo in cui salva le note: questo collegamento va aggiornato.')
  }
  return { docs, vuote, illeggibili, troncato }
}

/** La prova è già una lettura vera: se passa, il collegamento funziona. */
export async function prova(sorgente = percorso()): Promise<{ ok: true; note: number } | { ok: false; errore: string }> {
  if (!possibile()) return { ok: false, errore: 'Note è un’app per Mac: su questo computer non c’è niente da leggere.' }
  try {
    const e = await leggi(sorgente)
    return { ok: true, note: e.docs.length }
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : String(e) }
  }
}

export async function sincronizza(): Promise<EsitoNote> {
  return leggi()
}

export function collegato(c: { note?: ConfigNote }): boolean {
  return !!c.note
}
