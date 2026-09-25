// I pezzi puri delle citazioni: la riga della fonte, il nome piano, le
// virgolette, dove sta un passo.
//
//   node --test src/citazioni.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'

// `impostaLingua` scrive `document.documentElement.lang`, e qui la pagina non
// c'è: due righe di finta pagina, prima dell'import (come in frasi.test.ts)
;(globalThis as unknown as { document: unknown }).document = { documentElement: { lang: '' } }
const { impostaLingua } = await import('./lingua.ts')
const { doveNelBlocco, fonteMemoria, nomeFonteDoc, perNumero, rigaFonte, titoloDi, trovaPasso, virgolette } = await import('./citazioni.ts')

const OGGI = new Date('2026-09-24T12:00:00')

test('la riga della fonte: nome senza indirizzo, «Tu» se inviata, l’anno solo se non è questo, senza le parti che mancano', () => {
  impostaLingua('en')
  assert.equal(rigaFonte({ id: 'a', label: '[1] x', fonte: 'posta', tipo: 'email', autore: '"Marco Rossi" <m@x.example>', quando: '2026-09-03T10:00:00' }, OGGI), 'Mail · Marco Rossi · Sep 3')
  assert.equal(rigaFonte({ id: 'a', label: '[1] x', fonte: 'posta', tipo: 'email', autore: 'Alex <a@x.example>', quando: '2026-09-03T10:00:00', inviato: true }, OGGI), 'Mail · You · Sep 3')
  assert.equal(rigaFonte({ id: 'a', label: '[1] x', fonte: 'posta', tipo: 'email', autore: 'Marco Rossi', quando: '2025-09-03T10:00:00' }, OGGI), 'Mail · Marco Rossi · Sep 3, 2025')
  assert.equal(rigaFonte({ id: 'a', label: '[1] x', fonte: 'desktop', tipo: 'documento' }, OGGI), 'My Mac')
  assert.equal(rigaFonte({ id: 'a', label: '[1] x', fonte: 'posta', autore: 'nora@harbor.example' }, OGGI), 'Mail · nora')
  impostaLingua('it')
  assert.equal(rigaFonte({ id: 'a', label: '[1] x', fonte: 'posta', tipo: 'email', autore: 'Marco Rossi <m@x>', quando: '2026-09-03T10:00:00' }, OGGI), 'Posta · Marco Rossi · 3 set')
  assert.equal(rigaFonte({ id: 'a', label: '[1] x', fonte: 'posta', inviato: true, quando: '2026-09-03T10:00:00' }, OGGI), 'Posta · Tu · 3 set')
  impostaLingua('en')
})

test('il nome piano di ogni fonte', () => {
  impostaLingua('en')
  assert.equal(nomeFonteDoc('posta', 'email'), 'Mail')
  assert.equal(nomeFonteDoc('email'), 'Mail')
  assert.equal(nomeFonteDoc('calendario', 'evento'), 'Calendar')
  assert.equal(nomeFonteDoc('desktop'), 'My Mac')
  assert.equal(nomeFonteDoc('note'), 'Notes')
  assert.equal(nomeFonteDoc('lavoro'), 'Work folder')
  assert.equal(nomeFonteDoc('conversazioni'), 'Conversations')
  assert.equal(nomeFonteDoc('memoria'), 'From your memory')
  for (const [k, v] of [['notion', 'Notion'], ['granola', 'Granola'], ['slack', 'Slack'], ['drive', 'Google Drive'], ['dropbox', 'Dropbox'], ['github', 'GitHub'], ['whatsapp', 'WhatsApp Business'], ['x', 'X']]) assert.equal(nomeFonteDoc(k), v)
  assert.equal(nomeFonteDoc(undefined), '')
  impostaLingua('it')
  assert.equal(nomeFonteDoc('posta'), 'Posta')
  assert.equal(nomeFonteDoc('desktop'), 'Il mio Mac')
  impostaLingua('en')
})

test('virgolette, numero, memoria e titolo', () => {
  assert.equal(virgolette('x', true), '“x”')
  assert.equal(virgolette('x', false), '«x»')
  const fonti = [{ id: 'a', label: '[3] Tre' }, { id: 'b', label: '[104] Cento' }, { id: 'm', label: '[M] Northwind' }]
  assert.equal(perNumero(fonti, 3)?.id, 'a')
  assert.equal(perNumero(fonti, 104)?.id, 'b')
  assert.equal(perNumero(fonti, 1), undefined)
  assert.equal(fonteMemoria(fonti)?.id, 'm')
  assert.equal(titoloDi(fonti[2]), 'Northwind')
  assert.equal(titoloDi(fonti[1]), 'Cento')
})

test('dove sta un passo: trovato, non trovato, e con i «…» del taglio', () => {
  const blocchi = [{ testo: 'Hi Alex,' }, { testo: 'we confirm the Harbor pilot starts on 14 October 2026 with two suppliers, Brightline and Keel.' }, { testo: 'Nora' }]
  assert.equal(trovaPasso(blocchi, 'the Harbor pilot starts on 14 October 2026'), 1)
  assert.equal(trovaPasso(blocchi, '…pilot starts on 14 October 2026 with two suppliers…'), 1)
  assert.equal(trovaPasso(blocchi, 'the fee is €4,800'), -1)
  assert.equal(trovaPasso(blocchi, 'short'), -1)
  assert.deepEqual(doveNelBlocco(blocchi[1].testo, '…pilot starts on 14 October 2026…'), [22, 53])
  assert.equal(blocchi[1].testo.slice(22, 53), 'pilot starts on 14 October 2026')
  assert.equal(doveNelBlocco(blocchi[1].testo, 'nothing here at all'), null)
  // apostrofi e spazi diversi non contano
  assert.equal(trovaPasso([{ testo: 'l’ufficio  di Lisbona è chiuso' }], "l'ufficio di Lisbona"), 0)
})

test('il passo del k-esimo segno: da «passi» quando c’è, altrimenti «passo» vale solo per il primo', async () => {
  const { passoDi } = await import('./citazioni.ts')
  const conPassi = { id: 'a', label: '[1] Harbor', passo: 'data', passi: ['data', 'prezzo', null] }
  assert.equal(passoDi(conPassi, 0), 'data')
  assert.equal(passoDi(conPassi, 1), 'prezzo')
  assert.equal(passoDi(conPassi, 2), undefined)
  assert.equal(passoDi(conPassi, 3), undefined)
  const solo = { id: 'a', label: '[1] Harbor', passo: 'data' }
  assert.equal(passoDi(solo, 0), 'data')
  assert.equal(passoDi(solo, 1), undefined, 'la data del primo non prova il secondo')
  assert.equal(passoDi(undefined, 0), undefined)
})
