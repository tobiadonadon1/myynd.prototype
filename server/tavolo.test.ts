// Il tavolo non resta mai vuoto: cosa riceve una riga e cosa no.
//
//   node --test server/tavolo.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-tavolo-'))
process.env.MYYND_DATI = CASA

const store = await import('./store.ts')
const progetti = await import('./progetti.ts')
const tavolo = await import('./tavolo.ts')

before(() => store.azzeraTutto())
after(() => {
  tavolo.perProva(null)
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

const ORA = 3_600_000
let n = 0
const nuovo = () => `c${++n}`

test('un progetto attivo senza niente davanti riceve la cosa dopo; chi ha già una riga, un progetto fermo, e senza modello, no', async () => {
  const evermute = progetti.scrivi({ nome: 'Evermute', obiettivo: 'Ship 1.0' })
  const hfarm = progetti.scrivi({ nome: 'H-Farm', obiettivo: 'Solidify AI systems' })
  const fermo = progetti.scrivi({ nome: 'Vecchio', obiettivo: 'x' })
  progetti.cambia(fermo.id, { stato: 'fermo' })
  store.scriviCompito({ id: nuovo(), testo: 'Answer App Review', ordine: 'o1', progetto: evermute.id })
  const chiesti: string[] = []
  const prossimo = async (p: { nome: string }) => { chiesti.push(p.nome); return `Define the first ${p.nome} workflow` }

  tavolo.perProva({ collegato: () => false, prossimo })
  assert.equal(await tavolo.riempi(), 0, 'senza modello non si propone')
  assert.deepEqual(chiesti, [])

  tavolo.perProva({ collegato: () => true, prossimo })
  assert.deepEqual(tavolo.scoperti().map(p => p.nome), ['H-Farm'])
  assert.equal(await tavolo.riempi(), 1)
  assert.deepEqual(chiesti, ['H-Farm'])
  const riga = store.elencoCompiti().find(c => c.progetto === hfarm.id)!
  assert.equal(riga.testo, 'Define the first H-Farm workflow')
  assert.equal(riga.origine, tavolo.ORIGINE)
  assert.equal(riga.quando, 'oggi')
  // adesso H-Farm ha una riga davanti: non si richiede
  assert.equal(await tavolo.riempi(), 0)
  assert.deepEqual(chiesti, ['H-Farm'])
})

test('una proposta tolta da lui fa tacere il progetto per un giorno; una simile già in lista non si raddoppia; un modello che non sa non scrive; fra due proposte passa un\'ora', async () => {
  store.azzeraTutto()
  const p = progetti.scrivi({ nome: 'Website', obiettivo: 'Sell info products' })
  const q = progetti.scrivi({ nome: 'Nextas', obiettivo: 'Close the round' })
  const risposte: Record<string, string | null> = { Website: 'Write the first info product outline', Nextas: null }
  tavolo.perProva({ collegato: () => true, prossimo: async x => risposte[x.nome] ?? null })

  const adesso = Date.now()
  assert.equal(await tavolo.riempi(adesso), 1, 'Nextas non sa: non scrive')
  const scritta = store.elencoCompiti().find(c => c.progetto === p.id)!
  // la toglie: quel progetto tace per un giorno, poi torna scoperto
  store.cambiaStatoCompito(scritta.id, 'lasciato', 'not now')
  assert.deepEqual(tavolo.scoperti(adesso + 2 * ORA).map(x => x.nome), ['Nextas'], 'Website tace')
  assert.deepEqual(tavolo.scoperti(adesso + 25 * ORA).map(x => x.nome).sort(), ['Nextas', 'Website'])

  // una riga simile già in lista, anche di un altro progetto: non si raddoppia
  store.scriviCompito({ id: nuovo(), testo: 'Write the outline of the first info product', ordine: 'o9', progetto: q.id })
  assert.equal(await tavolo.riempi(adesso + 26 * ORA), 0)
  assert.equal(store.elencoCompiti().filter(c => c.progetto === p.id).length, 0)

  // fra due proposte sullo stesso progetto passa almeno un'ora, anche se il modello non aveva saputo
  risposte.Nextas = 'Prepare the investor update'
  assert.deepEqual(tavolo.scoperti(adesso + 26 * ORA + 1000).map(x => x.nome), [], 'Nextas ha una riga; Website ha appena chiesto')
})
