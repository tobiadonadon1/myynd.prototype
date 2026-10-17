// La quota del mese: prenotare, conciliare, rilasciare, fermare il fondo,
// lasciare passare la chat, e non mettere un tetto a chi paga da sé.
//
//   node --import ./build/test-profile.mjs --test server/quota-mese.test.ts

import { after, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'

delete process.env.ANTHROPIC_API_KEY
const cfg = await import('./config.ts')
const store = await import('./store.ts')
const quota = await import('./quota-mese.ts')
const mod = await import('./modello.ts')
const budgetNotte = await import('./budget-notte.ts')
const tetto = await import('./tetto.ts')

const fetchPrima = globalThis.fetch
/** Le chiamate arrivate ad Anthropic, e quanto deve aspettare la risposta finta. */
const chiamate: { model: string }[] = []
let attesa = 0
let rispondeMale = false
globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
  const u = String(url instanceof Request ? url.url : url)
  if (!u.includes('anthropic.com')) return new Response('no', { status: 404 })
  const corpo = JSON.parse(String(init?.body)) as { model: string }
  chiamate.push({ model: corpo.model })
  if (attesa) await new Promise(r => setTimeout(r, attesa))
  if (rispondeMale) return Response.json({ type: 'error', error: { type: 'api_error', message: 'boom' } }, { status: 500 })
  return Response.json({
    id: 'msg', type: 'message', role: 'assistant', model: corpo.model, stop_reason: 'end_turn',
    content: [{ type: 'text', text: '{"ok":true}' }], usage: { input_tokens: 1000, output_tokens: 100 }
  })
}
after(() => { globalThis.fetch = fetchPrima; store.chiudiIndici() })

beforeEach(() => {
  store.default.exec('DELETE FROM uso')
  quota.perProva()
  chiamate.length = 0
  attesa = 0
  rispondeMale = false
  delete process.env.ANTHROPIC_API_KEY
})

const spendi = (dollari: number) => store.segnaUso({ lavoro: 'bozza', motore: 'claude-sonnet-5-5', entrata: Math.round(dollari * 500_000), cache: 0, uscita: 0, modello: 'claude-sonnet-5-5' })
const domanda = () => mod.chiediJSON<{ ok: boolean }>({ lavoro: 'cernita', system: 's', messages: [{ role: 'user', content: 'x' }], max_tokens: 200, formato: { type: 'object' } })

test('chi paga decide la quota di serie: tre dollari se paga Myynd, nessuna sul suo account o la sua chiave; scritta, vince', () => {
  cfg.scrivi({ lingua: 'en', claude: { apiKey: 'sk-ant-sua' } })
  assert.equal(quota.pagataDaMyynd(), false)
  assert.equal(quota.limite(), 0, 'la sua chiave: nessuna quota di serie')
  process.env.ANTHROPIC_API_KEY = 'sk-ant-della-casa'
  cfg.scrivi({ lingua: 'en' }, { togli: ['claude'] })
  assert.equal(quota.pagataDaMyynd(), true, 'la chiave della casa, senza una sua: paga Myynd')
  assert.equal(quota.limite(), 3_000_000)
  cfg.scrivi({ lingua: 'en', motore: 'compatibile', compatibile: { url: 'http://127.0.0.1:11434/v1', modello: 'qwen' } } as never)
  assert.equal(quota.limite(), 0, 'un modello sul suo computer: nessuna quota')
  cfg.scrivi({ lingua: 'en', claude: { apiKey: 'sk-ant-sua' }, quota: 5 })
  assert.equal(quota.limite(), 5_000_000, 'quella scritta vince')
  cfg.scrivi({ lingua: 'en', quota: 0 }, { togli: ['claude'] })
  assert.equal(quota.limite(), 0, 'zero: nessuna')
})

test('prenotare: due chiamate di fondo insieme non sforano in due; conciliare lascia la spesa vera; rilasciare la toglie', async () => {
  cfg.scrivi({ lingua: 'en', claude: { apiKey: 'sk-ant-sua' }, quota: 1 })
  const a = quota.riserva('cernita', 600_000)
  assert.ok(a)
  assert.equal(quota.stato().riservato, 600_000)
  assert.throws(() => quota.riserva('cernita', 600_000), (e: unknown) => quota.dellaQuota(e) && tetto.delTetto(e), 'la seconda non ci sta')
  spendi(0.2)
  const c = quota.concilia(a)
  assert.equal(c?.stima, 600_000)
  assert.equal(c?.vera, 200_000, 'la vera è quella del registro')
  assert.equal(quota.stato().riservato, 0)
  assert.equal(quota.stato().speso, 200_000)
  const b = quota.riserva('cernita', 700_000)
  quota.rilascia(b)
  assert.equal(quota.stato().riservato, 0)
  await assert.rejects(quota.conRiserva('cernita', 100_000, async () => { throw new Error('rete giù') }), /rete giù/)
  assert.equal(quota.stato().riservato, 0, 'un fallimento non lascia prenotazioni appese')
  assert.equal(quota.stato().speso, 200_000, 'e non costa niente')
})

test('una chiamata vera: prenotata mentre gira, conciliata col registro dopo, rilasciata se fallisce', async () => {
  cfg.scrivi({ lingua: 'en', claude: { apiKey: 'sk-ant-sua' }, quota: 1 })
  attesa = 80
  const p = domanda()
  await new Promise(r => setTimeout(r, 30))
  assert.ok(quota.stato().riservato > 0, 'mentre gira, la chiamata è prenotata')
  assert.deepEqual(await p, { ok: true })
  assert.equal(quota.stato().riservato, 0)
  // Sonnet (media) 1000 entrata + 100 uscita: 2000 + 1000 micro-dollari
  assert.equal(quota.stato().speso, 3000)
  rispondeMale = true
  attesa = 0
  assert.equal(await domanda(), null)
  assert.equal(quota.stato().riservato, 0, 'il guasto rilascia')
})

test('quota finita: il fondo si ferma prima di chiamare, la chat no, e oltre una volta e mezza la chat va sull’economico', async () => {
  cfg.scrivi({ lingua: 'en', claude: { apiKey: 'sk-ant-sua' }, quota: 1 })
  spendi(1)
  assert.equal(quota.stato().finita, true)
  assert.equal(await domanda(), null, 'il lavoro di fondo torna «niente»')
  assert.equal(chiamate.length, 0, 'senza nemmeno una chiamata')
  assert.throws(() => tetto.controllaIlTetto(), (e: unknown) => (e as Error).message === quota.MESE_FINITO)
  assert.ok(tetto.delBudget(new Error(quota.MESE_FINITO)), 'una carta del turno torna in coda')
  // chi guarda passa sempre
  const r = await quota.conChiGuarda(() => domanda())
  assert.deepEqual(r, { ok: true })
  assert.equal(chiamate.length, 1)
  assert.equal(mod.modelloPer('risposta'), 'claude-sonnet-5-5', 'fino a una volta e mezza la chat resta sul suo modello')
  spendi(0.5)
  assert.equal(quota.stato().oltre, true)
  assert.equal(mod.modelloPer('risposta'), 'claude-haiku-5-5', 'oltre, la chat passa all’economico')
  assert.equal(mod.modelloPer('bozza'), 'claude-sonnet-5-5', 'gli altri lavori non cambiano modello: si fermano e basta')
})

test('sul suo account o con la sua chiave non c’è tetto, ma si conta lo stesso', async () => {
  cfg.scrivi({ lingua: 'en', claude: { apiKey: 'sk-ant-sua' } })
  spendi(50)
  assert.equal(quota.stato().finita, false)
  assert.equal(quota.stato().resto, null)
  assert.deepEqual(await domanda(), { ok: true }, 'il fondo lavora')
  assert.ok(quota.stato().speso > 50_000_000, 'e la spesa si conta')
  assert.equal(quota.riserva('cernita', 10_000_000), null, 'niente da prenotare')
})

test('il budget di una notte è il più basso fra quello scelto e quello che resta del mese', () => {
  cfg.scrivi({ lingua: 'en', claude: { apiKey: 'sk-ant-sua' }, quota: 3, turno: { budget: 3 } })
  spendi(2.5)
  const b = budgetNotte.stato()
  assert.equal(b.dalMese, true)
  assert.ok(Math.abs(b.limite - 0.5) < 1e-9, `limite ${b.limite}`)
  cfg.scrivi({ lingua: 'en', claude: { apiKey: 'sk-ant-sua' }, quota: 100, turno: { budget: 3 } })
  assert.equal(budgetNotte.stato().limite, 3, 'con tanto mese davanti vale quello della notte')
  cfg.scrivi({ lingua: 'en', claude: { apiKey: 'sk-ant-sua' }, turno: { budget: 3 } })
  assert.equal(budgetNotte.stato().limite, 3, 'senza quota, quello della notte')
  cfg.scrivi({ lingua: 'en', claude: { apiKey: 'sk-ant-sua' }, quota: 2, turno: { budget: 3 } })
  assert.equal(budgetNotte.stato().finito, true, 'il mese finito chiude anche la notte')
})

test('la rassegna sta sempre sul modello più economico, anche col livello di casa alzato', () => {
  cfg.scrivi({ lingua: 'en', claude: { apiKey: 'sk-ant-sua' }, modelli: { casa: 'claude-sonnet-5-5' } } as never)
  assert.equal(mod.modelloPer('titolo'), 'claude-sonnet-5-5')
  assert.equal(mod.modelloPer('rassegna'), 'claude-haiku-5-5')
})
