// La frase letta prima del modello: quando e dove, in due lingue.
//   node --test src/interpreta-automazione.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fontiDette, quandoDetto } from './automazioni/interpreta.ts'

const CATALOGO = [
  { nome: 'posta.leggi', etichetta: 'la posta' }, { nome: 'agenda.leggi', etichetta: 'l’agenda' },
  { nome: 'notion.leggi', etichetta: 'Notion' }, { nome: 'desktop.leggi', etichetta: 'il mio Mac' },
  { nome: 'github.leggi', etichetta: 'GitHub' }, { nome: 'claude.lavora', etichetta: 'Claude Code' }
]

test('l’ora e il giorno, in italiano e in inglese', () => {
  assert.deepEqual(quandoDetto('Ogni lunedì mattina dimmi quali preventivi sono senza risposta'), { ogni: 'settimana', giorno: 1, ora: 8 })
  assert.deepEqual(quandoDetto('Every Friday at 4pm summarise the week'), { ogni: 'settimana', giorno: 5, ora: 16 })
  assert.deepEqual(quandoDetto('every day at 16:00 look at who is waiting'), { ogni: 'giorno', ora: 16 })
  assert.deepEqual(quandoDetto('Ogni sera prepara le risposte'), { ogni: 'giorno', ora: 18 })
  assert.deepEqual(quandoDetto('weekly digest of Notion changes'), { ogni: 'settimana', giorno: 1, ora: 8 })
})

test('quando arriva qualcosa', () => {
  assert.deepEqual(quandoDetto('Quando arriva una fattura, controlla l’importo'), { quandoArriva: true })
  assert.deepEqual(quandoDetto('When an invoice comes in, check the amount'), { quandoArriva: true })
  assert.deepEqual(quandoDetto('whenever I receive a quote, log it'), { quandoArriva: true })
})

test('in dubbio non tocca niente', () => {
  assert.equal(quandoDetto('Dimmi quali preventivi sono senza risposta'), null)
  assert.equal(quandoDetto('Lunedì ho una riunione'), null, 'un giorno senza «ogni» non è una cadenza')
})

test('le fonti nominate, per etichetta o per come le chiama la gente', () => {
  assert.deepEqual(fontiDette('guarda nella posta e in Notion', CATALOGO), ['posta.leggi', 'notion.leggi'])
  assert.deepEqual(fontiDette('check my inbox and calendar', CATALOGO), ['posta.leggi', 'agenda.leggi'])
  assert.deepEqual(fontiDette('the files on my Mac and the open pull requests', CATALOGO), ['desktop.leggi', 'github.leggi'])
  assert.deepEqual(fontiDette('let Claude Code plan the fix', CATALOGO), ['claude.lavora'])
  assert.deepEqual(fontiDette('nessuna fonte qui', CATALOGO), [])
})

test('il mese: un numero che conta le cose non è un giorno, e la fine del mese è la fine', () => {
  assert.deepEqual(quandoDetto('Every month, chase the 5 biggest unpaid invoices'), { ogni: 'mese', giorno: 1, ora: 8 })
  assert.deepEqual(quandoDetto('Monthly, email the 3 clients who have not paid'), { ogni: 'mese', giorno: 1, ora: 8 })
  assert.deepEqual(quandoDetto('At the end of each month, list the unpaid invoices and chase the 5 biggest'), { ogni: 'mese', giorno: 31, ora: 8 })
  assert.deepEqual(quandoDetto('A fine mese elenca le fatture non pagate'), { ogni: 'mese', giorno: 31, ora: 8 })
  assert.deepEqual(quandoDetto('Every month on the 15th at 9 send the report'), { ogni: 'mese', giorno: 15, ora: 9 })
  assert.deepEqual(quandoDetto('Ogni mese, il 10, sollecita le 5 fatture più grosse'), { ogni: 'mese', giorno: 10, ora: 8 })
  assert.deepEqual(quandoDetto('il 15 di ogni mese paga l’affitto'), { ogni: 'mese', giorno: 15, ora: 8 })
})

test('quello che un ordine fisso non sa tenere non si legge: due giorni, o un’ora e mezza', () => {
  assert.equal(quandoDetto('Every Tuesday and Thursday at 9 check the quotes'), null)
  assert.equal(quandoDetto('Ogni martedì e giovedì guarda i preventivi'), null)
  assert.equal(quandoDetto('Every Monday at 16:30 summarise the week'), null)
  assert.deepEqual(quandoDetto('Every Monday at 16:00 summarise the week'), { ogni: 'settimana', giorno: 1, ora: 16 })
})
