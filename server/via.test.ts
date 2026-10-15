// Mentre non c'eri: i conti, il lavoro con la bandiera di visto, e il perché
// di quello che è stato messo da parte.
//
//   node --test server/via.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-via-'))
process.env.MYYND_DATI = join(CASA, 'dati')

const store = await import('./store.ts')
const cfg = await import('./config.ts')
const via = await import('./via.ts')
const mattina = await import('./mattina.ts')
const { segnaEsame } = await import('./feed-dati.ts')

before(() => { store.azzeraTutto() })
after(() => {
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

type C = import('./store.ts').Compito
const DAL = '2026-10-14T23:00:00.000Z'
const DOPO = '2026-10-15T03:00:00.000Z'
const PRIMA = '2026-10-14T18:00:00.000Z'
function carta(x: Partial<C> & { id: string }): C {
  return {
    testo: x.id, nota: null, quando: 'oggi', stato: 'aperto', modo: 'tutto', ordine: 'a', origine: 'mano', voce: null, doc: null,
    chiesto: null, risultato: 'Done.', fonti: null, guaio: null, creato: DAL, aggiornato: DOPO, chiuso: null, esito: null, sparito: null,
    versione: 1, proposta: null, chieste: null, attrezzi: null, email: null, ...x
  } as C
}

test('messo da parte: il perché in una parola, solo dove la lettura ha deciso che non valeva il suo tempo', () => {
  assert.equal(via.ragioneDaParte('regole', 'posta_in_serie'), 'in_serie')
  assert.equal(via.ragioneDaParte('regole', 'letta_senza_richiesta'), 'letta')
  assert.equal(via.ragioneDaParte('regole', 'mittente_archiviato_dalla_persona'), 'archiviato')
  assert.equal(via.ragioneDaParte('scartati', null), 'tacere')
  assert.equal(via.ragioneDaParte('non_suo', 'Nora'), 'non_tua')
  assert.equal(via.ragioneDaParte('modello', null), 'niente_da_fare')
  assert.equal(via.ragioneDaParte('verifica', 'senza_fonte'), 'non_regge')
  assert.equal(via.ragioneDaParte('posti', null), 'meno_urgente')
  // non messe da parte: diventate carte, già fatte, o andate nel punto
  for (const fase of ['carta', 'gia', 'risposto', 'gia_risposto', 'doppione', 'lingua']) assert.equal(via.ragioneDaParte(fase, null), null, fase)
  assert.equal(via.ragioneDaParte('regole', 'evento'), null, 'un evento va nel punto, non da parte')
  assert.equal(via.ragioneDaParte('regole', 'file_tecnico'), null)
})

test('i conti dell’esame: la sua posta mandata e i file tecnici non sono «letti»', () => {
  const c = via.contaEsame([
    { fase: 'carta', motivo: null },
    { fase: 'regole', motivo: 'posta_in_serie' },
    { fase: 'regole', motivo: 'posta_in_serie' },
    { fase: 'modello', motivo: null },
    { fase: 'regole', motivo: 'evento' },
    { fase: 'regole', motivo: 'gia_inviato' },
    { fase: 'regole', motivo: 'file_tecnico' },
    { fase: 'gia', motivo: null }
  ])
  assert.deepEqual(c, { letti: 6, daParte: 3 })
  assert.deepEqual(via.contaEsame([]), { letti: 0, daParte: 0 })
})

test('il lavoro da quando non c’era: file, bozze, Notion; la più recente prima, con visto e aspetta', () => {
  const xs = via.lavoriVia([
    carta({ id: 'file', stato: 'pronto', testo: 'Write the course outline', consegna: { app: 'File', titolo: 'Course outline.md', percorso: '/x/Course outline.md' } as C['consegna'], aggiornato: '2026-10-15T02:00:00.000Z' }),
    carta({ id: 'bozza', stato: 'pronto', testo: 'Reply to Nora', email: { a: 'n@x', oggetto: 'Re', corpo: 'Hi', casella: { stato: 'salvata' } } as C['email'], aggiornato: '2026-10-15T04:00:00.000Z' }),
    carta({ id: 'testo', stato: 'pronto', testo: 'Summarise the feedback', aggiornato: '2026-10-15T01:00:00.000Z' }),
    carta({ id: 'chiusa', stato: 'fatto', testo: 'Old draft', chiuso: '2026-10-15T05:00:00.000Z' }),
    carta({ id: 'vecchia', stato: 'pronto', testo: 'Before he left', aggiornato: PRIMA }),
    carta({ id: 'bocciata', stato: 'pronto', prova: { esito: 'fail', perche: 'no', controlli: [], quando: DOPO } }),
    carta({ id: 'chiede', stato: 'chiede' }),
    carta({ id: 'sua', stato: 'fatto', modo: 'io', risultato: null, chiuso: DOPO })
  ], {
    dal: DAL, visti: new Set(['file']),
    pagine: [{ chiave: 'progetto:nw', titolo: 'Northwind', url: 'https://notion.so/p', quando: '2026-10-15T00:30:00.000Z' }, { chiave: 'progetto:hb', titolo: 'Harbor', url: null, quando: PRIMA }]
  })
  assert.deepEqual(xs.map(x => x.id), ['chiusa', 'bozza', 'file', 'testo', 'notion:progetto:nw'])
  const per = Object.fromEntries(xs.map(x => [x.id, x]))
  assert.equal(per.file.genere, 'file')
  assert.equal(per.file.nome, 'Course outline.md')
  assert.equal(per.file.visto, true, 'aperta: vista')
  assert.equal(per.bozza.genere, 'bozza')
  assert.equal(per.bozza.visto, false)
  assert.equal(per.bozza.aspetta, false, 'nella casella: fatta')
  assert.equal(per.testo.aspetta, true, 'pronta e non andata da nessuna parte: aspetta il suo sì')
  assert.equal(per.chiusa.visto, true, 'chiusa da lui: l’ha avuta davanti')
  assert.equal(per['notion:progetto:nw'].genere, 'notion')
  assert.equal(per['notion:progetto:nw'].url, 'https://notion.so/p')
})

test('visto: per conto, su disco, una volta sola con l’ora della prima; le vecchie se ne vanno', () => {
  cfg.scrivi({ lingua: 'en' } as Parameters<typeof cfg.scrivi>[0])
  assert.equal(via.visti().size, 0)
  assert.equal(via.segnaVisti(['a', 'b', 'a', 7, '', null], '2026-10-15T08:00:00.000Z'), 2, 'solo id veri, una volta')
  assert.equal(via.segnaVisti(['a'], '2026-10-15T09:00:00.000Z'), 0, 'già vista')
  assert.equal(via.visti().get('a'), '2026-10-15T08:00:00.000Z', 'l’ora della prima volta')
  // sessanta giorni dopo, la prima se ne va quando se ne segna un'altra
  via.segnaVisti(['c'], '2026-12-20T08:00:00.000Z')
  assert.deepEqual([...via.visti().keys()].sort(), ['c'])
  assert.ok(existsSync(join(cfg.cartella(), 'lavori-visti.json')))
  assert.ok(!existsSync(join(cfg.cartella(), 'lavori-visti.json.nuovo')), 'niente file a metà')
})

test('le pagine di Notion: una per chiave, la più recente', () => {
  via.segnaPagina({ chiave: 'progetto:nw', titolo: 'Northwind', url: null }, '2026-10-15T01:00:00.000Z')
  via.segnaPagina({ chiave: 'progetto:hb', titolo: 'Harbor', url: null }, '2026-10-15T02:00:00.000Z')
  via.segnaPagina({ chiave: 'progetto:nw', titolo: 'Northwind 1.0', url: 'https://notion.so/x' }, '2026-10-15T03:00:00.000Z')
  const p = via.pagineNotion()
  assert.deepEqual(p.map(x => [x.chiave, x.titolo]), [['progetto:nw', 'Northwind 1.0'], ['progetto:hb', 'Harbor']])
  assert.match(readFileSync(join(cfg.cartella(), 'via-notion.json'), 'utf8'), /notion\.so\/x/)
})

test('dal database: letti e messi da parte contano dalla stessa ora dell’elenco', () => {
  const ora = new Date()
  const unOraFa = new Date(ora.getTime() - 3_600_000).toISOString()
  const ieri = new Date(ora.getTime() - 30 * 3_600_000).toISOString()
  store.salvaDocumenti([
    { id: 'posta:1', fonte: 'email', tipo: 'email', titolo: 'Weekly digest', corpo: 'news', autore: 'news@x.example', quando: ora.toISOString() },
    { id: 'posta:2', fonte: 'email', tipo: 'email', titolo: 'Lunch on Friday?', corpo: 'hi', autore: 'mia@x.example', quando: ora.toISOString() },
    { id: 'posta:3', fonte: 'email', tipo: 'email', titolo: 'Invoice 42', corpo: 'pay', autore: 'bill@x.example', quando: ora.toISOString() },
    { id: 'posta:4', fonte: 'email', tipo: 'email', titolo: 'Old thing', corpo: 'x', autore: 'o@x.example', quando: ieri }
  ] as Parameters<typeof store.salvaDocumenti>[0])
  segnaEsame([
    { doc: 'posta:1', fase: 'regole', motivo: 'posta_in_serie' },
    { doc: 'posta:2', fase: 'modello' },
    { doc: 'posta:3', fase: 'carta' }
  ], new Date(ora.getTime() - 60_000).toISOString())
  segnaEsame([{ doc: 'posta:4', fase: 'regole', motivo: 'posta_in_serie' }], ieri)
  const m = mattina.mattina(unOraFa, ora)
  assert.equal(m.via?.letti, 3)
  assert.equal(m.via?.daParte, 2)
  const daParte = mattina.elencoVia(unOraFa, 'daParte', ora)
  assert.deepEqual(daParte.map(r => [r.titolo, r.ragione]).sort(), [['Lunch on Friday?', 'niente_da_fare'], ['Weekly digest', 'in_serie']])
  assert.equal(mattina.elencoVia(unOraFa, 'letti', ora).length, 3)
})
