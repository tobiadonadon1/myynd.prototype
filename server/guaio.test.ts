import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GuaioFonte, RIMEDI, fraseDi, peggiore, rimedioDi } from './connettori/guaio.ts'
import { DaApprovare } from './connettori/amministratore.ts'

test('il rimedio scritto dal connettore vince, anche su un errore che non è un GuaioFonte', () => {
  assert.equal(rimedioDi(new GuaioFonte('Il token di Notion non va più.', 'credenziale')), 'credenziale')
  assert.equal(rimedioDi(Object.assign(new Error('x'), { rimedio: 'accedi' })), 'accedi')
  // un rimedio che non esiste non passa
  assert.equal(rimedioDi(Object.assign(new Error('x'), { rimedio: 'inventato' })), 'guarda')
})

test('il caso dell’amministratore, detto in due modi', () => {
  assert.equal(rimedioDi(Object.assign(new Error('x'), { amministratore: { servizio: 'github-org' } })), 'amministratore')
  assert.equal(rimedioDi(new DaApprovare('La tua azienda…', { servizio: 'gmail' })), 'amministratore')
})

test('la rete che cade è passeggera, in ogni sua forma', () => {
  for (const code of ['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'ENETUNREACH', 'EHOSTUNREACH']) {
    assert.equal(rimedioDi(Object.assign(new Error('rete'), { code })), 'attendi', code)
  }
  assert.equal(rimedioDi(new DOMException('scaduto', 'TimeoutError')), 'attendi')
  assert.equal(rimedioDi(new DOMException('fermato', 'AbortError')), 'attendi')
  assert.equal(rimedioDi(new TypeError('fetch failed')), 'attendi')
  // un TypeError qualunque è un nostro sbaglio, non la rete
  assert.equal(rimedioDi(new TypeError('Cannot read properties of undefined')), 'guarda')
  assert.equal(rimedioDi(Object.assign(new Error('x'), { code: 'EPERM' })), 'guarda')
})

test('quello che non si sa resta «guarda», anche se non è un errore', () => {
  assert.equal(rimedioDi(new Error('boh')), 'guarda')
  assert.equal(rimedioDi('una stringa'), 'guarda')
  assert.equal(rimedioDi(null), 'guarda')
  assert.equal(rimedioDi(undefined), 'guarda')
})

test('la frase si tiene solo se l’ha scritta un connettore: mai un percorso o un token', () => {
  assert.equal(fraseDi(new GuaioFonte('Il token di Notion non va più.', 'credenziale')), 'Il token di Notion non va più.')
  assert.equal(fraseDi(new Error('token=abc /Users/x/segreto a@b.it')), null)
  assert.equal(fraseDi(Object.assign(new Error('token=abc'), { rimedio: 'fantasia' })), null)
  assert.equal(fraseDi(null), null)
  assert.equal(fraseDi(new GuaioFonte('x'.repeat(500), 'guarda'))!.length, 300)
})

test('il peggiore: una causa che resta batte una passeggera, la più nuova vince, niente perde', () => {
  assert.equal(peggiore('attendi', 'credenziale'), 'credenziale')
  assert.equal(peggiore('credenziale', 'attendi'), 'credenziale')
  assert.equal(peggiore('attendi', 'attendi'), 'attendi')
  assert.equal(peggiore('permesso-disco', 'credenziale'), 'credenziale')
  assert.equal(peggiore('credenziale', 'permesso-disco'), 'permesso-disco')
  assert.equal(peggiore(null, 'attendi'), 'attendi')
  assert.equal(peggiore('guarda', null), 'guarda')
  assert.equal(peggiore(undefined, undefined), null)
})

test('l’elenco dei rimedi è quello promesso', () => {
  assert.deepEqual([...RIMEDI], ['permesso-disco', 'accedi', 'credenziale', 'amministratore', 'apri-app', 'aggiorna', 'attendi', 'guarda', 'credito'])
})
