// Da un id di documento a un messaggio da spostare.
//
// È l'unico punto in cui una stringa scritta nell'indice diventa un'istruzione
// che tocca la casella di qualcuno. Sbagliare a tagliarla non dà nessun errore:
// dà un numero di messaggio giusto nella cartella sbagliata, cioè sposta una
// cosa che nessuno aveva guardato. Perciò si prova qui, e senza rete.
//
//   node --test server/posta.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { simpleParser } from 'mailparser'
import type { ImapFlow } from 'imapflow'
import { lettoDa, massaDi, messaggioDa, mosseDa, normalizza, usaClient, sincronizza, vuolePasswordPerLeApp } from './connettori/posta.ts'

test('un id normale diventa cartella e uid', () => {
  assert.deepEqual(mosseDa(['posta:INBOX:4211']), [{ cartella: 'INBOX', uid: 4211 }])
})

test('una cartella con i due punti dentro resta intera', () => {
  // si taglia dall'ultimo, non dal primo: è la ragione per cui questo test esiste
  assert.deepEqual(mosseDa(['posta:INBOX:2024:7']), [{ cartella: 'INBOX:2024', uid: 7 }])
})

test('le cartelle con la barra e le parentesi passano', () => {
  assert.deepEqual(mosseDa(['posta:[Gmail]/Tutti i messaggi:19']),
    [{ cartella: '[Gmail]/Tutti i messaggi', uid: 19 }])
})

test('quello che non viene dalla posta non si sposta', () => {
  // un file sul disco non ha una casella da cui toglierlo: si lascia stare,
  // in silenzio, invece di far fallire tutta la proposta
  assert.deepEqual(mosseDa(['desktop:/Users/x/fattura.pdf', 'notion:abc']), [])
})

test('un id storto non diventa una mossa', () => {
  assert.deepEqual(mosseDa([
    'posta:INBOX:',          // senza uid
    'posta:INBOX:zero',      // uid che non è un numero
    'posta::12',             // senza cartella
    'posta:INBOX:0',         // gli uid partono da uno
    'posta:INBOX:-3'
  ]), [])
})

test('il buono passa anche se ha accanto il marcio', () => {
  assert.deepEqual(mosseDa(['posta:INBOX:1', 'posta:rotto', 'posta:Archivio:2']),
    [{ cartella: 'INBOX', uid: 1 }, { cartella: 'Archivio', uid: 2 }])
})

// — la password per le app —
//
// Il 2 settembre 2026 una cliente ha provato a collegare Gmail con la password
// del suo account Google: otto caratteri, e nessuna password d'account
// funziona su Gmail via IMAP. Quello che ha visto era il consiglio giusto —
// «serve una password per le app» — scritto due volte, una come nota e una in
// rosso: identiche, quindi premere il bottone sembrava non fare niente.
//
// L'altra metà dello stesso guaio è più subdola: Google la password per le app
// la *mostra* a gruppi di quattro, con gli spazi, e chi la copia se li porta
// dietro. IMAP la rifiuta, e il messaggio che torna è indistinguibile da una
// password sbagliata.

test('gli spazi con cui Google la mostra non fanno parte della password', () => {
  assert.equal(normalizza('abcd efgh ijkl mnop', 'imap.gmail.com'), 'abcdefghijklmnop')
  // Apple la scrive con i trattini
  assert.equal(normalizza('abcd-efgh-ijkl-mnop', 'imap.mail.me.com'), 'abcdefghijklmnop')
})

test('ma una password vera con dentro uno spazio non si tocca', () => {
  // sedici lettere è la forma della password per le app: tutto il resto è la
  // password di qualcuno, e toglierle gli spazi vorrebbe dire romperla
  assert.equal(normalizza('la mia password', 'imap.gmail.com'), 'la mia password')
  assert.equal(normalizza('Estate 2026!', 'imap.gmail.com'), 'Estate 2026!')
})

test('e su un server qualunque non si tocca mai niente', () => {
  assert.equal(normalizza('abcd efgh ijkl mnop', 'imaps.aruba.it'), 'abcd efgh ijkl mnop')
})

test('chi vuole una password per le app, e chi no', () => {
  assert.equal(vuolePasswordPerLeApp('imap.gmail.com'), 'google')
  assert.equal(vuolePasswordPerLeApp('imap.mail.me.com'), 'apple')
  assert.equal(vuolePasswordPerLeApp('imap.mail.yahoo.com'), 'yahoo')
  assert.equal(vuolePasswordPerLeApp('imaps.aruba.it'), null)
})

// — rispondere nel filo —
//
// Le due intestazioni che fanno finire la risposta sotto la domanda nel
// programma di posta di chi la riceve. Sbagliarle non dà errore: dà una email
// che arriva staccata, in fondo alla casella. Si guarda il messaggio com'è
// costruito, senza nessuna rete.

const CASELLA = { host: 'imap.esempio.it', porta: 993, utente: 'io@esempio.it', password: 'x' }

test('senza «rispondeA» il messaggio è quello di sempre', () => {
  assert.deepEqual(messaggioDa(CASELLA, { a: 'rossi@esempio.it', oggetto: 'Ciao', corpo: 'Testo' }),
    { from: 'io@esempio.it', to: 'rossi@esempio.it', subject: 'Ciao', text: 'Testo' })
  assert.ok(!('inReplyTo' in messaggioDa(CASELLA, { a: 'r@x', oggetto: 'o', corpo: 'c', rispondeA: null })))
})

test('«rispondeA» diventa In-Reply-To e References, con le parentesi angolari', () => {
  const m = messaggioDa(CASELLA, {
    a: 'rossi@esempio.it', oggetto: 'Re: Preventivo', corpo: 'Ecco.',
    rispondeA: { messageId: 'm7@esempio.it', references: ['radice@esempio.it', 'm7@esempio.it'] }
  })
  assert.equal(m.inReplyTo, '<m7@esempio.it>')
  assert.deepEqual(m.references, ['<radice@esempio.it>', '<m7@esempio.it>'])
})

test('il messaggio a cui si risponde sta sempre in References, anche se nessuno l’ha messo', () => {
  const m = messaggioDa(CASELLA, { a: 'r@x', oggetto: 'o', corpo: 'c', rispondeA: { messageId: '<m1@x>' } })
  assert.equal(m.inReplyTo, '<m1@x>')
  assert.deepEqual(m.references, ['<m1@x>'])
  // un id vuoto non è una risposta
  assert.ok(!('inReplyTo' in messaggioDa(CASELLA, { a: 'r@x', oggetto: 'o', corpo: 'c', rispondeA: { messageId: ' ' } })))
})

// — letta, e di massa —
//
// Il feed diceva ventiquattro cose da guardare e metà erano promozioni della
// banca, newsletter, ed email già lette. L'indice non sapeva distinguerle: qui
// si guarda cosa se ne ricava dalle intestazioni e dalle bandiere, senza rete.

const grezzo = (intestazioni: string, corpo = 'Ciao, ci vediamo giovedì?') =>
  `From: Rossi <rossi@esempio.it>\r\nTo: io@esempio.it\r\nSubject: Prova\r\n` +
  `Date: Wed, 02 Sep 2026 10:00:00 +0200\r\nMessage-ID: <1@esempio.it>\r\n${intestazioni}\r\n${corpo}\r\n`

test('List-Unsubscribe vuol dire posta in serie, anche da un mittente con un nome', async () => {
  assert.equal(massaDi(await simpleParser(grezzo('List-Unsubscribe: <https://x.it/via>\r\n'))), true)
  assert.equal(massaDi(await simpleParser(grezzo('List-Id: Novità <novita.x.it>\r\n'))), true)
  assert.equal(massaDi(await simpleParser(grezzo('Precedence: bulk\r\n'))), true)
  assert.equal(massaDi(await simpleParser(grezzo('Auto-Submitted: auto-generated\r\n'))), true)
  assert.equal(massaDi(await simpleParser(grezzo('X-Mailer: Mailchimp 3.0\r\n'))), true)
  assert.equal(massaDi(await simpleParser(grezzo('Feedback-ID: 1:2:3:promo\r\n'))), true)
})

test('un mittente che si chiama noreply o newsletter è una macchina', async () => {
  const da = (indirizzo: string) => grezzo('').replace('rossi@esempio.it', indirizzo)
  for (const i of ['no-reply@alertsp.chase.com', 'noreply@banca.it', 'newsletter@bloomberg.com', 'promo@caffe.it', 'news@quotidiano.it']) {
    assert.equal(massaDi(await simpleParser(da(i))), true, `${i} è passato per una persona`)
  }
  // ma una persona il cui indirizzo *contiene* una di quelle parole resta una persona
  for (const i of ['agnese.newsome@esempio.it', 'promozione.rossi@esempio.it', 'mario@esempio.it']) {
    assert.equal(massaDi(await simpleParser(da(i))), false, `${i} è passato per una macchina`)
  }
})

test('«unsubscribe» o «disiscriviti» nel corpo bastano; una email normale no', async () => {
  assert.equal(massaDi(await simpleParser(grezzo('', 'Offerta valida fino a domenica. Unsubscribe here.'))), true)
  assert.equal(massaDi(await simpleParser(grezzo('', 'Per non ricevere più queste email, disiscriviti qui.'))), true)
  assert.equal(massaDi(await simpleParser(grezzo('', 'Ti mando il preventivo aggiornato, dimmi se va.'))), false)
  // Apple Mail firma l'X-Mailer, e non è un sistema d'invio in serie
  assert.equal(massaDi(await simpleParser(grezzo('X-Mailer: Apple Mail (2.3774)\r\n'))), false)
})

test('la bandiera \\Seen è «letto», e senza bandiere non si sa', () => {
  assert.equal(lettoDa(new Set(['\\Seen', '\\Flagged'])), true)
  assert.equal(lettoDa(new Set(['\\Flagged'])), false)
  assert.equal(lettoDa(undefined), undefined)
})

/**
 * Una casella finta con le bandiere: i messaggi nuovi arrivano con le loro,
 * e quelli già dentro le dichiarano nel giro a parte.
 */
function casellaConBandiere(uids: number[], letti: Set<number>): ImapFlow {
  const grezzoDi = (u: number) =>
    `From: Rossi <rossi@esempio.it>\r\nSubject: Numero ${u}\r\n` +
    `Date: Wed, 02 Sep 2026 10:00:00 +0200\r\nMessage-ID: <${u}@esempio.it>\r\n` +
    (u % 2 ? '' : 'List-Unsubscribe: <https://x.it/via>\r\n') +
    `\r\nIl corpo del numero ${u}.\r\n`
  const cl = {
    connect: async () => {}, close: async () => {}, logout: async () => {},
    list: async () => [{ path: 'INBOX', name: 'INBOX', specialUse: undefined }],
    get mailbox() { return { uidValidity: 1n } },
    getMailboxLock: async () => ({ release: () => {} }),
    search: async () => uids,
    fetch: (quali: number[], cosa: { source?: boolean }) => (async function* () {
      for (const uid of quali) {
        const flags = new Set(letti.has(uid) ? ['\\Seen'] : [])
        yield cosa.source
          ? { uid, flags, source: Buffer.from(grezzoDi(uid)), envelope: { date: new Date('2026-09-02T08:00:00Z') } }
          : { uid, flags }
      }
    })()
  }
  return cl as unknown as ImapFlow
}

after(() => usaClient(null))

test('i messaggi nuovi entrano con «letto» e «massa»; quelli già dentro rimandano solo la bandiera', async () => {
  usaClient(() => casellaConBandiere([1, 2, 3, 4], new Set([1, 3])))
  // 1 e 2 sono già nell'indice: si riscaricano solo 3 e 4
  // stessa UIDVALIDITY dell'ultima volta: è quello che rende validi gli uid noti
  const e = await sincronizza({ ...CASELLA, cartelle: ['INBOX'], validita: { INBOX: '1' } }, undefined, () => new Set([1, 2]))
  assert.deepEqual(e.docs.map(d => [d.id, d.letto, d.massa]), [
    ['posta:INBOX:3', true, false],
    ['posta:INBOX:4', false, true]
  ])
  assert.deepEqual(e.letti, [{ id: 'posta:INBOX:1', letto: true }, { id: 'posta:INBOX:2', letto: false }])
})

test('un messaggio vecchio senza classificazione viene riletto una volta sola', async () => {
  usaClient(() => casellaConBandiere([1, 2, 3], new Set([1, 2])))
  const e = await sincronizza(
    { ...CASELLA, cartelle: ['INBOX'], validita: { INBOX: '1' } },
    undefined,
    () => new Set([1, 2, 3]),
    () => new Set([2])
  )
  assert.deepEqual(e.docs.map(d => [d.id, d.letto, d.massa]), [
    ['posta:INBOX:2', true, true]
  ])
  // 2 ha già portato la bandiera dentro il documento completo: il giro
  // leggero aggiorna soltanto gli altri messaggi noti.
  assert.deepEqual(e.letti, [
    { id: 'posta:INBOX:1', letto: true },
    { id: 'posta:INBOX:3', letto: false }
  ])
  assert.equal(e.saltati, 2)
})
