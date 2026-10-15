// Mentre non c'eri, dalla parte della pagina: la frase, le cose in cima, i
// tre stati di una riga e i blocchi con le viste piegate.
//
//   node --test src/via.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { LavoroVia, Via } from './api.ts'
import { contiVia, frase, inCima, lavoriDi, piegaViste, qualcosa, RAGIONI, statoLavoro } from './via.ts'

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
  assert.equal(statoLavoro({ stato: 'pronto', email: { casella: { stato: 'salvata' } } }), 'nuovo', 'la bozza nella sua casella è consegnata')
  assert.equal(statoLavoro({ stato: 'pronto', email: { casella: null } }), 'te', 'una bozza da mandare aspetta lui')
  assert.equal(statoLavoro({ stato: 'pronto', consegna: file, visto: '2026-10-15T08:00:00.000Z' }), 'visto')
  assert.equal(statoLavoro({ stato: 'pronto', consegna: file }, false, true), 'visto', 'aperta in questa visita')
})

test('i blocchi: le viste si piegano in fondo, un blocco tutto visto se ne va, uno vuoto appena nato resta', () => {
  type R = { genere: 'compito'; id: string; vista: boolean }
  const r = (id: string, vista = false): R => ({ genere: 'compito', id, vista })
  const blocchi = [
    { progetto: 'nw', righe: [r('a'), r('b', true), r('c', true)] },
    { progetto: 'hb', righe: [r('d', true)] },
    { progetto: 'nuovo', righe: [] as R[] },
    { progetto: null, righe: [r('e')] }
  ]
  const p = piegaViste(blocchi, x => x.vista)
  assert.deepEqual(p.map(b => b.progetto), ['nw', 'nuovo', null])
  assert.deepEqual(p[0]!.righe.map(x => x.id), ['a'])
  assert.deepEqual(p[0]!.piegate.map(x => x.id), ['b', 'c'])
  assert.deepEqual(p[1]!.piegate, [])
  assert.deepEqual(p[2]!.piegate, [])
  assert.equal(blocchi[0]!.righe.length, 3, 'non tocca i blocchi che riceve')
})
