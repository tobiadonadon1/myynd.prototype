// I blocchi della prima pagina: chi sta con chi, e in che ordine.
//
//   node --test src/blocchi-feed.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blocchiFeed, chiaveBlocco, COMPITI_IN_PAGINA, ordinaBlocchi, ordineDopoIlTrascinamento, spostaBlocco, sulTavolo } from './blocchi-feed.ts'

const voce = (id: string, progetto: string | null, quando: string) => ({ id, progetto, quando })
const compito = (id: string, progetto: string | null, altro: Partial<{ stato: string; origine: string; madre: string | null; aggiornato: string; testo: string; nota: string | null }> = {}) =>
  ({ id, progetto, stato: 'aperto', origine: 'mano', madre: null, aggiornato: '2026-09-10T08:00:00Z', testo: '', nota: null, ...altro })
const domanda = (id: string, projectId: string, projectName: string) => ({ id, projectId, projectName })
const PROGETTI = [{ id: 'hf', nome: 'H-Farm', stato: 'attivo' }, { id: 'nx', nome: 'Nextas', stato: 'attivo' }, { id: 'old', nome: 'Vecchio', stato: 'chiuso' }]

const generi = (b: { righe: { genere: string }[] }) => b.righe.map(r => r.genere)
const ids = (b: { righe: ({ genere: 'voce'; voce: { id: string } } | { genere: 'compito'; compito: { id: string } } | { genere: 'domanda'; domanda: { id: string } })[] }) =>
  b.righe.map(r => r.genere === 'voce' ? r.voce.id : r.genere === 'compito' ? r.compito.id : r.domanda.id)

test('ogni progetto è un blocco suo, e quello che non ha progetto sta in fondo', () => {
  const b = blocchiFeed({
    voci: [voce('v1', 'hf', '2026-09-16T10:00:00Z'), voce('v2', null, '2026-09-17T10:00:00Z'), voce('v3', 'nx', '2026-09-15T10:00:00Z')],
    compiti: [compito('c1', 'nx'), compito('c2', null)],
    domande: [],
    progetti: PROGETTI,
    nomeResto: 'Il resto'
  })
  assert.deepEqual(b.map(x => x.nome), ['H-Farm', 'Nextas', 'Il resto'])
  assert.deepEqual(ids(b[0]), ['v1'])
  assert.deepEqual(ids(b[1]), ['v3', 'c1'])
  // il resto è il più recente di tutti, e sta in fondo lo stesso
  assert.deepEqual(ids(b[2]), ['v2', 'c2'])
  assert.equal(b[2].progetto, null)
})

test('i blocchi vanno dal più recente al più vecchio, e conta anche una riga della lista', () => {
  const b = blocchiFeed({
    voci: [voce('v1', 'hf', '2026-09-10T10:00:00Z')],
    compiti: [compito('c1', 'nx', { aggiornato: '2026-09-16T10:00:00Z' })],
    domande: [],
    progetti: PROGETTI,
    nomeResto: 'Il resto'
  })
  assert.deepEqual(b.map(x => x.nome), ['Nextas', 'H-Farm'])
})

test('la domanda sul progetto è l’ultima riga del suo blocco, mai sopra le cose da fare', () => {
  const b = blocchiFeed({
    voci: [voce('v1', 'hf', '2026-09-16T10:00:00Z')],
    compiti: [compito('c1', 'hf')],
    domande: [domanda('d1', 'hf', 'H-Farm'), domanda('d2', 'hf', 'H-Farm')],
    progetti: PROGETTI,
    nomeResto: 'Il resto'
  })
  assert.equal(b.length, 1)
  assert.deepEqual(generi(b[0]), ['voce', 'compito', 'domanda'])
  // una sola domanda per progetto
  assert.deepEqual(ids(b[0]), ['v1', 'c1', 'd1'])
})

test('un progetto con solo la domanda ha comunque un blocco, dopo quelli con qualcosa dentro', () => {
  const b = blocchiFeed({
    voci: [voce('v1', 'hf', '2026-09-16T10:00:00Z')],
    compiti: [],
    domande: [domanda('d1', 'nx', 'Nextas')],
    progetti: PROGETTI,
    nomeResto: 'Il resto'
  })
  assert.deepEqual(b.map(x => x.nome), ['H-Farm', 'Nextas'])
  assert.deepEqual(generi(b[1]), ['domanda'])
})

test('un progetto chiuso o sconosciuto non ha un blocco: le sue cose vanno nel resto', () => {
  const b = blocchiFeed({
    voci: [voce('v1', 'old', '2026-09-16T10:00:00Z'), voce('v2', 'boh', '2026-09-16T10:00:00Z')],
    compiti: [compito('c1', 'old')],
    domande: [domanda('d1', 'old', 'Vecchio')],
    progetti: PROGETTI,
    nomeResto: 'Everything else'
  })
  assert.equal(b.length, 1)
  assert.equal(b[0].nome, 'Everything else')
  assert.deepEqual(ids(b[0]), ['v1', 'v2', 'c1'])
})

test('la cosa dopo si legge sotto la riga da cui nasce, non come riga sua', () => {
  const b = blocchiFeed({
    voci: [],
    compiti: [
      compito('c1', 'hf', { stato: 'pronto' }),
      compito('c2', 'hf', { origine: 'seguito', madre: 'c1' }),
      // la madre non è in lista (è chiusa): questa è una riga come le altre
      compito('c3', 'hf', { origine: 'seguito', madre: 'chiusa' })
    ],
    domande: [],
    progetti: PROGETTI,
    nomeResto: 'Il resto'
  })
  assert.deepEqual(ids(b[0]), ['c1', 'c3'])
  const prima = b[0].righe[0]
  assert.equal(prima.genere === 'compito' && prima.seguito?.id, 'c2')
  const seconda = b[0].righe[1]
  assert.equal(seconda.genere === 'compito' && seconda.seguito, null)
})

test('quello che aspetta lui passa davanti, e sopra il tetto non si va', () => {
  const compiti = [
    ...Array.from({ length: 8 }, (_, i) => compito(`a${i}`, 'hf')),
    compito('pronta', 'hf', { stato: 'pronto' }),
    compito('chiede', 'nx', { stato: 'chiede' }),
    compito('lavora', 'nx', { stato: 'delegato' })
  ]
  const b = blocchiFeed({ voci: [], compiti, domande: [], progetti: PROGETTI, nomeResto: 'Il resto' })
  const tutte = b.flatMap(ids)
  assert.equal(tutte.length, COMPITI_IN_PAGINA)
  assert.ok(tutte.includes('pronta') && tutte.includes('chiede') && tutte.includes('lavora'))
  // dentro il blocco, la pronta sta prima delle aperte
  assert.equal(ids(b.find(x => x.nome === 'H-Farm')!)[0], 'pronta')
  // e le aperte restano nell'ordine della lista
  assert.deepEqual(ids(b.find(x => x.nome === 'H-Farm')!).slice(1), ['a0', 'a1', 'a2'])
})

test('dentro un blocco: prima le pronte, poi le voci, poi le altre righe, in fondo la domanda', () => {
  const b = blocchiFeed({
    voci: [voce('v1', 'hf', '2026-09-16T10:00:00Z')],
    compiti: [compito('c1', 'hf'), compito('c2', 'hf', { stato: 'chiede' })],
    domande: [domanda('d1', 'hf', 'H-Farm')],
    progetti: PROGETTI,
    nomeResto: 'Il resto'
  })
  assert.deepEqual(ids(b[0]), ['c2', 'v1', 'c1', 'd1'])
})

test('una riga senza progetto che ne nomina uno attivo sta nel suo blocco, non nel resto', () => {
  const b = blocchiFeed({
    voci: [],
    compiti: [compito('c1', null, { testo: 'Definire un pilota Myynd dentro H-Farm' })],
    domande: [],
    progetti: PROGETTI,
    nomeResto: 'Il resto'
  })
  assert.deepEqual(b.map(x => x.nome), ['H-Farm'])
  assert.deepEqual(ids(b[0]), ['c1'])
})

test('vale anche quello che il nome sta nella nota, e il nome è un\u2019entità intera', () => {
  const b = blocchiFeed({
    voci: [],
    compiti: [
      compito('nota', null, { testo: 'Preparare le slide', nota: 'per Nextas, entro venerdì' }),
      // Nextastic non è Nextas: il confine di parola è lo stesso del server
      compito('quasi', null, { testo: 'Scrivere a Nextastic' })
    ],
    domande: [],
    progetti: PROGETTI,
    nomeResto: 'Il resto'
  })
  assert.deepEqual(ids(b.find(x => x.nome === 'Nextas')!), ['nota'])
  assert.deepEqual(ids(b.find(x => x.nome === 'Il resto')!), ['quasi'])
})

test('fra due nomi che combaciano vince il più lungo', () => {
  const b = blocchiFeed({
    voci: [],
    compiti: [compito('c1', null, { testo: 'Pilota dentro H-Farm' })],
    domande: [],
    progetti: [{ id: 'f', nome: 'Farm', stato: 'attivo' }, { id: 'hf', nome: 'H-Farm', stato: 'attivo' }],
    nomeResto: 'Il resto'
  })
  assert.deepEqual(b.map(x => x.progetto), ['hf'])
})

test('il progetto scritto vince sul nome nominato, e un progetto chiuso non tira niente fuori dal resto', () => {
  const b = blocchiFeed({
    voci: [],
    compiti: [
      compito('scritto', 'nx', { testo: 'Pilota dentro H-Farm' }),
      compito('chiuso', null, { testo: 'Riordinare il Vecchio' })
    ],
    domande: [],
    progetti: PROGETTI,
    nomeResto: 'Il resto'
  })
  assert.deepEqual(ids(b.find(x => x.nome === 'Nextas')!), ['scritto'])
  assert.deepEqual(ids(b.find(x => x.nome === 'Il resto')!), ['chiuso'])
})

test('senza niente non c\u2019è nessun blocco', () => {
  assert.deepEqual(blocchiFeed({ voci: [], compiti: [], domande: [], progetti: PROGETTI, nomeResto: 'Il resto' }), [])
})

test('le cose sul tavolo sono tutte le righe che si vedono, domande comprese, più quella in cima', () => {
  const blocchi = [{ righe: [{}, {}, {}] }, { righe: [{}] }]
  assert.equal(sulTavolo(blocchi, false), 4)
  assert.equal(sulTavolo(blocchi, true), 5)
  assert.equal(sulTavolo([], false), 0)
})

// — l'ordine dei blocchi: quello che capisce da sé, e quello che sceglie lui —

const blocchi = (dati: { voci?: ReturnType<typeof voce>[]; compiti?: ReturnType<typeof compito>[]; domande?: ReturnType<typeof domanda>[] }) =>
  blocchiFeed({ voci: dati.voci ?? [], compiti: dati.compiti ?? [], domande: dati.domande ?? [], progetti: PROGETTI, nomeResto: 'Il resto' })
const nomi = (b: { nome: string }[]) => b.map(x => x.nome)

test('senza un ordine suo, i blocchi che aspettano lui passano davanti ai più recenti', () => {
  const b = blocchi({
    voci: [voce('v1', 'nx', '2026-09-17T10:00:00Z'), voce('v2', null, '2026-09-18T10:00:00Z')],
    compiti: [compito('c1', 'hf', { stato: 'pronto', aggiornato: '2026-09-10T08:00:00Z' })]
  })
  // per data sarebbe Nextas, H-Farm, Il resto: H-Farm ha una bozza pronta e passa avanti
  assert.deepEqual(nomi(ordinaBlocchi(b)), ['H-Farm', 'Nextas', 'Il resto'])
})

test('una domanda senza risposta vale come una bozza pronta, e tira su anche «Il resto»', () => {
  const b = blocchi({
    voci: [voce('v1', 'hf', '2026-09-18T10:00:00Z')],
    compiti: [compito('c1', null, { stato: 'chiede', aggiornato: '2026-09-09T08:00:00Z' })]
  })
  // una cosa che aspetta lui viene prima di tutto, anche se sta fra quelle
  // che non hanno un progetto: in fondo «Il resto» ci va a parità di attesa
  assert.deepEqual(nomi(ordinaBlocchi(b)), ['Il resto', 'H-Farm'])
  // niente che aspetti lui: torna in fondo, dove sta sempre
  const senza = blocchi({ voci: [voce('v1', 'hf', '2026-09-09T10:00:00Z'), voce('v2', null, '2026-09-18T10:00:00Z')] })
  assert.deepEqual(nomi(ordinaBlocchi(senza)), ['H-Farm', 'Il resto'])
})

test('l’ordine che ha scelto lui vince, anche su una bozza pronta', () => {
  const b = blocchi({
    voci: [voce('v1', 'nx', '2026-09-17T10:00:00Z')],
    compiti: [compito('c1', 'hf', { stato: 'pronto' })]
  })
  assert.deepEqual(nomi(ordinaBlocchi(b, ['nx', 'hf'])), ['Nextas', 'H-Farm'])
  assert.deepEqual(nomi(ordinaBlocchi(b, ['hf', 'nx'])), ['H-Farm', 'Nextas'])
})

test('un blocco che l’ordine salvato non conosce va in fondo, non in cima', () => {
  const b = blocchi({
    voci: [voce('v1', 'hf', '2026-09-10T10:00:00Z'), voce('v2', 'nx', '2026-09-18T10:00:00Z'), voce('v3', null, '2026-09-11T10:00:00Z')]
  })
  // solo H-Farm ha un posto scelto: gli altri due restano fra loro come stavano
  assert.deepEqual(nomi(ordinaBlocchi(b, ['hf'])), ['H-Farm', 'Nextas', 'Il resto'])
  // «resto» si nomina così, e un id che non c'è più non sposta niente
  assert.deepEqual(nomi(ordinaBlocchi(b, ['resto', 'sparito', 'nx'])), ['Il resto', 'Nextas', 'H-Farm'])
})

test('la chiave di un blocco è il progetto, e «resto» per quello senza', () => {
  assert.equal(chiaveBlocco({ progetto: 'hf' }), 'hf')
  assert.equal(chiaveBlocco({ progetto: null }), 'resto')
})

test('trascinare sposta un blocco solo, e fuori dall’elenco non sposta niente', () => {
  assert.deepEqual(spostaBlocco(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b'])
  assert.deepEqual(spostaBlocco(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a'])
  assert.deepEqual(spostaBlocco(['a', 'b', 'c'], 1, 1), ['a', 'b', 'c'])
  assert.deepEqual(spostaBlocco(['a', 'b', 'c'], 1, 9), ['a', 'b', 'c'])
  assert.deepEqual(spostaBlocco(['a', 'b', 'c'], -1, 0), ['a', 'b', 'c'])
})

test('l’ordine da salvare tiene in coda i blocchi che oggi non sono in pagina', () => {
  assert.deepEqual(ordineDopoIlTrascinamento(['a', 'b'], 1, 0, ['b', 'a', 'z']), ['b', 'a', 'z'])
  assert.deepEqual(ordineDopoIlTrascinamento(['a', 'b'], 0, 1, ['z', 'a', 'b']), ['b', 'a', 'z'])
  assert.deepEqual(ordineDopoIlTrascinamento(['a', 'b'], 0, 1), ['b', 'a'])
})
