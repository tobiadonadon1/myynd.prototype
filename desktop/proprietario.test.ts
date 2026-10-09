// La password dimenticata sul Mac: prima il Mac, poi il server.
//
// Il guscio non deve mai chiamare il server se il Mac non ha detto sì: è
// l'unica cosa che rende sicuro cambiare una password senza sapere quella di
// prima. Qui il Mac è finto — nessuna finestra di Touch ID, nessun osascript.
//
//   node --test desktop/proprietario.test.ts

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { confermaProprietario, reimposta, type Sistema } from './proprietario.ts'

function mac(o: { touch: boolean; dito?: boolean; password?: 'si' | 'no' | 'annullato' }) {
  const chiesto: string[] = []
  const sistema: Sistema = {
    canPromptTouchID: () => o.touch,
    promptTouchID: async (r: string) => { chiesto.push(`touch:${r}`); if (!o.dito) throw new Error('fallito') }
  }
  const password = async (r: string) => {
    chiesto.push(`password:${r}`)
    if (o.password === 'si') return
    throw new Error(o.password === 'annullato' ? 'annullato' : 'negato')
  }
  return { sistema, password, chiesto }
}

test('Touch ID first when the Mac has it; the Mac password when it does not, or when chosen', async () => {
  const conTouch = mac({ touch: true, dito: true, password: 'si' })
  assert.equal(await confermaProprietario({ ...conTouch, ragione: 'reset' }), 'touchid')
  assert.deepEqual(conTouch.chiesto, ['touch:reset'])

  const senzaTouch = mac({ touch: false, password: 'si' })
  assert.equal(await confermaProprietario({ ...senzaTouch, ragione: 'reset' }), 'password')
  assert.deepEqual(senzaTouch.chiesto, ['password:reset'])

  const scelta = mac({ touch: true, dito: true, password: 'si' })
  assert.equal(await confermaProprietario({ ...scelta, ragione: 'reset', via: 'password' }), 'password')
  assert.deepEqual(scelta.chiesto, ['password:reset'])
})

test('a failed or cancelled confirmation never reaches the server', async () => {
  let chiamato = 0
  const chiama = async () => { chiamato++; return { token: 't', account: { email: 'io@casa.it' } } }
  await assert.rejects(reimposta({ ...mac({ touch: true, dito: false }), ragione: 'r', email: 'io@casa.it', nuova: 'nuovapassword', chiama }), /Touch ID/)
  await assert.rejects(reimposta({ ...mac({ touch: false, password: 'no' }), ragione: 'r', email: 'io@casa.it', nuova: 'nuovapassword', chiama }), /non ha confermato/)
  await assert.rejects(reimposta({ ...mac({ touch: false, password: 'annullato' }), ragione: 'r', email: 'io@casa.it', nuova: 'nuovapassword', chiama }), /Annullato/)
  // e prima ancora del Mac: un indirizzo vuoto o una password corta non chiedono niente a nessuno
  const vuoto = mac({ touch: true, dito: true })
  await assert.rejects(reimposta({ ...vuoto, ragione: 'r', email: ' ', nuova: 'nuovapassword', chiama }))
  await assert.rejects(reimposta({ ...vuoto, ragione: 'r', email: 'io@casa.it', nuova: 'corta', chiama }))
  assert.deepEqual(vuoto.chiesto, [])
  assert.equal(chiamato, 0)
})

test('after a yes, the server gets the address and the new password, and the session comes back', async () => {
  const visti: unknown[] = []
  const r = await reimposta({
    ...mac({ touch: true, dito: true }), ragione: 'r', email: ' io@casa.it ', nuova: 'nuovapassword',
    chiama: async corpo => { visti.push(corpo); return { token: 'sessione', account: { email: 'io@casa.it' } } }
  })
  assert.deepEqual(visti, [{ email: 'io@casa.it', password: 'nuovapassword' }])
  assert.equal(r.token, 'sessione')
})

test('the secret travels only shell to server: the preload never exposes it, the server gets it at start', () => {
  const leggi = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
  const preload = leggi('./preload.cjs')
  assert.match(preload, /reimpostaPassword: \(email, nuova, via\) => chiedi\('myynd:reimposta-password'/)
  assert.doesNotMatch(preload, /segreto|SEGRETO/i)
  assert.match(leggi('./server.ts'), /MYYND_GUSCIO_SEGRETO: SEGRETO/)
  assert.match(leggi('./main.ts'), /proprietario\.chiamaServer\(server\.porta, server\.segretoGuscio\(\)\)/)
})
