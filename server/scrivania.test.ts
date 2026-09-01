// Le mani.
//
// È il primo pezzo di questa applicazione che tocca il disco di qualcuno, e i
// modi in cui una cosa così fa danno sono tre: scrive dove non deve, scrive
// sopra a qualcosa che c'era, o esegue quello che era solo un nome di file.
// Sono tutti e tre qui sotto, e nessuno dei tre darebbe un errore da solo.
//
//   node --test server/scrivania.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-scrivania-'))
const COLLEGATA = join(CASA, 'Documenti')
const FUORI = join(CASA, 'Segreti')
mkdirSync(COLLEGATA, { recursive: true })
mkdirSync(FUORI, { recursive: true })
process.env.HOME = CASA

const s = await import('./scrivania.ts')
after(() => rmSync(CASA, { recursive: true, force: true }))

const DESKTOP = { cartelle: [COLLEGATA] }

test('scrive il documento dove gliel’hai detto', async () => {
  const f = await s.scrivi(DESKTOP, {
    cartella: COLLEGATA, nome: 'Relazione settembre', testo: '# Titolo\n\nUna riga.', formato: '.md'
  })
  assert.equal(f.nome, 'Relazione settembre.md')
  assert.equal(readFileSync(f.percorso, 'utf8'), '# Titolo\n\nUna riga.')
})

test('non sovrascrive mai: il secondo prende il numero', async () => {
  const uno = await s.scrivi(DESKTOP, { cartella: COLLEGATA, nome: 'Nota', testo: 'primo', formato: '.md' })
  const due = await s.scrivi(DESKTOP, { cartella: COLLEGATA, nome: 'Nota', testo: 'secondo', formato: '.md' })
  assert.notEqual(uno.percorso, due.percorso)
  assert.equal(due.nome, 'Nota 2.md')
  assert.equal(readFileSync(uno.percorso, 'utf8'), 'primo', 'ha riscritto sopra il primo')
})

test('fuori dalle cartelle collegate non scrive', async () => {
  await assert.rejects(
    () => s.scrivi(DESKTOP, { cartella: FUORI, nome: 'x', testo: 'y', formato: '.md' }),
    /solo nelle cartelle/
  )
  assert.ok(!existsSync(join(FUORI, 'x.md')))
})

test('un «..» nel nome non porta da nessuna parte', async () => {
  const f = await s.scrivi(DESKTOP, {
    cartella: COLLEGATA, nome: '../../../fuori', testo: 'ciao', formato: '.md'
  })
  // su macOS /var è un link a /private/var: si confronta il percorso vero
  const radice = realpathSync(COLLEGATA)
  assert.ok(f.percorso.startsWith(radice + '/'), `è finito in ${f.percorso}`)
  assert.equal(f.nome, 'fuori.md', 'i «..» sono sopravvissuti nel nome')
  assert.ok(!existsSync(join(CASA, 'fuori.md')))
  assert.ok(!existsSync(join(CASA, '..', 'fuori.md')))
})

test('una cartella che comincia uguale non è la stessa cartella', async () => {
  // /Users/x/Doc non deve passare per /Users/x/Documenti
  const quasi = join(CASA, 'Documenti altrui')
  mkdirSync(quasi, { recursive: true })
  await assert.rejects(
    () => s.scrivi(DESKTOP, { cartella: quasi, nome: 'x', testo: 'y', formato: '.md' }),
    /solo nelle cartelle/
  )
})

test('un link simbolico non è una porta verso il resto del disco', async () => {
  // senza realpath, questa è la strada più corta per uscire da una cartella
  const ponte = join(COLLEGATA, 'ponte')
  symlinkSync(FUORI, ponte)
  await assert.rejects(
    () => s.scrivi(DESKTOP, { cartella: ponte, nome: 'x', testo: 'y', formato: '.md' }),
    /solo nelle cartelle/
  )
  assert.ok(!existsSync(join(FUORI, 'x.md')))
})

test('senza cartelle collegate non scrive niente', async () => {
  await assert.rejects(
    () => s.scrivi({ cartelle: [] }, { cartella: COLLEGATA, nome: 'x', testo: 'y', formato: '.md' }),
    /Collega una cartella/
  )
})

test('un formato che non conosce lo rifiuta', async () => {
  await assert.rejects(
    () => s.scrivi(DESKTOP, { cartella: COLLEGATA, nome: 'x', testo: 'y', formato: '.exe' as never }),
    /quel tipo di file/
  )
})

test('una bozza vuota non diventa un file vuoto', async () => {
  await assert.rejects(
    () => s.scrivi(DESKTOP, { cartella: COLLEGATA, nome: 'x', testo: '   ', formato: '.md' }),
    /niente da salvare/
  )
})

test('l’RTF esce con i titoli in grassetto e gli accenti interi', () => {
  const r = s.inRtf('# Perché sì\n\nUna riga **grassa**.')
  assert.ok(r.startsWith('{\\rtf1'), 'non è un RTF')
  assert.ok(r.includes('\\b\\fs32'), 'il titolo non è un titolo')
  assert.ok(r.includes('{\\b grassa}'), 'il grassetto non c’è')
  // «é» fuori dall'ASCII: in RTF va come \u233 — altrimenti Word mostra «PerchÃ©»
  assert.ok(/\\u233\?/.test(r), 'gli accenti escono rotti')
  assert.ok(!/é/.test(r), 'ha lasciato un carattere non ASCII dentro l’RTF')
})

test('le graffe del testo non diventano codice RTF', () => {
  const r = s.inRtf('Il campo {nome} vale \\ sempre')
  assert.ok(r.includes('\\{nome\\}'), 'una graffa del testo è diventata sintassi')
})

test('aprire qualcosa fuori dalle cartelle collegate non si può', async () => {
  writeFileSync(join(FUORI, 'niente.md'), 'x')
  await assert.rejects(() => s.apri(DESKTOP, join(FUORI, 'niente.md')), /solo nelle cartelle/)
})
