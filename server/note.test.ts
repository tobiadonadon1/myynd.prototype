// Le Note di Apple, e il permesso che serve per leggerle.
//
// Il database vero non entra in una prova — e su questa macchina, dal
// terminale, non si apre nemmeno: è proprio la cartella che macOS protegge.
// Quindi si costruisce qui un `NoteStore.sqlite` con le stesse tabelle e le
// stesse colonne, e il corpo di ogni nota si scrive com'è scritto davvero: un
// protobuf dentro un gzip, codificato a mano. Le cose che devono valere:
//
//   · **il testo esce dal protobuf.** Documento (2) → Nota (3) → testo (2),
//     con in mezzo campi di altri tipi che il camminatore deve saltare.
//   · **quello che non è una nota viva resta fuori.** Cancellata, protetta da
//     password, nel cestino, vuota: esistono nel file, non nell'indice.
//   · **il permesso mancante ha la sua frase.** «Operazione non permessa» su
//     quella cartella vuol dire una cosa sola, e la frase deve dire la strada.
//   · **l'accesso completo al disco si legge dai fatti.** Un `readdir` che
//     risponde EPERM/EACCES è «no»; una cartella che non c'è non dice niente.
//
//   node --test server/note.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { DatabaseSync } from 'node:sqlite'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-note-'))
mkdirSync(join(CASA, '.myynd'), { recursive: true })
writeFileSync(join(CASA, '.myynd', 'config.json'), JSON.stringify({ lingua: 'it' }), { mode: 0o600 })
const CASA_VERA = process.env.HOME
process.env.HOME = CASA

const note = await import('./connettori/note.ts')
const accesso = await import('./connettori/accesso.ts')
const registro = await import('./connettori/registro.ts')
const attrezzi = await import('./attrezzi.ts')
const ospitato = await import('./ospitato.ts')

const CHIUSE: string[] = []
after(() => {
  process.env.HOME = CASA_VERA
  // le cartelle chiuse a chiave si riaprono, o `rmSync` non le butta
  for (const c of CHIUSE) { try { chmodSync(c, 0o700) } catch { /* già sparita */ } }
  rmSync(CASA, { recursive: true, force: true })
})

// — il protobuf, scritto a mano —

const varint = (n: number): number[] => {
  const fuori: number[] = []
  do { let b = n & 0x7f; n = Math.floor(n / 128); if (n) b |= 0x80; fuori.push(b) } while (n)
  return fuori
}
const lungo = (campo: number, dentro: Uint8Array | number[]): number[] => [...varint(campo * 8 + 2), ...varint(dentro.length), ...dentro]
const numero = (campo: number, v: number): number[] => [...varint(campo * 8), ...varint(v)]
const testo = (s: string) => [...Buffer.from(s, 'utf8')]

/** Il corpo di una nota come lo scrive Note: gzip di Documento(2){ versione(1), Nota(3){ testo(2), attributi(5)… } }. */
const corpoNota = (s: string): Buffer => gzipSync(Buffer.from([
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

type NotaFinta = {
  pk: number; id?: string; titolo: string | null; cartella: number | null; modificata?: number
  cancellata?: number; protetta?: number; corpo?: Buffer | null
}

/** Un `NoteStore.sqlite` in una casa finta, con le cartelle e le note date. */
function scriviDb(casa: string, cartelle: { pk: number; titolo: string; tipo?: number; cancellata?: number }[], note: NotaFinta[]): string {
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

// — il camminatore —

test('il testo esce dal protobuf: documento, nota, testo, saltando quello che c’è in mezzo', () => {
  assert.equal(note.testoDa(corpoNota('Lista per il commercialista\nF24 di giugno')), 'Lista per il commercialista\nF24 di giugno')
  // non è un gzip, o non è la forma che conosciamo: null, non un'eccezione
  assert.equal(note.testoDa(Buffer.from('ciao')), null)
  assert.equal(note.testoDa(gzipSync(Buffer.from([...lungo(7, testo('altro'))]))), null)
})

// — le note vive, e quelle no —

test('le note diventano documenti: titolo, cartella, data di Apple, e le morte restano fuori', async () => {
  const casa = join(CASA, 'una')
  mkdirSync(casa, { recursive: true })
  // 2024-03-01T10:00:00Z in secondi dal 2001
  const quando = Math.floor((Date.UTC(2024, 2, 1, 10) - Date.UTC(2001, 0, 1)) / 1000)
  const p = scriviDb(casa,
    [{ pk: 1, titolo: 'Lavoro' }, { pk: 2, titolo: 'Eliminati di recente', tipo: 1 }],
    [
      { pk: 10, id: 'A1B2', titolo: 'Preventivo Rossi', cartella: 1, modificata: quando, corpo: corpoNota('Preventivo Rossi\nRifacimento tetto: 12.400 euro, consegna aprile.') },
      { pk: 11, titolo: 'Nota cancellata', cartella: 1, cancellata: 1, corpo: corpoNota('Nota cancellata\nnon deve entrare') },
      { pk: 12, titolo: 'Nota protetta', cartella: 1, protetta: 1, corpo: corpoNota('Nota protetta\nnon deve entrare') },
      { pk: 13, titolo: 'Nel cestino', cartella: 2, corpo: corpoNota('Nel cestino\nnon deve entrare') },
      { pk: 14, titolo: 'Vuota', cartella: 1, corpo: corpoNota('   \n\n') },
      { pk: 15, titolo: 'Senza corpo', cartella: 1 },
      { pk: 16, titolo: null, cartella: null, corpo: corpoNota('Un appunto senza titolo, con dentro un segnaposto ￼ di allegato.') }
    ])
  const e = await note.leggi(p)
  assert.equal(e.troncato, false)
  assert.equal(e.illeggibili, 0)
  assert.equal(e.vuote, 1, 'quella vuota si conta, non sparisce in silenzio')
  assert.deepEqual(e.docs.map(d => d.titolo).sort(), ['Preventivo Rossi'])
  const d = e.docs[0]!
  assert.equal(d.id, 'note:A1B2')
  assert.equal(d.fonte, 'note')
  assert.equal(d.tipo, 'nota')
  assert.equal(d.gruppo, 'note')
  assert.equal(d.percorso, 'Lavoro')
  assert.equal(d.quando, '2024-03-01T10:00:00.000Z')
  assert.match(d.corpo, /12\.400 euro/)
  for (const fuori of ['cancellata', 'protetta', 'cestino']) assert.ok(!e.docs.some(x => x.corpo.includes(fuori)), `una nota ${fuori} è entrata`)
  // il database originale non si tocca: il -wal che non c'è non è un errore
})

test('una nota senza identificatore né titolo entra lo stesso, con la chiave della riga e il segnaposto tolto', async () => {
  const casa = join(CASA, 'due')
  mkdirSync(casa, { recursive: true })
  const p = scriviDb(casa, [], [
    { pk: 7, titolo: 'x', cartella: null, corpo: corpoNota('Un appunto lungo abbastanza, con dentro un segnaposto ￼ di allegato.') }
  ])
  const e = await note.leggi(p)
  assert.equal(e.docs.length, 1)
  assert.equal(e.docs[0]!.id, 'note:7')
  assert.equal(e.docs[0]!.percorso, null)
  assert.ok(!e.docs[0]!.corpo.includes('￼'), 'il segnaposto dell’allegato è rimasto')
})

test('quando nessuna nota si capisce lo si dice, invece di collegarsi a zero', async () => {
  const casa = join(CASA, 'tre')
  mkdirSync(casa, { recursive: true })
  const p = scriviDb(casa, [], [
    { pk: 1, titolo: 'a', cartella: null, corpo: gzipSync(Buffer.from([...lungo(9, testo('un altro formato'))])) },
    { pk: 2, titolo: 'b', cartella: null, corpo: Buffer.from('non è nemmeno un gzip') }
  ])
  await assert.rejects(() => note.leggi(p), /cambiato il modo in cui salva/)
})

test('senza il file la frase dice di aprire Note; senza il permesso dice la strada per darlo', async () => {
  await assert.rejects(() => note.leggi(join(CASA, 'non-c-e', 'NoteStore.sqlite')), /Apri Note una volta/)
  // una cartella chiusa a chiave: `copyFile` risponde EACCES, che è il
  // cugino di EPERM con cui macOS risponde senza l'accesso completo al disco
  const casa = join(CASA, 'chiusa')
  const p = scriviDb(casa, [], [{ pk: 1, titolo: 'a', cartella: null, corpo: corpoNota('una nota che non si può leggere') }])
  const dir = join(casa, 'Library', 'Group Containers', 'group.com.apple.notes')
  chmodSync(dir, 0o000); CHIUSE.push(dir)
  if (process.getuid?.() === 0) { chmodSync(dir, 0o700); return } // root legge tutto: la prova non dice niente
  await assert.rejects(() => note.leggi(p), /accesso completo al disco/)
  const esito = await note.prova(p)
  assert.ok(!esito.ok && /Accesso completo al disco › Myynd/.test(esito.errore))
  chmodSync(dir, 0o700)
})

// — l'accesso completo al disco —

test('l’accesso completo al disco si legge dai fatti: EPERM è «no», una cartella che manca non dice niente', () => {
  const casa = join(CASA, 'accesso')
  const notes = join(casa, 'Library', 'Group Containers', 'group.com.apple.notes')
  mkdirSync(notes, { recursive: true })
  assert.equal(accesso.accessoCompleto(casa, 'darwin'), 'si')
  assert.equal(accesso.accessoCompleto(casa, 'win32'), 'non-mac')
  assert.equal(accesso.accessoCompleto(join(CASA, 'vuota'), 'darwin'), 'si', 'senza cartelle protette niente ci ferma')
  if (process.getuid?.() === 0) return
  chmodSync(notes, 0o000); CHIUSE.push(notes)
  assert.equal(accesso.accessoCompleto(casa, 'darwin'), 'no')
  chmodSync(notes, 0o700)
  // sulla macchina vera la risposta è una delle tre, senza lanciare
  assert.ok(['si', 'no', 'non-mac'].includes(accesso.accessoCompleto()))
})

// — nel catalogo, nel recinto, in casa —

test('le Note sono una fonte del catalogo, con un attrezzo, solo in casa, e la nota dice del permesso', () => {
  const voce = registro.CATALOGO.find(c => c.id === 'note')
  assert.ok(voce && voce.pronto && voce.legge && voce.gruppo === 'Note')
  assert.match(voce.nota, /accesso completo al disco/)
  assert.ok(registro.FONTI.includes('note'))
  assert.deepEqual(attrezzi.fontiDi('note.leggi'), ['note'])
  assert.ok(ospitato.SOLO_IN_CASA.includes('note'))
  // l'indirizzo che apre la schermata del permesso è quello, alla lettera
  assert.equal(accesso.PANNELLO_ACCESSO_DISCO, 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles')
})

test('Fatture in Cloud non è più nel catalogo', () => {
  assert.ok(!registro.CATALOGO.some(c => c.id === 'fatture'))
})
