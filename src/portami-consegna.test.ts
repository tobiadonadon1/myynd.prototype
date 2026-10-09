// «Apri» su un file consegnato, anche nel foglio della ricevuta.
//
// Il server non dà una `porta` a un file scritto da sé (non viene da un
// documento): la riga del foglio, del calendario e della lista non disegnava
// il bottone, e il file si apriva solo dalla prima pagina. Qui si guarda il
// sorgente, come `accesso-mac.test.ts`; la schermata la fotografa
// `prove/passi/ricevuta.json`.
//
//   node --test src/portami-consegna.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const oggi = readFileSync(new URL('./oggi/Oggi.tsx', import.meta.url), 'utf8')

test('a delivered file has its Open button on every row, not only on the first page', () => {
  const portami = oggi.slice(oggi.indexOf('function Portami('), oggi.indexOf('export function etichettaPortami'))
  assert.match(portami, /if \(!c\.porta && !c\.consegna\) return null/)
  assert.doesNotMatch(portami, /if \(!c\.porta\) return null/)
  assert.match(oggi, /c\.consegna\.app === 'File' \? t\('Apri'\)/)
})
