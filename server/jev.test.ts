// Jev, il filo: quello che succede quando risponde e quando non risponde.
//
// La prova che conta di più è la seconda. Un affinamento che lancia, o che
// torna una lista vuota invece di «non lo so», si porta dietro la prima
// pagina: sono le due forme in cui un aiuto diventa un guasto.
//
//   node --test server/jev.test.ts

import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const casa = mkdtempSync(join(tmpdir(), 'myynd-jev-'))
process.env.MYYND_DATI = casa
delete process.env.MYYND_TYPESAFE
const cfg = await import('./config.ts')
const jev = await import('./jev.ts')

beforeEach(() => { cfg.scrivi({ jev: { apiKey: 'apikey_prova' } }); jev.dimentica(); jev.perProva(null) })
after(() => { jev.perProva(null); delete process.env.MYYND_DATI; rmSync(casa, { recursive: true, force: true }) })

const CHIEDE = { type: 'noul', instructions: 'Someone waits on him.' } as const
const GENERE = { type: 'choice', instructions: 'What is this.', criteria: { richiesta: 'a', rumore: 'b' } } as const

const risposta = (corpo: unknown, stato = 200) =>
  new Response(JSON.stringify(corpo), { status: stato, headers: { 'content-type': 'application/json' } })

/** Una `Response` si legge una volta sola: ogni chiamata ne vuole una nuova. */
const buona = () => risposta({
  model: 'jev-1.13.0',
  answers: { chiede: { type: 'noul', noul: 0.91 } },
  usage: { input_tokens: 700, output_tokens: 20 }
})

test('senza chiave non si chiama nessuno, e si torna «non lo so»', async () => {
  cfg.scrivi({}, { togli: ['jev'] })
  let chiamate = 0
  jev.perProva(async () => { chiamate++; return buona() })
  assert.equal(jev.collegato(), false)
  assert.equal(await jev.giudica({ a: 1 }, { chiede: CHIEDE }), null)
  assert.equal(chiamate, 0)
})

test('una risposta buona torna tipizzata, e si segna nel consumo del giorno', async () => {
  jev.perProva(async (_u, opz) => {
    const corpo = JSON.parse(String((opz as RequestInit).body))
    assert.equal(corpo.model, 'jev-latest')
    assert.deepEqual(Object.keys(corpo.questions), ['chiede'])
    assert.equal((opz as RequestInit).headers!['authorization' as never], 'Bearer apikey_prova')
    return buona()
  })
  const r = await jev.giudica({ documento: 'x' }, { chiede: CHIEDE })
  assert.equal(r?.chiede.noul, 0.91)
  assert.equal(jev.consumo().giudizi, 1)
  assert.equal(jev.consumo().gettoni, 720)
})

/*
 * Le tre forme in cui il servizio può mancare, e sono la stessa risposta.
 *
 * `null` vuol dire «fai come facevi prima». Una qualsiasi di queste che
 * lanciasse si porterebbe via la lettura del feed, che è il posto da cui è
 * chiamata: un giudizio mancato diventerebbe una prima pagina vuota.
 */
test('rete giù, chiave rifiutata o risposta storta: sempre null, mai un errore', async () => {
  jev.perProva(async () => { throw new Error('getaddrinfo ENOTFOUND') })
  assert.equal(await jev.giudica({}, { chiede: CHIEDE }), null)

  jev.perProva(async () => risposta({ error: 'no' }, 401))
  assert.equal(await jev.giudica({}, { chiede: CHIEDE }), null)

  // la risposta arriva, ma senza la domanda che si era fatta
  jev.perProva(async () => risposta({ answers: { altro: { type: 'noul', noul: 1 } } }))
  assert.equal(await jev.giudica({}, { chiede: CHIEDE }), null)

  // una scelta che non è fra quelle offerte non è una risposta
  jev.perProva(async () => risposta({ answers: { genere: { type: 'choice', choice: 'inventata', confidence: 1, probabilities: {} } } }))
  assert.equal(await jev.giudica({}, { genere: GENERE }), null)
})

test('un «rallenta» si riprova una volta sola, e poi si lascia perdere', async () => {
  let chiamate = 0
  jev.perProva(async () => { chiamate++; return chiamate === 1 ? risposta({}, 429) : buona() })
  assert.equal((await jev.giudica({}, { chiede: CHIEDE }))?.chiede.noul, 0.91)
  assert.equal(chiamate, 2)

  chiamate = 0
  jev.perProva(async () => { chiamate++; return risposta({}, 529) })
  assert.equal(await jev.giudica({}, { chiede: CHIEDE }), null)
  assert.equal(chiamate, 2)
})

/*
 * Il tetto del giorno è una promessa sul conto, non un dettaglio.
 *
 * «La mia paura è il costo delle API»: quel numero sta scritto in `jev.ts`, si
 * legge, e quando è finito Jev tace invece di continuare a spendere. Il resto
 * dell'app non se ne accorge, perché tacere è già un caso previsto.
 */
test('finito il tetto del giorno, Jev tace', async () => {
  let chiamate = 0
  jev.perProva(async () => { chiamate++; return buona() })
  const tante = Array.from({ length: jev.TETTO_AL_GIORNO + 5 }, (_, i) => i)
  const esiti = await jev.giudicaTanti(tante, i => ({ i }), { chiede: CHIEDE }, { insieme: 50 })
  assert.equal(jev.consumo().giudizi, jev.TETTO_AL_GIORNO)
  assert.ok(chiamate <= jev.TETTO_AL_GIORNO + 50, `chiamate oltre il tetto: ${chiamate}`)
  // quelli rimasti fuori non hanno una risposta sbagliata: non ce l'hanno
  assert.ok([...esiti.values()].filter(Boolean).length <= jev.TETTO_AL_GIORNO)
  assert.equal(await jev.giudica({}, { chiede: CHIEDE }), null)
})

test('più domande sullo stesso materiale viaggiano in una chiamata sola', async () => {
  let chiamate = 0
  jev.perProva(async () => {
    chiamate++
    return risposta({ answers: {
      chiede: { type: 'noul', noul: 0.4 },
      genere: { type: 'choice', choice: 'rumore', confidence: 0.9, probabilities: { rumore: 0.9, richiesta: 0.1 } }
    } })
  })
  const r = await jev.giudica({}, { chiede: CHIEDE, genere: GENERE })
  assert.equal(chiamate, 1)
  assert.equal(r?.genere.choice, 'rumore')
  // due domande, due giudizi: il tetto conta quello che si è chiesto
  assert.equal(jev.consumo().giudizi, 2)
})

test('chi non risponde non ferma gli altri', async () => {
  jev.perProva(async (_u, opz) => {
    const stato = JSON.parse(String((opz as RequestInit).body)).state as { i: number }
    if (stato.i === 1) throw new Error('caduta')
    return buona()
  })
  const esiti = await jev.giudicaTanti([{ i: 0 }, { i: 1 }, { i: 2 }], c => c, { chiede: CHIEDE })
  assert.equal(esiti.size, 3)
  assert.equal([...esiti.values()].filter(Boolean).length, 2)
})

test('la prova della chiave lancia, perché lì c’è qualcuno che guarda il bottone', async () => {
  jev.perProva(async () => risposta({}, 401))
  await assert.rejects(() => jev.prova('apikey_storta'), /non ha risposto/)
  await assert.rejects(() => jev.prova('   '), /Incolla/)
  jev.perProva(async () => risposta({ answers: { va: { type: 'noul', noul: 1 } } }))
  await jev.prova('apikey_buona')
})
