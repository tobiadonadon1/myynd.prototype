// La riga «Learned» sotto una bozza, e il perché di una riga lasciata, dal client.
//
//   node --test src/imparato.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'

// `impostaLingua` scrive `document.documentElement.lang`, e qui il documento non c'è
;(globalThis as unknown as { document: unknown }).document = { documentElement: { lang: '' } }
import { imparatoDellaBozza } from './lavoro-affidato.ts'
import { frasi, impostaLingua } from './lingua.ts'
import { fraseSeguita } from './gemello-frasi.ts'
import type { RegolaSeguita } from './api.ts'

const SALUTO: RegolaSeguita = { chiave: 'bozza.tono:saluto-via', genere: 'bozza.tono', casi: 3, dati: { tratto: 'saluto-via' } }
const CORTA: RegolaSeguita = { chiave: 'bozza.tono:corta', genere: 'bozza.tono', casi: 2, dati: { tratto: 'corta', rapporto: 0.6 } }
const TENUTA: RegolaSeguita = { chiave: 'k1', genere: 'convinzione', casi: 1, testo: 'Puts the decision in the first line' }

test('la riga «Learned» dice la regola più forte e quante altre; niente se la bozza non è pronta o non segue niente', () => {
  impostaLingua('en')
  const r = imparatoDellaBozza({ stato: 'pronto', voceScritta: { regole: [CORTA, SALUTO] } }, fraseSeguita)!
  assert.equal(r.regola.chiave, SALUTO.chiave)
  assert.equal(r.frase, 'No greeting at the top of drafts')
  assert.deepEqual(r.altre.map(x => x.chiave), [CORTA.chiave])
  assert.equal(frasi.imparatoSotto(r.frase, r.regola.casi), 'Learned: No greeting at the top of drafts (3 edits)')
  assert.equal(frasi.imparatoSotto(TENUTA.testo!, 1), 'Learned: Puts the decision in the first line (1 edit)')
  assert.equal(imparatoDellaBozza({ stato: 'delegato', voceScritta: { regole: [SALUTO] } }, fraseSeguita), null)
  assert.equal(imparatoDellaBozza({ stato: 'pronto', voceScritta: { destinatario: 'Leo' } }, fraseSeguita), null)
  assert.equal(imparatoDellaBozza({ stato: 'pronto', voceScritta: null }, fraseSeguita), null)
  // una regola senza frase non si mostra
  assert.equal(imparatoDellaBozza({ stato: 'pronto', voceScritta: { regole: [{ chiave: 'x', genere: 'bozza.tono', casi: 9, dati: { tratto: 'nuovo' } }] } }, fraseSeguita), null)
  // corretta da lei: le sue parole
  assert.equal(fraseSeguita({ ...SALUTO, testo: 'Start with the point' }), 'Start with the point')
  impostaLingua('it')
  assert.equal(frasi.imparatoSotto('Nelle bozze niente saluto in apertura', 2), 'Imparato: Nelle bozze niente saluto in apertura (2 correzioni)')
})

test('il perché di una riga lasciata è una frase che la memoria legge: almeno quattro parole, senza lineette, nelle due lingue', () => {
  for (const l of ['it', 'en']) {
    impostaLingua(l)
    for (const r of ['vecchia', 'fatta', 'non_mia', 'non_chiara'] as const) {
      const f = frasi.ragioneDelCompito(r)
      assert.ok(f.trim().split(/\s+/).length >= 4, `«${f}» non insegna niente: sotto le quattro parole`)
      assert.doesNotMatch(f, /[—–]/)
    }
  }
  impostaLingua('en')
  assert.equal(frasi.guadagnato('Nora'), 'Earned: I now draft every reply to Nora.')
  assert.equal(frasi.sempreChiesta('Puts the decision first.'), 'From your edit: Puts the decision first. Always do this?')
})
