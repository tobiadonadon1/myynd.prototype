// Quello che Jev cambia davvero, provato dove cambia.
//
// `jev.test.ts` prova il filo; qui si prova la differenza: una mail che nessuno
// aspetta esce dalla fila, una che aspetta da venerdì passa davanti, e una
// riga nella lista non nasce più per un «grazie, ricevuto». Tutte con Jev
// finto — la prova non deve chiamare TypeSafe, e nemmeno saper leggere.
//
// L'ultima prova è la più importante di tutto il file: **senza chiave non
// cambia niente**. È la promessa su cui si regge il permesso di mettere Jev in
// mezzo a quattro strade dell'app.
//
//   node --test server/giudizi.test.ts

import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Documento } from './store.ts'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-giudizi-'))
mkdirSync(join(CASA, '.myynd'), { recursive: true })
const CASA_VERA = process.env.HOME
process.env.HOME = CASA
process.env.MYYND_DATI = join(CASA, '.myynd')
delete process.env.MYYND_TYPESAFE
writeFileSync(join(CASA, '.myynd', 'config.json'),
  JSON.stringify({ lingua: 'en', jev: { apiKey: 'apikey_prova' } }), { mode: 0o600 })

const store = await import('./store.ts')
const cfg = await import('./config.ts')
const jev = await import('./jev.ts')
const giudizi = await import('./giudizi.ts')
const auto = await import('./automazioni.ts')

const ORA = Date.now()
const mail = (id: string, patch: Partial<Documento> = {}): Documento => ({
  id, fonte: 'posta', tipo: 'email', titolo: 'Preventivo',
  corpo: 'Ciao Tobia, mi confermi il preventivo entro venerdì?',
  autore: `${id} <${id}@example.com>`,
  quando: new Date(ORA - 3_600_000).toISOString(), ...patch
})

/** Jev finto: risponde guardando l'id del documento che gli arriva. */
function jevDice(quanto: (id: string) => { chiede: number; urgenza: number; genere: string }) {
  jev.perProva(async (_u, opz) => {
    const stato = JSON.parse(String((opz as RequestInit).body)).state as { documento: { titolo: string } }
    const id = stato.documento.titolo
    const v = quanto(id)
    return new Response(JSON.stringify({
      answers: {
        chiede: { type: 'noul', noul: v.chiede },
        urgenza: { type: 'score', score: v.urgenza, confidence: 0.9, probabilities: {}, legend: {} },
        genere: { type: 'choice', choice: v.genere, confidence: 0.8, probabilities: { [v.genere]: 0.8 } },
        peso: { type: 'score', score: v.urgenza, confidence: 0.9, probabilities: {}, legend: {} }
      }
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  })
}

beforeEach(() => {
  store.azzeraTutto()
  cfg.scrivi({ lingua: 'en', jev: { apiKey: 'apikey_prova' } })
  jev.dimentica(); jev.perProva(null); giudizi.scorda(); auto.perProva(null)
})
after(() => {
  jev.perProva(null); auto.perProva(null); store.chiudiIndici()
  process.env.HOME = CASA_VERA
  rmSync(CASA, { recursive: true, force: true })
})

// — i giudizi —

test('lo stesso documento si giudica una volta sola, anche fra due letture', async () => {
  let chiamate = 0
  jevDice(() => { chiamate++; return { chiede: 0.9, urgenza: 2, genere: 'richiesta' } })
  const docs = [mail('a', { titolo: 'a' }), mail('b', { titolo: 'b' })]
  assert.equal((await giudizi.attenzione(docs)).size, 2)
  assert.equal(chiamate, 2)
  const ancora = await giudizi.attenzione(docs)
  assert.equal(ancora.size, 2)
  assert.equal(chiamate, 2, 'la seconda lettura non ha richiesto niente')
  assert.equal(ancora.get('a')?.chiede, 0.9)
})

test('chi non aspetta nessuno esce dalla fila, chi aspetta passa davanti', async () => {
  const docs = [
    mail('grazie', { titolo: 'grazie', corpo: 'Grazie mille, ricevuto tutto. Ti aggiorno io.' }),
    mail('vecchia-urgente', { titolo: 'vecchia-urgente' }),
    mail('fattura', { titolo: 'fattura', corpo: 'F24 da pagare entro il 30.' })
  ]
  jevDice(id =>
    id === 'grazie' ? { chiede: 0.04, urgenza: 0.1, genere: 'aggiornamento' } :
    id === 'fattura' ? { chiede: 0.2, urgenza: 1.5, genere: 'scadenza' } :
    { chiede: 0.95, urgenza: 2.6, genere: 'richiesta' })
  const visti = await giudizi.attenzione(docs)
  const fila = giudizi.primaChiAspetta(docs, visti).map(d => d.id)
  // «grazie» non chiede niente e non scade: in fondo, ed era il primo della
  // fila. Ma non esce: Jev ordina, i trenta posti tagliano. La fattura non
  // «chiede» — nessuno insiste — ma una scadenza sta sempre nella fila.
  assert.deepEqual(fila, ['vecchia-urgente', 'fattura', 'grazie'])
  // la soglia si può ancora passare come numero: con una soglia bassissima «grazie» è nella fila, ultimo per punteggio
  assert.deepEqual(giudizi.primaChiAspetta(docs, visti, 0.01).map(d => d.id), ['vecchia-urgente', 'fattura', 'grazie'])
})

test('davanti e dietro: chi chiama mette in testa e in coda, con Jev e senza', async () => {
  const docs = [
    mail('a', { titolo: 'a' }), mail('b', { titolo: 'b' }), mail('c', { titolo: 'c' }), mail('d', { titolo: 'd' }), mail('e', { titolo: 'e' })
  ]
  jevDice(id =>
    id === 'a' ? { chiede: 0.02, urgenza: 0.1, genere: 'aggiornamento' } :
    id === 'e' ? { chiede: 0.99, urgenza: 3, genere: 'richiesta' } :
    { chiede: 0.5, urgenza: 1, genere: 'richiesta' })
  const visti = await giudizi.attenzione(docs)
  // «a» non chiede niente ma sta fra i davanti: passa in testa lo stesso; «e» è il più urgente ma sta fra i dietro
  assert.deepEqual(giudizi.primaChiAspetta(docs, visti, { davanti: new Set(['a']), dietro: new Set(['e']) }).map(d => d.id), ['a', 'b', 'c', 'd', 'e'])
  // davanti vince su dietro, e l'ordine dentro le fasce è quello di arrivo
  assert.deepEqual(giudizi.primaChiAspetta(docs, visti, { davanti: new Set(['d', 'c']), dietro: new Set(['c']) }).map(d => d.id), ['c', 'd', 'e', 'b', 'a'])
  // senza Jev: davanti, la fila com'era, dietro
  assert.deepEqual(giudizi.primaChiAspetta(docs, new Map(), { davanti: new Set(['e']), dietro: new Set(['a']) }).map(d => d.id), ['e', 'b', 'c', 'd', 'a'])
  assert.equal(giudizi.chiedeNoto('a'), 0.02)
  assert.equal(giudizi.chiedeNoto('mai-visto'), null)
})

test('un documento senza giudizio resta dov’era, in mezzo', async () => {
  const docs = [mail('muto', { titolo: 'muto' }), mail('chiede', { titolo: 'chiede' }), mail('rumore', { titolo: 'rumore' })]
  // Jev risponde su due soli: il terzo non ha risposta, e non è un motivo per buttarlo
  jev.perProva(async (_u, opz) => {
    const stato = JSON.parse(String((opz as RequestInit).body)).state as { documento: { titolo: string } }
    if (stato.documento.titolo === 'muto') throw new Error('caduta')
    const chiede = stato.documento.titolo === 'chiede' ? 0.95 : 0.02
    return new Response(JSON.stringify({ answers: {
      chiede: { type: 'noul', noul: chiede },
      urgenza: { type: 'score', score: chiede * 3, confidence: 0.9, probabilities: {}, legend: {} },
      genere: { type: 'choice', choice: 'richiesta', confidence: 0.8, probabilities: { richiesta: 0.8 } }
    } }), { status: 200 })
  })
  const fila = giudizi.primaChiAspetta(docs, await giudizi.attenzione(docs)).map(d => d.id)
  assert.deepEqual(fila, ['chiede', 'muto', 'rumore'])
})

test('senza chiave la fila non si tocca: nessuna chiamata, nessun cambiamento', async () => {
  cfg.scrivi({ lingua: 'en' }, { togli: ['jev'] })
  let chiamate = 0
  jev.perProva(async () => { chiamate++; return new Response('{}', { status: 200 }) })
  const docs = [mail('uno', { titolo: 'uno' }), mail('due', { titolo: 'due' }), mail('tre', { titolo: 'tre' })]
  const visti = await giudizi.attenzione(docs)
  assert.equal(chiamate, 0)
  assert.equal(visti.size, 0)
  assert.deepEqual(giudizi.primaChiAspetta(docs, visti).map(d => d.id), ['uno', 'due', 'tre'])
  assert.deepEqual(giudizi.primaQuelloCheConta(docs, await giudizi.peso(docs)).map(d => d.id), ['uno', 'due', 'tre'])
})

test('il peso rimette in ordine il materiale delle priorità', async () => {
  const docs = [mail('ieri', { titolo: 'ieri' }), mail('aperto', { titolo: 'aperto' }), mail('chiuso', { titolo: 'chiuso' })]
  jevDice(id => ({ chiede: 0, urgenza: id === 'aperto' ? 3 : id === 'ieri' ? 1.5 : 0.1, genere: 'aggiornamento' }))
  const pesi = await giudizi.peso(docs)
  assert.deepEqual(giudizi.primaQuelloCheConta(docs, pesi).map(d => d.id), ['aperto', 'ieri', 'chiuso'])
})

// — quattro domande in una chiamata, e una memoria che resta —

test('la quarta domanda viaggia con le altre tre: il peso si legge dalla memoria senza richiedere', async () => {
  let chiamate = 0
  jevDice(() => { chiamate++; return { chiede: 0.9, urgenza: 2, genere: 'richiesta' } })
  const docs = [mail('a', { titolo: 'a' }), mail('b', { titolo: 'b' })]
  const visti = await giudizi.attenzione(docs)
  assert.equal(visti.get('a')?.peso, 2)
  const pesi = await giudizi.peso(docs)
  assert.equal(chiamate, 2, 'il peso era già stato chiesto insieme al resto')
  assert.deepEqual([...pesi.entries()], [['a', 2], ['b', 2]])
  assert.equal(giudizi.priorDelDocumento('a'), 2, 'e l’urgenza del documento è il punto di partenza del peso di una carta')
  assert.equal(giudizi.priorDelDocumento('mai-visto'), null)
})

test('un Jev che risponde a tre domande su quattro vale lo stesso, e il peso si chiede dopo', async () => {
  let chiamate = 0
  jev.perProva(async () => {
    chiamate++
    return Response.json({ answers: {
      chiede: { type: 'noul', noul: 0.8 },
      urgenza: { type: 'score', score: 1.5, confidence: 0.9, probabilities: {}, legend: {} },
      genere: { type: 'choice', choice: 'richiesta', confidence: 0.8, probabilities: { richiesta: 0.8 } }
    } })
  })
  const docs = [mail('tre', { titolo: 'tre' })]
  const visti = await giudizi.attenzione(docs)
  assert.equal(visti.get('tre')?.chiede, 0.8)
  assert.equal(visti.get('tre')?.peso, undefined)
  assert.equal(jev.consumo().giudizi, 3, 'si contano le risposte date, non le domande fatte')
  jev.perProva(async () => { chiamate++; return Response.json({ answers: { peso: { type: 'score', score: 2.5, confidence: 0.9, probabilities: {}, legend: {} } } }) })
  assert.equal((await giudizi.peso(docs)).get('tre'), 2.5)
  assert.equal(chiamate, 2)
})

test('i giudizi sopravvivono a un riavvio: la memoria si svuota, il file nella cartella resta', async () => {
  let chiamate = 0
  jevDice(() => { chiamate++; return { chiede: 0.9, urgenza: 2, genere: 'richiesta' } })
  const docs = [mail('a', { titolo: 'a' }), mail('b', { titolo: 'b' })]
  await giudizi.attenzione(docs)
  assert.equal(chiamate, 2)
  const file = join(CASA, '.myynd', 'giudizi.json')
  assert.ok(existsSync(file), 'il file dei giudizi non è stato scritto')
  // un riavvio: la Map è vuota, il file no
  giudizi.scorda({ soloMemoria: true })
  const dopo = await giudizi.attenzione(docs)
  assert.equal(chiamate, 2, 'dopo il riavvio si è richiesto quello che si sapeva già')
  assert.equal(dopo.get('a')?.urgenza, 2)
  assert.equal(dopo.get('a')?.genere, 'richiesta')
  assert.equal((await giudizi.peso(docs)).get('b'), 2)
  assert.equal(chiamate, 2)
  // dimenticare davvero toglie anche il file, e Jev rigiudica
  giudizi.scorda()
  assert.ok(!existsSync(file))
  await giudizi.attenzione(docs)
  assert.equal(chiamate, 4)
})

test('il tetto del giorno vale al giudizio: quattro domande per documento, centocinquanta documenti e non uno di più', async () => {
  let chiamate = 0
  jevDice(() => { chiamate++; return { chiede: 0.5, urgenza: 1, genere: 'aggiornamento' } })
  const docs = Array.from({ length: 200 }, (_, i) => mail(`d${i}`, { titolo: `d${i}` }))
  const visti = await giudizi.attenzione(docs, 200)
  assert.equal(jev.consumo().giudizi, jev.TETTO_AL_GIORNO)
  assert.equal(visti.size, jev.TETTO_AL_GIORNO / 4)
  assert.equal(chiamate, jev.TETTO_AL_GIORNO / 4)
  assert.equal(jev.restanti(), 0)
  // e il conto del giorno sta su disco: un riavvio non lo azzera
  const conto = JSON.parse(readFileSync(join(CASA, '.myynd', 'jev.json'), 'utf8')) as { giudizi: number }
  assert.equal(conto.giudizi, jev.TETTO_AL_GIORNO)
})

// — le due domande sulla carta —

test('le due domande sulla carta viaggiano insieme, con la data di oggi; senza chiave niente', async () => {
  let stato: { oggi: string; carta: { titolo: string; urgenza: string } } | null = null
  jev.perProva(async (_u, opz) => {
    const corpo = JSON.parse(String((opz as RequestInit).body))
    stato = corpo.state
    assert.deepEqual(Object.keys(corpo.questions), ['chiara', 'peso'])
    return Response.json({ answers: {
      chiara: { type: 'noul', noul: 0.3 },
      peso: { type: 'score', score: 2.2, confidence: 0.9, probabilities: {}, legend: {} }
    } })
  })
  const carta = { tipo: 'Priority', titolo: 'Verify Jev keeps Myynd data local', testo: 'The commit says one thing while the review says another.', perche: 'Privacy', urgenza: 'Tomorrow 9:30' }
  const g = await giudizi.giudicaCarte([carta], { oggi: new Date(2026, 8, 21, 0, 30) })
  assert.deepEqual(g.get(carta), { chiara: 0.3, peso: 2.2 })
  assert.equal(stato!.oggi, 'Monday 2026-09-21', 'il giorno è quello di chi guarda, anche a mezzanotte e mezza')
  assert.equal(stato!.carta.titolo, carta.titolo)
  assert.equal(stato!.carta.urgenza, 'Tomorrow 9:30')
  cfg.scrivi({ lingua: 'en' }, { togli: ['jev'] })
  assert.equal((await giudizi.giudicaCarte([carta])).size, 0)
})

// — dove cambia qualcosa per lui —

const RISPOSTE = {
  id: 'risposte-da-dare', nome: 'Replies', spiega: 'Prepare relevant replies.',
  quando: { quandoArriva: true }, guarda: { soloNuovi: true, limite: 10 },
  fai: 'Pick messages waiting on a direct reply.',
  metti: { inLista: 'oggi' as const, modo: 'io' as const, perDocumento: true },
  attrezzi: ['posta.leggi'],
  en: { nome: 'Replies', spiega: 'Prepare relevant replies.', fai: 'Pick messages waiting on a direct reply.' }
}

test('la coda delle risposte non scrive una riga per un «grazie, ricevuto»', async () => {
  const docs = [
    mail('marta', { titolo: 'marta', corpo: 'Ciao Tobia, mi confermi il preventivo entro venerdì?' }),
    mail('luca', { titolo: 'luca', corpo: 'Grazie mille, ricevuto tutto. Non serve altro.' })
  ]
  store.salvaDocumenti(docs)
  jevDice(id => id === 'marta'
    ? { chiede: 0.96, urgenza: 2.2, genere: 'richiesta' }
    : { chiede: 0.05, urgenza: 0.1, genere: 'aggiornamento' })

  // il modello grande vede solo quello che Jev ha lasciato passare
  const visti: string[] = []
  auto.perProva({ collegato: () => true, chiediJSON: async o => {
    const dentro = JSON.parse(String((o.messages[0] as { content: string }).content)) as { id: string }[]
    visti.push(...dentro.map(d => d.id))
    return { righe: dentro.map(d => ({ doc: d.id, testo: `Rispondere a ${d.id}` })) }
  } })
  const r = auto.scrivi(RISPOSTE)
  assert.equal(await auto.fai(r, { aMano: true }), 'fatta')
  assert.deepEqual(visti, ['marta'], 'a Luca non si risponde, e il modello non l’ha nemmeno visto')
  const righe = store.elencoCompiti().filter(c => c.origine === 'auto:risposte-da-dare')
  assert.deepEqual(righe.map(c => c.doc), ['marta'])
})

test('e quando Jev tace, la coda delle risposte resta quella di sempre', async () => {
  const docs = [
    mail('marta', { titolo: 'marta', corpo: 'Ciao Tobia, mi confermi il preventivo entro venerdì?' }),
    mail('luca', { titolo: 'luca', corpo: 'Grazie mille, ricevuto tutto. Non serve altro.' })
  ]
  store.salvaDocumenti(docs)
  jev.perProva(async () => { throw new Error('rete giù') })
  const visti: string[] = []
  auto.perProva({ collegato: () => true, chiediJSON: async o => {
    const dentro = JSON.parse(String((o.messages[0] as { content: string }).content)) as { id: string }[]
    visti.push(...dentro.map(d => d.id))
    return { righe: [] }
  } })
  const r = auto.scrivi({ ...RISPOSTE, id: 'risposte-da-dare' })
  await auto.fai(r, { aMano: true })
  assert.deepEqual(visti.sort(), ['luca', 'marta'], 'tutt’e due, come prima che Jev esistesse')
})

// — la stessa cosa due volte —

/** Jev finto che sceglie: `quale` riceve la carta nuova e le opzioni offerte. */
function jevSceglie(quale: (titolo: string, opzioni: Record<string, unknown>) => { scelta: string; p: number }) {
  jev.perProva(async (_u, opz) => {
    const corpo = JSON.parse(String((opz as RequestInit).body))
    const nome = Object.keys(corpo.questions)[0]
    const criteri = corpo.questions[nome].criteria as Record<string, unknown>
    const titolo = (corpo.state.carta_nuova ?? corpo.state.carta).titolo
    const { scelta, p } = quale(titolo, criteri)
    return Response.json({ answers: { [nome]: {
      type: 'choice', choice: scelta, confidence: p,
      probabilities: { [scelta]: p, ...(scelta === 'nessuno' ? {} : { nessuno: 1 - p }) }
    } } })
  })
}

test('una carta che dice quello che ha già sul feed non passa, una diversa sì', async () => {
  const aperte = [
    { titolo: 'Dad’s reply on Myynd needs a response', testo: 'He likes the concept but flags the to-do sync.' },
    { titolo: 'Pay invoice n. 123 from Rossi', testo: 'The March invoice is due Friday.' }
  ]
  const nuove = [
    { titolo: 'Dad’s feedback on Myynd needs a response', testo: 'Your father flagged the action side.' },
    { titolo: 'Pay invoice n. 124 from Rossi', testo: 'The April invoice is due Friday.' }
  ]
  jevSceglie(t => /feedback/.test(t) ? { scelta: 'c0', p: 0.77 } : { scelta: 'nessuno', p: 0.95 })
  const doppie = await giudizi.doppioni(nuove, aperte)
  assert.equal(doppie.size, 1)
  assert.equal(doppie.get(nuove[0]), 'Dad’s reply on Myynd needs a response')
  assert.equal(doppie.get(nuove[1]), undefined, 'due fatture diverse non sono un doppione')
})

test('una risposta incerta non toglie niente: nel dubbio la carta resta', async () => {
  const aperte = [{ titolo: 'Dad’s reply on Myynd needs a response', testo: '' }]
  const nuove = [{ titolo: 'Dad’s feedback on Myynd needs a response', testo: '' }]
  jevSceglie(() => ({ scelta: 'c0', p: giudizi.SOGLIA_DOPPIONE - 0.05 }))
  assert.equal((await giudizi.doppioni(nuove, aperte)).size, 0)
  jevSceglie(() => ({ scelta: 'c0', p: giudizi.SOGLIA_DOPPIONE + 0.01 }))
  assert.equal((await giudizi.doppioni(nuove, aperte)).size, 1)
})

test('senza una parola in comune non si chiede niente a nessuno', async () => {
  let chiamate = 0
  jev.perProva(async () => { chiamate++; return Response.json({ answers: {} }) })
  const doppie = await giudizi.doppioni(
    [{ titolo: 'Pagare l’F24 entro il 30', testo: '' }],
    [{ titolo: 'Confirm attendance for Amanda’s audit', testo: '' }])
  assert.equal(chiamate, 0, 'due carte senza niente in comune non valgono una domanda')
  assert.equal(doppie.size, 0)
})

test('il doppione si cerca anche fra le carte dello stesso giro', async () => {
  const nuove = [
    { titolo: 'Dad’s reply on Myynd needs a response', testo: '' },
    { titolo: 'Dad’s reply on Myynd — feature request', testo: '' }
  ]
  // la prima non ha contro chi confrontarsi; la seconda trova la prima
  jevSceglie((t, opzioni) => 'c0' in opzioni && /feature/.test(t) ? { scelta: 'c0', p: 0.8 } : { scelta: 'nessuno', p: 0.9 })
  const doppie = await giudizi.doppioni(nuove, [])
  assert.deepEqual([...doppie.values()], ['Dad’s reply on Myynd needs a response'])
})

// — di chi è questa carta —

test('il progetto si scrive sulla carta solo quando Jev è sicuro', async () => {
  const progetti = [{ nome: 'Myynd', obiettivo: 'Il gemello digitale' }, { nome: 'Evermute', obiettivo: 'Il deck e il prodotto audio' }]
  const carte = [{ titolo: 'Rispondere sul deck', testo: 'Mancano le decisioni di design.' }, { titolo: 'Pagare l’F24', testo: 'Entro il 30.' }]
  jevSceglie(t => /deck/.test(t) ? { scelta: 'Evermute', p: 0.97 } : { scelta: 'Myynd', p: 0.4 })
  const scelti = await giudizi.progettoDelle(carte, progetti)
  assert.equal(scelti.get(carte[0]), 'Evermute')
  assert.equal(scelti.get(carte[1]), undefined, 'sotto la soglia decide la regola di sempre, non Jev')
})

test('senza chiave nessuna delle due domande chiama niente', async () => {
  cfg.scrivi({ lingua: 'en' }, { togli: ['jev'] })
  let chiamate = 0
  jev.perProva(async () => { chiamate++; return Response.json({ answers: {} }) })
  const carte = [{ titolo: 'Dad’s feedback on Myynd', testo: '' }]
  assert.equal((await giudizi.doppioni(carte, [{ titolo: 'Dad’s reply on Myynd', testo: '' }])).size, 0)
  assert.equal((await giudizi.progettoDelle(carte, [{ nome: 'Myynd' }, { nome: 'Evermute' }])).size, 0)
  assert.equal(chiamate, 0)
})

// — la freccia del punto —

test('valeAprire: la freccia resta su quello che vale, cade su quello che non vale', async () => {
  const brief: Documento = { id: 'desktop:brief.docx', fonte: 'desktop', tipo: 'documento', titolo: 'Q4 brief',
    corpo: 'Le tre fasi del Q4, un responsabile per fase.', quando: new Date(ORA).toISOString() }
  const log: Documento = { id: 'desktop:build.log', fonte: 'desktop', tipo: 'file', titolo: 'build.log',
    corpo: 'compiled 431 modules in 2.1s', quando: new Date(ORA).toISOString() }
  jev.perProva(async (_u, opz) => {
    const stato = JSON.parse(String((opz as RequestInit).body)).state as { documento: { titolo: string } }
    const vale = stato.documento.titolo === 'Q4 brief' ? 0.92 : 0.08
    return Response.json({ answers: { vale: { type: 'noul', noul: vale } } })
  })
  const righe = [
    { testo: 'Il brief del Q4 è cambiato.', doc: brief },
    { testo: 'La compilazione è passata.', doc: log }
  ]
  const esito = await giudizi.valeAprire(righe)
  assert.ok((esito.get(righe[0]) ?? 0) >= giudizi.SOGLIA_DA_APRIRE, 'il brief vale la freccia')
  assert.ok((esito.get(righe[1]) ?? 1) < giudizi.SOGLIA_DA_APRIRE, 'un log non vale la freccia')
})

test('valeAprire: senza Jev non si toglie nessuna freccia', async () => {
  cfg.scrivi({ lingua: 'en' }, { togli: ['jev'] })
  let chiamate = 0
  jev.perProva(async () => { chiamate++; return Response.json({ answers: {} }) })
  const esito = await giudizi.valeAprire([
    { testo: 'Una riga.', doc: { id: 'x', fonte: 'posta', tipo: 'email', titolo: 'T', corpo: 'c' } as Documento }
  ])
  assert.equal(chiamate, 0, 'senza chiave non si chiama nessuno')
  assert.equal(esito.size, 0, 'una Map vuota vuol dire «tienile tutte»')
})
