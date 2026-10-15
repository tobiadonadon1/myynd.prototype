// La coda degli avvisi nel guscio: niente si butta, quello che arriva
// insieme esce in uno.
//
//   node --test desktop/avvisi-coda.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { creaCoda, unisci, PAUSA_MS, type Nota } from './avvisi-coda.ts'

type Dove = string | { dove: string; id: string }

function prova() {
  let ora = 1_000_000
  const timer: { quando: number; f: () => void }[] = []
  const mostrate: Nota<Dove>[] = []
  const coda = creaCoda<Dove>({
    mostra: n => { mostrate.push(n) },
    quante: n => `${n} things are ready.`,
    altrove: 'casa',
    adesso: () => ora,
    dopo: (f, ms) => { timer.push({ quando: ora + ms, f }) }
  })
  const avanza = (ms: number) => {
    ora += ms
    for (const t of timer.splice(0).sort((a, b) => a.quando - b.quando)) {
      if (t.quando <= ora) t.f(); else timer.push(t)
    }
  }
  return { coda, mostrate, avanza, timer }
}

const nota = (titolo: string, dove: Dove = 'oggi'): Nota<Dove> => ({ titolo, corpo: `${titolo}, il corpo`, dove })

test('la prima esce subito', () => {
  const p = prova()
  p.coda.metti(nota('A'))
  assert.deepEqual(p.mostrate.map(n => n.titolo), ['A'])
  assert.equal(p.timer.length, 0)
})

test('dentro i due secondi non si butta: aspetta, ed esce com’era', () => {
  const p = prova()
  p.coda.metti(nota('A'))
  p.avanza(500)
  p.coda.metti(nota('B', { dove: 'compito', id: 'c1' }))
  assert.equal(p.mostrate.length, 1)
  p.avanza(PAUSA_MS)
  assert.deepEqual(p.mostrate.map(n => n.titolo), ['A', 'B'])
  assert.deepEqual(p.mostrate[1].dove, { dove: 'compito', id: 'c1' })
})

test('tante dentro i due secondi escono in una, coi titoli sotto', () => {
  const p = prova()
  p.coda.metti(nota('A'))
  p.coda.metti(nota('B', 'oggi'))
  p.coda.metti(nota('C', 'chat'))
  p.coda.metti(nota('D', 'oggi'))
  p.avanza(PAUSA_MS)
  assert.equal(p.mostrate.length, 2)
  assert.equal(p.mostrate[1].titolo, '3 things are ready.')
  assert.equal(p.mostrate[1].corpo, 'B, il corpo · C, il corpo · D, il corpo')
  // posti diversi: la prima pagina
  assert.equal(p.mostrate[1].dove, 'casa')
})

test('dopo l’attesa la coda riparte pulita', () => {
  const p = prova()
  p.coda.metti(nota('A'))
  p.coda.metti(nota('B'))
  p.avanza(PAUSA_MS)
  p.avanza(10_000)
  p.coda.metti(nota('C'))
  assert.deepEqual(p.mostrate.map(n => n.titolo), ['A', 'B', 'C'])
})

test('unire: una sola resta com’era, tante nello stesso posto tengono il posto', () => {
  const quante = (n: number) => `${n}`
  assert.deepEqual(unisci([nota('A')], quante, 'casa'), nota('A'))
  const u = unisci([nota('A', { dove: 'compito', id: 'x' }), nota('B', { dove: 'compito', id: 'x' })], quante, 'casa')
  assert.deepEqual(u.dove, { dove: 'compito', id: 'x' })
  const lungo = unisci([{ titolo: 'A', corpo: 'x'.repeat(400), dove: 'oggi' }, nota('B')], quante, 'casa')
  assert.ok(lungo.corpo.length <= 300)
})
