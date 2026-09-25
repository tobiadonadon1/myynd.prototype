// La barra dei menu e il mostriciattolo: quale immagine, quali voci, che nuvoletta.
//
//   node --test desktop/icona-barra.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { iconaPer, smorto, suggerimento, vociCompagno, vociMenu } from './icona-barra.ts'
import { imposta, t } from './lingua.ts'

const ICONE = fileURLToPath(new URL('./icone/', import.meta.url))
const ADESSO = Date.parse('2026-09-24T13:00:00.000Z')
const FRA_UN_ORA = new Date(ADESSO + 3_600_000).toISOString()
const UN_ORA_FA = new Date(ADESSO - 3_600_000).toISOString()

test('iconaPer: le otto combinazioni, e ogni file c’è', () => {
  const attese: [boolean, boolean, string][] = [
    [true, false, 'mascotte'], [true, true, 'mascotteAttesa'],
    [false, false, 'mascotteSpenta'], [false, true, 'mascotteSpentaAttesa']
  ]
  for (const [guarda, attesa, nome] of attese) {
    const mac = iconaPer({ guarda, attesa, piattaforma: 'darwin' })
    const win = iconaPer({ guarda, attesa, piattaforma: 'win32' })
    assert.equal(mac, `${nome}.png`)
    // su Windows l'osservatore non c'è: mai smorto
    assert.equal(win, `${nome.replace('Spenta', '')}.ico`)
    assert.ok(existsSync(ICONE + mac), mac)
    assert.ok(existsSync(ICONE + `${nome}@2x.png`), `${nome}@2x.png`)
    assert.ok(existsSync(ICONE + win), win)
    assert.ok(existsSync(ICONE + `${nome}.ico`), `${nome}.ico`)
  }
  assert.ok(existsSync(ICONE + 'compagno.png'))
})

test('smorto: solo sul Mac e solo quando non guarda', () => {
  assert.equal(smorto({ guarda: false, piattaforma: 'darwin' }), true)
  assert.equal(smorto({ guarda: true, piattaforma: 'darwin' }), false)
  assert.equal(smorto({ guarda: false, piattaforma: 'win32' }), false)
  assert.equal(smorto({ guarda: true, piattaforma: 'win32' }), false)
})

test('iconaPer: i segni di prima restano nella cartella', () => {
  for (const f of ['trayTemplate.png', 'trayTemplate@2x.png', 'trayAttesaTemplate.png', 'tray.ico', 'trayAttesa.ico']) {
    assert.ok(existsSync(ICONE + f), f)
  }
})

test('vociMenu: acceso e non in pausa, pausa per prima', () => {
  assert.deepEqual(vociMenu({ disponibile: true, acceso: true, pausaFino: null, adesso: ADESSO }),
    ['pausa', '-', 'apri', 'nuova-chat', 'preferenze', '-', 'esci'])
  assert.deepEqual(vociMenu({ disponibile: true, acceso: true, pausaFino: UN_ORA_FA, adesso: ADESSO })[0], 'pausa',
    'una pausa scaduta non è una pausa')
})

test('vociMenu: in pausa, riprendi per prima', () => {
  assert.deepEqual(vociMenu({ disponibile: true, acceso: true, pausaFino: FRA_UN_ORA, adesso: ADESSO }),
    ['riprendi', '-', 'apri', 'nuova-chat', 'preferenze', '-', 'esci'])
})

test('vociMenu: spento, o fuori dal Mac, è il menu di sempre', () => {
  const sempre = ['apri', 'nuova-chat', 'preferenze', '-', 'esci']
  assert.deepEqual(vociMenu({ disponibile: true, acceso: false, pausaFino: null, adesso: ADESSO }), sempre)
  assert.deepEqual(vociMenu({ disponibile: true, acceso: false, pausaFino: FRA_UN_ORA, adesso: ADESSO }), sempre)
  assert.deepEqual(vociMenu({ disponibile: false, acceso: true, pausaFino: null, adesso: ADESSO }), sempre)
})

test('vociCompagno: pausa o riprendi solo con l’osservatore acceso, poi apri e togli', () => {
  assert.deepEqual(vociCompagno({ disponibile: true, acceso: true, pausaFino: null, adesso: ADESSO }), ['pausa', 'apri', '-', 'togli'])
  assert.deepEqual(vociCompagno({ disponibile: true, acceso: true, pausaFino: FRA_UN_ORA, adesso: ADESSO }), ['riprendi', 'apri', '-', 'togli'])
  assert.deepEqual(vociCompagno({ disponibile: true, acceso: false, pausaFino: null, adesso: ADESSO }), ['apri', '-', 'togli'])
  assert.deepEqual(vociCompagno({ disponibile: false, acceso: true, pausaFino: null, adesso: ADESSO }), ['apri', '-', 'togli'])
})

test('suggerimento: le quattro nuvolette, in italiano e in inglese', () => {
  const ora = () => '15:10'
  const casi = (inAttesa: number, pausaFino: string | null) => suggerimento({ inAttesa, pausaFino, adesso: ADESSO, t, ora })
  try {
    imposta('it')
    assert.equal(casi(0, null), 'Myynd')
    assert.equal(casi(3, null), 'Myynd · 3 in attesa')
    assert.equal(casi(0, FRA_UN_ORA), 'Myynd · in pausa fino alle 15:10')
    assert.equal(casi(3, FRA_UN_ORA), 'Myynd · in pausa fino alle 15:10 · 3 in attesa')
    assert.equal(casi(0, UN_ORA_FA), 'Myynd', 'una pausa finita non si dice')
    imposta('en')
    assert.equal(casi(0, null), 'Myynd')
    assert.equal(casi(3, null), 'Myynd · 3 waiting')
    assert.equal(casi(0, FRA_UN_ORA), 'Myynd · paused until 15:10')
    assert.equal(casi(3, FRA_UN_ORA), 'Myynd · paused until 15:10 · 3 waiting')
  } finally {
    imposta('it')
  }
})

test('le frasi nuove del guscio hanno l’inglese, senza lineette', () => {
  try {
    imposta('en')
    const attese: Record<string, string> = {
      'Pausa per un’ora': 'Pause watching for an hour',
      'Riprendi a guardare': 'Resume watching',
      'in pausa fino alle': 'paused until',
      'Togli dallo schermo': 'Remove from screen'
    }
    for (const [it, en] of Object.entries(attese)) {
      assert.equal(t(it), en)
      assert.doesNotMatch(it + en, /[–—]/)
    }
  } finally {
    imposta('it')
  }
})
