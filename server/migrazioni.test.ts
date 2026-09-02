// Le migrazioni contro la riparazione automatica.
//
// `rimetti()` esiste per un guasto vero: una migrazione infilata in mezzo alla
// lista che su un database già a quel numero salta senza dire niente. Rimette
// le colonne che il codice dà per scontate, e lo fa all'apertura di ogni indice.
//
// Il 2 settembre 2026, un'ora dopo essere stata scritta, ha reso impossibile
// aprire un indice vero. Girava **prima** delle migrazioni ancora da fare: su
// un database fermo alla versione 20 aggiungeva `documenti.filo`, poi toccava
// alla migrazione 21 → 22 che la aggiunge anche lei, «duplicate column name:
// filo», transazione annullata, indice chiuso. Il database restava a 20 con la
// colonna già dentro, cioè in uno stato da cui non usciva più nemmeno
// riavviando.
//
// La prova gira in due processi perché è l'unico modo onesto di provarla: il
// percorso dei dati si legge quando il modulo si carica, e un solo processo non
// può aprire due case diverse. Il primo fa nascere un indice completo, poi lo si
// riporta indietro a mano com'era quel giorno, e il secondo deve riuscire ad
// aprirlo.
//
//   node --test server/migrazioni.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-migrazioni-'))
const MENTE = join(CASA, 'mente.db')

after(() => rmSync(CASA, { recursive: true, force: true }))

/** Un processo a parte, con la sua casa, che apre l'indice e dice com'è andata. */
function apriInUnAltroProcesso(): { versione: number; colonne: string[]; guai: string } {
  const codice = `
    const store = await import(${JSON.stringify(new URL('./store.ts', import.meta.url).href)})
    const d = store.default
    const v = d.prepare('PRAGMA user_version').get().user_version
    const c = d.prepare('PRAGMA table_info(documenti)').all().map(x => x.name)
    console.log('ESITO' + JSON.stringify({ versione: v, colonne: c }))
  `
  const fuori = execFileSync(process.execPath, ['--input-type=module', '--disable-warning=ExperimentalWarning', '-e', codice], {
    env: { ...process.env, MYYND_DATI: CASA },
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
  })
  const riga = fuori.split('\n').find(r => r.startsWith('ESITO'))
  assert.ok(riga, `il processo non ha detto niente:\n${fuori}`)
  return { ...JSON.parse(riga.slice(5)) as { versione: number; colonne: string[] }, guai: fuori }
}

test('un indice riportato indietro con le colonne già dentro si apre lo stesso', () => {
  // 1. un indice nuovo, portato in fondo alle migrazioni dal codice vero
  const primo = apriInUnAltroProcesso()
  assert.ok(existsSync(MENTE))
  assert.ok(primo.colonne.includes('filo'))
  assert.ok(primo.colonne.includes('inviato'))
  const testa = primo.versione

  /*
   * 2. lo stato del 2 settembre: la versione com'era prima delle ultime
   *    migrazioni, e le colonne che la riparazione aveva già messo. È
   *    esattamente il database che non si apriva più.
   */
  const db = new DatabaseSync(MENTE)
  db.exec('PRAGMA user_version = 20')
  db.close()

  // 3. si riapre. Deve arrivare in fondo senza inciampare sulle colonne che ci sono già.
  const secondo = apriInUnAltroProcesso()
  assert.doesNotMatch(secondo.guai, /duplicate column name/, 'la migrazione è inciampata su una colonna già messa')
  assert.doesNotMatch(secondo.guai, /non riesco ad aprire/, 'l’indice non si è aperto')
  assert.equal(secondo.versione, testa, 'l’indice non è arrivato in fondo alle migrazioni')
  assert.ok(secondo.colonne.includes('filo'))
  assert.ok(secondo.colonne.includes('inviato'))
})

test('e una colonna tolta a mano torna al giro dopo', () => {
  /*
   * L'altra metà: la riparazione deve continuare a riparare. Si toglie una
   * colonna a un indice già in fondo — che è il buco vero: `user_version`
   * giusta, colonna assente, nessun errore — e alla riapertura deve tornare.
   *
   * SQLite sa togliere una colonna solo se non è dentro un indice: `filo` lo è,
   * quindi si prova con `inviato`, che è l'altra che `rimetti()` conosce.
   */
  const db = new DatabaseSync(MENTE)
  db.exec('ALTER TABLE documenti DROP COLUMN inviato')
  assert.ok(!(db.prepare('PRAGMA table_info(documenti)').all() as { name: string }[]).some(c => c.name === 'inviato'))
  db.close()

  const terzo = apriInUnAltroProcesso()
  assert.ok(terzo.colonne.includes('inviato'), 'la colonna tolta non è stata rimessa')
})
