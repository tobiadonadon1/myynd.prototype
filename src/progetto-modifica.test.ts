// Gli altri nomi di un progetto, e le tre righe degli stati.
//
//   node --test src/progetto-modifica.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SPIEGA_STATO, STATI, aggiungiAlias, aliasPuliti, guaioAlias, normalizzaAlias, spiegaStato, stessoNome, togliAlias
} from './progetto-modifica.ts'

test('un altro nome si pulisce: una riga sola, spazi normali, un tetto', () => {
  assert.equal(normalizzaAlias('  everwave  '), 'everwave')
  assert.equal(normalizzaAlias('x   engine'), 'x engine')
  assert.equal(normalizzaAlias('riga\nsotto'), 'riga sotto')
  assert.equal(normalizzaAlias(''), '')
  assert.equal(normalizzaAlias('a'.repeat(200)).length, 60)
})

test('maiuscole e accenti non fanno due nomi diversi', () => {
  assert.ok(stessoNome('Everwave', 'everwave'))
  assert.ok(stessoNome('Città', 'citta'))
  assert.ok(!stessoNome('everwave', 'x-engine'))
  // due vuoti non sono «lo stesso nome»: non c'è nessun nome
  assert.ok(!stessoNome('', ''))
})

test('la lista si salva senza vuoti, senza doppioni e senza il nome del progetto', () => {
  assert.deepEqual(
    aliasPuliti(['everwave', ' Everwave ', '', '   ', 'x-engine', 'Evermute'], 'evermute'),
    ['everwave', 'x-engine'])
  // senza il nome del progetto resta solo la regola dei doppioni
  assert.deepEqual(aliasPuliti(['Evermute', 'evermute']), ['Evermute'])
})

test('aggiungere un nome: passa, o dice perché no', () => {
  const uno = aggiungiAlias([], 'everwave', 'Evermute')
  assert.deepEqual(uno, { alias: ['everwave'], guaio: '' })

  const due = aggiungiAlias(uno.alias, ' X-Engine ', 'Evermute')
  assert.deepEqual(due.alias, ['everwave', 'X-Engine'])
  assert.equal(due.guaio, '')

  // lo stesso, scritto diverso: non entra, e lo dice
  const tre = aggiungiAlias(due.alias, 'EVERWAVE', 'Evermute')
  assert.deepEqual(tre.alias, due.alias)
  assert.equal(tre.guaio, 'Questo nome c’è già.')

  // il nome del progetto non è un altro nome
  const quattro = aggiungiAlias(due.alias, 'evermute', 'Evermute')
  assert.deepEqual(quattro.alias, due.alias)
  assert.equal(quattro.guaio, 'Questo è già il nome del progetto.')

  // una casella vuota non è un errore: è Invio senza aver scritto niente
  const cinque = aggiungiAlias(due.alias, '   ', 'Evermute')
  assert.deepEqual(cinque.alias, due.alias)
  assert.equal(cinque.guaio, '')
  assert.equal(guaioAlias(due.alias, ''), '')
})

test('togliere un nome lascia gli altri com’erano', () => {
  assert.deepEqual(togliAlias(['everwave', 'x-engine'], 'EVERWAVE'), ['x-engine'])
  assert.deepEqual(togliAlias(['everwave'], 'niente'), ['everwave'])
})

test('ogni stato ha la sua riga, e le tre righe dicono cose diverse', () => {
  assert.deepEqual(STATI, ['attivo', 'fermo', 'chiuso'])
  const righe = STATI.map(s => SPIEGA_STATO[s])
  assert.equal(new Set(righe).size, 3)
  for (const r of righe) {
    assert.ok(r.length > 20, `riga troppo corta: «${r}»`)
    // niente lineette nel testo che si legge
    assert.ok(!r.includes('—'), `lineetta in «${r}»`)
  }
  // la riga del fermo dice che non si perde niente: è tutta la differenza con chiuso
  assert.match(SPIEGA_STATO.fermo, /non si perde niente/i)
  assert.match(SPIEGA_STATO.chiuso, /clic/i)
  // uno stato che non conosciamo non lascia la riga vuota
  assert.equal(spiegaStato('attivo'), SPIEGA_STATO.attivo)
  assert.equal(spiegaStato('boh'), SPIEGA_STATO.attivo)
})
