// Le righe che nascono da un testo incollato.
//
// La barra è un campo di una riga sola: un elenco incollato lì dentro
// diventava una riga sola, con i trattini in mezzo. Qui si prova la metà pura
// — il testo spezzato e ripulito — perché è quella che decide quante cose
// finiscono in lista e con che nome.
//
//   node --test src/righe.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { righeDaTesto } from './oggi/righe.ts'

test('ogni riga piena è una cosa da fare, nell’ordine in cui sta', () => {
  assert.deepEqual(
    righeDaTesto('Chiamare Rossi\nMandare il preventivo\n\nPagare la fattura\n'),
    ['Chiamare Rossi', 'Mandare il preventivo', 'Pagare la fattura']
  )
  assert.deepEqual(righeDaTesto('uno\n\ndue\r\n   \ntre\n'), ['uno', 'due', 'tre'])
})

test('i segni di elenco se ne vanno, il testo resta', () => {
  assert.deepEqual(righeDaTesto('- uno\n* due\n• tre\n– quattro\n— cinque'), ['uno', 'due', 'tre', 'quattro', 'cinque'])
  assert.deepEqual(righeDaTesto('1. uno\n2) due\n10. dieci'), ['uno', 'due', 'dieci'])
  assert.deepEqual(righeDaTesto('[ ] uno\n[x] due\n[X] tre\n- [ ] quattro\n- [X] cinque'), ['uno', 'due', 'tre', 'quattro', 'cinque'])
  // senza lo spazio dopo il trattino è comunque un elenco
  assert.deepEqual(righeDaTesto('-chiamare Rossi\n-pagare'), ['chiamare Rossi', 'pagare'])
})

test('un numero che fa parte del testo non è un segno di elenco', () => {
  assert.deepEqual(righeDaTesto('10.5 metri di cavo\n3.2 di scarto'), ['10.5 metri di cavo', '3.2 di scarto'])
  assert.deepEqual(righeDaTesto('2024 bilancio'), ['2024 bilancio'])
})

test('un trattino dentro la riga, o davanti a una cifra, non è un segno d’elenco', () => {
  assert.deepEqual(righeDaTesto('mail a Rossi - preventivo'), ['mail a Rossi - preventivo'])
  assert.deepEqual(righeDaTesto('-5 gradi a Cortina'), ['-5 gradi a Cortina'])
})

test('le righe vuote, gli spazi e i soli segni non contano', () => {
  assert.deepEqual(righeDaTesto('  \n-\n- \n\t\n'), [])
  assert.deepEqual(righeDaTesto('\n\n'), [])
  assert.deepEqual(righeDaTesto('  una cosa  \r\n  un’altra  '), ['una cosa', 'un’altra'])
})

test('una riga sola resta una riga sola', () => {
  assert.deepEqual(righeDaTesto('mandare il preventivo a Rossi'), ['mandare il preventivo a Rossi'])
  assert.deepEqual(righeDaTesto('  chiamare Marta  '), ['chiamare Marta'])
  assert.deepEqual(righeDaTesto(''), [])
})
