// La traduzione all'avvio non riscrive una bozza scritta apposta nella lingua
// di chi la riceve (P3), e dopo aver tradotto rilegge la riga dell'ipotesi.
//
//   node --test server/traduci-lavoro.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-traduci-lavoro-'))
process.env.MYYND_DATI = CASA
delete process.env.ANTHROPIC_API_KEY
const cfg = await import('./config.ts')
const store = await import('./store.ts')
const traduci = await import('./traduci.ts')
const compatibile = await import('./compatibile.ts')
const lavoroDati = await import('./lavoro-dati.ts')

before(() => store.azzeraTutto())
after(() => { compatibile.usaRete(null); store.chiudiIndici(); rmSync(CASA, { recursive: true, force: true }) })

test('con l\'app in inglese una risposta a Marco resta in italiano, e la bozza storta tradotta rilegge l\'ipotesi', async () => {
  cfg.scrivi({ lingua: 'en', motore: 'compatibile', compatibile: { url: 'https://traduci.test/v1/', chiave: 'sk-prova', modello: 'finto' } })
  const aMarco = 'Done: the reply to Marco, with the price from the list.\n\nCiao Marco,\n\nper il corso da dodici persone il prezzo è di 890 euro a persona, come da listino.\n\nA presto,\nAlex\n\nPrice from the price list [2].'
  store.scriviCompito({ id: 'c-marco', testo: 'Reply to Marco about the course quote', ordine: 'a' })
  store.default.prepare("UPDATE compiti SET stato = 'pronto', risultato = ?, voceScritta = ?, email = ? WHERE id = 'c-marco'")
    .run(aMarco, JSON.stringify({ destinatario: 'Marco', lingua: 'it', quanti: 4, esempi: [] }), JSON.stringify({ a: 'marco.rossi@lumen.example', oggetto: 'Re: Preventivo corso', corpo: 'Ciao Marco,\n\nper il corso da dodici persone il prezzo è di 890 euro a persona, come da listino.\n\nA presto,\nAlex', conosciuto: true }))
  // consegnata quando l'app era in italiano, a Marco: il corpo resta suo, ma «Fatto:», le fonti e «Ho supposto» sono per lei
  const aMarcoIt = 'Fatto: la risposta a Marco, con il prezzo del listino.\n\nCiao Marco,\n\nper il corso da dodici persone il prezzo è di 890 euro a persona, come da listino.\n\nA presto,\nAlex\n\nPrezzo dal listino [2].\nHo supposto che il corso sia quello di due giorni.'
  store.scriviCompito({ id: 'c-marco-it', testo: 'Rispondi a Marco sul preventivo', ordine: 'a2' })
  store.default.prepare("UPDATE compiti SET stato = 'pronto', risultato = ?, voceScritta = ?, ipotesi = ? WHERE id = 'c-marco-it'")
    .run(aMarcoIt, JSON.stringify({ destinatario: 'Marco', lingua: 'it', quanti: 4, esempi: [] }), JSON.stringify(['Ho supposto che il corso sia quello di due giorni.']))
  const storta = 'Fatto: la nota.\n\nLa nota dice che il corso parte a novembre con dodici persone nella sede di Milano.\n\nHo supposto venerdì come scadenza.'
  store.scriviCompito({ id: 'c-storta', testo: 'Write the note', ordine: 'b' })
  store.default.prepare("UPDATE compiti SET stato = 'pronto', risultato = ?, ipotesi = ? WHERE id = 'c-storta'").run(storta, JSON.stringify(['Ho supposto venerdì come scadenza.']))
  // la stessa bozza a cui «Cambia» ha tolto l'ipotesi (passata alla figlia): tradotta, l'ipotesi non torna
  store.scriviCompito({ id: 'c-corretta', testo: 'Write the other note', ordine: 'c' })
  store.default.prepare("UPDATE compiti SET stato = 'pronto', risultato = ?, ipotesi = NULL WHERE id = 'c-corretta'").run(storta)

  const richieste: string[] = []
  compatibile.usaRete((async (_u, init) => {
    const corpo = JSON.parse(String(init?.body ?? '{}'))
    const utente = String((corpo.messages ?? []).find((m: { role: string }) => m.role === 'user')?.content ?? '')
    richieste.push(utente)
    const tradotta = 'Done: the note.\n\nThe note says the course starts in November with twelve people at the Milan office.\n\nI assumed Friday as the deadline.'
    const cornice = 'Done: the reply to Marco, with the price from the list.\nPrice from the price list [2].\nI assumed the two-day course.'
    const righe = utente.includes('c-storta') ? [{ id: 'c-storta', testo: tradotta }, { id: 'c-corretta', testo: tradotta }, { id: 'c-marco-it', testo: cornice }] : []
    return Response.json({ id: 'c1', model: 'finto', choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify({ righe }) }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } })
  }) as typeof fetch)

  const n = await traduci.inLingua('en')
  assert.equal(n, 3)
  assert.ok(richieste.some(r => r.includes('c-storta')), 'la bozza storta non è stata mandata a tradurre')
  assert.ok(!richieste.some(r => r.includes('"c-marco"')), 'la risposta a Marco è stata mandata a tradurre')
  // della risposta italiana a Marco si manda solo la cornice, mai il corpo
  const perMarco = richieste.find(r => r.includes('c-marco-it'))!
  assert.ok(perMarco, 'la cornice della risposta a Marco non è stata mandata a tradurre')
  assert.ok(!perMarco.includes('Ciao Marco'), 'il corpo per Marco è andato a tradurre')
  assert.ok(perMarco.includes('Fatto: la risposta a Marco') && perMarco.includes('Ho supposto che il corso'))
  const marcoIt = store.compito('c-marco-it')!
  assert.equal(marcoIt.risultato, 'Done: the reply to Marco, with the price from the list.\n\nCiao Marco,\n\nper il corso da dodici persone il prezzo è di 890 euro a persona, come da listino.\n\nA presto,\nAlex\n\nPrice from the price list [2].\nI assumed the two-day course.')
  assert.deepEqual(marcoIt.ipotesi, ['I assumed the two-day course.'])
  assert.deepEqual(traduci.righeDellaCornice(aMarcoIt), [0, 9, 10])
  const marco = store.compito('c-marco')!
  assert.equal(marco.risultato, aMarco)
  assert.equal(marco.email?.corpo?.startsWith('Ciao Marco,'), true)
  assert.match(marco.risultato ?? '', /^Done: /)
  const tradotta = store.compito('c-storta')!
  assert.match(tradotta.risultato ?? '', /^Done: the note\./)
  assert.deepEqual(tradotta.ipotesi, ['I assumed Friday as the deadline.'])
  const corretta = store.compito('c-corretta')!
  assert.match(corretta.risultato ?? '', /^Done: the note\./)
  assert.equal(corretta.ipotesi ?? null, null, 'l\'ipotesi tolta da «Cambia» è tornata con la lingua')
  assert.equal(lavoroDati.misura('c-storta'), null, 'tradurre non è un affido')
})
