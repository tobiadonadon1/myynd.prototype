// L'indice locale: un file SQLite in ~/.myynd/mente.db.
// Usa il modulo `node:sqlite` incluso in Node — nessuna dipendenza nativa.

import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { existsSync, mkdirSync, chmodSync, copyFileSync, openSync, readSync, closeSync, readdirSync, rmSync } from 'node:fs'
import { cartella } from './config.ts'
import { radici, radice, termini } from './lingua.ts'

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

function mio(): DatabaseSync {
  const dove = cartella()
  ultimoUso.set(dove, Date.now())
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

/** Da usare quando si finisce con una persona: chiude e libera. */
export function chiudiIndici() {
  for (const d of aperti.values()) { try { d.close() } catch { /* già chiuso */ } }
  aperti.clear()
}

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
    d.exec(`
      ALTER TABLE documenti ADD COLUMN filo TEXT;
      CREATE INDEX IF NOT EXISTS idx_doc_filo ON documenti(filo);
    `)
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
  }

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
  // Le due più recenti bastano a tornare indietro. Le altre sono copie intere
  // dell'indice che nessuno riaprirà: a ogni cambio di schema il disco raddoppiava.
  try {
    const vecchie = readdirSync(dove).filter(n => /^mente-.*\.db$/.test(n)).sort()
    for (const n of vecchie.slice(0, Math.max(0, vecchie.length - 2))) rmSync(join(dove, n), { force: true })
  } catch { /* le istantanee sono un aiuto, non un requisito */ }
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
  if (versione === MIGRAZIONI.length) return

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
}

/*
 * Le sette istruzioni della scrittura dei documenti, preparate quando servono.
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
  selRid: ReturnType<DatabaseSync['prepare']>
  selEsistente: ReturnType<DatabaseSync['prepare']>
  selFts: ReturnType<DatabaseSync['prepare']>
  insDoc: ReturnType<DatabaseSync['prepare']>
  updDoc: ReturnType<DatabaseSync['prepare']>
  updFilo: ReturnType<DatabaseSync['prepare']>
  delFts: ReturnType<DatabaseSync['prepare']>
  insFts: ReturnType<DatabaseSync['prepare']>
}

const istruzioni = new WeakMap<DatabaseSync, Istruzioni>()

function istr(): Istruzioni {
  const d = mio()
  let i = istruzioni.get(d)
  if (i) return i
  i = {
    selRid: d.prepare('SELECT rid FROM documenti WHERE id = ?'),
    selEsistente: d.prepare(
      'SELECT rid, titolo, corpo, autore, percorso, quando, gruppo, filo FROM documenti WHERE id = ?'
    ),
    /** C'è la riga corrispondente nell'indice full-text? Serve a non saltare un documento rotto. */
    selFts: d.prepare('SELECT 1 FROM ricerca WHERE rowid = ?'),
    insDoc: d.prepare(`
      INSERT INTO documenti (id, fonte, tipo, titolo, corpo, autore, percorso, quando, gruppo, filo, indicizzato)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `),
    updDoc: d.prepare(`
      UPDATE documenti SET titolo=?, corpo=?, autore=?, percorso=?, quando=?, gruppo=?, filo=?, indicizzato=?
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
     */
    updFilo: d.prepare('UPDATE documenti SET filo = ? WHERE rid = ?'),
    delFts: d.prepare('DELETE FROM ricerca WHERE rowid = ?'),
    insFts: d.prepare('INSERT INTO ricerca (rowid, titolo, corpo, autore, radici) VALUES (?,?,?,?,?)')
  }
  istruzioni.set(d, i)
  return i
}

/** Quanto è cambiato davvero in una lettura. */
export type EsitoScrittura = { nuovi: number; cambiati: number; invariati: number }

/**
 * Scrive i documenti, e tocca solo quelli che sono cambiati davvero.
 *
 * Prima riscriveva tutto, sempre. Ogni rilettura — e ce n'è una ogni sei ore —
 * aggiornava ogni riga e rifaceva l'indice full-text di ogni documento:
 * `delFts` più `insFts` su tutto il corpo di tutti i file, anche quando sul
 * disco non si era mosso niente. Su duemilaseicento documenti è un lavoro
 * inutile che si ripete quattro volte al giorno.
 *
 * Ma il danno vero non era la fatica: era che `indicizzato` finiva per dire
 * «l'ultima volta che ho guardato» invece di «l'ultima volta che è cambiato».
 * Con quella colonna azzerata di continuo non c'era modo di sapere cosa fosse
 * *arrivato* — ed è esattamente la domanda a cui bisogna saper rispondere
 * perché il feed si aggiorni da solo quando compare un file nuovo sul Mac.
 * Adesso `indicizzato` è una data di nascita o di modifica, e ci si può contare.
 */
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
        filo: string | null
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
        // sull'indice non è pignoleria — senza, un documento la cui riga FTS
        // fosse andata persa non tornerebbe più cercabile, e sarebbe invisibile
        // per sempre restando lì a farsi contare.
        if (uguale && istr().selFts.get(gia.rid)) {
          // il filo non è contenuto: si aggiorna senza far passare il documento
          // per «cambiato» (vedi `updFilo`)
          if (gia.filo !== (d.filo ?? null)) istr().updFilo.run(d.filo ?? null, gia.rid)
          esito.invariati++
          continue
        }

        istr().updDoc.run(d.titolo, d.corpo, d.autore ?? null, d.percorso ?? null, d.quando ?? null, d.gruppo ?? null, d.filo ?? null, ora, gia.rid)
        istr().delFts.run(gia.rid)
        istr().insFts.run(gia.rid, d.titolo, d.corpo, d.autore ?? '', radici(`${d.titolo} ${d.corpo} ${d.autore ?? ''}`))
        esito.cambiati++
        continue
      }

      const r = istr().insDoc.run(d.id, d.fonte, d.tipo, d.titolo, d.corpo, d.autore ?? null, d.percorso ?? null, d.quando ?? null, d.gruppo ?? null, d.filo ?? null, ora)
      const rid = Number(r.lastInsertRowid)
      istr().insFts.run(rid, d.titolo, d.corpo, d.autore ?? '', radici(`${d.titolo} ${d.corpo} ${d.autore ?? ''}`))
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
export function appenaArrivati(dal: string, limite = 30): Documento[] {
  return db.prepare(`
    SELECT * FROM documenti WHERE indicizzato >= ?
    ORDER BY indicizzato DESC, quando DESC LIMIT ?
  `).all(dal, limite) as unknown as Documento[]
}

/** Toglie tutto quello che è arrivato da una fonte (quando la scolleghi). */
/** Le voci del feed che puntavano a un documento sparito smettono di prometterlo. */
function scollegaDalFeed(ids: string[]) {
  if (!ids.length) return
  const upd = db.prepare('UPDATE feed SET doc = NULL WHERE doc = ?')
  for (const id of ids) upd.run(id)
}

export function svuotaFonte(fonte: string) {
  const righe = db.prepare('SELECT rid, id FROM documenti WHERE fonte = ?').all(fonte) as { rid: number; id: string }[]
  db.exec('BEGIN')
  try {
    for (const { rid } of righe) istr().delFts.run(rid)
    scollegaDalFeed(righe.map(r => r.id))
    db.prepare('DELETE FROM documenti WHERE fonte = ?').run(fonte)
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
  const trova = db.prepare('SELECT rid FROM documenti WHERE id = ?')
  const del = db.prepare('DELETE FROM documenti WHERE rid = ?')
  let n = 0
  db.exec('BEGIN')
  try {
    scollegaDalFeed(ids)
    for (const id of ids) {
      const r = trova.get(id) as { rid: number } | undefined
      if (!r) continue
      istr().delFts.run(r.rid); del.run(r.rid); n++
    }
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
    for (const m of morti) { istr().delFts.run(m.rid); del.run(m.rid) }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  return morti.length
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
export function cerca(q: string, limite = 20, fonti?: string[]): Documento[] {
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
  /**
   * Per la query di ripiego, dove i segnaposto sono numerati.
   *
   * Numerati e anonimi non si mescolano: `?1` due volte e poi un `?` fa
   * ripartire il conto da dove crede SQLite, e i valori finiscono nei posti
   * sbagliati — o, come è successo qui, la prepare muore con «column index out
   * of range». Il testo cercato compare due volte (titolo e corpo) e per quello
   * serve `?1`; da lì in poi si numera tutto a mano.
   */
  const recintoN = dentro.length
    ? ` AND d.fonte IN (${dentro.map((_, i) => `?${i + 3}`).join(',')})`
    : ''

  // ogni parola vale se compare come radice o come prefisso letterale: la
  // radice prende il plurale, il prefisso prende i nomi propri e i codici
  const clausola = (t: string) => `(radici:"${radice(t)}" OR "${t}"*)`
  const pesi = 'bm25(ricerca, 5.0, 1.0, 0.5, 1.0)'

  const conQuery = (match: string): (Documento & { punti: number })[] => {
    try {
      return db.prepare(`
        SELECT d.*, ${pesi} AS punti FROM ricerca r JOIN documenti d ON d.rid = r.rowid
        WHERE ricerca MATCH ?${recinto} ORDER BY punti LIMIT ?
      `).all(match, ...dentro, limite * 3) as unknown as (Documento & { punti: number })[]
    } catch {
      return []
    }
  }

  // prima tutte le parole insieme; se stringe troppo, si allarga
  let trovati = conQuery(parole.map(clausola).join(' AND '))
  if (trovati.length < 5 && parole.length > 1) {
    const visti = new Set(trovati.map(d => d.id))
    for (const d of conQuery(parole.map(clausola).join(' OR '))) {
      if (!visti.has(d.id)) trovati.push(d)
    }
  }

  if (!trovati.length) {
    // FTS non ha capito la domanda: un ultimo tentativo letterale, con i
    // jolly del testo cercato neutralizzati
    const like = '%' + q.replace(/[\\%_]/g, c => '\\' + c) + '%'
    return db.prepare(`
      SELECT * FROM documenti d
      WHERE (d.titolo LIKE ?1 ESCAPE '\\' OR d.corpo LIKE ?1 ESCAPE '\\')${recintoN}
      LIMIT ?2
    `).all(like, limite, ...dentro) as unknown as Documento[]
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
  return db.prepare('SELECT * FROM documenti ORDER BY quando DESC LIMIT ?').all(limite) as unknown as Documento[]
}

export function documento(id: string): Documento | null {
  return (db.prepare('SELECT * FROM documenti WHERE id = ?').get(id) as unknown as Documento) ?? null
}

// — quanto è costato —

export type Uso = { lavoro: string; motore: string; entrata: number; cache: number; uscita: number }

export function segnaUso(u: Uso) {
  db.prepare('INSERT INTO uso (quando, lavoro, motore, entrata, cache, uscita) VALUES (?,?,?,?,?,?)')
    .run(new Date().toISOString(), u.lavoro, u.motore, u.entrata, u.cache, u.uscita)
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
    SELECT * FROM documenti WHERE filo = ?${fuori}
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
    WHERE ${dove}
    ORDER BY m.quando DESC LIMIT ?
  `).all(...valori, limite) as { chat: string; titolo: string; ruolo: string; testo: string; quando: string }[]
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
  // Un `doc` che non corrisponde a nessuna riga è un bottone «apri» che non
  // aprirà mai niente. Si azzera *prima* di `idFeed`, che sull'id del documento
  // ci calcola l'identità della voce: correggerlo dopo vorrebbe dire una voce
  // con un nome e un contenuto che non si parlano.
  const esiste = db.prepare('SELECT 1 FROM documenti WHERE id = ?')
  const puliti = items.map(i => ({ ...i, doc: i.doc && esiste.get(i.doc) ? i.doc : undefined }))
  db.exec('BEGIN')
  try {
    for (const i of puliti) {
      ins.run(idFeed(i), i.tipo, i.titolo, i.testo, i.urgenza ?? null, i.fonte ?? null, i.doc ?? null, ora)
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
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
export function cambiaStatoFeed(id: string, stato: string, motivo?: string) {
  const ora = new Date().toISOString()
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
    db.prepare('UPDATE feed SET stato = ?, risposto = ? WHERE id = ?').run(stato, ora, id)
    return
  }
  db.prepare('UPDATE feed SET stato = ?, motivo = ?, risposto = ? WHERE id = ?')
    .run(stato, motivo, new Date().toISOString(), id)
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
  return db.prepare(`
    SELECT titolo, stato, motivo FROM feed
    WHERE stato != 'aperto' ORDER BY COALESCE(risposto, quando) DESC LIMIT ?
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
export function salvaNotizie(n: Omit<Notizia, 'presa' | 'letta' | 'scartata'>[]) {
  if (!n.length) return
  const ins = db.prepare(`
    INSERT INTO notizie (id, titolo, riassunto, perche, fonte, link, argomento, quando, presa)
    VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      titolo=excluded.titolo, riassunto=excluded.riassunto, perche=excluded.perche,
      argomento=excluded.argomento, presa=excluded.presa
  `)
  const ora = new Date().toISOString()
  db.exec('BEGIN')
  try {
    for (const x of n) {
      ins.run(x.id, x.titolo, x.riassunto, x.perche ?? null, x.fonte, x.link, x.argomento, x.quando, ora)
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
  return db.prepare(
    'SELECT * FROM notizie WHERE presa >= ? AND scartata IS NULL ORDER BY presa DESC, quando DESC'
  ).all(soglia) as unknown as Notizia[]
}

/**
 * Quelle che hai buttato via, e che non devono tornare.
 *
 * Restano nell'indice apposta: sparire dal database vorrebbe dire che la
 * rassegna di domani le ripesca dal feed e te le rimette davanti. Una riga che
 * resta è l'unico modo che ha una cosa di non tornare.
 */
export function notizieScartate(giorni = 30): string[] {
  const soglia = new Date(Date.now() - giorni * 86_400_000).toISOString()
  return (db.prepare('SELECT id FROM notizie WHERE presa >= ? AND scartata IS NOT NULL')
    .all(soglia) as { id: string }[]).map(r => r.id)
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
  return db.prepare(
    'SELECT * FROM notizie WHERE presa >= ? AND (letta IS NOT NULL OR scartata IS NOT NULL)'
  ).all(soglia) as unknown as Notizia[]
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
  const vecchie = new Date(Date.now() - giorni * 3 * 86_400_000).toISOString()
  const r = db.prepare(
    'DELETE FROM notizie WHERE (scartata IS NULL AND presa < ?) OR presa < ?'
  ).run(soglia, vecchie)
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
  }
}

// — compiti —
//
// Il feed nasce dai documenti e muore quando gli rispondi. Un compito nasce da
// te e resta finché non è fatto. Tenerli separati è quello che impedisce alla
// lista di riempirsi di roba che non hai scritto tu — ed è la ragione per cui
// una voce del feed promossa a compito *chiude* la voce invece di duplicarla.

export type Compito = {
  id: string
  testo: string
  nota: string | null
  quando: string
  stato: string
  modo: string
  ordine: string
  origine: string
  voce: string | null
  doc: string | null
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
}

/** Quello che una riga nata da un'automazione ha il permesso di aprire. */
export type Concessione = { nomi: string[]; cartella?: string | null }

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

function compitoDaRiga(r: Record<string, unknown>): Compito {
  return {
    ...r,
    fonti: r.fonti ? JSON.parse(String(r.fonti)) : null,
    proposta: r.proposta ? JSON.parse(String(r.proposta)) : null,
    chieste: r.chieste ? JSON.parse(String(r.chieste)) : null,
    attrezzi: r.attrezzi ? JSON.parse(String(r.attrezzi)) : null
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
  ordine: string; origine?: string; voce?: string | null; doc?: string | null
  attrezzi?: Concessione | null
}) {
  const ora = new Date().toISOString()
  db.prepare(`
    INSERT INTO compiti (id, testo, nota, quando, stato, ordine, origine, voce, doc, attrezzi, creato, aggiornato)
    VALUES (?,?,?,?,'aperto',?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      testo      = excluded.testo,
      quando     = excluded.quando,
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
    c.id, c.testo, c.nota ?? null, c.quando ?? 'oggi', c.ordine,
    c.origine ?? 'mano', c.voce ?? null, c.doc ?? null,
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
}) {
  const campi: string[] = []
  const valori: (string | null)[] = []
  // `undefined` è «non toccare», `null` è «svuota»: sono due cose diverse e la
  // differenza si perde se si passa tutto per una stessa condizione
  if (c.testo !== undefined) { campi.push('testo = ?'); valori.push(c.testo) }
  if (c.nota !== undefined) { campi.push('nota = ?'); valori.push(c.nota) }
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
    UPDATE compiti SET proposta = ?, risultato = ?, stato = 'pronto',
      aggiornato = ?, versione = versione + 1
    WHERE id = ?
  `).run(JSON.stringify(p), riassunto, new Date().toISOString(), id)
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
    UPDATE compiti SET risultato = NULL, fonti = NULL, chiesto = NULL, aggiornato = ?, versione = versione + 1
    WHERE id = ?
  `).run(ora, id)
}

export function cambiaStatoCompito(id: string, stato: string, esito?: string) {
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

/** Il compito passa a Myynd: da qui in poi l'attesa è sua. */
export function affidaCompito(id: string, modo: string) {
  const ora = new Date().toISOString()
  db.prepare(`
    UPDATE compiti SET stato = 'delegato', modo = ?, chiesto = ?, guaio = NULL, aggiornato = ?, versione = versione + 1
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
    UPDATE compiti SET stato = ?, risultato = ?, fonti = ?, guaio = NULL, aggiornato = ?, versione = versione + 1
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
  const righe = db.prepare(`
    SELECT d.rid, d.id, d.titolo, d.gruppo, d.fonte, d.quando, r.radici
    FROM documenti d JOIN ricerca r ON r.rowid = d.rid
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

export function apriDomanda(d: { tema: string; testo: string; spunto: string[] }): Domanda | null {
  // il solo tempo non basta: due domande nello stesso millisecondo avrebbero
  // lo stesso id e la seconda sparirebbe in silenzio dentro il catch qui sotto
  const id = 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  try {
    db.prepare(`INSERT INTO domande (id, tema, testo, spunto, stato, creata) VALUES (?,?,?,?, 'aperta', ?)`)
      .run(id, d.tema, d.testo, JSON.stringify(d.spunto), new Date().toISOString())
  } catch {
    return null   // il tema era già stato chiesto: l'UNIQUE ha fatto il suo lavoro
  }
  return domandaAperta()
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
  db.exec('BEGIN')
  try {
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
  return id
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

/** Quello che vale adesso, il più solido per primo. */
export function convinzioni(ambito?: string): Convinzione[] {
  const righe = (ambito
    ? db.prepare('SELECT * FROM convinzioni WHERE al IS NULL AND ambito = ? ORDER BY fiducia DESC, creata DESC').all(ambito)
    : db.prepare('SELECT * FROM convinzioni WHERE al IS NULL ORDER BY fiducia DESC, creata DESC').all()
  ) as Record<string, unknown>[]
  return righe.map(daRigaConvinzione)
}

/** Anche quelle scadute: serve a rispondere «da quando hai cambiato idea?». */
export function convinzioniStoriche(): Convinzione[] {
  const righe = db.prepare('SELECT * FROM convinzioni WHERE al IS NOT NULL ORDER BY al DESC').all() as Record<string, unknown>[]
  return righe.map(daRigaConvinzione)
}

/** Cancellare a mano è un diritto: è la sua testa, deve poterci mettere le mani. */
export function scordaConvinzione(id: string) {
  db.prepare('DELETE FROM convinzioni WHERE id = ?').run(id)
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
}

/** Un giro, com'è andato. */
export type Giro = { quando: string; esito: string; quanti: number }

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
export function automazioneGirata(id: string, esito: string, guaio?: string, quanti = 0) {
  const ora = new Date().toISOString()
  const prima = storiaDi(statoAutomazione(id))
  const storia = JSON.stringify([...prima, { quando: ora, esito, quanti }].slice(-GIRI))
  db.prepare(`
    INSERT INTO automazioni (id, ultima, quante, esito, guaio, storia) VALUES (?,?,1,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      ultima = excluded.ultima,
      quante = automazioni.quante + 1,
      esito  = excluded.esito,
      guaio  = excluded.guaio,
      storia = excluded.storia
  `).run(id, ora, esito, guaio ?? null, storia)
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
 */
export function indirizzoConosciuto(indirizzo: string): boolean {
  const pulito = indirizzo.trim().toLowerCase()
  if (!pulito.includes('@')) return false
  const r = db.prepare(`
    SELECT 1 FROM documenti
    WHERE LOWER(autore) LIKE ?1 OR LOWER(corpo) LIKE ?1
    LIMIT 1
  `).get(`%${pulito}%`)
  return !!r
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

/**
 * Svuota la mente. Anche la memoria: le convinzioni sono parte di quello che
 * Myynd sa di te, e lasciarle in piedi dopo un azzeramento significherebbe che
 * cancellare i documenti non cancella le conclusioni che ne aveva tratto.
 * Le sessioni restano: non è il momento di buttare fuori chi ha appena chiesto.
 */
export function azzeraTutto() {
  db.exec(`
    DELETE FROM documenti; DELETE FROM ricerca; DELETE FROM feed;
    DELETE FROM messaggi; DELETE FROM chat;
    DELETE FROM convinzioni; DELETE FROM blocchi; DELETE FROM domande;
    DELETE FROM compiti;
  `)
}

export default db
