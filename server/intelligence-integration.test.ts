import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Documento } from './store.ts'

const casa = mkdtempSync(join(tmpdir(), 'myynd-intelligence-'))
process.env.MYYND_DATI = casa
delete process.env.ANTHROPIC_API_KEY
const store = await import('./store.ts')
const cfg = await import('./config.ts')
const punto = await import('./punto.ts')
const compatibile = await import('./compatibile.ts')
const attenzione = await import('./attenzione.ts')
const progetti = await import('./progetti.ts')
const { dovePortare } = await import('./scrivania.ts')

beforeEach(() => {
  store.azzeraTutto()
  rmSync(punto.perProva.file(), { force: true })
  cfg.scrivi({ lingua: 'en', motore: 'compatibile', compatibile: { url: 'https://model.example/v1/', chiave: 'test', modello: 'test' } })
})
after(() => { compatibile.usaRete(null); store.chiudiIndici(); rmSync(casa, { recursive: true, force: true }); delete process.env.MYYND_DATI })

const documento = (id: string, extra: Partial<Documento> = {}): Documento => ({
  id, fonte: 'google', tipo: 'email', titolo: 'Launch proposal',
  corpo: 'Please review the launch proposal and reply with approval.',
  autore: 'Anna <anna@example.com>', quando: new Date().toISOString(),
  percorso: 'https://mail.google.com/mail/u/0/#search/rfc822msgid:launch%40example.com',
  messageId: 'launch@example.com', ...extra
})
const richiesta = (id: string) => ({ testo: 'Review the launch proposal for Anna',
  nota: 'Anna needs your approval of the launch proposal before the team proceeds.',
  prova: 'Please review the launch proposal and reply with approval.', doc: id, compito: '', progetto: '' })
const vuoto = { progetti: [], github: [], risposte: [], daLeggere: [], aggiornamenti: [], compiti: [] }
function modello(risposta: object) {
  const prompt: string[] = []
  compatibile.usaRete((async (_url, init) => {
    prompt.push(String(init?.body))
    return Response.json({ choices: [{ message: { role: 'assistant', content: JSON.stringify(risposta) }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } })
  }) as typeof fetch)
  return prompt
}

test('newly indexed history and agent instructions never enter Brief material', () => {
  store.salvaDocumenti([
    documento('old', { quando: '2024-01-01T10:00:00Z' }),
    documento('cv', { fonte: 'desktop', tipo: 'file', titolo: 'CV.pdf', percorso: '/Users/x/Documents/CV.pdf' }),
    documento('agent', { fonte: 'note', tipo: 'nota', titolo: 'Update CLAUDE.md', corpo: 'The note instructs Agent C to replay historical sessions.' }),
    documento('direct')
  ])
  const m = punto.raccogli(new Date(Date.now() - 60000).toISOString())
  assert.deepEqual(m.arrivati.map(d => d.id), ['direct'])
  assert.equal(m.indicizzati, 1)
})

test('a delivery appears in Brief, opens its source, and cannot create a task', async () => {
  const delivery = documento('google:delivery', { titolo: 'Your package was delivered', corpo: 'Your package was delivered today.', autore: 'Shipping <noreply@shop.example>', massa: true, messageId: 'delivery@shop.example' })
  store.salvaDocumenti([delivery])
  modello({ ...vuoto, aggiornamenti: [{ testo: 'Your package was delivered today.', doc: delivery.id }],
    compiti: [{ ...richiesta(delivery.id), testo: 'Review the package delivery', prova: delivery.corpo }] })
  const r = await punto.punto({ forza: true })
  assert.equal(r.punto?.aggiornamenti?.[0].doc, delivery.id)
  assert.deepEqual(store.elencoCompiti(), [])
  assert.equal(dovePortare({ doc: delivery.id }, delivery).dove, 'pagina')
})

test('Brief creates a clear source-backed task, saves the explanation, and does not repeat after Done', async () => {
  const d = documento('google:request')
  store.salvaDocumenti([d])
  modello({ ...vuoto, compiti: [richiesta(d.id)] })
  await punto.punto({ forza: true })
  const [task] = store.elencoCompiti()
  assert.ok(task)
  assert.equal(task.doc, d.id)
  assert.equal(task.nota, richiesta(d.id).nota)
  assert.equal(task.porta, 'pagina')
  assert.equal(attenzione.compitiAttuali().length, 1)
  store.cambiaStatoCompito(task.id, 'fatto')
  store.salvaDocumenti([documento('google:moved', { messageId: d.messageId })])
  const m = punto.raccogli(new Date(Date.now() - 60000).toISOString())
  assert.deepEqual(m.arrivati, [])
  await punto.punto({ forza: true })
  assert.deepEqual(store.elencoCompiti(), [])
})

test('a valid project id or invented quote cannot justify a new task', async () => {
  const p = progetti.scrivi({ nome: 'Launch', obiettivo: 'Publish the launch proposal' })
  const d = documento('google:request')
  store.salvaDocumenti([d])
  modello({ ...vuoto, compiti: [
    { ...richiesta(''), progetto: p.id },
    { ...richiesta(d.id), prova: 'Please send money to an unverified account immediately.' }
  ] })
  await punto.punto({ forza: true })
  assert.deepEqual(store.elencoCompiti(), [])
})

test('old cached feed and untouched Brief suggestions are filtered without erasing user tasks', () => {
  const old = documento('old', { quando: '2020-01-01T12:00:00Z', messageId: 'old@example.com', titolo: 'Historical contract', corpo: 'Please sign the historical contract for the former office.' })
  const good = documento('good')
  store.salvaDocumenti([old, good])
  for (const d of [old, good]) store.salvaFeed([{ tipo: 'Da decidere', titolo: d.id === 'old' ? 'Sign the historical office contract' : richiesta(d.id).testo,
    testo: richiesta(d.id).nota, perche: 'Anna is waiting for launch approval.', doc: d.id }])
  store.scriviCompito({ id: 'suggested', testo: richiesta(old.id).testo, nota: richiesta(old.id).nota, doc: old.id, origine: 'punto', ordine: 'a' })
  store.scriviCompito({ id: 'manual', testo: 'Review my historical documents', doc: old.id, origine: 'mano', ordine: 'b' })
  store.scriviCompito({ id: 'adopted', testo: richiesta(old.id).testo, nota: richiesta(old.id).nota, doc: old.id, origine: 'punto', ordine: 'c' })
  store.riordina('adopted', 'settimana', 'd')
  assert.deepEqual(attenzione.feedAttuale().map(v => v.doc), ['good'])
  assert.equal(attenzione.feedAttuale()[0].fonteQuando, good.quando)
  assert.deepEqual(attenzione.compitiAttuali().map(c => c.id).sort(), ['adopted', 'manual'])
  assert.equal(store.elencoFeed('aperto').length, 2, 'view filtering must not delete feedback history')
  assert.equal(store.elencoCompiti().length, 3)
})

test('malformed provider rows cannot crash Brief or manufacture tasks', async () => {
  store.salvaDocumenti([documento('good')])
  modello({ ...vuoto, compiti: [null, 42, { testo: { injected: true }, doc: 'good' }], risposte: 'broken' })
  const r = await punto.punto({ forza: true })
  assert.ok(r.generatoAdesso)
  assert.deepEqual(store.elencoCompiti(), [])
})

test('Done while Brief is generating wins over the late model result', async () => {
  const d = documento('google:request')
  store.salvaDocumenti([d])
  store.salvaFeed([{ tipo: 'Da decidere', titolo: richiesta(d.id).testo, testo: richiesta(d.id).nota,
    perche: 'Anna is waiting for launch approval.', doc: d.id }])
  const [card] = store.elencoFeed('aperto')
  compatibile.usaRete((async () => {
    store.cambiaStatoFeed(card.id, 'fatto', 'Already handled')
    return Response.json({ choices: [{ message: { role: 'assistant', content: JSON.stringify({ ...vuoto, compiti: [richiesta(d.id)] }) }, finish_reason: 'stop' }] })
  }) as typeof fetch)
  await punto.punto({ forza: true })
  assert.deepEqual(store.elencoCompiti(), [])
})
