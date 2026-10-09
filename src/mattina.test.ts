// La ricevuta in cima alla prima pagina, dalla parte della pagina: da quando
// chiederla, dove va la lettera, e come si dicono le sue righe.
//
//   node --test src/mattina.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { AspettaMattina, FattaMattina } from './api.ts'

;(globalThis as unknown as { document: unknown }).document = { documentElement: { lang: '' } }
const { frasi, impostaLingua, t } = await import('./lingua.ts')
const { conLettera, dalDopoIlRitorno, doveSta, MINUTI_VIA } = await import('./mattina.ts')

function in_(l: 'it' | 'en', f: () => string): string {
  impostaLingua(l)
  const s = f()
  impostaLingua('en')
  return s
}

test('da quando contare: un’assenza vera ricomincia, un passaggio su un’altra finestra no', () => {
  const ora = new Date(2026, 9, 9, 15, 0).getTime()
  const salvato = new Date(2026, 9, 9, 9, 0).toISOString()
  // via un’ora: si conta da quando se n’è andato
  assert.equal(dalDopoIlRitorno(ora - 3_600_000, salvato, ora), new Date(ora - 3_600_000).toISOString())
  // via cinque minuti: resta l’assenza di prima
  assert.equal(dalDopoIlRitorno(ora - 5 * 60_000, salvato, ora), salvato)
  assert.equal(dalDopoIlRitorno(ora - (MINUTI_VIA - 1) * 60_000, null, ora), null)
  // un altro giorno, anche per poco: ricomincia
  const mezzanotte = new Date(2026, 9, 10, 0, 5).getTime()
  assert.equal(dalDopoIlRitorno(mezzanotte - 10 * 60_000, salvato, mezzanotte), new Date(mezzanotte - 10 * 60_000).toISOString())
  // niente, o un istante nel futuro (un orologio spostato): quello di prima
  assert.equal(dalDopoIlRitorno(null, salvato, ora), salvato)
  assert.equal(dalDopoIlRitorno(ora + 60_000, salvato, ora), salvato)
})

test('la lettera sta dopo le carte ferme e prima delle domande di Myynd, dentro il tetto', () => {
  const carta = (id: string): AspettaMattina => ({ genere: 'carta', id, titolo: id, perche: '', motivo: 'domanda' })
  const domanda: AspettaMattina = { genere: 'domanda', id: 'd1', titolo: 'Which project matters most?' }
  assert.deepEqual(conLettera([carta('a'), domanda], 'Myynd has written to you.').map(a => a.id), ['a', 'lettera', 'd1'])
  assert.deepEqual(conLettera([carta('a'), carta('b')], 'x').map(a => a.id), ['a', 'b', 'lettera'])
  assert.deepEqual(conLettera([carta('a')], null).map(a => a.id), ['a'], 'senza lettera la ricevuta è quella del server')
  const tante = ['a', 'b', 'c', 'd', 'e'].map(carta)
  assert.equal(conLettera(tante, 'x').length, 5, 'il tetto vale anche per la lettera')
  // una lettera già dentro non si raddoppia
  assert.equal(conLettera([{ genere: 'lettera', id: 'lettera', titolo: 'x' }], 'x').filter(a => a.genere === 'lettera').length, 1)
})

test('dove sta una cosa fatta: il file con il suo nome, la casella, o niente se è la carta stessa', () => {
  const f = (dove: FattaMattina['dove']): FattaMattina => ({ id: 'x', titolo: 'x', dove, quando: '', notte: true })
  assert.deepEqual(doveSta(f({ genere: 'file', nome: 'Course outline.md', percorso: '/x', luogo: 'scrivania' })), { genere: 'file', nome: 'Course outline.md', luogo: 'scrivania' })
  assert.deepEqual(doveSta(f({ genere: 'casella' })), { genere: 'casella' })
  assert.equal(doveSta(f({ genere: 'carta' })), null)
})

test('le frasi della ricevuta, in tutte e due le lingue, al singolare e al plurale, senza lineette', () => {
  assert.equal(in_('en', () => t('Fatto mentre dormivi.')), 'Done while you slept.')
  assert.equal(in_('en', () => t('Da quando sei uscito.')), 'Since you left.')
  assert.equal(in_('en', () => frasi.bozzePartite(4, 3, 1)), '4 drafts sent: 3 as written, 1 edited.')
  assert.equal(in_('en', () => frasi.bozzePartite(1, 1, 0)), '1 draft sent: 1 as written, 0 edited.')
  assert.equal(in_('it', () => frasi.bozzePartite(4, 3, 1)), '4 bozze partite: 3 così com’erano, 1 ritoccata.')
  assert.equal(in_('en', () => frasi.prossimaNotte('23:00', 2)), 'Tonight from 23:00: 2 cards in the queue.')
  assert.equal(in_('en', () => frasi.prossimaNotte('23:00', 1)), 'Tonight from 23:00: 1 card in the queue.')
  assert.equal(in_('en', () => frasi.prossimaNotte('23:00', 0)), 'Tonight from 23:00 I work on the cards you hand me.')
  assert.equal(in_('it', () => frasi.carteInCoda(1)), '1 carta in coda.')
  assert.equal(in_('en', () => frasi.altreNelFoglio(2)), '2 more inside.')
  for (const l of ['it', 'en'] as const) {
    for (const s of [() => frasi.bozzePartite(2, 1, 1), () => frasi.prossimaNotte('01:00', 3), () => frasi.altreNelFoglio(1)].map(f => in_(l, f))) {
      assert.doesNotMatch(s, /[—–]/)
    }
  }
})
