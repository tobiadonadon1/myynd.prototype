// I tempi (P10): cosa si scrive nel registro, e cosa mai.
//
//   node --test server/tempi.test.ts

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import * as tempi from './tempi.ts'
import * as chi from './chi.ts'

let ora = 0
let righe: string[] = []
let abilitato = 0
const finto = () => ({
  enable() { abilitato++; return true }, disable() { abilitato--; return true }, reset() {},
  max: 420e6, percentile: () => 180e6
})
beforeEach(() => {
  ora = 1000; righe = []; abilitato = 0
  tempi.perProva({ ora: () => ora, log: r => righe.push(r), monitor: finto })
})

function richiesta(o: { metodo?: string; path: string; rotta?: string; tipo?: string }) {
  const res = new EventEmitter() as EventEmitter & { write: (...a: unknown[]) => unknown; getHeader(n: string): unknown; scritti: number }
  res.scritti = 0
  res.write = () => { res.scritti++; return true }
  res.getHeader = n => n === 'Content-Type' ? o.tipo : undefined
  const req: { method: string; path: string; baseUrl: string; route?: { path: string } } = { method: o.metodo ?? 'GET', path: o.path, baseUrl: '' }
  tempi.misuraRichieste(req, res, () => {})
  return {
    finisci(ms: number) { ora += ms; if (o.rotta) req.route = { path: o.rotta }; res.emit('finish') },
    scrivi(ms: number) { ora += ms; res.write('x') }
  }
}

test('una richiesta lenta si scrive con la forma della rotta, mai con la query o il percorso vero', () => {
  const r = richiesta({ path: '/api/documento', rotta: '/api/documento' })
  // la query vera sarebbe ?id=desktop:/Users/x/segreto: il middleware non la legge mai
  r.finisci(400)
  assert.deepEqual(righe, ['myynd · tempi · GET /api/documento 400 ms'])
  for (const l of righe) { assert.ok(!l.includes('segreto')); assert.ok(!l.includes('?')) }
  const x = tempi.riassunto().richieste.find(q => q.rotta === 'GET /api/documento')
  assert.equal(x?.n, 1)
})

test('una rotta che non combacia si chiama «altro»', () => {
  richiesta({ path: '/Users/x/segreto' }).finisci(500)
  assert.deepEqual(righe, ['myynd · tempi · GET altro 500 ms'])
})

test('un flusso non tiene «qualcuno aspetta» acceso, e si misura fino alla prima riga', () => {
  const r = richiesta({ metodo: 'POST', path: '/api/chat/abc', rotta: '/api/chat/:id', tipo: 'text/event-stream' })
  assert.equal(tempi.qualcunoAspetta(), true)
  r.scrivi(30)
  ora += 5000
  assert.equal(tempi.qualcunoAspetta(), false)
  r.finisci(60_000)
  assert.equal(tempi.riassunto().richieste[0].max, 30)
  // e il filo dei compiti non si conta mai
  richiesta({ path: '/api/compiti/flusso', tipo: 'text/event-stream' })
  assert.equal(tempi.qualcunoAspetta(), false)
})

test('qualcunoAspetta: vero durante una richiesta e fino a due secondi dopo; quieto dopo', () => {
  assert.equal(tempi.qualcunoAspetta(), false)
  assert.equal(tempi.quieto(120_000), true)
  const r = richiesta({ path: '/api/feed', rotta: '/api/feed' })
  assert.equal(tempi.qualcunoAspetta(), true)
  assert.equal(tempi.quieto(1), false)
  r.finisci(10)
  assert.equal(tempi.qualcunoAspetta(), true)
  ora += 2001
  assert.equal(tempi.qualcunoAspetta(), false)
  assert.equal(tempi.quieto(120_000), false)
  ora += 120_000
  assert.equal(tempi.quieto(120_000), true)
})

test('la rassegna che chiede ogni minuto e /api/tempi non si contano', () => {
  richiesta({ path: '/api/rassegna' })
  richiesta({ metodo: 'POST', path: '/api/tempi' })
  assert.equal(tempi.qualcunoAspetta(), false)
})

test('le tappe della chat: 21 risposte ne tengono 20, e B non vede quelle di A', () => {
  chi.dentro('a@x', () => {
    for (let i = 0; i < 21; i++) {
      const t = tempi.tappeChat()
      ora += 5; t.segna('materiale')
      ora += 10; t.segna('prima-parola')
      t.segna('prima-parola')
      ora += 100; t.chiudi({ via: 'chiave', breve: i === 20 })
    }
    const r = tempi.riassunto().chat
    assert.equal(r.length, 20)
    assert.equal(r.at(-1)!.breve, true)
    assert.equal(r[0].materiale, 5)
    assert.equal(r[0].primaParola, 15)
    assert.equal(r[0].fine, 115)
    assert.equal(r[0].prompt, undefined)
  })
  chi.dentro('b@x', () => assert.deepEqual(tempi.riassunto().chat, []))
  assert.equal(righe.at(-1), 'myynd · tempi · chat · materiale 5 · prima parola 15 · fine 115 · via chiave · breve')
})

test('i segni del client: la lista sì, il resto no, e i valori stanno fra 0 e 600000', () => {
  assert.deepEqual(tempi.segniDelClient({ segni: { accesso: 40.4, 'casa-disegnata': 700000, feed: -5 } }), { accesso: 40, 'casa-disegnata': 600000, feed: 0 })
  assert.equal(tempi.segniDelClient({ segni: { sconosciuto: 1 } }), null)
  assert.equal(tempi.segniDelClient({ segni: { accesso: Number.NaN } }), null)
  assert.equal(tempi.segniDelClient({ segni: { accesso: '4' } }), null)
  const dieci: Record<string, number> = {}
  for (const k of [...tempi.SEGNI_CLIENT, 'accesso2']) dieci[k] = 1
  assert.equal(tempi.segniDelClient({ segni: dieci }), null)
  assert.equal(tempi.segniDelClient(null), null)
  assert.equal(tempi.segniDelClient({ segni: [] }), null)
  assert.equal(tempi.rigaSegni({ accesso: 40, stato: 85, 'casa-disegnata': 410 }), 'myynd · tempi · avvio · accesso 40 · stato 85 · casa disegnata 410')
  assert.equal(tempi.rigaSegni({ 'invio-premuto': 0, 'prima-parola': 1900, 'chat-fine': 9300 }), 'myynd · tempi · chat · invio 0 · prima parola 1900 · fine 9300')
})

test('carteNate senza un risveglio non scrive niente; dopo un risveglio una volta sola', () => {
  chi.dentro('a@x', () => {
    tempi.carteNate(3)
    assert.deepEqual(righe, [])
    tempi.segnaSveglia()
    tempi.carteNate(0)
    assert.deepEqual(righe, [])
    tempi.carteNate(2)
    assert.equal(righe.length, 1)
    assert.match(righe[0], /^myynd · tempi · sveglia → prima carta \d+ s$/)
    tempi.carteNate(2)
    assert.equal(righe.length, 1)
    assert.notEqual(tempi.bordo([], []).svegliaCarta, null)
  })
  chi.dentro('b@x', () => assert.equal(tempi.bordo([], []).svegliaCarta, null))
})

test('bordo: p50, p95 e n; la riga solo con le parti che hanno numeri', () => {
  const b = tempi.bordo([240_000, 60_000, 1_860_000, -5], [])
  assert.deepEqual(b.arrivoCarta, { p50: 240_000, p95: 1_860_000, n: 3 })
  assert.deepEqual(b.affidatoPronto, { p50: null, p95: null, n: 0 })
  assert.equal(tempi.rigaBordo(b), 'myynd · tempi · bordo · arrivo → carta p50 4 min, p95 31 min (3)')
  assert.equal(tempi.rigaBordo(tempi.bordo([], [])), null)
})

test('il monitor del ciclo dorme quando niente è in volo, e si accende con il lavoro', async () => {
  assert.equal(tempi.misura(), false)
  assert.equal(abilitato, 0)
  await tempi.misuraLavoro('rilettura', async () => {
    assert.equal(tempi.misura(), true)
    tempi.guardaIlMinuto()
  })
  assert.equal(abilitato, 1)
  assert.match(righe[0], /^myynd · tempi · ciclo fermo max 420 ms, p99 180 ms · lavori: rilettura$/)
  assert.deepEqual(tempi.riassunto().ciclo && { max: tempi.riassunto().ciclo!.max, p99: tempi.riassunto().ciclo!.p99 }, { max: 420, p99: 180 })
})

test('un lavoro lungo si scrive, uno corto no', async () => {
  await tempi.misuraLavoro('rassegna', async () => { ora += 500 })
  assert.deepEqual(righe, [])
  await tempi.misuraLavoro('rilettura', async () => { ora += 12_400 })
  assert.deepEqual(righe, ['myynd · tempi · lavoro rilettura 12.4 s'])
})

test('cedi conta le cessioni', async () => {
  await tempi.cedi(); await tempi.cedi()
  assert.equal(tempi.cessioni(), 2)
})
