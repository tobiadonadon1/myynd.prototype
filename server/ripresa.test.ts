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
const slack = await import('./connettori/slack.ts')
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

/**
 * Slack, senza Slack.
 *
 * Cinquanta canali con venti giornate di conversazione a testa fanno mille
 * documenti: più del tetto di novecento, che è il punto. Il primo giro si
 * ferma, il secondo riprende da dove si era fermato, e alla fine il segno si
 * toglie.
 */
function fingiSlack(quanti: number, giornate: number) {
  const canali = Array.from({ length: quanti }, (_, i) => ({ id: `C${String(i).padStart(3, '0')}`, name: `canale-${i}` }))
  const adesso = Math.floor(Date.now() / 1000)
  const messaggi: { ts: string; user: string; text: string }[] = []
  for (let g = 0; g < giornate; g++) {
    for (let k = 0; k < 2; k++) {
      messaggi.push({ ts: `${adesso - g * 86_400 + k}.000100`, user: 'U1', text: `la riga numero ${g}-${k}` })
    }
  }
  globalThis.fetch = (async (u: URL | string) => {
    const metodo = new URL(String(u)).pathname.split('/').pop()
    const corpo =
      metodo === 'users.list' ? { ok: true, members: [{ id: 'U1', real_name: 'Marta' }] }
        : metodo === 'users.conversations' ? { ok: true, channels: canali }
          : metodo === 'conversations.history' ? { ok: true, messages: messaggi }
            : { ok: false, error: 'metodo_sconosciuto' }
    return new Response(JSON.stringify(corpo), { headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  return canali
}

test('Slack riprende dal canale dopo, e quando ha finito lo dice', async () => {
  const canali = fingiSlack(50, 20)
  const conto = { token: 'xoxp-finto' }

  const primo = await slack.sincronizza(conto)
  assert.equal(primo.troncato, true, 'con mille documenti il tetto morde')
  assert.equal(primo.resto.totale, 50)
  assert.ok(primo.resto.restano! > 0, 'e restano dei canali fuori')
  const fattiPrima = new Set(primo.docs.map(d => d.id.split(':')[1]))
  assert.ok(ripresa.daDove('slack'), 'il punto in cui si è fermato resta scritto')

  const secondo = await slack.sincronizza(conto)
  const fattiDopo = new Set(secondo.docs.map(d => d.id.split(':')[1]))
  assert.ok(fattiDopo.size > 0, 'il secondo giro legge davvero qualcosa')
  for (const c of fattiDopo) {
    assert.ok(!fattiPrima.has(c), `${c} è stato letto due volte invece di andare avanti`)
  }
  // insieme coprono tutti i canali: nessuno resta fuori da tutti i giri
  assert.equal(fattiPrima.size + fattiDopo.size, canali.length)
  assert.equal(secondo.resto.aGiorno, true, 'arrivato in fondo, lo dice')
  assert.equal(ripresa.daDove('slack'), null, 'e toglie il segno, così il giro dopo riparte da capo')
})

test('un giro ripreso a metà non si dichiara mai completo', async () => {
  /*
   * Non è una sfumatura: `index.ts` riconcilia solo quando la fonte si dichiara
   * completa, e i documenti di un giro ripreso coprono solo la coda
   * dell'elenco. Dichiararsi completi lì vorrebbe dire cancellare dall'indice
   * tutti i canali della prima metà.
   */
  const canali = fingiSlack(10, 2)
  ripresa.segna('slack', canali[4]!.id)
  const e = await slack.sincronizza({ token: 'xoxp-finto' })
  assert.equal(e.troncato, true)
  assert.deepEqual(new Set(e.docs.map(d => d.id.split(':')[1])),
    new Set(canali.slice(5).map(c => c.id)))
  assert.equal(e.resto.letti, 10)
})

test('un elenco che ci sta tutto è a giorno dal primo giro, e non lascia segni', async () => {
  fingiSlack(5, 2)
  const e = await slack.sincronizza({ token: 'xoxp-finto' })
  assert.equal(e.troncato, false)
  assert.deepEqual(e.resto, { aGiorno: true, totale: 5, letti: 5, restano: 0 })
  assert.equal(ripresa.daDove('slack'), null)
})
