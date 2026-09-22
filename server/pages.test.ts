// Il testo di un documento Pages, senza un documento Pages vero.
//
// I file veri sono suoi e non entrano nel repository: qui se ne costruisce
// uno a mano, byte per byte, con la stessa forma — uno zip con dentro
// `Index/Document.iwa`, pezzi Snappy, un ArchiveInfo e un messaggio 2001 con
// il testo nel campo 3. Se la forma cambia, la prova lo dice prima di lui.
//
// Provato il 22 settembre 2026 anche su quattro suoi `.pages` copiati in una
// cartella usa e getta: il testo intero, da 1 a 26 ms l'uno.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { snappy, testoDaIwa, testoDaPages } from './connettori/pages.ts'
import { leggibile, tipoDi, daBuffer } from './connettori/estrai.ts'

const varint = (n: number): number[] => {
  const b: number[] = []
  while (n >= 0x80) { b.push((n & 0x7f) | 0x80); n = Math.floor(n / 128) }
  b.push(n)
  return b
}
const campo = (n: number, dati: number[]) => [...varint(n * 8 + 2), ...varint(dati.length), ...dati]
const intero = (n: number, v: number) => [...varint(n * 8), ...varint(v)]
const utf8 = (s: string) => [...new TextEncoder().encode(s)]

/** Snappy con soli letterali: valido, anche se non comprime niente. */
function soloLetterali(dati: number[]): number[] {
  const fuori = [...varint(dati.length)]
  for (let i = 0; i < dati.length; i += 60) {
    const pezzo = dati.slice(i, i + 60)
    fuori.push((pezzo.length - 1) << 2, ...pezzo)
  }
  return fuori
}

/** Un Document.iwa con un messaggio di testo e uno che non lo è. */
function iwa(testi: string[]): Uint8Array {
  const oggetti: number[] = []
  testi.forEach((t, k) => {
    const corpo = campo(3, utf8(t))
    const altro = campo(3, utf8('not the text'))
    const info = [...intero(1, k + 1),
      ...campo(2, [...intero(1, 2001), ...intero(3, corpo.length)]),
      ...campo(2, [...intero(1, 3001), ...intero(3, altro.length)])]
    oggetti.push(...varint(info.length), ...info, ...corpo, ...altro)
  })
  const compresso = soloLetterali(oggetti)
  return new Uint8Array([0, compresso.length & 0xff, (compresso.length >> 8) & 0xff, (compresso.length >> 16) & 0xff, ...compresso])
}

test('Snappy: i letterali e le copie che si sovrappongono', () => {
  // «abc», poi «copia sei byte da tre indietro»: abcabcabc
  const fuori = snappy(new Uint8Array([9, 8, 97, 98, 99, 9, 3]))
  assert.equal(new TextDecoder().decode(fuori), 'abcabcabc')
  assert.throws(() => snappy(new Uint8Array([9, 8, 97, 98, 99, 9, 7])), /copia fuori misura/, 'una copia da prima dell’inizio è un file storto')
})

test('il testo sta nei messaggi 2001, il corpo prima delle caselle, e i segni di Pages diventano a capo', () => {
  const corpo = 'Reddiset: where we’d start\u2028Trey, here’s how I’d approach this.\uFFFC\u0004Page two.'
  const t = testoDaIwa(iwa(['A caption', corpo]))
  assert.equal(t, 'Reddiset: where we’d start\nTrey, here’s how I’d approach this.\nPage two.\n\nA caption')
  assert.doesNotMatch(t, /not the text/, 'un messaggio di un altro tipo non è testo')
})

test('un .pages vero passa dall’estrattore come un .docx: leggibile, «documento», dal lavoratore', async () => {
  const zip = new JSZip()
  zip.file('Index/Document.iwa', iwa(['Offer for H-Farm: three workshops, one price.']))
  zip.file('Metadata/Properties.plist', '<plist/>')
  const buf = await zip.generateAsync({ type: 'nodebuffer' })
  assert.equal(await testoDaPages(buf), 'Offer for H-Farm: three workshops, one price.')
  assert.equal(leggibile('Offer.pages'), true)
  assert.equal(tipoDi('Offer.pages'), 'documento')
  assert.equal(await daBuffer(buf, 'Offer.pages'), 'Offer for H-Farm: three workshops, one price.')
})

test('un .pages storto o vecchio è un documento in meno, non una lettura ferma', async () => {
  assert.equal(await testoDaPages(Buffer.from('not a zip')), '')
  const senza = new JSZip()
  senza.file('index.xml', '<old pages/>')
  assert.equal(await testoDaPages(await senza.generateAsync({ type: 'nodebuffer' })), '')
  const rotto = new JSZip()
  rotto.file('Index/Document.iwa', new Uint8Array([0, 9, 0, 0, 1, 2, 3]))
  assert.equal(await testoDaPages(await rotto.generateAsync({ type: 'nodebuffer' })), '')
})
