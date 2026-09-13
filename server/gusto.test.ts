// Il gusto impara da due gesti, e i modi di sbagliarlo sono silenziosi.
//
// Nessuno segnala mai «la rassegna si è chiusa su tre argomenti»: si smette di
// aprirla, e sembra che il mondo si sia fatto noioso. Questi test guardano i
// due lati che contano — che impari davvero da quello che apri, e che non possa
// murarti dentro quello che hai già letto.
//
// E poi la parte nuova, che è il motivo per cui questo file adesso apre un
// database: **non si impara solo dalla rassegna**. Clickare «Fatto» o «Non mi
// interessa» su una notizia è un gesto che nessuno è obbligato a fare, e per
// chi non lo fa quei due campi restavano vuoti per sempre. Quello che ha in
// lista, quello che ha chiuso, i progetti vivi e le domande che fa sono
// materiale almeno altrettanto onesto — e da qui si prova che ci arriva, che
// costa una chiamata sola al giorno, e che quello che ha scritto lui resta suo.
//
//   node --test server/gusto.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Gusto } from './gusto.ts'
import type { Grezza } from './rassegna.ts'
import type { Config } from './config.ts'

// I dati in una cartella di passaggio, e prima di qualunque import che li
// apra: `RADICE` si decide al caricamento di `config.ts`, e un import statico
// più in alto vorrebbe dire provare queste cose sul ~/.myynd di chi le lancia.
const CASA = mkdtempSync(join(tmpdir(), 'myynd-gusto-'))
process.env.MYYND_DATI = CASA
// la chiave di casa non deve entrare in queste prove
delete process.env.ANTHROPIC_API_KEY

const cfg = await import('./config.ts')
const store = await import('./store.ts')
const compatibile = await import('./compatibile.ts')
const progetti = await import('./progetti.ts')
const timone = await import('./timone.ts')
const {
  affinita, inParole, perIlModello, evidenzaDalLavoro, tieniAggiornati, imparaIlFuoco
} = await import('./gusto.ts')
const { cernita, sceltaAMano } = await import('./rassegna.ts')

after(() => {
  compatibile.usaRete(null)
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

const ora = Date.UTC(2026, 7, 31, 12)
const fa = (ore: number) => new Date(ora - ore * 3600_000).toISOString()

function finta(x: Partial<Grezza> & { id: string }): Grezza {
  return {
    titolo: `Titolo ${x.id}`, riassunto: '', fonte: 'A', link: `https://e.it/${x.id}`,
    argomento: 'mondo', quando: fa(2), ...x
  }
}

const CONTA: Gusto = {
  vale: true, lette: 8, scartate: 4,
  piace: ['intelligenza', 'artificiale', 'chip'],
  stufa: ['calcio', 'campionato'],
  fonti: ['Bloomberg']
}

const VUOTO: Gusto = { vale: false, lette: 1, scartate: 0, piace: [], stufa: [], fonti: [] }

test('quello che apri tira su, quello che butti tira giù', () => {
  const su = affinita(CONTA, 'Nuovo chip per l’intelligenza artificiale', 'BBC')
  const giu = affinita(CONTA, 'Il campionato riparte senza tre squadre', 'BBC')
  const zero = affinita(CONTA, 'Sciopero dei treni lunedì mattina', 'BBC')

  assert.ok(su > 0, 'quello che leggi non conta niente')
  assert.ok(giu < 0, 'quello che butti non conta niente')
  assert.equal(zero, 0, 'una notizia che non c’entra niente non dovrebbe muoversi')
})

test('il giornale che apri di più vale, ma meno delle parole', () => {
  const soloFonte = affinita(CONTA, 'Sciopero dei treni lunedì', 'Bloomberg')
  const soloParole = affinita(CONTA, 'Nuovo chip artificiale', 'BBC')
  assert.ok(soloFonte > 0 && soloFonte < soloParole,
    'la fonte pesa quanto o più dell’argomento: così si finisce a leggere un giornale solo')
})

test('senza abbastanza gesti non si conclude niente', () => {
  assert.equal(affinita(VUOTO, 'Nuovo chip per l’intelligenza artificiale', 'Bloomberg'), 0)
  assert.equal(perIlModello(VUOTO), '', 'manda al modello un profilo che non ha basi')
})

test('il gusto ha un tetto: non può scavalcare tutto quello che è successo', () => {
  // un titolo che azzecca ogni parola del profilo, e viene dal giornale giusto
  const massimo = affinita(
    { ...CONTA, piace: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'] },
    'a1 a2 a3 a4 a5 a6 a7 a8', 'Bloomberg'
  )
  assert.ok(massimo <= 6, `${massimo} punti: un titolo solo può spostare troppo`)
})

test('quello che apri E butti non diventa un difetto', () => {
  // «Iran» in una che leggi e in una che scarti: se finisse in tutt’e due gli
  // elenchi i due effetti si annullerebbero senza che nessuno lo veda
  const g: Gusto = { ...CONTA, piace: ['iran'], stufa: ['iran'] }
  assert.equal(affinita(g, 'Iran', 'BBC'), 0,
    'la stessa parola da tutt’e due le parti si annulla in silenzio')
})

// — la parte che conta: non deve chiudersi —

test('il gusto non può cancellare un argomento dalla rassegna', () => {
  // otto notizie di tecnologia che le piacciono da morire, e due di mondo che
  // non la toccano: la prima pagina deve contenere comunque il mondo
  const candidate = [
    ...Array.from({ length: 8 }, (_, i) => finta({
      id: `t${i}`, fonte: `Tech${i}`, argomento: 'tecnologia',
      titolo: `Intelligenza artificiale e chip, capitolo ${i} della vicenda`
    })),
    finta({ id: 'm1', fonte: 'BBC', argomento: 'mondo', titolo: 'Riaperto il valico di frontiera dopo sei settimane' }),
    finta({ id: 'm2', fonte: 'ANSA', argomento: 'mondo', titolo: 'Sciopero dei treni annunciato per lunedì mattina' })
  ]
  const scelte = sceltaAMano(candidate, '', ora, CONTA)
  const argomenti = new Set(scelte.map(s => candidate[s.n - 1].argomento))
  assert.ok(argomenti.has('mondo'),
    'la rassegna si è chiusa su quello che legge già: è così che diventa una camera d’eco')
})

test('a parità di argomento, davanti va quella che ti somiglia', () => {
  const candidate = [
    finta({ id: 'a', fonte: 'X', argomento: 'tecnologia', titolo: 'Sciopero dei treni annunciato per lunedì', quando: fa(1) }),
    finta({ id: 'b', fonte: 'Y', argomento: 'tecnologia', titolo: 'Nuovo chip per l’intelligenza artificiale', quando: fa(3) })
  ]
  const scelte = sceltaAMano(candidate, '', ora, CONTA)
  assert.equal(candidate[scelte[0].n - 1].id, 'b',
    'il gusto non sposta niente nemmeno dentro lo stesso argomento')
})

test('senza gusto la scelta resta quella di prima', () => {
  const candidate = Array.from({ length: 6 }, (_, i) => finta({ id: `n${i}`, fonte: `F${i}` }))
  assert.deepEqual(
    sceltaAMano(candidate, '', ora).map(s => s.n),
    sceltaAMano(candidate, '', ora, VUOTO).map(s => s.n),
    'un profilo senza basi cambia comunque la rassegna'
  )
})

test('quello che si racconta a lei si legge, e in due lingue', () => {
  assert.match(inParole(CONTA, false), /Apri/)
  assert.match(inParole(CONTA, true), /You open/)
  assert.match(inParole(VUOTO, true), /Not enough/)
})

test('la cernita non è toccata dal gusto: prima il mondo, poi le preferenze', () => {
  // il giro fra i giornali resta il primo criterio, e non conosce il gusto
  const tante = [
    finta({ id: 'a', fonte: 'Uno', titolo: 'Il grano vola dopo la chiusura dello stretto' }),
    finta({ id: 'b', fonte: 'Uno', titolo: 'Apple presenta i portatili col processore nuovo' }),
    finta({ id: 'c', fonte: 'Due', titolo: 'Sciopero dei treni annunciato per lunedì mattina' })
  ]
  assert.equal(cernita(tante, ora)[1].fonte, 'Due', 'un giornale solo si prende le prime due')
})


// — quello che fa, non quello che legge —
//
// Da qui in giù si tocca il database e si finge il modello. Il fornitore è un
// «compatibile» che risponde sempre la stessa cosa e si ricorda quante volte
// gli hanno bussato: quello che va provato non è la qualità della frase, è che
// il materiale arrivi al prompt, che i cancelli tengano, e che nessuna di
// queste due funzioni riscriva mai una riga scritta a mano.

const ADESSO = Date.UTC(2026, 8, 13, 9)

const FORNITORE: Config = {
  motore: 'compatibile',
  compatibile: { url: 'https://esempio.test/v1/', chiave: 'sk-prova', modello: 'gpt-prova' }
}

/** Un fornitore finto che risponde questo, e conta le volte che gli si chiede. */
function finge(risposta: object, sopra: Config = {}): Record<string, unknown>[] {
  cfg.scrivi({ ...FORNITORE, ...sopra })
  const ricevute: Record<string, unknown>[] = []
  compatibile.usaRete((async (_url: string | URL | Request, init?: RequestInit) => {
    ricevute.push(init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {})
    return Response.json({
      id: 'chatcmpl-1', model: 'gpt-prova',
      choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(risposta) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 10 }
    })
  }) as typeof fetch)
  return ricevute
}

/** Otto cose in lista, due progetti, qualche domanda — e nessun gesto sulla rassegna. */
function semina() {
  store.azzeraTutto()
  store.default.exec('DELETE FROM notizie')

  const p = progetti.scrivi({ nome: 'Myynd', obiettivo: 'Consegnare l’app per Mac entro ottobre.' })
  progetti.scrivi({ nome: 'Casa nuova', obiettivo: 'Chiudere il rogito con la banca.' })

  const righe = [
    ['Mandare il preventivo a Rossi', 'Il listino nuovo, non quello di giugno.'],
    ['Firmare il contratto dell’elettricista', ''],
    ['Rivedere la bozza del deck per gli investitori', 'Manca la slide sui costi.'],
    ['Chiamare la banca per il mutuo', ''],
    ['Preparare il pacchetto per il Mac', 'Serve il Developer ID.'],
    ['Rispondere a Bianchi sul rinnovo', ''],
    ['Sistemare le fatture di agosto', ''],
    ['Scrivere le note di versione', '']
  ]
  righe.forEach(([testo, nota], i) => {
    store.scriviCompito({
      id: `c${i}`, testo, nota: nota || null, quando: 'oggi', ordine: `a${i}`,
      progetto: i < 3 ? p.id : null
    })
  })

  store.creaChat('ch1', 'Prova')
  store.salvaMessaggio({ id: 'm1', chat: 'ch1', ruolo: 'u', testo: 'Come mi conviene impostare il preventivo per Rossi?' })
  store.salvaMessaggio({ id: 'm2', chat: 'ch1', ruolo: 'a', testo: 'Questa è una risposta di Myynd e non deve entrare in niente.' })
}

test('l’evidenza è quello che fa, e sotto una manciata di cose non vale', () => {
  store.azzeraTutto()
  store.default.exec('DELETE FROM notizie')
  assert.equal(evidenzaDalLavoro().vale, false, 'conclude qualcosa su una lista vuota')

  semina()
  const e = evidenzaDalLavoro()
  assert.ok(e.vale, 'otto cose in lista e due progetti non bastano a dire niente')
  assert.ok(e.quante >= 6)
  assert.match(e.testo, /Rossi/, 'quello che ha in lista non arriva nel blocco')
  assert.match(e.testo, /Casa nuova/, 'i progetti vivi non arrivano nel blocco')
  assert.match(e.testo, /impostare il preventivo/, 'quello che chiede in chat non arriva nel blocco')
  assert.doesNotMatch(e.testo, /risposta di Myynd/,
    'impara dalle proprie risposte: è il modo più diretto di girare in tondo')
})

test('gli argomenti si scrivono da quello che ha in lista, senza toccare la rassegna', async () => {
  const ricevute = finge({ argomenti: 'preventivi e clienti, consegna dell’app, mutuo e banca' })
  semina()

  const testo = await tieniAggiornati(ADESSO)
  assert.equal(testo, 'preventivi e clienti, consegna dell’app, mutuo e banca')
  assert.equal(ricevute.length, 1, 'una domanda sola al modello, non una a testa')
  assert.equal(cfg.leggi().argomenti, testo)
  assert.equal(cfg.leggi().argomentiDaMe, true,
    'la riga non è firmata: chi la legge crederebbe di averla scritta lui')

  // e quello che gli ha mandato è il suo lavoro, non i titoli di ieri
  assert.match(JSON.stringify(ricevute[0]), /Rossi/)

  // il cancello della giornata: la seconda volta non costa niente
  assert.equal(await tieniAggiornati(ADESSO), null)
  assert.equal(ricevute.length, 1, 'ha richiesto lo stesso lavoro lo stesso giorno')
})

test('quello che ha scritto lui non si tocca, e non costa niente', async () => {
  const ricevute = finge(
    { argomenti: 'tutt’altro' },
    { argomenti: 'mercati, politica estera', argomentiDaMe: false }
  )
  semina()

  assert.equal(await tieniAggiornati(ADESSO), null)
  assert.equal(cfg.leggi().argomenti, 'mercati, politica estera')
  assert.equal(ricevute.length, 0,
    'si è fermato dopo aver deciso invece che prima: alla prima rifattorizzazione riscrive')
})

// — il fuoco —

test('il fuoco si scrive da quello che ha in lista, una volta sola', async () => {
  const ricevute = finge({ fuoco: 'Guarda i preventivi per Rossi e la consegna di Myynd.' })
  semina()
  timone.scriviFuoco('')

  const f = await imparaIlFuoco(ADESSO)
  assert.equal(f, 'Guarda i preventivi per Rossi e la consegna di Myynd.')
  assert.equal(timone.fuoco(), f)
  assert.equal(cfg.leggi().fuocoDaMe, true, 'la riga non è firmata')
  assert.equal(ricevute.length, 1)

  // e il giorno stesso non ci riprova: i cancelli sono a giornata
  assert.equal(await imparaIlFuoco(ADESSO), null)
  assert.equal(ricevute.length, 1, 'una seconda chiamata al modello nello stesso giorno')
})

test('un fuoco scritto a mano non si riscrive mai', async () => {
  const ricevute = finge({ fuoco: 'Qualcos’altro che non ha chiesto nessuno.' }, { fuocoDaMe: false })
  semina()
  timone.scriviFuoco('Questa settimana solo i preventivi e i pagamenti.')

  assert.equal(await imparaIlFuoco(ADESSO), null)
  assert.equal(timone.fuoco(), 'Questa settimana solo i preventivi e i pagamenti.')
  assert.equal(ricevute.length, 0,
    'ha chiesto al modello una frase che non avrebbe potuto scrivere comunque')
})

test('se la frase è la stessa, non la riscrive', async () => {
  const ricevute = finge({ fuoco: 'I preventivi per Rossi, e la consegna.' }, { fuocoDaMe: true })
  semina()
  // la stessa frase a meno di maiuscole e punteggiatura: non è un cambiamento
  timone.scriviFuoco('i preventivi per rossi e la consegna')

  assert.equal(await imparaIlFuoco(ADESSO), null)
  assert.equal(ricevute.length, 1, 'il confronto è avvenuto senza nemmeno chiedere')
  assert.equal(timone.fuoco(), 'i preventivi per rossi e la consegna')
})
