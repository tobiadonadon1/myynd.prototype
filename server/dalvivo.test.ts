// I test che parlano davvero con il modello.
//
// Tutto il resto della cartella prova la logica: questi provano le *promesse*.
// «Segnati che devo richiamare Rossi» detto in chat finisce in lista? Una bozza
// consegnata è consegnabile o è un tema svolto su cosa si potrebbe fare? Sono
// domande a cui non si può rispondere leggendo il codice, perché la risposta
// non sta nel codice: sta in cosa fa il modello quando gli si parla così.
//
// Costano soldi veri, quindi non girano mai per sbaglio:
//
//   MYYND_VIVO=1 node --test --disable-warning=ExperimentalWarning server/dalvivo.test.ts
//
// Senza quella variabile si saltano in silenzio, e `npm test` resta gratis.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import type { Documento } from './store.ts'

const VIVO = process.env.MYYND_VIVO === '1'

/** La chiave vera di questa macchina, presa dov'è già. Non si stampa mai. */
function chiaveDiCasa(): string | null {
  const f = join(homedir(), '.myynd', 'config.json')
  if (!existsSync(f)) return process.env.ANTHROPIC_API_KEY ?? null
  try {
    const c = JSON.parse(readFileSync(f, 'utf8')) as { claude?: { apiKey?: string } }
    return c.claude?.apiKey ?? process.env.ANTHROPIC_API_KEY ?? null
  } catch {
    return process.env.ANTHROPIC_API_KEY ?? null
  }
}

const CHIAVE = VIVO ? chiaveDiCasa() : null
const salta = { skip: !VIVO ? 'serve MYYND_VIVO=1' : !CHIAVE ? 'nessuna chiave di Claude su questa macchina' : false }

const CASA = mkdtempSync(join(tmpdir(), 'myynd-vivo-'))
const CASA_VERA = process.env.HOME
process.env.HOME = CASA

const cfg = await import('./config.ts')
const store = await import('./store.ts')
const claude = await import('./claude.ts')

/**
 * Un'azienda finta ma coerente: un cliente, un listino, un filo di posta.
 *
 * Coerente è il punto. Con documenti a caso ogni risposta sembra buona perché
 * non c'è niente da sbagliare; qui c'è un prezzo giusto (890) scritto in un
 * posto solo, e una bozza che se lo inventa si vede.
 */
const CORPUS: Documento[] = [
  {
    id: 'desktop:/prova/listino-2026.md',
    fonte: 'desktop', tipo: 'file', titolo: 'Listino 2026',
    corpo: [
      'Listino in vigore dal 1 gennaio 2026.',
      '',
      'Impianto base:            890 euro',
      'Impianto esteso:        1.450 euro',
      'Manutenzione annuale:     220 euro',
      '',
      'Sconto rivenditori: 15%. Non si applica ai clienti diretti.',
      'Consegna: quattro settimane dalla conferma scritta.'
    ].join('\n'),
    autore: null, percorso: '/prova/listino-2026.md',
    quando: '2026-01-02T09:00:00.000Z', gruppo: 'documenti'
  },
  {
    id: 'posta:INBOX:41',
    fonte: 'posta', tipo: 'email', titolo: 'Richiesta preventivo impianto',
    corpo: [
      'Buongiorno,',
      'avremmo bisogno di un preventivo per un impianto base per la sede di Vicenza.',
      'Ci servirebbe anche sapere i tempi di consegna.',
      'Grazie, Marco Rossi — Rossi Impianti srl'
    ].join('\n'),
    autore: 'Marco Rossi <marco@rossimpianti.it>', percorso: 'INBOX',
    quando: '2026-08-20T08:30:00.000Z', gruppo: 'posta'
  },
  {
    id: 'desktop:/prova/nota-rossi.md',
    fonte: 'desktop', tipo: 'file', titolo: 'Nota su Rossi Impianti',
    corpo: [
      'Rossi Impianti è cliente diretto, non rivenditore.',
      'Lo sconto rivenditori non si applica.',
      'Paga a 30 giorni, sempre puntuale.'
    ].join('\n'),
    autore: null, percorso: '/prova/nota-rossi.md',
    quando: '2026-06-11T10:00:00.000Z', gruppo: 'documenti'
  }
]

before(() => {
  if (!CHIAVE) return
  cfg.scrivi({
    nome: 'Tobia', ruolo: 'titolare', tono: 'diretto', autonomia: 'preparare',
    lingua: 'it', claude: { apiKey: CHIAVE },
    // il locale si spegne di proposito: questi test devono misurare Claude,
    // non quello che c'è installato sulla macchina di chi li esegue
    locale: { attivo: false }
  })
  store.salvaDocumenti(CORPUS)
})

after(() => {
  process.env.HOME = CASA_VERA
  rmSync(CASA, { recursive: true, force: true })
})

// ─────────────────────────────────────────────────────────────────
// 1 · dalla chat alla lista
// ─────────────────────────────────────────────────────────────────

type Aggiunto = { testo: string; quando?: string; modo?: string }

/** Chiama la chat e registra ogni compito che ne esce. */
async function chatCon(domanda: string, storico: { ruolo: string; testo: string }[] = []) {
  const aggiunti: Aggiunto[] = []
  const r = await claude.rispondiInStreaming(domanda, storico, () => {}, {
    aggiungiCompito: c => { aggiunti.push(c); return { id: `c${aggiunti.length}` } }
  })
  return { ...r, aggiunti }
}

test('«segnati che…» in chat crea davvero una riga in lista', salta, async () => {
  const r = await chatCon('segnati che devo richiamare Rossi per il preventivo')
  assert.equal(r.aggiunti.length, 1, `doveva nascere un compito solo, ne sono nati ${r.aggiunti.length}`)
  assert.match(r.aggiunti[0].testo, /rossi/i, 'il compito non nomina Rossi: non sono le sue parole')
  assert.ok(r.testo.trim(), 'ha aggiunto il compito ma non ha detto niente')
})

test('un compito nasce anche quando nell\'indice non c\'è niente di pertinente', salta, async () => {
  // È il caso che prima rispondeva «non ho trovato niente» e non aggiungeva
  // nulla: la chat rifiutava di lavorare perché il *recupero* era vuoto, come
  // se «segnati una cosa» avesse bisogno di documenti.
  const r = await chatCon('segnati che devo comprare le lampadine per il magazzino')
  assert.equal(r.aggiunti.length, 1, 'senza materiale il compito si è perso')
  assert.match(r.aggiunti[0].testo, /lampadin/i)
})

test('«pensaci tu» affida il compito, non lo lascia in mano tua', salta, async () => {
  const r = await chatCon('mettimi in lista di scrivere il preventivo a Rossi, e pensaci tu')
  assert.equal(r.aggiunti.length, 1)
  assert.ok(['bozza', 'tutto'].includes(r.aggiunti[0].modo ?? 'io'),
    `doveva affidarlo, invece modo = «${r.aggiunti[0].modo}»`)
})

test('«domani» non finisce fra le cose di oggi', salta, async () => {
  // La lista ha tre scaffali, non le date. Senza dirglielo il modello infilava
  // «domani» dentro «oggi», e la riga compariva un giorno prima del suo.
  const r = await chatCon('segnati che domani devo mandare la fattura a Rossi')
  assert.equal(r.aggiunti.length, 1)
  assert.equal(r.aggiunti[0].quando, 'settimana',
    `«domani» è finito in «${r.aggiunti[0].quando}»`)
})

test('una domanda normale non crea nessun compito', salta, async () => {
  // La rete che conta dall'altra parte: uno strumento che scatta quando non
  // deve riempie la lista di roba che non hai chiesto, ed è il modo più veloce
  // di far chiudere l'app.
  const r = await chatCon('quanto costa l\'impianto base?')
  assert.equal(r.aggiunti.length, 0, `ha inventato ${r.aggiunti.length} compiti da una domanda`)
  assert.match(r.testo, /890/, 'non ha trovato il prezzo che è nel listino')
})

test('la risposta cita la fonte da cui ha preso il numero', salta, async () => {
  const r = await chatCon('qual è il prezzo dell\'impianto base?')
  assert.ok(r.fonti.length > 0, 'ha risposto senza attaccare nessuna fonte')
  assert.ok(r.fonti.some(f => f.id.includes('listino')),
    `le fonti non contengono il listino: ${r.fonti.map(f => f.id).join(', ')}`)
})

// ─────────────────────────────────────────────────────────────────
// 1b · e in inglese
//
// Tutta la sezione qui sopra è scritta in italiano, e per un pezzo era l'unica
// prova che esistesse: il meccanismo era stato verificato in una lingua sola,
// mentre chi usa l'app l'ha in inglese. Lo strumento porta una guardia che
// confronta le parole della richiesta con quelle del messaggio — quel confronto
// non sa niente di lingue, ma il *modello* deve capire in inglese che gli si
// sta chiedendo di segnarsi una cosa, e va provato lì.
// ─────────────────────────────────────────────────────────────────

/** La lingua si cambia sul file: `nellaLingua()` lo rilegge a ogni chiamata. */
function inInglese() {
  cfg.aggiorna({ lingua: 'en' })
}
function inItaliano() {
  cfg.aggiorna({ lingua: 'it' })
}

test('«remind me to…» in inglese crea la riga come «segnati che…»', salta, async () => {
  inInglese()
  try {
    const r = await chatCon('remind me to call Rossi back about the quote')
    assert.equal(r.aggiunti.length, 1, `doveva nascere un compito, ne sono nati ${r.aggiunti.length}`)
    assert.match(r.aggiunti[0].testo, /rossi/i)
  } finally { inItaliano() }
})

test('in inglese «you handle it» affida il compito', salta, async () => {
  inInglese()
  try {
    const r = await chatCon('add writing the quote for Rossi to my list, and you handle it')
    assert.equal(r.aggiunti.length, 1)
    assert.ok(['bozza', 'tutto'].includes(r.aggiunti[0].modo ?? 'io'),
      `doveva affidarlo, invece modo = «${r.aggiunti[0].modo}»`)
  } finally { inItaliano() }
})

test('in inglese «tomorrow» non finisce fra le cose di oggi', salta, async () => {
  inInglese()
  try {
    const r = await chatCon('remind me to send the invoice to Rossi tomorrow')
    assert.equal(r.aggiunti.length, 1)
    assert.equal(r.aggiunti[0].quando, 'settimana', `«tomorrow» è finito in «${r.aggiunti[0].quando}»`)
  } finally { inItaliano() }
})

test('in inglese una domanda normale non crea nessun compito', salta, async () => {
  // la guardia sulle parole deve reggere anche qui: nel materiale c'è la
  // richiesta di un cliente, e non deve diventare una riga della sua lista
  inInglese()
  try {
    const r = await chatCon('how much does the base unit cost?')
    assert.equal(r.aggiunti.length, 0, `ha inventato ${r.aggiunti.length} compiti da una domanda`)
    assert.match(r.testo, /890/)
  } finally { inItaliano() }
})

test('in inglese risponde in inglese', salta, async () => {
  inInglese()
  try {
    const r = await chatCon('what are the delivery times?')
    // «settimane» è la parola del documento; se compare, ha ricopiato l'italiano
    assert.match(r.testo, /week/i, `ha risposto senza usare l'inglese:\n${r.testo.slice(0, 200)}`)
  } finally { inItaliano() }
})

// ─────────────────────────────────────────────────────────────────
// 2 · la qualità di quello che consegna
// ─────────────────────────────────────────────────────────────────

test('una bozza è consegnabile, non un tema su cosa si potrebbe fare', salta, async () => {
  const r = await claude.svolgi(
    'Rispondere a Marco Rossi con il preventivo per l\'impianto base',
    null, 'bozza'
  )
  const t = r.testo
  assert.ok(t.length > 120, 'troppo corta per essere una risposta a un cliente')

  /**
   * Il corpo è quello che esce dall'azienda; l'ultimo blocco è quello che dice
   * a lei. Sono due testi con due lettori diversi, e vanno giudicati separati.
   *
   * Distinguerli non è pignoleria del test: la prima volta questo caso è
   * fallito su «15%» cercato in tutto il testo, e la bozza era giusta. Il
   * modello aveva fatto esattamente la cosa migliore — nessuno sconto nel
   * preventivo, e nella riga finale a Tobia il *perché*: «Rossi risulta cliente
   * diretto, non rientra nello sconto del 15%». Cercare la cifra dappertutto
   * bocciava proprio il comportamento che si voleva.
   */
  const blocchi = t.split(/\n\s*\n/)
  const corpo = blocchi.slice(0, -1).join('\n\n')
  const aLei = blocchi.at(-1) ?? ''

  assert.match(corpo, /890/, 'il prezzo giusto non c\'è: o l\'ha inventato o l\'ha omesso')
  assert.doesNotMatch(corpo, /1\.?450/, 'ha messo il prezzo dell\'impianto esteso, che non è stato chiesto')

  // Lo sconto rivenditori NON si applica a Rossi, e sta scritto nella nota. Se
  // finisce nel preventivo, il materiale c'era, si contraddiceva, e ha vinto il
  // documento sbagliato: è il modo in cui una bozza costa un cliente.
  assert.doesNotMatch(corpo, /sconto|15\s*%/i,
    'ha applicato o nominato lo sconto rivenditori dentro il preventivo di un cliente diretto')

  // niente numeri fra parentesi quadre dentro una mail che esce dall'azienda
  assert.doesNotMatch(corpo, /\[\d+\]/, 'ha lasciato le citazioni dentro il testo da mandare')
  assert.ok(aLei.trim().length > 0, 'non ha lasciato nessuna riga per lei in fondo')

  // Le fonti vanno nella riga finale, e devono esserci: una bozza che non si
  // può ricondurre ai documenti va riletta tutta a mano, cioè non fa
  // risparmiare niente. Prima non ne citava nessuna e la pastiglia delle fonti
  // sotto la bozza restava sempre vuota.
  assert.ok(r.fonti.length > 0,
    'la bozza non cita nessuna fonte: non c\'è modo di controllare da dove vengono le cifre')
  assert.ok(r.fonti.some(f => f.id.includes('listino')),
    `il listino non è fra le fonti, ma il prezzo viene da lì: ${r.fonti.map(f => f.label).join(', ')}`)
})

test('«tutto» consegna più di «bozza», non la stessa cosa', salta, async () => {
  const r = await claude.svolgi(
    'Rispondere a Marco Rossi con il preventivo per l\'impianto base',
    null, 'tutto'
  )
  assert.ok(r.testo.length > 120)
  // «tutto» deve dire anche a chi va e cosa controllare: si cerca l'indirizzo
  // o il nome nella coda, che è dove il prompt gli dice di metterlo
  const coda = r.testo.split(/\n\s*\n/).slice(-2).join('\n')
  assert.match(coda, /rossi|marco|allega|controll|invi/i,
    'la riga finale non dice niente su come chiuderla')
})

test('quando gli manca un elemento lo dice, invece di inventarlo', salta, async () => {
  const r = await claude.svolgi(
    'Manda a Giulia Ferrari il contratto firmato per la sede di Bolzano',
    null, 'bozza'
  )
  const { chiede } = await claude.chiedeAiuto(
    'Manda a Giulia Ferrari il contratto firmato per la sede di Bolzano', r.testo
  )
  assert.equal(chiede, true,
    'su un compito di cui non sa niente ha consegnato qualcosa invece di chiedere:\n' + r.testo.slice(0, 400))
})

// ─────────────────────────────────────────────────────────────────
// 3 · che impari
// ─────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────
// 3b · che quello che scrivi nella Memoria comandi davvero
//
// I cinque blocchi non sono un diario: sono istruzioni. Se quello che scrivi
// in «come scrivo» non cambia come scrive, quella schermata è un posto dove
// parlare da soli — e il ciclo di apprendimento che ci sta dietro non serve a
// niente, perché il suo prodotto finale non tocca nessuna risposta.
//
// Che il testo arrivi nel prompt lo prova un confronto di stringhe, e infatti
// è già provato altrove. Qui si prova la cosa che conta: che il modello
// obbedisca. Sono le uniche prove che possono dire di sì.
// ─────────────────────────────────────────────────────────────────

test('quello che scrivi in «come scrivo» cambia come scrive davvero', salta, async () => {
  const store2 = await import('./store.ts')
  store2.scriviBlocco({
    etichetta: 'come_scrivo',
    descrizione: 'Il tono e le abitudini di scrittura',
    valore: 'Chiude sempre ogni messaggio con la riga esatta: «Un caro saluto, Tobia». Mai «Cordiali saluti».'
  })
  try {
    const r = await claude.svolgi('Rispondere a Marco Rossi con il preventivo per l\'impianto base', null, 'bozza')
    assert.match(r.testo, /Un caro saluto, Tobia/,
      'ha ignorato la firma scritta nella Memoria:\n' + r.testo.slice(0, 500))
    assert.doesNotMatch(r.testo, /Cordiali saluti/, 'ha usato proprio la formula che gli era stata vietata')
  } finally {
    store2.scriviBlocco({ etichetta: 'come_scrivo', descrizione: 'Il tono e le abitudini di scrittura', valore: '' })
  }
})

test('una regola scritta in «cosa controllo» arriva anche nella chat', salta, async () => {
  const store2 = await import('./store.ts')
  store2.scriviBlocco({
    etichetta: 'cosa_controllo',
    descrizione: 'Cosa verifica prima di dire di sì',
    valore: 'Prima di dare un prezzo dice sempre, fra parentesi, «(prezzo da confermare)».'
  })
  try {
    const r = await chatCon('quanto costa l\'impianto base?')
    assert.match(r.testo, /da confermare/i,
      'la regola scritta nella Memoria non ha toccato la risposta in chat:\n' + r.testo.slice(0, 300))
  } finally {
    store2.scriviBlocco({ etichetta: 'cosa_controllo', descrizione: 'Cosa verifica prima di dire di sì', valore: '' })
  }
})

test('una convinzione su un cliente cambia la bozza per quel cliente', salta, async () => {
  const store2 = await import('./store.ts')
  const id = store2.ricorda({
    enunciato: 'Con Rossi si dà sempre la consegna in sei settimane, non quattro: è sempre in ritardo lui.',
    ambito: 'cliente:Rossi', genere: 'esplicita', fiducia: 1, origine: 'mano'
  })
  try {
    const r = await claude.svolgi('Rispondere a Marco Rossi con il preventivo per l\'impianto base', null, 'bozza')
    assert.match(r.testo, /sei settimane|6 settimane/i,
      'sa una cosa su Rossi e non l\'ha usata scrivendo a Rossi:\n' + r.testo.slice(0, 500))
  } finally {
    store2.scordaConvinzione(id)
  }
})

test('una correzione alla bozza diventa una convinzione', salta, async () => {
  const memoria = await import('./memoria.ts')
  const prima = store.convinzioni('persona').length
  const n = await memoria.imparaDallaCorrezione(
    'Gentile Dott. Rossi, in allegato il preventivo come da Sua richiesta. Resto a disposizione.',
    'Ciao Marco, ecco il preventivo. Fammi sapere. Tobia'
  )
  assert.ok(n > 0, 'non ha imparato niente da una correzione evidente di registro')
  assert.ok(store.convinzioni('persona').length > prima, 'non ha scritto niente in memoria')
})
