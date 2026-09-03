// I conti e le configurazioni su Postgres, provati su un Postgres vero.
//
// Non un finto: PGlite è Postgres compilato per girare dentro il processo,
// senza rete e senza niente da installare. Quello che passa qui passa su
// Supabase, tranne la latenza — ed è esattamente la parte che non si può
// provare a mano su ogni macchina.
//
// Quello che si prova non è che le query girino. È quello per cui esiste
// tutto questo: che un conto sopravviva a un processo che riparte, che una
// replica riconosca la sessione aperta da un'altra, e che le credenziali sul
// database siano illeggibili senza la chiave.
//
//   node --test server/postgres.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-postgres-'))
process.env.MYYND_DATI = CASA
process.env.RAILWAY_ENVIRONMENT = 'prova'
// qualunque cosa non vuota: `postgres.ts` non la usa se l'esecutore arriva da fuori
process.env.MYYND_POSTGRES = 'pglite://in-processo'
delete process.env.MYYND_CHIAVE

const postgres = await import('./postgres.ts')
const { PGlite } = await import('@electric-sql/pglite')
const pg = new PGlite()
postgres.usa(pg as unknown as import('./postgres.ts').Esecutore)
postgres.usaChiave('una frase lunga a caso, solo per le prove')

const conti = await import('./conti.ts')
const cfg = await import('./config.ts')
const chi = await import('./chi.ts')

let anna = ''
let bruno = ''

before(async () => {
  await conti.avvia()
  await cfg.avvia()
  const a = await conti.registra('anna@esempio.it', 'passwordlunga1')
  const b = await conti.registra('bruno@esempio.it', 'passwordlunga2')
  assert.ok(a.ok && b.ok, 'i due conti non si sono creati')
  anna = a.ok ? a.id : ''
  bruno = b.ok ? b.id : ''
})

after(async () => {
  await pg.close()
  delete process.env.MYYND_DATI
  delete process.env.MYYND_POSTGRES
  rmSync(CASA, { recursive: true, force: true })
})

// — i conti —

test('si registrano e si contano, e lo stesso indirizzo non si registra due volte', async () => {
  assert.equal(conti.quanti(), 2)
  assert.deepEqual(conti.tutti(), [anna, bruno])
  const di = await conti.registra('anna@esempio.it', 'unaltrapassword')
  assert.equal(di.ok, false)
})

test('la password giusta apre, quella sbagliata no, e un indirizzo ignoto non si distingue', async () => {
  assert.equal((await conti.entra('anna@esempio.it', 'passwordlunga1')).ok, true)
  const a = await conti.entra('anna@esempio.it', 'sbagliata1234')
  const b = await conti.entra('nessuno@esempio.it', 'sbagliata1234')
  assert.equal(a.ok, false)
  assert.equal(b.ok, false)
  assert.equal(a.ok === false && a.errore, b.ok === false && b.errore)
})

test('la password si verifica sul database, non su quello che è in memoria', async () => {
  assert.equal(await conti.verifica(anna, 'passwordlunga1'), true)
  assert.equal(await conti.verifica(anna, 'passwordlunga2'), false)
})

// — le sessioni —

test('un token porta al suo utente; chiuderlo lo spegne e non spegne gli altri', async () => {
  const uno = await conti.perProva.apri(anna)
  const due = await conti.perProva.apri(anna)
  assert.equal(await conti.utenteDelToken(uno), anna)
  await conti.chiudi(uno)
  assert.equal(await conti.utenteDelToken(uno), null)
  assert.equal(await conti.utenteDelToken(due), anna)
  assert.equal(await conti.utenteDelToken('a'.repeat(64)), null)
})

test('una replica appena accesa riconosce la sessione aperta da un’altra', async () => {
  /*
   * È il caso per cui i conti stanno su Postgres e non su un disco: due
   * contenitori, o lo stesso contenitore dopo un redeploy. La memoria è vuota,
   * il database no. Il token deve valere, e subito dopo `cartellaDi` e `conto`
   * — che sono sincroni e leggono solo dalla memoria — devono sapere di chi è.
   */
  const t = await conti.perProva.apri(bruno)
  conti.perProva.dimentica()
  assert.throws(() => conti.conto(bruno) === null && (() => { throw new Error('vuoto') })(), /vuoto/,
    'la memoria doveva essere vuota prima della richiesta')
  assert.equal(await conti.utenteDelToken(t), bruno)
  assert.ok(conti.conto(bruno), 'il conto non è stato ripreso dal database')
  assert.equal(conti.conto(bruno)?.email, 'bruno@esempio.it')
  assert.equal(conti.quanti(), 1, 'ripresa solo la persona che si è presentata, non tutte')
})

test('una sessione più vecchia di trenta giorni non vale, anche se è in memoria', async () => {
  const t = await conti.perProva.apri(anna)
  const { createHash } = await import('node:crypto')
  const imp = createHash('sha256').update(t).digest('hex')
  const fa = new Date(Date.now() - 31 * 86_400_000).toISOString()
  await postgres.q('UPDATE myynd_sessioni SET quando = $1 WHERE impronta = $2', [fa, imp])
  conti.perProva.dimentica()
  assert.equal(await conti.utenteDelToken(t), null)
  const { rows } = await postgres.q('SELECT 1 FROM myynd_sessioni WHERE impronta = $1', [imp])
  assert.equal(rows.length, 0, 'la sessione scaduta è rimasta sul database')
})

test('cambiare la password chiude tutte le sessioni e la vecchia non entra più', async () => {
  const t = await conti.perProva.apri(anna)
  const e = await conti.cambiaPassword(anna, 'unapasswordnuova')
  assert.ok(e.ok && e.sessioniChiuse >= 1)
  assert.equal(await conti.utenteDelToken(t), null)
  assert.equal((await conti.entra('anna@esempio.it', 'passwordlunga1')).ok, false)
  assert.equal((await conti.entra('anna@esempio.it', 'unapasswordnuova')).ok, true)
})

// — la configurazione —

test('quello che scrive uno non compare a un altro', async () => {
  chi.dentro(anna, () => cfg.aggiorna({ nome: 'Anna', argomenti: 'vela' }))
  chi.dentro(bruno, () => cfg.aggiorna({ nome: 'Bruno' }))
  assert.equal(chi.dentro(anna, () => cfg.leggi().nome), 'Anna')
  assert.equal(chi.dentro(bruno, () => cfg.leggi().nome), 'Bruno')
  assert.equal(chi.dentro(bruno, () => cfg.leggi().argomenti), undefined)
})

test('sul database le credenziali sono un blob, e senza chiave non dicono niente', async () => {
  /*
   * La prova che conta più di tutte in questo file. La password della casella
   * finisce su un database ospitato da qualcun altro: se lì fosse leggibile,
   * tutto il resto di questo lavoro sarebbe un peggioramento.
   */
  chi.dentro(anna, () => cfg.aggiorna({
    posta: { host: 'imap.anna.it', porta: 993, utente: 'anna@esempio.it', password: 'segreto-di-anna' }
  }))
  await cfg.scaricato()
  const { rows } = await postgres.q('SELECT cifrato FROM myynd_configurazioni WHERE utente = $1', [anna])
  const blob = String(rows[0]?.cifrato ?? '')
  assert.ok(blob.startsWith('v1.'), 'il blob non ha la sua versione davanti')
  assert.ok(!blob.includes('segreto-di-anna'), 'la password è sul database in chiaro')
  assert.ok(!blob.includes('imap.anna.it'), 'l’host è sul database in chiaro')
  assert.equal(JSON.parse(postgres.decifra(blob)).posta.password, 'segreto-di-anna')
  // un blob toccato non si decifra in qualcosa di plausibile: si rifiuta
  const manomesso = blob.slice(0, -4) + (blob.endsWith('AAAA') ? 'BBBB' : 'AAAA')
  assert.throws(() => postgres.decifra(manomesso))
})

test('un processo che riparte ritrova la configurazione di ognuno', async () => {
  cfg.perProva.dimentica()
  assert.equal(chi.dentro(anna, () => cfg.leggi().nome), undefined, 'la memoria doveva essere vuota')
  await cfg.avvia()
  assert.equal(chi.dentro(anna, () => cfg.leggi().nome), 'Anna')
  assert.equal(chi.dentro(anna, () => cfg.leggi().posta?.password), 'segreto-di-anna')
  assert.equal(chi.dentro(bruno, () => cfg.leggi().nome), 'Bruno')
})

test('dieci scritture di fila arrivano tutte, e l’ultima vince', async () => {
  for (let i = 1; i <= 10; i++) chi.dentro(bruno, () => cfg.aggiorna({ oreFatte: i }))
  await cfg.scaricato()
  cfg.perProva.dimentica()
  await cfg.avvia()
  assert.equal(chi.dentro(bruno, () => cfg.leggi().oreFatte), 10)
})

test('leggi() dà una copia: toccarla non cambia niente', () => {
  const c = chi.dentro(anna, () => cfg.leggi())
  c.nome = 'Nessuno'
  assert.equal(chi.dentro(anna, () => cfg.leggi().nome), 'Anna')
})

test('la configurazione di chi arriva da un’altra replica si va a prendere', async () => {
  // il gancio fra `conti` e `config`: un utente nuovo per questa memoria
  // porta con sé la sua configurazione, senza aspettare il giro dei cinque minuti
  const t = await conti.perProva.apri(anna)
  conti.perProva.dimentica()
  cfg.perProva.dimentica()
  assert.equal(await conti.utenteDelToken(t), anna)
  // il gancio è asincrono: un giro di eventi e la configurazione c'è
  await new Promise(f => setTimeout(f, 50))
  assert.equal(chi.dentro(anna, () => cfg.leggi().nome), 'Anna')
})

test('fuori da una richiesta la configurazione resta quella del file, non di qualcuno', () => {
  // la radice non è di nessuno: su Postgres non deve nemmeno provare a
  // cercarla sul database
  assert.deepEqual(cfg.leggi(), {})
})
