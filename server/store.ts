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
    id         TEXT PRIMARY KEY,
    fonte      TEXT NOT NULL,      -- posta | desktop | notion
    tipo       TEXT NOT NULL,      -- email | file | pagina
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

  CREATE VIRTUAL TABLE IF NOT EXISTS ricerca USING fts5(
    id UNINDEXED, titolo, corpo, autore, tokenize = 'unicode61'
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

export function salvaDocumenti(docs: Documento[]) {
  const ins = db.prepare(`
    INSERT INTO documenti (id, fonte, tipo, titolo, corpo, autore, percorso, quando, gruppo, indicizzato)
    VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      titolo=excluded.titolo, corpo=excluded.corpo, autore=excluded.autore,
      percorso=excluded.percorso, quando=excluded.quando, gruppo=excluded.gruppo
  `)
  const delFts = db.prepare('DELETE FROM ricerca WHERE id = ?')
  const insFts = db.prepare('INSERT INTO ricerca (id, titolo, corpo, autore) VALUES (?,?,?,?)')
  const ora = new Date().toISOString()

  db.exec('BEGIN')
  try {
    for (const d of docs) {
      ins.run(d.id, d.fonte, d.tipo, d.titolo, d.corpo, d.autore ?? null, d.percorso ?? null, d.quando ?? null, d.gruppo ?? null, ora)
      delFts.run(d.id)
      insFts.run(d.id, d.titolo, d.corpo, d.autore ?? '')
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

/** Toglie tutto quello che è arrivato da una fonte (quando la scolleghi). */
export function svuotaFonte(fonte: string) {
  const ids = db.prepare('SELECT id FROM documenti WHERE fonte = ?').all(fonte) as { id: string }[]
  const delFts = db.prepare('DELETE FROM ricerca WHERE id = ?')
  db.exec('BEGIN')
  try {
    for (const { id } of ids) delFts.run(id)
    db.prepare('DELETE FROM documenti WHERE fonte = ?').run(fonte)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

/** Ricerca full-text; se la query non è valida per FTS ripiega su LIKE. */
export function cerca(q: string, limite = 20): Documento[] {
  const pulita = q.replace(/["'*^]/g, ' ').trim()
  if (!pulita) return []
  try {
    const termini = pulita.split(/\s+/).filter(Boolean).map(t => `"${t}"*`).join(' OR ')
    return db.prepare(`
      SELECT d.* FROM ricerca r JOIN documenti d ON d.id = r.id
      WHERE ricerca MATCH ? ORDER BY bm25(ricerca) LIMIT ?
    `).all(termini, limite) as unknown as Documento[]
  } catch {
    const like = `%${pulita}%`
    return db.prepare(`
      SELECT * FROM documenti WHERE titolo LIKE ? OR corpo LIKE ? LIMIT ?
    `).all(like, like, limite) as unknown as Documento[]
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

export function messaggi(chat: string) {
  const righe = db.prepare('SELECT * FROM messaggi WHERE chat = ? ORDER BY quando').all(chat) as {
    id: string; ruolo: string; testo: string; fonti: string | null
  }[]
  return righe.map(r => ({ id: r.id, role: r.ruolo, text: r.testo, sources: r.fonti ? JSON.parse(r.fonti) : undefined }))
}

// — feed —

export function salvaFeed(items: { id: string; tipo: string; titolo: string; testo: string; urgenza?: string; fonte?: string; doc?: string }[]) {
  const ins = db.prepare(`
    INSERT OR REPLACE INTO feed (id, tipo, titolo, testo, urgenza, fonte, doc, stato, quando)
    VALUES (?,?,?,?,?,?,?,COALESCE((SELECT stato FROM feed WHERE id = ?),'aperto'),?)
  `)
  const ora = new Date().toISOString()
  for (const i of items) ins.run(i.id, i.tipo, i.titolo, i.testo, i.urgenza ?? null, i.fonte ?? null, i.doc ?? null, i.id, ora)
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
