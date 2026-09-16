import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaRevisoreVisivo } from './revisione-visiva.ts'
import type Anthropic from '@anthropic-ai/sdk'
import type { Motore } from './modello.ts'
const dir = mkdtempSync(join(tmpdir(), 'myynd-visual-review-'))
process.once('exit', () => rmSync(dir, { recursive: true, force: true }))
// Header fixture for transport tests; no network/model is called by these tests.
const png = Buffer.alloc(33); Buffer.from([137,80,78,71,13,10,26,10]).copy(png); png.write('IHDR',12); png.writeUInt32BE(800,16); png.writeUInt32BE(1100,20)
const path = join(dir, 'page.png'); writeFileSync(path, png)
const good = { pagine: [{ pagina: 1, esito: 'pass', osservazione: 'A dark title above two evenly spaced paragraphs with clear margins.', problemi: [] }] }
function review(response: unknown, inspect?: (p: any) => void, tipo: Motore['tipo'] = 'chatgpt') {
  return creaRevisoreVisivo({ parametri: () => ({ model: 'test' }), motore: () => ({ tipo, flusso: async (p: Anthropic.MessageStreamParams) => { inspect?.(p); return { model: 'test-vision', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(response) }] } } } as unknown as Motore) })
}
test('sends actual image bytes to selected provider and retains hashed page evidence', async () => {
  let images = 0
  const result = await review(good, p => { images = p.messages[0].content.filter((b: any) => b.type === 'image').length; assert.equal(p.messages[0].content.find((b: any) => b.type === 'image').source.data, png.toString('base64')) })({ pagine: [path] })
  assert.equal(images, 1); assert.equal(result.esito, 'pass'); assert.equal(result.pagine[0].sha256.length, 64); assert.equal(result.pagine[0].larghezza, 800)
})
test('any concrete problem overrides an inconsistent provider pass', async () => {
  const r = await review({ pagine: [{ ...good.pagine[0], problemi: ['Bottom paragraph is clipped.'] }] })({ pagine: [path] })
  assert.equal(r.esito, 'revise'); assert.match(r.problemi[0], /Page 1/)
})
test('missing pages, duplicate page numbers, empty observations and invalid JSON shapes never pass', async () => {
  for (const response of [{}, {pagine: []}, {pagine: [{...good.pagine[0], pagina: 2}]}, {pagine: [{...good.pagine[0], osservazione: ''}]}, {pagine: [{...good.pagine[0], problemi: [42]}]}]) assert.equal((await review(response)({pagine:[path]})).esito, 'unavailable')
})
test('text-only compatible providers never receive a request or claim visual review', async () => {
  const r = await review(good, () => assert.fail('must not send image to a text-only transport'), 'compatibile')({ pagine: [path] })
  assert.equal(r.esito, 'unavailable'); assert.equal(r.pagine.length, 1)
})
test('missing and invalid image files fail before model invocation', async () => {
  const run = review(good, () => assert.fail('must not call provider'))
  assert.equal((await run({ pagine: [join(dir, 'absent')] })).esito, 'unavailable')
  assert.equal((await run({ pagine: [] })).esito, 'unavailable')
  const wrong = join(dir, 'wrong.png'); writeFileSync(wrong, 'text pretending to be screenshot')
  assert.equal((await run({ pagine: [wrong] })).esito, 'unavailable')
})
test('cancellation propagates and cannot be mistaken for a visual pass', async () => {
  const controller = new AbortController(); controller.abort()
  await assert.rejects(review(good)({ pagine: [path] }, controller.signal), /abort/i)
})
