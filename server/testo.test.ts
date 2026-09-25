// I test della ricucitura.
//
// Qui il guasto è tutto silenzioso: un PDF estratto male non dà nessun errore.
// Il testo entra nell'indice, l'app risponde, il documento si apre — solo che
// le frasi sono spezzate a metà, e chi legge (tu e il modello) legge quello.
// Ogni caso qui sotto è una forma di testo che c'era davvero.
//
//   node --test server/testo.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { riflua, senzaTrattini, sembraInglese, sembraItaliano, linguaSbagliata, soloDomanda, tutteLeDomande } from './testo.ts'

test('la frase spezzata dalla larghezza della pagina torna intera', () => {
  const pdf = [
    'most. We built it from public facts about Mashburn, and every number carries the',
    'assumption it rests on. Read this first page standing up, then forward the rest to Paul',
    'and',
    'Lee.'
  ].join('\n')
  const fuori = riflua(pdf)
  assert.match(fuori, /forward the rest to Paul and Lee\./)
  assert.equal(fuori.split('\n').length, 1)
})

test('la riga che finisce davvero resta una riga sua', () => {
  // «value.» chiude; «We won't guess…» è un'altra cosa e non ci si attacca
  const pdf = [
    'On Seaboard we put that at roughly $80,000 to $200,000 a year, and we say roughly on',
    'purpose. The spread is that wide because you hold the one figure that would close it,',
    'the project\'s real construction',
    'value.',
    'We won\'t guess your number in a letter to the man building it.'
  ].join('\n')
  const righe = riflua(pdf).split('\n')
  assert.equal(righe.length, 2)
  assert.match(righe[0], /real construction value\.$/)
  assert.match(righe[1], /^We won't guess/)
})

test('un titolo non finisce dentro il paragrafo che lo segue', () => {
  // È corto perché è un titolo, non perché la riga è stata spezzata: in un
  // testo mandato a capo dalla pagina la prima riga arriva sempre al bordo.
  const pdf = [
    '01 Executive summary',
    'You told us to send it over. Here it is. The short read on where old walls cost a reuse',
    'GC the most, and every number carries the assumption it rests on for the whole report.'
  ].join('\n')
  const righe = riflua(pdf).split('\n')
  assert.equal(righe[0], '01 Executive summary')
  assert.match(righe[1], /^You told us/)
})

test('le voci di un elenco restano separate, e la prosa dopo pure', () => {
  const testo = [
    'Le cose da fare questa settimana sono queste qui sotto, in ordine di scadenza:',
    '- mandare il preventivo a Rossi entro giovedì mattina, prima della riunione',
    '- chiudere il consuntivo di Seaboard Vista con i numeri veri del cantiere',
    '- richiamare Paul per la questione dei permessi di sovrintendenza',
    'Poi si vede come procede il resto del mese e si riprogramma.'
  ].join('\n')
  const righe = riflua(testo).split('\n')
  assert.equal(righe.length, 5)
  assert.match(righe[4], /^Poi si vede/)
})

test('la riga vuota resta uno stacco fra paragrafi', () => {
  const testo = [
    'Prima parte del discorso, scritta su una riga che arriva fino in fondo alla',
    'colonna e poi continua qui sotto senza mai chiudere davvero il periodo.',
    '',
    'Seconda parte, che comincia dopo uno stacco e non deve attaccarsi a quella',
    'di sopra per nessun motivo, perché lo stacco lo ha voluto chi ha scritto.'
  ].join('\n')
  const fuori = riflua(testo)
  assert.ok(fuori.includes('\n\n'), 'lo stacco è sparito')
  assert.equal(fuori.split('\n\n').length, 2)
})

test('un testo già a paragrafi non si tocca', () => {
  // Notion, markdown, qualunque cosa nata digitale: le righe sono già intere,
  // e metterci le mani vorrebbe dire rompere quello che era giusto.
  const gia = [
    'Questo è un paragrafo già scritto per intero su una riga sola, come succede quando il testo arriva da Notion o da un editor che non manda a capo niente e lascia che sia chi disegna la pagina a decidere dove spezzare le righe.',
    '',
    'E questo è il secondo, altrettanto lungo e altrettanto intero, che deve restare esattamente com\'è senza che nessuno provi a ricucirlo con quello di prima.'
  ].join('\n')
  assert.equal(riflua(gia), gia)
})

test('poche righe non bastano per indovinare la colonna: non si tocca niente', () => {
  const corto = 'Una riga.\nE un\'altra.'
  assert.equal(riflua(corto), corto)
})

test('le lineette diventano punti, e la frase dopo riparte con la maiuscola', () => {
  assert.equal(senzaTrattini('Finire i testi del sito — ancora segnato per oggi.'), 'Finire i testi del sito. Ancora segnato per oggi.')
  assert.equal(senzaTrattini('tobiadonadon.com — testi ancora aperti, il blog aspetta'), 'tobiadonadon.com. Testi ancora aperti, il blog aspetta')
  assert.equal(senzaTrattini('Papà vuole tutto: Granola, Claude — e la lista.'), 'Papà vuole tutto: Granola, Claude. E la lista.')
})

test('in coda e in apertura la lineetta si toglie, il trattino fra parole resta', () => {
  assert.equal(senzaTrattini('Tre cose —'), 'Tre cose')
  assert.equal(senzaTrattini('— prima cosa\n— seconda cosa'), '- prima cosa\n- seconda cosa')
  assert.equal(senzaTrattini('il week-end del 2024-09-10 resta com\'è'), 'il week-end del 2024-09-10 resta com\'è')
  assert.equal(senzaTrattini('Già chiuso. — Poi il resto'), 'Già chiuso. Poi il resto')
  // un intervallo di numeri non è un inciso
  assert.equal(senzaTrattini('pagine 10–12, anni 2024–2025'), 'pagine 10–12, anni 2024–2025')
})

// — la lingua in cui è nato un testo —
//
// Non è un riconoscitore di lingue e non deve diventarlo. Risponde a una
// domanda sola: «questo testo è italiano invece che inglese, abbastanza da
// vedersi?». I casi qui sotto sono quelli in cui una risposta sbagliata costa:
// una voce del feed buttata per niente (falso positivo) o una voce italiana
// lasciata passare in un'app inglese (falso negativo, che è il difetto vero).

test('una frase italiana è italiana, una inglese è inglese', () => {
  const it = 'Il contratto di Rossi non è ancora firmato e la scadenza è venerdì.'
  const en = 'The contract with Rossi is not signed yet and the deadline is Friday.'
  assert.equal(sembraItaliano(it), true)
  assert.equal(sembraInglese(it), false)
  assert.equal(sembraInglese(en), true)
  assert.equal(sembraItaliano(en), false)
})

test('la voce che gli è arrivata in faccia si riconosce', () => {
  // «Why is it telling me what it means by large object promisors in Git? This
  // task is in Italian and my app is in English»: il titolo e le due righe
  // sotto, presi insieme come li legge lui
  const voce = 'Cosa significa «large-object promisors» in Git? ' +
    'Una spiegazione di cosa sono i promisor per gli oggetti grandi e di come Git li usa.'
  assert.equal(sembraItaliano(voce), true)
  assert.equal(linguaSbagliata(voce, 'en'), true, 'in un\'app inglese questa voce non ci deve stare')
  assert.equal(linguaSbagliata(voce, 'it'), false)
})

test('poche parole non bastano per giudicare: nel dubbio passa', () => {
  // un titolo corto non ha abbastanza segni, e buttarlo costa più che tenerlo
  assert.equal(sembraItaliano('Ciao a tutti'), false)
  assert.equal(sembraInglese('Hello there'), false)
  assert.equal(linguaSbagliata('Fattura Rossi', 'en'), false)
})

test('senza parole di servizio non si dice niente, e nemmeno con le due lingue appaiate', () => {
  // nomi propri e cifre: non sono di nessuna lingua
  assert.equal(sembraItaliano('Rossi Bianchi Verdi Nextas Seaboard 2026'), false)
  assert.equal(sembraInglese('Rossi Bianchi Verdi Nextas Seaboard 2026'), false)
  // uno scarto di uno non basta: serve che si veda
  assert.equal(sembraItaliano('Deck Nextas per Bianchi the Seaboard review oggi'), false)
})

test('linguaSbagliata risponde per l\'app, non per il testo', () => {
  const it = 'Il preventivo di Rossi non è ancora firmato e la scadenza è venerdì.'
  const en = 'The quote from Rossi is not signed yet and the deadline is Friday.'
  assert.equal(linguaSbagliata(it, 'en'), true)
  assert.equal(linguaSbagliata(it, 'it'), false)
  assert.equal(linguaSbagliata(en, 'it'), true)
  assert.equal(linguaSbagliata(en, 'en'), false)
})

// — la domanda sola —
//
// Il quattordici settembre, sotto una riga della lista: un piano in quattro
// punti, un curriculum che non c'entrava, e in coda tre domande insieme. La
// parola di Tobia: «non può farmi una domanda diretta?». Questi casi sono
// quel testo, e le forme storte in cui un modello piccolo ci ricasca.

test('della sua schermata resta la prima domanda, e basta quella', () => {
  const suo = [
    "To assist you in solidifying the H-Farm AI Systems project, I'll need to analyze your materials.",
    '',
    '1. **Understand Your Goal**: Clarify what "solidification" entails.',
    '2. **Review Existing Materials**: Check documents like `CV Resume.pdf`.',
    '',
    'Please confirm:',
    '- Is the focus on technical deployment, compliance, or strategic planning?',
    '- Do you need help drafting a timeline?'
  ].join('\n')
  assert.equal(
    soloDomanda(suo),
    'Is the focus on technical deployment, compliance, or strategic planning?'
  )
})

test('due domande nella stessa riga diventano una', () => {
  assert.equal(
    soloDomanda('Di quale unità parliamo? E chi tiene il numero?'),
    'Di quale unità parliamo?'
  )
})

test('il cappello davanti alla domanda se ne va', () => {
  assert.equal(
    soloDomanda('Per andare avanti: di quale unità di H-Farm parliamo?'),
    'di quale unità di H-Farm parliamo?'
  )
})

test('i segni del modello non arrivano sulla riga', () => {
  assert.equal(
    soloDomanda('### Domanda\n**A chi** va il `preventivo` [2]?'),
    'A chi va il preventivo?'
  )
})

test('senza punto interrogativo resta comunque una riga sola', () => {
  assert.equal(
    soloDomanda('Mi manca l’indirizzo di Rossi.\nPoi posso scrivere.'),
    'Mi manca l’indirizzo di Rossi.'
  )
})

test('una domanda lunga un paragrafo si taglia, e resta una domanda', () => {
  const lunga = `Vorrei capire se ${'x '.repeat(120)}va bene?`
  const fuori = soloDomanda(lunga)
  assert.ok(fuori.length <= 181, `lunga ${fuori.length}`)
  assert.ok(fuori.endsWith('?'))
  assert.ok(!fuori.includes('\n'))
})

test('il testo vuoto non diventa una domanda inventata', () => {
  assert.equal(soloDomanda(''), '')
  assert.equal(soloDomanda('   \n  '), '')
})

test('i due punti dentro la domanda non le portano via l’inizio', () => {
  // il modello l'ha scritta così davvero, alla prima prova sul suo Mac
  assert.equal(
    soloDomanda('What is the focus: technical deployment, compliance, or strategic planning?'),
    'What is the focus: technical deployment, compliance, or strategic planning?'
  )
  assert.equal(
    soloDomanda('Quale unità: quella di Treviso o quella di Roma?'),
    'Quale unità: quella di Treviso o quella di Roma?'
  )
})

// — una domanda sola, dal 24 settembre (P3) —

test('tutteLeDomande tiene una domanda sola di serie, pulita; con un tetto più alto ne tiene di più senza doppioni; senza domande torna quella sola', () => {
  assert.equal(
    tutteLeDomande('Ho letto il filo.\n- Di quale unità parliamo? E chi tiene il numero?\n- Per andare avanti: entro quando?\n- Di quale unità parliamo?\n- Una quarta?'),
    'Di quale unità parliamo?'
  )
  assert.equal(
    tutteLeDomande('Ho letto il filo.\n- Di quale unità parliamo? E chi tiene il numero?\n- Per andare avanti: entro quando?\n- Di quale unità parliamo?\n- Una quarta?', 3),
    'Di quale unità parliamo?\nE chi tiene il numero?\nentro quando?'
  )
  assert.equal(tutteLeDomande('Which unit is the audit about?'), 'Which unit is the audit about?')
  assert.equal(tutteLeDomande('Non ho trovato niente.'), soloDomanda('Non ho trovato niente.'))
})

