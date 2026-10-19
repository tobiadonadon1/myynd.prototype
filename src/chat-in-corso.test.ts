// Le risposte in arrivo, una per chat: la rotella non segue chi cambia chat.
//
//   node --test src/chat-in-corso.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avvia, chiudi, conRiga, frammento, nessunaCorsa, passo, pensaIn, riparti, vista } from './chat-in-corso.ts'

const dom = (id: string, text: string) => ({ id, role: 'u', text })

test('la rotella sta nella chat che ha chiesto, non in quella aperta dopo', () => {
  const c = avvia(nessunaCorsa, 'A', dom('tmp1', 'ciao'))
  assert.equal(pensaIn(c, 'A'), true)
  assert.equal(pensaIn(c, 'B'), false)
  assert.equal(pensaIn(c, null), false)
  // tornati su A, è ancora lì
  assert.equal(pensaIn(c, 'A'), true)
})

test('la chat B non vede la domanda né la risposta di A', () => {
  let c = avvia(nessunaCorsa, 'A', dom('tmp1', 'domanda di A'))
  c = frammento(c, 'A', 'Rispo')
  const salvatiB = [{ id: 'b1', role: 'u', text: 'vecchia di B' }]
  assert.deepEqual(vista(salvatiB, c.get('B')), salvatiB)
  const inA = vista([], c.get('A'))
  assert.deepEqual(inA.map(m => [m.role, m.text]), [['u', 'domanda di A'], ['a', 'Rispo']])
})

test('due chat che rispondono insieme tengono ognuna il suo stato', () => {
  let c = avvia(nessunaCorsa, 'A', dom('tmpA', 'a?'))
  c = avvia(c, 'B', dom('tmpB', 'b?'))
  c = frammento(c, 'A', 'uno ')
  c = passo(c, 'B', 'Cerco nelle tue fonti')
  c = frammento(c, 'A', 'due')
  assert.equal(c.get('A')?.vivo, 'uno due')
  assert.equal(c.get('A')?.pensando, false)
  assert.equal(c.get('B')?.pensando, true)
  assert.equal(c.get('B')?.passo, 'Cerco nelle tue fonti')
  assert.equal(c.get('B')?.vivo, '')
  c = chiudi(c, 'A', 'tmpA')
  assert.equal(c.has('A'), false)
  assert.equal(pensaIn(c, 'B'), true)
})

test('la domanda già salvata dal server non compare due volte', () => {
  const c = avvia(nessunaCorsa, 'A', dom('tmp1', 'quando è la call?'))
  const salvati = [{ id: 'u9', role: 'u', text: 'quando è la call?' }]
  assert.deepEqual(vista(salvati, c.get('A')).map(m => m.id), ['u9'])
})

test('la fine di una domanda vecchia non chiude quella nuova nella stessa chat', () => {
  let c = avvia(nessunaCorsa, 'A', dom('tmp1', 'prima'))
  c = avvia(c, 'A', dom('tmp2', 'seconda'))
  c = chiudi(c, 'A', 'tmp1')
  assert.equal(c.get('A')?.domanda.text, 'seconda')
  c = chiudi(c, 'A', 'tmp2')
  assert.equal(c.size, 0)
})

test('riparti butta il già scritto e riaccende la rotella', () => {
  let c = avvia(nessunaCorsa, 'A', dom('tmp1', 'x'))
  c = frammento(c, 'A', 'mezza')
  c = riparti(c, 'A')
  assert.equal(c.get('A')?.vivo, '')
  assert.equal(pensaIn(c, 'A'), true)
})

test('una chat senza corsa resta com è, e la Map di prima non cambia', () => {
  const c0 = avvia(nessunaCorsa, 'A', dom('tmp1', 'x'))
  assert.equal(frammento(c0, 'Z', 'niente'), c0)
  const c1 = frammento(c0, 'A', 'y')
  assert.equal(c0.get('A')?.vivo, '')
  assert.equal(c1.get('A')?.vivo, 'y')
  assert.equal(nessunaCorsa.size, 0)
})

test('la chat nuova ha la sua riga a sinistra mentre pensa, una volta sola', () => {
  const elenco = [{ id: 'B', titolo: 'vecchia', quando: '2026-10-18T10:00:00Z' }]
  const con = conRiga(elenco, 'A', 'What did Nora say about the Harbor kickoff? And more words', '2026-10-19T10:00:00Z')
  assert.deepEqual(con.map(x => x.id), ['A', 'B'])
  assert.equal(con[0].titolo, 'What did Nora say about the Harbor kicko')
  assert.equal(conRiga(con, 'A', 'altro', 'x'), con)
})
