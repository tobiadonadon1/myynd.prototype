// Il riferimento: chiesto una volta, tenuto con le sue parole, richiesto
// quando invecchia. E la lettura che ne fa il codice: chi è morto, chi è
// bloccato.
//
//   node --test server/riferimento.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dati = mkdtempSync(join(tmpdir(), 'myynd-riferimento-'))
process.env.MYYND_DATI = dati
writeFileSync(join(dati, 'config.json'), JSON.stringify({ lingua: 'en', nome: 'Tobia' }))
const store = await import('./store.ts')
const progetti = await import('./progetti.ts')
const riferimento = await import('./riferimento.ts')
const domande = await import('./domande.ts')
after(() => { domande.perProva(null); store.chiudiIndici(); delete process.env.MYYND_DATI; rmSync(dati, { recursive: true, force: true }) })

const GIORNO = 86_400_000
const evermute = progetti.scrivi({ nome: 'Evermute', obiettivo: 'Ship Evermute 1.0' })
const sito = progetti.scrivi({ nome: 'Sito', obiettivo: 'Three offers online' })
const ceru = progetti.scrivi({ nome: 'Ceru', obiettivo: 'Move in' })

test('la domanda nasce una volta, nella lingua dell’app, con i nomi dei progetti', () => {
  assert.equal(riferimento.leggi().testo, '')
  assert.equal(riferimento.chiediRiferimento(), true)
  const d = store.domandaAperta()
  assert.ok(d && d.tema === riferimento.TEMA)
  assert.match(d.testo, /^To get my bearings/)
  for (const n of ['Evermute', 'Sito', 'Ceru']) assert.ok(d.testo.includes(n), `la domanda nomina ${n}`)
  // già aperta: non se ne apre un'altra
  assert.equal(riferimento.chiediRiferimento(), false)
  assert.equal(store.domandeConTema('riferimento').length, 1)
})

test('la risposta diventa il blocco, parola per parola, senza passare dal modello', async () => {
  let chiamate = 0
  domande.perProva({ chiediJSON: (async () => { chiamate++; return null }) as never })
  const d = store.domandaAperta()!
  const testo = 'Evermute: shipping 1.0, waiting on Apple. Sito: dead, I dropped it. Ceru: blocked on the contract with Marta.'
  const { esito } = await domande.rispondiADomanda(d.id, testo)
  assert.equal(chiamate, 0, 'il riferimento non passa dal modello')
  assert.match(esito, /^Noted\./)
  assert.equal(riferimento.leggi().testo, testo)
  assert.ok(riferimento.leggi().aggiornato)
  assert.equal(store.domandaAperta(), null)
  assert.equal(store.domanda(d.id)?.stato, 'risposta')
  assert.equal(riferimento.fresco(), true)
  // fresco: non si richiede
  assert.equal(riferimento.chiediRiferimento(), false)
})

test('la lettura del codice: morti e bloccati per nome, e la negazione spegne la parola', () => {
  const suoi = [evermute, sito, ceru]
  const morti = riferimento.progettiMorti(riferimento.leggi().testo, suoi)
  assert.deepEqual([...morti], [sito.id])
  const bloccati = riferimento.progettiBloccati(riferimento.leggi().testo, suoi)
  assert.ok(bloccati.has(ceru.id))
  assert.ok(bloccati.has(evermute.id), '«waiting on Apple» è un blocco')
  assert.ok(!bloccati.has(sito.id))
  assert.deepEqual([...riferimento.progettiMorti('Evermute is not dead, just slow.\nSito: still alive.', suoi)], [])
  assert.deepEqual([...riferimento.progettiMorti('', suoi)], [])
})

test('dopo due settimane si richiede, riaprendo la stessa riga', () => {
  const fra15 = Date.now() + 15 * GIORNO
  assert.equal(riferimento.fresco(fra15), false)
  assert.equal(riferimento.chiediRiferimento(fra15), true)
  const d = store.domandaAperta()
  assert.ok(d && d.tema === riferimento.TEMA)
  assert.equal(d.stato, 'aperta')
  assert.equal(d.risposta, null)
  assert.equal(store.domandeConTema('riferimento').length, 1, 'la riga è la stessa, riaperta')
})

test('lasciata cadere, tace per una settimana', () => {
  const d = store.domandaAperta()!
  domande.ignora(d.id)
  assert.equal(store.domandaAperta(), null)
  // senza riferimento l'unico cancello che resta è il silenzio dopo l'ignorata
  store.scordaBlocco(riferimento.ETICHETTA)
  assert.equal(riferimento.chiediRiferimento(Date.now() + GIORNO), false)
  assert.equal(riferimento.chiediRiferimento(Date.now() + 8 * GIORNO), true)
  assert.equal(store.domandaAperta()?.tema, riferimento.TEMA)
  domande.ignora(store.domandaAperta()!.id)
})

test('scrivi: vuoto non si accetta, e il tetto vale', () => {
  assert.throws(() => riferimento.scrivi('   '), /Scrivi qualcosa/)
  riferimento.scrivi('x'.repeat(2000))
  assert.equal(riferimento.leggi().testo.length, 1500)
})
