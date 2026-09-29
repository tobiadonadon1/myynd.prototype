// `svolgi` sull'account Claude, con il giro intero (F8).
//
// Fino al 28 settembre 2026 l'account faceva una passata sola: niente
// `cerca_web`, niente mani, e un Pages chiesto sull'account finiva in
// «Collega Claude e potrò lavorarci». Qui l'account risponde da un `lancia`
// finto con le chiamate dette come dati, le mani sono finte (`mani.perProva`:
// la rete di DuckDuckGo e la Scrivania stanno nella cartella della prova), e
// la chiave di riserva parla con un modello finto su questa macchina che
// conta quante volte è stato chiamato.
//
//   node --test server/svolgi-account.test.ts

import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-svolgi-account-'))
process.env.MYYND_DATI = join(CASA, 'dati')
delete process.env.ANTHROPIC_API_KEY
mkdirSync(join(CASA, 'Desktop'), { recursive: true })
// il percorso vero (/private/var…): è quello che torna la mano
const SCRIVANIA = realpathSync(join(CASA, 'Desktop'))

const cfg = await import('./config.ts')
const store = await import('./store.ts')
const abbonamento = await import('./abbonamento.ts')
const mani = await import('./mani.ts')
const claude = await import('./claude.ts')
const { stendi } = await import('./stesura.ts')

const EXE = join(CASA, 'claude')
writeFileSync(EXE, '#!/bin/sh\nexit 0\n')
chmodSync(EXE, 0o755)

const DDG = '<div class="result"><h2 class="result__title"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.h%2Dfarm.com%2Fen&amp;rut=1">H-FARM | Innovation</a></h2><a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.h%2Dfarm.com%2Fen&amp;rut=1">Roncade, Treviso.</a></div>'

type Giro = { sistema: string; domanda: string }
/** I giri dell'account dal motore del lavoro (la conversazione in JSON), non le domande piccole. */
let giri: Giro[] = []
/** Cosa risponde l'account al giro n (da 1), o un errore da lanciare. */
let copione: (n: number, g: Giro) => string | Error = () => JSON.stringify({ text: 'Done.', calls: [] })
const busta = (result: string) => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result, usage: { input_tokens: 50, output_tokens: 10 } })

// la chiave di riserva: il modello finto delle prove, che parla anche come Anthropic
let finto: ChildProcess | null = null
let baseFinto = ''
const richiesteAlFinto = async () => ((await (await fetch(`${baseFinto}/__richieste`)).json()) as { richieste: number }).richieste

before(async () => {
  finto = spawn(process.execPath, [fileURLToPath(new URL('../prove/finto-modello.mjs', import.meta.url))], { env: { PATH: process.env.PATH, FINTO_PORTA: '0' }, stdio: ['ignore', 'pipe', 'inherit'] })
  baseFinto = await new Promise<string>((ok, no) => {
    const scade = setTimeout(() => no(new Error('il modello finto non è partito')), 10_000)
    finto!.stdout!.on('data', d => { const m = String(d).match(/finto su (\d+)/); if (m) { clearTimeout(scade); ok(`http://127.0.0.1:${m[1]}`) } })
  })
  process.env.ANTHROPIC_BASE_URL = baseFinto
  abbonamento.perProva({
    installato: () => EXE,
    lancia: async (args, domanda) => {
      const sistema = args[args.indexOf('--system-prompt') + 1] ?? ''
      // le domande piccole (il brief, la classifica): una riga, come sempre
      if (!domanda.startsWith('La conversazione fin qui')) return busta('ok')
      const g = { sistema, domanda }
      giri.push(g)
      const r = copione(giri.length, g)
      if (r instanceof Error) throw r
      return busta(r)
    }
  })
  mani.perProva({
    rete: (async () => new Response(DDG, { headers: { 'content-type': 'text/html' } })) as typeof fetch,
    risolvi: async () => [{ address: '93.184.216.34' }],
    scrivania: () => SCRIVANIA,
    piattaforma: () => 'darwin',
    ospitato: () => false
  })
})
after(() => {
  abbonamento.perProva(null)
  mani.perProva(null)
  finto?.kill('SIGTERM')
  delete process.env.ANTHROPIC_BASE_URL
  store.chiudiIndici()
  rmSync(CASA, { recursive: true, force: true })
})
beforeEach(() => {
  giri = []
  abbonamento.riprova()
  cfg.scrivi({ lingua: 'en', claudeCon: 'abbonamento', consegne: { luogo: 'scrivania' } }, { togli: ['claude'] })
})

const cerca = JSON.stringify({ text: '', calls: [{ name: 'cerca_web', arguments: JSON.stringify({ query: 'H-Farm address' }) }] })
const scrivi = JSON.stringify({ text: '', calls: [{ name: 'scrivi_file', arguments: JSON.stringify({ percorso: 'h-farm.md', testo: '# H-Farm\n\nRoncade, Treviso.' }) }] })
const fine = JSON.stringify({ text: 'Done: the address is saved in h-farm.md on your Desktop.\n\nH-Farm is in Roncade, Treviso.', calls: [] })

test('sull’account il giro è intero: prima cerca sul web, poi scrive il file, e i fatti lo dicono', async () => {
  copione = n => n === 1 ? cerca : n === 2 ? scrivi : fine
  const r = await claude.svolgi('Find the H-Farm address and save it as a markdown file')
  assert.equal(giri.length, 3)
  assert.match(giri[0].sistema, /cerca_web/)
  assert.match(giri[0].sistema, /scrivi_file/)
  // il risultato della ricerca torna all'account al giro dopo, come dato
  assert.match(giri[1].domanda, /Roncade, Treviso/)
  assert.deepEqual(r.fatti?.map(f => [f.attrezzo, f.esito]), [['cerca_web', 'ok'], ['scrivi_file', 'ok']])
  const file = r.fatti?.find(f => f.attrezzo === 'scrivi_file')?.dettaglio ?? ''
  assert.ok(file.startsWith(SCRIVANIA) && existsSync(file), `il file non è sulla Scrivania di prova: ${file}`)
  assert.match(readFileSync(file, 'utf8'), /Roncade/)
  assert.match(r.testo, /^Done: the address is saved/)
})

test('al massimo quattro giri sull’account, anche in «tutto»: l’ultimo può solo scrivere', async () => {
  copione = (n, g) => /calls \(requested Myynd functions\)/.test(g.sistema) ? cerca : 'The final answer, written.'
  const r = await claude.svolgi('Find the H-Farm address', null, 'tutto')
  assert.equal(giri.length, 4)
  assert.doesNotMatch(giri[3].sistema, /calls \(requested Myynd functions\)/, 'all’ultimo giro nessuno schema: tool_choice none')
  assert.match(r.testo, /The final answer/)
})

test('se l’account cade prima di ogni mano che scrive, lavora la chiave; dopo `scrivi_file` no', async () => {
  cfg.scrivi({ ...cfg.leggi(), claude: { apiKey: 'sk-ant-finta-di-prova' } })
  // cade subito: nessuna mano ha scritto niente, la chiave di riserva finisce il lavoro
  let prima = await richiesteAlFinto()
  copione = () => new Error('Claude Code: Not logged in')
  const r = await claude.svolgi('Find the H-Farm address')
  assert.equal(giri.length, 1)
  assert.ok(await richiesteAlFinto() > prima, 'la chiave non è stata usata')
  assert.match(r.testo, /Done/)

  // cade dopo aver scritto il file: niente chiave, niente secondo file
  giri = []
  abbonamento.riprova()
  prima = await richiesteAlFinto()
  copione = n => n === 1 ? scrivi : new Error('Claude Code: Not logged in')
  await assert.rejects(claude.svolgi('Save the H-Farm address as a markdown file'), /Not logged in/)
  assert.equal(await richiesteAlFinto(), prima, 'dopo scrivi_file la chiave non deve rifare il lavoro')
})

test('una carta per Pages sull’account non dice più «Collega Claude»: il giro parte, con crea_documento_app', async () => {
  copione = () => JSON.stringify({ text: 'What topic should the essay cover?', calls: [] })
  const r = await claude.svolgi('Write an essay in Pages', null, 'tutto', [], null, undefined, null, null,
    { nativa: true, signal: new AbortController().signal })
  assert.match(giri[0].sistema, /crea_documento_app/)
  assert.match(r.testo, /topic/)
})

test('dopo un «non passa» del revisore, `stendi` rifà `svolgi` sull’account, con gli attrezzi e il perché', async () => {
  copione = (n, g) => /Add the date/.test(g.domanda) ? JSON.stringify({ text: 'Done: the note now has the date.\n\nMeeting on 3 October.', calls: [] }) : JSON.stringify({ text: 'Done: the note is ready.\n\nMeeting soon.', calls: [] })
  let giudizi = 0
  const s = await stendi({
    c: { id: 'riga-revise', testo: 'Draft the meeting reminder', modo: 'bozza', domandeFatte: 0 },
    nota: null, progetto: null, nativa: false, lingua: 'en',
    lavora: nota => claude.svolgi('Draft the meeting reminder', nota, 'bozza'),
    ferri: {
      chiedeAiuto: async () => ({ chiede: false, domanda: '' }),
      pesaLaDomanda: async () => null,
      giudica: async () => (++giudizi === 1
        ? { esito: 'revise', per: 'the team', comeTe: '', comeLoro: '', problemi: ['Add the date'], verificato: [] }
        : { esito: 'pass', per: 'the team', comeTe: 'Good.', comeLoro: 'Clear.', problemi: [], verificato: ['date'] })
    },
    fermo: () => false
  })
  assert.ok(s)
  assert.equal(giri.length, 2, 'due stesure sull’account')
  assert.match(giri[1].sistema, /calls \(requested Myynd functions\)/, 'la riscrittura ha gli attrezzi')
  assert.match(giri[1].domanda, /Add the date/)
  assert.match(s.testo, /3 October/)
})
