// Come le carte scadono da sole, e perché.
//
// Il caso che regge tutto: nata lunedì alle 20:00 con «domani 9:30», il
// martedì è ancora lì («Oggi 9:30»), il mercoledì mattina è sparita, con
// ragione `data`. Una senza data sta quattro giorni (`tempo`); sopra le venti
// aperte escono le più leggere, non le più vecchie (`tetto`).
//
//   node --test server/scadi.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-scadi-'))
process.env.MYYND_DATI = CASA
writeFileSync(join(CASA, 'config.json'), JSON.stringify({ lingua: 'it' }))
const store = await import('./store.ts')
const { pillolaDi } = await import('./data-carta.ts')
before(() => store.azzeraTutto())
after(() => { store.chiudiIndici(); delete process.env.MYYND_DATI; rmSync(CASA, { recursive: true, force: true }) })

const GIORNO = 86_400_000
const LUNEDI_SERA = new Date(2026, 8, 21, 20, 0)
const MARTEDI = new Date(2026, 8, 22, 9, 30)
const MERCOLEDI = new Date(2026, 8, 23, 7, 0)

/**
 * Una carta nata a quell'ora, con quella pillola e quel peso, scritta dritta
 * nella tabella: `salvaFeed` ed `elencoFeed` fanno scadere con l'orologio
 * vero, e qui i giorni sono quelli della prova.
 */
let n = 0
function nata(titolo: string, quando: Date, urgenza: string | null, peso: number | null = null): string {
  const id = `f-prova-${++n}`
  store.default.prepare('INSERT INTO feed (id, tipo, titolo, testo, urgenza, stato, quando, peso) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, 'Da decidere', titolo, `Il testo di ${titolo}.`, urgenza, 'aperto', quando.toISOString(), peso)
  return id
}
const stato = (id: string) => store.voceFeed(id)!
const aperte = (adesso: Date) => {
  store.scadiFeed(undefined, undefined, adesso.getTime())
  return (store.default.prepare("SELECT id FROM feed WHERE stato = 'aperto'").all() as { id: string }[]).map(v => v.id)
}

test('il caso del prodotto: nata lunedì 20:00 con «domani 9:30», sta martedì, sparisce mercoledì mattina con ragione data', () => {
  store.azzeraTutto()
  const id = nata('Rispondi a Sam sul prezzo del corso', LUNEDI_SERA, '22 set 9:30')
  assert.equal(pillolaDi(stato(id).urgenza, stato(id).quando, LUNEDI_SERA), 'Domani 9:30')
  assert.ok(aperte(LUNEDI_SERA).includes(id))
  assert.ok(aperte(MARTEDI).includes(id), 'il giorno della data è ancora lì')
  assert.equal(pillolaDi(stato(id).urgenza, stato(id).quando, MARTEDI), 'Oggi 9:30')
  assert.ok(!aperte(MERCOLEDI).includes(id), 'il giorno dopo la sua data è sparita')
  assert.equal(stato(id).stato, 'scaduto')
  assert.equal(stato(id).ragione, 'data')
  assert.ok(stato(id).risposto)
})

test('una carta con la data non scade per età: nata sei giorni prima della sua data resta oltre i quattro giorni, fino al giorno dopo', () => {
  store.azzeraTutto()
  const nascita = new Date(2026, 8, 20, 10)
  const id = nata('Paga la fattura di Rossi', nascita, '26 set')
  assert.ok(aperte(new Date(2026, 8, 25, 10)).includes(id), 'cinque giorni dopo la nascita, un giorno prima della data')
  assert.ok(aperte(new Date(2026, 8, 26, 23)).includes(id), 'il giorno della data')
  assert.ok(!aperte(new Date(2026, 8, 27, 0, 30)).includes(id), 'il giorno dopo')
  assert.equal(stato(id).ragione, 'data')
})

test('una carta senza data scade dopo quattro giorni (tempo), non a tre', () => {
  store.azzeraTutto()
  const nascita = new Date(2026, 8, 20, 10)
  const tre = nata('Una cosa senza data', nascita, 'Nessuna fretta')
  const vuota = nata('Un’altra senza pillola', nascita, null)
  const adesso3 = new Date(nascita.getTime() + 3 * GIORNO + 3_600_000)
  assert.ok(aperte(adesso3).includes(tre) && aperte(adesso3).includes(vuota), 'a tre giorni restano')
  const adesso4 = new Date(nascita.getTime() + 4 * GIORNO + 3_600_000)
  assert.ok(!aperte(adesso4).includes(tre) && !aperte(adesso4).includes(vuota), 'a quattro giorni passati se ne vanno')
  assert.equal(stato(tre).ragione, 'tempo')
  assert.equal(stato(vuota).ragione, 'tempo')
})

test('ventuno aperte: scade la più leggera, non la più vecchia; esattamente venti: nessuna', () => {
  store.azzeraTutto()
  const adesso = new Date(2026, 8, 21, 12)
  const ids: string[] = []
  for (let i = 0; i < 20; i++) ids.push(nata(`Cosa numero ${i} da fare`, new Date(adesso.getTime() - (20 - i) * 3_600_000), null, 2))
  assert.equal(aperte(adesso).length, 20, 'venti non è oltre il parapetto')
  // la ventunesima è la più recente ma la più leggera
  const leggera = nata('La cosa leggera, appena arrivata', adesso, null, 0.5)
  const dopo = aperte(new Date(adesso.getTime() + 60_000))
  assert.equal(dopo.length, 20)
  assert.ok(!dopo.includes(leggera), 'è uscita la più leggera')
  assert.ok(dopo.includes(ids[0]), 'la più vecchia, che pesa di più, è rimasta')
  assert.equal(stato(leggera).ragione, 'tetto')
  // a parità di peso esce la più vecchia
  // senza peso vale 1.5: meno delle venti a peso 2, quindi esce lei
  const senzaPeso = nata('Una senza peso', new Date(adesso.getTime() + 120_000), null, null)
  const dopo2 = aperte(new Date(adesso.getTime() + 180_000))
  assert.ok(!dopo2.includes(senzaPeso))
  assert.equal(stato(senzaPeso).ragione, 'tetto')
  // a parità di peso esce la più vecchia
  const nuova = nata('Una nuova a peso due', new Date(adesso.getTime() + 240_000), null, 2)
  const dopo3 = aperte(new Date(adesso.getTime() + 300_000))
  assert.ok(dopo3.includes(nuova))
  assert.ok(!dopo3.includes(ids[0]), 'a parità di peso è uscita la più vecchia')
  assert.equal(store.FEED_APERTE_MAX, 20)
  assert.equal(store.FEED_GIORNI_MAX, 4)
})

test('riaprire una carta cancella la ragione, chiuderla la scrive', () => {
  store.azzeraTutto()
  const id = nata('Una carta da chiudere', new Date(), null)
  store.cambiaStatoFeed(id, 'scartato', 'Non è una cosa sua.', 'non_mia')
  assert.equal(stato(id).ragione, 'non_mia')
  store.cambiaStatoFeed(id, 'aperto')
  assert.equal(stato(id).ragione, null, 'Annulla ritira quello che aveva insegnato')
  store.cambiaStatoFeed(id, 'fatto', 'Già fatto.', 'lui')
  assert.equal(stato(id).ragione, 'lui')
  assert.equal(stato(id).motivo, 'Già fatto.')
  // senza motivo lo stato cambia lo stesso, con la ragione
  store.cambiaStatoFeed(id, 'scaduto', undefined, 'superata')
  assert.equal(stato(id).ragione, 'superata')
  assert.equal(stato(id).motivo, 'Già fatto.', 'il motivo di prima non si tocca')
  // riaprire con un motivo vuoto: ragione via
  store.cambiaStatoFeed(id, 'aperto', '', 'lui')
  assert.equal(stato(id).ragione, null)
})

test('nata lunedì con «next Monday» sta martedì: scade la settimana dopo, non il giorno dopo; e una pillola «stasera» di prima scade martedì', async () => {
  store.azzeraTutto()
  const { assoluta } = await import('./data-carta.ts')
  const prossimo = nata('Fai la revisione con Marco', LUNEDI_SERA, assoluta('next Monday', LUNEDI_SERA))
  assert.equal(stato(prossimo).urgenza, '28 set')
  assert.ok(aperte(MARTEDI).includes(prossimo), 'il martedì è ancora lì')
  assert.ok(aperte(new Date(2026, 8, 28, 23)).includes(prossimo), 'il lunedì dopo è il suo giorno')
  assert.ok(!aperte(new Date(2026, 8, 29, 7)).includes(prossimo), 'il martedì dopo è sparita')
  assert.equal(stato(prossimo).ragione, 'data')
  // una pillola relativa scritta prima di P2: «stasera» si legge sulla nascita, e il giorno dopo scade per data
  const stasera = nata('Chiama Anna sul contratto', LUNEDI_SERA, 'stasera')
  assert.equal(pillolaDi(stato(stasera).urgenza, stato(stasera).quando, LUNEDI_SERA), 'Oggi')
  assert.ok(!aperte(MARTEDI).includes(stasera))
  assert.equal(stato(stasera).ragione, 'data')
})
