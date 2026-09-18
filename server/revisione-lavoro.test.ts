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
    risultato: 'Gentile Rossi, l\'impianto base costa 890 euro, consegna in dieci giorni lavorativi. Un caro saluto.',
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
  const contraddetto = await revisione.giudica({ compito: { testo: 'Riassumere la settimana' }, risultato: 'Lunedì riunione con il team, martedì fiera a Rimini, giovedì consegna del preventivo a Rossi.' })
  assert.equal(contraddetto.esito, 'revise')
  assert.deepEqual(contraddetto.problemi, ['Manca la data della consegna'])

  modelloJSON({ esito: 'revise', per: 'chi legge', comeTe: 'Non mi convince.', comeLoro: 'Boh.', problemi: [], verificato: [] })
  const muto = await revisione.giudica({ compito: { testo: 'Riassumere la settimana' }, risultato: 'Lunedì riunione con il team, martedì fiera a Rimini, giovedì consegna del preventivo a Rossi.' })
  assert.equal(muto.esito, 'unavailable', 'una bocciatura senza il perché non si può correggere: non è un verdetto')
})

test('senza fonti lo si dice al revisore, e il destinatario viene dal compito', async () => {
  const ricevute = modelloJSON({ esito: 'pass', per: '', comeTe: 'Va bene.', comeLoro: 'Chiaro.', problemi: [], verificato: ['nomi contro il compito'] })
  const g = await revisione.giudica({ compito: { testo: 'Mandare il preventivo a Rossi' }, risultato: 'Gentile Rossi, ecco il preventivo per l\'impianto base come richiesto. Un caro saluto.' })
  assert.match(ricevute[0].user, /Nessuna fonte/)
  assert.equal(g.esito, 'pass')
  assert.equal(g.per, 'Rossi', 'con il `per` vuoto vale quello ricavato dal compito')
})

test('senza modello non si bussa in rete e il verdetto è «unavailable»; con il modello giù, uguale', async () => {
  cfg.scrivi({ lingua: 'it' })
  revisione.perProva({ collegato: () => false, chiediJSON: async () => { throw new Error('non doveva chiamare nessuno') } })
  const spento = await revisione.giudica({ compito: { testo: 'Una cosa' }, risultato: 'Ecco la cosa preparata per intero, con tutti i punti che servivano a chiuderla.' })
  assert.deepEqual(spento, { esito: 'unavailable', per: 'chi legge', comeTe: '', comeLoro: '', problemi: [], verificato: [] })

  revisione.perProva({ collegato: () => true, chiediJSON: async () => null })
  const giu = await revisione.giudica({ compito: { testo: 'Una cosa' }, risultato: 'Ecco la cosa preparata per intero, con tutti i punti che servivano a chiuderla.' })
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

/*
 * Il controllo zero: è il lavoro chiesto?
 *
 * Il diciotto settembre «Not relevant. Closely related repeats should not be
 * surfaced again.» è passato come risposta a «Reply to App Review…». Qui si
 * prova che non passi più, e che non passi *prima* del modello: un revisore
 * che dice «pass» non conta, e non viene nemmeno chiamato.
 */
test('una riga di stato al posto del lavoro è «rivedi», anche se il modello dice «passa», e il modello non si chiama', async () => {
  const ricevute = modelloJSON({ esito: 'pass', per: 'App Review', comeTe: 'Va bene.', comeLoro: 'Chiaro.', problemi: [], verificato: ['tutto'] })
  const g = await revisione.giudica({
    compito: { testo: 'Reply to App Review with the device recording and setup steps' },
    risultato: 'Not relevant. Closely related repeats should not be surfaced again.'
  })
  assert.equal(g.esito, 'revise')
  assert.equal(ricevute.length, 0, 'il modello non doveva essere chiamato')
  assert.equal(g.problemi.length, 1)
  assert.match(g.comeTe, /not the work/i)
  assert.equal(g.per, 'App Review', 'il destinatario resta quello ricavato dal compito')

  // e vale anche senza modello: il controllo è codice
  revisione.perProva({ collegato: () => false, chiediJSON: async () => { throw new Error('non doveva chiamare nessuno') } })
  assert.equal((await revisione.giudica({ compito: { testo: 'Reply to App Review with the recording' }, risultato: 'Not relevant.' })).esito, 'revise')
})

test('eUnLavoro: rifiuti, stati, domande, piani al posto di un messaggio non sono lavoro; un\'email, un riassunto e una decisione sì', () => {
  const no = [
    ['Not relevant. Closely related repeats should not be surfaced again.', 'Reply to App Review with the device recording'],
    ['Already done.', 'Send the invoice to Rossi'],
    ['Non rilevante: questa cosa non serve più.', 'Rispondere a Rossi'],
    ['I cannot do this without access to the mailbox.', 'Reply to Rossi'],
    ['Which unit is the audit about?', 'Reply to H-Farm about the audit'],
    ['Plan\n1. Read the thread\n2. Draft the reply\n3. Send it', 'Reply to App Review with the setup steps'],
    ['1. Collect the recording\n2. Write the steps\n3. Send the reply\n4. Wait', 'Write back to App Review'],
    ['Sorry, there is nothing to reply to here.', 'Reply to Rossi']
  ]
  for (const [r, c] of no) assert.equal(revisione.eUnLavoro(r, c), false, `doveva essere bocciato: «${r}»`)
  const si = [
    ['Reply to App Review with the link and the three setup steps.\n\nSubject: Re: Evermute needs more information\n\nHello, here is the recording: https://example.com/x. Steps: 1. Install build 6. 2. Tap Allow. 3. Open Reels.\n\nLink from [1].', 'Reply to App Review with the device recording'],
    ['Gentile Rossi, l\'impianto base costa 980 euro, consegna in dieci giorni. Un caro saluto.', 'Rispondere a Rossi con il preventivo'],
    ['1. Monday: team meeting.\n2. Tuesday: fair in Rimini.\n3. Thursday: quote sent to Rossi.', 'Summarize the week'],
    ['June, because the audit uses June [1].', 'Decide: June or July figures?']
  ]
  for (const [r, c] of si) assert.equal(revisione.eUnLavoro(r, c), true, `doveva passare: «${r}»`)
})

test('il revisore legge il controllo zero nel prompt', async () => {
  const ricevute = modelloJSON({ esito: 'pass', per: 'Rossi', comeTe: 'Va bene.', comeLoro: 'Chiaro.', problemi: [], verificato: ['tutto'] })
  await revisione.giudica({ compito: { testo: 'Mandare il preventivo a Rossi' }, risultato: 'Gentile Rossi, ecco il preventivo per l\'impianto base come richiesto. Un caro saluto.' })
  assert.equal(ricevute.length, 1)
  assert.match(ricevute[0].system, /0\. Che sia il lavoro chiesto/)
})

/*
 * Gli obiettivi non sono compiti.
 *
 * «Ingest one controlled real source in H-Brain production» non ha una cosa
 * finita che esista quando è fatto. La forma si riconosce senza modello, e
 * chi classifica non trasforma il piano in lavoro: la domanda è una sola.
 */
test('sembraUnObiettivo riconosce la forma dell\'obiettivo e lascia stare i compiti con una cosa da consegnare', () => {
  for (const t of [
    'Ingest one controlled real source in H-Brain production',
    'Execute one permitted action and verify its result',
    'Solidificare i sistemi',
    'Sistemare il sito',
    'Capire cosa fare del progetto',
    'Set up the ingestion pipeline end-to-end',
    'Improve retention'
  ]) assert.equal(claude.sembraUnObiettivo(t), true, `doveva essere un obiettivo: «${t}»`)
  for (const t of [
    'Reply to App Review with the device recording and setup steps',
    'Mandare il preventivo a Rossi',
    'Summarize the H-Brain thread for Marta',
    'Write a plan for the H-Brain ingestion',
    'Prepara la scaletta della riunione',
    'Approve the X draft',
    'Decide between June and July figures'
  ]) assert.equal(claude.sembraUnObiettivo(t), false, `non doveva essere un obiettivo: «${t}»`)
  assert.equal(claude.dettaglioDellaRiga('Progetto: H-Brain\nObiettivo: Cervello d\'azienda'), '')
  assert.equal(claude.dettaglioDellaRiga('Progetto: H-Brain\nObiettivo: Cervello\nA CSV with 100 rows in the prod table'), 'A CSV with 100 rows in the prod table')
})

test('a un obiettivo nudo con un piano al posto del lavoro, chi classifica risponde con la domanda del risultato senza chiamare il modello', async () => {
  const ricevute = modelloJSON({ chiede: false, manca: [], domanda: '', visto: '' })
  const piano = 'Here is how I would approach it.\n\n1. Identify a controlled source\n2. Configure the ingestion job\n3. Run it in production\n4. Verify the rows\n\nSources: none.'
  const e = await claude.chiedeAiuto('Ingest one controlled real source in H-Brain production', piano, 'Progetto: H-Brain\nObiettivo: Cervello d\'azienda')
  assert.equal(ricevute.length, 0, 'il modello non doveva essere chiamato')
  assert.equal(e.chiede, true)
  assert.equal(e.domanda, 'What should exist when this is done?')

  // con un dettaglio sotto la riga il piano non è più nudo: decide il modello
  const conDettaglioRicevute = modelloJSON({ chiede: false, manca: [], domanda: '', visto: '' })
  const conDettaglio = await claude.chiedeAiuto('Ingest one controlled real source in H-Brain production', piano, 'Progetto: H-Brain\nGive me a plan in four steps')
  assert.equal(conDettaglio.chiede, false)
  assert.equal(conDettaglioRicevute.length, 1)
  assert.match(conDettaglioRicevute[0].user, /Con questo dettaglio: Give me a plan in four steps/)

  // due righe, l'ultima con la domanda: è la forma giusta, e si tiene com'è
  const due = await claude.chiedeAiuto('Ingest one controlled real source in H-Brain production', 'I read the H-Brain folder: the README describes an ingestion job with no source configured.\nWhat should exist when this is done?')
  assert.deepEqual(due, { chiede: true, manca: [], domanda: 'What should exist when this is done?', visto: 'I read the H-Brain folder: the README describes an ingestion job with no source configured.' })
  assert.equal(conDettaglioRicevute.length, 1, 'due righe con la domanda in fondo non si mandano al modello')

  // un'email di due righe che finisce con una domanda è lavoro: va al modello
  const emailRicevute = modelloJSON({ chiede: false, manca: [], domanda: '', visto: '' })
  const email = await claude.chiedeAiuto('Reply to Rossi', 'Hi Rossi, thanks for the quote.\nWhich slot works for you on Tuesday?')
  assert.equal(email.chiede, false)
  assert.equal(emailRicevute.length, 1)
})

test('soloLaDomandaDelRisultato tiene le due righe giuste e rimpiazza un piano con la domanda', () => {
  cfg.scrivi({ lingua: 'en' })
  assert.equal(claude.soloLaDomandaDelRisultato('I read the folder: no source is configured.\n\nWhat should exist when this is done?'), 'I read the folder: no source is configured.\nWhat should exist when this is done?')
  assert.equal(claude.soloLaDomandaDelRisultato('I read the H-Brain README and the last commits.\n\n1. Pick a source\n2. Configure the job\n3. Run it\n4. Verify'), 'I read the H-Brain README and the last commits.\nWhat should exist when this is done?')
  assert.equal(claude.soloLaDomandaDelRisultato('1. Pick a source\n2. Configure the job\n3. Run it'), 'What should exist when this is done?')
  assert.equal(claude.soloLaDomandaDelRisultato('Plan\n1. Pick a source\n2. Configure\n3. Run\nWhich source?'), 'What should exist when this is done?')
})
