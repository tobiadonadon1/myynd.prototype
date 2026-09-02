// Da un id di documento a un messaggio da spostare.
//
// È l'unico punto in cui una stringa scritta nell'indice diventa un'istruzione
// che tocca la casella di qualcuno. Sbagliare a tagliarla non dà nessun errore:
// dà un numero di messaggio giusto nella cartella sbagliata, cioè sposta una
// cosa che nessuno aveva guardato. Perciò si prova qui, e senza rete.
//
//   node --test server/posta.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mosseDa, normalizza, vuolePasswordPerLeApp } from './connettori/posta.ts'

test('un id normale diventa cartella e uid', () => {
  assert.deepEqual(mosseDa(['posta:INBOX:4211']), [{ cartella: 'INBOX', uid: 4211 }])
})

test('una cartella con i due punti dentro resta intera', () => {
  // si taglia dall'ultimo, non dal primo: è la ragione per cui questo test esiste
  assert.deepEqual(mosseDa(['posta:INBOX:2024:7']), [{ cartella: 'INBOX:2024', uid: 7 }])
})

test('le cartelle con la barra e le parentesi passano', () => {
  assert.deepEqual(mosseDa(['posta:[Gmail]/Tutti i messaggi:19']),
    [{ cartella: '[Gmail]/Tutti i messaggi', uid: 19 }])
})

test('quello che non viene dalla posta non si sposta', () => {
  // un file sul disco non ha una casella da cui toglierlo: si lascia stare,
  // in silenzio, invece di far fallire tutta la proposta
  assert.deepEqual(mosseDa(['desktop:/Users/x/fattura.pdf', 'notion:abc']), [])
})

test('un id storto non diventa una mossa', () => {
  assert.deepEqual(mosseDa([
    'posta:INBOX:',          // senza uid
    'posta:INBOX:zero',      // uid che non è un numero
    'posta::12',             // senza cartella
    'posta:INBOX:0',         // gli uid partono da uno
    'posta:INBOX:-3'
  ]), [])
})

test('il buono passa anche se ha accanto il marcio', () => {
  assert.deepEqual(mosseDa(['posta:INBOX:1', 'posta:rotto', 'posta:Archivio:2']),
    [{ cartella: 'INBOX', uid: 1 }, { cartella: 'Archivio', uid: 2 }])
})

// — la password per le app —
//
// Il 2 settembre 2026 una cliente ha provato a collegare Gmail con la password
// del suo account Google: otto caratteri, e nessuna password d'account
// funziona su Gmail via IMAP. Quello che ha visto era il consiglio giusto —
// «serve una password per le app» — scritto due volte, una come nota e una in
// rosso: identiche, quindi premere il bottone sembrava non fare niente.
//
// L'altra metà dello stesso guaio è più subdola: Google la password per le app
// la *mostra* a gruppi di quattro, con gli spazi, e chi la copia se li porta
// dietro. IMAP la rifiuta, e il messaggio che torna è indistinguibile da una
// password sbagliata.

test('gli spazi con cui Google la mostra non fanno parte della password', () => {
  assert.equal(normalizza('abcd efgh ijkl mnop', 'imap.gmail.com'), 'abcdefghijklmnop')
  // Apple la scrive con i trattini
  assert.equal(normalizza('abcd-efgh-ijkl-mnop', 'imap.mail.me.com'), 'abcdefghijklmnop')
})

test('ma una password vera con dentro uno spazio non si tocca', () => {
  // sedici lettere è la forma della password per le app: tutto il resto è la
  // password di qualcuno, e toglierle gli spazi vorrebbe dire romperla
  assert.equal(normalizza('la mia password', 'imap.gmail.com'), 'la mia password')
  assert.equal(normalizza('Estate 2026!', 'imap.gmail.com'), 'Estate 2026!')
})

test('e su un server qualunque non si tocca mai niente', () => {
  assert.equal(normalizza('abcd efgh ijkl mnop', 'imaps.aruba.it'), 'abcd efgh ijkl mnop')
})

test('chi vuole una password per le app, e chi no', () => {
  assert.equal(vuolePasswordPerLeApp('imap.gmail.com'), 'google')
  assert.equal(vuolePasswordPerLeApp('imap.mail.me.com'), 'apple')
  assert.equal(vuolePasswordPerLeApp('imap.mail.yahoo.com'), 'yahoo')
  assert.equal(vuolePasswordPerLeApp('imaps.aruba.it'), null)
})
