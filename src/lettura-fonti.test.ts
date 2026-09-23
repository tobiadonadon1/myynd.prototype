// Più fonti lette insieme, una riga per fonte.
//
// Il filo della lettura arriva mescolato: il Mac, poi le sue cartelle di
// lavoro, poi l'agenda, poi una fonte che non risponde. Queste prove tengono
// ferme le cose che una persona vede: ogni fonte collegata ha la sua riga, il
// verde arriva solo quando quella fonte ha finito, e una fonte che non si
// legge dice perché senza fermare le altre.
//
//   node --test src/lettura-fonti.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'

;(globalThis as unknown as { document: unknown }).document = { documentElement: { lang: '' } }
const { impostaLingua } = await import('./lingua.ts')
const { avanzaLettura, chiudiLettura, dettaglioSincronizzazione, iniziaLettura, leggiAlProprioTurno, nonLette, GIA_IN_CORSO } = await import('./lettura-fonti.ts')
impostaLingua('en')

test('each connected source gets its own row, in the order given, once', () => {
  const r = iniziaLettura(['desktop', 'calendario', 'desktop', 'notion'])
  assert.deepEqual(r.map(x => [x.id, x.stato]), [['desktop', 'attesa'], ['calendario', 'attesa'], ['notion', 'attesa']])
})

test('a mixed stream becomes one row per source, and green comes only when that source is done', () => {
  let r = iniziaLettura(['desktop', 'calendario', 'notion', 'whatsapp'])
  const filo: Record<string, unknown>[] = [
    { fase: 'desktop', stato: 'apro le cartelle' },
    { fase: 'desktop', stato: '3 documenti', fatti: 3 },
    // le cartelle di lavoro finiscono prima del Mac: il Mac non deve diventare verde
    { fase: 'lavoro', stato: 'fatto', documenti: 2 },
    { fase: 'x', stato: 'fatto', documenti: 40 },
    { fase: 'desktop', stato: 'fatto', documenti: 5, tolti: 1 },
    { fase: 'notion', stato: 'guaio', errore: 'Il token di Notion non è valido.' },
    { fase: 'calendario', stato: 'apro l’agenda' }
  ]
  const visti: string[] = []
  for (const m of filo) {
    r = avanzaLettura(r, m)
    visti.push(r.find(x => x.id === 'desktop')!.stato)
  }
  assert.deepEqual(visti.slice(0, 4), ['leggo', 'leggo', 'leggo', 'leggo'])
  assert.equal(r.find(x => x.id === 'desktop')!.stato, 'fatto')
  assert.equal(r.find(x => x.id === 'desktop')!.testo, '5 documents · 1 gone')
  assert.equal(r.find(x => x.id === 'calendario')!.stato, 'leggo', 'a source that failed before it does not stop it')
  assert.equal(r.find(x => x.id === 'notion')!.stato, 'guaio')
  assert.ok(r.every(x => x.id !== 'x'), 'a phase without a card adds no row')
  assert.equal(nonLette(r), 1)

  r = avanzaLettura(r, { fase: 'calendario', stato: 'fatto', documenti: 1 })
  assert.equal(r.find(x => x.id === 'calendario')!.testo, '1 document')
  // WhatsApp non manda niente: alla fine è letta, con i documenti che ha
  r = chiudiLettura(r, id => id === 'whatsapp' ? 12 : undefined)
  assert.deepEqual(r.map(x => [x.id, x.stato, x.testo]), [
    ['desktop', 'fatto', '5 documents · 1 gone'],
    ['calendario', 'fatto', '1 document'],
    ['notion', 'guaio', 'Il token di Notion non è valido.'],
    ['whatsapp', 'fatto', '12 documents']
  ])
})

test('the detail is the old progress line without the source name in front', () => {
  assert.equal(dettaglioSincronizzazione({ fase: 'posta', stato: 'x', fatti: 40, tot: 120 }), '40 of 120 messages')
  assert.equal(dettaglioSincronizzazione({ fase: 'posta', stato: 'fatto', documenti: 7, giaLetti: 30 }), '7 documents · 30 already read')
  impostaLingua('it')
  assert.equal(dettaglioSincronizzazione({ fase: 'desktop', stato: 'fatto', documenti: 1 }), '1 documento')
  impostaLingua('en')
})

test('a reading already running is waited for, anything else is reported at once', async () => {
  let volte = 0
  const attese: number[] = []
  await leggiAlProprioTurno(async () => { if (++volte < 3) throw new Error(GIA_IN_CORSO) }, async ms => { attese.push(ms) })
  assert.equal(volte, 3)
  assert.equal(attese.length, 2)

  volte = 0
  await assert.rejects(leggiAlProprioTurno(async () => { volte++; throw new Error('Lettura interrotta.') }, async () => {}), /interrotta/)
  assert.equal(volte, 1)

  volte = 0
  await assert.rejects(leggiAlProprioTurno(async () => { volte++; throw new Error(GIA_IN_CORSO) }, async () => {}, 4), /già in corso/)
  assert.equal(volte, 5, 'it gives up after its limit instead of waiting forever')
})
