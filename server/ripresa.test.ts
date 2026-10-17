// I tetti che non sono più muri.
//
// Ogni connettore ne ha uno — quattrocento messaggi, ottocento pagine,
// milleduecento file, novecento documenti di Slack — e serve: è quello che
// tiene un giro dentro una durata onesta. Il guaio era che ogni giro ripartiva
// dallo stesso punto, quindi quello che stava sotto il tetto non lo leggeva
// **nessun giro, mai**, e da fuori l'indice sembrava finito. Il brief promette
// un cervello che ha letto tutto: uno che si ferma sempre alla stessa riga non
// è indietro, è bugiardo.
//
// Qui si prova che i giri avanzano, che quando hanno finito lo dicono, e che
// quello che dicono a metà strada è un numero che si può scrivere sullo
// schermo — «novecento di mille», non «non ho finito».
//
//   node --test server/ripresa.test.ts

import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-ripresa-'))
process.env.MYYND_DATI = CASA

const ripresa = await import('./connettori/ripresa.ts')
const store = await import('./store.ts')

const fetchVero = globalThis.fetch

// i segni stanno nell'indice, e fra una prova e l'altra vanno tolti: altrimenti
// la seconda ripartirebbe da dove si è fermata la prima
beforeEach(() => ripresa.scorda('prova', 'slack', 'drive'))

after(() => {
  globalThis.fetch = fetchVero
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

// — il segno —

test('senza segno si parte da capo; con un segno, dalla riga dopo', () => {
  const elenco = ['a', 'b', 'c', 'd']
  assert.deepEqual(ripresa.riprendi('prova', elenco, x => x), { da: 0, ripreso: false })
  ripresa.segna('prova', 'b')
  assert.deepEqual(ripresa.riprendi('prova', elenco, x => x), { da: 2, ripreso: true })
})

test('«finito» si dice con null, e il giro dopo riparte dall’inizio', () => {
  ripresa.segna('prova', 'b')
  ripresa.segna('prova', null)
  assert.equal(ripresa.daDove('prova'), null)
})

test('il segno è una riga, non una posizione', () => {
  /*
   * Fra un giro e l'altro qualcuno salva un documento, e negli elenchi ordinati
   * dal più recente tutto scala di uno. Un segno tenuto come numero ripartirebbe
   * da un file diverso — cioè ne salterebbe uno, per sempre, senza che nessuno
   * lo veda.
   */
  ripresa.segna('prova', '2026-09-01|b')
  const dopo = ['2026-09-03|nuovo', '2026-09-02|a', '2026-09-01|b', '2026-08-30|c']
  assert.deepEqual(ripresa.riprendi('prova', dopo, x => x), { da: 3, ripreso: true })
})

test('se la riga segnata è sparita si riparte dalla prima più vecchia di lei', () => {
  ripresa.segna('prova', '2026-09-01|b')
  const senzaB = ['2026-09-02|a', '2026-08-30|c']
  assert.deepEqual(
    ripresa.riprendi('prova', senzaB, x => x, (x, s) => x < (s.split('|')[0] ?? '')),
    { da: 1, ripreso: true }
  )
})

test('il segno sta nell’indice, che è già di una persona sola', () => {
  /*
   * Non è una Map di modulo, ed è la ragione per cui non lo è: con più gente
   * sullo stesso server un segno condiviso vorrebbe dire il Drive di uno che fa
   * saltare mezzo Drive a un altro — invisibile, perché un segno sbagliato non
   * dà errori. Dà dei documenti che non arrivano. `store` è già per persona, e
   * il modo giusto di non sbagliare è non tenerlo da nessun'altra parte.
   */
  ripresa.segna('drive', '2026-09-01|x')
  assert.equal(ripresa.daDove('drive'), '2026-09-01|x')
  assert.equal(store.cursore('drive'), '2026-09-01|x')
})

test('il resto sa dire «novecento di mille», non solo «non ho finito»', () => {
  assert.deepEqual(ripresa.resto(900, 1000), { aGiorno: false, totale: 1000, letti: 900, restano: 100 })
  assert.deepEqual(ripresa.resto(1000, 1000), { aGiorno: true, totale: 1000, letti: 1000, restano: 0 })
})

// — una fonte vera che avanza —

/*
 * Slack non usa più questo segno: tiene un segno per conversazione (l'ultimo
 * `ts` visto) e un fondo per la prima lettura a metà, e riprende da lì. Le
 * prove della ripresa di Slack stanno in `slack-giro.test.ts` («il tetto
 * delle chiamate… giro dopo giro si arriva in fondo», «il 429 lungo»).
 */
