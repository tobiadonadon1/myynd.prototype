// Le mani di una riga nata da un'automazione (P6, la prima correzione).
//
// Una ricetta senza attrezzi scriveva righe con `compiti.attrezzi` NULL, e
// `claude.svolgi` le trattava come righe scritte a mano: con le mani di
// `mani.ts`, cioè una nota, un file, il web. Un attrezzo è un permesso di
// leggere, e una scheda che dice «non manda e non cancella» deve dire il vero.
//
//   node --test server/mani-automazioni.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-mani-auto-'))
mkdirSync(join(CASA, '.myynd'), { recursive: true })
const CASA_VERA = process.env.HOME
process.env.HOME = CASA
process.env.MYYND_DATI = join(CASA, '.myynd')
writeFileSync(join(CASA, '.myynd', 'config.json'), JSON.stringify({
  lingua: 'en', motore: 'compatibile',
  compatibile: { url: 'https://esempio.test/v1/', chiave: 'sk-prova', modello: 'gpt-prova' }
}), { mode: 0o600 })

const store = await import('./store.ts')
const auto = await import('./automazioni.ts')
const compiti = await import('./compiti.ts')
const compatibile = await import('./compatibile.ts')
const mani = await import('./mani.ts')

after(() => {
  compiti.perProva(null)
  compatibile.usaRete(null)
  store.chiudiIndici()
  process.env.HOME = CASA_VERA
  rmSync(CASA, { recursive: true, force: true })
})

/** Il fornitore finto: registra gli attrezzi di ogni richiesta, risponde con una bozza. */
const ricevute: { tools: string[] }[] = []
compatibile.usaRete((async (url: string | URL | Request, init?: RequestInit) => {
  if (String(url).endsWith('/models')) return Response.json({ data: [{ id: 'gpt-prova' }] })
  const corpo = init?.body ? JSON.parse(String(init.body)) as { tools?: { function: { name: string } }[] } : {}
  ricevute.push({ tools: (corpo.tools ?? []).map(t => t.function.name) })
  const eventi = [
    { id: 'x', model: 'gpt-prova', choices: [{ index: 0, delta: { content: 'Done: the weekly plan is below.\n\nMonday: quotes. Tuesday: invoices.' } }] },
    { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } }
  ]
  return new Response(eventi.map(e => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n',
    { headers: { 'content-type': 'text/event-stream' } })
}) as typeof fetch)

// le altre chiamate di `svolgiUno` non servono qui: si guarda solo `svolgi`
compiti.perProva({
  chiedeAiuto: async () => ({ chiede: false, manca: [], domanda: '' }),
  domandeDaFare: async () => [],
  pesaLaDomanda: async () => null,
  giudica: async () => ({ esito: 'pass', problemi: [] }),
  preparaEmail: async () => null,
  prossimoPasso: async () => null,
  salvaConsegna: () => { throw new Error('nessun file in questa prova') }
} as Parameters<typeof compiti.perProva>[0])

store.salvaDocumenti([{
  id: 'posta:INBOX:piano', fonte: 'posta', tipo: 'email', titolo: 'Weekly plan request',
  corpo: 'Could you save the weekly plan as a markdown file? Dana', autore: 'Dana <dana@example.com>',
  quando: new Date().toISOString(), filo: 'fp'
}])

const MARKDOWN = 'Save the weekly plan as a markdown file'
const RICETTA = {
  id: 'senza-attrezzi', nome: MARKDOWN, spiega: 'Only the tests use it.',
  quando: { ogni: 'giorno' as const, ora: 9 },
  guarda: { cerca: 'weekly plan', limite: 4 },
  fai: MARKDOWN,
  metti: { inLista: 'oggi' as const, modo: 'bozza' as const },
  attrezzi: [] as string[],
  en: { nome: MARKDOWN, spiega: 'Only the tests use it.', fai: MARKDOWN, cerca: 'weekly plan' }
}

async function finche(cosa: () => boolean, ms = 8000) {
  const fine = Date.now() + ms
  while (!cosa()) {
    if (Date.now() > fine) throw new Error('troppo lungo')
    await new Promise(r => setTimeout(r, 20))
  }
}

const mani_ = (tools: string[]) => tools.filter(n => mani.eUnaMano(n))

test('una riga da un\'automazione senza attrezzi non ha mani', async () => {

  ricevute.length = 0
  assert.equal(await auto.fai(auto.scrivi(RICETTA), { aMano: true }), 'fatta')
  const riga = store.elencoCompiti().find(c => c.origine === `auto:${RICETTA.id}`)
  assert.ok(riga, 'la riga nasce')
  await finche(() => store.compito(riga.id)?.stato !== 'delegato')
  assert.ok(ricevute.length > 0, 'la bozza passa dal modello')
  for (const r of ricevute) {
    for (const n of ['crea_nota', 'scrivi_file', 'lavora_nel_codice', 'cerca_web', 'leggi_pagina']) {
      assert.ok(!r.tools.includes(n), `${n} non deve esserci`)
    }
  }
})

test('la concessione vuota di un\'automazione si salva', () => {
  const riga = store.elencoCompiti().find(c => c.origine === `auto:${RICETTA.id}`)
    ?? store.compito(store.elencoCompiti().map(c => c.id).find(Boolean) ?? '')
  assert.ok(riga)
  assert.deepEqual(riga.attrezzi?.nomi, [])
  assert.equal(riga.attrezzi?.origine, 'automazione')
})

test('una riga scritta a mano le ha ancora', async () => {
  ricevute.length = 0
  store.scriviCompito({ id: 'a-mano', testo: MARKDOWN, ordine: 'z', quando: 'oggi' })
  assert.equal(store.compito('a-mano')?.attrezzi ?? null, null)
  compiti.affida('a-mano', 'bozza', false)
  await finche(() => store.compito('a-mano')?.stato !== 'delegato')
  assert.ok(ricevute.length > 0)
  assert.ok(mani_(ricevute[0].tools).includes('scrivi_file'), 'la riga scritta a mano riceve scrivi_file')
  assert.ok(mani_(ricevute[0].tools).includes('leggi_pagina'))
})
