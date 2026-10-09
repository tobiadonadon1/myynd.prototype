// «Ho dimenticato la password» sul Mac, senza posta.
//
// In casa il collegamento per posta non esiste, e chi dimenticava la password
// restava fuori dalla propria mente. Adesso il guscio chiede al Mac chi c'è
// davanti (Touch ID, o la password del Mac) e solo allora chiama il server con
// un segreto che la pagina non conosce. Qui si prova la metà del server: senza
// quel segreto non si cambia niente, con quel segreto si cambia solo la
// password del conto chiesto, e le sessioni vecchie si chiudono.
//
//   node --test server/reimposta-mac.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-reimposta-mac-'))
process.env.MYYND_DATI = CASA
for (const v of ['MYYND_SMTP_HOST', 'MYYND_SMTP_DA', 'MYYND_SMTP_UTENTE', 'RAILWAY_ENVIRONMENT']) delete process.env[v]
const SEGRETO = 'a1'.repeat(32)
process.env.MYYND_GUSCIO_SEGRETO = SEGRETO

const conti = await import('./conti.ts')
const auth = await import('./auth.ts')

after(() => {
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

test('the shell secret is read once and never left for child processes', () => {
  assert.equal(process.env.MYYND_GUSCIO_SEGRETO, undefined)
  assert.equal(auth.segretoPerProva(), SEGRETO)
})

test('only the shell secret opens the Mac reset: nothing, a wrong or a short one is a no', () => {
  assert.equal(auth.dalGuscio(undefined), false)
  assert.equal(auth.dalGuscio(''), false)
  assert.equal(auth.dalGuscio('b2'.repeat(32)), false)
  assert.equal(auth.dalGuscio(SEGRETO.slice(0, 10)), false)
  assert.equal(auth.dalGuscio([SEGRETO]), false)
  assert.equal(auth.dalGuscio(SEGRETO), true)
})

test('after the Mac confirms the owner, the password changes and old sessions close', async () => {
  const r = await auth.registra('io@casa.it', 'vecchiapassword')
  assert.ok(r.ok && r.token)
  const vecchia = r.ok ? r.token : ''
  assert.ok(await auth.valida(vecchia))

  const e = await auth.reimpostaDalMac('IO@casa.it', 'nuovapassword1')
  assert.ok(e.ok, JSON.stringify(e))
  assert.equal(await auth.valida(vecchia), false, 'the session from before must close')
  assert.ok(await auth.valida(e.ok ? e.token : ''), 'the person who just confirmed stays inside')
  assert.equal((await auth.entra('io@casa.it', 'vecchiapassword')).ok, false)
  assert.equal((await auth.entra('io@casa.it', 'nuovapassword1')).ok, true)
})

test('a short password or an unknown address is said plainly, and changes nothing', async () => {
  const corta = await auth.reimpostaDalMac('io@casa.it', 'corta')
  assert.equal(corta.ok, false)
  const nessuno = await auth.reimpostaDalMac('altro@casa.it', 'nuovapassword2')
  assert.equal(nessuno.ok, false)
  assert.match(nessuno.ok ? '' : nessuno.errore, /conto/)
  assert.equal((await auth.entra('io@casa.it', 'nuovapassword1')).ok, true)
  assert.equal(conti.quanti(), 1)
})

test('the route checks the shell secret before touching any account, and sits before the guard', () => {
  const index = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
  const rotta = index.slice(index.indexOf("app.post('/api/auth/reimposta/mac'"))
  assert.ok(rotta.length > 0)
  assert.ok(rotta.indexOf('auth.dalGuscio(') < rotta.indexOf('auth.reimpostaDalMac('))
  assert.ok(index.indexOf("app.post('/api/auth/reimposta/mac'") < index.indexOf('app.use(auth.guardia)'))
  assert.match(readFileSync(new URL('./auth.ts', import.meta.url), 'utf8'), /'\/api\/auth\/reimposta\/mac'/)
})
