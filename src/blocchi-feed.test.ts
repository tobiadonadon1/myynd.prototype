// I blocchi della prima pagina: chi sta con chi, e in che ordine.
//
//   node --test src/blocchi-feed.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blocchiFeed, COMPITI_IN_PAGINA } from './blocchi-feed.ts'

const voce = (id: string, progetto: string | null, quando: string) => ({ id, progetto, quando })
const compito = (id: string, progetto: string | null, altro: Partial<{ stato: string; origine: string; madre: string | null; aggiornato: string }> = {}) =>
  ({ id, progetto, stato: 'aperto', origine: 'mano', madre: null, aggiornato: '2026-09-10T08:00:00Z', ...altro })
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

test('senza niente non c’è nessun blocco', () => {
  assert.deepEqual(blocchiFeed({ voci: [], compiti: [], domande: [], progetti: PROGETTI, nomeResto: 'Il resto' }), [])
})
