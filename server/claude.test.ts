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
  cfg.scrivi({})
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
  cfg.scrivi({ microsoft: { clientId: 'x', refresh: 'y', parti: ['posta'] } })
  assert.match(claude.inMano(), /Quello che puoi leggere: la posta/)

  // solo i file: SharePoint sì, la posta no
  cfg.scrivi({ microsoft: { clientId: 'x', refresh: 'y', parti: ['file'] } })
  const r = claude.inMano()
  assert.match(r, /Quello che puoi leggere:[^.]*SharePoint/)
  assert.match(r, /NON è collegato[^.]*la posta/)
})

test('la posta via IMAP conta come sempre', () => {
  cfg.scrivi({ posta: { host: 'imap.esempio.it', porta: 993, utente: 'io@esempio.it', password: 'x' } })
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
type Giro = { testo?: string; chiamate?: { name: string; input: unknown }[] }

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
  compatibile.usaRete((async (_url: string | URL | Request, init?: RequestInit) => {
    ricevute.push(init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {})
    const g = giri[Math.min(n++, giri.length - 1)] ?? {}
    const eventi: unknown[] = []
    if (g.testo) eventi.push({ id: 'x', model: 'gpt-prova', choices: [{ index: 0, delta: { content: g.testo } }] })
    for (const [i, c] of (g.chiamate ?? []).entries()) {
      eventi.push({ choices: [{ index: 0, delta: { tool_calls: [{ index: i, id: `t${n}-${i}`, function: { name: c.name, arguments: JSON.stringify(c.input) } }] } }] })
    }
    eventi.push({
      choices: [{ index: 0, delta: {}, finish_reason: g.chiamate?.length ? 'tool_calls' : 'stop' }],
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
