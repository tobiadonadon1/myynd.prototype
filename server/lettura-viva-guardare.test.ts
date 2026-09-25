// Chi ricarica durante la lettura torna a guardarla, e solo allora (P4).
//
//   node --test server/lettura-viva-guardare.test.ts

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import * as viva from './lettura-viva.ts'

const CONTO = 'conto-prova'
beforeEach(() => { viva.chiudi(CONTO) })

test('una prima lettura chiesta da lui: si guarda, a qualunque passo', () => {
  viva.apri(CONTO, { tutte: true, prima: true, fonti: ['calendario'] })
  assert.equal(viva.daGuardare(CONTO, 'fonte'), true)
  assert.equal(viva.daGuardare(CONTO, 'verifica'), true)
})

test('sul passo delle fonti, «Leggi» quando il giro di fondo e il resto hanno già finito i novanta giorni: si guarda', () => {
  viva.apri(CONTO, { tutte: true, prima: false, fonti: ['calendario', 'desktop', 'postamac'] })
  assert.equal(viva.daGuardare(CONTO, 'fonte'), true)
})

test('la stessa lettura dopo il passo delle fonti, il giro di fondo, una fonte sola, una lettura finita: no (counter-case)', () => {
  const v = viva.apri(CONTO, { tutte: true, prima: false, fonti: ['calendario'] })
  assert.equal(viva.daGuardare(CONTO, 'verifica'), false, '«Rileggi tutto» dalle Fonti non riporta nessuno all’avvio')
  assert.equal(viva.daGuardare(CONTO, 'completo'), false)
  v.avvisa({ fase: 'fine', totale: 0 })
  assert.equal(viva.daGuardare(CONTO, 'fonte'), false, 'finita, non c’è più niente da guardare')

  viva.apri(CONTO, { tutte: true, prima: true, fonti: ['calendario'], chiesta: false })
  assert.equal(viva.daGuardare(CONTO, 'fonte'), false, 'il giro dei dieci minuti non è una lettura sua')

  viva.apri(CONTO, { tutte: false, prima: false, fonti: ['postamac'] })
  assert.equal(viva.daGuardare(CONTO, 'fonte'), false, 'il resto della prima lettura legge una fonte sola, per conto suo')

  viva.chiudi(CONTO)
  assert.equal(viva.daGuardare(CONTO, 'fonte'), false)
})
