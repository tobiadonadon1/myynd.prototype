import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Documento } from './store.ts'

const casa = mkdtempSync(join(tmpdir(), 'myynd-map-project-links-'))
process.env.MYYND_DATI = casa
const store = await import('./store.ts')
const progetti = await import('./progetti.ts')
const conoscenza = await import('./conoscenza.ts')
beforeEach(() => store.azzeraTutto())
after(() => { store.chiudiIndici(); delete process.env.MYYND_DATI; rmSync(casa, { recursive: true, force: true }) })
const ora = Date.now()
const documento = (id: string, patch: Partial<Documento> = {}): Documento => ({
  id, fonte: 'posta', tipo: 'email', titolo: 'Project update', corpo: 'The current update.',
  autore: 'Alex <alex@example.com>', quando: new Date(ora - 3600_000).toISOString(), ...patch
})
const links = (id: string) => conoscenza.mappa(2600, ora).nodi.find(n => n.id === id)!.progetti.map(p => p.id)

test('a routine receipt sharing generic goal words has no website project association', () => {
  progetti.scrivi({ nome: 'tobiadonadon.com', obiettivo: 'Ship finished site copy and offers live' })
  store.salvaDocumenti([documento('receipt', {
    titolo: 'Your receipt from X Developer Platform #2757-9815',
    corpo: 'Your payment was received. View a copy on our site. See the offers currently live.',
    autore: 'X Billing <receipts@example.com>', massa: true
  })])
  const n = conoscenza.mappa(2600, ora).nodi.find(n => n.id === 'receipt')!
  assert.deepEqual(n.progetti, [])
  assert.equal(n.attenzione, 'brief')
})

test('explicit names still link historical CV knowledge and reject similar names', () => {
  const p = progetti.scrivi({ nome: 'H-Farm', obiettivo: 'Improve internal AI systems' })
  progetti.chiudi(p.id)
  store.salvaDocumenti([
    documento('cv', { fonte: 'desktop', tipo: 'pdf', titolo: 'CV', corpo: 'Work experience at H–Farm. Built internal AI systems.', quando: '2025-09-24T12:00:00Z' }),
    documento('similar', { titolo: 'H-Farmers project', corpo: 'Improve internal AI systems at H-Farmers.' }),
    documento('generic', { titolo: 'AI systems company operations', corpo: 'Improve internal AI systems and company operations.' })
  ])
  assert.deepEqual(links('cv'), [p.id])
  assert.deepEqual(links('similar'), [])
  assert.deepEqual(links('generic'), [])
  assert.equal(conoscenza.mappa(2600, ora).nodi.find(n => n.id === 'cv')!.progetti[0].stato, 'chiuso')
})

test('website identity requires the actual domain, not lookalike hosts or a billing email address', () => {
  const p = progetti.scrivi({ nome: 'tobiadonadon.com', obiettivo: 'Publish the site' })
  store.salvaDocumenti([
    documento('exact', { corpo: 'Please review https://www.tobiadonadon.com/launch before publication.' }),
    documento('bare', { corpo: 'Changes for tobiadonadon.com are ready.' }),
    documento('sentence', { corpo: 'Please review tobiadonadon.com.' }),
    documento('prefix', { corpo: 'Changes for not-tobiadonadon.com are ready.' }),
    documento('suffix', { corpo: 'Changes for tobiadonadon.com.evil.example are ready.' }),
    documento('email', { corpo: 'Receipt paid by billing@tobiadonadon.com.' })
  ])
  assert.deepEqual(links('exact'), [p.id])
  assert.deepEqual(links('bare'), [p.id])
  assert.deepEqual(links('sentence'), [p.id])
  for (const id of ['prefix', 'suffix', 'email']) assert.deepEqual(links(id), [], id)
})

test('an established source-task connection is usable without repeating the project name', () => {
  const p = progetti.scrivi({ nome: 'Aurora', obiettivo: 'Release the client portal' })
  store.salvaDocumenti(['manual', 'completed', 'delegated', 'suggested', 'dismissed', 'removed'].map(id => documento(id, { titolo: 'Scope approval', corpo: 'Please confirm the revised scope.' })))
  for (const id of ['manual', 'completed', 'delegated', 'suggested', 'dismissed', 'removed']) {
    store.scriviCompito({ id: `task-${id}`, testo: 'Review scope', doc: id, progetto: p.id, origine: id === 'manual' || id === 'removed' ? 'mano' : 'punto', ordine: id })
  }
  store.cambiaStatoCompito('task-completed', 'fatto')
  store.affidaCompito('task-delegated', 'prepara')
  store.cambiaStatoCompito('task-dismissed', 'lasciato')
  store.scordaCompito('task-removed')
  for (const id of ['manual', 'completed', 'delegated']) assert.deepEqual(links(id), [p.id], id)
  for (const id of ['suggested', 'dismissed', 'removed']) assert.deepEqual(links(id), [], id)
})
