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
test('la regola della domanda dice le tre cose: di regola niente, una sola quando serve, e l\'ipotesi in fondo; e la legge chi svolge', () => {
  const r = claude.DOMANDA_AL_PIU
  assert.match(r, /non chiedi niente/)
  assert.match(r, /una domanda sola/)
  assert.match(r, /Ho supposto/)
  assert.match(r, /Mai due domande/)
  assert.match(r, /cosa hai visto/i)
  assert.match(r, /Se non rispondi/)
  assert.ok(claude.SVOLGERE.includes(r), 'la regola non è nel prompt di chi svolge')
  // e sotto una cosa consegnata non si chiede più niente
  assert.match(claude.SVOLGERE, /niente domande sotto una cosa\s+consegnata/)
  // niente del ventuno settembre, e niente lineette, in nessuno dei prompt di P3
  for (const [nome, testo] of [['SVOLGERE', claude.SVOLGERE], ['MODI.bozza', claude.MODI.bozza], ['MODI.tutto', claude.MODI.tutto], ['MODI.prompt', claude.MODI.prompt], ['DOMANDA_AL_PIU', r], ['obiettivoDaProdurre', claude.obiettivoDaProdurre()], ['inMano', claude.inMano()]] as const) {
    assert.doesNotMatch(testo, /da una a tre/, `${nome} dice ancora «da una a tre»`)
    assert.doesNotMatch(testo, /tutte insieme/, `${nome} dice ancora «tutte insieme»`)
    assert.ok(!testo.includes('—'), `${nome} ha una lineetta`)
  }
  assert.match(claude.MODI.tutto, /Se un file va allegato/)
  assert.match(claude.obiettivoDaProdurre(), /una domanda sola\.$/)
  assert.match(claude.inMano(), /comincia con «Mi manca»/)
})

test('chi classifica legge la stessa regola, e restituisce cosa ha visto accanto alla domanda', async () => {
  const ricevute = modelloJSON({ chiede: true, manca: ['unit'], domanda: 'Which unit is the audit about?', visto: 'I read the H-Farm thread: the audit names two units.' })
  const e = await claude.chiedeAiuto('Reply to H-Farm about the audit', 'Here is my analysis of the audit.\n\n1. Scope\n2. Timeline\n\nWhich unit? And when?')
  assert.equal(ricevute.length, 1)
  assert.ok(ricevute[0].system.includes(claude.DOMANDA_AL_PIU), 'la regola non è arrivata a chi classifica')
  assert.match(ricevute[0].system, /una domanda sola/)
  assert.match(String((ricevute[0].schema as { properties?: { domanda?: { description?: string } } } | undefined)?.properties?.domanda?.description ?? ''), /una domanda sola, sotto le venti parole, col punto interrogativo/)
  assert.deepEqual(e, { chiede: true, manca: ['unit'], domanda: 'Which unit is the audit about?', visto: 'I read the H-Farm thread: the audit names two units.' })

  // due domande dal modello: resta la prima
  modelloJSON({ chiede: true, manca: ['unit', 'when'], domanda: 'Which unit is the audit about?\nBy when?', visto: '' })
  assert.equal((await claude.chiedeAiuto('Reply to H-Farm about the audit', 'Here is my analysis of the audit.\n\n1. Scope\n2. Timeline\n\nWhich unit? And when?')).domanda, 'Which unit is the audit about?')

  // senza domanda, niente riga di cosa ha visto: e la chiave non compare
  modelloJSON({ chiede: false, manca: [], domanda: '', visto: 'I read everything.' })
  assert.deepEqual(await claude.chiedeAiuto('Draft a message', 'Subject: Proposal\n\nHello Alex, the proposal is ready.'), { chiede: false, manca: [], domanda: '' })
})

test('la domanda con le opzioni è una sola, e le opzioni di un genere duro vengono solo dal materiale', async () => {
  const ricevute = modelloJSON({ righe: [
    { domanda: 'Which Giulia is the quote for?', opzioni: ['Giulia Neri', 'Giulia Bassi', 'Giulia Verdi'], multipla: false },
    { domanda: 'By when?', opzioni: ['Today', 'Friday'], multipla: false }
  ] })
  const materiale = 'Giulia Neri <giulia.neri@lumen.example>\nCourse quote for Lumen\n\nGiulia Bassi <giulia@harbor.example>\nCourse quote for Harbor'
  const righe = await claude.domandeDaFare('Send the course quote to Giulia', 'Which Giulia?', { genere: 'identita', materiale })
  assert.match(ricevute[0].system, /una domanda sola/)
  assert.match(ricevute[0].system, /Le opzioni vengono solo dal materiale/)
  assert.doesNotMatch(ricevute[0].system, /da una a tre/)
  assert.deepEqual(righe, [{ domanda: 'Which Giulia is the quote for?', opzioni: ['Giulia Neri', 'Giulia Bassi'], multipla: false }])

  // meno di due opzioni vere: la domanda resta, senza opzioni (la prosa con la casella)
  modelloJSON({ righe: [{ domanda: 'Which Giulia is the quote for?', opzioni: ['Giulia Neri', 'Giulia Verdi'], multipla: false }] })
  assert.deepEqual(await claude.domandeDaFare('Send the course quote to Giulia', 'Which Giulia?', { genere: 'identita', materiale }),
    [{ domanda: 'Which Giulia is the quote for?', opzioni: [], multipla: false }])

  // un genere morbido tiene le opzioni del modello, e comunque una domanda sola
  modelloJSON({ righe: [{ domanda: 'Which format?', opzioni: ['Email', 'Call'], multipla: false }, { domanda: 'By when?', opzioni: ['Today', 'Friday'], multipla: false }] })
  assert.deepEqual(await claude.domandeDaFare('Reply to H-Farm', 'Which format? By when?', { genere: 'preferenza', materiale: '' }),
    [{ domanda: 'Which format?', opzioni: ['Email', 'Call'], multipla: false }])
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
 * Gli obiettivi non sono compiti, ma si fanno lo stesso.
 *
 * «Ingest one controlled real source in H-Brain production» non ha una cosa
 * finita che esista quando è fatto. La forma si riconosce senza modello; il
 * diciotto settembre lui ha deciso che a una riga così non si chiede «cosa
 * deve esserci alla fine»: si sceglie il risultato più utile e lo si
 * produce. Qui si prova che la domanda del risultato non c'è più da nessuna
 * parte, e che un piano concreto su un obiettivo è lavoro.
 */
test('sembraUnObiettivo riconosce la forma dell\'obiettivo e lascia stare i compiti con una cosa da consegnare', () => {
  for (const t of [
    'Ingest one controlled real source in H-Brain production',
    'Execute one permitted action and verify its result',
    'Solidificare i sistemi',
    'Sistemare il sito',
    'Capire cosa fare del progetto',
    'Set up the ingestion pipeline end-to-end',
    'Improve retention',
    'Define a Myynd pilot inside H-Farm',
    'Definire un pilota di Myynd in H-Farm'
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

test('a un obiettivo si dice di produrre, non di chiedere: la domanda del risultato non c\'è più', () => {
  const o = claude.obiettivoDaProdurre()
  assert.match(o, /Non fermarti a chiedere cosa deve esserci alla fine/)
  assert.match(o, /risultato concreto più utile/)
  assert.match(o, /ipotesi/)
  assert.doesNotMatch(o, /What should exist|Cosa deve esserci quando/)
  assert.doesNotMatch(claude.SVOLGERE, /What should exist|chiedi cosa deve esserci/)
  assert.match(claude.SVOLGERE, /si fanno lo\s+stesso/)
  assert.match(claude.SVOLGERE, /dato duro/)
  assert.match(claude.SVOLGERE, /«Fatto: »|«Done: »/, 'la frase di chiusura non è nel prompt di chi svolge')
})

test('un piano concreto su un obiettivo nudo è lavoro: chi classifica lo manda al modello, e il modello dice che è fatto', async () => {
  const ricevute = modelloJSON({ chiede: false, manca: [], domanda: '', visto: '' })
  const piano = 'Done: the pilot definition is below.\n\nMyynd pilot inside H-Farm\n\nScope: one team, four weeks.\n1. Week 1: connect the shared folder (owner: Tobia)\n2. Week 2: daily briefs to the team lead (owner: Marta)\n3. Week 4: review with the CEO\n\nAssumptions: the pilot team is the innovation unit, from the H-Farm notes [1].'
  const e = await claude.chiedeAiuto('Define a Myynd pilot inside H-Farm', piano, 'Progetto: H-Farm\nObiettivo: Improve internal AI systems')
  assert.equal(ricevute.length, 1, 'il piano doveva andare al modello, non tornare come domanda')
  assert.equal(e.chiede, false)
  assert.match(ricevute[0].system, /un obiettivo non è una richiesta di aiuto/i)
  assert.doesNotMatch(ricevute[0].system, /What should exist|cosa deve esserci quando è fatto/)
  assert.match(JSON.stringify(ricevute[0].schema ?? {}), /dato duro/)

  // due righe, l'ultima con la domanda: la forma di chi chiede un dato duro, e si tiene com'è
  const due = await claude.chiedeAiuto('Ingest one controlled real source in H-Brain production', 'I read the H-Brain folder: the README names two candidate sources with different schemas.\nWhich source goes first, the CRM export or the ticket feed?')
  assert.deepEqual(due, { chiede: true, manca: [], domanda: 'Which source goes first, the CRM export or the ticket feed?', visto: 'I read the H-Brain folder: the README names two candidate sources with different schemas.' })
  assert.equal(ricevute.length, 1, 'due righe con la domanda in fondo non si mandano al modello')

  // un'email di due righe che finisce con una domanda è lavoro: va al modello
  const emailRicevute = modelloJSON({ chiede: false, manca: [], domanda: '', visto: '' })
  const email = await claude.chiedeAiuto('Reply to Rossi', 'Hi Rossi, thanks for the quote.\nWhich slot works for you on Tuesday?')
  assert.equal(email.chiede, false)
  assert.equal(emailRicevute.length, 1)
})

/*
 * La frase di chiusura contro gli attrezzi usati.
 *
 * «Done: saved in Pages» senza una chiamata a crea_documento_app non passa,
 * e non passa prima del modello: è codice, non giudizio. Il revisore riceve
 * l'elenco degli attrezzi e la regola scritta nel prompt.
 */
test('una frase di chiusura che dichiara un salvataggio mai fatto è «rivedi» senza chiamare il modello', async () => {
  const ricevute = modelloJSON({ esito: 'pass', per: 'the reader', comeTe: 'Fine.', comeLoro: 'Fine.', problemi: [], verificato: ['all'] })
  const g = await revisione.giudica({
    compito: { testo: 'Define a Myynd pilot inside H-Farm' },
    risultato: 'Done: the pilot definition is written and saved in Pages as «H-Farm pilot».\n\nMyynd pilot inside H-Farm: one team, four weeks, daily briefs, a review with the CEO at the end.',
    fatti: [{ attrezzo: 'cerca', esito: 'ok', dettaglio: 'H-Farm (2)' }]
  })
  assert.equal(g.esito, 'revise')
  assert.equal(ricevute.length, 0, 'il modello non doveva essere chiamato')
  assert.match(g.problemi[0], /crea_documento_app was never called/)

  // con il fatto giusto la stessa frase regge, e il revisore riceve l'elenco e la regola
  await revisione.giudica({
    compito: { testo: 'Define a Myynd pilot inside H-Farm' },
    risultato: 'Done: the pilot definition is written and saved in Pages as «H-Farm pilot».\n\nMyynd pilot inside H-Farm: one team, four weeks, daily briefs, a review with the CEO at the end.',
    fatti: [{ attrezzo: 'crea_documento_app', esito: 'ok', dettaglio: 'Pages: H-Farm pilot' }, { attrezzo: 'leggi_pagina', esito: 'ok', dettaglio: 'https://www.h-farm.com/en' }]
  })
  assert.equal(ricevute.length, 1)
  assert.match(ricevute[0].user, /Gli attrezzi usati davvero, e cosa hanno restituito:\n- crea_documento_app \(ok\): Pages: H-Farm pilot\n- leggi_pagina \(ok\): https:\/\/www\.h-farm\.com\/en/)
  assert.match(ricevute[0].system, /6\. La frase di chiusura/)
  assert.match(ricevute[0].system, /vera contro l'elenco degli attrezzi usati/)
  assert.doesNotMatch(ricevute[0].system, /una domanda sola su cosa deve esserci alla fine/)
  assert.match(ricevute[0].system, /lei ha chiesto che si faccia/)

  // quello che una mano ha letto è una fonte per il revisore, numerata a parte
  await revisione.giudica({
    compito: { testo: 'Summarise what https://example.com says in three lines' },
    risultato: 'Done: the three-line summary is below.\n\nExample Domain is a placeholder site.\nIt is reserved for use in documentation.\nIt has no other content.\n\nFrom https://example.com/.',
    fatti: [{ attrezzo: 'leggi_pagina', esito: 'ok', dettaglio: 'https://example.com/', testo: 'Example Domain\n\nThis domain is for use in illustrative examples in documents.' }]
  })
  assert.match(ricevute[1].user, /Nessuna fonte dall'indice: le fonti sono le letture fatte con le mani/)
  assert.match(ricevute[1].user, /Le letture fatte con le mani, in estratto[^\n]*\n\[L1\] leggi_pagina · https:\/\/example\.com\/\nExample Domain\n\nThis domain is for use in illustrative examples/)
  assert.match(ricevute[1].system, /nelle letture fatte con le mani/)

  // l'elenco vuoto è «nessuno», e si dice; senza elenco non si dice niente
  await revisione.giudica({ compito: { testo: 'Summarise the week' }, risultato: 'Done: the summary is below.\n\nMonday: team meeting. Tuesday: fair in Rimini. Thursday: quote to Rossi.', fatti: [] })
  assert.match(ricevute[2].user, /No tool was used beyond the index/)
  assert.match(ricevute[2].user, /Nessuna fonte: aveva davanti solo il testo del compito/)
  await revisione.giudica({ compito: { testo: 'Summarise the week' }, risultato: 'Done: the summary is below.\n\nMonday: team meeting. Tuesday: fair in Rimini. Thursday: quote to Rossi.' })
  assert.doesNotMatch(ricevute[3].user, /Gli attrezzi usati davvero|letture fatte con le mani/)
})
