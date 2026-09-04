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
