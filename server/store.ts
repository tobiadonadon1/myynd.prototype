// L'indice locale: un file SQLite in ~/.myynd/mente.db.
// Usa il modulo `node:sqlite` incluso in Node — nessuna dipendenza nativa.

import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { existsSync, mkdirSync, chmodSync, copyFileSync, openSync, readSync, closeSync, readdirSync, rmSync, statSync } from 'node:fs'
import { cartella } from './config.ts'
import * as chi from './chi.ts'
import { OSPITATO } from './ospitato.ts'
import { etichettato } from './etichetta-uso.ts'
import { radici, radice, termini } from './lingua.ts'
import { dovePortare } from './scrivania.ts'
import { contestoAttenzione, stessaRichiesta, mittenteAutomatico, indirizzoAttenzione, type ContestoAttenzione } from './rilevanza.ts'
// una foglia: da qui lo store sa quando scade una carta con una data
import { scadenzaDi } from './data-carta.ts'
import type { Ragione } from './feed-esiti.ts'

/*
 * Un indice per persona, aperto quando serve.
 *
 * Era `const db = new DatabaseSync(FILE)`: un database solo, deciso al
 * caricamento del modulo, per tutto il processo. Con più persone quella riga è
 * il difetto peggiore possibile — non un errore, ma la posta di qualcuno
 * dentro l'indice di qualcun altro, in silenzio.
 *
 * Adesso si apre il database della persona di cui è la richiesta in corso, e
 * si tiene aperto: SQLite regge bene qualche decina di file aperti, e
 * riaprirlo a ogni query vorrebbe dire rifare le migrazioni ogni volta.
 *
 * **Il `Proxy` è quello che rende questa modifica piccola invece che enorme.**
 * Centoventi query in questo file chiamano `db.prepare(...)` al momento di
 * girare: con `db` che rimanda al database giusto, tutte e centoventi
 * continuano a funzionare senza che se ne tocchi una — e non c'è nessuna
 * possibilità che qualcuna venga dimenticata, che è il modo in cui una
 * conversione a mano di centoventi righe fa uscire i dati dal recinto.
 */
const aperti = new Map<string, DatabaseSync>()

/*
 * Le cartelle che non si sono aperte, e quando.
 *
 * Un indice che non passa le migrazioni non va riprovato a ogni richiesta:
 * ogni tentativo riapriva il file, ne faceva una copia intera in `istantanee/`
 * e lasciava il descrittore aperto — con una scheda che interroga il server
 * ogni pochi secondi, un disco pieno in pochi minuti. Un minuto di memoria
 * basta a spezzare il giro e lascia riprovare quando la causa è passata.
 */
const guasti = new Map<string, { errore: Error; quando: number }>()
const GUASTO_VALE = 60_000

function apri(dove: string): DatabaseSync {
  if (!existsSync(dove)) mkdirSync(dove, { recursive: true, mode: 0o700 })
  const file = join(dove, 'mente.db')
  const d = new DatabaseSync(file)
  d.exec('PRAGMA journal_mode = WAL')
  d.exec('PRAGMA foreign_keys = ON')
  // un altro processo sullo stesso file — un ridistribuzione che si sovrappone,
  // `password.ts` lanciato sul volume vivo — non deve far esplodere la prima
  // scrittura: si aspetta un po', poi si dice
  d.exec('PRAGMA busy_timeout = 5000')

  // L'indice è una copia della casella e dei documenti: non deve essere
  // leggibile dagli altri utenti della macchina più di quanto lo sia config.json.
  for (const f of [file, `${file}-wal`, `${file}-shm`]) {
    try { if (existsSync(f)) chmodSync(f, 0o600) } catch { /* il filesystem può non supportarlo */ }
  }
  try {
    migra(d, file)
  } catch (e) {
    // il descrittore non deve restare appeso a un file che non useremo
    try { d.close() } catch { /* già chiuso */ }
    throw e
  }
  return d
}

/*
 * Quando è stato usato l'ultima volta ogni indice aperto.
 *
 * Con più persone i database aperti crescono con le persone e non si
 * chiudevano mai: ognuno tiene descrittori, WAL, cache di pagine. Chi non
 * apre Myynd da un'ora non ha bisogno del suo indice in memoria — riaprirlo
 * costa niente, le migrazioni a schema fermo sono un confronto di un numero.
 */
const ultimoUso = new Map<string, number>()
const INATTIVO = 30 * 60_000

function chiudiGliInattivi() {
  const ora = Date.now()
  for (const [dove, d] of aperti) {
    if (ora - (ultimoUso.get(dove) ?? 0) < INATTIVO) continue
    try { d.exec('PRAGMA optimize'); d.close() } catch { /* già chiuso */ }
    aperti.delete(dove)
    ultimoUso.delete(dove)
  }
}
setInterval(chiudiGliInattivi, 10 * 60_000).unref()

/*
 * I giri di sfondo non contano come «usato».
 *
 * Il giro delle automazioni passa da ogni conto ogni quarto d'ora e tocca il
 * database anche per chi non ha nessuna ricetta: con quello che segna l'uso,
 * la mezz'ora di inattività non scadeva mai per nessuno e gli indici restavano
 * aperti tutti, per sempre — cioè esattamente quello che questa cache doveva
 * evitare. Dentro `senzaToccare` si legge e si scrive come sempre, ma
 * l'orologio dell'inattività non si riarma.
 */
let disImpegnato = 0
export function senzaToccare<T>(f: () => T): T {
  disImpegnato++
  let r: T
  try { r = f() } catch (e) { disImpegnato--; throw e }
  // il giro delle automazioni è asincrono: il conto si chiude quando finisce
  // lui, non al primo `await` — altrimenti restava tutto aperto lo stesso
  if (r instanceof Promise) return (r as Promise<unknown>).finally(() => { disImpegnato-- }) as unknown as T
  disImpegnato--
  return r
}

function mio(): DatabaseSync {
  const dove = cartella()
  if (!disImpegnato) ultimoUso.set(dove, Date.now())
  let d = aperti.get(dove)
  if (!d) {
    const guasto = guasti.get(dove)
    if (guasto && Date.now() - guasto.quando < GUASTO_VALE) throw guasto.errore
    try {
      d = apri(dove)
    } catch (e) {
      const errore = e instanceof Error ? e : new Error(String(e))
      guasti.set(dove, { errore, quando: Date.now() })
      console.error(`myynd · non riesco ad aprire ${join(dove, 'mente.db')}:`, errore.message)
      throw errore
    }
    guasti.delete(dove)
    aperti.set(dove, d)
  }
  return d
}

/** Il database di chi sta facendo questa richiesta. */
const db = new Proxy({} as DatabaseSync, {
  get(_, chiave) {
    const d = mio() as unknown as Record<string | symbol, unknown>
    const v = d[chiave]
    return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(d) : v
  }
})

/**
 * Riversa nel file principale quello che sta nel WAL.
 *
 * Serve a chi si porta via l'indice: SQLite tiene le scritture recenti in un
 * file accanto, e copiare il solo `mente.db` senza averle riversate dentro
 * vuol dire portarsi via una mente ferma a settimane fa — che si apre
 * benissimo, e a cui mancano solo le ultime cose.
 */
export function riversaIlWal() {
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
}

/** Chiude e libera l'indice di una cartella sola: quello di chi sta importando, non di tutti. */
export function chiudiIndice(dove: string) {
  const d = aperti.get(dove)
  if (!d) return
  try { d.close() } catch { /* già chiuso */ }
  aperti.delete(dove)
}

/**
 * Questo file è un indice che sappiamo aprire?
 *
 * Si guarda *prima* di metterlo al posto di quello che c'è: l'intestazione di
 * SQLite, il controllo d'integrità, e uno schema non più nuovo di questa
 * versione. Senza, un pacco storto sostituiva una mente sana con un file che
 * non si apre più — e la vecchia era già stata cancellata.
 */
export function controlla(file: string) {
  const testa = Buffer.alloc(16)
  const fd = openSync(file, 'r')
  try { readSync(fd, testa, 0, 16, 0) } finally { closeSync(fd) }
  if (testa.toString('latin1') !== 'SQLite format 3\0') {
    throw new Error('Il file dentro il pacco non è un indice di Myynd.')
  }
  // un file con l'intestazione giusta e dentro niente di sensato non si apre
  // nemmeno: l'errore di SQLite («file is not a database») diventa la frase nostra
  let d: DatabaseSync
  try { d = new DatabaseSync(file, { readOnly: true }) } catch { throw new Error('L’indice dentro il pacco è danneggiato.') }
  try {
    let esito = ''
    try { esito = (d.prepare('PRAGMA quick_check').get() as { quick_check: string }).quick_check } catch { esito = 'guasto' }
    if (esito !== 'ok') throw new Error('L’indice dentro il pacco è danneggiato.')
    const v = (d.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
    if (v > MIGRAZIONI.length) {
      throw new Error('L’indice dentro il pacco viene da una versione più nuova di Myynd: aggiorna prima.')
    }
  } finally { try { d.close() } catch { /* già chiuso */ } }
}

/**
 * Riprendersi lo spazio che le cancellazioni hanno lasciato libero.
 *
 * SQLite non restituisce mai da solo le pagine di quello che si cancella: le
 * tiene in una lista libera e le riusa. Va bene finché si cancella poco, e
 * qui non si cancella poco — una fonte scollegata, una rilettura che
 * riconcilia, l'indice di ricerca rifatto da una migrazione. Su un volume che
 * si paga a gigabyte, un file grosso il doppio del suo contenuto è una bolletta.
 *
 * Si guarda prima quanto c'è da riprendersi, perché `VACUUM` riscrive il file
 * intero: farlo per due pagine è tutto costo e nessun guadagno. Sopra un
 * quarto del file, e almeno cinquemila pagine, vale la pena.
 */
/**
 * L'indice di ricerca dice ancora la verità?
 *
 * `rimettiLIndice` guarda la *forma* — la tabella è a contenuto esterno, i tre
 * trigger ci sono — e questo guarda il *contenuto*. Sono due guasti diversi:
 * con i trigger al loro posto l'indice non può più sfasarsi scrivendo, ma un
 * file danneggiato, un disco pieno a metà scrittura o una riga tolta a mano
 * lasciano documenti che ci sono e non si trovano. È il guasto peggiore che
 * questo prodotto possa avere, perché non somiglia a un guasto: somiglia a
 * «Myynd non sa niente di quel cliente».
 *
 * `integrity-check` e `rebuild` sono i due comandi che FTS5 offre apposta. Il
 * primo costa poco e gira una volta al giorno; il secondo rifà l'indice dai
 * documenti, che restano la verità.
 */
export function verificaLIndice(): { sano: boolean; rifatto: boolean } {
  try {
    /*
     * `rank` a 1, e non `integrity-check` liscio.
     *
     * Senza quell'uno il comando verifica che l'indice sia coerente **con sé
     * stesso**, e un indice a cui manca un documento intero lo è: non trova
     * niente di storto e risponde che va tutto bene. Con l'uno confronta anche
     * con la tabella dei contenuti, che è l'unica domanda che ci interessa —
     * «i documenti che ho si trovano tutti?». Provato a mano su SQLite 3.53.1:
     * liscio non se ne accorge, con l'uno sì.
     */
    db.exec("INSERT INTO ricerca(ricerca, rank) VALUES('integrity-check', 1)")
    return { sano: true, rifatto: false }
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    // un SQLite che non conosce quella forma non è un indice rotto: si dice e
    // si lascia stare, invece di rifare l'indice tutti i giorni per niente
    if (/no such column|misuse|syntax/i.test(m)) {
      console.warn('myynd · questo SQLite non sa confrontare l’indice con i documenti: salto il controllo')
      return { sano: true, rifatto: false }
    }
    console.error('myynd · l’indice di ricerca non è integro, lo rifaccio:', m)
  }
  try {
    db.exec("INSERT INTO ricerca(ricerca) VALUES('rebuild')")
    return { sano: false, rifatto: true }
  } catch (e) {
    console.error('myynd · non riesco a rifare l’indice di ricerca:', e instanceof Error ? e.message : e)
    return { sano: false, rifatto: false }
  }
}

export function compatta(): { fatto: boolean; liberate: number } {
  const libere = (db.prepare('PRAGMA freelist_count').get() as { freelist_count: number }).freelist_count
  const totali = (db.prepare('PRAGMA page_count').get() as { page_count: number }).page_count
  if (libere < 5000 || libere < totali / 4) return { fatto: false, liberate: libere }
  db.exec('VACUUM')
  return { fatto: true, liberate: libere }
}

/** Da usare quando si finisce con una persona: chiude e libera. */
export function chiudiIndici() {
  for (const d of aperti.values()) { try { d.close() } catch { /* già chiuso */ } }
  aperti.clear()
}

/**
 * Una colonna aggiunta solo se non c'è già.
 *
 * Serve alle quattro colonne che anche `rimetti()` sa rimettere. Le due cose
 * possono incontrarsi, ed è già successo: `rimetti()` gira all'apertura, vede
 * che `documenti.filo` manca su un database fermo alla 20, e la aggiunge —
 * poi tocca alla migrazione 21 → 22, che la aggiunge di nuovo e muore su
 * «duplicate column name: filo». Da lì l'indice non si apre più.
 *
 * La lezione è che una riparazione automatica e una migrazione parlano della
 * stessa colonna, e allora devono essere tutte e due indifferenti a chi è
 * arrivato prima. `rimetti()` lo era già; questa lo rende vero anche
 * dall'altra parte.
 */
function colonna(d: DatabaseSync, tabella: string, nome: string, tipo: string) {
  const ci = d.prepare(`PRAGMA table_info(${tabella})`).all() as { name: string }[]
  if (ci.some(c => c.name === nome)) return
  d.exec(`ALTER TABLE ${tabella} ADD COLUMN ${nome} ${tipo}`)
}

/**
 * L'indirizzo dentro «Mario Rossi <mario@esempio.it>», in minuscolo.
 *
 * Si calcola quando il documento entra, non quando lo si cerca. La domanda
 * «questo indirizzo l'ho già visto?» si fa ogni volta che si prepara una mail,
 * e prima era `LOWER(autore) LIKE '%…%'`: una lettura di tutto l'indice, con
 * il server fermo, per rispondere sì o no.
 */
export function indirizzoDi(autore: string | null | undefined): string | null {
  if (!autore) return null
  const m = autore.match(/[^\s<>()[\],;:"']+@[^\s<>()[\],;:"']+/)
  return m ? m[0].toLowerCase() : null
}

/*
 * L'indice full-text che non tiene una seconda copia del testo.
 *
 * `content = 'documenti'` dice a FTS5 di andarsi a rileggere le colonne da
 * `documenti` quando gli servono, invece di conservarsele. Prima il corpo di
 * ogni documento stava scritto tre volte — nella tabella, dentro l'FTS, e una
 * quarta come radici — cioè quattro o cinque gigabyte per ogni gigabyte di
 * testo vero, su un volume che si paga a gigabyte.
 *
 * Il prezzo è che l'FTS non sa più cosa c'era scritto prima: per togliere una
 * riga dall'indice bisogna passargli i **vecchi** valori con il comando
 * 'delete'. Un `DELETE FROM ricerca` non lo fa e non dà errore — lascia i
 * termini vecchi attaccati a quel rowid, e da lì in poi la ricerca riporta
 * indietro righe che non esistono più. Per questo la manutenzione non sta
 * nelle chiamate ma in tre trigger sulla tabella: sono una dozzina di posti
 * che scrivono su `documenti`, e basta dimenticarne uno perché l'indice
 * marcisca in silenzio.
 */
const RICERCA = `
  CREATE VIRTUAL TABLE ricerca USING fts5(
    titolo, corpo, autore, radici,
    content = 'documenti', content_rowid = 'rid',
    tokenize = "unicode61 remove_diacritics 2"
  );

  -- Il vocabolario dell'indice: i termini, senza i documenti. Non occupa
  -- niente (è una vista sull'indice) ed è quello che permette di cercare un
  -- pezzo di parola — «5428» dentro un IBAN — senza leggere nessun corpo.
  CREATE VIRTUAL TABLE ricerca_termini USING fts5vocab('ricerca', 'row');
`

const TRIGGER_RICERCA = `
  CREATE TRIGGER ricerca_dopo_inserimento AFTER INSERT ON documenti BEGIN
    INSERT INTO ricerca (rowid, titolo, corpo, autore, radici)
    VALUES (new.rid, new.titolo, new.corpo, new.autore, new.radici);
  END;

  CREATE TRIGGER ricerca_dopo_cancellazione AFTER DELETE ON documenti BEGIN
    INSERT INTO ricerca (ricerca, rowid, titolo, corpo, autore, radici)
    VALUES ('delete', old.rid, old.titolo, old.corpo, old.autore, old.radici);
  END;

  /*
   * Il WHEN non è un risparmio da poco. Il filo e «l'ho scritta io» si
   * scrivono su email che non sono cambiate — la prima lettura dopo un
   * aggiornamento ne tocca migliaia — e senza questa condizione ognuna
   * rifarebbe l'indice di tutto il suo corpo per una chiave che nell'indice
   * non c'è nemmeno.
   */
  CREATE TRIGGER ricerca_dopo_modifica AFTER UPDATE ON documenti
  WHEN old.titolo IS NOT new.titolo OR old.corpo IS NOT new.corpo
    OR old.autore IS NOT new.autore OR old.radici IS NOT new.radici
  BEGIN
    INSERT INTO ricerca (ricerca, rowid, titolo, corpo, autore, radici)
    VALUES ('delete', old.rid, old.titolo, old.corpo, old.autore, old.radici);
    INSERT INTO ricerca (rowid, titolo, corpo, autore, radici)
    VALUES (new.rid, new.titolo, new.corpo, new.autore, new.radici);
  END;
`

/** Quante righe per volta, quando si rifà l'indice da capo. */
const PEZZO_INDICE = 400
/** Sotto questo numero di documenti nessuno si accorge di niente: si tace. */
const VALE_DIRLO = 20_000

/**
 * `documenti.radici` e l'indice full-text, rifatti da capo.
 *
 * A pezzi, e dicendo a che punto è. Non è cosmetica: su una casella di
 * qualche gigabyte questa è l'unica migrazione che dura minuti, e minuti di
 * silenzio all'avvio non si distinguono da un blocco — chi ospita riavvia il
 * processo a metà, e allora sì che diventa un guaio. A pezzi il lavoro è lo
 * stesso; quello che cambia è che si vede.
 *
 * Le radici si calcolano qui in JavaScript (è `lingua.ts` che sa l'italiano),
 * quindi ogni corpo passa una volta dal processo; l'indice invece si versa in
 * SQL, senza far uscire il testo dal database.
 */
function rifaiLIndice(d: DatabaseSync) {
  const quanti = (d.prepare('SELECT COUNT(*) AS n FROM documenti').get() as { n: number }).n
  const grosso = quanti >= VALE_DIRLO
  if (grosso) console.log(`myynd · rifaccio l'indice di ricerca su ${quanti} documenti: ci vuole un po'`)

  const conta = (cosa: string) => {
    let prossimo = VALE_DIRLO
    return (fatti: number) => {
      if (!grosso || fatti < prossimo) return
      console.log(`myynd · ${cosa}: ${fatti} di ${quanti}`)
      prossimo += VALE_DIRLO
    }
  }

  // 1. le radici, e l'indirizzo dell'autore. Nessun trigger è ancora in piedi
  //    e la vecchia tabella FTS non c'è più: queste UPDATE non costano indice.
  const leggi = d.prepare('SELECT rid, titolo, corpo, autore FROM documenti WHERE rid > ? ORDER BY rid LIMIT ?')
  const scrivi = d.prepare('UPDATE documenti SET radici = ?, autoreIndirizzo = ? WHERE rid = ?')
  const dilloRadici = conta('radici')
  let da = 0
  let fatti = 0
  for (;;) {
    const righe = leggi.all(da, PEZZO_INDICE) as
      { rid: number; titolo: string; corpo: string; autore: string | null }[]
    if (!righe.length) break
    for (const r of righe) {
      scrivi.run(radici(`${r.titolo} ${r.corpo} ${r.autore ?? ''}`), indirizzoDi(r.autore), r.rid)
      da = r.rid
    }
    fatti += righe.length
    dilloRadici(fatti)
  }

  // 2. l'indice, versato dal database senza passare da qui
  d.exec(RICERCA)
  const versa = d.prepare(`
    INSERT INTO ricerca (rowid, titolo, corpo, autore, radici)
    SELECT rid, titolo, corpo, autore, radici FROM documenti WHERE rid > ? AND rid <= ?
  `)
  const finePezzo = d.prepare('SELECT MAX(rid) AS m FROM (SELECT rid FROM documenti WHERE rid > ? ORDER BY rid LIMIT ?)')
  const dilloIndice = conta('indice di ricerca')
  da = 0
  fatti = 0
  for (;;) {
    const fine = (finePezzo.get(da, PEZZO_INDICE) as { m: number | null }).m
    if (fine === null) break
    fatti += Number(versa.run(da, fine).changes ?? 0)
    da = fine
    dilloIndice(fatti)
  }
  if (grosso) console.log(`myynd · indice di ricerca rifatto: ${fatti} documenti`)
}

/**
 * Le tabelle nate dalla migrazione 48 in poi, ognuna col suo `CREATE` e i suoi
 * indici, scritte una volta sola.
 *
 * La migrazione che le fa nascere esegue questa stringa, e `rimetti()` la
 * riesegue a ogni apertura: `COLONNE` sa rimettere una colonna, non una
 * tabella, e una migrazione saltata (una voce infilata in mezzo alla lista)
 * lascerebbe il database senza la tabella intera, in silenzio. Tutto è
 * `IF NOT EXISTS`, quindi riseguirla su un database sano non fa niente.
 *
 * **Questa è la forma con cui la tabella è nata, e non si cambia.** Una
 * colonna aggiunta dopo va in una migrazione nuova con `colonna()`, e in
 * `COLONNE`: `rimetti()` crea prima le tabelle che mancano e poi rimette le
 * colonne, così anche una tabella ricreata qui arriva completa.
 */
const TABELLE = {
  segnali: `
    CREATE TABLE IF NOT EXISTS segnali (
      id TEXT PRIMARY KEY, genere TEXT NOT NULL, quando TEXT NOT NULL, giorno TEXT NOT NULL,
      chi TEXT, progetto TEXT, ref TEXT, valore REAL, dati TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_segnali_genere ON segnali(genere, giorno);
    CREATE INDEX IF NOT EXISTS idx_segnali_giorno ON segnali(giorno);
  `,
  sessioni_app: `
    CREATE TABLE IF NOT EXISTS sessioni_app (
      id INTEGER PRIMARY KEY AUTOINCREMENT, bundle TEXT NOT NULL, app TEXT NOT NULL, titolo TEXT,
      inizio TEXT NOT NULL, fine TEXT NOT NULL, secondi INTEGER NOT NULL, giorno TEXT NOT NULL,
      progetto TEXT, cartella TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sessioni_app_giorno ON sessioni_app(giorno);
  `,
  agenda_viste: `
    CREATE TABLE IF NOT EXISTS agenda_viste (
      uid TEXT PRIMARY KEY, titolo TEXT, inizio TEXT, fine TEXT, originale TEXT,
      stato TEXT, mio TEXT, visto TEXT NOT NULL
    );
  `,
  previsioni: `
    CREATE TABLE IF NOT EXISTS previsioni (
      id TEXT PRIMARY KEY, giorno TEXT NOT NULL, genere TEXT NOT NULL, ref TEXT NOT NULL,
      probabilita REAL NOT NULL, dati TEXT NOT NULL, fatta TEXT NOT NULL,
      esito TEXT, verificata TEXT, prova TEXT,
      UNIQUE (giorno, genere, ref)
    );
  `,
  punteggi: `
    CREATE TABLE IF NOT EXISTS punteggi (
      giorno TEXT PRIMARY KEY, giuste INTEGER NOT NULL, sbagliate INTEGER NOT NULL,
      annullate INTEGER NOT NULL, brier REAL, base REAL, calcolato TEXT NOT NULL
    );
  `,
  abitudini: `
    CREATE TABLE IF NOT EXISTS abitudini (
      chiave TEXT PRIMARY KEY, genere TEXT NOT NULL, dati TEXT NOT NULL, prova TEXT NOT NULL,
      fiducia REAL NOT NULL, stato TEXT NOT NULL DEFAULT 'osservata', testoSuo TEXT,
      visto TEXT NOT NULL, aggiornato TEXT NOT NULL, tolta TEXT
    );
  `,
  fiducia: `
    CREATE TABLE IF NOT EXISTS fiducia (
      genere TEXT PRIMARY KEY, giuste INTEGER NOT NULL, sbagliate INTEGER NOT NULL,
      gradino TEXT NOT NULL DEFAULT 'guarda', aggiornato TEXT NOT NULL
    );
  `,
  mancate: `
    CREATE TABLE IF NOT EXISTS mancate (
      id TEXT PRIMARY KEY, genere TEXT NOT NULL, doc TEXT, prova TEXT, mittente TEXT,
      progetto TEXT, fase TEXT, motivo TEXT, certezza TEXT, arrivato TEXT,
      agito TEXT NOT NULL, contesto TEXT, quando TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mancate_quando ON mancate(quando);
  `,
  feed_esame: `
    CREATE TABLE IF NOT EXISTS feed_esame (
      doc TEXT PRIMARY KEY, fase TEXT NOT NULL, motivo TEXT, quando TEXT NOT NULL
    );
  `,
  misure_compiti: `
    CREATE TABLE IF NOT EXISTS misure_compiti (
      compito TEXT PRIMARY KEY, affidato TEXT NOT NULL, modo TEXT, origine TEXT,
      domande INTEGER NOT NULL DEFAULT 0, presunte INTEGER NOT NULL DEFAULT 0,
      cercate INTEGER NOT NULL DEFAULT 0, correzioni INTEGER NOT NULL DEFAULT 0,
      mossa TEXT, genere TEXT, tipo TEXT, consegnato TEXT, inviato TEXT, via TEXT,
      distanza REAL, parole INTEGER, classe TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_misure_affidato ON misure_compiti(affidato);
  `,
  prove: `
    CREATE TABLE IF NOT EXISTS prove (
      id TEXT PRIMARY KEY, automazione TEXT NOT NULL, tipo TEXT NOT NULL, origine TEXT,
      impronta TEXT, ricetta TEXT, dal TEXT, al TEXT, stato TEXT NOT NULL,
      documenti INTEGER, occorrenze INTEGER, gettoni INTEGER, guaio TEXT,
      creata TEXT NOT NULL, finita TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_prove_auto ON prove(automazione, creata);
  `,
  esiti: `
    CREATE TABLE IF NOT EXISTS esiti (
      id TEXT PRIMARY KEY, prova TEXT NOT NULL, automazione TEXT NOT NULL, quando TEXT,
      tipo TEXT NOT NULL, testo TEXT, nota TEXT, doc TEXT, docs TEXT, inLista TEXT,
      modo TEXT, attrezzi TEXT, proposta TEXT, bozza TEXT, fonti TEXT, revisione TEXT,
      stato TEXT NOT NULL, giudizio TEXT, perche TEXT, jev REAL, aPosteriori TEXT,
      risposta TEXT, suo TEXT, compito TEXT, creato TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_esiti_prova ON esiti(prova);
    CREATE INDEX IF NOT EXISTS idx_esiti_doc ON esiti(automazione, doc);
  `,
  salute_fonti: `
    CREATE TABLE IF NOT EXISTS salute_fonti (
      giorno TEXT NOT NULL, fonte TEXT NOT NULL,
      letture INTEGER NOT NULL DEFAULT 0, pulite INTEGER NOT NULL DEFAULT 0,
      incomplete INTEGER NOT NULL DEFAULT 0, guai INTEGER NOT NULL DEFAULT 0,
      fila INTEGER NOT NULL DEFAULT 0, documenti INTEGER NOT NULL DEFAULT 0,
      tolti INTEGER NOT NULL DEFAULT 0, totale INTEGER, durata INTEGER NOT NULL DEFAULT 0,
      sonda TEXT, rimedio TEXT, frase TEXT, versione TEXT, prima TEXT, ultima TEXT, verdetto TEXT,
      PRIMARY KEY (giorno, fonte)
    );
  `,
  stato_fonti: `
    CREATE TABLE IF NOT EXISTS stato_fonti (
      fonte TEXT PRIMARY KEY, motivo TEXT NOT NULL, rimedio TEXT, frase TEXT,
      dal TEXT NOT NULL, fila INTEGER NOT NULL DEFAULT 1, visto TEXT NOT NULL
    );
  `,
  // P5 · le convinzioni scordate a mano: una deduzione uguale non torna
  convinzioni_tolte: 'CREATE TABLE IF NOT EXISTS convinzioni_tolte (id TEXT PRIMARY KEY, quando TEXT NOT NULL);'
} as const

/**
 * Gli indici su colonne arrivate dopo, in tabelle vecchie.
 *
 * Stanno a parte da `TABELLE` perché si possono creare solo quando la colonna
 * c'è: `rimetti()` li riesegue dopo aver rimesso le colonne.
 */
const INDICI = [
  'CREATE INDEX IF NOT EXISTS idx_doc_risponde ON documenti(risponde)',
  'CREATE INDEX IF NOT EXISTS idx_compiti_chiuso ON compiti(chiuso)'
]

/**
 * Le migrazioni, in ordine: l'indice i porta dallo schema i allo schema i+1.
 * `PRAGMA user_version` dice dove siamo. Aggiungere uno schema significa
 * aggiungere una voce in fondo, mai modificarne una già uscita — quella l'ha
 * già girata il database di qualcuno.
 *
 * La versione precedente qui faceva `DROP TABLE documenti` quando non
 * riconosceva lo schema. Non era teorico: chi aveva installato Myynd prima
 * della colonna `rid` si è visto svuotare l'indice a un aggiornamento.
 */
const MIGRAZIONI: ((d: DatabaseSync) => void)[] = [
  // 0 → 1 · lo schema di partenza, scritto in modo idempotente perché i
  //         database già esistenti lo hanno di fatto già applicato
  d => {
    d.exec(`
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
    // chi arriva da uno schema senza `rid` non ha un indice recuperabile:
    // la tabella si ricrea, ma i documenti si rileggono dalle fonti
    const col = d.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('documenti') WHERE name = 'rid'").get() as { n: number }
    if (!col.n) {
      d.exec('ALTER TABLE documenti RENAME TO documenti_senza_rid')
      d.exec(`
        CREATE TABLE documenti (
          rid INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL,
          fonte TEXT NOT NULL, tipo TEXT NOT NULL, titolo TEXT NOT NULL, corpo TEXT NOT NULL,
          autore TEXT, percorso TEXT, quando TEXT, gruppo TEXT, indicizzato TEXT NOT NULL)
      `)
      d.exec(`
        INSERT INTO documenti (id, fonte, tipo, titolo, corpo, autore, percorso, quando, gruppo, indicizzato)
        SELECT id, fonte, tipo, titolo, corpo, autore, percorso, quando, gruppo, indicizzato
        FROM documenti_senza_rid
      `)
      d.exec('DROP TABLE documenti_senza_rid')
      // La tabella è stata ricreata da zero: gli indici del blocco qui sopra
      // erano stati creati su quella *vecchia* e se ne sono andati con lei.
      // Senza questa riga chi arriva dallo schema legacy resta con
      // `documenti` senza indici — e non se ne accorge finché l'indice non è
      // abbastanza grande da far strisciare ogni ricerca.
      d.exec(`
        CREATE INDEX IF NOT EXISTS idx_doc_fonte  ON documenti(fonte);
        CREATE INDEX IF NOT EXISTS idx_doc_quando ON documenti(quando DESC);
        CREATE INDEX IF NOT EXISTS idx_doc_gruppo ON documenti(gruppo);
      `)
    }
  },

  // 1 → 2 · la ricerca impara l'italiano: accenti pieghevoli e una colonna di
  //         radici, così "fatture" trova "fattura". La tabella FTS si
  //         ricostruisce da `documenti`, che è la fonte di verità.
  d => {
    d.exec('DROP TABLE IF EXISTS ricerca')
    d.exec(`
      CREATE VIRTUAL TABLE ricerca USING fts5(
        titolo, corpo, autore, radici,
        tokenize = "unicode61 remove_diacritics 2"
      )
    `)
    const righe = d.prepare('SELECT rid, titolo, corpo, autore FROM documenti').all() as
      { rid: number; titolo: string; corpo: string; autore: string | null }[]
    const ins = d.prepare('INSERT INTO ricerca (rowid, titolo, corpo, autore, radici) VALUES (?,?,?,?,?)')
    for (const r of righe) {
      ins.run(r.rid, r.titolo, r.corpo, r.autore ?? '', radici(`${r.titolo} ${r.corpo} ${r.autore ?? ''}`))
    }
  },

  // 2 → 3 · l'accesso smette di cadere a ogni riavvio del server. Si salva
  //         l'impronta del token, mai il token: chi legge il file non entra.
  d => {
    d.exec(`
      CREATE TABLE IF NOT EXISTS sessioni (
        impronta TEXT PRIMARY KEY,
        creata   TEXT NOT NULL,
        scade    TEXT NOT NULL
      )
    `)
  },

  // 3 → 4 · la memoria: quello che Myynd sa di te, separato da quello che ha
  //         letto. I documenti sono fatti; qui sta il giudizio.
  d => {
    d.exec(`
      -- Una convinzione è una frase su di te che Myynd tiene per vera adesso.
      -- Non si cancella mai: quando ne arriva una che la contraddice, alla
      -- vecchia si mette una data di fine. Così "fino a marzo pensavo X"
      -- resta una domanda a cui si può rispondere.
      CREATE TABLE IF NOT EXISTS convinzioni (
        id          TEXT PRIMARY KEY,
        enunciato   TEXT NOT NULL,
        ambito      TEXT NOT NULL,      -- 'persona' | 'azienda' | 'cliente:rossi'
        genere      TEXT NOT NULL,      -- esplicita | dedotta | indotta
        fiducia     REAL NOT NULL,      -- 0..1
        premesse    TEXT,               -- JSON: da cosa è stata dedotta
        prova       TEXT,               -- JSON: la citazione, congelata alla scrittura
        origine     TEXT NOT NULL,      -- onboarding | correzione | conversazione | mano
        dal         TEXT NOT NULL,
        al          TEXT,               -- NULL = vale ancora
        sostituisce TEXT,
        creata      TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_conv_ambito ON convinzioni(ambito, al);

      -- Un blocco è un pezzo di contesto sempre presente, con un tetto di
      -- caratteri: il tetto non è un dettaglio, è ciò che costringe a
      -- consolidare invece di accumulare, e tiene il prompt in cache.
      CREATE TABLE IF NOT EXISTS blocchi (
        etichetta   TEXT PRIMARY KEY,
        descrizione TEXT NOT NULL,
        valore      TEXT NOT NULL,
        tetto       INTEGER NOT NULL DEFAULT 700,
        aggiornato  TEXT NOT NULL
      );
    `)
  },

  // 4 → 5 · il feed smette di essere un monologo: si può rispondere a una voce,
  //         e quello che si risponde resta attaccato alla voce stessa.
  d => {
    d.exec(`ALTER TABLE feed ADD COLUMN motivo TEXT`)
    d.exec(`ALTER TABLE feed ADD COLUMN risposto TEXT`)
  },

  // 5 → 6 · le domande che fa lui.
  //
  //   Una tabella sola, e severa. `tema` è unico: sullo stesso argomento non si
  //   chiede due volte, mai — è la garanzia che rende il meccanismo tollerabile.
  //   `ignorata` non è un fallimento da riprovare: è una risposta anche quella.
  d => {
    d.exec(`
      CREATE TABLE IF NOT EXISTS domande (
        id        TEXT PRIMARY KEY,
        tema      TEXT NOT NULL UNIQUE,
        testo     TEXT NOT NULL,      -- la domanda, come gliela fa
        spunto    TEXT NOT NULL,      -- JSON: i titoli che l'hanno fatta nascere
        stato     TEXT NOT NULL DEFAULT 'aperta',   -- aperta | risposta | ignorata
        risposta  TEXT,
        esito     TEXT,               -- cosa è cambiato, in una riga, per dirglielo
        creata    TEXT NOT NULL,
        chiusa    TEXT
      )
    `)
  },

  // 6 → 7 · i compiti: quello che hai deciso di fare, tenuto da te.
  //
  //   Il feed nasce dai documenti e muore quando gli rispondi; un compito nasce
  //   da te e resta finché non è fatto. Sono due cose diverse e vanno tenute
  //   separate, altrimenti la lista si riempie di roba che non hai scritto tu.
  //
  //   `id` lo genera il client e non il database: un compito dettato in
  //   macchina e uno scritto sul Mac devono poter nascere con lo stesso nome
  //   senza chiedere il permesso a nessuno. `aggiornato` serve alla stessa
  //   ragione — è quello che, il giorno che ci sarà un telefono, dice chi ha
  //   l'ultima parola. `ordine` è una chiave frazionaria (vedi ordine.ts):
  //   trascinare una riga tocca quella riga e basta.
  d => {
    d.exec(`
      CREATE TABLE IF NOT EXISTS compiti (
        id         TEXT PRIMARY KEY,
        testo      TEXT NOT NULL,
        nota       TEXT,
        quando     TEXT NOT NULL DEFAULT 'oggi',    -- oggi | settimana | poi
        stato      TEXT NOT NULL DEFAULT 'aperto',  -- aperto | delegato | pronto | fatto | lasciato
        ordine     TEXT NOT NULL,                   -- chiave frazionaria, si confronta come testo
        origine    TEXT NOT NULL DEFAULT 'mano',    -- mano | feed | voce
        voce       TEXT,                            -- feed.id da cui è nato, se ne viene
        doc        TEXT,                            -- documenti.id di riferimento
        chiesto    TEXT,                            -- ISO: quando l'hai affidato a Myynd
        risultato  TEXT,                            -- la bozza che ha preparato
        fonti      TEXT,                            -- JSON: Fonte[], da dove l'ha presa
        guaio      TEXT,                            -- perché non ce l'ha fatta, in italiano
        creato     TEXT NOT NULL,
        aggiornato TEXT NOT NULL,
        chiuso     TEXT,
        esito      TEXT,                            -- le tue parole chiudendolo

        -- Un compito tolto non si cancella: si segna la data in cui è sparito.
        -- Sembra pedanteria su una lista della spesa, e non lo è: il giorno che
        -- questa riga esiste anche su un telefono, una riga cancellata *davvero*
        -- è una riga che l'altro dispositivo non saprà mai di dover togliere, e
        -- riapparirà da sola. È l'unica scelta qui dentro che non si può
        -- correggere dopo senza toccare i database già installati.
        sparito    TEXT,
        versione   INTEGER NOT NULL DEFAULT 1
      );

      CREATE INDEX IF NOT EXISTS idx_compiti_stato ON compiti(stato, ordine);
      CREATE INDEX IF NOT EXISTS idx_compiti_agg   ON compiti(aggiornato);
    `)
  }
,

  // 7 → 8 · quanto se ne occupa lui.
  //
  //   Non è uno stato — quelli dicono a che punto è — ma una *scelta*: questa
  //   la faccio io, di questa voglio una bozza, questa portala fino in fondo.
  //   Vive accanto allo stato perché resta vera anche quando il compito torna
  //   aperto: se hai deciso che di quella cosa vuoi una bozza, lo vuoi ancora.
  d => {
    // io | bozza | tutto — il commento sta qui e non in coda alla riga: un
    // `--` come ultima cosa dentro l'exec si mangia il fine istruzione, e
    // SQLite risponde «incomplete input»
    d.exec(`ALTER TABLE compiti ADD COLUMN modo TEXT NOT NULL DEFAULT 'io';`)
  }
,

  // 8 → 9 · le voci che promettevano un documento inesistente.
  //
  //   Per un pezzo il modello, invece dell'identificativo, ha copiato il
  //   *titolo* del documento: sono due righe vicine nel materiale e per un file
  //   sul disco si somigliano molto. Quel titolo è finito in `feed.doc`, dove
  //   non corrisponde a niente, e «Apri il documento» rispondeva «non trovato»
  //   per sempre. Adesso lo schema non lo permette più, ma le righe già scritte
  //   restano rotte: qui si riparano, che è quasi sempre possibile perché il
  //   titolo sbagliato è comunque il titolo giusto di un documento vero.
  d => {
    const rotte = d.prepare(`
      SELECT f.id, f.doc FROM feed f
      WHERE f.doc IS NOT NULL AND f.doc <> ''
        AND NOT EXISTS (SELECT 1 FROM documenti WHERE id = f.doc)
    `).all() as { id: string; doc: string }[]
    if (!rotte.length) return

    const perTitolo = d.prepare('SELECT id FROM documenti WHERE titolo = ?')
    const aggiusta = d.prepare('UPDATE feed SET doc = ? WHERE id = ?')
    let riparate = 0
    for (const r of rotte) {
      const trovati = perTitolo.all(r.doc) as { id: string }[]
      // un titolo solo, un documento solo: si può correggere senza indovinare.
      // Con due documenti omonimi non si sa quale intendesse, e allora è meglio
      // togliere il bottone che aprire quello sbagliato.
      aggiusta.run(trovati.length === 1 ? trovati[0].id : null, r.id)
      if (trovati.length === 1) riparate++
    }
    console.log(`myynd · ${riparate} di ${rotte.length} voci del feed ricollegate al loro documento`)
  }
,

  // 9 → 10 · quello che ha fatto davvero.
  //
  //   Da qui in avanti Myynd può mandare un'email. Il brief è netto su cosa
  //   serve perché una cosa del genere sia accettabile: «una pagina, in
  //   italiano semplice, che dice cosa il cervello può leggere, cosa può
  //   scrivere e cosa esce dal computer. Sotto, un elenco leggibile di tutto
  //   quello che ha fatto davvero, per giorno.»
  //
  //   Questa tabella è quell'elenco. Non è un log di sistema: è la prova che
  //   una cosa uscita da qui è uscita perché l'hai voluta tu, con la data e il
  //   destinatario. Non si cancella e non si riscrive — un registro che si può
  //   correggere non è un registro.
  // 10 → 11 · le automazioni, e cosa hanno fatto.
  //
  //   La *ricetta* non sta qui: sta in un file, scritta da chi costruisce
  //   Myynd, uguale per tutta un'azienda. Qui sta solo quello che riguarda
  //   questa installazione — se l'hai spenta, quand'è girata l'ultima volta,
  //   quante volte, e com'è andata.
  //
  //   Tenerle separate è quello che permette di cambiare una ricetta senza
  //   perdere la storia, e di spegnerne una senza toccare il file di nessun
  //   altro.
  d => {
    d.exec(`
      CREATE TABLE IF NOT EXISTS automazioni (
        id        TEXT PRIMARY KEY,
        spenta    INTEGER NOT NULL DEFAULT 0,
        ultima    TEXT,
        quante    INTEGER NOT NULL DEFAULT 0,
        esito     TEXT,
        guaio     TEXT
      );
    `)
  }
,

  d => {
    d.exec(`
      CREATE TABLE IF NOT EXISTS azioni (
        id        TEXT PRIMARY KEY,
        tipo      TEXT NOT NULL,      -- email
        verso     TEXT,               -- a chi è andata
        cosa      TEXT NOT NULL,      -- l'oggetto, o una riga che la descrive
        compito   TEXT,               -- da quale riga della lista è nata
        esito     TEXT NOT NULL,      -- fatta | fallita
        dettaglio TEXT,               -- il perché, se è andata storta
        quando    TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_azioni_quando ON azioni(quando DESC);
    `)
  }
,

  // 11 → 12 · la tabella delle automazioni, per chi non l'ha mai vista.
  //
  //   La voce che la crea è stata infilata *in mezzo* all'elenco, prima di
  //   quella di `azioni`, invece che in fondo. Per un indice nuovo non cambia
  //   niente — girano tutte — ma chi era già allo schema 10 ha eseguito solo
  //   l'ultima voce, cioè `azioni`, che aveva già: la tabella `automazioni`
  //   non è mai nata. Due minuti dopo l'avvio il primo giro cercava una
  //   tabella che non c'era e il server moriva con «no such table:
  //   automazioni» — e chi aveva l'app aperta non vedeva un'automazione
  //   rotta: vedeva Myynd che non rispondeva più.
  //
  //   È esattamente il guaio che la regola in cima descrive. Questa voce lo
  //   ripara dove è successo, ed è in fondo: dove vanno.
  d => {
    d.exec(`
      CREATE TABLE IF NOT EXISTS automazioni (
        id        TEXT PRIMARY KEY,
        spenta    INTEGER NOT NULL DEFAULT 0,
        ultima    TEXT,
        quante    INTEGER NOT NULL DEFAULT 0,
        esito     TEXT,
        guaio     TEXT
      );
    `)
  }
,

  // 12 → 13 · quello che Myynd propone di fare, e che aspetta te.
  //
  //   Fino a qui un compito poteva contenere solo parole: la bozza di un'email,
  //   un riassunto, una domanda. Bastava finché l'unica cosa che usciva era
  //   testo che una persona rilegge e manda.
  //
  //   «Metti via queste ventitré newsletter» non è testo. È un elenco di
  //   messaggi e un verbo, e va scritto in un posto dove non si può confondere
  //   con la prosa — perché il bottone che lo esegue tocca la casella di
  //   qualcuno, e quello che tocca dev'essere esattamente quello che gli è
  //   stato mostrato. Perciò una colonna sua: JSON, `{ azione, voci[] }`.
  //
  //   La regola non cambia di una virgola. La proposta *resta* una proposta:
  //   nasce, si vede per intero, e non succede niente finché non la premi.
  d => {
    d.exec('ALTER TABLE compiti ADD COLUMN proposta TEXT')
  }
,

  // 13 → 14 · quello che gli serve sapere, con le risposte già pronte.
  //
  //   Quando non ce la fa da solo, prima scriveva un paragrafo e lasciava una
  //   casella vuota. Il lavoro di capire cosa mancasse restava addosso a chi
  //   leggeva — cioè la parte faticosa tornava indietro intera.
  //
  //   Qui stanno le stesse cose dette come si dicono a voce: tre domande, due o
  //   quattro risposte possibili ciascuna. La casella resta lì sotto per quello
  //   che le opzioni non prevedono.
  d => {
    d.exec('ALTER TABLE compiti ADD COLUMN chieste TEXT')
  }
,

  // 14 → 15 · la rassegna: quello che succede fuori.
  //
  //   È l'unica tabella di questo indice che non contiene niente di chi usa
  //   Myynd. Sono titoli di giornale, pubblici, gli stessi per tutti — e stanno
  //   qui e non in memoria per una ragione sola: `letta`. Sapere cosa hai già
  //   guardato è quello che la mattina dopo distingue una rassegna nuova da una
  //   pagina che si ripete, e quella riga deve sopravvivere a un riavvio.
  //
  //   Niente chiave esterna verso `documenti`: una notizia non è un tuo
  //   documento, non finisce nella ricerca, non entra nella mappa e non deve
  //   mai poter diventare un compito.
  d => {
    d.exec(`
      CREATE TABLE IF NOT EXISTS notizie (
        id        TEXT PRIMARY KEY,
        titolo    TEXT NOT NULL,
        riassunto TEXT NOT NULL,      -- quello che ne dice il giornale
        perche    TEXT,               -- la riga scritta per lei; vuota se non c'era un modello
        fonte     TEXT NOT NULL,      -- il nome del giornale
        link      TEXT NOT NULL,
        argomento TEXT NOT NULL,      -- mondo | tecnologia | economia | italia
        quando    TEXT NOT NULL,      -- quando l'ha pubblicata il giornale
        presa     TEXT NOT NULL,      -- quando è entrata in rassegna
        letta     TEXT                -- quando l'hai aperta
      );

      CREATE INDEX IF NOT EXISTS idx_notizie_presa ON notizie(presa DESC);
    `)
  }
,

  // 15 → 16 · «questa non mi interessa».
  //
  //   `letta` e `scartata` sembrano la stessa cosa — tutt'e due tolgono la
  //   notizia dal mazzo — e non lo sono per niente. Letta vuol dire «l'ho
  //   guardata»: è una cosa fatta, e il giorno dopo non significa più niente.
  //   Scartata vuol dire «non me la riproporre»: è un giudizio, vale per sempre,
  //   ed è l'unico segnale che questa fascia riceve su cosa non ti interessa.
  //
  //   Tenerle in due colonne è quello che permette a una di sparire con la
  //   giornata e all'altra di restare.
  d => {
    d.exec('ALTER TABLE notizie ADD COLUMN scartata TEXT')
  }
,

  // 16 → 17 · buttare un'automazione che non è un tuo file.
  //
  //   Quelle che arrivano con l'azienda stanno in un file del pacchetto: non si
  //   possono cancellare, e finora questo voleva dire che non si potevano
  //   togliere di mezzo — undici righe in elenco, per sempre, anche quelle che
  //   non c'entrano niente con come lavori. Spegnerle non basta: restano lì a
  //   occupare la pagina.
  //
  //   Una riga qui dice «questa per me non esiste». Il file resta dov'è, e un
  //   aggiornamento dell'azienda non la fa ricomparire.
  d => {
    d.exec('ALTER TABLE automazioni ADD COLUMN tolta TEXT')
  }
,

  // 17 → 18 · le raccolte, e cosa un'automazione ha il permesso di toccare.
  //
  //   Due cose diverse che arrivano insieme perché nascono dalla stessa
  //   schermata rifatta, e vanno tenute distinte in testa.
  //
  //   `raccolta` è una cartella, ed è **tua**: sta qui e non nella ricetta
  //   apposta. Mettere in «Fatture» un'automazione arrivata con l'azienda non
  //   deve costringere a farsene una copia — è un gesto di ordine, non una
  //   modifica del testo, e un aggiornamento del fornitore non deve
  //   scompaginare come ti sei organizzato. La tabella `raccolte` tiene anche
  //   quelle vuote: una cartella appena fatta esiste prima di avere qualcosa
  //   dentro, altrimenti sparisce fra il crearla e il riempirla.
  //
  //   `attrezzi` sul compito è il permesso, scritto sulla riga che lo usa. Un
  //   compito nato da un'automazione porta con sé l'elenco di quello che il
  //   modello potrà aprire mentre ci lavora — la posta, il disco, le chat — e
  //   lo porta *scritto*, non dedotto dalla ricetta al momento di girare. La
  //   ragione è che le due cose possono divergere: la ricetta si cambia, il
  //   compito è già in fila da ieri sera, e quello che era stato concesso
  //   quando la riga è nata dev'essere quello che vale quando gira. Un permesso
  //   che si rilegge dopo è un permesso che qualcun altro può allargare.
  d => {
    d.exec(`
      ALTER TABLE automazioni ADD COLUMN raccolta TEXT;
      ALTER TABLE compiti     ADD COLUMN attrezzi TEXT;

      CREATE TABLE IF NOT EXISTS raccolte (
        nome   TEXT PRIMARY KEY,
        ordine INTEGER NOT NULL DEFAULT 0,
        quando TEXT NOT NULL
      );
    `)
  }
,

  // 18 → 19 · da quando esiste, e com'è andata le ultime volte.
  //
  //   Due colonne, e tutte e due riparano un silenzio.
  //
  //   `dal` è da quando questa installazione conosce quest'automazione, e
  //   serve a rispondere a «quand'era il suo turno?» per una che non è mai
  //   girata. Senza, non c'è modo di distinguere una appena scritta da una in
  //   ritardo di tre giorni — e le due vogliono comportamenti opposti: la
  //   prima aspetta il suo orario, la seconda dev'essere recuperata subito.
  //
  //   `storia` è com'è andata le ultime volte, in JSON. Prima si teneva solo
  //   l'ultimo esito, e l'ultimo esito non dice niente: «niente da fare» una
  //   volta è normale — è la risposta più frequente — mentre «niente da fare»
  //   quattordici volte di fila è un'automazione che sta cercando le parole
  //   sbagliate e che nessuno ripara, perché da fuori le due cose si scrivono
  //   uguali. Un elenco corto, tenuto qui e non in una tabella, perché si
  //   legge sempre tutto insieme per una sola automazione e non lo interroga
  //   mai nessuno per traverso.
  d => {
    d.exec(`
      ALTER TABLE automazioni ADD COLUMN dal    TEXT;
      ALTER TABLE automazioni ADD COLUMN storia TEXT;
    `)
  }
,

  // 19 → 20 · chi ha scritto per ultimo un blocco della memoria.
  //
  //   I cinque blocchi — «come decido», «cosa controllo» — sono nati come
  //   caselle da riempire a mano, e a mano restavano vuote: nessuno si siede a
  //   scrivere un ritratto di sé stesso. Adesso li consolida Myynd da quello
  //   che ha imparato, e da quel momento serve sapere chi ha parlato per
  //   ultimo.
  //
  //   Non è contabilità. Un ritratto scritto da una macchina che non dice di
  //   averlo scritto è esattamente la cosa contro cui è costruita questa
  //   schermata: «un gemello che tiene convinzioni su di te che non puoi vedere
  //   né correggere non è uno strumento». `daMe` è la data in cui l'ha toccato
  //   Myynd, e torna a NULL nel momento in cui ci metti mano tu — perché da
  //   allora quelle sono parole tue, e vanno mostrate come tali.
  d => {
    d.exec('ALTER TABLE blocchi ADD COLUMN daMe TEXT')
  },

  // 20 → 21 · un indice su «quando l'ho indicizzato».
  //
  //   `appenaArrivati` chiede «cos'è entrato da ieri» a ogni giro delle
  //   automazioni e a ogni rilettura: senza indice è una lettura intera della
  //   tabella più grossa che c'è — per ogni persona, ogni quarto d'ora.
  d => {
    d.exec('CREATE INDEX IF NOT EXISTS idx_doc_indicizzato ON documenti(indicizzato DESC)')
  },


  // 21 → 22 · il filo di ogni email.
  //
  //   Una ricerca trova il messaggio con le parole giuste, e quasi mai basta
  //   da solo: la cifra chiesta sta due messaggi prima, e quello che le si era
  //   già promesso sta nella risposta che aveva mandato lei. `filo` è la chiave
  //   della conversazione — la radice della catena degli identificativi, o
  //   l'oggetto ripulito — e con l'indice si tirano su i fratelli di un
  //   risultato in una query sola. Vuoto per tutto quello che non è posta.
  d => {
    colonna(d, 'documenti', 'filo', 'TEXT')
    d.exec('CREATE INDEX IF NOT EXISTS idx_doc_filo ON documenti(filo)')
  },

  // 22 → 23 · quanto è costato ragionare, chiamata per chiamata.
  //
  //   Senza questa tabella «perché ho speso sei dollari in tre giorni» non
  //   aveva nessun posto in cui trovare risposta, e un tetto giornaliero non
  //   aveva niente su cui appoggiarsi. Si scrive a ogni chiamata a un modello
  //   di frontiera: il lavoro, il motore, i token entrati, quelli dalla cache,
  //   quelli usciti.
  d => {
    d.exec(`
      CREATE TABLE IF NOT EXISTS uso (
        quando  TEXT NOT NULL,
        lavoro  TEXT NOT NULL,
        motore  TEXT NOT NULL,
        entrata INTEGER NOT NULL,
        cache   INTEGER NOT NULL DEFAULT 0,
        uscita  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_uso_quando ON uso(quando);
    `)
  },

  /*
   * 23 → 24 · quello che ha scritto lei, segnato come tale.
   *
   * La posta inviata entra nell'indice da oggi, e per «appena arrivato» si
   * intende quello che è entrato nell'indice, non quello che è stato scritto:
   * senza questa colonna la prima lettura dopo l'aggiornamento avrebbe messo in
   * cima alla prima pagina le email che ha mandato lei, e le automazioni
   * «quando arriva una fattura» avrebbero preparato risposte alla sua posta.
   *
   * **Sta in fondo, e questa è la regola che vale per tutte.** Era stata
   * scritta in mezzo, accanto alla migrazione del filo perché parlano della
   * stessa cosa — e infilarla lì sposta di uno tutte quelle che vengono dopo:
   * un database già arrivato a quel numero le salta senza dire niente, e la
   * colonna non compare mai. Verificato: `user_version` a 25 e `inviato`
   * assente. Le migrazioni si accodano, sempre, anche quando starebbero meglio
   * altrove.
   */
  d => {
    colonna(d, 'documenti', 'inviato', 'INTEGER NOT NULL DEFAULT 0')
  },

  // 24 → 25 · quante bozze ha fatto fare oggi un'automazione.
  //
  //   Si contava dalla `storia`, che tiene gli ultimi venti giri e basta: una
  //   ricetta che gira ogni quarto d'ora faceva scorrere via le tre «fatta»
  //   del mattino nel giro di poche ore, e il tetto del giorno si azzerava da
  //   solo. Un contatore con accanto il giorno a cui si riferisce non scorre.
  //
  //   Le due colonne si aggiungono una per volta: `ALTER TABLE` non si può
  //   ripetere in un solo `exec` su ogni versione di SQLite, e una migrazione
  //   che fallisce a metà è il modo peggiore di scoprirlo.
  d => {
    colonna(d, 'automazioni', 'giorno', 'TEXT')
    colonna(d, 'automazioni', 'bozze', 'INTEGER NOT NULL DEFAULT 0')
  },

  // 25 → 26 · fin dove un'automazione ha guardato davvero.
  //
  //   `ultima` è l'ultima volta che è *partita*, e serve all'orologio. Ma era
  //   anche il paletto da cui `soloNuovi` riparte, e un giro finito in guaio la
  //   spostava lo stesso: quello che era arrivato durante il guasto finiva
  //   dietro al paletto — non rimandato, saltato. `vista` la muove solo un giro
  //   che il materiale l'ha guardato. Parte uguale a `ultima`.
  d => {
    colonna(d, 'automazioni', 'vista', 'TEXT')
    d.exec('UPDATE automazioni SET vista = ultima WHERE vista IS NULL')
  },

  // 26 → 27 · «questa è vera, gliel'ho detto io».
  //
  //   `genere` dice da dove viene una convinzione — te l'ha sentita dire, l'ha
  //   dedotta, l'ha indotta — e non dice niente su cosa ne pensi tu. Una
  //   indotta è un'ipotesi: plausibile, mai passata sotto gli occhi di
  //   nessuno, e trattata come un fatto dal momento in cui entra nel prompt.
  //
  //   `confermata` è il momento in cui una persona l'ha guardata e ha detto di
  //   sì. Nulla vuol dire «nessuno l'ha ancora guardata», non «è falsa»: chi
  //   la ritiene falsa la chiude o la cancella, e sono due gesti diversi.
  d => {
    colonna(d, 'convinzioni', 'confermata', 'TEXT')
  },

  // 27 → 28 · fin dove è arrivato un connettore.
  //
  //   Una casella con più di quattrocento messaggi nuovi ne prende
  //   quattrocento per giro. Va bene solo se il giro dopo riparte da dove si
  //   era fermato: senza un posto dove scriverlo, ogni lettura ricominciava
  //   dalla stessa finestra e la casella restava parziale per sempre —
  //   parziale in silenzio, che è il modo peggiore.
  //
  //   Una riga per fonte, e il valore è del connettore: un uid, una data, un
  //   `pageToken`. Qui dentro non si interpreta, si tiene.
  d => {
    d.exec(`
      CREATE TABLE IF NOT EXISTS cursori (
        fonte  TEXT PRIMARY KEY,
        valore TEXT NOT NULL,
        quando TEXT NOT NULL
      );
    `)
  },

  /*
   * 28 → 29 · il testo smette di stare scritto quattro volte.
   *
   * `ricerca` teneva la sua copia di titolo, corpo e autore, più le radici che
   * non stavano da nessun'altra parte. Con `content = 'documenti'` l'indice
   * non conserva più niente: si rilegge le colonne da `documenti` quando gli
   * servono. Perché possa farlo, `radici` deve diventare una colonna vera —
   * ed è anche il momento giusto per `autoreIndirizzo`, che toglie di mezzo
   * l'ultima lettura completa rimasta.
   *
   * È l'unica migrazione di questo file che su un indice grosso dura minuti.
   * Sta in fondo, come tutte, e l'istantanea l'ha già presa `migra()`.
   */
  d => {
    colonna(d, 'documenti', 'radici', 'TEXT')
    colonna(d, 'documenti', 'autoreIndirizzo', 'TEXT')
    d.exec('CREATE INDEX IF NOT EXISTS idx_doc_autore_indirizzo ON documenti(autoreIndirizzo)')

    // prima si butta la vecchia — è lei che tiene la copia del testo — poi si
    // riempiono le radici, e solo alla fine si accendono i trigger: mentre si
    // scrive riga per riga non devono esserci
    for (const t of ['ricerca_dopo_inserimento', 'ricerca_dopo_cancellazione', 'ricerca_dopo_modifica']) {
      d.exec(`DROP TRIGGER IF EXISTS ${t}`)
    }
    d.exec('DROP TABLE IF EXISTS ricerca_termini')
    d.exec('DROP TABLE IF EXISTS ricerca')

    rifaiLIndice(d)
    d.exec(TRIGGER_RICERCA)
  },

  // 29 → 30 · l'email già pronta, e a quale messaggio risponde.
  //
  //   `compiti.email` è quello che prima si chiedeva al modello *dopo* aver
  //   premuto «Mandala per email…»: a chi va, l'oggetto, il testo. Adesso si
  //   prepara quando la bozza diventa pronta, così mandarla è un gesto solo.
  //   JSON, come `fonti` e `proposta`; vuoto quando la bozza non è una email.
  //
  //   `documenti.messageId` è l'identificativo del singolo messaggio. `filo`
  //   tiene la *radice* della conversazione, che per rispondere non basta:
  //   `In-Reply-To` vuole il messaggio a cui si risponde, e sul terzo di un
  //   filo la radice è un altro. Lo scrive la lettura successiva della posta,
  //   senza contare i messaggi come cambiati — come già fa con il filo.
  d => {
    colonna(d, 'compiti', 'email', 'TEXT')
    colonna(d, 'documenti', 'messageId', 'TEXT')
  },

  /*
   * 30 → 31 · un'email letta, e un'email di massa.
   *
   * Il feed diceva «ventiquattro cose da guardare», e metà erano promozioni
   * della banca, newsletter, ed email che lui aveva già letto e che non
   * chiedevano niente. L'indice non sapeva distinguerle: di ogni messaggio
   * teneva chi lo scrive e cosa dice, non se era stato aperto né se era
   * arrivato a diecimila persone insieme.
   *
   *   `letto` è la bandiera \Seen della casella, e la scrive ogni lettura
   *   della posta — anche per i messaggi già dentro — senza contarli come
   *   cambiati, come già succede col filo. Vuoto vuol dire «non lo so»:
   *   i documenti che non sono posta, e la posta entrata prima di questa
   *   colonna.
   *   `massa` lo decide il connettore dalle intestazioni (List-Unsubscribe,
   *   Precedence: bulk, i mittenti «noreply»…) quando il messaggio entra.
   *
   * Due ALTER TABLE, senza una riscrittura lunga durante l'avvio. I messaggi
   * vecchi con `massa` vuoto vengono riletti a piccoli blocchi dai giri di
   * posta successivi; così anche un indice già pieno arriva gradualmente alla
   * stessa qualità di uno nuovo. Sta in fondo, come tutte.
   */
  d => {
    colonna(d, 'documenti', 'letto', 'INTEGER')
    colonna(d, 'documenti', 'massa', 'INTEGER')
  },

  // 31 → 32 · optional planned calendar day; existing buckets remain intact.
  d => {
    colonna(d, 'compiti', 'giorno', 'TEXT')
  },

  /*
   * 32 → 33 · i progetti con un obiettivo, e il perché di una voce.
   *
   * I progetti li teneva il punto in `punto.json`: un nome, una data, e
   * l'angolo proposto. Non un obiettivo — e senza obiettivo il feed non può
   * sapere se un documento *muove* qualcosa, la rassegna non può sapere quale
   * notizia c'entra, e il punto se ne inventa uno («Myynd per papà») senza
   * che si possa dire «questo non è un progetto». Adesso stanno in una
   * tabella, con l'obiettivo che si scrive a mano nella Memoria, e uno stato:
   * un progetto chiuso resta scritto — così non torna — ma non conta più.
   *
   *   `feed.perche` è la riga che dice perché una voce sta sul feed e per
   *   quale obiettivo: è quello che rende una scelta controllabile invece che
   *   subita. Le notizie ce l'hanno già dalla nascita.
   *
   * Sta in fondo, come tutte.
   */
  d => {
    d.exec(`
      CREATE TABLE IF NOT EXISTS progetti (
        id         TEXT PRIMARY KEY,
        nome       TEXT NOT NULL,
        obiettivo  TEXT,                              -- una riga: a cosa punta
        stato      TEXT NOT NULL DEFAULT 'attivo',    -- attivo | fermo | chiuso
        dal        TEXT NOT NULL,
        aggiornato TEXT NOT NULL,
        note       TEXT,
        origine    TEXT                               -- mano | punto
      );
    `)
    colonna(d, 'feed', 'perche', 'TEXT')
  },

  // 33 → 34 · un'attività resta legata al progetto anche quando cambia nome.
  d => {
    colonna(d, 'compiti', 'progetto', 'TEXT')
    d.exec('CREATE INDEX IF NOT EXISTS compiti_progetto ON compiti(progetto)')
  },

  /**
   * 34 → 35 · da quale riga è nata una riga.
   *
   * Il tredici settembre il punto ha scritto «di’ quale unità di H-Farm guarda
   * l’audit», e lui ha chiesto dove fosse quella cosa. Da nessuna parte: non
   * nasceva da un documento, nasceva dalle *domande* di un’altra riga della
   * lista — e quel filo si perdeva appena la riga era scritta. `ancoraAlleRighe`
   * la madre la conosceva già (ne ereditava il documento e il progetto) e non
   * la scriveva: adesso resta, ed è l’ultima strada di «Portami lì» quando non
   * c’è né un documento né un progetto.
   *
   * In fondo, come tutte: una migrazione in mezzo alla lista ne fa saltare una
   * su ogni database già arrivato a quel numero, e senza dire niente.
   */
  d => {
    colonna(d, 'compiti', 'madre', 'TEXT')
  },

  // 35 → 36 · user feedback retains its source identity after reindexing.
  d => {
    colonna(d, 'feed', 'contesto', 'TEXT')
    colonna(d, 'compiti', 'contesto', 'TEXT')
    for (const tabella of ['feed', 'compiti']) {
      const righe = d.prepare(`SELECT f.id AS voce, d.* FROM ${tabella} f JOIN documenti d ON d.id = f.doc WHERE f.contesto IS NULL`).all() as unknown as (Documento & { voce: string })[]
      const salva = d.prepare(`UPDATE ${tabella} SET contesto = ? WHERE id = ?`)
      for (const r of righe) salva.run(JSON.stringify(contestoAttenzione(r)), r.voce)
    }
  },
  // Verified native deliverable metadata, separate from model-written prose.
  d => { colonna(d, 'compiti', 'consegna', 'TEXT') },

  // Un colore per progetto, scelto da lui in Memoria. In fondo, come tutte.
  d => { colonna(d, 'progetti', 'colore', 'TEXT') },

  // Una chat aperta da «Parliamone» sa di quale progetto parla, e da quale
  // carta è nata: così quello che lui risponde si salva sul progetto giusto
  // e la carta se ne va. In fondo, come tutte.
  d => { colonna(d, 'chat', 'progetto', 'TEXT'); colonna(d, 'chat', 'iniziativa', 'TEXT') },
  // Una priorità proposta da Myynd porta con sé cosa farebbe lui da solo per
  // portarla avanti: è la riga che rende «Affidalo a Myynd» una promessa
  // precisa e non un bottone. In fondo, come tutte.
  d => colonna(d, 'feed', 'offerta', 'TEXT'),
  // Il quadro per progetto: una voce del feed sa di quale progetto è, così la
  // prima pagina la mette nel suo blocco; un compito affidato porta con sé il
  // giudizio sul lavoro consegnato; una domanda di Myynd sa su quale
  // progetto la fa. Tre colonne, in fondo, come tutte.
  d => { colonna(d, 'feed', 'progetto', 'TEXT'); colonna(d, 'compiti', 'revisione', 'TEXT'); colonna(d, 'domande', 'progetto', 'TEXT') },
  // Un progetto ha altri nomi (le cartelle, i soprannomi: «everwave» per
  // Evermute) e può stare dentro un altro (H-Brain è uno spin-off di Myynd):
  // finora vivevano nel riferimento e nelle note, e non si potevano scrivere
  // dalla Memoria. Due colonne, in fondo, come tutte.
  d => { colonna(d, 'progetti', 'alias', 'TEXT'); colonna(d, 'progetti', 'genitore', 'TEXT') },
  // Un'attività può avere un'ora dentro il suo giorno: «HH:MM», o niente.
  //
  // Finora aveva solo il giorno, e nella settimana aperta questo si vedeva: si
  // premeva sulle dieci di giovedì e la riga nasceva in cima, nella fascia del
  // tutto il giorno, come se l'ora premuta non fosse mai stata detta. Senza ora
  // resta lì, che è giusto — la maggior parte delle cose da fare non ha
  // un'ora — ma adesso si può dire. In fondo, come tutte.
  d => colonna(d, 'compiti', 'ora', 'TEXT'),
  // Quanto conta una voce del feed, da 0 a 3, giudicato quando nasce
  // (`rifinitura.ts`): la prima pagina può mettere davanti quello che è
  // davvero urgente invece dell'ultima arrivata. NULL quando nessuno l'ha
  // giudicata — senza Jev, o prima di questa colonna. In fondo, come tutte.
  d => colonna(d, 'feed', 'peso', 'REAL'),
  // 44 → 45 · una notizia sa se è importante (un rilascio di un laboratorio di
  // frontiera, o un fatto che cambia il suo lavoro: la pastiglia salta) e
  // quanto è interessante per lui secondo Jev, che decide chi esce quando la
  // rassegna supera le dieci. Due colonne, in fondo, come tutte.
  d => { colonna(d, 'notizie', 'importante', 'INTEGER NOT NULL DEFAULT 0'); colonna(d, 'notizie', 'interesse', 'REAL') },
  // 45 → 46 · la priorità di una riga: «alta», «bassa», o niente (normale).
  // La chiede la scheda che si apre col «+» del calendario, insieme all'ora e
  // al progetto. In fondo, come tutte.
  d => colonna(d, 'compiti', 'priorita', 'TEXT'),
  // 46 → 47 · la priorità di un progetto: «alta», o niente (normale). La
  // parola è la stessa delle righe, ma il gradino basso non c'è: per un
  // progetto «meno importante» esiste già «fermo». Un progetto che c'era
  // prima resta normale, cioè com'era. In fondo, come tutte.
  d => colonna(d, 'progetti', 'priorita', 'TEXT'),

  /*
   * Da qui in giù: le fondamenta dei lavori P1…P10, scritte tutte insieme
   * perché undici rami paralleli non si pestino i piedi su questa lista. Una
   * voce per passo, in fondo, come tutte. Le tabelle nuove hanno il loro
   * `CREATE` scritto una volta sola in `TABELLE` (più sotto): la migrazione lo
   * esegue, e `rimetti()` lo riesegue se un giorno una di loro mancasse.
   */

  // 47 → 48 · P1/P3/P9 · a quale messaggio risponde un'email, e a chi è andata.
  //   `risponde` è l'In-Reply-To pulito dalle parentesi angolari: è quello che
  //   lega una risposta mandata alla mail che l'ha chiesta. `destinatari` sono
  //   gli indirizzi di A e Cc, in minuscolo, separati da virgole.
  d => {
    colonna(d, 'documenti', 'risponde', 'TEXT')
    colonna(d, 'documenti', 'destinatari', 'TEXT')
    d.exec('CREATE INDEX IF NOT EXISTS idx_doc_risponde ON documenti(risponde)')
  },
  // 48 → 49 · P1 · i segnali: le cose piccole che succedono, una riga ciascuna.
  d => d.exec(TABELLE.segnali),
  // 49 → 50 · P1 · le app che ha davanti, a sessioni.
  d => d.exec(TABELLE.sessioni_app),
  // 50 → 51 · P1 · gli impegni dell'agenda com'erano quando li ha visti.
  d => d.exec(TABELLE.agenda_viste),
  // 51 → 52 · P1 · le previsioni, sigillate fino alla sera.
  d => d.exec(TABELLE.previsioni),
  // 52 → 53 · P1 · il punteggio di ogni giorno, accanto a quello ingenuo.
  d => d.exec(TABELLE.punteggi),
  // 53 → 54 · P1 · le abitudini osservate («come lavori»).
  d => d.exec(TABELLE.abitudini),
  // 54 → 55 · P1 · la scala della fiducia, per genere di lavoro.
  d => d.exec(TABELLE.fiducia),
  // 55 → 56 · P2 · perché è stata chiusa, quando l'ha vista, quando l'ha toccata.
  d => { colonna(d, 'feed', 'ragione', 'TEXT'); colonna(d, 'feed', 'vista', 'TEXT'); colonna(d, 'feed', 'toccata', 'TEXT') },
  // 56 → 57 · P2 · le carte che mancavano: quello che ha fatto lui senza che il feed l'avesse detto.
  d => d.exec(TABELLE.mancate),
  // 57 → 58 · P2 · cosa ha deciso l'esame di ogni documento.
  d => d.exec(TABELLE.feed_esame),
  // 58 → 59 · P3 · l'ipotesi scritta, le domande fatte, e come scrive a quella persona.
  //   La colonna della voce si chiama `voceScritta` e non `voce`: `compiti.voce`
  //   esiste dalla 7 ed è la voce del feed da cui la riga è nata.
  d => {
    colonna(d, 'compiti', 'ipotesi', 'TEXT')
    colonna(d, 'compiti', 'domandeFatte', 'INTEGER NOT NULL DEFAULT 0')
    colonna(d, 'compiti', 'voceScritta', 'TEXT')
  },
  // 59 → 60 · P3 · le misure del lavoro affidato.
  d => d.exec(TABELLE.misure_compiti),
  // 60 → 61 · P6 · le prove delle automazioni e i loro esiti; il vassoio.
  //   Quelle già vive che sono girate almeno una volta non passano dal
  //   vassoio: la data nel passato dice «già finito».
  d => {
    d.exec(TABELLE.prove)
    d.exec(TABELLE.esiti)
    colonna(d, 'automazioni', 'vassoio', 'TEXT')
    d.exec("UPDATE automazioni SET vassoio = '1970-01-01T00:00:00.000Z' WHERE vassoio IS NULL AND spenta = 0 AND quante > 0")
  },
  // 61 → 62 · P7 · com'è stata verificata una risposta.
  d => colonna(d, 'messaggi', 'verifica', 'TEXT'),
  // 62 → 63 · P8 · la salute delle fonti, giorno per giorno, e lo stato di adesso.
  d => { d.exec(TABELLE.salute_fonti); d.exec(TABELLE.stato_fonti) },
  // 63 → 64 · P9 · una bozza mandata dalla posta, e un indice su quando si chiude una riga.
  d => {
    colonna(d, 'compiti', 'mandata', 'TEXT')
    d.exec('CREATE INDEX IF NOT EXISTS idx_compiti_chiuso ON compiti(chiuso)')
  },
  // 64 → 65 · P1B · chi ha invitato a un'occorrenza dell'agenda: serve alla riga «gli inviti di X li rifiuti».
  d => colonna(d, 'agenda_viste', 'organizzatore', 'TEXT'),
  // 65 → 66 · P5 · una convinzione scordata non torna
  d => d.exec(TABELLE.convinzioni_tolte)
]

/**
 * Una copia del file prima di toccarlo: le migrazioni non si annullano.
 *
 * Prende il database su cui sta lavorando invece di andarselo a prendere da
 * `db`: qui si sta *aprendo* quel database, e `db` chiederebbe alla cartella
 * corrente — che durante l'apertura non è ancora questa. Un'istantanea del
 * database sbagliato non sarebbe servita a niente il giorno che serve.
 */
/** Le copie già fatte in questo processo: una per file e versione, non una per tentativo. */
const istantaneeFatte = new Set<string>()

function istantanea(d: DatabaseSync, file: string, da: number) {
  const segno = `${file}@${da}`
  if (istantaneeFatte.has(segno)) return
  istantaneeFatte.add(segno)
  const dove = join(file, '..', 'istantanee')
  if (!existsSync(dove)) mkdirSync(dove, { recursive: true, mode: 0o700 })
  // con il WAL svuotato il file principale è una copia completa
  d.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  const copia = join(dove, `mente-v${da}-${new Date().toISOString().replace(/[:.]/g, '-')}.db`)
  copyFileSync(file, copia)
  chmodSync(copia, 0o600)
  console.log(`myynd · istantanea prima della migrazione: ${copia}`)
  /*
   * L'ultima, e solo fra le istantanee delle migrazioni.
   *
   * Erano due, e la seconda non serviva a niente: si torna indietro allo stato
   * *prima dell'aggiornamento che ha fatto danno*, cioè al più recente, e
   * nessuno è mai tornato di due schemi. Intanto ogni copia è l'indice intero —
   * su una casella grossa sono gigabyte su un volume che si paga a gigabyte, e
   * si pagavano due volte.
   *
   * Due trappole nella riga che sceglie quali buttare. La prima: i nomi sono
   * `mente-v<N>-<data>`, e ordinarli come stringhe mette `v9` dopo `v22` —
   * «l'ultima» sarebbe stata la più vecchia. La seconda, peggiore: la copia
   * messa da parte prima di un'importazione si chiama
   * `mente-prima-del-trasloco-…`, che con quel filtro entrava nel mucchio e,
   * ordinata per nome, veniva cancellata per prima — cioè la copia esisteva
   * finché non serviva. Qui si guarda la data del file, e si toccano solo le
   * istantanee delle migrazioni.
   */
  try {
    const vecchie = readdirSync(dove)
      .filter(n => /^mente-v\d+-.*\.db$/.test(n))
      .map(n => ({ n, quando: statSync(join(dove, n)).mtimeMs }))
      .sort((a, b) => a.quando - b.quando)
    for (const v of vecchie.slice(0, Math.max(0, vecchie.length - 1))) rmSync(join(dove, v.n), { force: true })
  } catch { /* le istantanee sono un aiuto, non un requisito */ }
}

/**
 * Le colonne che il codice dà per scontate, rimesse se non ci sono.
 *
 * Non sostituisce le migrazioni: gira prima, e quasi sempre non fa niente.
 * Esiste per l'unico modo in cui una migrazione può non essere mai girata pur
 * essendo scritta — qualcuno ne infila una **in mezzo** alla lista, e su ogni
 * database già arrivato a quel numero tutte quelle dopo slittano di uno e ne
 * salta una. Il segnale è il peggiore possibile: `user_version` è giusta,
 * nessun errore, e una colonna non c'è. È già successo, e la volta buona la si
 * è scoperta guardando il database a mano.
 *
 * Aggiungere una colonna che manca è sicuro e costa una lettura di schema;
 * scoprire fra sei mesi perché una query dice «no such column» costa un
 * pomeriggio. Le colonne stanno scritte qui *e* nella loro migrazione, e le
 * due cose devono dire la stessa cosa: `colonne.test.ts` legge questo file e
 * lo controlla, colonna per colonna e tipo per tipo. Una colonna `NOT NULL
 * DEFAULT` tiene qui il suo default, o non si potrebbe rimettere.
 */
const COLONNE: Record<string, [string, string][]> = {
  documenti: [
    ['filo', 'TEXT'], ['inviato', 'INTEGER NOT NULL DEFAULT 0'],
    // `radici` è la colonna che l'indice full-text legge da qui invece di
    // tenersene una copia: senza, ogni ricerca in italiano smette di piegare
    // i plurali, e in silenzio
    ['radici', 'TEXT'], ['autoreIndirizzo', 'TEXT'], ['messageId', 'TEXT'],
    ['letto', 'INTEGER'], ['massa', 'INTEGER'],
    ['risponde', 'TEXT'], ['destinatari', 'TEXT']
  ],
  automazioni: [
    ['tolta', 'TEXT'], ['raccolta', 'TEXT'], ['dal', 'TEXT'], ['storia', 'TEXT'],
    ['giorno', 'TEXT'], ['bozze', 'INTEGER NOT NULL DEFAULT 0'], ['vista', 'TEXT'],
    ['vassoio', 'TEXT']
  ],
  convinzioni: [['confermata', 'TEXT']],
  compiti: [
    ['modo', "TEXT NOT NULL DEFAULT 'io'"], ['proposta', 'TEXT'], ['chieste', 'TEXT'], ['attrezzi', 'TEXT'],
    ['consegna', 'TEXT'], ['email', 'TEXT'], ['giorno', 'TEXT'], ['ora', 'TEXT'], ['progetto', 'TEXT'],
    ['madre', 'TEXT'], ['contesto', 'TEXT'], ['revisione', 'TEXT'], ['priorita', 'TEXT'],
    ['ipotesi', 'TEXT'], ['domandeFatte', 'INTEGER NOT NULL DEFAULT 0'], ['voceScritta', 'TEXT'],
    ['mandata', 'TEXT']
  ],
  feed: [
    ['motivo', 'TEXT'], ['risposto', 'TEXT'], ['perche', 'TEXT'], ['contesto', 'TEXT'],
    ['offerta', 'TEXT'], ['progetto', 'TEXT'], ['peso', 'REAL'],
    ['ragione', 'TEXT'], ['vista', 'TEXT'], ['toccata', 'TEXT']
  ],
  blocchi: [['daMe', 'TEXT']],
  domande: [['progetto', 'TEXT']],
  chat: [['progetto', 'TEXT'], ['iniziativa', 'TEXT']],
  messaggi: [['verifica', 'TEXT']],
  notizie: [['scartata', 'TEXT'], ['importante', 'INTEGER NOT NULL DEFAULT 0'], ['interesse', 'REAL']],
  progetti: [['colore', 'TEXT'], ['alias', 'TEXT'], ['genitore', 'TEXT'], ['priorita', 'TEXT']],
  agenda_viste: [['organizzatore', 'TEXT']]
}

/*
 * Prima le tabelle che mancano, poi le colonne, poi gli indici sulle colonne.
 *
 * L'ordine conta: una tabella ricreata da `TABELLE` nasce nella sua forma di
 * partenza, e le colonne arrivatele dopo gliele rimette il giro sulle colonne;
 * un indice su una colonna arrivata dopo si può fare solo quando la colonna
 * c'è.
 */
function rimetti(db: DatabaseSync) {
  for (const [nome, sql] of Object.entries(TABELLE)) {
    try {
      const c = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?").get(nome) as { n: number }
      db.exec(sql)
      if (!c.n) console.log(`myynd · rimessa la tabella ${nome}, che una migrazione saltata non aveva scritto`)
    } catch (e) {
      console.error(`myynd · non riesco a rimettere la tabella ${nome}:`, e instanceof Error ? e.message : e)
    }
  }
  rimettiColonne(db)
  for (const sql of INDICI) {
    try { db.exec(sql) } catch (e) {
      console.error('myynd · non riesco a rimettere un indice:', e instanceof Error ? e.message : e)
    }
  }
}

function rimettiColonne(db: DatabaseSync) {
  for (const [tabella, colonne] of Object.entries(COLONNE)) {
    let ci: { name: string }[]
    try { ci = db.prepare(`PRAGMA table_info(${tabella})`).all() as { name: string }[] } catch { continue }
    if (!ci.length) continue   // la tabella non c'è ancora: la farà una migrazione
    for (const [nome, tipo] of colonne) {
      if (ci.some(c => c.name === nome)) continue
      try {
        db.exec(`ALTER TABLE ${tabella} ADD COLUMN ${nome} ${tipo}`)
        console.log(`myynd · rimessa la colonna ${tabella}.${nome}, che una migrazione saltata non aveva scritto`)
      } catch (e) {
        console.error(`myynd · non riesco a rimettere ${tabella}.${nome}:`, e instanceof Error ? e.message : e)
      }
    }
  }
}

/**
 * La stessa rete di sicurezza, per l'indice di ricerca.
 *
 * `rimetti()` sa rimettere una colonna; qui si guarda l'altra metà, che è
 * quella che si romperebbe più in silenzio di tutte. Se un giorno una
 * migrazione venisse infilata in mezzo alla lista, il database di chi era già
 * a quel numero salterebbe proprio quella che ha rifatto l'indice: `ricerca`
 * resterebbe la vecchia tabella con dentro la sua copia del testo, e i trigger
 * non esisterebbero. Da lì in poi nessun documento nuovo entra nell'indice —
 * nessun errore, nessuna riga rossa, solo una ricerca che smette
 * lentamente di trovare le cose di questa settimana.
 *
 * Due domande allo schema, che quasi sempre rispondono «tutto a posto». Quando
 * non lo fanno, l'indice si rifà: dura, ma l'alternativa è una ricerca che
 * mente.
 */
function rimettiLIndice(d: DatabaseSync) {
  let sql: string | undefined
  try {
    sql = (d.prepare("SELECT sql FROM sqlite_master WHERE name = 'ricerca'").get() as { sql: string } | undefined)?.sql
  } catch { return }
  if (!sql) return   // niente `ricerca`: il database non è ancora arrivato lì, e ci pensa la migrazione
  const trigger = (d.prepare(`
    SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger'
      AND name IN ('ricerca_dopo_inserimento', 'ricerca_dopo_cancellazione', 'ricerca_dopo_modifica')
  `).get() as { n: number }).n
  if (/content\s*=/.test(sql) && trigger === 3) return

  console.log('myynd · l’indice di ricerca non è quello che dovrebbe: lo rifaccio')
  d.exec('BEGIN')
  try {
    for (const t of ['ricerca_dopo_inserimento', 'ricerca_dopo_cancellazione', 'ricerca_dopo_modifica']) {
      d.exec(`DROP TRIGGER IF EXISTS ${t}`)
    }
    d.exec('DROP TABLE IF EXISTS ricerca_istanze')
    d.exec('DROP TABLE IF EXISTS ricerca_termini')
    d.exec('DROP TABLE IF EXISTS ricerca')
    rifaiLIndice(d)
    d.exec(TRIGGER_RICERCA)
    d.exec('COMMIT')
  } catch (e) {
    d.exec('ROLLBACK')
    // meglio un indice vecchio che un indice a metà: si dice, e si va avanti
    console.error('myynd · non riesco a rifare l’indice di ricerca:', e instanceof Error ? e.message : e)
  }
}

/**
 * Le migrazioni, sul database appena aperto.
 *
 * Girano all'apertura di *ogni* indice invece che una volta all'avvio: con più
 * persone i database sono tanti, nascono in momenti diversi, e ognuno arriva
 * allo schema per conto suo. Chi si registra domani apre un indice vuoto che
 * fa tutte le migrazioni di fila in un colpo; chi c'era già ne fa solo quelle
 * che gli mancano.
 */
function migra(db: DatabaseSync, file: string) {
  const versione = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
  if (versione > MIGRAZIONI.length) {
    throw new Error(
      `mente.db è allo schema ${versione}, questa versione di Myynd ne conosce ${MIGRAZIONI.length}. ` +
      'Stai aprendo un indice scritto da una versione più nuova: aggiorna Myynd invece di aprirlo.'
    )
  }
  if (versione < MIGRAZIONI.length) {
    // Un'istantanea se c'è qualcosa da perdere. La condizione non è «versione > 0»:
    // proprio i database più vecchi stanno a user_version 0, e sono quelli che
    // hanno più bisogno della copia.
    const gia = db.prepare(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'documenti'"
    ).get() as { n: number }
    const quanti = gia.n ? (db.prepare('SELECT COUNT(*) AS n FROM documenti').get() as { n: number }).n : 0
    if (quanti > 0) istantanea(db, file, versione)

    for (let v = versione; v < MIGRAZIONI.length; v++) {
      db.exec('BEGIN')
      try {
        MIGRAZIONI[v](db)
        db.exec(`PRAGMA user_version = ${v + 1}`)
        db.exec('COMMIT')
      } catch (e) {
        db.exec('ROLLBACK')
        throw new Error(`migrazione ${v} → ${v + 1} fallita: ${e instanceof Error ? e.message : e}`)
      }
    }
  }

  /*
   * Dopo le migrazioni, e mai prima.
   *
   * Prima stava sopra, con il ragionamento che un database «già alla versione
   * giusta» è proprio quello che può avere un buco — vero, e infatti qui sotto
   * il buco lo ripara comunque, perché a questo punto ogni database è alla
   * versione giusta.
   *
   * Sopra, invece, faceva un danno. Su un indice fermo a una versione vecchia
   * aggiungeva le colonne che le migrazioni ancora da fare avrebbero aggiunto
   * loro, e quelle morivano su «duplicate column name». Provato su un indice
   * vero fermo alla 20: non si apriva più. Una riparazione che si mette davanti
   * al lavoro che deve riparare non è una rete di sicurezza, è un ostacolo.
   */
  rimetti(db)
  // e dopo `rimetti()`, che è quello che ha rimesso le colonne su cui l'indice
  // si appoggia: rifarlo prima vorrebbe dire rifarlo senza `radici`
  rimettiLIndice(db)
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
  /** La conversazione di cui fa parte, se è una email. Si legge con `stessoFilo`. */
  filo?: string | null
  /**
   * L'ha scritta lei, non le è arrivata.
   *
   * Serve a `appenaArrivati`, che è quello che alimenta la prima pagina e le
   * automazioni «quando arriva»: la posta inviata entra nell'indice — è l'unico
   * esempio vero di come scrive — ma non «arriva», e trattarla come un arrivo
   * vorrebbe dire una prima pagina fatta delle sue stesse email.
   */
  inviato?: boolean
  /**
   * Il `Message-ID` di questa email, pulito dalle parentesi angolari.
   *
   * Non è il filo: quello è la radice della conversazione. Questo è il
   * messaggio preciso, ed è quello che una risposta cita in `In-Reply-To`.
   */
  messageId?: string | null
  /**
   * L'ha già aperta nel suo programma di posta: la bandiera \Seen.
   *
   * Vuoto è «non lo so», e non è la stessa cosa di falso: un file sul disco
   * non è né letto né da leggere. Il feed lo usa per non ripetergli, come
   * fosse una novità, una cosa che ha già letto e che non gli chiede niente.
   */
  letto?: boolean | null
  /**
   * Posta di massa: newsletter, promozioni, notifiche automatiche. Lo
   * decide il connettore dalle intestazioni quando il messaggio entra, e il
   * feed non la guarda nemmeno.
   */
  massa?: boolean | null
  /**
   * L'`In-Reply-To` di questa email, pulito dalle parentesi angolari: il
   * messaggio a cui risponde. È quello che lega una risposta mandata alla mail
   * che l'aveva chiesta, senza indovinare dall'oggetto.
   */
  risponde?: string | null
  /** Gli indirizzi di A e Cc, in minuscolo, senza doppioni, separati da virgole. */
  destinatari?: string | null
}

/**
 * Le colonne di un documento, scritte per nome invece che con un asterisco.
 *
 * `SELECT *` andava bene finché in `documenti` c'era solo roba da leggere.
 * Adesso ci sono anche `radici` — il testo ridotto a radici, che pesa quasi
 * quanto il corpo — e `autoreIndirizzo`: due colonne di servizio, che l'indice
 * legge e che nessuno deve vedere. Con l'asterisco uscivano da qui attaccate a
 * ogni documento, e da qui finiscono in un JSON che va al browser: un elenco
 * di trenta email diventava il doppio, per portare al client delle parole
 * mozzate che non gli servono a niente.
 */
const CAMPI_DOC = [
  'rid', 'id', 'fonte', 'tipo', 'titolo', 'corpo', 'autore',
  'percorso', 'quando', 'gruppo', 'indicizzato', 'filo', 'inviato', 'messageId', 'letto', 'massa',
  'risponde', 'destinatari'
]
const CAMPI = CAMPI_DOC.join(', ')
/** Gli stessi, per la ricerca, dove `documenti` sta in una giunzione. */
const CAMPI_D = CAMPI_DOC.map(c => `d.${c}`).join(', ')

/*
 * Le quattro istruzioni della scrittura dei documenti, preparate quando servono.
 *
 * Erano `const … = db.prepare(…)` in cima al file, cioè **legate a un database
 * nel momento in cui il modulo veniva caricato**. Con un utente solo era un
 * risparmio giusto: si preparano una volta e si riusano per sempre. Con più
 * utenti erano la falla — si sarebbero legate all'indice di chiunque avesse
 * fatto la prima richiesta, e da lì in poi ogni documento di tutti sarebbe
 * finito lì dentro. Nessun errore: solo la posta di uno nella mente di un
 * altro.
 *
 * Restano preparate una volta *per database*, che è il vero equivalente: il
 * risparmio si tiene, e il recinto pure. Si buttano insieme al database quando
 * si chiude.
 */
type Istruzioni = {
  selEsistente: ReturnType<DatabaseSync['prepare']>
  insDoc: ReturnType<DatabaseSync['prepare']>
  updDoc: ReturnType<DatabaseSync['prepare']>
  updFilo: ReturnType<DatabaseSync['prepare']>
}

const istruzioni = new WeakMap<DatabaseSync, Istruzioni>()

function istr(): Istruzioni {
  const d = mio()
  let i = istruzioni.get(d)
  if (i) return i
  i = {
    /*
     * `radici` sta qui dentro apposta: dice se questo documento è indicizzato.
     *
     * Prima la domanda si faceva all'FTS — `SELECT 1 FROM ricerca WHERE rowid
     * = ?` — e adesso quella risposta non vuol dire più niente: su una tabella
     * a contenuto esterno la ricerca per rowid passa dal *contenuto*, quindi
     * risponde di sì anche per una riga che nell'indice non c'è. La colonna,
     * invece, è la cosa vera: è quella che l'indice legge, e vuota significa
     * un documento che nessuna ricerca troverà mai.
     */
    selEsistente: d.prepare(
      'SELECT rid, titolo, corpo, autore, percorso, quando, gruppo, filo, inviato, messageId, letto, massa, risponde, destinatari, radici FROM documenti WHERE id = ?'
    ),
    insDoc: d.prepare(`
      INSERT INTO documenti (id, fonte, tipo, titolo, corpo, autore, percorso, quando, gruppo, filo, inviato, messageId, letto, massa, risponde, destinatari, radici, autoreIndirizzo, indicizzato)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `),
    updDoc: d.prepare(`
      UPDATE documenti SET titolo=?, corpo=?, autore=?, percorso=?, quando=?, gruppo=?, filo=?, inviato=?, messageId=?, letto=?, massa=?,
        risponde=?, destinatari=?, radici=?, autoreIndirizzo=?, indicizzato=?
      WHERE rid = ?
    `),
    /**
     * Solo il filo, e niente altro.
     *
     * Il filo è arrivato dopo, e la prima lettura successiva lo scrive su ogni
     * email che c'era già. Se passasse da `updDoc` ogni messaggio conterebbe
     * come «cambiato»: `indicizzato` si sposterebbe a oggi e la mattina dopo
     * il feed e le automazioni «guarda cos'è arrivato» vedrebbero tremila
     * email nuove che nuove non sono. Una chiave in più non è un arrivo.
     *
     * E non tocca `radici`: il trigger sull'indice guarda proprio quelle
     * quattro colonne, quindi una riga scritta di qui non fa rifare niente.
     *
     * `messageId` passa di qui per la stessa ragione: è arrivato dopo il filo,
     * e la prima lettura che lo porta non deve far sembrare nuova tutta la
     * casella. E `letto` e `massa` pure: aprire un'email nel programma di
     * posta non la rende un'email nuova. E `risponde` e `destinatari` lo
     * stesso: arrivano con una lettura successiva su email che c'erano già.
     */
    updFilo: d.prepare('UPDATE documenti SET filo = ?, inviato = ?, messageId = ?, letto = ?, massa = ?, risponde = ?, destinatari = ? WHERE rid = ?')
  }
  istruzioni.set(d, i)
  return i
}

/** Quanto è cambiato davvero in una lettura. */
export type EsitoScrittura = { nuovi: number; cambiati: number; invariati: number }

/** Un sì/no che può anche non esserci: `null` in colonna vuol dire «non lo so». */
function bit(v: boolean | null | undefined): number | null {
  return v === undefined || v === null ? null : v ? 1 : 0
}

/**
 * Segna come lette — o tornate da leggere — le email che erano già dentro.
 *
 * La lettura della posta scarica solo i messaggi che mancano: quelli che
 * c'erano già non si toccano, e quindi la bandiera \Seen di un'email letta
 * ieri sera nel programma di posta non arriverebbe mai qui. Il connettore fa
 * un giro a parte sulle sole bandiere degli ultimi messaggi, e questo è dove
 * finisce. Solo la colonna, e solo dove cambia: non `indicizzato`, che
 * direbbe «è arrivata adesso» di un'email di una settimana fa.
 */
export function segnaLetti(righe: { id: string; letto: boolean }[]): number {
  if (!righe.length) return 0
  const upd = db.prepare('UPDATE documenti SET letto = ? WHERE id = ? AND (letto IS NULL OR letto != ?)')
  let cambiati = 0
  db.exec('BEGIN')
  try {
    for (const r of righe) cambiati += Number(upd.run(r.letto ? 1 : 0, r.id, r.letto ? 1 : 0).changes)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  return cambiati
}

/**
 * Scrive i documenti, e tocca solo quelli che sono cambiati davvero.
 *
 * Prima riscriveva tutto, sempre. Ogni rilettura — e ce n'è una ogni sei ore —
 * aggiornava ogni riga e rifaceva l'indice full-text di ogni documento — tutto
 * il corpo di tutti i file, anche quando sul disco non si era mosso niente. Su
 * duemilaseicento documenti è un lavoro inutile che si ripete quattro volte al
 * giorno.
 *
 * Ma il danno vero non era la fatica: era che `indicizzato` finiva per dire
 * «l'ultima volta che ho guardato» invece di «l'ultima volta che è cambiato».
 * Con quella colonna azzerata di continuo non c'era modo di sapere cosa fosse
 * *arrivato* — ed è esattamente la domanda a cui bisogna saper rispondere
 * perché il feed si aggiorni da solo quando compare un file nuovo sul Mac.
 * Adesso `indicizzato` è una data di nascita o di modifica, e ci si può contare.
 */
/**
 * Gli stessi documenti, ma senza tenere fermo il processo.
 *
 * `salvaDocumenti` è tutta dentro una transazione sincrona: con la prima
 * lettura di una casella grossa sono migliaia di righe più lo stemming di
 * ognuna, e per tutto quel tempo il server non risponde a nessun altro — non
 * alle altre schermate di chi sta leggendo, e su un server non agli altri
 * conti. A pezzi di duecento, con un respiro in mezzo, il lavoro è lo stesso e
 * il tempo pure; quello che cambia è che fra un pezzo e l'altro le altre
 * richieste passano.
 *
 * Ogni pezzo è la sua transazione: un guasto a metà lascia dentro i pezzi
 * finiti invece di buttare via tutto. Per la lettura di una casella è la cosa
 * giusta — quello che è entrato è entrato, e il giro dopo riprende da lì.
 */
export async function salvaDocumentiAPezzi(docs: Documento[], pezzo = 200): Promise<EsitoScrittura> {
  const tot: EsitoScrittura = { nuovi: 0, cambiati: 0, invariati: 0 }
  for (let i = 0; i < docs.length; i += pezzo) {
    const e = salvaDocumenti(docs.slice(i, i + pezzo))
    tot.nuovi += e.nuovi; tot.cambiati += e.cambiati; tot.invariati += e.invariati
    if (i + pezzo < docs.length) await new Promise(r => setImmediate(r))
  }
  return tot
}

export function salvaDocumenti(docs: Documento[]): EsitoScrittura {
  const esito: EsitoScrittura = { nuovi: 0, cambiati: 0, invariati: 0 }
  if (!docs.length) return esito
  const ora = new Date().toISOString()
  db.exec('BEGIN')
  try {
    for (const d of docs) {
      const gia = istr().selEsistente.get(d.id) as {
        rid: number; titolo: string; corpo: string
        autore: string | null; percorso: string | null; quando: string | null; gruppo: string | null
        filo: string | null; inviato: number | null; messageId: string | null
        letto: number | null; massa: number | null; risponde: string | null; destinatari: string | null
        radici: string | null
      } | undefined

      if (gia) {
        const uguale =
          gia.titolo === d.titolo &&
          gia.corpo === d.corpo &&
          gia.autore === (d.autore ?? null) &&
          gia.percorso === (d.percorso ?? null) &&
          gia.quando === (d.quando ?? null) &&
          gia.gruppo === (d.gruppo ?? null)

        // Identico *e* già indicizzato: non c'è niente da fare. Il controllo
        // sulle radici non è pignoleria — senza, un documento entrato senza la
        // sua riga di indice non tornerebbe più cercabile, e sarebbe invisibile
        // per sempre restando lì a farsi contare.
        if (uguale && gia.radici !== null) {
          // il filo e «l'ho scritta io» arrivano tutti e due dopo, e nessuno dei
          // due è un contenuto: si scrivono senza far contare il documento come cambiato
          if (gia.filo !== (d.filo ?? null) || !!gia.inviato !== !!d.inviato || gia.messageId !== (d.messageId ?? null) ||
              (gia.letto ?? null) !== bit(d.letto) || (gia.massa ?? null) !== bit(d.massa) ||
              (gia.risponde ?? null) !== (d.risponde ?? null) || (gia.destinatari ?? null) !== (d.destinatari ?? null)) {
            istr().updFilo.run(d.filo ?? null, d.inviato ? 1 : 0, d.messageId ?? null, bit(d.letto), bit(d.massa), d.risponde ?? null, d.destinatari ?? null, gia.rid)
          }
          esito.invariati++
          continue
        }

        // l'indice full-text si aggiorna da solo: legge queste stesse colonne,
        // e i trigger su `documenti` gli dicono quando sono cambiate
        istr().updDoc.run(d.titolo, d.corpo, d.autore ?? null, d.percorso ?? null, d.quando ?? null, d.gruppo ?? null, d.filo ?? null, d.inviato ? 1 : 0, d.messageId ?? null, bit(d.letto), bit(d.massa), d.risponde ?? null, d.destinatari ?? null, radici(`${d.titolo} ${d.corpo} ${d.autore ?? ''}`), indirizzoDi(d.autore), ora, gia.rid)
        esito.cambiati++
        continue
      }

      istr().insDoc.run(d.id, d.fonte, d.tipo, d.titolo, d.corpo, d.autore ?? null, d.percorso ?? null, d.quando ?? null, d.gruppo ?? null, d.filo ?? null, d.inviato ? 1 : 0, d.messageId ?? null, bit(d.letto), bit(d.massa), d.risponde ?? null, d.destinatari ?? null, radici(`${d.titolo} ${d.corpo} ${d.autore ?? ''}`), indirizzoDi(d.autore), ora)
      esito.nuovi++
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  return esito
}

/**
 * Quello che è arrivato, non quello che è recente.
 *
 * `recenti()` ordina per `quando`, che è la data *del documento*. Un contratto
 * del 2023 che metti nella cartella stamattina non è recente per nessuno, e
 * infatti non compariva mai — eppure è la cosa più nuova che sia successa oggi.
 * Qui si ordina per quando è entrato nell'indice, che è la domanda giusta da
 * fare quando ci si chiede «cos'è cambiato mentre non guardavo».
 */
/**
 * Quello che è entrato da un certo momento in qua.
 *
 * **Meno quello che ha scritto lei.** Da quando si legge anche la posta
 * inviata, la prima lettura dopo l'aggiornamento la indicizza tutta insieme —
 * e siccome «appena arrivato» si misura da quando è entrata nell'indice, non
 * da quando è stata scritta, quelle finivano in cima. Il risultato sarebbe
 * stato una prima pagina fatta delle email che ha mandato lei, e delle
 * automazioni «quando arriva una fattura» che si mettono a preparare risposte
 * alle sue stesse mail. Arrivare vuol dire arrivare da fuori.
 */
export function appenaArrivati(dal: string, limite = 30): Documento[] {
  return db.prepare(`
    SELECT ${CAMPI} FROM documenti WHERE indicizzato >= ? AND (inviato IS NULL OR inviato = 0)
    ORDER BY indicizzato DESC, quando DESC LIMIT ?
  `).all(dal, limite) as unknown as Documento[]
}

/**
 * Gli impegni fra due date, in ordine di quando succedono.
 *
 * L'unica query dell'indice ordinata per `quando` invece che per «quando l'ho
 * letto». Per tutto il resto le due cose si somigliano abbastanza; per
 * un'agenda no — un impegno di domani indicizzato ieri viene prima di uno di
 * lunedì scorso indicizzato stamattina, e chiedere «cosa ho questa settimana»
 * ordinando per lettura risponde con le cose sbagliate nell'ordine sbagliato.
 */
export function eventi(da: string, a: string, limite = 60): Documento[] {
  return db.prepare(`
    SELECT ${CAMPI} FROM documenti WHERE fonte = 'calendario' AND quando >= ? AND quando <= ?
    ORDER BY quando ASC LIMIT ?
  `).all(da, a, limite) as unknown as Documento[]
}

/** Toglie tutto quello che è arrivato da una fonte (quando la scolleghi). */
/** Le voci del feed che puntavano a un documento sparito smettono di prometterlo. */
function scollegaDalFeed(ids: string[]) {
  if (!ids.length) return
  for (const id of ids) {
    const d = documento(id)
    if (!d) continue
    const contesto = JSON.stringify(contestoAttenzione(d))
    db.prepare('UPDATE feed SET contesto = COALESCE(contesto, ?) WHERE doc = ?').run(contesto, id)
    db.prepare('UPDATE compiti SET contesto = COALESCE(contesto, ?) WHERE doc = ?').run(contesto, id)
  }
  const upd = db.prepare('UPDATE feed SET doc = NULL WHERE doc = ?')
  for (const id of ids) upd.run(id)
}

export function svuotaFonte(fonte: string) {
  const righe = db.prepare('SELECT id FROM documenti WHERE fonte = ?').all(fonte) as { id: string }[]
  db.exec('BEGIN')
  try {
    scollegaDalFeed(righe.map(r => r.id))
    // niente da togliere a mano dall'indice: la cancellazione fa scattare il
    // trigger, che è l'unico posto che sa passargli i vecchi valori
    db.prepare('DELETE FROM documenti WHERE fonte = ?').run(fonte)
    // e il guaio di adesso: una fonte scollegata non ha niente da sistemare.
    // La storia dei giorni resta, è quello che è successo davvero
    db.prepare('DELETE FROM stato_fonti WHERE fonte = ?').run(fonte)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

/**
 * Quanto di una fonte è stato davvero guardato in questa lettura.
 *
 * Serve perché `riconcilia` non può dedurre una cancellazione dall'assenza: un
 * permesso negato da macOS, un disco staccato, un tetto raggiunto e un file
 * lento producono tutti lo stesso silenzio di un file cancellato davvero. Solo
 * il connettore sa distinguerli, e deve dirlo qui.
 */
export type Ambito = {
  /** Falso se anche una sola cosa non è stata guardata: allora non si cancella niente. */
  completo: boolean
  /** Le radici percorse fino in fondo; vuoto significa «tutta la fonte». */
  radiciViste?: string[]
}

/**
 * Toglie i documenti di una fonte che non sono più stati visti: un file
 * cancellato o rinominato non deve restare nell'indice — e soprattutto non
 * deve finire fra le fonti che Claude cita.
 *
 * Cancella solo se la lettura si dichiara completa. Prima non era così, e una
 * cartella temporaneamente illeggibile bastava a svuotare l'indice di quella
 * cartella: il file sul disco restava, la sua copia qui no, e nessuno se ne
 * accorgeva finché una risposta non diventava sbagliata.
 */
/**
 * Toglie dall'indice dei documenti precisi, per id.
 *
 * Serve dopo aver spostato dei messaggi: l'id di un'email è `posta:cartella:uid`
 * e contiene la cartella, quindi un messaggio finito nel cestino non è più
 * quello di prima — la sua riga qui parla di un posto in cui non c'è. Lasciarla
 * vuol dire una fonte citata che non si apre più.
 */
export function scordaDocumenti(ids: string[]): number {
  if (!ids.length) return 0
  const del = db.prepare('DELETE FROM documenti WHERE id = ?')
  let n = 0
  db.exec('BEGIN')
  try {
    scollegaDalFeed(ids)
    for (const id of ids) n += Number(del.run(id).changes ?? 0)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  return n
}

export function riconcilia(fonte: string, ambito: Ambito, idVisti: string[]): number {
  if (!ambito.completo) return 0
  const vivi = new Set(idVisti)
  const tutti = db.prepare('SELECT rid, id, percorso FROM documenti WHERE fonte = ?').all(fonte) as
    { rid: number; id: string; percorso: string | null }[]

  const dentro = (r: { percorso: string | null }) => {
    const radici = ambito.radiciViste
    if (!radici || !radici.length) return true
    return !!r.percorso && radici.some(rad => r.percorso === rad || r.percorso!.startsWith(rad + '/'))
  }

  const morti = tutti.filter(r => !vivi.has(r.id) && dentro(r))
  if (!morti.length) return 0
  const del = db.prepare('DELETE FROM documenti WHERE rid = ?')
  db.exec('BEGIN')
  try {
    scollegaDalFeed(morti.map(m => m.id))
    for (const m of morti) del.run(m.rid)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  return morti.length
}

/**
 * Una fetta di casella letta fino in fondo: dal primo uid all'ultimo, compresi.
 *
 * `aUid` è l'ultimo uid *guardato*, non l'ultimo esistente. Una lettura che si
 * ferma al tetto dei quattrocento messaggi dichiara la finestra che ha finito
 * davvero, e fuori da lì non si tocca niente.
 */
export type FinestraPosta = { cartella: string; daUid: number; aUid: number }

/**
 * La posta cancellata dal telefono se ne va anche da qui.
 *
 * Finora non se ne andava mai: `riconcilia` cancella quello che una lettura
 * completa non ha più visto, e una casella non si legge mai tutta — si leggono
 * gli ultimi messaggi. Con quella regola, un'email buttata via un mese fa
 * restava nell'indice per sempre, veniva cercata, e finiva fra le fonti che
 * Claude cita: una risposta costruita su una mail che la persona ha
 * cancellato, e che aprendola non c'è.
 *
 * Qui il permesso di cancellare è ristretto a mano: solo dentro le finestre di
 * uid che il connettore dichiara di aver letto pulite, cartella per cartella.
 * Fuori da lì non si tocca niente — mai, in nessun caso, nemmeno per una
 * cartella che sembra la stessa. Un uid è un numero e non contiene i due
 * punti, quindi la cartella si ricava tagliando dall'*ultimo* separatore:
 * `posta:INBOX:2024:812` è la cartella «INBOX:2024», non «INBOX». Confrontarla
 * per intero è quello che impedisce a una finestra su INBOX di cancellare la
 * posta di un'altra cartella che comincia allo stesso modo.
 *
 * Sbagliare per difetto lascia una riga vecchia; sbagliare per eccesso
 * cancella la posta di qualcuno. Le due cose non si somigliano.
 */
export function riconciliaPosta(finestre: FinestraPosta[], idVisti: string[]): number {
  if (!finestre.length) return 0
  const vivi = new Set(idVisti)
  const nella = db.prepare(
    "SELECT id FROM documenti WHERE fonte = 'posta' AND id >= ? AND id < ?"
  )

  const morti = new Set<string>()
  for (const f of finestre) {
    const da = Number(f.daUid)
    const a = Number(f.aUid)
    // una finestra senza cartella, o al contrario, o con dentro qualcosa che
    // non è un numero, non è una finestra: si salta invece di indovinare
    if (!f.cartella || !Number.isInteger(da) || !Number.isInteger(a) || da > a || da < 1) continue
    const prefisso = `posta:${f.cartella}:`
    for (const r of nella.all(prefisso, prefisso + '\uffff') as { id: string }[]) {
      const taglio = r.id.lastIndexOf(':')
      if (r.id.slice('posta:'.length, taglio) !== f.cartella) continue
      const uid = Number(r.id.slice(taglio + 1))
      if (!Number.isInteger(uid) || uid < da || uid > a) continue
      if (vivi.has(r.id)) continue
      morti.add(r.id)
    }
  }
  if (!morti.size) return 0

  const del = db.prepare('DELETE FROM documenti WHERE id = ?')
  db.exec('BEGIN')
  try {
    scollegaDalFeed([...morti])
    for (const id of morti) del.run(id)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  return morti.size
}

// — fin dove è arrivato un connettore —
//
// Una casella con più di quattrocento messaggi nuovi ne prende quattrocento
// per giro, e va bene: quello che non va bene è ricominciare ogni volta dalla
// stessa finestra, perché allora la casella resta parziale per sempre e non lo
// dice nessuno. Qui si scrive dove ci si era fermati.
//
// Il valore è del connettore e qui non si interpreta: un uid, una data, un
// `pageToken` di Google. Per persona, come tutto il resto di questo file.

/** Dove si era fermato l'ultimo giro di questa fonte, o niente se non c'è mai stato. */
export function cursore(fonte: string): string | null {
  const r = db.prepare('SELECT valore FROM cursori WHERE fonte = ?').get(fonte) as { valore: string } | undefined
  return r?.valore ?? null
}

/**
 * Segna dove si è arrivati. `null` cancella il segno.
 *
 * Cancellare non è «azzera e rileggi tutto per sbaglio»: è quello che serve
 * quando la fonte cambia sotto — una casella ricreata, un `uidValidity`
 * diverso — e il vecchio paletto adesso indica un posto che non esiste.
 * Tenerlo sarebbe peggio che non averlo.
 */
export function segnaCursore(fonte: string, valore: string | null): void {
  if (valore === null) {
    db.prepare('DELETE FROM cursori WHERE fonte = ?').run(fonte)
    return
  }
  db.prepare(`
    INSERT INTO cursori (fonte, valore, quando) VALUES (?,?,?)
    ON CONFLICT(fonte) DO UPDATE SET valore = excluded.valore, quando = excluded.quando
  `).run(fonte, valore, new Date().toISOString())
}

/**
 * Quanti termini dell'indice si guardano prima di accontentarsi.
 *
 * Il `LIMIT` non è solo per non scrivere una query FTS lunga un chilometro:
 * è quello che ferma la lettura del vocabolario appena ha abbastanza, così un
 * pezzo comune — «anno», «2026» — non la fa arrivare in fondo.
 */
const TERMINI_SIMILI = 40

/**
 * I termini che l'indice conosce e che contengono questo pezzo di parola.
 *
 * Il vocabolario di FTS5 è una vista sull'indice: una riga per termine
 * distinto, senza i documenti. Leggerlo tutto costa quanto le *parole* che ci
 * sono, non quanto il testo — su una casella vera è la differenza fra qualche
 * decina di megabyte e dieci gigabyte.
 */
function terminiCheContengono(pezzo: string, tetto = TERMINI_SIMILI): string[] {
  if (pezzo.length < 3) return []
  const like = '%' + pezzo.replace(/[\\%_]/g, c => '\\' + c) + '%'
  try {
    return (db.prepare(
      `SELECT term FROM ricerca_termini WHERE term LIKE ? ESCAPE '\\' LIMIT ?`
    ).all(like, tetto) as { term: string }[]).map(r => r.term)
  } catch {
    // un indice fermo a uno schema vecchio non ha il vocabolario: la ricerca
    // resta quella dell'FTS, che è la parte che conta
    return []
  }
}

/**
 * Ricerca full-text, in italiano.
 *
 * Tre cose che prima non c'erano. Le parole vanno in AND, non in OR: prima
 * "quali fatture del cliente Rossi" trovava ogni documento che contenesse una
 * qualsiasi di quelle parole, cioè quasi tutti, e il bm25 doveva scegliere fra
 * migliaia di risultati a caso. Le colonne pesano diversamente: una parola nel
 * titolo conta più della stessa parola persa a pagina quaranta. E il tempo
 * conta: fra due listini prezzi, quello dell'anno scorso non è la risposta.
 */
/**
 * Quante delle parole cercate compaiono davvero in un documento.
 *
 * Si guarda sulle radici — la stessa colonna su cui cerca l'indice — così
 * «sistemi» conta per «sistema» come conterebbe nella query. Il titolo e
 * l'autore ci entrano perché una parola nel titolo vale quanto una nel corpo,
 * e l'indice la tratta già così.
 */
function quanteParole(d: Documento & { punti: number }, parole: string[]): number {
  const dove = ` ${radici(`${d.titolo} ${d.corpo} ${d.autore ?? ''}`)} `
  return parole.filter(t => dove.includes(` ${radice(t)} `) || dove.includes(radice(t))).length
}

/**
 * Cercare per una domanda, o cercare per delle parole chiave.
 *
 * Sono due mestieri diversi, e la differenza sta tutta in cosa vuol dire
 * allargare. «preventivo offerta inviato» è la ricerca di un'automazione: tre
 * sinonimi, e un documento che ne contiene uno solo è esattamente quello che
 * si cercava. «deadline for H-Farm AI systems» è una domanda: un documento che
 * contiene solo «systems» non è un risultato debole, è un altro documento.
 *
 * `stretta` dice quale dei due. Sta qui e non in due funzioni perché la
 * ricerca è una sola e cambia di un passo; e sta come parametro e non come
 * indovinello sul numero di parole perché chi chiama lo sa, e la ricerca no.
 */
export function cerca(q: string, limite = 20, fonti?: string[], stretta = false): Documento[] {
  const parole = termini(q)
  if (!parole.length) return []

  /**
   * Il recinto delle fonti, quando c'è.
   *
   * Serve alle automazioni che dichiarano cosa possono aprire: «guarda nella
   * posta» dev'essere una ricerca che *non può* tornare un file del disco, non
   * una ricerca su tutto con la raccomandazione di ignorare il resto. Il filtro
   * sta nell'SQL e non dopo, altrimenti un limite di otto risultati riempito da
   * altre fonti riporta indietro una lista vuota su un indice pieno.
   *
   * Nessun `fonti` significa «tutto», che è il comportamento di sempre e resta
   * quello di chi chiama senza saperne niente.
   */
  const dentro = fonti?.length ? fonti : []
  /** Per la query FTS, dove i segnaposto sono tutti anonimi e in fila. */
  const recinto = dentro.length ? ` AND d.fonte IN (${dentro.map(() => '?').join(',')})` : ''

  // ogni parola vale se compare come radice o come prefisso letterale: la
  // radice prende il plurale, il prefisso prende i nomi propri e i codici
  const clausola = (t: string) => `(radici:"${radice(t)}" OR "${t}"*)`
  const pesi = 'bm25(ricerca, 5.0, 1.0, 0.5, 1.0)'

  const conQuery = (match: string): (Documento & { punti: number })[] => {
    try {
      return db.prepare(`
        SELECT ${CAMPI_D}, ${pesi} AS punti FROM ricerca r JOIN documenti d ON d.rid = r.rowid
        WHERE ricerca MATCH ?${recinto} ORDER BY punti LIMIT ?
      `).all(match, ...dentro, limite * 3) as unknown as (Documento & { punti: number })[]
    } catch {
      return []
    }
  }

  /*
   * Prima tutte le parole insieme; se stringe troppo, si allarga — ma non fino
   * a «una qualunque».
   *
   * L'OR secco è come una domanda di sei parole torna con dei contratti
   * d'affitto: basta che un documento contenga «systems», o «deadline», o
   * «AI», e passa. Da lì in poi il guasto non è più della ricerca. Quei
   * documenti arrivano al modello sotto la parola «Materiale:», cioè come
   * roba pertinente, e un modello piccolo fa l'unica cosa che può fare — li
   * legge e scrive due paragrafi su come mai non c'entrano niente. Il
   * quattordici settembre la risposta a una domanda su H-Farm cominciava con
   * «in base ai contratti d'affitto di CERU Boca Raton».
   *
   * Allargare serve, e resta: una domanda di sei parole non sta tutta in un
   * documento solo. Ma un documento che ne prende una su sei non è un
   * risultato debole, è un documento diverso. La soglia è la metà, arrotondata
   * per eccesso, e mai sotto due: con due parole servono entrambe, con sei ne
   * bastano tre. È la regola che qualunque motore di ricerca chiama «minimum
   * should match», e costa una passata sui titoli.
   *
   * Solo per le domande, però: `stretta`. Le parole di un'automazione sono
   * sinonimi messi in fila apposta, e lì una su tre è la risposta giusta.
   */
  let trovati = conQuery(parole.map(clausola).join(' AND '))
  if (trovati.length < 5 && parole.length > 1) {
    const visti = new Set(trovati.map(d => d.id))
    const soglia = stretta ? Math.max(2, Math.ceil(parole.length / 2)) : 1
    for (const d of conQuery(parole.map(clausola).join(' OR '))) {
      if (!visti.has(d.id) && quanteParole(d, parole) >= soglia) trovati.push(d)
    }
  }

  if (!trovati.length) {
    /*
     * L'ultimo tentativo: un pezzo di parola, cercato nel vocabolario.
     *
     * Qui prima c'era `titolo LIKE '%…%' OR corpo LIKE '%…%'`, cioè la lettura
     * di ogni corpo di ogni documento — su un indice da dieci gigabyte, secondi
     * di server fermo *per tutti* a ogni domanda che l'FTS non aveva capito.
     *
     * Ma serviva a qualcosa di vero, e quel qualcosa non si può togliere:
     * l'FTS trova la radice e il prefisso, quindi «fatture» trova «fattura» e
     * «collau» trova «collaudo», e non trova un pezzo preso in mezzo a una
     * parola — «5428» dentro un IBAN, quattro cifre di un numero d'ordine, la
     * coda di un codice. Chi cerca così ha in mano un pezzo di carta e copia
     * quello che vede.
     *
     * La stessa risposta si prende dall'indice invece che dai documenti:
     * `ricerca_termini` è l'elenco dei termini che l'indice conosce — parole,
     * non testi — e trovare quelli che contengono il pezzo costa una lettura
     * di quell'elenco, che è ordini di grandezza più piccolo del testo. Poi si
     * torna a chiedere all'FTS, con i termini veri, e il risultato passa dal
     * solito ordinamento invece di arrivare come capita.
     */
    const perParola = parole.map(t => terminiCheContengono(t))
    if (perParola.every(l => l.length)) {
      const uno = (t: string) => `"${t.replace(/"/g, '""')}"`
      trovati = conQuery(perParola.map(l => `(${l.map(uno).join(' OR ')})`).join(' AND '))
    }
  }

  // il riordino per data sta qui e non nell'SQL apposta: è una scelta di
  // prodotto, e deve restare leggibile da chi la vorrà cambiare
  const ora = Date.now()
  const punteggio = (d: Documento & { punti: number }) => {
    const giorni = d.quando ? (ora - Date.parse(d.quando)) / 86_400_000 : 3650
    const freschezza = Number.isFinite(giorni) ? Math.exp(-Math.max(0, giorni) / 180) : 0
    return -d.punti + 0.6 * freschezza
  }

  return trovati
    .sort((a, b) => punteggio(b) - punteggio(a))
    .slice(0, limite)
    .map(({ punti: _p, ...d }) => d as Documento)
}

export function recenti(limite = 40): Documento[] {
  return db.prepare(`SELECT ${CAMPI} FROM documenti ORDER BY quando DESC LIMIT ?`).all(limite) as unknown as Documento[]
}

/**
 * Gli id che cominciano così — «posta:INBOX:» — per sapere cosa c'è già.
 *
 * Un intervallo sull'indice unico degli id, non un LIKE: su una casella
 * grossa la differenza è fra un millisecondo e una lettura intera.
 */
export function idsConPrefisso(prefisso: string): string[] {
  return (db.prepare('SELECT id FROM documenti WHERE id >= ? AND id < ?')
    .all(prefisso, prefisso + '\uffff') as { id: string }[]).map(r => r.id)
}

/**
 * Le email vecchie di cui non abbiamo ancora letto le intestazioni di massa.
 *
 * La colonna `massa` è arrivata dopo molte caselle già indicizzate. Lasciarla
 * vuota per sempre significa che proprio newsletter e promozioni storiche
 * passano il filtro del feed. Si restituisce un blocco piccolo e recente: il
 * connettore lo rilegge insieme alla posta nuova, poi al giro dopo prosegue.
 */
export function uidPostaDaClassificare(cartella: string, limite = 200): Set<number> {
  if (!cartella || limite < 1) return new Set()
  const prefisso = `posta:${cartella}:`
  const righe = db.prepare(`
    SELECT id FROM documenti
    WHERE fonte = 'posta' AND percorso = ? AND massa IS NULL
      AND id >= ? AND id < ?
    ORDER BY quando DESC
    LIMIT ?
  `).all(cartella, prefisso, prefisso + '\uffff', limite) as { id: string }[]
  return new Set(righe.map(r => Number(r.id.slice(r.id.lastIndexOf(':') + 1)))
    .filter(n => Number.isInteger(n) && n > 0))
}

/**
 * La data di modifica di tutto quello che comincia così, per id.
 *
 * Serve al desktop per non rileggere quello che non è cambiato: `quando` di
 * un file è la sua data di modifica, e un file con la stessa data è lo
 * stesso file. Stesso intervallo sull'indice degli id di `idsConPrefisso`.
 */
export function quandoPerPrefisso(prefisso: string): Map<string, string | null> {
  const righe = db.prepare('SELECT id, quando FROM documenti WHERE id >= ? AND id < ?')
    .all(prefisso, prefisso + '\uffff') as { id: string; quando: string | null }[]
  return new Map(righe.map(r => [r.id, r.quando]))
}

export function documento(id: string): Documento | null {
  return (db.prepare(`SELECT ${CAMPI} FROM documenti WHERE id = ?`).get(id) as unknown as Documento) ?? null
}

// — quanto è costato —

export type Uso = { lavoro: string; motore: string; entrata: number; cache: number; uscita: number }

export function segnaUso(u: Uso) {
  /*
   * Fuori da una richiesta, su un server, non si scrive.
   *
   * Senza contesto `cartella()` torna la radice — che su un computer di casa è
   * giusta, perché lì la persona è una — ma su un server è di nessuno: la prima
   * chiamata *crea* un `mente.db` alla radice, ci scrive dentro il conto di
   * qualcuno, e quel file resta lì per sempre senza appartenere a niente. È il
   * tipo di guasto che non dà errore: si scopre guardando la cartella dei dati.
   * Contare è accessorio; scrivere in un indice orfano no.
   */
  if (OSPITATO && !chi.adesso()) return
  // con l'etichetta del contesto («prova:risposta»), se una prova sta girando: vedi etichetta-uso.ts
  db.prepare('INSERT INTO uso (quando, lavoro, motore, entrata, cache, uscita) VALUES (?,?,?,?,?,?)')
    .run(new Date().toISOString(), etichettato(u.lavoro), u.motore, u.entrata, u.cache, u.uscita)
}

export type Totale = { chiamate: number; entrata: number; cache: number; uscita: number }

/** I token spesi da un istante in qua: serve al tetto di oggi. */
export function usoDal(quando: string): Totale {
  const r = db.prepare(
    'SELECT COUNT(*) AS n, COALESCE(SUM(entrata),0) AS e, COALESCE(SUM(cache),0) AS c, COALESCE(SUM(uscita),0) AS u FROM uso WHERE quando >= ?'
  ).get(quando) as { n: number; e: number; c: number; u: number }
  return { chiamate: r.n, entrata: r.e, cache: r.c, uscita: r.u }
}

/** Giorno per giorno, per la riga nelle preferenze. */
export function usoPerGiorno(giorni: number): (Totale & { giorno: string })[] {
  const da = new Date(Date.now() - giorni * 86_400_000).toISOString().slice(0, 10)
  return db.prepare(
    'SELECT substr(quando, 1, 10) AS giorno, COUNT(*) AS chiamate, SUM(entrata) AS entrata, SUM(cache) AS cache, SUM(uscita) AS uscita ' +
    'FROM uso WHERE quando >= ? GROUP BY giorno ORDER BY giorno'
  ).all(da) as (Totale & { giorno: string })[]
}

/**
 * Gli altri messaggi della stessa conversazione, i più recenti prima.
 *
 * `escludi` sono quelli che chi chiama ha già in mano: la ricerca ne ha trovato
 * uno, e qui si vogliono i fratelli, non lui un'altra volta. Si esclude
 * nell'SQL e non dopo, altrimenti un limite di cinque riempito dai già visti
 * riporterebbe indietro una lista vuota su un filo pieno.
 */
export function stessoFilo(filo: string, escludi: string[] = [], limite = 5): Documento[] {
  if (!filo) return []
  const fuori = escludi.length ? ` AND id NOT IN (${escludi.map(() => '?').join(',')})` : ''
  return db.prepare(`
    SELECT ${CAMPI} FROM documenti WHERE filo = ?${fuori}
    ORDER BY quando DESC LIMIT ?
  `).all(filo, ...escludi, limite) as unknown as Documento[]
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

export function creaChat(id: string, titolo: string, sul?: { progetto: string; iniziativa: string }) {
  db.prepare('INSERT OR REPLACE INTO chat (id, titolo, quando, progetto, iniziativa) VALUES (?,?,?,?,?)')
    .run(id, titolo, new Date().toISOString(), sul?.progetto ?? null, sul?.iniziativa ?? null)
}

/** Di quale progetto parla una chat nata da «Parliamone», o null. */
export function chatSulProgetto(id: string): { progetto: string; iniziativa: string; quando: string } | null {
  const r = db.prepare('SELECT progetto, iniziativa, quando FROM chat WHERE id = ?').get(id) as { progetto: string | null; iniziativa: string | null; quando: string } | undefined
  return r?.progetto ? { progetto: r.progetto, iniziativa: r.iniziativa ?? '', quando: r.quando } : null
}

export function rinominaChat(id: string, titolo: string) {
  db.prepare('UPDATE chat SET titolo = ? WHERE id = ?').run(titolo, id)
}

/**
 * Tutto quello che stava sotto un progetto passa sotto un altro.
 *
 * Le righe della lista, le voci del feed, le domande e le chat portano l'id
 * del progetto in una colonna, e unire due progetti (`progetti.unisci`) vuol
 * dire riscrivere quelle quattro colonne in una transazione sola: o si
 * spostano tutte o nessuna. Con `a` nullo si staccano e basta: è quello che
 * succede quando un progetto si cancella e le sue righe restano senza
 * progetto. Torna quante righe ha toccato, per dirlo.
 */
export function riassegnaProgetto(da: string, a: string | null): { compiti: number; feed: number; domande: number; chat: number } {
  const sposta = (tabella: string) =>
    (db.prepare(`UPDATE ${tabella} SET progetto = ? WHERE progetto = ?`).run(a, da) as { changes: number }).changes
  db.exec('BEGIN')
  try {
    const n = { compiti: sposta('compiti'), feed: sposta('feed'), domande: sposta('domande'), chat: sposta('chat') }
    db.exec('COMMIT')
    return n
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

export function elencoChat() {
  return db.prepare('SELECT * FROM chat ORDER BY quando DESC').all() as { id: string; titolo: string; quando: string }[]
}

export function eliminaChat(id: string) {
  db.prepare('DELETE FROM messaggi WHERE chat = ?').run(id)
  db.prepare('DELETE FROM chat WHERE id = ?').run(id)
}

export function salvaMessaggio(m: { id: string; chat: string; ruolo: string; testo: string; fonti?: unknown; verifica?: unknown }) {
  db.prepare('INSERT INTO messaggi (id, chat, ruolo, testo, fonti, verifica, quando) VALUES (?,?,?,?,?,?,?)')
    .run(m.id, m.chat, m.ruolo, m.testo, m.fonti ? JSON.stringify(m.fonti) : null, m.verifica ? JSON.stringify(m.verifica) : null, new Date().toISOString())
}

export function togliMessaggio(id: string) {
  db.prepare('DELETE FROM messaggi WHERE id = ?').run(id)
}

/**
 * `conVerifica`: anche il verbale di ogni risposta (`messaggi.verifica`, P7).
 * La rotta e il client non lo chiedono; lo chiede il fascicolo, che deve
 * portare tutto.
 */
export function messaggi(chat: string, conVerifica = false) {
  const righe = db.prepare('SELECT * FROM messaggi WHERE chat = ? ORDER BY quando, id').all(chat) as {
    id: string; ruolo: string; testo: string; fonti: string | null; verifica: string | null
  }[]
  const leggi = (s: string | null) => { if (!s) return undefined; try { return JSON.parse(s) as unknown } catch { return undefined } }
  return righe.map(r => ({
    id: r.id, role: r.ruolo, text: r.testo, sources: r.fonti ? JSON.parse(r.fonti) : undefined,
    ...(conVerifica ? { verifica: leggi(r.verifica) } : {})
  }))
}

export function esisteChat(id: string): boolean {
  return !!db.prepare('SELECT 1 FROM chat WHERE id = ?').get(id)
}

/** Quante righe indietro si fruga: oltre non è cronologia recente, è archeologia. */
const MESSAGGI_FRUGATI = 20_000

/**
 * Frugare nelle conversazioni passate.
 *
 * Le chat non stanno nell'indice dei documenti, e non ci devono stare: un
 * documento è roba che ti è arrivata, una chat è roba che hai detto tu. Tenerle
 * insieme vorrebbe dire che una ricerca su «preventivo Rossi» ti riporta
 * indietro anche la volta che ne hai parlato con Myynd, mescolata ai documenti
 * veri — e a quel punto le citazioni puntano a una cosa che non esiste fuori
 * di qui.
 *
 * Separate, invece, diventano un attrezzo a parte che si concede quando serve:
 * «guarda cosa ci siamo detti la settimana scorsa» è una richiesta legittima e
 * frequente, e finora non c'era modo di farla.
 *
 * `LIKE` e non FTS: i messaggi non sono nella tabella di ricerca, sono poche
 * migliaia di righe, e costruirci sopra un secondo indice full-text per una
 * cosa che si chiede di rado sarebbe pagare tutti i giorni per un caso raro.
 *
 * «Poche migliaia» però è un'affermazione con una data di scadenza: fra due
 * anni di conversazioni tutti i giorni non è più vera, e da lì in poi questa
 * riga diventa quello che era il ripiego della ricerca — una lettura intera
 * con il server fermo. Il paletto sul rowid la tiene nel presente: i messaggi
 * si scrivono in ordine, quindi gli ultimi rowid sono gli ultimi messaggi, e
 * più indietro di così si smette di guardare.
 */
export function cercaChat(q: string, limite = 12): {
  chat: string; titolo: string; ruolo: string; testo: string; quando: string
}[] {
  const parole = termini(q)
  if (!parole.length) return []
  // ogni parola dev'esserci: una sola in comune riporta indietro mezza cronologia
  const dove = parole.map(() => 'm.testo LIKE ? ESCAPE \'\\\'').join(' AND ')
  const valori = parole.map(t => '%' + t.replace(/[\\%_]/g, c => '\\' + c) + '%')
  return db.prepare(`
    SELECT m.chat, c.titolo, m.ruolo, m.testo, m.quando
    FROM messaggi m JOIN chat c ON c.id = m.chat
    WHERE m.rowid > COALESCE((SELECT MAX(rowid) FROM messaggi), 0) - ?
      AND ${dove}
    ORDER BY m.quando DESC LIMIT ?
  `).all(MESSAGGI_FRUGATI, ...valori, limite) as { chat: string; titolo: string; ruolo: string; testo: string; quando: string }[]
}

// — feed —

/** Un id stabile per la voce: rigenerare la lettura non duplica il feed. */
function idFeed(v: { titolo: string; doc?: string | null }): string {
  const base = `${v.doc ?? ''}|${v.titolo}`
  let h = 5381
  for (let i = 0; i < base.length; i++) h = ((h * 33) ^ base.charCodeAt(i)) >>> 0
  return 'f' + h.toString(36)
}

/** Le parole di un titolo, spogliate: minuscole, senza accenti né punteggiatura, solo quelle lunghe. */
function paroleDi(titolo: string): Set<string> {
  return new Set(
    titolo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/).filter(p => p.length >= 4)
  )
}

/**
 * Due titoli che dicono la stessa cosa con parole quasi uguali.
 *
 * Non è capire il senso: è contare le parole in comune. Basta, perché il
 * modello che riscrive la stessa voce cambia l'ordine e un aggettivo, non
 * l'argomento — «Preventivo Rossi da confermare» e «Confermare il preventivo
 * a Rossi» hanno tre parole su quattro in comune. Due voci diverse sullo
 * stesso cliente («Fattura di marzo a Rossi», «Fattura di aprile a Rossi») ne
 * hanno due su quattro, e passano.
 */
function stessoTitolo(a: string, b: string): boolean {
  const pa = paroleDi(a), pb = paroleDi(b)
  if (!pa.size || !pb.size) return a.trim().toLowerCase() === b.trim().toLowerCase()
  let comuni = 0
  for (const p of pa) if (pb.has(p)) comuni++
  const unione = pa.size + pb.size - comuni
  return comuni / unione >= 0.6
}

/**
 * Due titoli che sono lo stesso titolo riscritto, e non due cose che si somigliano.
 *
 * La differenza conta perché decide se il documento può smentire le parole.
 * Due fatture dello stesso fornitore hanno titoli quasi uguali e documenti
 * diversi: sono due cose, e il documento ha ragione. Ma
 * «Ship live site copy for tobiadonadon.com» e «Ship finished site copy for
 * tobiadonadon.com» non sono due cose: è una frase con una parola cambiata.
 *
 * Il quattordici settembre sono arrivate tutte e due nello stesso giro. Il
 * conto sulle parole le avrebbe prese — quattro in comune su cinque — ma non è
 * stato nemmeno consultato: lo schema obbliga ogni voce a nominare un
 * documento, il modello le aveva inventate dall'obiettivo di un progetto, e
 * per forza le ha appese a due documenti a caso. Documenti diversi, e la rete
 * dei titoli saltava.
 *
 * Qui la soglia è quasi uno: quattro parole su cinque della più corta. A
 * questa distanza due documenti diversi non vogliono dire due cose, vogliono
 * dire che almeno uno dei due riferimenti è sbagliato.
 */
function titoloRiscritto(a: string, b: string): boolean {
  // I numeri prima delle parole: «Fattura 123» e «Fattura 124» hanno tutte le
  // parole in comune e sono due fatture. È il numero a distinguerle, ed è
  // proprio il numero che `paroleDi` butta via perché è corto.
  const na = numeriDi(a), nb = numeriDi(b)
  if (na.size && nb.size && ![...na].some(n => nb.has(n))) return false

  const pa = paroleDi(a), pb = paroleDi(b)
  if (pa.size < PAROLE_MIN_RISCRITTO || pb.size < PAROLE_MIN_RISCRITTO) return false
  let comuni = 0
  for (const p of pa) if (pb.has(p)) comuni++
  return comuni / Math.min(pa.size, pb.size) >= DENTRO_RISCRITTO
}

/** I numeri dentro un titolo: fatture, versioni, unità. Sono loro a distinguere. */
function numeriDi(s: string): Set<string> {
  return new Set((s.match(/\d+/g) ?? []).filter(n => n.length >= 2))
}

/** Sotto queste parole un titolo è troppo corto perché «riscritto» voglia dire qualcosa. */
const PAROLE_MIN_RISCRITTO = 3
/** Quanta parte del titolo più corto deve stare nell'altro perché sia lo stesso, riscritto. */
const DENTRO_RISCRITTO = 0.8

/** Entro quanto una voce chiusa tiene ancora lontane le sue sorelle. */
const OMBRA_GIORNI = 60

/**
 * Salva quello che la lettura ha tirato fuori. Torna quante voci sono nuove.
 *
 * L'id nasce da documento e titolo, e l'upsert tiene chiuso quello che hai
 * già chiuso. Ma non bastava, e si è visto sul database vero: la stessa
 * email tornava sul feed tre volte in tre giorni, con tre titoli un po'
 * diversi — e tre id diversi. Il modello non è tenuto a riscrivere un titolo
 * alla lettera, quindi l'identità non può essere solo quella. Qui ci sono
 * altre due reti, e passano *prima* dell'upsert:
 *
 *   · un documento, una voce. Se per quel documento c'è già una voce aperta,
 *     o una chiusa da poco — fatta, scartata, passata in lista — la nuova non
 *     entra. «Non te la rimetto davanti» vale per il documento, non per le
 *     parole con cui era scritta.
 *   · un titolo che somiglia a uno già in feed non entra. È la rete per le
 *     voci senza documento, che sono proprio quelle che si duplicavano: un
 *     documento sparito dall'indice lascia la voce con `doc` vuoto, e la
 *     stessa cosa riletta da un documento nuovo non ha più niente in comune
 *     con lei se non le parole. Fra due voci con due documenti diversi non
 *     vale: quelle sono due cose, anche con le stesse parole.
 *
 * Il conto che torna è delle righe *nuove*: quello che dice il messaggio dopo
 * una lettura deve poter dire «niente di nuovo» quando era tutto già lì.
 */
export function salvaFeed(items: { tipo: string; titolo: string; testo: string; urgenza?: string; fonte?: string; doc?: string; perche?: string; offerta?: string; progetto?: string | null; peso?: number | null; contesto?: string | null }[]): number {
  // il peso è un giudizio dato quando la voce nasce: chi lo porta lo scrive,
  // chi non ce l'ha (una lettura senza Jev) non cancella quello di ieri
  const ins = db.prepare(`
    INSERT INTO feed (id, tipo, titolo, testo, urgenza, fonte, doc, perche, contesto, offerta, progetto, peso, stato, quando)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'aperto',?)
    ON CONFLICT(id) DO UPDATE SET
      tipo=excluded.tipo, testo=excluded.testo, urgenza=excluded.urgenza,
      fonte=excluded.fonte, doc=excluded.doc, perche=COALESCE(excluded.perche, feed.perche),
      contesto=COALESCE(feed.contesto, excluded.contesto), offerta=COALESCE(excluded.offerta, feed.offerta),
      progetto=COALESCE(excluded.progetto, feed.progetto), peso=COALESCE(excluded.peso, feed.peso)
  `)
  const ora = new Date().toISOString()
  // Un `doc` che non corrisponde a nessuna riga è un bottone «apri» che non
  // aprirà mai niente. Si azzera *prima* di `idFeed`, che sull'id del documento
  // ci calcola l'identità della voce: correggerlo dopo vorrebbe dire una voce
  // con un nome e un contenuto che non si parlano.
  const esiste = db.prepare('SELECT 1 FROM documenti WHERE id = ?')
  const puliti = items.map(i => ({ ...i, doc: i.doc && esiste.get(i.doc) ? i.doc : undefined }))
  const documenti = puliti.flatMap(i => i.doc ? [documento(i.doc)!] : [])
  const ignorati = docsIgnoratiDalFeed(documenti)
  const giaInLista = docsConRiga(documenti.map(d => d.id))

  const soglia = new Date(Date.now() - OMBRA_GIORNI * 86_400_000).toISOString()
  const giaConId = db.prepare('SELECT 1 FROM feed WHERE id = ?')
  const stessoDoc = db.prepare(`
    SELECT 1 FROM feed WHERE doc = ? AND id != ? AND (stato IN ('aperto', 'fatto', 'scartato') OR COALESCE(risposto, quando) >= ?)
  `)
  // quelle con cui confrontare i titoli: aperte, o chiuse da poco
  const vicine = db.prepare(`
    SELECT id, titolo, doc, stato, contesto FROM feed WHERE stato IN ('aperto', 'fatto', 'scartato') OR COALESCE(risposto, quando) >= ?
  `).all(soglia) as { id: string; titolo: string; doc: string | null; stato: string; contesto: string | null }[]
  /*
   * Le parole decidono solo quando un documento non può: due voci nate da
   * due documenti diversi sono due cose anche se si assomigliano — due
   * fatture dello stesso fornitore, due riunioni con la stessa persona nello
   * stesso mese — e la rete che le confondeva lasciava fuori la seconda in
   * silenzio, e la rimandava al modello a ogni lettura.
   */
  const stessaCosa = (v: { id: string; titolo: string; doc: string | null; stato: string; contesto: string | null }, i: { doc?: string; titolo: string }, id: string) => {
    if (v.id === id) return false
    // Closed source-grounded work was already compared by source identity
    // above. A new human request can legitimately use the same action title.
    if (['fatto', 'scartato'].includes(v.stato) && (v.doc || v.contesto) && i.doc) return false
    // lo stesso titolo con una parola cambiata è lo stesso titolo, qualunque
    // documento gli abbiano appeso: vedi `titoloRiscritto`
    if (titoloRiscritto(v.titolo, i.titolo)) return true
    return !(v.doc && i.doc && v.doc !== i.doc) && stessoTitolo(v.titolo, i.titolo)
  }

  let nuove = 0
  db.exec('BEGIN')
  try {
    for (const i of puliti) {
      const id = idFeed(i)
      if (!giaConId.get(id)) {
        if (i.doc && (ignorati.has(i.doc) || giaInLista.has(i.doc))) continue
        if (i.doc && stessoDoc.get(i.doc, id, soglia)) continue
        if (vicine.some(v => stessaCosa(v, i, id))) continue
        nuove++
        // anche fra quelle di questo giro: il modello ne scrive due uguali più
        // spesso di quanto si creda
        vicine.push({ id, titolo: i.titolo, doc: i.doc ?? null, stato: 'aperto', contesto: null })
      }
      const d = i.doc ? documento(i.doc) : undefined
      const peso = typeof i.peso === 'number' && Number.isFinite(i.peso) ? Math.min(3, Math.max(0, i.peso)) : null
      // senza documento vale l'istantanea che porta la carta: una priorità
      // nata dalla memoria di un progetto dice da quale riga viene
      ins.run(id, i.tipo, i.titolo, i.testo, i.urgenza ?? null, i.fonte ?? null, i.doc ?? null, i.perche?.trim() || null, d ? JSON.stringify(contestoAttenzione(d)) : (i.contesto ?? null), i.offerta?.trim() || null, i.progetto ?? null, peso, ora)
    }
    // e quello che le nuove spingono oltre il tetto se ne va, nello stesso giro
    scadiFeed()
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  return nuove
}

/**
 * Un parapetto, mai un obiettivo: oltre tante aperte le più leggere scadono.
 *
 * Erano otto, e decidevano loro quante carte vedeva: «You want the right
 * amount of cards. They have to be curated.» Il numero giusto lo decide
 * l'asticella della lettura; venti è la rete contro un giro impazzito.
 */
export const FEED_APERTE_MAX = 20
/** Una carta senza data che sta lì da tanti giorni non era una cosa da fare adesso. */
export const FEED_GIORNI_MAX = 4

/**
 * Le voci che il feed lascia andare da solo, e perché (`ragione`).
 *
 * Sul database vero il feed è arrivato a ventiquattro voci aperte: otto al
 * giorno per tre giorni, perché ogni lettura in sottofondo ne aggiungeva e
 * nessuna ne toglieva — l'unico modo di farne sparire una era rispondere.
 * Ventiquattro cose «da guardare» non le guarda nessuno, e la pagina smette
 * di voler dire qualcosa.
 *
 * Tre modi, in ordine:
 *   · una carta con una data («22 set 9:30», letta rispetto alla nascita)
 *     scade il giorno dopo la sua data, e non prima: `data`. Non scade per età;
 *   · una carta senza data scade dopo quattro giorni: `tempo`;
 *   · se restano aperte più di venti, le più leggere (peso, poi le più
 *     vecchie) escono: `tetto`.
 *
 * `scaduto` non è `fatto`, e non è `scartato`: non l'ha fatta e non l'ha
 * buttata via, l'ha lasciata passare. Non compare fra le fatte, non si
 * racconta al modello come una risposta (`feedGiaVisto` la lascia fuori),
 * ma per le reti di `salvaFeed` conta come chiusa da poco — `risposto` si
 * scrive apposta — così la stessa cosa non torna il giorno dopo con un
 * titolo nuovo. Se era davvero importante, lo dirà il documento cambiando,
 * o lui.
 */
export function scadiFeed(massimo = FEED_APERTE_MAX, giorni = FEED_GIORNI_MAX, adesso = Date.now()): number {
  const ora = new Date(adesso).toISOString()
  const oggi = new Date(adesso)
  const inizioDiOggi = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate()).getTime()
  const soglia = new Date(adesso - giorni * 86_400_000).toISOString()
  const aperte = db.prepare('SELECT id, urgenza, quando, peso FROM feed WHERE stato = ? ORDER BY quando').all('aperto') as { id: string; urgenza: string | null; quando: string; peso: number | null }[]
  const chiudi = db.prepare("UPDATE feed SET stato = 'scaduto', risposto = ?, ragione = ? WHERE id = ? AND stato = 'aperto'")
  let quante = 0
  const restano: typeof aperte = []
  for (const v of aperte) {
    const data = scadenzaDi(v.urgenza, v.quando)
    if (data) {
      if (data.getTime() < inizioDiOggi) { quante += Number(chiudi.run(ora, 'data', v.id).changes); continue }
    } else if (v.quando < soglia) {
      quante += Number(chiudi.run(ora, 'tempo', v.id).changes); continue
    }
    restano.push(v)
  }
  if (restano.length > massimo) {
    const leggere = [...restano].sort((a, b) =>
      (a.peso ?? 1.5) - (b.peso ?? 1.5) || a.quando.localeCompare(b.quando) || a.id.localeCompare(b.id))
    for (const v of leggere.slice(0, restano.length - massimo)) quante += Number(chiudi.run(ora, 'tetto', v.id).changes)
  }
  return quante
}

/**
 * I documenti che hanno già avuto la loro voce, in qualunque stato, da poco.
 *
 * `feedAperto` dice al modello cosa c'è *adesso*; questo gli toglie dal
 * materiale anche quello che c'è stato — fatto, scartato, scaduto — negli
 * ultimi due mesi. Rileggerli è tutto spreco: la rete di `salvaFeed` sullo
 * stesso documento butterebbe comunque via la voce, dopo averla pagata.
 */
export function docsSulFeed(ids: string[], entroGiorni = OMBRA_GIORNI): Set<string> {
  const fuori = new Set<string>()
  const soglia = new Date(Date.now() - entroGiorni * 86_400_000).toISOString()
  for (let i = 0; i < ids.length; i += 200) {
    const pezzo = ids.slice(i, i + 200)
    const righe = db.prepare(`
      SELECT DISTINCT doc FROM feed
      WHERE doc IN (${pezzo.map(() => '?').join(',')})
        AND (stato IN ('aperto', 'fatto', 'scartato') OR COALESCE(risposto, quando) >= ?)
    `).all(...pezzo, soglia) as { doc: string }[]
    for (const r of righe) fuori.add(r.doc)
  }
  return fuori
}

type RispostaAttenzione = { doc: string | null; contesto: string | null; stato: string; motivo: string | null; ragione: string | null; da: 'feed' | 'compiti' }
function risposteAttenzione(): RispostaAttenzione[] {
  return db.prepare(`
    SELECT doc, contesto, stato, motivo, ragione, 'feed' AS da FROM feed WHERE stato IN ('fatto', 'scartato')
    UNION ALL
    SELECT doc, contesto, CASE WHEN sparito IS NOT NULL OR stato = 'lasciato' THEN 'scartato' ELSE 'fatto' END AS stato, esito AS motivo, NULL AS ragione, 'compiti' AS da
    FROM compiti WHERE stato IN ('fatto', 'lasciato') OR sparito IS NOT NULL
  `).all() as RispostaAttenzione[]
}

function contestoRisposta(r: RispostaAttenzione): ContestoAttenzione | null {
  if (r.contesto) {
    try {
      const c = JSON.parse(r.contesto) as ContestoAttenzione
      if (typeof c.id === 'string' && typeof c.corpo === 'string' && typeof c.titolo === 'string') return c
    } catch { /* An old malformed snapshot does not prevent normal reads. */ }
  }
  const d = r.doc ? documento(r.doc) : undefined
  return d ? contestoAttenzione(d) : null
}

function ricordaFonteAttenzione(tabella: 'feed' | 'compiti', id: string) {
  const r = db.prepare(`SELECT doc FROM ${tabella} WHERE id = ? AND contesto IS NULL`).get(id) as { doc: string | null } | undefined
  const d = r?.doc ? documento(r.doc) : undefined
  if (d) db.prepare(`UPDATE ${tabella} SET contesto = ? WHERE id = ?`).run(JSON.stringify(contestoAttenzione(d)), id)
}

/** Explicit feedback never expires. Open cards do not match themselves;
 * reopening/undo withdraws the feedback because current state is authoritative. */
export type FeedbackAttenzione = { stato: 'fatto' | 'scartato'; motivo: string | null }
export function feedbackAttenzione(docs: Documento[]): Map<string, FeedbackAttenzione> {
  const fuori = new Map<string, FeedbackAttenzione>()
  if (!docs.length) return fuori
  const risposte = risposteAttenzione().map(r => ({ ...r, fonte: contestoRisposta(r) }))
  for (const d of docs) {
    for (const r of risposte) {
      if (r.doc !== d.id && !(r.fonte && stessaRichiesta(d, r.fonte))) continue
      const stato = r.stato === 'scartato' ? 'scartato' : 'fatto'
      // Both suppress further tasks. Keep a dismissal visible if duplicate
      // copies have conflicting historical states, rather than hiding it.
      if (fuori.get(d.id)?.stato !== 'scartato') fuori.set(d.id, { stato, motivo: r.motivo })
    }
  }
  return fuori
}

export function docsIgnoratiDalFeed(docs: Documento[]): Set<string> {
  return new Set(feedbackAttenzione(docs).keys())
}

/**
 * Da chi arrivava la posta che ha buttato via.
 *
 * «Non mi interessa» su una voce è il gesto più informativo che fa, e finora
 * insegnava solo a non riproporre *quella* voce: il giorno dopo la stessa
 * banca mandava la stessa promozione con un altro oggetto, e il feed la
 * riproponeva. Qui si guarda il mittente dei documenti dietro le voci
 * scartate negli ultimi tre mesi — nessuna tabella nuova, è una giunzione
 * fra il feed e i documenti — e chi chiama tiene fuori tutta la posta di
 * quegli indirizzi.
 *
 * I domini valgono solo per i mittenti che sembrano macchine (`noreply`,
 * `newsletter`, `promo`…): una promozione scartata da `no-reply@banca.it`
 * chiude anche `offerte@banca.it`, ma scartare un'email di una persona su
 * gmail.com non chiude gmail.com. Un indirizzo può stare sotto un dominio
 * che non conta, ed è esattamente il caso di tenerlo per indirizzo.
 */
export function mittentiScartati(_giorni = 90): { indirizzi: string[]; domini: string[] } {
  const indirizzi = new Set<string>()
  for (const r of risposteAttenzione()) {
    if (r.stato !== 'scartato') continue
    // una carta insegna a tacere un mittente solo se l'ha scartata come «non
    // è mia» (o senza dire perché, com'era prima delle quattro ragioni):
    // «già fatta», «vecchia» e «non si capisce» non parlano del mittente, e
    // una fattura già pagata non deve far sparire chi la manda
    if (r.da === 'feed' && r.ragione !== null && r.ragione !== 'non_mia') continue
    const c = contestoRisposta(r)
    // One irrelevant request is not permission to silence a person, a
    // shared team mailbox, or their whole company domain indefinitely.
    if (c && mittenteAutomatico(c.autore)) indirizzi.add(indirizzoAttenzione(c.autore))
  }
  return { indirizzi: [...indirizzi], domini: [] }
}

/**
 * Un indirizzo da cui scrive una macchina, non una persona.
 *
 * Sono i nomi che i sistemi di invio usano per convenzione, guardati come
 * parole intere dentro la parte prima della chiocciola: `news@` sì,
 * `agnews@` no.
 */
export const MITTENTE_MACCHINA =
  /(^|[.\-_+])(no-?reply|no_reply|do-?not-?reply|donotreply|newsletters?|news|promo(tions?)?|marketing|notifications?|notify|alerts?|mailer(-daemon)?|bounces?|updates?|hello|info|team|digest)([.\-_+]|@)/i

/** I domini che appartengono a tutti: scartare una persona lì non chiude nessuno. */
const DOMINI_DI_TUTTI = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'hotmail.it', 'live.it', 'live.com',
  'yahoo.com', 'yahoo.it', 'icloud.com', 'me.com', 'mac.com', 'libero.it', 'virgilio.it', 'tiscali.it',
  'alice.it', 'tin.it', 'fastwebnet.it', 'aruba.it', 'pec.it', 'protonmail.com', 'proton.me'
])

/**
 * Le voci aperte, per il modello: titolo e documento e basta.
 *
 * Servono a due cose nella lettura — dirgli «queste le sai già, non
 * riscriverle» e togliergli dal materiale i documenti da cui sono nate. Solo
 * i titoli: ogni lettura costa quello che costa, e la lista intera con i
 * testi sarebbe un altro migliaio di token per dire la stessa cosa.
 */
export type VoceAperta = { id: string; titolo: string; testo: string | null; tipo: string | null; offerta: string | null; quando: string; doc: string | null }
export function feedAperto(limite = 40): VoceAperta[] {
  return db.prepare('SELECT id, titolo, testo, tipo, offerta, quando, doc FROM feed WHERE stato = ? ORDER BY quando DESC LIMIT ?')
    .all('aperto', limite) as unknown as VoceAperta[]
}

/**
 * Le voci in uno stato.
 *
 * `oreMax` fa scadere quelle chiuse: dopo un paio di giorni l'elenco delle cose
 * fatte non è più memoria utile, è ingombro sotto ai piedi. Restano nel
 * database — servono a non riproporti quello che hai già liquidato — ma
 * smettono di occupare la pagina. Zero significa «tienile tutte».
 */
export function elencoFeed(stato = 'aperto', oreMax = 0) {
  // le aperte scadono anche senza una lettura nuova: una voce di cinque giorni
  // fa non deve restare in pagina solo perché nel frattempo nessuno ha letto
  if (stato === 'aperto') scadiFeed()
  if (!oreMax || stato === 'aperto') {
    return db.prepare('SELECT * FROM feed WHERE stato = ? ORDER BY quando DESC').all(stato) as Record<string, string>[]
  }
  const soglia = new Date(Date.now() - oreMax * 3_600_000).toISOString()
  return db.prepare(`
    SELECT * FROM feed WHERE stato = ? AND COALESCE(risposto, quando) >= ?
    ORDER BY COALESCE(risposto, quando) DESC
  `).all(stato, soglia) as Record<string, string>[]
}

/**
 * Cambia lo stato di una voce, e — se c'è — si tiene il perché con le parole
 * di chi ha risposto. Il perché serve due volte: per mostrarlo dopo («hai
 * detto: l'ho già mandato»), e per non riproporre la stessa cosa.
 */
export function cambiaStatoFeed(id: string, stato: string, motivo?: string, ragione?: Ragione | null) {
  ricordaFonteAttenzione('feed', id)
  const ora = new Date().toISOString()
  /*
   * La ragione va con lo stato. Riaprire («Annulla») la cancella sempre:
   * quello che uno scarto aveva insegnato (feed-impara legge lo stato di
   * adesso) si ritira con il gesto, senza altro codice.
   */
  const laRagione = stato === 'aperto' ? null : (ragione ?? null)
  if (motivo === undefined) {
    /**
     * Anche senza parole, «adesso» va scritto.
     *
     * elencoFeed('fatto', ore) filtra su COALESCE(risposto, quando), cioè
     * ripiega sulla data di *nascita* della voce quando non c'è quella
     * della risposta. Quindi premere il bottone «Fatto» — che non passa
     * nessun motivo — su una voce nata più di due giorni fa la faceva
     * sparire all'istante: fuori dalle aperte perché chiusa, fuori dalle
     * fatte perché già scaduta. Spuntavi una cosa e quella cosa smetteva
     * di esistere.
     *
     * Il motivo di prima non si tocca: qui si sta cambiando stato, non
     * cancellando quello che avevi scritto la volta scorsa.
     */
    db.prepare('UPDATE feed SET stato = ?, risposto = ?, ragione = ? WHERE id = ?').run(stato, ora, laRagione, id)
    return
  }
  db.prepare('UPDATE feed SET stato = ?, motivo = ?, risposto = ?, ragione = ? WHERE id = ?')
    .run(stato, motivo, ora, laRagione, id)
}

/**
 * Riscrive il testo di una voce senza toccarne lo stato.
 *
 * Serve al cambio di lingua: la voce resta quella — stesso id, stessa
 * posizione, stessa risposta che le hai già dato — e cambia solo la lingua in
 * cui è scritta. `stato`, `motivo` e `risposto` non si toccano di proposito.
 */
export function traduciVoceFeed(id: string, c: { tipo: string; titolo: string; testo: string; urgenza: string }) {
  db.prepare('UPDATE feed SET tipo = ?, titolo = ?, testo = ?, urgenza = ? WHERE id = ?')
    .run(c.tipo, c.titolo, c.testo, c.urgenza || null, id)
}

export function traduciDomanda(id: string, testo: string) {
  db.prepare('UPDATE domande SET testo = ? WHERE id = ?').run(testo, id)
}

export function voceFeed(id: string) {
  return db.prepare('SELECT * FROM feed WHERE id = ?').get(id) as Record<string, string> | undefined
}

/**
 * Le voci a cui hai già risposto, per non rifartele trovare.
 *
 * Senza questo il modello rigenera ogni volta le stesse cose: l'upsert le
 * terrebbe chiuse, ma avrebbero comunque occupato uno dei pochi posti della
 * lettura, e le cose nuove resterebbero fuori.
 */
export function feedGiaVisto(limite = 30): { titolo: string; stato: string; motivo: string | null }[] {
  // una voce scaduta non è una risposta: lui non l'ha vista, o non l'ha voluta
  // vedere. Raccontarla al modello come «liquidata» sarebbe una bugia e un
  // posto in meno per quelle vere; a tenerla lontana pensano le reti di
  // `salvaFeed` e `docsSulFeed`.
  return db.prepare(`
    SELECT titolo, stato, motivo FROM feed
    WHERE stato NOT IN ('aperto', 'scaduto') ORDER BY COALESCE(risposto, quando) DESC LIMIT ?
  `).all(limite) as unknown as { titolo: string; stato: string; motivo: string | null }[]
}

// — la rassegna —
//
// Quello che succede fuori. Non si mescola con il feed e non si mescola con la
// lista: il feed è roba tua che aspetta una decisione, la rassegna è il mondo,
// che non aspetta niente. Le funzioni stanno vicine perché si somigliano;
// quello che salvano non si somiglia per niente.

export type Notizia = {
  id: string
  titolo: string
  riassunto: string
  perche: string | null
  fonte: string
  link: string
  argomento: string
  quando: string
  presa: string
  letta: string | null
  scartata: string | null
  /** Un rilascio di un laboratorio di frontiera, o un fatto che cambia il suo lavoro. */
  importante: boolean
  /** Quanto gli interessa secondo Jev, da 0 a 1. Null finché nessuno l'ha chiesto. */
  interesse: number | null
}

/** Una riga della tabella: SQLite tiene i booleani come interi. */
function notiziaDaRiga(r: Record<string, unknown>): Notizia {
  return { ...(r as unknown as Notizia), importante: !!r.importante, interesse: typeof r.interesse === 'number' ? r.interesse : null }
}

/**
 * Scrive le notizie scelte.
 *
 * L'id è l'indirizzo dell'articolo, quindi una notizia che ricompare in due
 * rassegne di seguito — succede, le cose durano più di un giorno — resta *una*
 * riga: si aggiorna il testo, si sposta la data di presa, e `letta` non si
 * tocca. Quest'ultima è la parte importante: quello che hai già guardato non
 * deve tornare a sembrare nuovo perché il giornale l'ha ripubblicato.
 */
export function salvaNotizie(n: (Omit<Notizia, 'presa' | 'letta' | 'scartata' | 'importante' | 'interesse'> & { importante?: boolean })[]) {
  if (!n.length) return
  // «importante» non si spegne da un giro all'altro: un rilascio resta tale
  // anche se il giornale che lo ripubblica non lo sa
  const ins = db.prepare(`
    INSERT INTO notizie (id, titolo, riassunto, perche, fonte, link, argomento, quando, presa, importante)
    VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      titolo=excluded.titolo, riassunto=excluded.riassunto, perche=excluded.perche,
      argomento=excluded.argomento, presa=excluded.presa,
      importante=MAX(notizie.importante, excluded.importante)
  `)
  const ora = new Date().toISOString()
  db.exec('BEGIN')
  try {
    for (const x of n) {
      ins.run(x.id, x.titolo, x.riassunto, x.perche ?? null, x.fonte, x.link, x.argomento, x.quando, ora, x.importante ? 1 : 0)
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

/**
 * La rassegna, dalla più recente.
 *
 * `giorni` è la finestra: uno è la mattina di oggi, sette è la settimana. Non
 * si filtra sulla data dell'articolo ma su quella in cui è entrata in
 * rassegna — un pezzo di ieri sera scelto stamattina appartiene a stamattina,
 * che è il giorno in cui te lo sei trovato davanti.
 */
export function notizie(giorni = 7): Notizia[] {
  const soglia = new Date(Date.now() - giorni * 86_400_000).toISOString()
  return (db.prepare(
    'SELECT * FROM notizie WHERE presa >= ? AND scartata IS NULL ORDER BY presa DESC, quando DESC'
  ).all(soglia) as Record<string, unknown>[]).map(notiziaDaRiga)
}

/** Il fatto è importante anche se l'articolo rimasto non lo diceva: lo si segna su quello. */
export function segnaImportante(id: string) {
  db.prepare('UPDATE notizie SET importante = 1 WHERE id = ?').run(id)
}

/** Quanto gli interessa, secondo Jev: si chiede una volta per notizia e poi si ricorda. */
export function segnaInteresse(id: string, interesse: number) {
  if (!Number.isFinite(interesse)) return
  db.prepare('UPDATE notizie SET interesse = ? WHERE id = ?').run(Math.max(0, Math.min(1, interesse)), id)
}

/**
 * Quelle che hai buttato via, e che non devono tornare.
 *
 * Restano nell'indice apposta: sparire dal database vorrebbe dire che la
 * rassegna di domani le ripesca dal feed e te le rimette davanti. Una riga che
 * resta è l'unico modo che ha una cosa di non tornare.
 */
export function notizieScartate(_giorni = 30): string[] {
  return (db.prepare('SELECT id FROM notizie WHERE scartata IS NOT NULL')
    .all() as { id: string }[]).map(r => r.id)
}

/** Permanent event identities for explicit reading/dismissal feedback. */
export function notizieFeedback(): Pick<Notizia, 'id' | 'titolo' | 'letta' | 'scartata'>[] {
  return db.prepare('SELECT id, titolo, letta, scartata FROM notizie WHERE letta IS NOT NULL OR scartata IS NOT NULL')
    .all() as unknown as Pick<Notizia, 'id' | 'titolo' | 'letta' | 'scartata'>[]
}

/**
 * Le notizie con addosso il segno di quello che ne hai fatto.
 *
 * Diversa da `notizie()`: quella serve a disegnare il mazzo e quindi nasconde
 * le scartate, che è esattamente il contrario di quello che serve qui — una
 * buttata via è il segnale più netto che ci sia. Qui escono tutte quelle che
 * hai toccato, aperte e cestinate insieme.
 */
export function notiziePerGusto(giorni = 30): Notizia[] {
  const soglia = new Date(Date.now() - giorni * 86_400_000).toISOString()
  return (db.prepare(
    'SELECT * FROM notizie WHERE presa >= ? AND (letta IS NOT NULL OR scartata IS NOT NULL)'
  ).all(soglia) as Record<string, unknown>[]).map(notiziaDaRiga)
}

/** Non ti interessa. Vale per sempre, non per oggi. */
export function segnaNotiziaScartata(id: string) {
  db.prepare('UPDATE notizie SET scartata = ? WHERE id = ? AND scartata IS NULL')
    .run(new Date().toISOString(), id)
}

/** Quando è stata fatta l'ultima rassegna. Null = mai. */
export function ultimaRassegna(): string | null {
  const r = db.prepare('SELECT MAX(presa) AS q FROM notizie').get() as { q: string | null }
  return r?.q ?? null
}

/** L'hai aperta. Si segna una volta sola: la prima. */
export function segnaNotiziaLetta(id: string) {
  db.prepare('UPDATE notizie SET letta = ? WHERE id = ? AND letta IS NULL')
    .run(new Date().toISOString(), id)
}

/**
 * Via le vecchie: una rassegna non è un archivio, e nessuno rilegge martedì.
 *
 * Le scartate campano il triplo: servono a non farsi riproporre una cosa, e
 * quel servizio lo rendono solo finché la riga esiste.
 */
export function potaNotizie(giorni: number): number {
  const soglia = new Date(Date.now() - giorni * 86_400_000).toISOString()
  const r = db.prepare(
    'DELETE FROM notizie WHERE scartata IS NULL AND letta IS NULL AND presa < ?'
  ).run(soglia)
  return Number(r.changes ?? 0)
}

/**
 * Una porta di servizio per i test, e solo per quelli.
 *
 * Far invecchiare una riga è l'unico modo di provare la potatura senza
 * aspettare otto giorni. Sta qui e si chiama così perché si veda subito, da
 * qualunque parte la si incontri, che non è roba da chiamare dall'app.
 */
export const perProva = {
  invecchiaNotizie(giorni: number) {
    const quando = new Date(Date.now() - giorni * 86_400_000).toISOString()
    db.prepare('UPDATE notizie SET presa = ?').run(quando)
  },

  /**
   * Quanti documenti stanno *davvero* dentro l'indice full-text.
   *
   * `SELECT COUNT(*) FROM ricerca` non lo dice più: da quando l'indice è a
   * contenuto esterno quella conta le righe di `documenti`, quindi risponde
   * sempre che tutto è a posto — che è esattamente il modo in cui un indice
   * marcio passerebbe inosservato. Il vocabolario per istanze conta i rowid
   * che l'indice conosce, e quello sì che si può confrontare.
   */
  documentiNellIndice(): number {
    db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS ricerca_istanze USING fts5vocab('ricerca', 'instance')")
    return (db.prepare('SELECT COUNT(DISTINCT doc) AS n FROM ricerca_istanze').get() as { n: number }).n
  },

  /** Lo schema come lo conosce questo file: per `colonne.test.ts`. */
  schema() {
    return { migrazioni: MIGRAZIONI.length, colonne: COLONNE, tabelle: { ...TABELLE }, indici: [...INDICI] }
  }
}

// — compiti —
//
// Il feed nasce dai documenti e muore quando gli rispondi. Un compito nasce da
// te e resta finché non è fatto. Tenerli separati è quello che impedisce alla
// lista di riempirsi di roba che non hai scritto tu — ed è la ragione per cui
// una voce del feed promossa a compito *chiude* la voce invece di duplicarla.

export type ConsegnaCompito = {
  /** `File`: un file scritto da Myynd da sé, nel luogo delle consegne. Vedi `mani.salvaConsegna`. */
  app: 'Pages' | 'TextEdit' | 'File'; titolo: string; percorso: string
  /** Per un file: il luogo a nome (`mani.Luogo`), per dirlo a parole sulla riga. */
  dove?: string
  desktop?: string; anteprima?: string; pagine?: number; stile?: string
  revisione?: { esito: 'pass' | 'revise' | 'unavailable'; problemi: string[] }
}

/** Il giudizio sul lavoro consegnato: chi l'ha dato, cosa ha controllato, quanti giri ci sono voluti. */
export type RevisioneLavoro = {
  esito: 'pass' | 'revise' | 'unavailable'
  comeTe: string
  comeLoro: string
  per: string
  problemi: string[]
  verificato: string[]
  giri: number
}

/**
 * Quanto conta una riga, detto da lui: alta o bassa. Niente vuol dire normale,
 * ed è la risposta giusta per quasi tutte — per questo non ha un valore suo.
 */
export type Priorita = 'alta' | 'bassa'
export const PRIORITA: readonly Priorita[] = ['alta', 'bassa']

export type Compito = {
  consegna?: ConsegnaCompito | null
  id: string
  testo: string
  nota: string | null
  quando: string
  giorno?: string | null
  /** L'ora dentro quel giorno, «HH:MM». Null vuol dire: vale per tutto il giorno. */
  ora?: string | null
  progetto?: string | null
  /** «alta» o «bassa»; null è la normale. */
  priorita?: Priorita | null
  stato: string
  modo: string
  ordine: string
  origine: string
  voce: string | null
  doc: string | null
  /**
   * Il posto vero che questa riga apre sul Mac, se ce n'è uno.
   *
   * Non sta su disco: si calcola leggendo il documento, e vale per «Portami
   * lì» — vedi `portaDi`. Null vuol dire che non c'è niente da aprire fuori da
   * Myynd, e allora quel bottone non si disegna.
   */
  porta?: 'posta' | 'file' | 'pagina' | null
  /**
   * La riga della lista da cui questa è nata, quando è nata da un'altra.
   *
   * Solo quando c'è un filo vero: il punto legge le domande di una riga aperta
   * e ne scrive le mosse in lista. Serve a «Portami lì» — una riga che non ha
   * un documento né un progetto ha comunque un posto da cui viene, ed è quella.
   */
  madre?: string | null
  /**
   * Com'è stato riletto il lavoro prima di dirlo pronto: come lei e come chi
   * lo riceve. Lo scrive `compiti.ts` da `revisione-lavoro.ts`; null vuol dire
   * che questa riga non è passata da una rilettura (una domanda, un prompt, un
   * documento già rivisto a vista).
   */
  revisione?: RevisioneLavoro | null
  chiesto: string | null
  risultato: string | null
  fonti: { id: string; label: string }[] | null
  guaio: string | null
  creato: string
  aggiornato: string
  chiuso: string | null
  esito: string | null
  sparito: string | null
  versione: number
  /** Quello che si offre di fare, se è qualcosa di più di un testo da rileggere. */
  proposta: Proposta | null
  /** Le domande a scelta, quando si è fermato perché gli manca qualcosa. */
  chieste: Chiesta[] | null
  /**
   * Cosa gli è concesso aprire mentre ci lavora, e dove.
   *
   * Null vuol dire «quello che ha sempre avuto»: l'indice intero, come ogni
   * compito scritto a mano. Un oggetto vuol dire che questa riga viene da
   * un'automazione che ha dichiarato le sue fonti, e fuori da lì non si va.
   *
   * `cartella` sta qui dentro e non altrove perché è parte del permesso, non
   * un dettaglio dell'automazione: «puoi far girare Claude Code» senza dire
   * *dove* non è un permesso, è un assegno in bianco. Tenerli insieme vuol
   * dire anche che questo compito non ha bisogno di andare a rileggere la
   * ricetta che l'ha scritto — e infatti non lo fa, il che tiene `compiti.ts`
   * e `automazioni.ts` separati come sono sempre stati.
   */
  attrezzi: Concessione | null
  /**
   * L'email già smontata dalla bozza, se la bozza è una email.
   *
   * Si prepara quando la riga diventa pronta, non quando si preme il bottone:
   * è quello che fa di «manda» un gesto solo. Null vuol dire che non c'è —
   * la posta non è collegata, la bozza non è un messaggio, o il modello non
   * ce l'ha fatta — e allora l'interfaccia torna a chiederla in due passi.
   */
  email: EmailPronta | null
  /** Le ipotesi del risultato di adesso, una riga ciascuna («Ho supposto venerdì»). Le scrive P3. */
  ipotesi?: string[] | null
  /** Quante domande questa riga ha fatto nella sua vita: mai più di una. Le conta P3. */
  domandeFatte?: number
  /**
   * Come scrive a chi riceve la bozza, dalle mail che gli ha mandato (P3).
   * Sta in `compiti.voceScritta` perché `voce` è la voce del feed da cui la
   * riga è nata.
   */
  voceScritta?: { destinatario?: string; lingua?: string; esempi?: { id: string; label: string }[] } | null
  /**
   * La bozza è partita dalla sua posta (P9): quale messaggio, quando, con che
   * certezza e quanto l'ha ritoccata. Si scrive una volta e non si riscrive.
   */
  mandata?: { doc: string; quando: string; certezza: 'id' | 'filo'; ritocco: number } | null
}

/**
 * Un'email pronta da mandare, com'è uscita dalla bozza.
 *
 * `conosciuto` dice se il destinatario compare già nel materiale letto: non
 * blocca niente, ma un indirizzo mai visto merita uno sguardo prima del
 * bottone. `rispondeA` c'è solo quando la bozza risponde a una email
 * dell'indice: sono le intestazioni che tengono la risposta nel suo filo.
 */
export type EmailPronta = {
  casella?: { stato: 'salvata' | 'errore'; id?: string; url?: string; errore?: string }
  a: string
  oggetto: string
  corpo: string
  conosciuto: boolean
  rispondeA?: { messageId: string; references?: string[] } | null
}

/** Quello che una riga nata da un'automazione ha il permesso di aprire. */
export type Concessione = {
  nomi: string[]
  cartella?: string | null
  selezione?: 'richieste-dirette'
  ambitoSelezione?: string
}

/** Una domanda con le risposte già pronte da toccare. */
export type Chiesta = { domanda: string; opzioni: string[]; multipla: boolean }

/**
 * Una cosa che Myynd si offre di fare, in attesa di un dito.
 *
 * `voci` è l'elenco esatto su cui agirà: quello che si vede è quello che
 * succede, uno a uno. Il `perché` sta su ogni voce e non sulla proposta intera
 * — «sono tutte newsletter» non si può controllare, «Newsletter di Vinted,
 * arrivata ogni martedì da otto mesi» sì.
 */
export type Proposta =
  | {
      /** Cosa farne. Vocabolario chiuso: il motore sa fare queste e nient'altro. */
      azione: 'posta.cestina' | 'posta.archivia'
      voci: { doc: string; titolo: string; perche: string }[]
    }
  | {
      /**
       * Da mettere in agenda.
       *
       * Stessa forma e stesso bottone della posta, e non è pigrizia: la
       * promessa è una sola — vedi l'elenco per intero, premi una volta, resta
       * scritto nel registro — e vale la pena che sia *letteralmente* lo stesso
       * meccanismo, invece di due che si somigliano. Aggiungere un verbo qui
       * costa un ramo di questa unione, non una schermata nuova.
       */
      azione: 'agenda.aggiungi'
      eventi: { titolo: string; inizio: string; minuti?: number; dove?: string; perche: string }[]
    }

/**
 * Dove porta questa riga *fuori* da Myynd: la mail, il file, la pagina.
 *
 * Null vuol dire «in nessun posto vero», e la carta lo usa per non disegnare
 * affatto il bottone. Prima non lo sapeva: «Portami lì» compariva su ogni riga
 * che avesse un documento, una riga madre o un progetto, e su due terzi di
 * quelle il server ripiegava su un posto *dentro* l'app — apriva la scheda
 * della riga da cui era nata, o la Memoria sul progetto. Da fuori si vedeva
 * comparire una scheda: «mi apre un compito, non mi porta alla mail».
 *
 * Quei due ripieghi restano dove sono — `dovePortare` li decide ancora, e
 * l'endpoint li esegue se il documento sparisce fra la lista e il dito — ma
 * non sono una promessa da scrivere su un bottone. Chi vuole il progetto o la
 * riga madre ha già il link «Da …» sotto il testo, che dice dove va prima di
 * essere premuto.
 */
function portaDi(doc: unknown): 'posta' | 'file' | 'pagina' | null {
  const id = typeof doc === 'string' && doc ? doc : null
  if (!id) return null
  const d = documento(id)
  if (!d) return null
  const dove = dovePortare({ doc: id }, d).dove
  return dove === 'posta' || dove === 'file' || dove === 'pagina' ? dove : null
}

/**
 * Una colonna JSON che può non esserlo.
 *
 * Le colonne nuove le scrivono rami diversi: una riga storta in una di loro
 * non deve far cadere l'elenco intero, che è la lista delle cose da fare.
 */
function jsonOppureNulla(v: unknown): unknown {
  if (typeof v !== 'string' || !v) return null
  try { return JSON.parse(v) } catch { return null }
}

function compitoDaRiga(r: Record<string, unknown>): Compito {
  return {
    ...r,
    ipotesi: jsonOppureNulla(r.ipotesi),
    voceScritta: jsonOppureNulla(r.voceScritta),
    mandata: jsonOppureNulla(r.mandata),
    domandeFatte: Number(r.domandeFatte ?? 0),
    porta: portaDi(r.doc),
    consegna: r.consegna ? JSON.parse(String(r.consegna)) : null,
    revisione: r.revisione ? JSON.parse(String(r.revisione)) : null,
    fonti: r.fonti ? JSON.parse(String(r.fonti)) : null,
    proposta: r.proposta ? JSON.parse(String(r.proposta)) : null,
    chieste: r.chieste ? JSON.parse(String(r.chieste)) : null,
    attrezzi: r.attrezzi ? JSON.parse(String(r.attrezzi)) : null,
    email: r.email ? JSON.parse(String(r.email)) : null
  } as Compito
}

/**
 * Tutti i compiti vivi, in ordine. Il raggruppamento per secchio lo fa chi legge.
 *
 * `chiusi` sta a parte perché una lista che tiene in mezzo anche le cose fatte
 * smette di essere una lista di cose da fare dopo tre giorni. Le fatte tornano
 * solo se le chiedi, e solo le ultime.
 */
export function elencoCompiti(): Compito[] {
  const righe = db.prepare(`
    SELECT * FROM compiti
    WHERE stato IN ('aperto','delegato','pronto','chiede') AND sparito IS NULL
    ORDER BY ordine, id
  `).all() as Record<string, unknown>[]
  return righe.map(compitoDaRiga)
}

/** Le ultime chiuse, per poter dire «l'ho fatto» e vederselo. */
export function compitiChiusi(limite = 30): Compito[] {
  const righe = db.prepare(`
    SELECT * FROM compiti WHERE stato IN ('fatto','lasciato') AND sparito IS NULL
    ORDER BY chiuso DESC LIMIT ?
  `).all(limite) as Record<string, unknown>[]
  return righe.map(compitoDaRiga)
}

/**
 * I documenti prodotti da Myynd, vivi o chiusi.
 *
 * La lista normale separa il lavoro aperto da quello chiuso e limita il
 * secondo: è giusto per una to-do list, ma non per lo scaffale dei documenti
 * creati. Qui si leggono direttamente le consegne, in ordine di modifica.
 */
export function consegneProdotte(limite = 200): Compito[] {
  const righe = db.prepare(`
    SELECT * FROM compiti
    WHERE consegna IS NOT NULL AND sparito IS NULL
    ORDER BY aggiornato DESC LIMIT ?
  `).all(limite) as Record<string, unknown>[]
  return righe.map(compitoDaRiga)
}

/**
 * Le righe che ha buttato via, e quando.
 *
 * `scordaCompito` scrive la data in `sparito` e lascia lo stato dov'era. Da
 * quel momento la riga non esiste per nessuno: `elencoCompiti` la salta,
 * `compitiChiusi` la salta due volte — una per lo stato, una per `sparito` —
 * e il punto, che legge solo quelle due, non sa che è mai esistita. Quindi la
 * riproponeva. Il quattordici settembre ne ha tolte tre alle 16:33 e alle
 * 17:42 se le è ritrovate, una identica parola per parola.
 *
 * Buttare una riga è la cosa più chiara che una persona possa dire di una
 * cosa da fare: non la voglio. Costava una riga di SQL leggerlo.
 */
/**
 * Le righe che hanno già fatto nascere altre righe.
 *
 * Una riga può generarne altre — una che chiede quattro cose diventa quattro
 * righe — e va bene una volta. Non va bene per sempre: il punto gira ogni tre
 * ore, rilegge la stessa riga aperta, e ogni volta ne stacca altri figli.
 * Il quattordici settembre una riga sola ne aveva quattro, e uno di quei
 * quattro ne aveva uno suo. Nessuno aveva chiesto niente: era Myynd che
 * scriveva compiti a partire dai compiti che si era scritto da solo.
 *
 * Qualunque stato: viva, chiusa o buttata. Una figlia che lui ha buttato è
 * comunque una prova che quella madre ha già parlato.
 */
export function madriUsate(): Set<string> {
  const righe = db.prepare('SELECT DISTINCT madre FROM compiti WHERE madre IS NOT NULL').all() as { madre: string }[]
  return new Set(righe.map(r => r.madre))
}

export function compitiTolti(giorni = 30, limite = 60): Compito[] {
  const soglia = new Date(Date.now() - giorni * 86_400_000).toISOString()
  const righe = db.prepare(`
    SELECT * FROM compiti WHERE sparito IS NOT NULL AND sparito >= ?
    ORDER BY sparito DESC LIMIT ?
  `).all(soglia, limite) as Record<string, unknown>[]
  return righe.map(compitoDaRiga)
}

export function compito(id: string): Compito | null {
  const r = db.prepare('SELECT * FROM compiti WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return r ? compitoDaRiga(r) : null
}

/**
 * L'ultima chiave d'ordine di un secchio, per attaccarci sotto la riga nuova.
 *
 * Guarda anche le righe chiuse, e non è pignoleria: se una chiave chiusa non è
 * riservata, la riga nuova se la ripiglia — e il giorno che rimetti in lista
 * quella vecchia ti ritrovi due righe con la stessa chiave. Da lì l'ordine
 * diventa quello che decide SQLite, e trascinare fra le due lancia un errore
 * da cui non si esce più.
 */
export function ultimoOrdine(quando: string): string {
  // Niente «sparito IS NULL»: una riga tolta può tornare — scriviCompito la
  // resuscita con la *sua* vecchia chiave — e se nel frattempo quella chiave
  // è stata data a un'altra riga si ritrovano in due nello stesso posto. Da
  // lì l'ordine lo decide SQLite, e trascinare fra le due lancia un errore
  // da cui non si esce. Vale per le chiuse, e vale allo stesso modo per le
  // sparite.
  const r = db.prepare(`
    SELECT ordine FROM compiti
    WHERE quando = ?
    ORDER BY ordine DESC LIMIT 1
  `).get(quando) as { ordine: string } | undefined
  return r?.ordine ?? ''
}

/**
 * Scrive un compito. L'`id` arriva da fuori e non si genera qui: un compito
 * dettato in macchina e uno scritto sul Mac devono poter nascere con lo stesso
 * nome senza chiedere niente a nessuno.
 *
 * `ON CONFLICT` aggiorna solo quello che si può riscrivere. `stato`, `chiuso` e
 * `risultato` non sono in elenco apposta: sono decisioni, e riscrivere un
 * compito non deve poterle annullare di straforo.
 */
export function scriviCompito(c: {
  id: string; testo: string; nota?: string | null; quando?: string
  giorno?: string | null
  /** L'ora dentro il giorno, «HH:MM», quando quella cosa si fa a un'ora precisa. */
  ora?: string | null
  progetto?: string | null
  /** «alta» o «bassa»; null è la normale, cioè quasi tutte. */
  priorita?: Priorita | null
  ordine: string; origine?: string; voce?: string | null; doc?: string | null
  /** La riga da cui questa è nata: si scrive alla nascita e non si riscrive. */
  madre?: string | null
  attrezzi?: Concessione | null
}) {
  const ora = new Date().toISOString()
  db.prepare(`
    INSERT INTO compiti (id, testo, nota, quando, giorno, ora, progetto, priorita, stato, ordine, origine, voce, doc, madre, attrezzi, creato, aggiornato)
    VALUES (?,?,?,?,?,?,?,?,'aperto',?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      testo      = excluded.testo,
      quando     = excluded.quando,
      giorno     = COALESCE(excluded.giorno, compiti.giorno),
      -- come il giorno: chi riscrive una riga senza mandare l'ora non sta
      -- dicendo «toglile l'ora», sta dicendo «non la tocco». Per toglierla
      -- davvero c'è cambiaCompito, dove null vuol dire null
      ora        = COALESCE(excluded.ora, compiti.ora),
      progetto   = COALESCE(excluded.progetto, compiti.progetto),
      priorita   = COALESCE(excluded.priorita, compiti.priorita),
      -- da chi sei nata non cambia: una riscrittura senza madre non taglia il filo
      madre      = COALESCE(excluded.madre, compiti.madre),
      -- il permesso si riscrive con la riga: se l'automazione nel frattempo ha
      -- perso un attrezzo, la riga rifatta non se lo tiene
      attrezzi   = excluded.attrezzi,
      -- COALESCE e non excluded secco: chi riscrive una riga senza mandare la
      -- nota non sta dicendo «cancella la nota», sta dicendo «non la tocco».
      -- Con excluded, un secondo POST della stessa riga si portava via un
      -- dettaglio scritto a mano.
      nota       = COALESCE(excluded.nota, compiti.nota),
      -- l'ordine non si ricalcola su una riga che esiste già: la teletrasportava
      -- in fondo al suo secchio a ogni riscrittura
      ordine     = compiti.ordine,
      -- una riga tolta e poi riscritta torna: senza questo il server rispondeva
      -- «fatto» e la riga non compariva da nessuna parte
      sparito    = NULL,
      aggiornato = excluded.aggiornato,
      versione   = compiti.versione + 1
  `).run(
    c.id, c.testo, c.nota ?? null, c.quando ?? 'oggi', c.giorno ?? null, c.ora ?? null, c.progetto ?? null, c.priorita ?? null, c.ordine,
    c.origine ?? 'mano', c.voce ?? null, c.doc ?? null, c.madre ?? null,
    c.attrezzi?.nomi?.length ? JSON.stringify(c.attrezzi) : null, ora, ora
  )
}

/** Il testo, la nota, il secchio, la posizione: quello che si cambia a mano. */
/**
 * Rimette in fondo al suo secchio una riga che è appena arrivata da un altro.
 *
 * Una chiave nata in «oggi» non vuol dire niente in «poi»: può essere identica
 * a una che c'è già, e due righe con la stessa chiave sono un ordine che non
 * esiste più.
 */
export function riordina(id: string, quando: string, nuova: string) {
  db.prepare('UPDATE compiti SET ordine = ?, quando = ?, aggiornato = ?, versione = versione + 1 WHERE id = ?')
    .run(nuova, quando, new Date().toISOString(), id)
}

export function cambiaCompito(id: string, c: {
  testo?: string; nota?: string | null; quando?: string; ordine?: string
  giorno?: string | null
  ora?: string | null
  progetto?: string | null
  priorita?: Priorita | null
}) {
  const campi: string[] = []
  const valori: (string | null)[] = []
  // `undefined` è «non toccare», `null` è «svuota»: sono due cose diverse e la
  // differenza si perde se si passa tutto per una stessa condizione
  if (c.testo !== undefined) { campi.push('testo = ?'); valori.push(c.testo) }
  if (c.nota !== undefined) { campi.push('nota = ?'); valori.push(c.nota) }
  if (c.giorno !== undefined) { campi.push('giorno = ?'); valori.push(c.giorno) }
  if (c.ora !== undefined) { campi.push('ora = ?'); valori.push(c.ora) }
  if (c.progetto !== undefined) { campi.push('progetto = ?'); valori.push(c.progetto) }
  if (c.priorita !== undefined) { campi.push('priorita = ?'); valori.push(c.priorita) }
  if (c.quando !== undefined) { campi.push('quando = ?'); valori.push(c.quando) }
  if (c.ordine !== undefined) { campi.push('ordine = ?'); valori.push(c.ordine) }
  if (!campi.length) return
  campi.push('aggiornato = ?'); valori.push(new Date().toISOString())
  db.prepare(`UPDATE compiti SET ${campi.join(', ')}, versione = versione + 1 WHERE id = ?`).run(...valori, id)
}

/**
 * Cambia lo stato, e si tiene le parole con cui l'hai chiuso.
 *
 * Come per il feed: «fatto» fra un mese non dice niente, «mandato lunedì col
 * listino nuovo» sì. L'etichetta serve al programma, la frase serve a te.
 */
/**
 * Attacca una proposta a un compito, e lo mette pronto.
 *
 * Non passa da `cambiaCompito`: quella è la strada delle modifiche tue — testo,
 * nota, quando — e una proposta non è una modifica tua, è il risultato di un
 * lavoro. Tenerle separate è anche il motivo per cui riscrivere il titolo di
 * una riga non può cancellare per sbaglio quello che sta per fare.
 */
export function proponi(id: string, p: Proposta, riassunto: string) {
  db.prepare(`
    UPDATE compiti SET proposta = ?, risultato = ?, email = NULL, stato = 'pronto',
      aggiornato = ?, versione = versione + 1
    WHERE id = ?
  `).run(JSON.stringify(p), riassunto, new Date().toISOString(), id)
}

/**
 * L'email pronta, o il fatto che non c'è.
 *
 * Non tocca `aggiornato` né `versione`: chi ha dato `pronto` un attimo prima
 * ha già mosso tutt'e due, e questa è la seconda metà dello stesso lavoro.
 */
export function scriviEmailCompito(id: string, email: EmailPronta | null) {
  db.prepare('UPDATE compiti SET email = ? WHERE id = ?')
    .run(email ? JSON.stringify(email) : null, id)
}

/** Il giudizio sul lavoro consegnato, scritto da `compiti.ts` quando la riga diventa pronta; null la ripulisce. */
export function scriviRevisioneCompito(id: string, revisione: RevisioneLavoro | null) {
  db.prepare('UPDATE compiti SET revisione = ?, aggiornato = ? WHERE id = ?')
    .run(revisione ? JSON.stringify(revisione) : null, new Date().toISOString(), id)
}

/**
 * Le domande che si fa mostrare al posto del paragrafo.
 *
 * Si scrivono accanto al risultato, non al suo posto: il testo in prosa resta
 * ed è quello che si legge sopra le domande — dice *perché* si è fermato, che
 * le opzioni da sole non direbbero.
 */
export function chiediSuCompito(id: string, righe: Chiesta[]) {
  db.prepare('UPDATE compiti SET chieste = ?, aggiornato = ? WHERE id = ?')
    .run(JSON.stringify(righe), new Date().toISOString(), id)
}

/** Risposto: le domande di prima non si ripresentano sotto la riga. */
export function scordaChieste(id: string) {
  db.prepare('UPDATE compiti SET chieste = NULL WHERE id = ?').run(id)
}

/** Fatta o rifiutata, la proposta non deve restare lì premibile una seconda volta. */
export function scordaProposta(id: string) {
  db.prepare('UPDATE compiti SET proposta = NULL, aggiornato = ?, versione = versione + 1 WHERE id = ?')
    .run(new Date().toISOString(), id)
}

/**
 * La stessa bozza, detta nell'altra lingua.
 *
 * Non tocca `stato` né `chiesto`: è lo stesso lavoro, detto in un'altra lingua,
 * non un lavoro rifatto. E non tocca `testo`, che è la riga che hai scritto tu.
 */
export function traduciRisultato(id: string, testo: string) {
  db.prepare('UPDATE compiti SET risultato = ?, aggiornato = ? WHERE id = ?')
    .run(testo, new Date().toISOString(), id)
}

/** La versione che hai tenuto tu prende il posto della sua. */
export function tieniLaTua(id: string, testo: string) {
  db.prepare('UPDATE compiti SET risultato = ?, aggiornato = ?, versione = versione + 1 WHERE id = ?')
    .run(testo, new Date().toISOString(), id)
}

/** Il richiamo porta via anche la bozza: una riga tornata tua non ha un lavoro altrui attaccato. */
export function sbozzaCompito(id: string) {
  const ora = new Date().toISOString()
  db.prepare(`
    UPDATE compiti SET risultato = NULL, fonti = NULL, chiesto = NULL, email = NULL, aggiornato = ?, versione = versione + 1
    WHERE id = ?
  `).run(ora, id)
}

export function cambiaStatoCompito(id: string, stato: string, esito?: string) {
  if (stato === 'fatto' || stato === 'lasciato') ricordaFonteAttenzione('compiti', id)
  const ora = new Date().toISOString()
  const chiuso = stato === 'fatto' || stato === 'lasciato' ? ora : null
  if (esito === undefined) {
    db.prepare('UPDATE compiti SET stato = ?, chiuso = ?, aggiornato = ?, versione = versione + 1 WHERE id = ?')
      .run(stato, chiuso, ora, id)
    return
  }
  db.prepare('UPDATE compiti SET stato = ?, esito = ?, chiuso = ?, aggiornato = ?, versione = versione + 1 WHERE id = ?')
    .run(stato, esito, chiuso, ora, id)
}

/** Written only by the verified native executor, never from model prose or task edits. */
export function scriviConsegnaCompito(id: string, consegna: ConsegnaCompito | null) {
  if (consegna && (!['Pages', 'TextEdit', 'File'].includes(consegna.app) || !consegna.titolo.trim() || !consegna.percorso.startsWith('/') || consegna.percorso.includes('\0'))) {
    throw new Error('Consegna non valida.')
  }
  if (consegna?.desktop && (!consegna.desktop.startsWith('/') || consegna.desktop.includes('\0'))) throw new Error('Invalid desktop delivery path.')
  if (consegna?.dove !== undefined && (typeof consegna.dove !== 'string' || !/^[a-z]{1,20}$/.test(consegna.dove))) throw new Error('Luogo della consegna non valido.')
  if (consegna?.anteprima && (!consegna.anteprima.startsWith('/') || consegna.anteprima.includes('\0'))) throw new Error('Anteprima non valida.')
  if (consegna?.pagine != null && (!Number.isInteger(consegna.pagine) || consegna.pagine < 1)) throw new Error('Numero di pagine non valido.')
  if (consegna?.revisione && (!['pass', 'revise', 'unavailable'].includes(consegna.revisione.esito) || !Array.isArray(consegna.revisione.problemi) || !consegna.revisione.problemi.every(p => typeof p === 'string'))) throw new Error('Revisione non valida.')
  db.prepare('UPDATE compiti SET consegna = ?, aggiornato = ?, versione = versione + 1 WHERE id = ?')
    .run(consegna ? JSON.stringify(consegna) : null, new Date().toISOString(), id)
}

/** Il compito passa a Myynd: da qui in poi l'attesa è sua. */
export function affidaCompito(id: string, modo: string) {
  const ora = new Date().toISOString()
  db.prepare(`
    UPDATE compiti SET stato = 'delegato', modo = ?, chiesto = ?, guaio = NULL, consegna = NULL, aggiornato = ?, versione = versione + 1
    WHERE id = ?
  `).run(modo, ora, ora, id)
}

/** «Questa me la faccio io.» Torna sua, e resta segnato che è sua. */
export function riprendiCompito(id: string) {
  db.prepare(`
    UPDATE compiti SET modo = 'io', aggiornato = ?, versione = versione + 1 WHERE id = ?
  `).run(new Date().toISOString(), id)
}

/** Quello che ha preparato, con le fonti da cui l'ha tirato fuori. */
/**
 * Quello che ha preparato, con le fonti da cui l'ha tirato fuori.
 *
 * `WHERE stato = 'delegato'` non è ridondante: il modello ci mette mezzo minuto,
 * e in quel mezzo minuto puoi averla già fatta tu e chiusa. Senza quella
 * condizione la bozza in ritardo riapriva una riga chiusa — e la riga tornava
 * su in lista come se non l'avessi mai spuntata.
 *
 * Torna `false` se non ha aggiornato niente, così chi chiama non annuncia un
 * cambiamento che non è avvenuto.
 */
export function risultatoCompito(
  id: string,
  risultato: string,
  fonti: { id: string; label: string }[],
  stato: 'pronto' | 'chiede' = 'pronto'
): boolean {
  const ora = new Date().toISOString()
  const r = db.prepare(`
    UPDATE compiti SET stato = ?, risultato = ?, fonti = ?, email = NULL, guaio = NULL, aggiornato = ?, versione = versione + 1
    WHERE id = ? AND stato = 'delegato'
  `).run(stato, risultato, JSON.stringify(fonti), ora, id)
  return Number(r.changes) > 0
}

/**
 * Non ce l'ha fatta. Il compito torna aperto — resta tuo, come prima di
 * affidarlo — e il perché resta scritto accanto, in italiano. Un compito che
 * sparisce perché il modello era giù è il modo peggiore di fallire.
 */
export function guaioCompito(id: string, guaio: string): boolean {
  const ora = new Date().toISOString()
  const r = db.prepare(`
    UPDATE compiti SET stato = 'aperto', guaio = ?, aggiornato = ?, versione = versione + 1
    WHERE id = ? AND stato = 'delegato'
  `).run(guaio, ora, id)
  return Number(r.changes) > 0
}

/**
 * Riapre in un colpo solo tutti i compiti rimasti a metà.
 *
 * Un `UPDATE` invece del giro di prima, che preparava una query per riga e non
 * apriva nessuna transazione: all'avvio, con la lista lunga, era il momento
 * peggiore per farlo.
 */
export function riapriGliAppesi(guaio: string): number {
  const ora = new Date().toISOString()
  const r = db.prepare(`
    UPDATE compiti SET stato = 'aperto', guaio = ?, chiesto = NULL, aggiornato = ?, versione = versione + 1
    WHERE stato = 'delegato' AND sparito IS NULL
  `).run(guaio, ora)
  return Number(r.changes)
}

/**
 * Toglie un compito dalla lista senza cancellarlo.
 *
 * `DELETE` qui sarebbe stato più corto di una riga e più caro di un anno: una
 * riga sparita davvero è una riga che nessun altro dispositivo saprà mai di
 * dover togliere. Chi vuole svuotare tutto ha `azzeraTutto`, che è una scelta
 * esplicita e non un effetto collaterale.
 */
export function scordaCompito(id: string) {
  ricordaFonteAttenzione('compiti', id)
  const ora = new Date().toISOString()
  // anche togliere è una scrittura: una pietra tombale che non fa avanzare la
  // versione, il giorno della sincronizzazione perde contro qualunque modifica
  // fatta altrove — ed è esattamente la riga che torna a galla da sola
  db.prepare('UPDATE compiti SET sparito = ?, aggiornato = ?, versione = versione + 1 WHERE id = ?')
    .run(ora, ora, id)
}

/**
 * I compiti rimasti in mezzo al guado.
 *
 * Se il server muore mentre Myynd sta lavorando a un compito, quel compito
 * resta 'delegato' per sempre e la riga gira all'infinito. All'avvio si
 * riportano indietro: meglio un compito da riaffidare che uno che finge.
 */
export function compitiAppesi(): Compito[] {
  const righe = db.prepare("SELECT * FROM compiti WHERE stato = 'delegato' AND sparito IS NULL").all() as Record<string, unknown>[]
  return righe.map(compitoDaRiga)
}

/** Quello che c'è da fare, in una riga per il modello. */
export function compitiPerIlModello(limite = 12): string[] {
  const righe = db.prepare(`
    SELECT testo, quando FROM compiti
    WHERE stato IN ('aperto','delegato','pronto','chiede') AND sparito IS NULL
    ORDER BY CASE quando WHEN 'oggi' THEN 0 WHEN 'settimana' THEN 1 ELSE 2 END, ordine
    LIMIT ?
  `).all(limite) as { testo: string; quando: string }[]
  return righe.map(r => `${r.testo} (${r.quando})`)
}

// — la mappa, dal materiale vero —

export type NodoMappa = { id: string; titolo: string; gruppo: string; fonte: string; quando: string | null }
export type ArcoMappa = [number, number, number]   // i, j, quante radici in comune

/**
 * Il grafo dei documenti e di quello che hanno in comune.
 *
 * Prima la Mappa nasceva dai *conteggi* per gruppo: tanti puntini quanti
 * documenti, messi a caso con un seme fisso. Era un bell'oggetto che non diceva
 * niente — due nodi vicini non avevano niente a che fare l'uno con l'altro.
 *
 * Qui i legami sono veri: due documenti si toccano se condividono parole che
 * *non* sono comuni a tutti. Le parole troppo frequenti non legano niente
 * (comparirebbero ovunque), quelle uniche nemmeno (non sono condivise): il
 * significato sta in mezzo.
 */
export function mappa(tetto = 2600): { nodi: NodoMappa[]; archi: ArcoMappa[] } {
  // le radici si leggono da `documenti`, che è dove stanno: la giunzione con
  // l'FTS era l'unico modo di arrivarci finché erano una colonna solo sua
  const righe = db.prepare(`
    SELECT d.rid, d.id, d.titolo, d.gruppo, d.fonte, d.quando, d.radici
    FROM documenti d
    ORDER BY d.quando DESC LIMIT ?
  `).all(tetto) as { id: string; titolo: string; gruppo: string | null; fonte: string; quando: string | null; radici: string }[]

  const nodi: NodoMappa[] = righe.map(r => ({
    id: r.id, titolo: r.titolo, gruppo: r.gruppo ?? 'altro', fonte: r.fonte, quando: r.quando
  }))
  if (nodi.length < 2) return { nodi, archi: [] }

  // indice rovesciato: da ogni radice ai documenti che la contengono
  const dove = new Map<string, number[]>()
  righe.forEach((r, i) => {
    // le prime radici di ogni documento bastano: il titolo e l'inizio pesano
    // di più, e leggere tutto un PDF di 20.000 caratteri qui non paga
    for (const t of new Set((r.radici || '').split(' ').slice(0, 220))) {
      if (t.length < 4) continue
      const l = dove.get(t)
      if (l) l.push(i); else dove.set(t, [i])
    }
  })

  // Quanto una radice è distintiva. Una parola che compare ovunque non lega
  // niente — legherebbe tutto — e una che compare una volta sola non è
  // condivisa. In mezzo, più è rara più il legame pesa: è la stessa idea che
  // sta dietro all'IDF, e senza di essa "documento" conta come "ponteggio".
  const minimo = 2
  const massimo = Math.max(6, Math.floor(nodi.length * 0.5))
  const peso = new Map<string, number>()
  const quante = new Map<string, number>()

  for (const [, lista] of dove) {
    const df = lista.length
    if (df < minimo || df > massimo) continue
    const rarita = Math.log(nodi.length / df)

    // una radice molto diffusa produrrebbe migliaia di coppie: se ne prende un
    // numero fisso, a passo costante per non pescare sempre dall'inizio
    const tetto = 24
    const passo = Math.max(1, Math.floor(df / tetto))
    const scelti: number[] = []
    for (let k = 0; k < df && scelti.length < tetto; k += passo) scelti.push(lista[k])

    for (let a = 0; a < scelti.length; a++) {
      for (let b = a + 1; b < scelti.length; b++) {
        const i = scelti[a], j = scelti[b]
        const k = i < j ? `${i}:${j}` : `${j}:${i}`
        peso.set(k, (peso.get(k) ?? 0) + rarita)
        quante.set(k, (quante.get(k) ?? 0) + 1)
      }
    }
  }

  const archi: ArcoMappa[] = []
  for (const [k, w] of peso) {
    // due radici in comune, o una sola se è davvero rara: una parola condivisa
    // e banale è un caso, non un rapporto
    if ((quante.get(k) ?? 0) < 2 && w < 2.5) continue
    const [i, j] = k.split(':').map(Number)
    archi.push([i, j, Math.round(w * 100) / 100])
  }
  // i legami più forti per primi, con un tetto: oltre, il disegno diventa lana
  archi.sort((a, b) => b[2] - a[2])
  return { nodi, archi: archi.slice(0, 9000) }
}

// — quello che scarti, e che si ripete —

/**
 * I motivi che non spiegano niente. Sono le risposte pronte: chiudere con un
 * tocco è giusto, ma non lascia informazione — ed è esattamente il caso in cui
 * vale la pena, ogni tanto, chiedere.
 */
const MUTI = new Set(['non mi interessa.', 'non mi interessa', ''])

export type Tema = { tema: string; titoli: string[]; ids: string[]; quanti: number }

/**
 * Cerca un argomento che continui a essere spinto via senza spiegazione.
 *
 * Non guarda il singolo scarto — uno scarto è rumore, e chiedere «come mai?»
 * ogni volta è il modo più rapido per diventare molesti. Guarda le radici delle
 * parole (le stesse della ricerca) e cerca quella che ricorre in più voci
 * scartate: è la ripetizione a essere informativa, non il gesto.
 */
export function temiScartati(minimo = 3): Tema[] {
  const righe = db.prepare(`
    SELECT id, titolo, motivo FROM feed
    -- anche il «Fatto» premuto senza una parola conta: è il modo più comune di
    -- dire «non mi interessa» — si preme il bottone grosso e via. Se il perché
    -- l'hai scritto, invece, è già chiaro e non c'è niente da chiedere.
    WHERE stato IN ('scartato', 'fatto') ORDER BY COALESCE(risposto, quando) DESC LIMIT 80
  `).all() as { id: string; titolo: string; motivo: string | null }[]

  // solo quelli chiusi senza dire perché: se il perché l'hai scritto, è già chiaro
  const muti = righe.filter(r => MUTI.has((r.motivo ?? '').trim().toLowerCase()))
  if (muti.length < minimo) return []

  const dove = new Map<string, Tema>()
  for (const r of muti) {
    for (const rad of new Set(radici(r.titolo).split(' '))) {
      if (rad.length < 4) continue
      const t = dove.get(rad) ?? { tema: rad, titoli: [], ids: [], quanti: 0 }
      t.titoli.push(r.titolo); t.ids.push(r.id); t.quanti++
      dove.set(rad, t)
    }
  }

  return [...dove.values()]
    .filter(t => t.quanti >= minimo)
    .sort((a, b) => b.quanti - a.quanti)
}

// — le domande che fa lui —

export type Domanda = {
  id: string; tema: string; testo: string; spunto: string[]
  stato: string; risposta: string | null; esito: string | null; creata: string
  chiusa?: string | null
  /** Il progetto su cui chiede, se ne riguarda uno: la prima pagina la mette nel suo blocco. */
  progetto?: string | null
}

function daRiga(r: Record<string, unknown> | undefined): Domanda | null {
  if (!r) return null
  return { ...r, spunto: r.spunto ? JSON.parse(r.spunto as string) : [] } as unknown as Domanda
}

/** Ce n'è al massimo una aperta per volta: è metà del motivo per cui non pesa. */
export function domandaAperta(): Domanda | null {
  // `creata` da sola non basta: due righe scritte nello stesso millisecondo
  // hanno lo stesso valore e l'ordine diventa arbitrario. Il rowid è l'ordine
  // di inserimento, che qui è proprio quello che «più recente» vuol dire.
  return daRiga(db.prepare("SELECT * FROM domande WHERE stato = 'aperta' ORDER BY creata DESC, rowid DESC LIMIT 1")
    .get() as Record<string, unknown> | undefined)
}

export function domandaGiaFatta(tema: string): boolean {
  return !!db.prepare('SELECT 1 FROM domande WHERE tema = ?').get(tema)
}

/** Quando ha chiesto l'ultima volta — serve a non superare il suo budget. */
export function ultimaDomanda(): string | null {
  const r = db.prepare('SELECT creata FROM domande ORDER BY creata DESC, rowid DESC LIMIT 1').get() as { creata: string } | undefined
  return r?.creata ?? null
}

export function apriDomanda(d: { tema: string; testo: string; spunto: string[]; progetto?: string | null }): Domanda | null {
  // il solo tempo non basta: due domande nello stesso millisecondo avrebbero
  // lo stesso id e la seconda sparirebbe in silenzio dentro il catch qui sotto
  const id = 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  try {
    db.prepare(`INSERT INTO domande (id, tema, testo, spunto, stato, creata, progetto) VALUES (?,?,?,?, 'aperta', ?, ?)`)
      .run(id, d.tema, d.testo, JSON.stringify(d.spunto), new Date().toISOString(), d.progetto ?? null)
  } catch {
    return null   // il tema era già stato chiesto: l'UNIQUE ha fatto il suo lavoro
  }
  return domandaAperta()
}

/** Una domanda precisa, in qualunque stato sia. */
export function domanda(id: string): Domanda | null {
  return daRiga(db.prepare('SELECT * FROM domande WHERE id = ?').get(id) as Record<string, unknown> | undefined)
}

/** La domanda su un tema, se è mai stata fatta: aperta, risposta o ignorata che sia. */
export function domandaPerTema(tema: string): Domanda | null {
  return daRiga(db.prepare('SELECT * FROM domande WHERE tema = ?').get(tema) as Record<string, unknown> | undefined)
}

/** Le domande il cui tema comincia così, le più recenti prima. */
export function domandeConTema(prefisso: string): Domanda[] {
  return (db.prepare('SELECT * FROM domande WHERE tema LIKE ? ORDER BY creata DESC, rowid DESC')
    .all(prefisso.replace(/[%_]/g, '') + '%') as Record<string, unknown>[]).map(r => daRiga(r)!)
}

/**
 * La stessa domanda, fatta di nuovo.
 *
 * `tema` è unico e resta unico: sulle cose che si chiedono una volta sola è
 * la garanzia giusta. Ma il riferimento (su cosa sta lavorando, cosa è morto)
 * invecchia, e dopo due settimane si richiede: si riapre la riga di allora
 * invece di inventare un tema nuovo per ogni giro.
 */
export function riapriDomanda(id: string, testo: string, spunto: string[]) {
  db.prepare(`UPDATE domande SET testo = ?, spunto = ?, stato = 'aperta', risposta = NULL, esito = NULL, chiusa = NULL, creata = ? WHERE id = ?`)
    .run(testo, JSON.stringify(spunto), new Date().toISOString(), id)
}

/** Lo stesso testo detto meglio, a domanda ancora aperta: niente riapertura, niente orario nuovo. */
export function aggiornaDomanda(id: string, testo: string, spunto: string[]) {
  db.prepare(`UPDATE domande SET testo = ?, spunto = ? WHERE id = ? AND stato = 'aperta'`).run(testo, JSON.stringify(spunto), id)
}

export function chiudiDomanda(id: string, stato: 'risposta' | 'ignorata', risposta?: string, esito?: string) {
  db.prepare('UPDATE domande SET stato = ?, risposta = ?, esito = ?, chiusa = ? WHERE id = ?')
    .run(stato, risposta ?? null, esito ?? null, new Date().toISOString(), id)
}

// — memoria: quello che Myynd sa di te —

export type Convinzione = {
  id: string
  enunciato: string
  ambito: string
  genere: 'esplicita' | 'dedotta' | 'indotta'
  fiducia: number
  premesse?: string[] | null
  prova?: { doc?: string; citazione?: string } | null
  origine: string
  dal: string
  al?: string | null
  sostituisce?: string | null
  /**
   * Quando una persona l'ha guardata e ha detto di sì. Null = nessuno l'ha
   * ancora guardata, che non è la stessa cosa di «è sbagliata»: quella si
   * chiude o si cancella.
   */
  confermata?: string | null
}

function idConvinzione(enunciato: string, ambito: string): string {
  const base = `${ambito}|${enunciato}`
  let h = 5381
  for (let i = 0; i < base.length; i++) h = ((h * 33) ^ base.charCodeAt(i)) >>> 0
  return 'c' + h.toString(36)
}

/**
 * Scrive una convinzione. Se ne indica una che contraddice, quella non viene
 * cancellata: le si mette una data di fine. Un archivio che sovrascrive non sa
 * dire da quando ha cambiato idea, e quella domanda è proprio quella che serve
 * quando una risposta sembra sbagliata.
 */
export function ricorda(c: Omit<Convinzione, 'id' | 'dal'> & { id?: string; dal?: string }): string {
  const ora = new Date().toISOString()
  const id = c.id ?? idConvinzione(c.enunciato, c.ambito)
  // scordata a mano: quello che deduce da solo non la rimette; quello che dice lei sì (P5)
  if (c.genere !== 'esplicita' && db.prepare('SELECT 1 FROM convinzioni_tolte WHERE id = ?').get(id)) return id
  db.exec('BEGIN')
  try {
    if (c.genere === 'esplicita') db.prepare('DELETE FROM convinzioni_tolte WHERE id = ?').run(id)
    if (c.sostituisce) {
      db.prepare('UPDATE convinzioni SET al = ? WHERE id = ? AND al IS NULL').run(ora, c.sostituisce)
    }
    db.prepare(`
      INSERT INTO convinzioni (id, enunciato, ambito, genere, fiducia, premesse, prova, origine, dal, al, sostituisce, creata)
      VALUES (?,?,?,?,?,?,?,?,?,NULL,?,?)
      -- L'id è l'impronta di (ambito | enunciato): un conflitto vuol dire che
      -- la stessa identica frase è stata riaffermata. Prima si aggiornavano
      -- solo fiducia e prova, e restavano attaccati genere, premesse e
      -- origine della *prima* volta: una convinzione detta esplicitamente
      -- restava marchiata «indotta» perché mesi prima era stata dedotta, e
      -- la carta la presentava con un peso che non le apparteneva più. Un
      -- ibrido che non è mai esistito, né allora né adesso.
      --
      -- prova con COALESCE: una riaffermazione senza citazione non deve
      -- cancellare la citazione che c'era.
      ON CONFLICT(id) DO UPDATE SET
        fiducia   = excluded.fiducia,
        genere    = excluded.genere,
        premesse  = COALESCE(excluded.premesse, convinzioni.premesse),
        prova     = COALESCE(excluded.prova, convinzioni.prova),
        origine   = excluded.origine,
        al        = NULL
    `).run(
      id, c.enunciato, c.ambito, c.genere, c.fiducia,
      c.premesse ? JSON.stringify(c.premesse) : null,
      c.prova ? JSON.stringify(c.prova) : null,
      c.origine, c.dal ?? ora, c.sostituisce ?? null, ora
    )
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  // una che aspetta di essere guardata: chi ha la Memoria aperta lo sa subito (P5)
  if (c.genere === 'indotta' && !c.confermata) for (const f of suInAttesa) { try { f() } catch { /* un ascoltatore non ferma la scrittura */ } }
  return id
}

/** Chi vuole sapere che è nata una convinzione da guardare (P5: il punto accanto a «Memoria»). */
const suInAttesa = new Set<() => void>()
export function quandoNeAspettaUna(f: () => void): () => void {
  suInAttesa.add(f)
  return () => { suInAttesa.delete(f) }
}

/**
 * Da riga a convinzione, in un posto solo.
 *
 * `premesse` e `prova` stanno nel database come JSON e vanno letti. Questa
 * riga esisteva solo dentro `convinzioni()`, e `convinzioniStoriche()` faceva
 * un cast diretto: restituiva stringhe dichiarandole oggetti. Un tipo che
 * mente non dà nessun errore di compilazione — dà un errore in faccia a chi
 * apre la schermata, il giorno che qualcuno scrive `c.premesse.map(...)`.
 */
function daRigaConvinzione(r: Record<string, unknown>): Convinzione {
  return {
    ...r,
    premesse: r.premesse ? JSON.parse(r.premesse as string) : null,
    prova: r.prova ? JSON.parse(r.prova as string) : null
  } as unknown as Convinzione
}

/**
 * Cosa lasciare fuori da `convinzioni()`.
 *
 * Una sola voce, e serve a una distinzione che vale la pena tenere netta: una
 * convinzione *indotta* è una generalizzazione fatta da una macchina su tre
 * episodi — plausibile, mai passata sotto gli occhi di nessuno, e trattata
 * come un fatto dal momento in cui entra in un prompt. Chi scrive una mail per
 * conto di qualcuno può volere solo quello che è stato detto o confermato;
 * chi disegna la schermata della memoria le vuole tutte, comprese quelle da
 * guardare — sono proprio quelle il lavoro da fare.
 */
export type FiltroConvinzioni = {
  /** Le indotte entrano solo se qualcuno le ha confermate. */
  indotteSoloSeConfermate?: boolean
}

/** Quello che vale adesso, il più solido per primo. */
export function convinzioni(ambito?: string, filtro?: FiltroConvinzioni): Convinzione[] {
  const dove = ['al IS NULL']
  const valori: string[] = []
  if (ambito) { dove.push('ambito = ?'); valori.push(ambito) }
  if (filtro?.indotteSoloSeConfermate) dove.push("(genere <> 'indotta' OR confermata IS NOT NULL)")
  const righe = db.prepare(
    `SELECT * FROM convinzioni WHERE ${dove.join(' AND ')} ORDER BY fiducia DESC, creata DESC`
  ).all(...valori) as Record<string, unknown>[]
  return righe.map(daRigaConvinzione)
}

/**
 * «Sì, questa è vera»: la data in cui l'ha detto una persona.
 *
 * Torna vero se la convinzione esiste, vale ancora, ed è confermata quando
 * questa chiamata finisce — anche se lo era già. Confermarla due volte non
 * sposta la data: quella dice quand'è stata guardata la prima volta, e
 * riscriverla vorrebbe dire perdere l'unica informazione che porta. Falso
 * significa una sola cosa: non c'è, o è scaduta.
 */
export function confermaConvinzione(id: string): boolean {
  const r = db.prepare('UPDATE convinzioni SET confermata = ? WHERE id = ? AND al IS NULL AND confermata IS NULL')
    .run(new Date().toISOString(), id)
  if (Number(r.changes ?? 0) > 0) return true
  return !!db.prepare('SELECT 1 FROM convinzioni WHERE id = ? AND al IS NULL AND confermata IS NOT NULL').get(id)
}

/** Anche quelle scadute: serve a rispondere «da quando hai cambiato idea?». */
export function convinzioniStoriche(): Convinzione[] {
  const righe = db.prepare('SELECT * FROM convinzioni WHERE al IS NOT NULL ORDER BY al DESC').all() as Record<string, unknown>[]
  return righe.map(daRigaConvinzione)
}

/** Cancellare a mano è un diritto: è la sua testa, deve poterci mettere le mani. */
export function scordaConvinzione(id: string) {
  // la lapide prima: la stessa frase dedotta domani non deve tornare (P5)
  db.exec('BEGIN')
  try {
    db.prepare('INSERT OR REPLACE INTO convinzioni_tolte (id, quando) VALUES (?, ?)').run(id, new Date().toISOString())
    db.prepare('DELETE FROM convinzioni WHERE id = ?').run(id)
    db.exec('COMMIT')
  } catch (e) { db.exec('ROLLBACK'); throw e }
}

export function chiudiConvinzione(id: string) {
  db.prepare('UPDATE convinzioni SET al = ? WHERE id = ? AND al IS NULL').run(new Date().toISOString(), id)
}

export type Blocco = {
  etichetta: string; descrizione: string; valore: string; tetto: number
  /** Quando l'ha scritto Myynd. Null = l'ultima parola è tua. */
  daMe?: string | null
  aggiornato?: string | null
}

export function blocchi(): Blocco[] {
  return db.prepare('SELECT etichetta, descrizione, valore, tetto, daMe, aggiornato FROM blocchi ORDER BY etichetta')
    .all() as unknown as Blocco[]
}

/**
 * Il tetto si applica qui, non a chi legge: un blocco non può sforare.
 *
 * `daMe` dice chi ha parlato per ultimo, e il valore predefinito è `null`
 * apposta: chi chiama senza dirlo sta scrivendo *per conto di una persona* —
 * è la rotta dell'interfaccia, cioè il caso in cui l'ha scritto lei. Solo la
 * consolidazione passa una data, e solo lei si dichiara.
 */
export function scriviBlocco(b: {
  etichetta: string; descrizione: string; valore: string; tetto?: number; daMe?: string | null
}) {
  const tetto = b.tetto ?? 700
  db.prepare(`
    INSERT INTO blocchi (etichetta, descrizione, valore, tetto, aggiornato, daMe) VALUES (?,?,?,?,?,?)
    ON CONFLICT(etichetta) DO UPDATE SET
      descrizione = excluded.descrizione, valore = excluded.valore,
      tetto = excluded.tetto, aggiornato = excluded.aggiornato, daMe = excluded.daMe
  `).run(b.etichetta, b.descrizione, b.valore.slice(0, tetto), tetto, new Date().toISOString(), b.daMe ?? null)
}

/**
 * Le convinzioni nate dopo un certo momento.
 *
 * Serve alla consolidazione per non rifare ogni volta lo stesso lavoro sullo
 * stesso materiale: senza, quel giro chiamerebbe un modello ogni sei ore per
 * riscrivere cinque blocchi identici a sé stessi.
 */
export function convinzioniDopo(quando: string): number {
  const r = db.prepare('SELECT COUNT(*) AS n FROM convinzioni WHERE dal > ? AND al IS NULL').get(quando) as { n: number }
  return r.n
}

/**
 * La stessa convinzione, detta nell'altra lingua.
 *
 * Si tocca solo l'enunciato: id, genere, fiducia, prova, date e ambito restano
 * quelli. È lo stesso giudizio, non uno nuovo — e se cambiasse l'id cambierebbe
 * anche l'identità, cioè si perderebbe la storia di quando è nato.
 */
export function traduciConvinzione(id: string, enunciato: string) {
  db.prepare('UPDATE convinzioni SET enunciato = ? WHERE id = ?').run(enunciato, id)
}

export function traduciBlocco(etichetta: string, valore: string) {
  db.prepare('UPDATE blocchi SET valore = ?, aggiornato = ? WHERE etichetta = ?')
    .run(valore, new Date().toISOString(), etichetta)
}

export function scordaBlocco(etichetta: string) {
  db.prepare('DELETE FROM blocchi WHERE etichetta = ?').run(etichetta)
}

// — le automazioni: quello che sa questa installazione —

export type StatoAutomazione = {
  id: string; spenta: number; ultima: string | null
  quante: number; esito: string | null; guaio: string | null
  /** In che cartella l'hai messa. Assente o null = in nessuna. */
  raccolta?: string | null
  /** Da quando questa installazione la conosce. Serve a chi non è mai girata. */
  dal?: string | null
  /** Le ultime volte, in JSON. Si legge con `storiaDi`. */
  storia?: string | null
  /** Il giorno a cui si riferisce `bozze`, come AAAA-MM-GG. */
  giorno?: string | null
  /** Quante bozze ha fatto fare in quel giorno. Il tetto si legge da qui. */
  bozze?: number | null
  /** Fin dove ha guardato il materiale: si muove solo con un giro riuscito. */
  vista?: string | null
}

/**
 * Una bozza in più oggi, per questa automazione.
 *
 * Il giorno sta accanto al numero: quando cambia, il numero riparte da uno
 * senza che nessuno debba passare a mezzanotte ad azzerare niente.
 */
export function segnaBozza(id: string, giorno: string): number {
  const s = statoAutomazione(id)
  const quante = s?.giorno === giorno ? Number(s.bozze ?? 0) + 1 : 1
  db.prepare(`
    INSERT INTO automazioni (id, giorno, bozze) VALUES (?,?,?)
    ON CONFLICT(id) DO UPDATE SET giorno = excluded.giorno, bozze = excluded.bozze
  `).run(id, giorno, quante)
  return quante
}

/** Un giro, com'è andato. */
export type Giro = { quando: string; esito: string; quanti: number; risultato?: string }

/** Quanti giri si tengono. Venti: bastano a vedere un'abitudine, non un anno. */
const GIRI = 20

/**
 * La storia di una, già letta.
 *
 * Una colonna JSON scritta male non deve poter buttare giù la schermata delle
 * automazioni: qui un contenuto illeggibile diventa «non so niente», che è
 * vero e innocuo, invece di un'eccezione dentro `elenco()`.
 */
export function storiaDi(s: StatoAutomazione | null | undefined): Giro[] {
  if (!s?.storia) return []
  try {
    const x = JSON.parse(s.storia)
    return Array.isArray(x) ? x.slice(-GIRI) : []
  } catch { return [] }
}

// — le raccolte: le cartelle in cui te le organizzi —

/**
 * Le cartelle, comprese quelle vuote.
 *
 * Tenerle in una tabella invece di dedurle da chi ci sta dentro è la
 * differenza fra una cartella che esiste e una che compare solo quando ha
 * qualcosa dentro. La seconda è inservibile: la fai, la schermata non cambia,
 * e ci trascini dentro la prima automazione senza avere un posto dove
 * lasciarla cadere.
 */
export function raccolte(): { nome: string; ordine: number }[] {
  return db.prepare('SELECT nome, ordine FROM raccolte ORDER BY ordine, nome')
    .all() as { nome: string; ordine: number }[]
}

export function creaRaccolta(nome: string): boolean {
  const n = nome.trim().slice(0, 40)
  if (!n) return false
  const coda = db.prepare('SELECT COALESCE(MAX(ordine), 0) AS m FROM raccolte').get() as { m: number }
  const r = db.prepare('INSERT OR IGNORE INTO raccolte (nome, ordine, quando) VALUES (?,?,?)')
    .run(n, coda.m + 1, new Date().toISOString())
  return r.changes > 0
}

/**
 * Rinominarla porta con sé quello che ci sta dentro.
 *
 * Il nome *è* la chiave — è quello che sta scritto sulla riga di ogni
 * automazione — quindi cambiarlo senza spostare le automazioni le lascerebbe
 * tutte in una cartella che non esiste più: invisibili, senza che nessuno le
 * abbia buttate. Le due scritture stanno in una transazione per la stessa
 * ragione.
 */
export function rinominaRaccolta(da: string, a: string): boolean {
  const n = a.trim().slice(0, 40)
  if (!n || !db.prepare('SELECT 1 FROM raccolte WHERE nome = ?').get(da)) return false
  if (n !== da && db.prepare('SELECT 1 FROM raccolte WHERE nome = ?').get(n)) return false
  // le due scritture insieme o nessuna: fra l'una e l'altra le automazioni
  // starebbero in una cartella che non esiste più, cioè da nessuna parte
  db.exec('BEGIN')
  try {
    db.prepare('UPDATE raccolte SET nome = ? WHERE nome = ?').run(n, da)
    db.prepare('UPDATE automazioni SET raccolta = ? WHERE raccolta = ?').run(n, da)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  return true
}

/**
 * Butta la cartella, non quello che c'è dentro.
 *
 * Le automazioni tornano fuori dalle cartelle e restano in elenco. Una cartella
 * che si porta via il suo contenuto è il modo più veloce di far sparire del
 * lavoro con un gesto solo — e qui il gesto è «faccio ordine», non «cancello».
 */
export function buttaRaccolta(nome: string): boolean {
  db.exec('BEGIN')
  try {
    db.prepare('UPDATE automazioni SET raccolta = NULL WHERE raccolta = ?').run(nome)
    const via = db.prepare('DELETE FROM raccolte WHERE nome = ?').run(nome).changes
    db.exec('COMMIT')
    return Number(via) > 0
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

/** Spostarne una. `null` la tira fuori da tutte. */
export function mettiInRaccolta(id: string, raccolta: string | null) {
  db.prepare(`
    INSERT INTO automazioni (id, raccolta) VALUES (?,?)
    ON CONFLICT(id) DO UPDATE SET raccolta = excluded.raccolta
  `).run(id, raccolta)
}

/** Quelle che hai tolto di mezzo: non tornano, nemmeno dopo un aggiornamento. */
export function automazioniTolte(): Set<string> {
  const righe = db.prepare('SELECT id FROM automazioni WHERE tolta IS NOT NULL').all() as { id: string }[]
  return new Set(righe.map(r => r.id))
}

/**
 * Toglila di mezzo.
 *
 * Non «spenta»: spenta vuol dire che potrebbe tornare a girare, e resta in
 * elenco a ricordartelo. Questa sparisce.
 */
export function togliAutomazione(id: string) {
  db.prepare(`
    INSERT INTO automazioni (id, tolta) VALUES (?,?)
    ON CONFLICT(id) DO UPDATE SET tolta = excluded.tolta
  `).run(id, new Date().toISOString())
}

/**
 * Rimettila in elenco.
 *
 * Serve quando ne riscrivi una con lo stesso nome di una che avevi buttato:
 * senza, il file c'è, la ricetta è valida, e in elenco non compare — la scrivi
 * due volte, poi tre, e sembra rotto tutto.
 */
export function rivediAutomazione(id: string) {
  db.prepare('UPDATE automazioni SET tolta = NULL WHERE id = ?').run(id)
}

export function statiAutomazioni(): Record<string, StatoAutomazione> {
  const righe = db.prepare('SELECT * FROM automazioni').all() as unknown as StatoAutomazione[]
  return Object.fromEntries(righe.map(r => [r.id, r]))
}

export function statoAutomazione(id: string): StatoAutomazione | null {
  return (db.prepare('SELECT * FROM automazioni WHERE id = ?').get(id) as unknown as StatoAutomazione) ?? null
}

/**
 * È girata: si segna quando, quante volte in tutto, e com'è andata.
 *
 * `quanti` è quanti documenti ha guardato, e non è statistica: è la sola cosa
 * che distingue un'automazione che non trova niente perché non c'è niente da
 * una che non trova niente perché sta cercando parole che nei documenti non
 * compaiono. Le due si scrivono uguali nell'esito, e sono problemi opposti.
 */
export function automazioneGirata(id: string, esito: string, guaio?: string, quanti = 0, risultato?: string) {
  const ora = new Date().toISOString()
  const prima = storiaDi(statoAutomazione(id))
  const storia = JSON.stringify([...prima, { quando: ora, esito, quanti, ...(risultato ? { risultato: risultato.slice(0, 24000) } : {}) }].slice(-GIRI))
  // un guaio muove l'orologio (`ultima`) ma non il paletto (`vista`): quello
  // che è arrivato mentre falliva dev'essere ancora lì al prossimo giro
  const vista = esito === 'guaio' ? null : ora
  db.prepare(`
    INSERT INTO automazioni (id, ultima, vista, quante, esito, guaio, storia) VALUES (?,?,?,1,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      ultima = excluded.ultima,
      vista  = COALESCE(excluded.vista, automazioni.vista),
      quante = automazioni.quante + 1,
      esito  = excluded.esito,
      guaio  = excluded.guaio,
      storia = excluded.storia
  `).run(id, ora, vista, esito, guaio ?? null, storia)
}

/**
 * Rimandata: c'è già una sua riga aperta, e non si è guardato niente.
 *
 * **`ultima` non si tocca, ed è tutto il senso di questa funzione.** Prima
 * questo caso passava da `automazioneGirata`, che `ultima` la sposta — e
 * `ultima` è anche il paletto da cui `soloNuovi` riparte a guardare. Quindi:
 * un'automazione «guarda le fatture appena arrivate» con una riga rimasta
 * aperta in lista continuava a spostare il paletto in avanti ogni quarto d'ora
 * senza leggere niente, e tutto quello che arrivava nel frattempo finiva
 * *dietro* al paletto. Non veniva rimandato: veniva saltato, per sempre, in
 * silenzio, e la cosa saltata era esattamente una fattura.
 *
 * Non muovendo `ultima`, il turno resta scaduto e riprova al giro dopo: appena
 * quella riga viene chiusa, la successiva compare da sé.
 */
export function automazioneRimandata(id: string) {
  db.prepare(`
    INSERT INTO automazioni (id, esito) VALUES (?, 'gia')
    ON CONFLICT(id) DO UPDATE SET esito = 'gia'
  `).run(id)
}

/**
 * Saltata: aveva già scritto le sue bozze di oggi, e non si è guardato niente.
 *
 * Vale quello che vale per `automazioneRimandata`: `ultima` non si tocca,
 * perché è il paletto da cui «guarda cos'è arrivato» riparte, e qui non si è
 * guardato niente. E `guaio` resta com'è: la scheda lo mostra in rosso, e un
 * tetto raggiunto non è un guasto — è la ricetta che funziona fin troppo.
 */
export function automazioneSaltata(id: string) {
  db.prepare(`
    INSERT INTO automazioni (id, esito) VALUES (?, 'saltata')
    ON CONFLICT(id) DO UPDATE SET esito = 'saltata'
  `).run(id)
}

/**
 * Da quando la conosciamo.
 *
 * Idempotente, e chiamata a ogni giro su tutte: costa una scrittura che non
 * scrive, e in cambio dà una data di nascita a ogni automazione — cioè l'unico
 * modo di sapere se una che non è mai girata sta aspettando il suo turno o se
 * il suo turno è passato mentre il computer era spento.
 */
export function vediAutomazione(id: string) {
  db.prepare('INSERT OR IGNORE INTO automazioni (id, dal) VALUES (?,?)')
    .run(id, new Date().toISOString())
}

/**
 * Accesa o spenta, su questa macchina.
 *
 * La ricetta arriva uguale per tutta l'azienda; spegnerla è una decisione di
 * chi la usa, e resta sua. Per questo sta nel database e non nel file.
 */
export function accendiAutomazione(id: string, accesa: boolean) {
  db.prepare(`
    INSERT INTO automazioni (id, spenta) VALUES (?,?)
    ON CONFLICT(id) DO UPDATE SET spenta = excluded.spenta
  `).run(id, accesa ? 0 : 1)
}

/**
 * Via la sua storia, insieme alla ricetta.
 *
 * Una ricetta buttata che lascia dietro il suo stato è un fantasma: rifanne
 * una con lo stesso nome e si ritrova addosso il «girata 14 volte» di quella
 * di prima, spenta perché l'altra era spenta.
 */
export function scordaAutomazione(id: string) {
  db.prepare('DELETE FROM automazioni WHERE id = ?').run(id)
}

/**
 * C'è già una riga viva nata da questa automazione?
 *
 * È la guardia che impedisce a un'automazione giornaliera di riempire la lista
 * della stessa cosa ogni mattina. Finché quella di ieri è ancora lì aperta, non
 * se ne scrive un'altra: la persona non l'ha ancora guardata, e ripeterla non
 * la aiuta — la seppellisce.
 */
export function compitoVivoDa(automazione: string): boolean {
  return !!db.prepare(`
    SELECT 1 FROM compiti
    WHERE origine = ? AND sparito IS NULL AND stato IN ('aperto','delegato','pronto','chiede')
    LIMIT 1
  `).get(`auto:${automazione}`)
}

/**
 * Fra questi documenti, quali hanno già una riga in lista.
 *
 * *Qualunque* riga: viva, chiusa, tolta. È la guardia delle automazioni che
 * scrivono una riga per documento — «rispondere a Rossi» non deve ricomparire
 * perché la riga di ieri è stata chiusa, né perché è stata buttata — ed è
 * quello che tiene fuori dal feed una email che sta già in lista. Con
 * `origine` si guarda solo le righe nate da lì: una ricetta non deve
 * ripetersi, ma non deve nemmeno tacere perché un'altra ha già parlato di
 * quel documento con un'altra cosa da fare.
 */
export function docsConRiga(
  ids: string[],
  origine?: string,
  /**
   * Contano solo le righe vive, o chiuse da meno di tanti giorni.
   *
   * Senza, una riga chiusa mesi fa su un file che è ancora lì — e che
   * intanto è cambiato — lo terrebbe fuori dal feed per sempre. Le
   * automazioni non lo passano: per loro una riga già fatta su quel
   * documento è fatta, e non si rifà.
   */
  entroGiorni?: number
): Set<string> {
  const fuori = new Set<string>()
  const soglia = entroGiorni ? new Date(Date.now() - entroGiorni * 86_400_000).toISOString() : null
  // a blocchi: i segnaposto di SQLite hanno un tetto, e qui gli id arrivano
  // da una pescata che può crescere
  for (let i = 0; i < ids.length; i += 200) {
    const pezzo = ids.slice(i, i + 200)
    const righe = db.prepare(`
      SELECT DISTINCT doc FROM compiti
      WHERE doc IN (${pezzo.map(() => '?').join(',')})${origine ? ' AND origine = ?' : ''}
      ${soglia ? 'AND ((chiuso IS NULL AND sparito IS NULL) OR COALESCE(sparito, chiuso, aggiornato) >= ?)' : ''}
    `).all(...pezzo, ...(origine ? [origine] : []), ...(soglia ? [soglia] : [])) as { doc: string }[]
    for (const r of righe) fuori.add(r.doc)
  }
  return fuori
}

// — quello che ha fatto davvero —

export type Azione = {
  id: string; tipo: string; verso: string | null; cosa: string
  compito: string | null; esito: string; dettaglio: string | null; quando: string
}

/**
 * Segna una cosa uscita da questa macchina.
 *
 * Si scrive *sempre*, anche quando è andata storta: un registro che tiene solo
 * i successi non è un registro, è una vetrina. Il giorno che una mail non parte
 * è proprio il giorno in cui vuoi trovarne traccia.
 */
export function registraAzione(a: {
  tipo: string; cosa: string; verso?: string | null
  compito?: string | null; esito: 'fatta' | 'fallita'; dettaglio?: string | null
}): string {
  const id = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  db.prepare(`
    INSERT INTO azioni (id, tipo, verso, cosa, compito, esito, dettaglio, quando)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(id, a.tipo, a.verso ?? null, a.cosa, a.compito ?? null, a.esito, a.dettaglio ?? null,
    new Date().toISOString())
  return id
}

export function azioni(limite = 100): Azione[] {
  return db.prepare('SELECT * FROM azioni ORDER BY quando DESC LIMIT ?').all(limite) as unknown as Azione[]
}

/**
 * Questo indirizzo compare già nel materiale che hai letto?
 *
 * È la guardia che sta fra «Myynd manda una mail» e «Myynd manda una mail a
 * uno sconosciuto». Un destinatario che non è mai comparso nella tua posta non
 * è qualcuno con cui hai un rapporto: è un indirizzo che il modello ha messo
 * insieme, e su quello non si preme Invia senza guardare.
 *
 * Non blocca — quello lo decide chi legge. Dice soltanto se l'ha già visto, e
 * l'interfaccia lo mostra in chiaro accanto al campo.
 *
 * Erano due `LIKE '%…%'`, uno sull'autore e uno sul corpo: una lettura di ogni
 * riga e di ogni corpo dell'indice, sincrona, ogni volta che si prepara una
 * mail. Adesso sono due domande a due indici. Chi ha scritto è una colonna
 * normalizzata con sopra un vero indice — l'indirizzo si estrae quando il
 * documento entra, non quando lo si cerca. Chi è *citato* dentro un testo lo
 * sa l'FTS: un indirizzo, per il tokenizzatore, è la sequenza «rossi esempio
 * it», e cercarla come frase nelle colonne del corpo e dell'autore è la stessa
 * domanda fatta all'indice invece che al disco.
 *
 * Cambia una cosa, in piccolo: un testo che contenesse quelle tre parole di
 * fila senza la chiocciola adesso conta come «già visto». Per un segnale che
 * non blocca niente è un prezzo onesto — l'alternativa è tenere il server
 * fermo per secondi a ogni bozza.
 */
export function indirizzoConosciuto(indirizzo: string): boolean {
  const pulito = indirizzo.trim().toLowerCase()
  if (!pulito.includes('@')) return false
  if (db.prepare('SELECT 1 FROM documenti WHERE autoreIndirizzo = ? LIMIT 1').get(pulito)) return true

  // gli stessi pezzi in cui lo taglia il tokenizzatore dell'indice: lettere e
  // cifre, il resto separa
  const pezzi = pulito.normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  if (!pezzi.length) return false
  try {
    return !!db.prepare('SELECT 1 FROM ricerca WHERE ricerca MATCH ? LIMIT 1')
      .get(`{corpo autore} : "${pezzi.join(' ')}"`)
  } catch {
    return false
  }
}

// — sessioni —
//
// Vivevano in memoria, quindi ogni riavvio del server — e `node --watch` ne fa
// uno a ogni salvataggio — riportava all'accesso. Qui restano, e l'app si
// riapre dove l'avevi lasciata.

export function apriSessione(impronta: string, giorni = 30) {
  const ora = new Date()
  const scade = new Date(ora.getTime() + giorni * 86_400_000)
  db.prepare('INSERT OR REPLACE INTO sessioni (impronta, creata, scade) VALUES (?,?,?)')
    .run(impronta, ora.toISOString(), scade.toISOString())
}

export function sessioneValida(impronta: string): boolean {
  const r = db.prepare('SELECT scade FROM sessioni WHERE impronta = ?').get(impronta) as { scade: string } | undefined
  if (!r) return false
  if (Date.parse(r.scade) < Date.now()) {
    db.prepare('DELETE FROM sessioni WHERE impronta = ?').run(impronta)
    return false
  }
  return true
}

export function chiudiSessione(impronta: string) {
  db.prepare('DELETE FROM sessioni WHERE impronta = ?').run(impronta)
}

/** Alla partenza: le scadute non servono a nessuno. */
export function potaSessioni() {
  db.prepare('DELETE FROM sessioni WHERE scade < ?').run(new Date().toISOString())
}

// — il fascicolo: le tabelle che si esportano intere —

/**
 * Le tabelle personali che «Scarica tutti i miei dati» esporta riga per riga.
 *
 * Il feed in tutti i suoi stati, le domande, le notizie (lette e scartate sono
 * cose sue), le cartelle delle automazioni, e tutte quelle nate dalla 48 in
 * poi: una tabella nuova scritta in `TABELLE` ci entra da sola, così il
 * fascicolo non può dimenticarsela.
 */
export const TABELLE_DEL_FASCICOLO: readonly string[] = ['feed', 'domande', 'notizie', 'raccolte', ...Object.keys(TABELLE)]

/**
 * Tutte le righe di una di quelle tabelle, a pezzi.
 *
 * A pezzi per `rowid` e non con un `SELECT *` intero: le sessioni delle app
 * di un mese sono decine di migliaia di righe, e in memoria non ce ne devono
 * stare più di un pezzo per volta. Una tabella fuori dall'elenco non esce.
 */
export function* righeDi(tabella: string, pezzo = 500): Generator<Record<string, unknown>> {
  if (!TABELLE_DEL_FASCICOLO.includes(tabella)) return
  let da = Number.MIN_SAFE_INTEGER
  for (;;) {
    const righe = db.prepare(`SELECT rowid AS _riga, * FROM ${tabella} WHERE rowid > ? ORDER BY rowid LIMIT ?`)
      .all(da, pezzo) as Record<string, unknown>[]
    if (!righe.length) return
    for (const r of righe) {
      const { _riga, ...resto } = r
      da = Number(_riga)
      yield { ...resto }
    }
    if (righe.length < pezzo) return
  }
}

/**
 * Tutti i compiti fuori dalla lista aperta, a pezzi: i chiusi (fatti, lasciati,
 * e qualunque altro stato che non sia aperto) e i tolti. Il fascicolo li vuole
 * tutti, non gli ultimi mille: aperti + chiusi + tolti sono ogni riga, una volta.
 */
export function* compitiDelFascicolo(quali: 'chiusi' | 'tolti', pezzo = 500): Generator<Compito> {
  const dove = quali === 'tolti'
    ? 'sparito IS NOT NULL'
    : "sparito IS NULL AND (stato IS NULL OR stato NOT IN ('aperto','delegato','pronto','chiede'))"
  let da = Number.MIN_SAFE_INTEGER
  for (;;) {
    const righe = db.prepare(`SELECT rowid AS _riga, * FROM compiti WHERE ${dove} AND rowid > ? ORDER BY rowid LIMIT ?`)
      .all(da, pezzo) as Record<string, unknown>[]
    for (const r of righe) {
      const { _riga, ...resto } = r
      da = Number(_riga)
      yield compitoDaRiga(resto)
    }
    if (righe.length < pezzo) return
  }
}

/** Ogni azione uscita da qui, a pezzi, dalla più vecchia: per il fascicolo. */
export function* azioniDelFascicolo(pezzo = 500): Generator<Azione> {
  let da = Number.MIN_SAFE_INTEGER
  for (;;) {
    const righe = db.prepare('SELECT rowid AS _riga, * FROM azioni WHERE rowid > ? ORDER BY rowid LIMIT ?')
      .all(da, pezzo) as Record<string, unknown>[]
    for (const r of righe) {
      const { _riga, ...resto } = r
      da = Number(_riga)
      yield resto as unknown as Azione
    }
    if (righe.length < pezzo) return
  }
}

/**
 * Svuota la mente. Anche la memoria: le convinzioni sono parte di quello che
 * Myynd sa di te, e lasciarle in piedi dopo un azzeramento significherebbe che
 * cancellare i documenti non cancella le conclusioni che ne aveva tratto.
 * Le sessioni restano: non è il momento di buttare fuori chi ha appena chiesto.
 */
export function azzeraTutto() {
  db.exec(`
    DELETE FROM documenti; DELETE FROM feed;
    DELETE FROM messaggi; DELETE FROM chat;
    DELETE FROM convinzioni; DELETE FROM blocchi; DELETE FROM domande;
    DELETE FROM compiti; DELETE FROM cursori; DELETE FROM progetti;
  `)
  // e le tabelle nate dalla 48 in poi: sono tutte cose sue — quello che ha
  // guardato, quello che Myynd ha previsto, le prove, la salute delle fonti
  for (const t of Object.keys(TABELLE)) db.exec(`DELETE FROM ${t}`)
  /*
   * E non `DELETE FROM ricerca`.
   *
   * Su una tabella a contenuto esterno quella riga non svuota niente di
   * sensato: l'FTS non ha più il testo con cui togliere i termini, e il
   * contenuto da cui rileggerlo l'abbiamo appena cancellato. I trigger hanno
   * già fatto il lavoro riga per riga; 'delete-all' è il comando fatto per
   * questo, e chiude anche il caso di un indice rimasto con dentro qualcosa
   * che nel contenuto non c'era.
   */
  db.exec("INSERT INTO ricerca (ricerca) VALUES ('delete-all')")
}

export default db
