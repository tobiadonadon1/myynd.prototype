// Il punto accanto a «Memoria» (P5): acceso solo per le cose nate dopo
// l'ultima visita, per conto, e mai a sorpresa.
//
//   node --test server/memoria-nuove.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-memoria-nuove-'))
process.env.MYYND_DATI = CASA
delete process.env.ANTHROPIC_API_KEY

const conti = await import('./conti.ts')
const chi = await import('./chi.ts')
const cfg = await import('./config.ts')
const store = await import('./store.ts')
const { nuove } = await import('./memoria-nuove.ts')

let anna = ''
let bruno = ''
const PRIMA = '2026-09-20T10:00:00.000Z'
const VISTA = '2026-09-22T10:00:00.000Z'
const DOPO = '2026-09-23T10:00:00.000Z'
const ANCORA_DOPO = '2026-09-24T10:00:00.000Z'

before(async () => {
  const a = await conti.registra('anna@esempio.it', 'passwordlunga1')
  const b = await conti.registra('bruno@esempio.it', 'passwordlunga1')
  assert.ok(a.ok && b.ok)
  anna = a.ok ? a.id : ''; bruno = b.ok ? b.id : ''
  for (const u of [anna, bruno]) chi.dentro(u, () => { cfg.scrivi({ lingua: 'en' }); store.azzeraTutto() })
})
after(() => { store.chiudiIndici(); rmSync(CASA, { recursive: true, force: true }) })

const convinzione = (enunciato: string, genere: 'esplicita' | 'dedotta' | 'indotta', dal: string) =>
  store.ricorda({ enunciato, ambito: 'persona', genere, fiducia: 0.6, origine: 'chiusura', dal })

/** Una riga di «Come lavori» scritta come la scrive `ricalcola`. */
function riga(chiave: string, genere: string, visto: string, casi: number, stato = 'osservata') {
  store.default.prepare(`INSERT INTO abitudini (chiave, genere, dati, prova, fiducia, stato, testoSuo, visto, aggiornato, tolta) VALUES (?,?,?,?,?,?,NULL,?,?,NULL)`)
    .run(chiave, genere, JSON.stringify({ nome: 'Nora' }), JSON.stringify({ casi, su: casi, esempi: [] }), 0.9, stato, visto, visto)
}

test('senza una prima visita il punto non si accende mai', () => {
  chi.dentro(anna, () => {
    store.azzeraTutto()
    convinzione('Risponde a Harbor Labs entro un’ora', 'indotta', DOPO)
    assert.deepEqual(nuove(null), { quante: 0, dove: null })
  })
})

test('una indotta dopo la visita conta; prima no, tenuta no, detta da lei no', () => {
  chi.dentro(anna, () => {
    store.azzeraTutto()
    const nuova = convinzione('Risponde a Harbor Labs entro un’ora', 'indotta', DOPO)
    convinzione('Preferisce le telefonate con i fornitori', 'indotta', PRIMA)
    const tenuta = convinzione('Tiene le riunioni sotto i trenta minuti', 'indotta', DOPO)
    store.confermaConvinzione(tenuta)
    convinzione('Non lavora mai la domenica', 'esplicita', DOPO)
    convinzione('Chiude i preventivi il venerdì', 'dedotta', DOPO)
    const r = nuove(VISTA)
    assert.equal(r.quante, 1)
    assert.equal(r.dove, 'ritratto')
    assert.ok(nuova)
  })
})

test('le righe di Come lavori che aspettano contano, quelle che valgono da sole no', () => {
  chi.dentro(anna, () => {
    store.azzeraTutto()
    riga('posta.risponde_sempre:a@x', 'posta.risponde_sempre', DOPO, 8)          // aspetta: meno di venti casi
    riga('posta.risponde_sempre:b@x', 'posta.risponde_sempre', DOPO, 25)         // vale da sola
    riga('posta.risponde_sempre:c@x', 'posta.risponde_sempre', PRIMA, 8)         // prima della visita
    riga('posta.risponde_sempre:d@x', 'posta.risponde_sempre', DOPO, 8, 'tenuta') // tenuta
    assert.deepEqual(nuove(VISTA), { quante: 1, dove: 'come-lavori' })
  })
})

test('dove: la sezione della cosa più nuova', () => {
  chi.dentro(anna, () => {
    store.azzeraTutto()
    riga('posta.risponde_sempre:a@x', 'posta.risponde_sempre', DOPO, 8)
    convinzione('Risponde a Harbor Labs entro un’ora', 'indotta', ANCORA_DOPO)
    assert.deepEqual(nuove(VISTA), { quante: 2, dove: 'ritratto' })
    store.azzeraTutto()
    convinzione('Risponde a Harbor Labs entro un’ora', 'indotta', DOPO)
    riga('posta.risponde_sempre:a@x', 'posta.risponde_sempre', ANCORA_DOPO, 8)
    assert.deepEqual(nuove(VISTA), { quante: 2, dove: 'come-lavori' })
  })
})

test('due conti non si vedono', () => {
  chi.dentro(anna, () => { store.azzeraTutto(); convinzione('Risponde a Harbor Labs entro un’ora', 'indotta', DOPO) })
  chi.dentro(bruno, () => { store.azzeraTutto() })
  assert.equal(chi.dentro(anna, () => nuove(VISTA)).quante, 1)
  assert.equal(chi.dentro(bruno, () => nuove(VISTA)).quante, 0)
})
