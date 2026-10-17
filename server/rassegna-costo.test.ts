// Quanto costa la rassegna: i giornali ogni venti minuti, il modello al
// massimo quattro volte al giorno (la mattina per prima), e i titoli nuovi
// tutti insieme in una chiamata sola, sul modello economico.
//
// Prima: dodici chiamate in un giorno (una ogni due ore, più la seconda per
// la lingua quando scattava). Misurato sul suo Mac: 80 chiamate su 230 in una
// settimana. Adesso: quattro.
//
//   node --test server/rassegna-costo.test.ts

import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
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
const orologioPrima = rassegna.orologio.adesso

after(() => {
  globalThis.fetch = fetchPrima
  rassegna.orologio.adesso = orologioPrima
  if (datiPrima === undefined) delete process.env.MYYND_DATI
  else process.env.MYYND_DATI = datiPrima
  store.chiudiIndici()
  rmSync(dati, { recursive: true, force: true })
})

/** L'orologio finto della rassegna, in UTC (il fuso scelto per la prova). */
let ora = Date.UTC(2026, 9, 19, 6, 30)
rassegna.orologio.adesso = () => ora
const alle = (h: number, m = 0) => { ora = Date.UTC(2026, 9, 19, h, m) }
const avanti = (minuti: number) => { ora += minuti * 60_000 }

// i giornali si datano sull'orologio vero: la freschezza la guarda `cernita`
const faMinuti = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
const voce = (titolo: string, slug: string, minuti = 30) =>
  `<item><title>${titolo}</title><description></description><link>https://example.test/${slug}</link><pubDate>${faMinuti(minuti)}</pubDate></item>`
let giornale = ''
const pubblica = (xml: string) => { giornale = xml + giornale }

/** Il modello finto che conta: ogni richiesta arrivata ad Anthropic, con l'ora dell'orologio della rassegna. */
const alModello: { model: string; testo: string; alle: number }[] = []
globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
  const u = String(url instanceof Request ? url.url : url)
  if (u.includes('anthropic.com')) {
    const corpo = JSON.parse(String(init?.body)) as { model: string; messages: { content: string }[] }
    alModello.push({ model: corpo.model, testo: corpo.messages.map(m => m.content).join('\n'), alle: ora })
    return Response.json({
      id: 'msg', type: 'message', role: 'assistant', model: corpo.model, stop_reason: 'end_turn',
      content: [{ type: 'text', text: '{"scelte":[]}' }], usage: { input_tokens: 100, output_tokens: 10 }
    })
  }
  return new Response(u.includes('theverge') ? `<rss><channel>${giornale}</channel></rss>` : '<rss><channel></channel></rss>', { status: 200 })
}

const EDIZIONE = () => join(cfg.cartella(), 'rassegna-edizione.json')
const edizione = () => JSON.parse(readFileSync(EDIZIONE(), 'utf8')) as { valutate: string[]; controllata: string; modello?: string; chiamate?: string[] }

test('i titoli nuovi aspettano il giro dopo e partono insieme, in una chiamata sola sul modello economico', async () => {
  cfg.scrivi({ lingua: 'en', fuso: 'UTC', claude: { apiKey: 'sk-ant-prova' } })
  alle(6, 30)
  pubblica(voce('Gemini gains a research mode for students', 'gemini', 50))
  await rassegna.aggiorna(true)
  assert.equal(alModello.length, 1, 'il primo giro della mattina chiede')
  assert.equal(alModello[0].model, 'claude-haiku-5-5', 'la rassegna sta sul modello più economico')
  assert.deepEqual(edizione().chiamate, [new Date(ora).toISOString()], 'l’ora della chiamata si ricorda')

  // venti minuti dopo: due titoli nuovi, nessuna chiamata, e non si segnano come guardati
  pubblica(voce('DeepSeek publishes weights for its reasoning system', 'deepseek', 20) + voce('Mistral opens an office in Tokyo', 'mistral', 15))
  avanti(21)
  await rassegna.aggiorna()
  assert.equal(alModello.length, 1, 'dentro le quattro ore il modello non si chiama')
  assert.equal(store.notizie().find(n => n.titolo.startsWith('DeepSeek')), undefined, 'e i titoli nuovi non entrano senza essere scelti')
  assert.equal(edizione().valutate.length, 1, 'restano da guardare')

  // il bottone legge i giornali, non compra un'altra scelta
  await rassegna.aggiorna(true)
  assert.equal(alModello.length, 1)

  // un rilascio di un laboratorio non aspetta: entra con la regola, gratis
  pubblica(voce('OpenAI launches GPT-6 for developers', 'gpt6', 5))
  avanti(21)
  const r = await rassegna.aggiorna()
  assert.equal(alModello.length, 1)
  assert.ok(r.notizie.some(n => n.titolo.startsWith('OpenAI launches')), 'il rilascio è nel mazzo senza chiamate')

  // passate le quattro ore: una chiamata sola, con tutti i titoli rimasti
  pubblica(voce('Llama licence changes for enterprise users', 'llama', 3))
  alle(10, 31)
  await rassegna.aggiorna()
  assert.equal(alModello.length, 2, 'una chiamata, non tre')
  for (const t of ['DeepSeek publishes', 'Mistral opens', 'Llama licence']) assert.match(alModello[1].testo, new RegExp(t))
  assert.ok(edizione().valutate.length >= 4, 'adesso sono stati guardati')
})

test('un giorno intero di giornali ogni venti minuti: il modello parte quattro volte, e la prima è la mattina', async () => {
  // il giorno dopo, da mezzanotte: un titolo nuovo a ogni giro
  ora = Date.UTC(2026, 9, 20, 0, 0)
  const prima = alModello.length
  for (let i = 0; i < 72; i++) {
    pubblica(voce(`Claude Code gets background agents ${i}`, `cc-${i}`, 1))
    await rassegna.aggiorna()
    avanti(20)
  }
  const oggi = alModello.slice(prima)
  assert.equal(oggi.length, 4, `${oggi.length} chiamate in un giorno (prima erano dodici)`)
  const ore = oggi.map(c => new Date(c.alle).getUTCHours())
  assert.ok(ore[0] >= rassegna.ORA_MATTINA, `la prima alle ${ore[0]}: prima delle sei i titoli aspettano`)
  for (let i = 1; i < ore.length; i++) assert.ok(oggi[i].alle - oggi[i - 1].alle >= rassegna.ORE_MODELLO * 3_600_000, 'quattro ore fra un giro e l’altro')
  assert.ok(oggi.every(c => c.model === 'claude-haiku-5-5'))
  // e ognuna con i titoli nuovi del suo giro (fino al tetto per giornale di `cernita`)
  assert.match(oggi[0].testo, /background agents 18\b/, 'i titoli della notte partono tutti insieme la mattina')
})

test('il conto dei giri: la mattina per prima, quattro al giorno, quattro ore fra uno e l’altro', () => {
  const t = (h: number, m = 0, giorno = 21) => Date.UTC(2026, 9, giorno, h, m)
  const iso = (x: number) => new Date(x).toISOString()
  assert.equal(rassegna.modelloDaChiamare([], t(5, 59), 'UTC'), false, 'prima delle sei no')
  assert.equal(rassegna.modelloDaChiamare([], t(6, 0), 'UTC'), true)
  assert.equal(rassegna.modelloDaChiamare([iso(t(6))], t(9, 59), 'UTC'), false)
  assert.equal(rassegna.modelloDaChiamare([iso(t(6))], t(10), 'UTC'), true)
  assert.equal(rassegna.modelloDaChiamare([iso(t(6)), iso(t(10)), iso(t(14)), iso(t(18))], t(22, 30), 'UTC'), false, 'la quinta no')
  assert.equal(rassegna.modelloDaChiamare([iso(t(18, 0, 20)), iso(t(22, 30, 20))], t(6, 0), 'UTC'), true, 'il giorno nuovo riparte')
  // il giorno è quello di chi legge: le sei di Roma sono le quattro in UTC
  assert.equal(rassegna.modelloDaChiamare([], t(4, 30), 'Europe/Rome'), true)
})

test('un rilascio entrato gratis mentre il modello aspetta entra una volta sola: il pallino non si riaccende a ogni giro', async () => {
  alle(23, 0)
  pubblica(voce('Anthropic launches Claude Opus 9 for everyone', 'opus9', 2))
  const primo = await rassegna.aggiorna(true)
  assert.ok(primo.notizie.some(n => n.titolo.startsWith('Anthropic launches')))
  const quando = new Set([primo.quando])
  for (let i = 0; i < 4; i++) {
    avanti(21)
    quando.add((await rassegna.aggiorna()).quando)
  }
  assert.equal(quando.size, 1, 'l’ora dell’infornata resta quella del primo giro')
  assert.ok(edizione().valutate.some(id => store.notizie().find(n => n.id === id)?.titolo.startsWith('Anthropic launches')), 'il rilascio è segnato come guardato')
})
