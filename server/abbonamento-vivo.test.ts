// Il giro con gli attrezzi sull'account che si pianta (19 ott 2026).
//
// «it always takes forever to finish even one single task»: tre `claude -p`
// della bozza su sette non rispondevano mai, e Myynd aspettava i cinque minuti
// interi prima di saperlo. Qui `claude` è un node finto che fa una cosa per
// partenza: si pianta prima che l'API cominci, si pianta dopo, risponde piano
// ma risponde, o risponde e non chiude lo stdout.
//
//   node --test server/abbonamento-vivo.test.ts

import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Anthropic from '@anthropic-ai/sdk'

const dati = mkdtempSync(join(tmpdir(), 'myynd-abbonamento-vivo-'))
process.env.MYYND_DATI = dati
delete process.env.ANTHROPIC_API_KEY
const cfg = await import('./config.ts')
const abbonamento = await import('./abbonamento.ts')
const compiti = await import('./compiti.ts')
after(() => { abbonamento.perProva(null); rmSync(dati, { recursive: true, force: true }) })

const BUSTA = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: JSON.stringify({ text: 'Here is the checklist.', calls: [] }), usage: { input_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 20 } })
const INIT = JSON.stringify({ type: 'system', subtype: 'init' })
const EVENTO = JSON.stringify({ type: 'stream_event', event: { type: 'message_start' } })
const PEZZO = JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '{"text":' } } })

/** Cosa fa il `claude` finto, partenza per partenza. */
const COMPORTAMENTI: Record<string, string> = {
  // l'API non comincia mai: solo la riga di Claude Code, poi niente
  appeso: `console.log(${JSON.stringify(INIT)}); setInterval(() => {}, 1000)`,
  // l'API comincia, poi tace per sempre
  muto: `console.log(${JSON.stringify(INIT)}); console.log(${JSON.stringify(EVENTO)}); setInterval(() => {}, 1000)`,
  // risponde piano ma senza mai tacere troppo: non si tocca
  lento: `console.log(${JSON.stringify(INIT)}); let n = 0; const t = setInterval(() => { console.log(n === 0 ? ${JSON.stringify(EVENTO)} : ${JSON.stringify(PEZZO)}); if (++n === 8) { clearInterval(t); console.log(${JSON.stringify(BUSTA)}) } }, 150)`,
  buono: `console.log(${JSON.stringify(INIT)}); console.log(${JSON.stringify(EVENTO)}); console.log(${JSON.stringify(BUSTA)})`,
  // la busta arriva, ma qualcosa tiene aperto lo stdout
  aperto: `console.log(${JSON.stringify(INIT)}); console.log(${JSON.stringify(EVENTO)}); console.log(${JSON.stringify(BUSTA)}); setInterval(() => {}, 1000)`
}

let partenze: string[] = []
let argomenti: string[][] = []
function finto(...copione: string[]) {
  partenze = []; argomenti = []
  abbonamento.perProva({
    installato: () => '/opt/finto/claude',
    tempi: { primo: 400, silenzio: 400 },
    spawn: ((_exe: string, args: string[], o: Record<string, unknown>) => {
      const cosa = copione[partenze.length] ?? 'buono'
      partenze.push(cosa)
      argomenti.push(args)
      return spawn(process.execPath, ['-e', `process.stdin.resume(); ${COMPORTAMENTI[cosa]}`], o as never)
    }) as never
  })
}

const CERCA_WEB: Anthropic.Tool = { name: 'cerca_web', description: 'Search the web.', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } }
const richiesta = (): Anthropic.MessageCreateParamsNonStreaming => ({
  model: 'claude-sonnet-5', max_tokens: 16000, system: 'Svolgi il compito.',
  messages: [{ role: 'user', content: 'Write a short checklist.' }], tools: [CERCA_WEB]
})
const testo = (m: Anthropic.Message) => m.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('')

beforeEach(() => { cfg.scrivi({ lingua: 'en', claudeCon: 'abbonamento', tetto: 0 }) })

test('il giro con gli attrezzi passa da stream-json, e la busta si legge uguale', async () => {
  finto('buono')
  const m = await abbonamento.motore().crea(richiesta())
  assert.equal(testo(m), 'Here is the checklist.')
  const a = argomenti[0]
  assert.equal(a[a.indexOf('--output-format') + 1], 'stream-json')
  assert.ok(a.includes('--include-partial-messages') && a.includes('--verbose'), 'senza i due, stream-json non manda i pezzi')
  assert.ok(a.includes('--restricted') && a.includes('--strict-mcp-config'), 'il recinto è lo stesso')
})

test('l\'API che non comincia: si rilancia subito, senza aspettare i cinque minuti', async () => {
  finto('appeso', 'buono')
  const prima = Date.now()
  const m = await abbonamento.motore().crea(richiesta(), 300_000)
  assert.equal(testo(m), 'Here is the checklist.')
  assert.deepEqual(partenze, ['appeso', 'buono'])
  assert.ok(Date.now() - prima < 3_000, `ci ha messo ${Date.now() - prima} ms`)
})

test('l\'API che comincia e poi tace: si rilancia anche lei', async () => {
  finto('muto', 'buono')
  const m = await abbonamento.motore().crea(richiesta(), 300_000)
  assert.equal(testo(m), 'Here is the checklist.')
  assert.deepEqual(partenze, ['muto', 'buono'])
})

test('una risposta lenta che arriva bene non si taglia', async () => {
  // otto pezzi a 150 ms: più del primo segno e del silenzio messi insieme, mai un buco più lungo
  finto('lento')
  const m = await abbonamento.motore().crea(richiesta(), 300_000)
  assert.equal(testo(m), 'Here is the checklist.')
  assert.deepEqual(partenze, ['lento'])
})

test('piantato due volte: il guaio di sempre, che compiti.ts riprova subito', async () => {
  finto('appeso', 'appeso', 'buono')
  await assert.rejects(abbonamento.motore().crea(richiesta(), 300_000), (e: Error) => {
    assert.equal(e.message, 'Claude Code ci ha messo troppo.')
    return true
  })
  assert.deepEqual(partenze, ['appeso', 'appeso'], 'una rilancio sola, poi decide chi chiama')
})

test('la busta arrivata vale anche se lo stdout resta aperto', async () => {
  finto('aperto')
  const prima = Date.now()
  const m = await abbonamento.motore().crea(richiesta(), 300_000)
  assert.equal(testo(m), 'Here is the checklist.')
  assert.ok(Date.now() - prima < 5_000, `ci ha messo ${Date.now() - prima} ms`)
})

test('«Stop now» ferma anche il giro in stream-json', async () => {
  finto('appeso')
  abbonamento.perProva({ installato: () => '/opt/finto/claude', tempi: { primo: 60_000, silenzio: 60_000 }, spawn: ((_e: string, _a: string[], o: Record<string, unknown>) => spawn(process.execPath, ['-e', `process.stdin.resume(); ${COMPORTAMENTI.appeso}`], o as never)) as never })
  const c = new AbortController()
  const lavoro = abbonamento.motore().flusso(richiesta() as unknown as Anthropic.MessageStreamParams, () => {}, 300_000, c.signal)
  await new Promise(r => setTimeout(r, 200))
  const prima = Date.now()
  c.abort()
  await assert.rejects(lavoro)
  assert.ok(Date.now() - prima < 1_000)
})

test('i guai passeggeri: il tempo scaduto si riprova subito, lo sforzo e la rete fra due minuti', () => {
  assert.equal(compiti.riprovaFra('Claude Code ci ha messo troppo.'), 5_000)
  // la chiave e il locale aspettano ancora: un locale lento sotto sforzo non si martella ogni cinque secondi
  assert.equal(compiti.riprovaFra('Ci ha messo troppo e ho lasciato perdere. Riprova.'), 120_000)
  assert.equal(compiti.riprovaFra('Il modello è sotto sforzo.'), 120_000)
  assert.equal(compiti.riprovaFra('Non riesco a raggiungere il fornitore.'), 120_000)
})
