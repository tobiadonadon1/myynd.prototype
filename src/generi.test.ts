// Il genere di ogni fonte, per contarla con il suo nome (P4).
//
//   node --test src/generi.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { genereDi, perGenere, ORDINE_GENERI } from '../server/generi.ts'

test('each source has its kind; sent mail counts as email; the unknown is a document', () => {
  for (const f of ['posta', 'google', 'microsoft', 'postamac']) assert.equal(genereDi(f), 'email')
  for (const f of ['calendario', 'agendamac']) assert.equal(genereDi(f), 'evento')
  for (const f of ['desktop', 'lavoro', 'drive', 'dropbox', 'sharepoint']) assert.equal(genereDi(f), 'file')
  assert.equal(genereDi('note'), 'nota')
  assert.equal(genereDi('notion'), 'pagina')
  for (const f of ['slack', 'whatsapp', 'conversazioni']) assert.equal(genereDi(f), 'conversazione')
  assert.equal(genereDi('granola'), 'riunione')
  assert.equal(genereDi('x'), 'documento')
  assert.equal(genereDi('qualcosa-di-nuovo'), 'documento')
  assert.deepEqual([...ORDINE_GENERI], ['email', 'evento', 'file'])
})

test('per-source counts add up per kind, and empty sources are left out', () => {
  assert.deepEqual(perGenere([
    { fonte: 'posta', n: 300 }, { fonte: 'postamac', n: 12 }, { fonte: 'calendario', n: 42 },
    { fonte: 'desktop', n: 1200 }, { fonte: 'lavoro', n: 4 }, { fonte: 'notion', n: 0 }
  ]), { email: 312, evento: 42, file: 1204 })
  assert.deepEqual(perGenere([]), {})
})
