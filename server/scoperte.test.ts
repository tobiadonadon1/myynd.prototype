import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const dati = mkdtempSync(join(tmpdir(), 'myynd-discovery-'))
process.env.MYYND_DATI = dati
writeFileSync(join(dati, 'config.json'), JSON.stringify({ lingua: 'en' }))
const { rileva } = await import('./scoperte.ts')
after(() => rmSync(dati, { recursive: true, force: true }))
const docs = [{ id: '1', titolo: 'Invoice for September', fonte: 'desktop' }, { id: '2', titolo: 'Invoice for August', fonte: 'desktop' }]
const catalogo = [{ nome: 'desktop.leggi', collegato: true }]
test('suggestions require repeated evidence from a currently connected source', () => {
  assert.equal(rileva(docs.slice(0, 1), catalogo, new Set()).length, 0)
  assert.equal(rileva(docs, [{ ...catalogo[0], collegato: false }], new Set()).length, 0)
  const r = rileva(docs, catalogo, new Set())
  assert.equal(r.length, 1); assert.equal(r[0].quanti, 2)
  assert.deepEqual(r[0].attrezzi, ['desktop.leggi'])
  assert.deepEqual(r[0].esempi, docs.map(d => d.titolo))
})
test('adopted and dismissed suggestions stay out, and labels follow the language', () => {
  assert.equal(rileva(docs, catalogo, new Set(['mind-invoices'])).length, 0)
  assert.equal(rileva(docs, catalogo, new Set(), false)[0].nome, 'Fatture sotto controllo')
  assert.equal(rileva([{ id: '3', titolo: 'Hello', fonte: 'desktop' }], catalogo, new Set()).length, 0)
})
test('adoption persists a paused workflow, is idempotent, and dismissal persists', async () => {
  const cfg = await import('./config.ts')
  const store = await import('./store.ts')
  const auto = await import('./automazioni.ts')
  const discovery = await import('./scoperte.ts')
  cfg.scrivi({ ...cfg.leggi(), desktop: { cartelle: [dati] } })
  store.salvaDocumenti(docs.map(d => ({ ...d, tipo: 'file', corpo: 'Example invoice', quando: new Date().toISOString() })))
  assert.equal(discovery.suggerimenti().length, 1)
  const a = discovery.adotta('mind-invoices')
  assert.equal(auto.elenco().find(x => x.id === a.id)?.accesa, false)
  assert.equal(a.passi?.[0].tipo, 'condizione')
  assert.equal(discovery.suggerimenti().length, 0)
  assert.equal(discovery.adotta(a.id).id, a.id)
  assert.equal(auto.elenco().filter(x => x.id === a.id).length, 1)
  store.salvaDocumenti([
    { id: 'm1', fonte: 'desktop', titolo: 'Meeting notes one', corpo: '', tipo: 'file' },
    { id: 'm2', fonte: 'desktop', titolo: 'Meeting notes two', corpo: '', tipo: 'file' }
  ])
  assert.ok(discovery.suggerimenti().some(x => x.id === 'mind-meetings'))
  store.togliAutomazione('mind-meetings')
  assert.ok(!discovery.suggerimenti().some(x => x.id === 'mind-meetings'))
  assert.throws(() => discovery.adotta('mind-meetings'))
})
test('general inbox and project suggestions work without invoice keywords', () => {
  const mail = Array.from({ length: 3 }, (_, i) => ({ id: `mail-${i}`, titolo: `A question ${i}`, fonte: 'posta' }))
  assert.equal(rileva(mail, [{ nome: 'posta.leggi', collegato: true }], new Set())[0].id, 'mind-inbox')
  assert.equal(rileva(mail, [{ nome: 'posta.leggi', collegato: false }], new Set()).length, 0)
  const files = Array.from({ length: 5 }, (_, i) => ({ id: `file-${i}`, titolo: `Design ${i}`, fonte: 'desktop' }))
  assert.equal(rileva(files, catalogo, new Set())[0].id, 'mind-files')
})
