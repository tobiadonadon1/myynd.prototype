// La distanza fra la bozza e quello che è partito.
//
//   node --test server/ritocco.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ritocco, classe, parole, SOGLIA_RITOCCO, SOGLIA_MODIFICATO, PAROLE_MAX } from './ritocco.ts'

test('le parole: minuscole, senza punteggiatura, con gli accenti', () => {
  assert.deepEqual(parole('Ciao Marco, è tutto pronto!'), ['ciao', 'marco', 'è', 'tutto', 'pronto'])
  assert.deepEqual(parole('  '), [])
  assert.deepEqual(parole(null), [])
})

test('identici, anche se cambiano maiuscole, spazi e punteggiatura', () => {
  assert.equal(ritocco('Ciao Marco, ecco il preventivo.', 'ciao marco ecco il preventivo'), 0)
  assert.equal(ritocco('Una  riga\n\ncon   spazi', 'una riga con spazi'), 0)
  assert.equal(classe(ritocco('Ciao Marco!', 'Ciao, Marco.')), 'identico')
})

test('due vuoti sono identici; uno vuoto e uno pieno sono all’opposto', () => {
  assert.equal(ritocco('', ''), 0)
  assert.equal(ritocco(null, undefined), 0)
  assert.equal(ritocco('', 'qualcosa di scritto'), 1)
  assert.equal(ritocco('qualcosa di scritto', ''), 1)
})

test('una parola cambiata su dieci è un ritocco', () => {
  const a = 'ciao marco ti mando il preventivo per la fornitura di ottobre'
  const b = 'ciao marco ti mando il preventivo per la fornitura di novembre'
  const r = ritocco(a, b)
  assert.ok(Math.abs(r - 1 / 11) < 1e-9, `distanza ${r}`)
  assert.equal(classe(r), 'ritocco')
})

test('una parola aggiunta o tolta costa una', () => {
  assert.equal(ritocco('uno due tre quattro', 'uno due tre'), 1 / 4)
  assert.equal(ritocco('uno due tre', 'uno due tre quattro'), 1 / 4)
  assert.equal(ritocco('uno tre', 'uno due tre'), 1 / 3)
})

test('lo stesso testo in un ordine diverso non è identico', () => {
  // il contro-caso: le stesse parole non bastano, conta l'ordine
  const r = ritocco('prima seconda terza quarta', 'quarta terza seconda prima')
  assert.ok(r > 0)
  assert.equal(classe(r), 'riscritto')
})

test('metà cambiata è modificato; quasi tutto cambiato è riscritto', () => {
  const r1 = ritocco('a b c d e f g h i j', 'a b c d e f v w x y')   // 4 su 10
  assert.equal(r1, 0.4)
  assert.equal(classe(r1), 'modificato')
  const r2 = ritocco('a b c d e f g h i j', 'a b q r s t u v w x')   // 8 su 10
  assert.equal(classe(r2), 'riscritto')
  assert.equal(classe(ritocco('buongiorno dottore', 'ciao amico mio')), 'riscritto')
})

test('le soglie sono comprese nella classe più mite', () => {
  assert.equal(classe(0), 'identico')
  assert.equal(classe(SOGLIA_RITOCCO), 'ritocco')
  assert.equal(classe(SOGLIA_RITOCCO + 1e-9), 'modificato')
  assert.equal(classe(SOGLIA_MODIFICATO), 'modificato')
  assert.equal(classe(SOGLIA_MODIFICATO + 1e-9), 'riscritto')
  assert.equal(classe(1), 'riscritto')
})

test('è simmetrica e sta fra zero e uno', () => {
  const a = 'Hi Anna, the quote is attached. Best, Tobia'
  const b = 'Hello Anna, here is the quote for the spring order. Thanks, Tobia'
  const r = ritocco(a, b)
  assert.equal(r, ritocco(b, a))
  assert.ok(r > 0 && r <= 1)
})

test('cinquemila parole si confrontano in fretta', () => {
  const base = Array.from({ length: 5000 }, (_, i) => `parola${i % 700}`).join(' ')
  const cambiato = base.replace(/parola13\b/g, 'altra')
  const t = performance.now()
  const r = ritocco(base, cambiato)
  const ms = performance.now() - t
  assert.ok(r > 0 && r < SOGLIA_RITOCCO, `distanza ${r}`)
  assert.ok(ms < 2000, `ci ha messo ${Math.round(ms)} ms`)
})

test('oltre il tetto si confronta la testa', () => {
  const testa = Array.from({ length: PAROLE_MAX }, (_, i) => `p${i}`).join(' ')
  // cambiare solo quello che sta dopo il tetto non conta
  assert.equal(ritocco(`${testa} coda uno`, `${testa} coda due`), 0)
  // cambiare dentro il tetto sì
  assert.ok(ritocco(`zero ${testa}`, testa) > 0)
})
