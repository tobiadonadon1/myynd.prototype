import { test } from 'node:test'
import assert from 'node:assert/strict'
import { azioniConnessioneChatGPT, controllaAccessoChatGPT, nomePianoChatGPT } from './chatgpt-accesso.ts'
import type { AccessoChatGPT, ChatGPT } from './api.ts'

const stato = (entrato = false): ChatGPT => ({ installato: true, entrato, acceso: false })
const niente = () => {}

test('a fresh customer can sign in from Myynd without a pre-existing account', () => {
  assert.deepEqual(azioniConnessioneChatGPT(stato(), false, false), { accesso: 'collega', usa: false, disattiva: false, runtimeMancante: false })
})

test('an existing account always has a route to connect a different account', () => {
  for (const selected of [false, true]) assert.equal(azioniConnessioneChatGPT({ ...stato(true), acceso: selected }, selected, false).accesso, 'altro')
  assert.equal(azioniConnessioneChatGPT(stato(true), true, false).usa, true, 'an off account can be re-enabled')
})

test('a pending switch cannot enable the old account or start a second login', () => {
  assert.deepEqual(azioniConnessioneChatGPT({ ...stato(true), acceso: true }, true, true), { accesso: null, usa: false, disattiva: false, runtimeMancante: false })
})

test('missing packaged runtime and status loading never offer a broken sign-in action', () => {
  assert.deepEqual(azioniConnessioneChatGPT(null, false, false), { accesso: null, usa: false, disattiva: false, runtimeMancante: false })
  assert.deepEqual(azioniConnessioneChatGPT({ installato: false, entrato: false, acceso: false }, false, false), { accesso: null, usa: false, disattiva: false, runtimeMancante: true })
})

test('only recognized public plan names are displayed', () => {
  assert.equal(nomePianoChatGPT(' PLUS '), 'Plus')
  assert.equal(nomePianoChatGPT('business'), 'Business')
  assert.equal(nomePianoChatGPT('prolite'), '')
  assert.equal(nomePianoChatGPT(undefined), '')
})

test('successful sign-in stops checking without enabling a provider', async () => {
  let chiamate = 0
  await new Promise<void>((resolve, reject) => {
    controllaAccessoChatGPT({
      leggi: async () => { chiamate++; return { stato: 'completed' } },
      entrato: resolve, errore: reject, terminato: () => reject(new Error('sign-in failed')),
      scaduto: () => reject(new Error('successful sign-in must cancel its deadline'))
    }, { durata: 2000, intervallo: 1 })
  })
  assert.equal(chiamate, 1)
})

test('cancelling aborts an in-flight read and ignores its late result', async () => {
  let signal: AbortSignal | undefined
  let risolvi!: (value: AccessoChatGPT) => void
  const eventi: string[] = []
  const ferma = controllaAccessoChatGPT({
    leggi: s => { signal = s; return new Promise(resolve => { risolvi = resolve }) },
    entrato: () => eventi.push('signed in'), terminato: () => eventi.push('ended'), errore: () => eventi.push('error'), scaduto: () => eventi.push('timeout')
  }, { durata: 2000, intervallo: 1 })
  ferma()
  assert.equal(signal?.aborted, true)
  risolvi({ stato: 'completed' }); await Promise.resolve(); await Promise.resolve()
  assert.deepEqual(eventi, [])
})

test('the deadline aborts even a server that never answers', async () => {
  let signal: AbortSignal | undefined
  let chiamate = 0
  await new Promise<void>(resolve => {
    controllaAccessoChatGPT({
      leggi: s => { chiamate++; signal = s; return new Promise(() => {}) },
      terminato: niente, entrato: () => assert.fail('not authenticated'), errore: niente, scaduto: resolve
    }, { durata: 5, intervallo: 1 })
  })
  assert.equal(signal?.aborted, true)
  assert.equal(chiamate, 1)
})

test('pending sign-in and transient failures are retried until authentication succeeds', async () => {
  let chiamate = 0, errori = 0
  await new Promise<void>((resolve, reject) => {
    controllaAccessoChatGPT({
      leggi: async () => { if (++chiamate === 2) throw new Error('temporary'); return { stato: chiamate === 3 ? 'completed' : 'pending' } },
      terminato: () => reject(new Error('sign-in failed')), entrato: resolve, errore: () => { errori++ },
      scaduto: () => reject(new Error('authentication did not complete'))
    }, { durata: 2000, intervallo: 1 })
  })
  assert.equal(chiamate, 3)
  assert.equal(errori, 1)
})

test('an already-connected account does not complete a different pending sign-in', async () => {
  const accountPrecedente = stato(true)
  let controlli = 0
  await new Promise<void>((resolve, reject) => {
    controllaAccessoChatGPT({
      leggi: async () => { controlli++; return { stato: controlli === 3 ? 'completed' : 'pending', account: accountPrecedente } },
      entrato: resolve, errore: reject, terminato: () => reject(new Error('sign-in failed')),
      scaduto: () => reject(new Error('sign-in timed out'))
    }, { durata: 2000, intervallo: 1 })
  })
  assert.equal(controlli, 3, 'only completion of the requested login ends the poll')
})

test('failed or cancelled sign-ins finish without being treated as connected', async () => {
  for (const risultato of ['failed', 'cancelled'] as const) {
    let controlli = 0
    const esito = await new Promise<AccessoChatGPT>((resolve, reject) => {
      controllaAccessoChatGPT({
        leggi: async () => { controlli++; return { stato: risultato, errore: 'User declined' } },
        entrato: () => reject(new Error('failed login cannot connect')), terminato: resolve, errore: reject,
        scaduto: () => reject(new Error('terminal state must cancel the timeout'))
      }, { durata: 2000, intervallo: 1 })
    })
    assert.equal(esito.stato, risultato)
    assert.equal(controlli, 1)
  }
})
