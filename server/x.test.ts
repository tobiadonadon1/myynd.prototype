// X: il database del motore, letto in sola lettura, e quattro tipi di documento.
//
// Quello che si prova non è che l'SQLite si apra: è che un post pubblicato
// porti i numeri e il link, che una bozza rifiutata non sembri una cosa da
// fare, che il riepilogo della settimana dica i follower guadagnati e i tre
// post più visti — e che un database che manca resti mancante, invece di
// nascere vuoto sotto la lettura.
//
// Il database è inventato qui, con lo schema del motore vero.
//
//   node --test server/x.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-x-'))
mkdirSync(join(CASA, '.myynd'), { recursive: true })
// in italiano: le voci dei documenti («Visualizzazioni», «Bozza per X») seguono la lingua scelta
writeFileSync(join(CASA, '.myynd', 'config.json'), JSON.stringify({ lingua: 'it' }), { mode: 0o600 })
const CASA_VERA = process.env.HOME
process.env.HOME = CASA
process.env.MYYND_DATI = join(CASA, '.myynd')

const x = await import('./connettori/x.ts')

after(() => {
  process.env.HOME = CASA_VERA
  rmSync(CASA, { recursive: true, force: true })
})

/** Giovedì 17 settembre 2026: la settimana ISO 38 va da lunedì 14 a domenica 20. */
const ADESSO = Date.parse('2026-09-17T12:00:00Z')

/** Il database del motore, con lo schema vero e qualche riga per tipo. */
function motore(percorso: string) {
  const db = new DatabaseSync(percorso)
  db.exec(`
    CREATE TABLE drafts (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, kind TEXT NOT NULL, angle TEXT, body TEXT NOT NULL,
      media_path TEXT, target_url TEXT, target_author TEXT, status TEXT DEFAULT 'pending', reject_note TEXT, approved_at TEXT, scheduled_for TEXT);
    CREATE TABLE posted (id INTEGER PRIMARY KEY AUTOINCREMENT, draft_id INTEGER, posted_at TEXT NOT NULL, tweet_id TEXT UNIQUE, url TEXT, kind TEXT,
      body TEXT, likes INTEGER DEFAULT 0, reposts INTEGER DEFAULT 0, replies INTEGER DEFAULT 0, bookmarks INTEGER DEFAULT 0, views INTEGER DEFAULT 0, last_checked TEXT);
    CREATE TABLE follower_log (id INTEGER PRIMARY KEY AUTOINCREMENT, checked_at TEXT NOT NULL, followers INTEGER, following INTEGER, tweet_count INTEGER);
    CREATE TABLE strategy_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, note TEXT NOT NULL, applied INTEGER DEFAULT 0);
  `)
  const post = db.prepare('INSERT INTO posted (posted_at, tweet_id, url, kind, body, likes, reposts, replies, views) VALUES (?,?,?,?,?,?,?,?,?)')
  // il motore scrive le date con sei decimali e `+00:00`
  post.run('2026-09-15T14:31:56.222663+00:00', '1001', 'https://x.com/tizio/status/1001', 'reply', 'The MD file is the part that matters.\n\nSpec as context, not prompt.', 0, 0, 0, 52)
  post.run('2026-09-16T09:00:00+00:00', '1002', 'https://x.com/tizio/status/1002', 'post', 'Attention belongs where a suggestion becomes your decision.', 3, 1, 2, 410)
  post.run('2026-09-16T18:00:00+00:00', '1003', 'https://x.com/tizio/status/1003', 'post', 'A second post of the same week, seen less.', 1, 0, 0, 120)
  post.run('2026-09-08T10:00:00+00:00', '1004', 'https://x.com/tizio/status/1004', 'post', 'A post from the week before.', 0, 0, 0, 9)
  // fuori dai novanta giorni
  post.run('2026-05-01T10:00:00+00:00', '900', 'https://x.com/tizio/status/900', 'post', 'An old post nobody needs in the picture.', 0, 0, 0, 1)
  // senza testo: pubblicato, quindi conta nella settimana, ma non è un documento
  post.run('2026-09-16T20:00:00+00:00', '1005', 'https://x.com/tizio/status/1005', 'post', '', 0, 0, 0, 0)
  const draft = db.prepare('INSERT INTO drafts (created_at, kind, body, status, target_author, target_url, scheduled_for) VALUES (?,?,?,?,?,?,?)')
  draft.run('2026-09-17T08:00:00+00:00', 'post', 'Draft waiting: agents need a boundary before a prompt.', 'pending', null, null, null)
  draft.run('2026-09-17T08:05:00+00:00', 'reply', 'Approved reply, going out tonight.', 'approved', '@someone', 'https://x.com/someone/status/77', '2026-09-17T20:00:00+00:00')
  draft.run('2026-09-17T08:10:00+00:00', 'post', 'Rejected: navel-gazing.', 'rejected', null, null, null)
  draft.run('2026-09-17T08:15:00+00:00', 'post', 'Voided by a newer batch.', 'voided', null, null, null)
  draft.run('2026-09-17T08:20:00+00:00', 'post', 'Already out.', 'posted', null, null, null)
  const nota = db.prepare('INSERT INTO strategy_notes (created_at, note) VALUES (?,?)')
  nota.run('2026-06-01T10:00:00+00:00', 'Old note: replies to big accounts get seen, posts do not yet.')
  nota.run('2026-09-16T16:36:29.384204+00:00', '2026-09-16 D2 OPEN: draft published twice; replies stay paused until fixed.')
  const conto = db.prepare('INSERT INTO follower_log (checked_at, followers, following, tweet_count) VALUES (?,?,?,?)')
  conto.run('2026-09-13T20:00:00+00:00', 141, 62, 110) // l'ultimo conto prima della settimana 38
  conto.run('2026-09-15T20:00:00+00:00', 143, 62, 112)
  conto.run('2026-09-16T20:00:00+00:00', 147, 63, 114)
  db.close()
}

const DB = join(CASA, 'engine.db')
motore(DB)

test('post e note diventano documenti con il link; le bozze si contano e non entrano; i numeri stanno nel riepilogo', () => {
  const e = x.leggi({ db: DB }, ADESSO)
  assert.equal(e.post, 4)
  assert.equal(e.bozze, 2)
  assert.equal(e.note, 2)
  assert.equal(e.settimane, 2)
  const ids = e.docs.map(d => d.id)
  for (const id of ['x:posted:1', 'x:posted:4', 'x:nota:1', 'x:nota:2', 'x:settimana:2026-38', 'x:settimana:2026-37']) {
    assert.ok(ids.includes(id), `manca ${id}`)
  }
  // il post vecchio, quello senza testo, e nessuna bozza: la coda del motore non è un documento
  for (const id of ['x:posted:5', 'x:posted:6', 'x:draft:1', 'x:draft:2', 'x:draft:3', 'x:draft:4', 'x:draft:5']) {
    assert.ok(!ids.includes(id), `${id} non doveva entrare`)
  }
  assert.ok(e.docs.every(d => d.fonte === 'x' && d.gruppo === 'note'))

  const p = e.docs.find(d => d.id === 'x:posted:2')!
  assert.equal(p.tipo, 'post')
  assert.equal(p.titolo, 'Attention belongs where a suggestion becomes your decision.')
  // niente numeri nel corpo: cambiano a ogni giro e farebbero risultare il post «cambiato» dieci volte al giorno
  assert.match(p.corpo, /^Attention belongs where a suggestion becomes your decision\.\n\nPost pubblicato su X\.\nhttps:\/\/x\.com\/tizio\/status\/1002$/)
  assert.doesNotMatch(p.corpo, /Visualizzazioni|Mi piace/)
  assert.equal(p.percorso, 'https://x.com/tizio/status/1002')
  assert.equal(p.quando, '2026-09-16T09:00:00.000Z')
  // l'ha scritto lei (il suo motore): non è una novità arrivata
  assert.equal(p.inviato, true)
  // una risposta si dice, e la data con sei decimali si legge lo stesso
  const r = e.docs.find(d => d.id === 'x:posted:1')!
  assert.equal(r.titolo, 'The MD file is the part that matters.')
  assert.match(r.corpo, /Risposta pubblicata su X\./)
  assert.equal(r.quando, '2026-09-15T14:31:56.222Z')

  const n = e.docs.find(d => d.id === 'x:nota:2')!
  assert.equal(n.tipo, 'nota')
  assert.equal(n.titolo, 'Strategia X: 2026-09-16 D2 OPEN: draft published twice; replies stay paused until fixed.')
  assert.equal(n.corpo, '2026-09-16 D2 OPEN: draft published twice; replies stay paused until fixed.')
  assert.equal(n.quando, '2026-09-16T16:36:29.384Z')
})

test('il riepilogo della settimana conta, misura i follower e mette in fila i tre più visti', () => {
  const e = x.leggi({ db: DB }, ADESSO)
  const s = e.docs.find(d => d.id === 'x:settimana:2026-38')!
  assert.equal(s.tipo, 'riepilogo')
  assert.equal(s.titolo, 'X, settimana 38 del 2026')
  assert.match(s.corpo, /^3 post e 1 risposte pubblicate su X\./)
  assert.match(s.corpo, /Follower: 147 \(\+6 nella settimana\)/)
  assert.match(s.corpo, /I più visti:\n1\. 410 visualizzazioni · Attention belongs[^\n]*status\/1002\n2\. 120 visualizzazioni[^\n]*status\/1003\n3\. 52 visualizzazioni[^\n]*status\/1001$/)
  // la data è l'ultima cosa successa nella settimana, non la domenica che deve ancora venire
  assert.equal(s.quando, '2026-09-16T20:00:00.000Z')

  const prima = e.docs.find(d => d.id === 'x:settimana:2026-37')!
  assert.match(prima.corpo, /^1 post e 0 risposte/)
  // senza un conto prima della settimana, il primo della settimana fa da base
  assert.match(prima.corpo, /Follower: 141 \(\+0 nella settimana\)/)

  assert.equal(x.settimana('2026-09-14T00:00:00Z'), '2026-38')
  assert.equal(x.settimana('2026-09-13T23:59:59Z'), '2026-37')
  // il 2026 comincia di giovedì: ha cinquantatré settimane, e il primo gennaio 2027 è ancora sua
  assert.equal(x.settimana('2027-01-01T00:00:00Z'), '2026-53')
  assert.equal(x.istante('2026-09-15T14:31:56.222663+00:00'), '2026-09-15T14:31:56.222Z')
  assert.equal(x.istante('boh'), null)
})

test('il database si apre in sola lettura, e se manca si dice invece di crearlo', () => {
  const manca = join(CASA, 'non-c-e.db')
  assert.throws(() => x.leggi({ db: manca }), /Non trovo il database di X/)
  assert.ok(!existsSync(manca), 'la lettura ha creato un database')
  // non è un SQLite
  const finto = join(CASA, 'finto.db')
  writeFileSync(finto, 'non è un database')
  assert.throws(() => x.leggi({ db: finto }), /Non riesco a(?:d aprire| leggere) il database di X/)
  // un SQLite senza le tabelle del motore
  const vuoto = join(CASA, 'vuoto.db')
  new DatabaseSync(vuoto).close()
  assert.throws(() => x.leggi({ db: vuoto }), /Non riesco a leggere il database di X/)
  // la strada di casa
  assert.equal(x.percorsoPredefinito(), join(CASA, 'x-engine', 'data', 'engine.db'))
  assert.equal(x.possibile(), false)
})
