// Un PDF cattivo costa un documento, non un pomeriggio.
//
// Prima costava il pomeriggio. `pdf-parse` girava dentro il filo principale, e
// un file di dodici mega scritto male lo teneva occupato per minuti: per quei
// minuti Node non rispondeva a nessuno — non alla chat di chi aveva chiesto,
// non alla posta, non all'altra persona che stava lavorando. E la rete di
// sicurezza che c'era, una corsa contro un `setTimeout`, **non poteva
// scattare**: un timer per suonare ha bisogno del giro degli eventi, e il giro
// degli eventi era esattamente la cosa che quel PDF aveva bloccato.
//
// Adesso l'apertura sta in un filo a parte e il cronometro sta qui, dove niente
// lo blocca. Queste prove non aprono nessun PDF vero: aprono un lavoratore che
// non risponde mai — che è il caso cattivo, senza dodici mega di zavorra nel
// repository — e uno che risponde, per vedere che i byte fanno il giro.
//
//   node --test server/estraiFuori.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-estrai-'))
const estrai = await import('./connettori/estrai.ts')

/** Un lavoratore che riceve e non risponde: il PDF che manda in bambola pdfjs. */
const MUTO = join(CASA, 'muto.mjs')
writeFileSync(MUTO, "import { parentPort } from 'node:worker_threads'\nparentPort.on('message', () => {})\n")

/** Uno che risponde, per vedere che i byte arrivano di là e il testo torna di qua. */
const PARLANTE = join(CASA, 'parlante.mjs')
writeFileSync(PARLANTE,
  "import { parentPort } from 'node:worker_threads'\n" +
  "parentPort.on('message', m => parentPort.postMessage({\n" +
  "  id: m.id, ok: true, testo: `${m.nome}: ${Buffer.from(m.byte).toString('utf8')}`\n" +
  '}))\n')

/** E uno che non c'è: la macchina dove i fili non si accendono. */
const FANTASMA = join(CASA, 'non-esiste.mjs')

after(() => {
  estrai.perLeProve({ tempo: null, lavoratore: null })
  estrai.chiudiIlFilo()
  rmSync(CASA, { recursive: true, force: true })
})

test('un lavoratore che non risponde viene chiuso, e il guaio arriva in tempo', async () => {
  estrai.perLeProve({ lavoratore: pathToFileURL(MUTO), tempo: 400 })
  const partito = Date.now()
  await assert.rejects(
    estrai.daBuffer(Buffer.from('%PDF-1.4 finto'), 'cattivo.pdf'),
    /troppo lento/
  )
  // il punto di tutto il lavoro: il cronometro suona, perché il filo che lo
  // tiene non è quello bloccato
  assert.ok(Date.now() - partito < 4000, 'la scadenza non è scattata')
})

test('e il file dopo passa lo stesso: si accende un filo nuovo', async () => {
  estrai.perLeProve({ lavoratore: pathToFileURL(PARLANTE), tempo: 4000 })
  const t = await estrai.daBuffer(Buffer.from('ciao'), 'uno.pdf')
  assert.equal(t, 'uno.pdf: ciao')
})

test('i byte che arrivano di là sono una copia: quelli di qua restano interi', async () => {
  /*
   * Il buffer si trasferisce, e trasferire stacca la memoria da sotto i piedi a
   * chi la stava usando — i Buffer piccoli di Node stanno tutti nella stessa
   * fetta. Se si mandasse quella invece di una copia, il guaio non sarebbe qui:
   * sarebbe in un'altra parte del programma, mezz'ora dopo.
   */
  estrai.perLeProve({ lavoratore: pathToFileURL(PARLANTE), tempo: 4000 })
  const buf = Buffer.from('il preventivo di settembre')
  await estrai.daBuffer(buf, 'due.pdf')
  assert.equal(buf.toString('utf8'), 'il preventivo di settembre')
})

test('due file di fila non si mescolano', async () => {
  estrai.perLeProve({ lavoratore: pathToFileURL(PARLANTE), tempo: 4000 })
  const [a, b] = await Promise.all([
    estrai.daBuffer(Buffer.from('primo'), 'a.pdf'),
    estrai.daBuffer(Buffer.from('secondo'), 'b.pdf')
  ])
  assert.equal(a, 'a.pdf: primo')
  assert.equal(b, 'b.pdf: secondo')
})

test('se il filo non si accende proprio, il file si apre qui — e si dice', async () => {
  const dette: unknown[][] = []
  const vero = console.warn
  console.warn = (...a: unknown[]) => { dette.push(a) }
  try {
    estrai.perLeProve({ lavoratore: pathToFileURL(FANTASMA), tempo: 4000 })
    // un .docx finto non è un .docx: quello che conta è che il lavoro sia
    // tornato **qui dentro** invece di fallire per sempre
    await assert.rejects(estrai.daBuffer(Buffer.from('non è un docx'), 'x.docx'))
  } finally {
    console.warn = vero
  }
  assert.ok(dette.some(a => String(a[0]).includes('il lavoratore non parte')),
    'un ripiego silenzioso è un ripiego che nessuno saprà mai di avere')
})

test('la coda ha un fondo: oltre, si dice di no invece di riempire la memoria', async () => {
  estrai.perLeProve({ lavoratore: pathToFileURL(MUTO), tempo: 30_000 })
  const appesi: Promise<string>[] = []
  for (let i = 0; i <= estrai.CODA_MAX; i++) {
    appesi.push(estrai.daBuffer(Buffer.from('x'), `f${i}.pdf`).catch(() => ''))
  }
  await assert.rejects(estrai.daBuffer(Buffer.from('x'), 'uno di troppo.pdf'), /coda piena/)
  // si chiude tutto: le promesse appese cadono da sole con il filo
  estrai.perLeProve({ tempo: 5, lavoratore: pathToFileURL(MUTO) })
  await Promise.all(appesi)
})

test('un file di testo non passa da nessun filo: aprirlo non blocca niente', async () => {
  estrai.perLeProve({ lavoratore: pathToFileURL(MUTO), tempo: 30_000 })
  assert.equal(await estrai.daBuffer(Buffer.from('due righe\ndi appunti'), 'note.txt'), 'due righe\ndi appunti')
})
