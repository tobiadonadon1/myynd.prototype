import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nienteOpen, openInProva } from './senza-open.ts'

/** Con il flag messo come si vuole, e il registro raccolto; poi tutto com'era. */
function conFlag<T>(valore: string | undefined, corpo: (righe: string[]) => T): T {
  const primaEnv = process.env.MYYND_PROVA_NIENTE_OPEN, log = console.log
  const righe: string[] = []
  if (valore === undefined) delete process.env.MYYND_PROVA_NIENTE_OPEN; else process.env.MYYND_PROVA_NIENTE_OPEN = valore
  console.log = (...a: unknown[]) => { righe.push(a.map(String).join(' ')) }
  try { return corpo(righe) } finally {
    console.log = log
    if (primaEnv === undefined) delete process.env.MYYND_PROVA_NIENTE_OPEN; else process.env.MYYND_PROVA_NIENTE_OPEN = primaEnv
  }
}

test('in una scena delle prove (MYYND_PROVA_NIENTE_OPEN=1) `open` non parte: una riga nel registro con cosa avrebbe aperto', () => {
  conFlag('1', righe => {
    assert.equal(nienteOpen(), true)
    assert.equal(openInProva('mani', ['/Users/x/Desktop/Myynd/piano.md']), true)
    assert.deepEqual(righe, ['myynd · mani · open non eseguito (prova): /Users/x/Desktop/Myynd/piano.md'])
    assert.equal(openInProva('documento', ['-b', 'com.apple.iWork.Pages', '/x/a.pages']), true)
    assert.equal(righe[1], 'myynd · documento · open non eseguito (prova): -b com.apple.iWork.Pages /x/a.pages')
  })
})

test('senza il flag, o con «0», `open` parte e il registro tace', () => {
  conFlag(undefined, righe => {
    assert.equal(nienteOpen(), false)
    assert.equal(openInProva('mani', ['/x']), false)
    assert.deepEqual(righe, [])
  })
  conFlag('0', righe => {
    assert.equal(nienteOpen(), false)
    assert.equal(openInProva('lavoro', ['/x']), false)
    assert.deepEqual(righe, [])
  })
})
