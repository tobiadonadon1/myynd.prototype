// La cronologia dei browser, su file History costruiti a mano: mai quelli veri.
//
//   node --import ./build/test-profile.mjs --test server/cronologia-browser.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as c from './connettori/cronologia-browser.ts'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-cronologia-casa-'))
after(() => rmSync(CASA, { recursive: true, force: true }))

const T0 = Date.parse('2026-10-16T08:00:00.000Z')

/** Un History di Chrome con lo schema che serve: `urls` e `visits`. */
function history(cartella: string, visite: { url: string; titolo: string; quando: number; secondi?: number }[]) {
  mkdirSync(cartella, { recursive: true })
  const db = new DatabaseSync(join(cartella, 'History'))
  db.exec(`CREATE TABLE urls (id INTEGER PRIMARY KEY, url LONGVARCHAR, title LONGVARCHAR, visit_count INTEGER DEFAULT 0, typed_count INTEGER DEFAULT 0, last_visit_time INTEGER, hidden INTEGER DEFAULT 0);
    CREATE TABLE visits (id INTEGER PRIMARY KEY, url INTEGER NOT NULL, visit_time INTEGER NOT NULL, from_visit INTEGER, transition INTEGER DEFAULT 0, segment_id INTEGER, visit_duration INTEGER DEFAULT 0);`)
  const u = db.prepare('INSERT INTO urls (url, title, last_visit_time) VALUES (?,?,?)')
  const v = db.prepare('INSERT INTO visits (url, visit_time, visit_duration) VALUES (?,?,?)')
  for (const x of visite) {
    const id = Number(u.run(x.url, x.titolo, c.aChrome(x.quando)).lastInsertRowid)
    v.run(id, c.aChrome(x.quando), (x.secondi ?? 0) * 1_000_000)
  }
  db.close()
}

const chrome = join(CASA, 'Library', 'Application Support', 'Google', 'Chrome')
history(join(chrome, 'Default'), [
  { url: 'https://docs.google.com/document/d/1AbC_dEf/edit?usp=sharing&token=SEGRETO', titolo: 'Northwind proposal - Google Docs', quando: T0, secondi: 600 },
  { url: 'https://docs.google.com/document/d/1AbC_dEf/edit#heading=h.1', titolo: 'Northwind proposal - Google Docs', quando: T0 + 20 * 60_000, secondi: 300 },
  { url: 'https://www.intesasanpaolo.com/conto?iban=IT60X0542811101000000123456', titolo: 'Il mio conto', quando: T0 + 30 * 60_000 },
  { url: 'https://mybank.example.com/login', titolo: 'Bank', quando: T0 + 31 * 60_000 },
  { url: 'https://github.com/acme/northwind/pull/42/files?diff=split', titolo: 'Fix pricing by anna · Pull Request #42', quando: T0 + 40 * 60_000, secondi: 120 },
  { url: 'https://news.ycombinator.com/item?id=1', titolo: 'Hacker News', quando: T0 + 50 * 60_000 },
  { url: 'https://news.ycombinator.com/', titolo: 'Hacker News', quando: T0 + 55 * 60_000 },
  { url: 'chrome://settings', titolo: 'Settings', quando: T0 + 56 * 60_000 }
])
history(join(chrome, 'Profile 1'), [
  { url: 'https://www.figma.com/design/KEY123/Harbor-site?node-id=1-2', titolo: 'Harbor site – Figma', quando: T0 + 3600_000, secondi: 900 }
])
// una cartella che non è un profilo: non si legge
history(join(chrome, 'System Profile'), [{ url: 'https://example.com', titolo: 'x', quando: T0 }])

test('pulisciUrl: via query e frammento, tranne le identità dei documenti noti', () => {
  assert.deepEqual(c.pulisciUrl('https://docs.google.com/spreadsheets/d/XYZ/edit?gid=0#x'), { url: 'https://docs.google.com/spreadsheets/d/XYZ', dominio: 'docs.google.com', documento: 'gdoc:sheet:XYZ' })
  assert.equal(c.pulisciUrl('https://www.notion.so/acme/Plan-Q4-0123456789abcdef0123456789abcdef?pvs=4')!.documento, 'notion:0123456789abcdef0123456789abcdef')
  assert.equal(c.pulisciUrl('https://www.figma.com/file/KEY/Name?node-id=1')!.documento, 'figma:KEY')
  assert.equal(c.pulisciUrl('https://github.com/a/b/issues/7#issuecomment-1')!.documento, 'github:a/b#7')
  assert.equal(c.pulisciUrl('https://linear.app/acme/issue/eng-12/fix-it')!.documento, 'linear:ENG-12')
  assert.equal(c.pulisciUrl('https://www.canva.com/design/DAF1/edit?ui=x')!.documento, 'canva:DAF1')
  const altro = c.pulisciUrl('https://example.com/search?q=salary+of+anna&session=abc#top')!
  assert.equal(altro.url, 'https://example.com/search')
  assert.equal(altro.documento, null)
  assert.equal(c.pulisciUrl('chrome://settings'), null)
  assert.equal(c.pulisciUrl('non è un indirizzo'), null)
})

test('domini esclusi: la lista, le parole, i sottodomini, e le esclusioni sue', () => {
  assert.equal(c.dominioEscluso('intesasanpaolo.com'), true)
  assert.equal(c.dominioEscluso('online.intesasanpaolo.com'), true)
  assert.equal(c.dominioEscluso('mybank.example.com'), true)
  assert.equal(c.dominioEscluso('salute.lazio.it'), true)
  assert.equal(c.dominioEscluso('pornhub.com'), true)
  assert.equal(c.dominioEscluso('github.com'), false)
  assert.equal(c.dominioEscluso('bankside-design.com'), false, 'una parola dentro un nome non basta')
  assert.equal(c.dominioEscluso('news.ycombinator.com', ['ycombinator.com']), true)
  assert.equal(c.dominioEscluso('ycombinator.com', ['https://www.ycombinator.com/jobs']), true)
})

test('i profili: Default e Profile N di ogni browser, Safari solo se il file c’è', () => {
  const p = c.profili(CASA)
  assert.deepEqual(p.map(x => `${x.browser}/${x.profilo}`).sort(), ['Chrome/Default', 'Chrome/Profile 1'])
})

test('leggiProfilo: copia del file, visite dopo il cursore, indirizzi puliti, banche fuori, durata in secondi', () => {
  const [def] = c.profili(CASA).filter(p => p.profilo === 'Default')
  const v = c.leggiProfilo(def!, T0 - 1)
  assert.deepEqual(v.map(x => x.dominio), ['docs.google.com', 'docs.google.com', 'github.com', 'news.ycombinator.com', 'news.ycombinator.com'])
  assert.ok(v.every(x => !x.url.includes('?') && !x.url.includes('#')), 'nessuna query, nessun frammento')
  assert.ok(!JSON.stringify(v).includes('SEGRETO') && !JSON.stringify(v).includes('IT60X'), 'niente gettoni né IBAN')
  assert.equal(v[0]!.documento, 'gdoc:doc:1AbC_dEf')
  assert.equal(v[0]!.secondi, 600)
  assert.equal(v[0]!.quando, T0)
  assert.equal(v[2]!.documento, 'github:acme/northwind#42')
  // dal cursore: solo quello che viene dopo
  assert.equal(c.leggiProfilo(def!, T0 + 45 * 60_000).length, 2)
  // le esclusioni sue
  assert.equal(c.leggiProfilo(def!, T0 - 1, { esclusi: ['ycombinator.com'] }).length, 3)
})

test('perGiorno: un documento ha la sua riga, il resto del dominio una sola; titoli e durate sommati', () => {
  const tutte = c.leggiTutto(() => T0 - 1, { casa: CASA }).flatMap(x => x.visite)
  const g = c.perGiorno(tutte, ms => new Date(ms).toISOString().slice(0, 10))
  const doc = g.find(x => x.documento === 'gdoc:doc:1AbC_dEf')!
  assert.equal(doc.visite, 2)
  assert.equal(doc.secondi, 900)
  assert.deepEqual(doc.titoli, ['Northwind proposal - Google Docs'])
  assert.equal(doc.prima, T0)
  assert.equal(doc.ultima, T0 + 20 * 60_000)
  const hn = g.find(x => x.dominio === 'news.ycombinator.com')!
  assert.equal(hn.documento, null)
  assert.equal(hn.visite, 2)
  assert.equal(hn.url, 'https://news.ycombinator.com')
  assert.ok(g.find(x => x.documento === 'figma:KEY123'))
})
