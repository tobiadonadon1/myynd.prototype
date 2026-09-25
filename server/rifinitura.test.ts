// La rifinitura, provata dove cambia qualcosa per lui.
//
// Una carta che non si capisce esce riscritta; una che si capisce esce
// com'era; una riscrittura che parla d'altro non entra; il peso arriva dal
// giudizio sulla carta, o da quello già dato sul documento; la pillola si
// accorcia da sola. E la prova che regge tutto il resto: **senza Jev non
// cambia niente**, tranne le lineette e una pillola più corta.
//
//   node --test server/rifinitura.test.ts

import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Documento } from './store.ts'
import type { Carta } from './rifinitura.ts'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-rifinitura-'))
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
const rifinitura = await import('./rifinitura.ts')

/** Lunedì 21 settembre 2026: il giorno delle sue carte. */
const OGGI = new Date(2026, 8, 21, 12)

/**
 * Jev finto: risponde alle domande sulle carte guardando il titolo, e a
 * quelle sui documenti con una risposta fissa. Ai doppioni dice «nessuno».
 */
function jevFinto(carta: (titolo: string) => { chiara: number; peso: number }, doc = { chiede: 0.9, urgenza: 3, genere: 'richiesta' }) {
  const chiamate = { carte: 0, documenti: 0 }
  jev.perProva(async (_u, opz) => {
    const corpo = JSON.parse(String((opz as RequestInit).body)) as { state: Record<string, { titolo: string }>; questions: Record<string, unknown> }
    if (corpo.questions.chiara) {
      chiamate.carte++
      const v = carta(corpo.state.carta.titolo)
      return Response.json({ answers: {
        chiara: { type: 'noul', noul: v.chiara },
        peso: { type: 'score', score: v.peso, confidence: 0.9, probabilities: {}, legend: {} }
      } })
    }
    if (corpo.questions.chiede) {
      chiamate.documenti++
      return Response.json({ answers: {
        chiede: { type: 'noul', noul: doc.chiede },
        urgenza: { type: 'score', score: doc.urgenza, confidence: 0.9, probabilities: {}, legend: {} },
        genere: { type: 'choice', choice: doc.genere, confidence: 0.8, probabilities: { [doc.genere]: 0.8 } },
        peso: { type: 'score', score: doc.urgenza, confidence: 0.9, probabilities: {}, legend: {} }
      } })
    }
    if (corpo.questions.doppione) {
      return Response.json({ answers: { doppione: { type: 'choice', choice: 'nessuno', confidence: 0.95, probabilities: { nessuno: 0.95 } } } })
    }
    throw new Error(`domanda che non mi aspettavo: ${Object.keys(corpo.questions).join(', ')}`)
  })
  return chiamate
}

/** Il modello grande finto: riscrive come gli si dice, e conta. */
function modelloFinto(riscrivi: (carta: { titolo: string; testo: string; urgenza: string }) => { titolo: string; testo: string; urgenza: string; perche?: string } | null) {
  const chiamate: { titolo: string }[] = []
  rifinitura.perProva({
    collegato: () => true,
    chiediJSON: (async (o: { messages: { content: string }[] }) => {
      const carta = JSON.parse(o.messages[0].content.replace(/^Carta \(dati\):\n/, '')) as { titolo: string; testo: string; urgenza: string }
      chiamate.push({ titolo: carta.titolo })
      const r = riscrivi(carta)
      // il perché oggi è obbligatorio nella forma: chi non lo dice riceve quello di prima, ripulito
      return r && !r.perche ? { ...r, perche: 'Privacy is the promise of Myynd.' } : r
    }) as never
  })
  return chiamate
}

const CONFUSA: Carta = {
  tipo: 'Priority',
  titolo: 'Verify Jev keeps Myynd data local before expanding it',
  testo: 'The September 20 commit uses Jev for reading decisions, while the TypeSafe review says real use calls its service.',
  perche: 'Privacy is the promise of Myynd',
  urgenza: ''
}
const CHIARA: Carta = {
  tipo: 'Priority',
  titolo: 'Reply to Apple about the Evermute review video',
  testo: 'Apple asked for a device recording; nothing went back yet.',
  perche: 'Unblocks the Evermute release',
  urgenza: 'This week'
}
const RISCRITTA = {
  titolo: 'Check that Jev keeps Myynd data local',
  testo: 'Jev\'s judgments go through TypeSafe\'s service: decide that before using it more widely.',
  urgenza: '',
  perche: 'The privacy promise of Myynd waits on this decision.'
}

beforeEach(() => {
  store.azzeraTutto()
  cfg.scrivi({ lingua: 'en', jev: { apiKey: 'apikey_prova' } })
  jev.dimentica(); jev.perProva(null); giudizi.scorda(); rifinitura.perProva(null)
})
after(() => {
  jev.perProva(null); rifinitura.perProva(null); store.chiudiIndici()
  process.env.HOME = CASA_VERA
  rmSync(CASA, { recursive: true, force: true })
})

// — i controlli del codice —

test('il codice conta: nove parole di titolo, diciotto di testo, tre di pillola, niente «mentre», niente gergo', () => {
  assert.deepEqual(rifinitura.controlla(CHIARA), [])
  assert.deepEqual(rifinitura.controlla(CONFUSA), ['testo lungo', 'due fonti cucite'])
  assert.deepEqual(rifinitura.controlla({ titolo: 'Fix Evermute’s family account issues and upload the new build', testo: 'ok', urgenza: '' }), ['titolo lungo'])
  assert.deepEqual(rifinitura.controlla({ titolo: 'Approve the X draft on Myynd’s founder workflow', testo: 'Approve or revise the draft.', urgenza: 'no rush' }), ['gergo'])
  // «Tomorrow.» nel testo è vero un giorno solo: si riscrive con il giorno
  assert.deepEqual(rifinitura.controlla({ titolo: 'Prepare for Amanda’s audit', testo: 'Tomorrow.', urgenza: 'Tuesday Sep 22, 2026, 9:30am. 10am Eastern Time' }), ['urgenza lunga', 'giorno relativo'])
  assert.deepEqual(rifinitura.controlla({ titolo: 'Prepare for Amanda’s audit', testo: 'At 9:30.', urgenza: 'Tuesday Sep 22, 2026, 9:30am. 10am Eastern Time' }), ['urgenza lunga'])
  // e il perché oggi si conta come il resto: dodici parole, niente gergo, niente «mentre»
  assert.deepEqual(rifinitura.controlla({ ...CHIARA, perche: 'Apple waits for the recording since Monday, while the partner waits for the videos and the store waits too.' }), ['perché lungo', 'due fonti cucite'])
  assert.deepEqual(rifinitura.controlla({ ...CHIARA, perche: 'The UX spec waits.' }), ['gergo'])
  assert.deepEqual(rifinitura.controlla({ titolo: 'Rispondi a Sara', testo: 'Sara aspetta da lunedì, mentre Marco no.', urgenza: '' }), ['due fonti cucite'])
  assert.equal(rifinitura.parole('Tomorrow 9:30'), 2)
  assert.equal(rifinitura.parole('Tuesday Sep 22, 2026, 9:30am. 10am Eastern Time'), 8)
})

test('la pillola si accorcia da sola quando dentro c’è una data che il codice sa leggere', () => {
  assert.equal(rifinitura.pillola('Tuesday Sep 22, 2026, 9:30am. 10am Eastern Time', OGGI), 'Tomorrow 9:30')
  assert.equal(rifinitura.pillola('by Thursday September 24, end of the day', OGGI), 'Thursday')
  assert.equal(rifinitura.pillola('renews on 3 October 2026, card on file', OGGI), 'Oct 3')
  assert.equal(rifinitura.pillola('due 2026-09-21 at 3pm at the latest', OGGI), 'Today 15:00')
  assert.equal(rifinitura.pillola('no rush, whenever you find a moment', OGGI), 'No rush')
  assert.equal(rifinitura.pillola('some time this week if possible', OGGI), 'This week')
  // corta, o senza una data: resta com’è
  assert.equal(rifinitura.pillola('no rush', OGGI), 'no rush')
  assert.equal(rifinitura.pillola('entro venerdì', OGGI), 'entro venerdì')
  assert.equal(rifinitura.pillola('as soon as the partner uploads the videos', OGGI), 'as soon as the partner uploads the videos')
  assert.equal(rifinitura.pillola('', OGGI), '')
  // e in italiano parla italiano
  cfg.scrivi({ lingua: 'it', jev: { apiKey: 'apikey_prova' } })
  assert.equal(rifinitura.pillola('martedì 22 settembre alle 9:30 in ufficio', OGGI), 'Domani 9:30')
  assert.equal(rifinitura.pillola('entro il 30 settembre, poi scatta la mora', OGGI), '30 set')
  assert.equal(rifinitura.pillola('senza fretta, quando puoi va bene', OGGI), 'Nessuna fretta')
})

// — senza Jev non cambia niente —

test('senza chiave la carta esce com’è entrata: niente riscrittura, niente peso, nessuna chiamata', async () => {
  cfg.scrivi({ lingua: 'en' }, { togli: ['jev'] })
  let jevChiamate = 0
  jev.perProva(async () => { jevChiamate++; return Response.json({}) })
  const modello = modelloFinto(() => RISCRITTA)
  const dentro: Carta[] = [
    { ...CONFUSA, testo: 'The commit uses Jev — while the review says otherwise.', doc: null },
    { ...CHIARA, urgenza: 'Tuesday Sep 22, 2026, 9:30am. 10am Eastern Time' }
  ]
  const fuori = await rifinitura.rifinisci(dentro, { oggi: OGGI })
  assert.equal(jevChiamate, 0)
  assert.equal(modello.length, 0, 'senza Jev il modello non riscrive niente')
  assert.equal(fuori.length, 2)
  assert.equal(fuori[0].titolo, CONFUSA.titolo)
  assert.equal(fuori[0].testo, 'The commit uses Jev. While the review says otherwise.', 'solo le lineette')
  assert.equal(fuori[0].peso, undefined)
  assert.equal(fuori[1].titolo, CHIARA.titolo)
  assert.equal(fuori[1].testo, CHIARA.testo)
  assert.equal(fuori[1].urgenza, 'Sep 22 9:30', 'la pillola si scrive assoluta anche senza Jev: è codice')
  assert.equal(fuori[1].peso, undefined)
})

test('e con la chiave ma la rete giù, uguale: nessuna riscrittura e nessun peso', async () => {
  jev.perProva(async () => { throw new Error('rete giù') })
  const modello = modelloFinto(() => RISCRITTA)
  const fuori = await rifinitura.rifinisci([CONFUSA, CHIARA], { oggi: OGGI })
  assert.equal(modello.length, 0)
  assert.deepEqual(fuori.map(v => v.titolo), [CONFUSA.titolo, CHIARA.titolo])
  assert.ok(fuori.every(v => v.peso === undefined))
})

// — con Jev —

test('la carta che non si capisce esce riscritta, quella chiara no, e ognuna ha il suo peso', async () => {
  const chiamate = jevFinto(t => /Verify Jev/.test(t) ? { chiara: 0.18, peso: 1.4 } : { chiara: 0.9, peso: 2.5 })
  const modello = modelloFinto(() => RISCRITTA)
  const fuori = await rifinitura.rifinisci([CONFUSA, CHIARA], { oggi: OGGI })
  assert.equal(chiamate.carte, 2, 'una chiamata per carta, con le due domande insieme')
  assert.deepEqual(modello.map(m => m.titolo), [CONFUSA.titolo], 'si riscrive solo quella che non si capisce')
  assert.equal(fuori[0].titolo, RISCRITTA.titolo)
  assert.equal(fuori[0].testo, RISCRITTA.testo)
  assert.equal(fuori[0].peso, 1.4)
  assert.equal(fuori[0].perche, RISCRITTA.perche, 'il perché oggi si riscrive con il resto')
  assert.equal(fuori[1].titolo, CHIARA.titolo)
  assert.equal(fuori[1].testo, CHIARA.testo)
  assert.equal(fuori[1].peso, 2.5)
})

test('il codice ferma anche quello che Jev lascia passare: un titolo di dodici parole si riscrive', async () => {
  jevFinto(() => ({ chiara: 0.95, peso: 2 }))
  const modello = modelloFinto(c => ({ titolo: 'Fix Evermute’s family account and upload the build', testo: c.testo, urgenza: '' }))
  const lunga: Carta = { tipo: 'Priority', titolo: 'Fix Evermute’s family account issues and upload the new build to the store', testo: 'Your partner is waiting on three account fixes before she can add videos.', perche: 'Evermute', urgenza: '' }
  const [fuori] = await rifinitura.rifinisci([lunga], { oggi: OGGI })
  assert.equal(modello.length, 1)
  assert.equal(fuori.titolo, 'Fix Evermute’s family account and upload the build')
})

test('una riscrittura che parla d’altro, che è ancora lunga, o che inventa un giorno non entra: resta l’originale', async () => {
  jevFinto(() => ({ chiara: 0.1, peso: 1 }))
  const casi: { nome: string; riscritta: { titolo: string; testo: string; urgenza: string; perche?: string } | null }[] = [
    { nome: 'soggetto perso', riscritta: { titolo: 'Call the accountant about the invoices', testo: 'The accountant is waiting.', urgenza: '' } },
    { nome: 'ancora lunga', riscritta: { titolo: RISCRITTA.titolo, testo: 'Jev sends every judgment through the TypeSafe service, and the review of the twentieth says real use always calls it, so decide before expanding.', urgenza: '' } },
    { nome: 'giorno inventato', riscritta: { titolo: RISCRITTA.titolo, testo: 'Decide by tomorrow whether Jev can keep Myynd data local.', urgenza: '' } },
    { nome: 'cucita ancora', riscritta: { titolo: RISCRITTA.titolo, testo: 'The commit uses Jev, while the review says it calls the service.', urgenza: '' } },
    { nome: 'perché con un giorno inventato', riscritta: { ...RISCRITTA, perche: 'The review waits since Friday for this decision.' } },
    { nome: 'perché relativo', riscritta: { ...RISCRITTA, perche: 'The review waits since yesterday for this decision.' } },
    { nome: 'perché che parla del progetto', riscritta: { ...RISCRITTA, perche: 'Matters for the Myynd project and its goal.' } },
    { nome: 'modello muto', riscritta: null }
  ]
  for (const caso of casi) {
    modelloFinto(() => caso.riscritta)
    const [fuori] = await rifinitura.rifinisci([CONFUSA], { oggi: OGGI })
    assert.equal(fuori.titolo, CONFUSA.titolo, caso.nome)
    assert.equal(fuori.testo, CONFUSA.testo, caso.nome)
    assert.equal(fuori.peso, 1, `${caso.nome}: il peso resta anche se la riscrittura no`)
  }
  assert.equal(rifinitura.stessoSoggetto('Approve the X draft on Myynd’s founder workflow', 'Approve the X post about founders'), false, 'un verbo in comune non basta')
  assert.equal(rifinitura.stessoSoggetto('Approve the X draft on Myynd’s founder workflow', 'Approve the founders draft for X'), true)
})

test('l’urgenza riscritta: prima la pillola del codice, poi quella del modello se corta e fondata, altrimenti quella di prima', async () => {
  jevFinto(() => ({ chiara: 0.1, peso: 2 }))
  const base = { ...CONFUSA }
  // il codice sa leggere la data: vince lui, qualunque cosa dica il modello
  modelloFinto(() => ({ ...RISCRITTA, urgenza: 'Friday' }))
  let [fuori] = await rifinitura.rifinisci([{ ...base, urgenza: 'Tuesday Sep 22, 2026, 9:30am. 10am Eastern Time' }], { oggi: OGGI })
  assert.equal(fuori.urgenza, 'Sep 22 9:30')
  // nata ieri con «domani 9:30»: domani è rispetto alla nascita, non a oggi
  ;[fuori] = await rifinitura.rifinisci([{ ...base, urgenza: 'tomorrow 9:30', nata: new Date(2026, 8, 20, 20).toISOString() }], { oggi: OGGI })
  assert.equal(fuori.urgenza, 'Sep 21 9:30')
  // il codice non la sa leggere: vale quella del modello, se corta e senza giorni inventati
  modelloFinto(() => ({ ...RISCRITTA, urgenza: 'No rush' }))
  ;[fuori] = await rifinitura.rifinisci([{ ...base, urgenza: 'whenever you get to it, honestly' }], { oggi: OGGI })
  assert.equal(fuori.urgenza, 'No rush')
  modelloFinto(() => ({ ...RISCRITTA, urgenza: 'By Friday' }))
  ;[fuori] = await rifinitura.rifinisci([{ ...base, urgenza: 'whenever you get to it, honestly' }], { oggi: OGGI })
  assert.equal(fuori.urgenza, 'whenever you get to it, honestly', 'un «venerdì» che la carta non nominava non entra')
})

test('il peso parte dal giudizio già dato sul documento, e senza giudizio sulla carta resta quello', async () => {
  const doc: Documento = {
    id: 'posta:INBOX:1', fonte: 'posta', tipo: 'email', titolo: 'Apple review', corpo: 'We need a device recording before we can continue.',
    autore: 'App Review <review@apple.example>', quando: new Date().toISOString()
  }
  store.salvaDocumenti([doc])
  const chiamate = jevFinto(() => ({ chiara: 0.9, peso: 1 }), { chiede: 0.9, urgenza: 3, genere: 'richiesta' })
  // la lettura del feed ha già giudicato il documento: quella risposta è il punto di partenza
  await giudizi.attenzione([doc])
  assert.equal(giudizi.priorDelDocumento(doc.id), 3)
  assert.equal(giudizi.priorDelDocumento('mai-visto'), null)
  let [fuori] = await rifinitura.rifinisci([{ ...CHIARA, doc: doc.id }], { oggi: OGGI })
  assert.equal(fuori.peso, 2, 'la media fra la carta (1) e il documento (3)')
  assert.equal(chiamate.documenti, 1, 'il documento non si rigiudica')
  // Jev non risponde sulla carta: resta il giudizio sul documento
  jev.perProva(async (_u, opz) => {
    if (JSON.parse(String((opz as RequestInit).body)).questions.chiara) throw new Error('caduta')
    return Response.json({})
  })
  ;[fuori] = await rifinitura.rifinisci([{ ...CHIARA, doc: doc.id }], { oggi: OGGI })
  assert.equal(fuori.peso, 3)
})

test('le carte già sul feed non passano, e il progetto si scrive a chi non ce l’ha', async () => {
  const chieste: string[] = []
  jev.perProva(async (_u, opz) => {
    const corpo = JSON.parse(String((opz as RequestInit).body)) as { state: Record<string, { titolo: string }>; questions: Record<string, unknown> }
    chieste.push(Object.keys(corpo.questions).join('+'))
    if (corpo.questions.doppione) {
      const doppia = /video/.test(corpo.state.carta_nuova.titolo)
      return Response.json({ answers: { doppione: { type: 'choice', choice: doppia ? 'c0' : 'nessuno', confidence: 0.9, probabilities: doppia ? { c0: 0.9, nessuno: 0.1 } : { nessuno: 0.9 } } } })
    }
    if (corpo.questions.progetto) return Response.json({ answers: { progetto: { type: 'choice', choice: 'Evermute', confidence: 0.97, probabilities: { Evermute: 0.97 } } } })
    return Response.json({ answers: {
      chiara: { type: 'noul', noul: 0.9 },
      peso: { type: 'score', score: 2, confidence: 0.9, probabilities: {}, legend: {} }
    } })
  })
  const fuori = await rifinitura.rifinisci([
    { ...CHIARA, progetto: null },
    { tipo: 'Priority', titolo: 'Reply to Apple about the review', testo: 'Apple is waiting for the recording.', urgenza: '', progetto: 'gia-scelto' },
    { tipo: 'Deadline', titolo: 'Pay the Rossi invoice', testo: 'It is due Friday and Rossi wrote twice.', urgenza: 'Friday', progetto: null }
  ], {
    oggi: OGGI,
    aperte: [{ titolo: 'Reply to Apple about the review video', testo: 'Apple asked for a recording.' }],
    progetti: [{ id: 'p-ev', nome: 'Evermute', obiettivo: 'Ship' }, { id: 'p-my', nome: 'Myynd', obiettivo: 'The twin' }]
  })
  // la prima è la stessa cosa della carta aperta; la seconda ha già il suo
  // progetto e non si chiede; la terza non ha niente in comune con le aperte
  // (nessuna domanda sul doppione) e il progetto glielo dà Jev
  assert.deepEqual(fuori.map(v => v.titolo), ['Reply to Apple about the review', 'Pay the Rossi invoice'])
  assert.equal(fuori[0].progetto, 'gia-scelto')
  assert.equal(fuori[1].progetto, 'p-ev')
  assert.equal(chieste.filter(q => q === 'progetto').length, 1, 'il progetto si chiede solo per chi non ce l’ha')
  assert.equal(chieste.filter(q => q === 'doppione').length, 2, 'la fattura non ha parole in comune: non si chiede')
})
