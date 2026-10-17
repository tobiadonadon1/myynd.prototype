// Il mandato proposto e la sua domanda sola.
//
//   node --import ./build/test-profile.mjs --test server/mandato-proposta.test.ts

import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const radice = mkdtempSync(join(tmpdir(), 'myynd-mandato-proposta-'))
process.env.MYYND_DATI = radice
const store = await import('./store.ts')
const mandato = await import('./mandato.ts')
const proposta = await import('./mandato-proposta.ts')
const progetti = await import('./progetti.ts')
const domande = await import('./domande.ts')
const cfg = await import('./config.ts')

beforeEach(() => { store.azzeraTutto(); cfg.scrivi({ lingua: 'it' }) })
after(() => { store.chiudiIndici(); rmSync(radice, { recursive: true, force: true }) })

test('la misura viene da quello che l’esito dice', () => {
  assert.equal(proposta.misuraDa('Vendere i primi dieci abbonamenti', 'it'), 'Un pagamento arrivato (Stripe o bonifico)')
  assert.equal(proposta.misuraDa('Get the contract signed', 'en'), 'A signed reply')
  assert.equal(proposta.misuraDa('Pubblicare il sito', 'it'), 'È online e si apre')
  assert.equal(proposta.misuraDa('Ten real users on the waitlist', 'en'), 'A real user signs up')
  assert.equal(proposta.misuraDa('Capire il mercato', 'it'), 'Lo confermi tu')
})

test('il mandato dedotto parte dal traguardo, poi dall’obiettivo; regole di serie, proposto', () => {
  const p = progetti.scrivi({ nome: 'Aurora', obiettivo: 'Lanciare la beta' })
  const d = proposta.dedotto(p, { traguardo: 'Il primo cliente che paga', adesso: new Date('2026-10-17T10:00:00') })
  assert.equal(d.esito, 'Il primo cliente che paga')
  assert.match(d.misura, /pagamento/)
  assert.equal(d.revisione, '2026-11-16')
  assert.equal(d.stato, 'proposto')
  assert.deepEqual(d.classi, mandato.PREDEFINITE)
  assert.equal(proposta.dedotto(p).esito, 'Lanciare la beta')
  // guardare non scrive niente
  assert.equal(mandato.scritto(p.id), null)
})

test('una domanda sola, una volta sola, e solo se non ce n’è già una aperta', () => {
  const a = progetti.scrivi({ nome: 'Aurora', obiettivo: 'Vendere dieci abbonamenti' })
  const b = progetti.scrivi({ nome: 'Borea', obiettivo: 'Pubblicare il sito' })
  const d = proposta.proponi(a)
  assert.ok(d)
  assert.equal(d.testo, 'È questo l\'obiettivo di Aurora: Vendere dieci abbonamenti?')
  assert.equal(d.progetto, a.id)
  assert.equal(mandato.scritto(a.id)?.stato, 'proposto')
  assert.equal(mandato.scritto(a.id)?.origine, 'dedotto')
  // un'altra aperta: il secondo progetto ha la proposta, ma non la domanda
  assert.equal(proposta.proponi(b), null)
  assert.equal(mandato.scritto(b.id)?.stato, 'proposto')
  store.chiudiDomanda(d.id, 'ignorata')
  // già chiesta: mai più
  assert.equal(proposta.proponi(a), null)
  // la proposta non si riscrive sopra quello che c'è
  mandato.salva(a.id, { esito: 'Il mio esito' })
  proposta.scriviProposta(a, { traguardo: 'Altro' })
  assert.equal(mandato.scritto(a.id)?.esito, 'Il mio esito')
})

test('un sì conferma il mandato, passando dalle domande di sempre', async () => {
  const p = progetti.scrivi({ nome: 'Aurora', obiettivo: 'Vendere dieci abbonamenti' })
  const d = proposta.proponi(p)!
  const r = await domande.rispondiADomanda(d.id, 'Sì, esatto')
  assert.match(r.esito, /Confermato/)
  assert.equal(mandato.scritto(p.id)?.stato, 'confermato')
  assert.equal(mandato.autonomia(p.id), 'agisce')
  assert.equal(store.domanda(d.id)?.stato, 'risposta')
})

test('un’altra frase diventa l’esito, e il mandato resta da confermare', async () => {
  const p = progetti.scrivi({ nome: 'Aurora', obiettivo: 'Vendere dieci abbonamenti' })
  const d = proposta.proponi(p)!
  const r = await domande.rispondiADomanda(d.id, 'No, firmare il contratto con Rossi')
  assert.match(r.esito, /obiettivo/)
  const m = mandato.scritto(p.id)!
  assert.equal(m.esito, 'firmare il contratto con Rossi')
  assert.equal(m.misura, 'Una risposta firmata')
  assert.equal(m.stato, 'proposto')
  // un no secco non cambia niente
  const q = progetti.scrivi({ nome: 'Borea', obiettivo: 'Pubblicare il sito' })
  const d2 = proposta.proponi(q)!
  await domande.rispondiADomanda(d2.id, 'no')
  assert.equal(mandato.scritto(q.id)?.esito, 'Pubblicare il sito')
  assert.equal(mandato.scritto(q.id)?.stato, 'proposto')
})

test('confermato dalla pagina: la domanda aperta si chiude', () => {
  const p = progetti.scrivi({ nome: 'Aurora', obiettivo: 'Vendere dieci abbonamenti' })
  const d = proposta.proponi(p)!
  mandato.salva(p.id, {}, { conferma: true })
  proposta.chiudiLaDomanda(p.id)
  assert.equal(store.domanda(d.id)?.stato, 'risposta')
  assert.equal(store.domandaAperta(), null)
})
