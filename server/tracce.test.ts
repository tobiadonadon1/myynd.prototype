// La traccia di un lavoro e il numero della settimana.
//
//   node --import ./build/test-profile.mjs --test server/tracce.test.ts

import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const radice = mkdtempSync(join(tmpdir(), 'myynd-tracce-'))
process.env.MYYND_DATI = radice
const store = await import('./store.ts')
const tracce = await import('./tracce.ts')

beforeEach(() => store.azzeraTutto())
after(() => { store.chiudiIndici(); rmSync(radice, { recursive: true, force: true }) })

const spendi = (compito: string, micro: number, quando = new Date()) =>
  store.default.prepare('INSERT INTO uso (quando, lavoro, motore, entrata, cache, uscita, compito, costo) VALUES (?,?,?,?,?,?,?,?)')
    .run(quando.toISOString(), 'bozza', 'claude-sonnet-4-5', 100, 0, 100, compito, micro)

test('la vita di una traccia: parte, consegnata, vista, decisa; i secondi e il costo', () => {
  const t0 = tracce.inizia({ compito: 'c1', progetto: 'p1', genere: 'bozza', prove: ['posta:1', null, 'posta:1'] })!
  assert.equal(t0.esito, 'in_attesa')
  assert.deepEqual(t0.prove, ['posta:1'])
  assert.equal(t0.consegnata, null)
  spendi('c1', 120_000)
  spendi('c1', 30_000)
  tracce.consegnata('c1', { uscita: '/Users/x/Desktop/Piano.md', prove: ['file:2'] })
  let t = tracce.ultimaDi('c1')!
  assert.ok(t.consegnata)
  assert.equal(t.uscita, '/Users/x/Desktop/Piano.md')
  assert.equal(t.ricevuta, 'fatto')
  assert.deepEqual(t.prove, ['posta:1', 'file:2'])
  assert.ok(Math.abs((t.costo ?? 0) - 0.15) < 1e-9)
  const vista = new Date(Date.now() - 90_000)
  tracce.mostrata(['c1'], vista)
  tracce.mostrata(['c1'], new Date())   // la prima volta conta
  assert.equal(tracce.ultimaDi('c1')!.mostrata, vista.toISOString())
  t = tracce.decidi('c1', 'accettato', { distanza: 0, adesso: new Date(vista.getTime() + 42_000) })!
  assert.equal(t.esito, 'accettato')
  assert.equal(t.secondi, 42)
  assert.ok(t.decisa)
})

test('le tre decisioni, e la prima vince', () => {
  for (const [id, esito] of [['a', 'accettato'], ['m', 'modificato'], ['s', 'scartato']] as const) {
    tracce.inizia({ compito: id })
    tracce.consegnata(id)
    tracce.decidi(id, esito, { distanza: esito === 'modificato' ? 0.3 : null })
    assert.equal(tracce.ultimaDi(id)!.esito, esito)
  }
  assert.equal(tracce.ultimaDi('m')!.distanza, 0.3)
  // un «Fatto» dopo che la bozza è già partita non riscrive
  tracce.decidi('s', 'accettato')
  assert.equal(tracce.ultimaDi('s')!.esito, 'scartato')
  // senza vista, i secondi non si inventano
  assert.equal(tracce.ultimaDi('a')!.secondi, null)
})

test('la distanza di un ritocco dice accettato o modificato', () => {
  assert.equal(tracce.esitoDallaDistanza(0), 'accettato')
  assert.equal(tracce.esitoDallaDistanza(0.1), 'accettato')
  assert.equal(tracce.esitoDallaDistanza(0.3), 'modificato')
  assert.equal(tracce.esitoDallaDistanza(0.9), 'modificato')
})

test('una carta che riparte ha una traccia nuova; si decide l’ultima', () => {
  tracce.inizia({ compito: 'r' })
  tracce.ricevuta('r', 'trattenuto', 'budget della notte')
  tracce.inizia({ compito: 'r' })
  tracce.consegnata('r')
  tracce.decidi('r', 'accettato')
  const tutte = store.default.prepare('SELECT esito, ricevuta FROM tracce WHERE compito = ? ORDER BY rowid').all('r') as { esito: string; ricevuta: string | null }[]
  assert.deepEqual(tutte.map(x => [x.esito, x.ricevuta]), [['in_attesa', 'trattenuto'], ['accettato', 'fatto']])
})

test('la ricevuta: trattenuta resta trattenuta anche consegnata; le altre si segnano col motivo', () => {
  tracce.inizia({ compito: 't' })
  tracce.ricevuta('t', 'trattenuto', 'codice_applica')
  tracce.consegnata('t')
  assert.equal(tracce.ultimaDi('t')!.ricevuta, 'trattenuto')
  assert.equal(tracce.ultimaDi('t')!.motivo, 'codice_applica')
  tracce.inizia({ compito: 'n' })
  tracce.ricevuta('n', 'niente_da_fare', 'Nothing new worth posting')
  assert.equal(tracce.ultimaDi('n')!.ricevuta, 'niente_da_fare')
  // una carta senza traccia ne riceve una (il lavoro da sé che non passa da `inizia`)
  tracce.ricevuta('senza', 'saltato')
  assert.equal(tracce.ultimaDi('senza')!.ricevuta, 'saltato')
})

test('una consegna lasciata lì una settimana scade, e una decisione dopo la prende', () => {
  tracce.inizia({ compito: 'v' })
  store.default.prepare('UPDATE tracce SET consegnata = ? WHERE compito = ?').run(new Date(Date.now() - 8 * 86_400_000).toISOString(), 'v')
  assert.equal(tracce.scadi(), 1)
  assert.equal(tracce.ultimaDi('v')!.esito, 'scaduto')
  tracce.decidi('v', 'modificato')
  assert.equal(tracce.ultimaDi('v')!.esito, 'modificato')
})

test('il numero della settimana: prese, tasso, costo per presa', () => {
  const adesso = new Date()
  for (const [id, esito, micro] of [['w1', 'accettato', 200_000], ['w2', 'modificato', 100_000], ['w3', 'scartato', 300_000], ['w4', null, 20_000]] as const) {
    tracce.inizia({ compito: id })
    spendi(id, micro)
    tracce.consegnata(id)
    if (esito) tracce.decidi(id, esito)
  }
  // partita e non consegnata: il costo conta, la consegna no
  tracce.inizia({ compito: 'w5' }); spendi('w5', 80_000)
  // di due settimane fa: fuori
  tracce.inizia({ compito: 'vecchia' })
  const prima = new Date(adesso.getTime() - 15 * 86_400_000).toISOString()
  store.default.prepare('UPDATE tracce SET creata = ?, consegnata = ?, decisa = ?, esito = ? WHERE compito = ?').run(prima, prima, prima, 'accettato', 'vecchia')
  const s = tracce.settimana(adesso)
  assert.equal(s.consegnate, 4)
  assert.equal(s.accettate, 1)
  assert.equal(s.modificate, 1)
  assert.equal(s.scartate, 1)
  assert.equal(s.inAttesa, 1)
  assert.equal(s.tasso, 2 / 3)
  assert.ok(Math.abs(s.costo - 0.7) < 1e-9, `costo ${s.costo}`)
  assert.ok(Math.abs((s.costoPerAccettata ?? 0) - 0.35) < 1e-9)
  assert.ok(!s.tracce.some(t => t.compito === 'vecchia'))
  assert.equal(tracce.inizioSettimana(new Date('2026-10-17T15:00:00')).getDay(), 1, 'lunedì')
})

test('una settimana vuota: niente numeri inventati', () => {
  const s = tracce.settimana()
  assert.equal(s.accettate + s.modificate, 0)
  assert.equal(s.tasso, null)
  assert.equal(s.costoPerAccettata, null)
})

test('il costo della settimana è quello di ogni partenza da questa settimana, non la vita della carta', () => {
  const adesso = new Date()
  const vecchio = new Date(adesso.getTime() - 20 * 86_400_000)
  // la stessa carta ha speso tanto tre settimane fa, in una partenza di allora
  spendi('k', 900_000, vecchio)
  tracce.inizia({ compito: 'k' })
  spendi('k', 50_000)
  tracce.consegnata('k')
  tracce.decidi('k', 'accettato')
  const s = tracce.settimana(adesso)
  assert.ok(Math.abs(s.costo - 0.05) < 1e-9, `costo ${s.costo}`)
  assert.ok(Math.abs((s.costoPerAccettata ?? 0) - 0.05) < 1e-9)
  assert.ok(Math.abs((tracce.ultimaDi('k')!.costo ?? 0) - 0.05) < 1e-9, 'anche sulla traccia')
})
