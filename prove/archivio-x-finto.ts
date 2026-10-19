// Un archivio di X finto, per le prove e per le scene: i file come li scrive X
// (`window.YTD.<nome>.part0 = [...]`), in una cartella o in uno zip.
//
// Lo zip si scrive qui, a mano, con zlib: serve anche quello che uno zip vero
// non dovrebbe avere (un nome con `..`, una voce che dichiara più di quanto
// pesa), per vedere che il lettore non ci casca.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { crc32, deflateRawSync } from 'node:zlib'
import { DatabaseSync } from 'node:sqlite'

const GIORNO = 86_400_000
const EPOCA = 1288834974657n

/** Un id di X nato in questo istante (più un numero per non ripetersi). */
export function idDel(ms: number, n = 0): string {
  return String(((BigInt(Math.floor(ms)) - EPOCA) << 22n) + BigInt(n))
}

/** La data come la scrive X: «Wed Sep 18 14:02:11 +0000 2026». */
export function dataX(ms: number): string {
  const d = new Date(ms)
  const g = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]
  const due = (n: number) => String(n).padStart(2, '0')
  return `${g} ${m} ${due(d.getUTCDate())} ${due(d.getUTCHours())}:${due(d.getUTCMinutes())}:${due(d.getUTCSeconds())} +0000 ${d.getUTCFullYear()}`
}

export const parte = (nome: string, n: number, voci: unknown[]) => `window.YTD.${nome}.part${n} = ${JSON.stringify(voci, null, 2)}`

export type PostFinto = { giorni: number; testo: string; mipiace?: number; repost?: number; risposta?: boolean; rt?: boolean; n?: number }
export type LikeFinto = { giorni: number; testo?: string; autore?: string; n?: number }

/** Un post nel formato di `tweets.js`. */
export function tweet(adesso: number, p: PostFinto) {
  const ms = adesso - p.giorni * GIORNO
  return {
    tweet: {
      id_str: idDel(ms, p.n ?? 0), created_at: dataX(ms), full_text: p.testo,
      favorite_count: String(p.mipiace ?? 0), retweet_count: String(p.repost ?? 0),
      ...(p.risposta ? { in_reply_to_status_id_str: idDel(ms - 3_600_000, 7) } : {}),
      retweeted: false, entities: { urls: [] }
    }
  }
}

export function like(adesso: number, l: LikeFinto) {
  const id = idDel(adesso - l.giorni * GIORNO, l.n ?? 0)
  return { like: { tweetId: id, ...(l.testo ? { fullText: l.testo } : {}), expandedUrl: `https://twitter.com/${l.autore ?? 'i/web'}/status/${id}` } }
}

/** I file di un archivio: post, mi piace, account, manifesto con la data. */
export function fileArchivio(o: { adesso: number; generatoGiorniFa?: number; maniglia?: string; post: PostFinto[]; mipiace?: LikeFinto[] }): Record<string, string> {
  return {
    'data/manifest.js': `window.__THAR_CONFIG = ${JSON.stringify({
      userInfo: { accountId: '42', userName: o.maniglia ?? 'tobia', displayName: 'Tobia' },
      archiveInfo: { sizeBytes: '1000', generationDate: new Date(o.adesso - (o.generatoGiorniFa ?? 1) * GIORNO).toISOString(), isPartialArchive: false }
    })}`,
    'data/account.js': parte('account', 0, [{ account: { username: o.maniglia ?? 'tobia', accountId: '42', accountDisplayName: 'Tobia' } }]),
    'data/tweets.js': parte('tweets', 0, o.post.map(p => tweet(o.adesso, p))),
    'data/like.js': parte('like', 0, (o.mipiace ?? []).map(l => like(o.adesso, l))),
    'Your archive.html': '<html>archivio</html>'
  }
}

export function scriviCartella(cartella: string, file: Record<string, string | Buffer>) {
  for (const [nome, testo] of Object.entries(file)) {
    mkdirSync(dirname(join(cartella, nome)), { recursive: true })
    writeFileSync(join(cartella, nome), testo)
  }
}

/**
 * Uno zip, voce per voce. `dichiarata` mente sulla misura intera di una voce
 * (per il tetto); `ferma` la scrive senza comprimere.
 */
export function zip(file: Record<string, string | Buffer>, o: { dichiarata?: Record<string, number>; ferma?: boolean } = {}): Buffer {
  const locali: Buffer[] = []
  const centrali: Buffer[] = []
  let posto = 0
  for (const [nome, contenuto] of Object.entries(file)) {
    const dati = Buffer.isBuffer(contenuto) ? contenuto : Buffer.from(contenuto, 'utf8')
    const compressi = o.ferma ? dati : deflateRawSync(dati)
    const n = Buffer.from(nome, 'utf8')
    const crc = crc32(dati)
    const intera = o.dichiarata?.[nome] ?? dati.length
    const l = Buffer.alloc(30)
    l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(0x0800, 6); l.writeUInt16LE(o.ferma ? 0 : 8, 8)
    l.writeUInt32LE(crc, 14); l.writeUInt32LE(compressi.length, 18); l.writeUInt32LE(intera, 22); l.writeUInt16LE(n.length, 26)
    const c = Buffer.alloc(46)
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(o.ferma ? 0 : 8, 10)
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(compressi.length, 20); c.writeUInt32LE(intera, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(posto, 42)
    locali.push(l, n, compressi)
    centrali.push(c, n)
    posto += 30 + n.length + compressi.length
  }
  const cd = Buffer.concat(centrali)
  const fine = Buffer.alloc(22)
  const quante = Object.keys(file).length
  fine.writeUInt32LE(0x06054b50, 0); fine.writeUInt16LE(quante, 8); fine.writeUInt16LE(quante, 10)
  fine.writeUInt32LE(cd.length, 12); fine.writeUInt32LE(posto, 16)
  return Buffer.concat([...locali, cd, fine])
}

/** Il database del motore di X, con lo schema che `x.ts` legge, fermo da `fermoGiorni`. */
export function motoreFermo(percorso: string, adesso: number, fermoGiorni: number, o: { lettoreRotto?: boolean } = {}) {
  mkdirSync(dirname(percorso), { recursive: true })
  const db = new DatabaseSync(percorso)
  db.exec(`
    CREATE TABLE drafts (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL,
      target_url TEXT, target_author TEXT, status TEXT DEFAULT 'pending', scheduled_for TEXT);
    CREATE TABLE posted (id INTEGER PRIMARY KEY AUTOINCREMENT, posted_at TEXT NOT NULL, tweet_id TEXT UNIQUE, url TEXT, kind TEXT,
      body TEXT, likes INTEGER DEFAULT 0, reposts INTEGER DEFAULT 0, replies INTEGER DEFAULT 0, bookmarks INTEGER DEFAULT 0, views INTEGER DEFAULT 0);
    CREATE TABLE follower_log (id INTEGER PRIMARY KEY AUTOINCREMENT, checked_at TEXT NOT NULL, followers INTEGER);
    CREATE TABLE strategy_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, note TEXT NOT NULL);
  `)
  const ms = adesso - fermoGiorni * GIORNO
  db.prepare('INSERT INTO posted (posted_at, tweet_id, url, kind, body, likes, views) VALUES (?,?,?,?,?,?,?)')
    .run(new Date(ms).toISOString(), idDel(ms, 1), `https://x.com/tobia/status/${idDel(ms, 1)}`, 'post', 'The last thing the engine posted.', 4, 300)
  // il motore acceso, con il lettore di X che fallisce a ogni giro (com'era il 19 ottobre), e due menzioni
  if (o.lettoreRotto) {
    db.exec('CREATE TABLE runs (id integer primary key autoincrement, job text not null, started_at text not null, finished_at text, ok integer, note text, items integer default 0)')
    const giro = db.prepare('INSERT INTO runs (job, started_at, ok, note) VALUES (?,?,?,?)')
    giro.run('feedread', new Date(ms).toISOString(), 1, 'read 40')
    giro.run('poster', new Date(adesso - 600_000).toISOString(), 1, 'nothing approved')
    giro.run('feedread', new Date(adesso - 1_200_000).toISOString(), 0, 'Browser process failed (1)')
    const m = (giorni: number, n: number, chi: string, testo: string) => ({ id: idDel(adesso - giorni * GIORNO, n), handle: `@${chi}`, text: testo, url: null, created_at: new Date(adesso - giorni * GIORNO).toISOString() })
    writeFileSync(join(dirname(percorso), 'mentions.json'), JSON.stringify({ observed_at: new Date(ms).toISOString(), items: [
      m(fermoGiorni + 1, 2, 'maria', 'Flat week here too. I lead with the numbers now.'),
      m(fermoGiorni + 2, 3, 'sam', 'Versioned, or at least scoped. That is the whole trick.')
    ] }))
  }
  db.close()
}
