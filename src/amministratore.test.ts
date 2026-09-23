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

const TUTTI: ServizioAmministrato[] = ['gmail', 'calendario', 'google-oauth', 'microsoft-oauth', 'github-org']

test('ogni richiesta dice le tre cose che un amministratore chiede, nelle due lingue', () => {
  for (const servizio of TUTTI) {
    for (const inglese of [true, false]) {
      const r = richiestaAmministratore({ servizio }, { inglese })
      const dove = `${servizio} ${inglese ? 'en' : 'it'}`
      assert.ok(r.oggetto.length > 10, dove)
      assert.match(r.corpo, inglese ? /What Myynd reads: / : /Cosa legge Myynd: /, dove)
      // cosa può fare con quell'accesso: mai «sola lettura» dove non lo è
      assert.match(r.corpo, inglese ? /(Read-only|on its own)/ : /(sola lettura|da solo)/, dove)
      assert.match(r.corpo, inglese ? /Where the data stays: on my computer/ : /Dove restano i dati: sul mio computer/, dove)
      assert.match(r.corpo, inglese ? /What needs to change: / : /Cosa va cambiato: /, dove)
      // la regola di casa: niente lineette nel testo che si mostra o si manda
      assert.doesNotMatch(r.oggetto + r.corpo, /[—–]/, dove)
    }
  }
})

test('la voce della console è quella che l’amministratore cercherà', () => {
  const gmail = richiestaAmministratore({ servizio: 'gmail', dominio: 'acme.it' }, { inglese: true }).corpo
  // knowledge.workspace.google.com, «Turn POP and IMAP on or off for users»
  assert.match(gmail, /Gmail › End User Access › POP and IMAP access/)
  assert.match(gmail, /Enable IMAP access for all users/)
  assert.match(gmail, /Allow any mail client/)
  assert.match(gmail, /\(acme\.it\)/)

  const cal = richiestaAmministratore({ servizio: 'calendario' }, { inglese: true }).corpo
  assert.match(cal, /External sharing options for primary calendars/)
  // learn.microsoft.com: «Publish a calendar» manca senza il dominio Anonymous
  assert.match(cal, /“Anonymous” domain/)

  const gh = richiestaAmministratore({ servizio: 'github-org' }, { inglese: false }).corpo
  assert.match(gh, /Personal access tokens › Pending requests/)
})

test('«sola lettura» si scrive solo dove è vero', () => {
  // via IMAP Myynd salva bozze e archivia quando lo chiede la persona, e il
  // consenso di Google chiede gmail.modify: dire «read-only» sarebbe falso
  for (const servizio of ['gmail', 'google-oauth'] as const) {
    const r = richiestaAmministratore({ servizio }, { inglese: true })
    assert.doesNotMatch(r.oggetto + r.corpo, /read-only/i, servizio)
  }
  assert.match(richiestaAmministratore({ servizio: 'google-oauth' }, { inglese: true }).corpo, /gmail\.modify and calendar\.events/)
  assert.match(richiestaAmministratore({ servizio: 'microsoft-oauth' }, { inglese: true }).corpo, /Mail\.Read and Calendars\.Read/)
  assert.match(richiestaAmministratore({ servizio: 'github-org' }, { inglese: true }).corpo, /Contents, Issues, Pull requests and Metadata/)
})

test('Microsoft: l’indirizzo del consenso sta nella richiesta così com’è', () => {
  const caso: CasoAmministratore = {
    servizio: 'microsoft-oauth',
    consenso: 'https://login.microsoftonline.com/acme.onmicrosoft.com/adminconsent?client_id=abc'
  }
  assert.ok(richiestaAmministratore(caso, { inglese: true }).corpo.includes(caso.consenso!))
  // senza, il percorso nell'interfaccia di Entra
  assert.match(richiestaAmministratore({ servizio: 'microsoft-oauth' }, { inglese: true }).corpo, /Grant admin consent/)
})

test('ospitati, i dati restano sul server di chi ospita, e la richiesta lo dice', () => {
  const r = richiestaAmministratore({ servizio: 'gmail' }, { inglese: true, ospitato: 'myynd.acme.it' })
  assert.match(r.corpo, /on the Myynd server at myynd\.acme\.it/)
  assert.doesNotMatch(r.corpo, /on my computer/)
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
  assert.equal(u.searchParams.get('name'), 'Myynd')
  assert.equal(u.searchParams.get('expires_in'), '366')
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
