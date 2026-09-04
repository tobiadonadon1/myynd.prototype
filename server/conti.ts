// I conti: chi esiste, e chi è chi.
//
// **Perché questo file non poteva stare dentro `store.ts`.** Le sessioni
// stavano nell'indice, cioè nel database di una persona — e finché la persona
// era una sola andava benissimo. Con più persone diventa un giro impossibile:
// per sapere di chi è un token bisogna aprire il suo database, ma per sapere
// quale database aprire bisogna già sapere di chi è il token. Il conto e la
// sessione devono stare *sopra* le persone, non dentro una.
//
// Quindi un database piccolo e condiviso con dentro le due sole cose che non
// appartengono a nessuno in particolare: chi ha un conto, e quale token è di
// chi. Tutto il resto — i documenti, la lista, la memoria, le automazioni —
// resta nella cartella della singola persona e non si mescola mai.
//
// **Dove sta quel database.** In casa, `conti.db` accanto alla cartella di
// tutti: SQLite, sincrono, com'è sempre stato. Su un server con
// `MYYND_POSTGRES`, in Postgres — perché il disco di un contenitore non
// sopravvive a un redeploy, e un conto che sparisce si presenta come «password
// sbagliata» a chi ha la password giusta. Lì le letture che devono restare
// sincrone (`cartellaDi`, `tutti`, `conto`: le chiama chi risolve i percorsi,
// e non può aspettare) passano da una copia in memoria; tutto quello che
// decide se qualcuno entra — la password, il token — va a chiedere al
// database, sempre.
//
// **Della password non si tiene la password.** Scrypt con un sale per conto:
// chi legge questo file non può entrare in nessun account, e non può nemmeno
// dire se due persone hanno scelto la stessa password. Dei token si tiene solo
// l'impronta, per la stessa ragione.

import { DatabaseSync } from 'node:sqlite'
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, chmodSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DATI } from './ospitato.ts'
import * as postgres from './postgres.ts'

/*
 * Il costo di scrypt, e perché è scritto dentro l'hash.
 *
 * Era 16384 e sincrono: mezzo secondo in cui il processo non rispondeva a
 * nessun altro, e uno script con indirizzi a caso lo fermava per tutti. Adesso
 * è asincrono e costa il doppio (32 MB di memoria per tentativo, che è quello
 * che lo rende caro a chi prova a indovinare). Gli hash di prima restano
 * leggibili — il costo si legge dal prefisso `s<N>$`, e chi non ce l'ha è a
 * 16384 — e si riscrivono con il costo nuovo al primo accesso riuscito, che è
 * l'unico momento in cui la password la conosciamo.
 */
const N = 32768
const LUNGHEZZA = 64

/** Quanto dura una sessione senza farsi rivedere. */
const DURA = 30 * 86_400_000
/**
 * Ogni quanto si segna che la sessione è stata rivista. «Senza farsi rivedere»
 * vuol dire dall'ultimo uso, non dalla nascita: prima `quando` era la
 * creazione e basta, e chi usava Myynd tutti i giorni si trovava fuori al
 * trentesimo esatto. Una scrittura al giorno per sessione basta a dire «vista».
 */
const RIVEDI_OGNI = 86_400_000

type Utente = {
  id: string; email: string; sale: string; hash: string; creato: string; cartella: string | null
  /**
   * Quando ha confermato di essere lui a quell'indirizzo. `null` = non l'ha
   * fatto — e conta solo dove la posta del server c'è: vedi `postaUscita.ts`.
   */
  verificato: string | null
}
type Credenziali = { id: string; sale: string; hash: string; verificato: string | null }

// ——— SQLite: in casa ———

const FILE = join(DATI, 'conti.db')
/**
 * Se qui non si apre, nulla si apre: e l'errore di serie parla di SQLite,
 * mentre quasi sempre la causa è la cartella — un volume non montato, o
 * montato in sola lettura. Va detto quello, con il percorso, prima di morire.
 */
function apriIConti(): DatabaseSync {
  try {
    if (!existsSync(DATI)) mkdirSync(DATI, { recursive: true, mode: 0o700 })
    return new DatabaseSync(FILE)
  } catch (e) {
    console.error(
      `myynd · non riesco ad aprire i conti in ${FILE}: ${e instanceof Error ? e.message : e}\n` +
      `  La cartella dei dati è ${DATI}. Esiste, e si può scrivere? Su un server: il volume è montato lì?`
    )
    process.exit(1)
  }
}

/** Il database di casa. `null` vuol dire che i conti stanno su Postgres. */
const db: DatabaseSync | null = postgres.ATTIVO ? null : apriIConti()

if (db) {
  try { chmodSync(FILE, 0o600) } catch { /* su alcuni volumi non si può, pazienza */ }
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
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
    -- I gettoni della posta (conferma dell'indirizzo, password dimenticata) e
    -- quelli con un ambito. Le regole stanno in gettoniEmail.ts e gettoni.ts:
    -- le tabelle stanno qui perché sono della stessa natura delle sessioni —
    -- dicono di chi è una chiave — e perché cancella(), qui sotto, le deve
    -- poter svuotare anche in un processo che quei due file non li ha aperti.
    CREATE TABLE IF NOT EXISTS gettoni_email (
      impronta TEXT PRIMARY KEY,
      utente   TEXT NOT NULL,
      scopo    TEXT NOT NULL,
      scade    TEXT NOT NULL,
      usato    TEXT
    );
    CREATE INDEX IF NOT EXISTS gettoni_email_utente ON gettoni_email (utente);
    CREATE TABLE IF NOT EXISTS gettoni (
      id       TEXT PRIMARY KEY,
      utente   TEXT NOT NULL,
      nome     TEXT NOT NULL,
      ambito   TEXT NOT NULL,
      impronta TEXT NOT NULL UNIQUE,
      creato   TEXT NOT NULL,
      usato    TEXT
    );
    CREATE INDEX IF NOT EXISTS gettoni_utente ON gettoni (utente);
  `)
  /*
   * Le colonne che arrivano dopo.
   *
   * `CREATE TABLE IF NOT EXISTS` non tocca una tabella che c'è già: aggiungere
   * una colonna là dentro non fa niente su ogni database nato prima, e il primo
   * segnale è un «no such column» in faccia a qualcuno che stava solo aprendo
   * l'app. Qui si guarda cosa c'è davvero e si aggiunge quello che manca.
   */
  const colonne = new Set((db.prepare('PRAGMA table_info(utenti)').all() as { name: string }[]).map(c => c.name))
  if (!colonne.has('cartella')) db.exec('ALTER TABLE utenti ADD COLUMN cartella TEXT')
  // I conti che c'erano prima che la verifica esistesse restano a NULL, e va
  // bene: la conferma la chiede `auth.ts` solo dove la posta del server è
  // configurata, e chi entra da mesi non deve trovarsi la porta chiusa perché
  // qualcuno ha aggiunto una variabile.
  if (!colonne.has('verificato')) db.exec('ALTER TABLE utenti ADD COLUMN verificato TEXT')
}

/**
 * Il database dei conti, per chi tiene le sue tabelle qui accanto.
 *
 * Lo chiedono `gettoni.ts` e `gettoniEmail.ts`: quello che tengono — a chi
 * appartiene un gettone — è esattamente della stessa natura di una sessione, e
 * deve stare *sopra* le persone e non dentro l'indice di una. `null` vuol dire
 * che i conti stanno su Postgres, e allora le tabelle le fa `postgres.schema()`.
 */
export function suDisco(): DatabaseSync | null {
  return db
}

// ——— Postgres: la copia in memoria ———

/**
 * Chi c'è, per le letture che non possono aspettare.
 *
 * `config.cartella()` risolve il percorso di *ogni* file dell'app e lo fa in
 * modo sincrono, da ottantuno punti che non sanno di essere su un server.
 * Chiede a `cartellaDi`, che quindi deve rispondere subito: da qui, non dal
 * database. La copia si riempie all'avvio, si aggiorna a ogni scrittura, e
 * ogni tanto si rilegge — così un conto nato su un'altra replica si vede
 * anche da questa. Le password e i token, che decidono chi entra, non passano
 * mai da qui: quelli si chiedono al database ogni volta.
 */
const utenti = new Map<string, Utente>()

/**
 * Le sessioni viste di recente.
 *
 * Il token arriva con ogni richiesta, e ogni richiesta chiederebbe al database
 * «di chi è?» — trenta, quaranta millisecondi verso Supabase, per tutte. Si
 * ricorda la risposta per mezzo minuto. Il prezzo è che «esci da tutti i
 * dispositivi» premuto su un'altra replica ci mette fino a trenta secondi ad
 * arrivare qui; su questa replica è immediato, perché chi chiude una sessione
 * la toglie anche da qui.
 */
const sessioni = new Map<string, { utente: string; quando: string; visto: number }>()
const RIVISTA = 30_000

let pronto = !postgres.ATTIVO

/**
 * Chi vuole sapere quando compare un conto che non conoscevamo.
 *
 * Serve a `config.ts`, che tiene la configurazione di ognuno in memoria e
 * deve andarla a prendere quando qualcuno si presenta da un'altra replica.
 * Un gancio invece di un import: `config.ts` importa già questo file, e un
 * import nell'altro verso sarebbe un giro.
 */
const alNuovoUtente: ((id: string) => void)[] = []
export function quandoArrivaUnUtente(f: (id: string) => void) { alNuovoUtente.push(f) }

function tieni(u: Utente) {
  const nuovo = !utenti.has(u.id)
  utenti.set(u.id, u)
  if (nuovo) for (const f of alNuovoUtente) f(u.id)
}

async function ricarica(): Promise<void> {
  const { rows } = await postgres.q('SELECT id, email, sale, hash, creato, cartella, verificato FROM myynd_utenti')
  for (const r of rows) tieni(r as Utente)
}

async function caricaUtente(id: string): Promise<void> {
  const { rows } = await postgres.q('SELECT id, email, sale, hash, creato, cartella, verificato FROM myynd_utenti WHERE id = $1', [id])
  if (rows[0]) tieni(rows[0] as Utente)
}

/**
 * Prima di tutto il resto.
 *
 * Su SQLite non c'è niente da aspettare: il database si è aperto quando si è
 * caricato questo file. Su Postgres invece bisogna creare le tabelle e
 * riempire la copia in memoria, e finché non è fatto le funzioni sincrone non
 * hanno niente da rispondere — quindi si rifiutano, con una frase, invece di
 * rispondere «nessuno» e far credere che non ci sia nessun conto.
 */
export async function avvia(): Promise<void> {
  if (!postgres.ATTIVO) { await pota(); return }
  await postgres.schema()
  await ricarica()
  pronto = true
  await pota()
  setInterval(() => ricarica().catch(e => console.error('myynd · non riesco a rileggere i conti:', e instanceof Error ? e.message : e)), 5 * 60_000).unref()
}

function esigi() {
  if (!pronto) throw new Error('I conti non sono ancora pronti: manca `await conti.avvia()`.')
}

// ——— gli hash ———

function impastaCon(password: string, sale: string, n: number): Promise<string> {
  return new Promise((ok, no) => {
    scrypt(password, sale, LUNGHEZZA, { N: n, r: 8, p: 1, maxmem: 128 * 1024 * 1024 },
      (e, k) => e ? no(e) : ok(k.toString('hex')))
  })
}

/** L'hash com'è scritto oggi: il costo davanti, così domani si può alzare ancora. */
async function impasta(password: string, sale: string): Promise<string> {
  return `s${N}$${await impastaCon(password, sale, N)}`
}

function leggiHash(h: string): { n: number; hex: string } {
  const m = /^s(\d+)\$([0-9a-f]+)$/.exec(h)
  return m ? { n: Number(m[1]), hex: m[2] } : { n: 16384, hex: h }
}

async function combacia(password: string, sale: string, salvato: string): Promise<boolean> {
  const { n, hex } = leggiHash(salvato)
  const a = Buffer.from(await impastaCon(password, sale, n))
  const b = Buffer.from(hex)
  return a.length === b.length && timingSafeEqual(a, b)
}

function impronta(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function normale(email: string): string {
  return email.trim().toLowerCase()
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

// ——— le letture sincrone ———

export function quanti(): number {
  if (db) return (db.prepare('SELECT COUNT(*) AS n FROM utenti').get() as { n: number }).n
  esigi()
  return utenti.size
}

/** Tutti gli id, per i giri di sfondo che devono passare da ognuno. */
export function tutti(): string[] {
  if (db) return (db.prepare('SELECT id FROM utenti ORDER BY creato').all() as { id: string }[]).map(r => r.id)
  esigi()
  return [...utenti.values()].sort((a, b) => (a.creato < b.creato ? -1 : a.creato > b.creato ? 1 : 0)).map(u => u.id)
}

/**
 * La cartella di questo conto.
 *
 * Quasi sempre `utenti/<id>`. L'eccezione è una sola e vale per una
 * installazione sola: quella che esisteva prima che le persone potessero
 * essere più di una, e che ha i suoi file nella radice. Vedi `adotta`.
 */
export function cartellaDi(id: string): string | null {
  if (db) {
    const r = db.prepare('SELECT cartella FROM utenti WHERE id = ?').get(id) as { cartella: string | null } | undefined
    return r?.cartella ?? null
  }
  esigi()
  return utenti.get(id)?.cartella ?? null
}

export function conto(id: string): Conto | null {
  if (db) return (db.prepare('SELECT id, email, creato FROM utenti WHERE id = ?').get(id) as Conto) ?? null
  esigi()
  const u = utenti.get(id)
  return u ? { id: u.id, email: u.email, creato: u.creato } : null
}

export function esiste(email: string): boolean {
  const e = normale(email)
  if (db) return !!db.prepare('SELECT 1 FROM utenti WHERE email = ?').get(e)
  esigi()
  for (const u of utenti.values()) if (u.email === e) return true
  return false
}

// ——— i conti ———

/**
 * La cartella si presenta da sola.
 *
 * Il database dei conti è l'unico legame fra un indirizzo e una cartella: se
 * si perdesse, i dati sarebbero tutti sul disco e nessuno saprebbe di chi
 * sono. Un aiuto per chi dovrà rimettere insieme i pezzi, non un requisito:
 * se non si riesce a scriverlo, il conto nasce lo stesso.
 */
function presentaLaCartella(id: string, email: string, creato: string) {
  try {
    const dove = join(DATI, 'utenti', id)
    mkdirSync(dove, { recursive: true, mode: 0o700 })
    writeFileSync(join(dove, 'chi.json'), JSON.stringify({ email, creato }, null, 2), { mode: 0o600 })
  } catch { /* vedi sopra */ }
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
/**
 * `verificato` lo decide chi chiama, non questo file.
 *
 * Qui non si sa se su questa installazione la posta del server esiste, e non è
 * affar suo: `auth.registra()` lo sa e lo dice. Falso vuol dire due cose
 * insieme — la colonna resta vuota, e **non si apre nessuna sessione**: chi
 * deve ancora confermare il proprio indirizzo non entra, e un conto che nasce
 * già dentro renderebbe la conferma una formalità da ignorare.
 */
export async function registra(email: string, password: string, verificato = true):
  Promise<{ ok: true; id: string; token: string } | { ok: false; errore: string }> {
  const e = normale(email)
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return { ok: false, errore: 'Indirizzo non valido.' }
  if (password.length < 8) return { ok: false, errore: 'Almeno otto caratteri.' }
  const giaPreso = { ok: false as const, errore: 'C’è già un account con questo indirizzo: entra con la tua password.' }
  if (esiste(e)) return giaPreso

  const id = nuovoId()
  const sale = randomBytes(16).toString('hex')
  const creato = new Date().toISOString()
  const hash = await impasta(password, sale)
  const quandoVerificato = verificato ? creato : null
  if (db) {
    // due registrazioni dello stesso indirizzo nello stesso istante: `esiste()`
    // ha detto no a tutt'e due, e vince il vincolo, non un 500
    const r = db.prepare('INSERT OR IGNORE INTO utenti (id, email, sale, hash, creato, verificato) VALUES (?,?,?,?,?,?)')
      .run(id, e, sale, hash, creato, quandoVerificato)
    if (!r.changes) return giaPreso
  } else {
    // la copia in memoria può non sapere di un conto nato un attimo fa su
    // un'altra replica: l'ultima parola ce l'ha il vincolo sul database
    const { rows } = await postgres.q(
      'INSERT INTO myynd_utenti (id, email, sale, hash, creato, verificato) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (email) DO NOTHING RETURNING id',
      [id, e, sale, hash, creato, quandoVerificato])
    if (!rows.length) return giaPreso
    tieni({ id, email: e, sale, hash, creato, cartella: null, verificato: quandoVerificato })
  }
  presentaLaCartella(id, e, creato)
  return { ok: true, id, token: verificato ? await apri(id) : '' }
}

async function credenziali(email: string): Promise<Credenziali | undefined> {
  if (db) return db.prepare('SELECT id, sale, hash, verificato FROM utenti WHERE email = ?').get(email) as Credenziali | undefined
  const { rows } = await postgres.q('SELECT id, sale, hash, verificato FROM myynd_utenti WHERE email = $1', [email])
  return rows[0] as Credenziali | undefined
}

/**
 * Chi c'è a questo indirizzo, chiesto al database e non alla memoria.
 *
 * Serve alle due strade che partono da un indirizzo scritto da chi non è
 * ancora entrato — «rimettimi la password» e «rimandami la conferma» — e su
 * quelle la copia in memoria non basta: una replica appena accesa direbbe che
 * non c'è nessuno, e la persona resterebbe fuori senza sapere perché.
 */
export async function aQuestoIndirizzo(email: string): Promise<{ id: string; verificato: string | null } | null> {
  const u = await credenziali(normale(email))
  return u ? { id: u.id, verificato: u.verificato ?? null } : null
}

/**
 * `esigiVerifica` arriva da fuori, e non ha un valore di serie che chiuda la
 * porta: `auth.ts` lo accende solo dove esiste un modo di aprirla — cioè dove
 * la posta del server c'è. Chiuderla qui di serie vorrebbe dire un'installazione
 * di casa in cui nessuno entra più.
 */
export async function entra(email: string, password: string, esigiVerifica = false):
  Promise<{ ok: true; id: string; token: string } | { ok: false; errore: string; daVerificare?: boolean }> {
  const e = normale(email)
  const u = await credenziali(e)

  /*
   * Lo stesso lavoro anche quando l'indirizzo non esiste.
   *
   * Senza, rispondere «no» a un indirizzo sconosciuto costa un millesimo di
   * quanto costa rispondere «no» a una password sbagliata — e da quella
   * differenza si legge, cronometrando, chi ha un conto su questo server. Con
   * un sale finto il tempo è lo stesso, e la risposta pure.
   */
  const sale = u?.sale ?? 'nessuno'
  const buona = u ? await combacia(password, sale, u.hash) : (await impastaCon(password, sale, N), false)
  if (!u || !buona) return { ok: false, errore: 'Indirizzo o password non corretti.' }

  /*
   * La password è quella giusta, ma l'indirizzo non è ancora confermato.
   *
   * Si esce **prima** di aprire una sessione, che è tutto il punto: se la
   * sessione nascesse e poi la si buttasse, ci sarebbe un istante in cui un
   * conto non confermato ha un token valido sul database. E si dice quale
   * delle due cose non va — non «indirizzo o password non corretti» — perché
   * qui non c'è niente da nascondere: chi arriva qui ha già dimostrato di
   * conoscere la password.
   */
  if (esigiVerifica && !u.verificato) {
    return { ok: false, errore: 'Prima conferma il tuo indirizzo: ti abbiamo scritto quando ti sei registrato.', daVerificare: true }
  }

  // un hash scritto con il costo di prima si riscrive con quello di adesso:
  // è l'unico momento in cui la password la conosciamo
  if (leggiHash(u.hash).n !== N) {
    const nuovo = await impasta(password, sale)
    if (db) db.prepare('UPDATE utenti SET hash = ? WHERE id = ?').run(nuovo, u.id)
    else {
      await postgres.q('UPDATE myynd_utenti SET hash = $1 WHERE id = $2', [nuovo, u.id])
      const c = utenti.get(u.id)
      if (c) c.hash = nuovo
    }
  }
  if (!db && !utenti.has(u.id)) await caricaUtente(u.id)
  return { ok: true, id: u.id, token: await apri(u.id) }
}

/** È davvero la sua password? Per i gesti che pesano: cambiarla, portarsi via tutto. */
export async function verifica(id: string, password: string): Promise<boolean> {
  let u: { sale: string; hash: string } | undefined
  if (db) u = db.prepare('SELECT sale, hash FROM utenti WHERE id = ?').get(id) as typeof u
  else u = (await postgres.q('SELECT sale, hash FROM myynd_utenti WHERE id = $1', [id])).rows[0] as typeof u
  if (!u) return false
  return combacia(password, u.sale, u.hash)
}

// ——— le sessioni ———

export async function apri(utente: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const quando = new Date().toISOString()
  const imp = impronta(token)
  if (db) {
    db.prepare('INSERT INTO sessioni (impronta, utente, quando) VALUES (?,?,?)').run(imp, utente, quando)
  } else {
    esigi()
    await postgres.q('INSERT INTO myynd_sessioni (impronta, utente, quando) VALUES ($1,$2,$3)', [imp, utente, quando])
    sessioni.set(imp, { utente, quando, visto: Date.now() })
  }
  return token
}

function scaduta(s: { quando: string }): boolean {
  return Date.now() - Date.parse(s.quando) > DURA
}

/** Di chi è questo token, se è ancora buono. */
export async function utenteDelToken(token?: string): Promise<string | null> {
  if (!token) return null
  const imp = impronta(token)
  if (db) {
    const r = db.prepare('SELECT utente, quando FROM sessioni WHERE impronta = ?').get(imp) as
      { utente: string; quando: string } | undefined
    if (!r) return null
    if (scaduta(r)) {
      db.prepare('DELETE FROM sessioni WHERE impronta = ?').run(imp)
      return null
    }
    if (Date.now() - Date.parse(r.quando) > RIVEDI_OGNI) {
      db.prepare('UPDATE sessioni SET quando = ? WHERE impronta = ?').run(new Date().toISOString(), imp)
    }
    return r.utente
  }
  esigi()
  const vista = sessioni.get(imp)
  if (vista && Date.now() - vista.visto < RIVISTA) {
    if (!scaduta(vista)) return vista.utente
    sessioni.delete(imp)
  }
  const { rows } = await postgres.q('SELECT utente, quando FROM myynd_sessioni WHERE impronta = $1', [imp])
  const r = rows[0] as { utente: string; quando: string } | undefined
  if (!r) { sessioni.delete(imp); return null }
  if (scaduta(r)) {
    await postgres.q('DELETE FROM myynd_sessioni WHERE impronta = $1', [imp])
    sessioni.delete(imp)
    return null
  }
  if (Date.now() - Date.parse(r.quando) > RIVEDI_OGNI) {
    r.quando = new Date().toISOString()
    await postgres.q('UPDATE myynd_sessioni SET quando = $1 WHERE impronta = $2', [r.quando, imp])
  }
  sessioni.set(imp, { utente: r.utente, quando: r.quando, visto: Date.now() })
  // una sessione aperta su un'altra replica appartiene a qualcuno che qui
  // non abbiamo ancora visto: lo si va a prendere, o `cartellaDi` non saprebbe
  if (!utenti.has(r.utente)) await caricaUtente(r.utente)
  return r.utente
}

export async function chiudi(token?: string): Promise<void> {
  if (!token) return
  const imp = impronta(token)
  if (db) { db.prepare('DELETE FROM sessioni WHERE impronta = ?').run(imp); return }
  esigi()
  sessioni.delete(imp)
  await postgres.q('DELETE FROM myynd_sessioni WHERE impronta = $1', [imp])
}

/** Tutte le sessioni di una persona, chiuse: «esci da tutti i dispositivi». */
export async function chiudiTutte(utente: string): Promise<number> {
  if (db) return Number(db.prepare('DELETE FROM sessioni WHERE utente = ?').run(utente).changes)
  esigi()
  for (const [imp, s] of sessioni) if (s.utente === utente) sessioni.delete(imp)
  const { rows } = await postgres.q('DELETE FROM myynd_sessioni WHERE utente = $1 RETURNING impronta', [utente])
  return rows.length
}

/**
 * Le chiavi che non aprono più, via. Si chiama all'avvio: non serve un timer.
 *
 * Anche i gettoni della posta, che sono di `gettoniEmail.ts`: la potatura sta
 * qui e non lì perché quel file importa questo, e chiamarlo dall'altro verso
 * chiuderebbe un giro fra i due. Non è fare spazio — sono righe da cento byte
 * — è non tenere in giro l'impronta di una chiave che non apre più niente.
 * `ieri` e non `adesso`: un gettone appena speso vale la pena tenerlo un
 * giorno, così chi riapre lo stesso collegamento trova «non vale più» invece
 * di «non l'ho mai visto».
 */
export async function pota(): Promise<void> {
  const limite = new Date(Date.now() - DURA).toISOString()
  const ieri = new Date(Date.now() - 86_400_000).toISOString()
  if (db) {
    db.prepare('DELETE FROM sessioni WHERE quando < ?').run(limite)
    db.prepare('DELETE FROM gettoni_email WHERE scade < ? OR usato < ?').run(ieri, ieri)
    return
  }
  await postgres.q('DELETE FROM myynd_sessioni WHERE quando < $1', [limite])
  await postgres.q('DELETE FROM myynd_gettoni_email WHERE scade < $1 OR usato < $1', [ieri])
}

// ——— i gesti rari ———

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
export async function adotta(email: string, sale: string, hash: string, dove: string): Promise<string | null> {
  if (quanti() > 0) return null
  const id = nuovoId()
  const e = normale(email)
  const creato = new Date().toISOString()
  // già verificato, e non è una scorciatoia: è la persona che usa questa
  // installazione da mesi, e l'indirizzo è quello con cui è sempre entrata
  if (db) {
    db.prepare('INSERT INTO utenti (id, email, sale, hash, creato, cartella, verificato) VALUES (?,?,?,?,?,?,?)').run(id, e, sale, hash, creato, dove, creato)
  } else {
    await postgres.q('INSERT INTO myynd_utenti (id, email, sale, hash, creato, cartella, verificato) VALUES ($1,$2,$3,$4,$5,$6,$7)', [id, e, sale, hash, creato, dove, creato])
    tieni({ id, email: e, sale, hash, creato, cartella: dove, verificato: creato })
  }
  return id
}

/**
 * Ha confermato: da adesso entra.
 *
 * Non è idempotente per caso — lo è di proposito. Un collegamento aperto due
 * volte (un client di posta che li visita per controllarli, una persona che
 * torna indietro col browser) non deve diventare un errore: la seconda volta
 * non cambia niente e va bene così. Il gettone, quello sì, vale una volta sola,
 * ed è `gettoniEmail.ts` a tenerne conto.
 */
export async function segnaVerificato(id: string): Promise<void> {
  const quando = new Date().toISOString()
  if (db) {
    db.prepare('UPDATE utenti SET verificato = ? WHERE id = ? AND verificato IS NULL').run(quando, id)
    return
  }
  await postgres.q('UPDATE myynd_utenti SET verificato = $1 WHERE id = $2 AND verificato IS NULL', [quando, id])
  const c = utenti.get(id)
  if (c && !c.verificato) c.verificato = quando
}

/**
 * Il conto, via — riga, sessioni, gettoni.
 *
 * **Non tocca i file di nessuno**: la cartella con l'indice e i documenti la
 * cancella `addio.ts`, che sa anche quale indice va chiuso prima. Qui c'è solo
 * quello che vive nel database dei conti.
 *
 * Le figlie si cancellano a mano anche dove il `ON DELETE CASCADE` c'è. Non è
 * cintura e bretelle: quel vincolo lo mette `postgres.schema()` alla creazione
 * della tabella, e `CREATE TABLE IF NOT EXISTS` non lo aggiunge a un database
 * nato prima. Una cancellazione che lascia dietro le sessioni di un conto che
 * non esiste più è esattamente la cosa che non deve poter succedere in nessuna
 * delle due installazioni.
 */
export async function cancella(id: string): Promise<boolean> {
  if (db) {
    db.prepare('DELETE FROM sessioni WHERE utente = ?').run(id)
    db.prepare('DELETE FROM gettoni WHERE utente = ?').run(id)
    db.prepare('DELETE FROM gettoni_email WHERE utente = ?').run(id)
    return Number(db.prepare('DELETE FROM utenti WHERE id = ?').run(id).changes) > 0
  }
  esigi()
  for (const [imp, s] of sessioni) if (s.utente === id) sessioni.delete(imp)
  await postgres.q('DELETE FROM myynd_sessioni WHERE utente = $1', [id])
  await postgres.q('DELETE FROM myynd_gettoni WHERE utente = $1', [id])
  await postgres.q('DELETE FROM myynd_gettoni_email WHERE utente = $1', [id])
  const { rows } = await postgres.q('DELETE FROM myynd_utenti WHERE id = $1 RETURNING id', [id])
  utenti.delete(id)
  return rows.length > 0
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
export async function cambiaPassword(id: string, nuova: string):
  Promise<{ ok: true; sessioniChiuse: number } | { ok: false; errore: string }> {
  if (nuova.length < 8) return { ok: false, errore: 'Almeno otto caratteri.' }

  // sale nuovo insieme alla password nuova: riusare quello vecchio vorrebbe
  // dire che due hash dello stesso conto si possono confrontare fra loro
  const sale = randomBytes(16).toString('hex')
  const hash = await impasta(nuova, sale)
  // che il conto esista lo dice la scrittura stessa, non la copia in memoria:
  // una replica appena accesa può non averlo ancora visto, e direbbe «non
  // esiste» a un conto che c'è
  const nonEsiste = { ok: false as const, errore: 'Questo conto non esiste.' }
  if (db) {
    const toccate = db.prepare('UPDATE utenti SET sale = ?, hash = ? WHERE id = ?').run(sale, hash, id).changes
    if (!toccate) return nonEsiste
  } else {
    const { rows } = await postgres.q('UPDATE myynd_utenti SET sale = $1, hash = $2 WHERE id = $3 RETURNING id', [sale, hash, id])
    if (!rows.length) return nonEsiste
    const c = utenti.get(id)
    if (c) { c.sale = sale; c.hash = hash }
    else await caricaUtente(id)
  }
  return { ok: true, sessioniChiuse: await chiudiTutte(id) }
}

/** Da usare nei test: un conto e la sua sessione, senza passare da una password. */
export const perProva = {
  apri,
  /** Una sessione con un token deciso da fuori: serve solo allo sviluppo. */
  async apriCon(token: string, utente: string): Promise<void> {
    const imp = impronta(token)
    const quando = new Date().toISOString()
    if (db) {
      db.prepare('INSERT OR REPLACE INTO sessioni (impronta, utente, quando) VALUES (?,?,?)').run(imp, utente, quando)
      return
    }
    esigi()
    await postgres.q(
      'INSERT INTO myynd_sessioni (impronta, utente, quando) VALUES ($1,$2,$3) ON CONFLICT (impronta) DO UPDATE SET utente = EXCLUDED.utente, quando = EXCLUDED.quando',
      [imp, utente, quando])
    sessioni.set(imp, { utente, quando, visto: Date.now() })
  },
  async svuota(): Promise<void> {
    if (db) { db.exec('DELETE FROM gettoni; DELETE FROM gettoni_email; DELETE FROM sessioni; DELETE FROM utenti'); return }
    await postgres.q('DELETE FROM myynd_gettoni')
    await postgres.q('DELETE FROM myynd_gettoni_email')
    await postgres.q('DELETE FROM myynd_sessioni')
    await postgres.q('DELETE FROM myynd_utenti')
    sessioni.clear()
    utenti.clear()
  },
  /** Come se questa replica si fosse appena accesa: la memoria vuota, il database intatto. */
  dimentica() {
    sessioni.clear()
    utenti.clear()
  }
}
