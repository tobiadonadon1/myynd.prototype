import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Documento } from './store.ts'

const casa = mkdtempSync(join(tmpdir(), 'myynd-adaptive-intelligence-'))
process.env.MYYND_DATI = casa
delete process.env.ANTHROPIC_API_KEY
const store = await import('./store.ts')
const cfg = await import('./config.ts')
const progetti = await import('./progetti.ts')
const discovery = await import('./scoperte.ts')
const auto = await import('./automazioni.ts')
const news = await import('./rassegna.ts')
const gusto = await import('./gusto.ts')
const compatibile = await import('./compatibile.ts')
const chi = await import('./chi.ts')
const ricettario = await import('./ricettario.ts')

beforeEach(() => {
  store.azzeraTutto()
  store.default.exec('DELETE FROM notizie; DELETE FROM automazioni;')
  rmSync(join(casa, 'scoperte.json'), { force: true })
  rmSync(join(casa, 'automazioni'), { force: true, recursive: true })
  auto.scordaLeRicette()
  cfg.scrivi({ lingua: 'en', desktop: { cartelle: ['/Users/test/Documents'] } })
  discovery.perProva(null)
  compatibile.usaRete(null)
})
after(() => { discovery.perProva(null); compatibile.usaRete(null); store.chiudiIndici(); rmSync(casa, { force: true, recursive: true }) })

const documento = (id: string, piu: Partial<Documento> = {}): Documento => ({
  id, fonte: 'desktop', tipo: 'documento', titolo: `Supplier contract ${id}`,
  corpo: 'Nextas: Please review the supplier contract and confirm the terms.',
  autore: `${id}@supplier.example`, percorso: `/Users/test/Documents/${id}.pdf`, quando: new Date().toISOString(), ...piu
})
const prepara = () => {
  const p = progetti.scrivi({ nome: 'Nextas', obiettivo: 'Approve supplier contracts for the launch' })
  store.salvaDocumenti([documento('supplier-a'), documento('supplier-b')])
  return p
}
const idea = (piu: object = {}) => ({ nome: 'Review supplier contracts', spiega: 'Each morning, review new supplier contracts for Nextas.', perche: 'Requests from different suppliers recur.', prove: ['supplier-a', 'supplier-b'], quando: { ogni: 'giorno', ora: 8 }, guarda: { cerca: 'supplier contract' }, attrezzi: ['desktop.leggi'], metti: { inLista: 'oggi', modo: 'io' }, ...piu })
const risponde = (idee: object[]) => discovery.perProva({ collegato: () => true, chiediJSON: async () => ({ automazioni: idee }) })

test('discovery requires current project evidence and rejects old, internal and dismissed sources', async () => {
  prepara()
  const fonti = [documento('good'), documento('old', { quando: '2020-01-01' }), documento('agent', { titolo: 'CLAUDE.md instructions' }), documento('dismissed')]
  store.salvaDocumenti(fonti)
  store.scriviCompito({ id: 'ignore', testo: 'Review the supplier contract', ordine: 'a', doc: 'dismissed' })
  store.cambiaStatoCompito('ignore', 'lasciato')
  assert.deepEqual(discovery.documentiPerSuggerimenti(fonti).map(d => d.id), ['good'])
  progetti.chiudi(progetti.trovaPerNome('Nextas')!.id)
  assert.deepEqual(discovery.documentiPerSuggerimenti(fonti), [])
})

test('renaming or reordering a dismissed workflow does not suggest it again', async () => {
  prepara()
  risponde([idea()])
  const [s] = await discovery.suggerimenti(true)
  assert.ok(s)
  assert.deepEqual(s.prove, ['supplier-a', 'supplier-b'])
  assert.ok(discovery.scarta(s.id))
  risponde([idea({ nome: 'Keep vendor decisions moving', guarda: { cerca: 'contract supplier' } })])
  assert.deepEqual(await discovery.suggerimenti(true), [])
  assert.throws(() => discovery.adotta(s.id), /no longer available/)
})

test('cached suggestions and adoption react to project pauses and completed evidence immediately', async () => {
  const p = prepara()
  risponde([idea()])
  const [s] = await discovery.suggerimenti(true)
  progetti.cambia(p.id, { stato: 'fermo' })
  assert.deepEqual(await discovery.suggerimenti(), [])
  assert.throws(() => discovery.adotta(s.id), /no longer available/)
  progetti.cambia(p.id, { stato: 'attivo' })
  const [diNuovo] = await discovery.suggerimenti(true)
  store.scriviCompito({ id: 'closed-evidence', testo: 'Review supplier contract', ordine: 'a', doc: 'supplier-a' })
  store.cambiaStatoCompito('closed-evidence', 'fatto')
  assert.throws(() => discovery.adotta(diNuovo.id), /no longer available/)
})

test('unrelated proof documents cannot justify a different search or disconnected source', async () => {
  prepara()
  store.salvaDocumenti([documento('invoice-a', { titolo: 'Invoice renewal', corpo: 'Nextas: Please review the invoice renewal.' }), documento('invoice-b', { titolo: 'Invoice renewal', corpo: 'Nextas: Please review the invoice renewal.' })])
  risponde([idea({ guarda: { cerca: 'invoice renewal' } }), idea({ attrezzi: ['posta.leggi'] })])
  assert.deepEqual(await discovery.suggerimenti(true), [])
})

test('a dismissal arriving during generation wins over its pending renamed answer', async () => {
  prepara()
  risponde([idea()])
  const [s] = await discovery.suggerimenti(true)
  discovery.perProva({ collegato: () => true, chiediJSON: async () => {
    discovery.scarta(s.id)
    return { automazioni: [idea({ nome: 'New name for supplier work' })] }
  } })
  assert.deepEqual(await discovery.suggerimenti(true), [])
})

test('adopted discovery workflows follow relevance while explicit custom history requests keep their scope', async () => {
  prepara()
  risponde([idea()])
  const [s] = await discovery.suggerimenti(true)
  const ricetta = discovery.adotta(s.id)
  assert.equal(ricetta.suggerita, true)
  const docs = [documento('fresh'), documento('old', { quando: '2020-01-01' })]
  assert.deepEqual(auto.materialeRisposte(ricetta, docs).map(d => d.id), ['fresh'])
  assert.deepEqual(auto.materialeRisposte({ ...ricetta, id: 'my-explicit-history-search', suggerita: false }, docs), docs)
})

test('news context excludes paused projects, old Brief projects and unadopted generated interests', () => {
  cfg.aggiorna({ argomentiDaMe: true, argomenti: 'medical reports, inbox priorities' })
  const p = progetti.scrivi({ nome: 'Myynd', obiettivo: 'Ship Electron macOS app' })
  store.scriviCompito({ id: 'auto-medical', testo: 'Analyze FunctionHealth report', nota: 'Medical records', ordine: 'a', origine: 'punto' })
  assert.ok(news.contesto().some(f => f.testo.includes('Electron')))
  assert.ok(news.contesto().every(f => !f.testo.includes('FunctionHealth') && !f.testo.includes('medical')))
  progetti.cambia(p.id, { stato: 'fermo' })
  assert.deepEqual(news.contesto(), [])
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

test('creating a custom automation reads project memory but preserves explicitly requested history', async () => {
  prepara()
  cfg.aggiorna({ motore: 'compatibile', compatibile: { url: 'https://model.example/v1/', chiave: 'test-only', modello: 'test-model' } })
  let richiesta = ''
  compatibile.usaRete((async (_url, init) => {
    richiesta = String(init?.body ?? '')
    return Response.json({ id: 'test', model: 'test-model', choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify({
      nome: 'Review historic contracts', spiega: 'Review all historical Nextas supplier contracts.', ogni: 'settimana', giorno: 1, ora: 8,
      cerca: 'Nextas supplier contract', soloNuovi: false, fai: 'Review all historical Nextas supplier contracts.', inLista: 'settimana', modo: 'io',
      passi: [], perDocumento: false, attrezzi: ['desktop.leggi'], en: { nome: 'Review historic contracts', spiega: 'Review all historical Nextas supplier contracts.', fai: 'Review all historical Nextas supplier contracts.', cerca: 'Nextas supplier contract' }
    }) }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } })
  }) as typeof fetch)
  const a = await auto.daUnaFrase('Every Monday review all historical Nextas contracts, including old ones.')
  assert.match(richiesta, /Approve supplier contracts for the launch/)
  assert.match(richiesta, /including old ones/)
  assert.ok(!a.guarda.soloNuovi)
  assert.ok(!a.suggerita)
})

test('downloaded automation catalog state belongs to the active account', () => {
  for (const [utente, quando] of [['account-a', '2026-09-01'], ['account-b', '2026-09-02']]) {
    chi.dentro(utente, () => {
      mkdirSync(ricettario.DOVE(), { recursive: true })
      writeFileSync(join(ricettario.DOVE(), 'indice.json'), JSON.stringify({ quando, guaio: null, sha: {} }))
    })
  }
  assert.equal(chi.dentro('account-a', () => ricettario.stato().quando), '2026-09-01')
  assert.equal(chi.dentro('account-b', () => ricettario.stato().quando), '2026-09-02')
  assert.equal(ricettario.stato().quando, null)
})
