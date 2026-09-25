// Le frasi del resoconto (P9), in tutte e due le lingue, senza lineette.
//
//   node --test src/resoconto.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
;(globalThis as unknown as { document: unknown }).document = { documentElement: { lang: '' } }
const { impostaLingua, t } = await import('./lingua.ts')
const p = await import('./resoconto-parole.ts')

const LINEETTE = /[—–]/
const tutte = (f: () => string | null) => {
  const fuori: Record<string, string | null> = {}
  for (const l of ['it', 'en'] as const) { impostaLingua(l); fuori[l] = f() }
  impostaLingua('en')
  return fuori
}

test('rigaNumeri toglie gli zeri e usa il singolare', () => {
  assert.deepEqual(tutte(() => p.rigaNumeri({ mail: 5, lavori: 6, scadenze: 2 })), {
    it: '5 mail mandate, 6 lavori consegnati, 2 scadenze segnalate.',
    en: '5 emails sent, 6 pieces of work delivered, 2 deadlines flagged.'
  })
  assert.deepEqual(tutte(() => p.rigaNumeri({ mail: 1, lavori: 0, scadenze: 1 })), { it: '1 mail mandata, 1 scadenza segnalata.', en: '1 email sent, 1 deadline flagged.' })
  assert.deepEqual(tutte(() => p.rigaNumeri({ mail: 0, lavori: 1, scadenze: 0 })), { it: '1 lavoro consegnato.', en: '1 piece of work delivered.' })
  assert.equal(p.rigaNumeri({ mail: 0, lavori: 0, scadenze: 0 }), '')
  assert.deepEqual(tutte(() => p.rigaSegnalate(3)), { it: '3 cose segnalate.', en: '3 things flagged.' })
  assert.deepEqual(tutte(() => p.rigaSegnalate(1)), { it: '1 cosa segnalata.', en: '1 thing flagged.' })
  assert.equal(p.rigaSegnalate(0), '')
})

test('durata: a cinque minuti, le ore con i minuti a due cifre', () => {
  assert.equal(p.durata(4), null)
  assert.equal(p.durata(0), null)
  assert.equal(p.durata(33), '35 min')
  assert.equal(p.durata(64.2), '1 h 05')
  assert.equal(p.durata(65), '1 h 05')
  assert.equal(p.durata(118), '2 h')
  assert.equal(p.durata(58), '1 h')
})

test("stima: l'unità solo quando cambia, e le riscritte", () => {
  const stime = [{ genere: 'mail', minuti: 4 }, { genere: 'documento', minuti: 20 }, { genere: 'codice', minuti: 15 }, { genere: 'bozza', minuti: 5 }, { genere: 'agenda', minuti: 1 }, { genere: 'riordino', minuti: 0.1 }] as const
  assert.deepEqual(tutte(() => p.stima([...stime], 1)), {
    it: 'Stima: 4 minuti a mail, 20 a documento, 15 a lavoro sul codice, 5 a bozza, 1 a evento, 6 secondi a messaggio, niente per quella che hai riscritto.',
    en: 'Estimate: 4 minutes an email, 20 a document, 15 a piece of code work, 5 a draft, 1 an event, 6 seconds a message, nothing for the one you rewrote.'
  })
  assert.deepEqual(tutte(() => p.stima([{ genere: 'agenda', minuti: 1 }], 2)), {
    it: 'Stima: 1 minuto a evento, niente per le 2 che hai riscritto.',
    en: 'Estimate: 1 minute an event, nothing for the 2 you rewrote.'
  })
  assert.equal(p.stima([], 0), '')
})

test("periodo: l'elisione e i mesi a cavallo", () => {
  // date locali: le costruisce il fuso della macchina, come il browser
  const loc = (a: number, m: number, g: number) => new Date(a, m - 1, g).toISOString()
  assert.deepEqual(tutte(() => p.periodo(loc(2026, 9, 14), loc(2026, 9, 21), 'scorsa')), { it: 'dal 14 al 20 settembre', en: '14 to 20 September' })
  assert.deepEqual(tutte(() => p.periodo(loc(2026, 9, 28), loc(2026, 10, 5), 'scorsa')), { it: 'dal 28 settembre al 4 ottobre', en: '28 September to 4 October' })
  assert.equal(tutte(() => p.periodo(loc(2026, 6, 8), loc(2026, 6, 15), 'scorsa')).it, 'dall’8 al 14 giugno')
  assert.equal(tutte(() => p.periodo(loc(2026, 5, 5), loc(2026, 5, 12), 'scorsa')).it, 'dal 5 all’11 maggio')
  assert.deepEqual(tutte(() => p.periodo(loc(2026, 9, 21), loc(2026, 9, 23), 'questa')), { it: 'da lunedì 21 settembre', en: 'since Monday 21 September' })
  assert.deepEqual(tutte(() => p.periodo(loc(2026, 9, 2), loc(2026, 9, 23), 'inizio')), { it: 'dal 2 settembre', en: 'since 2 September' })
  assert.equal(tutte(() => p.periodo(loc(2026, 9, 1), loc(2026, 9, 23), 'inizio')).it, 'dall’1 settembre')
})

test('punteggio: la frase del gemello, con la base, nelle due lingue', () => {
  const f = tutte(() => p.punteggio({ giuste: 35, totale: 42, base: 23 }))
  assert.match(f.it!, /Ci ha preso .* Senza conoscerti, \d+\./)
  assert.match(f.en!, /Right .* Without knowing you, \d+\./)
})

test('le altre frasi con un numero', () => {
  assert.deepEqual(tutte(() => p.preparate('mail', 2)), { it: '2 pronte prima che le chiedessi', en: '2 ready before you asked' })
  assert.deepEqual(tutte(() => p.preparate('lavori', 1)), { it: '1 pronto prima che lo chiedessi', en: '1 ready before you asked' })
  assert.deepEqual(tutte(() => p.statoSegnalate({ utili: 12, viste: 15, mancate: 2 })), { it: '12 su 15 ti sono servite. Ne ha mancate 2.', en: '12 of 15 were useful. It missed 2.' })
  assert.deepEqual(tutte(() => p.statoSegnalate({ utili: 1, viste: 5, mancate: 1 })), { it: '1 su 5 ti è servita. Ne ha mancata una.', en: '1 of 5 was useful. It missed 1.' })
  assert.deepEqual(tutte(() => p.riordino({ chiave: 'compito:r1', quanti: 12, titolo: 'x' })), { it: 'Archiviati 12 messaggi', en: 'Archived 12 messages' })
  assert.deepEqual(tutte(() => p.riordino({ chiave: 'compito:r1', quanti: 1, cestino: true, titolo: 'x' })), { it: '1 messaggio nel cestino', en: '1 message in the trash' })
  assert.deepEqual(tutte(() => p.riordino({ chiave: 'regola:news@example.com', quanti: 12, titolo: 'news@example.com' })), { it: 'Archiviati 12 messaggi di news@example.com', en: 'Archived 12 messages from news@example.com' })
  assert.deepEqual(tutte(() => p.agenda(2)), { it: '2 eventi in agenda', en: '2 events in your calendar' })
  assert.deepEqual(tutte(() => p.agenda(1)), { it: '1 evento in agenda', en: '1 event in your calendar' })
  assert.deepEqual(tutte(() => p.dataScadenza('2026-09-25')), { it: '25 settembre', en: '25 September' })
  const gio = new Date(2026, 8, 17, 12).toISOString()
  assert.deepEqual(tutte(() => p.quandoRiga(gio, 'scorsa')), { it: 'giovedì', en: 'Thursday' })
  const tre = new Date(2026, 8, 3, 12).toISOString()
  assert.deepEqual(tutte(() => p.quandoRiga(tre, 'inizio')), { it: '3 set', en: 'Sep 3' })
  assert.deepEqual(tutte(() => p.etichettaInizio(new Date(2026, 8, 2, 12).toISOString())), { it: 'Da quando hai iniziato · 2 settembre', en: 'Since you started · 2 September' })
  assert.deepEqual(tutte(() => p.titoloFoglio('inizio')), { it: 'Da quando hai iniziato.', en: 'Since you started.' })
})

test('nessuna frase ha una lineetta, in nessuna lingua', () => {
  const frasi = [
    () => p.rigaNumeri({ mail: 3, lavori: 1, scadenze: 2 }), () => p.durata(125), () => p.stima([{ genere: 'mail', minuti: 4 }, { genere: 'riordino', minuti: 0.1 }], 3),
    () => p.periodo(new Date(2026, 8, 28).toISOString(), new Date(2026, 9, 5).toISOString(), 'scorsa'), () => p.punteggio({ giuste: 30, totale: 40, base: 20 }),
    () => p.preparate('lavori', 3), () => p.statoSegnalate({ utili: 3, viste: 8, mancate: 4 }), () => p.agenda(5), () => p.dataScadenza('2026-01-01'),
    () => p.quandoRiga(new Date().toISOString(), 'questa'), () => p.etichettaInizio(new Date().toISOString())
  ]
  for (const f of frasi) for (const s of Object.values(tutte(f))) assert.doesNotMatch(s ?? '', LINEETTE)
})

test('le parole di P9 hanno il loro inglese', () => {
  impostaLingua('en')
  for (const k of ['La settimana scorsa.', 'Questa settimana.', 'Da quando hai iniziato.', 'Mail mandate', 'Lavori consegnati', 'Scadenze segnalate', 'Tempo risparmiato',
    'Cosa ha notato di te', 'Cose che ti ha segnalato', 'Cosa ha fatto Myynd', 'La settimana scorsa', 'nella lista', 'vista', 'riscritta',
    'La posta inviata non è collegata: le mail mandate da lì non si contano.', 'Non conosco questo periodo.', 'Questa settimana', 'fatta', 'Chiudi', 'Vai alle Fonti', 'Aperto.', 'Non più rintracciabile']) {
    assert.notEqual(t(k), k, k)
    assert.doesNotMatch(t(k), LINEETTE)
  }
})
