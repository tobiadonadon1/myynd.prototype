// Come le cose finiscono sul feed — e come non ci finiscono due volte.
//
// Sul database vero la stessa email stava sul feed tre volte, con tre titoli
// un po' diversi, nata in tre letture di tre giorni: l'id nasce dal titolo, e
// il modello non è tenuto a riscriverlo alla lettera. Le prove qui sotto sono
// le reti che lo impediscono, prese una per una, e poi la lettura intera con
// un fornitore finto al posto del modello — per guardare cosa gli si manda,
// non cosa risponde.
//
// E in fondo la riga che mancava: quando il feed cambia in sottofondo, chi ha
// la pagina aperta lo sente. Solo lui.
//
//   node --test server/feed.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Documento } from './store.ts'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-feed-'))
process.env.MYYND_DATI = CASA
// la chiave di casa non deve entrare in queste prove: senza motore vuol dire senza
delete process.env.ANTHROPIC_API_KEY

const cfg = await import('./config.ts')
const store = await import('./store.ts')
const claude = await import('./claude.ts')
const compatibile = await import('./compatibile.ts')
const compiti = await import('./compiti.ts')
const automazioni = await import('./automazioni.ts')

before(() => store.azzeraTutto())
after(() => {
  compatibile.usaRete(null)
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

const doc = (id: string, titolo: string, sopra: Partial<Documento> = {}): Documento => ({
  id, fonte: 'posta', tipo: 'email', titolo, corpo: `Il testo di ${titolo}.`,
  autore: 'Rossi <rossi@esempio.it>', percorso: 'INBOX',
  quando: '2026-09-01T10:00:00.000Z', gruppo: 'posta', ...sopra
})

const voce = (titolo: string, doc?: string) =>
  ({ tipo: 'Da decidere', titolo, testo: `Il testo di ${titolo}.`, fonte: 'posta', ...(doc ? { doc } : {}) })

// — salvaFeed: le reti —

test('un documento, una voce: la stessa email con un titolo nuovo non entra due volte', () => {
  store.azzeraTutto()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo')])
  assert.equal(store.salvaFeed([voce('Preventivo Rossi da confermare', 'posta:INBOX:1')]), 1)
  // la lettura del giorno dopo: stesso documento, parole diverse
  assert.equal(store.salvaFeed([voce('Rossi aspetta una risposta sul preventivo', 'posta:INBOX:1')]), 0)
  const aperte = store.elencoFeed('aperto')
  assert.equal(aperte.length, 1)
  assert.equal(aperte[0].titolo, 'Preventivo Rossi da confermare')
})

test('e non entra nemmeno dopo che l’hai chiusa o scartata', () => {
  store.azzeraTutto()
  store.salvaDocumenti([doc('posta:INBOX:2', 'Fattura'), doc('posta:INBOX:3', 'Newsletter')])
  store.salvaFeed([voce('Fattura di marzo da pagare', 'posta:INBOX:2'), voce('Newsletter di aprile', 'posta:INBOX:3')])
  const [fattura, newsletter] = ['Fattura di marzo da pagare', 'Newsletter di aprile']
    .map(t => store.elencoFeed('aperto').find(v => v.titolo === t)!)
  store.cambiaStatoFeed(fattura.id, 'fatto', 'Pagata lunedì')
  store.cambiaStatoFeed(newsletter.id, 'scartato', 'Non mi interessa.')

  assert.equal(store.salvaFeed([
    voce('Pagare la fattura di marzo', 'posta:INBOX:2'),
    voce('La newsletter di aprile è arrivata', 'posta:INBOX:3')
  ]), 0, 'una cosa che hai chiuso è tornata su con un altro nome')
  assert.equal(store.elencoFeed('aperto').length, 0)
})

test('senza documento contano le parole: un titolo che somiglia a uno già lì non entra', () => {
  store.azzeraTutto()
  assert.equal(store.salvaFeed([voce('Preventivo Rossi da confermare entro venerdì')]), 1)
  assert.equal(store.salvaFeed([voce('Confermare il preventivo a Rossi entro venerdì')]), 0)
  // e vale anche fra quelle dello stesso giro
  assert.equal(store.salvaFeed([voce('Contratto Bianchi da firmare'), voce('Firmare il contratto di Bianchi')]), 1)
  assert.equal(store.elencoFeed('aperto').length, 2)
})

test('due cose diverse sullo stesso cliente restano due cose', () => {
  store.azzeraTutto()
  assert.equal(store.salvaFeed([voce('Fattura di marzo a Rossi'), voce('Fattura di aprile a Rossi')]), 2)
  assert.equal(store.salvaFeed([voce('Scadenza del contratto Rossi')]), 1)
  assert.equal(store.elencoFeed('aperto').length, 3)
})

test('due documenti diversi con titoli quasi uguali sono due voci: la rete delle parole non copre un documento nuovo', () => {
  store.azzeraTutto()
  // due fatture dello stesso fornitore, due email: i numeri corti non contano fra le parole
  store.salvaDocumenti([doc('posta:INBOX:5', 'Fattura n. 123'), doc('posta:INBOX:6', 'Fattura n. 124')])
  assert.equal(store.salvaFeed([voce('Fattura n. 123 di Rossi da pagare', 'posta:INBOX:5')]), 1)
  assert.equal(store.salvaFeed([voce('Fattura n. 124 di Rossi da pagare', 'posta:INBOX:6')]), 1,
    'la seconda fattura è stata presa per un doppione della prima')
  assert.equal(store.elencoFeed('aperto').length, 2)
  // ma una voce senza documento che ripete una di quelle resta fuori
  assert.equal(store.salvaFeed([voce('Pagare la fattura n. 123 di Rossi')]), 0)
})

test('la stessa voce riscritta uguale non conta come nuova, e resta chiusa se l’avevi chiusa', () => {
  store.azzeraTutto()
  store.salvaDocumenti([doc('posta:INBOX:4', 'Deck')])
  const v = voce('Deck a metà', 'posta:INBOX:4')
  assert.equal(store.salvaFeed([v]), 1)
  assert.equal(store.salvaFeed([v]), 0, 'la stessa voce è stata contata due volte')
  const [prima] = store.elencoFeed('aperto')
  store.cambiaStatoFeed(prima.id, 'fatto')
  assert.equal(store.salvaFeed([{ ...v, testo: 'Mancano ancora due slide.' }]), 0)
  assert.equal(store.elencoFeed('aperto').length, 0)
  assert.equal(store.voceFeed(prima.id)!.testo, 'Mancano ancora due slide.', 'l’upsert non aggiorna più il testo')
})

// — generaFeed: cosa arriva al modello —

/** Un fornitore compatibile finto: risponde con queste voci e si ricorda cosa ha ricevuto. */
function fornitoreFinto(voci: object[]) {
  cfg.scrivi({ motore: 'compatibile', compatibile: { url: 'https://esempio.test/v1/', chiave: 'sk-prova', modello: 'gpt-prova' } })
  const ricevute: Record<string, unknown>[] = []
  compatibile.usaRete((async (_url: string | URL | Request, init?: RequestInit) => {
    ricevute.push(init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {})
    return Response.json({
      id: 'chatcmpl-1', model: 'gpt-prova',
      choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify({ voci }) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 10 }
    })
  }) as typeof fetch)
  return ricevute
}

/** Tutto il testo mandato al modello, system e messaggi insieme. */
const testoDi = (r: Record<string, unknown>) =>
  (r.messages as { content: string }[]).map(m => m.content).join('\n')

test('quello che è già sul feed non si rilegge e si dice al modello per titolo', async () => {
  store.azzeraTutto()
  store.salvaDocumenti([
    doc('posta:INBOX:10', 'Preventivo Rossi', { quando: '2026-09-03T10:00:00.000Z' }),
    doc('posta:INBOX:11', 'Fattura Bianchi', { quando: '2026-09-02T10:00:00.000Z' })
  ])
  // la voce di ieri, ancora aperta, nata dal preventivo
  store.salvaFeed([voce('Preventivo Rossi da confermare', 'posta:INBOX:10')])

  const ricevute = fornitoreFinto([
    { tipo: 'Da decidere', titolo: 'Fattura Bianchi da pagare', testo: 'Scade venerdì.', urgenza: 'entro venerdì', fonte: 'posta', doc: 'posta:INBOX:11' }
  ])
  const voci = await claude.generaFeed()
  assert.equal(ricevute.length, 1, 'il modello va chiamato una volta')
  const mandato = testoDi(ricevute[0])
  assert.match(mandato, /id: posta:INBOX:11/)
  assert.doesNotMatch(mandato, /id: posta:INBOX:10/, 'un documento con una voce aperta è stato riletto')
  assert.match(mandato, /GIÀ sul suo feed[\s\S]*«Preventivo Rossi da confermare»/, 'le voci aperte non arrivano al modello')
  // e quello che torna si salva, e si conta
  assert.equal(voci.length, 1)
  assert.equal(store.salvaFeed(voci), 1)
  assert.equal(store.elencoFeed('aperto').length, 2)
})

test('con tutto già sul feed non si chiama nessun modello', async () => {
  store.azzeraTutto()
  store.salvaDocumenti([doc('posta:INBOX:20', 'Unico')])
  store.salvaFeed([voce('L’unico documento', 'posta:INBOX:20')])
  const ricevute = fornitoreFinto([])
  assert.deepEqual(await claude.generaFeed(), [])
  assert.equal(ricevute.length, 0, 'ha chiamato il modello senza niente da leggere')
})

test('senza un motore la lettura non finge: torna vuota, e scriversi un’automazione lo dice', async () => {
  cfg.scrivi({})
  compatibile.usaRete(null)
  store.salvaDocumenti([doc('posta:INBOX:30', 'Qualcosa')])
  assert.deepEqual(await claude.generaFeed(), [])
  await assert.rejects(automazioni.daUnaFrase('Ogni lunedì dimmi quali preventivi sono senza risposta'),
    /Collega Claude e potrò lavorarci/)
})

// — cosa non arriva nemmeno al modello —
//
// Sul database vero il feed diceva ventiquattro cose da guardare, e metà erano
// promozioni, newsletter, ed email già lette che non chiedevano niente. Le
// prove qui sotto guardano cosa si manda, non cosa torna: il modello finto
// risponde sempre la stessa cosa.

const ieriLAltro = new Date(Date.now() - 3 * 86_400_000).toISOString()
const stamattina = new Date(Date.now() - 3 * 3_600_000).toISOString()

test('la posta di massa, quella scritta da lui e quella letta da giorni non si leggono; una letta stamattina sì', async () => {
  store.azzeraTutto()
  store.salvaDocumenti([
    doc('posta:INBOX:40', 'Offerta Chase', { autore: 'Chase <no-reply@chase.com>', massa: true, quando: stamattina }),
    doc('posta:INBOX:41', 'Re: preventivo', { inviato: true, quando: stamattina }),
    doc('posta:INBOX:42', 'Verbale di lunedì', { letto: true, quando: ieriLAltro }),
    doc('posta:INBOX:43', 'Conferma per giovedì?', { letto: true, quando: stamattina }),
    doc('posta:INBOX:44', 'Contratto da firmare', { letto: false, quando: ieriLAltro })
  ])
  const ricevute = fornitoreFinto([])
  await claude.generaFeed()
  assert.equal(ricevute.length, 1)
  const mandato = testoDi(ricevute[0])
  assert.doesNotMatch(mandato, /id: posta:INBOX:40/, 'la posta di massa è arrivata al modello')
  assert.doesNotMatch(mandato, /id: posta:INBOX:41/, 'una email scritta da lui è arrivata al modello')
  assert.doesNotMatch(mandato, /id: posta:INBOX:42/, 'una email letta tre giorni fa è arrivata al modello')
  assert.match(mandato, /id: posta:INBOX:43/, 'una email letta stamattina può ancora chiedere qualcosa')
  assert.match(mandato, /id: posta:INBOX:44/)
})

test('chi ha scartato non torna: per indirizzo, e per dominio se scriveva una macchina', async () => {
  store.azzeraTutto()
  store.salvaDocumenti([
    doc('posta:INBOX:50', 'Promo caffè', { autore: 'Caffè <promo@caffe.it>' }),
    doc('posta:INBOX:51', 'Novità caffè', { autore: 'Caffè <novita@caffe.it>' }),
    doc('posta:INBOX:52', 'Ciao', { autore: 'Bianchi <bianchi@gmail.com>' }),
    doc('posta:INBOX:53', 'Ci sei?', { autore: 'Verdi <verdi@gmail.com>' }),
    doc('posta:INBOX:54', 'Preventivo', { autore: 'Rossi <rossi@esempio.it>' })
  ])
  store.salvaFeed([voce('Promozione del caffè', 'posta:INBOX:50'), voce('Bianchi saluta', 'posta:INBOX:52')])
  for (const v of store.elencoFeed('aperto')) store.cambiaStatoFeed(v.id, 'scartato', 'Non mi interessa.')

  const m = store.mittentiScartati()
  assert.deepEqual(m.indirizzi.sort(), ['bianchi@gmail.com', 'promo@caffe.it'])
  // gmail.com è di tutti: scartare Bianchi non chiude Verdi
  assert.deepEqual(m.domini, ['caffe.it'])

  const ricevute = fornitoreFinto([])
  await claude.generaFeed()
  const mandato = testoDi(ricevute[0])
  assert.doesNotMatch(mandato, /id: posta:INBOX:51/, 'un altro indirizzo dello stesso mittente in serie è passato')
  assert.doesNotMatch(mandato, /id: posta:INBOX:52/)
  assert.match(mandato, /id: posta:INBOX:53/, 'una persona su gmail è stata chiusa fuori con un\'altra')
  assert.match(mandato, /id: posta:INBOX:54/)
  assert.match(mandato, /Ha scartato la posta di questi mittenti[^\n]*\n[^\n]*promo@caffe\.it/, 'i mittenti scartati non si dicono al modello')
})

test('al massimo cinque voci: nello schema, nel prompt, e su quello che torna', async () => {
  store.azzeraTutto()
  store.salvaDocumenti([doc('posta:INBOX:60', 'Sette cose')])
  const sette = Array.from({ length: 7 }, (_, i) =>
    ({ tipo: 'Da decidere', titolo: `Cosa ${i}`, testo: 'x', urgenza: 'oggi', fonte: 'posta', doc: 'posta:INBOX:60' }))
  const ricevute = fornitoreFinto(sette)
  const voci = await claude.generaFeed()
  assert.equal(voci.length, 5, 'un fornitore che ignora maxItems ha riempito il feed')
  const schema = (ricevute[0].response_format as { json_schema: { schema: { properties: { voci: { maxItems: number } } } } })
    .json_schema.schema.properties.voci.maxItems
  assert.equal(schema, 5)
  assert.match(testoDi(ricevute[0]), /al massimo 5 cose/)
})

// — il feed si tiene corto —

const vociCon = (da: number, quante: number) => {
  const ids = Array.from({ length: quante }, (_, i) => `posta:INBOX:${da + i}`)
  store.salvaDocumenti(ids.map(id => doc(id, `Documento ${id}`)))
  return ids.map(id => voce(`Cosa da fare per ${id}`, id))
}
const spostaQuando = (id: string, giorniFa: number) =>
  store.default.prepare('UPDATE feed SET quando = ? WHERE id = ?')
    .run(new Date(Date.now() - giorniFa * 86_400_000).toISOString(), id)

test('più di otto aperte: le più vecchie scadono, e non passano per «risposte»', () => {
  store.azzeraTutto()
  assert.equal(store.salvaFeed(vociCon(100, 6)), 6)
  const vecchie = store.elencoFeed('aperto').map(v => v.id)
  for (const id of vecchie) spostaQuando(id, 2)
  assert.equal(store.salvaFeed(vociCon(200, 4)), 4)

  const aperte = store.elencoFeed('aperto')
  assert.equal(aperte.length, 8, 'il feed è cresciuto oltre le otto')
  // le quattro nuove ci sono tutte: sono andate via due delle vecchie
  assert.equal(aperte.filter(v => v.doc.startsWith('posta:INBOX:2')).length, 4)
  assert.equal(store.elencoFeed('scaduto').length, 2)
  assert.equal(store.elencoFeed('fatto').length, 0, 'una voce scaduta è finita fra le fatte')
  assert.ok(!store.feedGiaVisto().some(v => v.stato === 'scaduto'), 'una voce scaduta è stata raccontata come risposta')
})

test('una voce di cinque giorni scade anche senza una lettura nuova, e non torna', () => {
  store.azzeraTutto()
  const [v] = vociCon(300, 1)
  store.salvaFeed([v])
  const [aperta] = store.elencoFeed('aperto')
  spostaQuando(aperta.id, 5)
  assert.equal(store.elencoFeed('aperto').length, 0, 'una voce di cinque giorni è ancora in pagina')
  assert.equal(store.voceFeed(aperta.id)!.stato, 'scaduto')
  // le reti la sanno: lo stesso documento con un titolo nuovo non rientra,
  // e non si rilegge nemmeno
  assert.equal(store.salvaFeed([voce('La stessa cosa, detta diversa', v.doc)]), 0)
  assert.ok(store.docsSulFeed([v.doc!]).has(v.doc!))
})

test('«letto» si scrive senza far sembrare nuova l’email', () => {
  store.azzeraTutto()
  store.salvaDocumenti([doc('posta:INBOX:70', 'Da leggere', { letto: false })])
  const indicizzato = () => (store.default.prepare('SELECT indicizzato FROM documenti WHERE id = ?')
    .get('posta:INBOX:70') as { indicizzato: string }).indicizzato
  const prima = indicizzato()
  assert.equal(store.segnaLetti([{ id: 'posta:INBOX:70', letto: true }]), 1)
  assert.equal(store.segnaLetti([{ id: 'posta:INBOX:70', letto: true }]), 0, 'la stessa bandiera è stata riscritta')
  assert.equal(store.documento('posta:INBOX:70')!.letto, 1)
  assert.equal(indicizzato(), prima, 'aprire una email l’ha fatta contare come arrivata adesso')
  // e anche da una rilettura della posta: stesso contenuto, bandiera diversa
  const e = store.salvaDocumenti([doc('posta:INBOX:70', 'Da leggere', { letto: false })])
  assert.equal(e.invariati, 1)
  assert.equal(store.documento('posta:INBOX:70')!.letto, 0)
})

// — il filo: chi ha la pagina aperta lo sente —

test('«feed» arriva sul filo dei compiti, e solo a chi è la stessa persona', () => {
  const miei: string[] = []
  const altrui: string[] = []
  const smettiMio = compiti.ascolta(e => { miei.push(e.fase) }, null)
  const smettiAltro = compiti.ascolta(e => { altrui.push(e.fase) }, 'qualcun-altro')
  compiti.annunciaFeed()
  smettiMio(); smettiAltro()
  assert.deepEqual(miei, ['feed'])
  assert.deepEqual(altrui, [])
})
