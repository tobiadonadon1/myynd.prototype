// Collegare Claude deve bastare a far ragionare Myynd.
//
// Con ChatGPT scelto come motore e poi spento in Myynd, il server non sa con
// chi ragionare: `collegato()` dice no. Collegare Claude con la chiave, o dire
// «usa il mio account», non toccava il motore, e la prima pagina continuava a
// dire «serve Claude» a chi Claude l'aveva appena collegato. Un motore che
// lavora invece non si tocca: collegare una seconda testa non è sceglierla.
//
//   node --test server/motore-dopo-claude.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-motore-claude-'))
process.env.MYYND_DATI = CASA
// una chiave nell'ambiente di chi fa girare le prove collegherebbe Claude da sola
delete process.env.ANTHROPIC_API_KEY

const cfg = await import('./config.ts')
const mod = await import('./modello.ts')

after(() => {
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

test('Claude collegato mentre il motore scelto è spento: diventa lui il motore', () => {
  cfg.scrivi({ motore: 'chatgpt', chatgpt: { attivo: false }, claude: { apiKey: 'sk-ant-prova' } } as never)
  assert.equal(mod.conClaude(), true)
  assert.equal(mod.collegato(), false, 'la premessa: ChatGPT scelto e spento, e nessuno ragiona')
  assert.equal(mod.scegliClaudeSeServe(), true)
  assert.equal(cfg.leggi().motore, 'claude')
  assert.equal(mod.collegato(), true, 'Claude è collegato e Myynd continua a non poter ragionare')
})

test('un motore che lavora non si tocca', () => {
  cfg.scrivi({
    motore: 'compatibile',
    compatibile: { url: 'http://127.0.0.1:11434/v1', modello: 'qwen3.5:9b' },
    claude: { apiKey: 'sk-ant-prova' }
  } as never)
  assert.equal(mod.collegato(), true)
  assert.equal(mod.scegliClaudeSeServe(), false)
  assert.equal(cfg.leggi().motore, 'compatibile', 'collegare Claude ha tolto di mezzo un motore che lavorava')
})

test('senza Claude collegato non si sceglie Claude', () => {
  // le credenziali sopravvivono alle scritture che non le tolgono apposta
  cfg.scrivi({ motore: 'chatgpt', chatgpt: { attivo: false } } as never, { togli: ['claude', 'claudeCon'] })
  assert.equal(mod.conClaude(), false)
  assert.equal(mod.scegliClaudeSeServe(), false)
  assert.equal(cfg.leggi().motore, 'chatgpt')
})

test('ogni strada che collega Claude passa dalla regola, e lo stato dice se si ragiona', () => {
  const indice = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
  const rotta = (inizio: string) => {
    const da = indice.indexOf(inizio)
    assert.ok(da >= 0, `manca la rotta ${inizio}`)
    return indice.slice(da, indice.indexOf('\napp.', da + 1))
  }
  for (const r of [
    "app.post('/api/connettori/claude',",
    "app.post('/api/connettori/claude/ambiente',",
    "app.post('/api/modello/claude-con',",
    "app.post('/api/modello/abbonamento',",
    "app.get('/api/modello/abbonamento/accesso/:id',"
  ]) assert.match(rotta(r), /mod\.scegliClaudeSeServe\(\)/, `${r} collega Claude senza guardare il motore`)
  assert.match(rotta("app.get('/api/stato',"), /const ragiona = mod\.collegato\(\)[\s\S]*\n\s+ragiona,/,
    'la pagina deve leggere «può ragionare» dal server, non rifarlo da sé')
})

/*
 * Il 2 ottobre 2026 Claude Code è uscito, `riparaIlMotore` ha messo al lavoro
 * Ollama (scritto da settembre, spento), e quando Claude è tornato il motore è
 * rimasto quello: una settimana senza un punto, una notizia, una carta.
 */
test('il motore scelto da Myynd al posto di Claude torna a Claude quando Claude torna', () => {
  // Claude se n'è andato: lavora il modello sul computer, e si ricorda da dove si veniva
  cfg.scrivi({
    motore: 'claude',
    compatibile: { url: 'http://127.0.0.1:11434/v1', modello: 'qwen3.5:9b' }
  } as never, { togli: ['claude', 'claudeCon', 'motorePrima'] })
  assert.equal(mod.collegato(), false)
  assert.equal(mod.riparaIlMotore(), true)
  assert.equal(cfg.leggi().motore, 'compatibile')
  assert.equal(cfg.leggi().motorePrima, 'claude')
  // Claude non c'è ancora: si resta dove si è
  assert.equal(mod.riparaIlMotore(), false)
  assert.equal(cfg.leggi().motore, 'compatibile')
  // Claude è tornato: si torna lì, e il ricordo se ne va
  cfg.aggiorna({ claude: { apiKey: 'sk-ant-prova' } } as never)
  assert.equal(mod.riparaIlMotore(), true)
  assert.equal(cfg.leggi().motore, 'claude')
  assert.equal(cfg.leggi().motorePrima, undefined)
  assert.equal(mod.riparaIlMotore(), false, 'una volta tornato, non si cambia più niente')
})

test('un motore scelto da lei non torna indietro da solo', () => {
  cfg.scrivi({
    motore: 'compatibile',
    compatibile: { url: 'http://127.0.0.1:11434/v1', modello: 'qwen3.5:9b' },
    claude: { apiKey: 'sk-ant-prova' }
  } as never, { togli: ['motorePrima'] })
  assert.equal(mod.riparaIlMotore(), false)
  assert.equal(cfg.leggi().motore, 'compatibile')
})
