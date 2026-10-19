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
  for (const id of ['x:mio:1001', 'x:mio:1004', 'x:nota:1', 'x:nota:2', 'x:settimana:2026-38', 'x:settimana:2026-37']) {
    assert.ok(ids.includes(id), `manca ${id}`)
  }
  // il post vecchio, quello senza testo, e nessuna bozza: la coda del motore non è un documento
  for (const id of ['x:mio:900', 'x:mio:1005', 'x:posted:2', 'x:draft:1', 'x:draft:2', 'x:draft:3', 'x:draft:4', 'x:draft:5']) {
    assert.ok(!ids.includes(id), `${id} non doveva entrare`)
  }
  assert.ok(e.docs.every(d => d.fonte === 'x' && d.gruppo === 'note'))

  const p = e.docs.find(d => d.id === 'x:mio:1002')!
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
  const r = e.docs.find(d => d.id === 'x:mio:1001')!
  assert.equal(r.tipo, 'risposta')
  assert.equal(r.titolo, 'The MD file is the part that matters.')
  assert.match(r.corpo, /Risposta pubblicata su X\./)
  assert.equal(r.quando, '2026-09-15T14:31:56.222Z')

  const n = e.docs.find(d => d.id === 'x:nota:2')!
  assert.equal(n.tipo, 'nota')
  assert.equal(n.titolo, 'Strategia X: 2026-09-16 D2 OPEN: draft published twice; replies stay paused until fixed.')
  assert.equal(n.corpo, '2026-09-16 D2 OPEN: draft published twice; replies stay paused until fixed.')
  assert.equal(n.quando, '2026-09-16T16:36:29.384Z')
})

test('il riepilogo della settimana conta, misura i follower e mette in fila i tre più visti; la settimana in corso conta e basta', () => {
  // giovedì 17: la settimana 38 è ancora aperta, i numeri cambiano di ora in ora e non entrano
  const aperta = x.leggi({ db: DB }, ADESSO).docs.find(d => d.id === 'x:settimana:2026-38')!
  assert.match(aperta.corpo, /^3 post e 1 risposte pubblicate su X\.\n\nSettimana in corso/)
  assert.doesNotMatch(aperta.corpo, /Follower|I più visti/)
  // il martedì dopo, chiusa: tutto
  const e = x.leggi({ db: DB }, Date.parse('2026-09-22T12:00:00Z'))
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

test('i numeri di un post entrano quando si sono fermati, e si rileggono in tutte e due le lingue', () => {
  const e = x.leggi({ db: DB }, ADESSO)
  // l'8 settembre, nove giorni prima: il motore non lo rilegge più
  const vecchio = e.docs.find(d => d.id === 'x:mio:1004')!
  assert.match(vecchio.corpo, /\nNumeri: 9 visualizzazioni · 0 mi piace · 0 repost · 0 risposte · 0 segnalibri\n/)
  assert.deepEqual(x.numeriDa(vecchio.corpo), { visualizzazioni: 9, mipiace: 0, repost: 0, risposte: 0, segnalibri: 0 })
  assert.equal(x.numeriDa(e.docs.find(d => d.id === 'x:mio:1002')!.corpo), null)
  const n = { visualizzazioni: 410, mipiace: 3, repost: 1, risposte: 2, segnalibri: 5 }
  assert.deepEqual(x.numeriDa(`ciao\n\n${x.rigaNumeri(n, false)}`), n)
  assert.deepEqual(x.numeriDa(`ciao\n\n${x.rigaNumeri(n, true)}`), n)
  // la data di SQLite, senza fuso, è UTC
  assert.equal(x.istante('2026-09-15 17:29:52'), '2026-09-15T17:29:52.000Z')
  assert.equal(x.idPost('browser:12'), null)
  assert.equal(x.idDaLink('https://x.com/bob/status/503?s=20'), '503')
})

/** Un motore più nuovo: i mi piace, l'impegno, la timeline e i post studiati. */
function motorePieno(percorso: string) {
  motore(percorso)
  const db = new DatabaseSync(percorso)
  db.exec(`
    CREATE TABLE likes (tweet_id text primary key, liked_at text, why text);
    CREATE TABLE engagement (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, kind TEXT NOT NULL, url TEXT NOT NULL, author TEXT, UNIQUE(kind, url));
    CREATE TABLE feed_posts (id integer primary key, seen_at text not null, author text, tweet_id text unique, body text,
      replies integer default 0, reposts integer default 0, likes integer default 0, bookmarks integer default 0, views integer default 0);
    CREATE TABLE scraped (id INTEGER PRIMARY KEY AUTOINCREMENT, scraped_at TEXT NOT NULL, niche TEXT NOT NULL, url TEXT UNIQUE, author TEXT, text TEXT);
  `)
  const visto = db.prepare('INSERT INTO feed_posts (seen_at, author, tweet_id, body, replies, reposts, likes, views) VALUES (?,?,?,?,?,?,?,?)')
  visto.run('2026-09-05T10:00:00.123456+00:00', 'vecchio', '400', 'Too old for the digest.', 0, 0, 0, 0)
  visto.run('2026-09-19T08:00:00.123456+00:00', 'alice', '501', 'Agents need a boundary before they need a prompt.', 4, 1, 80, 9000)
  visto.run('2026-09-19T09:00:00+00:00', 'alice', '504', 'Second post by alice that day.', 0, 0, 2, 100)
  visto.run('2026-09-19T21:00:00+00:00', 'carol', '505', 'Carol talks about launch week.', 30, 10, 500, 40000)
  visto.run('2026-09-20T10:00:00+00:00', 'dave', '506', 'Dave on Sunday.', 0, 0, 1, 10)
  // oggi: il giorno non è chiuso, non entra
  visto.run('2026-09-21T09:00:00+00:00', 'erin', '507', 'Erin this morning.', 0, 0, 1, 10)
  const like = db.prepare('INSERT INTO likes (tweet_id, liked_at, why) VALUES (?,?,?)')
  like.run('501', '2026-09-20T15:56:18.151762+00:00', 'inbound @alice')
  like.run('502', '2026-08-01T10:00:00+00:00', 'pre-reply @zed') // più di trenta giorni prima
  like.run('browser:9', '2026-09-20T10:00:00+00:00', 'inbound @nessuno') // non è un id di X
  db.prepare('INSERT INTO engagement (at, kind, url, author) VALUES (?,?,?,?)').run('2026-09-19 10:00:00', 'like', 'https://x.com/bob/status/503', 'bob')
  db.prepare('INSERT INTO engagement (at, kind, url, author) VALUES (?,?,?,?)').run('2026-09-19 11:00:00', 'repost', 'https://x.com/bob/status/508', 'bob')
  db.prepare('INSERT INTO scraped (scraped_at, niche, url, author, text) VALUES (?,?,?,?,?)').run('2026-09-18T18:00:00+00:00', 'tech_ai', 'https://x.com/bob/status/503', 'bob', 'Shipping agents that ask before they act.')
  db.close()
}

const PIENO = join(CASA, 'pieno.db')
motorePieno(PIENO)
/** Lunedì 21 settembre: il 19 e il 20 sono chiusi, il 21 no. */
const LUNEDI = Date.parse('2026-09-21T12:00:00Z')

test('i mi piace diventano documenti con l’id del post e il testo se qualcuno l’ha visto; la timeline è un documento per giorno chiuso', () => {
  const e = x.leggi({ db: PIENO }, LUNEDI)
  assert.equal(e.mipiace, 2)
  assert.equal(e.timeline, 2)
  assert.equal(e.fermoDal, null)
  const ids = e.docs.map(d => d.id)
  for (const id of ['x:like:501', 'x:like:503', 'x:timeline:2026-09-19', 'x:timeline:2026-09-20']) assert.ok(ids.includes(id), `manca ${id}`)
  for (const id of ['x:like:502', 'x:like:508', 'x:timeline:2026-09-21', 'x:timeline:2026-09-05']) assert.ok(!ids.includes(id), `${id} non doveva entrare`)
  assert.ok(!ids.some(id => id.startsWith('x:like:browser')))

  const a = e.docs.find(d => d.id === 'x:like:501')!
  assert.equal(a.tipo, 'mipiace')
  assert.equal(a.titolo, '@alice: Agents need a boundary before they need a prompt.')
  assert.equal(a.autore, '@alice')
  assert.equal(a.percorso, 'https://x.com/alice/status/501')
  assert.equal(a.inviato, true)
  assert.match(a.corpo, /^Agents need a boundary before they need a prompt\.\n\nTi è piaciuto un post di @alice su X\.\nhttps:\/\/x\.com\/alice\/status\/501$/)
  // dal giro di impegno, con il testo dei post studiati e la data di SQLite
  const b = e.docs.find(d => d.id === 'x:like:503')!
  assert.match(b.corpo, /^Shipping agents that ask before they act\./)
  assert.equal(b.quando, '2026-09-19T10:00:00.000Z')

  const g = e.docs.find(d => d.id === 'x:timeline:2026-09-19')!
  assert.equal(g.tipo, 'riepilogo')
  assert.equal(g.titolo, 'X, la tua timeline del 19 set')
  assert.equal(g.inviato, true)
  assert.match(g.corpo, /^3 post visti nella tua timeline, da 2 autori\./)
  assert.match(g.corpo, /Chi è comparso di più: @alice \(2\), @carol \(1\)/)
  // il più ripreso per primo, con il link
  assert.match(g.corpo, /I più ripresi:\n1\. @carol · 500 mi piace · 30 risposte · Carol talks about launch week\. · https:\/\/x\.com\/carol\/status\/505\n2\. @alice/)
  assert.equal(g.quando, '2026-09-19T21:00:00.000Z')
})

test('un motore che non scrive niente da più di tre giorni è fermo, e lo dice con un guaio da guardare', () => {
  const e = x.leggi({ db: PIENO }, Date.parse('2026-10-15T12:00:00Z'))
  // l'ultima cosa vera: il post visto il 21 mattina
  assert.equal(e.fermoDal, '2026-09-21T09:00:00.000Z')
  const g = x.guaioFermo()
  assert.equal(g.rimedio, 'guarda')
  assert.match(g.message, /non scrive niente di nuovo/)
  // tre giorni dopo l'ultima cosa: ancora vivo
  assert.equal(x.leggi({ db: PIENO }, Date.parse('2026-09-24T08:00:00Z')).fermoDal, null)
})

test('la riconciliazione toglie quello che solo il motore scrive e lascia stare quello che un altro lettore può aver scritto; recenti legge l’indice', async () => {
  const store = await import('./store.ts')
  const e = x.leggi({ db: PIENO }, LUNEDI)
  store.salvaDocumenti([
    ...e.docs,
    // una versione vecchia, con l'id della riga del motore
    { id: 'x:posted:2', fonte: 'x', tipo: 'post', titolo: 'vecchio', corpo: 'vecchio', quando: '2026-09-16T09:00:00.000Z', gruppo: 'note', inviato: true },
    // un post scritto da un altro lettore, nella finestra
    x.documentoMio({ postId: '999', testo: 'Written by hand, read by the browser.', url: 'https://x.com/tobiadonadon_/status/999', risposta: false, quando: '2026-09-20T08:00:00Z', numeri: null }, false)!,
    // un mi piace uscito dalla finestra
    x.documentoLike({ postId: '300', autore: 'old', testo: 'old', url: null, quando: '2026-07-01T00:00:00Z' }, false)!
  ])
  const tolti = x.riconcilia(e.docs.map(d => d.id), LUNEDI)
  assert.equal(tolti, 2)
  assert.equal(store.documento('x:posted:2'), null)
  assert.equal(store.documento('x:like:300'), null)
  assert.ok(store.documento('x:mio:999'))
  assert.ok(store.documento('x:like:501'))

  const r = x.recenti(30, LUNEDI)
  assert.deepEqual(r.post.map(p => p.postId), ['999', '1003', '1002', '1001', '1004'])
  assert.equal(r.post[0]!.testo, 'Written by hand, read by the browser.')
  const vecchio = r.post.find(p => p.postId === '1004')!
  assert.equal(vecchio.testo, 'A post from the week before.')
  assert.deepEqual(vecchio.numeri, { visualizzazioni: 9, mipiace: 0, repost: 0, risposte: 0, segnalibri: 0 })
  assert.equal(r.post.find(p => p.postId === '1001')!.risposta, true)
  assert.equal(r.mipiace, 2)
  assert.deepEqual(r.autori, [{ autore: '@alice', n: 1 }, { autore: '@bob', n: 1 }])
  // «agents» torna in tutti e due i post piaciuti; le parole vuote no
  assert.deepEqual(r.parole, [{ parola: 'agents', n: 2 }])
  // una finestra corta lascia fuori il post dell'8 settembre
  assert.ok(!x.recenti(7, LUNEDI).post.some(p => p.postId === '1004'))
})

test('il tetto dei mi piace vale anche nell’indice: oltre duecento escono i più vecchi, da chiunque scritti', async () => {
  const store = await import('./store.ts')
  const tanti = Array.from({ length: x.TETTO_MIPIACE + 5 }, (_, i) =>
    x.documentoLike({ postId: String(7000 + i), autore: 'molti', testo: `post ${i}`, url: null, quando: new Date(LUNEDI - (i + 1) * 3_600_000).toISOString() }, false)!)
  store.salvaDocumenti(tanti)
  const prima = store.idsConPrefisso('x:like:').length
  assert.ok(prima > x.TETTO_MIPIACE)
  x.riconcilia([], LUNEDI)
  const restano = new Set(store.idsConPrefisso('x:like:'))
  assert.equal(restano.size, x.TETTO_MIPIACE)
  // i più nuovi restano, i più vecchi no
  assert.ok(restano.has('x:like:7000'))
  assert.ok(!restano.has(`x:like:${7000 + x.TETTO_MIPIACE + 4}`))
})

test('un motore fermo si dice senza lanciare, e un altro guaio cancella il «fermo dal…» (la lettura in index.ts)', async () => {
  const { readFileSync } = await import('node:fs')
  const indice = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
  const passo = indice.slice(indice.indexOf("await fonte('x'"), indice.indexOf("const cal = c.calendario"))
  // i documenti sono arrivati: niente throw, quindi niente prima lettura fallita e il totale li conta
  assert.doesNotMatch(passo, /throw motore\.guaioFermo/)
  assert.match(passo, /stato: 'guaio', fermo: true/)
  // il database sparito o illeggibile non è «fermo dal 20 set»
  assert.match(passo, /catch \(err\) \{[^}]*segnaCursore\(motore\.CURSORE_FERMO, null\)[^}]*throw err/)
  const { esitoLettura } = await import('./lettura-feed.ts')
  const e = esitoLettura({ fase: 'x', stato: 'guaio', fermo: true, rimedio: 'guarda', frase: x.guaioFermo().message, documenti: 3 })
  assert.equal(e?.esito, 'guaio', 'la salute delle fonti lo registra come ogni guaio')
  assert.equal(e?.rimedio, 'guarda')
  // la frase del perché si ricorda per la scheda, e un altro guaio la cancella con la data
  assert.match(passo, /segnaCursore\(motore\.CURSORE_PERCHE, g \? g\.message : null\)/)
  assert.match(passo, /catch \(err\) \{[^}]*segnaCursore\(motore\.CURSORE_PERCHE, null\)[^}]*throw err/)
})

/**
 * Tobia il 19 ottobre: «can we give the possibility for myynd to read X?».
 * Il motore tiene chi gli scrive in `data/mentions.json`, accanto al database,
 * e i suoi giri nella tabella `runs`: il primo diventa documenti, il secondo
 * dice perché il motore è fermo e cosa fare.
 */
function conGiri(cartella: string, giri: [string, string, number, string][]) {
  mkdirSync(cartella, { recursive: true })
  const percorso = join(cartella, 'engine.db')
  motorePieno(percorso)
  const db = new DatabaseSync(percorso)
  db.exec('CREATE TABLE runs (id integer primary key autoincrement, job text not null, started_at text not null, finished_at text, ok integer, note text, items integer default 0)')
  const giro = db.prepare('INSERT INTO runs (job, started_at, ok, note) VALUES (?,?,?,?)')
  for (const g of giri) giro.run(...g)
  db.close()
  return percorso
}

const OTTOBRE = Date.parse('2026-10-15T12:00:00Z')

test('le menzioni del file del motore diventano documenti di altri, mai «inviato», e vecchie non sono una novità', async () => {
  const dove = join(CASA, 'menzioni')
  const db = conGiri(dove, [])
  writeFileSync(join(dove, 'mentions.json'), JSON.stringify({
    observed_at: '2026-10-14T08:00:00+00:00', scope: 'visible public mentions',
    items: [
      { id: '2101363755636666378', handle: '@alice', text: 'Great point on agents.\nMore below.', url: 'https://x.com/alice/status/2101363755636666378', created_at: '2026-10-14T07:00:00.000Z' },
      { id: '2101327587628691936', handle: 'bob', text: 'Old reply from September.', url: null, created_at: '2026-09-19T15:08:32.000Z' },
      // fuori dai novanta giorni, senza testo, senza id: non entrano
      { id: '1', handle: 'zed', text: 'Way too old.', url: null, created_at: '2026-05-01T00:00:00.000Z' },
      { id: '2', handle: 'zed', text: '', url: null, created_at: '2026-10-14T00:00:00.000Z' },
      { handle: 'zed', text: 'No id at all.', created_at: '2026-10-14T00:00:00.000Z' }
    ]
  }))
  const e = x.leggi({ db }, OTTOBRE)
  assert.equal(e.menzioni, 2)
  const a = e.docs.find(d => d.id === 'x:menzione:2101363755636666378')!
  assert.equal(a.tipo, 'menzione')
  assert.equal(a.titolo, '@alice: Great point on agents.')
  assert.equal(a.autore, '@alice')
  assert.equal(a.percorso, 'https://x.com/alice/status/2101363755636666378')
  assert.match(a.corpo, /^Great point on agents\.\nMore below\.\n\n@alice ti ha menzionato su X\.\nhttps:\/\/x\.com\/alice\/status\/2101363755636666378$/)
  // scritta da altri: niente la marca come sua
  assert.ok(!a.inviato)
  const b = e.docs.find(d => d.id === 'x:menzione:2101327587628691936')!
  assert.equal(b.percorso, 'https://x.com/bob/status/2101327587628691936')
  assert.ok(!b.inviato)
  // di un mese fa: entra nell'indice, ma la rilevanza la tiene fuori per data, non per «inviato»
  const { classificaAttenzione } = await import('./rilevanza.ts')
  assert.equal(classificaAttenzione(b, { adesso: OTTOBRE }).motivo, 'fonte_non_recente')
  assert.equal(classificaAttenzione(a, { adesso: OTTOBRE }).destinazione, 'brief')
  assert.ok(!e.docs.some(d => d.id === 'x:menzione:1' || d.id === 'x:menzione:2'))
  // un file rotto, o un motore senza file, non è un guaio
  assert.deepEqual(x.menzioniDa('non è json'), [])
  assert.deepEqual(x.menzioniDa('{"items": "no"}'), [])
  assert.equal(x.leggi({ db: PIENO }, OTTOBRE).menzioni, 0)
})

test('il motore fermo dice perché: spento, o acceso con il browser che non legge più X', () => {
  // acceso: giri ogni dieci minuti, ma il lettore fallisce da settimane
  const acceso = conGiri(join(CASA, 'acceso'), [
    ['feedread', '2026-09-20T01:20:53+00:00', 1, 'read 40'],
    ['poster', '2026-10-15T11:50:00+00:00', 1, 'nothing approved'],
    ['feedread', '2026-10-15T11:20:00+00:00', 0, 'Browser process failed (1)']
  ])
  const e = x.leggi({ db: acceso }, OTTOBRE)
  assert.ok(e.fermoDal)
  assert.equal(e.perche, 'lettore')
  assert.match(x.guaioFermo(false, e.perche).message, /gira, ma il suo browser non legge più X\. Sistemalo in x-engine, o importa il tuo archivio di X\./)
  // spento: l'ultimo giro è di dieci giorni fa
  const spento = conGiri(join(CASA, 'spento'), [['poster', '2026-10-05T10:00:00+00:00', 1, 'nothing approved']])
  const s = x.leggi({ db: spento }, OTTOBRE)
  assert.equal(s.perche, 'spento')
  assert.match(x.guaioFermo(false, s.perche).message, /è spento\. Riaccendilo, o importa il tuo archivio di X\./)
  // senza la tabella dei giri non si sa: la frase di sempre
  assert.equal(x.leggi({ db: PIENO }, OTTOBRE).perche, null)
  assert.match(x.guaioFermo(false, null).message, /non scrive niente di nuovo/)
  // con l'archivio è l'archivio a essere vecchio, qualunque sia il motore
  assert.match(x.guaioFermo(true, 'lettore').message, /archivio di X ha più di un mese/)
  // vivo, niente perché
  assert.equal(x.leggi({ db: acceso }, Date.parse('2026-09-21T12:00:00Z')).perche, null)
  // un giro del lettore ancora in corso (`ok` vuoto) non è un lettore rotto
  const inCorso = conGiri(join(CASA, 'in-corso'), [
    ['poster', '2026-10-15T11:50:00+00:00', 1, 'nothing approved'],
    ['feedread', '2026-10-15T11:55:00+00:00', null as unknown as number, '']
  ])
  assert.equal(x.leggi({ db: inCorso }, OTTOBRE).perche, null)
})
