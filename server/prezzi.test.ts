// Il listino (F9): quanto costa una chiamata, in micro-dollari.
//
//   node --test server/prezzi.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PREZZI, costo, costoEsatto, daDollari } from './prezzi.ts'
import { MODELLI } from './config.ts'

test('ogni modello che si può scegliere ha un prezzo, con la cache a un decimo e a un quarto in più', () => {
  for (const m of MODELLI) {
    const p = PREZZI[m.id]
    assert.ok(p, `${m.id} non ha un prezzo`)
    assert.equal(p.cacheLettura, p.entrata * 0.1)
    assert.equal(p.cacheScrittura, p.entrata * 1.25)
    assert.ok(p.uscita > p.entrata)
  }
})

test('il costo: entrata, uscita, cache letta e scritta, in micro-dollari interi', () => {
  // Sonnet 5: 2 $ e 10 $ per milione → 2 e 10 micro-dollari a token
  assert.equal(costo('claude-sonnet-5', { entrata: 1000, uscita: 100 }), 3000)
  assert.equal(costo('claude-sonnet-5', { entrata: 0, uscita: 0, cache: 10_000 }), 2000)
  assert.equal(costo('claude-sonnet-5', { entrata: 0, uscita: 0, scritti: 1000 }), 2500)
  // Opus 5 cinque volte Haiku, sull'entrata
  assert.equal(costo('claude-opus-5', { entrata: 1_000_000, uscita: 0 }), 5_000_000)
  assert.equal(costo('claude-haiku-4-5', { entrata: 1_000_000, uscita: 0 }), 1_000_000)
  assert.ok(Number.isInteger(costo('claude-haiku-4-5', { entrata: 3, uscita: 7, cache: 11 })!))
})

test('il listino del 9 ottobre: Opus 5.5 4/20, Sonnet 5.5 2/10, Haiku 5.5 0,10/0,50, la cache letta a un decimo', () => {
  assert.equal(costo('claude-opus-5-5', { entrata: 1_000_000, uscita: 1_000_000 }), 24_000_000)
  assert.equal(costo('claude-sonnet-5-5', { entrata: 1_000_000, uscita: 1_000_000 }), 12_000_000)
  assert.equal(costo('claude-haiku-5-5', { entrata: 1_000_000, uscita: 1_000_000 }), 600_000)
  assert.equal(costo('claude-haiku-5-5', { entrata: 0, uscita: 0, cache: 1_000_000 }), 10_000)
  assert.equal(costo('claude-opus-5-5', { entrata: 0, uscita: 0, cache: 1_000_000 }), 400_000)
})

test('un modello senza prezzo non ha un costo, e i numeri storti non contano', () => {
  assert.equal(costo('finto', { entrata: 1000, uscita: 100 }), null)
  assert.equal(costo(null, { entrata: 1000, uscita: 100 }), null)
  assert.equal(costo('claude-sonnet-5', { entrata: -5, uscita: Number.NaN }), 0)
})

test('i dollari di Claude Code, e quali motori dicono il costo vero', () => {
  assert.equal(daDollari(0.0123), 12_300)
  assert.equal(daDollari('0.1'), null)
  assert.equal(daDollari(-1), null)
  assert.equal(costoEsatto('claude-sonnet-5'), true)
  assert.equal(costoEsatto('Claude account'), true)
  assert.equal(costoEsatto('Claude account (stima)'), false)
  assert.equal(costoEsatto('ChatGPT subscription'), false)
})
