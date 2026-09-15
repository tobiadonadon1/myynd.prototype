import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dataFonte, testoCarta } from './feed-carta.ts'

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
