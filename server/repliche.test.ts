// Due repliche sullo stesso database, e le due metà dello stesso guasto.
//
// Su un server con più di un contenitore, `config.ts` gira in due processi che
// non si conoscono e scrivono la stessa tabella. Prima si mangiavano a vicenda
// **in silenzio**, in due modi che erano lo stesso errore visto da due lati:
//
//   1. una data sola per tutti. `caricaLeNuove()` chiedeva «cosa c'è di più
//      recente di questa data», e quella data la alzavano anche le *proprie*
//      scritture. Bastava che B scrivesse la configurazione di Vera perché la
//      scrittura che A aveva fatto un istante prima su quella di Ugo restasse
//      indietro alla data e non venisse letta mai più. Non per un giro: per
//      sempre.
//   2. la scrittura che vince sempre. B teneva in memoria la configurazione di
//      Ugo com'era mezz'ora fa; salvava una preferenza, e mandava al database
//      *tutta* quella copia — cancellando la password della casella che A aveva
//      appena scritto.
//
// Nessuno dei due dava un errore. Il modo in cui si presentavano era una
// credenziale che sparisce, e una persona che dice «l'avevo collegata».
//
// Le due repliche qui sono due istanze vere dello stesso modulo — `config.ts` e
// `config.ts?replica=b` — sopra un PGlite solo. Node le tiene separate perché
// l'indirizzo è diverso, e il database è lo stesso perché `postgres.ts`, che
// non ha la coda, è lo stesso modulo per tutt'e due.
//
//   node --test server/repliche.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-repliche-'))
process.env.MYYND_DATI = CASA
process.env.RAILWAY_ENVIRONMENT = 'prova'
process.env.MYYND_POSTGRES = 'pglite://in-processo'
delete process.env.MYYND_CHIAVE

const postgres = await import('./postgres.ts')
const { PGlite } = await import('@electric-sql/pglite')
const pg = new PGlite()
postgres.usa(pg as unknown as import('./postgres.ts').Esecutore)
postgres.usaChiave('una frase lunga a caso, solo per le prove')

const conti = await import('./conti.ts')
const chi = await import('./chi.ts')
/**
 * La replica A e la replica B: due memorie, una tabella.
 *
 * La coda `?replica=b` è quello che convince Node a caricare `config.ts` una
 * seconda volta: per lui è un altro indirizzo, quindi un altro modulo, con le
 * sue variabili. Gli import che stanno *dentro* quel modulo — `postgres.ts`,
 * `conti.ts` — la coda non ce l'hanno e restano gli stessi: due repliche, un
 * database. È esattamente la forma del guasto.
 *
 * L'indirizzo sta in una variabile e non scritto dentro l'import, e non è
 * questione di stile: TypeScript risolve un `import()` scritto a mano e non
 * conosce nessun file che si chiami `config.ts?replica=b`. Node sì.
 */
const A = await import('./config.ts')
const ALTRA_REPLICA = './config.ts?replica=b'
const B = await import(ALTRA_REPLICA) as typeof A

let ugo = ''
let vera = ''

before(async () => {
  await conti.avvia()
  await A.avvia()
  await B.avvia()
  const u = await conti.registra('ugo@esempio.it', 'passwordlunga1')
  const v = await conti.registra('vera@esempio.it', 'passwordlunga2')
  assert.ok(u.ok && v.ok)
  ugo = u.ok ? u.id : ''
  vera = v.ok ? v.id : ''
  assert.notEqual(A, B, 'le due repliche sono lo stesso modulo: la prova non proverebbe niente')
})

after(async () => {
  await pg.close()
  for (const x of ['MYYND_DATI', 'RAILWAY_ENVIRONMENT', 'MYYND_POSTGRES']) delete process.env[x]
  rmSync(CASA, { recursive: true, force: true })
})

/** Scrivi come questa replica, e aspetta che sia davvero sul database. */
async function scrive(replica: typeof A, utente: string, patch: Parameters<typeof A.aggiorna>[0]) {
  chi.dentro(utente, () => replica.aggiorna(patch))
  await replica.scaricato(5_000)
}

test('la scrittura di una replica non nasconde quella dell’altra', async () => {
  /*
   * La prima metà del guasto, riprodotta nell'ordine esatto in cui capitava.
   *
   * B rilegge *dopo* aver scritto Vera. Con una data sola, quella scrittura
   * aveva alzato il segno oltre la scrittura di A su Ugo, e Ugo non sarebbe
   * mai più stato riletto da questa replica.
   */
  await scrive(A, ugo, { nome: 'Ugo' })
  await scrive(B, vera, { nome: 'Vera' })

  await B.avvia()
  assert.equal(chi.dentro(ugo, () => B.leggi().nome), 'Ugo',
    'la replica B non ha mai visto la scrittura di A: la data di B se l’era mangiata')
  assert.equal(chi.dentro(vera, () => B.leggi().nome), 'Vera')
})

test('una scrittura partita da una copia vecchia non cancella quella nuova', async () => {
  /*
   * La seconda metà, che è quella che perde le credenziali.
   *
   * B ha in mano la configurazione di Ugo com'era prima; A ci scrive dentro la
   * password della casella; poi B salva una preferenza qualunque. Con la
   * scrittura che vince sempre, B rimandava *tutta* la sua copia — e la
   * password non c'era più. Nessun errore, nessun log: una persona che dice
   * «l'avevo collegata».
   */
  await B.avvia()   // B è allineata a quello che c'è adesso
  assert.equal(chi.dentro(ugo, () => B.leggi().posta), undefined)

  await scrive(A, ugo, {
    posta: { host: 'imap.ugo.it', porta: 993, utente: 'ugo@esempio.it', password: 'segreto-di-ugo' }
  })
  // B non l'ha riletta: sa ancora quello che sapeva prima
  await scrive(B, ugo, { tono: 'caldo' })

  // sul database ci devono essere tutte e due le cose
  const { rows } = await postgres.q('SELECT cifrato FROM myynd_configurazioni WHERE utente = $1', [ugo])
  const sul = JSON.parse(postgres.decifra(String(rows[0]!.cifrato)))
  assert.equal(sul.posta?.password, 'segreto-di-ugo', 'la replica B ha cancellato la credenziale scritta da A')
  assert.equal(sul.tono, 'caldo', 'la preferenza salvata su B è stata buttata via')
  assert.equal(sul.nome, 'Ugo')

  // e le due repliche, rilette, dicono la stessa cosa
  A.perProva.dimentica(); await A.avvia()
  assert.equal(chi.dentro(ugo, () => A.leggi().posta?.password), 'segreto-di-ugo')
  assert.equal(chi.dentro(ugo, () => A.leggi().tono), 'caldo')
  assert.equal(chi.dentro(ugo, () => B.leggi().tono), 'caldo')
})

test('quello che una replica toglie resta tolto anche fondendo', async () => {
  // scollegare una fonte è una scrittura come un'altra, e non deve resuscitare
  // per via di una fusione: se B toglie `posta`, `posta` se ne va
  await A.avvia(); await B.avvia()
  await scrive(A, ugo, { nome: 'Ugo detto Ughetto' })
  chi.dentro(ugo, () => {
    const c = B.leggi()
    delete c.posta
    B.scrivi(c)
  })
  await B.scaricato(5_000)

  const { rows } = await postgres.q('SELECT cifrato FROM myynd_configurazioni WHERE utente = $1', [ugo])
  const sul = JSON.parse(postgres.decifra(String(rows[0]!.cifrato)))
  assert.equal(sul.posta, undefined, 'la fonte scollegata su B è tornata su')
  assert.equal(sul.nome, 'Ugo detto Ughetto', 'il nome scritto da A si è perso nella fusione')
})

test('dieci scritture di fila da due repliche arrivano tutte', async () => {
  await A.avvia(); await B.avvia()
  for (let i = 1; i <= 10; i++) {
    chi.dentro(vera, () => (i % 2 ? A : B).aggiorna(i % 2 ? { oreFatte: i } : { tetto: i * 100 }))
    await (i % 2 ? A : B).scaricato(5_000)
  }
  A.perProva.dimentica()
  await A.avvia()
  // l'ultima di ognuna delle due, e nessuna delle due sopra l'altra
  assert.equal(chi.dentro(vera, () => A.leggi().oreFatte), 9)
  assert.equal(chi.dentro(vera, () => A.leggi().tetto), 1000)
})
