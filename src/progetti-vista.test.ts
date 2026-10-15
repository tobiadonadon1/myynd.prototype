// Le parole della pagina dei Progetti: quanto tempo fa, corto, e cosa ha letto.
//
//   node --test src/progetti-vista.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { daQuando, lettoInRiga, nomeDelGenere } from './progetti-vista.ts'

const ADESSO = new Date(2026, 9, 15, 18, 0).getTime()

test('quanto tempo fa: minuti e ore per un istante, giorni per una data al giorno', () => {
  assert.equal(daQuando(new Date(ADESSO - 5 * 60_000).toISOString(), ADESSO), '5 min ago')
  assert.equal(daQuando(new Date(ADESSO - 3 * 3_600_000).toISOString(), ADESSO), '3h ago')
  assert.equal(daQuando(new Date(ADESSO - 30 * 3_600_000).toISOString(), ADESSO), 'yesterday')
  assert.equal(daQuando(new Date(ADESSO - 4 * 86_400_000).toISOString(), ADESSO), '4 days ago')
  // una cartella col commit di oggi non dice «6h ago»: la data è al giorno
  assert.equal(daQuando('2026-10-15T12:00:00.000Z', ADESSO), 'today')
  assert.equal(daQuando('2026-10-14T12:00:00.000Z', ADESSO), 'yesterday')
  assert.match(daQuando('2026-09-01T12:00:00.000Z', ADESSO), /Sep|1/, 'oltre due settimane, la data')
  assert.equal(daQuando(null, ADESSO), '')
  assert.equal(daQuando('non una data', ADESSO), '')
})

test('cosa ha letto: un nome per genere, uno sconosciuto è «altre fonti»', () => {
  assert.equal(lettoInRiga([{ tipo: 'posta', quanti: 3 }, { tipo: 'cartelle', quanti: 1 }]), 'Mail 3 · Code folders 1')
  assert.equal(nomeDelGenere('chissà'), 'Other sources')
  assert.equal(lettoInRiga([]), '')
})
