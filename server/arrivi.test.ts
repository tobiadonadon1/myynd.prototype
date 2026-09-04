// Cosa è arrivato, e cosa era solo già lì.
//
// Il feed si aggiorna da solo quando compare un file nuovo sul Mac, e per farlo
// deve saper rispondere a una domanda che sembra banale: «cos'è cambiato da
// quando ho guardato l'ultima volta?». Non lo sapeva, per due motivi che si
// sommavano:
//
//   · `salvaDocumenti` riscriveva ogni riga a ogni lettura, anche quando sul
//     disco non si era mosso niente. `indicizzato` finiva per dire «l'ultima
//     volta che ho guardato» invece di «l'ultima volta che è cambiato», e su
//     una colonna così non si può costruire niente.
//   · `recenti()` ordina per la data *del documento*. Un contratto del 2023
//     messo nella cartella stamattina non è recente per nessuno, e infatti non
//     compariva — pur essendo la cosa più nuova successa quel giorno.
//
// Questi test tengono chiuse tutte e due le porte.
//
//   node --test server/*.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Documento } from './store.ts'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-arrivi-'))
const CASA_VERA = process.env.HOME
process.env.HOME = CASA

const store = await import('./store.ts')

after(() => {
  process.env.HOME = CASA_VERA
  rmSync(CASA, { recursive: true, force: true })
})

const doc = (id: string, sopra: Partial<Documento> = {}): Documento => ({
  id, fonte: 'desktop', tipo: 'file', titolo: `Titolo di ${id}`,
  corpo: 'Il contenuto di prova, abbastanza lungo da essere indicizzato.',
  autore: null, percorso: `/prova/${id}`,
  quando: '2026-01-01T00:00:00.000Z', gruppo: 'documenti', ...sopra
})

const quandoIndicizzato = (id: string): string =>
  (store.default.prepare('SELECT indicizzato FROM documenti WHERE id = ?').get(id) as { indicizzato: string }).indicizzato

/*
 * Quanti documenti l'indice full-text conosce davvero.
 *
 * Non `SELECT COUNT(*) FROM ricerca`: da quando l'indice è a contenuto esterno
 * quella conta le righe di `documenti`, quindi risponde sempre che è tutto a
 * posto — cioè proprio quello che questa prova deve poter smentire.
 */
const righeFts = (): number => store.perProva.documentiNellIndice()

const righeDoc = (): number =>
  (store.default.prepare('SELECT COUNT(*) AS n FROM documenti').get() as { n: number }).n

test('un documento nuovo si conta come nuovo', () => {
  const e = store.salvaDocumenti([doc('a1'), doc('a2')])
  assert.deepEqual(e, { nuovi: 2, cambiati: 0, invariati: 0 })
})

test('rileggere lo stesso file non lo tocca, e non ne sposta la data', async () => {
  const prima = quandoIndicizzato('a1')
  // un attimo, perché due ISO nello stesso millisecondo non proverebbero niente
  await new Promise(r => setTimeout(r, 5))
  const e = store.salvaDocumenti([doc('a1'), doc('a2')])
  assert.deepEqual(e, { nuovi: 0, cambiati: 0, invariati: 2 },
    'ha riscritto righe che non erano cambiate')
  assert.equal(quandoIndicizzato('a1'), prima,
    '`indicizzato` si è spostato su un documento che non è cambiato: da lì in poi ' +
    'non si può più sapere cosa sia davvero arrivato')
})

test('un file modificato si conta come cambiato, e la data si sposta', async () => {
  const prima = quandoIndicizzato('a1')
  await new Promise(r => setTimeout(r, 5))
  const e = store.salvaDocumenti([doc('a1', { corpo: 'Il contenuto è stato riscritto da capo.' })])
  assert.deepEqual(e, { nuovi: 0, cambiati: 1, invariati: 0 })
  assert.notEqual(quandoIndicizzato('a1'), prima)
})

test('basta che cambi il titolo, non serve che cambi il corpo', () => {
  const e = store.salvaDocumenti([doc('a2', { titolo: 'Un altro titolo' })])
  assert.deepEqual(e, { nuovi: 0, cambiati: 1, invariati: 0 })
})

test('anche la data del documento conta come cambiamento', () => {
  const e = store.salvaDocumenti([doc('a2', { titolo: 'Un altro titolo', quando: '2026-05-05T00:00:00.000Z' })])
  assert.deepEqual(e, { nuovi: 0, cambiati: 1, invariati: 0 })
})

test('saltare i documenti invariati non sfasa l\'indice full-text', () => {
  store.salvaDocumenti([doc('b1'), doc('b2'), doc('b3')])
  store.salvaDocumenti([doc('b1'), doc('b2'), doc('b3')])
  assert.equal(righeFts(), righeDoc(),
    'le due tabelle si sono disallineate: l\'indice è una copia, non un archivio')
})

test('un documento mai indicizzato torna cercabile alla prossima lettura', () => {
  // La condizione più insidiosa: se `salvaDocumenti` si fidasse solo del
  // confronto dei campi, un documento entrato senza la sua riga di indice non
  // tornerebbe cercabile mai più — resterebbe lì a farsi contare, invisibile.
  // Il segno che dice «questo non è indicizzato» sono le radici vuote.
  store.default.prepare('UPDATE documenti SET radici = NULL WHERE id = ?').run('b1')

  const e = store.salvaDocumenti([doc('b1')])
  assert.equal(e.cambiati, 1, 'ha saltato un documento che non era più cercabile')
  assert.ok(
    (store.default.prepare('SELECT radici FROM documenti WHERE id = ?').get('b1') as { radici: string | null }).radici,
    'non l\'ha rimesso nell\'indice'
  )
})

test('un indice di ricerca danneggiato si rifà da solo, e quello che c’era torna', () => {
  /*
   * L'altro guasto, e non è lo stesso.
   *
   * Da quando l'indice è a contenuto esterno, i trigger lo tengono allineato ai
   * documenti: scrivendo non può più sfasarsi. Ma un file danneggiato o una
   * riga tolta a mano lasciano documenti che ci sono e non si trovano — e
   * quello non somiglia a un guasto, somiglia a «Myynd non sa niente di quel
   * cliente». Qui si toglie una riga dall'indice lasciando il documento al suo
   * posto, e si controlla che la manutenzione la rimetta.
   */
  const d = doc('cercabile', { titolo: 'Preventivo per il capannone di Vicenza' })
  store.salvaDocumenti([d])
  assert.equal(store.cerca('capannone Vicenza', 5).length, 1, 'la premessa: prima si trovava')

  const riga = store.default.prepare(
    'SELECT rid, titolo, corpo, autore, radici FROM documenti WHERE id = ?'
  ).get('cercabile') as { rid: number; titolo: string; corpo: string; autore: string | null; radici: string | null }
  // il comando 'delete' è l'unico modo di togliere una riga da un indice a
  // contenuto esterno: un `DELETE FROM ricerca` non fa niente e non dà errore
  store.default.prepare(
    "INSERT INTO ricerca(ricerca, rowid, titolo, corpo, autore, radici) VALUES('delete', ?, ?, ?, ?, ?)"
  ).run(riga.rid, riga.titolo, riga.corpo, riga.autore ?? '', riga.radici ?? '')
  assert.equal(store.cerca('capannone Vicenza', 5).length, 0, 'la premessa: adesso non si trova più')

  const esito = store.verificaLIndice()
  assert.equal(esito.rifatto, true, 'se n’è accorto e l’ha rifatto')
  assert.equal(store.cerca('capannone Vicenza', 5).length, 1, 'e il documento si ritrova')
})

test('appenaArrivati vede quello che è entrato, non quello che ha una data recente', async () => {
  const soglia = new Date().toISOString()
  await new Promise(r => setTimeout(r, 5))

  // un documento vecchissimo, messo nella cartella adesso
  store.salvaDocumenti([doc('vecchio-ma-nuovo', {
    titolo: 'Contratto 2019', quando: '2019-03-01T00:00:00.000Z'
  })])

  const arrivati = store.appenaArrivati(soglia)
  assert.ok(arrivati.some(d => d.id === 'vecchio-ma-nuovo'),
    'un file del 2019 messo nella cartella oggi non risulta arrivato oggi')

  // e `recenti`, che ordina per la data del documento, non lo vede mai
  const perData = store.recenti(5)
  assert.ok(!perData.some(d => d.id === 'vecchio-ma-nuovo'),
    'la premessa del test non regge: recenti() lo ha pescato')
})

test('appenaArrivati non ripesca quello che era già lì', async () => {
  await new Promise(r => setTimeout(r, 5))
  const soglia = new Date().toISOString()
  await new Promise(r => setTimeout(r, 5))
  // Una rilettura che non cambia niente non deve far sembrare arrivato niente.
  // I documenti si rimandano *identici* a com'erano — è la rilettura ogni sei
  // ore, quella che prima marcava tutto il corpus come appena visto.
  const e = store.salvaDocumenti([doc('b2'), doc('b3')])
  assert.deepEqual(e, { nuovi: 0, cambiati: 0, invariati: 2 }, 'la premessa del test non regge')
  assert.deepEqual(store.appenaArrivati(soglia), [],
    'una rilettura a vuoto ha fatto risultare «arrivati» dei documenti fermi')
})
