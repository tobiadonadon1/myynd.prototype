// Il primo gradino: quattro bozze su cinque partite com'erano, e quella persona
// ha le risposte pronte la mattina; due riscritte di fila, o «Take it back», e
// torna giù.
//
//   node --test server/gradino.test.ts

import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Documento } from './store.ts'

const dir = mkdtempSync(join(tmpdir(), 'myynd-gradino-'))
process.env.MYYND_DATI = dir
const store = await import('./store.ts')
const cfg = await import('./config.ts')
const gradino = await import('./gradino.ts')
const iniziativa = await import('./iniziativa.ts')
const attenzione = await import('./attenzione.ts')
const gemello = await import('./gemello.ts')
const compiti = await import('./compiti.ts')

beforeEach(() => { store.azzeraTutto(); rmSync(join(dir, 'iniziativa.json'), { force: true }); cfg.scrivi({ lingua: 'en', autonomia: 'preparare' }) })
after(() => { store.chiudiIndici(); rmSync(dir, { recursive: true, force: true }) })

const ORA = Date.now()
const NORA = 'nora@harbor.example'
let n = 0
/** Una bozza di risposta partita verso Nora: 0 intatta, 0.1 ritoccata, 0.4 modificata, 0.8 riscritta. */
const parte = (distanza: number, indirizzo = NORA) => gradino.registraInvio({ compito: `r${++n}`, indirizzo, nome: 'Nora', distanza, quando: new Date(ORA - 3_600_000 + n * 1000).toISOString() })

test('sale a quattro su cinque intatte o quasi, non prima; due riscritte di fila lo fanno scendere', () => {
  parte(0); parte(0.1); parte(0.8)
  assert.equal(gradino.acceso(NORA), null, 'due su tre non bastano')
  parte(0)
  assert.equal(gradino.acceso(NORA), null, 'tre buone su quattro non bastano')
  parte(0.05)
  const g = gradino.acceso(NORA)
  assert.ok(g, 'quattro su cinque')
  assert.equal(g.nome, 'Nora')
  assert.equal(g.su, 4); assert.equal(g.leggere, 5)
  // una riscritta sola non basta per scendere
  parte(0.9)
  assert.ok(gradino.acceso(NORA))
  // una modificata a metà in mezzo non è una riscritta: non scende
  parte(0.4)
  assert.ok(gradino.acceso(NORA), 'una bozza modificata a metà non è un rifiuto')
  // la seconda riscritta di fila sì (la modificata non rompe la fila)
  parte(0.8)
  assert.equal(gradino.acceso(NORA), null)
  // e dopo due riscritte non si risale con una buona: le ultime cinque non fanno quattro
  parte(0)
  assert.equal(gradino.acceso(NORA), null)
  // un'altra persona non c'entra
  assert.equal(gradino.acceso('leo@studio.example'), null)
})

test('la stessa riga non conta due volte (vista da «Manda» e poi nella posta inviata)', () => {
  for (let i = 0; i < 4; i++) gradino.registraInvio({ compito: 'stessa', indirizzo: NORA, distanza: 0 })
  assert.equal(gradino.acceso(NORA), null)
})

test('«Take it back» lo fa scendere subito, e per risalire servono quattro bozze nuove', () => {
  for (let i = 0; i < 4; i++) parte(0)
  assert.ok(gradino.acceso(NORA))
  gradino.ritira(NORA, new Date(ORA))
  assert.equal(gradino.acceso(NORA), null)
  assert.deepEqual(gradino.guadagnati(), [])
  for (let i = 0; i < 3; i++) gradino.registraInvio({ compito: `dopo${i}`, indirizzo: NORA, distanza: 0, quando: new Date(ORA + (i + 1) * 1000).toISOString() })
  assert.equal(gradino.acceso(NORA), null)
  gradino.registraInvio({ compito: 'dopo3', indirizzo: NORA, distanza: 0, quando: new Date(ORA + 5000).toISOString() })
  assert.ok(gradino.acceso(NORA))
})

const mail = (id: string, autore: string, extra: Partial<Documento> = {}): Documento => ({
  id, fonte: 'posta', tipo: 'email', titolo: `Pilot scope ${id}`, corpo: 'Could you confirm the pilot scope and reply with the start date?', autore, quando: new Date(ORA - 3_600_000).toISOString(), messageId: `${id}@harbor.example`, ...extra
})

test('di notte, ogni mail di chi è salito che chiede una risposta ha la sua riga in coda, anche con le proposte spente', () => {
  store.salvaDocumenti([mail('a', `Nora <${NORA}>`), mail('b', `Nora <${NORA}>`, { messageId: 'b@harbor.example' }), mail('c', 'Leo <leo@studio.example>')])
  const prima: string[] = []
  assert.deepEqual(iniziativa.guadagnate(ORA, id => { prima.push(id) }, () => true), [], 'nessuno è salito: niente')
  for (let i = 0; i < 4; i++) parte(0)
  const code: unknown[][] = []
  const nate = iniziativa.guadagnate(ORA, (...a) => { code.push(a) }, () => true)
  assert.equal(nate.length, 2, 'le due di Nora, non quella di Leo')
  assert.deepEqual(code.map(x => x.slice(1)), [['bozza', false], ['bozza', false]])
  for (const id of nate) {
    const c = store.compito(id)!
    assert.equal(c.origine, gradino.ORIGINE)
    assert.match(c.testo, /^Draft a reply: Pilot scope/)
  }
  // la riga dice da dove viene il permesso, finché Nora resta su
  const vista = attenzione.compitiAttuali().find(c => c.id === nate[0])!
  assert.deepEqual(vista.guadagnato, { indirizzo: NORA, nome: 'Nora' })
  // un secondo giro non le rifà
  assert.deepEqual(iniziativa.guadagnate(ORA, () => assert.fail('due volte'), () => true), [])
  // in pausa, o senza motore, niente
  store.salvaDocumenti([mail('d', `Nora <${NORA}>`, { messageId: 'd@harbor.example' })])
  cfg.aggiorna({ autonomia: 'chiedere' })
  assert.deepEqual(iniziativa.guadagnate(ORA, () => assert.fail('in pausa'), () => true), [])
  cfg.aggiorna({ autonomia: 'preparare' })
  assert.deepEqual(iniziativa.guadagnate(ORA, () => assert.fail('senza motore'), () => false), [])
  // ripreso: la riga non lo dice più, e la riga nata da lì non è più valida
  gradino.ritira(NORA)
  assert.equal(attenzione.compitiAttuali().find(c => c.id === nate[0])!.guadagnato, null)
  assert.equal(gradino.rigaValida(store.compito(nate[0])!), false)
})

test('il giro di ogni quarto d’ora passa dalle guadagnate, anche con le proposte spente', async () => {
  store.salvaDocumenti([mail('p1', `Nora <${NORA}>`, { messageId: 'p1@harbor.example' })])
  for (let i = 0; i < 4; i++) parte(0)
  const code: string[] = []
  await iniziativa.preparazione(ORA, id => { code.push(id) }, () => true)
  assert.equal(code.length, 1)
  assert.equal(store.compito(code[0]!)?.origine, gradino.ORIGINE)
})

test('«Come lavori» elenca chi è salito', () => {
  for (let i = 0; i < 4; i++) parte(0)
  const v = gemello.vista()
  assert.deepEqual(v.guadagnati.map(g => [g.indirizzo, g.nome, g.su, g.leggere]), [[NORA, 'Nora', 4, 4]])
})

test('«Manda»: conta la risposta a chi aveva scritto, con l\'indirizzo scritto come capita; una girata a un altro no', () => {
  store.salvaDocumenti([mail('m1', `Nora <${NORA}>`)])
  for (let i = 0; i < 4; i++) {
    store.scriviCompito({ id: `manda${i}`, testo: 'Reply to Nora', ordine: `m${i}`, doc: 'm1' })
    assert.equal(gradino.dopoManda(store.compito(`manda${i}`)!, i % 2 ? 'Nora <NORA@Harbor.example>' : NORA, 'Nora', 0), true)
  }
  assert.ok(gradino.acceso(NORA))
  store.scriviCompito({ id: 'girata', testo: 'Forward to Sara', ordine: 'g', doc: 'm1' })
  assert.equal(gradino.dopoManda(store.compito('girata')!, 'sara@harbor.example', 'Sara', 0.9), false)
  assert.equal(gradino.acceso('sara@harbor.example'), null)
  // una riga senza la mail di partenza non è una risposta
  store.scriviCompito({ id: 'senza', testo: 'Write to Nora', ordine: 's' })
  assert.equal(gradino.dopoManda(store.compito('senza')!, NORA, 'Nora', 0), false)
})

test('«Take it back» ritira subito le risposte in coda per quella persona; una bozza già pronta resta, e Leo non c\'entra', () => {
  store.salvaDocumenti([mail('a', `Nora <${NORA}>`), mail('b', `Nora <${NORA}>`, { messageId: 'b@harbor.example' }), mail('c', `Nora <${NORA}>`, { messageId: 'c@harbor.example' }), mail('l', 'Leo <leo@studio.example>', { messageId: 'l@studio.example' })])
  for (let i = 0; i < 4; i++) parte(0)
  for (let i = 0; i < 4; i++) gradino.registraInvio({ compito: `leo${i}`, indirizzo: 'leo@studio.example', distanza: 0 })
  const nate = iniziativa.guadagnate(ORA, () => {}, () => true)
  assert.equal(nate.length, 4)
  const di = (doc: string) => nate.find(id => store.compito(id)!.doc === doc)!
  // una in coda per il turno, una al lavoro, una già pronta
  store.default.prepare("UPDATE compiti SET stato = 'aperto', modo = 'bozza' WHERE id = ?").run(di('a'))
  store.default.prepare("UPDATE compiti SET stato = 'delegato', modo = 'bozza' WHERE id = ?").run(di('b'))
  store.default.prepare("UPDATE compiti SET stato = 'pronto', modo = 'bozza', risultato = 'Hi Nora' WHERE id = ?").run(di('c'))
  store.default.prepare("UPDATE compiti SET stato = 'delegato', modo = 'bozza' WHERE id = ?").run(di('l'))
  gradino.ritira(NORA)
  assert.deepEqual(compiti.ritiraGuadagnate(NORA).sort(), [di('a'), di('b')].sort())
  assert.equal(store.compito(di('a'))!.stato, 'ritirato')
  assert.equal(store.compito(di('b'))!.stato, 'ritirato')
  assert.equal(store.compito(di('c'))!.stato, 'pronto', 'la bozza fatta resta sua')
  assert.equal(store.compito(di('l'))!.stato, 'delegato', 'Leo non è stato ripreso')
  assert.ok(!store.elencoCompiti().some(c => c.id === di('a') || c.id === di('b')))
})
