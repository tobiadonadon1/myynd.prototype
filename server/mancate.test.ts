// Le carte mancate: quello che ha fatto da solo senza che il feed gliel'avesse detto.
//
// Tipo A: una risposta mandata dalla posta a una persona che chiedeva
// qualcosa, mai diventata una carta. Tipo B: una riga scritta a mano che un
// documento già chiedeva. E tutti i casi in cui NON è una mancata: la carta
// c'era, Myynd non ha avuto il tempo, la mail era in serie, era una cortesia.
//
//   node --test server/mancate.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Documento } from './store.ts'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-mancate-'))
process.env.MYYND_DATI = CASA
delete process.env.ANTHROPIC_API_KEY

const cfg = await import('./config.ts')
const store = await import('./store.ts')
const mancate = await import('./mancate.ts')
const feedDati = await import('./feed-dati.ts')
const chi = await import('./chi.ts')
const jev = await import('./jev.ts')
const giudizi = await import('./giudizi.ts')
const ordine = await import('./ordine.ts')

before(() => store.azzeraTutto())
after(() => { jev.perProva(null); store.chiudiIndici(); delete process.env.MYYND_DATI; rmSync(CASA, { recursive: true, force: true }) })

const ORA = 3_600_000
const fa = (ore: number) => new Date(Date.now() - ore * ORA).toISOString()
const mail = (id: string, sopra: Partial<Documento> & { quando: string }): Documento => ({
  id, fonte: 'posta', tipo: 'email', titolo: `Mail ${id}`, corpo: `Can you confirm the details of ${id}?`,
  autore: 'Nora Vance <nora@harbor.example>', percorso: 'INBOX', gruppo: 'posta', messageId: `${id}@ex`, filo: `${id}@ex`, ...sopra
})
const inviata = (id: string, sopra: Partial<Documento> & { quando: string }): Documento =>
  mail(id, { inviato: true, autore: 'Alex <alex@northwind.example>', corpo: 'Confirmed, see below.', percorso: 'Sent', ...sopra })
/** `indicizzato` lo scrive `salvaDocumenti` a adesso: qui si sposta indietro, come un documento arrivato prima. */
const indicizzato = (id: string, quando: string) => store.default.prepare('UPDATE documenti SET indicizzato = ? WHERE id = ?').run(quando, id)
const semina = (docs: Documento[], indicizzati: Record<string, string> = {}) => {
  store.salvaDocumenti(docs)
  for (const [id, q] of Object.entries(indicizzati)) indicizzato(id, q)
}
const trova = (dal = fa(24 * 14)) => mancate.trova({ dal, jev: false })

test('senza posta inviata la copertura lo dice, e non c’è niente da trovare', async () => {
  const r = await trova()
  assert.deepEqual(r.mancate, [])
  assert.equal(r.copertura.postaInviata, false)
})

test('tipo A per «risponde»: solo se il feed girava già; e poi è una mancata con il mittente, l’attribuzione e la prova', async () => {
  store.azzeraTutto()
  const i = mail('posta:INBOX:1', { quando: fa(48) })
  const s = inviata('posta:Sent:1', { quando: fa(24), risponde: i.messageId, destinatari: 'nora@harbor.example', filo: i.filo })
  semina([i, s], { [i.id]: fa(48) })
  // nessuna carta prima della risposta: il feed non girava, non è colpa sua
  assert.deepEqual((await trova()).mancate, [])
  // una carta qualunque, nata prima: adesso il feed aveva la sua occasione
  store.salvaFeed([{ tipo: 'Da decidere', titolo: 'Qualcosa di prima', testo: 'Una cosa da fare di prima.', fonte: 'posta' }])
  store.default.prepare('UPDATE feed SET quando = ?').run(fa(24 * 5))
  const r = await trova()
  assert.equal(r.copertura.postaInviata, true)
  assert.equal(r.mancate.length, 1)
  const m = r.mancate[0]
  assert.equal(m.genere, 'risposta')
  assert.equal(m.doc, i.id)
  assert.equal(m.certezza, 'id')
  assert.equal(m.mittente, 'nora@harbor.example')
  assert.equal(m.agito, s.quando)
  assert.equal(m.arrivato, i.quando)
  assert.match(m.prova, /Can you confirm/)
  // nessun esame: si ricalcola, e una mail di persona non letta è del feed → «ignoto»
  assert.equal(m.fase, 'ignoto')
  assert.equal(JSON.parse(m.contesto).messageId, i.messageId)
  // registrata una volta: la seconda non aggiunge niente
  assert.equal(mancate.registra(r.mancate), 1)
  assert.equal(mancate.registra(r.mancate), 0)
  assert.equal((await trova()).mancate.length, 1, 'trova legge e basta: rifare il giro trova la stessa')
})

test('tipo A per filo: la mail in arrivo prima, nello stesso filo, a quell’indirizzo; mai un filo «s:»; mai un altro destinatario', async () => {
  store.azzeraTutto()
  store.salvaFeed([{ tipo: 'Da decidere', titolo: 'Qualcosa di prima', testo: 'Una cosa da fare di prima.', fonte: 'posta' }])
  store.default.prepare('UPDATE feed SET quando = ?').run(fa(24 * 5))
  const i = mail('posta:INBOX:2', { quando: fa(30), filo: 'filo-2', messageId: 'i2@ex' })
  const s = inviata('posta:Sent:2', { quando: fa(20), filo: 'filo-2', risponde: null, destinatari: 'nora@harbor.example', messageId: 's2@ex' })
  // stesso oggetto, filo per oggetto: non lega
  const io = mail('posta:INBOX:3', { quando: fa(30), filo: 's:pilot scope', messageId: 'i3@ex', autore: 'Ana <ana@harbor.example>' })
  const so = inviata('posta:Sent:3', { quando: fa(20), filo: 's:pilot scope', risponde: null, destinatari: 'ana@harbor.example', messageId: 's3@ex' })
  // stesso filo, ma la risposta è andata a un altro
  const ia = mail('posta:INBOX:4', { quando: fa(30), filo: 'filo-4', messageId: 'i4@ex', autore: 'Leo <leo@studio.example>' })
  const sa = inviata('posta:Sent:4', { quando: fa(20), filo: 'filo-4', risponde: null, destinatari: 'someone@else.example', messageId: 's4@ex' })
  // la risposta prima della mail: non risponde a lei
  const ip = mail('posta:INBOX:5', { quando: fa(10), filo: 'filo-5', messageId: 'i5@ex', autore: 'Pia <pia@ex.example>' })
  const sp = inviata('posta:Sent:5', { quando: fa(20), filo: 'filo-5', risponde: null, destinatari: 'pia@ex.example', messageId: 's5@ex' })
  semina([i, s, io, so, ia, sa, ip, sp], { [i.id]: fa(30), [io.id]: fa(30), [ia.id]: fa(30), [ip.id]: fa(10) })
  const r = await trova()
  assert.deepEqual(r.mancate.map(m => [m.doc, m.certezza]), [[i.id, 'filo']])
})

test('non è una mancata: la mail aveva una carta, una riga, uno scarto; era in serie o automatica; Myynd non ha avuto venti minuti; era una cortesia', async () => {
  store.azzeraTutto()
  store.salvaFeed([{ tipo: 'Da decidere', titolo: 'Qualcosa di prima', testo: 'Una cosa da fare di prima.', fonte: 'posta' }])
  store.default.prepare('UPDATE feed SET quando = ?').run(fa(24 * 5))
  const carta = mail('posta:INBOX:10', { quando: fa(30), messageId: 'i10@ex' })
  const riga = mail('posta:INBOX:11', { quando: fa(30), messageId: 'i11@ex' })
  const massa = mail('posta:INBOX:12', { quando: fa(30), messageId: 'i12@ex', massa: true })
  const automatica = mail('posta:INBOX:13', { quando: fa(30), messageId: 'i13@ex', autore: 'Shop <noreply@shop.example>' })
  const fresca = mail('posta:INBOX:14', { quando: fa(30), messageId: 'i14@ex' })
  const cortesia = mail('posta:INBOX:15', { quando: fa(30), messageId: 'i15@ex', corpo: 'Thanks for the update, all good on our side.' })
  const lunga = mail('posta:INBOX:16', { quando: fa(30), messageId: 'i16@ex', corpo: 'Thanks for the update, all good on our side.' })
  const scartata = mail('posta:INBOX:17', { quando: fa(30), messageId: 'i17@ex' })
  const buona = mail('posta:INBOX:18', { quando: fa(30), messageId: 'i18@ex' })
  const risposte = [carta, riga, massa, automatica, fresca, cortesia, lunga, scartata, buona].map((x, n) =>
    inviata(`posta:Sent:${10 + n}`, { quando: fa(20), risponde: x.messageId, destinatari: 'nora@harbor.example', messageId: `s${10 + n}@ex`, corpo: x === lunga ? 'x'.repeat(220) : 'Confirmed, see below.' }))
  semina([carta, riga, massa, automatica, fresca, cortesia, lunga, scartata, buona, ...risposte],
    Object.fromEntries([carta, riga, massa, automatica, cortesia, lunga, scartata, buona].map(x => [x.id, fa(30)])))
  // Myynd l'ha vista cinque minuti prima della risposta: non ha avuto il tempo
  indicizzato(fresca.id, fa(20 + 5 / 60))
  store.salvaFeed([{ tipo: 'Da decidere', titolo: 'Conferma i dettagli a Nora', testo: 'Nora chiede la conferma dei dettagli.', fonte: 'posta', doc: carta.id }])
  store.scriviCompito({ id: 'c-riga', testo: 'Confirm the details for Nora', ordine: ordine.dopo(store.ultimoOrdine('oggi')), doc: riga.id })
  store.salvaFeed([{ tipo: 'Da decidere', titolo: 'Guarda la cosa scartata', testo: 'La cosa scartata da guardare.', fonte: 'posta', doc: scartata.id }])
  store.cambiaStatoFeed(store.elencoFeed('aperto').find(v => v.doc === scartata.id)!.id, 'scartato', 'no', 'non_mia')
  // e poi la copia della scartata sparisce dall'indice e torna con un altro id: lo scarto la riconosce lo stesso
  const r = await trova()
  assert.deepEqual(r.mancate.map(m => m.doc).sort(), [buona.id, lunga.id].sort(), 'una risposta lunga a una mail senza richiesta è una mancata; il resto no')
})

test('l’attribuzione: dall’esame se c’è, altrimenti dalle regole ricalcolate', async () => {
  store.azzeraTutto()
  store.salvaFeed([{ tipo: 'Da decidere', titolo: 'Qualcosa di prima', testo: 'Una cosa da fare di prima.', fonte: 'posta' }])
  store.default.prepare('UPDATE feed SET quando = ?').run(fa(24 * 5))
  const esaminata = mail('posta:INBOX:20', { quando: fa(30), messageId: 'i20@ex' })
  const letta = mail('posta:INBOX:21', { quando: fa(60), messageId: 'i21@ex', letto: true, corpo: 'Can you confirm the details of the visit?' })
  semina([esaminata, letta, inviata('posta:Sent:20', { quando: fa(20), risponde: 'i20@ex', destinatari: 'nora@harbor.example', messageId: 's20@ex' }),
    inviata('posta:Sent:21', { quando: fa(20), risponde: 'i21@ex', destinatari: 'nora@harbor.example', messageId: 's21@ex' })],
  { [esaminata.id]: fa(30), [letta.id]: fa(60) })
  feedDati.segnaEsame([{ doc: esaminata.id, fase: 'modello' }])
  const r = await trova()
  const per = new Map(r.mancate.map(m => [m.doc, m]))
  assert.equal(per.get(esaminata.id)?.fase, 'modello')
  // letta da due giorni e mezzo, anche se con una richiesta: la regola del feed la teneva fuori… no: con una richiesta entra. Una letta senza richiesta no
  assert.equal(per.get(letta.id)?.fase, 'ignoto')
  const senzaRichiesta = mail('posta:INBOX:22', { quando: fa(60), messageId: 'i22@ex', letto: true, corpo: 'Here is the recap of the meeting, for your records.' })
  semina([senzaRichiesta, inviata('posta:Sent:22', { quando: fa(20), risponde: 'i22@ex', destinatari: 'nora@harbor.example', messageId: 's22@ex', corpo: 'y'.repeat(220) })], { [senzaRichiesta.id]: fa(30) })
  const dopo = new Map((await trova()).mancate.map(m => [m.doc, m]))
  assert.deepEqual([dopo.get(senzaRichiesta.id)?.fase, dopo.get(senzaRichiesta.id)?.motivo], ['regole', 'letta_senza_richiesta'])
})

// — tipo B: le righe scritte a mano —

const documentoDaFare = (id: string, titolo: string, corpo: string, sopra: Partial<Documento> = {}): Documento =>
  ({ id, fonte: 'posta', tipo: 'email', titolo, corpo, autore: 'Tom Brill <tom@brightline.example>', percorso: 'INBOX', gruppo: 'posta', quando: fa(72), messageId: `${id}@ex`, ...sopra })
const riga = (id: string, testo: string, sopra: { origine?: string; voce?: string | null; doc?: string | null; creato?: string; sparito?: string | null } = {}) => {
  store.scriviCompito({ id, testo, ordine: ordine.dopo(store.ultimoOrdine('oggi')), origine: sopra.origine ?? 'mano', voce: sopra.voce ?? null, doc: sopra.doc ?? null })
  store.default.prepare('UPDATE compiti SET creato = ?, sparito = ? WHERE id = ?').run(sopra.creato ?? new Date().toISOString(), sopra.sparito ?? null, id)
}

test('tipo B: una riga a mano che un documento già chiedeva, per parole (almeno l’ottanta per cento e i numeri)', async () => {
  store.azzeraTutto()
  const d = documentoDaFare('posta:INBOX:30', 'Brightline invoice 2231', 'Please pay invoice 2231 by the 30th.')
  semina([d], { [d.id]: fa(72) })
  riga('c-b1', 'Pay Brightline invoice 2231')
  // e i contro-casi: nata da una carta, con un documento, tolta subito, detta in una chat sua
  riga('c-b2', 'Pay Brightline invoice 2231', { voce: 'f-x' })
  riga('c-b3', 'Pay Brightline invoice 2231', { doc: 'posta:INBOX:99' })
  riga('c-b4', 'Pay Brightline invoice 2231', { creato: fa(1), sparito: fa(1 - 5 / 60) })
  const r = await trova()
  assert.equal(r.mancate.length, 1)
  assert.deepEqual([r.mancate[0].genere, r.mancate[0].doc, r.mancate[0].certezza, r.mancate[0].prova], ['compito', d.id, 'parole', 'Pay Brightline invoice 2231'])
  assert.equal(r.mancate[0].mittente, 'tom@brightline.example')
  // un numero diverso non è la stessa cosa
  store.azzeraTutto()
  semina([d], { [d.id]: fa(72) })
  riga('c-b5', 'Pay Brightline invoice 2232')
  assert.deepEqual((await trova()).mancate, [])
  // le sue parole (una chat con un modello) non sono un documento che chiede
  store.azzeraTutto()
  const chat = documentoDaFare('conversazioni:claude:1', 'Brightline invoice 2231', 'Tobia: remind me to pay invoice 2231 for Brightline.', { fonte: 'conversazioni', tipo: 'chat' })
  semina([chat], { [chat.id]: fa(72) })
  riga('c-b6', 'Pay Brightline invoice 2231')
  assert.deepEqual((await trova()).mancate, [])
  // e il documento non deve essere arrivato dopo, né a meno di venti minuti dalla riga
  store.azzeraTutto()
  semina([d], { [d.id]: fa(0.1) })
  riga('c-b7', 'Pay Brightline invoice 2231')
  assert.deepEqual((await trova()).mancate, [])
})

function jevFinto(risposta: number | null) {
  cfg.aggiorna({ jev: { apiKey: 'apikey_prova' } })
  giudizi.scorda(); jev.dimentica()
  const chiamate: unknown[] = []
  jev.perProva(async (_u, opz) => {
    const corpo = JSON.parse(String((opz as RequestInit).body)) as { questions: Record<string, unknown>; state: unknown }
    chiamate.push(corpo.state)
    if (!corpo.questions.implicito) throw new Error(`domanda che non mi aspettavo: ${Object.keys(corpo.questions).join(', ')}`)
    return Response.json({ answers: { implicito: { type: 'noul', noul: risposta ?? 0 } } })
  })
  return chiamate
}
const senzaJev = () => { jev.perProva(null); giudizi.scorda(); const c = cfg.leggi(); delete c.jev; cfg.scrivi(c, { togli: ['jev'] }) }

test('tipo B fra il sessanta e l’ottanta per cento: decide Jev, se c’è; senza Jev non è una mancata', async () => {
  store.azzeraTutto()
  const d = documentoDaFare('posta:INBOX:40', 'Contract', 'Hi, Marta here: the signed contract is what we need before we hand over the keys.', { autore: 'Marta <marta@ceru.example>' })
  semina([d], { [d.id]: fa(72) })
  riga('c-j1', 'Send Marta the signed contract pages')
  // tre parole su quattro: marta, signed, contract; «pages» no
  assert.equal(mancate.copertura('Send Marta the signed contract pages', d).parte, 0.75)
  // Jev off (l'opzione): niente
  assert.deepEqual((await mancate.trova({ dal: fa(24 * 14), jev: false })).mancate, [])
  // Jev non collegato: niente, e nessuna chiamata
  const mai = jevFinto(0.9); senzaJev()
  assert.deepEqual((await mancate.trova({ dal: fa(24 * 14), jev: true })).mancate, [])
  assert.equal(mai.length, 0)
  // Jev dice sì
  let chiamate = jevFinto(0.9)
  let r = await mancate.trova({ dal: fa(24 * 14), jev: true })
  assert.equal(chiamate.length, 1)
  assert.deepEqual((chiamate[0] as { compito: string }).compito, 'Send Marta the signed contract pages')
  assert.deepEqual(r.mancate.map(m => [m.doc, m.certezza]), [[d.id, 'jev']])
  // Jev dice no
  chiamate = jevFinto(0.2)
  r = await mancate.trova({ dal: fa(24 * 14), jev: true })
  assert.deepEqual(r.mancate, [])
  senzaJev()
})

test('al massimo venti domande a Jev per giro', async () => {
  store.azzeraTutto()
  // venticinque persone diverse, ognuna con la sua mail: tre parole su quattro, quindi tocca a Jev
  const nome = (i: number) => `Cliente${String.fromCharCode(65 + i)}`
  const docs = Array.from({ length: 25 }, (_, i) => documentoDaFare(`posta:INBOX:${50 + i}`, 'Contract', `${nome(i)} here: the signed contract is what we need before the keys.`, { autore: `${nome(i)} <c${i}@ceru.example>` }))
  semina(docs, Object.fromEntries(docs.map(d => [d.id, fa(72)])))
  for (let i = 0; i < 25; i++) riga(`c-l${i}`, `Send ${nome(i)} the signed contract pages`)
  const chiamate = jevFinto(0.9)
  const r = await mancate.trova({ dal: fa(24 * 14), jev: true })
  assert.equal(chiamate.length, 20)
  assert.equal(r.mancate.length, 20)
  const poche = jevFinto(0.9)
  await mancate.trova({ dal: fa(24 * 14), jev: true, limiteJev: 3 })
  assert.equal(poche.length, 3)
  senzaJev()
})

// — il giro —

test('forse: registra, scrive il segnalibro, guarda solo quello che è arrivato dopo, e non gira più di una volta ogni mezz’ora per conto', async () => {
  store.azzeraTutto()
  mancate.dimentica()
  store.salvaFeed([{ tipo: 'Da decidere', titolo: 'Qualcosa di prima', testo: 'Una cosa da fare di prima.', fonte: 'posta' }])
  store.default.prepare('UPDATE feed SET quando = ?').run(fa(24 * 5))
  const i = mail('posta:INBOX:60', { quando: fa(48), messageId: 'i60@ex' })
  semina([i, inviata('posta:Sent:60', { quando: fa(24), risponde: 'i60@ex', destinatari: 'nora@harbor.example', messageId: 's60@ex' })], { [i.id]: fa(48) })
  const adesso = Date.now()
  assert.equal(await mancate.forse(adesso), 1)
  const file = join(cfg.cartella(), 'mancate.json')
  assert.ok(existsSync(file))
  // il segnalibro è l'ultima cosa guardata (il documento indicizzato più di recente), non l'ora del giro
  const ultimoIndicizzato = (store.default.prepare('SELECT MAX(indicizzato) AS m FROM documenti').get() as { m: string }).m
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).ultimo, ultimoIndicizzato)
  assert.notEqual(ultimoIndicizzato, new Date(adesso).toISOString())
  assert.equal((store.default.prepare('SELECT COUNT(*) AS n FROM mancate').get() as { n: number }).n, 1)
  // mezz'ora non è passata: niente, anche se c'è una risposta nuova
  const i2 = mail('posta:INBOX:61', { quando: fa(47), messageId: 'i61@ex' })
  semina([i2, inviata('posta:Sent:61', { quando: fa(23), risponde: 'i61@ex', destinatari: 'nora@harbor.example', messageId: 's61@ex' })], { [i2.id]: fa(47) })
  assert.equal(await mancate.forse(adesso + 60_000), 0)
  // passata la mezz'ora: solo la nuova (la vecchia è già registrata, e comunque non si riguarda)
  assert.equal(await mancate.forse(adesso + mancate.OGNI + 1), 1)
  assert.equal((store.default.prepare('SELECT COUNT(*) AS n FROM mancate').get() as { n: number }).n, 2)
  // un altro conto non è frenato da questo
  const altro = await chi.dentro('altro-conto', () => mancate.forse(adesso + mancate.OGNI + 2))
  assert.equal(altro, 0)
  assert.ok(existsSync(join(cfg.cartellaDi('altro-conto'), 'mancate.json')), 'il giro dell’altro conto non è partito')
  // un segnalibro più avanti dell'ultimo documento indicizzato è storto: si riparte da quattordici giorni
  const storto = new Date(Date.now() + 7 * 24 * ORA).toISOString()
  assert.equal(mancate.daDove(Date.parse(storto) + 1) < storto, true)
  store.chiudiIndice(cfg.cartellaDi('altro-conto'))
  rmSync(cfg.cartellaDi('altro-conto'), { recursive: true, force: true })
})

test('due giri a mezz’ora di distanza senza niente di nuovo: il secondo non rilegge quattordici giorni e non chiede niente a Jev', async () => {
  store.azzeraTutto()
  mancate.dimentica()
  store.salvaFeed([{ tipo: 'Da decidere', titolo: 'Qualcosa di prima', testo: 'Una cosa da fare di prima.', fonte: 'posta' }])
  store.default.prepare('UPDATE feed SET quando = ?').run(fa(24 * 5))
  // una riga a mano con tre parole su quattro in un documento: la domanda tocca a Jev
  const d = documentoDaFare('posta:INBOX:70', 'Contract', 'Hi, Marta here: the signed contract is what we need before we hand over the keys.', { autore: 'Marta <marta@ceru.example>' })
  semina([d], { [d.id]: fa(72) })
  riga('c-w1', 'Send Marta the signed contract pages', { creato: fa(48) })
  let chiamate = jevFinto(0.2)
  const adesso = Date.now()
  assert.equal(await mancate.forse(adesso), 0, 'Jev ha detto no')
  assert.equal(chiamate.length, 1)
  // mezz'ora dopo, niente di nuovo: il segnalibro regge, si riparte da lì, zero domande
  const dal = mancate.daDove(adesso + mancate.OGNI + 1)
  assert.ok(dal >= fa(72), `si riparte da quattordici giorni fa: ${dal}`)
  chiamate = jevFinto(0.2)
  assert.equal(await mancate.forse(adesso + mancate.OGNI + 1), 0)
  assert.equal(chiamate.length, 0, 'senza niente di nuovo Jev è stato richiesto')
  // e una riga nuova dopo il segnalibro si guarda, una sola domanda
  riga('c-w2', 'Send Marta the signed contract pages again', { creato: new Date(adesso + mancate.OGNI + 2).toISOString() })
  chiamate = jevFinto(0.2)
  assert.equal(await mancate.forse(adesso + 2 * mancate.OGNI + 3), 0)
  assert.equal(chiamate.length, 1)
  senzaJev()
})
