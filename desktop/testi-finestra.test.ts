// Il testo della finestra davanti, dalla parte del guscio: le righe del
// programma, i suoi argomenti, e il regista che lo chiede solo quando il
// server lo vuole e il permesso c'è. Con finti: nessuna finestra viene letta.
//
//   node --test desktop/testi-finestra.test.ts

import { afterEach, beforeEach, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import * as oss from './osservatore.ts'
import { argomentiAiutante, leggiRiga, leggiTesto, type OpzioniFonte } from './fronte.ts'
import { filtraTesto } from './sessioni.ts'

const T0 = Date.parse('2026-10-16T07:00:00.000Z')
const RIGA = JSON.stringify({ tipo: 'testo', bundle: 'com.apple.TextEdit', app: 'TextEdit', pid: 12, titolo: 'Offer.rtf', documento: 'file:///Users/anna/Offer.rtf', url: null, testo: 'Three phases', t: T0 })

test('leggiTesto legge solo le righe col testo; leggiRiga non le scambia per un cambio d’app', () => {
  assert.deepEqual(leggiTesto(RIGA), { bundle: 'com.apple.TextEdit', app: 'TextEdit', pid: 12, titolo: 'Offer.rtf', documento: 'file:///Users/anna/Offer.rtf', url: null, testo: 'Three phases', t: T0 })
  assert.equal(leggiRiga(RIGA), null)
  assert.equal(leggiTesto('{"bundle":"a","app":"b","pid":1,"titolo":null,"t":1}'), null)
  assert.equal(leggiTesto('{"tipo":"testo","bundle":"a","app":"b","pid":1,"t":1}'), null, 'senza testo no')
  assert.equal(leggiTesto('rotto'), null)
})

test('gli argomenti: il testo solo se voluto, col ritmo nei suoi limiti e le esclusioni pulite', () => {
  assert.deepEqual(argomentiAiutante({ titoli: false }), [])
  assert.deepEqual(argomentiAiutante({ titoli: true }), ['--titoli'])
  assert.deepEqual(argomentiAiutante({ titoli: false, testi: { ogni: 2, escluse: ['com.apple.Notes', 'notes; rm -rf', 'Slack'] } }),
    ['--titoli', '--testi', '--ogni', '5', '--escludi', 'com.apple.Notes,Slack'])
})

test('filtraTesto: gestori di password, le sue app, finestre private e di accesso non escono', () => {
  const t = { bundle: 'com.apple.TextEdit', app: 'TextEdit', pid: 12, titolo: 'Offer.rtf', documento: null, url: null, testo: '  Three\n phases ', t: T0 }
  assert.deepEqual(filtraTesto(t, { mioPid: 1, escluse: [] }), { bundle: 'com.apple.TextEdit', app: 'TextEdit', titolo: 'Offer.rtf', documento: null, url: null, testo: 'Three phases', t: T0 })
  assert.equal(filtraTesto({ ...t, bundle: 'com.1password.1password' }, { mioPid: 1, escluse: [] }), null)
  assert.equal(filtraTesto({ ...t, app: 'Slack', bundle: 'com.tinyspeck.slackmacgap' }, { mioPid: 1, escluse: ['slack'] }), null)
  assert.equal(filtraTesto({ ...t, titolo: 'New Incognito Tab' }, { mioPid: 1, escluse: [] }), null)
  assert.equal(filtraTesto({ ...t, titolo: 'Sign in to your account' }, { mioPid: 1, escluse: [] }), null)
  assert.equal(filtraTesto({ ...t, pid: 1 }, { mioPid: 1, escluse: [] }), null, 'Myynd stessa')
  assert.equal(filtraTesto({ ...t, testo: '   ' }, { mioPid: 1, escluse: [] }), null)
})

/* ------------------------------------------------------------- il regista */

type Finta = { opts: OpzioniFonte; tipo: 'aiutante'; fermata: boolean; chiedi(): void; ferma(): void }

function scena(permesso: boolean) {
  const mandati: { tipo: string; testi?: unknown[] }[] = []
  const fonti: Finta[] = []
  const x = { idle: 0 }
  oss.avvia({
    manda: m => { mandati.push(structuredClone(m) as { tipo: string }); return true },
    creaFonte: opts => { const f: Finta = { opts, tipo: 'aiutante', fermata: false, chiedi() {}, ferma() { this.fermata = true } }; fonti.push(f); return f },
    inattivoSecondi: () => x.idle,
    permesso: () => permesso,
    adesso: () => Date.now(),
    mioPid: 999,
    piattaforma: 'darwin',
    suCambio: () => {},
    registra: () => {}
  })
  return { mandati, fonti, x, fonte: () => fonti.at(-1)! }
}

beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: T0 }))
afterEach(async () => { const p = oss.ferma(); mock.timers.tick(2_000); await p; mock.timers.reset() })

const STATO = { tipo: 'osservatore-stato', acceso: true, titoli: false, pausaFino: null }
const testo = (x: Record<string, unknown> = {}) => ({ bundle: 'com.apple.TextEdit', app: 'TextEdit', pid: 12, titolo: 'Offer.rtf', documento: null, url: null, testo: 'Three phases', t: Date.now(), ...x })

test('senza testo voluto, o senza permesso, la fonte parte senza testo', () => {
  const s = scena(false)
  oss.daServer({ ...STATO, testi: true, ogni: 30, escluse: [] })
  assert.equal(s.fonte().opts.testi, null, 'voluto ma senza permesso: niente')
  const t = scena(true)
  oss.daServer({ ...STATO, testi: false })
  assert.equal(t.fonte().opts.testi, null)
})

test('voluto e permesso: la fonte lo legge col ritmo e le esclusioni del server; il testo parte col mazzo, filtrato', () => {
  const s = scena(true)
  oss.daServer({ ...STATO, testi: true, ogni: 30, escluse: ['slack'] })
  assert.deepEqual(s.fonte().opts.testi, { ogni: 30, escluse: ['slack'] })
  s.fonte().opts.suTesto!(testo())
  s.fonte().opts.suTesto!(testo({ bundle: 'com.tinyspeck.slackmacgap', app: 'Slack' }))
  s.fonte().opts.suTesto!(testo({ bundle: 'com.1password.1password', app: '1Password' }))
  mock.timers.tick(60_000)
  const mandati = s.mandati.filter(m => m.tipo === 'osservatore-testi')
  assert.equal(mandati.length, 1)
  assert.deepEqual(mandati[0]!.testi!.map(t => (t as { app: string }).app), ['TextEdit'])
  // un cambio di esclusioni riaccende la fonte con le nuove
  oss.daServer({ ...STATO, testi: true, ogni: 30, escluse: [] })
  assert.equal(s.fonti.length, 2)
  assert.equal(s.fonti[0]!.fermata, true)
  // spento dal server: la fonte riparte senza testo
  oss.daServer({ ...STATO, testi: false })
  assert.equal(s.fonte().opts.testi, null)
})

test('con la persona via, il testo che arriva non si tiene', () => {
  const s = scena(true)
  oss.daServer({ ...STATO, testi: true, ogni: 20, escluse: [] })
  oss.bloccato()
  s.fonte().opts.suTesto!(testo())
  oss.sbloccato()
  mock.timers.tick(60_000)
  assert.equal(s.mandati.filter(m => m.tipo === 'osservatore-testi').length, 0)
})
