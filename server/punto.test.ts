// Il punto: cosa gli si manda, quando si chiama il modello, e cosa resta scritto.
//
// Il modello qui è finto — un fornitore compatibile che risponde sempre lo
// stesso punto e si ricorda cosa ha ricevuto — perché quello che va provato
// non è la qualità del testo: è che il materiale sia quello giusto e tagliato,
// che il cancello tenga (tre al giorno, tre ore, niente su niente di nuovo),
// che i progetti stiano in tabella con il loro obiettivo e sopravvivano da un
// punto all'altro, che uno chiuso non torni, e che un angolo tenuto finisca
// nella memoria e uno scartato non torni nel prompt.
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
const progetti = await import('./progetti.ts')
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
  progetti: [{ nome: 'Myynd', obiettivo: 'Un gemello che sceglie per lui.', doveSei: 'Il punto è in lavorazione.', angolo: 'Far crescere i progetti insieme a lui.' }]
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

/** Lo stesso fornitore, ma il conto è a secco: è quello che è successo davvero. */
function fornitoreSenzaCredito(): () => number {
  cfg.scrivi({ motore: 'compatibile', compatibile: { url: 'https://esempio.test/v1/', chiave: 'sk-prova', modello: 'gpt-prova' } })
  let chiamate = 0
  compatibile.usaRete((async () => {
    chiamate++
    return new Response(JSON.stringify({ error: { message: 'insufficient_quota' } }), { status: 402 })
  }) as typeof fetch)
  return () => chiamate
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

test('le lineette non arrivano in pagina: il modello le scrive dappertutto, il punto le toglie', async () => {
  pulisci()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  seminaLista()
  store.salvaNotizie([{
    id: 'n1', titolo: 'I modelli piccoli — la svolta', riassunto: 'Girano su un portatile.',
    perche: null, fonte: 'Prova', link: 'https://esempio.test/n1', argomento: 'lavoro',
    quando: new Date().toISOString()
  }])

  fornitoreFinto({
    mentreNonCeri: [{ testo: 'È arrivato il preventivo di Rossi — con le cifre nuove.', compito: '', doc: 'posta:INBOX:1' }],
    adesso: [{ testo: 'Approva la bozza per Bianchi — per Myynd.', compito: 'c1', doc: '' }],
    daLeggere: [{ titolo: 'I modelli piccoli — la svolta', perche: 'C’entra con Myynd — da leggere oggi.' }],
    progetti: [{
      nome: 'Myynd — il gemello', obiettivo: 'Un gemello — che sceglie per lui.',
      doveSei: 'Il punto è in lavorazione — quasi pronto.', angolo: 'Far crescere i progetti – insieme a lui.'
    }],
    avvii: [{ frase: 'Ogni lunedì alle 8 — un riepilogo della settimana', perche: 'Lo fa a mano — ogni volta.' }]
  })

  const e = await punto.punto({}, adesso())
  assert.ok(e.generatoAdesso)
  const tutto = JSON.stringify(e.punto)
  assert.doesNotMatch(tutto, /[—–]/, `una lineetta è arrivata in pagina: ${tutto}`)
  // l'inciso non sparisce: diventa una frase sua, con la maiuscola
  assert.equal(e.punto?.mentreNonCeri[0].testo, 'È arrivato il preventivo di Rossi. Con le cifre nuove.')
  assert.equal(e.punto?.adesso[0].testo, 'Approva la bozza per Bianchi. Per Myynd.')
  assert.equal(e.punto?.daLeggere[0].titolo, 'I modelli piccoli. La svolta')
  assert.equal(e.punto?.daLeggere[0].perche, 'C’entra con Myynd. Da leggere oggi.')
  assert.equal(e.punto?.progetti[0].nome, 'Myynd. Il gemello')
  assert.equal(e.punto?.progetti[0].doveSei, 'Il punto è in lavorazione. Quasi pronto.')
  assert.equal(e.punto?.progetti[0].angolo, 'Far crescere i progetti. Insieme a lui.')
  assert.equal(e.punto?.avvii[0].frase, 'Ogni lunedì alle 8. Un riepilogo della settimana')
})

test('le sezioni sono tagliate corte, e una riga lunga si accorcia a centoventi', async () => {
  pulisci()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  const lunga = 'Una riga che va avanti e non finisce mai, con dentro tutto quello che il modello ha trovato nel materiale di oggi e anche di ieri.'
  fornitoreFinto({
    ...RISPOSTA,
    mentreNonCeri: [
      { testo: lunga, compito: '', doc: '' },
      { testo: 'La seconda.', compito: '', doc: '' },
      { testo: 'La terza, che non deve passare.', compito: '', doc: '' }
    ],
    avvii: [
      { frase: 'Quando arriva un preventivo, mettilo in lista con le cifre', perche: 'Niente da ricopiare.' },
      { frase: 'Ogni lunedì alle 8, un riepilogo della settimana', perche: 'Lo fa già a mano.' },
      { frase: 'Quando arriva una fattura, segnala nella lista', perche: 'Non se ne perde una.' }
    ]
  })
  const e = await punto.punto({}, adesso())
  assert.equal(e.punto?.mentreNonCeri.length, 2, 'la terza riga di «mentre non c’eri» è passata')
  assert.equal(e.punto?.avvii.length, 2, 'il terzo avvio è passato')
  assert.ok((e.punto?.mentreNonCeri[0].testo.length ?? 0) <= 120, 'la riga lunga non è stata accorciata')
  assert.match(e.punto?.mentreNonCeri[0].testo ?? '', /…$/)
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

// — quello che è cambiato da quando l'ha scritto —
//
// Un punto è la fotografia di un momento. Il resto di questa sezione è quello
// che è successo a Tobia l'undici settembre: in prima pagina «il punto di
// oggi» era dell'otto, e le tre cose sotto «adesso» le aveva chiuse tutte la
// sera dell'otto. Tre difetti in uno — una fotografia mostrata come se fosse
// adesso, un punto di ieri chiamato di oggi, e tre tentativi falliti contati
// come punti fatti — e qui stanno le tre prove.

test('una riga che parla di una cosa chiusa dopo non si mostra più, nemmeno dal foglio', async () => {
  pulisci()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  seminaLista()
  fornitoreFinto()
  const t0 = adesso()
  const primo = await punto.punto({}, t0)
  assert.equal(primo.punto?.adesso[0].compito, 'c1')

  // lui la fa, e mezz'ora dopo torna nell'app: quella mossa non c'è più
  store.cambiaStatoCompito('c1', 'fatto')
  const dopo = await punto.punto({}, t0 + minuti(30))
  assert.equal(dopo.generatoAdesso, false, 'ha rifatto il punto invece di ripulirlo')
  assert.deepEqual(dopo.punto?.adesso, [], 'la mossa su una riga chiusa è rimasta in pagina')
  assert.equal(dopo.punto?.mentreNonCeri.length, 1, 'una riga senza compito non scade')
  // il foglio resta com'era: si filtra quando esce, non si riscrive la storia
  assert.equal(punto.ultimo()?.adesso.length, 1)
})

test('il punto di ieri non è il punto di oggi: torna nullo, con la data di quello vecchio', async () => {
  pulisci()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  const ricevute = fornitoreFinto()
  const t0 = adesso()
  const ieri = await punto.punto({}, t0)
  assert.ok(ieri.punto)

  const e = await punto.punto({}, t0 + ore(24))
  assert.equal(ricevute.length, 1, 'ha rifatto il punto su niente di nuovo')
  assert.equal(e.punto, null, 'il punto di ieri è stato mostrato come quello di oggi')
  assert.equal(e.vecchio, ieri.punto?.quando)
  assert.equal(e.generatoAdesso, false)

  // «rifai» lo rifà comunque, e quello nuovo non è più vecchio
  const rifatto = await punto.punto({ forza: true }, t0 + ore(24))
  assert.equal(ricevute.length, 2)
  assert.ok(rifatto.generatoAdesso)
  assert.equal(rifatto.vecchio ?? null, null)
  assert.ok(rifatto.punto)
})

test('una chiamata fallita non conta come punto del giorno, e dice perché', async () => {
  pulisci()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  const quante = fornitoreSenzaCredito()
  const t0 = adesso()

  // tre volte «rifai il punto», come ha fatto lui: tre guai, zero tacche
  for (const n of [1, 2, 3]) {
    const e = await punto.punto({ forza: true }, t0 + minuti(n))
    assert.equal(e.punto, null)
    assert.equal(e.tetto, false, 'un tentativo fallito ha bruciato uno dei tre del giorno')
    assert.equal(e.guaio, 'Il conto del fornitore è senza credito.')
  }
  assert.equal(quante(), 3)
  assert.equal(punto.ultimo(), null)
  // il foglio non è stato nemmeno scritto: non c'è niente da segnare
  const chiamate = existsSync(join(CASA, 'punto.json'))
    ? (JSON.parse(readFileSync(join(CASA, 'punto.json'), 'utf8')) as { chiamate?: string[] }).chiamate ?? []
    : []
  assert.deepEqual(chiamate, [], 'le chiamate fallite sono finite nel conto del giorno')

  // e quando il conto torna a posto, i tre punti ci sono ancora tutti
  fornitoreFinto()
  const e = await punto.punto({ forza: true }, t0 + minuti(4))
  assert.ok(e.generatoAdesso)
  assert.equal(e.guaio, undefined)
})

test('aggiornaAlPresente: via le righe delle cose chiuse e i progetti chiusi, e niente altro', () => {
  const progetto = (id: string, nome: string) => ({
    id, nome, obiettivo: '', dal: '2026-09-01T10:00:00.000Z',
    doveSei: '', angolo: '', angoliTenuti: [], proposto: true
  })
  const prima = {
    quando: '2026-09-08T13:47:00.000Z',
    via: null,
    mentreNonCeri: [
      { testo: 'È arrivato il preventivo di Rossi.', compito: null, doc: 'posta:INBOX:1' },
      { testo: 'Ho preparato la bozza per Bianchi.', compito: 'c1', doc: null }
    ],
    adesso: [
      { testo: 'Approva la bozza per Bianchi.', compito: 'c1', doc: null },
      { testo: 'Chiama lo studio.', compito: 'sparito', doc: null },
      { testo: 'Guarda il deck di lunedì.', compito: null, doc: null }
    ],
    daLeggere: [{ titolo: 'Una notizia', perche: 'C’entra.', link: null }],
    progetti: [progetto('p1', 'Myynd'), progetto('p2', 'Orto'), progetto('', 'Cantina')],
    avvii: [{ frase: 'Ogni lunedì alle 8, un riepilogo', perche: 'Lo fa a mano.' }]
  }

  const dopo = punto.aggiornaAlPresente(
    prima,
    { aperti: new Set(['c2']), chiusi: new Set(['c1']) },
    { nomi: new Set(['cantina']), id: new Set(['p2']) }
  )
  assert.deepEqual(dopo.mentreNonCeri.map(r => r.testo), ['È arrivato il preventivo di Rossi.'])
  assert.deepEqual(dopo.adesso.map(r => r.testo), ['Guarda il deck di lunedì.'])
  assert.deepEqual(dopo.progetti.map(x => x.nome), ['Myynd'], 'un progetto chiuso è rimasto nel punto')
  // il resto non si tocca, e l'originale nemmeno
  assert.equal(dopo.quando, prima.quando)
  assert.deepEqual(dopo.daLeggere, prima.daLeggere)
  assert.deepEqual(dopo.avvii, prima.avvii)
  assert.equal(prima.adesso.length, 3, 'ha cambiato il punto che gli è stato dato')
})

// — quello che resta scritto —

test('il punto sta in punto.json, i progetti in tabella: un progetto nuovo entra con l’obiettivo, e nome, id e data sopravvivono al giro dopo', async () => {
  pulisci()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  const ricevute = fornitoreFinto()
  const t0 = adesso()
  const primo = await punto.punto({}, t0)
  assert.ok(existsSync(join(CASA, 'punto.json')))
  const foglio = JSON.parse(readFileSync(join(CASA, 'punto.json'), 'utf8'))
  assert.equal(foglio.ultimo.via, null, 'senza una richiesta con «via», nessuna assenza inventata')
  // il primo punto, senza progetti scritti: al modello si dice di riconoscerli
  assert.match(istruzioneDi(ricevute[0]), /Non ha ancora scritto i suoi progetti/)

  // quello che il modello ha capito sta in tabella, non nel foglio
  const [inTabella] = progetti.elenco()
  assert.equal(inTabella.nome, 'Myynd')
  assert.equal(inTabella.obiettivo, 'Un gemello che sceglie per lui.')
  assert.equal(inTabella.origine, 'punto')
  assert.equal(inTabella.dal, new Date(t0).toISOString())
  assert.equal(primo.punto?.progetti[0].id, inTabella.id, 'il progetto del punto non porta l’id della riga')
  assert.equal(primo.punto?.progetti[0].obiettivo, inTabella.obiettivo)

  // il giro dopo: il modello riceve i progetti dalla tabella, con l'obiettivo
  // e dov'erano, e quello che torna si ricuce sulla stessa riga
  await unAttimo()
  store.salvaDocumenti([doc('posta:INBOX:2', 'Fattura Bianchi')])
  const secondo = await punto.punto({ forza: true }, t0 + ore(4))
  const giorno = new Date(t0).toISOString().slice(0, 10)
  assert.match(istruzioneDi(ricevute[1]),
    new RegExp(`I suoi progetti, e a cosa punta ciascuno[\\s\\S]*— Myynd: Un gemello che sceglie per lui\\. \\(attivo, dal ${giorno}\\)\\n  dov'era l'ultima volta: Il punto è in lavorazione`))
  // le regole di stile viaggiano con l'istruzione: corte, e senza lineette
  assert.match(istruzioneDi(ricevute[1]), /al massimo dieci parole, con il punto in\n  fondo/)
  assert.match(istruzioneDi(ricevute[1]), /non compare MAI la lineetta lunga/)
  assert.equal(secondo.punto?.progetti[0].dal, primo.punto?.progetti[0].dal, 'la data del progetto è ripartita')
  assert.equal(secondo.punto?.progetti[0].id, inTabella.id)
  assert.equal(progetti.elenco().length, 1, 'lo stesso progetto è entrato due volte')
  assert.equal(punto.ultimo()?.quando, secondo.punto?.quando)
})

test('un progetto chiuso non torna: il modello lo riceve come «non è un progetto», e se lo riscrive non passa; uno nuovo per punto, non di più', async () => {
  pulisci()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  const nextas = progetti.scrivi({ nome: 'Nextas', obiettivo: 'Chiudere il round seed entro ottobre' })
  const papa = progetti.scrivi({ nome: 'Myynd per papà', obiettivo: 'Inventato dal modello' })
  progetti.chiudi(papa.id)

  const ricevute = fornitoreFinto({
    ...RISPOSTA,
    progetti: [
      { nome: 'nextas', obiettivo: 'Un obiettivo diverso, inventato', doveSei: 'Bianchi ha confermato.', angolo: '' },
      { nome: 'Myynd per papà', obiettivo: 'Ancora lui', doveSei: 'Ricomincia.', angolo: '' },
      { nome: 'Orto', obiettivo: 'Piantare i pomodori', doveSei: 'Semi comprati.', angolo: '' },
      { nome: 'Cantina', obiettivo: 'Svuotarla', doveSei: 'Iniziata.', angolo: '' }
    ]
  })
  const e = await punto.punto({}, adesso())
  const istr = istruzioneDi(ricevute[0])
  assert.match(istr, /— Nextas: Chiudere il round seed entro ottobre \(attivo/)
  assert.match(istr, /NON sono progetti[\s\S]*— Myynd per papà/)
  assert.doesNotMatch(istr, /Myynd per papà: Inventato/, 'un chiuso è entrato fra i progetti vivi')

  const nomi = e.punto?.progetti.map(p => p.nome)
  assert.deepEqual(nomi, ['Nextas', 'Orto'], `ha tenuto ${nomi?.join(', ')}`)
  assert.equal(e.punto?.progetti[0].id, nextas.id)
  assert.equal(e.punto?.progetti[0].obiettivo, 'Chiudere il round seed entro ottobre', 'l’obiettivo scritto da lui è stato riscritto dal modello')
  assert.equal(progetti.trova(papa.id)?.stato, 'chiuso', 'il modello ha riaperto un progetto chiuso')
  assert.equal(progetti.trovaPerNome('Orto')?.origine, 'punto')
  assert.equal(progetti.trovaPerNome('Cantina'), undefined, 'il secondo progetto nuovo dello stesso punto è entrato')
})

test('«non è un progetto»: si chiude, esce dal punto mostrato, e al giro dopo non c’è più', async () => {
  pulisci()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  const ricevute = fornitoreFinto()
  const t0 = adesso()
  const primo = await punto.punto({}, t0)
  const id = primo.punto!.progetti[0].id
  const r = punto.nonEUnProgetto(id)
  assert.deepEqual(r.punto?.progetti, [])
  assert.deepEqual(punto.ultimo()?.progetti, [])
  assert.equal(progetti.trova(id)?.stato, 'chiuso')
  assert.throws(() => punto.nonEUnProgetto('inesistente'), /non c’è nel punto/)
  // tenere un angolo su un chiuso non si può: non è più un progetto
  assert.throws(() => punto.tieni('Myynd', 'Un angolo'), /non c’è nel punto/)

  await unAttimo()
  store.salvaDocumenti([doc('posta:INBOX:2', 'Fattura Bianchi')])
  const dopo = await punto.punto({ forza: true }, t0 + ore(4))
  assert.match(istruzioneDi(ricevute[1]), /NON sono progetti[\s\S]*— Myynd/)
  assert.deepEqual(dopo.punto?.progetti, [], 'il modello finto lo ripropone, e il punto l’ha ripreso')
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
