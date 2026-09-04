// L'indirizzo confermato, e la password rimessa.
//
// Le due cose vivono o muoiono insieme a `MYYND_SMTP_HOST`, e le prove qui
// dentro girano con la posta configurata: è l'unico caso in cui esistono. Il
// caso opposto — **senza posta non cambia niente** — è quello che protegge
// un'installazione di casa, e sta in `senzaPosta.test.ts`: vive in un file suo
// perché queste variabili si leggono al caricamento del modulo, e nello stesso
// processo non si può averle e non averle.
//
// Non si prova nodemailer: si prova *quando* parte una mail, a chi, e cosa c'è
// dentro il collegamento. Chi spedisce arriva da fuori — `postaUscita.perProva`
// — e finisce in un elenco.
//
//   node --test server/verifica.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-verifica-'))
process.env.MYYND_DATI = CASA
process.env.RAILWAY_ENVIRONMENT = 'prova'
process.env.MYYND_PUBBLICO = 'myynd.esempio.it'
// senza, ospitati la porta si chiude da sé dopo il primo conto — e qui i conti
// che servono sono cinque
process.env.MYYND_REGISTRAZIONE = 'aperta'
// prima di importare `postaUscita`: le legge al caricamento, come chi ospita
process.env.MYYND_SMTP_HOST = 'smtp.esempio.it'
process.env.MYYND_SMTP_DA = 'myynd@esempio.it'

const postaUscita = await import('./postaUscita.ts')
const conti = await import('./conti.ts')
const auth = await import('./auth.ts')
const gettoniEmail = await import('./gettoniEmail.ts')

/** Tutto quello che sarebbe partito. */
const mandate: { a: string; oggetto: string; testo: string }[] = []
postaUscita.perProva.intercetta(async m => { mandate.push(m) })

/** Il gettone dentro l'ultimo collegamento mandato a questo indirizzo. */
function gettoneDi(a: string, campo: 'verifica' | 'reimposta'): string {
  for (let i = mandate.length - 1; i >= 0; i--) {
    if (mandate[i]!.a !== a) continue
    const m = new RegExp(`https://myynd\\.esempio\\.it/\\?${campo}=([0-9a-f]{64})`).exec(mandate[i]!.testo)
    if (m) return m[1]!
  }
  return ''
}

before(() => {
  assert.ok(postaUscita.configurata(), 'le prove qui dentro girano solo con la posta configurata')
  assert.ok(postaUscita.verificaObbligatoria(), 'ospitati e con la posta, la conferma dev’essere obbligatoria')
})

after(async () => {
  await conti.perProva.svuota()
  for (const v of ['MYYND_DATI', 'RAILWAY_ENVIRONMENT', 'MYYND_PUBBLICO', 'MYYND_REGISTRAZIONE', 'MYYND_SMTP_HOST', 'MYYND_SMTP_DA']) delete process.env[v]
  rmSync(CASA, { recursive: true, force: true })
})

// — il primo conto, e tutti gli altri —

test('il primo conto entra senza confermare niente', async () => {
  /*
   * È la persona che ha appena messo su il server. Se anche lei dovesse
   * aspettare una mail, e quella mail non partisse — un host sbagliato, una
   * porta chiusa, la prima volta che si prova quella configurazione — resterebbe
   * fuori dalla propria installazione senza nessuna strada che non sia la riga
   * di comando.
   */
  assert.equal(conti.quanti(), 0)
  const e = await auth.registra('capo@esempio.it', 'passwordlunga1')
  assert.ok(e.ok)
  assert.ok(e.ok && e.token, 'il primo conto è nato senza sessione')
  assert.equal(e.ok && e.daVerificare, undefined)
  assert.equal(mandate.length, 0, 'al primo conto è partita una mail che non serviva')
})

test('dal secondo in poi si conferma, e prima non si entra', async () => {
  const e = await auth.registra('anna@esempio.it', 'passwordlunga2')
  assert.ok(e.ok)
  assert.equal(e.ok && e.token, '', 'è nata una sessione per un conto non confermato')
  assert.equal(e.ok && e.daVerificare, true)

  // la mail è partita, e dentro c'è un collegamento sul dominio pubblico
  assert.equal(mandate.at(-1)?.a, 'anna@esempio.it')
  assert.ok(gettoneDi('anna@esempio.it', 'verifica'), 'nella mail non c’è nessun collegamento di conferma')

  // la password è quella giusta, e non basta
  const dentro = await auth.entra('anna@esempio.it', 'passwordlunga2')
  assert.equal(dentro.ok, false)
  assert.equal(dentro.ok === false && dentro.daVerificare, true)
})

test('il collegamento conferma, apre una sessione, e vale una volta sola', async () => {
  const g = gettoneDi('anna@esempio.it', 'verifica')
  const e = await auth.confermaIndirizzo(g)
  assert.ok(e.ok)
  assert.ok(e.ok && e.token, 'confermato e senza sessione: si sarebbe tornati all’accesso')
  assert.equal(await conti.utenteDelToken(e.ok ? e.token : ''), e.ok ? e.utente : '')

  // adesso si entra con la password
  assert.equal((await auth.entra('anna@esempio.it', 'passwordlunga2')).ok, true)

  // e lo stesso collegamento non apre più niente: resta per sempre in una
  // casella di posta, ed è il primo posto in cui guarda chi ruba un portatile
  const ancora = await auth.confermaIndirizzo(g)
  assert.equal(ancora.ok, false)
})

test('un gettone di conferma non vale come gettone per la password', async () => {
  // gli scopi non si scambiano: chi si fa mandare una conferma non deve poterla
  // usare per scegliere una password nuova senza sapere quella di prima
  const e = await auth.registra('carlo@esempio.it', 'passwordlunga3')
  assert.ok(e.ok)
  const g = gettoneDi('carlo@esempio.it', 'verifica')
  assert.ok(g)
  assert.equal(await gettoniEmail.consuma(g, 'reimposta'), null)
  assert.ok(await gettoniEmail.consuma(g, 'verifica'))
})

test('«rimandamela» rimanda, e a chi ha già confermato non manda niente', async () => {
  const e = await auth.registra('dina@esempio.it', 'passwordlunga4')
  assert.ok(e.ok)
  const quante = mandate.length
  await auth.rimandaLaConferma('dina@esempio.it')
  assert.equal(mandate.length, quante + 1)

  // Anna ha già confermato: niente
  await auth.rimandaLaConferma('anna@esempio.it')
  assert.equal(mandate.length, quante + 1)

  // e un indirizzo che non c'è non fa partire niente e non lancia: la risposta
  // dev'essere identica, o diventa un modo di chiedere chi è iscritto qui
  await auth.rimandaLaConferma('nessuno@esempio.it')
  assert.equal(mandate.length, quante + 1)
})

// — la password dimenticata —

test('chiedere di rimetterla non dice se quell’indirizzo esiste', async () => {
  const quante = mandate.length
  await auth.chiediReimpostazione('nessuno@esempio.it')
  assert.equal(mandate.length, quante, 'è partita una mail per un indirizzo che non esiste')

  await auth.chiediReimpostazione('anna@esempio.it')
  assert.equal(mandate.length, quante + 1)
  assert.ok(gettoneDi('anna@esempio.it', 'reimposta'), 'nella mail non c’è il collegamento')
  // le due chiamate non lanciano né tornano niente di diverso: da fuori sono
  // indistinguibili, ed è tutto il punto
})

test('il collegamento mette la password nuova, chiude tutto, e fa entrare', async () => {
  const vecchia = await conti.perProva.apri((await conti.aQuestoIndirizzo('anna@esempio.it'))!.id)
  const g = gettoneDi('anna@esempio.it', 'reimposta')

  const e = await auth.reimposta(g, 'unapasswordnuova')
  assert.ok(e.ok)
  assert.ok(e.ok && e.token)

  // la sessione di prima è chiusa: chi rimette una password lo fa perché
  // qualcosa non gli torna, e le chiavi vecchie non restano in giro
  assert.equal(await conti.utenteDelToken(vecchia), null)
  // quella appena aperta invece vale: o si resterebbe fuori dalla porta che si
  // è appena chiusa a chiave
  assert.equal(await conti.utenteDelToken(e.ok ? e.token : ''), e.ok ? e.utente : '')

  assert.equal((await auth.entra('anna@esempio.it', 'passwordlunga2')).ok, false)
  assert.equal((await auth.entra('anna@esempio.it', 'unapasswordnuova')).ok, true)
})

test('lo stesso collegamento non rimette una seconda password', async () => {
  const g = gettoneDi('anna@esempio.it', 'reimposta')
  const e = await auth.reimposta(g, 'ancoraunaltra')
  assert.equal(e.ok, false)
  assert.equal((await auth.entra('anna@esempio.it', 'unapasswordnuova')).ok, true)
})

test('un gettone inventato non rimette niente', async () => {
  assert.equal((await auth.reimposta('a'.repeat(64), 'unapasswordnuova')).ok, false)
  assert.equal((await auth.reimposta('', 'unapasswordnuova')).ok, false)
})

test('rimettere la password conferma anche l’indirizzo', async () => {
  // ha appena dimostrato di ricevere la posta lì, che è quello che la conferma
  // chiede: chiedergliela ancora sarebbe un giro a vuoto
  await auth.chiediReimpostazione('dina@esempio.it')
  const e = await auth.reimposta(gettoneDi('dina@esempio.it', 'reimposta'), 'unapassworddidina')
  assert.ok(e.ok)
  assert.ok((await conti.aQuestoIndirizzo('dina@esempio.it'))?.verificato)
  assert.equal((await auth.entra('dina@esempio.it', 'unapassworddidina')).ok, true)
})

/*
 * Con la posta del server rotta, le tre risposte devono restare identiche.
 *
 * «Rimandamela» dice se la mail è partita, perché dire «guarda la posta» a chi
 * non riceverà niente è la bugia peggiore che una schermata d'accesso possa
 * dire. Ma quella risposta deve parlare del *server*, non dell'indirizzo:
 * rispondere «non è partita» solo per gli indirizzi che esistono trasforma
 * questa rotta in un modo di chiedere chi è iscritto qui — basta spegnere la
 * posta e provarli uno a uno.
 */
test('con la posta rotta, «rimandamela» non dice quali indirizzi esistono', async () => {
  postaUscita.perProva.salute(false)
  try {
    const iscritto = await auth.rimandaLaConferma('secondo@esempio.it')
    const inesistente = await auth.rimandaLaConferma('nessuno@altrove.it')
    const confermato = await auth.rimandaLaConferma('primo@esempio.it')
    assert.deepEqual(iscritto, { mailPartita: false })
    assert.deepEqual(inesistente, iscritto, 'un indirizzo che non c’è risponde come uno iscritto')
    assert.deepEqual(confermato, iscritto, 'e uno già confermato pure')
  } finally {
    postaUscita.perProva.salute(null)
  }
})

test('con la posta sana risponde di sì, sempre, a chiunque', async () => {
  postaUscita.perProva.salute(true)
  try {
    assert.deepEqual(await auth.rimandaLaConferma('nessuno@altrove.it'), { mailPartita: true })
  } finally {
    postaUscita.perProva.salute(null)
  }
})
