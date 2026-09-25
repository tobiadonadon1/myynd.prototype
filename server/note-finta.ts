// Un archivio delle Note finto, con le tabelle e il formato veri.
//
// Il database vero non entra in una prova: su questa macchina, dal terminale,
// non si apre nemmeno. Qui si costruisce un `NoteStore.sqlite` con le stesse
// tabelle e le stesse colonne, e il corpo di ogni nota si scrive com'è scritto
// davvero: un protobuf dentro un gzip, codificato a mano. Lo usano la prova
// delle Note e quella della salute delle fonti, che lo rimette al suo posto
// per vedere le Note guarire dal vivo.

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { DatabaseSync } from 'node:sqlite'

// — il protobuf, scritto a mano —

export const varint = (n: number): number[] => {
  const fuori: number[] = []
  do { let b = n & 0x7f; n = Math.floor(n / 128); if (n) b |= 0x80; fuori.push(b) } while (n)
  return fuori
}
export const lungo = (campo: number, dentro: Uint8Array | number[]): number[] => [...varint(campo * 8 + 2), ...varint(dentro.length), ...dentro]
export const numero = (campo: number, v: number): number[] => [...varint(campo * 8), ...varint(v)]
export const testo = (s: string) => [...Buffer.from(s, 'utf8')]

/** Il corpo di una nota come lo scrive Note: gzip di Documento(2){ versione(1), Nota(3){ testo(2), attributi(5)… } }. */
export const corpoNota = (s: string): Buffer => gzipSync(Buffer.from([
  ...numero(1, 7),                                         // un varint prima, da saltare
  ...lungo(2, [
    ...numero(2, 1),                                       // Document.version
    ...lungo(3, [
      ...lungo(1, testo('un campo che non è il testo')),   // da saltare, stesso tipo
      ...lungo(2, testo(s)),                               // Note.note_text
      ...lungo(5, [...numero(1, 12), ...numero(2, 3)])     // un attribute_run dopo
    ])
  ])
]))

// — il database finto, con le tabelle vere —

export type NotaFinta = {
  pk: number; id?: string; titolo: string | null; cartella: number | null; modificata?: number
  cancellata?: number; protetta?: number; corpo?: Buffer | null
}

/** Un `NoteStore.sqlite` in una casa finta, con le cartelle e le note date. */
export function scriviDb(casa: string, cartelle: { pk: number; titolo: string; tipo?: number; cancellata?: number }[], note: NotaFinta[]): string {
  const dir = join(casa, 'Library', 'Group Containers', 'group.com.apple.notes')
  mkdirSync(dir, { recursive: true })
  const p = join(dir, 'NoteStore.sqlite')
  const db = new DatabaseSync(p)
  db.exec(`
    CREATE TABLE ZICCLOUDSYNCINGOBJECT (
      Z_PK INTEGER PRIMARY KEY, ZIDENTIFIER TEXT, ZTITLE1 TEXT, ZTITLE2 TEXT, ZFOLDER INTEGER,
      ZFOLDERTYPE INTEGER, ZMODIFICATIONDATE1 REAL, ZMARKEDFORDELETION INTEGER, ZISPASSWORDPROTECTED INTEGER
    );
    CREATE TABLE ZICNOTEDATA (Z_PK INTEGER PRIMARY KEY, ZNOTE INTEGER, ZDATA BLOB);
  `)
  const c = db.prepare('INSERT INTO ZICCLOUDSYNCINGOBJECT (Z_PK, ZTITLE2, ZFOLDERTYPE, ZMARKEDFORDELETION) VALUES (?, ?, ?, ?)')
  for (const f of cartelle) c.run(f.pk, f.titolo, f.tipo ?? 0, f.cancellata ?? 0)
  const n = db.prepare('INSERT INTO ZICCLOUDSYNCINGOBJECT (Z_PK, ZIDENTIFIER, ZTITLE1, ZFOLDER, ZMODIFICATIONDATE1, ZMARKEDFORDELETION, ZISPASSWORDPROTECTED) VALUES (?, ?, ?, ?, ?, ?, ?)')
  const d = db.prepare('INSERT INTO ZICNOTEDATA (Z_PK, ZNOTE, ZDATA) VALUES (?, ?, ?)')
  note.forEach((x, i) => {
    n.run(x.pk, x.id ?? null, x.titolo, x.cartella, x.modificata ?? null, x.cancellata ?? 0, x.protetta ?? 0)
    if (x.corpo !== undefined) d.run(100 + i, x.pk, x.corpo)
  })
  db.close()
  return p
}
