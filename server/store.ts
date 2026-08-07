// L'indice locale: un file SQLite in ~/.myynd/mente.db.
// Usa il modulo `node:sqlite` incluso in Node — nessuna dipendenza nativa.

import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'
import { DIR } from './config.ts'

if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true, mode: 0o700 })

const db = new DatabaseSync(join(DIR, 'mente.db'))

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS documenti (
    rid        INTEGER PRIMARY KEY AUTOINCREMENT,
    id         TEXT UNIQUE NOT NULL,
    fonte      TEXT NOT NULL,      -- posta | desktop | notion
    tipo       TEXT NOT NULL,      -- email | file | pdf | documento | pagina
    titolo     TEXT NOT NULL,
    corpo      TEXT NOT NULL,
    autore     TEXT,
    percorso   TEXT,
    quando     TEXT,               -- ISO 8601
    gruppo     TEXT,               -- cluster della mappa
    indicizzato TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_doc_fonte  ON documenti(fonte);
  CREATE INDEX IF NOT EXISTS idx_doc_quando ON documenti(quando DESC);
  CREATE INDEX IF NOT EXISTS idx_doc_gruppo ON documenti(gruppo);

  -- il rowid di 'ricerca' è il rid del documento: cancellare costa O(1)
  -- invece di una scansione dell'intera tabella FTS
  CREATE VIRTUAL TABLE IF NOT EXISTS ricerca USING fts5(
    titolo, corpo, autore, tokenize = 'unicode61'
  );

  CREATE TABLE IF NOT EXISTS chat (
    id       TEXT PRIMARY KEY,
    titolo   TEXT NOT NULL,
    quando   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messaggi (
    id       TEXT PRIMARY KEY,
    chat     TEXT NOT NULL,
    ruolo    TEXT NOT NULL,
    testo    TEXT NOT NULL,
    fonti    TEXT,
    quando   TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_msg_chat ON messaggi(chat, quando);

  CREATE TABLE IF NOT EXISTS feed (
    id       TEXT PRIMARY KEY,
    tipo     TEXT NOT NULL,
    titolo   TEXT NOT NULL,
    testo    TEXT NOT NULL,
    urgenza  TEXT,
    fonte    TEXT,
    doc      TEXT,
    stato    TEXT NOT NULL DEFAULT 'aperto',
    quando   TEXT NOT NULL
  );
`)

// Migrazione dai database creati prima che 'ricerca' usasse il rowid.
try {
  const col = db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('documenti') WHERE name = 'rid'").get() as { n: number }
  if (!col.n) {
    db.exec('DROP TABLE IF EXISTS documenti; DROP TABLE IF EXISTS ricerca;')
    throw new Error('schema vecchio')
  }
} catch {
  // ricreo con lo schema nuovo: l'indice si ricostruisce alla prima lettura
  db.exec(`
    CREATE TABLE IF NOT EXISTS documenti (
      rid INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL,
      fonte TEXT NOT NULL, tipo TEXT NOT NULL, titolo TEXT NOT NULL, corpo TEXT NOT NULL,
      autore TEXT, percorso TEXT, quando TEXT, gruppo TEXT, indicizzato TEXT NOT NULL);
    CREATE VIRTUAL TABLE IF NOT EXISTS ricerca USING fts5(
      titolo, corpo, autore, tokenize = 'unicode61');
  `)
}

export type Documento = {
  id: string
  fonte: string
  tipo: string
  titolo: string
  corpo: string
  autore?: string | null
  percorso?: string | null
  quando?: string | null
  gruppo?: string | null
}

const selRid = db.prepare('SELECT rid FROM documenti WHERE id = ?')
const insDoc = db.prepare(`
  INSERT INTO documenti (id, fonte, tipo, titolo, corpo, autore, percorso, quando, gruppo, indicizzato)
  VALUES (?,?,?,?,?,?,?,?,?,?)
`)
const updDoc = db.prepare(`
  UPDATE documenti SET titolo=?, corpo=?, autore=?, percorso=?, quando=?, gruppo=?, indicizzato=?
  WHERE rid = ?
`)
const delFts = db.prepare('DELETE FROM ricerca WHERE rowid = ?')
const insFts = db.prepare('INSERT INTO ricerca (rowid, titolo, corpo, autore) VALUES (?,?,?,?)')

export function salvaDocumenti(docs: Documento[]) {
  if (!docs.length) return
  const ora = new Date().toISOString()
  db.exec('BEGIN')
  try {
    for (const d of docs) {
      const gia = selRid.get(d.id) as { rid: number } | undefined
      let rid: number
      if (gia) {
        rid = gia.rid
        updDoc.run(d.titolo, d.corpo, d.autore ?? null, d.percorso ?? null, d.quando ?? null, d.gruppo ?? null, ora, rid)
        delFts.run(rid)
      } else {
        const r = insDoc.run(d.id, d.fonte, d.tipo, d.titolo, d.corpo, d.autore ?? null, d.percorso ?? null, d.quando ?? null, d.gruppo ?? null, ora)
        rid = Number(r.lastInsertRowid)
      }
      insFts.run(rid, d.titolo, d.corpo, d.autore ?? '')
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

/** Toglie tutto quello che è arrivato da una fonte (quando la scolleghi). */
export function svuotaFonte(fonte: string) {
  const righe = db.prepare('SELECT rid FROM documenti WHERE fonte = ?').all(fonte) as { rid: number }[]
  db.exec('BEGIN')
  try {
    for (const { rid } of righe) delFts.run(rid)
    db.prepare('DELETE FROM documenti WHERE fonte = ?').run(fonte)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

/**
 * Toglie i documenti di una fonte che non sono più stati visti: un file
 * cancellato o rinominato non deve restare nell'indice — e soprattutto non
 * deve finire fra le fonti che Claude cita.
 */
export function riconcilia(fonte: string, idVisti: string[]): number {
  if (!idVisti.length) return 0
  const vivi = new Set(idVisti)
  const tutti = db.prepare('SELECT rid, id FROM documenti WHERE fonte = ?').all(fonte) as { rid: number; id: string }[]
  const morti = tutti.filter(r => !vivi.has(r.id))
  if (!morti.length) return 0
  const del = db.prepare('DELETE FROM documenti WHERE rid = ?')
  db.exec('BEGIN')
  try {
    for (const m of morti) { delFts.run(m.rid); del.run(m.rid) }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  return morti.length
}

/** Ricerca full-text; se la query non è valida per FTS ripiega su LIKE. */
export function cerca(q: string, limite = 20): Documento[] {
  const pulita = q.replace(/["'*^]/g, ' ').trim()
  if (!pulita) return []
  try {
    const termini = pulita.split(/\s+/).filter(Boolean).map(t => `"${t}"*`).join(' OR ')
    return db.prepare(`
      SELECT d.* FROM ricerca r JOIN documenti d ON d.rid = r.rowid
      WHERE ricerca MATCH ? ORDER BY bm25(ricerca) LIMIT ?
    `).all(termini, limite) as unknown as Documento[]
  } catch {
    // LIKE: i jolly nel testo cercato vanno neutralizzati
    const like = '%' + pulita.replace(/[\\%_]/g, c => '\\' + c) + '%'
    return db.prepare(`
      SELECT * FROM documenti WHERE titolo LIKE ?1 ESCAPE '\\' OR corpo LIKE ?1 ESCAPE '\\' LIMIT ?2
    `).all(like, limite) as unknown as Documento[]
  }
}

export function recenti(limite = 40): Documento[] {
  return db.prepare('SELECT * FROM documenti ORDER BY quando DESC LIMIT ?').all(limite) as unknown as Documento[]
}

export function documento(id: string): Documento | null {
  return (db.prepare('SELECT * FROM documenti WHERE id = ?').get(id) as unknown as Documento) ?? null
}

export function conteggi() {
  const tot = db.prepare('SELECT COUNT(*) AS n FROM documenti').get() as { n: number }
  const perFonte = db.prepare('SELECT fonte, COUNT(*) AS n FROM documenti GROUP BY fonte').all() as { fonte: string; n: number }[]
  const perGruppo = db.prepare(`
    SELECT COALESCE(gruppo,'altro') AS gruppo, COUNT(*) AS n
    FROM documenti GROUP BY gruppo ORDER BY n DESC
  `).all() as { gruppo: string; n: number }[]
  return { totale: tot.n, perFonte, perGruppo }
}

// — chat —

export function creaChat(id: string, titolo: string) {
  db.prepare('INSERT OR REPLACE INTO chat (id, titolo, quando) VALUES (?,?,?)').run(id, titolo, new Date().toISOString())
}

export function rinominaChat(id: string, titolo: string) {
  db.prepare('UPDATE chat SET titolo = ? WHERE id = ?').run(titolo, id)
}

export function elencoChat() {
  return db.prepare('SELECT * FROM chat ORDER BY quando DESC').all() as { id: string; titolo: string; quando: string }[]
}

export function eliminaChat(id: string) {
  db.prepare('DELETE FROM messaggi WHERE chat = ?').run(id)
  db.prepare('DELETE FROM chat WHERE id = ?').run(id)
}

export function salvaMessaggio(m: { id: string; chat: string; ruolo: string; testo: string; fonti?: unknown }) {
  db.prepare('INSERT INTO messaggi (id, chat, ruolo, testo, fonti, quando) VALUES (?,?,?,?,?,?)')
    .run(m.id, m.chat, m.ruolo, m.testo, m.fonti ? JSON.stringify(m.fonti) : null, new Date().toISOString())
}

export function togliMessaggio(id: string) {
  db.prepare('DELETE FROM messaggi WHERE id = ?').run(id)
}

export function messaggi(chat: string) {
  const righe = db.prepare('SELECT * FROM messaggi WHERE chat = ? ORDER BY quando, id').all(chat) as {
    id: string; ruolo: string; testo: string; fonti: string | null
  }[]
  return righe.map(r => ({ id: r.id, role: r.ruolo, text: r.testo, sources: r.fonti ? JSON.parse(r.fonti) : undefined }))
}

export function esisteChat(id: string): boolean {
  return !!db.prepare('SELECT 1 FROM chat WHERE id = ?').get(id)
}

// — feed —

/** Un id stabile per la voce: rigenerare la lettura non duplica il feed. */
function idFeed(v: { titolo: string; doc?: string | null }): string {
  const base = `${v.doc ?? ''}|${v.titolo}`
  let h = 5381
  for (let i = 0; i < base.length; i++) h = ((h * 33) ^ base.charCodeAt(i)) >>> 0
  return 'f' + h.toString(36)
}

export function salvaFeed(items: { tipo: string; titolo: string; testo: string; urgenza?: string; fonte?: string; doc?: string }[]) {
  const ins = db.prepare(`
    INSERT INTO feed (id, tipo, titolo, testo, urgenza, fonte, doc, stato, quando)
    VALUES (?,?,?,?,?,?,?,'aperto',?)
    ON CONFLICT(id) DO UPDATE SET
      tipo=excluded.tipo, testo=excluded.testo, urgenza=excluded.urgenza,
      fonte=excluded.fonte, doc=excluded.doc
  `)
  const ora = new Date().toISOString()
  db.exec('BEGIN')
  try {
    for (const i of items) {
      ins.run(idFeed(i), i.tipo, i.titolo, i.testo, i.urgenza ?? null, i.fonte ?? null, i.doc ?? null, ora)
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

export function elencoFeed(stato = 'aperto') {
  return db.prepare('SELECT * FROM feed WHERE stato = ? ORDER BY quando DESC').all(stato) as Record<string, string>[]
}

export function cambiaStatoFeed(id: string, stato: string) {
  db.prepare('UPDATE feed SET stato = ? WHERE id = ?').run(stato, id)
}

export function azzeraTutto() {
  db.exec('DELETE FROM documenti; DELETE FROM ricerca; DELETE FROM feed; DELETE FROM messaggi; DELETE FROM chat;')
}

export default db
