// Gli avvisi di sistema: cosa esce, quando, e in quanti.
//
//   node --test src/avvisi.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'

;(globalThis as unknown as { document: unknown }).document = { documentElement: { lang: '' } }
const { impostaLingua } = await import('./lingua.ts')
const {
  componi, daRiga, dalFeed, dallaMattina, decidi, fineDellaNotte, rimetti, senzaVecchie, visto, vuota,
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
  assert.equal(n.corpo, 'carta b · carta c · carta a', 'prima la risposta e il file, poi il resto')
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
  // il punto arriva trenta secondi dopo la fine: la notte vale ancora, e aspetta con le altre
  const punto = dallaMattina({ giorno: '2026-10-16', fatte: 2 })
  const dopo30 = fine + 30_000
  const b = decidi(a.memoria, [punto], dopo30, fineDellaNotte(new Date(dopo30), notte))
  assert.equal(b.esce, null)
  assert.equal(b.prossimo, fine + DOPO_LA_NOTTE_MS)
  const ora = fine + DOPO_LA_NOTTE_MS
  const c3 = decidi(b.memoria, [], ora, fineDellaNotte(new Date(ora), notte))
  assert.equal(c3.esce?.length, 3)
  const n = componi(c3.esce!)
  assert.equal(n.titolo, 'Your morning briefing is ready.')
  assert.equal(n.corpo, '2 things done overnight.')
  assert.equal(n.dove, 'casa')
  assert.deepEqual(n.fuori, [])
})

test('subito dopo la notte, una cosa nuova non scappa prima del punto', () => {
  const notte = { da: '22:00', a: '07:00' }
  const fine = new Date('2026-10-16T07:00:00').getTime()
  const adesso = fine + 20_000
  assert.equal(fineDellaNotte(new Date(adesso), notte), fine)
  const r = decidi(vuota(), [c('bozza', 'b')], adesso, fineDellaNotte(new Date(adesso), notte))
  assert.equal(r.esce, null)
  assert.equal(r.prossimo, fine + DOPO_LA_NOTTE_MS)
  // passato il minuto e mezzo, è giorno
  assert.equal(fineDellaNotte(new Date(fine + DOPO_LA_NOTTE_MS + 60_000), notte), null)
})

test('col punto, una domanda e una carta del feed si nominano; non spariscono dentro il punto', () => {
  const punto = dallaMattina({ giorno: '2026-10-16', fatte: 2, aspettano: 1 })
  assert.equal(punto.corpo, '2 done overnight, 1 waiting for you.')
  const n = componi([punto, c('lavoro', 'a'), c('chiede', 'q', 'Which build goes in the notes?'), c('feed', 'f', 'Invoice due today')])
  assert.equal(n.titolo, 'Your morning briefing is ready.')
  assert.equal(n.corpo, '2 done overnight, 1 waiting for you. · Which build goes in the notes? · Invoice due today')
  assert.deepEqual(n.fuori, [])
})

test('quello che non entra nel corpo non è detto: torna ad aspettare, e non è visto', () => {
  const lunghe = [c('chiede', 'q1', 'q'.repeat(120)), c('chiede', 'q2', 'w'.repeat(120)), c('lavoro', 'l', 'short')]
  const r = decidi(vuota(), lunghe, T0)
  const n = componi(r.esce!)
  assert.equal(n.titolo, '2 things are ready.')
  assert.deepEqual(n.fuori.map(x => x.id), ['q2'])
  const m = rimetti(r.memoria, n.fuori, T0)
  assert.ok(!m.visti.includes('chiede:q2'))
  assert.deepEqual(m.attesa.map(x => x.id), ['q2'])
  // al giro dopo il suo genere, esce
  const d = decidi(m, [], T0 + OGNI_GENERE_MS)
  assert.deepEqual(d.esce?.map(x => x.id), ['q2'])
})

test('la notte: fuori dalla finestra non c’è, e una finestra di giorno vale', () => {
  const notte = { da: '22:00', a: '07:00' }
  assert.equal(fineDellaNotte(new Date('2026-10-15T15:00:00'), notte), null)
  assert.equal(fineDellaNotte(new Date('2026-10-15T23:30:00'), notte), new Date('2026-10-16T07:00:00').getTime())
  assert.equal(fineDellaNotte(new Date('2026-10-15T15:00:00'), null), null)
  assert.equal(fineDellaNotte(new Date('2026-10-15T13:00:00'), { da: '12:00', a: '14:00' }), new Date('2026-10-15T14:00:00').getTime())
  assert.equal(fineDellaNotte(new Date('2026-10-15T13:00:00'), { da: '07:00', a: '07:00' }), null)
})

test('tornato sulla prima pagina: quello che aspettava l’ha visto, e non si dice più', () => {
  const a = decidi(vuota(), [c('bozza', 'a')], T0)
  const b = decidi(a.memoria, [c('bozza', 'b')], T0 + 1000)
  const m = visto(b.memoria, [c('file', 'f')], 'myynd', T0 + 2000)
  assert.equal(m.attesa.length, 0)
  const d = decidi(m, [c('bozza', 'b'), c('file', 'f')], T0 + OGNI_GENERE_MS)
  assert.equal(d.esce, null)
})

test('tornato sulla chat: una domanda o una carta del feed non le ha viste, e aspettano', () => {
  const a = decidi(vuota(), [c('chiede', 'x'), c('feed', 'y')], T0)
  const b = decidi(a.memoria, [c('chiede', 'q'), c('feed', 'f')], T0 + 1000)
  assert.equal(b.memoria.attesa.length, 2)
  const m = visto(b.memoria, [c('feed', 'g')], 'chat', T0 + 2000)
  assert.deepEqual(m.attesa.map(x => x.id).sort(), ['f', 'g', 'q'])
  // in To do la domanda si vede; il feed no
  const oggi = visto(m, [], 'oggi', T0 + 3000)
  assert.deepEqual(oggi.attesa.map(x => x.id).sort(), ['f', 'g'])
  assert.ok(oggi.visti.includes('chiede:q'))
})

test('avvisi riaccesi: quello che aspetta da più di due ore se ne va, il resto resta', () => {
  const m = { ...vuota(), attesa: [{ ...c('lavoro', 'vecchia'), dal: T0 }, { ...c('lavoro', 'nuova'), dal: T0 + 2.5 * 3_600_000 }] }
  assert.deepEqual(senzaVecchie(m, T0 + 3 * 3_600_000).attesa.map(x => x.id), ['nuova'])
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
