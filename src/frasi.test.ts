// Le frasi con dentro un numero, in tutte e due le lingue.
//
// Non è pignoleria da grammatici: «1 sources · 0 documents» è la prima riga
// che si legge aprendo Myynd il primo giorno, e una s di troppo lì dice a chi
// guarda che nessuno ha guardato. Le frasi con un numero sono quarantotto e
// nessuna aveva una prova: qui si controlla che al singolare dicano il
// singolare, e che quello che sta dentro la frase sia il numero passato — non
// una parola scritta a mano che vale solo per un caso.
//
//   node --test src/frasi.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'

// `impostaLingua` scrive anche `document.documentElement.lang` — è la riga che
// fa sparire la barra «vuoi tradurre questa pagina?» — e qui il documento non
// c'è. Due righe di finta pagina bastano, e vanno prima dell'import.
;(globalThis as unknown as { document: unknown }).document = { documentElement: { lang: '' } }
const { frasi, impostaLingua } = await import('./lingua.ts')

/** Con l'app in questa lingua, cosa dice. */
function in_(l: 'it' | 'en', f: () => string): string {
  impostaLingua(l)
  const s = f()
  impostaLingua('en')
  return s
}

test('una fonte sola non è «1 sources»', () => {
  assert.equal(in_('en', () => frasi.fontiEDocumenti(1, '1', true)), '1 source · 1 document')
  assert.equal(in_('en', () => frasi.fontiEDocumenti(3, '12', false)), '3 sources · 12 documents')
  assert.equal(in_('it', () => frasi.fontiEDocumenti(1, '1', true)), '1 fonte · 1 documento')
  assert.equal(in_('it', () => frasi.fontiEDocumenti(3, '12', false)), '3 fonti · 12 documenti')
})

test('un documento solo, ovunque lo si conti', () => {
  for (const [uno, tanti] of [
    [in_('en', () => frasi.nDocumenti('1')), in_('en', () => frasi.nDocumenti('9'))],
    [in_('en', () => frasi.documentiLetti('1')), in_('en', () => frasi.documentiLetti('9'))],
    [in_('en', () => frasi.documentiDentro('1')), in_('en', () => frasi.documentiDentro('9'))],
    [in_('it', () => frasi.nDocumenti('1')), in_('it', () => frasi.nDocumenti('9'))],
    [in_('it', () => frasi.documentiLetti('1')), in_('it', () => frasi.documentiLetti('9'))],
    [in_('it', () => frasi.documentiDentro('1')), in_('it', () => frasi.documentiDentro('9'))]
  ]) {
    assert.ok(!/documents|documenti/.test(uno), `al singolare dice il plurale: «${uno}»`)
    assert.ok(/documents|documenti/.test(tanti), `al plurale dice il singolare: «${tanti}»`)
  }
})

test('il numero che esce è quello che è entrato', () => {
  // «Posso collegarne due adesso» era scritto a mano, e usciva anche con tre
  assert.match(in_('it', () => frasi.collegabiliOra(3)), /3/)
  assert.match(in_('en', () => frasi.collegabiliOra(3)), /3/)
  assert.match(in_('it', () => frasi.collegabiliOra(1)), /uno/)
  for (const n of [1, 2, 5, 11]) {
    for (const l of ['it', 'en'] as const) {
      const s = in_(l, () => frasi.collegabiliOra(n))
      if (n > 1) assert.match(s, new RegExp(String(n)), `${l}: «${s}» non contiene ${n}`)
    }
  }
})

test('le altre frasi contate, al singolare e al plurale', () => {
  assert.equal(in_('en', () => frasi.traslocoArrivato(1, 1)), 'Arrived: 1 document, 1 automation. Reloading…')
  assert.equal(in_('it', () => frasi.traslocoArrivato(1, 1)), 'Arrivato: 1 documento, 1 automazione. Ricarico…')
  assert.match(in_('en', () => frasi.traslocoArrivato(4, 2)), /4 documents, 2 automations/)
  assert.match(in_('en', () => frasi.documentiEGruppi('1', 1)), /1 document · 1 group$/)
  assert.match(in_('en', () => frasi.documentiEGruppi('7', 3)), /7 documents · 3 groups$/)
  assert.match(in_('en', () => frasi.ritrattoAggiornato(1, 1)), /1 line rewritten, from 1 thing it/)
  assert.match(in_('it', () => frasi.ritrattoAggiornato(1, 1)), /1 riga riscritta, da 1 cosa che/)
  assert.match(in_('en', () => frasi.cartelleNonLette(1)), /^1 folder /)
  assert.match(in_('en', () => frasi.girataVolte(1)), /^Ran once$/)
  assert.match(in_('en', () => frasi.neGuarderebbe(1)), /1 document$/)
  assert.match(in_('en', () => frasi.messeDaParte(1)), /^1 thing set aside/)
  assert.match(in_('en', () => frasi.coseNuove(1)), /^One new thing/)
  assert.match(in_('en', () => frasi.daGuardare(1, 'thing')), /^One thing/)
  assert.match(in_('it', () => frasi.attiviDaCollegare(1, 2)), /^1 attivo/)
})

test('quello che ha ragionato oggi, con e senza cache', () => {
  assert.equal(in_('en', () => frasi.usoOggi(1, '5.6k', '0')), '1 call today · 5.6k tokens')
  assert.match(in_('en', () => frasi.usoOggi(4, '20k', '9k')), /4 calls today · 20k tokens \(9k from cache\)/)
  assert.equal(in_('it', () => frasi.usoOggi(1, '5.6k', '0')), '1 chiamata oggi · 5.6k token')
  assert.match(in_('it', () => frasi.usoOggi(4, '20k', '9k')), /4 chiamate oggi/)
})
