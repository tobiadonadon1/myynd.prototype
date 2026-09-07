// La vedetta: le cartelle guardate dal vivo, e quello che viene dopo.
//
// Una cartella vera, temporanea, come fonte del desktop. Ci si scrive, ci si
// riscrive, si cancella — e si guarda l'indice, non i timer. Le quattro cose
// che devono valere, e perché:
//
//   · **entra, cambia, esce.** Se un file nuovo non compare, la vedetta è un
//     processo che non fa niente; se uno cancellato resta, Myynd cita una cosa
//     che non esiste.
//   · **le stesse regole della lettura intera.** Un `README.md` dentro un
//     progetto di codice, un file nascosto: se entrano dal vivo ma non dal
//     giro delle sei ore, l'indice dipende da *come* è arrivato un file.
//   · **una chiamata per lotto.** Tre file in fila devono valere un
//     ragionamento solo: ogni file in più sarebbe una chiamata al modello.
//   · **il giro delle sei ore non rilegge l'uguale.** La data di modifica già
//     in indice basta; il file resta fra i visti e non si cancella.
//
//   node --test server/vedetta.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, utimesSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-vedetta-'))
process.env.MYYND_DATI = join(CASA, 'dati')
mkdirSync(process.env.MYYND_DATI, { recursive: true })

const store = await import('./store.ts')
const desktop = await import('./connettori/desktop.ts')
const vedetta = await import('./connettori/vedetta.ts')
const sveglia = await import('./sveglia.ts')

// la cartella guardata: non è la `realpath` di proposito — su macOS la
// temporanea sta sotto un link (/var → /private/var), ed è il caso normale
// di una cartella scelta a mano
const CARTELLA = join(CASA, 'scrivania')
mkdirSync(CARTELLA, { recursive: true })

after(() => {
  vedetta.fermaTutti()
  vedetta.perProva(null)
  rmSync(CASA, { recursive: true, force: true })
})

const dormi = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Aspetta che una cosa sia vera, fino a un tetto: gli eventi del disco non hanno un orario. */
async function finche(cond: () => boolean, cosa: string, ms = 8_000) {
  const fine = Date.now() + ms
  while (Date.now() < fine) {
    if (cond()) return
    await dormi(50)
  }
  assert.fail(`aspettavo che ${cosa}`)
}

const id = (nome: string) => `desktop:${join(CARTELLA, nome)}`

// — le regole condivise, da sole —

test('daSaltare dice le stesse cose di cammina, per un percorso alla volta', async () => {
  const progetto = join(CARTELLA, 'progetto')
  mkdirSync(progetto, { recursive: true })
  writeFileSync(join(progetto, 'package.json'), '{}')
  writeFileSync(join(progetto, 'README.md'), 'un progetto di codice, non roba tua')

  assert.equal(await desktop.daSaltare(join(CARTELLA, 'nota.md'), CARTELLA), false)
  assert.equal(await desktop.daSaltare(join(CARTELLA, '.nascosto.md'), CARTELLA), true, 'un file nascosto')
  assert.equal(await desktop.daSaltare(join(CARTELLA, 'foto.jpg'), CARTELLA), true, 'un’estensione che non si legge')
  assert.equal(await desktop.daSaltare(join(CARTELLA, 'node_modules', 'x.md'), CARTELLA), true, 'una cartella da saltare')
  assert.equal(await desktop.daSaltare(join(progetto, 'README.md'), CARTELLA), true, 'dentro un progetto di codice')
  assert.equal(await desktop.daSaltare(progetto, CARTELLA, true), true, 'il progetto stesso')
  assert.equal(await desktop.daSaltare(join(CARTELLA, 'sotto'), CARTELLA, true), false, 'una cartella normale')
  assert.equal(await desktop.daSaltare('/altrove/nota.md', CARTELLA), true, 'fuori dalla radice')
  // un file già cancellato si giudica dal nome: la sua cartella madre sparita non è un progetto
  assert.equal(await desktop.daSaltare(join(CARTELLA, 'sparita', 'nota.md'), CARTELLA), false)
})

test('leggiUno legge un file con le regole di sempre, e dice null a quello che non è un documento', async () => {
  const f = join(CARTELLA, 'uno.md')
  writeFileSync(f, 'Una nota abbastanza lunga da essere un documento vero.')
  const d = await desktop.leggiUno(f)
  assert.ok(d)
  assert.equal(d.id, `desktop:${f}`)
  assert.equal(d.fonte, 'desktop')
  assert.equal(d.titolo, 'uno.md')
  assert.match(d.corpo, /abbastanza lunga/)
  const vuoto = join(CARTELLA, 'vuoto.txt')
  writeFileSync(vuoto, '')
  assert.equal(await desktop.leggiUno(vuoto), null)
  await assert.rejects(desktop.leggiUno(join(CARTELLA, 'non-esiste.md')))
  rmSync(f); rmSync(vuoto)
})

// — la vedetta, su una cartella vera —

test('un file che compare, cambia e sparisce entra, cambia ed esce dall’indice; i lotti valgono un ragionamento solo', async () => {
  vedetta.perProva({ attesa: 100, quiete: 700, minimo: 0, riprova: 60_000 })
  const arrivi: string[] = []
  vedetta.quandoSiCalma(async daQuando => { arrivi.push(daQuando) })

  vedetta.avvia({ cartelle: [CARTELLA] })
  assert.deepEqual(vedetta.stato(), { attiva: true, cartelle: 1 })
  // gli occhi si aprono un attimo dopo: quello che si scrive prima non si vede
  await dormi(500)

  // entra — tre file in fila, e insieme il progetto e il nascosto che non devono entrare
  writeFileSync(join(CARTELLA, 'contratto.md'), 'Contratto con Rossi Impianti, prezzo 890 euro, consegna in quattro settimane.')
  writeFileSync(join(CARTELLA, 'appunti.txt'), 'Appunti della riunione di lunedì: rivedere il listino e richiamare Bianchi.')
  writeFileSync(join(CARTELLA, 'progetto', 'NOTE.md'), 'Note dentro un progetto di codice: non sono un documento tuo.')
  writeFileSync(join(CARTELLA, '.segreto.md'), 'Un file nascosto che non deve entrare nell’indice della mente.')
  await finche(() => !!store.documento(id('contratto.md')), 'il contratto entrasse')
  await finche(() => !!store.documento(id('appunti.txt')), 'gli appunti entrassero')
  assert.match(store.documento(id('contratto.md'))!.corpo, /890 euro/)
  assert.equal(store.cerca('Rossi', 5).some(d => d.id === id('contratto.md')), true, 'si trova cercando')

  // cambia
  writeFileSync(join(CARTELLA, 'contratto.md'), 'Contratto con Rossi Impianti, prezzo 950 euro dopo la revisione di settembre.')
  await finche(() => /950 euro/.test(store.documento(id('contratto.md'))?.corpo ?? ''), 'il contratto cambiasse')

  // un ragionamento solo per tutto il lotto, dopo il silenzio
  await finche(() => arrivi.length === 1, 'si ragionasse una volta sul lotto', 4_000)
  await dormi(1_000)
  assert.equal(arrivi.length, 1, 'più file non sono più ragionamenti')

  // quello che non doveva entrare non è entrato
  assert.equal(store.documento(id(join('progetto', 'NOTE.md'))), null, 'dentro un progetto')
  assert.equal(store.documento(id('.segreto.md')), null, 'nascosto')

  // esce
  rmSync(join(CARTELLA, 'appunti.txt'))
  await finche(() => !store.documento(id('appunti.txt')), 'gli appunti uscissero')
  assert.equal(store.cerca('Bianchi', 5).some(d => d.id === id('appunti.txt')), false, 'e non si trova più')
  // solo cancellazioni: non è un arrivo, non si ragiona
  await dormi(1_200)
  assert.equal(arrivi.length, 1)

  // una cartella spostata dentro tutta insieme: si legge intera
  const fuori = join(CASA, 'in-arrivo')
  mkdirSync(fuori)
  writeFileSync(join(fuori, 'verbale.md'), 'Verbale dell’assemblea di giugno, approvato il bilancio all’unanimità.')
  const { renameSync } = await import('node:fs')
  renameSync(fuori, join(CARTELLA, 'in-arrivo'))
  await finche(() => !!store.documento(id(join('in-arrivo', 'verbale.md'))), 'la cartella spostata dentro si leggesse')
  // e spostata via: esce tutto quello che c'era sotto
  renameSync(join(CARTELLA, 'in-arrivo'), fuori)
  await finche(() => !store.documento(id(join('in-arrivo', 'verbale.md'))), 'la cartella spostata via uscisse')

  vedetta.ferma()
  assert.deepEqual(vedetta.stato(), { attiva: false, cartelle: 0 })
})

test('una cartella che non c’è non fa cadere niente: si segna, e si sta in ascolto sulle altre', () => {
  vedetta.perProva({ attesa: 100, quiete: 700, minimo: 0, riprova: 60_000 })
  vedetta.avvia({ cartelle: [CARTELLA, join(CASA, 'non-esiste')] })
  assert.deepEqual(vedetta.stato(), { attiva: true, cartelle: 1 })
  vedetta.ferma()
})

// — il giro delle sei ore non rilegge l'uguale —

test('sincronizza salta i file con la stessa data di modifica, e li tiene fra i visti', async () => {
  const cartella = join(CASA, 'archivio')
  mkdirSync(cartella, { recursive: true })
  const a = join(cartella, 'a.md'), b = join(cartella, 'b.md')
  writeFileSync(a, 'Il primo documento dell’archivio, abbastanza lungo.')
  writeFileSync(b, 'Il secondo documento dell’archivio, abbastanza lungo.')

  const prima = await desktop.sincronizza({ cartelle: [cartella] })
  assert.equal(prima.docs.length, 2)
  assert.equal(prima.invariati, 0)
  store.salvaDocumenti(prima.docs)

  const gia = store.quandoPerPrefisso(`desktop:${cartella}/`)
  assert.equal(gia.size, 2)
  assert.equal(gia.get(`desktop:${a}`), prima.docs.find(d => d.id === `desktop:${a}`)!.quando)

  // b cambia data, a no
  utimesSync(b, new Date(), new Date(Date.now() + 5_000))
  const dopo = await desktop.sincronizza({ cartelle: [cartella] }, undefined, gia)
  assert.deepEqual(dopo.docs.map(d => d.id), [`desktop:${b}`], 'si rilegge solo quello cambiato')
  assert.equal(dopo.invariati, 1)
  assert.ok(dopo.visti.includes(`desktop:${a}`), 'quello uguale resta fra i visti')
  assert.deepEqual(dopo.complete, [cartella])
  // e riconciliando con visti + letti non si cancella niente
  const tolti = store.riconcilia('desktop', { completo: true, radiciViste: dopo.complete }, [...dopo.docs.map(d => d.id), ...dopo.visti])
  assert.equal(tolti, 0)
  assert.ok(store.documento(`desktop:${a}`))
})

// — il risveglio —

test('due risvegli vicini sono un recupero solo, e il messaggio giusto sul filo lo fa partire', () => {
  sveglia.perProva()
  let giri = 0
  const t0 = 1_000_000_000
  assert.equal(sveglia.sveglia(() => giri++, t0), true)
  assert.equal(sveglia.sveglia(() => giri++, t0 + 60_000), false, 'un minuto dopo: no')
  assert.equal(sveglia.sveglia(() => giri++, t0 + 6 * 60_000), true, 'sei minuti dopo: sì')
  assert.equal(giri, 2)

  sveglia.perProva()
  const filo = new EventEmitter()
  let recuperi = 0
  assert.equal(sveglia.ascolta(() => recuperi++, filo), true)
  filo.emit('message', { data: { porta: 1234 } })
  assert.equal(recuperi, 0, 'un altro messaggio non è un risveglio')
  filo.emit('message', { data: { tipo: 'sveglia' } })
  assert.equal(recuperi, 1)
  filo.emit('message', { data: { tipo: 'sveglia' } })
  assert.equal(recuperi, 1, 'il secondo, subito dopo, non raddoppia')
  // fuori da Electron non c'è nessun filo, e non è un errore
  assert.equal(sveglia.ascolta(() => recuperi++, null), !!(process as unknown as { parentPort?: unknown }).parentPort)
})

// — il lotto comincia da prima del primo file, non da dopo —

test('il primo file del lotto sta fra quelli «appena arrivati» da quando dice la vedetta', async () => {
  vedetta.perProva({ attesa: 100, quiete: 500, minimo: 0, riprova: 60_000 })
  const cartella = join(CASA, 'uno-solo')
  mkdirSync(cartella, { recursive: true })
  let arrivati: string[] | null = null
  // quello che fa `index.ts`: i documenti indicizzati da `daQuando` in poi
  vedetta.quandoSiCalma(async daQuando => { arrivati = store.appenaArrivati(daQuando, 20).map(d => d.id) })
  vedetta.avvia({ cartelle: [cartella] })
  await dormi(500)

  const f = join(cartella, 'contratto.md')
  writeFileSync(f, 'Un contratto messo sulla scrivania adesso: deve arrivare alla prima pagina.')
  await finche(() => arrivati !== null, 'si ragionasse sul lotto', 6_000)
  assert.deepEqual(arrivati, [`desktop:${f}`], 'il file che ha svegliato la vedetta non è fra gli arrivati')
  vedetta.ferma()
})
