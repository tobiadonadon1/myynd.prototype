import { test } from 'node:test'
import assert from 'node:assert/strict'
import { testoParziale } from './chatgpt-stream.ts'

test('answer streams before the structured response is complete without leaking tool arguments', () => {
  const answer = 'Your goal is to launch.\nNext: “pilot” 🚀'
  const wire = JSON.stringify({ text: answer, calls: [{ name: 'read', arguments: '{"secret":"not answer"}' }] })
  let previous = ''
  for (let i = 0; i <= wire.length; i++) {
    const value = testoParziale(wire.slice(0, i))
    assert.ok(answer.startsWith(value))
    assert.ok(value.startsWith(previous))
    previous = value
  }
  assert.equal(previous, answer)
  assert.equal(testoParziale('{"text":"Reply is arriv'), 'Reply is arriv')
})
test('nested text properties and escapes cannot be mistaken for the answer', () => {
  assert.equal(testoParziale('{"calls":[{"text":"hidden","arguments":"{\\"text\\":\\"hidden\\"}"}],"text":"Visible'), 'Visible')
  assert.equal(testoParziale('{"calls":[{"text":"hidden"}]}'), '')
  assert.equal(testoParziale('{"text":"Hello\\uD83D'), 'Hello')
  assert.equal(testoParziale('{"text":"Hello\\uD83D\\uDE80'), 'Hello🚀')
  assert.equal(testoParziale('{"text":"Line\\'), 'Line')
})
