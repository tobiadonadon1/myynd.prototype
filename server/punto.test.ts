// Il punto: cosa gli si manda, quando si chiama il modello, e cosa resta scritto.
//
// Il modello qui è finto — un fornitore compatibile che risponde sempre lo
// stesso punto e si ricorda cosa ha ricevuto — perché quello che va provato
// non è la qualità del testo: è che il materiale sia quello giusto e tagliato,
// che il cancello tenga (tre al giorno, tre ore, niente su niente di nuovo),
// che i progetti sopravvivano da un punto all'altro, e che un angolo tenuto
// finisca nella memoria e uno scartato non torni nel prompt.
//
// L'orologio del punto si passa a mano, ma `indicizzato` dei documenti è
// quello vero: per questo ogni prova prende «adesso» *dopo* aver seminato, e
// aspetta qualche millisecondo prima di far entrare un documento «nuovo».
//
//   node --test server/punto.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Documento } from './store.ts'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-punto-'))
process.env.MYYND_DATI = CASA
// la chiave di casa non deve entrare in queste prove
delete process.env.ANTHROPIC_API_KEY

const cfg = await import('./config.ts')
const store = await import('./store.ts')
const compatibile = await import('./compatibile.ts')
const punto = await import('./punto.ts')
const chi = await import('./chi.ts')
const conti = await import('./conti.ts')
const timone = await import('./timone.ts')

before(() => pulisci())
after(() => {
  compatibile.usaRete(null)
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

/** Da capo: l'indice, il registro delle azioni, e il foglio del punto. */
function pulisci() {
  store.azzeraTutto()
  store.default.exec('DELETE FROM azioni; DELETE FROM notizie')
  rmSync(punto.perProva.file(), { force: true })
}

const doc = (id: string, titolo: string, sopra: Partial<Documento> = {}): Documento => ({
  id, fonte: 'posta', tipo: 'email', titolo, corpo: `Il testo di ${titolo}. `.repeat(40),
  autore: 'Rossi <rossi@esempio.it>', percorso: 'INBOX',
  quando: '2026-09-07T10:00:00.000Z', gruppo: 'posta', ...sopra
})

const RISPOSTA = {
  mentreNonCeri: [{ testo: 'È arrivato il preventivo di Rossi.', compito: '', doc: 'posta:INBOX:1' }],
  adesso: [{ testo: 'Approva la bozza per Bianchi.', compito: 'c1', doc: '' }],
  daLeggere: [{ titolo: 'Notizia sui modelli', perche: 'C’entra con Myynd.' }],
  progetti: [{ nome: 'Myynd', doveSei: 'Il punto è in lavorazione.', angolo: 'Far crescere i progetti insieme a lui.' }]
}

/** Un fornitore compatibile finto: risponde con questo punto e si ricorda cosa ha ricevuto. */
function fornitoreFinto(risposta: object = RISPOSTA) {
  cfg.scrivi({ motore: 'compatibile', compatibile: { url: 'https://esempio.test/v1/', chiave: 'sk-prova', modello: 'gpt-prova' } })
  const ricevute: Record<string, unknown>[] = []
  compatibile.usaRete((async (_url: string | URL | Request, init?: RequestInit) => {
    ricevute.push(init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {})
    return Response.json({
      id: 'chatcmpl-1', model: 'gpt-prova',
      choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(risposta) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 10 }
    })
  }) as typeof fetch)
  return ricevute
}

/** Tutto il testo mandato al modello, system e messaggi insieme. */
const testoDi = (r: Record<string, unknown>) =>
  (r.messages as { content: string }[]).map(m => m.content).join('\n')
/** Solo l'istruzione: è lì che stanno i progetti e gli angoli. */
const istruzioneDi = (r: Record<string, unknown>) =>
  String((r.messages as { role: string; content: string }[]).find(m => m.role === 'system')?.content)

/** Una lista con una riga pronta, una che chiede, una per oggi e una chiusa. */
function seminaLista() {
  store.scriviCompito({ id: 'c1', testo: 'Rispondere a Bianchi', ordine: 'a', quando: 'oggi' })
  store.affidaCompito('c1', 'bozza')
  store.risultatoCompito('c1', 'Gentile Bianchi, ecco il preventivo aggiornato.', [])
  store.scriviCompito({ id: 'c2', testo: 'Preparare il contratto', ordine: 'b', quando: 'oggi' })
  store.affidaCompito('c2', 'bozza')
  store.risultatoCompito('c2', 'Mi manca la data di inizio.', [], 'chiede')
  store.scriviCompito({ id: 'c3', testo: 'Chiamare lo studio', ordine: 'c', quando: 'oggi' })
  store.scriviCompito({ id: 'c4', testo: 'Pagare la fattura di marzo', ordine: 'd', quando: 'oggi' })
  store.cambiaStatoCompito('c4', 'fatto')
}

const ore = (n: number) => n * 3600_000
const minuti = (n: number) => n * 60_000
/** «Adesso», un millisecondo dopo tutto quello che è già stato scritto. */
const adesso = () => Date.now() + 1
/** Perché il prossimo documento risulti entrato *dopo* l'ultimo punto. */
const unAttimo = () => new Promise(r => setTimeout(r, 5))

// — il materiale —

test('il materiale: i documenti arrivati (senza la posta in massa, al massimo venti), la lista, il feed, il fuoco', async () => {
  pulisci()
  store.salvaDocumenti([
    doc('posta:INBOX:1', 'Preventivo Rossi'),
    doc('posta:INBOX:2', 'Offerte della settimana', { autore: 'Vinted <noreply@vinted.com>' }),
    ...Array.from({ length: 30 }, (_, i) => doc(`posta:INBOX:${100 + i}`, `Email numero ${i}`))
  ])
  seminaLista()
  store.salvaFeed([{ tipo: 'Da decidere', titolo: 'Il deck per lunedì è a metà', testo: 'Mancano due slide.', fonte: 'desktop' }])
  timone.scriviFuoco('Questa settimana solo i preventivi.')
  store.ricorda({ enunciato: 'Non fa sconti al primo giro.', ambito: 'persona', genere: 'esplicita', fiducia: 1, origine: 'mano' })
  store.registraAzione({ tipo: 'email', cosa: 'Preventivo aggiornato', verso: 'bianchi@esempio.it', esito: 'fatta', compito: 'c1' })

  const ricevute = fornitoreFinto()
  const t0 = adesso()
  const e = await punto.punto({ via: 240 }, t0)
  assert.equal(ricevute.length, 1, 'il modello va chiamato una volta')
  assert.ok(e.generatoAdesso)
  const mandato = testoDi(ricevute[0])

  assert.match(mandato, /id: posta:INBOX:1\n  Preventivo Rossi/)
  assert.doesNotMatch(mandato, /Offerte della settimana/, 'la posta in massa è entrata nel punto')
  assert.equal((mandato.match(/— id: /g) ?? []).length, 20, 'i documenti non sono tagliati a venti')
  // duecento caratteri di corpo, non il documento intero
  assert.ok(!mandato.includes('Il testo di Preventivo Rossi. '.repeat(10)), 'il corpo intero è finito nel prompt')

  assert.match(mandato, /Aspettano lui:[\s\S]*\[c1\] Rispondere a Bianchi \(pronto, per oggi\)\n  bozza: Gentile Bianchi/)
  assert.match(mandato, /\[c2\] Preparare il contratto \(chiede/)
  assert.match(mandato, /Aperte per oggi:[\s\S]*Chiamare lo studio/)
  assert.match(mandato, /Chiuse da allora:[\s\S]*Pagare la fattura di marzo/)
  assert.match(mandato, /bozze preparate: 2/)
  assert.match(mandato, /email mandate \(su sua richiesta\): 1/)
  assert.match(mandato, /email: Preventivo aggiornato → bianchi@esempio.it \(fatta, compito c1\)/)
  assert.match(mandato, /SUL FEED[\s\S]*Il deck per lunedì è a metà/)
  assert.match(mandato, /concentrarti su questo[\s\S]*solo i preventivi/)
  assert.match(mandato, /Non fa sconti al primo giro/)
  assert.match(mandato, /È stato via circa 4 ore/)
  // l'istruzione va nel blocco che si mette in cache, il materiale nel messaggio
  assert.match(istruzioneDi(ricevute[0]), /Sei Myynd\. Questa persona torna/)
  assert.doesNotMatch(istruzioneDi(ricevute[0]), /ARRIVATO/)

  // e quello che torna è ricucito: gli id passano solo se stanno nel materiale
  assert.equal(e.punto?.via, 240, 'l’assenza la porta la richiesta, non il modello')
  assert.equal(e.punto?.mentreNonCeri[0].doc, 'posta:INBOX:1')
  assert.equal(e.punto?.adesso[0].compito, 'c1')
  assert.equal(e.punto?.progetti[0].nome, 'Myynd')
  assert.equal(e.punto?.progetti[0].dal, new Date(t0).toISOString())
})

test('un id che non sta nel materiale non passa, nemmeno se il modello lo scrive', async () => {
  pulisci()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  fornitoreFinto({
    ...RISPOSTA,
    mentreNonCeri: [{ testo: 'Una cosa.', compito: 'inventato', doc: 'posta:INBOX:999' }]
  })
  const e = await punto.punto({}, adesso())
  assert.equal(e.punto?.mentreNonCeri[0].compito, null)
  assert.equal(e.punto?.mentreNonCeri[0].doc, null)
})

// — il cancello —

test('subito dopo un punto si torna quello di prima, senza chiamare nessuno', async () => {
  pulisci()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  const ricevute = fornitoreFinto()
  const t0 = adesso()
  const primo = await punto.punto({}, t0)
  assert.ok(primo.generatoAdesso)
  const secondo = await punto.punto({}, t0 + ore(1))
  assert.equal(ricevute.length, 1)
  assert.equal(secondo.generatoAdesso, false)
  assert.deepEqual(secondo.punto, primo.punto)
})

test('passate tre ore senza che sia successo niente, ancora quello di prima', async () => {
  pulisci()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  const ricevute = fornitoreFinto()
  const t0 = adesso()
  await punto.punto({}, t0)
  const e = await punto.punto({}, t0 + ore(5))
  assert.equal(ricevute.length, 1, 'ha rifatto il punto su niente di nuovo')
  assert.equal(e.generatoAdesso, false)
})

test('passate tre ore con un documento nuovo, si rifà — e il materiale parte dall’ultimo punto', async () => {
  pulisci()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  const ricevute = fornitoreFinto()
  const t0 = adesso()
  await punto.punto({}, t0)
  await unAttimo()
  // il documento entra adesso: il suo `indicizzato` è più recente dell'ultimo punto
  store.salvaDocumenti([doc('posta:INBOX:2', 'Fattura Bianchi')])
  const e = await punto.punto({}, t0 + ore(4))
  assert.equal(ricevute.length, 2)
  assert.ok(e.generatoAdesso)
  const mandato = testoDi(ricevute[1])
  assert.match(mandato, /Fattura Bianchi/)
  assert.doesNotMatch(mandato, /Preventivo Rossi/, 'il materiale del punto prima è stato riletto')
})

test('«forza» salta le tre ore ma non il conto del giorno: tre, poi quello di prima e la parola «tetto»', async () => {
  pulisci()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  const ricevute = fornitoreFinto()
  const t0 = adesso()
  await punto.punto({}, t0)
  assert.ok((await punto.punto({ forza: true }, t0 + minuti(1))).generatoAdesso)
  assert.ok((await punto.punto({ forza: true }, t0 + minuti(2))).generatoAdesso)
  assert.equal(ricevute.length, 3)
  const quarto = await punto.punto({ forza: true }, t0 + minuti(3))
  assert.equal(ricevute.length, 3, 'il quarto punto del giorno è stato pagato')
  assert.equal(quarto.generatoAdesso, false)
  assert.equal(quarto.tetto, true)
  assert.ok(quarto.punto, 'con il tetto raggiunto si mostra comunque quello di prima')
  // il giorno dopo si riparte
  await unAttimo()
  store.salvaDocumenti([doc('posta:INBOX:2', 'Fattura Bianchi')])
  const domani = await punto.punto({ forza: true }, t0 + ore(24))
  assert.ok(domani.generatoAdesso)
  assert.equal(domani.tetto, false)
})

test('senza motore, e su una mente vuota, non c’è nessun punto e nessuna chiamata', async () => {
  pulisci()
  cfg.scrivi({})
  compatibile.usaRete(null)
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  assert.deepEqual(await punto.punto({}, adesso()), { punto: null, generatoAdesso: false, tetto: false })
  // e con un motore ma niente da dire, nemmeno
  pulisci()
  const ricevute = fornitoreFinto()
  assert.equal((await punto.punto({ forza: true }, adesso())).punto, null)
  assert.equal(ricevute.length, 0, 'ha chiamato il modello senza materiale')
})

// — quello che resta scritto —

test('il punto e i progetti stanno in punto.json, e il nome e la data del progetto sopravvivono al giro dopo', async () => {
  pulisci()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  const ricevute = fornitoreFinto()
  const t0 = adesso()
  const primo = await punto.punto({}, t0)
  assert.ok(existsSync(join(CASA, 'punto.json')))
  const foglio = JSON.parse(readFileSync(join(CASA, 'punto.json'), 'utf8'))
  assert.equal(foglio.ultimo.via, null, 'senza una richiesta con «via», nessuna assenza inventata')
  assert.equal(foglio.progetti[0].nome, 'Myynd')

  // il giro dopo: il modello riceve i progetti di prima, e quello che torna li ricuce
  await unAttimo()
  store.salvaDocumenti([doc('posta:INBOX:2', 'Fattura Bianchi')])
  const secondo = await punto.punto({ forza: true }, t0 + ore(4))
  const giorno = new Date(t0).toISOString().slice(0, 10)
  assert.match(istruzioneDi(ricevute[1]),
    new RegExp(`I suoi progetti, come li avevi capiti[\\s\\S]*— Myynd \\(dal ${giorno}\\): Il punto è in lavorazione`))
  assert.equal(secondo.punto?.progetti[0].dal, primo.punto?.progetti[0].dal, 'la data del progetto è ripartita')
  assert.equal(punto.ultimo()?.quando, secondo.punto?.quando)
})

test('«tienilo»: l’angolo diventa una convinzione con l’ambito del progetto, e il modello lo trova fra i suoi', async () => {
  pulisci()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  const ricevute = fornitoreFinto()
  const t0 = adesso()
  await punto.punto({}, t0)
  const angolo = RISPOSTA.progetti[0].angolo

  const e = punto.tieni('Myynd', angolo)
  assert.ok(e.ok)
  const conv = store.convinzioni('progetto:Myynd')
  assert.equal(conv.length, 1)
  assert.equal(conv[0].enunciato, angolo)
  assert.equal(conv[0].genere, 'esplicita')
  assert.equal(conv[0].origine, 'punto')
  assert.deepEqual(punto.ultimo()?.progetti[0].angoliTenuti, [angolo])

  await unAttimo()
  store.salvaDocumenti([doc('posta:INBOX:2', 'Fattura Bianchi')])
  const dopo = await punto.punto({ forza: true }, t0 + ore(4))
  assert.match(istruzioneDi(ricevute[1]), /Angoli che ha già tenuto[\s\S]*\[Myynd\] Far crescere i progetti insieme a lui/)
  // il modello finto lo ripropone uguale: non si mostra due volte come nuovo
  assert.equal(dopo.punto?.progetti[0].angolo, '')
  assert.deepEqual(dopo.punto?.progetti[0].angoliTenuti, [angolo])

  assert.throws(() => punto.tieni('Inesistente', angolo), /Questo progetto non c’è nel punto/)
})

test('«non è così»: l’angolo sparisce dal punto e il modello viene avvertito di non riproporlo', async () => {
  pulisci()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  const ricevute = fornitoreFinto()
  const t0 = adesso()
  await punto.punto({}, t0)
  const angolo = RISPOSTA.progetti[0].angolo

  punto.scarta('Myynd', angolo)
  assert.equal(punto.ultimo()?.progetti[0].angolo, '')
  assert.equal(store.convinzioni('progetto:Myynd').length, 0, 'uno scarto non è una convinzione')

  await unAttimo()
  store.salvaDocumenti([doc('posta:INBOX:2', 'Fattura Bianchi')])
  const dopo = await punto.punto({ forza: true }, t0 + ore(4))
  assert.match(istruzioneDi(ricevute[1]), /NON sono così[\s\S]*— Far crescere i progetti insieme a lui/)
  assert.equal(dopo.punto?.progetti[0].angolo, '', 'un angolo scartato è tornato')
})

// — più persone —

test('il foglio è di chi chiede: uno per cartella, e il punto di una non compare all’altra', async () => {
  pulisci()
  const a = await conti.registra('anna@esempio.it', 'passwordlunga1')
  const b = await conti.registra('bruno@esempio.it', 'passwordlunga2')
  assert.ok(a.ok && b.ok)
  const anna = a.ok ? a.id : ''
  const bruno = b.ok ? b.id : ''

  const ricevute = await chi.dentro(anna, async () => {
    store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
    const r = fornitoreFinto()
    await punto.punto({}, adesso())
    return r
  })
  assert.equal(ricevute.length, 1)
  assert.ok(existsSync(join(cfg.cartellaDi(anna), 'punto.json')))
  assert.ok(!existsSync(join(cfg.cartellaDi(bruno), 'punto.json')))
  assert.ok(!existsSync(join(CASA, 'punto.json')), 'il foglio di Anna è finito nella radice')

  await chi.dentro(bruno, async () => {
    assert.equal(punto.ultimo(), null)
    cfg.scrivi({})
    assert.equal((await punto.punto({}, adesso())).punto, null)
  })
  assert.equal(ricevute.length, 1)
})

test('quello che ha scartato non torna nel punto, e gli avvii non ripetono le automazioni che ha già', async () => {
  pulisci()
  // una mail scartata dal feed, una da un mittente scartato, una riga lasciata perdere, e una buona
  store.salvaDocumenti([
    doc('posta:INBOX:10', 'Il gestore dello stabile ha scritto', { autore: 'CERU <ceru@stabile.it>' }),
    doc('posta:INBOX:11', 'Ancora il gestore', { autore: 'CERU <ceru@stabile.it>' }),
    doc('posta:INBOX:12', 'Il flusso in CSV', { autore: 'Anna <anna@esempio.it>' }),
    doc('posta:INBOX:13', 'Preventivo Verdi', { autore: 'Verdi <verdi@esempio.it>' })
  ])
  store.salvaFeed([{ tipo: 'Da decidere', titolo: 'Il gestore dello stabile ha scritto', testo: '…', doc: 'posta:INBOX:10' }])
  const voce = store.elencoFeed('aperto').find(v => v.doc === 'posta:INBOX:10')!
  store.cambiaStatoFeed(voce.id, 'scartato')
  store.scriviCompito({ id: 'c-csv', testo: 'Sistemare il flusso in CSV', ordine: 'z', quando: 'oggi', doc: 'posta:INBOX:12' })
  store.cambiaStatoCompito('c-csv', 'lasciato')

  const ricevute = fornitoreFinto({
    ...RISPOSTA,
    avvii: [
      { frase: 'Quando arriva un preventivo, mettilo in lista con le cifre', perche: 'Niente da ricopiare.' },
      { frase: 'Ogni lunedì alle 8, un riepilogo della settimana', perche: 'Lo fa già.' }
    ]
  })
  const e = await punto.punto({ via: 200 }, adesso())
  assert.ok(e.generatoAdesso)
  const mandato = JSON.stringify(ricevute[0])
  assert.doesNotMatch(mandato, /posta:INBOX:10/, 'la mail scartata dal feed non è nel materiale')
  assert.doesNotMatch(mandato, /posta:INBOX:11/, 'nemmeno l’altra dello stesso mittente')
  assert.doesNotMatch(mandato, /posta:INBOX:12/, 'né quella della riga lasciata perdere')
  assert.match(mandato, /posta:INBOX:13/, 'quella buona sì')
  assert.match(mandato, /NON gli interessano[\s\S]*Il gestore dello stabile ha scritto[\s\S]*Sistemare il flusso in CSV/)
  assert.match(mandato, /NON dire da quanto manca/)
  assert.match(mandato, /È stato via circa 3 ore/)
  assert.equal(e.punto?.via, 200)
  // gli avvii: al massimo tre, e mai uno uguale a una ricetta già accesa per nome
  assert.equal(e.punto?.avvii.length, 2)
  assert.match(mandato, /avvii/)
})
