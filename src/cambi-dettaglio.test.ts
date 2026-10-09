// Il dettaglio manda solo quello che è stato toccato (`oggi/cambi-dettaglio.ts`).
//
// Il primo ottobre una riga affidata dal feed è sparita a metà lavoro, e il
// dettaglio, che rimandava tutti i campi anche uguali, era il primo
// indiziato: aprire il dettaglio di una riga al lavoro e salvarlo senza
// toccare niente non deve mandare niente.
//
//   node --test src/cambi-dettaglio.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Compito } from './api.ts'
import { cambiDelDettaglio, valoriDi } from './oggi/cambi-dettaglio.ts'

const OGGI = '2026-10-01'
const riga = (x: Partial<Compito> = {}): Compito => ({
  id: 'r', testo: 'Check Myynd\'s first full night run on 0.2.34', nota: 'Posso farlo io: leggo il registro.\n', quando: 'oggi', giorno: null, ora: null,
  stato: 'delegato', modo: 'tutto', progetto: 'p-myynd', priorita: null, ordine: 'a', origine: 'feed', voce: 'v', doc: null, chiesto: null,
  risultato: null, fonti: null, proposta: null, chieste: null, email: null, guaio: null,
  creato: OGGI, aggiornato: OGGI, chiuso: null, esito: null, sparito: null, versione: 1, ...x
} as Compito)

test('aprire il dettaglio di una riga al lavoro e salvare senza toccare niente non manda niente', () => {
  const c = riga()
  // i campi come li mostra il dettaglio: la nota com'è, il giorno di oggi per una riga «di oggi» senza data
  assert.deepEqual(cambiDelDettaglio(c, valoriDi(c, OGGI), OGGI), {})
  // e la nota rifilata dai campi non conta come cambiata
  assert.deepEqual(cambiDelDettaglio(c, { ...valoriDi(c, OGGI), nota: 'Posso farlo io: leggo il registro.' }, OGGI), {})
})

test('una riga «di oggi» senza data non si ritrova inchiodata alla data di oggi', () => {
  const c = riga()
  const v = { ...valoriDi(c, OGGI), priorita: 'alta' as const }
  assert.deepEqual(cambiDelDettaglio(c, v, OGGI), { priorita: 'alta' })
})

test('quello che cambia si manda, e solo quello', () => {
  const c = riga()
  assert.deepEqual(cambiDelDettaglio(c, { ...valoriDi(c, OGGI), testo: '  Check the night run  ' }, OGGI), { testo: 'Check the night run' })
  assert.deepEqual(cambiDelDettaglio(c, { ...valoriDi(c, OGGI), giorno: '2026-10-03' }, OGGI), { giorno: '2026-10-03', quando: 'settimana', ora: null })
  assert.deepEqual(cambiDelDettaglio(c, { ...valoriDi(c, OGGI), giorno: '' }, OGGI), { giorno: null, quando: 'poi', ora: null })
  assert.deepEqual(cambiDelDettaglio(c, { ...valoriDi(c, OGGI), progetto: '' }, OGGI), { progetto: null })
})

test('un’ora data a una riga «di oggi» senza data si porta dietro il giorno, che il server vuole', () => {
  const c = riga()
  assert.deepEqual(cambiDelDettaglio(c, { ...valoriDi(c, OGGI), ora: '10:30' }, OGGI), { giorno: OGGI, quando: 'oggi', ora: '10:30' })
  // con il giorno già scritto, basta l'ora
  const datata = riga({ giorno: OGGI })
  assert.deepEqual(cambiDelDettaglio(datata, { ...valoriDi(datata, OGGI), ora: '10:30' }, OGGI), { ora: '10:30' })
})

test('una riga che Myynd si è preparato non mostra il compito di chi lavora, e una nota sua non lo cancella', () => {
  const COMPITO = 'PROACTIVE PREPARATION TYPE: risposta. Prepare an unsent email reply for review.'
  const c = riga({ origine: 'guadagnata', nota: COMPITO })
  assert.equal(valoriDi(c, OGGI).nota, '')
  // aprire e salvare senza toccare: niente
  assert.deepEqual(cambiDelDettaglio(c, valoriDi(c, OGGI), OGGI), {})
  // una nota sua va in coda al compito, e il dettaglio poi mostra solo lei
  const fatto = cambiDelDettaglio(c, { ...valoriDi(c, OGGI), nota: 'Mention the Tuesday call' }, OGGI)
  assert.ok(fatto.nota?.startsWith(COMPITO))
  assert.match(fatto.nota ?? '', /Mention the Tuesday call$/)
  const dopo = riga({ origine: 'guadagnata', nota: fatto.nota })
  assert.equal(valoriDi(dopo, OGGI).nota, 'Mention the Tuesday call')
  // cancellata la sua, il compito resta
  assert.deepEqual(cambiDelDettaglio(dopo, { ...valoriDi(dopo, OGGI), nota: '' }, OGGI), { nota: COMPITO })
  // su una riga sua, la nota è la nota
  assert.deepEqual(cambiDelDettaglio(riga({ nota: null }), { ...valoriDi(riga({ nota: null }), OGGI), nota: 'x' }, OGGI), { nota: 'x' })
})
