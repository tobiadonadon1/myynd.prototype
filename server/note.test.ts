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
process.env.MYYND_DATI = join(CASA, '.myynd')

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

// — il protobuf e il database finto stanno in `note-finta.ts` —

import { corpoNota, lungo, scriviDb, testo } from './note-finta.ts'

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

test('fresh Notes diagnosis opens exact files read-only, closes descriptors, and ignores only absent sidecars',()=>{
 const opened:string[]=[],closed:number[]=[]
 const current=accesso.accessoNote(CASA,'darwin',{
  apri:p=>{opened.push(p);if(p.endsWith('-shm'))throw Object.assign(new Error('missing'),{code:'ENOENT'});return opened.length},
  chiudi:fd=>{closed.push(fd)}
 })
 assert.equal(current.stato,'leggibile')
 assert.equal(opened.length,3)
 assert.match(opened[0]!,/group\.com\.apple\.notes\/NoteStore\.sqlite$/)
 assert.deepEqual(closed,[1,2])
 assert.ok(Number.isFinite(Date.parse(current.verificato)))
 const denied=accesso.accessoNote(CASA,'darwin',{
  apri:p=>{if(p.endsWith('-wal'))throw Object.assign(new Error('denied'),{code:'EPERM'});return 1},chiudi:()=>{}
 })
 assert.equal(denied.stato,'negato')
 assert.equal(denied.fase,'wal')
 assert.equal(denied.codice,'EPERM')
})

test('Notes permission diagnosis distinguishes missing archive, current denial and IO failure and never caches a denial',()=>{
 let code='EPERM'
 const probe={apri:()=>{throw Object.assign(new Error('fixture'),{code})},chiudi:()=>assert.fail('nothing was opened')}
 assert.equal(accesso.accessoNote(CASA,'darwin',probe).stato,'negato')
 code='ENOENT';assert.equal(accesso.accessoNote(CASA,'darwin',probe).stato,'assente')
 code='EIO';assert.equal(accesso.accessoNote(CASA,'darwin',probe).stato,'errore')
 assert.equal(accesso.accessoNote(CASA,'win32',probe).stato,'non-mac')
 assert.equal(accesso.accessoNote(CASA,'darwin',{apri:()=>1,chiudi:()=>{}}).stato,'leggibile')
})

test('an unreadable Notes WAL fails honestly rather than silently indexing an old base database',async()=>{
 if(process.getuid?.()===0)return
 const p=scriviDb(join(CASA,'wal-denied'),[],[{pk:1,titolo:'Fixture',cartella:null,corpo:corpoNota('fixture private text')}])
 writeFileSync(p+'-wal','fixture WAL')
 chmodSync(p+'-wal',0o000);CHIUSE.push(p+'-wal')
 await assert.rejects(note.leggi(p),/accesso completo al disco/)
 chmodSync(p+'-wal',0o600)
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

// — P8: il guaio delle Note porta il suo rimedio —

test('senza permesso è «permesso-disco», senza file «apri-app», un formato nuovo «aggiorna»', async () => {
  const guaio = async (p: string) => note.leggi(p).then(() => null, (e: { rimedio?: string }) => e.rimedio)
  assert.equal(await guaio(join(CASA, 'non-c-e-2', 'NoteStore.sqlite')), 'apri-app')
  const casa = join(CASA, 'formato')
  const p = scriviDb(casa, [], [{ pk: 1, titolo: 'a', cartella: null, corpo: Buffer.from('non è nemmeno un gzip') }])
  assert.equal(await guaio(p), 'aggiorna')
  const chiusa = join(CASA, 'chiusa-p8')
  const q = scriviDb(chiusa, [], [{ pk: 1, titolo: 'a', cartella: null, corpo: corpoNota('una nota') }])
  const dir = join(chiusa, 'Library', 'Group Containers', 'group.com.apple.notes')
  chmodSync(dir, 0o000); CHIUSE.push(dir)
  if (process.getuid?.() !== 0) assert.equal(await guaio(q), 'permesso-disco')
  chmodSync(dir, 0o700)
  // e una nota buona non ha guai (counter-case)
  assert.equal(await guaio(q), null)
})
