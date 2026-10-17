import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const casa = mkdtempSync(join(tmpdir(), 'myynd-adaptive-intelligence-'))
process.env.MYYND_DATI = casa
delete process.env.ANTHROPIC_API_KEY
const store = await import('./store.ts')
const cfg = await import('./config.ts')
const progetti = await import('./progetti.ts')
const news = await import('./rassegna.ts')
const gusto = await import('./gusto.ts')

beforeEach(() => {
  store.azzeraTutto()
  store.default.exec('DELETE FROM notizie;')
  cfg.scrivi({ lingua: 'en', desktop: { cartelle: ['/Users/test/Documents'] } })
})
after(() => { store.chiudiIndici(); rmSync(casa, { force: true, recursive: true }) })

test('news context excludes paused projects, old Brief projects and unadopted generated interests', () => {
  cfg.aggiorna({ argomentiDaMe: true, argomenti: 'medical reports, inbox priorities' })
  const p = progetti.scrivi({ nome: 'Myynd', obiettivo: 'Ship Electron macOS app' })
  store.scriviCompito({ id: 'auto-medical', testo: 'Analyze FunctionHealth report', nota: 'Medical records', ordine: 'a', origine: 'punto' })
  assert.ok(news.contesto().some(f => f.testo.includes('Electron')))
  assert.ok(news.contesto().every(f => !f.testo.includes('FunctionHealth') && !f.testo.includes('medical')))
  progetti.cambia(p.id, { stato: 'fermo' })
  // resta solo l'IA di frontiera, che c'è per tutti
  assert.deepEqual(news.contesto(), [news.SEMPRE])
  assert.equal(gusto.evidenzaDalLavoro().vale, false)
})

test('news feedback survives pruning and distinguishes a new release number', () => {
  const n = { id: 'release1', titolo: 'Electron release 40 fixes credential storage', riassunto: 'A security release.', perche: null, fonte: 'Vendor', link: 'https://example.test/release1', argomento: 'tecnologia', quando: '2020-01-01' }
  store.salvaNotizie([n, { ...n, id: 'read' }])
  store.segnaNotiziaScartata(n.id)
  store.segnaNotiziaLetta('read')
  store.default.exec("UPDATE notizie SET presa = '2020-01-01'")
  store.potaNotizie(8)
  assert.deepEqual(store.notizieScartate(), ['release1'])
  assert.equal(store.notizieFeedback().length, 2)
  assert.equal(news.simili(news.impronta(n.titolo), news.impronta('Electron release 41 fixes credential storage')), false)
})

test('news does not fabricate a publication date for undated RSS or learn interests from its own untouched work', () => {
  assert.deepEqual(news.leggiFeed('<rss><item><title>Old news</title><link>https://example.test/old</link></item></rss>', { nome: 'Example', url: 'https://example.test/rss', argomento: 'tecnologia', lingua: '*' }), [])
  for (let i = 0; i < 8; i++) store.scriviCompito({ id: `generated-${i}`, testo: 'FunctionHealth medical analysis', ordine: `a${i}`, origine: 'auto:medical' })
  assert.equal(gusto.evidenzaDalLavoro().vale, false)
})

test('repeated explicit news dismissals teach negative preferences even without clicks', () => {
  for (let i = 0; i < 6; i++) {
    store.salvaNotizie([{ id: `gossip-${i}`, titolo: `Celebrity gossip story ${i}`, riassunto: '', perche: null, fonte: 'Gossip', link: `https://example.test/${i}`, argomento: 'mondo', quando: new Date().toISOString() }])
    store.segnaNotiziaScartata(`gossip-${i}`)
  }
  const g = gusto.gusto()
  assert.equal(g.vale, true)
  assert.ok(g.stufa.includes('celebrity'))
  assert.ok(gusto.affinita(g, 'Celebrity gossip keeps spreading', 'Gossip') < 0)
})
