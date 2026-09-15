// Un modello per livello di lavoro, e la scheda di OpenAI con la chiave.
//
// Prima il modello era uno per tutto, e le manovre interne scendevano
// all'economico per una regola scritta nel codice. Adesso la persona sceglie
// un modello per ciascuno dei tre livelli nelle preferenze, e la regola di
// prima è solo il valore che vale finché non sceglie. La prova è che: senza
// scelte non cambia niente (`livelli.test.ts` lo pretende già), con una
// scelta il lavoro di quel livello la segue, e le altre no.
//
//   node --test server/gamma-modelli.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-gamma-'))
process.env.MYYND_DATI = CASA
delete process.env.ANTHROPIC_API_KEY

const cfg = await import('./config.ts')
const mod = await import('./modello.ts')
after(() => rmSync(CASA, { recursive: true, force: true }))

test('senza scelte per livello vale la regola di sempre', () => {
  cfg.scrivi({ modello: 'claude-opus-5' })
  assert.deepEqual(cfg.modelliPerLivello(), { casa: 'claude-haiku-4-5', media: 'claude-opus-5', frontiera: 'claude-opus-5' })
  assert.equal(mod.modelloPer('titolo'), 'claude-haiku-4-5')
  assert.equal(mod.modelloPer('lettura'), 'claude-opus-5')
  assert.equal(mod.modelloPer('bozza'), 'claude-opus-5')
})

test('una scelta per livello la segue solo quel livello', () => {
  cfg.scrivi({ modello: 'claude-sonnet-5', modelli: { casa: 'claude-sonnet-5', media: 'claude-haiku-4-5', frontiera: 'claude-opus-5' } })
  assert.equal(mod.modelloPer('titolo'), 'claude-sonnet-5', 'le manovre interne seguono la scelta di «casa»')
  assert.equal(mod.modelloPer('lettura'), 'claude-haiku-4-5', 'le letture seguono la scelta di «media»')
  assert.equal(mod.modelloPer('cernita'), 'claude-haiku-4-5')
  assert.equal(mod.modelloPer('risposta'), 'claude-opus-5', 'la frontiera segue la sua')
  assert.equal(mod.modelloPer('email'), 'claude-opus-5')
  // il modello «principale» è quello della frontiera, anche se il campo vecchio dice altro
  assert.equal(cfg.modello(), 'claude-opus-5')
  // e un lavoro che non conosciamo è di frontiera: non si risparmia per sbaglio
  assert.equal(mod.modelloPer('non-esiste'), 'claude-opus-5')
})

test('un livello scelto a metà: gli altri tengono la regola di sempre', () => {
  cfg.scrivi({ modello: 'claude-sonnet-5', modelli: { media: 'claude-opus-5' } })
  assert.deepEqual(cfg.modelliPerLivello(), { casa: 'claude-haiku-4-5', media: 'claude-opus-5', frontiera: 'claude-sonnet-5' })
})

test('un nome di modello che non conosciamo non passa', () => {
  cfg.scrivi({ modello: 'claude-sonnet-5', modelli: { casa: 'gpt-9', media: 'claude-opus-5', frontiera: 'boh' } })
  assert.deepEqual(cfg.modelliPerLivello(), { casa: 'claude-haiku-4-5', media: 'claude-opus-5', frontiera: 'claude-sonnet-5' })
})

test('i parametri di ogni lavoro portano il modello del suo livello', () => {
  cfg.scrivi({ modello: 'claude-sonnet-5', modelli: { casa: 'claude-haiku-4-5', media: 'claude-sonnet-5', frontiera: 'claude-opus-5' } })
  assert.equal((mod.parametri('titolo', 400) as Record<string, unknown>).model, 'claude-haiku-4-5')
  assert.equal((mod.parametri('lettura', 8000) as Record<string, unknown>).model, 'claude-sonnet-5')
  const p = mod.parametri('risposta', 8000) as Record<string, unknown>
  assert.equal(p.model, 'claude-opus-5')
  // Opus ragiona: il livello nuovo non deve avergli tolto il pensiero per strada
  assert.deepEqual(p.thinking, { type: 'adaptive' })
})

test('la configurazione pubblica porta la terna, senza segreti', () => {
  cfg.scrivi({ modello: 'claude-sonnet-5', modelli: { casa: 'claude-haiku-4-5', media: 'claude-sonnet-5', frontiera: 'claude-opus-5' }, openai: { modello: 'gpt-5.4', chiave: 'sk-test-openai' } })
  const p = cfg.pubblica() as Record<string, unknown>
  assert.deepEqual(p.modelli, { casa: 'claude-haiku-4-5', media: 'claude-sonnet-5', frontiera: 'claude-opus-5' })
  assert.equal(p.modello, 'claude-opus-5')
  assert.deepEqual(p.openai, { collegato: true, modello: 'gpt-5.4', chiaveSalvata: true, modelli: { casa: 'gpt-5.4', media: 'gpt-5.4', frontiera: 'gpt-5.4' } })
  assert.ok(!JSON.stringify(p).includes('sk-test-openai'), 'la chiave di OpenAI non esce dalla configurazione pubblica')
})

test('OpenAI con la chiave è un fornitore compatibile con l’indirizzo fisso, e solo se scelto', () => {
  cfg.scrivi({ openai: { modello: 'gpt-5.4', chiave: 'sk-test-openai' }, motore: 'openai' })
  assert.deepEqual(mod.fornitoreOpenAI(), { url: 'https://api.openai.com/v1', chiave: 'sk-test-openai', modello: 'gpt-5.4', nome: 'OpenAI', perLivello: true })
  assert.equal(mod.collegato(), true, 'con OpenAI scelto Myynd può ragionare')
  const m = mod.motore()
  assert.equal(m?.tipo, 'compatibile')
  assert.equal(m?.nome, 'OpenAI')
  assert.equal((cfg.pubblica() as Record<string, unknown>).motore, 'openai')

  // senza chiave non c'è niente da chiamare: come una scelta rimasta nel file
  cfg.scrivi({ openai: { modello: 'gpt-5.4' }, motore: 'openai' }, { togli: ['openai'] })
  assert.equal(mod.fornitoreOpenAI(), null)
  assert.equal(mod.collegato(), false)
  assert.equal((cfg.pubblica() as Record<string, unknown>).motore, 'claude', 'una scelta senza fornitore dietro torna a Claude')
})

test('la chiave di OpenAI si conserva quando una scrittura non ce l’ha in mano', () => {
  cfg.scrivi({ openai: { modello: 'gpt-5.4', chiave: 'sk-test-openai' }, motore: 'openai' })
  cfg.aggiorna({ openai: { modello: 'gpt-5.4-mini' } })
  assert.equal(cfg.leggi().openai?.chiave, 'sk-test-openai')
  assert.equal(cfg.leggi().openai?.modello, 'gpt-5.4-mini')
  // e sparisce solo quando lo si dice
  const c = cfg.leggi(); delete c.openai
  cfg.scrivi(c, { togli: ['openai'] })
  assert.equal(cfg.leggi().openai, undefined)
})

test('con OpenAI al lavoro ogni richiesta porta il modello di OpenAI del suo livello', async () => {
  const compatibile = await import('./compatibile.ts')
  cfg.scrivi({ openai: { modello: 'gpt-5.4', chiave: 'sk-test-openai', modelli: { casa: 'gpt-5.4-mini', frontiera: 'gpt-5.4-pro' } }, motore: 'openai' })
  assert.equal((mod.parametri('titolo', 400) as Record<string, unknown>).model, 'gpt-5.4-mini')
  // un livello senza scelta usa il modello della scheda
  assert.equal((mod.parametri('lettura', 8000) as Record<string, unknown>).model, 'gpt-5.4')
  assert.equal((mod.parametri('risposta', 8000) as Record<string, unknown>).model, 'gpt-5.4-pro')
  const f = mod.fornitoreOpenAI()!
  const corpo = compatibile.corpo(f, { ...mod.parametri('risposta', 8000), messages: [{ role: 'user', content: 'ciao' }] } as never, false)
  assert.equal(corpo.model, 'gpt-5.4-pro', 'il corpo della richiesta porta il modello del livello, non quello della scheda')
  assert.deepEqual((cfg.pubblica() as unknown as Record<string, Record<string, unknown>>).openai.modelli, { casa: 'gpt-5.4-mini', media: 'gpt-5.4', frontiera: 'gpt-5.4-pro' })

  // con Claude al lavoro i parametri restano quelli di Claude
  cfg.scrivi({ openai: { modello: 'gpt-5.4', chiave: 'sk-test-openai', modelli: { casa: 'gpt-5.4-mini' } }, motore: 'claude', modello: 'claude-sonnet-5' })
  assert.equal((mod.parametri('titolo', 400) as Record<string, unknown>).model, 'claude-haiku-4-5')
  // e un fornitore compatibile qualunque tiene il suo modello, qualunque cosa dica la richiesta
  const generico = { url: 'http://127.0.0.1:11434/v1', modello: 'qwen3.5:9b' }
  assert.equal(compatibile.corpo(generico, { model: 'claude-sonnet-5', max_tokens: 10, messages: [{ role: 'user', content: 'ciao' }] } as never, false).model, 'qwen3.5:9b')
})
