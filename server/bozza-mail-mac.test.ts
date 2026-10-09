// La bozza nelle Bozze di Mail del Mac (`bozza-mail-mac.ts`).
//
// Le mani di AppleScript sono finte: si guarda cosa riceverebbe Mail (lo
// script fisso, gli argomenti), che una risposta passi dalla prenotazione di
// `mailbox-drafts.ts` come le altre caselle, e che nelle prove e nelle scene
// il vero `osascript` non parta mai.
//
//   node --test server/bozza-mail-mac.test.ts

import { test, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-bozza-mail-mac-'))
process.env.MYYND_DATI = CASA

const store = await import('./store.ts')
const mailDelMac = await import('./bozza-mail-mac.ts')
const { salvaBozzaCasella } = await import('./mailbox-drafts.ts')
const { osascriptInProva } = await import('./senza-open.ts')
const contratto = await import('./contratto.ts')

const email = { a: 'maya@northwind-studio.test', oggetto: 'Re: Menu wording', corpo: 'The wording is confirmed.\n\nAlex', conosciuto: true }
let chiamate: string[][] = []
const sulMac = (uscita = 'salvata\nalex@example.com\n') => mailDelMac.perProva({
  piattaforma: () => 'darwin', ospitato: () => false,
  osascript: async argomenti => { chiamate.push(argomenti); return uscita }
})

afterEach(() => { chiamate = []; mailDelMac.perProva(null); contratto.perProva(null) })
after(() => { store.chiudiIndici(); delete process.env.MYYND_DATI; rmSync(CASA, { recursive: true, force: true }) })

test('Mail riceve un messaggio nuovo invisibile, salvato e mai mandato, con gli argomenti fuori dallo script', async () => {
  sulMac()
  const r = await mailDelMac.salva(email, ['Alex@Example.com', 'non un indirizzo'])
  assert.equal(chiamate.length, 1)
  const [e, script, sep, a, oggetto, corpo, ...suoi] = chiamate[0]!
  assert.deepEqual([e, sep], ['-e', '--'])
  assert.match(script!, /make new outgoing message with properties \{subject:oggetto, content:corpo, visible:false\}/)
  assert.match(script!, /save nuova/)
  assert.doesNotMatch(script!, /\bsend\b|activate/, 'lo script non manda e non porta Mail davanti')
  assert.deepEqual([a, oggetto, corpo], [email.a, email.oggetto, email.corpo])
  assert.deepEqual(suoi, ['alex@example.com'], 'solo indirizzi veri, in minuscolo, per trovare il conto')
  assert.deepEqual(r, { id: 'mail-del-mac:alex@example.com', url: '' })
})

test('un destinatario storto, o fuori dal Mac, non arriva a Mail', async () => {
  sulMac()
  await assert.rejects(mailDelMac.salva({ ...email, a: 'Maya <maya@northwind-studio.test>\nBcc: x@y.z' }), /destinatario valido/)
  mailDelMac.perProva({ piattaforma: () => 'linux', ospitato: () => false, osascript: async a => { chiamate.push(a); return 'salvata\n' } })
  await assert.rejects(mailDelMac.salva(email), /solo da Myynd sul Mac/)
  assert.equal(chiamate.length, 0)
})

test('una mail di Mail del Mac passa dalla prenotazione delle caselle: una bozza sola, e il conto giusto dai destinatari', async () => {
  sulMac()
  store.salvaDocumenti([{ id: 'postamac:CONTO/INBOX/7.emlx', fonte: 'postamac', tipo: 'email', titolo: 'Menu wording', corpo: 'Could you confirm the wording?',
    autore: 'Maya <maya@northwind-studio.test>', quando: new Date().toISOString(), destinatari: 'alex@example.com,team@example.com' }])
  const prima = await salvaBozzaCasella('carta-mail', 'postamac:CONTO/INBOX/7.emlx', email, undefined, CASA)
  assert.equal(prima.stato, 'salvata')
  assert.deepEqual(chiamate[0]!.slice(6), ['alex@example.com', 'team@example.com'])
  // rifatta (un riavvio, un secondo giro): la stessa bozza, Mail non viene richiamata
  assert.deepEqual(await salvaBozzaCasella('carta-mail', 'postamac:CONTO/INBOX/7.emlx', email, undefined, CASA), prima)
  assert.equal(chiamate.length, 1)
})

test('Mail che non conferma è un errore sulla carta, non una bozza salvata', async () => {
  sulMac('')
  const r = await salvaBozzaCasella('carta-muta', 'postamac:CONTO/INBOX/8.emlx', email, undefined, CASA)
  assert.equal(r.stato, 'errore')
  assert.match(r.errore ?? '', /Mail non ha confermato/)
})

test('nelle prove e nelle scene osascript non parte: lo dice il registro', () => {
  const prima = { test: process.env.NODE_TEST_CONTEXT, scena: process.env.MYYND_PROVA_NIENTE_OPEN }
  try {
    assert.equal(osascriptInProva('prova', 'una bozza'), true, 'sotto node --test')
    delete process.env.NODE_TEST_CONTEXT
    process.env.MYYND_PROVA_NIENTE_OPEN = '1'
    assert.equal(osascriptInProva('prova', 'una bozza'), true, 'in una scena')
    delete process.env.MYYND_PROVA_NIENTE_OPEN
    assert.equal(osascriptInProva('prova', 'una bozza'), false, 'nel vero')
  } finally {
    if (prima.test === undefined) delete process.env.NODE_TEST_CONTEXT; else process.env.NODE_TEST_CONTEXT = prima.test
    if (prima.scena === undefined) delete process.env.MYYND_PROVA_NIENTE_OPEN; else process.env.MYYND_PROVA_NIENTE_OPEN = prima.scena
  }
})

test('il contratto di una risposta a Mail del Mac ha la mano della posta solo se le bozze vanno in Mail', () => {
  store.salvaDocumenti([{ id: 'postamac:CONTO/INBOX/9.emlx', fonte: 'postamac', tipo: 'email', titolo: 'Invoice question', corpo: 'Could you reply about the invoice?',
    autore: 'Lee <lee@example.com>', quando: new Date().toISOString() }])
  const carta = { testo: 'Reply to Lee about the invoice', nota: null, modo: 'bozza', doc: 'postamac:CONTO/INBOX/9.emlx', progetto: null, attrezzi: null }
  contratto.perProva({ postaCollegata: () => false, bozzeInMail: () => true })
  assert.ok(contratto.forma(carta).mani.includes('posta'))
  contratto.perProva({ postaCollegata: () => true, bozzeInMail: () => false })
  assert.ok(!contratto.forma(carta).mani.includes('posta'), 'una casella IMAP non salva le bozze di Mail del Mac')
})

test('il permesso di Automazione negato la prima notte non chiude la carta per sempre: dato il permesso, il giro dopo salva', async () => {
  let volte = 0
  mailDelMac.perProva({
    piattaforma: () => 'darwin', ospitato: () => false,
    osascript: async argomenti => {
      chiamate.push(argomenti)
      // quello che fa la mano vera con -1743: un no detto prima che Mail riceva qualcosa
      if (volte++ === 0) throw Object.assign(new Error('Permetti a Myynd di controllare Mail in Impostazioni di Sistema, Privacy e sicurezza, Automazione.'), { primaDelSalvataggio: true })
      return 'salvata\n'
    }
  })
  const prima = await salvaBozzaCasella('carta-permesso', 'postamac:CONTO/INBOX/10.emlx', email, undefined, CASA)
  assert.equal(prima.stato, 'errore')
  assert.match(prima.errore ?? '', /Automazione/)
  const dopo = await salvaBozzaCasella('carta-permesso', 'postamac:CONTO/INBOX/10.emlx', email, undefined, CASA)
  assert.equal(dopo.stato, 'salvata')
  assert.equal(chiamate.length, 2)
  // (contro) Mail che non conferma resta in dubbio: nessun doppione al giro dopo
  sulMac('')
  chiamate = []
  assert.equal((await salvaBozzaCasella('carta-dubbio', 'postamac:CONTO/INBOX/11.emlx', email, undefined, CASA)).stato, 'errore')
  assert.match((await salvaBozzaCasella('carta-dubbio', 'postamac:CONTO/INBOX/11.emlx', email, undefined, CASA)).errore ?? '', /in dubbio/)
  assert.equal(chiamate.length, 1)
})

test('un destinatario storto è un no sicuro: la prenotazione non resta', async () => {
  sulMac()
  const r = await salvaBozzaCasella('carta-storta', 'postamac:CONTO/INBOX/12.emlx', { ...email, a: 'non-un-indirizzo' }, undefined, CASA)
  assert.match(r.errore ?? '', /destinatario valido/)
  assert.equal(chiamate.length, 0)
  assert.equal((await salvaBozzaCasella('carta-storta', 'postamac:CONTO/INBOX/12.emlx', email, undefined, CASA)).stato, 'salvata')
})

test('la richiesta di permesso che macOS mostra dice delle bozze in Mail', () => {
  const yml = readFileSync(join(import.meta.dirname, '..', 'electron-builder.yml'), 'utf8')
  assert.match(yml.match(/NSAppleEventsUsageDescription: (.*)/)?.[1] ?? '', /drafts in Mail without sending/)
})
