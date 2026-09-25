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
const feedDati = await import('./feed-dati.ts')
const rifinitura = await import('./rifinitura.ts')
const misuraFeed = await import('./misura-feed.ts')
await misuraFeed.caricaModuli()

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

/** Una voce valida per la Cosa i: la prova è nel documento, il perché regge sul documento. */
const vociValide = (quante: number, da = 60) => Array.from({ length: quante }, (_, i) =>
  ({ tipo: 'Da decidere', titolo: `Conferma a Rossi i dettagli di Cosa ${i}`, testo: `Rossi chiede di confermare i dettagli di Cosa ${i}.`, urgenza: 'nessuna fretta', fonte: 'posta', doc: `posta:INBOX:${da + i}`, perche: 'Rossi aspetta una risposta sui dettagli.', prova: `Puoi confermare i dettagli di Cosa ${i}?` }))
/** Il messaggio di sistema mandato al modello: dove starebbe scritto un numero di carte. */
const sistemaDi = (r: Record<string, unknown>) =>
  (r.messages as { role: string; content: string }[]).filter(m => m.role === 'system').map(m => m.content).join('\n')

test('nessun numero: dodici voci valide passano tutte, sedici si fermano a quindici, zero va bene; il prompt e lo schema non dicono un numero', async () => {
  store.azzeraTutto()
  store.salvaDocumenti(Array.from({ length: 16 }, (_, i) => doc(`posta:INBOX:${60 + i}`, `Cosa ${i}`)))
  let ricevute = fornitoreFinto(vociValide(12))
  assert.equal((await claude.generaFeed()).length, 12, 'dodici voci buone sono dodici carte: nessun tetto le taglia')
  // il parapetto, nel codice e basta: un fornitore impazzito non riempie la pagina
  // (l'esame di prima si azzera: i documenti «letti senza carta» non si rimandano per un giorno)
  store.default.prepare('DELETE FROM feed_esame').run()
  ricevute = fornitoreFinto(vociValide(16))
  assert.equal((await claude.generaFeed()).length, claude.VOCI_PER_LETTURA)
  assert.equal(claude.VOCI_PER_LETTURA, 15)
  ricevute = fornitoreFinto([])
  assert.deepEqual(await claude.generaFeed(), [], 'zero è una risposta giusta')
  // il tetto NON sta nello schema: l'API di Claude rifiuta «maxItems» e con
  // lui l'intera lettura — è successo davvero, alle tre di notte, in silenzio
  const voce = (ricevute[0].response_format as { json_schema: { schema: { properties: { voci: Record<string, unknown> } } } })
    .json_schema.schema.properties.voci
  assert.ok(!('maxItems' in voce), 'maxItems nello schema: Claude lo rifiuta')
  const numero = /\b5\b|\b15\b|cinque|quindici|al massimo \d+ (?:voci|cose)/
  assert.doesNotMatch(String(voce.description), numero, 'lo schema dice un numero di carte')
  assert.match(String(voce.description), /asticella/)
  const sistema = sistemaDi(ricevute[0])
  assert.doesNotMatch(sistema, numero, 'il prompt dice un numero di carte')
  assert.match(sistema, /passano l'asticella/)
  assert.match(sistema, /zero è una risposta giusta/i)
  assert.match(sistema, /Nel dubbio, fuori\./)
  // le uniche cifre del prompt sono negli esempi citati
  const cifre = [...sistema.matchAll(/\d+/g)].map(m => m[0])
  // 9:30, 3 ottobre, venerdì 26, «September 20», «da 12 a 500»: tutte dentro esempi citati
  assert.deepEqual([...new Set(cifre)].sort(), ['12', '20', '26', '3', '30', '500', '9'].sort(), `cifre nel prompt: ${cifre.join(', ')}`)
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
    { tipo: 'Da decidere', titolo: 'Conferma a Bianchi il round seed', testo: 'Bianchi chiede la conferma del round seed di Nextas per martedì.', urgenza: 'entro martedì', fonte: 'posta', doc: 'posta:INBOX:81', perche: ' Bianchi aspetta la conferma del round per martedì. ', prova: 'Puoi confermare il round seed di Nextas per martedì?' }
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
  assert.match(mandato, /il «perché oggi»: una riga di al massimo dodici parole presa da questo documento/)

  // e quello che torna lo porta, pulito, fino al feed
  assert.equal(voci[0].perche, 'Bianchi aspetta la conferma del round per martedì.')
  assert.equal(store.salvaFeed(voci), 1)
  const [aperta] = store.elencoFeed('aperto')
  assert.equal(aperta.perche, 'Bianchi aspetta la conferma del round per martedì.')
  // una rilettura senza perché non cancella quello che c'era
  store.salvaFeed([{ ...voci[0], perche: '' }])
  assert.equal(store.elencoFeed('aperto')[0].perche, 'Bianchi aspetta la conferma del round per martedì.')
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

test('più di venti aperte: le più leggere scadono con ragione tetto; esattamente venti, nessuna', () => {
  store.azzeraTutto()
  // venti carte pesanti, nate ieri: tutte restano
  assert.equal(store.salvaFeed(vociCon(100, 20).map(v => ({ ...v, peso: 2 }))), 20)
  for (const v of store.elencoFeed('aperto')) spostaQuando(v.id, 1)
  assert.equal(store.elencoFeed('aperto').length, 20, 'venti è il parapetto, non un motivo per scadere')
  assert.equal(store.elencoFeed('scaduto').length, 0)
  // due in più, una leggera e una pesante: esce la leggera, non la più vecchia
  const [leggera, pesante] = vociCon(200, 2)
  assert.equal(store.salvaFeed([{ ...leggera, peso: 0.5 }, { ...pesante, peso: 2.5 }]), 2)
  const aperte = store.elencoFeed('aperto')
  assert.equal(aperte.length, 20, 'il feed è cresciuto oltre le venti')
  assert.ok(aperte.some(v => v.doc === pesante.doc), 'la carta pesante è uscita')
  assert.ok(!aperte.some(v => v.doc === leggera.doc), 'la carta leggera è rimasta')
  const scadute = store.elencoFeed('scaduto')
  assert.equal(scadute.length, 2)
  assert.ok(scadute.every(v => v.ragione === 'tetto'), `ragioni: ${scadute.map(v => v.ragione).join(', ')}`)
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
  perche: 'Rossi aspetta la conferma dei dettagli.', prova: 'Puoi confermare i dettagli di Preventivo Rossi?'
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

test('Jev mette in fondo quello che non aspetta nessuno, ma non lo toglie', async () => {
  store.azzeraTutto()
  store.salvaDocumenti([
    doc('posta:INBOX:700', 'Grazie', { corpo: 'Grazie mille, ho ricevuto tutto. Non serve altro.', quando: new Date(Date.now() - 1_800_000).toISOString() }),
    doc('posta:INBOX:701', 'Contratto', { corpo: 'Puoi firmare il contratto? Siamo fermi senza.' })
  ])
  const ricevute = fornitoreFinto([])
  jevFinto(t => t === 'Grazie'
    ? { chiede: 0.03, urgenza: 0.1, genere: 'aggiornamento' }
    : { chiede: 0.97, urgenza: 2.8, genere: 'richiesta' })
  try {
    await claude.generaFeed()
    const mandato = testoDi(ricevute[0])
    const ordine = [...mandato.matchAll(/^id: (\S+)/gm)].map(m => m[1])
    assert.deepEqual(ordine, ['posta:INBOX:701', 'posta:INBOX:700'], 'chi aspetta passa davanti, chi non aspetta resta in coda: Jev ordina, non toglie')
  } finally { jev.perProva(null); giudizi.scorda() }
})

test('cinque candidati, uno a chiede 0.1: arrivano tutti e cinque al modello', async () => {
  store.azzeraTutto()
  store.salvaDocumenti(Array.from({ length: 5 }, (_, i) => doc(`posta:INBOX:${720 + i}`, `Cosa ${i}`)))
  const ricevute = fornitoreFinto([])
  jevFinto(t => t === 'Cosa 2' ? { chiede: 0.1, urgenza: 0.2, genere: 'rumore' } : { chiede: 0.8, urgenza: 2, genere: 'richiesta' })
  try {
    await claude.generaFeed()
    const ordine = [...testoDi(ricevute[0]).matchAll(/^id: (\S+)/gm)].map(m => m[1])
    assert.equal(ordine.length, 5)
    assert.equal(ordine.at(-1), 'posta:INBOX:722', 'quello a chiede 0.1 sta in fondo, non fuori')
  } finally { jev.perProva(null); giudizi.scorda() }
})

test('quaranta candidati: i bassi sono i tagliati, segnati «posti»', async () => {
  store.azzeraTutto()
  store.salvaDocumenti(Array.from({ length: 40 }, (_, i) => doc(`posta:INBOX:${800 + i}`, `Cosa ${i}`)))
  const ricevute = fornitoreFinto([])
  // dieci bassi: Cosa 0 … Cosa 9
  jevFinto(t => Number(t.slice(5)) < 10 ? { chiede: 0.05, urgenza: 0.1, genere: 'rumore' } : { chiede: 0.8, urgenza: 2, genere: 'richiesta' })
  try {
    await claude.generaFeed()
    const ordine = [...testoDi(ricevute[0]).matchAll(/^id: (\S+)/gm)].map(m => m[1])
    assert.equal(ordine.length, 30, 'i trenta posti tagliano')
    for (let i = 0; i < 10; i++) assert.ok(!ordine.includes(`posta:INBOX:${800 + i}`), `Cosa ${i} (bassa) è entrata nei trenta`)
    const esami = feedDati.esameDi(Array.from({ length: 40 }, (_, i) => `posta:INBOX:${800 + i}`))
    for (let i = 0; i < 10; i++) assert.equal(esami.get(`posta:INBOX:${800 + i}`)?.fase, 'posti')
    for (let i = 10; i < 40; i++) assert.equal(esami.get(`posta:INBOX:${800 + i}`)?.fase, 'modello')
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

// — P2 · la lettura con l'asticella —
//
// Il perché oggi si controlla dove la carta nasce; «domani» diventa il giorno
// che voleva dire; una data passata non nasce; ogni documento del giro lascia
// una riga in `feed_esame`; quello che il modello ha già detto no non si
// rimanda per un giorno; e le sue ragioni cambiano la lettura dopo.

const fraOre = (ore: number) => new Date(Date.now() - ore * 3_600_000).toISOString()
const GIORNI_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MESI_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

test('«tomorrow» nel testo di una carta diventa il giorno che voleva dire nella mail, e la pillola si salva assoluta', async () => {
  store.azzeraTutto()
  const d = doc('posta:INBOX:1001', 'Review call', { corpo: 'Can you join the review call tomorrow at 9:30? We need your yes on the course price.', autore: 'Sam Ortiz <sam@lumen.example>', quando: fraOre(1) })
  store.salvaDocumenti([d])
  fornitoreFinto([{ tipo: 'Da decidere', titolo: 'Reply to Sam about the course price', testo: 'Sam needs your yes on the course price tomorrow.', urgenza: 'tomorrow 9:30', fonte: 'posta', doc: d.id, perche: 'Sam waits for your yes on the course price.', prova: 'Can you join the review call tomorrow at 9:30?' }], 'en')
  const voci = await claude.generaFeed()
  assert.equal(voci.length, 1)
  const domani = new Date(Date.now() + 86_400_000)
  assert.equal(voci[0].testo, `Sam needs your yes on the course price ${GIORNI_EN[domani.getDay()]}.`)
  assert.doesNotMatch(`${voci[0].titolo} ${voci[0].testo} ${voci[0].perche}`, /\btomorrow\b/i)
  assert.equal(voci[0].urgenza, `${MESI_EN[domani.getMonth()]} ${domani.getDate()} 9:30`, 'la pillola si salva assoluta, non «tomorrow»')
  assert.equal(voci[0].nata, d.quando)
  // e la carta salvata passa ancora il filtro della pagina, che legge il giorno dalla mail
  store.salvaFeed(voci)
  const { feedAttuale } = await import('./attenzione.ts')
  const [in_pagina] = feedAttuale()
  assert.ok(in_pagina, 'la carta con il giorno sciolto non passa il filtro della pagina')
  assert.equal(in_pagina.urgenza, 'Tomorrow 9:30', 'la pagina legge la pillola relativa a oggi')
})

test('un perché che parla del progetto, uno con un numero inventato, e una data già passata non nascono, e l’esame dice perché', async () => {
  store.azzeraTutto()
  const ieri = new Date(Date.now() - 86_400_000)
  const d1 = doc('posta:INBOX:1011', 'Northwind scope', { corpo: 'Can you confirm the pilot scope? We start with supplier invoices.', autore: 'Nora <nora@harbor.example>', quando: fraOre(2) })
  const d2 = doc('posta:INBOX:1012', 'Invoice', { corpo: 'Can you approve the invoice for the design work?', autore: 'Tom <tom@brightline.example>', quando: fraOre(3) })
  const d3 = doc('posta:INBOX:1013', 'Report', { corpo: 'Can you send the report to Rossi?', autore: 'Ana <ana@harbor.example>', quando: fraOre(48) })
  store.salvaDocumenti([d1, d2, d3])
  fornitoreFinto([
    { tipo: 'Da decidere', titolo: 'Confirm the pilot scope with Nora', testo: 'Nora asks you to confirm the pilot scope.', urgenza: 'no rush', fonte: 'posta', doc: d1.id, perche: 'Matters for the Northwind project.', prova: 'Can you confirm the pilot scope?' },
    { tipo: 'Da decidere', titolo: 'Approve the design invoice for Tom', testo: 'Tom asks you to approve the invoice for the design work.', urgenza: 'no rush', fonte: 'posta', doc: d2.id, perche: 'Tom waits for the 2231 invoice approval.', prova: 'Can you approve the invoice for the design work?' },
    { tipo: 'Da decidere', titolo: 'Send the report to Rossi for Ana', testo: 'Ana asks you to send the report to Rossi.', urgenza: `by ${MESI_EN[ieri.getMonth()]} ${ieri.getDate()}`, fonte: 'posta', doc: d3.id, perche: 'Ana waits for the report for Rossi.', prova: 'Can you send the report to Rossi?' }
  ], 'en')
  assert.deepEqual(await claude.generaFeed(), [])
  const esami = feedDati.esameDi([d1.id, d2.id, d3.id])
  assert.deepEqual([esami.get(d1.id)?.fase, esami.get(d1.id)?.motivo], ['verifica', 'perche:obiettivo'])
  assert.deepEqual([esami.get(d2.id)?.fase, esami.get(d2.id)?.motivo], ['verifica', 'perche:numero'])
  assert.deepEqual([esami.get(d3.id)?.fase, esami.get(d3.id)?.motivo], ['verifica', 'data_passata'])
})

test('ogni documento del giro lascia una riga nell’esame: regole, già sul feed, letto senza carta, carta', async () => {
  store.azzeraTutto()
  const a = doc('posta:INBOX:1021', 'Contract', { corpo: 'Can you sign the contract for the new office?', autore: 'Lea <lea@ex.example>', quando: fraOre(1) })
  const b = doc('posta:INBOX:1022', 'Lunch', { corpo: 'Can you tell me if Friday works for lunch?', autore: 'Ugo <ugo@ex.example>', quando: fraOre(2) })
  const c = doc('posta:INBOX:1023', 'Deals', { corpo: 'Unsubscribe here. Shop now.', autore: 'Shop <promo@shop.example>', massa: true, quando: fraOre(1) })
  const e = doc('posta:INBOX:1024', 'Already carded', { corpo: 'Can you review the deck before the call?', autore: 'Ida <ida@ex.example>', quando: fraOre(3) })
  store.salvaDocumenti([a, b, c, e])
  store.salvaFeed([voce('Review the deck for Ida', e.id)])
  fornitoreFinto([{ tipo: 'Da decidere', titolo: 'Sign the office contract for Lea', testo: 'Lea asks you to sign the contract for the new office.', urgenza: 'no rush', fonte: 'posta', doc: a.id, perche: 'Lea waits for the signed contract.', prova: 'Can you sign the contract for the new office?' }], 'en')
  const voci = await claude.generaFeed()
  assert.equal(voci.length, 1)
  const esami = feedDati.esameDi([a.id, b.id, c.id, e.id])
  assert.equal(esami.get(a.id)?.fase, 'carta')
  assert.equal(esami.get(b.id)?.fase, 'modello')
  assert.deepEqual([esami.get(c.id)?.fase, esami.get(c.id)?.motivo], ['regole', 'posta_in_serie'])
  assert.equal(esami.get(e.id)?.fase, 'gia')
})

test('quello che il modello ha già detto no non si rimanda per un giorno, ma sì se è appena arrivato o è cambiato', async () => {
  store.azzeraTutto()
  const x = doc('posta:INBOX:1031', 'Question', { corpo: 'Can you tell me which day works for the visit?', autore: 'Pia <pia@ex.example>', quando: fraOre(1) })
  store.salvaDocumenti([x])
  let ricevute = fornitoreFinto([], 'en')
  await claude.generaFeed()
  assert.equal(ricevute.length, 1)
  assert.equal(feedDati.esameDi([x.id]).get(x.id)?.fase, 'modello')
  // la seconda lettura, un attimo dopo: niente da mandare, nessuna chiamata
  ricevute = fornitoreFinto([], 'en')
  await claude.generaFeed()
  assert.equal(ricevute.length, 0, 'un documento già letto e detto no è stato rimandato al modello')
  // ma se è fra i nuovi si rimanda
  ricevute = fornitoreFinto([], 'en')
  await claude.generaFeed([x])
  assert.equal(ricevute.length, 1)
  // e se è cambiato da allora si rimanda
  await new Promise(r => setTimeout(r, 5))
  store.salvaDocumenti([{ ...x, corpo: 'Can you tell me which day works for the visit? Tuesday would be best for us.' }])
  ricevute = fornitoreFinto([], 'en')
  await claude.generaFeed()
  assert.equal(ricevute.length, 1, 'un documento cambiato non è stato riletto')
})

/** Una carta chiusa con una ragione, nata da un documento: quello che insegna a feed-impara. */
const chiusa = (id: string, ragione: 'fatta' | 'non_mia' | 'vecchia' | 'non_chiara', titolo: string, perche = 'Chi aspetta e da quando.') => {
  store.salvaFeed([{ ...voce(titolo, id), perche }])
  const v = store.elencoFeed('aperto').find(x => x.doc === id)!
  store.cambiaStatoFeed(v.id, 'scartato', 'prova', ragione)
}

test('«già fatta» da un mittente: la sua mail dopo non entra se lui gli ha già scritto; senza la mail mandata entra; senza la ragione entra', async () => {
  store.azzeraTutto()
  const vecchia = doc('posta:INBOX:1041', 'Fattura marzo', { autore: 'Xavier <x@ex.it>', quando: fraOre(72) })
  const nuova = doc('posta:INBOX:1042', 'Preventivo aprile', { autore: 'Xavier <x@ex.it>', quando: fraOre(2), corpo: 'Puoi confermare il preventivo di aprile?' })
  const altra = doc('posta:INBOX:1043', 'Contratto', { autore: 'Yara <y@ex.it>', quando: fraOre(2), corpo: 'Puoi firmare il contratto?' })
  store.salvaDocumenti([vecchia, nuova, altra])
  chiusa(vecchia.id, 'fatta', 'Paga la fattura di marzo a Xavier')
  // senza una mail mandata a Xavier dopo: la nuova entra
  let ricevute = fornitoreFinto([])
  await claude.generaFeed()
  assert.match(testoDi(ricevute[0]), /id: posta:INBOX:1042/)
  // con una mail mandata a lui dopo la sua: la nuova è già risposta (l'esame
  // di prima si azzera, o «letto senza carta» la terrebbe fuori per un giorno)
  store.default.prepare('DELETE FROM feed_esame').run()
  store.salvaDocumenti([doc('posta:Sent:1044', 'Re: preventivo', { inviato: true, destinatari: 'x@ex.it', filo: 'altro-filo', quando: fraOre(1), autore: 'Io <io@ex.it>' })])
  ricevute = fornitoreFinto([])
  await claude.generaFeed()
  assert.doesNotMatch(testoDi(ricevute[0]), /id: posta:INBOX:1042/, 'una richiesta a cui ha già risposto per posta è arrivata al modello')
  assert.equal(feedDati.esameDi([nuova.id]).get(nuova.id)?.fase, 'gia_risposto')
  // Yara: una mail mandata a lei, ma nessuna «già fatta» da lei: la sua entra
  store.default.prepare('DELETE FROM feed_esame').run()
  store.salvaDocumenti([doc('posta:Sent:1045', 'Re: ciao', { inviato: true, destinatari: 'y@ex.it', filo: 'altro-filo-2', quando: fraOre(1), autore: 'Io <io@ex.it>' })])
  ricevute = fornitoreFinto([])
  await claude.generaFeed()
  assert.match(testoDi(ricevute[0]), /id: posta:INBOX:1043/)
})

test('«non è mia» due volte da una persona: la sua posta entra solo se chiede qualcosa, e il modello lo sa', async () => {
  store.azzeraTutto()
  const y1 = doc('posta:INBOX:1051', 'Verbale riunione', { autore: 'Yara <y@ex.it>', quando: fraOre(72) })
  const y2 = doc('posta:INBOX:1052', 'Agenda trimestre', { autore: 'Yara <y@ex.it>', quando: fraOre(60) })
  const senza = doc('posta:INBOX:1053', 'Report allegato', { autore: 'Yara <y@ex.it>', quando: fraOre(2), corpo: 'Il report del mese in allegato, per conoscenza.' })
  const con = doc('posta:INBOX:1054', 'Data della visita', { autore: 'Yara <y@ex.it>', quando: fraOre(1), corpo: 'Puoi confermare la data della visita?' })
  store.salvaDocumenti([y1, y2, senza, con])
  chiusa(y1.id, 'non_mia', 'Leggi il verbale della riunione')
  chiusa(y2.id, 'non_mia', 'Guarda l’agenda del trimestre')
  const ricevute = fornitoreFinto([])
  await claude.generaFeed()
  const mandato = testoDi(ricevute[0])
  assert.doesNotMatch(mandato, /id: posta:INBOX:1053/, 'una mail senza richiesta di una persona «non sua» è arrivata al modello')
  assert.match(mandato, /id: posta:INBOX:1054/, 'una richiesta diretta della stessa persona è stata tolta')
  assert.match(sistemaDi(ricevute[0]), /La posta di queste persone di solito non è per lei, salvo una richiesta diretta: y@ex\.it/)
  assert.equal(feedDati.esameDi([senza.id]).get(senza.id)?.fase, 'non_suo')
})

test('a chi ha risposto da solo senza che il feed glielo mostrasse: i suoi documenti passano davanti, e il modello lo sa', async () => {
  store.azzeraTutto()
  const w = doc('posta:INBOX:1061', 'Cosa di W', { autore: 'Wanda <w@ex.it>', quando: fraOre(1) })
  const z = doc('posta:INBOX:1062', 'Cosa di Z', { autore: 'Zeno <z@ex.it>', quando: fraOre(2) })
  store.salvaDocumenti([w, z])
  store.default.prepare('INSERT INTO mancate (id, genere, doc, prova, mittente, progetto, fase, motivo, certezza, arrivato, agito, contesto, quando) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run('m1', 'risposta', 'posta:INBOX:9', 'Puoi?', 'z@ex.it', null, 'ignoto', null, 'id', fraOre(48), fraOre(24), '{}', fraOre(24))
  const ricevute = fornitoreFinto([])
  await claude.generaFeed()
  const ordine = [...testoDi(ricevute[0]).matchAll(/^id: (\S+)/gm)].map(m => m[1])
  assert.deepEqual(ordine, ['posta:INBOX:1062', 'posta:INBOX:1061'], 'Zeno, a cui ha risposto da solo, non è passato davanti')
  assert.match(sistemaDi(ricevute[0]), /A queste persone ha risposto da sola senza che il feed gliele mostrasse[^\n]*z@ex\.it/)
})

test('«vecchia» due volte da una fonte: quello che è più vecchio della mediana va in coda, e il modello legge gli esempi', async () => {
  store.azzeraTutto()
  progetti.scrivi({ nome: 'Nextas', obiettivo: 'Chiudere il round seed con Bianchi entro ottobre' })
  const v1 = doc('posta:INBOX:1071', 'Newsletter vecchia', { autore: 'Vito <v@ex.it>', quando: fraOre(20 * 24) })
  const v2 = doc('posta:INBOX:1072', 'Altra cosa vecchia', { autore: 'Vito <v@ex.it>', quando: fraOre(30 * 24) })
  store.salvaDocumenti([v1, v2])
  chiusa(v1.id, 'vecchia', 'Leggi la newsletter di Vito')
  chiusa(v2.id, 'vecchia', 'Guarda l’altra cosa di Vito')
  // il documento sul progetto ha 28 giorni: senza la regola passerebbe davanti
  const p = doc('posta:INBOX:1073', 'Re: seed', { autore: 'Bianchi <bianchi@fondo.it>', corpo: 'Puoi confermare il round seed di Nextas?', quando: fraOre(28 * 24) })
  const q = doc('posta:INBOX:1074', 'Caffè', { autore: 'Quinto <q@ex.it>', corpo: 'Puoi confermare per il caffè?', quando: fraOre(1) })
  store.salvaDocumenti([p, q])
  const ricevute = fornitoreFinto([])
  await claude.generaFeed()
  const ordine = [...testoDi(ricevute[0]).matchAll(/^id: (\S+)/gm)].map(m => m[1])
  assert.deepEqual(ordine, ['posta:INBOX:1074', 'posta:INBOX:1073'], 'il documento più vecchio di quello che scarta come vecchio è passato davanti')
  assert.match(sistemaDi(ricevute[0]), /Queste le ha scartate perché vecchie[\s\S]*«Leggi la newsletter di Vito» \(posta, 20 giorni\)/)
})

test('«non si capisce»: gli esempi arrivano alla lettura e alla riscrittura, e la soglia di chiarezza sale', async () => {
  store.azzeraTutto()
  const o1 = doc('posta:INBOX:1081', 'Cosa uno', { autore: 'Olga <o@ex.it>', quando: fraOre(72) })
  const o2 = doc('posta:INBOX:1082', 'Cosa due', { autore: 'Olga <o@ex.it>', quando: fraOre(60) })
  const n = doc('posta:INBOX:1083', 'Contratto Bianchi', { autore: 'Nino <n@ex.it>', corpo: 'Puoi firmare il contratto di Bianchi?', quando: fraOre(1) })
  store.salvaDocumenti([o1, o2, n])
  chiusa(o1.id, 'non_chiara', 'Verifica la lane di posizionamento', 'Sblocca la corsia autorizzata.')
  chiusa(o2.id, 'non_chiara', 'Allinea gli stakeholder sulla rubrica', 'Muove la gerarchia.')
  const ricevute = fornitoreFinto([{ tipo: 'Da decidere', titolo: 'Firma il contratto di Bianchi', testo: 'Nino chiede la firma del contratto di Bianchi.', urgenza: 'nessuna fretta', fonte: 'posta', doc: n.id, perche: 'Nino aspetta la firma del contratto.', prova: 'Puoi firmare il contratto di Bianchi?' }])
  // Jev: la carta è chiara a 0.6, che passa la soglia di sempre (0.55) ma non quella alzata da due «non si capisce» (0.65)
  cfg.aggiorna({ jev: { apiKey: 'apikey_prova' } })
  giudizi.scorda(); jev.dimentica()
  jev.perProva(async (_u, opz) => {
    const corpo = JSON.parse(String((opz as RequestInit).body)) as { questions: Record<string, unknown> }
    if (corpo.questions.chiede) return Response.json({ answers: { chiede: { type: 'noul', noul: 0.9 }, urgenza: { type: 'score', score: 2, confidence: 0.9, probabilities: {}, legend: {} }, genere: { type: 'choice', choice: 'richiesta', confidence: 0.9, probabilities: { richiesta: 0.9 } }, peso: { type: 'score', score: 2, confidence: 0.9, probabilities: {}, legend: {} } } })
    if (corpo.questions.chiara) return Response.json({ answers: { chiara: { type: 'noul', noul: 0.6 }, peso: { type: 'score', score: 2, confidence: 0.9, probabilities: {}, legend: {} } } })
    return Response.json({ answers: { doppione: { type: 'choice', choice: 'nessuno', confidence: 0.9, probabilities: { nessuno: 0.9 } } } })
  })
  const sistemi: string[] = []
  rifinitura.perProva({ collegato: () => true, chiediJSON: (async (o: { system: string }) => { sistemi.push(o.system); return null }) as never })
  try {
    const voci = await claude.generaFeed()
    assert.equal(voci.length, 1, 'la carta resta com’era quando la riscrittura non torna')
    // le due carte, in un ordine qualunque: hanno la stessa ora di chiusura
    assert.match(sistemaDi(ricevute[0]), /Queste non le ha capite al primo sguardo\. Non scrivere così:\n— «[^\n]+»\n— «[^\n]+»/)
    assert.match(sistemaDi(ricevute[0]), /— «Verifica la lane di posizionamento» \/ «Sblocca la corsia autorizzata\.»/)
    assert.equal(sistemi.length, 1, 'con la soglia alzata la carta a 0.6 si riscrive')
    assert.match(sistemi[0], /Male \(le ha trovate poco chiare lui\):\n— «[^\n]+»\n— «[^\n]+»/)
    assert.match(sistemi[0], /— «Verifica la lane di posizionamento» \/ «Sblocca la corsia autorizzata\.»/)
    // il contrario: senza «non si capisce» la stessa carta a 0.6 non si riscrive
    for (const v of store.elencoFeed('scartato')) store.cambiaStatoFeed(v.id, 'aperto', '', null)
    for (const v of store.elencoFeed('aperto')) store.cambiaStatoFeed(v.id, 'fatto', 'x', 'lui')
    sistemi.length = 0
    fornitoreFinto([{ tipo: 'Da decidere', titolo: 'Firma il contratto di Bianchi', testo: 'Nino chiede la firma del contratto di Bianchi.', urgenza: 'nessuna fretta', fonte: 'posta', doc: n.id, perche: 'Nino aspetta la firma del contratto.', prova: 'Puoi firmare il contratto di Bianchi?' }])
    store.default.prepare('DELETE FROM feed_esame').run()
    await claude.generaFeed()
    assert.equal(sistemi.length, 0, 'senza «non si capisce» una carta a 0.6 è chiara abbastanza')
  } finally { jev.perProva(null); rifinitura.perProva(null); giudizi.scorda(); const c = cfg.leggi(); delete c.jev; cfg.scrivi(c, { togli: ['jev'] }) }
})

test('la riga della misura si scrive una volta per lettura che arriva al modello', async () => {
  store.azzeraTutto()
  store.salvaDocumenti([doc('posta:INBOX:1091', 'Una cosa', { quando: fraOre(1) })])
  fornitoreFinto([])
  const righe: string[] = []
  const vero = console.log
  console.log = (...a: unknown[]) => { righe.push(a.map(String).join(' ')) }
  try { await claude.generaFeed() } finally { console.log = vero }
  assert.equal(righe.filter(r => r.startsWith('myynd · misura ·')).length, 1, righe.join('\n'))
  assert.match(righe.find(r => r.startsWith('myynd · misura ·'))!, /^myynd · misura · 14 giorni: \d+ viste, \d+ giuste o tenute su \d+ \((?:\d+%|n\.d\.)\), di cui \d+ tardive, \d+ mancate su \d+ \((?:\d+%|n\.d\.)\)$/)
})

// — le correzioni del primo giro di verifica —

test('una mail che dice «tonight»: la carta nasce con il giorno della sera, si salva, e la pagina la mostra ancora', async () => {
  store.azzeraTutto()
  const d = doc('posta:INBOX:1101', 'Signed contract', { corpo: 'Can you send me the signed contract tonight? I file it first thing.', autore: 'Nora Vance <nora@harbor.example>', quando: fraOre(1) })
  const ieri = doc('posta:INBOX:1102', 'Draft notes', { corpo: 'Anna sent you the draft yesterday. Can you send her your notes on it?', autore: 'Anna Ruiz <ana@harbor.example>', quando: fraOre(2) })
  store.salvaDocumenti([d, ieri])
  fornitoreFinto([
    { tipo: 'Da decidere', titolo: 'Send Nora the signed contract', testo: 'Nora needs the signed contract tonight.', urgenza: 'tonight', fonte: 'posta', doc: d.id, perche: 'Nora files it tonight, first thing.', prova: 'Can you send me the signed contract tonight?' },
    { tipo: 'Da decidere', titolo: 'Send Anna your notes on the draft', testo: 'Anna sent the draft yesterday and waits for your notes.', urgenza: 'no rush', fonte: 'posta', doc: ieri.id, perche: 'Anna waits for your notes since yesterday.', prova: 'Can you send her your notes on it?' }
  ], 'en')
  const voci = await claude.generaFeed()
  assert.equal(voci.length, 2, 'le due carte nascono')
  const sera = GIORNI_EN[new Date(d.quando!).getDay()]
  assert.equal(voci[0].testo, `Nora needs the signed contract ${sera} evening.`)
  assert.equal(voci[0].perche, `Nora files it ${sera} evening, first thing.`)
  const oggi = new Date(d.quando!)
  assert.equal(voci[0].urgenza, `${MESI_EN[oggi.getMonth()]} ${oggi.getDate()}`, '«tonight» si salva come il giorno della mail')
  const prima = GIORNI_EN[(new Date(ieri.quando!).getDay() + 6) % 7]
  assert.equal(voci[1].testo, `Anna sent the draft ${prima} and waits for your notes.`)
  store.salvaFeed(voci)
  const { feedAttuale } = await import('./attenzione.ts')
  const inPagina = feedAttuale()
  assert.equal(inPagina.length, 2, 'salvate aperte ma nascoste dal filtro della pagina: la richiesta si perde senza traccia')
  assert.equal(inPagina.find(v => v.doc === d.id)?.urgenza, 'Today')
})

test('una risposta tronca, o rifiutata, non segna «modello» a trenta documenti: la lettura dopo li rimanda', async () => {
  store.azzeraTutto()
  const x = doc('posta:INBOX:1111', 'Which day', { corpo: 'Can you tell Pia which day works for the visit?', autore: 'Pia <pia@ex.example>', quando: fraOre(1) })
  store.salvaDocumenti([x])
  const tronca = (contenuto: string) => {
    cfg.scrivi({ lingua: 'en', motore: 'compatibile', compatibile: { url: 'https://esempio.test/v1/', chiave: 'sk-prova', modello: 'gpt-prova' } })
    const ricevute: unknown[] = []
    compatibile.usaRete((async (_url: string | URL | Request, init?: RequestInit) => {
      ricevute.push(init?.body ? JSON.parse(String(init.body)) : {})
      return Response.json({ id: 'c1', model: 'gpt-prova', choices: [{ index: 0, message: { role: 'assistant', content: contenuto }, finish_reason: 'length' }], usage: { prompt_tokens: 10, completion_tokens: 10 } })
    }) as typeof fetch)
    return ricevute
  }
  let ricevute = tronca('{"voci": [{"tipo": "Da decidere", "titolo": "Tell Pia which day')
  assert.deepEqual(await claude.generaFeed(), [])
  assert.equal(ricevute.length, 1)
  assert.equal(feedDati.esameDi([x.id]).get(x.id), undefined, 'una risposta non letta non è «il modello ha detto no»')
  // «voci» che non è una lista: lo stesso
  ricevute = tronca('{"voci": "niente"}')
  assert.deepEqual(await claude.generaFeed(), [])
  assert.equal(ricevute.length, 1)
  assert.equal(feedDati.esameDi([x.id]).get(x.id), undefined)
  // il fornitore torna sano: il documento si rimanda, e adesso «modello» si scrive
  ricevute = fornitoreFinto([], 'en')
  await claude.generaFeed()
  assert.equal(ricevute.length, 1, 'dopo una risposta tronca il documento non è stato rimandato')
  assert.equal(feedDati.esameDi([x.id]).get(x.id)?.fase, 'modello')
})

test('il salto delle ventiquattro ore vale anche dal secondo giorno: rimandato a più di un giorno, l’ora dell’esame si rinfresca', async () => {
  store.azzeraTutto()
  const x = doc('posta:INBOX:1121', 'Question', { corpo: 'Can you tell me which day works for the visit?', autore: 'Pia <pia@ex.example>', quando: fraOre(1) })
  store.salvaDocumenti([x])
  let ricevute = fornitoreFinto([], 'en')
  await claude.generaFeed()
  assert.equal(ricevute.length, 1)
  // venticinque ore dopo (l'esame si sposta indietro): si rimanda…
  store.default.prepare('UPDATE feed_esame SET quando = ? WHERE doc = ?').run(fraOre(25), x.id)
  ricevute = fornitoreFinto([], 'en')
  await claude.generaFeed()
  assert.equal(ricevute.length, 1)
  const dopo = feedDati.esameDi([x.id]).get(x.id)!
  assert.equal(dopo.fase, 'modello')
  assert.ok(Date.parse(dopo.quando) > Date.now() - 60_000, 'l’ora dell’esame non si è rinfrescata: dal secondo giorno il salto non varrebbe più')
  // …e un attimo dopo no
  ricevute = fornitoreFinto([], 'en')
  await claude.generaFeed()
  assert.equal(ricevute.length, 0)
})

test('un documento la cui carta è caduta alla verifica non si rimanda per un giorno, e «gia» non copre «carta»', async () => {
  store.azzeraTutto()
  const d1 = doc('posta:INBOX:1131', 'Northwind scope', { corpo: 'Can you confirm the pilot scope? We start with supplier invoices.', autore: 'Nora <nora@harbor.example>', quando: fraOre(2) })
  const d2 = doc('posta:INBOX:1132', 'Contract', { corpo: 'Can you sign the contract for the new office?', autore: 'Lea <lea@ex.example>', quando: fraOre(1) })
  store.salvaDocumenti([d1, d2])
  let ricevute = fornitoreFinto([
    { tipo: 'Da decidere', titolo: 'Confirm the pilot scope with Nora', testo: 'Nora asks you to confirm the pilot scope.', urgenza: 'no rush', fonte: 'posta', doc: d1.id, perche: 'Matters for the Northwind project.', prova: 'Can you confirm the pilot scope?' },
    { tipo: 'Da decidere', titolo: 'Sign the office contract for Lea', testo: 'Lea asks you to sign the contract for the new office.', urgenza: 'no rush', fonte: 'posta', doc: d2.id, perche: 'Lea waits for the signed contract.', prova: 'Can you sign the contract for the new office?' }
  ], 'en')
  const voci = await claude.generaFeed()
  assert.equal(voci.length, 1)
  store.salvaFeed(voci)
  assert.deepEqual([feedDati.esameDi([d1.id]).get(d1.id)?.fase, feedDati.esameDi([d2.id]).get(d2.id)?.fase], ['verifica', 'carta'])
  // la lettura dopo: quello caduto alla verifica non si ripaga, e quello con la carta resta «carta» e non «gia»
  ricevute = fornitoreFinto([], 'en')
  await claude.generaFeed()
  assert.equal(ricevute.length, 0, 'il documento caduto alla verifica è tornato al modello')
  assert.deepEqual([feedDati.esameDi([d1.id]).get(d1.id)?.motivo, feedDati.esameDi([d2.id]).get(d2.id)?.fase], ['perche:obiettivo', 'carta'])
})
