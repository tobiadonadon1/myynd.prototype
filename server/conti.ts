// I conti: chi esiste, e chi è chi.
//
// **Perché questo file non poteva stare dentro `store.ts`.** Le sessioni
// stavano nell'indice, cioè nel database di una persona — e finché la persona
// era una sola andava benissimo. Con più persone diventa un giro impossibile:
// per sapere di chi è un token bisogna aprire il suo database, ma per sapere
// quale database aprire bisogna già sapere di chi è il token. Il conto e la
// sessione devono stare *sopra* le persone, non dentro una.
//
// Quindi un database piccolo e condiviso, accanto alle cartelle di tutti, con
// dentro le due sole cose che non appartengono a nessuno in particolare: chi
// ha un conto, e quale token è di chi. Tutto il resto — i documenti, la lista,
// la memoria, le automazioni, le credenziali delle fonti — resta nella
// cartella della singola persona e non si mescola mai.
//
// **Della password non si tiene la password.** Scrypt con un sale per conto:
// chi legge questo file non può entrare in nessun account, e non può nemmeno
// dire se due persone hanno scelto la stessa password. Dei token si tiene solo
// l'impronta, per la stessa ragione.

import { DatabaseSync } from 'node:sqlite'
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { DATI } from './ospitato.ts'

const N = 16384          // costo scrypt: lento quanto basta
const LUNGHEZZA = 64

/** Quanto dura una sessione senza farsi rivedere. */
const DURA = 30 * 86_400_000

if (!existsSync(DATI)) mkdirSync(DATI, { recursive: true, mode: 0o700 })
const FILE = join(DATI, 'conti.db')
const db = new DatabaseSync(FILE)
try { chmodSync(FILE, 0o600) } catch { /* su alcuni volumi non si può, pazienza */ }

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS utenti (
    id     TEXT PRIMARY KEY,
    email  TEXT NOT NULL UNIQUE,
    sale   TEXT NOT NULL,
    hash   TEXT NOT NULL,
    creato TEXT NOT NULL,
    -- Dove stanno i suoi dati, quando non stanno dove starebbero.
    -- Vuoto per tutti tranne uno: chi c'era prima che esistessero le cartelle
    -- per persona, e i cui file stanno nella radice. Vedi adotta().
    cartella TEXT
  );
  CREATE TABLE IF NOT EXISTS sessioni (
    impronta TEXT PRIMARY KEY,
    utente   TEXT NOT NULL,
    quando   TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessioni_utente ON sessioni (utente);
`)

/**
 * Le colonne che arrivano dopo.
 *
 * `CREATE TABLE IF NOT EXISTS` non tocca una tabella che c'è già: aggiungere
 * una colonna là dentro non fa niente su ogni database nato prima, e il primo
 * segnale è un «no such column» in faccia a qualcuno che stava solo aprendo
 * l'app. Qui si guarda cosa c'è davvero e si aggiunge quello che manca.
 */
function assicuraColonna(tabella: string, colonna: string, tipo: string) {
  const gia = (db.prepare(`PRAGMA table_info(${tabella})`).all() as { name: string }[])
    .some(c => c.name === colonna)
  if (!gia) db.exec(`ALTER TABLE ${tabella} ADD COLUMN ${colonna} ${tipo}`)
}

assicuraColonna('utenti', 'cartella', 'TEXT')

function impasta(password: string, sale: string): string {
  return scryptSync(password, sale, LUNGHEZZA, { N, r: 8, p: 1 }).toString('hex')
}

function impronta(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export type Conto = { id: string; email: string; creato: string }

/**
 * Un identificativo che non dice niente di chi è.
 *
 * Non l'email e non un numero progressivo: è il nome di una cartella su disco,
 * e una cartella che si chiama come l'indirizzo di qualcuno racconta chi usa
 * questo server a chiunque guardi l'elenco dei file. Un numero progressivo, in
 * più, direbbe quanti sono e in che ordine sono arrivati.
 */
function nuovoId(): string {
  return 'u' + randomBytes(9).toString('hex')
}

export function quanti(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM utenti').get() as { n: number }).n
}

/** Tutti gli id, per i giri di sfondo che devono passare da ognuno. */
export function tutti(): string[] {
  return (db.prepare('SELECT id FROM utenti ORDER BY creato').all() as { id: string }[]).map(r => r.id)
}

/**
 * La cartella di questo conto.
 *
 * Quasi sempre `utenti/<id>`. L'eccezione è una sola e vale per una
 * installazione sola: quella che esisteva prima che le persone potessero
 * essere più di una, e che ha i suoi file nella radice. Vedi `adotta`.
 */
export function cartellaDi(id: string): string | null {
  const r = db.prepare('SELECT cartella FROM utenti WHERE id = ?').get(id) as { cartella: string | null } | undefined
  return r?.cartella ?? null
}

export function conto(id: string): Conto | null {
  return (db.prepare('SELECT id, email, creato FROM utenti WHERE id = ?').get(id) as Conto) ?? null
}

export function esiste(email: string): boolean {
  return !!db.prepare('SELECT 1 FROM utenti WHERE email = ?').get(email.trim().toLowerCase())
}

/**
 * Un conto nuovo.
 *
 * Chiunque, senza invito e senza che nessuno debba toccare una variabile su un
 * server. È il punto di tutto questo file: la registrazione era chiusa perché
 * l'installazione aveva un conto solo, e chi arrivava secondo sarebbe entrato
 * nell'account del primo — dentro la sua posta. Adesso ognuno ha la sua
 * cartella, e aprirne una a un estraneo non gli fa vedere niente di nessuno.
 */
export function registra(email: string, password: string):
  { ok: true; id: string; token: string } | { ok: false; errore: string } {
  const e = email.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return { ok: false, errore: 'Indirizzo non valido.' }
  if (password.length < 8) return { ok: false, errore: 'Almeno otto caratteri.' }
  if (esiste(e)) return { ok: false, errore: 'C’è già un account con questo indirizzo.' }

  const id = nuovoId()
  const sale = randomBytes(16).toString('hex')
  db.prepare('INSERT INTO utenti (id, email, sale, hash, creato) VALUES (?,?,?,?,?)')
    .run(id, e, sale, impasta(password, sale), new Date().toISOString())
  return { ok: true, id, token: apri(id) }
}

export function entra(email: string, password: string):
  { ok: true; id: string; token: string } | { ok: false; errore: string } {
  const e = email.trim().toLowerCase()
  const u = db.prepare('SELECT id, sale, hash FROM utenti WHERE email = ?').get(e) as
    { id: string; sale: string; hash: string } | undefined

  /*
   * Lo stesso lavoro anche quando l'indirizzo non esiste.
   *
   * Senza, rispondere «no» a un indirizzo sconosciuto costa un millesimo di
   * quanto costa rispondere «no» a una password sbagliata — e da quella
   * differenza si legge, cronometrando, chi ha un conto su questo server. Con
   * un sale finto il tempo è lo stesso, e la risposta pure.
   */
  const sale = u?.sale ?? 'nessuno'
  const hash = impasta(password, sale)
  if (!u) return { ok: false, errore: 'Indirizzo o password non corretti.' }

  const a = Buffer.from(hash)
  const b = Buffer.from(u.hash)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, errore: 'Indirizzo o password non corretti.' }
  }
  return { ok: true, id: u.id, token: apri(u.id) }
}

export function apri(utente: string): string {
  const token = randomBytes(32).toString('hex')
  db.prepare('INSERT INTO sessioni (impronta, utente, quando) VALUES (?,?,?)')
    .run(impronta(token), utente, new Date().toISOString())
  return token
}

/** Di chi è questo token, se è ancora buono. */
export function utenteDelToken(token?: string): string | null {
  if (!token) return null
  const r = db.prepare('SELECT utente, quando FROM sessioni WHERE impronta = ?')
    .get(impronta(token)) as { utente: string; quando: string } | undefined
  if (!r) return null
  if (Date.now() - Date.parse(r.quando) > DURA) {
    db.prepare('DELETE FROM sessioni WHERE impronta = ?').run(impronta(token))
    return null
  }
  return r.utente
}

export function chiudi(token?: string) {
  if (token) db.prepare('DELETE FROM sessioni WHERE impronta = ?').run(impronta(token))
}

/**
 * Il conto che c'era prima che i conti fossero più di uno.
 *
 * Un'installazione che gira da mesi ha l'account dentro `config.json` nella
 * radice, e accanto il suo `mente.db` con dentro tutto: i documenti, la lista,
 * la memoria, le automazioni. Senza questo passaggio quella persona riaprirebbe
 * Myynd e troverebbe una schermata che le chiede di registrarsi, con tutto il
 * suo lavoro ancora lì sul disco ma invisibile. È il modo peggiore di
 * aggiornare qualcosa.
 *
 * **Non si sposta niente.** Si potrebbe rinominare la sua cartella dentro
 * `utenti/<id>`, ed è quello che farebbe uno schema pulito — ma sono cinque
 * rinomine di fila, e se il processo muore in mezzo i dati di qualcuno restano
 * a metà strada. Si registra invece *dov'è già*: una colonna, un caso
 * particolare che riguarda un conto solo, e zero byte spostati.
 *
 * La password resta la sua: si riusano il sale e l'hash che erano nel file, e
 * quindi entra con quella che ha sempre usato.
 */
export function adotta(email: string, sale: string, hash: string, dove: string): string | null {
  if (quanti() > 0) return null
  const id = nuovoId()
  db.prepare('INSERT INTO utenti (id, email, sale, hash, creato, cartella) VALUES (?,?,?,?,?,?)')
    .run(id, email.trim().toLowerCase(), sale, hash, new Date().toISOString(), dove)
  return id
}

/**
 * Una password nuova, e le vecchie chiavi buttate.
 *
 * Non esiste un modo di *recuperare* quella di prima: nel database c'è uno
 * scrypt del suo sale, ed è la proprietà per cui la si scrive così. Questo è
 * l'unico gesto possibile, e si può fare solo da dove sta il database.
 *
 * Le sessioni aperte si chiudono tutte. Chi cambia una password quasi sempre
 * lo fa perché qualcosa non gli torna, e lasciare in piedi quelle di prima
 * vorrebbe dire cambiare la serratura lasciando le chiavi in giro.
 */
export function cambiaPassword(id: string, nuova: string):
  { ok: true; sessioniChiuse: number } | { ok: false; errore: string } {
  if (nuova.length < 8) return { ok: false, errore: 'Almeno otto caratteri.' }
  if (!conto(id)) return { ok: false, errore: 'Questo conto non esiste.' }

  // sale nuovo insieme alla password nuova: riusare quello vecchio vorrebbe
  // dire che due hash dello stesso conto si possono confrontare fra loro
  const sale = randomBytes(16).toString('hex')
  db.prepare('UPDATE utenti SET sale = ?, hash = ? WHERE id = ?')
    .run(sale, impasta(nuova, sale), id)
  const via = db.prepare('DELETE FROM sessioni WHERE utente = ?').run(id).changes
  return { ok: true, sessioniChiuse: Number(via) }
}

/** Le sessioni scadute, via. Si chiama all'avvio: non serve un timer per questo. */
export function pota() {
  db.prepare('DELETE FROM sessioni WHERE quando < ?')
    .run(new Date(Date.now() - DURA).toISOString())
}

/** Da usare nei test: un conto e la sua sessione, senza passare da una password. */
export const perProva = {
  apri,
  /** Una sessione con un token deciso da fuori: serve solo allo sviluppo. */
  apriCon(token: string, utente: string) {
    db.prepare('INSERT OR REPLACE INTO sessioni (impronta, utente, quando) VALUES (?,?,?)')
      .run(impronta(token), utente, new Date().toISOString())
  },
  svuota() {
    db.exec('DELETE FROM sessioni; DELETE FROM utenti')
  }
}
