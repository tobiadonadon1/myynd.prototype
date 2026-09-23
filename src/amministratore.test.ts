// La richiesta per l'amministratore, e gli indirizzi dove si prendono le cose.
//
// Due famiglie di guasti che non danno errore. Una richiesta che non dice
// cosa abilitare torna indietro con una domanda, e una persona resta ferma
// una settimana; un parametro scritto male in un indirizzo apre una pagina
// vuota invece che compilata. Qui si guarda il testo e si guardano i
// parametri, senza rete.
//
//   node --test --disable-warning=ExperimentalWarning src/amministratore.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { casoDaErrore, mailto, richiestaAmministratore } from './amministratore.ts'
import { AMBITI_SLACK, appSlack, paginaTokenGithub } from './dove-trovarlo.ts'
import type { CasoAmministratore, ServizioAmministrato } from '../server/connettori/amministratore.ts'
import type { DoveVanno } from './amministratore.ts'

const TUTTI: ServizioAmministrato[] = ['gmail', 'calendario', 'google-oauth', 'microsoft-oauth', 'microsoft-assegnazione', 'microsoft-accesso', 'github-org']

/** Myynd in casa, con Claude che ragiona e senza Jev: il caso più comune. */
const CASA: DoveVanno = { ospitato: null, modello: { chi: 'Anthropic (Claude)', locale: false }, jev: false }

test('ogni richiesta dice le tre cose che un amministratore chiede, nelle due lingue', () => {
  for (const servizio of TUTTI) {
    for (const inglese of [true, false]) {
      const r = richiestaAmministratore({ servizio }, { inglese, dati: CASA })
      const dove = `${servizio} ${inglese ? 'en' : 'it'}`
      assert.ok(r.oggetto.length > 10, dove)
      assert.match(r.corpo, inglese ? /What Myynd does with this access: / : /Cosa fa Myynd con questo accesso: /, dove)
      assert.match(r.corpo, inglese ? /Where the data goes: it is stored on my computer\./ : /Dove vanno i dati: stanno sul mio computer\./, dove)
      assert.match(r.corpo, inglese ? /What needs to change: / : /Cosa va cambiato: /, dove)
      // la regola di casa: niente lineette nel testo che si mostra o si manda
      assert.doesNotMatch(r.oggetto + r.corpo, /[—–]/, dove)
    }
  }
})

test('la voce della console è quella che l’amministratore cercherà', () => {
  const gmail = richiestaAmministratore({ servizio: 'gmail', dominio: 'acme.it' }, { inglese: true, dati: CASA }).corpo
  // knowledge.workspace.google.com, «Turn POP and IMAP on or off for users»
  assert.match(gmail, /Gmail › End User Access › POP and IMAP access/)
  assert.match(gmail, /Enable IMAP access for all users/)
  assert.match(gmail, /Allow any mail client/)
  assert.match(gmail, /\(acme\.it\)/)

  const cal = richiestaAmministratore({ servizio: 'calendario' }, { inglese: true, dati: CASA }).corpo
  assert.match(cal, /External sharing options for primary calendars/)
  // learn.microsoft.com: «Publish a calendar» manca senza il dominio Anonymous
  assert.match(cal, /“Anonymous” domain/)

  const gh = richiestaAmministratore({ servizio: 'github-org' }, { inglese: false, dati: CASA }).corpo
  assert.match(gh, /Personal access tokens › Pending requests/)
})

test('«sola lettura» si scrive solo dove è vero', () => {
  // via IMAP Myynd salva bozze, manda da un bottone e archiviano le regole, e
  // il consenso di Google chiede gmail.modify: «read-only» sarebbe falso
  for (const servizio of ['gmail', 'google-oauth'] as const) {
    const r = richiestaAmministratore({ servizio }, { inglese: true, dati: CASA })
    assert.doesNotMatch(r.oggetto + r.corpo, /read-only/i, servizio)
  }
  // i fatti della posta, uno per frase (le prove sul codice stanno in server/amministratore.test.ts)
  const gmail = richiestaAmministratore({ servizio: 'gmail' }, { inglese: true, dati: CASA }).corpo
  assert.match(gmail, /saves the replies it prepares to my Drafts/)
  assert.match(gmail, /sends an email \(over SMTP, with the same password\) only when I press its button/)
  assert.match(gmail, /on its own it only archives mail from senders I have written a rule for/)
  assert.doesNotMatch(gmail, /never sends/)
})

test('Microsoft: l’indirizzo del consenso sta nella richiesta così com’è', () => {
  const caso: CasoAmministratore = {
    servizio: 'microsoft-oauth',
    consenso: 'https://login.microsoftonline.com/acme.onmicrosoft.com/adminconsent?client_id=abc'
  }
  assert.ok(richiestaAmministratore(caso, { inglese: true, dati: CASA }).corpo.includes(caso.consenso!))
  // senza, il percorso nell'interfaccia di Entra
  assert.match(richiestaAmministratore({ servizio: 'microsoft-oauth' }, { inglese: true, dati: CASA }).corpo, /Grant admin consent/)
})

test('dove vanno i dati: la riga segue chi li riceve davvero', () => {
  const riga = (dati: DoveVanno) => richiestaAmministratore({ servizio: 'gmail' }, { inglese: true, dati }).corpo.split('\n').find(r => r.startsWith('Where the data goes'))!
  /*
   * «Solo i passaggi che servono, quando chiedo qualcosa» era falso: la pagina
   * del giorno si prepara in sottofondo dopo ogni lettura, e così le
   * automazioni. La riga lo dice.
   */
  const claude = riga(CASA)
  assert.match(claude, /Parts of it go to Anthropic \(Claude\), the AI model I use, when I ask something and in background jobs/)
  assert.doesNotMatch(claude, /only the passages it needs/)
  assert.doesNotMatch(claude, /TypeSafe/)
  // Jev riceve estratti: si dice, e solo quando c'è
  assert.match(riga({ ...CASA, jev: true }), /Short excerpts also go to TypeSafe \(Jev\)/)
  // un modello sulla stessa macchina: nessun fornitore, ma non se c'è Jev
  assert.match(riga({ ...CASA, modello: { chi: '127.0.0.1', locale: true } }), /runs on my computer\. No AI provider receives it\./)
  assert.doesNotMatch(riga({ ...CASA, modello: { chi: '127.0.0.1', locale: true }, jev: true }), /no AI provider/)
  // nessun modello ancora: si dice cosa succederà, non una promessa
  assert.match(riga({ ...CASA, modello: null }), /No AI model is connected yet/)
  // ospitati, sul server di chi ospita
  const server = riga({ ...CASA, ospitato: 'myynd.acme.it' })
  assert.match(server, /stored in my account on the Myynd server at myynd\.acme\.it/)
  assert.doesNotMatch(server, /on my computer/)
})

test('il dominio dell’azienda sta accanto all’account, non dopo il punto', () => {
  const r = richiestaAmministratore({ servizio: 'microsoft-oauth', dominio: 'contoso.com' }, { inglese: true, dati: CASA }).corpo
  assert.match(r, /my work Microsoft 365 account \(contoso\.com\) to Myynd/)
  assert.doesNotMatch(r, /\. \(contoso\.com\)/)
})

test('assegnazione e accesso bloccato chiedono all’amministratore la cosa giusta, non un consenso', () => {
  const ass = richiestaAmministratore({ servizio: 'microsoft-assegnazione', app: 'abc' }, { inglese: true, dati: CASA }).corpo
  assert.match(ass, /Users and groups › “Add user\/group”/)
  assert.match(ass, /“Assignment required\?”/)
  assert.doesNotMatch(ass, /adminconsent/)
  const acc = richiestaAmministratore({ servizio: 'microsoft-accesso' }, { inglese: true, dati: CASA }).corpo
  assert.match(acc, /Sign-in logs/)
  assert.match(acc, /Conditional Access/)
  assert.doesNotMatch(acc, /adminconsent/)
})

test('la mail si apre con oggetto e corpo, e gli a capo come li vuole un programma di posta', () => {
  const u = mailto({ oggetto: 'Richiesta: prova', corpo: 'riga uno\nriga due' })
  assert.ok(u.startsWith('mailto:?subject='))
  assert.match(u, /riga%20uno%0D%0Ariga%20due/)
  assert.doesNotMatch(u, /[^%]0A/)
})

test('il caso si ritrova dentro un errore, e un errore qualunque non ne ha', () => {
  const e = Object.assign(new Error('x'), { amministratore: { servizio: 'gmail' } })
  assert.deepEqual(casoDaErrore(e), { servizio: 'gmail' })
  assert.equal(casoDaErrore(new Error('x')), null)
  assert.equal(casoDaErrore(Object.assign(new Error('x'), { amministratore: 'gmail' })), null)
})

// — gli indirizzi già compilati —

test('la pagina del token GitHub porta i parametri documentati, e non quello difettoso', () => {
  // docs.github.com, «Pre-filling fine-grained personal access token details using URL parameters»
  const u = new URL(paginaTokenGithub(true))
  assert.equal(u.origin + u.pathname, 'https://github.com/settings/personal-access-tokens/new')
  // il nome porta la data: la pagina lo vuole unico, e chi rifà il token ne ha già uno
  assert.equal(new URL(paginaTokenGithub(true, { oggi: new Date('2026-09-23T10:00:00Z') })).searchParams.get('name'), 'Myynd 2026-09-23')
  assert.match(u.searchParams.get('name') ?? '', /^Myynd \d{4}-\d{2}-\d{2}$/)
  assert.ok((u.searchParams.get('name') ?? '').length <= 40)
  assert.equal(u.searchParams.get('expires_in'), '366')
  // la durata massima di un'organizzazione, quando GitHub l'ha detta
  assert.equal(new URL(paginaTokenGithub(true, { giorni: 90 })).searchParams.get('expires_in'), '90')
  assert.equal(u.searchParams.get('contents'), 'read')
  assert.equal(u.searchParams.get('issues'), 'read')
  assert.equal(u.searchParams.get('pull_requests'), 'read')
  assert.equal(u.searchParams.get('metadata'), 'read')
  // `target_name` salva il proprietario sbagliato (community discussion 188111)
  assert.equal(u.searchParams.get('target_name'), null)
  // niente permesso in scrittura, mai
  assert.ok([...u.searchParams.values()].every(v => v !== 'write'))
  // il nome ha un tetto di quaranta caratteri, la descrizione di 1024
  assert.ok((u.searchParams.get('description') ?? '').length <= 1024)
  assert.notEqual(new URL(paginaTokenGithub(false)).searchParams.get('description'), u.searchParams.get('description'))
})

test('l’app di Slack si crea dal manifesto con tutti gli ambiti che servono alla lettura', () => {
  // docs.slack.dev, «Configuring apps with app manifests», «Sharing manifests»
  const u = new URL(appSlack())
  assert.equal(u.origin + u.pathname, 'https://api.slack.com/apps')
  assert.equal(u.searchParams.get('new_app'), '1')
  const m = JSON.parse(u.searchParams.get('manifest_json')!)
  assert.equal(m.display_information.name, 'Myynd')
  assert.deepEqual(m.oauth_config.scopes.user, AMBITI_SLACK)
  // quelli che mancavano ai passi di prima: senza, `users.conversations` si ferma
  for (const a of ['groups:read', 'im:read', 'mpim:read']) assert.ok(AMBITI_SLACK.includes(a), a)
  // e niente che scriva
  assert.ok(AMBITI_SLACK.every(a => /:(read|history)$/.test(a)))
})
