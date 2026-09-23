// Dove si riprende il primo avvio.
//
// Chi ricaricava la pagina mentre le fonti si leggevano atterrava sugli
// estratti di una lettura mai finita: il server smette di cominciare fonti
// nuove quando la pagina se ne va. Si torna alle schede.
//
//   node --test src/avvio-passi.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'

const { momentoAllaRipresa, momentoDi } = await import('./onboarding/passi.ts')

test('a page closed while reading resumes on the sources, not on half-read excerpts', () => {
  assert.equal(momentoAllaRipresa('verifica', { leggeva: true }), 1)
  assert.equal(momentoAllaRipresa('azione', { leggeva: true }), 1)
  assert.equal(momentoAllaRipresa('fonte', { leggeva: true }), 1)
})

test('without an interrupted read, each phase opens where it was', () => {
  assert.equal(momentoAllaRipresa('progetto'), 0)
  assert.equal(momentoAllaRipresa('fonte'), 1)
  assert.equal(momentoAllaRipresa('verifica'), 2)
  assert.equal(momentoAllaRipresa('azione'), 3)
  // un avvio finito resta sul suo risultato, anche con il segno di una lettura
  assert.equal(momentoAllaRipresa('completo', { leggeva: true }), momentoDi('completo'))
  // tornando da un consenso chiesto da una scheda, si torna alle schede
  assert.equal(momentoAllaRipresa('verifica', { ritorno: true }), 1)
})
