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
import { mosseDa } from './connettori/posta.ts'

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
