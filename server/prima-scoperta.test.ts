// La prima cosa utile, mentre la prima lettura va ancora.
//
// L'attesa della lettura era una schermata da guardare. Adesso, appena
// nell'indice c'è una frase che parla del suo progetto, il primo avvio la
// mostra: senza modello, citata parola per parola, con la fonte. Qui si prova
// che arriva prima che le fonti siano scelte (la lettura è a metà), che
// rispetta le stesse regole degli estratti, e che non scrive niente.
//
//   node --test server/prima-scoperta.test.ts

import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const casa = mkdtempSync(join(tmpdir(), 'myynd-scoperta-'))
process.env.MYYND_DATI = casa
const avvio = await import('./avvio.ts')
const store = await import('./store.ts')
const conti = await import('./conti.ts')
const cfg = await import('./config.ts')

before(async () => { await conti.avvia() })
beforeEach(() => { store.azzeraTutto(); rmSync(join(casa, 'avvio.json'), { force: true }) })
after(() => { store.chiudiIndici(); delete process.env.MYYND_DATI; rmSync(casa, { recursive: true, force: true }) })

const doc = (id: string, corpo: string, fonte = 'desktop', giorni = 3) => ({
  id, fonte, tipo: 'testo', titolo: id, corpo, quando: new Date(Date.now() - giorni * 86_400_000).toISOString()
})

test('nothing before there is a project, and reading the state never creates the file', () => {
  assert.equal(avvio.primaScoperta(), null)
  assert.equal(existsSync(join(casa, 'avvio.json')), false)
})

test('while the sources are still being read, the first sentence about the project shows, from any connected source', () => {
  cfg.aggiorna({ desktop: { cartelle: [casa], scelte: true } })
  avvio.progetto({ nome: 'Northwind', obiettivo: 'Launch the Northwind website by October', revisione: avvio.stato().revisione })
  assert.equal(avvio.primaScoperta(), null, 'nothing read yet: nothing to show')
  store.salvaDocumenti([
    doc('sport', 'A newsletter about football results with no link to any work at all.'),
    doc('cv', 'Northwind appears in an old CV from long ago, kept only for reference.', 'desktop', 400),
    doc('piano', 'Northwind website goes live in October, after the copy review with Maya.')
  ])
  const prima = readFileSync(join(casa, 'avvio.json'), 'utf8')
  const s = avvio.primaScoperta()
  assert.deepEqual(s, { testo: 'Northwind website goes live in October, after the copy review with Maya.', titolo: 'piano', fonte: 'desktop' })
  assert.equal(readFileSync(join(casa, 'avvio.json'), 'utf8'), prima, 'a read never writes the onboarding file')
  assert.equal(avvio.stato().fase, 'fonte', 'the sources are still not chosen')
})

test('once the sources are chosen, only those are searched', () => {
  cfg.aggiorna({ desktop: { cartelle: [casa], scelte: true }, calendario: { url: 'https://example.invalid/a.ics' } })
  const p = avvio.progetto({ nome: 'Northwind', obiettivo: 'Launch the Northwind website by October', revisione: avvio.stato().revisione })
  store.salvaDocumenti([doc('evento', 'Northwind launch review with the whole team on Friday morning.', 'calendario')])
  assert.equal(avvio.primaScoperta()?.fonte, 'calendario')
  avvio.fonte({ fonti: ['desktop'], revisione: p.revisione })
  assert.equal(avvio.primaScoperta(), null)
})

test('after the onboarding is done it is searched only for its last screen, while the first read still runs', () => {
  cfg.aggiorna({ desktop: { cartelle: [casa], scelte: true } })
  let s = avvio.progetto({ nome: 'Northwind', obiettivo: 'Launch the Northwind website by October', revisione: avvio.stato().revisione })
  store.salvaDocumenti([doc('piano', 'Northwind website goes live in October, after the copy review with Maya.')])
  s = avvio.fonte({ fonti: ['desktop'], revisione: s.revisione })
  s = avvio.conferma({ ids: [], revisione: s.revisione })
  avvio.completa({ azione: 'Write the homepage copy', revisione: s.revisione })
  assert.equal(avvio.stato().fase, 'completo')
  assert.equal(avvio.primaScoperta(), null, 'the app home page polls the same route: nothing is searched there')
  assert.equal(avvio.primaScoperta({ finito: true })?.titolo, 'piano')
  const index = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
  assert.match(index, /scoperta: avvio\.primaScoperta\(\{ finito: lettura === 'prima' \}\)/)
})
