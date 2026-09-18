import { test } from 'node:test'
import assert from 'node:assert/strict'
import { celleDelMese, giornoLocale, giornoCompito, giorniVisibili, inizioMese, inizioSettimana, quantiGiorni, quantiInPiu, secchioDelGiorno, spostaGiorno, spostaMese } from './oggi/giorni.ts'
import { secchioVivo } from './oggi/secchi.ts'

/** Lunedì 0 … domenica 6, come legge la griglia della vista intera. */
const colonna = (g: string) => (new Date(`${g}T12:00:00`).getDay() + 6) % 7

test('calendar days cross month/year and leap days without UTC conversion', () => {
  assert.equal(spostaGiorno('2026-12-31', 1), '2027-01-01')
  assert.equal(spostaGiorno('2024-02-28', 1), '2024-02-29')
  assert.equal(spostaGiorno('2026-03-01', -1), '2026-02-28')
  assert.equal(inizioSettimana('2026-09-13'), '2026-09-07')
})

test('planner shows readable adjacent days: three at most, so each day is tall and wide, even on a wide window', () => {
  assert.equal(quantiGiorni(380), 1)
  assert.equal(quantiGiorni(520), 2)
  assert.equal(quantiGiorni(760), 3)
  assert.equal(quantiGiorni(1280), 3)
  assert.deepEqual(giorniVisibili('2026-09-30', 3), ['2026-09-30', '2026-10-01', '2026-10-02'])
  assert.deepEqual(giorniVisibili('2026-09-09', 7), ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'])
})

test('the full view is whole weeks, Monday to Sunday, around the month it shows', () => {
  // settembre 2026 comincia di martedì: la griglia parte dal lunedì prima
  const settembre = celleDelMese('2026-09-18')
  assert.equal(settembre[0], '2026-08-31')
  assert.equal(settembre.at(-1), '2026-10-04')
  assert.equal(settembre.length % 7, 0)
  assert.equal(colonna(settembre[0]), 0)
  assert.equal(colonna(settembre.at(-1)!), 6)
  // il primo e l'ultimo del mese ci sono, e nell'ordine giusto
  assert.ok(settembre.includes('2026-09-01') && settembre.includes('2026-09-30'))
  assert.deepEqual([...settembre].sort(), settembre)

  // febbraio 2027 comincia di lunedì e finisce di domenica: quattro righe, niente caselle in più
  const febbraio = celleDelMese('2027-02-10')
  assert.equal(febbraio.length, 28)
  assert.equal(febbraio[0], '2027-02-01')
  assert.equal(febbraio.at(-1), '2027-02-28')

  // un mese che sfora su sei righe resta una griglia intera
  const agosto = celleDelMese('2026-08-20')
  assert.equal(agosto.length % 7, 0)
  assert.equal(colonna(agosto[0]), 0)
  assert.ok(agosto.includes('2026-08-01') && agosto.includes('2026-08-31'))
})

test('month arrows keep the chosen day where the month has one', () => {
  assert.equal(inizioMese('2026-09-18'), '2026-09-01')
  assert.equal(spostaMese('2026-09-18', 1), '2026-10-18')
  assert.equal(spostaMese('2026-01-01', -1), '2025-12-01')
  // il 31 più un mese è l'ultimo giorno del mese d'arrivo, non il primo di quello dopo
  assert.equal(spostaMese('2026-01-31', 1), '2026-02-28')
  assert.equal(spostaMese('2024-01-31', 1), '2024-02-29')
  assert.equal(spostaMese('2026-12-15', 1), '2027-01-15')
})

test('a month cell shows three chips and counts the rest', () => {
  assert.equal(quantiInPiu(0, 3), 0)
  assert.equal(quantiInPiu(3, 3), 0)
  assert.equal(quantiInPiu(4, 3), 1)
  assert.equal(quantiInPiu(11, 3), 8)
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
