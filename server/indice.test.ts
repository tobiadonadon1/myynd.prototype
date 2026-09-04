// L'indice di ricerca che smette di tenere una copia del testo.
//
// `ricerca` teneva la sua copia di titolo, corpo e autore, più le radici che
// non stavano da nessun'altra parte: il testo scritto quattro volte, su un
// volume che si paga a gigabyte. Adesso è una tabella a contenuto esterno —
// legge le colonne da `documenti` quando le servono — e `radici` è una colonna
// vera.
//
// Il passaggio da uno schema all'altro è la parte che può far male: gira una
// volta sola, su un database pieno, e se sbaglia lo scopre chi apre l'app e
// non trova più niente. Questa prova costruisce un indice al *vecchio* schema
// e poi lo fa aprire dal codice vero, in un altro processo, come succederebbe
// a chi aggiorna.
//
// Due processi perché è l'unico modo onesto: il percorso dei dati si legge
// quando il modulo si carica, e un processo solo non può aprire due case.
//
//   node --test server/indice.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-indice-'))
const MENTE = join(CASA, 'mente.db')
const STORE = JSON.stringify(new URL('./store.ts', import.meta.url).href)

after(() => rmSync(CASA, { recursive: true, force: true }))

/** Un processo a parte, con la sua casa, che apre l'indice e dice com'è andata. */
function inUnAltroProcesso(codice: string): { esito: Record<string, unknown>; guai: string } {
  const fuori = execFileSync(
    process.execPath,
    ['--input-type=module', '--disable-warning=ExperimentalWarning', '-e', codice],
    { env: { ...process.env, MYYND_DATI: CASA }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  )
  const riga = fuori.split('\n').find(r => r.startsWith('ESITO'))
  assert.ok(riga, `il processo non ha detto niente:\n${fuori}`)
  return { esito: JSON.parse(riga.slice(5)) as Record<string, unknown>, guai: fuori }
}

/** Il materiale: uno che si trova per plurale, uno per pezzo di codice, uno per indirizzo. */
const RIEMPI = `
  const store = await import(${STORE})
  store.salvaDocumenti([
    { id: 'a', fonte: 'posta', tipo: 'email', titolo: 'Fattura di settembre',
      corpo: 'La fattura del cliente Rossi, da saldare entro venerdì.',
      autore: 'Mario Rossi <mario.rossi@esempio.it>', percorso: 'INBOX',
      quando: '2026-02-01T00:00:00.000Z', gruppo: 'posta' },
    { id: 'b', fonte: 'posta', tipo: 'email', titolo: 'Bonifico',
      corpo: 'Accreditare su IT60X0542811101000000123456 entro venerdì.',
      autore: 'Banca <banca@esempio.it>', percorso: 'INBOX',
      quando: '2026-02-02T00:00:00.000Z', gruppo: 'posta' },
    { id: 'c', fonte: 'desktop', tipo: 'file', titolo: 'Collaudo del ponteggio',
      corpo: 'Verbale di collaudo, cantiere di via Verdi.', autore: null,
      percorso: '/prova/c', quando: '2026-02-03T00:00:00.000Z', gruppo: 'documenti' }
  ])
  console.log('ESITO' + JSON.stringify({
    versione: store.default.prepare('PRAGMA user_version').get().user_version
  }))
`

/** Quello che si chiede all'indice dopo, e che deve rispondere come prima. */
const INTERROGA = `
  const store = await import(${STORE})
  const d = store.default
  console.log('ESITO' + JSON.stringify({
    versione: d.prepare('PRAGMA user_version').get().user_version,
    colonne: d.prepare('PRAGMA table_info(documenti)').all().map(x => x.name),
    trigger: d.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all().map(x => x.name),
    documenti: d.prepare('SELECT COUNT(*) AS n FROM documenti').get().n,
    nellIndice: store.perProva.documentiNellIndice(),
    plurale: store.cerca('fatture').map(x => x.id),
    pezzo: store.cerca('0542811101').map(x => x.id),
    parola: store.cerca('collaudo').map(x => x.id),
    conosciuto: store.indirizzoConosciuto('mario.rossi@esempio.it'),
    citato: store.indirizzoConosciuto('banca@esempio.it'),
    sconosciuto: store.indirizzoConosciuto('nessuno@altrove.it')
  }))
`

/**
 * L'indice riportato allo schema di prima: l'FTS con dentro la sua copia del
 * testo, e `documenti` senza le due colonne nuove. È il database che ha in mano
 * chi non ha ancora aggiornato.
 */
function riportaIndietro() {
  const db = new DatabaseSync(MENTE)
  for (const t of ['ricerca_dopo_inserimento', 'ricerca_dopo_cancellazione', 'ricerca_dopo_modifica']) {
    db.exec(`DROP TRIGGER IF EXISTS ${t}`)
  }
  db.exec('DROP TABLE IF EXISTS ricerca_istanze')
  db.exec('DROP TABLE IF EXISTS ricerca_termini')
  db.exec('DROP TABLE IF EXISTS ricerca')
  db.exec(`
    CREATE VIRTUAL TABLE ricerca USING fts5(
      titolo, corpo, autore, radici,
      tokenize = "unicode61 remove_diacritics 2"
    )
  `)
  // la vecchia teneva il testo dentro di sé: si versa com'era
  db.exec(`
    INSERT INTO ricerca (rowid, titolo, corpo, autore, radici)
    SELECT rid, titolo, corpo, COALESCE(autore, ''), COALESCE(radici, '') FROM documenti
  `)
  db.exec('DROP INDEX IF EXISTS idx_doc_autore_indirizzo')
  db.exec('ALTER TABLE documenti DROP COLUMN autoreIndirizzo')
  db.exec('ALTER TABLE documenti DROP COLUMN radici')
  db.exec('PRAGMA user_version = 28')
  db.close()
}

test('un indice al vecchio schema arriva in fondo e risponde come prima', () => {
  const primo = inUnAltroProcesso(RIEMPI)
  assert.ok(existsSync(MENTE))
  const testa = primo.esito.versione as number

  // com'era prima: quello che si trovava allora si deve trovare anche dopo
  const prima = inUnAltroProcesso(INTERROGA).esito
  assert.deepEqual(prima.plurale, ['a'], 'la ricerca per plurale non funzionava nemmeno prima')
  assert.deepEqual(prima.pezzo, ['b'], 'il pezzo di IBAN non si trovava nemmeno prima')

  riportaIndietro()
  const db = new DatabaseSync(MENTE)
  const colonne = (db.prepare('PRAGMA table_info(documenti)').all() as { name: string }[]).map(c => c.name)
  db.close()
  assert.ok(!colonne.includes('radici'), 'il vecchio schema non è stato ricostruito')

  const dopo = inUnAltroProcesso(INTERROGA)
  assert.doesNotMatch(dopo.guai, /non riesco ad aprire/, 'l’indice non si è aperto')
  const e = dopo.esito
  assert.equal(e.versione, testa, 'la migrazione non è arrivata in fondo')
  assert.ok((e.colonne as string[]).includes('radici'), 'manca la colonna che l’indice legge')
  assert.ok((e.colonne as string[]).includes('autoreIndirizzo'))
  assert.equal((e.trigger as string[]).length, 3, 'i trigger che tengono l’indice in piedi non ci sono')

  assert.equal(e.documenti, 3)
  assert.equal(e.nellIndice, 3, 'l’indice non è stato rifatto per tutti i documenti')
  assert.deepEqual(e.plurale, ['a'], 'le radici non sono state ricalcolate: la ricerca non piega più i plurali')
  assert.deepEqual(e.pezzo, ['b'], 'il vocabolario non è stato rifatto: il pezzo di codice non si trova più')
  assert.deepEqual(e.parola, ['c'])
  assert.equal(e.conosciuto, true, 'l’indirizzo di chi ha scritto non è stato ricavato dai documenti già dentro')
  assert.equal(e.citato, true)
  assert.equal(e.sconosciuto, false, 'dice di conoscere un indirizzo che non ha mai visto')
})

test('un indice vecchio con la versione giusta si rifà lo stesso', () => {
  /*
   * Il buco che questo file esiste per coprire: `user_version` dice che è
   * tutto a posto e l'indice è quello di prima. Succede se un giorno una
   * migrazione viene infilata *in mezzo* alla lista — su un database già a
   * quel numero tutte quelle dopo slittano di uno e ne salta una. È già
   * successo due volte qui dentro, e il segnale è sempre lo stesso: nessuno.
   *
   * Qui la ricerca smetterebbe di vedere tutto quello che entra da adesso in
   * avanti, senza un errore e senza una riga rossa.
   */
  const testa = inUnAltroProcesso(INTERROGA).esito.versione as number
  riportaIndietro()
  const db = new DatabaseSync(MENTE)
  db.exec(`PRAGMA user_version = ${testa}`)   // «tutto a posto», e non è vero
  db.close()

  const dopo = inUnAltroProcesso(INTERROGA).esito
  assert.equal((dopo.trigger as string[]).length, 3, 'i trigger non sono stati rimessi')
  assert.equal(dopo.nellIndice, 3, 'l’indice non è stato rifatto')
  assert.deepEqual(dopo.plurale, ['a'])
  assert.deepEqual(dopo.pezzo, ['b'])
})

test('prima di una migrazione si mette da parte una copia sola', () => {
  /*
   * Erano due, e la seconda non serviva a niente: si torna indietro allo stato
   * prima dell'aggiornamento che ha fatto danno, cioè al più recente. Intanto
   * ogni copia è l'indice intero, e su una casella vera sono gigabyte.
   */
  const dove = join(CASA, 'istantanee')
  const copie = () => readdirSync(dove).filter(n => /^mente-v\d+-.*\.db$/.test(n))
  assert.equal(copie().length, 1, `le istantanee tenute sono ${copie().length}`)

  // un altro giro di migrazioni: la copia resta una, ed è quella nuova
  riportaIndietro()
  inUnAltroProcesso(INTERROGA)
  assert.equal(copie().length, 1, 'le copie si accumulano: a ogni cambio di schema il disco raddoppia')
})
