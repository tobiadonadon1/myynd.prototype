// La rilettura del lavoro, senza un modello sotto.
//
// Quello che si prova qui non è che il revisore giudichi bene: è che riceva
// le cose giuste — il ritratto di lei, il tono, le fonti in estratto, il
// destinatario — e che quello che torna sia un verdetto che si può usare:
// niente lineette, un «passa» che elenca problemi diventa «rivedi», un
// «rivedi» senza problemi non è un verdetto. E la regola della domanda: una,
// preceduta da cosa ha visto, e uguale per chi svolge e per chi classifica.
//
//   node --test server/revisione-lavoro.test.ts

import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const casa = mkdtempSync(join(tmpdir(), 'myynd-revisione-lavoro-'))
process.env.MYYND_DATI = casa
const store = await import('./store.ts')
const cfg = await import('./config.ts')
const claude = await import('./claude.ts')
const compatibile = await import('./compatibile.ts')
const revisione = await import('./revisione-lavoro.ts')
// niente attesa fra i due tentativi nelle prove: il secondo tentativo esiste, il tempo no
revisione.attesaRitentativoPerProva(0)

beforeEach(() => { store.azzeraTutto(); revisione.perProva(null) })
after(() => {
  compatibile.usaRete(null)
  revisione.perProva(null)
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(casa, { recursive: true, force: true })
})

type Ricevuta = { system: string; user: string; schema: Record<string, unknown> | undefined }

/** Un fornitore finto che risponde sempre così, e tiene quello che gli è arrivato. */
function modelloJSON(risposta: unknown): Ricevuta[] {
  cfg.scrivi({ lingua: 'en', nome: 'Tobia', tono: 'diretto', motore: 'compatibile', compatibile: { url: 'https://revisione.test/v1', modello: 'test' } })
  const ricevute: Ricevuta[] = []
  compatibile.usaRete((async (_url, init) => {
    const corpo = JSON.parse(String(init?.body ?? '{}'))
    const messaggi = (corpo.messages ?? []) as { role: string; content: string }[]
    ricevute.push({
      system: messaggi.filter(m => m.role === 'system').map(m => m.content).join('\n'),
      user: messaggi.filter(m => m.role === 'user').map(m => m.content).join('\n'),
      schema: corpo.response_format?.json_schema?.schema
    })
    const r = typeof risposta === 'function' ? risposta() : risposta
    return Response.json({ choices: [{ message: { role: 'assistant', content: JSON.stringify(r) }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } })
  }) as typeof fetch)
  return ricevute
}

const rossi = { id: 'posta:rossi', fonte: 'posta', tipo: 'email', titolo: 'Preventivo impianto', corpo: 'Buongiorno, mi mandate il preventivo per l\'impianto base?', autore: 'Mario Rossi <rossi@esempio.it>', quando: '2026-09-01T10:00:00.000Z' }
const listino = { id: 'desktop:listino', fonte: 'desktop', tipo: 'file', titolo: 'Listino 2026', corpo: 'Impianto base 980 euro. Consegna in dieci giorni lavorativi.', autore: null, quando: '2026-08-01T10:00:00.000Z' }

test('la rilettura ha davanti il ritratto, il tono, le fonti in estratto e chi riceve, e il verdetto torna pulito', async () => {
  store.salvaDocumenti([rossi, listino])
  store.scriviBlocco({ etichetta: 'come_chiudo', descrizione: 'Come chiude', valore: 'Un caro saluto' })
  const ricevute = modelloJSON({
    esito: 'revise', per: 'Mario Rossi',
    comeTe: 'Il prezzo non è quello del listino — lo correggo.',
    comeLoro: 'Mi aspettavo 980 euro, qui c’è scritto 890.',
    problemi: ['Il prezzo dice 890, il listino [2] dice 980'],
    verificato: ['prezzo contro il listino', 'nome del destinatario']
  })
  const g = await revisione.giudica({
    compito: { testo: 'Rispondere a Rossi con il preventivo' }, nota: 'Progetto: Impianti',
    risultato: 'Gentile Rossi, l\'impianto base costa 890 euro.',
    doc: store.documento(rossi.id), progetto: null, fonti: [{ id: listino.id }]
  })

  assert.equal(ricevute.length, 1, 'una chiamata sola')
  const { system, user, schema } = ricevute[0]
  assert.match(system, /Si chiama Tobia/, 'il ritratto non è arrivato')
  assert.match(system, /Un caro saluto/, 'le regole scritte a mano non sono arrivate')
  assert.match(system, /tono[^.]*diretto/)
  assert.match(system, /non passa: mai/, 'la regola sui fatti inventati non c\'è')
  assert.match(user, /\[1\] Preventivo impianto · da Mario Rossi/)
  assert.match(user, /\[2\] Listino 2026/)
  assert.match(user, /Impianto base 980 euro/, 'l\'estratto della fonte non c\'è: il revisore non ha con cosa confrontare')
  assert.match(user, /Chi lo riceve, per quanto si capisce: Mario Rossi\./)
  assert.match(user, /Dettaglio della riga: Progetto: Impianti/)
  assert.deepEqual((schema as { required: string[] }).required, ['esito', 'per', 'comeTe', 'comeLoro', 'problemi', 'verificato'])

  assert.deepEqual(g, {
    esito: 'revise', per: 'Mario Rossi',
    comeTe: 'Il prezzo non è quello del listino. Lo correggo.',
    comeLoro: 'Mi aspettavo 980 euro, qui c’è scritto 890.',
    problemi: ['Il prezzo dice 890, il listino [2] dice 980'],
    verificato: ['prezzo contro il listino', 'nome del destinatario']
  })
})

test('un «passa» con problemi elencati è un «rivedi»; un «rivedi» senza problemi non è un verdetto', async () => {
  modelloJSON({ esito: 'pass', per: 'chi legge', comeTe: 'Bene.', comeLoro: 'Bene.', problemi: ['Manca la data della consegna'], verificato: [] })
  const contraddetto = await revisione.giudica({ compito: { testo: 'Riassumere la settimana' }, risultato: 'Lunedì riunione, martedì fiera.' })
  assert.equal(contraddetto.esito, 'revise')
  assert.deepEqual(contraddetto.problemi, ['Manca la data della consegna'])

  modelloJSON({ esito: 'revise', per: 'chi legge', comeTe: 'Non mi convince.', comeLoro: 'Boh.', problemi: [], verificato: [] })
  const muto = await revisione.giudica({ compito: { testo: 'Riassumere la settimana' }, risultato: 'Lunedì riunione, martedì fiera.' })
  assert.equal(muto.esito, 'unavailable', 'una bocciatura senza il perché non si può correggere: non è un verdetto')
})

test('senza fonti lo si dice al revisore, e il destinatario viene dal compito', async () => {
  const ricevute = modelloJSON({ esito: 'pass', per: '', comeTe: 'Va bene.', comeLoro: 'Chiaro.', problemi: [], verificato: ['nomi contro il compito'] })
  const g = await revisione.giudica({ compito: { testo: 'Mandare il preventivo a Rossi' }, risultato: 'Gentile Rossi, ecco.' })
  assert.match(ricevute[0].user, /Nessuna fonte/)
  assert.equal(g.esito, 'pass')
  assert.equal(g.per, 'Rossi', 'con il `per` vuoto vale quello ricavato dal compito')
})

test('senza modello non si bussa in rete e il verdetto è «unavailable»; con il modello giù, uguale', async () => {
  cfg.scrivi({ lingua: 'it' })
  revisione.perProva({ collegato: () => false, chiediJSON: async () => { throw new Error('non doveva chiamare nessuno') } })
  const spento = await revisione.giudica({ compito: { testo: 'Una cosa' }, risultato: 'Fatta.' })
  assert.deepEqual(spento, { esito: 'unavailable', per: 'chi legge', comeTe: '', comeLoro: '', problemi: [], verificato: [] })

  revisione.perProva({ collegato: () => true, chiediJSON: async () => null })
  const giu = await revisione.giudica({ compito: { testo: 'Una cosa' }, risultato: 'Fatta.' })
  assert.equal(giu.esito, 'unavailable')
})

test('chi riceve: l\'autore del documento, poi chi è nominato nel compito, poi chi legge', () => {
  assert.equal(revisione.destinatario({ ...rossi }, 'Rispondere sul preventivo'), 'Mario Rossi')
  assert.equal(revisione.destinatario({ ...rossi, autore: 'lee@example.com' }, 'Reply'), 'lee')
  assert.equal(revisione.destinatario(null, 'Mandare il preventivo a Rossi'), 'Rossi')
  assert.equal(revisione.destinatario(null, 'Send the contract to Giulia Ferrari today'), 'Giulia Ferrari')
  cfg.scrivi({ lingua: 'en' })
  assert.equal(revisione.destinatario(null, 'Write an essay in Pages'), 'the reader')
  cfg.scrivi({ lingua: 'it' })
  assert.equal(revisione.destinatario(null, 'Riassumere la settimana'), 'chi legge')
})

test('il feedback per chi riscrive comincia con «Rivedi:» e ha un problema per riga', () => {
  const f = revisione.feedbackPer(['il prezzo dice 890, il listino dice 980', 'manca l\'oggetto'])
  assert.match(f, /^Rivedi:/)
  assert.match(f, /\n- il prezzo dice 890, il listino dice 980\n- manca l'oggetto$/)
})

test('la cosa dopo è una riga che comincia con un verbo; vuota, o il compito ridetto, è niente', async () => {
  const ricevute = modelloJSON({ prossimo: '«Fissare la chiamata con Rossi sul preventivo.»' })
  const passo = await revisione.prossimoPasso({ compito: { testo: 'Mandare il preventivo a Rossi' }, risultato: 'Gentile Rossi, ecco.', progetto: null, inLista: ['Pagare la fattura 123'] })
  assert.equal(passo, 'Fissare la chiamata con Rossi sul preventivo')
  assert.match(ricevute[0].user, /Già in lista:\n- Pagare la fattura 123/)

  modelloJSON({ prossimo: '' })
  assert.equal(await revisione.prossimoPasso({ compito: { testo: 'Riassumere la settimana' }, risultato: 'Lunedì riunione.', inLista: [] }), null)

  modelloJSON({ prossimo: 'Manda il preventivo a Rossi' })
  assert.equal(await revisione.prossimoPasso({ compito: { testo: 'Mandare il preventivo a Rossi' }, risultato: 'Ecco.', inLista: [] }), null, 'il compito stesso, detto in altre parole, non è la cosa dopo')

  revisione.perProva({ collegato: () => false, chiediJSON: async () => { throw new Error('non doveva chiamare nessuno') } })
  assert.equal(await revisione.prossimoPasso({ compito: { testo: 'Una cosa' }, risultato: 'Fatta.', inLista: [] }), null)
})

test('due righe che dicono la stessa cosa si riconoscono, in tutte e due le lingue', () => {
  assert.ok(revisione.simili('Mandare il preventivo a Rossi', 'Manda a Rossi il preventivo'))
  assert.ok(revisione.simili('Define the next steps for the audit', 'Define next step for audit'))
  assert.ok(!revisione.simili('Mandare il preventivo a Rossi', 'Pagare la fattura di Bianchi'))
  assert.ok(!revisione.simili('', 'Pagare la fattura'))
})

/*
 * La regola della domanda: una, e prima cosa ha visto.
 *
 * Sta in un posto solo e la leggono in due: chi svolge il compito e chi
 * classifica quello che ha scritto. Qui si prova che il testo dica le tre
 * cose — cosa ha visto, una domanda sola, altrimenti vai avanti e dillo — e
 * che arrivi davvero a tutti e due.
 */
test('la regola della domanda dice le tre cose, e la legge chi svolge', () => {
  const r = claude.UNA_DOMANDA
  assert.match(r, /cosa hai visto/i)
  assert.match(r, /una sola/)
  assert.match(r, /solo se la risposta cambia quello che consegni/)
  assert.match(r, /non fermarti/)
  assert.ok(claude.SVOLGERE.includes(r), 'la regola non è nel prompt di chi svolge')
})

test('chi classifica legge la stessa regola, e restituisce cosa ha visto accanto alla domanda', async () => {
  const ricevute = modelloJSON({ chiede: true, manca: ['unit'], domanda: 'Which unit is the audit about?', visto: 'I read the H-Farm thread: the audit names two units.' })
  const e = await claude.chiedeAiuto('Reply to H-Farm about the audit', 'Here is my analysis of the audit.\n\n1. Scope\n2. Timeline\n\nWhich unit? And when?')
  assert.equal(ricevute.length, 1)
  assert.ok(ricevute[0].system.includes(claude.UNA_DOMANDA), 'la regola non è arrivata a chi classifica')
  assert.deepEqual(e, { chiede: true, manca: ['unit'], domanda: 'Which unit is the audit about?', visto: 'I read the H-Farm thread: the audit names two units.' })

  // senza domanda, niente riga di cosa ha visto: e la chiave non compare
  modelloJSON({ chiede: false, manca: [], domanda: '', visto: 'I read everything.' })
  assert.deepEqual(await claude.chiedeAiuto('Draft a message', 'Subject: Proposal\n\nHello Alex, the proposal is ready.'), { chiede: false, manca: [], domanda: '' })
})

test('le domande con le opzioni sono una, anche se il modello ne scrive tre', async () => {
  const ricevute = modelloJSON({ righe: [
    { domanda: 'Which unit?', opzioni: ['Sales', 'Ops'], multipla: false },
    { domanda: 'By when?', opzioni: ['Today', 'Friday'], multipla: false },
    { domanda: 'Which format?', opzioni: ['Email', 'Call'], multipla: false }
  ] })
  const righe = await claude.domandeDaFare('Reply to H-Farm', 'Which unit? By when?')
  assert.match(ricevute[0].system, /UNA domanda/)
  assert.deepEqual(righe, [{ domanda: 'Which unit?', opzioni: ['Sales', 'Ops'], multipla: false }])
})
