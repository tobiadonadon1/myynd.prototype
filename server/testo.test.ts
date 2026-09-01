// I test della ricucitura.
//
// Qui il guasto è tutto silenzioso: un PDF estratto male non dà nessun errore.
// Il testo entra nell'indice, l'app risponde, il documento si apre — solo che
// le frasi sono spezzate a metà, e chi legge (tu e il modello) legge quello.
// Ogni caso qui sotto è una forma di testo che c'era davvero.
//
//   node --test server/testo.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { riflua } from './testo.ts'

test('la frase spezzata dalla larghezza della pagina torna intera', () => {
  const pdf = [
    'most. We built it from public facts about Mashburn, and every number carries the',
    'assumption it rests on. Read this first page standing up, then forward the rest to Paul',
    'and',
    'Lee.'
  ].join('\n')
  const fuori = riflua(pdf)
  assert.match(fuori, /forward the rest to Paul and Lee\./)
  assert.equal(fuori.split('\n').length, 1)
})

test('la riga che finisce davvero resta una riga sua', () => {
  // «value.» chiude; «We won't guess…» è un'altra cosa e non ci si attacca
  const pdf = [
    'On Seaboard we put that at roughly $80,000 to $200,000 a year, and we say roughly on',
    'purpose. The spread is that wide because you hold the one figure that would close it,',
    'the project\'s real construction',
    'value.',
    'We won\'t guess your number in a letter to the man building it.'
  ].join('\n')
  const righe = riflua(pdf).split('\n')
  assert.equal(righe.length, 2)
  assert.match(righe[0], /real construction value\.$/)
  assert.match(righe[1], /^We won't guess/)
})

test('un titolo non finisce dentro il paragrafo che lo segue', () => {
  // È corto perché è un titolo, non perché la riga è stata spezzata: in un
  // testo mandato a capo dalla pagina la prima riga arriva sempre al bordo.
  const pdf = [
    '01 Executive summary',
    'You told us to send it over. Here it is. The short read on where old walls cost a reuse',
    'GC the most, and every number carries the assumption it rests on for the whole report.'
  ].join('\n')
  const righe = riflua(pdf).split('\n')
  assert.equal(righe[0], '01 Executive summary')
  assert.match(righe[1], /^You told us/)
})

test('le voci di un elenco restano separate, e la prosa dopo pure', () => {
  const testo = [
    'Le cose da fare questa settimana sono queste qui sotto, in ordine di scadenza:',
    '- mandare il preventivo a Rossi entro giovedì mattina, prima della riunione',
    '- chiudere il consuntivo di Seaboard Vista con i numeri veri del cantiere',
    '- richiamare Paul per la questione dei permessi di sovrintendenza',
    'Poi si vede come procede il resto del mese e si riprogramma.'
  ].join('\n')
  const righe = riflua(testo).split('\n')
  assert.equal(righe.length, 5)
  assert.match(righe[4], /^Poi si vede/)
})

test('la riga vuota resta uno stacco fra paragrafi', () => {
  const testo = [
    'Prima parte del discorso, scritta su una riga che arriva fino in fondo alla',
    'colonna e poi continua qui sotto senza mai chiudere davvero il periodo.',
    '',
    'Seconda parte, che comincia dopo uno stacco e non deve attaccarsi a quella',
    'di sopra per nessun motivo, perché lo stacco lo ha voluto chi ha scritto.'
  ].join('\n')
  const fuori = riflua(testo)
  assert.ok(fuori.includes('\n\n'), 'lo stacco è sparito')
  assert.equal(fuori.split('\n\n').length, 2)
})

test('un testo già a paragrafi non si tocca', () => {
  // Notion, markdown, qualunque cosa nata digitale: le righe sono già intere,
  // e metterci le mani vorrebbe dire rompere quello che era giusto.
  const gia = [
    'Questo è un paragrafo già scritto per intero su una riga sola, come succede quando il testo arriva da Notion o da un editor che non manda a capo niente e lascia che sia chi disegna la pagina a decidere dove spezzare le righe.',
    '',
    'E questo è il secondo, altrettanto lungo e altrettanto intero, che deve restare esattamente com\'è senza che nessuno provi a ricucirlo con quello di prima.'
  ].join('\n')
  assert.equal(riflua(gia), gia)
})

test('poche righe non bastano per indovinare la colonna: non si tocca niente', () => {
  const corto = 'Una riga.\nE un\'altra.'
  assert.equal(riflua(corto), corto)
})
