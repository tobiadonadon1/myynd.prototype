import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Documento } from './store.ts'

const casa = mkdtempSync(join(tmpdir(), 'myynd-knowledge-context-'))
process.env.MYYND_DATI = casa
const store = await import('./store.ts')
const cfg = await import('./config.ts')
const progetti = await import('./progetti.ts')
const memoria = await import('./memoria.ts')
const conoscenza = await import('./conoscenza.ts')
const claude = await import('./claude.ts')
const timone = await import('./timone.ts')
const compatibile = await import('./compatibile.ts')
beforeEach(() => { store.azzeraTutto(); cfg.scrivi({ lingua: 'en' }) })
after(() => {
  compatibile.usaRete(null)
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(casa, { recursive: true, force: true })
})
const ora = Date.now()
const mail = (id: string, patch: Partial<Documento> = {}): Documento => ({
  id, fonte: 'posta', tipo: 'email', titolo: 'Aurora customer portal proposal',
  corpo: 'Could you review the Aurora customer portal proposal and confirm the scope?',
  autore: 'Alex <alex@example.com>', quando: new Date(ora - 3600_000).toISOString(), ...patch
})

test('knowledge nodes retain sources while displaying real project links and source excerpts', () => {
  const p = progetti.scrivi({ nome: 'Aurora', obiettivo: 'Validate the customer portal' })
  const docs = [mail('current'), mail('reference', { quando: new Date(ora - 90 * 86_400_000).toISOString(), corpo: 'Aurora design history. '.repeat(80) })]
  store.salvaDocumenti(docs)
  const base = store.mappa()
  const g = conoscenza.mappa(2600, ora)
  assert.deepEqual(g.archi, base.archi)
  assert.deepEqual(g.nodi.map(n => n.id), base.nodi.map(n => n.id))
  const current = g.nodi.find(n => n.id === 'current')!
  assert.equal(current.autore, docs[0].autore)
  assert.equal(current.attenzione, 'feed')
  assert.deepEqual(current.progetti, [{ id: p.id, nome: p.nome, obiettivo: p.obiettivo, stato: 'attivo' }])
  const reference = g.nodi.find(n => n.id === 'reference')!
  assert.equal(reference.attenzione, 'ignora')
  assert.equal(reference.motivoAttenzione, 'fonte_non_recente')
  assert.equal(reference.estratto.length, 400)
})

test('completed and dismissed work remains knowledge and its feedback reaches chat retrieval', () => {
  store.salvaDocumenti([mail('answered'), mail('different', { autore: 'Sam <sam@example.com>', titolo: 'Budget for a different project', corpo: 'Can you confirm the event budget?' })])
  store.scriviCompito({ id: 'task', testo: 'Reply about Aurora proposal', doc: 'answered', ordine: 'a' })
  store.cambiaStatoCompito('task', 'fatto', 'Sent the approved scope this morning.')
  let node = conoscenza.mappa(2600, ora).nodi.find(n => n.id === 'answered')!
  assert.equal(node.feedback, 'fatto')
  assert.equal(node.motivoAttenzione, 'feedback_fatto')
  assert.match(claude.contesto([store.documento('answered')!]), /già completata.*Non riproporla/)
  assert.match(claude.contesto([store.documento('answered')!]), /Sent the approved scope/)
  assert.doesNotMatch(claude.contesto([store.documento('different')!]), /Giudizio esplicito/)
  store.cambiaStatoCompito('task', 'aperto')
  node = conoscenza.mappa(2600, ora).nodi.find(n => n.id === 'answered')!
  assert.equal(node.feedback, null)
  assert.equal(node.attenzione, 'feed')
  store.cambiaStatoCompito('task', 'lasciato', 'This particular request is no longer relevant.')
  assert.equal(conoscenza.mappa(2600, ora).nodi.find(n => n.id === 'answered')?.feedback, 'scartato')
})

test('project context handles inferred goal-as-name duplicates without deleting user records', () => {
  const p = progetti.scrivi({ nome: 'H-Farm', obiettivo: 'Solidify AI systems for company operations' })
  const alias = progetti.scrivi({ nome: 'H-Farm: I want to solidify AI systems for company operations' })
  store.default.prepare("UPDATE progetti SET origine = 'punto' WHERE id = ?").run(alias.id)
  assert.equal(progetti.elenco().length, 2)
  assert.deepEqual(progetti.perContesto().map(x => x.id), [p.id])
  assert.equal(progetti.scrivi({ nome: alias.nome, origine: 'conversazione' }).id, alias.id, 'an existing exact record remains editable')
  assert.equal(progetti.scrivi({ nome: 'H-Farm: Our goal is to improve operations', origine: 'punto' }).id, p.id)
  progetti.chiudi(p.id)
  assert.deepEqual(progetti.perContesto(), [], 'closing the real project cannot revive its inferred alias')
  assert.equal(progetti.elenco().length, 2)
})

test('exact project overview never asks a model to fill missing goals from old documents', async () => {
  const p = progetti.scrivi({ nome: 'tobiadonadon.com', obiettivo: 'Publish the new website' })
  progetti.scrivi({ nome: 'Evermute deck', origine: 'punto' })
  const paused = progetti.scrivi({ nome: 'Myynd for Dad' })
  progetti.cambia(paused.id, { stato: 'fermo' })
  const closed = progetti.scrivi({ nome: 'Old audit' })
  progetti.chiudi(closed.id)
  store.salvaDocumenti([mail('old-audit', { titolo: 'Mashburn Construction audit', corpo: 'An old unrelated audit project.' })])
  cfg.scrivi({ lingua: 'en', motore: 'compatibile', compatibile: { url: 'https://knowledge.test/v1', modello: 'test' } })
  let calls = 0
  compatibile.usaRete((async () => { calls++; throw new Error('A factual overview must not call the model.') }) as typeof fetch)
  const question = 'What projects am I working on, and what are their goals? Separate what you actually know from anything that is missing or only inferred. Do not add tasks.'
  const r = await claude.rispondi(question)
  assert.match(r.testo, /tobiadonadon\.com: Publish the new website/)
  assert.match(r.testo, /Evermute deck: No goal recorded\. Inferred from sources/)
  assert.match(r.testo, /Myynd for Dad \(paused\): No goal recorded/)
  assert.doesNotMatch(r.testo, /Mashburn|Old audit/)
  const deltas: string[] = []
  const streaming = await claude.rispondiInStreaming(question, [], d => deltas.push(d))
  assert.equal(streaming.testo, r.testo)
  assert.equal(deltas.join(''), r.testo)
  assert.equal(calls, 0)
  assert.equal(store.elencoCompiti().length, 0)
  assert.equal(progetti.trova(p.id)?.nome, 'tobiadonadon.com')
  assert.equal(claude.panoramicaProgetti('List my projects and create a task to review them'), null)
})

test('shared context updates immediately after project and priority corrections', () => {
  const p = progetti.scrivi({ nome: 'Aurora', obiettivo: 'Launch with five customers' })
  timone.scriviFuoco('Focus on retaining existing customers.')
  store.ricorda({ enunciato: 'Alex prefers the compact proposal format', ambito: 'cliente:Alex', genere: 'esplicita', fiducia: 1, origine: 'test' })
  let context = memoria.contestoOperativo('Draft the proposal for Alex')
  assert.match(context, /Launch with five customers/)
  assert.match(context, /retaining existing customers/)
  assert.match(context, /Alex prefers the compact proposal format/)
  progetti.cambia(p.id, { obiettivo: 'Validate with two customers', stato: 'fermo' })
  timone.scriviFuoco('Focus on validating the pilot.')
  context = memoria.contestoOperativo('Draft the proposal for Alex')
  assert.match(context, /Validate with two customers/)
  assert.doesNotMatch(context, /Launch with five|retaining existing/)
  assert.match(context, /validating the pilot/)
})

test('named project goals cannot be conflated with unrelated or merely topical projects', () => {
  progetti.scrivi({ nome: 'H-Farm', obiettivo: 'Improve internal AI systems' })
  progetti.scrivi({ nome: 'Myynd for Dad' })
  progetti.scrivi({ nome: 'AI toolkit', obiettivo: 'Improve internal AI systems', origine: 'punto' })
  const question = 'Prepare three practical next steps for H-Farm to improve internal AI systems.'
  assert.match(progetti.perIlModello(question).split('\n')[0], /Progetto: H-Farm/)
  for (const context of [memoria.contestoOperativo(question), claude.sistema(question, false, true)]) {
    assert.match(context, /H-Farm \(attivo; registrato dalla persona\)\. Obiettivo di H-Farm: Improve internal AI systems/)
    assert.doesNotMatch(context, /Myynd for Dad|AI toolkit/)
  }
  const unrelated = memoria.contestoOperativo('Tell me about Myynd for Dad')
  assert.match(unrelated, /Obiettivo di Myynd for Dad: non registrato/)
  assert.doesNotMatch(unrelated, /Improve internal AI systems/)
})

test('explicitly editing an inferred project makes its updated goal authoritative', () => {
  const p = progetti.scrivi({ nome: 'Aurora', origine: 'punto' })
  assert.equal(progetti.trova(p.id)?.origine, 'punto')
  progetti.cambia(p.id, { obiettivo: 'Validate the pilot with two customers' })
  assert.equal(progetti.trova(p.id)?.origine, 'mano')
  assert.match(claude.panoramicaProgetti('What are my projects?')!.testo, /Aurora: Validate the pilot/)
  assert.doesNotMatch(claude.panoramicaProgetti('What are my projects?')!.testo, /inferred/i)
  const legacy = progetti.scrivi({ nome: 'Legacy', obiettivo: 'A previously saved goal', origine: 'punto' })
  assert.match(claude.panoramicaProgetti('What are my projects?')!.testo, /Project originally inferred; goal saved in Memory/)
  progetti.scrivi({ nome: legacy.nome })
  assert.equal(progetti.trova(legacy.id)?.origine, 'mano')
})

test('named project retrieval requires its exact identity instead of generic goal keywords', () => {
  progetti.scrivi({ nome: 'H-Farm', obiettivo: 'Improve AI systems for company operations' })
  store.salvaDocumenti([
    mail('unrelated', { fonte: 'desktop', tipo: 'pdf', titolo: 'AI systems company operations sales deck', corpo: 'Prepare practical next steps to improve AI systems for company operations using this Shopify guide. Compare AI systems company operations across all projects.' }),
    mail('lookalike', { titolo: 'H-Farmers AI systems', corpo: 'Improve AI systems for company operations with practical next steps for H-Farmers.' })
  ])
  const question = 'Prepare three practical next steps for H-Farm to improve AI systems for company operations.'
  assert.deepEqual(claude.materiale(question, []), [], 'no project source must not fall back to generic references')
  store.salvaDocumenti([
    mail('project', { titolo: 'H-Farm scope decision', corpo: 'We chose a small first pilot.', filo: 'h-farm-thread' }),
    mail('sibling', { titolo: 'Re: scope decision', corpo: 'Confirmed, use the support team first.', filo: 'h-farm-thread' }),
    mail('other-account', { fonte: 'gmail', titolo: 'Re: scope decision', corpo: 'A copy in a different account.', filo: 'h-farm-thread' }),
    mail('file', { fonte: 'desktop', tipo: 'pdf', titolo: 'H-Farm plan', corpo: 'The named project plan.' })
  ])
  const scoped = claude.materiale(question, [], ['posta']).map(d => d.id)
  assert.deepEqual(scoped, ['project', 'sibling'])
  assert.deepEqual(claude.materiale(question, [], []), [])
  assert.ok(claude.materiale('AI systems company operations', []).some(d => d.id === 'unrelated'), 'general research remains available')
  assert.ok(claude.materiale('Compare AI systems company operations across all projects including H-Farm', []).some(d => d.id === 'unrelated'), 'explicit cross-project research remains broad')
})

test('current project plans exclude archives, promotions and completed work while preserving historical access', () => {
  progetti.scrivi({ nome: 'H-Farm', obiettivo: 'Improve internal AI systems' })
  const docs = [
    mail('old-school', { titolo: 'H-Farm culture courses', corpo: 'Please review our culture courses.', quando: new Date(ora - 90 * 86_400_000).toISOString() }),
    mail('promotion', { titolo: 'H-Farm marketing update', corpo: 'Newsletter: explore courses and unsubscribe here.', massa: true }),
    mail('done', { titolo: 'H-Farm completed pilot request', corpo: 'Could you review the finished support pilot?' }),
    mail('current', { titolo: 'H-Farm support AI pilot', corpo: 'Could you confirm the support pilot scope?' })
  ]
  store.salvaDocumenti(docs)
  store.scriviCompito({ id: 'done-task', testo: 'Review finished pilot', doc: 'done', ordine: 'a' })
  store.cambiaStatoCompito('done-task', 'fatto')
  const plan = 'Prepare three practical next steps for H-Farm. Do not use old emails.'
  assert.deepEqual(claude.materiale(plan, []).map(d => d.id), ['current'])
  assert.ok(claude.materiale('Review the H-Farm culture courses from last year', []).some(d => d.id === 'old-school'))
  assert.ok(claude.evidenzePerPiano(plan, docs, new Set(['old-school'])).some(d => d.id === 'old-school'), 'an explicitly pinned historical source remains readable')
  assert.deepEqual(claude.evidenzePerPiano('Summarize the old H-Farm documents', docs), docs)
})

test('project activity agrees with To do without deleting hidden suggestions or completed history', () => {
  const p = progetti.scrivi({ nome: 'Aurora', obiettivo: 'Validate a customer pilot' })
  store.salvaDocumenti([mail('old-suggestion', { quando: new Date(ora - 90 * 86_400_000).toISOString() })])
  store.scriviCompito({ id: 'hidden-proposal', testo: 'Reply about the old proposal', nota: 'Please reply to the old Aurora proposal.', progetto: p.id, origine: 'punto', doc: 'old-suggestion', ordine: 'a' })
  let progress = progetti.progresso(p.id)
  assert.equal(progress.aperte, 0)
  assert.equal(progress.prossima, null)
  assert.deepEqual(progress.attivita, [])
  assert.ok(store.compito('hidden-proposal'), 'the stored suggestion is preserved')
  assert.doesNotMatch(progetti.perIlModello('Aurora'), /Reply about the old proposal/)
  store.scriviCompito({ id: 'manual-work', testo: 'User-owned pilot preparation', progetto: p.id, origine: 'mano', doc: 'old-suggestion', ordine: 'b' })
  store.scriviCompito({ id: 'history', testo: 'Completed earlier scope review', progetto: p.id, origine: 'punto', doc: 'old-suggestion', ordine: 'c' })
  store.cambiaStatoCompito('history', 'fatto')
  progress = progetti.progresso(p.id)
  assert.equal(progress.aperte, 1, 'manually adopted work remains current even with an old source')
  assert.equal(progress.completate, 1)
  assert.equal(progress.prossima?.id, 'manual-work')
  assert.deepEqual(new Set(progress.attivita.map(c => c.id)), new Set(['manual-work', 'history']))
})

test('direct-email execution policy excludes answered threads without excluding its own active task', () => {
  const p = progetti.scrivi({ nome: 'Aurora' })
  const incoming = mail('awaiting', { titolo: 'Aurora scope request', filo: 'aurora-scope' })
  store.salvaDocumenti([incoming])
  store.scriviCompito({ id: 'own-task', testo: 'Prepare the scope reply', doc: incoming.id, attrezzi: { nomi: ['posta.leggi'], selezione: 'richieste-dirette', ambitoSelezione: 'Aurora' }, ordine: 'a' })
  const policy = store.compito('own-task')!.attrezzi!
  assert.deepEqual(claude.documentiPerSelezione([incoming], policy).map(d => d.id), ['awaiting'])
  assert.deepEqual(claude.documentiPerSelezione([incoming, mail('other-project', { titolo: 'Borealis scope', corpo: 'Could you confirm the Borealis scope?' })],
    { selezione: 'richieste-dirette', ambitoSelezione: 'scope requests' }, 'Summarize requests about Aurora').map(d => d.id), ['awaiting'])
  store.salvaDocumenti([mail('sent-reply', { titolo: 'Re: Aurora scope request', filo: 'aurora-scope', inviato: true, quando: new Date().toISOString() })])
  assert.deepEqual(claude.documentiPerSelezione([incoming], policy), [])
  progetti.chiudi(p.id)
  assert.equal(claude.verificaFontiSelezione(['awaiting'], policy), false)
})
