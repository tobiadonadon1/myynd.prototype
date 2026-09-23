// Dove vanno i dati: la riga della richiesta all'amministratore, dai fatti.
//
// La richiesta la legge chi deve decidere se Myynd può leggere la posta di
// un'azienda. La riga su dove finiscono i dati si scrive da qui, e qui si
// prova che segue la configurazione vera: il modello che ragiona, se sta su
// questa macchina, e Jev.
//
//   node --test --disable-warning=ExperimentalWarning server/dove-vanno-i-dati.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-dati-'))
mkdirSync(join(CASA, '.myynd'), { recursive: true })
process.env.MYYND_DATI = join(CASA, '.myynd')
const prima = { anthropic: process.env.ANTHROPIC_API_KEY, typesafe: process.env.MYYND_TYPESAFE }
delete process.env.ANTHROPIC_API_KEY
delete process.env.MYYND_TYPESAFE

const cfg = await import('./config.ts')
const { doveVanno } = await import('./dove-vanno-i-dati.ts')

after(() => {
  if (prima.anthropic !== undefined) process.env.ANTHROPIC_API_KEY = prima.anthropic
  if (prima.typesafe !== undefined) process.env.MYYND_TYPESAFE = prima.typesafe
  rmSync(CASA, { recursive: true, force: true })
})

test('Claude con la chiave: i dati vanno ad Anthropic', () => {
  cfg.scrivi({ motore: 'claude', claude: { apiKey: 'sk-ant-finta' } } as never)
  assert.deepEqual(doveVanno(), { ospitato: false, modello: { chi: 'Anthropic (Claude)', locale: false }, jev: false })
})

test('OpenAI con la chiave: i dati vanno a OpenAI', () => {
  cfg.scrivi({ motore: 'openai', openai: { modello: 'gpt-5.4', chiave: 'sk-finta' } } as never)
  assert.deepEqual(doveVanno().modello, { chi: 'OpenAI', locale: false })
})

test('un modello su questa macchina: nessun fornitore li riceve', () => {
  cfg.scrivi({ motore: 'compatibile', compatibile: { url: 'http://127.0.0.1:11434/v1', modello: 'qwen2.5:14b', nome: 'Ollama' } } as never)
  assert.deepEqual(doveVanno().modello, { chi: '127.0.0.1', locale: true })
})

test('un fornitore compatibile fuori: si nomina il suo indirizzo', () => {
  cfg.scrivi({ motore: 'compatibile', compatibile: { url: 'https://api.groq.com/openai/v1', modello: 'llama', nome: 'Groq' } } as never)
  assert.deepEqual(doveVanno().modello, { chi: 'api.groq.com', locale: false })
})

test('con la chiave di TypeSafe, Jev riceve estratti, e si dice', () => {
  cfg.scrivi({ motore: 'claude', claude: { apiKey: 'sk-ant-finta' }, jev: { apiKey: 'apikey_finta' } } as never)
  assert.equal(doveVanno().jev, true)
})
