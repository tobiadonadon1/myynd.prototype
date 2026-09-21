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
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
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
  // «grazie» non chiede niente e non scade: fuori, ed era il primo della fila.
  // La fattura non «chiede» — nessuno insiste — ma una scadenza resta sempre.
  assert.deepEqual(fila, ['vecchia-urgente', 'fattura'])
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
  assert.deepEqual(fila, ['chiede', 'muto'])
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
