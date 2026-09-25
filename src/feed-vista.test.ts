// «Vista» è vera: la regola pura e la coda, senza un browser.
//
//   node --test src/feed-vista.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import * as ts from 'typescript'
import { readFileSync } from 'node:fs'

// `api.ts` ha le proprietà dei parametri, che Node non sa spogliare: si compila al volo
const apiUrl = new URL('./api.ts', import.meta.url).href
const hooks = registerHooks({ load(url, context, nextLoad) {
  if (url !== apiUrl) return nextLoad(url, context)
  return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText }
} })
const { contaComeVista, creaVista, PER_CHIAMATA } = await import('./feed-vista.ts')
hooks.deregister()

test('conta come vista: metà, un secondo, finestra visibile e davanti; ogni contro-caso no', () => {
  const ok = { visibile: true, fuoco: true, frazione: 0.5, da: 1000, adesso: 2000 }
  assert.equal(contaComeVista(ok), true)
  assert.equal(contaComeVista({ ...ok, visibile: false }), false, 'finestra nascosta')
  assert.equal(contaComeVista({ ...ok, fuoco: false }), false, 'finestra non davanti')
  assert.equal(contaComeVista({ ...ok, frazione: 0.49 }), false, 'meno di metà')
  assert.equal(contaComeVista({ ...ok, adesso: 1999 }), false, '999 millisecondi')
  assert.equal(contaComeVista({ ...ok, da: null }), false, 'mai entrata')
})

/** Un orologio finto, i timer a mano, la finestra che si può nascondere, l'invio che si può far cadere. */
function banco() {
  let ora = 0
  let visibile = true, fuoco = true
  let cade = false
  const mandate: string[][] = []
  const tentativi: number[] = []
  const timer: { fai: () => void; a: number }[] = []
  const v = creaVista({
    adesso: () => ora,
    visibile: () => visibile,
    fuoco: () => fuoco,
    manda: async ids => { tentativi.push(ora); if (cade) throw new Error('rete giù'); mandate.push(ids) },
    dopo: (fai, ms) => { const t = { fai, a: ora + ms }; timer.push(t); return () => { const i = timer.indexOf(t); if (i >= 0) timer.splice(i, 1) } }
  })
  const avanza = async (ms: number) => {
    ora += ms
    v.tick()
    for (const t of [...timer]) if (t.a <= ora) { timer.splice(timer.indexOf(t), 1); t.fai() }
    await new Promise(r => setImmediate(r))
  }
  return { v, mandate, tentativi, avanza, nascondi: () => { visibile = false }, mostra: () => { visibile = true }, sfoca: () => { fuoco = false }, focalizza: () => { fuoco = true }, rompi: () => { cade = true }, aggiusta: () => { cade = false } }
}

test('una carta sopra la metà per un secondo finisce in coda, parte dopo due secondi, e non si rimanda', async () => {
  const b = banco()
  b.v.frazione('a', 0.6)
  assert.equal(b.v.attiva(), true)
  await b.avanza(500)
  assert.deepEqual(b.mandate, [])
  await b.avanza(500)
  assert.deepEqual(b.mandate, [], 'in coda, ma l\'invio aspetta due secondi')
  assert.equal(b.v.attiva(), false, 'uscita dal registro: l\'orologio può fermarsi')
  await b.avanza(2000)
  assert.deepEqual(b.mandate, [['a']])
  // la stessa carta torna sopra la metà: non si rimanda
  b.v.frazione('a', 1)
  await b.avanza(1500); await b.avanza(2500)
  assert.deepEqual(b.mandate, [['a']])
})

test('il tempo conta solo mentre la finestra si vede ed è davanti: nascosta o dietro, il conto riparte', async () => {
  const b = banco()
  b.v.frazione('a', 0.8)
  await b.avanza(600)
  b.nascondi()
  await b.avanza(600)
  b.mostra()
  await b.avanza(600)
  await b.avanza(2500)
  assert.deepEqual(b.mandate, [], 'seicento millisecondi dopo il ritorno non sono un secondo')
  await b.avanza(500)
  await b.avanza(2500)
  assert.deepEqual(b.mandate, [['a']])
  // e la finestra dietro un'altra vale come nascosta
  const c = banco()
  c.v.frazione('b', 0.8)
  c.sfoca()
  await c.avanza(3000)
  await c.avanza(3000)
  assert.deepEqual(c.mandate, [])
  c.focalizza()
  await c.avanza(1000); await c.avanza(1000); await c.avanza(2500)
  assert.deepEqual(c.mandate, [['b']])
})

test('sotto la metà il conto si azzera; la coda dedupe, manda al massimo cinquanta, e dopo un guasto riprova', async () => {
  const b = banco()
  b.v.frazione('a', 0.6)
  await b.avanza(700)
  b.v.frazione('a', 0.3)
  b.v.frazione('a', 0.6)
  await b.avanza(700)
  await b.avanza(2500)
  assert.deepEqual(b.mandate, [], 'scesa sotto la metà: il secondo ricomincia')
  // sessanta carte insieme: cinquanta, poi dieci
  const c = banco()
  for (let i = 0; i < 60; i++) c.v.frazione(`c${i}`, 1)
  for (let i = 0; i < 60; i++) c.v.frazione(`c${i}`, 1)
  await c.avanza(1000)
  await c.avanza(2000)
  assert.equal(c.mandate[0].length, PER_CHIAMATA)
  await c.avanza(2000)
  assert.equal(c.mandate.length, 2)
  assert.equal(c.mandate[1].length, 10)
  assert.equal(new Set(c.mandate.flat()).size, 60)
  // un guasto: gli id tornano in coda, e alla prossima occasione ripartono
  const d = banco()
  d.rompi()
  d.v.frazione('x', 1)
  await d.avanza(1000); await d.avanza(2000)
  assert.deepEqual(d.mandate, [])
  assert.equal(d.v.perProva().coda.has('x'), true)
  d.aggiusta()
  // dopo un guasto l'attesa è raddoppiata: quattro secondi, non due
  await d.avanza(4000)
  assert.deepEqual(d.mandate, [['x']])
  assert.equal(d.v.perProva().inviate.has('x'), true)
})

test('con il server giù l’attesa raddoppia fino a un minuto, e torna a due secondi al primo invio riuscito', async () => {
  const b = banco()
  b.rompi()
  b.v.frazione('x', 1)
  await b.avanza(1000)
  await b.avanza(2000)
  assert.deepEqual(b.tentativi, [3000], 'il primo tentativo, due secondi dopo il secondo sullo schermo')
  // poi 4, 8, 16, 32 secondi, e da lì un minuto: non si bussa ogni due secondi
  for (const passo of [4000, 8000, 16000, 32000, 60000, 60000]) await b.avanza(passo)
  assert.deepEqual(b.tentativi, [3000, 7000, 15000, 31000, 63000, 123000, 183000])
  assert.deepEqual(b.mandate, [])
  assert.equal(b.v.perProva().coda.has('x'), true, 'niente si perde')
  // il server torna: l'invio riesce, e l'attesa ricomincia da due secondi
  b.aggiusta()
  await b.avanza(60000)
  assert.deepEqual(b.mandate, [['x']])
  b.v.frazione('y', 1)
  await b.avanza(1000)
  await b.avanza(2000)
  assert.deepEqual(b.mandate, [['x'], ['y']], 'dopo un invio riuscito si torna a due secondi')
})
