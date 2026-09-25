// La prova non può scrivere, per come è fatta (P6): la parte statica.
//
// collaudo.ts e stesura.ts non importano niente che scriva nella lista o fuori
// dal Mac, e non nominano nessuna delle scritture vere; prova-chiusa.ts non
// conosce nessuno; automazioni.ts non conosce la prova né il vassoio.
//
//   node --test server/collaudo-sicuro.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const leggi = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url), 'utf8')
const importi = (testo: string) => [...testo.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)].map(m => m[1])
  .concat([...testo.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1]))

const VIETATI = ['./compiti.ts', './invio.ts', './mailbox-drafts.ts', './postaUscita.ts', './agenda.ts', './vassoio.ts']
const NOMI = /\b(?:scriviCompito|affida|risultatoCompito|registraAzione|automazioneGirata|segnaBozza|salvaBozzaCasella|salvaConsegna|cestina|archivia)\b|\bproponi\(|\bmanda\(|\binvia\(/

for (const f of ['collaudo.ts', 'stesura.ts']) {
  test(`${f} non importa niente che scriva nella lista o fuori`, () => {
    const i = importi(leggi(f))
    for (const v of VIETATI) assert.ok(!i.includes(v), `${f} importa ${v}`)
    assert.ok(!i.some(x => x.startsWith('./connettori/')), `${f} importa un connettore`)
  })
  test(`${f} non nomina nessuna scrittura vera`, () => {
    const m = leggi(f).match(NOMI)
    assert.equal(m, null, `${f} nomina ${m?.[0]}`)
  })
}

test('prova-chiusa.ts importa solo node:async_hooks', () => {
  assert.deepEqual(importi(leggi('prova-chiusa.ts')), ['node:async_hooks'])
})

test('automazioni.ts non conosce la prova né il vassoio', () => {
  const i = importi(leggi('automazioni.ts'))
  assert.ok(!i.includes('./collaudo.ts'))
  assert.ok(!i.includes('./vassoio.ts'))
})

test('la regola dei nomi coglie quello che deve (controcaso)', () => {
  assert.match('store.scriviCompito(x)', NOMI)
  assert.match('compiti.affida(id)', NOMI)
  assert.doesNotMatch('una riga affidata a Myynd', NOMI)
  assert.doesNotMatch('const domanda = x', NOMI)
})
