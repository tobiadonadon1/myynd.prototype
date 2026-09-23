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

test('i codici AADSTS dell’amministratore sono suoi, ognuno con il suo caso; «hai detto di no» resta tuo', () => {
  // learn.microsoft.com, «Microsoft Entra authentication and authorization error codes»
  const app = { clientId: '11111111-2222-3333-4444-555555555555', tenant: 'acme.onmicrosoft.com' }
  for (const codice of ['65001', '90094', '90095']) {
    assert.equal(amm.daMicrosoft('access_denied', `AADSTS${codice}: qualcosa`, app)?.servizio, 'microsoft-oauth', codice)
  }
  // 50105: l'utente non è assegnato all'app; il consenso c'è già, e il link non serve
  const ass = amm.daMicrosoft('access_denied', 'AADSTS50105: The signed in user is not assigned to a role for the application.', app)
  assert.equal(ass?.servizio, 'microsoft-assegnazione')
  assert.equal(ass?.consenso, undefined)
  // 53003 e 530035: accesso condizionale e impostazioni di sicurezza predefinite
  for (const codice of ['53003', '530035']) {
    const c = amm.daMicrosoft('access_denied', `AADSTS${codice}: Access has been blocked.`, app)
    assert.equal(c?.servizio, 'microsoft-accesso', codice)
    assert.equal(c?.consenso, undefined, codice)
  }
  assert.equal(amm.daMicrosoft('consent_required', null)?.servizio, 'microsoft-oauth')
  // 65004: «User declined to consent to access the app»
  assert.equal(amm.daMicrosoft('access_denied', 'AADSTS65004: User declined to consent to access the app.', app), null)
  assert.equal(amm.daMicrosoft('access_denied', null, app), null)
})

test('il consenso per tutta l’organizzazione usa l’endpoint v2, con i permessi e il ritorno, e mai «common»', () => {
  // learn.microsoft.com, «Admin consent on the Microsoft identity platform»
  const u = new URL(amm.consensoMicrosoft({
    clientId: 'abc', tenant: 'acme.onmicrosoft.com',
    ambiti: ['offline_access', 'User.Read', 'Mail.Read', 'Calendars.Read'], ritorno: 'http://localhost'
  }))
  assert.equal(u.origin + u.pathname, 'https://login.microsoftonline.com/acme.onmicrosoft.com/v2.0/adminconsent')
  assert.equal(u.searchParams.get('client_id'), 'abc')
  assert.equal(u.searchParams.get('scope'), 'https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Calendars.Read')
  assert.equal(u.searchParams.get('redirect_uri'), 'http://localhost')
  // senza tenant: il dominio dell'azienda, se si sa, altrimenti `organizations`
  assert.match(amm.consensoMicrosoft({ clientId: 'abc', tenant: 'common', dominio: 'contoso.com' }), /\/contoso\.com\/v2\.0\/adminconsent\?/)
  assert.match(amm.consensoMicrosoft({ clientId: 'abc' }), /\/organizations\/v2\.0\/adminconsent\?/)
  assert.doesNotMatch(amm.consensoMicrosoft({ clientId: 'abc', tenant: 'common' }), /\/common\//)
  // il caso lo porta con sé
  const c = amm.daMicrosoft('access_denied', 'AADSTS90094: The grant requires admin permission.', { clientId: 'abc', tenant: 'acme.onmicrosoft.com', ambiti: ['Mail.Read'], ritorno: 'https://myynd.esempio.it/api/oauth/ritorno' })
  assert.match(c?.consenso ?? '', /redirect_uri=https%3A%2F%2Fmyynd\.esempio\.it%2Fapi%2Foauth%2Fritorno/)
  assert.equal(c?.app, 'abc')
})

test('una frase per ogni caso di Microsoft', () => {
  assert.equal(amm.fraseDelCaso({ servizio: 'microsoft-assegnazione' }, 'Microsoft'), amm.NON_ASSEGNATO)
  assert.equal(amm.fraseDelCaso({ servizio: 'microsoft-accesso' }, 'Microsoft'), amm.ACCESSO_BLOCCATO)
  assert.match(amm.fraseDelCaso({ servizio: 'microsoft-oauth' }, 'Microsoft'), /deve approvare Myynd su Microsoft/)
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

test('Google: admin_policy_enforced è dell’azienda; org_internal e access_denied no', () => {
  // support.google.com/accounts, answer 16668185
  assert.equal(amm.daGoogle('admin_policy_enforced', null)?.servizio, 'google-oauth')
  // «only members of a specific company or organization can use the app»:
  // l'amministratore di chi collega non può farci niente
  assert.equal(amm.daGoogle('org_internal', null), null)
  assert.ok(amm.soloOrganizzazione('org_internal'))
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

test('org_internal torna dal browser con la sua frase, non con una richiesta all’amministratore', async () => {
  const sportello: import('./connettori/oauth.ts').Sportello = {
    nome: 'Google', gettoni: 'https://prova.invalid/token', campi: { client_id: 'abc' },
    autorizza: ({ redirect, stato }) => `https://prova.invalid/auth?redirect_uri=${encodeURIComponent(redirect)}&state=${stato}`,
    approvazione: (e, d) => amm.daGoogle(e, d)
  }
  const { dove } = chi.dentro('u1', () => oauth.avviaWeb(sportello, async () => {}))
  const stato = new URL(dove).searchParams.get('state')!
  await assert.rejects(
    () => oauth.completaWeb(stato, null, 'org_internal', oauth.biglietto(stato)),
    (e: unknown) => amm.casoDi(e) === null && (e as Error).message === amm.SOLO_ORGANIZZAZIONE
  )
})

// — la richiesta dice il vero: ogni frase attaccata al codice che la rende vera —
//
// La richiesta la legge un revisore della sicurezza. Se domani qualcuno fa
// mandare la posta a un'automazione, o fa cancellare un messaggio a una
// regola, queste prove si rompono prima che la frase diventi falsa.

const { readFileSync, readdirSync } = await import('node:fs')
const { join } = await import('node:path')
const SERVER = new URL('.', import.meta.url).pathname
const fonte = (f: string) => readFileSync(join(SERVER, f), 'utf8')
const tuttiIServer = () => [
  ...readdirSync(SERVER).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts')),
  ...readdirSync(join(SERVER, 'connettori')).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts')).map(f => `connettori/${f}`)
]
const richiesta = await import('../src/amministratore.ts')
const CASA = { ospitato: null, modello: { chi: 'Anthropic (Claude)', locale: false }, jev: false }
const testo = (servizio: import('./connettori/amministratore.ts').ServizioAmministrato) =>
  richiesta.richiestaAmministratore({ servizio }, { inglese: true, dati: CASA }).corpo

test('«manda solo quando premo il suo bottone»: l’invio parte da una rotta sola', () => {
  const chiamate = tuttiIServer().flatMap(f => [...fonte(f).matchAll(/invio\.manda\(/g)].map(() => f))
  assert.deepEqual(chiamate, ['index.ts'])
  const i = fonte('index.ts')
  const dove = i.indexOf('invio.manda(')
  const rotta = i.lastIndexOf("app.post('", dove)
  assert.ok(i.slice(rotta, rotta + 40).startsWith("app.post('/api/compiti/:id/invia'"), 'invio.manda sta fuori dalla rotta del bottone')
  // e `posta.invia` lo chiama solo `invio.ts`
  const smtp = tuttiIServer().filter(f => /posta\.invia\(/.test(fonte(f)))
  assert.deepEqual(smtp, ['invio.ts'])
  assert.match(testo('gmail'), /only when I press its button/)
})

test('«sposta da un bottone, e da solo archivia solo con le regole»: le due strade e basta', () => {
  // `messageMove` sta in due funzioni: lo spostamento del bottone e la regola sul mittente
  const p = fonte('connettori/posta.ts')
  assert.equal([...p.matchAll(/messageMove\(/g)].length, 2)
  const sposta = tuttiIServer().filter(f => /posta\.sposta\(/.test(fonte(f)))
  assert.deepEqual(sposta, ['index.ts'])
  const i = fonte('index.ts')
  const dove = i.indexOf('posta.sposta(')
  assert.ok(i.slice(i.lastIndexOf("app.post('", dove)).startsWith("app.post('/api/compiti/:id/esegui'"))
  // le regole archiviano e basta: nessun'altra azione
  const regole = fonte('sender-rules.ts')
  assert.match(regole, /action: 'archive'/)
  assert.doesNotMatch(regole, /messageDelete|Trash|cestina/)
  assert.match(testo('gmail'), /on its own it only archives mail from senders I have written a rule for/)
})

test('«non cancella niente, tranne le versioni vecchie delle sue bozze»', () => {
  const p = fonte('connettori/posta.ts')
  const cancella = [...p.matchAll(/messageDelete\(/g)].map(m => m.index!)
  assert.equal(cancella.length, 1)
  const funzione = p.lastIndexOf('export async function', cancella[0])
  assert.ok(p.slice(funzione, funzione + 40).startsWith('export async function aggiornaBozza'))
  assert.match(testo('gmail'), /deletes nothing except older versions of drafts it saved itself/)
})

test('Google: nessun invio, e l’agenda non si scrive; gli ambiti sono quelli scritti', async () => {
  const g = fonte('connettori/google.ts')
  assert.doesNotMatch(g, /messages\/send/)
  // `mettiInAgenda` è l'unica scrittura sull'agenda, e non la chiama nessuno
  const chiamanti = tuttiIServer().filter(f => f !== 'connettori/google.ts' && /mettiInAgenda\(/.test(fonte(f)))
  assert.deepEqual(chiamanti, [])
  const google = await import('./connettori/google.ts')
  const drive = await import('./connettori/drive.ts')
  const t = testo('google-oauth')
  for (const a of [...google.AMBITI, ...drive.AMBITI]) assert.ok(t.includes(a.replace('https://www.googleapis.com/auth/', '')), a)
  assert.match(t, /does not send mail or change my calendar or files/)
})

test('Microsoft: gli ambiti nella richiesta sono esattamente quelli chiesti, e tutti di lettura', async () => {
  const ms = await import('./connettori/microsoft.ts')
  const chiesti = new Set<string>(['User.Read', ...Object.values(ms.PARTI).flat()])
  const t = testo('microsoft-oauth')
  const scritti = new Set(/read permissions \(([^)]+)\)/.exec(t)![1]!.split(', '))
  assert.deepEqual([...scritti].sort(), [...chiesti].sort())
  assert.ok([...chiesti].every(a => /\.Read(\.All)?$/.test(a)))
  // e l'unico che non è di lettura si nomina a parte, per quello che fa
  assert.match(t, /plus offline_access to stay signed in/)
})

test('«in sottofondo»: la pagina del giorno chiede al modello dopo ogni lettura automatica', () => {
  const i = fonte('index.ts')
  const inizio = i.indexOf('async function rileggiDaSola')
  const fine = i.indexOf('\n}\n', inizio)
  assert.match(i.slice(inizio, fine), /priorita\.forse\(\)/)
  assert.match(fonte('priorita.ts'), /rifinisci/)
  assert.match(fonte('rifinitura.ts'), /import \{[^}]*chiediJSON[^}]*\} from '\.\/modello\.ts'/)
  assert.match(testo('gmail'), /in background jobs/)
})
