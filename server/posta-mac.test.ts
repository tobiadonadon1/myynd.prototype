// Mail del Mac (P4): una cartella di Mail finta sotto una casa finta, con lo
// stesso costruttore che usano le scene dal vivo. Si legge solo la posta in
// arrivo e quella inviata; i doppioni della casella IMAP non entrano; la
// scheda e la lettura contano gli stessi messaggi.
//
//   node --test server/posta-mac.test.ts

import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const radice = mkdtempSync(join(tmpdir(), 'myynd-postamac-'))
process.env.MYYND_DATI = join(radice, 'dati')
const store = await import('./store.ts')
const postaMac = await import('./connettori/posta-mac.ts')
const finta = await import('./posta-mac-finta.ts')
const { GuaioFonte } = await import('./connettori/guaio.ts')

const ADESSO = Date.now()
let casa = ''
let n = 0
function nuovaCasa(forma: Partial<import('./posta-mac-finta.ts').Forma> = {}) {
  casa = join(radice, `casa-${++n}`)
  mkdirSync(casa, { recursive: true })
  return finta.costruisciMail(casa, { caselle: 2, inArrivo: 48, inviate: 12, vecchie: 10, spazzatura: 5, adesso: ADESSO, ...forma })
}

beforeEach(() => store.azzeraTutto())
after(() => { store.chiudiIndici(); rmSync(radice, { recursive: true, force: true }) })

test('la scheda conta i novanta giorni di posta in arrivo e inviata, da quante caselle', async () => {
  nuovaCasa()
  assert.deepEqual(await postaMac.prova(90, casa, ADESSO), { email: 60, caselle: 2 })
})

test('solo posta in arrivo e inviata: mai indesiderata, cestino, bozze (counter-case)', async () => {
  nuovaCasa()
  const e = await postaMac.sincronizza({ giorni: 90, casa, adesso: ADESSO })
  const caselle = new Set(e.docs.map(d => d.percorso))
  assert.deepEqual([...caselle].sort(), ['INBOX', 'Sent Messages'])
  assert.ok(!e.visti.some(id => /Junk|Deleted|Drafts/.test(id)))
})

test('i campi di un messaggio sono quelli della posta: inviato, letto, massa, messageId, risponde, destinatari, filo', async () => {
  const f = nuovaCasa({ inArrivo: 3, inviate: 2, vecchie: 0, spazzatura: 0 })
  const e = await postaMac.sincronizza({ giorni: 90, casa, adesso: ADESSO })
  const arrivo = e.docs.find(d => d.id === f.inArrivo[0])!
  assert.equal(arrivo.fonte, 'postamac')
  assert.equal(arrivo.tipo, 'email')
  assert.equal(arrivo.inviato, false)
  assert.equal(arrivo.letto, true, 'il primo messaggio finto è letto (bit 0 delle bandiere)')
  assert.equal(e.docs.find(d => d.id === f.inArrivo[1])!.letto, false)
  assert.equal(arrivo.massa, false)
  assert.match(String(arrivo.messageId), /^finta-0-INBOX-1@mail\.test$/)
  assert.ok(arrivo.filo)
  assert.match(String(arrivo.autore), /maya@northwind-studio\.test/)
  const mandata = e.docs.find(d => d.id === f.inviate[0])!
  assert.equal(mandata.inviato, true)
  assert.equal(mandata.destinatari, 'maya@northwind-studio.test')
  assert.equal(mandata.gruppo, 'posta')
})

test('vince la cartella di Mail più recente', async () => {
  nuovaCasa({ inArrivo: 2, inviate: 0, vecchie: 0, spazzatura: 0, versioneVecchia: true })
  assert.match(await postaMac.radice(casa), /V10$/)
  const e = await postaMac.sincronizza({ giorni: 90, casa, adesso: ADESSO })
  assert.ok(!e.docs.some(d => /Old version/.test(d.titolo)))
})

test('i guai hanno il loro rimedio: Mail assente, permesso negato, formato cambiato', async () => {
  const vuota = join(radice, 'senza-mail'); mkdirSync(vuota, { recursive: true })
  await assert.rejects(postaMac.prova(90, vuota), (e: unknown) => e instanceof GuaioFonte && e.rimedio === 'apri-app' && e.message === postaMac.NON_C_E)
  const strana = join(radice, 'strana'); mkdirSync(join(strana, 'Library', 'Mail', 'V10', 'CONTO', 'cartella-senza-mbox'), { recursive: true })
  await assert.rejects(postaMac.prova(90, strana), (e: unknown) => e instanceof GuaioFonte && e.rimedio === 'aggiorna' && e.message === postaMac.FORMATO)
  if (process.getuid?.() !== 0) {
    const chiusa = join(radice, 'chiusa'); mkdirSync(join(chiusa, 'Library', 'Mail'), { recursive: true })
    chmodSync(join(chiusa, 'Library', 'Mail'), 0o000)
    try {
      await assert.rejects(postaMac.prova(90, chiusa), (e: unknown) => e instanceof GuaioFonte && e.rimedio === 'permesso-disco' && e.message === postaMac.PERMESSO)
    } finally { chmodSync(join(chiusa, 'Library', 'Mail'), 0o755) }
  }
})

test('un messaggio già letto dalla casella IMAP non entra due volte, e la scheda non lo conta', async () => {
  const f = nuovaCasa({ inArrivo: 4, inviate: 0, vecchie: 0, spazzatura: 0 })
  store.salvaDocumenti([{ id: 'posta:INBOX:77', fonte: 'posta', tipo: 'email', titolo: 'x', corpo: 'x', quando: new Date().toISOString(), messageId: 'finta-0-INBOX-1@mail.test' }])
  assert.equal((await postaMac.prova(90, casa, ADESSO)).email, 3)
  const e = await postaMac.sincronizza({ giorni: 90, casa, adesso: ADESSO })
  assert.equal(e.docs.length, 3)
  assert.ok(!e.docs.some(d => d.id === f.inArrivo[0]))
  assert.ok(e.visti.includes(f.inArrivo[0]!), 'resta fra i visti: non è sparito')
})

test('la casella letta dopo toglie la copia di Mail del Mac', async () => {
  nuovaCasa({ inArrivo: 2, inviate: 0, vecchie: 0, spazzatura: 0 })
  const e = await postaMac.sincronizza({ giorni: 90, casa, adesso: ADESSO })
  store.salvaDocumenti(e.docs)
  const tolti = store.togliDoppioniMac([{ messageId: e.docs[0]!.messageId }])
  assert.equal(tolti, 1)
  assert.equal(store.documento(e.docs[0]!.id), null)
  assert.ok(store.documento(e.docs[1]!.id), 'l’altra resta (counter-case)')
})

test('la scheda e la lettura contano lo stesso insieme', async () => {
  nuovaCasa()
  const p = await postaMac.prova(90, casa, ADESSO)
  const e = await postaMac.sincronizza({ giorni: 90, casa, adesso: ADESSO })
  assert.equal(e.docs.length, p.email)
  assert.equal(e.resto.aGiorno, true)
  assert.equal(e.caselle, 2)
})

test('al tetto si leggono i più recenti, e il resto dice quanto manca; il giro dopo finisce', async () => {
  nuovaCasa({ inArrivo: 30, inviate: 0, vecchie: 0, spazzatura: 0 })
  const e = await postaMac.sincronizza({ giorni: 90, tetto: 20, casa, adesso: ADESSO })
  assert.equal(e.docs.length, 20)
  assert.equal(e.resto.aGiorno, false)
  assert.equal(e.resto.letti, 20)
  assert.equal(e.resto.totale, 30)
  const piuVecchia = Math.min(...e.docs.map(d => Date.parse(d.quando!)))
  store.salvaDocumenti(e.docs)
  const poi = await postaMac.sincronizza({ giorni: 90, tetto: 20, casa, adesso: ADESSO })
  assert.equal(poi.docs.length, 10)
  assert.ok(poi.docs.every(d => Date.parse(d.quando!) <= piuVecchia), 'prima i più recenti')
  assert.equal(poi.resto.aGiorno, true)
})

test('trenta giorni dopo la prima lettura: i vecchi restano fra i documenti, riconcilia tocca solo la finestra', async () => {
  nuovaCasa({ inArrivo: 40, inviate: 0, vecchie: 0, spazzatura: 0 })
  const tutta = await postaMac.sincronizza({ giorni: 90, casa, adesso: ADESSO })
  store.salvaDocumenti(tutta.docs)
  const trenta = await postaMac.sincronizza({ giorni: 30, casa, adesso: ADESSO })
  const tolti = store.riconcilia('postamac', { completo: true, dal: trenta.dal }, [...trenta.docs.map(d => d.id), ...trenta.visti])
  assert.equal(tolti, 0)
  assert.equal(store.conteggi().perFonte.find(f => f.fonte === 'postamac')?.n, 40)
})

/** Un `.emlx` scritto a mano: il messaggio grezzo, e le bandiere in fondo. */
function emlxGrezzo(dir: string, nome: string, righe: string[], data: Date) {
  mkdirSync(dir, { recursive: true })
  const b = Buffer.from(righe.join('\r\n'), 'utf8')
  const coda = '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n\t<key>flags</key>\n\t<integer>0</integer>\n</dict>\n</plist>\n'
  const file = join(dir, nome)
  writeFileSync(file, Buffer.concat([Buffer.from(`${b.length}\n`, 'ascii'), b, Buffer.from(coda, 'utf8')]))
  utimesSync(file, data, data)
}

test('una mail con solo un allegato entra con l’oggetto e il nome del file; una vuota non si rilegge a ogni giro', async () => {
  nuovaCasa({ caselle: 1, inArrivo: 3, inviate: 0, vecchie: 0, spazzatura: 0 })
  const dir = join(casa, 'Library', 'Mail', 'V10', finta.CONTI[0]!, 'INBOX.mbox', 'A', 'Data', 'Messages')
  const ieri = new Date(ADESSO - 86_400_000)
  const testa = (id: string, oggetto: string | null) => [
    'From: Sara Okafor <sara@okafor-legal.test>', 'To: Alex Morgan <alex@morgan-works.test>',
    ...(oggetto ? [`Subject: ${oggetto}`] : []), `Date: ${ieri.toUTCString().replace('GMT', '+0000')}`, `Message-ID: <${id}>`, 'MIME-Version: 1.0'
  ]
  // la scansione: multipart con un PDF e nessuna riga di testo
  emlxGrezzo(dir, '900.emlx', [...testa('scansione@okafor-legal.test', 'Signed contract'),
    'Content-Type: multipart/mixed; boundary="xx"', '', '--xx',
    'Content-Type: application/pdf; name="contract-signed.pdf"', 'Content-Disposition: attachment; filename="contract-signed.pdf"', 'Content-Transfer-Encoding: base64', '',
    Buffer.from('%PDF-1.4 finto').toString('base64'), '--xx--', ''], ieri)
  // niente di niente: né oggetto, né testo, né allegati
  emlxGrezzo(dir, '901.emlx', [...testa('vuota@okafor-legal.test', null), 'Content-Type: text/plain; charset=utf-8', '', ''], ieri)
  emlxGrezzo(dir, '902.emlx', [...testa('vuota-2@okafor-legal.test', null), 'Content-Type: text/plain; charset=utf-8', '', ''], ieri)

  const e = await postaMac.sincronizza({ giorni: 90, tetto: 2, casa, adesso: ADESSO })
  const scansione = e.docs.find(d => d.messageId === 'scansione@okafor-legal.test')
  assert.ok(scansione, 'la mail con solo l’allegato è un documento')
  assert.equal(scansione.titolo, 'Signed contract')
  assert.match(scansione.corpo, /Signed contract/)
  assert.match(scansione.corpo, /contract-signed\.pdf/)
  assert.ok(!e.docs.some(d => d.messageId === 'vuota@okafor-legal.test'), 'una mail vuota non diventa un documento')
  store.salvaDocumenti(e.docs)
  // ai giri dopo la vuota non prende il posto delle altre, e la lettura arriva in fondo
  let giri = 1
  let ultimo = e
  while (!ultimo.resto.aGiorno && giri < 6) {
    ultimo = await postaMac.sincronizza({ giorni: 90, tetto: 2, casa, adesso: ADESSO })
    store.salvaDocumenti(ultimo.docs)
    giri++
  }
  assert.equal(ultimo.resto.aGiorno, true, 'la prima lettura arriva in fondo')
  assert.equal(giri, 3, 'sei messaggi, due per giro')
  assert.equal(store.idsConPrefisso('postamac:').length, 4, 'tre mail e la scansione')
  // le due vuote non tornano sotto il tetto: con un posto solo, prima una e poi l'altra sarebbero per sempre «in arretrato»
  const dopo = await postaMac.sincronizza({ giorni: 90, tetto: 1, casa, adesso: ADESSO })
  assert.equal(dopo.docs.length, 0)
  assert.equal(dopo.resto.aGiorno, true)
})
