import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dataFonte, testoCarta, secondaRiga, RAGIONI_NON_UTILE } from './feed-carta.ts'

test('task, request and project reason remain separate readable copy', () => {
  assert.deepEqual(testoCarta({
    titolo: '**Reply to Marta about the launch date**',
    testo: 'Marta needs your confirmation by Friday.\nAsk whether Tuesday works before approving.',
    perche: 'The website launch depends on this date.'
  }), {
    titolo: 'Reply to Marta about the launch date',
    testo: 'Marta needs your confirmation by Friday.\nAsk whether Tuesday works before approving.',
    perche: 'The website launch depends on this date.'
  })
})

test('identical AI filler is not repeated in title, description and reason', () => {
  assert.deepEqual(testoCarta({ titolo: 'Reply to Marta', testo: '**Reply to Marta.**', perche: 'Reply to Marta.' }), {
    titolo: 'Reply to Marta', testo: '', perche: ''
  })
  assert.equal(testoCarta({ titolo: 'Reply to Marta', testo: 'Confirm Friday.', perche: 'Confirm Friday.' }).perche, '')
})

test('a similar but meaningful deadline or constraint is not dropped', () => {
  assert.deepEqual(testoCarta({ titolo: 'Reply to Marta', testo: 'Reply to Marta by Friday.', perche: 'Do not confirm a date before checking the supplier.' }), {
    titolo: 'Reply to Marta', testo: 'Reply to Marta by Friday.', perche: 'Do not confirm a date before checking the supplier.'
  })
  assert.equal(testoCarta({ titolo: 'Confirm $100', testo: 'Confirm $1.00' }).testo, 'Confirm $1.00')
  assert.equal(testoCarta({ titolo: 'Use option A+B', testo: 'Use option A-B' }).testo, 'Use option A-B')
})

test('missing legacy copy does not break the entire feed', () => {
  assert.deepEqual(testoCarta({ titolo: 'Reply to Marta', testo: null as unknown as string, perche: null }), {
    titolo: 'Reply to Marta', testo: '', perche: ''
  })
})

test('regenerating a card cannot make an old document appear newly received', () => {
  assert.equal(dataFonte({ doc: 'desktop:cv.pdf', quando: '2026-09-14T15:00:00Z', fonteQuando: '2024-06-01T12:00:00Z' }), '2024-06-01T12:00:00Z')
  assert.equal(dataFonte({ doc: 'posta:INBOX:2', quando: '2026-09-14T15:00:00Z' }), null)
  assert.equal(dataFonte({ doc: null, quando: '2026-09-14T15:00:00Z' }), '2026-09-14T15:00:00Z')
})

// — P2: «Non utile» con una ragione, e la seconda riga di ogni carta —

test('le quattro ragioni, nell’ordine in cui si mostrano, con le loro etichette', () => {
  assert.deepEqual(RAGIONI_NON_UTILE.map(r => r.ragione), ['vecchia', 'fatta', 'non_mia', 'non_chiara'])
  assert.deepEqual(RAGIONI_NON_UTILE.map(r => r.etichetta), ['Vecchia', 'Già fatta', 'Non è mia', 'Non si capisce'])
})

test('la seconda riga è il perché oggi, anche per una priorità; il testo va nel dettaglio; senza perché resta il testo', () => {
  assert.deepEqual(secondaRiga({ titolo: 'Record the review video', testo: 'The resubmission waits on it.', perche: 'The review video must be recorded before we resubmit.' }),
    { riga: 'The review video must be recorded before we resubmit.', dettaglio: ['The resubmission waits on it.'] })
  assert.deepEqual(secondaRiga({ titolo: 'Reply to Marta', testo: 'Marta needs your confirmation by Friday.', perche: '' }),
    { riga: 'Marta needs your confirmation by Friday.', dettaglio: [] })
  assert.deepEqual(secondaRiga({ titolo: 'Reply to Marta', testo: 'Marta needs your confirmation by Friday.', perche: null }),
    { riga: 'Marta needs your confirmation by Friday.', dettaglio: [] })
  // un perché uguale al titolo non si ripete: resta il testo
  assert.deepEqual(secondaRiga({ titolo: 'Reply to Marta', testo: 'Marta is waiting.', perche: 'Reply to Marta.' }),
    { riga: 'Marta is waiting.', dettaglio: [] })
})
