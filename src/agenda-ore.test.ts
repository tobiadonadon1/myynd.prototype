// Dove finisce un'attività nella settimana: nella griglia, o nella fascia.
//
// La prova sta sul pezzo che decide, non sulla schermata che disegna: è quello
// che si può sbagliare senza che nessuno se ne accorga. Una riga con un'ora
// storta che scivola nella fascia, una senza ora che finisce a mezzanotte, una
// che risulta in tutt'e due i posti o in nessuno: tre difetti che a occhio, su
// una settimana piena, non si vedono.
//
//   node --test src/agenda-ore.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DURATA_COMPITO, compitiDelGiorno, istante, minutiDaOra, nellaGriglia, oraDaMinuti, oraDi,
  oraValida, posaCompito
} from './agenda-ore.ts'
import { affianca } from './oggi/giorni.ts'

const G = '2026-09-17'

test('an hour is HH:MM or it is not an hour at all', () => {
  for (const v of ['00:00', '09:30', '23:59']) assert.equal(oraValida(v), true)
  for (const v of ['9:30', '09:60', '24:00', '09:30:00', '2026-09-17T09:30', '', ' 09:30', null, undefined, 930])
    assert.equal(oraValida(v), false)
  // una riga con un'ora scritta male vale come una riga senza ora: non si
  // disegna a caso, si disegna nella fascia
  assert.equal(oraDi({ ora: '09:30' }), '09:30')
  assert.equal(oraDi({ ora: '9:30' }), null)
  assert.equal(oraDi({ ora: null }), null)
  assert.equal(oraDi({}), null)
})

test('minutes and hours convert back and forth, and midnight comes round again', () => {
  assert.equal(minutiDaOra('00:00'), 0)
  assert.equal(minutiDaOra('09:30'), 570)
  assert.equal(minutiDaOra('23:59'), 1439)
  assert.equal(oraDaMinuti(0), '00:00')
  assert.equal(oraDaMinuti(570), '09:30')
  assert.equal(oraDaMinuti(1439), '23:59')
  // quello che sfora il giorno si riavvolge invece di scrivere «24:30»
  assert.equal(oraDaMinuti(1470), '00:30')
  assert.equal(oraDaMinuti(-30), '23:30')
  for (const m of [0, 15, 570, 1439]) assert.equal(minutiDaOra(oraDaMinuti(m)), m)
})

test('a timed task is drawn where its hour is, one hour tall', () => {
  assert.deepEqual(posaCompito(G, '09:00'), { top: 9 / 24, altezza: 1 / 24 })
  assert.deepEqual(posaCompito(G, '09:00', 6, 22), { top: 3 / 16, altezza: 1 / 16 })
  // l'ultima ora del giorno si taglia alla mezzanotte invece di sfondare la griglia
  assert.deepEqual(posaCompito(G, '23:30'), { top: 23.5 / 24, altezza: 0.5 / 24 })
  // senza ora non c'è niente da disegnare nella griglia: quella riga sta nella fascia
  assert.equal(posaCompito(G, null), null)
  assert.equal(posaCompito(G, '9:30'), null)
  // fuori dalla fascia disegnata non lascia un blocco appiccicato in cima
  assert.equal(posaCompito(G, '03:00', 6, 22), null)
  assert.equal(DURATA_COMPITO, 60)
})

test('every task of a day lands in one of the two places, never both and never neither', () => {
  const compiti = [
    { id: 'a', quando: 'oggi', giorno: G, ora: '10:00' },
    { id: 'b', quando: 'oggi', giorno: G, ora: null },
    { id: 'c', quando: 'oggi', giorno: G, ora: '10:30' },
    // scritta male: vale come senza ora, non si inventa un posto
    { id: 'd', quando: 'settimana', giorno: G, ora: '10' },
    // un altro giorno: qui non c'entra niente
    { id: 'e', quando: 'oggi', giorno: '2026-09-18', ora: '10:00' },
    // «oggi» senza data scritta: il suo giorno è quello di oggi
    { id: 'f', quando: 'oggi', giorno: null, ora: null }
  ]
  const { aOre, tuttoIlGiorno } = compitiDelGiorno(compiti, G, G)
  assert.deepEqual(aOre.map(c => c.id), ['a', 'c'])
  assert.deepEqual(tuttoIlGiorno.map(c => c.id), ['b', 'd', 'f'])
  // nessuna riga in tutt'e due i mucchi, e nessuna persa per strada
  const suoi = compiti.filter(c => c.id !== 'e').map(c => c.id).sort()
  assert.deepEqual([...aOre, ...tuttoIlGiorno].map(c => c.id).sort(), suoi)

  // un giorno diverso da oggi non si porta dietro le righe di «oggi» senza data
  const altro = compitiDelGiorno(compiti, '2026-09-18', G)
  assert.deepEqual(altro.aOre.map(c => c.id), ['e'])
  assert.deepEqual(altro.tuttoIlGiorno.map(c => c.id), [])
})

test('a task and an event at the same hour stand side by side, like two events', () => {
  const eventi = [
    { id: 'riunione', inizio: istante(G, 10 * 60), fine: istante(G, 11 * 60), tuttoIlGiorno: false },
    { id: 'fiera', inizio: istante(G, 0), fine: istante(G, 24 * 60), tuttoIlGiorno: true },
    { id: 'ieri', inizio: istante('2026-09-15', 9 * 60), fine: istante('2026-09-15', 10 * 60), tuttoIlGiorno: false }
  ]
  const compiti = [
    { id: 'preventivo', quando: 'oggi', giorno: G, ora: '10:00' },
    { id: 'spesa', quando: 'oggi', giorno: G, ora: null }
  ]
  const dentro = nellaGriglia(G, eventi, compiti, G)
  // il tutto il giorno e l'evento di un altro giorno non entrano nelle ore
  assert.deepEqual(dentro.map(x => x.tipo === 'evento' ? x.evento.id : x.compito.id), ['riunione', 'preventivo'])
  assert.deepEqual(dentro.map(x => x.tipo), ['evento', 'compito'])

  // e si contendono la stessa ora: due colonne, una per uno
  const affiancati = affianca(dentro)
  assert.equal(affiancati.length, 2)
  for (const a of affiancati) assert.equal(a.colonne, 2)
  assert.notEqual(affiancati[0].colonna, affiancati[1].colonna)

  // l'attività è alta un'ora anche se nessuno le ha dato una fine
  const suo = dentro.find(x => x.tipo === 'compito')!
  assert.equal((new Date(suo.fine).getTime() - new Date(suo.inizio).getTime()) / 60000, DURATA_COMPITO)
})
