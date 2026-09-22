import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Isolamento prima degli import: nessuna lettura o scrittura nei dati reali.
const dati = mkdtempSync(join(tmpdir(), 'myynd-rassegna-edizione-'))
const datiPrima = process.env.MYYND_DATI
const chiavePrima = process.env.ANTHROPIC_API_KEY
const jevPrima = process.env.MYYND_TYPESAFE
process.env.MYYND_DATI = dati
delete process.env.ANTHROPIC_API_KEY
delete process.env.MYYND_TYPESAFE
const cfg = await import('./config.ts')
const store = await import('./store.ts')
const rassegna = await import('./rassegna.ts')
const timone = await import('./timone.ts')
const jev = await import('./jev.ts')
const fetchPrima = globalThis.fetch

after(() => {
  globalThis.fetch = fetchPrima
  jev.perProva(null)
  if (datiPrima === undefined) delete process.env.MYYND_DATI
  else process.env.MYYND_DATI = datiPrima
  if (chiavePrima === undefined) delete process.env.ANTHROPIC_API_KEY
  else process.env.ANTHROPIC_API_KEY = chiavePrima
  if (jevPrima === undefined) delete process.env.MYYND_TYPESAFE
  else process.env.MYYND_TYPESAFE = jevPrima
  rmSync(dati, { recursive: true, force: true })
})

// — i giornali finti —
//
// Ogni indirizzo risponde con quello che c'è in `pubblicati` sotto un pezzo
// del suo URL: The Verge per l'IA, la BBC per il mondo. Gli altri tacciono.

const faMinuti = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
const voce = (titolo: string, slug: string, minuti = 30, riassunto = '') =>
  `<item><title>${titolo}</title><description>${riassunto}</description><link>https://example.test/${slug}</link><pubDate>${faMinuti(minuti)}</pubDate></item>`
const pubblicati: Record<string, string> = {}
/** Come un feed vero: la più nuova in cima (se ne leggono le prime dodici). */
const pubblica = (dove: string, xml: string) => { pubblicati[dove] = xml + (pubblicati[dove] ?? '') }
let richieste = 0
globalThis.fetch = async (url: string | URL | Request) => {
  richieste++
  const u = String(url instanceof Request ? url.url : url)
  const k = Object.keys(pubblicati).find(k => u.includes(k))
  return new Response(`<rss><channel>${k ? pubblicati[k] : ''}</channel></rss>`, { status: 200 })
}

const EDIZIONE = () => join(cfg.cartella(), 'rassegna-edizione.json')
const edizione = () => JSON.parse(readFileSync(EDIZIONE(), 'utf8')) as { ids: string[]; valutate: string[]; quando: string; controllata: string }
/** Fa finta che l'ultimo controllo sia di `minuti` fa. */
function invecchia(minuti: number) {
  const e = edizione()
  e.controllata = faMinuti(minuti)
  writeFileSync(EDIZIONE(), JSON.stringify(e))
}
const titoli = (r: { notizie: { titolo: string }[] }) => r.notizie.map(n => n.titolo)

test('senza niente di scritto segue lo stesso l’IA, e la cronaca resta fuori', async () => {
  cfg.scrivi({ lingua: 'en' })
  pubblicati.theverge = voce('OpenAI launches GPT-6 for developers', 'gpt6', 90) + voce('Ten tips for your holidays', 'tips', 40)
  pubblicati.bbci = voce('Ceasefire talks resume in Geneva', 'geneva', 20)

  const r = await rassegna.aggiorna(true)
  assert.equal(r.fatta, true)
  assert.ok(richieste > 0, 'senza progetti prima non si chiedevano nemmeno i giornali')
  assert.deepEqual(titoli(r), ['OpenAI launches GPT-6 for developers'])
  assert.equal(r.notizie[0].importante, true, 'un laboratorio che lancia un modello è importante')
})

test('ogni venti minuti arriva un’infornata nuova, e quello che c’era resta', async () => {
  const prima = rassegna.elenco()
  const dopo = richieste
  const cache = await rassegna.aggiorna()
  assert.equal(cache.fatta, false, 'dentro i venti minuti non si rifà')
  assert.equal(richieste, dopo, 'e non si chiedono nemmeno i giornali')

  pubblica('theverge', voce('Anthropic releases Claude Opus 5', 'opus5', 10))
  invecchia(21)
  const r = await rassegna.aggiorna()
  assert.equal(r.fatta, true)
  assert.deepEqual(titoli(r), ['Anthropic releases Claude Opus 5', 'OpenAI launches GPT-6 for developers'],
    'la nuova si aggiunge sopra: l’edizione di prima non si butta')
  assert.ok(r.quando! > prima.quando!, 'un’infornata vera sposta l’ora, ed è quella che accende il pallino')
})

test('un titolo già guardato non torna davanti al modello, e un giro senza novità non sposta l’ora', async () => {
  const e = edizione()
  const gpt = store.notizie().find(n => n.titolo.startsWith('OpenAI launches'))!
  assert.ok(e.valutate.includes(gpt.id), 'i titoli messi davanti al modello si ricordano')
  invecchia(21)
  const r = await rassegna.aggiorna()
  assert.equal(r.fatta, true)
  assert.equal(r.quando, e.quando, 'niente di nuovo: il pallino non si riaccende')
  assert.deepEqual(r.notizie.map(n => n.id), e.ids)
})

const OTTO = [
  'Gemini gains a research mode for students', 'DeepSeek publishes weights for its reasoning system',
  'Mistral opens an office in Tokyo', 'Llama licence changes for enterprise users',
  'Grok arrives inside Telegram chats', 'Claude Code gets background agents',
  'ChatGPT memory expands to free accounts', 'Codex handles pull request reviews'
]
const MINORI = [
  'Minor: Qwen tweaks its tokenizer docs', 'Minor: Gemini icon gets a new colour',
  'Minor: Claude status page moves', 'Minor: DeepSeek updates its careers page'
]

test('mai più di dieci: quando si sfora esce la meno interessante, e Jev la sceglie una volta sola', async () => {
  pubblica('theverge', OTTO.map((t, i) => voce(t, `otto-${i}`, 15 + i)).join(''))
  invecchia(21)
  const pieno = await rassegna.aggiorna()
  assert.equal(pieno.notizie.length, rassegna.QUANTE, 'due più otto: il mazzo è pieno, nessuno esce')

  // Jev: le «Minor» non interessano
  const chieste: string[] = []
  process.env.MYYND_TYPESAFE = 'chiave-di-prova'
  jev.perProva(async (_u, init) => {
    const corpo = JSON.parse(String(init?.body)) as { state: { notizia?: { titolo: string } }; questions: Record<string, unknown> }
    // la domanda sul fatto doppio qui risponde sempre «nessuno»: la prova è sul tetto
    if (corpo.questions.stesso) return Response.json({ answers: { stesso: { type: 'choice', choice: 'nessuno', confidence: 0.9, probabilities: { nessuno: 0.9 } } } })
    const t = corpo.state.notizia!.titolo
    chieste.push(t)
    return Response.json({ answers: { interessa: { type: 'noul', noul: t.startsWith('Minor') ? 0.05 : 0.9 } }, usage: { input_tokens: 10, output_tokens: 1 } })
  })
  try {
    pubblica('theverge', MINORI.map((t, i) => voce(t, `minore-${i}`, 5 + i)).join(''))
    invecchia(21)
    const sfoltita = await rassegna.aggiorna()
    assert.equal(sfoltita.notizie.length, rassegna.QUANTE, 'mai più di dieci')
    assert.ok(!titoli(sfoltita).some(t => t.startsWith('Minor')), `le meno interessanti sono uscite: ${titoli(sfoltita).join(' | ')}`)
    assert.deepEqual(titoli(sfoltita).slice(0, 2), ['Anthropic releases Claude Opus 5', 'OpenAI launches GPT-6 for developers'],
      'le importanti restano, e in cima')
    assert.equal(chieste.length, 14, 'ognuna delle quattordici giudicata una volta')
    assert.equal(sfoltita.quando, pieno.quando, 'entrate e subito uscite: il pallino non si accende per niente')

    // il voto resta scritto: il giro dopo chiede solo della nuova
    chieste.length = 0
    pubblica('theverge', voce('Minor: Mistral renames a settings tab', 'minore-extra', 3))
    invecchia(21)
    const ancora = await rassegna.aggiorna()
    assert.equal(ancora.notizie.length, rassegna.QUANTE)
    assert.deepEqual(chieste, ['Minor: Mistral renames a settings tab'], 'le altre avevano già il loro voto')
  } finally {
    jev.perProva(null)
    delete process.env.MYYND_TYPESAFE
  }
})

test('lo stesso fatto con altre parole non entra, e se era importante lo diventa quello che c’era', async () => {
  // Opus 5.5 c'è già (importante); il CNBC di prima no. Arriva l'FT, che
  // racconta il rilascio senza nominare il modello: Jev dice che è lo stesso
  // fatto del CNBC, e la regola non lo vedrebbe mai.
  const cnbc = 'Anthropic and OpenAI roll out cheaper models'
  pubblica('theverge', voce(cnbc, 'cnbc', 4))
  invecchia(21)
  await rassegna.aggiorna()
  assert.equal(rassegna.elenco().notizie.find(n => n.titolo === cnbc)?.importante, true, 'roll out + OpenAI: la regola la segna già')
  store.default.prepare('UPDATE notizie SET importante = 0 WHERE titolo = ?').run(cnbc)

  process.env.MYYND_TYPESAFE = 'chiave-di-prova'
  jev.perProva(async (_u, init) => {
    const corpo = JSON.parse(String(init?.body)) as { state: { notizia_nuova?: { titolo: string } }; questions: Record<string, { criteria?: Record<string, { what?: string }> }> }
    if (!corpo.questions.stesso) return Response.json({ answers: { interessa: { type: 'noul', noul: 0.5 } } })
    const opzioni = Object.entries(corpo.questions.stesso.criteria ?? {})
    const scelta = corpo.state.notizia_nuova?.titolo.includes('ahead of IPO') ? opzioni.find(([, c]) => c.what === cnbc)?.[0] ?? 'nessuno' : 'nessuno'
    return Response.json({ answers: { stesso: { type: 'choice', choice: scelta, confidence: 0.7, probabilities: { [scelta]: 0.7 } } } })
  })
  try {
    pubblica('theverge', voce('Anthropic releases cheaper AI model ahead of IPO', 'ft-ipo', 2))
    invecchia(21)
    const r = await rassegna.aggiorna()
    assert.ok(!titoli(r).includes('Anthropic releases cheaper AI model ahead of IPO'), 'il doppione non entra')
    assert.equal(r.notizie.find(n => n.titolo === cnbc)?.importante, true, 'e il fatto importante resta importante')
  } finally {
    jev.perProva(null)
    delete process.env.MYYND_TYPESAFE
  }
})

test('l’annuncio del laboratorio sostituisce il riassunto che c’era sullo stesso fatto', async () => {
  const cnbc = 'Anthropic and OpenAI roll out cheaper models'
  assert.ok(titoli(rassegna.elenco()).includes(cnbc))
  process.env.MYYND_TYPESAFE = 'chiave-di-prova'
  jev.perProva(async (_u, init) => {
    const corpo = JSON.parse(String(init?.body)) as { state: { notizia_nuova?: { titolo: string } }; questions: Record<string, { criteria?: Record<string, { what?: string }> }> }
    if (!corpo.questions.stesso) return Response.json({ answers: { interessa: { type: 'noul', noul: 0.5 } } })
    const opzioni = Object.entries(corpo.questions.stesso.criteria ?? {})
    const scelta = corpo.state.notizia_nuova?.titolo.startsWith('Introducing GPT-6.5') ? opzioni.find(([, c]) => c.what === cnbc)?.[0] ?? 'nessuno' : 'nessuno'
    return Response.json({ answers: { stesso: { type: 'choice', choice: scelta, confidence: 0.7, probabilities: { [scelta]: 0.7 } } } })
  })
  try {
    // l'annuncio arriva dal blog di OpenAI: il giornale finto qui è quello
    pubblica('openai.com', voce('Introducing GPT-6.5 for developers', 'gpt65', 1, 'OpenAI rolls out cheaper models to developers.'))
    invecchia(21)
    const r = await rassegna.aggiorna()
    assert.ok(titoli(r).includes('Introducing GPT-6.5 for developers'), 'l’annuncio entra')
    assert.ok(!titoli(r).includes(cnbc), 'e il riassunto dello stesso fatto esce')
    assert.equal(r.notizie.find(n => n.titolo === 'Introducing GPT-6.5 for developers')?.importante, true)
  } finally {
    jev.perProva(null)
    delete process.env.MYYND_TYPESAFE
  }
})

test('una letta esce dal mazzo, resta fra le lette, e non torna', async () => {
  const gpt = rassegna.elenco().notizie.find(n => n.titolo.startsWith('OpenAI launches'))!
  store.segnaNotiziaLetta(gpt.id)
  assert.ok(!rassegna.elenco().notizie.some(n => n.id === gpt.id))
  assert.equal(rassegna.elenco().recenti[0].id, gpt.id)
  invecchia(21)
  const r = await rassegna.aggiorna()
  assert.ok(!r.notizie.some(n => n.id === gpt.id), 'la letta non rientra dal giornale che la ripubblica')
})

test('cambiare il lavoro non butta via il mazzo', () => {
  const prima = rassegna.elenco().notizie.map(n => n.id)
  timone.scriviFuoco('Organize Kubernetes cluster migration')
  assert.deepEqual(rassegna.elenco().notizie.map(n => n.id), prima)
})

test('giornali giù: il mazzo resta, e per un quarto d’ora non si martella', async () => {
  const prima = rassegna.elenco().notizie.map(n => n.id)
  const salvati = { ...pubblicati }
  for (const k of Object.keys(pubblicati)) delete pubblicati[k]
  const fetchGiu = globalThis.fetch
  globalThis.fetch = async () => { richieste++; throw new Error('rete giù') }
  try {
    await assert.rejects(rassegna.aggiorna(true), /giornale/)
    assert.deepEqual(rassegna.elenco().notizie.map(n => n.id), prima)
    invecchia(21)
    const dopo = richieste
    assert.equal((await rassegna.aggiorna()).fatta, false, 'dopo un errore la pagina non richiama i giornali a ogni minuto')
    assert.equal(richieste, dopo)
  } finally {
    globalThis.fetch = fetchGiu
    Object.assign(pubblicati, salvati)
  }
})
