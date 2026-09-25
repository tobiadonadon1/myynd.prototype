// La stesura fuori da `svolgiUno` (P6): la stessa sequenza per una riga che
// non è in lista. Le prove di P3 su `svolgiUno` girano invariate in
// `compiti.test.ts`, `domande.test.ts` e le altre: qui si guarda il pezzo nuovo.
//
//   node --test server/stesura-fuori.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-stesura-'))
mkdirSync(join(CASA, '.myynd'), { recursive: true })
const CASA_VERA = process.env.HOME
process.env.HOME = CASA
process.env.MYYND_DATI = join(CASA, '.myynd')
writeFileSync(join(CASA, '.myynd', 'config.json'), JSON.stringify({ lingua: 'en' }), { mode: 0o600 })

const store = await import('./store.ts')
const { stesura, FERRI_STESURA } = await import('./stesura.ts')
const compiti = await import('./compiti.ts')

after(() => {
  store.chiudiIndici()
  process.env.HOME = CASA_VERA
  rmSync(CASA, { recursive: true, force: true })
})

const RIGA = {
  id: 'riga-finta', testo: 'Reply to Dana about the quote', nota: 'Da guardare:\n[posta:1] Quote', modo: 'bozza',
  doc: null, attrezzi: { nomi: ['posta.leggi'], origine: 'automazione' as const }, progetto: null, materiale: null, cartella: null
}

type Chiamata = unknown[]
function ferri(testo: string) {
  const svolte: Chiamata[] = []
  const giudicate: string[] = []
  const f = {
    ...FERRI_STESURA,
    voce: () => null,
    svolgi: (async (...a: unknown[]) => { svolte.push(a); return { testo, fonti: [] } }) as unknown as typeof FERRI_STESURA.svolgi,
    chiedeAiuto: async () => ({ chiede: false, domanda: '' }),
    pesaLaDomanda: async () => null,
    giudica: (async (o: { risultato: string }) => { giudicate.push(o.risultato); return { esito: 'pass', problemi: [], verificato: true, per: [], comeTe: null, comeLoro: null } }) as unknown as typeof FERRI_STESURA.giudica
  }
  return { f, svolte, giudicate }
}

test('la stesura di una riga che non è in lista chiama svolgi con i campi della riga, e rilegge la bozza', async () => {
  const { f, svolte, giudicate } = ferri('Hi Dana, the quote is attached.')
  const s = await stesura(RIGA, f, { nativa: false, signal: new AbortController().signal, fermato: () => false, passo: () => {} })
  assert.ok(s)
  assert.equal(svolte.length, 1)
  const [testo, nota, modo, concessi, , , doc, dato] = svolte[0]
  assert.equal(testo, RIGA.testo)
  assert.equal(nota, RIGA.nota)
  assert.equal(modo, 'bozza')
  assert.deepEqual(concessi, ['posta.leggi'])
  assert.equal(doc, null)
  assert.deepEqual(dato, RIGA.attrezzi)
  assert.equal(giudicate.length, 1, 'una bozza passa dalla rilettura')
  assert.equal(s.verdetto?.esito, 'pass')
  assert.equal(s.mossa, 'produci')
})

test('la stesura torna null quando è fermata, prima o dopo il modello', async () => {
  const { f, svolte } = ferri('x')
  assert.equal(await stesura(RIGA, f, { nativa: false, signal: new AbortController().signal, fermato: () => true, passo: () => {} }), null)
  assert.equal(svolte.length, 0, 'fermata prima: nessuna chiamata')
  let n = 0
  const dopo = await stesura(RIGA, f, { nativa: false, signal: new AbortController().signal, fermato: () => n++ > 0, passo: () => {} })
  assert.equal(dopo, null)
})

test('occupatoPer dice se c\'è lavoro dal vivo di quella persona, e di nessun altro', () => {
  assert.equal(compiti.occupatoPer(''), false)
  assert.equal(compiti.occupatoPer('altro@example.com'), false)
})
