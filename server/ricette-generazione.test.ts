import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const casa = mkdtempSync(join(tmpdir(), 'myynd-recipe-generation-'))
process.env.MYYND_DATI = casa
const auto = await import('./automazioni.ts')
const store = await import('./store.ts')
const cfg = await import('./config.ts')
const progetti = await import('./progetti.ts')
beforeEach(() => {
  store.azzeraTutto(); cfg.scrivi({ lingua: 'en' })
  rmSync(auto.MIE(), { recursive: true, force: true }); auto.scordaLeRicette(); auto.perProva(null)
})
after(() => { auto.perProva(null); store.chiudiIndici(); delete process.env.MYYND_DATI; rmSync(casa, { recursive: true, force: true }) })

const richiesta = 'Every morning at 8, review only new direct human emails about my H-Farm project. Ignore newsletters, promotions, receipts and messages I have already dismissed or completed. Prepare one internal note with the unanswered requests and the exact source for each. If none qualify, say so. Do not send any email.'
const istruzione = 'Prepare one internal note of new direct human H-Farm requests. Ignore newsletters, promotions, receipts, dismissed and completed requests. Cite each exact document ID and source link. If none qualify say so. Do not send any email.'
const bozza = (patch: object = {}) => ({
  nome: 'H-Farm requests', spiega: 'At 8 every morning, prepare one internal note of new H-Farm requests.',
  ogni: 'giorno', ora: 8, cerca: 'H-Farm', soloNuovi: true, fai: istruzione,
  inLista: 'oggi', modo: 'bozza', perDocumento: false, passi: [], attrezzi: ['posta.leggi'],
  en: { nome: 'H-Farm requests', spiega: 'At 8 every morning, prepare one internal note of new H-Farm requests.', fai: istruzione, cerca: 'H-Farm' }, ...patch
})
const fileCount = () => existsSync(auto.MIE()) ? readdirSync(auto.MIE()).length : 0

test('one schema repair retains the original request and saves only a valid recipe', async () => {
  let calls = 0
  auto.perProva({ collegato: () => true, chiediJSON: async o => {
    calls++
    assert.equal(fileCount(), 0, 'no rejected draft is persisted')
    if (calls === 1) return bozza({ passi: [{ id: 1, type: 'filter', instruction: 'Read mail' }] })
    assert.match(JSON.stringify(o.messages), /unknown field|must be a non-empty string/)
    assert.match(JSON.stringify(o.messages), /Do not send any email/)
    assert.match(JSON.stringify(o.messages), /actual source document IDs/)
    return bozza()
  } })
  const a = await auto.daUnaFrase(richiesta, ['posta.leggi'])
  assert.equal(calls, 2); assert.equal(fileCount(), 1)
  assert.deepEqual(a.quando, { ogni: 'giorno', ora: 8 })
  assert.equal(a.selezione, 'richieste-dirette'); assert.equal(a.suggerita, undefined)
  assert.deepEqual(a.attrezzi, ['posta.leggi']); assert.deepEqual(a.passi, [])
})

test('invalid repair cannot silently drop invented tools or save a partial recipe', async () => {
  let calls = 0
  auto.perProva({ collegato: () => true, chiediJSON: async () => { calls++; return bozza({ attrezzi: ['posta.manda'] }) } })
  await assert.rejects(auto.daUnaFrase(richiesta, ['posta.leggi']), /unknown source or tool/)
  assert.equal(calls, 2); assert.equal(fileCount(), 0)
  await assert.rejects(auto.daUnaFrase(richiesta, ['posta.manda']), /unknown source or tool/)
  assert.equal(calls, 2, 'invalid user tool identifiers fail before contacting the model')
})

test('valid JSON with the wrong trigger, hour, output or search is rejected after one repair', async () => {
  for (const patch of [
    { ogni: 'arrivo' }, { ora: 9 }, { modo: 'prompt' }, { perDocumento: true },
    { fai: 'notaInterne' }, { cerca: 'H-Farm direct human unanswered emails' },
    { passi: [{ id: 'stop', tipo: 'condizione', testo: 'Stop if no emails qualify.' }] }
  ]) {
    let calls = 0
    auto.perProva({ collegato: () => true, chiediJSON: async () => { calls++; return bozza(patch) } })
    await assert.rejects(auto.daUnaFrase(richiesta, ['posta.leggi']))
    assert.equal(calls, 2); assert.equal(fileCount(), 0)
  }
})

test('explicit midnight and Sunday survive validation without truthiness defaults', async () => {
  auto.perProva({ collegato: () => true, chiediJSON: async () => bozza({ ogni: 'settimana', giorno: 0, ora: 0 }) })
  const a = await auto.daUnaFrase('Every Sunday at 0 prepare an internal summary of H-Farm mail.', ['posta.leggi'])
  assert.deepEqual(a.quando, { ogni: 'settimana', giorno: 0, ora: 0 })
})

test('explicit current-human policy filters before limits and survives schedule-only edits', async () => {
  progetti.scrivi({ nome: 'H-Farm', obiettivo: 'Build the H-Farm pilot.' })
  auto.perProva({ collegato: () => true, chiediJSON: async () => bozza({ cerca: 'H-Farm project email', en: { ...bozza().en, cerca: 'H-Farm project email' } }) })
  const a = await auto.daUnaFrase(richiesta, ['posta.leggi'])
  const ora = Date.now()
  const email = (id: string, patch = {}) => ({ id, fonte: 'posta', tipo: 'email', titolo: 'H-Farm pilot review',
    corpo: 'Can you review the H-Farm pilot and send me your feedback?', autore: `${id}@example.test`, quando: new Date(ora - 1000).toISOString(), ...patch })
  store.salvaDocumenti([
    ...Array.from({ length: 30 }, (_, i) => email(`promo-${i}`, { massa: true, quando: new Date(ora).toISOString() })),
    email('stale', { quando: new Date(ora - 80 * 86400_000).toISOString() }), email('dismissed'), email('valid'),
    email('other-project', { titolo: 'Website project email', corpo: 'Can you review the website project email and send me feedback?' }),
    email('answered', { filo: 'resolved' }), email('sent', { filo: 'resolved', inviato: true, quando: new Date(ora).toISOString() })
  ])
  store.scriviCompito({ id: 'dismissed-task', testo: 'H-Farm pilot review', doc: 'dismissed', ordine: 'a' })
  store.cambiaStatoCompito('dismissed-task', 'lasciato', 'Not relevant')
  assert.deepEqual(auto.anteprima(a.id).docs.map(d => d.id), ['valid'])
  auto.perProva({ chiediJSON: async () => bozza({ ora: 9 }) })
  const modificata = await auto.riscrivi(a.id, 'Run at 9 instead.')
  assert.equal(modificata.selezione, 'richieste-dirette')
  auto.perProva({ chiediJSON: async () => bozza({ soloNuovi: false }) })
  const storica = await auto.riscrivi(a.id, 'Review all historical H-Farm emails, including old ones.')
  assert.equal(storica.selezione, undefined, 'explicit historical scope remains available')
})

test('current-human policy is snapshotted with the task instead of being inferred later', async () => {
  const a = auto.scrivi({ id: 'current-human', nome: 'Current requests', spiega: 'Review current requests.',
    selezione: 'richieste-dirette', quando: { ogni: 'giorno', ora: 8 }, guarda: { soloNuovi: true, cerca: 'H-Farm' },
    fai: istruzione, metti: { inLista: 'oggi', modo: 'io' }, attrezzi: ['posta.leggi'],
    en: { nome: 'Current requests', spiega: 'Review current requests.', fai: istruzione, cerca: 'H-Farm' } })
  store.salvaDocumenti([{ id: 'live-mail', fonte: 'posta', tipo: 'email', titolo: 'H-Farm approval', corpo: 'Can you review the H-Farm pilot?', autore: 'alex@example.test', quando: new Date().toISOString() }])
  assert.equal(await auto.fai(a), 'fatta')
  const c = store.elencoCompiti().find(c => c.origine === 'auto:current-human')!
  assert.equal(c.attrezzi?.selezione, 'richieste-dirette')
  assert.equal(c.attrezzi?.ambitoSelezione, 'H-Farm')
  assert.match(c.nota ?? '', /\[live-mail\]/)
})
