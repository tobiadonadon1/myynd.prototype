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
  assert.equal(per.bozza.aspetta, true, 'nella casella e non mandata: aspetta lui finché non parte')
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
  store.default.prepare('UPDATE documenti SET indicizzato = ? WHERE id = ?').run(ieri, 'posta:4')
  const m = mattina.mattina(unOraFa, ora)
  assert.equal(m.via?.letti, 3)
  assert.equal(m.via?.daParte, 2)
  const daParte = mattina.elencoVia(unOraFa, 'daParte', ora)
  assert.deepEqual(daParte.righe.map(r => [r.titolo, r.ragione]).sort(), [['Lunch on Friday?', 'niente_da_fare'], ['Weekly digest', 'in_serie']])
  assert.equal(daParte.totale, 2, 'il numero sulla carta')
  assert.equal(mattina.elencoVia(unOraFa, 'letti', ora).totale, 3)

  // un giudizio rifatto adesso su una mail letta ieri non è una lettura nuova: si conta alla prima
  segnaEsame([{ doc: 'posta:4', fase: 'modello' }], ora.toISOString())
  assert.equal(mattina.mattina(unOraFa, ora).via?.letti, 3, 'posta:4 non torna «letta» per un giudizio rifatto')
  // e due giudizi sulla stessa mail nella finestra la contano una volta
  segnaEsame([{ doc: 'posta:2', fase: 'verifica', motivo: 'senza_fonte' }], ora.toISOString())
  assert.equal(mattina.mattina(unOraFa, ora).via?.letti, 3)
})

test('il conto e l’elenco dicono la stessa cosa anche oltre le duecento righe', () => {
  const ora = new Date()
  const unOraFa = new Date(ora.getTime() - 3_600_000).toISOString()
  const tante = Array.from({ length: via.ELENCO_MAX + 25 }, (_, i) => ({ id: `massa:${i}`, fonte: 'email', tipo: 'email', titolo: `Promo ${i}`, corpo: 'x', autore: 'promo@x.example', quando: ora.toISOString() }))
  store.salvaDocumenti(tante as Parameters<typeof store.salvaDocumenti>[0])
  segnaEsame(tante.map(d => ({ doc: d.id, fase: 'regole', motivo: 'posta_in_serie' })), new Date(ora.getTime() - 60_000).toISOString())
  const m = mattina.mattina(unOraFa, ora)
  const e = mattina.elencoVia(unOraFa, 'daParte', ora)
  assert.equal(e.totale, m.via?.daParte, 'il numero sulla carta è il totale dell’elenco')
  assert.equal(e.righe.length, via.ELENCO_MAX)
  assert.ok(e.totale - e.righe.length >= 25, 'quello che resta si dice: «and N more»')
})

test('i conti del lavoro valgono su tutto, l’elenco si taglia', () => {
  const tanti = Array.from({ length: via.LAVORI_MAX + 20 }, (_, i) => carta({ id: `f${i}`, stato: 'pronto', consegna: { app: 'File', titolo: `f${i}.md`, percorso: `/x/f${i}.md` } as C['consegna'], aggiornato: DOPO }))
  const tutti = via.lavoriVia(tanti, { dal: DAL, visti: new Set() })
  assert.equal(via.contiLavoro(tutti).file, via.LAVORI_MAX + 20)
})

test('da quando non c’era lo sa il server: mezz’ora di assenza apre una ricevuta nuova, sette giorni al più', () => {
  const ore = (h: number) => new Date(Date.parse('2026-10-15T09:00:00.000Z') + h * 3_600_000)
  assert.equal(via.dalDa({}, ore(0)), null, 'mai guardato: conta la giornata')
  // guardava fino alle 9:00, torna alle 9:10: è la stessa visita, vale l'assenza di prima
  assert.equal(via.dalDa({ ultima: ore(0).toISOString(), dal: ore(-20).toISOString() }, ore(1 / 6)), ore(-20).toISOString())
  // torna alle 13:00: l'assenza comincia quando ha smesso di guardare
  assert.equal(via.dalDa({ ultima: ore(0).toISOString(), dal: ore(-20).toISOString() }, ore(4)), ore(0).toISOString())
  // via dieci giorni: si conta da sette giorni fa, non da niente
  assert.equal(via.dalDa({ ultima: ore(-240).toISOString() }, ore(0)), ore(-168).toISOString())
  // su disco, per conto: `qui` fissa l'inizio dell'assenza che finisce
  via.qui(ore(0))
  assert.equal(via.dalDelRitorno(ore(0.25)), null, 'un quarto d’ora: niente assenza ancora')
  assert.equal(via.dalDelRitorno(ore(3)), ore(0).toISOString())
  via.qui(ore(3))
  assert.equal(via.dalDelRitorno(ore(3.1)), ore(0).toISOString(), 'tornato: l’assenza resta quella, finché non ne fa un’altra')
  // sempre qui da più di un giorno e mezzo: «mentre eri via» torna a essere la giornata
  assert.equal(via.dalDa({ ultima: ore(39.9).toISOString(), dal: ore(0).toISOString() }, ore(40)), null)
  // un secondo `qui` entro il minuto non riscrive niente
  via.qui(ore(3.2))
  via.qui(ore(3.2 + 0.5 / 60))
  assert.equal(via.dalDelRitorno(ore(3.2 + 0.6 / 60)), ore(0).toISOString())
})
