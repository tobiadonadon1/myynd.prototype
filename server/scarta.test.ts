// Togliersi una voce dal feed, e rimettercela.
//
// È l'unico gesto del feed che non lascia traccia da nessun'altra parte: una
// voce «fatta» resta fra le fatte, una messa in lista si vede in lista, questa
// sparisce. Perciò le due cose che contano sono che sparisca davvero — anche
// dalla prossima generazione, o tornerebbe domani — e che si possa rimettere
// finché l'avviso è in piedi.
//
//   node --test server/scarta.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-scarta-'))
process.env.MYYND_DATI = CASA

const store = await import('./store.ts')
const timone = await import('./timone.ts')
const cfg = await import('./config.ts')
const { MOTIVO_SCARTO } = await import('./feed-esiti.ts')

after(() => {
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

const voce = (titolo: string) =>
  ({ tipo: 'da leggere', titolo, testo: `Il testo di ${titolo}.`, fonte: 'posta' })

test('scartata esce dalle aperte, e non finisce fra le fatte', async () => {
  store.salvaFeed([voce('Newsletter di marzo'), voce('Preventivo Rossi')])
  const [prima] = store.elencoFeed('aperto')
  assert.equal(store.elencoFeed('aperto').length, 2)

  // la stessa chiamata che fa il bottone: stato deciso, nessun modello di mezzo
  const esito = await timone.rispondiAVoce(prima.id, 'Non mi interessa.', 'scartato')
  assert.equal(esito.stato, 'scartato')

  const aperte = store.elencoFeed('aperto')
  assert.equal(aperte.length, 1, 'la voce scartata è ancora fra le aperte')
  assert.ok(!aperte.some(v => v.id === prima.id))
  assert.ok(!store.elencoFeed('fatto').some(v => v.id === prima.id),
    'scartata non vuol dire fatta: non deve comparire fra le cose che hai chiuso')
})

test('e non torna alla prossima lettura', () => {
  const [aperta] = store.elencoFeed('aperto')
  const scartata = store.elencoFeed('aperto').length
  // rigenerare il feed riscrive le stesse voci: l'id nasce dal contenuto, e
  // senza il conflitto sull'id una voce buttata via tornerebbe ogni mattina
  store.salvaFeed([voce('Newsletter di marzo'), voce('Preventivo Rossi')])
  assert.equal(store.elencoFeed('aperto').length, scartata,
    'la voce scartata è tornata su da sola: il feed si riempie di roba già buttata')
  assert.equal(store.elencoFeed('aperto')[0].id, aperta.id)
})

test('«Annulla» la rimette dov’era', async () => {
  store.salvaFeed([voce('Fattura di aprile')])
  const v = store.elencoFeed('aperto').find(x => x.titolo === 'Fattura di aprile')!
  await timone.rispondiAVoce(v.id, 'Non mi interessa.', 'scartato')
  assert.ok(!store.elencoFeed('aperto').some(x => x.id === v.id))

  // è quello che fa `api.segnaFeed(id, 'aperto')` dietro il bottone dell'avviso
  store.cambiaStatoFeed(v.id, 'aperto')
  assert.ok(store.elencoFeed('aperto').some(x => x.id === v.id), 'annullare non l’ha rimessa')
})

test('quello che hai buttato lo sa anche il modello, per non riproportelo', () => {
  // `feedGiaVisto` è quello che entra nel prompt della prossima generazione:
  // se lo scarto non ci comparisse, il modello riscriverebbe la stessa voce
  const visti = store.feedGiaVisto(30)
  const scartata = visti.find(x => x.titolo === 'Newsletter di marzo')
  assert.ok(scartata, 'la voce scartata non arriva al modello: la riproporrà')
  assert.equal(scartata.stato, 'scartato')
  assert.equal(scartata.motivo, 'Non mi interessa.')
})

// — «Non utile», con una delle quattro ragioni —
//
// Vecchia, già fatta, non è mia, non si capisce: un tocco ciascuna, il motivo
// del vocabolario in italiano anche con l'app in inglese (lo legge il
// modello, non lui), e la ragione nella colonna. «Annulla» la cancella.

test('ogni ragione si salva con lo stato scartato, la sua ragione e il motivo italiano, anche con l’app in inglese', async () => {
  cfg.scrivi({ lingua: 'en' })
  const ragioni = ['vecchia', 'fatta', 'non_mia', 'non_chiara'] as const
  store.salvaFeed(ragioni.map(r => voce(`Carta ${r}`)))
  for (const r of ragioni) {
    const v = store.elencoFeed('aperto').find(x => x.titolo === `Carta ${r}`)!
    const esito = await timone.rispondiAVoce(v.id, '', 'scartato', r)
    assert.equal(esito.stato, 'scartato')
    assert.equal(esito.motivo, MOTIVO_SCARTO[r])
    const riga = store.voceFeed(v.id)!
    assert.equal(riga.stato, 'scartato')
    assert.equal(riga.ragione, r)
    assert.equal(riga.motivo, MOTIVO_SCARTO[r])
  }
})

test('«Annulla» rimette la carta aperta e cancella la ragione e il motivo', async () => {
  store.salvaFeed([voce('Da annullare')])
  const v = store.elencoFeed('aperto').find(x => x.titolo === 'Da annullare')!
  await timone.rispondiAVoce(v.id, '', 'scartato', 'vecchia')
  assert.equal(store.voceFeed(v.id)!.ragione, 'vecchia')
  // quello che fa `api.segnaFeed(id, 'aperto')`: la rotta scrive motivo vuoto e ragione nulla
  store.cambiaStatoFeed(v.id, 'aperto', '', null)
  const riga = store.voceFeed(v.id)!
  assert.equal(riga.stato, 'aperto')
  assert.equal(riga.ragione, null)
  assert.equal(riga.motivo, '')
})

test('una ragione fuori dal vocabolario è un errore, e la carta non si tocca', async () => {
  store.salvaFeed([voce('Intoccabile')])
  const v = store.elencoFeed('aperto').find(x => x.titolo === 'Intoccabile')!
  await assert.rejects(timone.rispondiAVoce(v.id, '', 'scartato', 'boh'), /Ragione sconosciuta\./)
  await assert.rejects(timone.rispondiAVoce(v.id, '', 'scartato', 'lui'), /Ragione sconosciuta\./)
  assert.equal(store.voceFeed(v.id)!.stato, 'aperto')
})

test('«Fatto» con le sue parole vale «lui»; uno scarto senza ragione non insegna niente', async () => {
  store.salvaFeed([voce('Fatta a parole'), voce('Scartata a parole')])
  const f = store.elencoFeed('aperto').find(x => x.titolo === 'Fatta a parole')!
  const s = store.elencoFeed('aperto').find(x => x.titolo === 'Scartata a parole')!
  await timone.rispondiAVoce(f.id, 'Già mandato ieri.', 'fatto')
  assert.equal(store.voceFeed(f.id)!.ragione, 'lui')
  await timone.rispondiAVoce(s.id, 'Non mi interessa.', 'scartato')
  assert.equal(store.voceFeed(s.id)!.ragione, null)
  const fv = store.elencoFeed('aperto').find(x => x.titolo === 'Newsletter di marzo')
  assert.ok(!fv)
})

test('mittentiScartati tace un mittente automatico solo per «non è mia» o senza ragione: «già fatta» e «vecchia» non lo tacciono', async () => {
  store.azzeraTutto()
  const mail = (id: string, autore: string) => ({ id, fonte: 'posta', tipo: 'email', titolo: `Fattura ${id}`, corpo: `Puoi pagare la fattura ${id} entro venerdì?`, autore, quando: new Date().toISOString() })
  store.salvaDocumenti([
    mail('posta:INBOX:1', 'Biller <noreply@biller.example>'),
    mail('posta:INBOX:2', 'Old news <newsletter@old.example>'),
    mail('posta:INBOX:3', 'Spam <promo@spam.example>'),
    mail('posta:INBOX:4', 'Legacy <notifications@legacy.example>')
  ])
  const conDoc = (titolo: string, doc: string) => ({ ...voce(titolo), doc })
  store.salvaFeed([
    conDoc('Paga la fattura del biller', 'posta:INBOX:1'), conDoc('Leggi le novità vecchie', 'posta:INBOX:2'),
    conDoc('Guarda la promozione', 'posta:INBOX:3'), conDoc('La notifica di prima', 'posta:INBOX:4')
  ])
  const di = (doc: string) => store.elencoFeed('aperto').find(x => x.doc === doc)!.id
  await timone.rispondiAVoce(di('posta:INBOX:1'), '', 'scartato', 'fatta')
  await timone.rispondiAVoce(di('posta:INBOX:2'), '', 'scartato', 'vecchia')
  await timone.rispondiAVoce(di('posta:INBOX:3'), '', 'scartato', 'non_mia')
  await timone.rispondiAVoce(di('posta:INBOX:4'), 'Non mi interessa.', 'scartato')
  assert.deepEqual(store.mittentiScartati().indirizzi.sort(), ['notifications@legacy.example', 'promo@spam.example'])
})
