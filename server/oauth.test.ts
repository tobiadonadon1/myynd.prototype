// Il ballo via web: lo `state` ritrova la persona, e il ritorno scrive nel suo conto.
//
//   node --test server/oauth.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.RAILWAY_ENVIRONMENT = 'prova'
process.env.MYYND_PUBBLICO = 'myynd.esempio.it'

const oauth = await import('./connettori/oauth.ts')
const chi = await import('./chi.ts')

const sportello: import('./connettori/oauth.ts').Sportello = {
  nome: 'Prova',
  gettoni: 'https://prova.invalid/token',
  campi: { client_id: 'abc' },
  autorizza: ({ redirect, sfida, stato }) => `https://prova.invalid/auth?redirect_uri=${encodeURIComponent(redirect)}&state=${stato}&code_challenge=${sfida}`
}

test('l’avvio porta il ritorno fisso e uno state per volta', () => {
  const { dove } = chi.dentro('u1', () => oauth.avviaWeb(sportello, async () => {}))
  const u = new URL(dove)
  assert.equal(u.searchParams.get('redirect_uri'), 'https://myynd.esempio.it/api/oauth/ritorno')
  assert.ok((u.searchParams.get('state') ?? '').length >= 24)
  assert.ok((u.searchParams.get('code_challenge') ?? '').length > 20)
})

test('uno state sconosciuto non completa niente', async () => {
  await assert.rejects(() => oauth.completaWeb('non-esiste', 'codice', null), /non lo stavo aspettando/)
})

test('il no della persona si legge come tale, e lo state si consuma', async () => {
  const { dove } = chi.dentro('u1', () => oauth.avviaWeb(sportello, async () => {}))
  const stato = new URL(dove).searchParams.get('state')!
  await assert.rejects(() => oauth.completaWeb(stato, null, 'access_denied'), /Hai detto di no a Prova/)
  // consumato: la seconda volta non c'è più
  await assert.rejects(() => oauth.completaWeb(stato, 'codice', null), /non lo stavo aspettando/)
})

test('il ritorno scambia il codice e salva dentro il conto di chi aveva avviato', async () => {
  let salvatoDa: string | null = 'nessuno'
  let refresh = ''
  const { dove } = chi.dentro('anna', () => oauth.avviaWeb(sportello, async g => {
    salvatoDa = chi.adesso()
    refresh = String(g.refresh_token)
  }))
  const stato = new URL(dove).searchParams.get('state')!

  const veraFetch = globalThis.fetch
  let corpoMandato = ''
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    corpoMandato = String(init?.body ?? '')
    return new Response(JSON.stringify({ access_token: 'acc', refresh_token: 'ref-123', expires_in: 3600 }), {
      status: 200, headers: { 'content-type': 'application/json' }
    })
  }) as typeof fetch
  try {
    // il ritorno arriva senza nessun contesto: è lo state a dire di chi è
    const { nome } = await oauth.completaWeb(stato, 'il-codice', null)
    assert.equal(nome, 'Prova')
  } finally {
    globalThis.fetch = veraFetch
  }
  assert.equal(salvatoDa, 'anna')
  assert.equal(refresh, 'ref-123')
  const p = new URLSearchParams(corpoMandato)
  assert.equal(p.get('code'), 'il-codice')
  assert.equal(p.get('grant_type'), 'authorization_code')
  assert.equal(p.get('redirect_uri'), 'https://myynd.esempio.it/api/oauth/ritorno')
  assert.ok(p.get('code_verifier'))
})

test('la pagina del ritorno rimanda a Myynd, nelle due lingue, senza uscire dal riquadro', () => {
  const bene = oauth.paginaWeb(true, 'Google')
  assert.match(bene, /torno=connetti/)
  assert.match(bene, /Done\./)
  const male = oauth.paginaWeb(false, '', 'Qualcosa <b>strano</b>')
  assert.match(male, /Non è andata/)
  assert.match(male, /overflow-wrap:anywhere/)
})
