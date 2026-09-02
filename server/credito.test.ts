// Il conto senza credito, che è la cosa che si è rotta due volte.
//
// Il 2 settembre 2026 una cliente ha incollato una chiave appena creata su un
// conto Anthropic nuovo — cioè senza credito — e si è vista rispondere che «il
// modello scelto non accetta questa richiesta, provane un altro». Due volte, a
// distanza di ore, la seconda con la correzione già installata: la correzione
// leggeva `e.message` con una regola sola, e quel giorno il messaggio non
// conteneva le parole che la regola cercava.
//
// Da qui in poi la cosa si prova, e si prova su tre livelli diversi, perché
// sono tre modi diversi di sbagliare:
//
//   · `motivo` — tirare fuori la frase vera dall'errore, comunque sia incartata;
//   · `perIlCredito` — riconoscerla, anche detta in un altro modo o in italiano;
//   · `prova` — e soprattutto: **non rifiutare mai una chiave che funziona**.
//     Questa è la regola che conta. Un 400 vuol dire che Anthropic ha letto la
//     richiesta, quindi la chiave è passata. Da lì in avanti il problema è di
//     un'altra natura, e mandare indietro chi ha appena incollato la chiave
//     giusta è sbagliato in ogni caso possibile.
//
//   node --test server/credito.test.ts

import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-credito-'))
process.env.MYYND_DATI = CASA

const store = await import('./store.ts')
const chi = await import('./chi.ts')
const mod = await import('./modello.ts')
const claude = await import('./claude.ts')

const vero = globalThis.fetch

after(() => {
  globalThis.fetch = vero
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

beforeEach(() => { globalThis.fetch = vero; mod.scordaIlCredito() })

/** La frase con cui Anthropic dice davvero che il conto è a zero. */
const A_ZERO = 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.'

/**
 * Un Anthropic finto: risponde in ordine con quello che gli si dà.
 *
 * Il client dell'SDK si costruisce dentro `prova()` e legge il `fetch` globale
 * al momento della costruzione: sostituirlo qui basta, e non si tocca la rete.
 */
function anthropicFinto(risposte: (() => Response)[]): { quante: () => number } {
  let n = 0
  globalThis.fetch = (async () => {
    const r = risposte[Math.min(n, risposte.length - 1)]!
    n++
    return r()
  }) as typeof fetch
  return { quante: () => n }
}

const errore = (stato: number, messaggio: string, tipo = 'invalid_request_error') =>
  () => Response.json({ type: 'error', error: { type: tipo, message: messaggio } }, { status: stato })

const risposta = () => Response.json({
  id: 'msg_prova', type: 'message', role: 'assistant', model: 'claude-sonnet-5',
  content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn',
  usage: { input_tokens: 1, output_tokens: 1 }
})

// — la frase vera, comunque sia incartata —

test('motivo: la frase del fornitore si tira fuori dal corpo, non dalla riga di stato', () => {
  const e = new Anthropic.BadRequestError(400, { type: 'error', error: { message: A_ZERO } }, '400 ' + A_ZERO, new Headers())
  assert.equal(mod.motivo(e), A_ZERO)
})

test('motivo: e anche quando il corpo è appiccicato dentro il messaggio', () => {
  // è la forma in cui l'SDK scrive `message` quando il corpo non gli arriva
  // già spacchettato: «400 {"type":"error",…}»
  const grezzo = new Error(`400 ${JSON.stringify({ type: 'error', error: { message: A_ZERO } })}`)
  assert.equal(mod.motivo(grezzo), A_ZERO)
})

test('motivo: un errore qualunque resta quello che è', () => {
  assert.equal(mod.motivo(new Error('la rete non c’è')), 'la rete non c’è')
  assert.equal(mod.motivo('boh'), 'boh')
})

// — riconoscerla —

test('perIlCredito: le tre lingue in cui il mondo dice «non hai credito»', () => {
  assert.equal(mod.perIlCredito(new Error(A_ZERO)), true)
  // OpenAI e i compatibili
  assert.equal(mod.perIlCredito(new Error('You exceeded your current quota, please check your plan and billing details.')), true)
  assert.equal(mod.perIlCredito(new Error('insufficient_quota')), true)
  // la frase che si scrive da sé `compatibile.ts`, già in italiano
  assert.equal(mod.perIlCredito(new Error('Il conto del fornitore è senza credito.')), true)
})

test('perIlCredito: un problema di parametri non è un problema di soldi', () => {
  assert.equal(mod.perIlCredito(new Error('max_tokens: must be greater than thinking.budget_tokens')), false)
  assert.equal(mod.perIlCredito(new Error('output_config: Extra inputs are not permitted')), false)
  assert.equal(mod.perIlCredito(new Error('la rete non c’è')), false)
})

// — la regola che conta —

test('una chiave buona su un conto a zero si TIENE, e si dice cosa manca', async () => {
  const rete = anthropicFinto([errore(400, A_ZERO)])
  const e = await claude.prova('sk-ant-finta')
  assert.equal(e.ok, true)
  assert.match(e.ok ? e.avviso ?? '' : '', /non ha ancora credito/)
  // la frase di Anthropic arriva intera: è l'unica che dice cosa fare
  assert.equal(e.ok ? e.dettaglio : '', A_ZERO)
  // una domanda sola: il credito si riconosce al primo colpo
  assert.equal(rete.quante(), 1)
})

test('e il cartellino dentro l’app parte già acceso', async () => {
  anthropicFinto([errore(400, A_ZERO)])
  await claude.prova('sk-ant-finta')
  assert.equal(mod.mancaIlCredito(), A_ZERO)
})

test('un 400 che NON parla di soldi non rifiuta comunque la chiave', async () => {
  // primo giro con i parametri veri: no. Secondo giro, un token soltanto: sì.
  // Allora il problema è il modello scelto, e si dice quello — non «la chiave
  // è sbagliata», che è la cosa che ha fermato la cliente.
  const rete = anthropicFinto([errore(400, 'output_config: Extra inputs are not permitted'), risposta])
  const e = await claude.prova('sk-ant-finta')
  assert.equal(e.ok, true)
  assert.match(e.ok ? e.avviso ?? '' : '', /non accetta le richieste che fa Myynd/)
  assert.equal(rete.quante(), 2)
  assert.equal(mod.mancaIlCredito(), null)
})

test('un 400 incomprensibile: la chiave si tiene lo stesso, con la frase di Anthropic', async () => {
  anthropicFinto([errore(400, 'qualcosa di nuovo che non abbiamo mai visto')])
  const e = await claude.prova('sk-ant-finta')
  assert.equal(e.ok, true)
  assert.equal(e.ok ? e.dettaglio : '', 'qualcosa di nuovo che non abbiamo mai visto')
})

test('il credito scoperto al secondo giro vale quanto quello scoperto al primo', async () => {
  anthropicFinto([errore(400, 'output_config: Extra inputs are not permitted'), errore(400, A_ZERO)])
  const e = await claude.prova('sk-ant-finta')
  assert.equal(e.ok, true)
  assert.match(e.ok ? e.avviso ?? '' : '', /non ha ancora credito/)
  assert.equal(mod.mancaIlCredito(), A_ZERO)
})

test('una chiave sbagliata resta sbagliata: quello sì che si rifiuta', async () => {
  anthropicFinto([errore(401, 'invalid x-api-key', 'authentication_error')])
  assert.deepEqual(await claude.prova('sk-ant-finta'), { ok: false, errore: 'Chiave API non valida.' })
})

test('una chiave che va non dice niente', async () => {
  anthropicFinto([risposta])
  assert.deepEqual(await claude.prova('sk-ant-finta'), { ok: true })
})

// — il cartellino —

test('il cartellino si spegne da solo appena una chiamata va a buon fine', () => {
  mod.segnaSenzaCredito(A_ZERO)
  assert.equal(mod.mancaIlCredito(), A_ZERO)
  mod.segnaUso('risposta', { input_tokens: 10, output_tokens: 5 } as Anthropic.Usage)
  assert.equal(mod.mancaIlCredito(), null)
})

test('il conto a secco di una persona non è il cartellino di un’altra', () => {
  chi.dentro('anna@esempio.it', () => mod.segnaSenzaCredito(A_ZERO))
  assert.equal(chi.dentro('anna@esempio.it', () => mod.mancaIlCredito()), A_ZERO)
  assert.equal(chi.dentro('bruno@esempio.it', () => mod.mancaIlCredito()), null)
  chi.dentro('bruno@esempio.it', () => mod.scordaIlCredito())
  assert.equal(chi.dentro('anna@esempio.it', () => mod.mancaIlCredito()), A_ZERO)
  chi.dentro('anna@esempio.it', () => mod.scordaIlCredito())
})

test('inItaliano è la porta da cui il segno si mette: passa anche il fornitore compatibile', () => {
  mod.inItaliano(new Error('Il conto del fornitore è senza credito.'))
  assert.equal(mod.mancaIlCredito(), 'Il conto del fornitore è senza credito.')
})
