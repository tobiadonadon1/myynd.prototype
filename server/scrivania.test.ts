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
process.env.MYYND_DATI = join(CASA, '.myynd')

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

// — portami lì —
//
// La domanda del tredici settembre: «perché non c'è un bottone che dice
// portami lì così la vedo adesso?». La risposta è qui sotto, ed è in due pezzi:
// uno che decide dove si va — puro, provabile, sei strade — e uno che lo fa
// partire. Le prove del secondo non devono aprire niente sul computer di
// nessuno: `perProva.apri` prende il posto di `open` e si guarda cosa *avrebbe*
// aperto.

const RIGA = { doc: null as string | null, madre: null as string | null, progetto: null as string | null }

test('il link di una mail: il Message-ID con le parentesi angolari diventa un message://', () => {
  // com'è scritto nell'intestazione, angolari comprese
  assert.equal(
    s.linkMail('posta', '<CAF=abc.123@mail.esempio.it>'),
    'message://%3CCAF=abc.123@mail.esempio.it%3E'
  )
  // già pulito: stesso risultato, perché è quello che l'indice tiene
  assert.equal(
    s.linkMail('posta', 'CAF=abc.123@mail.esempio.it'),
    'message://%3CCAF=abc.123@mail.esempio.it%3E'
  )
  // Gmail si legge nel browser: lì «apri la mail» è la ricerca sul messaggio
  assert.equal(
    s.linkMail('google', '<abc@mail.gmail.com>'),
    'https://mail.google.com/mail/u/0/#search/rfc822msgid:abc%40mail.gmail.com'
  )
  // niente id, niente promessa: chi riceve la stringa vuota apre il programma
  assert.equal(s.linkMail('posta', null), '')
  assert.equal(s.linkMail('posta', '<>'), '')
  /*
   * Un id che non è un id non diventa mezzo URL.
   *
   * Questo pezzo finisce dentro un indirizzo che il sistema consegna a
   * un'applicazione: uno spazio, un apice o una barra lì dentro non sono un
   * dettaglio, sono la coda di un altro URL. Quando non passa si torna alla
   * strada onesta — aprire Mail e basta.
   */
  assert.equal(s.linkMail('posta', 'uno due@esempio.it'), '')
  assert.equal(s.linkMail('posta', 'x@y.it" ; open -a Calculator'), '')
  assert.equal(s.linkMail('posta', 'x/../../altro@y.it'), '')
})

test('dovePortare: le sei strade, decise senza toccare niente', () => {
  // (a) una mail: si apre nel programma di posta, sul messaggio preciso
  assert.deepEqual(
    s.dovePortare({ ...RIGA, doc: 'posta:INBOX:123' }, { fonte: 'posta', percorso: 'INBOX', messageId: 'abc@esempio.it' }),
    { dove: 'posta', url: 'message://%3Cabc@esempio.it%3E' }
  )
  // la stessa mail senza Message-ID: si apre il programma, e si smette di promettere
  assert.deepEqual(
    s.dovePortare({ ...RIGA, doc: 'posta:INBOX:123' }, { fonte: 'posta', percorso: 'INBOX', messageId: null }),
    { dove: 'niente', errore: 'Questa riga non viene da nessun posto che possa aprire.' }
  )

  // (b) un file sul disco
  assert.deepEqual(
    s.dovePortare({ ...RIGA, doc: 'desktop:/Users/x/Documenti/contratto.pdf' },
      { fonte: 'desktop', percorso: '/Users/x/Documenti/contratto.pdf' }),
    { dove: 'file', percorso: '/Users/x/Documenti/contratto.pdf' }
  )

  // (c) una pagina: Notion, GitHub, qualunque cosa tenga un http
  assert.deepEqual(
    s.dovePortare({ ...RIGA, doc: 'notion:abc' }, { fonte: 'notion', percorso: 'https://www.notion.so/abc' }),
    { dove: 'pagina', url: 'https://www.notion.so/abc' }
  )

  // (d) niente documento, ma si sa da quale riga è nata: le due righe su H-Farm
  assert.deepEqual(
    s.dovePortare({ ...RIGA, madre: 'avvio-h' }, null),
    { dove: 'compito', id: 'avvio-h' }
  )

  // (e) niente documento e niente madre, ma un progetto
  assert.deepEqual(
    s.dovePortare({ ...RIGA, progetto: 'p93ddacbed1bd' }, null),
    { dove: 'progetto', id: 'p93ddacbed1bd' }
  )

  // (f) e quando non c'è niente lo si dice, invece di aprire il vuoto
  assert.deepEqual(
    s.dovePortare({ ...RIGA }, null),
    { dove: 'niente', errore: 'Questa riga non viene da nessun posto che possa aprire.' }
  )
})

test('dovePortare: il documento viene prima, e un documento sparito non è un vicolo cieco', () => {
  const riga = { doc: 'posta:INBOX:3', madre: 'avvio-h', progetto: 'pX' }
  assert.equal(s.dovePortare(riga, { fonte: 'posta', messageId: 'q@w.it' }).dove, 'posta',
    'il posto dove la cosa è scritta non ha avuto la precedenza')
  // la mail non c'è più nell'indice: si scende alla riga madre, non si dice di no
  assert.deepEqual(s.dovePortare(riga, null), { dove: 'compito', id: 'avvio-h' })
  // e una riga che dice di venire da un documento senza percorso né id fa lo stesso
  assert.deepEqual(
    s.dovePortare({ ...riga, doc: 'granola:9' }, { fonte: 'granola', percorso: null }),
    { dove: 'compito', id: 'avvio-h' }
  )
})

test('uno schema che non è http non diventa una pagina da aprire', () => {
  for (const cattivo of ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,x', 'ftp://x.it/y']) {
    assert.equal(s.paginaBuona(cattivo), '', `${cattivo} è passato`)
    assert.deepEqual(
      s.dovePortare({ ...RIGA, doc: 'notion:abc' }, { fonte: 'notion', percorso: cattivo }),
      { dove: 'niente', errore: 'Questa riga non viene da nessun posto che possa aprire.' }
    )
  }
})

test('porta: quello che fa partire davvero, e non fa partire altro', { skip: process.platform !== 'darwin' }, async () => {
  const lanciati: string[][] = []
  s.perProva.apri = a => { lanciati.push(a) }
  try {
    await s.porta(DESKTOP, { dove: 'posta', url: 'message://%3Cabc@esempio.it%3E' })
    // senza Message-ID resta solo il programma: due argomenti fissi, nessun nome da fuori
    await s.porta(DESKTOP, { dove: 'posta', url: '' })
    await s.porta(DESKTOP, { dove: 'pagina', url: 'https://www.notion.so/abc' })
    writeFileSync(join(COLLEGATA, 'contratto.md'), 'x')
    await s.porta(DESKTOP, { dove: 'file', percorso: join(COLLEGATA, 'contratto.md') })

    assert.deepEqual(lanciati.slice(0, 3), [
      ['message://%3Cabc@esempio.it%3E'],
      ['-a', 'Mail'],
      ['https://www.notion.so/abc']
    ])
    assert.equal(lanciati[3]?.length, 1)
    assert.ok(lanciati[3]![0].endsWith('/contratto.md'), `ha aperto ${lanciati[3]![0]}`)

    // un file fuori dalle cartelle collegate non si apre nemmeno da qui: è la
    // stessa regola della scrittura, e «portami lì» non è una porta di servizio
    writeFileSync(join(FUORI, 'segreto.md'), 'x')
    await assert.rejects(
      () => s.porta(DESKTOP, { dove: 'file', percorso: join(FUORI, 'segreto.md') }),
      /solo nelle cartelle/
    )
    assert.equal(lanciati.length, 4, 'ha fatto partire qualcosa che non doveva')
  } finally { s.perProva.apri = null }
})
