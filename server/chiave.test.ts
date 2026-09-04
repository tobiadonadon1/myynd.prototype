// Cambiare `MYYND_CHIAVE` senza perdere le credenziali di nessuno.
//
// Il README diceva da sempre «non cambiarla mai», ed era una promessa che non
// si può mantenere: una chiave si può scoprire, si può essere incollata nel
// posto sbagliato, o semplicemente cambia chi ospita. Senza una strada,
// l'unica risposta era «ricollegate tutte le fonti, tutti quanti» — cioè
// perdere la password della casella di ogni persona per una variabile.
//
// Quello che si prova qui non è che AES funzioni. È che la rotazione **finisca
// da sola**: si accende `MYYND_CHIAVE_VECCHIA`, si riparte, e dopo un avvio le
// righe sono tutte sulla chiave nuova — perché finché non lo sono, chi ospita
// non può togliere la variabile vecchia, e una migrazione che non finisce mai
// è una migrazione che nessuno chiude.
//
//   node --test server/chiave.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-chiave-'))
process.env.MYYND_DATI = CASA
process.env.RAILWAY_ENVIRONMENT = 'prova'
process.env.MYYND_POSTGRES = 'pglite://in-processo'
delete process.env.MYYND_CHIAVE

const postgres = await import('./postgres.ts')
const { PGlite } = await import('@electric-sql/pglite')
const pg = new PGlite()
postgres.usa(pg as unknown as import('./postgres.ts').Esecutore)

const VECCHIA = 'la chiave di prima, lunga abbastanza'
const NUOVA = 'la chiave di adesso, altrettanto lunga'

const conti = await import('./conti.ts')
const cfg = await import('./config.ts')
const chi = await import('./chi.ts')

let anna = ''
let bruno = ''

/** Il blob di Anna com'era con la chiave di prima, preso prima di riscriverlo. */
let blobDiAnna = ''

before(async () => {
  postgres.usaChiave(VECCHIA)
  postgres.usaChiaveVecchia(null)
  await conti.avvia()
  await cfg.avvia()
  const a = await conti.registra('anna@esempio.it', 'passwordlunga1')
  const b = await conti.registra('bruno@esempio.it', 'passwordlunga2')
  assert.ok(a.ok && b.ok)
  anna = a.ok ? a.id : ''
  bruno = b.ok ? b.id : ''

  // due configurazioni vere, cifrate con la chiave di prima
  chi.dentro(anna, () => cfg.aggiorna({
    nome: 'Anna', posta: { host: 'imap.anna.it', porta: 993, utente: 'anna@esempio.it', password: 'segreto-di-anna' }
  }))
  chi.dentro(bruno, () => cfg.aggiorna({ nome: 'Bruno', notion: { token: 'segreto-di-bruno' } }))
  await cfg.scaricato()
  blobDiAnna = await blobDi(anna)
  assert.ok(blobDiAnna.startsWith('v1.'))
})

after(async () => {
  await pg.close()
  for (const v of ['MYYND_DATI', 'RAILWAY_ENVIRONMENT', 'MYYND_POSTGRES']) delete process.env[v]
  rmSync(CASA, { recursive: true, force: true })
})

async function blobDi(utente: string): Promise<string> {
  const { rows } = await postgres.q('SELECT cifrato FROM myynd_configurazioni WHERE utente = $1', [utente])
  return String(rows[0]?.cifrato ?? '')
}

test('con la sola chiave nuova, quello che c’è non si apre', async () => {
  postgres.usaChiave(NUOVA)
  postgres.usaChiaveVecchia(null)
  // GCM autentica: «non si apre con questa» è un fatto, non un dubbio — ed è la
  // proprietà su cui poggia tutto il resto, perché rende sicuro provare la
  // vecchia dopo la nuova invece di indovinare
  assert.throws(() => postgres.decifra(blobDiAnna),
    'un blob della chiave vecchia si è aperto con quella nuova')
})

test('la vecchia apre quello che la nuova non apre, e si sa quale delle due è stata', async () => {
  postgres.usaChiave(NUOVA)
  postgres.usaChiaveVecchia(VECCHIA)
  const aperto = postgres.apriCifrato(await blobDi(anna))
  assert.equal(aperto.conLaVecchia, true, 'senza questo, chi chiama non sa quali righe vanno riscritte')
  assert.equal(JSON.parse(aperto.testo).posta.password, 'segreto-di-anna')
})

test('un avvio con la chiave vecchia in mano riscrive tutto, e lo dice', async () => {
  postgres.usaChiave(NUOVA)
  postgres.usaChiaveVecchia(VECCHIA)
  cfg.perProva.dimentica()

  const e = await cfg.ruotaLaChiave()
  assert.equal(e.riscritte, 2, 'non ha riscritto tutte le righe della chiave vecchia')
  assert.equal(e.illeggibili, 0)

  // e adesso si aprono senza la vecchia: è il momento in cui chi ospita può
  // togliere MYYND_CHIAVE_VECCHIA, e dev'essere un fatto e non una speranza
  postgres.usaChiaveVecchia(null)
  assert.equal(JSON.parse(postgres.decifra(await blobDi(anna))).posta.password, 'segreto-di-anna')
  assert.equal(JSON.parse(postgres.decifra(await blobDi(bruno))).notion.token, 'segreto-di-bruno')
})

test('e le credenziali si leggono come prima, dall’app', async () => {
  postgres.usaChiaveVecchia(null)
  cfg.perProva.dimentica()
  await cfg.avvia()
  assert.equal(chi.dentro(anna, () => cfg.leggi().posta?.password), 'segreto-di-anna')
  assert.equal(chi.dentro(bruno, () => cfg.leggi().nome), 'Bruno')
})

test('una seconda rotazione non ha più niente da fare', async () => {
  postgres.usaChiaveVecchia(VECCHIA)
  cfg.perProva.dimentica()
  const e = await cfg.ruotaLaChiave()
  assert.equal(e.riscritte, 0)
  assert.equal(e.giaAPosto, 2)
})

test('una riga che non si apre con nessuna delle due si conta e si lascia stare', async () => {
  /*
   * Cifrata con una terza chiave — un backup rimesso al posto sbagliato, due
   * rotazioni fatte una sopra l'altra. Riscriverla vorrebbe dire cancellare le
   * credenziali di qualcuno: si conta, si dice di chi è, e si lascia dov'è.
   */
  postgres.usaChiave('una terza chiave, mai vista da qui')
  const solitario = await conti.registra('carlo@esempio.it', 'passwordlunga3')
  assert.ok(solitario.ok)
  const carlo = solitario.ok ? solitario.id : ''
  chi.dentro(carlo, () => cfg.aggiorna({ nome: 'Carlo' }))
  await cfg.scaricato()
  const suo = await blobDi(carlo)

  postgres.usaChiave(NUOVA)
  postgres.usaChiaveVecchia(VECCHIA)
  cfg.perProva.dimentica()
  const e = await cfg.ruotaLaChiave()
  assert.equal(e.illeggibili, 1)
  assert.equal(await blobDi(carlo), suo, 'la riga illeggibile è stata riscritta: le credenziali sono perse')
})
