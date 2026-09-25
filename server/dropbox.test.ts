// Il guaio di Dropbox porta il suo rimedio: un nuovo accesso, o solo aspettare.
//
//   node --test server/dropbox.test.ts

import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Config } from './config.ts'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-dropbox-'))
process.env.MYYND_DATI = CASA
const cfg = await import('./config.ts')
const dropbox = await import('./connettori/dropbox.ts')
const { GuaioFonte } = await import('./connettori/guaio.ts')

const VERA = globalThis.fetch
after(() => { globalThis.fetch = VERA; rmSync(CASA, { recursive: true, force: true }) })
beforeEach(() => {
  dropbox.scordaIlToken()
  cfg.scrivi({ dropbox: { chiave: 'chiave-finta', refresh: 'refresh-finto' } } as Config)
})

/** Dropbox finto: il token si rinnova, e l'elenco risponde con lo stato che si vuole. */
function risponde(stato: number, token: Response | null = null) {
  globalThis.fetch = (async (url: string | URL) => {
    if (String(url).includes('oauth2/token')) return token ?? Response.json({ access_token: 'a', expires_in: 3600, token_type: 'bearer' })
    return new Response('{}', { status: stato })
  }) as typeof fetch
}

test('un 401 è «accedi», un 429 è passeggero', async () => {
  risponde(401)
  let e = await dropbox.sincronizza({ giorni: 30 } as never).catch(x => x)
  assert.ok(e instanceof GuaioFonte)
  assert.equal(e.rimedio, 'accedi')
  dropbox.scordaIlToken()
  risponde(429)
  e = await dropbox.sincronizza({ giorni: 30 } as never).catch(x => x)
  assert.equal(e.rimedio, 'attendi')
})

test('un permesso duraturo che Dropbox non riconosce più è «accedi»', async () => {
  risponde(200, Response.json({ error: 'invalid_grant' }, { status: 400 }))
  const e = await dropbox.sincronizza({ giorni: 30 } as never).catch(x => x)
  assert.equal(e.rimedio, 'accedi')
  assert.equal(e.message, 'Quel codice non è più valido: rifai il collegamento.')
})

test('un 500 non si sa: nessun rimedio scritto (counter-case)', async () => {
  risponde(500)
  const e = await dropbox.sincronizza({ giorni: 30 } as never).catch(x => x)
  assert.ok(e instanceof Error)
  assert.equal((e as { rimedio?: string }).rimedio, undefined)
})
