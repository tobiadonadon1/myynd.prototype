// «Scarica tutti i miei dati» vuol dire tutti.
//
// Il fascicolo esportava documenti, lista, memoria, chat, automazioni, azioni
// e uso: mancavano il feed, i progetti, le domande, le notizie, il riferimento
// e i file che Myynd tiene accanto all'indice (il punto, le priorità…). E ogni
// tabella nuova rischiava di restarne fuori. Qui si semina un po' di tutto e si
// guarda che esca, e che le chiavi restino fuori anche dai file di stato.
//
//   node --test server/fascicolo.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-fascicolo-'))
process.env.MYYND_DATI = CASA

const cfg = await import('./config.ts')
const store = await import('./store.ts')
const progetti = await import('./progetti.ts')
const riferimento = await import('./riferimento.ts')
const fascicolo = await import('./fascicolo.ts')

before(() => {
  store.azzeraTutto()
  cfg.scrivi({ nome: 'Anna', lingua: 'en' })
  const ora = new Date().toISOString()
  for (const [id, stato] of [['v-aperta', 'aperto'], ['v-fatta', 'fatto'], ['v-scartata', 'scartato'], ['v-scaduta', 'scaduto']]) {
    store.default.prepare('INSERT INTO feed (id, tipo, titolo, testo, stato, quando, ragione) VALUES (?,?,?,?,?,?,?)')
      .run(id, 'Priorità', `Voce ${stato}`, 'testo', stato, ora, 'perché oggi')
  }
  const p = progetti.scrivi({ nome: 'Evermute', obiettivo: 'Ship 1.0' })
  progetti.chiudi(progetti.scrivi({ nome: 'Vecchio', obiettivo: 'Finito' }).id)
  store.apriDomanda({ tema: 'riferimento', testo: 'What are you working on?', spunto: [], progetto: p.id })
  store.salvaNotizie([{ id: 'n1', titolo: 'A headline', riassunto: 'r', perche: null, fonte: 'Giornale', link: 'https://x.test/1', argomento: 'mondo', quando: ora }])
  store.segnaNotiziaScartata('n1')
  riferimento.scrivi('Evermute: shipping 1.0 this week.')
  store.default.prepare("INSERT INTO segnali (id, genere, quando, giorno, valore) VALUES ('s1', 'apertura', ?, '2026-09-24', 1)").run(ora)
  store.default.prepare("INSERT INTO previsioni (id, giorno, genere, ref, probabilita, dati, fatta) VALUES ('p1', '2026-09-24', 'risposta', 'posta:1', 0.7, '{}', ?)").run(ora)
  // un file di stato con dentro, per sbaglio, qualcosa che ha la forma di una chiave
  writeFileSync(join(CASA, 'punto.json'), JSON.stringify({ testo: 'Il punto di oggi', token: 'segreto-nel-punto' }))
  writeFileSync(join(CASA, 'rotto.json'), '{non è json')
})
after(() => { store.chiudiIndici(); rmSync(CASA, { recursive: true, force: true }) })

const tutto = () => JSON.parse([...fascicolo.scrivi([])].join('')) as Record<string, unknown>

test('il feed esce in tutti i suoi stati, con le colonne nuove', () => {
  const f = tutto()
  const feed = (f.tabelle as Record<string, { id: string; stato: string; ragione: string }[]>).feed
  assert.deepEqual(feed.map(v => v.stato).sort(), ['aperto', 'fatto', 'scaduto', 'scartato'])
  assert.equal(feed[0].ragione, 'perché oggi')
})

test('progetti (anche chiusi), domande, notizie e riferimento ci sono', () => {
  const f = tutto()
  assert.deepEqual((f.progetti as { nome: string; stato: string }[]).map(p => `${p.nome}:${p.stato}`).sort(), ['Evermute:attivo', 'Vecchio:chiuso'])
  const t = f.tabelle as Record<string, Record<string, unknown>[]>
  assert.equal(t.domande.length, 1)
  assert.equal(t.notizie.length, 1)
  assert.ok(t.notizie[0].scartata, 'la notizia scartata è un giudizio suo: deve uscire')
  assert.equal((f.riferimento as { testo: string }).testo, 'Evermute: shipping 1.0 this week.')
})

test('le tabelle nuove ci sono tutte, anche vuote, e con le loro righe', () => {
  const t = tutto().tabelle as Record<string, Record<string, unknown>[]>
  for (const nome of Object.keys(store.perProva.schema().tabelle)) assert.ok(Array.isArray(t[nome]), `nel fascicolo manca la tabella ${nome}`)
  assert.deepEqual(t.segnali.map(r => r.id), ['s1'])
  assert.deepEqual(t.previsioni.map(r => r.ref), ['posta:1'])
  assert.deepEqual(t.sessioni_app, [])
})

test('i file di stato escono, senza le chiavi e senza la configurazione', () => {
  const testo = [...fascicolo.scrivi([])].join('')
  const file = (JSON.parse(testo) as { file: Record<string, unknown> }).file
  assert.equal((file['punto.json'] as { testo: string }).testo, 'Il punto di oggi')
  assert.ok(!testo.includes('segreto-nel-punto'), 'una chiave in un file di stato è uscita col fascicolo')
  assert.equal(file['rotto.json'], '[illeggibile / unreadable]', 'un file che non si legge deve dirlo, non sparire')
  assert.ok(!('config.json' in file), 'la configurazione esce già sopra, senza le chiavi: non una seconda volta intera')
})

test('righeDi esce a pezzi e non esporta tabelle fuori dall’elenco', () => {
  for (let i = 0; i < 7; i++) {
    store.default.prepare("INSERT INTO segnali (id, genere, quando, giorno) VALUES (?, 'x', '2026-09-24T00:00:00Z', '2026-09-24')").run(`t${i}`)
  }
  assert.equal([...store.righeDi('segnali', 3)].length, 8)
  // il contro-caso: una tabella che non è nell'elenco non esce, nemmeno chiedendola per nome
  assert.deepEqual([...store.righeDi('uso')], [])
  assert.deepEqual([...store.righeDi('sqlite_master')], [])
})

test('la lista e le azioni escono intere: nessun tetto sui chiusi, sui tolti o sulle azioni', () => {
  const ora = new Date().toISOString()
  const metti = store.default.prepare('INSERT INTO compiti (id, testo, stato, ordine, chiuso, sparito, creato, aggiornato) VALUES (?,?,?,?,?,?,?,?)')
  store.default.exec('BEGIN')
  {
    metti.run('c-aperto', 'Open one', 'aperto', 'a0', null, null, ora, ora)
    for (let i = 0; i < 1203; i++) metti.run(`c-fatto-${i}`, `Done ${i}`, i % 2 ? 'fatto' : 'lasciato', `b${i}`, ora, null, ora, ora)
    metti.run('c-strano', 'A state nobody lists', 'archiviato', 'c0', ora, null, ora, ora)
    // tolto un secolo fa: anche il vecchio tetto dei giorni l'avrebbe perso
    metti.run('c-tolto', 'Removed long ago', 'aperto', 'd0', null, '1920-01-01T00:00:00.000Z', ora, ora)
    for (let i = 0; i < 5012; i++) {
      store.default.prepare('INSERT INTO azioni (id, tipo, cosa, esito, quando) VALUES (?,?,?,?,?)').run(`a${i}`, 'email', `Mail ${i}`, 'fatta', ora)
    }
  }
  store.default.exec('COMMIT')
  try {
    const f = tutto()
    const c = f.compiti as Record<'aperti' | 'chiusi' | 'tolti', { id: string }[]>
    assert.ok(c.aperti.some(x => x.id === 'c-aperto'))
    assert.equal(c.chiusi.filter(x => x.id.startsWith('c-fatto-')).length, 1203)
    assert.ok(c.chiusi.some(x => x.id === 'c-strano'), 'un compito in uno stato non elencato è uscito dal fascicolo')
    assert.deepEqual(c.tolti.map(x => x.id), ['c-tolto'])
    // ogni riga una volta sola
    const tutti = [...c.aperti, ...c.chiusi, ...c.tolti].map(x => x.id)
    assert.equal(new Set(tutti).size, tutti.length)
    assert.equal((store.default.prepare('SELECT COUNT(*) AS n FROM compiti').get() as { n: number }).n, tutti.length)
    assert.equal((f.azioni as unknown[]).length, 5012)
  } finally {
    store.default.exec("DELETE FROM compiti WHERE id LIKE 'c-%'; DELETE FROM azioni")
  }
})
