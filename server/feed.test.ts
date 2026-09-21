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
const progetti = await import('./progetti.ts')
const jev = await import('./jev.ts')
const giudizi = await import('./giudizi.ts')

before(() => store.azzeraTutto())
after(() => {
  compatibile.usaRete(null)
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

const RECENTE = new Date(Date.now() - 3_600_000).toISOString()
const doc = (id: string, titolo: string, sopra: Partial<Documento> = {}): Documento => ({
  id, fonte: 'posta', tipo: 'email', titolo, corpo: `Puoi confermare i dettagli di ${titolo}? Attendo una risposta.`,
  autore: 'Rossi <rossi@esempio.it>', percorso: 'INBOX',
  quando: RECENTE, gruppo: 'posta', ...sopra
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

/**
 * Un fornitore compatibile finto: risponde con queste voci e si ricorda cosa ha ricevuto.
 *
 * L'app qui è in italiano, ed è una dichiarazione e non un dettaglio: le voci
 * finte sono scritte in italiano, e da quando la lettura controlla la lingua di
 * quello che torna una voce italiana dentro un'app inglese viene buttata — che
 * è esattamente quello che si vuole. Le prove della lingua stanno in fondo al
 * file, e l'app se la scelgono loro.
 */
function fornitoreFinto(voci: object[], lingua: 'it' | 'en' = 'it') {
  cfg.scrivi({ lingua, motore: 'compatibile', compatibile: { url: 'https://esempio.test/v1/', chiave: 'sk-prova', modello: 'gpt-prova' } })
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
    doc('posta:INBOX:10', 'Preventivo Rossi'),
    doc('posta:INBOX:11', 'Fattura Bianchi', { corpo: 'Puoi pagare la fattura entro venerdì?' })
  ])
  // la voce di ieri, ancora aperta, nata dal preventivo
  store.salvaFeed([voce('Preventivo Rossi da confermare', 'posta:INBOX:10')])

  const ricevute = fornitoreFinto([
    { tipo: 'Da decidere', titolo: 'Paga la fattura di Bianchi', testo: 'Bianchi chiede il pagamento della fattura entro venerdì.', urgenza: 'entro venerdì', fonte: 'posta', doc: 'posta:INBOX:11', perche: 'Bianchi attende il pagamento della fattura.', prova: 'Puoi pagare la fattura entro venerdì?' }
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
    doc('posta:INBOX:42', 'Verbale di lunedì', { letto: true, quando: ieriLAltro, corpo: 'Il verbale della riunione, per conoscenza.' }),
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

test('lo scarto ricorda la richiesta e il mittente automatico, senza bloccare persone o domini', async () => {
  store.azzeraTutto()
  store.salvaDocumenti([
    doc('posta:INBOX:50', 'Promo caffè', { autore: 'Caffè <promo@caffe.it>' }),
    doc('posta:INBOX:51', 'Novità caffè', { autore: 'Caffè <novita@caffe.it>', massa: true }),
    doc('posta:INBOX:52', 'Ciao', { autore: 'Bianchi <bianchi@gmail.com>' }),
    doc('posta:INBOX:53', 'Ci sei?', { autore: 'Verdi <verdi@gmail.com>' }),
    doc('posta:INBOX:54', 'Preventivo', { autore: 'Rossi <rossi@esempio.it>' })
  ])
  store.salvaFeed([voce('Promozione del caffè', 'posta:INBOX:50'), voce('Bianchi saluta', 'posta:INBOX:52')])
  for (const v of store.elencoFeed('aperto')) store.cambiaStatoFeed(v.id, 'scartato', 'Non mi interessa.')

  const m = store.mittentiScartati()
  assert.deepEqual(m.indirizzi.sort(), ['promo@caffe.it'])
  // gmail.com è di tutti: scartare Bianchi non chiude Verdi
  assert.deepEqual(m.domini, [])

  const ricevute = fornitoreFinto([])
  await claude.generaFeed()
  const mandato = testoDi(ricevute[0])
  assert.doesNotMatch(mandato, /id: posta:INBOX:51/, 'un altro indirizzo dello stesso mittente in serie è passato')
  assert.doesNotMatch(mandato, /id: posta:INBOX:52/)
  assert.match(mandato, /id: posta:INBOX:53/, 'una persona su gmail è stata chiusa fuori con un\'altra')
  assert.match(mandato, /id: posta:INBOX:54/)
  assert.match(mandato, /Ha scartato la posta di questi mittenti automatici[^\n]*\n[^\n]*promo@caffe\.it/, 'i mittenti scartati non si dicono al modello')
})

test('al massimo cinque voci: nello schema, nel prompt, e su quello che torna', async () => {
  store.azzeraTutto()
  store.salvaDocumenti(Array.from({ length: 7 }, (_, i) => doc(`posta:INBOX:${60 + i}`, `Cosa ${i}`)))
  const sette = Array.from({ length: 7 }, (_, i) =>
    ({ tipo: 'Da decidere', titolo: `Conferma a Rossi i dettagli di Cosa ${i}`, testo: `Rossi chiede di confermare i dettagli di Cosa ${i}.`, urgenza: 'nessuna fretta', fonte: 'posta', doc: `posta:INBOX:${60 + i}`, perche: 'Rossi attende la tua conferma.', prova: `Puoi confermare i dettagli di Cosa ${i}?` }))
  const ricevute = fornitoreFinto(sette)
  const voci = await claude.generaFeed()
  assert.equal(voci.length, 5, 'un fornitore che ha ignorato il tetto ha riempito il feed')
  // il tetto NON sta nello schema: l'API di Claude rifiuta «maxItems» e con
  // lui l'intera lettura — è successo davvero, alle tre di notte, in silenzio
  const voce = (ricevute[0].response_format as { json_schema: { schema: { properties: { voci: Record<string, unknown> } } } })
    .json_schema.schema.properties.voci
  assert.ok(!('maxItems' in voce), 'maxItems nello schema: Claude lo rifiuta')
  assert.match(String(voce.description), /5/)
  assert.match(testoDi(ricevute[0]), /al massimo 5 cose/)
})

// — i progetti: gli obiettivi nel prompt, e il perché di ogni voce —

test('gli obiettivi entrano nel prompt, il documento che tocca un progetto passa davanti, e il «perché» si salva e torna', async () => {
  store.azzeraTutto()
  progetti.scrivi({ nome: 'Nextas', obiettivo: 'Chiudere il round seed con Bianchi entro ottobre' })
  const chiuso = progetti.scrivi({ nome: 'Myynd per papà', obiettivo: 'Non è un progetto' })
  progetti.chiudi(chiuso.id)
  // la posta della luce è più recente, e senza i progetti verrebbe letta per prima
  store.salvaDocumenti([
    doc('posta:INBOX:80', 'Fattura della luce di settembre', { autore: 'Enel <fatture@enel.it>', quando: new Date(Date.now() - 3_600_000).toISOString() }),
    doc('posta:INBOX:81', 'Re: seed', { autore: 'Bianchi <bianchi@fondo.it>', corpo: 'Puoi confermare il round seed di Nextas per martedì?', quando: new Date(Date.now() - 7_200_000).toISOString() }),
    doc('posta:INBOX:82', 'Aggiornamento su Myynd per papà', { quando: new Date(Date.now() - 10_800_000).toISOString() })
  ])
  const ricevute = fornitoreFinto([
    { tipo: 'Da decidere', titolo: 'Conferma a Bianchi il round seed', testo: 'Bianchi chiede la conferma del round seed di Nextas per martedì.', urgenza: 'entro martedì', fonte: 'posta', doc: 'posta:INBOX:81', perche: ' Muove il round seed di Nextas: serve una data. ', prova: 'Puoi confermare il round seed di Nextas per martedì?' }
  ])
  const voci = await claude.generaFeed()
  assert.equal(ricevute.length, 1)
  const mandato = testoDi(ricevute[0])
  assert.match(mandato, /Su cosa sta lavorando, e a cosa punta ciascuno[^\n]*\n— Progetto: Nextas \(attivo; registrato dalla persona\)\. Obiettivo di Nextas: Chiudere il round seed con Bianchi entro ottobre/)
  assert.doesNotMatch(mandato, /Obiettivo di Myynd per papà:/, 'un progetto chiuso è arrivato al modello come obiettivo')
  // l'ordine del materiale: prima quello che tocca il progetto
  const ordine = [...mandato.matchAll(/^id: (\S+)/gm)].map(m => m[1])
  assert.deepEqual(ordine, ['posta:INBOX:81', 'posta:INBOX:80', 'posta:INBOX:82'], `l'ordine è ${ordine.join(', ')}`)
  // il perché sta nello schema, obbligatorio, e nel prompt
  const schema = (ricevute[0].response_format as { json_schema: { schema: { properties: { voci: { items: { properties: Record<string, unknown>; required: string[] } } } } } })
    .json_schema.schema.properties.voci.items
  assert.ok('perche' in schema.properties)
  assert.ok(schema.required.includes('perche'))
  assert.match(mandato, /per\nquale progetto o obiettivo conta/)

  // e quello che torna lo porta, pulito, fino al feed
  assert.equal(voci[0].perche, 'Muove il round seed di Nextas: serve una data.')
  assert.equal(store.salvaFeed(voci), 1)
  const [aperta] = store.elencoFeed('aperto')
  assert.equal(aperta.perche, 'Muove il round seed di Nextas: serve una data.')
  // una rilettura senza perché non cancella quello che c'era
  store.salvaFeed([{ ...voci[0], perche: '' }])
  assert.equal(store.elencoFeed('aperto')[0].perche, 'Muove il round seed di Nextas: serve una data.')
})

test('senza progetti il prompt non ne parla, e una voce vaga senza perché viene rifiutata', async () => {
  store.azzeraTutto()
  store.salvaDocumenti([doc('posta:INBOX:90', 'Una cosa')])
  const ricevute = fornitoreFinto([
    { tipo: 'Da decidere', titolo: 'Una cosa da fare', testo: 'x', urgenza: 'oggi', fonte: 'posta', doc: 'posta:INBOX:90' }
  ])
  const voci = await claude.generaFeed()
  assert.doesNotMatch(testoDi(ricevute[0]), /Su cosa sta lavorando/)
  assert.deepEqual(voci, [])
  assert.equal(store.salvaFeed(voci), 0)
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

// — dal disco solo i documenti veri —
//
// La voce che gli è arrivata in faccia: «Da leggere», titolo «Cosa significa
// «large-object promisors» in Git?», fonte un file `.html` dentro l'albero di
// un installatore. «Why is the source a random HTML file?». `desktop.ts` adesso
// quell'albero non lo apre nemmeno; questa è la seconda rete, e vale anche per
// quello che era già in indice prima.

/** Un file sul disco, con il percorso che decide se si racconta. */
const file = (percorso: string): Documento => ({
  id: `desktop:${percorso}`, fonte: 'desktop', tipo: 'documento',
  titolo: percorso.slice(percorso.lastIndexOf('/') + 1),
  corpo: 'Per il progetto Nextas: puoi firmare il contratto allegato entro venerdì?',
  autore: null, percorso, quando: new Date(Date.now() - 3_600_000).toISOString(), gruppo: 'documenti'
})

const DA_ATTREZZI = '/Users/tobia/pinokio/bin/miniforge/pkgs/git-2.55.0/share/doc/git/large-object-promisors.html'
const CONTRATTO = '/Users/tobia/Documents/Contratto.pdf'

test('un file di un albero di attrezzi non arriva al modello, un contratto sì', async () => {
  store.azzeraTutto()
  progetti.scrivi({ nome: 'Nextas', obiettivo: 'Firmare il contratto del round seed' })
  store.salvaDocumenti([file(DA_ATTREZZI), file(CONTRATTO), file('/Users/tobia/Documents/Archivio/2024/2023/Vecchia.pdf')])
  const ricevute = fornitoreFinto([])
  await claude.generaFeed()
  assert.equal(ricevute.length, 1)
  const mandato = testoDi(ricevute[0])
  assert.doesNotMatch(mandato, /large-object-promisors/, 'un file di documentazione di Git è arrivato al modello')
  assert.match(mandato, /id: desktop:\/Users\/tobia\/Documents\/Contratto\.pdf/)
  // quattro cartelle sotto i Documenti non è «arrivato adesso»: è archivio
  assert.doesNotMatch(mandato, /Vecchia\.pdf/)
})

test('con il solo rumore dal disco non si chiama nessun modello', async () => {
  store.azzeraTutto()
  store.salvaDocumenti([file(DA_ATTREZZI)])
  const ricevute = fornitoreFinto([])
  assert.deepEqual(await claude.generaFeed(), [])
  assert.equal(ricevute.length, 0, 'ha chiamato il modello per un file di un installatore')
})

// — la lingua di quello che torna —
//
// «This task is in Italian and my app is in English». L'istruzione al modello
// c'è, ripetuta in testa e in coda, e un modello grande la rispetta; un modello
// piccolo sul portatile legge trenta documenti italiani e risponde in italiano.
// Una seconda chiamata con l'ordine urlato in coda al materiale, e se sbaglia
// ancora la voce si butta: una voce in meno non la nota nessuno.

const IN_ITALIANO = [{
  tipo: 'Da decidere', titolo: 'Rispondi a Rossi sui dettagli del preventivo',
  testo: 'Rossi chiede la conferma dei dettagli del preventivo. Rispondi alla sua email.',
  urgenza: 'nessuna fretta', fonte: 'posta', doc: 'posta:INBOX:95',
  perche: 'Serve una risposta per il progetto di Rossi.', prova: 'Puoi confermare i dettagli di Preventivo Rossi?'
}]
const IN_INGLESE = [{
  tipo: 'Da decidere', titolo: 'Reply to Rossi about the quote details',
  testo: 'Rossi asks you to confirm the quote details. Reply with your confirmation.',
  urgenza: 'no rush', fonte: 'posta', doc: 'posta:INBOX:95',
  perche: 'A reply is needed for the Rossi project.', prova: 'Puoi confermare i dettagli di Preventivo Rossi?'
}]
/** L'ultimo messaggio mandato al modello: quello dove finisce l'ordine urlato. */
const ultimoMessaggio = (r: Record<string, unknown>) =>
  String((r.messages as { content: string }[]).at(-1)!.content)

test('una voce nella lingua sbagliata si richiede una volta, e poi si butta', async () => {
  store.azzeraTutto()
  store.salvaDocumenti([doc('posta:INBOX:95', 'Preventivo Rossi')])
  const ricevute = fornitoreFinto(IN_ITALIANO, 'en')
  const voci = await claude.generaFeed()
  assert.equal(ricevute.length, 2, 'una risposta in italiano a un\'app inglese non è stata richiesta')
  assert.doesNotMatch(ultimoMessaggio(ricevute[0]), /IN ENGLISH ONLY/)
  assert.match(ultimoMessaggio(ricevute[1]), /IN ENGLISH ONLY$/, 'la seconda chiamata non urla la lingua')
  assert.deepEqual(voci, [], 'una voce italiana è arrivata sul feed di un\'app inglese')
})

test('una voce nella lingua giusta passa con una chiamata sola', async () => {
  store.azzeraTutto()
  store.salvaDocumenti([doc('posta:INBOX:95', 'Preventivo Rossi')])
  const ricevute = fornitoreFinto(IN_INGLESE, 'en')
  const voci = await claude.generaFeed()
  assert.equal(ricevute.length, 1, 'ha richiesto una risposta che andava bene')
  assert.equal(voci.length, 1)
  assert.equal(voci[0].titolo, 'Reply to Rossi about the quote details')
})

test('e la stessa regola al contrario: un\'app in italiano non tiene una voce inglese', async () => {
  store.azzeraTutto()
  store.salvaDocumenti([doc('posta:INBOX:96', 'Preventivo Rossi')])
  const ricevute = fornitoreFinto(IN_INGLESE.map(v => ({ ...v, doc: 'posta:INBOX:96' })), 'it')
  const voci = await claude.generaFeed()
  assert.equal(ricevute.length, 2)
  assert.match(ultimoMessaggio(ricevute[1]), /SOLO IN ITALIANO$/)
  assert.deepEqual(voci, [])
})

/*
 * Le due voci del quattordici settembre.
 *
 * Il suo progetto «tobiadonadon.com» ha per obiettivo «Ship the finished site
 * copy and offers live.» Nello stesso giro di lettura il feed ha prodotto
 * «Ship live site copy for tobiadonadon.com» e «Ship finished site copy for
 * tobiadonadon.com»: l'obiettivo tagliato in due, con il nome del progetto in
 * coda. Nessuna delle due veniva da un documento — erano appese a una nota
 * della spesa e a una lista di prezzi di mobili, perché lo schema obbliga a
 * nominarne uno.
 *
 * La rete dei titoli le avrebbe prese: quattro parole in comune su cinque. Ma
 * non veniva nemmeno consultata, perché i due documenti erano diversi.
 */
test('lo stesso titolo con una parola cambiata è una voce sola, anche appeso a due documenti', () => {
  store.azzeraTutto()
  store.salvaDocumenti([doc('note:AAA', 'BUILD COST APT'), doc('note:BBB', 'list')])
  assert.equal(store.salvaFeed([
    voce('Ship live site copy for tobiadonadon.com', 'note:AAA'),
    voce('Ship finished site copy for tobiadonadon.com', 'note:BBB')
  ]), 1, 'la stessa frase con una parola cambiata è entrata due volte')
  assert.equal(store.elencoFeed('aperto').length, 1)
})

test('ma due cose davvero diverse restano due, anche se si somigliano', () => {
  store.azzeraTutto()
  store.salvaDocumenti([doc('posta:INBOX:11', 'Marzo'), doc('posta:INBOX:12', 'Aprile')])
  assert.equal(store.salvaFeed([
    voce('Fattura di marzo a Rossi da pagare', 'posta:INBOX:11'),
    voce('Fattura di aprile a Rossi da pagare', 'posta:INBOX:12')
  ]), 2, 'due mesi diversi sono diventati una voce sola')
})

test('done and never mind survive months, source removal and folder reindexing', () => {
  for (const stato of ['fatto', 'scartato']) {
    store.azzeraTutto()
    const originale = doc('posta:INBOX:501', 'Nextas contract review', { messageId: 'same-message', filo: 'nextas-thread', corpo: 'Could you review the Nextas contract and confirm the proposed terms?' })
    store.salvaDocumenti([originale])
    store.salvaFeed([voce('Review the Nextas contract for Sara', originale.id)])
    const v = store.elencoFeed()[0]
    store.cambiaStatoFeed(v.id, stato)
    store.default.prepare('UPDATE feed SET risposto = ? WHERE id = ?').run('2020-01-01T00:00:00Z', v.id)
    assert.ok(store.docsSulFeed([originale.id]).has(originale.id))
    store.scordaDocumenti([originale.id])
    store.chiudiIndici()
    const copia = { ...originale, id: 'posta:Archive:77', quando: new Date().toISOString() }
    store.salvaDocumenti([copia])
    assert.ok(store.docsIgnoratiDalFeed([copia]).has(copia.id), stato)
    assert.equal(store.salvaFeed([voce('Confirm the proposal terms with Sara', copia.id)]), 0)
  }
})

test('done and deleted tasks retain their source feedback permanently', () => {
  for (const gesto of ['fatto', 'lasciato', 'elimina']) {
    store.azzeraTutto()
    const originale = doc('posta:INBOX:601', 'Nextas contract', { messageId: 'task-message', corpo: 'Could you review the Nextas contract and confirm your approval?' })
    store.salvaDocumenti([originale])
    store.scriviCompito({ id: 'task-feedback', testo: 'Review the Nextas contract', ordine: 'a', origine: 'punto', doc: originale.id })
    if (gesto === 'elimina') store.scordaCompito('task-feedback')
    else store.cambiaStatoCompito('task-feedback', gesto)
    store.default.prepare('UPDATE compiti SET chiuso = ?, aggiornato = ?, sparito = CASE WHEN sparito IS NULL THEN NULL ELSE ? END WHERE id = ?')
      .run('2020-01-01', '2020-01-01', '2020-01-01', 'task-feedback')
    store.scordaDocumenti([originale.id])
    const copia = { ...originale, id: 'posta:Archive:601' }
    store.salvaDocumenti([copia])
    assert.ok(store.docsIgnoratiDalFeed([copia]).has(copia.id), gesto)
    assert.equal(store.salvaFeed([voce('Sara is waiting for the contract decision', copia.id)]), 0)
  }
})

test('feedback is scoped: new work from the same person is not silenced, and Undo withdraws learning', () => {
  store.azzeraTutto()
  const precedente = doc('posta:INBOX:701', 'Contract review', { filo: 'same-thread', corpo: 'Could you review the Nextas contract for our seed investment?' })
  const nuova = doc('posta:INBOX:702', 'Contract review', { filo: 'same-thread', corpo: 'Could you review the supplier agreement for the website redesign?' })
  store.salvaDocumenti([precedente, nuova])
  store.salvaFeed([voce('Review the contract for Rossi', precedente.id)])
  const prima = store.elencoFeed()[0]
  store.cambiaStatoFeed(prima.id, 'scartato')
  assert.ok(!store.docsIgnoratiDalFeed([nuova]).has(nuova.id))
  assert.equal(store.salvaFeed([voce('Review the contract for Rossi', nuova.id)]), 1, 'identical action labels do not erase distinct source requests')
  store.cambiaStatoFeed(prima.id, 'aperto')
  assert.ok(!store.docsIgnoratiDalFeed([precedente]).has(precedente.id), 'Undo must undo source-level learning too')
})

test('already answered email is not resurfaced as needing a reply', async () => {
  store.azzeraTutto()
  store.salvaDocumenti([
    doc('posta:INBOX:801', 'Contract question', { filo: 'answered-thread', quando: new Date(Date.now() - 7_200_000).toISOString() }),
    doc('posta:SENT:802', 'Re: Contract question', { filo: 'answered-thread', inviato: true, quando: new Date(Date.now() - 3_600_000).toISOString() })
  ])
  const richieste = fornitoreFinto([])
  assert.deepEqual(await claude.generaFeed(), [])
  assert.equal(richieste.length, 0)
})

test('model output cannot attach a vague or fabricated action to a real source', async () => {
  store.azzeraTutto()
  const d = doc('posta:INBOX:901', 'Nextas approval', { corpo: 'Could you review the Nextas contract and confirm your approval?' })
  store.salvaDocumenti([d])
  const valida = { tipo: 'Da decidere', titolo: 'Review the Nextas contract', testo: 'Rossi asks you to review the Nextas contract and confirm your approval.', urgenza: 'no rush', fonte: 'made-up-source', doc: d.id, perche: 'Rossi is waiting for your approval.', prova: d.corpo }
  fornitoreFinto([
    null, {}, { ...valida, doc: 'nonexistent-source' }, { ...valida, testo: 'Random gibberish' },
    { ...valida, titolo: 'Update the Nextas repository' }, { ...valida, prova: 'Please send a payment today.' },
    { ...valida, urgenza: 'by tomorrow' }, valida, { ...valida, titolo: 'Reply to Rossi about Nextas' }
  ] as object[], 'en')
  const voci = await claude.generaFeed()
  assert.equal(voci.length, 1)
  assert.equal(voci[0].doc, d.id)
  assert.equal(voci[0].fonte, 'posta', 'source provenance comes from the indexed source, not the model')
})

test('a task created while the model is answering prevents a duplicate feed card at save time', async () => {
  store.azzeraTutto()
  const d = doc('posta:INBOX:950', 'Nextas review', { corpo: 'Could you review the Nextas contract and confirm your approval?' })
  store.salvaDocumenti([d])
  fornitoreFinto([{ tipo: 'Da decidere', titolo: 'Review the Nextas contract', testo: 'Rossi asks you to review the Nextas contract and confirm your approval.', urgenza: 'no rush', fonte: 'posta', doc: d.id, perche: 'Rossi is waiting for your approval.', prova: d.corpo }], 'en')
  const voci = await claude.generaFeed()
  assert.equal(voci.length, 1)
  store.scriviCompito({ id: 'race-task', testo: 'Review the Nextas contract', ordine: 'a', origine: 'punto', doc: d.id })
  assert.equal(store.salvaFeed(voci), 0)
  assert.equal(store.elencoFeed().length, 0)
})

// — Jev davanti alla lettura —
//
// La lettura costa, e i trenta posti erano dati per data. Qui si guarda
// l'unica cosa che conta di questo cambiamento: *cosa arriva al modello*.

/** Jev finto: risponde guardando il titolo del documento. */
function jevFinto(quanto: (titolo: string) => { chiede: number; urgenza: number; genere: string }) {
  cfg.aggiorna({ jev: { apiKey: 'apikey_prova' } })
  giudizi.scorda()
  jev.dimentica()
  jev.perProva(async (_u, opz) => {
    const stato = JSON.parse(String((opz as RequestInit).body)).state as { documento: { titolo: string } }
    const v = quanto(stato.documento.titolo)
    return Response.json({ answers: {
      chiede: { type: 'noul', noul: v.chiede },
      urgenza: { type: 'score', score: v.urgenza, confidence: 0.9, probabilities: {}, legend: {} },
      genere: { type: 'choice', choice: v.genere, confidence: 0.8, probabilities: { [v.genere]: 0.8 } }
    } })
  })
}

test('Jev toglie dalla lettura quello che non aspetta nessuno, e mette davanti chi aspetta', async () => {
  store.azzeraTutto()
  store.salvaDocumenti([
    doc('posta:INBOX:700', 'Grazie', { corpo: 'Grazie mille, ho ricevuto tutto. Non serve altro.' }),
    doc('posta:INBOX:701', 'Contratto', { corpo: 'Puoi firmare il contratto? Siamo fermi senza.' })
  ])
  const ricevute = fornitoreFinto([])
  jevFinto(t => t === 'Grazie'
    ? { chiede: 0.03, urgenza: 0.1, genere: 'aggiornamento' }
    : { chiede: 0.97, urgenza: 2.8, genere: 'richiesta' })
  try {
    await claude.generaFeed()
    const mandato = testoDi(ricevute[0])
    assert.match(mandato, /id: posta:INBOX:701/)
    assert.doesNotMatch(mandato, /id: posta:INBOX:700/, 'un «grazie, ricevuto» è arrivato al modello')
  } finally { jev.perProva(null); giudizi.scorda() }
})

test('e senza Jev la lettura riceve quello che riceveva prima', async () => {
  store.azzeraTutto()
  store.salvaDocumenti([
    doc('posta:INBOX:710', 'Grazie', { corpo: 'Grazie mille, ho ricevuto tutto. Non serve altro.' }),
    doc('posta:INBOX:711', 'Contratto', { corpo: 'Puoi firmare il contratto? Siamo fermi senza.' })
  ])
  const ricevute = fornitoreFinto([])
  // la chiave sta fra i campi con un segreto: una scrittura qualunque non la
  // porta via, e per toglierla ci vuole quello che fa «Scollega»
  const senzaChiave = cfg.leggi()
  delete senzaChiave.jev
  cfg.scrivi(senzaChiave, { togli: ['jev'] })
  giudizi.scorda()
  let chiamate = 0
  jev.perProva(async () => { chiamate++; return Response.json({}) })
  try {
    await claude.generaFeed()
    assert.equal(chiamate, 0, 'senza chiave non si chiama TypeSafe')
    const mandato = testoDi(ricevute[0])
    assert.match(mandato, /id: posta:INBOX:710/)
    assert.match(mandato, /id: posta:INBOX:711/)
  } finally { jev.perProva(null) }
})

test('la lettura non ripropone una cosa che è già sul feed con altre parole', async () => {
  store.azzeraTutto()
  // la carta di ieri, nata da una mail; oggi ne arriva un'altra che dice la stessa cosa
  store.salvaDocumenti([
    doc('posta:INBOX:800', 'Riscontro di papà', { corpo: 'Puoi rispondere al riscontro di papà su Myynd?' }),
    doc('posta:INBOX:801', 'Risposta di papà', { corpo: 'Puoi rispondere alla risposta di papà su Myynd?' })
  ])
  store.salvaFeed([voce('Rispondere a papà sul riscontro di Myynd', 'posta:INBOX:800')])
  const ricevute = fornitoreFinto([
    { tipo: 'Da decidere', titolo: 'Rispondere a papà sulla risposta di Myynd', testo: 'Papà aspetta una risposta sul suo riscontro a Myynd.', urgenza: 'nessuna fretta', fonte: 'posta', doc: 'posta:INBOX:801', perche: 'Papà aspetta una tua risposta.', prova: 'Puoi rispondere alla risposta di papà su Myynd?' }
  ])
  cfg.aggiorna({ jev: { apiKey: 'apikey_prova' } })
  giudizi.scorda(); jev.dimentica()
  jev.perProva(async (_u, opz) => {
    const corpo = JSON.parse(String((opz as RequestInit).body))
    // la porta d'ingresso dice sì; il controllo sui doppioni dice «è la stessa»
    if (corpo.questions.chiede) return Response.json({ answers: {
      chiede: { type: 'noul', noul: 0.9 },
      urgenza: { type: 'score', score: 2, confidence: 0.9, probabilities: {}, legend: {} },
      genere: { type: 'choice', choice: 'richiesta', confidence: 0.9, probabilities: { richiesta: 0.9 } }
    } })
    return Response.json({ answers: { doppione: { type: 'choice', choice: 'c0', confidence: 0.8, probabilities: { c0: 0.8, nessuno: 0.2 } } } })
  })
  try {
    const voci = await claude.generaFeed()
    assert.equal(ricevute.length, 1, 'il modello è stato chiamato: il doppione si scopre dopo')
    assert.deepEqual(voci, [], 'la voce doppia è arrivata fino al feed')
  } finally { jev.perProva(null); giudizi.scorda() }
})
