// Gli schemi stretti di Codex, e i nostri campi facoltativi.
//   node --test server/chatgpt-schema.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rigido, senzaNulli } from './chatgpt.ts'
import { formaRicetta } from './automazioni.ts'

test('ogni proprietà diventa richiesta, e quella facoltativa ammette null', () => {
  const s = rigido(formaRicetta() as Record<string, unknown>) as { required: string[]; properties: Record<string, { type: unknown; enum?: unknown[] }>; additionalProperties: boolean }
  assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort(), 'tutte le proprietà sono in required')
  assert.equal(s.additionalProperties, false)
  assert.deepEqual(s.properties.giorno.type, ['number', 'null'], '«giorno» era facoltativo: adesso può essere null')
  assert.equal(s.properties.nome.type, 'string', 'quello che era richiesto resta com’era')
  const passi = s.properties.passi as unknown as { items: { required: string[]; additionalProperties: boolean } }
  assert.deepEqual([...passi.items.required].sort(), ['id', 'testo', 'tipo'])
})

test('i null dei campi facoltativi spariscono dalla risposta, gli altri restano', () => {
  const forma = formaRicetta() as Record<string, unknown>
  const risposta = { nome: 'Preventivi', giorno: null, ora: 8, cerca: '', cartella: null, passi: [{ id: 'a', tipo: 'condizione', testo: 'x' }], en: { nome: 'Quotes', cerca: '' } }
  const pulita = senzaNulli(risposta, forma) as Record<string, unknown>
  assert.equal('giorno' in pulita, false, '«giorno» era facoltativo: il null sparisce')
  assert.equal('cartella' in pulita, false)
  assert.equal(pulita.cerca, '', 'un campo richiesto resta, anche vuoto')
  assert.equal(pulita.ora, 8)
  assert.deepEqual(pulita.passi, [{ id: 'a', tipo: 'condizione', testo: 'x' }])
  assert.deepEqual(pulita.en, { nome: 'Quotes', cerca: '' })
})
