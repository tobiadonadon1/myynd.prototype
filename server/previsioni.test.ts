// Le previsioni: pure, e senza fughe dal futuro.
//
//   node --test server/previsioni.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as p from './previsioni.ts'
import { coppieRisposta, type SegnaleArrivata, type SegnaleInviata } from './segnali.ts'

const ORA = 3_600_000
const GIORNO = 24 * ORA

/** Un mese finto: A scrive ogni giorno e lui risponde entro un'ora; B scrive ogni giorno e non ha mai risposta. */
function mese(seme = 1) {
  const arrivate: SegnaleArrivata[] = []
  const inviate: SegnaleInviata[] = []
  const inizio = Date.parse('2026-08-20T08:00:00.000Z')
  let n = 0
  for (let d = 0; d < 30; d++) {
    for (const [chi, nome, risponde] of [['a@acme.example', 'Anna', true], ['b@bulk.example', 'Bruno', false]] as const) {
      n++
      const quando = new Date(inizio + d * GIORNO + (chi === 'a@acme.example' ? 0 : ORA) + (seme % 7) * 60_000).toISOString()
      const id = `posta.arrivata|posta:INBOX:${n}`
      arrivate.push({ id, quando, chi, ref: `posta:INBOX:${n}`, progetto: null, dati: { messageId: `m${n}@x`, filo: `f${n}`, nome, titolo: `Mail ${n}`, richiesta: false } })
      if (risponde) {
        inviate.push({ id: `posta.inviata|posta:Sent:${n}`, quando: new Date(Date.parse(quando) + 50 * 60_000).toISOString(), chi, ref: `posta:Sent:${n}`,
          dati: { messageId: `s${n}@x`, risponde: `m${n}@x`, filo: `f${n}`, destinatari: [chi] } })
      }
    }
  }
  return { arrivate, inviate }
}

test('fuga: chi risponde sempre ad A e mai a B prende almeno 0,9 sulle sue affermazioni', () => {
  const { arrivate, inviate } = mese()
  let giuste = 0, totale = 0
  for (let d = 10; d < 30; d++) {
    const t0 = new Date(Date.parse('2026-08-20T09:30:00.000Z') + d * GIORNO)
    const fine = new Date(Date.parse('2026-08-21T00:00:00.000Z') + d * GIORNO)
    const primaDiT0 = inviate.filter(s => Date.parse(s.quando) < t0.getTime())
    const coppie = coppieRisposta(arrivate, primaDiT0)
    const cand = p.candidatiPosta(arrivate, coppie, t0, fine)
    // la mail di A di oggi (08:00, non ancora risposta alle 09:30) e quella di B di oggi
    assert.ok(cand.length >= 2, `giorno ${d}: ${cand.length} candidate`)
    const tutte = coppieRisposta(arrivate, inviate)
    for (const c of cand) {
      totale++
      if (p.esitoPosta(c, tutte, t0, fine, id => inviate.find(s => s.id === id)?.quando ?? null) === 'giusta') giuste++
    }
  }
  assert.ok(giuste / totale >= 0.9, `${giuste} su ${totale}`)
})

test('fuga: mescolare le etichette dopo t0 non cambia nessuna previsione', () => {
  const { arrivate, inviate } = mese()
  const t0 = new Date('2026-09-05T09:30:00.000Z')
  const fine = new Date('2026-09-06T00:00:00.000Z')
  const prima = inviate.filter(s => Date.parse(s.quando) < t0.getTime())
  const originali = p.candidatiPosta(arrivate, coppieRisposta(arrivate, prima), t0, fine)
  // il futuro, capovolto: le risposte dopo t0 vanno a B e non ad A
  const capovolte = inviate.map(s => Date.parse(s.quando) >= t0.getTime()
    ? { ...s, chi: 'b@bulk.example', dati: { ...s.dati, risponde: s.dati.risponde!.replace('m', 'mb'), destinatari: ['b@bulk.example'] } } : s)
  const primaCapovolte = capovolte.filter(s => Date.parse(s.quando) < t0.getTime())
  const dopo = p.candidatiPosta(arrivate, coppieRisposta(arrivate, primaCapovolte), t0, fine)
  assert.deepEqual(dopo, originali)
})

test('una mattina tardi esclude la mail già risposta prima di t0', () => {
  const { arrivate, inviate } = mese()
  const t0 = new Date('2026-09-05T14:00:00.000Z')  // la risposta ad A è delle 08:50
  const coppie = coppieRisposta(arrivate, inviate.filter(s => Date.parse(s.quando) < t0.getTime()))
  const cand = p.candidatiPosta(arrivate, coppie, t0, new Date('2026-09-06T00:00:00.000Z'))
  assert.ok(!cand.some(c => c.dati.chi === 'a@acme.example' && (c.dati.quando as string).startsWith('2026-09-05')), 'la mail di A di oggi era già risposta')
})

test('su uno sconosciuto senza richiesta non si scommette «non risponde»', () => {
  const t0 = new Date('2026-09-05T09:30:00.000Z')
  const a: SegnaleArrivata = { id: 'posta.arrivata|x', quando: '2026-09-05T08:00:00.000Z', chi: 'nuovo@altro.example', ref: 'x', progetto: null, dati: { messageId: 'x', filo: 'fx', nome: 'Nuovo', titolo: 'Ciao', richiesta: false } }
  assert.deepEqual(p.candidatiPosta([a], [], t0, new Date('2026-09-06T00:00:00.000Z')), [])
  const conRichiesta = { ...a, dati: { ...a.dati, richiesta: true } }
  const c = p.candidatiPosta([conRichiesta], [], t0, new Date('2026-09-06T00:00:00.000Z'))
  assert.equal(c.length, 1)
})

const cand = (n: number, p0: number, genere: p.Genere = 'posta.risponde'): p.Candidato => ({ genere, ref: `r${n}`, p: p0, dati: {} })

test('scegli: almeno cinque con cinque candidate anche sotto 0,7; mai più di dodici; tutte con meno di cinque, e sottile', () => {
  const poche = [cand(1, 0.9), cand(2, 0.6), cand(3, 0.55)]
  const r1 = p.scegli(poche)
  assert.equal(r1.scelte.length, 3); assert.equal(r1.sottile, true)
  const cinque = [cand(1, 0.9), cand(2, 0.6), cand(3, 0.55), cand(4, 0.52), cand(5, 0.51)]
  const r2 = p.scegli(cinque)
  assert.equal(r2.scelte.length, 5); assert.equal(r2.sottile, false)
  const tante = [...Array(20)].map((_, i) => cand(i, 0.95 - i * 0.01))
  const r3 = p.scegli(tante)
  assert.equal(r3.scelte.length, 8, 'il tetto della posta è otto')
  const miste = [...[...Array(10)].map((_, i) => cand(i, 0.9, 'posta.risponde')), ...[...Array(8)].map((_, i) => cand(100 + i, 0.9, 'compito.chiude')), cand(200, 0.92, 'progetto.del_giorno'), cand(201, 0.91, 'progetto.del_giorno')]
  const r4 = p.scegli(miste)
  assert.equal(r4.scelte.length, 12)
  assert.equal(r4.scelte.filter(c => c.genere === 'progetto.del_giorno').length, 1)
  assert.equal(r4.scelte.filter(c => c.genere === 'compito.chiude').length, 5)
  assert.ok(r4.scelte.every((c, i, a) => i === 0 || a[i - 1]!.p >= c.p), 'in ordine di fiducia')
})

test('la base per ogni genere', () => {
  assert.equal(p.base({ genere: 'posta.risponde', ref: 'x', dati: {} }, { esito: 'giusta' }), false)
  assert.equal(p.base({ genere: 'posta.risponde', ref: 'x', dati: {} }, { esito: 'sbagliata' }), true)
  assert.equal(p.base({ genere: 'posta.non_risponde', ref: 'x', dati: {} }, { esito: 'giusta' }), true)
  assert.equal(p.base({ genere: 'progetto.del_giorno', ref: 'nw', dati: { ieri: 'nw' } }, { esito: 'giusta', vero: 'nw' }), true)
  assert.equal(p.base({ genere: 'progetto.del_giorno', ref: 'nw', dati: { ieri: 'hb' } }, { esito: 'giusta', vero: 'nw' }), false)
  assert.equal(p.base({ genere: 'progetto.del_giorno', ref: 'nw', dati: { ieri: null } }, { esito: 'sbagliata', vero: 'hb' }), false)
  assert.equal(p.base({ genere: 'compito.chiude', ref: 'c', dati: {} }, { esito: 'giusta' }), true)
  assert.equal(p.base({ genere: 'compito.slitta', ref: 'c', dati: {} }, { esito: 'giusta' }), false)
})

test('brier, vincitore, il progetto e i compiti', () => {
  assert.equal(p.brier([]), 0)
  assert.equal(p.brier([{ p: 1, giusta: true }, { p: 0.5, giusta: false }]), 0.125)
  assert.equal(p.vincitore(new Map()), null)
  assert.equal(p.vincitore(new Map([['a', 0], ['b', 0]])), null, 'senza minuti nessuno vince: la previsione si annulla')
  assert.equal(p.vincitore(new Map([['a', 10], ['b', 30]])), 'b')
  assert.equal(p.candidatoProgetto(new Map([['a', 100]]), 'a', { eventi: new Map(), compiti: new Map(), alta: new Set() }), null, 'un progetto solo non è una previsione')
  const c = p.candidatoProgetto(new Map([['a', 100], ['b', 40]]), 'b', { eventi: new Map([['b', 2]]), compiti: new Map(), alta: new Set(['a']) })
  assert.ok(c && c.genere === 'progetto.del_giorno' && c.p > 0.5 && c.p < 1)
  assert.equal(c!.ref, 'b', 'ieri e due eventi oggi battono la quota della settimana')
  const t0 = new Date('2026-09-24T08:00:00.000Z')
  const compiti = p.candidatiCompiti([
    { id: 'c1', testo: 'x', priorita: 'alta', stato: 'pronto', creato: '2026-09-24T07:00:00.000Z' },
    { id: 'c2', testo: 'y', priorita: null, stato: 'aperto', creato: '2026-09-10T07:00:00.000Z' }
  ], { pianificati: 10, chiusiInGiornata: 5 }, t0)
  assert.equal(compiti[0]!.genere, 'compito.chiude'); assert.ok(compiti[0]!.p > 0.8)
  assert.equal(compiti[1]!.genere, 'compito.slitta'); assert.ok(compiti[1]!.p >= 0.7, `${compiti[1]!.p}`)
})
