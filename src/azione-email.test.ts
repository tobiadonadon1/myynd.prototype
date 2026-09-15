import { test } from 'node:test'
import assert from 'node:assert/strict'
import { azioneEmail, copiaBozzaEApri } from './oggi/azione-email.ts'
import type { Compito } from './api.ts'

const riga = (valori: Partial<Compito> = {}) => ({
  doc: 'google:message-42', porta: 'pagina' as const, puoInviare: false,
  risultato: 'Prepared a reply for Marta.\n\nFriday works for me.',
  email: { a: 'marta@example.com', oggetto: 'Launch date', corpo: 'Friday works for me.', conosciuto: true },
  ...valori
})

test('Gmail/Outlook without outgoing mail offer the exact draft and original email', () => {
  for (const doc of ['google:message-42', 'microsoft:message-42']) {
    assert.deepEqual(azioneEmail(riga({ doc })), { tipo: 'copia', corpo: 'Friday works for me.', apri: true })
  }
})

test('SMTP capability and legacy capability retain the sending panel', () => {
  assert.deepEqual(azioneEmail(riga({ puoInviare: true })), { tipo: 'invia' })
  assert.deepEqual(azioneEmail(riga({ puoInviare: undefined })), { tipo: 'invia' })
})

test('email source without a structured draft uses the result; unrelated work is not called email', () => {
  assert.deepEqual(azioneEmail(riga({ email: null, risultato: 'Dear Marta, Friday works.' })), { tipo: 'copia', corpo: 'Dear Marta, Friday works.', apri: true })
  assert.deepEqual(azioneEmail(riga({ doc: 'github:pull-42', email: null })), { tipo: 'nessuna' })
  assert.deepEqual(azioneEmail(riga({ email: null, risultato: '' })), { tipo: 'nessuna' })
})

test('a draft without an exact email destination offers copy alone', () => {
  for (const valori of [{ porta: null }, { doc: null }, { doc: 'github:pull-42' }]) {
    assert.deepEqual(azioneEmail(riga(valori)), { tipo: 'copia', corpo: 'Friday works for me.', apri: false })
  }
})

test('copying honours the current user correction', () => {
  assert.deepEqual(azioneEmail(riga(), 'Monday works; Friday no longer does.'), {
    tipo: 'copia', corpo: 'Monday works; Friday no longer does.', apri: true
  })
  assert.deepEqual(azioneEmail(riga(), ''), { tipo: 'nessuna' })
})

test('the handoff copies before opening and never invokes a send or completion operation', async () => {
  const azioni: string[] = []
  assert.equal(await copiaBozzaEApri({ tipo: 'copia', corpo: 'Friday works.', apri: true }, {
    copia: async testo => { azioni.push(`copy:${testo}`); return true },
    apri: async () => { azioni.push('open'); return { ok: true, dove: 'pagina', url: 'https://mail.example.com/message-42' } }
  }), 'aperta')
  assert.deepEqual(azioni, ['copy:Friday works.', 'open'])
})

test('clipboard failure leaves the email unopened and is not reported as copied', async () => {
  assert.equal(await copiaBozzaEApri({ tipo: 'copia', corpo: 'Friday works.', apri: true }, {
    copia: async () => false,
    apri: async () => { assert.fail('do not navigate away when copying failed') }
  }), 'non-copiata')
})

test('missing source never opens a generic inbox; failed opening keeps the copied draft available', async () => {
  assert.equal(await copiaBozzaEApri({ tipo: 'copia', corpo: 'Friday works.', apri: false }, {
    copia: async () => true,
    apri: async () => { assert.fail('there is no exact email to open') }
  }), 'copiata')
  assert.equal(await copiaBozzaEApri({ tipo: 'copia', corpo: 'Friday works.', apri: true }, {
    copia: async () => true,
    apri: async () => null
  }), 'non-aperta')
})
