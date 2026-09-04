// Senza la posta del server non cambia niente, ed è la prova che protegge
// l'installazione di casa.
//
// La conferma dell'indirizzo e il «ho dimenticato la password» sono arrivati
// insieme, e insieme portano il rischio di chiudere una porta che prima era
// aperta: basta una riga in `auth.ts` che dimentichi di guardare se la posta
// esiste, e su un computer dove non c'è nessun server SMTP da configurare —
// né deve essercene uno — chi si registra non entra più. Nessun errore, nessun
// messaggio: una schermata che dice di guardare una casella dove non arriverà
// mai niente.
//
// Qui `MYYND_SMTP_HOST` non c'è, e tutto dev'essere com'era.
//
//   node --test server/senzaPosta.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-senza-posta-'))
process.env.MYYND_DATI = CASA
// niente MYYND_SMTP_*, e niente segni di un server: è un computer di qualcuno
for (const v of ['MYYND_SMTP_HOST', 'MYYND_SMTP_DA', 'MYYND_SMTP_UTENTE', 'RAILWAY_ENVIRONMENT']) delete process.env[v]

const postaUscita = await import('./postaUscita.ts')
const conti = await import('./conti.ts')
const auth = await import('./auth.ts')

// se qualcosa provasse a mandare, si vedrebbe qui invece di finire in rete
const mandate: unknown[] = []
postaUscita.perProva.intercetta(async m => { mandate.push(m) })

after(() => {
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

test('la posta non è configurata, e quindi non si chiede niente a nessuno', () => {
  assert.equal(postaUscita.configurata(), false)
  assert.equal(auth.verificaAttiva(), false)
  assert.equal(auth.reimpostazionePossibile(), false)
})

test('chi si registra entra subito, con la sua sessione', async () => {
  const e = await auth.registra('io@casa.it', 'passwordlunga1')
  assert.ok(e.ok)
  assert.ok(e.ok && e.token, 'in casa la registrazione deve tornare una sessione')
  assert.equal(e.ok && e.daVerificare, undefined)
  assert.equal(await conti.utenteDelToken(e.ok ? e.token : ''), e.ok ? e.utente : '')
  assert.equal(mandate.length, 0, 'in casa non deve partire nessuna mail')
})

test('e rientra con la password, senza confermare niente', async () => {
  const e = await auth.entra('io@casa.it', 'passwordlunga1')
  assert.ok(e.ok)
  assert.ok(e.ok && e.token)
})

test('«rimettimi la password» non fa niente e non si lamenta', async () => {
  /*
   * Non lancia, e non manda. La schermata non offre nemmeno il bottone — glielo
   * dice `/api/auth` con `reimpostazione: false` — ma la rotta esiste lo stesso,
   * e chiamarla a mano non deve diventare un errore che sembra un guasto.
   */
  await auth.chiediReimpostazione('io@casa.it')
  await auth.rimandaLaConferma('io@casa.it')
  assert.equal(mandate.length, 0)
})

test('un gettone inventato non apre niente nemmeno qui', async () => {
  assert.equal((await auth.confermaIndirizzo('a'.repeat(64))).ok, false)
  assert.equal((await auth.reimposta('a'.repeat(64), 'passwordlunga2')).ok, false)
})
