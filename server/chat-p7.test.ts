// La chat dopo P7: il rifiuto esatto nel prompt, il segno della memoria, le
// fonti ancorate e il verbale, la prova in sola lettura.
//
//   node --test server/chat-p7.test.ts

import { test, after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-chat-p7-'))
const CASA_VERA = process.env.HOME
process.env.HOME = join(CASA, 'casa')
mkdirSync(process.env.HOME, { recursive: true })
process.env.MYYND_DATI = join(CASA, 'dati')
delete process.env.ANTHROPIC_API_KEY
const cfg = await import('./config.ts')
const store = await import('./store.ts')
const progetti = await import('./progetti.ts')
const claude = await import('./claude.ts')
const compatibile = await import('./compatibile.ts')
const { REGOLA_MEMORIA, REGOLA_CERCA_PRIMA } = claude
after(() => { compatibile.usaRete(null); store.chiudiIndici(); process.env.HOME = CASA_VERA; rmSync(CASA, { recursive: true, force: true }) })

const HARBOR = 'Hi Alex, we confirm the Harbor pilot starts on 14 October 2026 with two suppliers, Brightline and Keel. The fee is €4,800 for the first phase. Nora'
const LUNGO = 'Background about the Harbor pilot. '.repeat(70) + 'The total is €9,900 for phase two.'

/** Lo stesso fornitore compatibile finto di chat-progetto.test.ts: risposte e chiamate a strumenti, a giri. */
function fornitoreFinto(giri: { testo?: string; chiamate?: { name: string; input: unknown }[] }[]) {
  const ricevute: Record<string, unknown>[] = []
  let n = 0
  compatibile.usaRete((async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).endsWith('/models')) return Response.json({ data: [{ id: 'gpt-prova' }] })
    ricevute.push(init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {})
    const g = giri[Math.min(n++, giri.length - 1)] ?? {}
    const eventi: unknown[] = []
    if (g.testo) eventi.push({ id: 'x', model: 'gpt-prova', choices: [{ index: 0, delta: { content: g.testo } }] })
    for (const [i, c] of (g.chiamate ?? []).entries()) {
      eventi.push({ choices: [{ index: 0, delta: { tool_calls: [{ index: i, id: `t${n}-${i}`, function: { name: c.name, arguments: JSON.stringify(c.input) } }] } }] })
    }
    eventi.push({ choices: [{ index: 0, delta: {}, finish_reason: g.chiamate?.length ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } })
    return new Response(eventi.map(e => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
  }) as typeof fetch)
  return ricevute
}
const sistemaDi = (r: Record<string, unknown>) => ((r.messages ?? []) as { role: string; content: string }[]).filter(m => m.role === 'system').map(m => m.content).join('\n')

test('su un conto vuoto non c’è memoria', () => {
  cfg.scrivi({ lingua: 'en', diSerie: false, onboarding: true, giro: true, motore: 'compatibile', compatibile: { url: 'https://esempio.test/v1/', chiave: 'sk-prova', modello: 'gpt-prova' } })
  assert.equal(claude.haMemoria(), false)
})

before(() => {
  store.salvaDocumenti([
    { id: 'posta:INBOX:701', fonte: 'posta', tipo: 'email', titolo: 'Harbor pilot kickoff', corpo: HARBOR, autore: 'Nora Vance <nora@harbor.example>', quando: new Date().toISOString() },
    { id: 'posta:INBOX:702', fonte: 'posta', tipo: 'email', titolo: 'Consegna del logo', corpo: 'Ciao Alex, la consegna dei file del logo è confermata per venerdì 9 ottobre 2026. Marco', autore: 'Marco Rossi <m@x.example>', quando: new Date().toISOString() },
    { id: 'desktop:long', fonte: 'desktop', tipo: 'documento', titolo: 'Harbor phase two.md', corpo: LUNGO, quando: new Date().toISOString() }
  ])
})

test('il prompt della chat porta la riga esatta nella lingua dell’app, la regola del rifiuto e quella della memoria; svolgi resta com’era', () => {
  const en = claude.testoDi(claude.corpoRichiesta('What is the fee?', [], [], true).system)
  assert.match(en, /«I don’t have that\.»/)
  assert.ok(en.includes(REGOLA_MEMORIA))
  assert.ok(en.includes(REGOLA_CERCA_PRIMA))
  assert.match(en, /la risposta intera è «I don’t have that\.»/)
  assert.doesNotMatch(en, /Non ho trovato niente su questo/)
  cfg.aggiorna({ lingua: 'it' })
  const it = claude.testoDi(claude.corpoRichiesta('Quanto costa?', [], [], true).system)
  assert.match(it, /«Non ce l’ho\.»/)
  assert.doesNotMatch(it, /Non ho trovato niente su questo/)
  cfg.aggiorna({ lingua: 'en' })
  // svolgi: un modello di casa (BASE_CORTA senza «conciso») e il cloud (BASE)
  const locale = claude.sistema('x', false, true)
  assert.match(locale, /«Non ho trovato niente su questo»/)
  const cloud = claude.sistema('x')
  assert.match(cloud, /"Non ho trovato\nniente su questo"/)
  for (const s of [locale, cloud]) {
    assert.ok(!s.includes(REGOLA_MEMORIA) && !s.includes('[M]') && !s.includes('la risposta intera è'), 'svolgi non prende nessuna regola nuova')
  }
  // cerca prima: solo con gli strumenti
  assert.ok(!claude.testoDi(claude.corpoRichiesta('q', [], [], false, false, false).system).includes(REGOLA_CERCA_PRIMA))
  assert.match(claude.testoDi(claude.corpoRichiesta('q', [], [], false, false, false).messages[0].content), /rispondi «I don’t have that\.»/)
  assert.match(claude.testoDi(claude.corpoRichiesta('q', [], [], false, false, true).messages[0].content), /Se dopo aver cercato non c'è, rispondi «I don’t have that\.»/)
})

test('un [9] su tre documenti sparisce, il verbale lo dice, la via è quella del motore, l’estratto compatto è 350', async () => {
  fornitoreFinto([{ testo: 'The Harbor pilot starts on 14 October 2026 [1] — with Brightline and Keel. The fee is €4,800 [1][9].' }])
  const r = await claude.rispondiInStreaming('When does the Harbor pilot start?', [], () => {}, undefined, undefined, undefined, { prova: true })
  assert.ok(!r.testo.includes('[9]'))
  assert.ok(!/[—–]/.test(r.testo))
  assert.deepEqual(r.verifica.nonValide, [9])
  assert.equal(r.verifica.via, 'compatibile')
  assert.equal(r.verifica.citazioni, 1)
  assert.equal(r.fonti[0].id, 'posta:INBOX:701')
  assert.ok(r.fonti[0].passo?.includes('14 October 2026'), String(r.fonti[0].passo))
  assert.ok(Object.values(r.estratti ?? {}).length > 0 && Object.values(r.estratti ?? {}).every(n => n === 350))
  const salvato = store.messaggi
  assert.ok(salvato)
})

test('un rifiuto: nessuna fonte, e il verbale lo segna', async () => {
  fornitoreFinto([{ testo: 'I don’t have that. I found no rent for the Lisbon office.' }])
  const r = await claude.rispondiInStreaming('What is the rent for the Lisbon office?', [], () => {})
  assert.deepEqual(r.fonti, [])
  assert.equal(r.verifica.rifiuto, true)
  assert.equal(r.verifica.senzaFonti, false)
})

test('un giro di cerca allarga il documento a quattromila, e un fatto oltre il primo estratto trova il suo passo', async () => {
  fornitoreFinto([{ chiamate: [{ name: 'cerca', input: { query: 'Harbor phase two' } }] }, { testo: 'The total is €9,900 [1].' }])
  const r = await claude.rispondiInStreaming('What is the total for phase two of Harbor?', [], () => {}, undefined, undefined, undefined, { prova: true })
  const largo = r.fonti.find(f => f.id === 'desktop:long')
  assert.ok(largo, JSON.stringify(r.fonti))
  assert.equal(r.estratti?.['desktop:long'], 4000)
  assert.ok(largo!.passo?.includes('€9,900'), String(largo!.passo))
  assert.deepEqual(r.verifica.scoperti, [])
})

test('la panoramica dei progetti porta [M] e una fonte di memoria, via scorciatoia', async () => {
  const p = progetti.scrivi({ nome: 'Northwind', obiettivo: 'Ship Northwind 1.0' })
  assert.equal(claude.haMemoria(), true)
  const r = await claude.rispondiInStreaming('What are my current projects?', [], () => {})
  assert.equal(r.verifica.via, 'scorciatoia')
  assert.equal(r.verifica.memoria, true)
  assert.ok(r.testo.includes('[M]'))
  assert.deepEqual(r.fonti, [{ id: `memoria:progetto:${p.id}`, label: '[M] Northwind', fonte: 'memoria' }])
  const o = await claude.rispondiInStreaming('What is my goal for Northwind?', [], () => {})
  assert.equal(o.verifica.via, 'scorciatoia')
  assert.ok(o.fonti[0].id.startsWith('memoria'))
})

test('nella prova ogni strumento che scrive torna «sola lettura», la lista con gli id sta nel prompt, e i progetti detti non si salvano', async () => {
  store.scriviCompito({ id: 'cp7', testo: 'Call Nora', quando: 'oggi', ordine: 'm' })
  const ricevute = fornitoreFinto([{ chiamate: [{ name: 'aggiungi_compito', input: { testo: 'Write to Keel', richiesta: 'add' } }] }, { testo: 'Done.' }])
  const r = await claude.rispondiInStreaming('add write to Keel', [], () => {}, undefined, undefined, undefined, { prova: true })
  assert.equal(r.testo, 'Done.')
  const tornati = ricevute.flatMap(x => ((x.messages ?? []) as { role: string; content: string }[]).filter(m => m.role === 'tool').map(m => String(m.content)))
  // il fornitore compatibile mette «Errore:» davanti a un risultato con is_error
  assert.equal(tornati.length, 1)
  assert.match(tornati[0], /sola lettura in questa prova$/)
  assert.ok(!store.elencoCompiti().some(c => c.testo === 'Write to Keel'), 'nessuna riga nata dalla prova')
  assert.match(sistemaDi(ricevute[0]), /\[cp7\] Call Nora/)
  const a = progetti.scrivi({ nome: 'Aurora', obiettivo: 'Old goal' })
  fornitoreFinto([{ testo: 'Noted.' }])
  const frase = 'My goal for Aurora is to launch the customer pilot.'
  await claude.rispondiInStreaming(frase, [], () => {}, undefined, undefined, undefined, { prova: true })
  assert.equal(progetti.trova(a.id)?.obiettivo, 'Old goal', 'la prova non tocca i progetti')
  // e fuori dalla prova la stessa frase si salva: è la scorciatoia che scrive
  const vivo = await claude.rispondiInStreaming(frase, [], () => {})
  assert.equal(vivo.verifica.via, 'scorciatoia')
  assert.notEqual(progetti.trova(a.id)?.obiettivo, 'Old goal')
})

test('rispondi(), senza streaming, torna lo stesso verbale', async () => {
  compatibile.usaRete((async (url: string | URL | Request) => {
    if (String(url).endsWith('/models')) return Response.json({ data: [{ id: 'gpt-prova' }] })
    return Response.json({ id: 'c1', model: 'gpt-prova', choices: [{ index: 0, message: { role: 'assistant', content: 'The fee is €4,800 [1].' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } })
  }) as typeof fetch)
  const r = await claude.rispondi('What is the fee for the Harbor pilot?')
  assert.equal(r.verifica.via, 'compatibile')
  assert.equal(r.verifica.citazioni, 1)
  assert.ok(r.fonti[0].passo?.includes('€4,800'))
})

test('[M] chiude la prima frase, prima del suo punto; senza un punto, la prima riga', () => {
  assert.equal(claude.conSegnoMemoria({ testo: 'Your goal for Northwind is 1.0. Recorded from your conversation.' }).testo, 'Your goal for Northwind is 1.0[M]. Recorded from your conversation.')
  assert.equal(claude.conSegnoMemoria({ testo: 'Your current registered projects:\n\n- Northwind: Ship it.' }).testo, 'Your current registered projects:[M]\n\n- Northwind: Ship it.')
  assert.equal(claude.conSegnoMemoria({ testo: 'Done! Next week.' }).testo, 'Done[M]! Next week.')
})
