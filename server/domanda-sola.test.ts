// Chiedere o presumere: la tabella, il pavimento, le opzioni, il tipo di lavoro.
//
//   node --test server/domanda-sola.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bloccoDalTesto, BLOCCHI, decidi, DURI, duroDalTesto, generaBlocco, ipotesiDaDomanda, MANCA_UN_DATO, opzioniDalMateriale, tipoDiLavoro, type Genere } from './domanda-sola.ts'

const GENERI: Genere[] = ['destinatario', 'cifra', 'identita', 'file', 'impegno', 'data', 'preferenza', 'collegamento', 'permesso', 'altro']

test('la tabella di decidi: i duri non si presumono mai, il fondo non chiede mai, un\'etichetta mancata è dura', () => {
  for (const nativa of [true, false]) for (const domandeFatte of [0, 1]) for (const secondoGiro of [false, true]) for (const genere of GENERI) for (const costo of ['alto', 'basso'] as const) {
    const m = decidi({ chiede: true, blocco: false, duro: null, peso: { genere, costo } }, { nativa, domandeFatte, secondoGiro })
    const dove = `nativa=${nativa} fatte=${domandeFatte} secondo=${secondoGiro} ${genere}/${costo}`
    if (genere === 'collegamento' || genere === 'permesso') { assert.equal(m, 'blocco', dove); continue }
    const hard = DURI.includes(genere) || costo === 'alto'
    if (!nativa) assert.notEqual(m, 'chiedi', `il fondo ha chiesto: ${dove}`)
    if (hard) assert.notEqual(m, 'presumi', `un dato duro presunto: ${dove}`)
    if (secondoGiro) assert.equal(m, nativa && domandeFatte === 0 ? 'chiedi' : 'guaio', dove)
    else if (hard) assert.equal(m, nativa && domandeFatte === 0 ? 'chiedi' : 'segnaposto', dove)
    else assert.equal(m, 'presumi', dove)
  }
  // non chiede: si consegna
  assert.equal(decidi({ chiede: false, blocco: false, duro: null, peso: null }, { nativa: true, domandeFatte: 0, secondoGiro: false }), 'produci')
  // il blocco vince su tutto
  assert.equal(decidi({ chiede: true, blocco: true, duro: 'cifra', peso: undefined }, { nativa: true, domandeFatte: 0, secondoGiro: false }), 'blocco')
  // l'etichetta che manca è dura: chiede, e dopo una risposta lascia un segnaposto
  assert.equal(decidi({ chiede: true, blocco: false, duro: null, peso: null }, { nativa: true, domandeFatte: 0, secondoGiro: false }), 'chiedi')
  assert.equal(decidi({ chiede: true, blocco: false, duro: null, peso: null }, { nativa: true, domandeFatte: 1, secondoGiro: false }), 'segnaposto')
  // il pavimento vale anche con un'etichetta morbida accanto
  assert.equal(decidi({ chiede: true, blocco: false, duro: 'destinatario', peso: { genere: 'preferenza', costo: 'basso' } }, { nativa: true, domandeFatte: 1, secondoGiro: false }), 'segnaposto')
})

test('il pavimento riconosce i cinque generi duri, e non scatta sulle preferenze', () => {
  assert.equal(duroDalTesto('What is Marco\'s email address?'), 'destinatario')
  assert.equal(duroDalTesto('Should it go to nora@harbor.example?'), 'destinatario')
  assert.equal(duroDalTesto('A chi la mando?'), 'destinatario')
  assert.equal(duroDalTesto('What is the price for 20 people?'), 'cifra')
  assert.equal(duroDalTesto('Quanto costa il corso?'), 'cifra')
  assert.equal(duroDalTesto('Is the budget 2000 euro?'), 'cifra')
  assert.equal(duroDalTesto('Which Giulia do you mean?'), 'identita')
  assert.equal(duroDalTesto('Quale dei due Rossi intendi?'), 'identita')
  assert.equal(duroDalTesto('The signed contract is not there: which file should I attach?'), 'file')
  assert.equal(duroDalTesto('Il PDF del contratto non c\'è: me lo mandi?'), 'file')
  assert.equal(duroDalTesto('What is the signing date you agreed with Lumen?'), 'impegno')
  assert.equal(duroDalTesto('Qual è la scadenza concordata?'), 'impegno')
  // i contro: preferenze, giorni da proporre, lunghezze
  assert.equal(duroDalTesto('Which format do you prefer?'), null)
  assert.equal(duroDalTesto('When do you want it?'), null)
  assert.equal(duroDalTesto('Quanto deve essere lunga?'), null)
  assert.equal(duroDalTesto('What day is the kickoff?'), null)
  assert.equal(duroDalTesto('Do you want a formal tone?'), null)
  assert.equal(duroDalTesto(''), null)
})

test('un blocco è una fonte o un permesso che mancano, non un dato', () => {
  assert.equal(bloccoDalTesto('I need your mail connected to read Dana\'s thread.'), 'posta')
  assert.equal(bloccoDalTesto('Collegami la casella e te la scrivo.'), 'posta')
  assert.equal(bloccoDalTesto('Mi manca la posta: non è collegata.'), 'posta')
  assert.equal(bloccoDalTesto('I cannot access the folder on your Mac: connect it and I will read the files.'), 'file')
  assert.equal(bloccoDalTesto('I need Full Disk Access to read Notes.'), 'permesso')
  assert.equal(bloccoDalTesto('Non ho accesso a Notion: collegalo.'), 'fonte')
  assert.equal(bloccoDalTesto('I need Notion connected to read the page.'), 'fonte')
  // i contro: un dato che manca, un lavoro fatto, un testo lungo
  assert.equal(bloccoDalTesto('I need the price for 20 people before I can write the quote.'), null)
  assert.equal(bloccoDalTesto('Mi manca il listino: quale uso?'), null)
  assert.equal(bloccoDalTesto('Done: the reply to Marco.\n\nCiao Marco, ecco il preventivo.'), null)
  assert.equal(bloccoDalTesto('I need ' + 'x'.repeat(800)), null)
  assert.equal(generaBlocco(BLOCCHI.posta), 'posta')
  assert.equal(generaBlocco('Collega la posta.'), null)
  assert.ok(!MANCA_UN_DATO.includes('—'))
  for (const f of Object.values(BLOCCHI)) assert.ok(!f.includes('—'))
})

test('ipotesiDaDomanda prende la strada proposta, senza la premessa e senza il punto', () => {
  assert.equal(ipotesiDaDomanda('I read Nora\'s mail.\nWhat day is the kickoff?\nOtherwise I\'ll assume Tuesday, October 6.'), 'Tuesday, October 6')
  assert.equal(ipotesiDaDomanda('Ho letto il filo.\nEntro quando?\nSe non rispondi: venerdì.'), 'venerdì')
  assert.equal(ipotesiDaDomanda('If you don\'t answer, I will use the June figures'), 'I will use the June figures')
  assert.equal(ipotesiDaDomanda('What day is the kickoff?'), null)
  assert.equal(ipotesiDaDomanda(''), null)
})

test('le opzioni valgono solo se stanno nel materiale, a meno di accenti e punteggiatura', () => {
  const materiale = 'Da: Giulia Neri <giulia.neri@lumen.example>\nCourse quote for Lumen\n\nDa: Giulia Bassi <giulia@harbor.example>\nSigned, Giulia Bassi.'
  assert.deepEqual(opzioniDalMateriale(['Giulia Neri', 'Giulia Bassi', 'Giulia Verdi'], materiale), ['Giulia Neri', 'Giulia Bassi'])
  assert.deepEqual(opzioniDalMateriale(['GIULIA NERI', 'giulia bassi.'], materiale), ['GIULIA NERI', 'giulia bassi.'])
  assert.deepEqual(opzioniDalMateriale(['Nerì'], 'Giulia Neri'), ['Nerì'])
  assert.deepEqual(opzioniDalMateriale(['890 EUR', '980 EUR'], 'Course, up to 12 people: 890 EUR per person.'), ['890 EUR'])
  assert.deepEqual(opzioniDalMateriale(['', '  '], materiale), [])
})

test('tipoDiLavoro ha un vocabolario chiuso, e lo stesso compito si legge uguale', () => {
  assert.equal(tipoDiLavoro({ testo: 'Write the plan', modo: 'prompt', codice: false }), 'prompt')
  assert.equal(tipoDiLavoro({ testo: 'Fix the login bug', modo: 'tutto', codice: true }), 'codice')
  assert.equal(tipoDiLavoro({ testo: 'Write the kickoff note', modo: 'tutto', consegna: { app: 'File' }, codice: false }), 'documento')
  assert.equal(tipoDiLavoro({ testo: 'Reply to Marco about the course quote', modo: 'tutto', codice: false }), 'preventivo')
  assert.equal(tipoDiLavoro({ testo: 'Manda il preventivo a Rossi', modo: 'bozza', codice: false }), 'preventivo')
  assert.equal(tipoDiLavoro({ testo: 'Reply to Nora and propose a meeting slot', modo: 'tutto', codice: false }), 'proposta-incontro')
  assert.equal(tipoDiLavoro({ testo: 'Reply to Leo about the logo files', modo: 'tutto', codice: false }), 'risposta')
  assert.equal(tipoDiLavoro({ testo: 'Thank Dana', modo: 'tutto', email: {}, codice: false }), 'risposta')
  assert.equal(tipoDiLavoro({ testo: 'Summarize the Harbor thread', modo: 'bozza', codice: false }), 'riassunto')
  assert.equal(tipoDiLavoro({ testo: 'Define the pilot', modo: 'tutto', codice: false }), 'documento')
})
