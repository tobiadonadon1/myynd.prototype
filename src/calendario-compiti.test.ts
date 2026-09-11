import { test } from 'node:test'
import assert from 'node:assert/strict'
import { giornoLocale, giornoCompito, giorniVisibili, inizioSettimana, quantiGiorni, secchioDelGiorno, spostaGiorno } from './oggi/giorni.ts'
import { secchioVivo } from './oggi/secchi.ts'

test('calendar days cross month/year and leap days without UTC conversion', () => {
  assert.equal(spostaGiorno('2026-12-31', 1), '2027-01-01')
  assert.equal(spostaGiorno('2024-02-28', 1), '2024-02-29')
  assert.equal(spostaGiorno('2026-03-01', -1), '2026-02-28')
  assert.equal(inizioSettimana('2026-09-13'), '2026-09-07')
})

test('planner shows readable adjacent days and a complete week when the container has room', () => {
  assert.equal(quantiGiorni(380), 1)
  assert.equal(quantiGiorni(520), 2)
  assert.equal(quantiGiorni(760), 3)
  assert.equal(quantiGiorni(1280), 7)
  assert.deepEqual(giorniVisibili('2026-09-30', 3), ['2026-09-30', '2026-10-01', '2026-10-02'])
  assert.deepEqual(giorniVisibili('2026-09-09', 7), ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'])
})

test('planned dates remain fixed; legacy today tasks keep their original semantics', () => {
  assert.equal(giornoCompito({ quando: 'oggi', giorno: '2026-09-07' }, '2026-09-08'), '2026-09-07')
  assert.equal(giornoCompito({ quando: 'oggi' }, '2026-09-08'), '2026-09-08')
  assert.equal(giornoCompito({ quando: 'settimana' }, '2026-09-08'), null)
  assert.equal(secchioDelGiorno('2026-09-09', '2026-09-08'), 'settimana')
  assert.equal(secchioDelGiorno('2026-09-07', '2026-09-08'), 'oggi')
  assert.equal(secchioDelGiorno(null, '2026-09-08'), 'poi')
})

test('secchioVivo brings a live task with a past planned day forward to today, without touching a closed one', () => {
  // giorno passato, viva: la lista di oggi la vede lì, non dov'è scritta
  assert.equal(secchioVivo({ stato: 'aperto', giorno: '2026-09-07', quando: 'settimana' }, '2026-09-08'), 'oggi')
  assert.equal(secchioVivo({ stato: 'delegato', giorno: '2026-09-01', quando: 'poi' }, '2026-09-08'), 'oggi')
  // giorno passato, chiusa: `quando` scritto resta quello che dice — non compare mai in questa lista comunque
  assert.equal(secchioVivo({ stato: 'fatto', giorno: '2026-09-07', quando: 'settimana' }, '2026-09-08'), 'settimana')
  assert.equal(secchioVivo({ stato: 'lasciato', giorno: '2026-09-01', quando: 'poi' }, '2026-09-08'), 'poi')
  // giorno futuro: si deriva da secchioDelGiorno, come nel calendario
  assert.equal(secchioVivo({ stato: 'aperto', giorno: '2026-09-09', quando: 'poi' }, '2026-09-08'), 'settimana')
  // una data lontana non sposta niente: «prima o poi» resta «prima o poi»
  assert.equal(secchioVivo({ stato: 'aperto', giorno: '2026-12-01', quando: 'poi' }, '2026-09-08'), 'poi')
  assert.equal(secchioVivo({ stato: 'aperto', giorno: '2026-09-15', quando: 'poi' }, '2026-09-08'), 'settimana')
  // giorno di oggi: viva, non passata — resta 'oggi'
  assert.equal(secchioVivo({ stato: 'aperto', giorno: '2026-09-08', quando: 'settimana' }, '2026-09-08'), 'oggi')
  // senza giorno: si fida di `quando`, qualunque sia lo stato
  assert.equal(secchioVivo({ stato: 'aperto', giorno: null, quando: 'settimana' }, '2026-09-08'), 'settimana')
  assert.equal(secchioVivo({ stato: 'aperto', quando: 'poi' }, '2026-09-08'), 'poi')
})

test('local date arithmetic stays stable across daylight saving and negative UTC offsets', () => {
  const precedente = process.env.TZ
  process.env.TZ = 'America/New_York'
  try {
    assert.equal(giornoLocale(new Date('2026-09-09T02:00:00Z')), '2026-09-08')
    assert.equal(spostaGiorno('2026-03-07', 1), '2026-03-08')
    assert.equal(spostaGiorno('2026-03-08', 1), '2026-03-09')
    assert.equal(spostaGiorno('2026-11-01', 1), '2026-11-02')
  } finally { if (precedente === undefined) delete process.env.TZ; else process.env.TZ = precedente }
})
