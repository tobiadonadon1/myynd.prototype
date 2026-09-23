// Il no dell'azienda, distinto dal no della password.
//
// Domanda della prima tester esterna (23 settembre 2026): come funziona
// Myynd in un'azienda dove un amministratore deve approvare le integrazioni?
// La risposta comincia qui: riconoscere quando a dire di no è l'azienda, e
// solo quando il servizio lo dice esplicitamente. Le frasi e i codici sono
// quelli veri, con la loro fonte accanto; una password sbagliata deve restare
// una password sbagliata.
//
//   node --test --disable-warning=ExperimentalWarning server/amministratore.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import type { ImapFlow } from 'imapflow'

process.env.RAILWAY_ENVIRONMENT = 'prova'
process.env.MYYND_PUBBLICO = 'myynd.esempio.it'

const amm = await import('./connettori/amministratore.ts')
const posta = await import('./connettori/posta.ts')
const oauth = await import('./connettori/oauth.ts')
const chi = await import('./chi.ts')

after(() => { posta.usaClient(null) })

// — Gmail via IMAP —

/** Le risposte di Gmail al login, testuali. */
const GMAIL = {
  // help.cloudiway.com, «IMAP access is disabled for your domain»
  dominio: '[ALERT] IMAP access is disabled for your domain. Please contact your domain administrator for questions about this feature. (Failure)',
  // provata dal vivo il 23 settembre 2026 contro imap.gmail.com
  sbagliata: '[AUTHENTICATIONFAILED] Invalid credentials (Failure)',
  // learn.microsoft.com, migrazione da Google Workspace: la citano parola per parola
  perLeApp: '[ALERT] Application-specific password required: https://support.google.com/accounts/answer/185833 (Failure)'
}

test('IMAP spento dal dominio è un caso da amministratore, con il dominio dell’azienda', () => {
  assert.deepEqual(amm.daImap(GMAIL.dominio, 'anna@acme.it'), { servizio: 'gmail', dominio: 'acme.it' })
  // un indirizzo personale non ha un'azienda da nominare
  assert.deepEqual(amm.daImap(GMAIL.dominio, 'anna@gmail.com'), { servizio: 'gmail' })
})

test('una password sbagliata, o quella dell’account, non sono mai un caso da amministratore', () => {
  assert.equal(amm.daImap(GMAIL.sbagliata, 'anna@acme.it'), null)
  assert.equal(amm.daImap(GMAIL.perLeApp, 'anna@acme.it'), null)
})

/** Una casella finta che al login risponde come imapflow quando Gmail dice di no. */
function rifiuta(testo: string) {
  return (() => ({
    async connect() {
      const e = Object.assign(new Error('Command failed'), {
        responseText: testo, serverResponseCode: 'ALERT', authenticationFailed: true
      })
      throw e
    },
    async close() {},
    async logout() {}
  })) as unknown as () => ImapFlow
}

const conto = { host: 'imap.gmail.com', porta: 993, utente: 'anna@acme.it', password: 'abcdefghijklmnop', giorni: 30 }

test('la prova della posta porta il caso fino alla scheda', async () => {
  posta.usaClient(rifiuta(GMAIL.dominio))
  const e = await posta.prova(conto)
  assert.equal(e.ok, false)
  const no = e as { errore: string; amministratore?: unknown }
  assert.deepEqual(no.amministratore, { servizio: 'gmail', dominio: 'acme.it' })
  assert.equal(no.errore, amm.IMAP_SPENTO)
})

test('e la password sbagliata resta la frase di sempre, senza caso', async () => {
  posta.usaClient(rifiuta(GMAIL.sbagliata))
  const e = await posta.prova(conto) as { errore: string; amministratore?: unknown }
  assert.equal(e.amministratore, undefined)
  assert.match(e.errore, /Gmail ha rifiutato questa password/)
})

test('Outlook non manda più a una scheda che non si può collegare', async () => {
  // Microsoft 365 risponde così a qualunque password, anche giusta (provato
  // dal vivo il 23 settembre 2026): «NO AUTHENTICATE failed. Provided
  // authentication mechanism is not supported.»
  posta.usaClient(rifiuta('AUTHENTICATE failed. Provided authentication mechanism is not supported.'))
  const e = await posta.prova({ ...conto, host: 'outlook.office365.com' }) as { errore: string }
  assert.doesNotMatch(e.errore, /collega «Outlook e Calendario»/)
  assert.match(e.errore, /arriva presto/)
})

// — Microsoft Entra ID —

test('i codici AADSTS dell’amministratore sono suoi; «hai detto di no» resta tuo', () => {
  // learn.microsoft.com, «Microsoft Entra authentication and authorization error codes»
  const app = { clientId: '11111111-2222-3333-4444-555555555555', tenant: 'acme.onmicrosoft.com' }
  for (const codice of ['65001', '90094', '90095', '50105', '53003', '530035']) {
    const c = amm.daMicrosoft('access_denied', `AADSTS${codice}: qualcosa`, app)
    assert.equal(c?.servizio, 'microsoft-oauth', codice)
  }
  assert.equal(amm.daMicrosoft('consent_required', null)?.servizio, 'microsoft-oauth')
  // 65004: «User declined to consent to access the app»
  assert.equal(amm.daMicrosoft('access_denied', 'AADSTS65004: User declined to consent to access the app.', app), null)
  assert.equal(amm.daMicrosoft('access_denied', null, app), null)
})

test('il consenso per tutta l’organizzazione ha l’indirizzo che Microsoft dà da incollare', () => {
  // learn.microsoft.com, «Grant tenant-wide admin consent to an application»
  assert.equal(amm.consensoMicrosoft('abc', 'acme.onmicrosoft.com'),
    'https://login.microsoftonline.com/acme.onmicrosoft.com/adminconsent?client_id=abc')
  assert.equal(amm.consensoMicrosoft('abc', ''), 'https://login.microsoftonline.com/common/adminconsent?client_id=abc')
  const c = amm.daMicrosoft('access_denied', 'AADSTS90094: The grant requires admin permission.', { clientId: 'abc', tenant: 'acme.onmicrosoft.com' })
  assert.equal(c?.consenso, 'https://login.microsoftonline.com/acme.onmicrosoft.com/adminconsent?client_id=abc')
  assert.equal(c?.app, 'abc')
})

test('il ritorno dal browser distingue l’azienda da te', async () => {
  const sportello: import('./connettori/oauth.ts').Sportello = {
    nome: 'Microsoft',
    gettoni: 'https://prova.invalid/token',
    campi: { client_id: 'abc' },
    autorizza: ({ redirect, stato }) => `https://prova.invalid/auth?redirect_uri=${encodeURIComponent(redirect)}&state=${stato}`,
    approvazione: (e, d) => amm.daMicrosoft(e, d, { clientId: 'abc' })
  }
  const parti = () => {
    const { dove } = chi.dentro('u1', () => oauth.avviaWeb(sportello, async () => {}))
    const stato = new URL(dove).searchParams.get('state')!
    return { stato, b: oauth.biglietto(stato) }
  }

  const uno = parti()
  await assert.rejects(
    () => oauth.completaWeb(uno.stato, null, 'access_denied', uno.b, 'AADSTS90094: An administrator of Acme has set a policy that prevents you from granting Myynd the permissions it is requesting.'),
    (e: unknown) => amm.casoDi(e)?.servizio === 'microsoft-oauth' && /deve approvare Myynd su Microsoft/.test((e as Error).message)
  )

  const due = parti()
  await assert.rejects(
    () => oauth.completaWeb(due.stato, null, 'access_denied', due.b, 'AADSTS65004: User declined to consent to access the app.'),
    (e: unknown) => amm.casoDi(e) === null && /Hai detto di no a Microsoft/.test((e as Error).message)
  )
})

test('anche lo scambio del codice riconosce il consenso che manca', async () => {
  const vera = globalThis.fetch
  globalThis.fetch = (async () => Response.json(
    { error: 'invalid_grant', error_description: 'AADSTS65001: The user or administrator has not consented to use the application with ID abc.' },
    { status: 400 }
  )) as typeof fetch
  try {
    await assert.rejects(
      () => oauth.chiediGettoni({
        nome: 'Microsoft', gettoni: 'https://prova.invalid/token', campi: {},
        autorizza: () => '', approvazione: (e, d) => amm.daMicrosoft(e, d, { clientId: 'abc' })
      }, { code: 'x' }),
      (e: unknown) => amm.casoDi(e)?.servizio === 'microsoft-oauth'
    )
  } finally { globalThis.fetch = vera }
})

// — Google OAuth —

test('Google: admin_policy_enforced e org_internal sono dell’azienda, access_denied no', () => {
  // support.google.com/accounts, answer 16668185
  assert.equal(amm.daGoogle('admin_policy_enforced', null)?.servizio, 'google-oauth')
  assert.equal(amm.daGoogle('org_internal', null)?.servizio, 'google-oauth')
  assert.equal(amm.daGoogle('access_not_configured', null)?.servizio, 'google-oauth')
  assert.equal(amm.daGoogle('access_denied', null), null)
  assert.equal(amm.daGoogle('admin_policy_enforced', null, { clientId: 'x.apps.googleusercontent.com' })?.app, 'x.apps.googleusercontent.com')
})

test('i domini personali non sono un’azienda', () => {
  for (const d of ['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.it', 'icloud.com', 'me.com', 'yahoo.it']) {
    assert.equal(amm.dominioAziendale(`x@${d}`), undefined, d)
  }
  assert.equal(amm.dominioAziendale('x@acme.it'), 'acme.it')
  assert.equal(amm.dominioAziendale('senza-chiocciola'), undefined)
})
