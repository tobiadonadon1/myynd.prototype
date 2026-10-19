// Il quaderno: quante colonne di giorni ci stanno, e quale scelta si accende.
// «There is an issue with the formatting of the to do lists» (19 ott 2026):
// la scelta diceva 5, se ne vedevano quattro, e ogni titolo si tagliava a quindici lettere.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COLONNA_MIN, colonneCheStanno, giorniMostrati } from './oggi/giorni.ts'

const SCELTE = [1, 3, 5, 7]

test('le colonne che stanno contano lo spazio fra loro e restano larghe almeno COLONNA_MIN', () => {
  for (const w of [500, 840, 930, 1100, 1400, 2000]) {
    const n = colonneCheStanno(w)
    const larga = (w - 44 - (n - 1) * 26) / n
    assert.ok(larga >= COLONNA_MIN, `${w}: ${n} colonne da ${larga}`)
  }
  assert.equal(colonneCheStanno(200), 1)
})

test('si vede sempre una delle scelte: con quattro colonne di posto e 5 scelto, se ne vedono 3', () => {
  assert.equal(giorniMostrati(SCELTE, 5, 4), 3)
  assert.equal(giorniMostrati(SCELTE, 5, 5), 5)
  assert.equal(giorniMostrati(SCELTE, 7, 6), 5)
  assert.equal(giorniMostrati(SCELTE, 3, 9), 3)
  assert.equal(giorniMostrati(SCELTE, 5, 2), 1)
  assert.equal(giorniMostrati(SCELTE, 1, 1), 1)
})
