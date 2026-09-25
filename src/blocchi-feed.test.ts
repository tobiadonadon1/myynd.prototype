// I blocchi della prima pagina: chi sta con chi, e in che ordine.
//
//   node --test src/blocchi-feed.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blocchiFeed, cheAspettano, chiaveBlocco, COMPITI_IN_PAGINA, ordinaBlocchi, ordineDopoIlTrascinamento, pesoDi, SENZA_PESO, spostaBlocco, stessoGruppo, sulTavolo } from './blocchi-feed.ts'

const voce = (id: string, progetto: string | null, quando: string, peso?: number | null) => ({ id, progetto, quando, peso })
const compito = (id: string, progetto: string | null, altro: Partial<{ stato: string; origine: string; madre: string | null; aggiornato: string; testo: string; nota: string | null }> = {}) =>
  ({ id, progetto, stato: 'aperto', origine: 'mano', madre: null, aggiornato: '2026-09-10T08:00:00Z', testo: '', nota: null, ...altro })
const PROGETTI = [{ id: 'hf', nome: 'H-Farm', stato: 'attivo' }, { id: 'nx', nome: 'Nextas', stato: 'attivo' }, { id: 'old', nome: 'Vecchio', stato: 'chiuso' }]

const generi = (b: { righe: { genere: string }[] }) => b.righe.map(r => r.genere)
const ids = (b: { righe: ({ genere: 'voce'; voce: { id: string } } | { genere: 'compito'; compito: { id: string } })[] }) =>
  b.righe.map(r => r.genere === 'voce' ? r.voce.id : r.compito.id)

test('ogni progetto è un blocco suo, e quello che non ha progetto sta in fondo', () => {
  const b = blocchiFeed({
    voci: [voce('v1', 'hf', '2026-09-16T10:00:00Z'), voce('v2', null, '2026-09-17T10:00:00Z'), voce('v3', 'nx', '2026-09-15T10:00:00Z')],
    compiti: [compito('c1', 'nx'), compito('c2', null)],
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
    progetti: PROGETTI,
    nomeResto: 'Il resto'
  })
  assert.deepEqual(b.map(x => x.nome), ['Nextas', 'H-Farm'])
})

test('un blocco tiene solo il lavoro: voci e righe, mai una domanda', () => {
  const b = blocchiFeed({
    voci: [voce('v1', 'hf', '2026-09-16T10:00:00Z')],
    compiti: [compito('c1', 'hf')],
    progetti: PROGETTI,
    nomeResto: 'Il resto'
  })
  assert.equal(b.length, 1)
  assert.deepEqual(generi(b[0]), ['voce', 'compito'])
})

test('le voci di un blocco vanno dalla più pesante alla più leggera, e chi non ha un peso sta in mezzo', () => {
  const b = blocchiFeed({
    voci: [
      voce('sfondo', 'hf', '2026-09-18T10:00:00Z', 0),
      voce('boh', 'hf', '2026-09-17T10:00:00Z', null),
      voce('oggi', 'hf', '2026-09-16T10:00:00Z', 3),
      voce('settimana', 'hf', '2026-09-15T10:00:00Z', 1),
      voce('boh2', 'hf', '2026-09-14T10:00:00Z')
    ],
    compiti: [],
    progetti: PROGETTI,
    nomeResto: 'Il resto'
  })
  assert.deepEqual(ids(b[0]), ['oggi', 'boh', 'boh2', 'settimana', 'sfondo'])
  assert.equal(b[0].peso, 3)
  assert.equal(pesoDi({ peso: null }), SENZA_PESO)
  assert.equal(pesoDi({ peso: Number.NaN }), SENZA_PESO)
  assert.equal(pesoDi({ peso: 2 }), 2)
})

test('un progetto chiuso o sconosciuto non ha un blocco: le sue cose vanno nel resto', () => {
  const b = blocchiFeed({
    voci: [voce('v1', 'old', '2026-09-16T10:00:00Z'), voce('v2', 'boh', '2026-09-16T10:00:00Z')],
    compiti: [compito('c1', 'old')],
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
  const b = blocchiFeed({ voci: [], compiti, progetti: PROGETTI, nomeResto: 'Il resto' })
  const tutte = b.flatMap(ids)
  assert.equal(tutte.length, COMPITI_IN_PAGINA)
  assert.ok(tutte.includes('pronta') && tutte.includes('chiede') && tutte.includes('lavora'))
  // dentro il blocco, la pronta sta prima delle aperte
  assert.equal(ids(b.find(x => x.nome === 'H-Farm')!)[0], 'pronta')
  // e le aperte restano nell'ordine della lista
  assert.deepEqual(ids(b.find(x => x.nome === 'H-Farm')!).slice(1), ['a0', 'a1', 'a2'])
})

test('una riga appena finita resta al posto di una affidata finché il fuoco si posa', () => {
  const dati = {
    voci: [voce('v1', 'hf', '2026-09-16T10:00:00Z')],
    compiti: [compito('c1', 'hf'), compito('c2', 'hf', { stato: 'pronto' })],
    progetti: PROGETTI, nomeResto: 'Il resto'
  }
  assert.deepEqual(ids(blocchiFeed(dati)[0]), ['c2', 'v1', 'c1'])
  // il posto di una affidata: dopo le voci, prima delle righe aperte
  assert.deepEqual(ids(blocchiFeed({ ...dati, fermi: new Set(['c2']) })[0]), ['v1', 'c2', 'c1'])
  // ferma vale solo per una riga pronta o che chiede: una aperta non cambia posto
  assert.deepEqual(ids(blocchiFeed({ ...dati, fermi: new Set(['c1']) })[0]), ['c2', 'v1', 'c1'])
})

test('dentro un blocco: prima le pronte, poi le voci, poi le altre righe', () => {
  const b = blocchiFeed({
    voci: [voce('v1', 'hf', '2026-09-16T10:00:00Z')],
    compiti: [compito('c1', 'hf'), compito('c2', 'hf', { stato: 'chiede' })],
    progetti: PROGETTI,
    nomeResto: 'Il resto'
  })
  assert.deepEqual(ids(b[0]), ['c2', 'v1', 'c1'])
})

test('una riga senza progetto che ne nomina uno attivo sta nel suo blocco, non nel resto', () => {
  const b = blocchiFeed({
    voci: [],
    compiti: [compito('c1', null, { testo: 'Definire un pilota Myynd dentro H-Farm' })],
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
    progetti: PROGETTI,
    nomeResto: 'Il resto'
  })
  assert.deepEqual(ids(b.find(x => x.nome === 'Nextas')!), ['scritto'])
  assert.deepEqual(ids(b.find(x => x.nome === 'Il resto')!), ['chiuso'])
})

test('senza niente non c\u2019è nessun blocco', () => {
  assert.deepEqual(blocchiFeed({ voci: [], compiti: [], progetti: PROGETTI, nomeResto: 'Il resto' }), [])
})

test('le cose sul tavolo sono tutte le righe che si vedono, più le domande nella loro carta', () => {
  const blocchi = [{ righe: [{}, {}, {}] }, { righe: [{}] }]
  assert.equal(sulTavolo(blocchi, 0), 4)
  assert.equal(sulTavolo(blocchi, 3), 7)
  assert.equal(sulTavolo([], 0), 0)
  assert.equal(sulTavolo([], -1), 0)
})

// — l'ordine dei blocchi: quello che capisce da sé, e quello che sceglie lui —

const blocchi = (dati: { voci?: ReturnType<typeof voce>[]; compiti?: ReturnType<typeof compito>[] }) =>
  blocchiFeed({ voci: dati.voci ?? [], compiti: dati.compiti ?? [], progetti: PROGETTI, nomeResto: 'Il resto' })
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

test('a parità di attesa, il blocco con la cosa più pesante passa davanti al più recente', () => {
  const b = blocchi({
    voci: [
      voce('v1', 'nx', '2026-09-18T10:00:00Z', 1),
      voce('v2', 'hf', '2026-09-10T10:00:00Z', 3),
      voce('v3', null, '2026-09-19T10:00:00Z', 3)
    ]
  })
  // per data sarebbe Nextas, H-Farm; H-Farm ha una cosa di peso 3 e passa
  // avanti; «Il resto» ha lo stesso peso e resta in fondo, come sempre
  assert.deepEqual(nomi(ordinaBlocchi(b)), ['H-Farm', 'Nextas', 'Il resto'])
  // ma una bozza pronta viene prima di qualunque peso
  const c = blocchi({
    voci: [voce('v1', 'nx', '2026-09-18T10:00:00Z', 3)],
    compiti: [compito('c1', 'hf', { stato: 'pronto', aggiornato: '2026-09-01T08:00:00Z' })]
  })
  assert.deepEqual(nomi(ordinaBlocchi(c)), ['H-Farm', 'Nextas'])
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

// — la priorità di un progetto, e il progetto appena nato —

test('un progetto segnato alto passa davanti, anche a una bozza pronta e al più recente', () => {
  const progetti = [{ id: 'hf', nome: 'H-Farm', stato: 'attivo' }, { id: 'nx', nome: 'Nextas', stato: 'attivo', priorita: 'alta' }]
  const b = blocchiFeed({
    voci: [voce('v1', 'nx', '2026-09-01T10:00:00Z', 0), voce('v2', null, '2026-09-19T10:00:00Z')],
    compiti: [compito('c1', 'hf', { stato: 'pronto', aggiornato: '2026-09-18T08:00:00Z' })],
    progetti, nomeResto: 'Il resto'
  })
  assert.deepEqual(b.map(x => [x.nome, x.alto]), [['Nextas', true], ['H-Farm', false], ['Il resto', false]])
  // l'ordine della pagina: il più leggero e il più vecchio, ma l'ha segnato lui
  assert.deepEqual(ordinaBlocchi(b).map(x => x.nome), ['Nextas', 'H-Farm', 'Il resto'])
  // e anche con un ordine trascinato la priorità viene prima: l'ordine vale dentro il gruppo
  assert.deepEqual(ordinaBlocchi(b, ['hf', 'nx']).map(x => x.nome), ['Nextas', 'H-Farm', 'Il resto'])
})

test('con un ordine trascinato: gli alti davanti, l’ordine suo dentro ogni gruppo; tolto l’«alta», il blocco torna fra i normali al suo posto', () => {
  const progetti = (alti: string[]) => ['a', 'b', 'c', 'd'].map(id => ({ id, nome: id.toUpperCase(), stato: 'attivo', priorita: alti.includes(id) ? 'alta' : null }))
  const voci = ['a', 'b', 'c', 'd'].map((id, i) => voce(`v${id}`, id, `2026-09-1${i}T10:00:00Z`))
  const ordine = ['d', 'c', 'resto', 'b', 'a']
  const conAlti = (alti: string[]) => ordinaBlocchi(blocchiFeed({ voci, compiti: [], progetti: progetti(alti), nomeResto: 'Il resto' }), ordine).map(x => x.nome)
  // b e a sono alti: davanti, fra loro nell'ordine trascinato; poi d e c come li ha messi
  assert.deepEqual(conAlti(['a', 'b']), ['B', 'A', 'D', 'C'])
  // tolto l'«alta» a b: torna fra i normali, al posto che aveva nell'ordine, non in cima
  assert.deepEqual(conAlti(['a']), ['A', 'D', 'C', 'B'])
  assert.deepEqual(conAlti([]), ['D', 'C', 'B', 'A'])
})

test('un progetto appena creato va in cima ai normali anche con un ordine trascinato, non sotto «Il resto»', () => {
  const progetti = [...PROGETTI, { id: 'nuovo', nome: 'Nuovo', stato: 'attivo' }]
  const b = blocchiFeed({
    voci: [voce('v1', 'hf', '2026-09-16T10:00:00Z'), voce('v2', null, '2026-09-17T10:00:00Z')], compiti: [],
    progetti, nomeResto: 'Il resto', vuoti: ['nuovo']
  })
  assert.deepEqual(ordinaBlocchi(b, ['hf', 'resto']).map(x => x.nome), ['H-Farm', 'Il resto', 'Nuovo'], 'senza sapere che è nuovo, in fondo come ogni sconosciuto')
  assert.deepEqual(ordinaBlocchi(b, ['hf', 'resto'], ['nuovo']).map(x => x.nome), ['Nuovo', 'H-Farm', 'Il resto'])
})

test('trascinare si può solo dentro il proprio gruppo', () => {
  const b = [{ alto: true }, { alto: true }, { alto: false }, {}]
  assert.equal(stessoGruppo(b, 0, 1), true)
  assert.equal(stessoGruppo(b, 1, 2), false)
  assert.equal(stessoGruppo(b, 2, 3), true)
  assert.equal(stessoGruppo(b, 3, 4), false)
})

test('un progetto appena nato ha il suo blocco anche vuoto; uno fermo, sconosciuto o non nato adesso no', () => {
  const progetti = [...PROGETTI, { id: 'nuovo', nome: 'Nuovo', stato: 'attivo' }, { id: 'pausa', nome: 'In pausa', stato: 'fermo' }]
  const b = blocchiFeed({
    voci: [voce('v1', 'hf', '2026-09-16T10:00:00Z')], compiti: [],
    progetti, nomeResto: 'Il resto', vuoti: ['nuovo', 'pausa', 'sparito']
  })
  assert.deepEqual(b.map(x => [x.nome, x.righe.length]), [['H-Farm', 1], ['Nuovo', 0]])
  // niente righe, niente conto: un blocco vuoto non è una cosa sul tavolo
  assert.equal(sulTavolo(b, 0), 1)
  // senza «vuoti» è la regola di sempre: un progetto senza righe non ha un blocco
  assert.deepEqual(blocchiFeed({ voci: [], compiti: [], progetti, nomeResto: 'Il resto' }), [])
  // e appena ha una riga è un blocco come gli altri
  const pieno = blocchiFeed({ voci: [], compiti: [compito('c1', 'nuovo')], progetti, nomeResto: 'Il resto', vuoti: ['nuovo'] })
  assert.deepEqual(pieno.map(x => [x.nome, x.righe.length]), [['Nuovo', 1]])
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

test('spuntare una riga non rimescola i blocchi: restano dov’erano, un nuovo entra al suo posto', async () => {
  const { ordineStabile } = await import('./blocchi-feed.ts')
  // il 22 settembre: dopo il clic l'ordine di sempre metteva Myynd sopra H-Farm
  assert.deepEqual(ordineStabile(['myynd', 'hfarm', 'resto'], ['hfarm', 'myynd', 'resto']), ['hfarm', 'myynd', 'resto'])
  // un blocco sparito se ne va, gli altri non si muovono
  assert.deepEqual(ordineStabile(['myynd', 'resto'], ['hfarm', 'myynd', 'resto']), ['myynd', 'resto'])
  // uno nuovo entra dove lo mette l'ordine di sempre, senza scambiare gli altri
  assert.deepEqual(ordineStabile(['nuovo', 'myynd', 'hfarm', 'resto'], ['hfarm', 'myynd', 'resto']), ['nuovo', 'hfarm', 'myynd', 'resto'])
  assert.deepEqual(ordineStabile(['myynd', 'hfarm', 'resto', 'nuovo'], ['hfarm', 'myynd', 'resto']), ['hfarm', 'myynd', 'resto', 'nuovo'])
  // la prima volta non c'è niente da tenere: vale l'ordine di sempre
  assert.deepEqual(ordineStabile(['a', 'b'], []), ['a', 'b'])
})

test('la carta di Myynd che ha scritto è una cosa sul tavolo: il titolo e il menù la contano', () => {
  // «Niente che richieda te, adesso» sopra «Myynd ti ha scritto · Rispondi», e uno 0 nel menù
  assert.equal(sulTavolo([], cheAspettano({ domanda: null, iniziative: 0, lettera: true })), 1)
  // «Una cosa sul tavolo» sopra la lettera e un’attività: sono due
  assert.equal(sulTavolo([{ righe: [1] }], cheAspettano({ domanda: null, iniziative: 0, lettera: true })), 2)
  assert.equal(cheAspettano({ domanda: { id: 'q' }, iniziative: 2, lettera: false }), 3)
  assert.equal(cheAspettano({ domanda: null, iniziative: 0, lettera: false }), 0)
})

test('una revisione sta sotto sua madre e non conta nel tetto: con sei righe pronte si vede lo stesso (P3)', () => {
  const pronte = Array.from({ length: 6 }, (_, i) => compito(`p${i}`, 'hf', { stato: 'pronto' }))
  // la figlia in fondo alla lista, come la mette il server
  const figlia = compito('rev-1', 'hf', { stato: 'delegato', madre: 'p2', origine: 'chat' })
  const b = blocchiFeed({ voci: [], compiti: [...pronte, compito('a1', 'hf'), figlia], progetti: PROGETTI, nomeResto: 'Il resto' })
  const tutte = b.flatMap(ids)
  assert.deepEqual(tutte, ['p0', 'p1', 'p2', 'rev-1', 'p3', 'p4', 'p5'])
  // la finta di `useCompiti.correggi`, inserita subito dopo la madre: stesso posto
  const attesa = compito('rev-attesa-p2', 'hf', { stato: 'delegato', madre: 'p2', origine: 'chat' })
  const b2 = blocchiFeed({ voci: [], compiti: [...pronte.slice(0, 3), attesa, ...pronte.slice(3), compito('a1', 'hf')], progetti: PROGETTI, nomeResto: 'Il resto' })
  assert.deepEqual(b2.flatMap(ids), ['p0', 'p1', 'p2', 'rev-attesa-p2', 'p3', 'p4', 'p5'])
  // finita, la figlia resta sotto la madre
  const b3 = blocchiFeed({ voci: [], compiti: [...pronte, { ...figlia, stato: 'pronto' }], progetti: PROGETTI, nomeResto: 'Il resto' })
  assert.deepEqual(b3.flatMap(ids), ['p0', 'p1', 'p2', 'rev-1', 'p3', 'p4', 'p5'])
  // senza la madre in pagina è una riga come le altre, e conta
  const orfana = compito('rev-9', 'hf', { stato: 'delegato', madre: 'chiusa', origine: 'chat' })
  const b4 = blocchiFeed({ voci: [], compiti: [...pronte, orfana], progetti: PROGETTI, nomeResto: 'Il resto' })
  assert.equal(b4.flatMap(ids).length, COMPITI_IN_PAGINA)
  assert.ok(!b4.flatMap(ids).includes('rev-9'))
})

test('una riga appena corretta con «Cambia» resta al suo posto mentre si rifà, anche con la pagina piena (P3)', () => {
  const pronte = Array.from({ length: 7 }, (_, i) => compito(`p${i}`, 'hf', { stato: 'pronto' }))
  const compiti = [...pronte.slice(0, 2), { ...pronte[2], stato: 'delegato' }, ...pronte.slice(3)]
  // senza dirlo, la riga che lavora finisce dietro le sei pronte e sotto il tetto
  assert.deepEqual(blocchiFeed({ voci: [], compiti, progetti: PROGETTI, nomeResto: 'Il resto' }).flatMap(ids), ['p0', 'p1', 'p3', 'p4', 'p5', 'p6'])
  // corretta: al suo posto, fra le pronte
  const b = blocchiFeed({ voci: [], compiti, progetti: PROGETTI, nomeResto: 'Il resto', corrette: new Set(['p2']) })
  assert.deepEqual(b.flatMap(ids), ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'])
  // corretta ma già tornata pronta: il peso è quello di sempre
  const b2 = blocchiFeed({ voci: [], compiti: pronte, progetti: PROGETTI, nomeResto: 'Il resto', corrette: new Set(['p2']) })
  assert.deepEqual(b2.flatMap(ids), ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'])
})

test('(P3) una riga ferma su un blocco o su un dato che manca aspetta lui: sta in prima pagina anche a pagina piena', () => {
  const compiti = [
    ...Array.from({ length: 8 }, (_, i) => compito(`a${i}`, 'hf')),
    { ...compito('bloccata', 'nx'), guaio: 'Collega la posta e la riprendo da qui.' },
    { ...compito('senzaDato', 'nx'), guaio: 'Non sono riuscito a finirla senza un dato che manca.' },
    // un guaio qualunque su una riga aperta non la porta davanti
    { ...compito('altroGuaio', 'nx'), guaio: 'Il modello non ha risposto.' }
  ]
  const b = blocchiFeed({ voci: [], compiti, progetti: PROGETTI, nomeResto: 'Il resto' })
  const tutte = b.flatMap(ids)
  assert.equal(tutte.length, COMPITI_IN_PAGINA)
  assert.ok(tutte.includes('bloccata'), 'la riga bloccata è sparita sotto il tetto')
  assert.ok(tutte.includes('senzaDato'), 'la riga ferma su un dato che manca è sparita sotto il tetto')
  assert.ok(!tutte.includes('altroGuaio'))
  assert.deepEqual(ids(b.find(x => x.nome === 'Nextas')!), ['bloccata', 'senzaDato'])
})
