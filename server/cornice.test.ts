// La cornice di una consegna: la riga dell'ipotesi, il corpo per chi riceve.
//
//   node --test server/cornice.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { corpoPerChiRiceve, haSegnaposto, rigaIpotesi, senzaRigaIpotesi } from './cornice.ts'

const CONSEGNA = 'Done: the reply to Marco, with the price from the list.\n\nCiao Marco,\n\nil corso da dodici persone costa 890 euro a persona.\n\nA presto,\nAlex\n\nPrice from the price list [2].\nI assumed Tuesday, October 6 as the kickoff [1].'

test('rigaIpotesi prende la riga dell\'ipotesi dal paragrafo finale, nelle due lingue, senza i numeri delle fonti', () => {
  assert.equal(rigaIpotesi(CONSEGNA), 'I assumed Tuesday, October 6 as the kickoff.')
  assert.equal(rigaIpotesi('Fatto: il piano.\n\nIl piano.\n\nHo supposto venerdì come scadenza [3].'), 'Ho supposto venerdì come scadenza.')
  assert.equal(rigaIpotesi('Done.\n\nBody.\n\nI\'ve assumed the June figures.'), 'I\'ve assumed the June figures.')
  assert.equal(rigaIpotesi('Done.\n\nBody.\n\nAssuming the budget stays flat.'), 'Assuming the budget stays flat.')
  assert.equal(rigaIpotesi('Fatto.\n\nCorpo.\n\nHo ipotizzato che il cliente sia Rossi.'), 'Ho ipotizzato che il cliente sia Rossi.')
  assert.equal(rigaIpotesi('Fatto.\n\nCorpo.\n\nDal listino [2].\nHo dato per scontato il listino 2026.'), 'Ho dato per scontato il listino 2026.')
})

test('un «ho supposto» dentro il corpo non è la cornice; senza riga in fondo, niente', () => {
  assert.equal(rigaIpotesi('Done.\n\nCiao Marco, ho supposto che tu fossi in ufficio: ti ho lasciato il pacco.\n\nA presto.\n\nFrom the thread [1].'), null)
  assert.equal(rigaIpotesi('Done: the summary.\n\nThree points.\n\nFrom the notes [1].'), null)
  assert.equal(rigaIpotesi(''), null)
})

test('la riga «Manca» conta solo con un segnaposto nel testo', () => {
  const conBuco = 'Done: the quote to Nora.\n\nHi Nora,\n\nthe price for 20 people is [to fill: price for 20 people].\n\nBest,\nAlex\n\nMissing: the price for 20 people. I left it blank.'
  assert.equal(haSegnaposto(conBuco), true)
  assert.equal(rigaIpotesi(conBuco), 'Missing: the price for 20 people. I left it blank.')
  assert.equal(rigaIpotesi('Fatto.\n\nCorpo con [da completare: la cifra].\n\nDal filo [1].\nManca la cifra per venti persone.'), 'Manca la cifra per venti persone.')
  // senza il segnaposto una riga «Missing» in fondo è testo, non la cornice
  assert.equal(rigaIpotesi('Done.\n\nBody.\n\nMissing files were added last week.'), null)
  assert.equal(haSegnaposto('nothing [to fill here'), false)
  assert.equal(haSegnaposto(null), false)
})

test('la riga si ferma a 160 caratteri con «…», sull\'ultimo spazio', () => {
  const lunga = 'I assumed the budget stays at last quarter\'s level and that the three pilot sites keep their current staff through December and that nobody changes the plan before the review in January.'
  const r = rigaIpotesi(`Done.\n\nBody.\n\n${lunga}`)!
  assert.ok(r.length <= 160, `${r.length} caratteri`)
  assert.ok(r.endsWith('…'))
  assert.ok(!r.includes('  '))
  assert.ok(lunga.startsWith(r.slice(0, -1)))
})

test('corpoPerChiRiceve toglie la prima riga «Done:», il paragrafo della cornice e ogni [n]; il segnaposto resta', () => {
  assert.equal(corpoPerChiRiceve(CONSEGNA), 'Ciao Marco,\n\nil corso da dodici persone costa 890 euro a persona.\n\nA presto,\nAlex')
  assert.equal(corpoPerChiRiceve('Fatto: la risposta.\nGentile Rossi,\n\necco il preventivo [1] da 980 euro.\n\nCordiali saluti'), 'Gentile Rossi,\n\necco il preventivo da 980 euro.\n\nCordiali saluti')
  const conBuco = 'Done.\n\nHi Nora,\n\nthe price is [to fill: price for 20 people].\n\nMissing: the price. I left it blank.'
  assert.equal(corpoPerChiRiceve(conBuco), 'Hi Nora,\n\nthe price is [to fill: price for 20 people].')
  // un ultimo paragrafo che non è cornice resta: è la firma
  assert.equal(corpoPerChiRiceve('Done.\n\nHi,\n\nthanks.\n\nBest,\nAlex'), 'Hi,\n\nthanks.\n\nBest,\nAlex')
  assert.equal(corpoPerChiRiceve(''), '')
})

test('senzaRigaIpotesi toglie solo quella riga, e il paragrafo se resta vuoto', () => {
  assert.equal(senzaRigaIpotesi(CONSEGNA), CONSEGNA.replace('\nI assumed Tuesday, October 6 as the kickoff [1].', ''))
  assert.equal(senzaRigaIpotesi('Done.\n\nBody.\n\nI assumed Friday.'), 'Done.\n\nBody.')
  const senza = 'Done.\n\nBody.\n\nFrom the notes [1].'
  assert.equal(senzaRigaIpotesi(senza), senza)
})
