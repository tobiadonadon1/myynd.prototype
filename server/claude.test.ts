// I pezzi di `claude.ts` che si possono provare senza un modello.
//
// Il ragionamento vero sta dentro chiamate a un modello, e quello non si prova
// qui. Ma attorno a ogni chiamata ci sono quattro cose meccaniche, e ognuna ha
// un modo di sbagliare *in silenzio* che è già successo almeno una volta:
//
//   · `inMano` diceva «la posta NON è collegata» a chi aveva Gmail, e il
//     modello — obbediente — rispondeva «collegami la casella» invece di scrivere;
//   · `contesto` che ricomincia da [1] a ogni giro fa puntare la citazione [2]
//     al documento sbagliato;
//   · `fontiCitate` con `includes('[1]')` contava [10] come [1], e senza
//     citazioni attaccava tre fonti inventate sotto un «non ho trovato niente»;
//   · `testoDi` è quello che decide cosa arriva all'abbonamento al posto dei
//     blocchi dell'SDK.
//
// E in fondo c'è la parte che un modello ce l'ha, ma finto: la chat che tocca
// la lista — chiude una riga, la sposta, e rifiuta un id che non esiste.
//
//   node --test server/claude.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Documento } from './store.ts'

// come in piupersone.test.ts: la cartella dei dati è finta e nasce prima che
// config.ts la legga
const CASA = mkdtempSync(join(tmpdir(), 'myynd-claude-'))
process.env.MYYND_DATI = CASA

const cfg = await import('./config.ts')
const store = await import('./store.ts')
const claude = await import('./claude.ts')

after(() => {
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

const doc = (id: string, titolo: string, sopra: Partial<Documento> = {}): Documento => ({
  id, fonte: 'posta', tipo: 'email', titolo, corpo: `Il testo di ${titolo}.`,
  autore: 'Rossi <rossi@esempio.it>', percorso: 'INBOX',
  quando: '2026-03-01T10:00:00.000Z', gruppo: 'posta', ...sopra
})

// — inMano: cosa è collegato davvero —

test('senza niente collegato lo dice, e nomina la posta fra quello che manca', () => {
  cfg.scrivi({}, { togli: [...cfg.CON_SEGRETI] })
  const r = claude.inMano()
  assert.match(r, /Non hai nessuna fonte collegata/)
  assert.match(r, /NON è collegato[^.]*la posta/)
})

test('la posta via Gmail conta come collegata', () => {
  cfg.scrivi({ google: { clientId: 'x', refresh: 'y', email: 'io@gmail.com' } })
  const r = claude.inMano()
  assert.match(r, /Quello che puoi leggere: la posta/)
  assert.doesNotMatch(r, /NON è collegato[^.]*la posta/)
})

test('la posta via Outlook conta come collegata solo se è stata concessa quella metà', () => {
  cfg.scrivi({ microsoft: { clientId: 'x', refresh: 'y', parti: ['posta'] } }, { togli: [...cfg.CON_SEGRETI] })
  assert.match(claude.inMano(), /Quello che puoi leggere: la posta/)

  // solo i file: SharePoint sì, la posta no
  cfg.scrivi({ microsoft: { clientId: 'x', refresh: 'y', parti: ['file'] } }, { togli: [...cfg.CON_SEGRETI] })
  const r = claude.inMano()
  assert.match(r, /Quello che puoi leggere:[^.]*SharePoint/)
  assert.match(r, /NON è collegato[^.]*la posta/)
})

test('la posta via IMAP conta come sempre', () => {
  cfg.scrivi({ posta: { host: 'imap.esempio.it', porta: 993, utente: 'io@esempio.it', password: 'x' } }, { togli: ['microsoft'] })
  assert.match(claude.inMano(), /Quello che puoi leggere: la posta/)
  cfg.scrivi({})
})

// — contesto: la numerazione continua —

test('la numerazione parte da «da», e va avanti da lì', () => {
  const testo = claude.contesto([doc('a', 'Primo'), doc('b', 'Secondo')], 5)
  assert.match(testo, /^\[5\] Primo/m)
  assert.match(testo, /^\[6\] Secondo/m)
  assert.doesNotMatch(testo, /^\[1\]/m)
})

test('senza «da» parte da uno, e porta id e fonte di ogni documento', () => {
  const testo = claude.contesto([doc('posta:INBOX:1', 'Oggetto')])
  assert.match(testo, /^\[1\] Oggetto/m)
  assert.match(testo, /^id: posta:INBOX:1$/m)
  assert.match(testo, /^Fonte: posta · Rossi <rossi@esempio.it> · /m)
})

test('il corpo si taglia al tetto, e una data illeggibile non fa esplodere niente', () => {
  const lungo = doc('l', 'Lungo', { corpo: 'x'.repeat(10_000), quando: 'non è una data' })
  const testo = claude.contesto([lungo], 1, 100)
  assert.ok(testo.length < 400, 'non ha tagliato il corpo')
  assert.match(testo, /senza data/)
})

// — fontiCitate: solo quello che ha citato davvero —

test('tornano solo i documenti citati, con il loro numero', () => {
  const docs = [doc('a', 'A'), doc('b', 'B'), doc('c', 'C')]
  const f = claude.fontiCitate('La cifra viene da qui [2], il resto no.', docs)
  assert.deepEqual(f, [{ id: 'b', label: '[2] B' }])
})

test('[10] non è [1], e senza citazioni non si inventa niente', () => {
  const docs = Array.from({ length: 10 }, (_, i) => doc(`d${i + 1}`, `D${i + 1}`))
  const f = claude.fontiCitate('Vedi [10].', docs)
  assert.deepEqual(f.map(x => x.id), ['d10'])
  assert.deepEqual(claude.fontiCitate('Non ho trovato niente su questo.', docs), [])
})

test('una citazione oltre l’elenco si ignora invece di puntare a caso', () => {
  assert.deepEqual(claude.fontiCitate('Guarda [7].', [doc('a', 'A')]), [])
})

// — testoDi: dai blocchi al testo —

test('una stringa passa com’è, i blocchi si appiattiscono, il resto è vuoto', () => {
  assert.equal(claude.testoDi('ciao'), 'ciao')
  assert.equal(claude.testoDi([
    { type: 'text', text: 'prima' },
    { type: 'tool_use', id: 't', name: 'cerca', input: {} },
    { type: 'text', text: 'dopo' }
  ]), 'prima\ndopo')
  assert.equal(claude.testoDi(undefined), '')
  assert.equal(claude.testoDi({ type: 'text', text: 'non è una lista' }), '')
  assert.equal(claude.testoDi([null, { type: 'text' }, { type: 'text', text: 'ok' }]), 'ok')
})

/*
 * Il recinto delle automazioni.
 *
 * Una ricetta dichiara cosa può aprire, e quella riga si legge sulla sua scheda.
 * Fino a ieri valeva per la pescata iniziale e non per `cerca`, quindi era una
 * scritta: la ricerca generale apriva tutto lo stesso. Queste prove sono
 * quelle che tengono in piedi la promessa, e la cosa che devono impedire è che
 * qualcuno «semplifichi» togliendo il terzo argomento.
 */
test('il recinto: si vede solo quello che l’automazione ha il permesso di aprire', () => {
  store.salvaDocumenti([
    doc('posta:INBOX:900', 'Preventivo per il capannone'),
    doc('desktop:/listino.pdf', 'Listino prezzi capannone',
      { fonte: 'desktop', tipo: 'pdf', gruppo: 'documenti', percorso: '/listino.pdf' })
  ])

  // senza recinto, il comportamento di sempre: si guarda tutto
  const tutto = claude.materiale('capannone', [])
  assert.ok(tutto.some(d => d.fonte === 'posta'), 'la posta c’è')
  assert.ok(tutto.some(d => d.fonte === 'desktop'), 'il desktop c’è')

  // con il recinto, solo le fonti concesse — e non è un filtro dopo il limite:
  // il documento della posta si trova anche se il listino gli stava davanti
  const soloPosta = claude.materiale('capannone', [], ['posta'])
  assert.ok(soloPosta.length > 0, 'dentro il recinto qualcosa si trova')
  assert.ok(soloPosta.every(d => d.fonte === 'posta'), 'e non esce dal recinto')

  // un elenco vuoto è un permesso vuoto, non «tutto»: è la differenza fra
  // un’automazione che può leggere niente e una senza restrizioni
  assert.deepEqual(claude.materiale('capannone', [], []), [], 'nessuna fonte concessa, niente materiale')
})

test('il recinto lo decide una funzione sola, e gli attrezzi che non leggono non restringono', async () => {
  const attrezzi = await import('./attrezzi.ts')
  // dichiarare la posta restringe alla posta
  assert.deepEqual(attrezzi.recinto(['posta.leggi']), ['posta', 'google', 'microsoft'])
  // due attrezzi si sommano, senza ripetizioni
  assert.deepEqual(attrezzi.recinto(['posta.leggi', 'desktop.leggi']),
    ['posta', 'google', 'microsoft', 'desktop'])
  // niente di dichiarato: nessun recinto, cioè il compito scritto a mano
  assert.equal(attrezzi.recinto([]), null)
  /*
   * E il caso che conta: un'automazione che chiede solo di far lavorare Claude
   * Code non ha dichiarato nessuna fonte, quindi non ne ha ristretta nessuna.
   * Restringerla a zero la spegnerebbe — ed è quello che faceva una prima
   * versione di questa modifica.
   */
  assert.equal(attrezzi.recinto(['claude.lavora']), null)
  assert.equal(attrezzi.recinto(['chat.leggi']), null)
})



/*
 * — la lista, dalla chat —
 *
 * Il guasto che queste prove tengono chiuso si racconta in una riga: ha detto a
 * Myynd in chat che tre cose erano fatte, e non è successo niente. Le righe
 * sono rimaste aperte e la rassegna ha continuato a nominarle il mattino dopo.
 * Mancavano due metà della stessa cosa — gli strumenti per chiudere e spostare,
 * e la lista con gli id dentro il prompt — e servono tutte e due: uno strumento
 * senza nessun id da nominare non si può chiamare, e un id nel prompt senza lo
 * strumento diventa un «l'ho segnata come fatta» a vuoto.
 *
 * Il modello è finto, come in punto.test.ts: un fornitore compatibile che
 * risponde con le chiamate agli strumenti che gli si dice di fare e si ricorda
 * tutto quello che ha ricevuto. Quello che si prova non è il ragionamento — è
 * che la chiamata arrivi fino allo store, e che un id inventato non si porti
 * via la risposta.
 */

const compatibile = await import('./compatibile.ts')

/** Un giro del modello finto: un po' di testo, e le chiamate da fare. */
type Giro = { testo?: string; chiamate?: { name: string; input: unknown }[]; fine?: string; prima?: () => void }

/**
 * Un fornitore compatibile finto, in streaming.
 *
 * Il giro degli strumenti passa da `flusso`, che legge SSE: la risposta va
 * servita a eventi, non come un JSON solo. Ogni giro consuma una voce di
 * `giri`; finite le voci, si ripete l'ultima.
 */
function fornitoreFinto(giri: Giro[]) {
  cfg.scrivi({ motore: 'compatibile', compatibile: { url: 'https://esempio.test/v1/', chiave: 'sk-prova', modello: 'gpt-prova' } })
  const ricevute: Record<string, unknown>[] = []
  let n = 0
  compatibile.usaRete((async (url: string | URL | Request, init?: RequestInit) => {
    /*
     * Il controllo «c'è qualcuno?» non è un giro del modello.
     *
     * Prima di ogni domanda la chat bussa all'elenco dei modelli: due secondi
     * di GET, per poter dire «accendi Ollama» invece di far girare a vuoto un
     * giro di strumenti. Qui va risposto — se no la chat si ferma prima di
     * cominciare — ma non va *contato*: contarlo spostava di uno tutte le
     * risposte preparate, e ogni prova sulla lista falliva per il motivo
     * sbagliato.
     */
    if (String(url).endsWith('/models')) return Response.json({ data: [{ id: 'gpt-prova' }] })
    ricevute.push(init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {})
    const g = giri[Math.min(n++, giri.length - 1)] ?? {}
    g.prima?.()
    const eventi: unknown[] = []
    if (g.testo) eventi.push({ id: 'x', model: 'gpt-prova', choices: [{ index: 0, delta: { content: g.testo } }] })
    for (const [i, c] of (g.chiamate ?? []).entries()) {
      eventi.push({ choices: [{ index: 0, delta: { tool_calls: [{ index: i, id: `t${n}-${i}`, function: { name: c.name, arguments: JSON.stringify(c.input) } }] } }] })
    }
    eventi.push({
      choices: [{ index: 0, delta: {}, finish_reason: g.fine ?? (g.chiamate?.length ? 'tool_calls' : 'stop') }],
      usage: { prompt_tokens: 10, completion_tokens: 10 }
    })
    const corpo = eventi.map(e => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n'
    return new Response(corpo, { headers: { 'content-type': 'text/event-stream' } })
  }) as typeof fetch)
  return ricevute
}

/** Gli attrezzi della chat: qui non devono fare niente, si prova l'altra metà. */
const attrezziFinti = () => ({ aggiungiCompito: () => ({ id: 'mai' }) })

const turni = (r: Record<string, unknown>) => (r.messages ?? []) as { role: string; content: string }[]

/*
 * Si guardano *tutte* le richieste, non la seconda.
 *
 * Chiudere una riga fa imparare a Myynd com'è andata, e quella riflessione
 * chiama il modello a sua volta — cioè questo stesso fornitore finto, un
 * momento dopo e per conto suo. Contare le richieste, o leggere `ricevute[1]`,
 * vuol dire scrivere una prova che passa o no a seconda di quanto è veloce la
 * macchina. Quello che conta è cosa è tornato al modello, e quello si trova
 * filtrando per quello che è: risultati di strumenti.
 */
const risultati = (ricevute: Record<string, unknown>[]) =>
  ricevute.flatMap(r => turni(r).filter(m => m.role === 'tool').map(m => String(m.content)))
/** Tutti i prompt di sistema arrivati al modello finto. */
const sistemi = (ricevute: Record<string, unknown>[]) =>
  ricevute.flatMap(r => turni(r).filter(m => m.role === 'system').map(m => String(m.content)))

after(() => compatibile.usaRete(null))

test('la lista con gli id entra nel prompt solo con gli strumenti in mano', () => {
  cfg.scrivi({})
  store.scriviCompito({ id: 'c-lista-1', testo: 'Richiamare Rossi', ordine: 'a', quando: 'oggi' })

  const conStrumenti = claude.sistema('', true)
  assert.match(conStrumenti, /\[c-lista-1\] Richiamare Rossi \(aperto, oggi\)/)
  assert.match(conStrumenti, /chiudi_compito/)
  assert.match(conStrumenti, /inventarne e non indovinarne/)

  // senza, la lista non c'è: mostrarla a chi non può toccarla fa dire «l'ho
  // segnata come fatta» a chi non ha segnato niente
  const senza = claude.sistema('')
  assert.doesNotMatch(senza, /c-lista-1/)
  assert.doesNotMatch(senza, /chiudi_compito/)

  store.scordaCompito('c-lista-1')
})

/*
 * — il prompt compatto —
 *
 * Il numero da cui nasce tutto, misurato sul suo Mac con Ollama e un modello
 * da nove miliardi di parametri: la preparazione del prompt va a
 * seicentocinquanta token al secondo. Due token di sistema, e la prima parola
 * arriva in sei decimi di secondo; settemila token di sistema, e ne servono
 * dieci e mezzo. Quindi la lunghezza del prompt *è* il tempo di attesa, e
 * seimila caratteri — millecinquecento token scarsi — sono i due secondi e
 * mezzo che rendono la chat una chat.
 *
 * Il tetto qui sotto non è un'opinione sullo stile: è quel conto.
 */

/** Un conto pieno: venti righe in lista, il ritratto lungo e qualche convinzione. */
function contoCarico() {
  cfg.scrivi({ nome: 'Tobia', ruolo: 'fondatore di un’azienda di software' })
  store.scriviBlocco({
    etichetta: 'scrittura',
    descrizione: 'Il tono e le abitudini di scrittura',
    valore: 'Apre con «Ciao» e il nome, chiude con «Un caro saluto». Non usa mai il punto esclamativo. ' +
      'Preferisce le frasi corte. Con i clienti dà del lei, con i fornitori del tu. '.repeat(6),
    tetto: 2000
  })
  store.scriviBlocco({
    etichetta: 'lavoro',
    descrizione: 'Come lavora',
    valore: 'Lavora al mattino presto e non risponde alle mail dopo le sette di sera. '.repeat(12),
    tetto: 2000
  })
  for (let i = 0; i < 12; i++) {
    store.ricorda({
      enunciato: `Con il cliente numero ${i} non si fanno sconti sul prezzo di listino, mai, per nessuna ragione.`,
      ambito: i % 2 ? 'persona' : 'azienda', genere: 'esplicita', fiducia: 0.9, origine: 'prova'
    })
  }
  for (let i = 0; i < 20; i++) {
    store.scriviCompito({
      id: `c-carico-${i}`, ordine: `z${i}`, quando: ['oggi', 'settimana', 'poi'][i % 3],
      testo: `Riga numero ${i} della sua lista, scritta lunga come le scrive lei davvero`
    })
  }
}

function scaricaIlConto() {
  for (let i = 0; i < 20; i++) store.scordaCompito(`c-carico-${i}`)
}

test('con un modello di casa il prompt sta sotto i seimila caratteri, con Claude resta intero', () => {
  contoCarico()
  const domanda = 'cosa devo al cliente numero 3'

  const compatto = claude.sistema(domanda, true, true)
  const intero = claude.sistema(domanda, true)

  assert.ok(compatto.length < 6000,
    `il prompt compatto è ${compatto.length} caratteri: sopra i seimila la prima parola arriva dopo dieci secondi`)
  // e non è compatto per caso: quello intero, con questo conto, è ben oltre
  assert.ok(intero.length > 6000, `il prompt intero è solo ${intero.length} caratteri: la prova non sta misurando niente`)
  assert.ok(intero.length > compatto.length * 2)

  // quello che resta: la voce, il ritratto, la lista con gli id, gli strumenti
  assert.match(compatto, /Sei Myynd/)
  assert.match(compatto, /Cita le fonti col numero fra parentesi quadre/)
  assert.match(compatto, /Tobia/)
  assert.match(compatto, /\[c-carico-\d+\]/)
  assert.match(compatto, /chiudi_compito/)
  // otto righe di lista, non venticinque
  assert.equal([...compatto.matchAll(/\[c-carico-\d+\]/g)].length, 8)
  assert.equal([...intero.matchAll(/\[c-carico-\d+\]/g)].length, 20)

  /*
   * L'ordine, che vale quanto la lunghezza.
   *
   * Ollama tiene in cache il prefisso comune fra due domande della stessa
   * chat. Se la parte che cambia — la lista, chi c'entra con la domanda —
   * stesse in mezzo, quella cache non servirebbe a niente e ogni giro
   * ripagherebbe il prompt intero.
   */
  assert.ok(compatto.indexOf('Chi ti parla') < compatto.indexOf('Quello che ha in lista'),
    'prima quello che non cambia, poi quello che cambia a ogni domanda')

  scaricaIlConto()
})

test('il prompt compatto arriva davvero al fornitore, e con lui tre documenti e non sedici', async () => {
  contoCarico()
  store.salvaDocumenti(Array.from({ length: 8 }, (_, i) =>
    doc(`posta:INBOX:compatto-${i}`, `Preventivo numero ${i} per il cliente`, {
      corpo: `Il corpo del preventivo numero ${i}, lungo come sono lunghe le email vere. `.repeat(60)
    })
  ))
  const ricevute = fornitoreFinto([{ testo: 'Ecco.' }])
  await claude.rispondiInStreaming('preventivo cliente', [], () => {}, attrezziFinti())

  const s = sistemi(ricevute)[0] ?? ''
  assert.ok(s.length < 6000, `il prompt arrivato al modello è ${s.length} caratteri`)

  const materiale = turni(ricevute[0]).find(m => m.role === 'user' && /Materiale:/.test(String(m.content)))
  const quanti = [...String(materiale?.content ?? '').matchAll(/^\[\d+\] /gm)].length
  assert.ok(quanti > 0 && quanti <= 3, `documenti nel materiale: ${quanti}`)

  store.svuotaFonte('posta')
  scaricaIlConto()
})

test('concise cloud chat preserves full saved memory, project goals and task identities', async () => {
  contoCarico()
  const progetti = await import('./progetti.ts')
  const p = progetti.scrivi({ nome: 'Quietbridge', obiettivo: 'Validate the complete customer workflow' })
  store.scriviBlocco({ etichetta: 'decisioni', descrizione: 'Decision rules', valore: 'PRESERVE_EXPLICIT_RULE: Never publish customer details.', tetto: 1000 })
  const domanda = 'Help me think through Quietbridge'
  const full = claude.sistema(domanda, true)
  const short = claude.sistema(domanda, true, false, true)
  assert.ok(short.length < full.length - 2500, `${short.length} vs ${full.length}`)
  assert.match(short, /PRESERVE_EXPLICIT_RULE: Never publish customer details/)
  assert.match(short, /cliente numero 11/)
  assert.match(short, /Quietbridge: Validate the complete customer workflow/)
  assert.equal([...short.matchAll(/\[c-carico-\d+\]/g)].length, 20)
  const request = claude.corpoRichiesta(domanda, [], [], true)
  assert.match(claude.testoDi(request.system), /PRESERVE_EXPLICIT_RULE/)
  assert.ok(claude.testoDi(request.system).length < full.length - 2000)
  progetti.chiudi(p.id)
  scaricaIlConto()
})

test('bounded initial chat evidence can expand an already numbered source through search', async () => {
  const documents = Array.from({ length: 8 }, (_, i) => doc(`desktop:widechat-${i}`, `Widechat specification ${i}`, {
    fonte: 'desktop', tipo: 'documento', corpo: 'Widechat specification context. '.repeat(65) + `DEEPLY_READ_${i}: Customer approval is required.`
  }))
  store.salvaDocumenti(documents)
  const docs = claude.materialeChat('Widechat specification', [])
  assert.equal(docs.length, 6)
  const request = claude.corpoRichiesta('Widechat specification', [], docs)
  const initial = claude.testoDi(request.messages.at(-1)?.content)
  assert.doesNotMatch(initial, /DEEPLY_READ_/)
  assert.match(claude.testoDi(request.system), /stesso numero/)
  const first = claude.materialeChat('Widechat specification', [], true)[0]
  const marker = first.corpo.match(/DEEPLY_READ_\d+/)![0]
  const ricevute = fornitoreFinto([
    { chiamate: [{ name: 'cerca', input: { query: first.titolo } }] },
    { testo: 'Customer approval is required. [1]' }
  ])
  const result = await claude.rispondiInStreaming('Widechat specification', [], () => {})
  assert.ok(risultati(ricevute).some(s => s.includes(marker) && s.includes(`[1] ${first.titolo}`)))
  assert.deepEqual(result.fonti.map(f => f.id), [first.id])
  for (const d of documents) store.default.prepare('DELETE FROM documenti WHERE id = ?').run(d.id)
})

test('«l’ho fatta» detto in chat chiude davvero la riga', async () => {
  store.scriviCompito({ id: 'c-chiudi', testo: 'Mandare il preventivo a Rossi', ordine: 'a', quando: 'oggi' })
  const ricevute = fornitoreFinto([
    { chiamate: [{ name: 'chiudi_compito', input: { id: 'c-chiudi', nota: 'mandato lunedì col listino nuovo' } }] },
    { testo: 'Segnata: il preventivo a Rossi è chiuso.' }
  ])

  const r = await claude.rispondiInStreaming('il preventivo a Rossi l’ho mandato', [], () => {}, attrezziFinti())
  assert.match(r.testo, /chiuso/, 'la risposta arriva')

  const c = store.compito('c-chiudi')
  assert.equal(c?.stato, 'fatto')
  assert.equal(c?.esito, 'mandato lunedì col listino nuovo', 'le sue parole restano sulla riga')
  assert.ok(c?.chiuso, 'e resta scritto quando')
  // non è più in lista, che è poi la cosa che guarda la rassegna
  assert.ok(!store.elencoCompiti().some(x => x.id === 'c-chiudi'), 'è uscita dalla lista')

  // e il modello lo sa, perché glielo si è detto
  assert.ok(risultati(ricevute).some(t => /Chiusa come «fatto»: Mandare il preventivo a Rossi/.test(t)),
    'il risultato dello strumento dice cos’è successo')
  // la lista che ha letto nel prompt aveva quella riga, con il suo id
  assert.ok(sistemi(ricevute).some(s => s.includes('[c-chiudi] Mandare il preventivo a Rossi')),
    'l’id era nel prompt, altrimenti non avrebbe potuto nominarlo')
})

test('«lascia perdere» la chiude come lasciata', async () => {
  store.scriviCompito({ id: 'c-lasciata', testo: 'Chiamare lo studio', ordine: 'b', quando: 'settimana' })
  fornitoreFinto([
    { chiamate: [{ name: 'chiudi_compito', input: { id: 'c-lasciata', esito: 'lasciato', nota: 'hanno chiamato loro' } }] },
    { testo: 'Lasciata perdere.' }
  ])
  await claude.rispondiInStreaming('lo studio lascia perdere, hanno chiamato loro', [], () => {}, attrezziFinti())
  assert.equal(store.compito('c-lasciata')?.stato, 'lasciato')
  assert.equal(store.compito('c-lasciata')?.esito, 'hanno chiamato loro')
})

test('un id inventato e una riga già chiusa si rifiutano, senza portarsi via la risposta', async () => {
  store.scriviCompito({ id: 'c-gia-chiusa', testo: 'Pagare la fattura di marzo', ordine: 'c', quando: 'oggi' })
  store.cambiaStatoCompito('c-gia-chiusa', 'fatto')

  const ricevute = fornitoreFinto([
    {
      chiamate: [
        { name: 'chiudi_compito', input: { id: 'c-che-non-esiste' } },
        { name: 'chiudi_compito', input: { id: 'c-gia-chiusa' } },
        { name: 'sposta_compito', input: { id: 'c-che-non-esiste', quando: 'poi' } }
      ]
    },
    { testo: 'Di quale riga stai parlando?' }
  ])

  const r = await claude.rispondiInStreaming('quelle tre falle fuori', [], () => {}, attrezziFinti())
  assert.match(r.testo, /Di quale riga/, 'la risposta arriva lo stesso')

  const detti = risultati(ricevute)
  assert.equal(detti.filter(t => /nessuna riga con quell'id/.test(t)).length, 2,
    'i due id inventati si rifiutano, e si dice perché')
  assert.ok(detti.some(t => /già chiusa \(fatto\)/.test(t)), 'e una riga già chiusa non si richiude')
  // e nessuna delle tre ha toccato niente
  assert.equal(store.compito('c-gia-chiusa')?.stato, 'fatto')
})

test('«questa la faccio venerdì» sposta il giorno, e cambiare scaffale porta via il giorno di prima', async () => {
  store.scriviCompito({ id: 'c-sposta', testo: 'Rileggere il contratto', ordine: 'd', quando: 'oggi' })

  fornitoreFinto([
    { chiamate: [{ name: 'sposta_compito', input: { id: 'c-sposta', giorno: '2026-09-18', quando: 'settimana' } }] },
    { testo: 'Spostata a venerdì.' }
  ])
  await claude.rispondiInStreaming('il contratto lo rileggo venerdì', [], () => {}, attrezziFinti())
  const venerdi = store.compito('c-sposta')
  assert.equal(venerdi?.giorno, '2026-09-18')
  assert.equal(venerdi?.quando, 'settimana')

  // cambiare scaffale senza dare un giorno nuovo porta via quello vecchio: una
  // data fissata dentro «poi» non vuol dire niente
  fornitoreFinto([
    { chiamate: [{ name: 'sposta_compito', input: { id: 'c-sposta', quando: 'poi' } }] },
    { testo: 'Messa in «poi».' }
  ])
  await claude.rispondiInStreaming('il contratto rimandalo a poi', [], () => {}, attrezziFinti())
  const poi = store.compito('c-sposta')
  assert.equal(poi?.quando, 'poi')
  assert.equal(poi?.giorno, null)

  // e una data scritta storta si rifiuta invece di finire in tabella
  const ricevute = fornitoreFinto([
    { chiamate: [{ name: 'sposta_compito', input: { id: 'c-sposta', giorno: '18/09/2026' } }] },
    { testo: 'Com’è il giorno?' }
  ])
  await claude.rispondiInStreaming('il contratto al diciotto', [], () => {}, attrezziFinti())
  assert.ok(risultati(ricevute).some(t => /AAAA-MM-GG/.test(t)), 'il giorno storto si rifiuta')
  assert.equal(store.compito('c-sposta')?.giorno, null)
})

test('a conversation-only follow-up carries prior project and client context without unrelated documents', async () => {
  const progetti = await import('./progetti.ts')
  const p = progetti.scrivi({ nome: 'Nebulosa', obiettivo: 'Validate the portal with three customers' })
  store.ricorda({ enunciato: 'Zyphora requires the compact proposal format', ambito: 'cliente:Zyphora', genere: 'esplicita', fiducia: 1, origine: 'test' })
  const ricevute = fornitoreFinto([{ testo: 'Your Nebulosa goal is to validate the portal with three customers.' }])
  const r = await claude.rispondiInStreaming('And what is my goal?', [{ ruolo: 'u', testo: 'I am working on Nebulosa with Zyphora.' }], () => {})
  assert.match(r.testo, /Nebulosa/)
  assert.ok(sistemi(ricevute).some(s => s.includes('Nebulosa: Validate the portal with three customers')))
  assert.ok(sistemi(ricevute).some(s => s.includes('Zyphora requires the compact proposal format')))
  progetti.chiudi(p.id)
})

test('delegation delivers only final work and preserves the exact originating note', async () => {
  const d = doc('desktop:delegation-note', 'Portal release decision', { fonte: 'desktop', tipo: 'note', corpo: 'Release only after customer validation.', percorso: '/portal.md' })
  store.salvaDocumenti([d])
  const ricevute = fornitoreFinto([
    { testo: 'First I will open the source and inspect it. ', chiamate: [{ name: 'apri', input: { id: d.id } }] },
    { testo: 'Release checklist\n\nValidate with three customers before launch. Source [1].' }
  ])
  const r = await claude.svolgi('Prepare the release checklist', null, 'bozza', [], null, undefined, d.id)
  assert.doesNotMatch(r.testo, /First I will/)
  assert.match(r.testo, /^Release checklist/)
  assert.deepEqual(r.fonti.map(f => f.id), [d.id])
  const materiale = turni(ricevute[0]).filter(m => m.role === 'user').map(m => m.content).join('\n')
  assert.match(materiale, /fonte precisa della riga/)
  assert.doesNotMatch(materiale, /Rispondi a questo messaggio/)
})

test('delegation does not mark truncated prose or a missing source as finished work', async () => {
  fornitoreFinto([{ testo: 'The half-written artifact', fine: 'length' }])
  await assert.rejects(() => claude.svolgi('Prepare a release plan'), /interrotto prima di essere completo/)
  const ricevute = fornitoreFinto([{ testo: 'A different message would be a wrong source.' }])
  await assert.rejects(() => claude.svolgi('Reply to the email', null, 'bozza', [], null, undefined, 'missing-source-id'), /source.*no longer available|fonte.*più disponibile/)
  assert.equal(ricevute.length, 0)
})

test('compatible delegation starts with bounded evidence and can read the exact source more deeply', async () => {
  const d = doc('desktop:compact-work-evidence', 'Lunarbridge release specification', {
    fonte: 'desktop', tipo: 'documento', corpo: 'Lunarbridge customer validation. '.repeat(130) + 'Release condition: written customer approval.'
  })
  store.salvaDocumenti([d])
  const ricevute = fornitoreFinto([
    { chiamate: [{ name: 'apri', input: { id: d.id } }] },
    { testo: 'Release only with written customer approval. [1]' }
  ])
  const r = await claude.svolgi('Prepare the Lunarbridge release decision', null, 'bozza', [], null, undefined, d.id)
  const first = turni(ricevute[0]).filter(m => m.role === 'user').map(m => m.content).join('\n')
  assert.match(first, /estratti: usa apri/)
  assert.doesNotMatch(first, /Release condition: written customer approval/)
  assert.ok(risultati(ricevute).some(s => s.includes('Release condition: written customer approval.')))
  assert.deepEqual(r.fonti.map(f => f.id), [d.id])
})

test('project planning cannot retrieve archived or completed work through later tools', async () => {
  const progetti = await import('./progetti.ts')
  const p = progetti.scrivi({ nome: 'Cedarwing', obiettivo: 'Improve internal AI support systems' })
  const old = doc('posta:cedar-archive', 'Cedarwing culture academy', { corpo: 'ARCHIVE_ONLY: Please review the old school courses.', quando: new Date(Date.now() - 90 * 86_400_000).toISOString() })
  const done = doc('posta:cedar-done', 'Cedarwing finished pilot', { corpo: 'DONE_ONLY: Could you review the completed pilot?', quando: new Date().toISOString() })
  store.salvaDocumenti([old, done])
  store.scriviCompito({ id: 'cedar-finished', testo: 'Review pilot', doc: done.id, ordine: 'cedar' })
  store.cambiaStatoCompito('cedar-finished', 'fatto')
  cfg.scrivi({ posta: { host: 'imap.example.test', porta: 993, utente: 'me@example.test', password: 'test' } })
  const question = 'Prepare three practical next steps for Cedarwing from its saved goal.'
  const ricevute = fornitoreFinto([
    { chiamate: [
      { name: 'cerca', input: { query: 'Cedarwing' } },
      { name: 'posta_leggi', input: { query: 'Cedarwing' } },
      { name: 'apri', input: { id: old.id } },
      { name: 'apri', input: { id: done.id } }
    ] },
    { testo: 'Proposed plan from your saved goal: choose one support workflow, measure its baseline, test a small pilot. Current status is unknown.' }
  ])
  await claude.svolgi(question, null, 'bozza', ['posta.leggi'])
  const initial = turni(ricevute[0]).filter(m => m.role === 'user').map(m => m.content).join('\n')
  assert.match(initial, /obiettivo registrato/)
  assert.doesNotMatch(initial, /Prova a cercare con altre parole|ARCHIVE_ONLY|DONE_ONLY/)
  assert.equal(risultati(ricevute).length, 4)
  assert.ok(risultati(ricevute).every(t => t.includes('Non ci sono nuove fonti attuali pertinenti')))
  assert.ok(risultati(ricevute).every(t => !/ARCHIVE_ONLY|DONE_ONLY/.test(t)))
  const pin = fornitoreFinto([
    { chiamate: [{ name: 'apri', input: { id: old.id } }] },
    { testo: 'The explicitly selected archive describes old courses. [1]' }
  ])
  const pinned = await claude.svolgi(question, null, 'bozza', [], null, undefined, old.id)
  assert.ok(risultati(pin).some(t => t.includes('ARCHIVE_ONLY')))
  assert.deepEqual(pinned.fonti.map(f => f.id), [old.id])
  progetti.chiudi(p.id)
})

test('current-project chat planning filters its initial evidence and later searches without claiming universal knowledge', async () => {
  const progetti = await import('./progetti.ts')
  const p = progetti.scrivi({ nome: 'Firhaven', obiettivo: 'Improve internal AI support systems' })
  const recent = new Date().toISOString()
  const old = doc('posta:fir-old', 'Firhaven old academy', { corpo: 'OLD_FIR_EVIDENCE: Please prepare educational content.', quando: new Date(Date.now() - 90 * 86_400_000).toISOString() })
  const done = doc('posta:fir-done', 'Firhaven completed builder pilot', { corpo: 'DONE_FIR_EVIDENCE: Could you review this pilot?', quando: recent })
  const bulk = doc('posta:fir-bulk', 'Firhaven academy newsletter', { corpo: 'BULK_FIR_EVIDENCE: Join our courses. Unsubscribe from this newsletter.', autore: 'News <newsletter@example.test>', quando: recent })
  const unrelated = doc('posta:fir-other', 'Otherstudio approval request', { corpo: 'OTHER_FIR_EVIDENCE: Could you approve this pilot?', quando: recent })
  store.salvaDocumenti([old, done, bulk, unrelated])
  store.scriviCompito({ id: 'fir-completed', testo: 'Review the pilot', doc: done.id, ordine: 'fir' })
  store.cambiaStatoCompito('fir-completed', 'fatto')
  const question = 'What should I work on next for Firhaven based on my saved goal and current evidence? If there is no fresh evidence, clearly separate your proposal from things I actually owe someone. Do not create tasks or send anything.'
  assert.deepEqual(claude.materiale(question, []), [])
  const ricevute = fornitoreFinto([
    { chiamate: [{ name: 'cerca', input: { query: 'Firhaven' } }, { name: 'cerca', input: { query: 'Otherstudio' } }] },
    { testo: 'I found no current assigned request in connected sources. Proposed next step: select one internal support workflow to validate against your saved goal.' }
  ])
  const result = await claude.rispondiInStreaming(question, [{ ruolo: 'a', testo: 'PREVIOUS_FIR_CLAIM: The old academy announcement is your current obligation. [1]' }], () => {})
  const prompts = ricevute.flatMap(r => turni(r).map(t => t.content)).join('\n')
  assert.doesNotMatch(prompts, /OLD_FIR_EVIDENCE|DONE_FIR_EVIDENCE|BULK_FIR_EVIDENCE|OTHER_FIR_EVIDENCE|PREVIOUS_FIR_CLAIM/)
  assert.match(prompts, /Non ho trovato richieste assegnate attuali nelle fonti collegate/)
  assert.match(prompts, /non concludere che la persona non deve nulla a nessuno/)
  assert.equal(risultati(ricevute).length, 2)
  assert.ok(risultati(ricevute).every(r => r.includes('La copertura delle fonti è limitata')))
  assert.deepEqual(result.fonti, [])
  assert.ok(claude.materiale('Summarize the historical Firhaven academy announcement', []).some(d => d.id === old.id))
  const current = doc('posta:fir-current', 'Firhaven support pilot approval', { corpo: 'CURRENT_FIR_EVIDENCE: Could you approve the internal support pilot?', quando: recent })
  store.salvaDocumenti([current])
  assert.deepEqual(claude.materiale(question, []).map(d => d.id), [current.id])
  progetti.chiudi(p.id)
})

test('saved direct-email policy constrains summary tools and an automatic origin is not a manual pin', async () => {
  const progetti = await import('./progetti.ts')
  const p = progetti.scrivi({ nome: 'Redwood', obiettivo: 'Improve customer support' })
  const base = { quando: new Date().toISOString(), autore: 'Alex <alex@example.com>' }
  const current = doc('posta:red-current', 'Redwood approval request', { ...base, corpo: 'CURRENT_OK: Could you confirm the Redwood pilot?' })
  const old = doc('posta:red-old', 'Redwood old school programme', { ...base, corpo: 'EXCLUDED_ARCHIVE: Please review the course.', quando: new Date(Date.now() - 90 * 86_400_000).toISOString() })
  const dismissed = doc('posta:red-dismissed', 'Redwood outdated scope', { ...base, corpo: 'EXCLUDED_DISMISSED: Could you confirm the obsolete scope?' })
  const unrelated = doc('posta:red-unrelated', 'Maple supplier approval', { ...base, corpo: 'EXCLUDED_OTHER: Could you approve the unrelated supplier?' })
  store.salvaDocumenti([current, old, dismissed, unrelated])
  store.scriviCompito({ id: 'red-dismissal', testo: 'Old scope', doc: dismissed.id, ordine: 'red' })
  store.cambiaStatoCompito('red-dismissal', 'lasciato')
  const policy = { selezione: 'richieste-dirette' as const, ambitoSelezione: 'Redwood' }
  const question = 'Summarize new direct human email requests.'
  const requests = fornitoreFinto([
    { chiamate: [
      { name: 'cerca', input: { query: 'approval' } },
      { name: 'posta_leggi', input: { query: 'Redwood' } },
      { name: 'apri', input: { id: old.id } },
      { name: 'apri', input: { id: unrelated.id } }
    ] },
    { testo: 'Alex asks you to confirm the Redwood pilot. [1]' }
  ])
  const result = await claude.svolgi(question, null, 'bozza', ['posta.leggi'], null, undefined, current.id, policy)
  assert.deepEqual(result.fonti.map(f => f.id), [current.id])
  assert.deepEqual(result.verificaDocumenti, [current.id])
  assert.ok(risultati(requests).every(t => !/EXCLUDED_/.test(t)))
  const noCalls = fornitoreFinto([{ testo: 'Must never run for a stale automatic origin.' }])
  await assert.rejects(() => claude.svolgi(question, null, 'bozza', [], null, undefined, old.id, policy), /non è più una richiesta attuale/)
  assert.equal(noCalls.length, 0)
  // Feedback received while the model is writing must invalidate the result.
  store.scriviCompito({ id: 'red-race', testo: 'Review current pilot', doc: current.id, ordine: 'red-race' })
  fornitoreFinto([{ prima: () => store.cambiaStatoCompito('red-race', 'fatto'), testo: 'Reply about Redwood. [1]' }])
  await assert.rejects(() => claude.svolgi(question, null, 'bozza', [], null, undefined, current.id, policy), /mentre preparavo il risultato/)
  progetti.chiudi(p.id)
})
