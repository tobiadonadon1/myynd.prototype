// La connessione della prova (P6): sola lettura, e il passato com'era.
//
//   node --test server/prova-db.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-prova-db-'))
mkdirSync(join(CASA, '.myynd'), { recursive: true })
const CASA_VERA = process.env.HOME
process.env.HOME = CASA
process.env.MYYND_DATI = join(CASA, '.myynd')
writeFileSync(join(CASA, '.myynd', 'config.json'), JSON.stringify({ lingua: 'it' }), { mode: 0o600 })

const store = await import('./store.ts')
const pc = await import('./prova-chiusa.ts')
const db = store.default

after(() => {
  store.chiudiIndici()
  process.env.HOME = CASA_VERA
  rmSync(CASA, { recursive: true, force: true })
})

const GIORNO = 86_400_000
const ORA = Date.now()
const iso = (ms: number) => new Date(ms).toISOString()
const T = iso(ORA - 10 * GIORNO)

store.salvaDocumenti([
  { id: 'posta:prima', fonte: 'posta', tipo: 'email', titolo: 'Preventivo cucina', corpo: 'Mi mandate il preventivo per la cucina?', autore: 'Dana <dana@example.com>', quando: iso(ORA - 12 * GIORNO), filo: 'f1' },
  { id: 'posta:dopo', fonte: 'posta', tipo: 'email', titolo: 'Re: Preventivo cucina', corpo: 'ZQX-DOPO ecco il preventivo per la cucina', autore: 'io@example.com', quando: iso(ORA - 8 * GIORNO), filo: 'f1', inviato: true },
  { id: 'posta:altro', fonte: 'posta', tipo: 'email', titolo: 'Preventivo bagno', corpo: 'Anche il preventivo del bagno, grazie', autore: 'Lee <lee@example.com>', quando: iso(ORA - 11 * GIORNO), filo: 'f2' }
] as never)
db.exec(`CREATE TABLE IF NOT EXISTS aggiunta_da_altri (id TEXT)`)
db.prepare(`INSERT INTO compiti (id, testo, stato, ordine, origine, creato, aggiornato, chiuso, esito) VALUES (?,?,?,?,?,?,?,?,?)`)
  .run('c1', 'Rispondere a Dana', 'fatto', 'a', 'auto:x', iso(ORA - 11 * GIORNO), iso(ORA - 9 * GIORNO), iso(ORA - 9 * GIORNO), 'fatto')
db.prepare(`INSERT INTO feed (id, tipo, titolo, testo, doc, stato, quando, risposto, ragione) VALUES (?,?,?,?,?,?,?,?,?)`)
  .run('v1', 'email', 'Preventivo bagno', 'x', 'posta:altro', 'scartato', iso(ORA - 11 * GIORNO), iso(ORA - 5 * GIORNO), 'non_mia')

const contesto = (al: string | null = T): import('./prova-chiusa.ts').Contesto =>
  ({ tipo: 'prova', prova: 'p', al, conto: { gettoni: 0, tetto: 1000, sforato: false }, parziale: new Set() })

test('dentro la prova ogni scrittura lancia, anche su una tabella nata dopo', async () => {
  const conteggio = () => (db.prepare('SELECT COUNT(*) AS n FROM compiti').get() as { n: number }).n
  const prima = conteggio()
  await store.nellaProva(contesto(), () => {
    const scrivi: [string, string][] = [
      ['compiti', "INSERT INTO compiti (id, testo, ordine, creato, aggiornato) VALUES ('z','z','z','x','x')"],
      ['feed', "INSERT INTO feed (id, tipo, titolo, testo, quando) VALUES ('z','x','x','x','x')"],
      ['misure_compiti', "INSERT INTO misure_compiti (compito, affidato) VALUES ('z','x')"],
      ['segnali', "INSERT INTO segnali DEFAULT VALUES"],
      ['fiducia', "INSERT INTO fiducia (genere, giuste, sbagliate, aggiornato) VALUES ('x',1,0,'x')"],
      ['mancate', "INSERT INTO mancate DEFAULT VALUES"],
      ['aggiunta_da_altri', "INSERT INTO aggiunta_da_altri (id) VALUES ('z')"]
    ]
    // compiti e feed sono coperte dalla vista del passato: SQLite dice «is a view» prima di «readonly»
    for (const [t, sql] of scrivi) assert.throws(() => db.exec(sql), /readonly|is a view/, `${t} deve essere di sola lettura`)
    assert.throws(() => store.scriviCompito({ id: 'z2', testo: 'z', ordine: 'z', quando: 'oggi' }), /readonly|is a view/)
    assert.throws(() => db.exec("INSERT INTO main.compiti (id, testo, ordine, creato, aggiornato) VALUES ('z','z','z','x','x')"), /readonly/)
  })
  assert.equal(conteggio(), prima)
  // il vassoio non ha un'ora: niente viste, sola lettura e basta
  await store.nellaProva(contesto(null), () => {
    assert.throws(() => db.exec("INSERT INTO compiti (id, testo, ordine, creato, aggiornato) VALUES ('z','z','z','x','x')"), /readonly/)
    assert.ok(store.cerca('ZQX', 10).length, 'il vassoio legge adesso')
  })
})

test('segnaUso scrive lo stesso, fuori, e conta nel budget della prova', async () => {
  const n = () => (db.prepare('SELECT COUNT(*) AS n FROM uso').get() as { n: number }).n
  const prima = n()
  const c = contesto()
  await store.nellaProva(c, () => store.segnaUso({ lavoro: 'collaudo', motore: 'finto', entrata: 30, cache: 0, uscita: 12 }))
  assert.equal(n(), prima + 1)
  assert.equal(c.conto.gettoni, 42)
})

test('il futuro non si vede: cerca, stessoFilo, recenti e la ricerca a testo', async () => {
  const fuori = store.cerca('preventivo cucina', 10).map(d => d.id)
  assert.ok(fuori.includes('posta:dopo'), 'fuori dalla prova la risposta c\'è')
  await store.nellaProva(contesto(), () => {
    assert.ok(!store.cerca('preventivo cucina', 10).some(d => d.id === 'posta:dopo'))
    assert.ok(!store.cerca('ZQX', 10).length)
    assert.deepEqual(store.stessoFilo('f1').map(d => d.id), ['posta:prima'])
    assert.ok(!store.recenti(10).some(d => d.id === 'posta:dopo'))
    assert.equal(store.documento('posta:dopo'), null)
  })
})

test('una riga chiusa dopo T si legge aperta, e una carta scartata dopo T si legge aperta', async () => {
  assert.equal(store.compitoVivoDa('x'), false, 'oggi è chiusa')
  await store.nellaProva(contesto(), () => {
    assert.equal(store.compitoVivoDa('x'), true)
    const r = db.prepare("SELECT stato, risposto, ragione FROM feed WHERE id = 'v1'").get() as { stato: string; risposto: string | null; ragione: string | null }
    assert.deepEqual({ ...r }, { stato: 'aperto', risposto: null, ragione: null })
  })
  // una prova più tarda la vede chiusa
  await store.nellaProva(contesto(iso(ORA - GIORNO)), () => assert.equal(store.compitoVivoDa('x'), false))
})

test('fuori dalla prova cerca torna la stessa lista di prima (controcaso)', async () => {
  const a = store.cerca('preventivo', 10).map(d => d.id)
  await store.nellaProva(contesto(), () => store.cerca('preventivo', 10))
  const b = store.cerca('preventivo', 10).map(d => d.id)
  assert.deepEqual(b, a)
  assert.equal(pc.inProva(), null)
})

test('la connessione della prova si chiude alla fine e il recinto non vale più', async () => {
  const c = contesto()
  await store.nellaProva(c, () => store.cerca('preventivo', 3))
  assert.equal(c.chiusa, true)
  assert.equal(pc.dentroLaProva(c, () => pc.inProva()), null)
})

test('arrivatiFra va per data del documento, senza la posta mandata', () => {
  const ids = store.arrivatiFra(iso(ORA - 13 * GIORNO), iso(ORA - 7 * GIORNO), 10).map(d => d.id)
  assert.deepEqual(ids, ['posta:altro', 'posta:prima'])
})
