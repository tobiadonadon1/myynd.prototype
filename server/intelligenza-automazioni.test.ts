import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Documento } from './store.ts'
import type { Automazione } from './automazioni.ts'

const casa = mkdtempSync(join(tmpdir(), 'myynd-reply-intelligence-'))
process.env.MYYND_DATI = casa
const store = await import('./store.ts')
const auto = await import('./automazioni.ts')
const cfg = await import('./config.ts')
beforeEach(() => { store.azzeraTutto(); cfg.scrivi({ lingua: 'en' }) })
after(() => {
  auto.perProva(null)
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(casa, { recursive: true, force: true })
})

const ora = Date.now()
const mail = (id: string, patch: Partial<Documento> = {}): Documento => ({
  id, fonte: 'posta', tipo: 'email', titolo: 'Please approve the portal proposal',
  corpo: 'Can you review the portal proposal and send me your decision?', autore: 'Alex <alex@example.com>',
  quando: new Date(ora - 3600_000).toISOString(), ...patch
})
const ricetta: Automazione = {
  id: 'risposte-da-dare', nome: 'Replies', spiega: 'Prepare relevant replies.',
  quando: { quandoArriva: true }, guarda: { soloNuovi: true, limite: 2 },
  fai: 'Pick messages waiting on a direct reply.', metti: { inLista: 'oggi', modo: 'io', perDocumento: true },
  attrezzi: ['posta.leggi'], en: { nome: 'Replies', spiega: 'Prepare relevant replies.', fai: 'Pick messages waiting on a direct reply.' }
}

test('built-in reply automations reject old, promotional, service, dismissed and already answered mail', () => {
  const docs = [
    mail('direct'),
    mail('old', { quando: new Date(ora - 90 * 86_400_000).toISOString() }),
    mail('promo', { titolo: 'Weekly newsletter', corpo: 'Shop now and unsubscribe here.' }),
    mail('order', { titolo: 'Your package was delivered', corpo: 'Track your order.', autore: 'noreply@shop.example' }),
    mail('dismissed', { autore: 'Another contact <other@example.com>' }),
    mail('answered', { filo: 'resolved-thread' }),
    mail('response', { filo: 'resolved-thread', inviato: true, quando: new Date(ora).toISOString() })
  ]
  store.salvaDocumenti(docs)
  store.scriviCompito({ id: 'dismissed-task', testo: 'Reply about portal proposal', ordine: 'a', doc: 'dismissed' })
  store.cambiaStatoCompito('dismissed-task', 'lasciato', 'This request is not relevant to me.')
  assert.deepEqual(auto.materialeRisposte(ricetta, docs, ora).map(d => d.id), ['direct'])
  assert.deepEqual(auto.materialeRisposte({ ...ricetta, id: 'chi-aspetta-risposta' }, docs, ora).map(d => d.id), ['direct'])
})

test('custom archival or order automations preserve their explicitly chosen material', () => {
  const docs = [mail('old-order', { titolo: 'Your order has shipped', quando: new Date(ora - 90 * 86_400_000).toISOString() })]
  assert.deepEqual(auto.materialeRisposte({ ...ricetta, id: 'my-order-tracker' }, docs, ora), docs)
  assert.deepEqual(auto.materialeRisposte({ ...ricetta, proponi: 'posta.archivia', metti: { inLista: 'poi' } }, docs, ora), docs)
})

test('relevance filtering happens before limits and suppressed mail never reaches reply selection', async () => {
  const direct = mail('valid-personal-request', { autore: 'Marta <marta@example.com>' })
  const promotions = Array.from({ length: 24 }, (_, i) => mail(`promotion-${i}`, {
    titolo: 'Exclusive newsletter offer', corpo: 'Buy now. Unsubscribe.',
    autore: 'marketing@shop.example', quando: new Date(ora + i).toISOString()
  }))
  store.salvaDocumenti([direct, ...promotions])
  let candidati: { id: string }[] = []
  auto.perProva({ chiediJSON: async richiesta => {
    candidati = JSON.parse(richiesta.messages[0].content) as { id: string }[]
    return { righe: candidati.map(d => ({ doc: d.id, testo: 'Reply to Marta about the portal proposal' })) }
  } })
  assert.equal(await auto.fai(ricetta, { adesso: new Date(ora) }), 'fatta')
  assert.deepEqual(candidati.map(d => d.id), ['valid-personal-request'])
  assert.deepEqual(store.elencoCompiti().map(c => c.doc), ['valid-personal-request'])
})

test('dismissing a request during model selection prevents late task creation', async () => {
  const d = mail('dismissed-during-selection')
  store.salvaDocumenti([d])
  auto.perProva({ chiediJSON: async () => {
    store.scriviCompito({ id: 'already-handled', testo: 'Portal proposal', ordine: 'a', doc: d.id })
    store.cambiaStatoCompito('already-handled', 'lasciato', 'This request is not relevant to my work.')
    return { righe: [{ doc: d.id, testo: 'Reply to Alex about the portal proposal' }] }
  } })
  assert.equal(await auto.fai(ricetta, { adesso: new Date(ora) }), 'niente')
  assert.equal(store.elencoCompiti().filter(c => c.origine === `auto:${ricetta.id}`).length, 0)
})
