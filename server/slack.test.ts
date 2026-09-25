// Il guaio di Slack porta il suo rimedio: un token da rifare, o solo aspettare.
//
//   node --test server/slack.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { sincronizza } from './connettori/slack.ts'
import { GuaioFonte } from './connettori/guaio.ts'

const VERA = globalThis.fetch
after(() => { globalThis.fetch = VERA })
const C = { token: 'xoxp-finto' }

const risponde = (corpo: unknown, init: ResponseInit = {}) => {
  globalThis.fetch = (async () => Response.json(corpo, init)) as typeof fetch
}

test('un token non valido, revocato o senza permessi è «credenziale», con la frase di sempre', async () => {
  for (const error of ['invalid_auth', 'not_authed', 'token_revoked', 'account_inactive', 'missing_scope']) {
    risponde({ ok: false, error })
    const e = await sincronizza(C).catch(x => x)
    assert.ok(e instanceof GuaioFonte, error)
    assert.equal(e.rimedio, 'credenziale', error)
  }
  risponde({ ok: false, error: 'invalid_auth' })
  assert.equal((await sincronizza(C).catch(x => x)).message, 'Il token di Slack non è valido.')
})

test('«rallenta» è passeggero, detto nel corpo o con un 429 che non passa', async () => {
  risponde({ ok: false, error: 'ratelimited' })
  assert.equal((await sincronizza(C).catch(x => x)).rimedio, 'attendi')
  risponde({}, { status: 429, headers: { 'retry-after': '0' } })
  const e = await sincronizza(C).catch(x => x)
  assert.equal(e.rimedio, 'attendi')
  assert.equal(e.message, 'Slack ha detto di rallentare. Riprovo più tardi.')
})

test('un errore che non conosciamo resta «guarda» (counter-case)', async () => {
  risponde({ ok: false, error: 'channel_not_found' })
  assert.equal((await sincronizza(C).catch(x => x)).rimedio, 'guarda')
})
