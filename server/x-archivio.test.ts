// L'archivio di X: uno zip o una cartella, letti senza eseguire niente e senza
// scompattare, negli stessi documenti del motore.
//
// Quello che si prova: che lo zip e la cartella diano la stessa cosa, che una
// parte rotta si salti e le altre entrino, che un nome con `..` o una voce
// che dichiara gigabyte non passino, che i numeri del motore restino, che lo
// stesso archivio letto due volte non cambi niente, e che il campione della
// voce porti i post più ripresi di sempre, anche quelli fuori dai novanta giorni.
//
//   node --import ./build/test-profile.mjs --test server/x-archivio.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileArchivio, idDel, parte, scriviCartella, tweet, like, zip } from '../prove/archivio-x-finto.ts'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-x-archivio-'))
mkdirSync(join(CASA, '.myynd'), { recursive: true })
writeFileSync(join(CASA, '.myynd', 'config.json'), JSON.stringify({ lingua: 'en' }), { mode: 0o600 })
const CASA_VERA = process.env.HOME
process.env.HOME = CASA
process.env.MYYND_DATI = join(CASA, '.myynd')

const store = await import('./store.ts')
const x = await import('./connettori/x.ts')
const a = await import('./connettori/x-archivio.ts')

after(() => {
  process.env.HOME = CASA_VERA
  rmSync(CASA, { recursive: true, force: true })
})

const GIORNO = 86_400_000
const ADESSO = Date.now()

/** L'archivio di prova: due parti di post buone, una rotta, mi piace, segnalibri, e qualche trappola. */
function archivio() {
  const base = fileArchivio({
    adesso: ADESSO, generatoGiorniFa: 2,
    post: [
      { giorni: 5, testo: 'Shipping beats planning &amp; that is the whole trick https://t.co/abc', mipiace: 7, repost: 1 },
      { giorni: 10, testo: '@someone agreed, the spec is the product.', risposta: true, mipiace: 2 },
      { giorni: 4, testo: 'RT @other: not his words', mipiace: 900, repost: 300 },
      { giorni: 200, testo: 'An old post that went far: agents need a boundary before a prompt.', mipiace: 480, repost: 61 }
    ],
    mipiace: [
      { giorni: 3, testo: 'A post he liked about local models.', autore: 'alice' },
      { giorni: 60, testo: 'Liked long ago.', autore: 'bob' },
      { giorni: 6, n: 1 }
    ]
  })
  // il link accorciato, come lo scrive X
  base['data/tweets.js'] = base['data/tweets.js']!.replace('"entities": {\n        "urls": []\n      }',
    '"entities": {\n        "urls": [{ "url": "https://t.co/abc", "expanded_url": "https://myynd.app/notes" }]\n      }')
  return {
    ...base,
    'data/tweets-part1.js': parte('tweets', 1, [tweet(ADESSO, { giorni: 2, testo: 'Part two of the archive: the newest post.', mipiace: 3, n: 5 })]),
    // rotta: si salta, le altre entrano
    'data/tweets-part2.js': 'window.YTD.tweets.part2 = [ { "tweet": { "id_str": ',
    'data/bookmark.js': parte('bookmark', 0, [{ bookmark: { tweetId: idDel(ADESSO - 8 * GIORNO, 3), fullText: 'Saved for later: a thread on evals.' } }]),
    'data/tweets_media/1-foto.jpg': Buffer.alloc(4096, 1)
  }
}

const IMBROGLIO = idDel(ADESSO - GIORNO, 99)
/** Le trappole che stanno solo nello zip: risalite e assoluti, con un mi piace che non deve entrare. */
const trappole = {
  '../../data/like.js': parte('like', 0, [like(ADESSO, { giorni: 1, n: 99, testo: 'from outside' })]),
  '/etc/data/account.js': parte('account', 0, [{ account: { username: 'intruso' } }])
}

const cartella = join(CASA, 'twitter-2026-10-13-cartella')
scriviCartella(cartella, archivio())
const zipPercorso = join(CASA, 'twitter-2026-10-13-abc.zip')
writeFileSync(zipPercorso, zip({ ...trappole, ...archivio() }))

const ids = () => store.idsConPrefisso('x:').sort()

test('i nomi che servono, e quelli che non passano', () => {
  assert.equal(a.nomeUtile('data/tweets.js'), 'tweets')
  assert.equal(a.nomeUtile('data/tweets-part1.js'), 'tweets-part1')
  assert.equal(a.nomeUtile('twitter-2026/data/like.js'), 'like')
  assert.equal(a.nomeUtile('data/tweets_media/1.jpg'), null)
  assert.equal(a.nomeUtile('../data/like.js'), null)
  assert.equal(a.nomeUtile('../../data/like.js'), null)
  assert.equal(a.nomeUtile('/etc/data/account.js'), null)
  assert.equal(a.nomeUtile('data\\..\\..\\like.js'), null)
  assert.equal(a.nomeUtile('data/direct-messages.js'), null)
})

test('una parte si legge come JSON, mai eseguita', () => {
  assert.deepEqual(a.parte('window.YTD.like.part0 = [{"like":{"tweetId":"1"}}]'), [{ like: { tweetId: '1' } }])
  assert.deepEqual(a.parte('﻿window.YTD.tweets.part3 = [];\n'), [])
  const g = globalThis as { BUCATO?: number }
  assert.throws(() => a.parte('window.YTD.like.part0 = (() => { globalThis.BUCATO = 1; return [] })()'))
  assert.equal(g.BUCATO, undefined)
  assert.throws(() => a.parte('var x = []'))
  assert.throws(() => a.parte('window.YTD.like.part0 = {"non": "elenco"}'))
})

test('i numeri che non si sanno mancano dalla riga, e si rileggono come sconosciuti', () => {
  const pochi = { visualizzazioni: null, mipiace: 12, repost: 3, risposte: null, segnalibri: null }
  assert.equal(x.rigaNumeri(pochi, false), 'Numbers: 12 likes · 3 reposts')
  assert.equal(x.rigaNumeri(pochi, true), 'Numeri: 12 mi piace · 3 repost')
  assert.deepEqual(x.numeriDa(`ciao\n\n${x.rigaNumeri(pochi, false)}`), pochi)
  assert.deepEqual(x.numeriDa(`ciao\n\n${x.rigaNumeri(pochi, true)}`), pochi)
  assert.equal(x.rigaNumeri({ visualizzazioni: null, mipiace: null, repost: null, risposte: null, segnalibri: null }, false), '')
  // la riga intera del motore, scritta prima di questo cambio, si rilegge uguale
  assert.deepEqual(x.numeriDa('a\n\nNumeri: 9 visualizzazioni · 0 mi piace · 0 repost · 0 risposte · 0 segnalibri\n'), { visualizzazioni: 9, mipiace: 0, repost: 0, risposte: 0, segnalibri: 0 })
  const d = x.documentoMio({ postId: '77', testo: 'Only likes known.', url: null, risposta: false, quando: '2026-10-01T10:00:00Z', numeri: pochi }, false)!
  assert.doesNotMatch(d.corpo, /views/)
})

test('le date di X e gli id che portano il giorno', () => {
  assert.equal(a.dataX('Wed Sep 18 14:02:11 +0000 2024'), '2024-09-18T14:02:11.000Z')
  assert.equal(a.dataX('Thu Oct 01 08:00:00 +0200 2026'), '2026-10-01T06:00:00.000Z')
  const ms = Date.parse('2026-10-01T12:00:00Z')
  assert.equal(a.nascitaDaId(idDel(ms)), new Date(ms).toISOString())
  assert.equal(a.nascitaDaId('12345'), null)
})

test('lo zip e la cartella danno la stessa cosa, la parte rotta si salta e le trappole restano fuori', async () => {
  const z = await a.leggiArchivio(zipPercorso)
  const c = await a.leggiArchivio(cartella)
  assert.equal(a.impronta(z), a.impronta(c))
  assert.deepEqual([...z.file.keys()].sort(), ['account', 'bookmark', 'like', 'manifest', 'tweets', 'tweets-part1', 'tweets-part2'])
  const dentro = a.interpreta(z)
  assert.deepEqual(dentro.guasti, ['tweets-part2'])
  assert.equal(dentro.maniglia, 'tobia')
  // il repost non è suo
  assert.equal(dentro.post.length, 4)
  assert.ok(!dentro.post.some(p => p.testo.startsWith('RT @')))
  assert.ok(!dentro.mipiace.some(l => l.postId === IMBROGLIO))
  assert.match(dentro.post.find(p => p.mipiace === 7)!.testo, /Shipping beats planning & that is the whole trick https:\/\/myynd\.app\/notes/)
  assert.ok(dentro.generato && Date.parse(dentro.generato) < ADESSO)
  await assert.rejects(a.leggiArchivio(join(CASA, 'non-c-e.zip')), /Non trovo questo archivio/)
})

test('una voce che dichiara più del tetto non si gonfia, e uno zip qualunque non è un archivio', async () => {
  const f = join(CASA, 'grosso.zip')
  writeFileSync(f, zip(archivio(), { dichiarata: { 'data/like.js': a.TETTO_VOCE + 1 } }))
  const l = await a.leggiArchivio(f)
  assert.ok(l.illeggibili.includes('like'))
  assert.ok(!l.file.has('like'))
  assert.ok(l.file.has('tweets'))
  // senza comprimere, e non è di X
  const altro = join(CASA, 'foto.zip')
  writeFileSync(altro, zip({ 'vacanze/1.txt': 'ciao' }, { ferma: true }))
  assert.equal(a.eArchivio(await a.leggiArchivio(altro)), false)
  await assert.rejects(a.importa(altro), /non sembra un archivio di X/)
  writeFileSync(join(CASA, 'rotto.zip'), 'non sono uno zip')
  await assert.rejects(a.leggiArchivio(join(CASA, 'rotto.zip')), /Non riesco a leggere/)
  // i post di X ma senza il manifesto di X: non è un archivio
  const senza: Record<string, string | Buffer> = { ...archivio() }
  delete senza['data/manifest.js']
  writeFileSync(join(CASA, 'senza-manifesto.zip'), zip(senza))
  assert.equal(a.eArchivio(await a.leggiArchivio(join(CASA, 'senza-manifesto.zip'))), false)
  await assert.rejects(a.importa(join(CASA, 'senza-manifesto.zip')), /non sembra un archivio di X/)
})

test('un tetto per tutto l’archivio e uno per le parti: il resto si salta, quello che sta sotto entra', async () => {
  // tre voci da 250 MB dichiarati: le prime due stanno nei 600, la terza no
  const MB = 1024 * 1024
  const f = join(CASA, 'tre-grosse.zip')
  writeFileSync(f, zip(archivio(), { dichiarata: { 'data/account.js': 250 * MB, 'data/tweets.js': 250 * MB, 'data/like.js': 250 * MB } }))
  const l = await a.leggiArchivio(f)
  assert.ok(l.file.has('account') && l.file.has('tweets'))
  assert.ok(l.illeggibili.includes('like'))
  assert.ok(!l.file.has('like'))
  // le parti oltre il massimo, nella cartella e nello zip
  const oltre = `tweets-part${a.PARTI_MAX}`
  const tante = join(CASA, 'tante-parti')
  scriviCartella(tante, { ...archivio(), [`data/${oltre}.js`]: parte('tweets', a.PARTI_MAX, [tweet(ADESSO, { giorni: 1, testo: 'Too far down the parts.', n: 77 })]) })
  const lc = await a.leggiArchivio(tante)
  assert.ok(lc.illeggibili.includes(oltre))
  assert.ok(!a.interpreta(lc).post.some(p => p.testo === 'Too far down the parts.'))
  writeFileSync(join(CASA, 'tante.zip'), zip({ ...archivio(), [`data/${oltre}.js`]: parte('tweets', a.PARTI_MAX, []) }))
  assert.ok((await a.leggiArchivio(join(CASA, 'tante.zip'))).illeggibili.includes(oltre))
})

test('importa: gli stessi documenti del motore, uniti a quelli che c’erano', async () => {
  // il motore ha già scritto uno di questi post, con le visualizzazioni, e un mi piace senza testo con la sua data vera
  const z = a.interpreta(await a.leggiArchivio(zipPercorso))
  const suo = z.post.find(p => p.mipiace === 7)!
  const delMotore = x.documentoMio({ postId: suo.postId, testo: suo.testo, url: `https://x.com/tobia/status/${suo.postId}`, risposta: false, quando: suo.quando,
    numeri: { visualizzazioni: 512, mipiace: 4, repost: 1, risposte: 2, segnalibri: 0 } })!
  const piaciuto = z.mipiace.find(l => l.testo?.includes('local models'))!
  const quandoVero = new Date(ADESSO - 2 * GIORNO).toISOString()
  const likeDelMotore = x.documentoLike({ postId: piaciuto.postId, autore: 'alice', testo: null, url: null, quando: quandoVero })!
  store.salvaDocumenti([delMotore, likeDelMotore])

  const e = await a.importa(zipPercorso, { adesso: ADESSO })
  assert.equal(e.gia, false)
  assert.equal(e.stato.post, 4)
  assert.deepEqual(e.guasti, ['tweets-part2'])

  // i post dentro i novanta giorni, non il vecchio né il repost
  const mio = store.idsConPrefisso('x:mio:')
  assert.equal(mio.length, 3)
  const vecchio = z.post.find(p => p.mipiace === 480)!
  assert.ok(!mio.includes(`x:mio:${vecchio.postId}`))

  // i numeri: il più alto di ognuno, le visualizzazioni del motore restano
  const unito = store.documento(`x:mio:${suo.postId}`)!
  assert.deepEqual(x.numeriDa(unito.corpo), { visualizzazioni: 512, mipiace: 7, repost: 1, risposte: 2, segnalibri: 0 })
  assert.ok(unito.inviato)
  // un post che il motore non ha visto: quello che l'archivio non sa manca, non è uno zero
  const soloArchivio = store.documento(`x:mio:${z.post.find(p => p.testo.startsWith('Part two'))!.postId}`)!
  assert.deepEqual(x.numeriDa(soloArchivio.corpo), { visualizzazioni: null, mipiace: 3, repost: 0, risposte: null, segnalibri: null })
  assert.match(soloArchivio.corpo, /\nNumbers: 3 likes · 0 reposts\n/)
  assert.doesNotMatch(soloArchivio.corpo, /views|replies|bookmarks/)
  const risposta = store.documento(`x:mio:${z.post.find(p => p.risposta)!.postId}`)!
  assert.equal(risposta.tipo, 'risposta')
  assert.equal(risposta.percorso, `https://x.com/tobia/status/${z.post.find(p => p.risposta)!.postId}`)

  // i mi piace: il testo arriva, la data vera del motore resta; quello di due mesi fa no; quello senza testo sì
  const l = store.documento(`x:like:${piaciuto.postId}`)!
  assert.equal(l.quando, quandoVero)
  assert.match(l.corpo, /local models/)
  assert.equal(store.idsConPrefisso('x:like:').length, 2)
  assert.equal(store.documento(`x:like:${IMBROGLIO}`), null)

  // il segnalibro e la voce
  assert.equal(store.idsConPrefisso('x:segnalibro:').length, 1)
  assert.match(store.documento(store.idsConPrefisso('x:segnalibro:')[0]!)!.corpo, /You saved a post/)
  assert.deepEqual(store.idsConPrefisso('x:voce:'), ['x:voce:1'])
  const voce = a.campioneVoce()
  assert.equal(voce.length, 4)
  assert.equal(voce[0], 'An old post that went far: agents need a boundary before a prompt.')
  assert.ok(!voce.some(t => t.startsWith('RT @')))

  // lo stato: fresco, da dire
  const s = a.stato()!
  assert.equal(s.detto, false)
  assert.equal(a.fresco(s, ADESSO), true)
  assert.equal(a.fresco(s, ADESSO + 40 * GIORNO), false)
})

test('lo stesso archivio, una seconda volta: niente cambia, e anche dalla cartella', async () => {
  const prima = ids().map(id => store.documento(id))
  a.segnaDetto()
  const e = await a.importa(zipPercorso, { adesso: ADESSO })
  assert.equal(e.gia, true)
  assert.deepEqual(ids().map(id => store.documento(id)), prima)
  // già detto: una seconda lettura non lo ridice
  assert.equal(a.stato()!.detto, true)
  const c = await a.importa(cartella, { adesso: ADESSO })
  assert.equal(c.gia, true)
  assert.deepEqual(ids().map(id => store.documento(id)), prima)
})

test('la riconciliazione del motore non toglie quello che l’archivio ha messo', () => {
  x.riconcilia([], ADESSO)
  assert.equal(store.idsConPrefisso('x:mio:').length, 3)
  assert.deepEqual(store.idsConPrefisso('x:voce:'), ['x:voce:1'])
  assert.equal(store.idsConPrefisso('x:segnalibro:').length, 1)
})

test('i download: entra solo uno zip col nome di X, fermo per due giri, nuovo, dello stesso account, e una volta sola', async () => {
  const scaricati = join(CASA, 'Downloads')
  mkdirSync(scaricati, { recursive: true })
  const vecchio = Date.now() / 1000 - 3600
  const metti = (nome: string, contenuto: Buffer, piu: number) => {
    const f = join(scaricati, nome)
    writeFileSync(f, contenuto)
    utimesSync(f, vecchio + piu, vecchio + piu)
    return f
  }
  const giro = () => a.guardaDownload({ cartella: scaricati })
  // il nome non è quello che dà X: non si guarda nemmeno
  metti('twitter-archive.zip', zip(fileArchivio({ adesso: ADESSO, generatoGiorniFa: 0, post: [{ giorni: 1, testo: 'Wrong name.', n: 11 }] })), 0)
  assert.equal(await giro(), null)
  assert.equal(await giro(), null)

  // lo stesso archivio di prima, con un altro nome: già visto
  metti('twitter-2026-10-13-copia.zip', zip(archivio()), 1)
  assert.equal(await giro(), null)
  assert.equal(await giro(), null)

  // uno nuovo: il primo giro lo guarda; cambiato intanto, aspetta ancora; uguale al giro dopo, entra
  const nuovo = metti('twitter-2026-10-15-nuovo.zip', zip(fileArchivio({ adesso: ADESSO, generatoGiorniFa: 0, post: [{ giorni: 1, testo: 'Half written', n: 8 }] })), 10)
  assert.equal(await giro(), null)
  metti('twitter-2026-10-15-nuovo.zip', zip(fileArchivio({ adesso: ADESSO, generatoGiorniFa: 0, post: [{ giorni: 1, testo: 'Fresh from the newest archive.', mipiace: 1, n: 8 }] })), 11)
  assert.equal(await giro(), null)
  const e = await giro()
  assert.ok(e)
  assert.equal(e.stato.nome, 'twitter-2026-10-15-nuovo.zip')
  assert.equal(e.stato.detto, false)
  assert.ok(store.idsConPrefisso('x:mio:').length >= 4)
  // e una volta sola
  assert.equal(await giro(), null)
  assert.equal(await giro(), null)

  // uno più vecchio per data dell'archivio non lo rimpiazza
  metti('twitter-2026-08-01-antico.zip', zip(fileArchivio({ adesso: ADESSO, generatoGiorniFa: 70, post: [{ giorni: 70, testo: 'From an old archive.', n: 9 }] })), 20)
  assert.equal(await giro(), null)
  assert.equal(await giro(), null)
  assert.equal(a.stato()!.nome, 'twitter-2026-10-15-nuovo.zip')
  // e uno zip più vecchio, su disco, dell'ultimo guardato non si riapre più
  metti('twitter-2026-10-16-ritardo.zip', zip(fileArchivio({ adesso: ADESSO, generatoGiorniFa: 0, post: [{ giorni: 0, testo: 'Late but older on disk.', n: 12 }] })), 5)
  assert.equal(await giro(), null)
  assert.equal(await giro(), null)
  assert.equal(a.stato()!.nome, 'twitter-2026-10-15-nuovo.zip')

  // col nome di X ma senza il manifesto: niente, e nessun errore
  const senza: Record<string, string | Buffer> = fileArchivio({ adesso: ADESSO, generatoGiorniFa: 0, post: [{ giorni: 0, testo: 'No manifest here.', n: 13 }] })
  delete senza['data/manifest.js']
  metti('x-2026-10-15-foto.zip', zip(senza), 30)
  assert.equal(await giro(), null)
  assert.equal(await giro(), null)
  assert.equal(a.stato()!.nome, 'twitter-2026-10-15-nuovo.zip')

  // un altro account: non entra da solo, e la scheda lo chiede
  const altro = metti('twitter-2026-10-15-altro.zip', zip(fileArchivio({ adesso: ADESSO, generatoGiorniFa: 0, maniglia: 'qualcunaltro', post: [{ giorni: 0, testo: 'Someone else.', n: 14 }] })), 40)
  assert.equal(await giro(), null)
  assert.equal(await giro(), null)
  assert.deepEqual(a.altroAccount(), { nome: 'twitter-2026-10-15-altro.zip', maniglia: 'qualcunaltro' })
  assert.equal(a.stato()!.maniglia, 'tobia')
  // scelto a mano entra, e la domanda si chiude
  await a.importa(altro, { adesso: ADESSO })
  assert.equal(a.altroAccount(), null)
  assert.equal(a.stato()!.maniglia, 'qualcunaltro')
  // si torna al suo, per le prove che seguono
  await a.importa(nuovo, { adesso: ADESSO })
  assert.equal(a.stato()!.maniglia, 'tobia')

  // una cartella che non c'è
  assert.equal(await a.guardaDownload({ cartella: join(CASA, 'nessuna') }), null)
})

test('i download li guarda solo il proprietario del Mac, e solo con X già acceso', () => {
  const base = { ospitato: false, utente: 'u1', cartella: '/r', radice: '/r', motore: true, archivio: false }
  assert.equal(a.guardaPer(base), true)
  assert.equal(a.guardaPer({ ...base, motore: false, archivio: true }), true)
  // il Mac collegato non basta: senza X niente
  assert.equal(a.guardaPer({ ...base, motore: false, archivio: false }), false)
  // un altro conto con una sessione aperta su questo Mac
  assert.equal(a.guardaPer({ ...base, utente: 'u2', cartella: '/r/utenti/u2' }), false)
  // in casa senza conti è lui
  assert.equal(a.guardaPer({ ...base, utente: null, cartella: null }), true)
  assert.equal(a.guardaPer({ ...base, ospitato: true }), false)
})

test('il campione della voce si rifà col nuovo archivio, e scollegando si scorda l’archivio ma non i visti', async () => {
  // l'archivio nuovo ha un post solo: il campione è quello, il segnalibro di prima se ne va
  assert.deepEqual(a.campioneVoce(), ['Fresh from the newest archive.'])
  assert.equal(store.idsConPrefisso('x:segnalibro:').length, 0)
  a.scorda()
  assert.equal(a.stato(), null)
  // lo zip di prima è ancora fra i visti: i download non lo riportano dentro
  assert.equal(await a.guardaDownload({ cartella: join(CASA, 'Downloads') }), null)
})
