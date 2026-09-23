// La priorità di un progetto: «alta», o normale.
//
// La prima persona da fuori che ha provato Myynd ha chiesto un modo per dire
// quale progetto conta di più. Il gesto sta sulla scheda e sulla pagina del
// progetto; qui si prova quello che il gesto deve lasciare dietro di sé:
//
//   · un indice di prima si apre, e i progetti che c'erano restano com'erano,
//     normali (la migrazione 46 → 47, in fondo alla lista);
//   · «alta» o niente: un valore che non si conosce si rifiuta, dalla
//     funzione e dalla rotta, e non diventa normale in silenzio;
//   · l'ordine: dentro ogni stato quelli alti davanti, per la Memoria e per il
//     modello, che ne legge otto e non deve lasciare fuori quello alto;
//   · la prima pagina: segnato alto, il blocco sale in cima anche all'ordine
//     che lui aveva trascinato;
//   · detto in chat, finisce nella stessa colonna.
//
//   node --test server/priorita-progetto.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-priorita-progetto-'))
const VECCHIA = mkdtempSync(join(tmpdir(), 'myynd-priorita-migrazione-'))
const ROTTA = mkdtempSync(join(tmpdir(), 'myynd-priorita-rotta-'))
process.env.MYYND_DATI = CASA
delete process.env.ANTHROPIC_API_KEY

const store = await import('./store.ts')
const progetti = await import('./progetti.ts')
const cfg = await import('./config.ts')
const claude = await import('./claude.ts')
const punto = await import('./punto.ts')

const TOKEN = 'sviluppo-non-in-produzione'
let server: ChildProcess | undefined
let base = ''

before(() => store.azzeraTutto())
after(() => {
  server?.kill()
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  for (const d of [CASA, VECCHIA, ROTTA]) rmSync(d, { recursive: true, force: true })
})

/** Quando è stato toccato l'ultima volta, scritto a mano: nello stesso millesimo l'ordine sarebbe un caso. */
const toccato = (id: string, quando: string) =>
  store.default.prepare('UPDATE progetti SET aggiornato = ? WHERE id = ?').run(quando, id)

// — la migrazione —

/** Un processo a parte con la sua casa: il percorso dei dati si legge quando il modulo si carica. */
function apriLaVecchia(): { versione: number; progetti: { id: string; nome: string; obiettivo: string; stato: string; priorita: string | null }[] } {
  const codice = `
    const store = await import(${JSON.stringify(new URL('./store.ts', import.meta.url).href)})
    const progetti = await import(${JSON.stringify(new URL('./progetti.ts', import.meta.url).href)})
    const v = store.default.prepare('PRAGMA user_version').get().user_version
    console.log('ESITO' + JSON.stringify({ versione: v, progetti: progetti.elenco() }))
    store.chiudiIndici()
  `
  const fuori = execFileSync(process.execPath, ['--input-type=module', '--disable-warning=ExperimentalWarning', '-e', codice], {
    env: { ...process.env, MYYND_DATI: VECCHIA }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
  })
  const riga = fuori.split('\n').find(r => r.startsWith('ESITO'))
  assert.ok(riga, `il processo non ha detto niente:\n${fuori}`)
  return JSON.parse(riga.slice(5))
}

test('la migrazione 46 → 47: un indice di prima si apre, e i progetti che c’erano restano com’erano, normali', () => {
  // un indice nuovo, in fondo alle migrazioni, poi riportato a com'era prima
  // della colonna: la versione 46, senza `priorita`, con due progetti dentro
  const testa = apriLaVecchia().versione
  const db = new DatabaseSync(join(VECCHIA, 'mente.db'))
  const ora = '2026-09-01T09:00:00.000Z'
  db.prepare(`INSERT INTO progetti (id, nome, obiettivo, stato, dal, aggiornato, note, origine) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('pvecchio1', 'Evermute', 'Beta a cinquanta studi', 'attivo', ora, ora, 'una nota', 'mano')
  db.prepare(`INSERT INTO progetti (id, nome, obiettivo, stato, dal, aggiornato, note, origine) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('pvecchio2', 'Nextas', null, 'fermo', ora, ora, null, 'punto')
  db.exec('ALTER TABLE progetti DROP COLUMN priorita')
  db.exec('PRAGMA user_version = 46')
  db.close()

  const dopo = apriLaVecchia()
  assert.equal(dopo.versione, testa, 'l’indice non è arrivato in fondo alle migrazioni')
  assert.deepEqual(dopo.progetti.map(p => [p.id, p.nome, p.obiettivo, p.stato, p.priorita]), [
    ['pvecchio1', 'Evermute', 'Beta a cinquanta studi', 'attivo', null],
    ['pvecchio2', 'Nextas', '', 'fermo', null]
  ])
  const colonne = (new DatabaseSync(join(VECCHIA, 'mente.db')).prepare('PRAGMA table_info(progetti)').all() as { name: string }[]).map(c => c.name)
  assert.ok(colonne.includes('priorita'), 'la colonna non c’è')
})

// — «alta», o niente —

test('«alta» si scrive e si toglie; vuoto e null sono normale; un altro valore si rifiuta senza cambiare niente', () => {
  store.azzeraTutto()
  const p = progetti.scrivi({ nome: 'Evermute', obiettivo: 'Beta a cinquanta studi' })
  assert.equal(p.priorita, null, 'un progetto nuovo nasce normale')
  assert.equal(progetti.cambia(p.id, { priorita: 'alta' })?.priorita, 'alta')
  assert.equal(progetti.trova(p.id)?.priorita, 'alta', 'non è rimasta scritta')
  // un cambio d'altro non la tocca
  assert.equal(progetti.cambia(p.id, { obiettivo: 'Beta a sessanta studi' })?.priorita, 'alta')
  assert.equal(progetti.cambia(p.id, { priorita: '' })?.priorita, null)
  assert.equal(progetti.cambia(p.id, { priorita: 'alta' })?.priorita, 'alta')
  assert.equal(progetti.cambia(p.id, { priorita: null })?.priorita, null)
  for (const storto of ['bassa', 'urgente', 'ALTA', 'high']) {
    progetti.cambia(p.id, { priorita: 'alta' })
    assert.throws(() => progetti.cambia(p.id, { priorita: storto }), /alta o normale/, `«${storto}» è passato`)
    assert.equal(progetti.trova(p.id)?.priorita, 'alta', `«${storto}» ha cambiato la priorità`)
  }
  assert.equal(progetti.cambia('pinesistente', { priorita: 'alta' }), null)
})

// — l'ordine —

test('dentro ogni stato quelli alti davanti; un fermo alto resta dietro agli attivi', () => {
  store.azzeraTutto()
  const a = progetti.scrivi({ nome: 'Alfa' })
  const b = progetti.scrivi({ nome: 'Beta' })
  const c = progetti.scrivi({ nome: 'Gamma' })
  const d = progetti.scrivi({ nome: 'Delta' })
  progetti.cambia(b.id, { priorita: 'alta' })
  progetti.cambia(d.id, { stato: 'fermo', priorita: 'alta' })
  // Gamma toccato per ultimo: fra i normali è il primo, ma non passa davanti a Beta
  toccato(a.id, '2026-09-01T09:00:00.000Z')
  toccato(b.id, '2026-09-02T09:00:00.000Z')
  toccato(c.id, '2026-09-20T09:00:00.000Z')
  toccato(d.id, '2026-09-21T09:00:00.000Z')
  assert.deepEqual(progetti.elenco().map(p => p.nome), ['Beta', 'Gamma', 'Alfa', 'Delta'])
  assert.deepEqual(progetti.elenco('attivo').map(p => p.nome), ['Beta', 'Gamma', 'Alfa'])
  assert.deepEqual(progetti.vivi().map(p => p.nome), ['Beta', 'Gamma', 'Alfa', 'Delta'])
  assert.equal(a.priorita, null)
})

test('il modello legge la priorità, e quello alto entra nel tetto per primo', () => {
  store.azzeraTutto()
  for (let i = 0; i < 9; i++) progetti.scrivi({ nome: `Progetto ${i}`, obiettivo: `Arrivare a ${i}` })
  // il più vecchio e mai più toccato: senza priorità sarebbe il primo a restare fuori
  const vecchio = progetti.trovaPerNome('Progetto 0')!
  progetti.cambia(vecchio.id, { priorita: 'alta' })
  toccato(vecchio.id, '2026-01-01T09:00:00.000Z')
  for (let i = 1; i < 9; i++) toccato(progetti.trovaPerNome(`Progetto ${i}`)!.id, `2026-09-1${i}T09:00:00.000Z`)

  const righe = progetti.perIlModello().split('\n').filter(r => r.startsWith('— '))
  assert.equal(righe.length, 8)
  assert.match(righe[0], /^— Progetto: Progetto 0 \(attivo; priorità alta, segnata dalla persona: viene prima degli altri; registrato dalla persona\)/)
  assert.equal(righe.filter(r => r.includes('priorità alta')).length, 1, 'la priorità è finita su un progetto normale')

  // uno solo di posto: resta quello alto
  assert.match(progetti.perIlModello('', 1), /Progetto 0/)
  // ma quello che il discorso nomina viene prima della priorità: è di quello che si parla
  const nominato = progetti.perIlModello('come va il Progetto 5?', 1)
  assert.match(nominato, /Progetto 5/)
  assert.doesNotMatch(nominato, /Progetto 0/)
})

// — la prima pagina —

test('segnato alto, il blocco sale in cima all’ordine che aveva trascinato; tornare normale non lo sposta', () => {
  store.azzeraTutto()
  const a = progetti.scrivi({ nome: 'Alfa' })
  const b = progetti.scrivi({ nome: 'Beta' })
  const c = progetti.scrivi({ nome: 'Gamma' })
  cfg.aggiorna({ ordineBlocchi: [a.id, 'resto', b.id, c.id] })
  progetti.cambia(c.id, { priorita: 'alta' })
  assert.deepEqual(cfg.leggi().ordineBlocchi, [c.id, a.id, 'resto', b.id])
  // di nuovo «alta»: già in cima per sua scelta o trascinato altrove, non si risposta
  cfg.aggiorna({ ordineBlocchi: [a.id, c.id, 'resto', b.id] })
  progetti.cambia(c.id, { priorita: 'alta' })
  assert.deepEqual(cfg.leggi().ordineBlocchi, [a.id, c.id, 'resto', b.id])
  progetti.cambia(c.id, { priorita: null })
  assert.deepEqual(cfg.leggi().ordineBlocchi, [a.id, c.id, 'resto', b.id])
  // senza un ordine suo non se ne scrive uno: decide la pagina, con la priorità
  cfg.aggiorna({ ordineBlocchi: [] })
  progetti.cambia(b.id, { priorita: 'alta' })
  assert.deepEqual(cfg.leggi().ordineBlocchi, [])
  assert.deepEqual(progetti.inCimaAllOrdine(['x', 'y', 'z'], 'z'), ['z', 'x', 'y'])
  assert.deepEqual(progetti.inCimaAllOrdine(['x', 'y'], 'nuovo'), ['nuovo', 'x', 'y'])
})

// — dopo la revisione: lo stesso nome, i progetti non attivi, l'unione —

test('lo stesso nome, scritto in un altro modo, non fa un progetto nuovo: lo dice; uno chiuso si riapre e riparte normale', () => {
  store.azzeraTutto()
  const p = progetti.scrivi({ nome: 'Evermute', obiettivo: 'Beta a cinquanta studi' })
  const di = progetti.crea({ nome: '  EVERMUTE ' })
  assert.equal(di.esisteva, true)
  assert.equal(di.riaperto, false)
  assert.equal(di.progetto.id, p.id)
  assert.equal(progetti.elenco().length, 1, 'è nato un doppione')

  // chiuso con la priorità alta di allora: riaperto a mano, la priorità non torna
  progetti.cambia(p.id, { priorita: 'alta' })
  store.default.prepare("UPDATE progetti SET stato = 'chiuso' WHERE id = ?").run(p.id)
  const riaperto = progetti.crea({ nome: 'evermute' })
  assert.deepEqual([riaperto.esisteva, riaperto.riaperto, riaperto.progetto.stato, riaperto.progetto.priorita], [true, true, 'attivo', null])

  // e un nome nuovo è nuovo
  const nuovo = progetti.crea({ nome: 'Nextas' })
  assert.deepEqual([nuovo.esisteva, nuovo.riaperto], [false, false])
})

test('chiudere toglie la priorità, e a un chiuso non se ne dà; riaprirlo lo fa ripartire normale', () => {
  store.azzeraTutto()
  const p = progetti.scrivi({ nome: 'Evermute' })
  progetti.cambia(p.id, { priorita: 'alta' })
  assert.equal(progetti.cambia(p.id, { stato: 'chiuso' })?.priorita, null, 'chiuso, ha tenuto la priorità')
  assert.throws(() => progetti.cambia(p.id, { priorita: 'alta' }), /chiuso non ha priorità/)
  assert.equal(progetti.trova(p.id)?.priorita, null)
  // «normale» detto per intero vale come null
  const q = progetti.scrivi({ nome: 'Nextas' })
  progetti.cambia(q.id, { priorita: 'alta' })
  assert.equal(progetti.cambia(q.id, { priorita: 'normale' })?.priorita, null)
  // una priorità rimasta scritta su un chiuso (da prima) non torna riaprendolo
  progetti.cambia(q.id, { priorita: 'alta' })
  store.default.prepare("UPDATE progetti SET stato = 'chiuso' WHERE id = ?").run(q.id)
  assert.equal(progetti.cambia(q.id, { stato: 'attivo' })?.priorita, null)
})

test('un progetto fermo o chiuso con la priorità scritta non passa davanti a niente, né al modello né nell’ordine dei blocchi', () => {
  store.azzeraTutto()
  const attivo = progetti.scrivi({ nome: 'Alfa', obiettivo: 'Arrivare in fondo' })
  const fermo = progetti.scrivi({ nome: 'Beta', obiettivo: 'Aspettare' })
  progetti.cambia(fermo.id, { stato: 'fermo' })
  cfg.aggiorna({ ordineBlocchi: [attivo.id, 'resto'] })
  // segnato alto mentre è in pausa: resta scritto, ma non si prende il posto in cima
  progetti.cambia(fermo.id, { priorita: 'alta' })
  assert.equal(progetti.trova(fermo.id)?.priorita, 'alta')
  assert.deepEqual(cfg.leggi().ordineBlocchi, [attivo.id, 'resto'], 'un fermo ha rubato il posto in cima')
  assert.equal(progetti.eAlto(progetti.trova(fermo.id)!), false)

  const righe = progetti.perIlModello().split('\n').filter(r => r.startsWith('— '))
  const suaRiga = righe.find(r => r.includes('Progetto: Beta'))!
  assert.ok(suaRiga, righe.join('\n'))
  assert.doesNotMatch(suaRiga, /priorità alta/, 'un fermo dice al modello che viene prima degli altri')

  // il punto: nell'elenco dei progetti la priorità si legge solo accanto a un attivo
  const m = punto.raccogli(new Date(Date.now() - 60_000).toISOString())
  const testo = punto.istruzione({ ...m, progetti: progetti.vivi() }, [], [])
  assert.match(testo, /Beta: Aspettare \(fermo, dal/)
  assert.doesNotMatch(testo, /Beta: Aspettare \(fermo, priorità alta/)

  // ripartito, vale di nuovo: la priorità era sua, la pausa l'aveva solo messa da parte
  progetti.cambia(fermo.id, { stato: 'attivo' })
  assert.match(progetti.perIlModello(), /Progetto: Beta \(attivo; priorità alta/)
  assert.match(punto.istruzione({ ...punto.raccogli(new Date(Date.now() - 60_000).toISOString()), progetti: progetti.vivi() }, [], []), /Beta: Aspettare \(attivo, priorità alta/)
})

test('unire due progetti tiene la priorità alta di uno dei due, e non sposta il secondo in cima all’ordine trascinato', () => {
  store.azzeraTutto()
  const alfa = progetti.scrivi({ nome: 'Alfa' })
  const beta = progetti.scrivi({ nome: 'Beta' })
  const gamma = progetti.scrivi({ nome: 'Gamma' })
  progetti.cambia(beta.id, { priorita: 'alta' })
  cfg.aggiorna({ ordineBlocchi: [gamma.id, beta.id, 'resto', alfa.id] })
  // Beta (alto) dentro Alfa (normale): Alfa diventa alto, e resta dov'era Beta
  progetti.unisci(beta.id, alfa.id)
  assert.equal(progetti.trova(alfa.id)?.priorita, 'alta', 'l’unione ha perso la priorità')
  assert.deepEqual(cfg.leggi().ordineBlocchi, [gamma.id, 'resto', alfa.id], 'l’unione ha rimescolato l’ordine')
  // e un normale dentro un alto resta alto
  const delta = progetti.scrivi({ nome: 'Delta' })
  progetti.unisci(delta.id, alfa.id)
  assert.equal(progetti.trova(alfa.id)?.priorita, 'alta')
})

test('la nota di un’unione si scrive nella lingua dell’app', () => {
  store.azzeraTutto()
  cfg.aggiorna({ lingua: 'en' })
  const a = progetti.scrivi({ nome: 'Alfa', obiettivo: 'Ship it' })
  const b = progetti.scrivi({ nome: 'Beta' })
  progetti.unisci(a.id, b.id)
  assert.match(progetti.trova(b.id)!.note, /: merged the project “Alfa”\. Goal: Ship it$/)
  cfg.aggiorna({ lingua: 'it' })
  const c = progetti.scrivi({ nome: 'Gamma' })
  progetti.unisci(c.id, b.id)
  assert.match(progetti.trova(b.id)!.note, /: unito il progetto «Gamma»$/)
})

// — detto in chat —

test('«Evermute is my top priority» detto in chat finisce nella stessa colonna, e si toglie allo stesso modo', () => {
  store.azzeraTutto()
  const p = progetti.scrivi({ nome: 'Evermute', obiettivo: 'Beta a cinquanta studi' })
  const messaggio = 'Evermute is my top priority this month'
  const r = claude.aggiornaDallaChat('t-alta', { progetto: 'Evermute', citazione: 'Evermute is my top priority', priorita: 'alta' }, messaggio)
  assert.ok(!r.is_error, String(r.content))
  assert.match(String(r.content), /Salvato su Evermute: priorità alta/)
  assert.equal(progetti.trova(p.id)?.priorita, 'alta')
  const ancora = claude.aggiornaDallaChat('t-alta2', { progetto: 'Evermute', citazione: 'Evermute is my top priority', priorita: 'alta' }, messaggio)
  assert.match(String(ancora.content), /priorità già alta/)
  const giu = 'Evermute is not the priority anymore'
  assert.ok(!claude.aggiornaDallaChat('t-giu', { progetto: 'Evermute', citazione: giu, priorita: 'normale' }, giu).is_error)
  assert.equal(progetti.trova(p.id)?.priorita, null)
  const storta = claude.aggiornaDallaChat('t-storta', { progetto: 'Evermute', citazione: giu, priorita: 'bassa' }, giu)
  assert.equal(storta.is_error, true)
  assert.equal(progetti.trova(p.id)?.priorita, null)
})

// — la rotta —

async function avviaIlServer() {
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', fileURLToPath(new URL('./index.ts', import.meta.url))], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, MYYND_DATI: ROTTA, MYYND_PORT: '0', MYYND_DEV: '1', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  await new Promise<void>((pronto, guaio) => {
    const orologio = setTimeout(() => guaio(new Error('il server non è partito')), 15_000)
    let fuori = '', errori = ''
    server!.stdout!.on('data', p => {
      fuori += String(p)
      const m = fuori.match(/server su (http:\/\/127\.0\.0\.1:\d+)/)
      if (m) { base = m[1]; clearTimeout(orologio); pronto() }
    })
    server!.stderr!.on('data', p => { errori += String(p).slice(0, 1000) })
    server!.on('exit', c => { if (!base) { clearTimeout(orologio); guaio(new Error(`il server è uscito ${c}: ${errori}`)) } })
    server!.on('error', guaio)
  })
  // la sessione di sviluppo si apre un momento dopo che la porta risponde
  for (let i = 0; i < 60; i++) {
    const r = await fetch(`${base}/api/progetti`, { headers: { authorization: `Bearer ${TOKEN}` } })
    await r.arrayBuffer()
    if (r.ok) break
    await new Promise(r2 => setTimeout(r2, 200))
  }
}

const chiama = async (metodo: string, strada: string, corpo?: unknown) => {
  const r = await fetch(`${base}${strada}`, {
    method: metodo,
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', origin: base },
    body: corpo === undefined ? undefined : JSON.stringify(corpo)
  })
  return { stato: r.status, dati: await r.json() as Record<string, unknown> }
}

test('la rotta: PATCH accetta «alta» e null, rifiuta il resto con un 400, e l’elenco mette l’alto davanti', async () => {
  await avviaIlServer()
  const uno = (await chiama('POST', '/api/progetti', { nome: 'Uno', obiettivo: 'Il primo' })).dati.progetto as { id: string; priorita: unknown }
  const due = (await chiama('POST', '/api/progetti', { nome: 'Due', obiettivo: 'Il secondo' })).dati.progetto as { id: string }
  assert.equal(uno.priorita, null)

  const alta = await chiama('PATCH', `/api/progetti/${uno.id}`, { priorita: 'alta' })
  assert.equal(alta.stato, 200)
  assert.equal((alta.dati.progetto as { priorita: unknown }).priorita, 'alta')

  for (const storto of ['bassa', 3, { livello: 'alta' }, true, ['alta']]) {
    const no = await chiama('PATCH', `/api/progetti/${uno.id}`, { priorita: storto })
    assert.equal(no.stato, 400, `«${JSON.stringify(storto)}» è passato`)
    assert.match(String(no.dati.errore), /alta o normale|high or normal/i)
  }

  const elenco = (await chiama('GET', '/api/progetti')).dati.progetti as { id: string; priorita: unknown }[]
  assert.deepEqual(elenco.map(p => [p.id, p.priorita]), [[uno.id, 'alta'], [due.id, null]])

  const normale = await chiama('PATCH', `/api/progetti/${uno.id}`, { priorita: null })
  assert.equal(normale.stato, 200)
  assert.equal((normale.dati.progetto as { priorita: unknown }).priorita, null)
  await chiama('PATCH', `/api/progetti/${uno.id}`, { priorita: 'alta' })
  const aParole = await chiama('PATCH', `/api/progetti/${uno.id}`, { priorita: 'normale' })
  assert.equal((aParole.dati.progetto as { priorita: unknown }).priorita, null, '«normale» non è tornato normale')

  // lo stesso nome: la risposta lo dice, e il progetto è quello di prima
  const doppio = await chiama('POST', '/api/progetti', { nome: 'uno' })
  assert.equal(doppio.stato, 200)
  assert.equal(doppio.dati.esisteva, true)
  assert.equal((doppio.dati.progetto as { id: string }).id, uno.id)
  assert.equal((await chiama('POST', '/api/progetti', { nome: 'Tre' })).dati.esisteva, false)
  assert.equal((await chiama('PATCH', '/api/progetti/pinesistente', { priorita: 'alta' })).stato, 404)
})
