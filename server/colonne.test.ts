// Le migrazioni e la rete di sicurezza devono dire la stessa cosa.
//
// `rimetti()` rimette le colonne scritte in `COLONNE` e le tabelle scritte in
// `TABELLE` quando una migrazione è stata saltata (una voce infilata in mezzo
// alla lista: è successo due volte). Funziona solo se quelle liste sono
// complete — e il commento diceva che un test lo controllava, ma nessun test
// leggeva `COLONNE`. Qui lo si fa davvero: si legge `store.ts` come testo, si
// tirano fuori tutte le colonne che le migrazioni aggiungono, e si confrontano
// con quello che `rimetti()` sa rimettere. Poi si prova sul database: uno nuovo,
// uno a cui si tolgono pezzi, e uno vero fermo alla 47.
//
//   node --test server/colonne.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-colonne-'))
process.env.MYYND_DATI = CASA
const store = await import('./store.ts')
after(() => { store.chiudiIndici(); rmSync(CASA, { recursive: true, force: true }) })

const QUI = new URL('.', import.meta.url).pathname
const SORGENTE = readFileSync(join(QUI, 'store.ts'), 'utf8')
const schema = store.perProva.schema()

/** Il testo della lista delle migrazioni, senza i commenti (che citano codice e hanno apostrofi). */
function testoMigrazioni(): string {
  const da = SORGENTE.indexOf('const MIGRAZIONI')
  const a = SORGENTE.indexOf('\n]\n', da)
  assert.ok(da > 0 && a > da, 'non trovo la lista delle migrazioni')
  return SORGENTE.slice(da, a)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(r => !/^\s*\/\//.test(r)).join('\n')
}

const normale = (t: string) => t.replace(/\s+/g, ' ').trim().replace(/"/g, "'")

/** Ogni colonna che una migrazione aggiunge: con `colonna(…)` o con `ALTER TABLE … ADD COLUMN`. */
function colonneDelleMigrazioni(): { tabella: string; nome: string; tipo: string }[] {
  const t = testoMigrazioni()
  const fuori: { tabella: string; nome: string; tipo: string }[] = []
  for (const m of t.matchAll(/colonna\(d,\s*'(\w+)',\s*'(\w+)',\s*(?:'([^']*)'|"([^"]*)")\s*\)/g)) {
    fuori.push({ tabella: m[1], nome: m[2], tipo: normale(m[3] ?? m[4]) })
  }
  for (const m of t.matchAll(/(['`]?)\s*ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+(\w+)\s+([^;`\n]+)/g)) {
    let tipo = m[4]
    // dentro una stringa fra apici semplici, l'apice che chiude è la fine
    if (m[1] === "'") tipo = tipo.slice(0, tipo.lastIndexOf("'"))
    fuori.push({ tabella: m[2], nome: m[3], tipo: normale(tipo) })
  }
  return fuori
}

test('le migrazioni si leggono: il parser trova quello che c’è davvero', () => {
  const c = colonneDelleMigrazioni()
  // una colonna di ciascuna forma, scelta apposta: se il parser si rompe, qui si vede
  const trova = (tabella: string, nome: string) => c.find(x => x.tabella === tabella && x.nome === nome)
  assert.equal(trova('compiti', 'modo')?.tipo, "TEXT NOT NULL DEFAULT 'io'")   // ALTER in un template
  assert.equal(trova('compiti', 'proposta')?.tipo, 'TEXT')                     // ALTER fra apici semplici
  assert.equal(trova('automazioni', 'raccolta')?.tipo, 'TEXT')                 // ALTER in un exec di più righe
  assert.equal(trova('documenti', 'inviato')?.tipo, 'INTEGER NOT NULL DEFAULT 0') // colonna(…)
  assert.equal(trova('compiti', 'domandeFatte')?.tipo, 'INTEGER NOT NULL DEFAULT 0')
  assert.ok(c.length >= 50, `trovate solo ${c.length} colonne`)
})

test('ogni colonna aggiunta da una migrazione è in COLONNE, con lo stesso tipo', () => {
  const manca: string[] = []
  for (const { tabella, nome, tipo } of colonneDelleMigrazioni()) {
    const c = (schema.colonne[tabella] ?? []).find(([n]) => n === nome)
    if (!c) manca.push(`${tabella}.${nome} ${tipo}`)
    else assert.equal(normale(c[1]), tipo, `${tabella}.${nome}: COLONNE dice «${c[1]}», la migrazione «${tipo}»`)
  }
  assert.deepEqual(manca, [], 'queste colonne una migrazione saltata non le rimetterebbe più')
})

test('e COLONNE non ha colonne che nessuna migrazione aggiunge', () => {
  const vere = new Set(colonneDelleMigrazioni().map(c => `${c.tabella}.${c.nome}`))
  for (const [tabella, colonne] of Object.entries(schema.colonne)) {
    for (const [nome] of colonne) assert.ok(vere.has(`${tabella}.${nome}`), `${tabella}.${nome} è in COLONNE ma non in una migrazione`)
  }
})

test('un database nuovo arriva allo schema 64, una voce per migrazione', () => {
  const voci = (testoMigrazioni().match(/^ {2}d =>/gm) ?? []).length
  assert.equal(voci, schema.migrazioni, 'il numero di voci scritte non è la lunghezza della lista')
  assert.equal(schema.migrazioni, 64)
  const v = (store.default.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
  assert.equal(v, schema.migrazioni)
})

test('ogni tabella nata dalla 48 in poi sta in TABELLE, e ogni voce di TABELLE la crea una migrazione', () => {
  const t = testoMigrazioni()
  const usate = new Set([...t.matchAll(/TABELLE\.(\w+)/g)].map(m => m[1]))
  for (const nome of Object.keys(schema.tabelle)) {
    assert.ok(usate.has(nome), `TABELLE.${nome} non la crea nessuna migrazione`)
    assert.match(schema.tabelle[nome as keyof typeof schema.tabelle], new RegExp(`CREATE TABLE IF NOT EXISTS ${nome} \\(`),
      `TABELLE.${nome} non crea la tabella ${nome}`)
  }
  for (const nome of usate) assert.ok(nome in schema.tabelle, `una migrazione usa TABELLE.${nome}, che non c'è`)
  // nessuna migrazione nuova crea una tabella scrivendola a mano, fuori da TABELLE
  const nuove = t.slice(t.indexOf("colonna(d, 'progetti', 'priorita', 'TEXT')"))
  assert.doesNotMatch(nuove, /CREATE TABLE/, 'una tabella nuova va scritta in TABELLE, così rimetti() la sa ricreare')
})

/** Le colonne di una tabella nel database aperto. */
const colonneDi = (t: string) => (store.default.prepare(`PRAGMA table_info(${t})`).all() as { name: string; type: string; notnull: number; dflt_value: string | null }[])
const tabelle = () => (store.default.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(r => r.name)
const indici = () => (store.default.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as { name: string }[]).map(r => r.name)

test('il database nuovo ha ogni tabella, colonna e indice che le liste promettono', () => {
  const ci = tabelle()
  for (const t of Object.keys(schema.tabelle)) assert.ok(ci.includes(t), `manca la tabella ${t}`)
  for (const [t, colonne] of Object.entries(schema.colonne)) {
    const nomi = colonneDi(t).map(c => c.name)
    for (const [c] of colonne) assert.ok(nomi.includes(c), `manca ${t}.${c}`)
  }
  for (const i of ['idx_doc_risponde', 'idx_compiti_chiuso', 'idx_segnali_genere', 'idx_segnali_giorno', 'idx_sessioni_app_giorno',
    'idx_mancate_quando', 'idx_misure_affidato', 'idx_prove_auto', 'idx_esiti_prova', 'idx_esiti_doc']) {
    assert.ok(indici().includes(i), `manca l'indice ${i}`)
  }
  // le forme scritte nella specifica, controllate su un paio di punti che contano
  const prev = colonneDi('previsioni')
  assert.deepEqual(prev.map(c => c.name), ['id', 'giorno', 'genere', 'ref', 'probabilita', 'dati', 'fatta', 'esito', 'verificata', 'prova'])
  assert.equal(colonneDi('abitudini').find(c => c.name === 'stato')?.dflt_value, "'osservata'")
  assert.equal(colonneDi('fiducia').find(c => c.name === 'gradino')?.dflt_value, "'guarda'")
  assert.equal(colonneDi('compiti').find(c => c.name === 'domandeFatte')?.notnull, 1)
  const salute = store.default.prepare("SELECT sql FROM sqlite_master WHERE name = 'salute_fonti'").get() as { sql: string }
  assert.match(salute.sql, /PRIMARY KEY \(giorno, fonte\)/)
  const unica = store.default.prepare("SELECT sql FROM sqlite_master WHERE name = 'previsioni'").get() as { sql: string }
  assert.match(unica.sql, /UNIQUE \(giorno, genere, ref\)/)
})

test('una tabella, una colonna e un indice tolti a mano tornano alla riapertura', () => {
  store.default.exec('DROP TABLE previsioni')
  store.default.exec('DROP TABLE esiti')
  store.default.exec('DROP INDEX idx_doc_risponde')
  store.default.exec('ALTER TABLE feed DROP COLUMN ragione')
  store.default.exec('ALTER TABLE compiti DROP COLUMN mandata')
  store.chiudiIndici()
  // si riapre al primo uso: `rimetti()` gira a ogni apertura, dopo le migrazioni
  assert.ok(tabelle().includes('previsioni'))
  assert.ok(tabelle().includes('esiti'))
  assert.ok(indici().includes('idx_doc_risponde'))
  assert.ok(indici().includes('idx_esiti_prova'), 'la tabella è tornata senza i suoi indici')
  assert.ok(colonneDi('feed').some(c => c.name === 'ragione'))
  assert.ok(colonneDi('compiti').some(c => c.name === 'mandata'))
})

test('azzerare svuota anche le tabelle nuove', () => {
  store.default.prepare("INSERT INTO segnali (id, genere, quando, giorno) VALUES ('s1', 'prova', '2026-09-24T10:00:00Z', '2026-09-24')").run()
  store.default.prepare("INSERT INTO fiducia (genere, giuste, sbagliate, aggiornato) VALUES ('email', 1, 0, '2026-09-24T10:00:00Z')").run()
  store.azzeraTutto()
  for (const t of Object.keys(schema.tabelle)) {
    assert.equal((store.default.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n, 0, `${t} non si è svuotata`)
  }
})

test('un indice vero fermo alla 47 arriva alla 64 senza perdere niente', () => {
  /*
   * Il file è un `mente.db` scritto dal codice della 0.2.24 (schema 47), con
   * dentro tre documenti, una voce, una riga, una chat e tre automazioni: una
   * accesa e già girata, una spenta e già girata, una mai girata.
   */
  store.chiudiIndici()
  for (const f of ['mente.db', 'mente.db-wal', 'mente.db-shm']) rmSync(join(CASA, f), { force: true })
  writeFileSync(join(CASA, 'mente.db'), gunzipSync(readFileSync(join(QUI, 'fixture', 'mente-47.db.gz'))))

  const v = (store.default.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
  assert.equal(v, 64)
  // un indice con documenti dentro si copia prima di migrare
  assert.ok(existsSync(join(CASA, 'istantanee')) && readdirSync(join(CASA, 'istantanee')).some(n => /^mente-v47-/.test(n)),
    'nessuna istantanea prima della migrazione')

  // quello che c'era c'è ancora
  assert.equal(store.documento('posta:INBOX:101')?.titolo, 'Quote for the spring order')
  assert.equal(store.documento('posta:INBOX:101')?.risponde ?? null, null, 'una colonna nuova si riempie alla prossima lettura, non inventata')
  assert.ok(store.cerca('spring order', 5).some(d => d.id === 'posta:INBOX:101'), 'la ricerca non trova più quello che c’era')
  assert.equal(store.voceFeed('f1')?.titolo, 'Send the quote')
  assert.equal(store.compito('c1')?.testo, 'Send Anna the quote')
  assert.equal(store.compito('c1')?.domandeFatte, 0)
  assert.equal(store.messaggi('ch1').length, 1)

  // le tabelle e le colonne nuove ci sono
  for (const t of Object.keys(schema.tabelle)) assert.ok(tabelle().includes(t), `manca la tabella ${t}`)
  for (const [t, colonne] of Object.entries(schema.colonne)) {
    const nomi = colonneDi(t).map(c => c.name)
    for (const [c] of colonne) assert.ok(nomi.includes(c), `manca ${t}.${c}`)
  }

  // il vassoio: solo quella accesa e già girata ne è esente
  const vassoio = (id: string) => (store.default.prepare('SELECT vassoio FROM automazioni WHERE id = ?').get(id) as { vassoio: string | null }).vassoio
  assert.equal(vassoio('viva-girata'), '1970-01-01T00:00:00.000Z')
  assert.equal(vassoio('spenta-girata'), null, 'una spenta non è viva: accesa domani passa dal vassoio')
  assert.equal(vassoio('mai-girata'), null, 'una mai girata non ha niente da farsi perdonare')

  // e riaprirlo non rifà niente
  store.chiudiIndici()
  assert.equal((store.default.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 64)
})
