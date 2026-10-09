// Quanto costa la rassegna: i giornali ogni venti minuti, il modello al
// massimo ogni due ore, e i titoli nuovi tutti insieme in una chiamata sola,
// sul modello economico.
//
//   node --test server/rassegna-costo.test.ts

import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dati = mkdtempSync(join(tmpdir(), 'myynd-rassegna-costo-'))
const datiPrima = process.env.MYYND_DATI
process.env.MYYND_DATI = dati
delete process.env.ANTHROPIC_API_KEY
delete process.env.MYYND_TYPESAFE
const cfg = await import('./config.ts')
const store = await import('./store.ts')
const rassegna = await import('./rassegna.ts')
const fetchPrima = globalThis.fetch

after(() => {
  globalThis.fetch = fetchPrima
  if (datiPrima === undefined) delete process.env.MYYND_DATI
  else process.env.MYYND_DATI = datiPrima
  store.chiudiIndici()
  rmSync(dati, { recursive: true, force: true })
})

const faMinuti = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
const voce = (titolo: string, slug: string, minuti = 30) =>
  `<item><title>${titolo}</title><description></description><link>https://example.test/${slug}</link><pubDate>${faMinuti(minuti)}</pubDate></item>`
let giornale = ''
const pubblica = (xml: string) => { giornale = xml + giornale }

/** Le richieste arrivate ad Anthropic: il modello e il testo che gli si è mandato. */
const alModello: { model: string; testo: string }[] = []
globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
  const u = String(url instanceof Request ? url.url : url)
  if (u.includes('anthropic.com')) {
    const corpo = JSON.parse(String(init?.body)) as { model: string; messages: { content: string }[] }
    alModello.push({ model: corpo.model, testo: corpo.messages.map(m => m.content).join('\n') })
    return Response.json({
      id: 'msg', type: 'message', role: 'assistant', model: corpo.model, stop_reason: 'end_turn',
      content: [{ type: 'text', text: '{"scelte":[]}' }], usage: { input_tokens: 100, output_tokens: 10 }
    })
  }
  return new Response(u.includes('theverge') ? `<rss><channel>${giornale}</channel></rss>` : '<rss><channel></channel></rss>', { status: 200 })
}

const EDIZIONE = () => join(cfg.cartella(), 'rassegna-edizione.json')
const edizione = () => JSON.parse(readFileSync(EDIZIONE(), 'utf8')) as { valutate: string[]; controllata: string; modello?: string }
function invecchia(minuti: number, modelloOre?: number) {
  const e = edizione()
  e.controllata = faMinuti(minuti)
  if (modelloOre !== undefined) e.modello = faMinuti(modelloOre * 60)
  writeFileSync(EDIZIONE(), JSON.stringify(e))
}

test('i titoli nuovi aspettano le due ore e partono insieme, in una chiamata sola sul modello economico', async () => {
  cfg.scrivi({ lingua: 'en', claude: { apiKey: 'sk-ant-prova' } })
  pubblica(voce('Gemini gains a research mode for students', 'gemini', 50))
  await rassegna.aggiorna(true)
  assert.equal(alModello.length, 1, 'il primo giro chiede')
  assert.equal(alModello[0].model, 'claude-haiku-5-5', 'la rassegna è un lavoro di casa: il modello economico')
  assert.ok(edizione().modello, 'l’ora della chiamata si ricorda')

  // venti minuti dopo: due titoli nuovi, nessuna chiamata, e non si segnano come guardati
  pubblica(voce('DeepSeek publishes weights for its reasoning system', 'deepseek', 20) + voce('Mistral opens an office in Tokyo', 'mistral', 15))
  invecchia(21)
  await rassegna.aggiorna()
  assert.equal(alModello.length, 1, 'dentro le due ore il modello non si chiama')
  const ds = store.notizie().find(n => n.titolo.startsWith('DeepSeek'))
  assert.equal(ds, undefined, 'e i titoli nuovi non entrano senza essere scelti')
  assert.equal(edizione().valutate.length, 1, 'restano da guardare')

  // il bottone legge i giornali, non compra un'altra scelta
  await rassegna.aggiorna(true)
  assert.equal(alModello.length, 1)

  // un rilascio di un laboratorio non aspetta: entra con la regola, gratis
  pubblica(voce('OpenAI launches GPT-6 for developers', 'gpt6', 5))
  invecchia(21)
  const r = await rassegna.aggiorna()
  assert.equal(alModello.length, 1)
  assert.ok(r.notizie.some(n => n.titolo.startsWith('OpenAI launches')), 'il rilascio è nel mazzo senza chiamate')

  // passate le due ore: una chiamata sola, con tutti i titoli rimasti
  pubblica(voce('Llama licence changes for enterprise users', 'llama', 3))
  invecchia(21, 2.1)
  await rassegna.aggiorna()
  assert.equal(alModello.length, 2, 'una chiamata, non tre')
  for (const t of ['DeepSeek publishes', 'Mistral opens', 'Llama licence']) assert.match(alModello[1].testo, new RegExp(t))
  assert.ok(edizione().valutate.length >= 4, 'adesso sono stati guardati')
})

test('in un giorno di giornali ogni venti minuti il modello parte al massimo dodici volte', async () => {
  const prima = alModello.length
  for (let i = 0; i < 72; i++) {
    pubblica(voce(`Claude Code gets background agents ${i}`, `cc-${i}`, 1))
    // ogni giro è venti minuti dopo il precedente: anche l'ultima chiamata invecchia di venti
    const e = edizione()
    e.controllata = faMinuti(21)
    if (e.modello) e.modello = new Date(Date.parse(e.modello) - 20 * 60_000).toISOString()
    writeFileSync(EDIZIONE(), JSON.stringify(e))
    await rassegna.aggiorna()
  }
  const chiamate = alModello.length - prima
  assert.ok(chiamate <= 12, `${chiamate} chiamate in un giorno`)
  assert.ok(chiamate >= 11, `${chiamate}: ogni due ore una`)
})
