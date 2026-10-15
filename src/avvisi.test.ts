// Gli avvisi di sistema: cosa esce, quando, e in quanti.
//
//   node --test src/avvisi.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'

;(globalThis as unknown as { document: unknown }).document = { documentElement: { lang: '' } }
const { impostaLingua } = await import('./lingua.ts')
const {
  componi, daRiga, dalFeed, dallaMattina, decidi, fineDellaNotte, visto, vuota,
  DOPO_LA_NOTTE_MS, MASSIMO_ORA, OGNI_GENERE_MS
} = await import('./avvisi.ts')
type Candidato = import('./avvisi.ts').Candidato
impostaLingua('en')

const T0 = Date.parse('2026-10-15T15:00:00')
const c = (genere: Candidato['genere'], id: string, corpo = `carta ${id}`): Candidato =>
  ({ genere, id, corpo, dove: { dove: 'compito', id } })

test('una cosa nuova esce subito, una volta sola', () => {
  const a = decidi(vuota(), [c('lavoro', 'a')], T0)
  assert.deepEqual(a.esce?.map(x => x.id), ['a'])
  // la stessa, di nuovo, anche dopo un'ora: già detta
  const b = decidi(a.memoria, [c('lavoro', 'a')], T0 + 3_600_000)
  assert.equal(b.esce, null)
  assert.equal(b.memoria.attesa.length, 0)
})

test('lo stesso id in due generi sono due cose', () => {
  const a = decidi(vuota(), [c('lavoro', 'x'), c('chiede', 'x')], T0)
  assert.equal(a.esce?.length, 2)
})

test('quello che arriva insieme esce in un avviso solo', () => {
  const a = decidi(vuota(), [c('lavoro', 'a'), c('bozza', 'b'), c('file', 'c')], T0)
  assert.equal(a.esce?.length, 3)
  assert.equal(a.memoria.inviati.length, 1, 'un avviso, non tre')
  const n = componi(a.esce!)
  assert.equal(n.titolo, '3 things are ready.')
  assert.equal(n.corpo, 'carta a · carta b · carta c')
  // posti diversi: la prima pagina
  assert.equal(n.dove, 'casa')
})

test('un genere al massimo ogni dieci minuti: il secondo aspetta, non si perde', () => {
  const a = decidi(vuota(), [c('bozza', 'a')], T0)
  const b = decidi(a.memoria, [c('bozza', 'b')], T0 + 60_000)
  assert.equal(b.esce, null)
  assert.equal(b.memoria.attesa.length, 1)
  assert.equal(b.prossimo, T0 + OGNI_GENERE_MS)
  // un altro genere intanto passa, e la bozza resta ad aspettare
  const c2 = decidi(b.memoria, [c('file', 'f')], T0 + 120_000)
  assert.deepEqual(c2.esce?.map(x => x.id), ['f'])
  assert.deepEqual(c2.memoria.attesa.map(x => x.id), ['b'])
  // allo scadere esce
  const d = decidi(c2.memoria, [], T0 + OGNI_GENERE_MS)
  assert.deepEqual(d.esce?.map(x => x.id), ['b'])
  assert.equal(d.prossimo, null)
})

test('più di sei all’ora no, in tutto', () => {
  let m = vuota()
  const generi = ['lavoro', 'chiede', 'bozza', 'file', 'feed', 'fonte', 'punto'] as const
  let usciti = 0
  for (let i = 0; i < generi.length; i++) {
    const r = decidi(m, [c(generi[i], `g${i}`)], T0 + i * 60_000)
    m = r.memoria
    if (r.esce) usciti++
  }
  assert.equal(usciti, MASSIMO_ORA)
  assert.equal(m.attesa.length, 1, 'il settimo aspetta')
  // un'ora dopo il primo, c'è di nuovo posto
  const dopo = decidi(m, [], T0 + 3_600_000)
  assert.equal(dopo.esce?.length, 1)
})

test('di notte niente suona: la mattina esce tutto in uno, col punto a parlare', () => {
  const notte = { da: '22:00', a: '07:00' }
  const alle3 = new Date('2026-10-16T03:00:00')
  const fine = fineDellaNotte(alle3, notte)!
  assert.equal(new Date(fine).getHours(), 7)
  const a = decidi(vuota(), [c('lavoro', 'a'), c('bozza', 'b')], alle3.getTime(), fine)
  assert.equal(a.esce, null)
  assert.equal(a.prossimo, fine + DOPO_LA_NOTTE_MS)
  const punto = dallaMattina({ giorno: '2026-10-16', fatte: 2 })
  const b = decidi(a.memoria, [punto], fine + 30_000, null)
  assert.equal(b.esce?.length, 3)
  const n = componi(b.esce!)
  assert.equal(n.titolo, 'Your morning briefing is ready.')
  assert.equal(n.corpo, '2 things done overnight.')
  assert.equal(n.dove, 'casa')
})

test('la notte: fuori dalla finestra non c’è, e una finestra di giorno vale', () => {
  const notte = { da: '22:00', a: '07:00' }
  assert.equal(fineDellaNotte(new Date('2026-10-15T15:00:00'), notte), null)
  assert.equal(fineDellaNotte(new Date('2026-10-15T23:30:00'), notte), new Date('2026-10-16T07:00:00').getTime())
  assert.equal(fineDellaNotte(new Date('2026-10-15T15:00:00'), null), null)
  assert.equal(fineDellaNotte(new Date('2026-10-15T13:00:00'), { da: '12:00', a: '14:00' }), new Date('2026-10-15T14:00:00').getTime())
  assert.equal(fineDellaNotte(new Date('2026-10-15T13:00:00'), { da: '07:00', a: '07:00' }), null)
})

test('tornato sulla finestra: quello che aspettava non si dice più', () => {
  const a = decidi(vuota(), [c('bozza', 'a')], T0)
  const b = decidi(a.memoria, [c('bozza', 'b')], T0 + 1000)
  const m = visto(b.memoria, [c('file', 'f')])
  assert.equal(m.attesa.length, 0)
  const d = decidi(m, [c('bozza', 'b'), c('file', 'f')], T0 + OGNI_GENERE_MS)
  assert.equal(d.esce, null)
})

test('il punto si dice una volta al giorno, da qualunque strada arrivi', () => {
  const mattina = dallaMattina({ giorno: '2026-10-16', fatte: 1 })
  assert.equal(mattina.corpo, 'One thing done overnight.')
  const a = decidi(vuota(), [mattina], T0)
  const b = decidi(a.memoria, [{ genere: 'punto', id: '2026-10-16', corpo: 'Northwind moved', dove: 'casa' }], T0 + OGNI_GENERE_MS * 3)
  assert.equal(b.esce, null)
})

test('una riga pronta: il genere viene da quello che ha consegnato, e il clic la apre', () => {
  const base = { id: 'c1', testo: 'Reply to Anna about the pilot', titolo: 'Reply to Anna', versione: 2 }
  assert.equal(daRiga('pronto', { ...base, email: { a: 'anna@example.com' } }).genere, 'bozza')
  assert.equal(daRiga('pronto', { ...base, consegna: { app: 'File' } }).genere, 'file')
  assert.equal(daRiga('pronto', base).genere, 'lavoro')
  assert.equal(daRiga('chiede', { ...base, email: {} }).genere, 'chiede')
  const r = daRiga('pronto', base)
  assert.equal(r.corpo, 'Reply to Anna')
  assert.deepEqual(r.dove, { dove: 'compito', id: 'c1' })
  // rifatta con «Cambia» e pronta di nuovo: è una notizia nuova
  assert.notEqual(r.id, daRiga('pronto', { ...base, versione: 3 }).id)
  // una sola, il titolo del suo genere
  assert.equal(componi([daRiga('pronto', { ...base, email: {} })]).titolo, 'A reply is ready.')
  assert.equal(componi([daRiga('pronto', { ...base, consegna: {} })]).titolo, 'Your file is ready.')
})

test('il feed: solo le carte nuove del peso più alto, non viste', () => {
  const prima = new Set(['v0'])
  const voci = [
    { id: 'v0', titolo: 'già lì', peso: 3 },
    { id: 'v1', titolo: 'Invoice due today', peso: 3 },
    { id: 'v2', titolo: 'Background read', peso: 1 },
    { id: 'v3', titolo: 'Senza peso', peso: null },
    { id: 'v4', titolo: 'Già vista', peso: 3, vista: '2026-10-15T10:00:00Z' }
  ]
  const fuori = dalFeed(prima, voci)
  assert.deepEqual(fuori.map(x => x.id), ['v1'])
  assert.deepEqual(fuori[0].dove, { dove: 'voce', id: 'v1' })
  assert.equal(componi(fuori).titolo, 'Something matters today.')
})

test('tante nello stesso posto: il clic porta lì', () => {
  const n = componi([c('lavoro', 'a'), { ...c('lavoro', 'b'), dove: { dove: 'compito', id: 'a' } }])
  assert.deepEqual(n.dove, { dove: 'compito', id: 'a' })
})

test('il corpo resta corto', () => {
  const n = componi([c('lavoro', 'a', 'x'.repeat(500))])
  assert.ok(n.corpo.length <= 200)
})
