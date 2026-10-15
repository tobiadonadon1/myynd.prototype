// Mentre non c'eri, dalla parte della pagina: la frase, le cose in cima, i
// tre stati di una riga e i blocchi con le viste piegate.
//
//   node --test src/via.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { LavoroVia, Via } from './api.ts'
import { aspettanoFuori, blocchiConViste, contiVia, frase, inCima, lavoriDi, qualcosa, RAGIONI, statoLavoro, vistaDaPiegare } from './via.ts'
import { contaInPagina } from './blocchi-feed.ts'

const lavoro = (id: string, x: Partial<LavoroVia> = {}): LavoroVia =>
  ({ id, titolo: id, genere: 'testo', nome: null, quando: '2026-10-15T03:00:00.000Z', visto: false, aspetta: false, ...x })
const via = (lavori: LavoroVia[], letti = 0, daParte = 0): Via => ({ dal: '2026-10-14T23:00:00.000Z', letti, daParte, lavori })

test('i conti: bozze sono risposte e testi, i file e Notion a parte', () => {
  const c = contiVia(via([
    lavoro('a', { genere: 'bozza' }), lavoro('b', { genere: 'testo' }), lavoro('n', { genere: 'nota' }),
    lavoro('f', { genere: 'file' }), lavoro('p', { genere: 'notion' })
  ], 41, 29))
  assert.deepEqual(c, { letti: 41, bozze: 3, file: 1, notion: 1, daParte: 29 })
  assert.deepEqual(contiVia(null), { letti: 0, bozze: 0, file: 0, notion: 0, daParte: 0 })
  assert.equal(qualcosa(contiVia(null)), false)
  assert.equal(qualcosa(contiVia(via([], 0, 3))), true, 'anche solo messo da parte è qualcosa')
})

test('la frase: i conti a zero non si dicono, l’ultimo con «and», ogni conto un pezzo che si apre', () => {
  const testo = (p: { testo: string }[]) => p.map(x => x.testo).join('')
  const tutti = frase({ letti: 41, bozze: 2, file: 1, notion: 1, daParte: 29 }, 'en')
  assert.equal(testo(tutti), 'I read 41 things, prepared 2 drafts, wrote 1 file, updated 1 Notion page and set aside 29.')
  assert.deepEqual(tutti.filter(p => p.conto).map(p => p.conto), ['letti', 'bozze', 'file', 'notion', 'daParte'])
  assert.equal(testo(frase({ letti: 1, bozze: 0, file: 0, notion: 0, daParte: 0 }, 'en')), 'I read 1 thing.')
  assert.equal(testo(frase({ letti: 12, bozze: 0, file: 3, notion: 0, daParte: 0 }, 'en')), 'I read 12 things and wrote 3 files.')
  assert.equal(testo(frase({ letti: 41, bozze: 1, file: 0, notion: 2, daParte: 29 }, 'it')), 'Ho letto 41 cose, preparato 1 bozza, aggiornato 2 pagine di Notion e messo da parte 29.')
  assert.deepEqual(frase({ letti: 0, bozze: 0, file: 0, notion: 0, daParte: 0 }, 'en'), [], 'niente: nessuna frase, nessuna carta')
})

test('in cima: al più tre, solo fatte e non viste; quelle che aspettano lui stanno nei blocchi', () => {
  const v = via([
    lavoro('vista', { visto: true }), lavoro('aspetta', { aspetta: true }),
    lavoro('a'), lavoro('b'), lavoro('c'), lavoro('d')
  ])
  assert.deepEqual(inCima(v).map(x => x.id), ['a', 'b', 'c'])
  assert.deepEqual(inCima(v, new Set(['a'])).map(x => x.id), ['b', 'c', 'd'], 'aperta adesso: via dalla cima')
  assert.deepEqual(inCima(null), [])
})

test('l’elenco di un conto: le stesse cose che il conto ha contato', () => {
  const v = via([lavoro('a', { genere: 'bozza' }), lavoro('t'), lavoro('f', { genere: 'file' }), lavoro('p', { genere: 'notion' })])
  assert.deepEqual(lavoriDi(v, 'bozze').map(x => x.id), ['a', 't'])
  assert.deepEqual(lavoriDi(v, 'file').map(x => x.id), ['f'])
  assert.deepEqual(lavoriDi(v, 'notion').map(x => x.id), ['p'])
  assert.deepEqual(lavoriDi(v, 'daParte'), [], 'le messe da parte arrivano dal server')
  for (const k of ['in_serie', 'letta', 'sconosciuto', 'archiviato', 'tacere', 'regola', 'non_tua', 'niente_da_fare', 'non_regge', 'fuori_obiettivo', 'meno_urgente']) {
    assert.ok(RAGIONI[k], k)
    assert.ok(!RAGIONI[k]!.includes('—'), 'niente lineette')
  }
})

test('i tre stati: aspetta te, fatta e nuova, fatta e vista', () => {
  const file = { app: 'File', titolo: 'x.md', percorso: '/x.md' }
  assert.equal(statoLavoro({ stato: 'chiede' }), 'te')
  assert.equal(statoLavoro({ stato: 'aperto' }, true), 'te', 'ferma su un blocco')
  assert.equal(statoLavoro({ stato: 'aperto' }), null, 'una riga sua')
  assert.equal(statoLavoro({ stato: 'delegato' }), null, 'ci sta lavorando')
  assert.equal(statoLavoro({ stato: 'pronto' }), 'te', 'pronta e non andata da nessuna parte: il suo sì')
  assert.equal(statoLavoro({ stato: 'pronto', consegna: file, prova: { esito: 'fail' } }), 'te', 'non regge')
  assert.equal(statoLavoro({ stato: 'pronto', consegna: file, proposta: {} }), 'te', 'da approvare')
  assert.equal(statoLavoro({ stato: 'pronto', consegna: file }), 'nuovo')
  assert.equal(statoLavoro({ stato: 'pronto', email: { casella: null } }), 'te', 'una bozza da mandare aspetta lui')
  assert.equal(statoLavoro({ stato: 'pronto', consegna: file, visto: '2026-10-15T08:00:00.000Z' }), 'visto')
  assert.equal(statoLavoro({ stato: 'pronto', consegna: file }, false, true), 'visto', 'aperta in questa visita')
})

test('una bozza salvata nella sua casella e non mandata aspetta lui, anche dopo averla aperta; mandata è fatta', () => {
  const salvata = { id: 'b', stato: 'pronto', email: { casella: { stato: 'salvata' } } }
  assert.equal(statoLavoro(salvata), 'te')
  assert.equal(statoLavoro({ ...salvata, visto: '2026-10-15T08:00:00.000Z' }), 'te', 'aperta una volta: non si piega')
  assert.equal(vistaDaPiegare({ ...salvata, visto: '2026-10-15T08:00:00.000Z' }, new Set()), false)
  const partita = { ...salvata, mandata: { doc: 'posta:1', quando: '2026-10-15T09:00:00.000Z' } }
  assert.equal(statoLavoro(partita), 'nuovo')
  assert.equal(vistaDaPiegare({ ...partita, visto: '2026-10-15T09:30:00.000Z' }, new Set()), true)
  assert.equal(vistaDaPiegare({ ...partita, visto: '2026-10-15T09:30:00.000Z' }, new Set(['b'])), false, 'aperta adesso: resta dov’è')
})

type C = { id: string; progetto: string | null; stato: string; origine: string; aggiornato: string; testo: string; modo: string; consegna?: unknown; visto?: string }
const carta = (id: string, x: Partial<C> = {}): C => ({ id, progetto: 'nw', stato: 'chiede', origine: 'mano', aggiornato: '2026-10-15T08:00:00.000Z', testo: id, modo: 'tutto', ...x })
const PROGETTI = [{ id: 'nw', nome: 'Northwind' }, { id: 'hb', nome: 'Harbor' }]
const vista = (c: C) => vistaDaPiegare(c, new Set())

test('le viste si piegano prima del tetto: non rubano il posto a una carta che aspetta lui', () => {
  // sette cose fatte e viste, poi la carta che chiede: col tetto di sei, prima restava fuori
  const viste = Array.from({ length: 7 }, (_, i) => carta(`v${i}`, { stato: 'pronto', consegna: { app: 'File' }, visto: '2026-10-15T07:00:00.000Z', aggiornato: `2026-10-15T09:0${i}:00.000Z` }))
  const blocchi = blocchiConViste({ voci: [], compiti: [...viste, carta('chiede')], progetti: PROGETTI, nomeResto: 'Rest' }, vista)
  assert.deepEqual(blocchi.map(b => b.progetto), ['nw'])
  assert.deepEqual(blocchi[0]!.righe.map(r => r.genere === 'compito' && r.compito.id), ['chiede'])
  assert.equal(blocchi[0]!.piegate.length, 7, 'tutte le viste, piegate, fuori dal tetto')
  assert.equal(contaInPagina(blocchi, { domanda: null, iniziative: [], lettera: false }), 1, 'il conto è quello che si vede')
})

test('un blocco con sole cose viste non c’è; uno appena nato resta vuoto', () => {
  const blocchi = blocchiConViste({
    voci: [], progetti: PROGETTI, nomeResto: 'Rest', vuoti: ['hb'],
    compiti: [carta('a'), carta('v', { progetto: 'hb', stato: 'pronto', consegna: { app: 'File' }, visto: '2026-10-15T07:00:00.000Z' })]
  }, vista)
  assert.deepEqual(blocchi.map(b => [b.progetto, b.righe.length, b.piegate.length]).sort(), [['hb', 0, 0], ['nw', 1, 0]])
})

test('le carte che aspettano lui oltre il tetto: contate dal titolo, quindi mostrate in «altre N»', () => {
  const chiedono = Array.from({ length: 8 }, (_, i) => carta(`q${i}`, { aggiornato: `2026-10-15T09:0${i}:00.000Z` }))
  const blocchi = blocchiConViste({ voci: [], compiti: chiedono, progetti: PROGETTI, nomeResto: 'Rest' }, vista)
  const ricevuta = chiedono.slice(0, 5).map(c => ({ genere: 'carta', id: c.id }))
  const fuori = aspettanoFuori(blocchi, ricevuta)
  const inBlocchi = blocchi.flatMap(b => b.righe.map(r => r.genere === 'compito' ? r.compito.id : ''))
  assert.equal(inBlocchi.length, 6, 'il tetto')
  for (const id of fuori) assert.ok(!inBlocchi.includes(id))
  // ogni cosa contata è raggiungibile: nei blocchi, o nella riga «altre N»
  const contate = contaInPagina(blocchi, { domanda: null, iniziative: [], lettera: false }, ricevuta)
  assert.equal(contate, inBlocchi.length + fuori.length)
  assert.deepEqual(aspettanoFuori(blocchi, [{ genere: 'domanda', id: 'd' }, { genere: 'lettera', id: 'lettera' }]), [], 'le domande e la lettera hanno la loro carta')
})

test('i conti del server valgono su tutto: l’elenco tagliato non li accorcia', () => {
  const v = { ...via(Array.from({ length: 3 }, (_, i) => lavoro(`f${i}`, { genere: 'file' }))), conti: { bozze: 4, file: 130, notion: 2 } }
  assert.deepEqual(contiVia(v), { letti: 0, bozze: 4, file: 130, notion: 2, daParte: 0 })
})
