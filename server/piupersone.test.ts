// Più persone sulla stessa installazione, e l'unico modo in cui può andare male.
//
// Non è «va male» come va male un bottone che non funziona. Qui il difetto è
// che qualcuno legge la posta di qualcun altro — e lo fa **senza che niente
// vada in errore**, perché una configurazione letta dalla cartella sbagliata è
// una configurazione perfettamente valida.
//
// Tutto il meccanismo sta in un posto solo: `chi.dentro` apre il contesto,
// `config.cartella()` lo legge, e da lì in poi le ottantuno funzioni che
// chiamano `leggi()` e le centoventisette query che passano da `db` lavorano
// sulla persona giusta senza sapere che esista una persona. La comodità di quel
// disegno è anche il suo rischio: nessuna di quelle duecento righe *dice* di
// che utente sta parlando, quindi nessuna di loro sbaglierebbe rumorosamente.
//
// Queste prove sono lì per quello. Non provano che il codice giri: provano che
// due persone non si vedano.
//
//   node --test server/piupersone.test.ts

import { test, after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-multi-'))
process.env.MYYND_DATI = CASA

const conti = await import('./conti.ts')
const chi = await import('./chi.ts')
const cfg = await import('./config.ts')
const store = await import('./store.ts')

let anna = ''
let bruno = ''

before(async () => {
  const a = await conti.registra('anna@esempio.it', 'passwordlunga1')
  const b = await conti.registra('bruno@esempio.it', 'passwordlunga2')
  assert.ok(a.ok && b.ok, 'i due conti non si sono creati')
  anna = a.ok ? a.id : ''
  bruno = b.ok ? b.id : ''
})

after(() => {
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

const doc = (id: string, titolo: string) => ({
  id, fonte: 'posta', tipo: 'email', titolo, corpo: `il testo di ${titolo}`,
  autore: null, percorso: null, quando: '2026-01-01T00:00:00.000Z', gruppo: 'posta'
})

// — chiunque, senza invito —

test('due persone diverse si registrano sulla stessa installazione', () => {
  // era il difetto di partenza: `registra` rifiutava il secondo conto, e chi
  // arrivava dopo si ritrovava dentro l'account del primo — cioè nella sua posta
  assert.equal(conti.quanti(), 2)
  assert.notEqual(anna, bruno)
})

test('lo stesso indirizzo non si registra due volte', async () => {
  const e = await conti.registra('anna@esempio.it', 'unaltrapassword')
  assert.equal(e.ok, false)
})

test('la password di uno non apre il conto dell’altro', async () => {
  const e = await conti.entra('anna@esempio.it', 'passwordlunga2')
  assert.equal(e.ok, false)
  const giusta = await conti.entra('anna@esempio.it', 'passwordlunga1')
  assert.equal(giusta.ok && giusta.id, anna)
})

test('un indirizzo che non esiste non si distingue da una password sbagliata', async () => {
  // due risposte diverse vorrebbero dire un modo per sapere chi ha un conto qui
  const a = await conti.entra('nessuno@esempio.it', 'qualsiasi1234')
  const b = await conti.entra('anna@esempio.it', 'sbagliata1234')
  assert.equal(a.ok, false)
  assert.equal(b.ok, false)
  assert.equal(a.ok === false && a.errore, b.ok === false && b.errore)
})

// — il token dice di chi è, e non di più —

test('ogni token porta al suo utente e a nessun altro', () => {
  const t = conti.perProva.apri(anna)
  assert.equal(conti.utenteDelToken(t), anna)
  assert.notEqual(conti.utenteDelToken(t), bruno)
})

test('un token inventato non porta a nessuno', () => {
  assert.equal(conti.utenteDelToken('a'.repeat(64)), null)
  assert.equal(conti.utenteDelToken(''), null)
  assert.equal(conti.utenteDelToken(undefined), null)
})

test('uscire chiude quella sessione e non le altre', () => {
  const uno = conti.perProva.apri(anna)
  const due = conti.perProva.apri(anna)
  conti.chiudi(uno)
  assert.equal(conti.utenteDelToken(uno), null)
  assert.equal(conti.utenteDelToken(due), anna, 'uscire da un posto ha buttato fuori da tutti')
})

// — la configurazione: ognuno la sua —

test('quello che scrive uno non compare nella configurazione dell’altro', () => {
  chi.dentro(anna, () => cfg.aggiorna({ nome: 'Anna', argomenti: 'vela' }))
  chi.dentro(bruno, () => cfg.aggiorna({ nome: 'Bruno', argomenti: 'motori' }))

  assert.equal(chi.dentro(anna, () => cfg.leggi().nome), 'Anna')
  assert.equal(chi.dentro(bruno, () => cfg.leggi().nome), 'Bruno')
  assert.equal(chi.dentro(anna, () => cfg.leggi().argomenti), 'vela')
})

test('le credenziali di una fonte restano nella cartella di chi le ha scritte', () => {
  /*
   * La prova che conta più di tutte in questo file.
   *
   * Qui dentro finiscono la password della casella di posta e i token di
   * Google: se `cartella()` sbagliasse persona, non comparirebbe nessun errore
   * — comparirebbe la posta di uno nell'indice di un altro, e nessuno se ne
   * accorgerebbe finché non fosse troppo tardi.
   */
  chi.dentro(anna, () => cfg.aggiorna({
    posta: { host: 'imap.anna.it', porta: 993, utente: 'anna@esempio.it', password: 'segreto-di-anna' }
  }))
  const suo = chi.dentro(bruno, () => cfg.leggi().posta)
  assert.equal(suo, undefined, 'la casella di uno si vede dall’altro')
  assert.equal(chi.dentro(anna, () => cfg.leggi().posta?.password), 'segreto-di-anna')
})

test('ognuno ha la sua cartella, e non c’è un percorso che porti all’altra', () => {
  const a = chi.dentro(anna, () => cfg.cartella())
  const b = chi.dentro(bruno, () => cfg.cartella())
  assert.notEqual(a, b)
  assert.ok(a.includes(anna) && b.includes(bruno))
  assert.ok(existsSync(join(a, 'config.json')))
})

// — l'indice: ognuno il suo —

test('i documenti di uno non si trovano cercando come l’altro', () => {
  chi.dentro(anna, () => store.salvaDocumenti([doc('posta:a1', 'preventivo per il cantiere')]))
  chi.dentro(bruno, () => store.salvaDocumenti([doc('posta:b1', 'preventivo per il garage')]))

  const suoi = chi.dentro(anna, () => store.cerca('preventivo', 20))
  assert.equal(suoi.length, 1)
  assert.equal(suoi[0].titolo, 'preventivo per il cantiere')

  const altri = chi.dentro(bruno, () => store.cerca('preventivo', 20))
  assert.equal(altri.length, 1)
  assert.equal(altri[0].titolo, 'preventivo per il garage')
})

test('un documento chiesto per id non attraversa le persone', () => {
  // stesso id in due indici diversi sarebbe il caso peggiore: chiedere il
  // proprio e ricevere quello di un altro senza che niente sembri storto
  assert.equal(chi.dentro(bruno, () => store.documento('posta:a1')), null)
  assert.ok(chi.dentro(anna, () => store.documento('posta:a1')))
})

test('i conteggi contano solo i propri', () => {
  assert.equal(chi.dentro(anna, () => store.conteggi().totale), 1)
  assert.equal(chi.dentro(bruno, () => store.conteggi().totale), 1)
})

test('anche dopo un await si resta la stessa persona', async () => {
  /*
   * `AsyncLocalStorage` regge attraverso le attese, e va provato: quasi tutto
   * quello che fa Myynd — leggere una casella, chiamare un modello — è pieno
   * di `await`, e un contesto che si perdesse a metà lascerebbe la seconda
   * metà del lavoro a scrivere nella cartella sbagliata.
   */
  const visto = await chi.dentro(anna, async () => {
    await new Promise(f => setTimeout(f, 10))
    return cfg.leggi().nome
  })
  assert.equal(visto, 'Anna')
})

test('fuori da una richiesta non si indovina nessuno', () => {
  // è la riga che impedisce a un giro di sfondo scritto male di lavorare in
  // silenzio sul primo utente che capita
  assert.equal(chi.adesso(), null)
  assert.throws(() => chi.serve(), /Non so di chi/)
})

// — cambiare una password, che è l'unica cosa che si può fare a una password —

test('una password nuova sostituisce la vecchia, e la vecchia non entra più', async () => {
  /*
   * Non esiste un modo di *recuperare* una password: nel database c'è uno
   * scrypt del suo sale. Questa è l'unica strada, e va provata da tutte e due
   * le parti — che la nuova apra, e soprattutto che la vecchia non apra più.
   * Metà di questa prova è quella che si dimentica di scrivere.
   */
  const e = await conti.cambiaPassword(anna, 'unapasswordnuova')
  assert.ok(e.ok)
  assert.equal((await conti.entra('anna@esempio.it', 'passwordlunga1')).ok, false, 'la vecchia apre ancora')
  assert.equal((await conti.entra('anna@esempio.it', 'unapasswordnuova')).ok, true)
})

test('cambiarla butta fuori le sessioni aperte', async () => {
  // cambiare la serratura lasciando le chiavi in giro non è cambiare la
  // serratura: chi cambia una password quasi sempre lo fa per questo
  const t = conti.perProva.apri(bruno)
  assert.equal(conti.utenteDelToken(t), bruno)
  await conti.cambiaPassword(bruno, 'ancoraunaltrapass')
  assert.equal(conti.utenteDelToken(t), null, 'la sessione di prima è rimasta valida')
})

test('non si tocca il conto di un altro, né una password troppo corta', async () => {
  assert.equal((await conti.cambiaPassword(anna, 'corta')).ok, false)
  assert.equal((await conti.cambiaPassword('uinesistente', 'unapasswordlunga')).ok, false)
})
