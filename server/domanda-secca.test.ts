// La domanda secca (P10): quando, chi, dove sì; scrivere, giudicare, lavorare no.
//
//   node --test server/domanda-secca.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { domandaSecca, type Contesto } from './domanda-secca.ts'

const libero: Contesto = { progettoInChat: false, compito: false, revisione: false, progettiNominati: 0, chiusura: false }

test('le domande di fatto, in inglese e in italiano, sono secche', () => {
  for (const q of ['When is my call with Luca?', 'Who sent the Q3 invoice?', 'Quando scade il contratto con Rossi?', 'A che ora è la riunione con Nora?', 'and where is the offsite?', 'How many invoices came from Harbor Labs?'])
    assert.equal(domandaSecca(q, libero), true, q)
})

test('scrivere, giudicare, due frasi o troppe parole non lo sono', () => {
  const lunga = 'When is the call with Luca and Nora and Priya about the pilot order next week please?'
  assert.equal(lunga.split(' ').length, 17)
  for (const q of [
    'Should I reply to Marco today?', 'Write Anna a two-line yes', 'Riassumi la mail di Luca', 'Write a reply to Rossi?',
    'Who is Leo? Draft him a note.', 'Is the pilot worth it?', 'Quando rispondo a Marco?',
    lunga, 'When?', '', 'Which is better, Friday or Monday?',
    'Who should I send the invoice to?'
  ]) assert.equal(domandaSecca(q, libero), false, q)
  // «send» è un verbo che produce, anche dentro una domanda di fatto: nel dubbio no
  assert.equal(domandaSecca('How many emails did Nora send?', libero), false)
  // esattamente quindici parole: una di troppo
  assert.equal(domandaSecca('When is the call with Luca and Nora and Priya about the pilot order today?', libero), false)
  // quattordici: ancora secca
  assert.equal(domandaSecca('When is the call with Luca and Nora and Priya about the pilot order?', libero), true)
})

test('in una chat di progetto, su un compito, per una revisione, alla chiusura, o con un progetto nominato: mai', () => {
  const q = 'When is the call?'
  assert.equal(domandaSecca(q, libero), true)
  assert.equal(domandaSecca(q, { ...libero, progettoInChat: true }), false)
  assert.equal(domandaSecca(q, { ...libero, compito: true }), false)
  assert.equal(domandaSecca(q, { ...libero, revisione: true }), false)
  assert.equal(domandaSecca(q, { ...libero, chiusura: true }), false)
  assert.equal(domandaSecca(q, { ...libero, progettiNominati: 1 }), false)
})
