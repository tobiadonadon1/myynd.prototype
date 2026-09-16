import { test } from 'node:test'
import assert from 'node:assert/strict'
import { consegnaPronta, messaggioConsegna, presentazioneRevisione, statoRevisione } from './consegna-ui.ts'

test('missing or unavailable review never claims a pass', () => {
  assert.equal(statoRevisione(undefined, true), 'Review unavailable — not verified')
  assert.equal(statoRevisione({ esito: 'unavailable' }, true), 'Review unavailable — not verified')
  assert.equal(statoRevisione({ esito: 'revise' }, true), 'Review found issues — needs revision')
  assert.equal(statoRevisione({ esito: 'pass' }, true), 'Review passed')
  assert.match(statoRevisione(undefined, false), /non verificato/)
})

test('compact done hand-off requires completed state and a passed review', () => {
  assert.equal(consegnaPronta({ stato: 'pronto', consegna: { revisione: { esito: 'pass' } } }), true)
  for (const stato of ['delegato', 'chiede', 'aperto']) {
    assert.equal(consegnaPronta({ stato, consegna: { revisione: { esito: 'pass' } } }), false)
  }
  for (const esito of ['revise', 'unavailable']) {
    assert.equal(consegnaPronta({ stato: 'pronto', consegna: { revisione: { esito } } }), false)
  }
  assert.equal(consegnaPronta({ stato: 'pronto', consegna: {} }), false)
  assert.equal(consegnaPronta({ stato: 'pronto' }), false)
})

test('completion message only promises Desktop when a published copy exists', () => {
  assert.doesNotMatch(messaggioConsegna({}, true), /desktop/i)
  assert.match(messaggioConsegna({ desktop: '/Users/person/Desktop/Essay.pages' }, true), /Saved to your desktop/)
  assert.match(messaggioConsegna({}, false), /documento/)
})

test('revision feed presentation stays concise and excludes execution instructions', () => {
  const revision = { id: 'rev-123', madre: 'original-1', modo: 'tutto', testo: 'Full feedback and Original task', nota: 'REVISION REQUEST' }
  assert.deepEqual(presentazioneRevisione(revision, true), {
    titolo: 'Revising your document', descrizione: 'Applying your feedback. The previous version is safe.'
  })
  assert.equal(presentazioneRevisione({ ...revision, modo: 'bozza' }, true)?.titolo, 'Revising your draft')
  assert.equal(presentazioneRevisione({ ...revision, madre: null }, true), null)
  assert.equal(presentazioneRevisione({ ...revision, id: 'ordinary-task' }, true), null)
  assert.equal(revision.nota, 'REVISION REQUEST')
})
