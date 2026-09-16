// La coda dei compiti affidati, senza un modello sotto.
//
// Quello che si prova qui non è che il modello scriva bene: è che quello che
// sta *attorno* alla chiamata faccia le quattro cose che deve, e che sono
// esattamente quelle che nessuno vedrebbe sbagliare:
//
//   · chi ha affidato la riga sente com'è andata — preso, cosa sta facendo,
//     pronto — e nessun altro sente niente, perché dentro un `pronto` c'è la
//     bozza, che di solito è una email;
//   · una riga richiamata mentre il modello scrive non si vede piombare sopra
//     la bozza in ritardo;
//   · un modello che esplode lascia la riga aperta con il perché scritto
//     accanto, non «da Myynd» per sempre;
//   · i passi arrivano strutturati, così il client li dice nella sua lingua.
//
// Il modello si sostituisce con `perProva`: è l'unica strada, ed esiste apposta.
//
//   node --test server/compiti.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-compiti-'))
process.env.MYYND_DATI = CASA

const store = await import('./store.ts')
const compiti = await import('./compiti.ts')
type Evento = import('./compiti.ts').Evento
type Passo = import('./claude.ts').Passo

before(() => store.azzeraTutto())
after(() => {
  compiti.perProva(null)
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

let n = 0
function riga(testo: string): string {
  const id = `c${++n}`
  store.scriviCompito({ id, testo, ordine: `o${String(n).padStart(3, '0')}` })
  return id
}

/** Raccoglie gli eventi di una riga e sa aspettare una fase precisa. */
function orecchio(id: string, di?: string | null) {
  const sentiti: Evento[] = []
  const attese = new Map<string, (e: Evento) => void>()
  const smetti = compiti.ascolta(e => {
    if (!('id' in e) || e.id !== id) return
    sentiti.push(e)
    attese.get(e.fase)?.(e)
  }, di === undefined ? null : di)
  const aspetta = (fase: Evento['fase'], ms = 3000) => new Promise<Evento>((risolvi, rifiuta) => {
    const gia = sentiti.find(e => e.fase === fase)
    if (gia) return risolvi(gia)
    const t = setTimeout(() => rifiuta(new Error(`nessun «${fase}» entro ${ms}ms: ${sentiti.map(e => e.fase).join(' → ') || 'niente'}`)), ms)
    attese.set(fase, e => { clearTimeout(t); risolvi(e) })
  })
  return { sentiti, aspetta, smetti }
}

const pausa = (ms: number) => new Promise(r => setTimeout(r, ms))

const nonChiede = async () => ({ chiede: false, manca: [], domanda: '' })
const nessunaDomanda = async () => []

test('la delega riceve il progetto attuale per ID e conserva le note della riga', async () => {
  const progetti = await import('./progetti.ts')
  const p = progetti.scrivi({ nome: 'Aurora', obiettivo: 'Lanciare con cinque clienti' })
  let notaRicevuta: string | null = null
  compiti.perProva({ svolgi: async (_testo, nota) => {
    notaRicevuta = nota ?? null
    return { testo: 'Traccia pronta da rivedere.', fonti: [] }
  }, chiedeAiuto: nonChiede, domandeDaFare: nessunaDomanda })
  const id = riga('Preparare il piano')
  store.cambiaCompito(id, { progetto: p.id, nota: 'Usare la versione breve.' })
  progetti.cambia(p.id, { nome: 'Aurora Studio', obiettivo: 'Validare con tre clienti' })
  const o = orecchio(id)
  compiti.affida(id, 'bozza')
  await o.aspetta('pronto')
  assert.equal(notaRicevuta, 'Progetto: Aurora Studio\nObiettivo: Validare con tre clienti\nUsare la versione breve.')
  assert.equal(store.compito(id)?.stato, 'pronto')
  assert.equal(progetti.progresso(p.id).completate, 0)
  o.smetti()
})

test('saved email policy reaches delegation and dismissal during classification prevents saving', async () => {
  const d = { id: 'posta:policy-race', fonte: 'posta', tipo: 'email', titolo: 'Sequoia pilot scope', corpo: 'Could you confirm the Sequoia pilot scope?', autore: 'Lee <lee@example.com>', quando: new Date().toISOString() }
  store.salvaDocumenti([d])
  store.scriviCompito({ id: 'policy-feedback', testo: 'Pilot scope', doc: d.id, ordine: 'policy-feedback' })
  const policy = { nomi: ['posta.leggi'], selezione: 'richieste-dirette' as const, ambitoSelezione: 'Sequoia' }
  store.scriviCompito({ id: 'policy-work', testo: 'Summarize direct email', origine: 'auto:human-mail', doc: d.id, attrezzi: policy, ordine: 'policy-work' })
  let ricevuta: unknown
  compiti.perProva({
    svolgi: async (_c, _n, _m, _a, _cart, _passo, _doc, vincolo) => {
      ricevuta = vincolo
      return { testo: 'Lee asks for scope confirmation.', fonti: [{ id: d.id, label: '[1] Scope' }], verificaDocumenti: [d.id] }
    },
    chiedeAiuto: async () => {
      store.cambiaStatoCompito('policy-feedback', 'lasciato')
      return { chiede: false, manca: [], domanda: '' }
    },
    domandeDaFare: nessunaDomanda
  })
  const o = orecchio('policy-work')
  compiti.affida('policy-work', 'bozza')
  await o.aspetta('guaio')
  assert.deepEqual(ricevuta, policy)
  assert.equal(store.compito('policy-work')?.risultato, null)
  assert.notEqual(store.compito('policy-work')?.stato, 'pronto')
  assert.ok(!o.sentiti.some(e => e.fase === 'pronto'))
  o.smetti()
})

test('una riga affidata fa preso → lavoro → pronto, e solo a chi l’ha affidata', async () => {
  compiti.perProva({
    svolgi: async (_c, _n, _m, _a, _cart, onPasso) => {
      onPasso?.({ passo: 'cerco', dettaglio: 'listino Rossi' })
      onPasso?.({ passo: 'scrivo' })
      return { testo: 'Gentile Rossi, ecco il preventivo.', fonti: [{ id: 'posta:INBOX:1', label: '[1] Preventivo' }] }
    },
    chiedeAiuto: nonChiede,
    domandeDaFare: nessunaDomanda
  })
  const id = riga('Mandare il preventivo a Rossi')
  const mio = orecchio(id)
  const altro = orecchio(id, 'qualcun-altro')

  compiti.affida(id, 'bozza')
  const pronto = await mio.aspetta('pronto')

  assert.deepEqual(mio.sentiti.map(e => e.fase), ['preso', 'lavoro', 'lavoro', 'lavoro', 'pronto'])
  assert.equal(pronto.fase === 'pronto' && pronto.compito.risultato, 'Gentile Rossi, ecco il preventivo.')
  assert.equal(pronto.fase === 'pronto' && pronto.compito.stato, 'pronto')

  // il filo di un'altra persona non ha sentito niente: dentro il «pronto» c'è
  // la bozza, e la bozza è quasi sempre una email
  assert.deepEqual(altro.sentiti, [])

  const c = store.compito(id)!
  assert.equal(c.stato, 'pronto')
  assert.equal(c.modo, 'bozza')
  assert.deepEqual(c.fonti, [{ id: 'posta:INBOX:1', label: '[1] Preventivo' }])

  mio.smetti(); altro.smetti()
})

test('un risultato con le lineette arriva pulito, in fonte come nell\'email', async () => {
  let bozzaVistaDaEmail = ''
  compiti.perProva({
    svolgi: async () => ({
      testo: 'Il succo in una riga — la parte che conta.\n\nGentile Rossi — ecco il preventivo — a presto.',
      fonti: []
    }),
    chiedeAiuto: nonChiede,
    domandeDaFare: nessunaDomanda,
    postaCollegata: () => true,
    preparaEmail: async (_c, bozza) => { bozzaVistaDaEmail = bozza; return emailFinta() }
  })
  const id = riga('Mandare il preventivo a Rossi')
  const o = orecchio(id)
  compiti.affida(id, 'bozza')
  const pronto = await o.aspetta('pronto')

  const risultato = pronto.fase === 'pronto' ? pronto.compito.risultato : null
  assert.equal(risultato, 'Il succo in una riga. La parte che conta.\n\nGentile Rossi. Ecco il preventivo. A presto.')
  assert.ok(!risultato?.includes('—'), `lineetta lunga rimasta: ${risultato}`)
  assert.equal(store.compito(id)!.risultato, risultato)

  // la stessa pulizia arriva a chi smonta l'email: non una bozza pulita e
  // un'email che porta ancora gli incisi del modello
  assert.equal(bozzaVistaDaEmail, risultato)
  o.smetti()
})

test('una riga in modo prompt arriva a «pronto» senza che nessuno prepari una email', async () => {
  // il prompt parla di una email, con tanto di saluto: è esattamente il testo
  // su cui `sembraUnMessaggio` direbbe di sì
  const prompt = 'Scrivi un\'email a Rossi.\n\nComincia con «Gentile Rossi» e chiudi con «Cordiali saluti».\n\nFonti:\n— [1] Listino 2026: il prezzo\n\nManca il preventivo di marzo.'
  // `svolgiUno` passa tutto da `senzaTrattini` prima di salvare, anche un
  // prompt: la lineetta a inizio riga diventa il trattino di un elenco, come
  // in qualunque altro risultato
  const pulito = 'Scrivi un\'email a Rossi.\n\nComincia con «Gentile Rossi» e chiudi con «Cordiali saluti».\n\nFonti:\n- [1] Listino 2026: il prezzo\n\nManca il preventivo di marzo.'
  let preparate = 0
  compiti.perProva({
    svolgi: async (_c, _n, modo) => {
      assert.equal(modo, 'prompt', 'il modo non è arrivato a chi scrive')
      return { testo: prompt, fonti: [{ id: 'desktop:listino', label: '[1] Listino 2026' }] }
    },
    chiedeAiuto: nonChiede,
    domandeDaFare: nessunaDomanda,
    postaCollegata: () => true,
    preparaEmail: async () => { preparate++; return { a: 'rossi@esempio.it', oggetto: 'Preventivo', corpo: prompt } }
  })
  const id = riga('Mandare il preventivo a Rossi')
  const o = orecchio(id)
  compiti.affida(id, 'prompt')
  const pronto = await o.aspetta('pronto')

  assert.equal(pronto.fase === 'pronto' && pronto.compito.risultato, pulito)
  const c = store.compito(id)!
  assert.equal(c.stato, 'pronto')
  assert.equal(c.modo, 'prompt')
  assert.equal(c.email, null, 'sotto un prompt è comparsa una email da mandare')
  assert.equal(preparate, 0, 'un prompt non è una email: prepararla è una chiamata buttata')

  // «Rifallo», e la risposta a una domanda: si riaffida con il modo della riga,
  // che resta prompt — è la stessa cosa che fa la rotta `/rispondi`
  compiti.affida(id, c.modo)
  assert.equal(store.compito(id)!.modo, 'prompt')
  await o.aspetta('pronto')
  o.smetti()
})

test('i passi arrivano strutturati, non come frasi', async () => {
  const passi: Passo[] = [
    { passo: 'cerco', dettaglio: 'listino 2026' },
    { passo: 'apro', dettaglio: 'Preventivo di marzo' },
    { passo: 'scrivo' }
  ]
  compiti.perProva({
    svolgi: async (_c, _n, _m, _a, _cart, onPasso) => {
      for (const p of passi) onPasso?.(p)
      return { testo: 'Fatto.', fonti: [] }
    },
    chiedeAiuto: nonChiede,
    domandeDaFare: nessunaDomanda
  })
  const id = riga('Una riga')
  const o = orecchio(id)
  compiti.affida(id, 'bozza')
  await o.aspetta('pronto')

  const lavoro = o.sentiti.filter(e => e.fase === 'lavoro').map(e => e.fase === 'lavoro' && e.passo)
  assert.deepEqual(lavoro, [{ passo: 'preparo' }, ...passi])
  o.smetti()
})

test('una riga richiamata mentre il modello scrive butta il risultato in ritardo', async () => {
  let finisci: (r: { testo: string; fonti: [] }) => void = () => {}
  let onPassoVivo: ((p: Passo) => void) | undefined
  compiti.perProva({
    svolgi: (_c, _n, _m, _a, _cart, onPasso) => new Promise(r => { finisci = r; onPassoVivo = onPasso }),
    chiedeAiuto: nonChiede,
    domandeDaFare: nessunaDomanda
  })
  const id = riga('Una cosa che poi mi faccio io')
  const o = orecchio(id)
  compiti.affida(id, 'bozza')
  await o.aspetta('preso')
  assert.equal(store.compito(id)!.stato, 'delegato')

  compiti.richiama(id)
  await o.aspetta('richiamato')
  assert.equal(store.compito(id)!.stato, 'aperto')

  // il modello finisce dopo: la bozza non deve comparire, e nemmeno i passi
  onPassoVivo?.({ passo: 'scrivo' })
  finisci({ testo: 'Una bozza che nessuno vuole più.', fonti: [] })
  await pausa(80)

  assert.ok(!o.sentiti.some(e => e.fase === 'pronto'), 'ha annunciato una bozza su una riga richiamata')
  assert.ok(!o.sentiti.slice(o.sentiti.findIndex(e => e.fase === 'richiamato') + 1).some(e => e.fase === 'lavoro'), 'ha annunciato un passo dopo il richiamo')
  const c = store.compito(id)!
  assert.equal(c.stato, 'aperto')
  assert.equal(c.risultato, null)
  assert.equal(c.modo, 'io')
  o.smetti()
})

test('un modello che esplode lascia la riga aperta, con il perché', async () => {
  compiti.perProva({
    svolgi: async () => { throw new Error('Il modello non risponde. Riprova.') },
    chiedeAiuto: nonChiede,
    domandeDaFare: nessunaDomanda
  })
  const id = riga('Una riga che va storta')
  const o = orecchio(id)
  compiti.affida(id, 'tutto')
  const g = await o.aspetta('guaio')

  assert.equal(g.fase === 'guaio' && g.guaio, 'Il modello non risponde. Riprova.')
  assert.deepEqual(o.sentiti.map(e => e.fase), ['preso', 'lavoro', 'guaio'])
  const c = store.compito(id)!
  assert.equal(c.stato, 'aperto')
  assert.equal(c.guaio, 'Il modello non risponde. Riprova.')
  assert.equal(c.risultato, null)
  o.smetti()
})

test('una risposta che chiede qualcosa finisce in «chiede», non in «pronto»', async () => {
  compiti.perProva({
    svolgi: async () => ({ testo: 'Mi manca l\'indirizzo di Rossi.', fonti: [] }),
    chiedeAiuto: async () => ({ chiede: true, manca: ['indirizzo'], domanda: 'A quale indirizzo scrivo a Rossi?' }),
    domandeDaFare: async () => [{ domanda: 'A chi va?', opzioni: ['Rossi', 'Bianchi'], multipla: false }]
  })
  const id = riga('Scrivere a Rossi')
  const o = orecchio(id)
  compiti.affida(id, 'bozza')
  const e = await o.aspetta('chiede')
  assert.equal(e.fase === 'chiede' && e.compito.stato, 'chiede')
  assert.ok(!o.sentiti.some(x => x.fase === 'pronto'))
  const c = store.compito(id)!
  assert.equal(c.stato, 'chiede')
  assert.equal(c.chieste?.length, 1)
  o.smetti()
})

test('riaffidare la stessa riga nello stesso modo non la mette in fila due volte', async () => {
  let volte = 0
  compiti.perProva({
    svolgi: async () => { volte++; await pausa(30); return { testo: 'Ok.', fonti: [] } },
    chiedeAiuto: nonChiede,
    domandeDaFare: nessunaDomanda
  })
  const id = riga('Due clic')
  const o = orecchio(id)
  compiti.affida(id, 'bozza')
  compiti.affida(id, 'bozza')
  await o.aspetta('pronto')
  await pausa(80)
  assert.equal(volte, 1)
  assert.equal(o.sentiti.filter(e => e.fase === 'pronto').length, 1)
  o.smetti()
})

// — l'email già pronta, quando la bozza lo è —
//
// Mandare è un gesto solo perché l'email si smonta *prima* che la riga si
// accenda: il «pronto» arriva con dentro a chi va. Qui si prova che succeda
// solo quando deve — posta collegata, bozza che sembra un messaggio, riga
// ancora pronta — e che quando non riesce la bozza non ne soffra.

const emailFinta = async () => ({ a: 'rossi@esempio.it', oggetto: 'Preventivo', corpo: 'Gentile Rossi, ecco.', rispondeA: null })

test('con la posta collegata il «pronto» porta già l’email, e la riga la tiene', async () => {
  let preparate = 0
  compiti.perProva({
    svolgi: async () => ({ testo: 'Gentile Rossi, ecco il preventivo.\n\n(per te: l\'ho preso dal listino)', fonti: [] }),
    chiedeAiuto: nonChiede,
    domandeDaFare: nessunaDomanda,
    postaCollegata: () => true,
    preparaEmail: async (...a) => { preparate++; return emailFinta() }
  })
  const id = riga('Mandare il preventivo a Rossi')
  const o = orecchio(id)
  compiti.affida(id, 'bozza')
  const pronto = await o.aspetta('pronto')

  assert.equal(preparate, 1)
  const email = pronto.fase === 'pronto' ? pronto.compito.email : null
  assert.deepEqual(email, { a: 'rossi@esempio.it', oggetto: 'Preventivo', corpo: 'Gentile Rossi, ecco.', rispondeA: null, conosciuto: false })
  assert.deepEqual(store.compito(id)!.email, email)
  o.smetti()
})

test('senza la posta collegata non si prepara niente', async () => {
  let preparate = 0
  compiti.perProva({
    svolgi: async () => ({ testo: 'Gentile Rossi, ecco.', fonti: [] }),
    chiedeAiuto: nonChiede,
    domandeDaFare: nessunaDomanda,
    postaCollegata: () => false,
    preparaEmail: async () => { preparate++; return emailFinta() }
  })
  const id = riga('Mandare il preventivo a Rossi')
  const o = orecchio(id)
  compiti.affida(id, 'bozza')
  const pronto = await o.aspetta('pronto')
  assert.equal(preparate, 0)
  assert.equal(pronto.fase === 'pronto' && pronto.compito.email, null)
  o.smetti()
})

test('una bozza che non sembra un messaggio non paga il modello che la smonta', async () => {
  let preparate = 0
  compiti.perProva({
    svolgi: async () => ({ testo: '- lunedì: riunione\n- martedì: fiera', fonti: [] }),
    chiedeAiuto: nonChiede,
    domandeDaFare: nessunaDomanda,
    postaCollegata: () => true,
    preparaEmail: async () => { preparate++; return emailFinta() }
  })
  const id = riga('Riassumere la settimana')
  const o = orecchio(id)
  compiti.affida(id, 'bozza')
  await o.aspetta('pronto')
  assert.equal(preparate, 0)
  assert.equal(store.compito(id)!.email, null)
  o.smetti()
})

test('su una riga che chiede non si prepara: non c’è ancora niente da mandare', async () => {
  let preparate = 0
  compiti.perProva({
    svolgi: async () => ({ testo: 'Mi manca l\'indirizzo di Rossi.', fonti: [] }),
    chiedeAiuto: async () => ({ chiede: true, manca: ['indirizzo'], domanda: 'A quale indirizzo scrivo a Rossi?' }),
    domandeDaFare: nessunaDomanda,
    postaCollegata: () => true,
    preparaEmail: async () => { preparate++; return emailFinta() }
  })
  const id = riga('Scrivere a Rossi')
  const o = orecchio(id)
  compiti.affida(id, 'bozza')
  await o.aspetta('chiede')
  assert.equal(preparate, 0)
  assert.equal(store.compito(id)!.email, null)
  o.smetti()
})

test('se smontarla fallisce la bozza è pronta lo stesso, senza email', async () => {
  compiti.perProva({
    svolgi: async () => ({ testo: 'Gentile Rossi, ecco.', fonti: [] }),
    chiedeAiuto: nonChiede,
    domandeDaFare: nessunaDomanda,
    postaCollegata: () => true,
    preparaEmail: async () => { throw new Error('Il modello non risponde.') }
  })
  const id = riga('Scrivere a Rossi')
  const o = orecchio(id)
  compiti.affida(id, 'bozza')
  const pronto = await o.aspetta('pronto')
  assert.equal(pronto.fase === 'pronto' && pronto.compito.stato, 'pronto')
  assert.equal(pronto.fase === 'pronto' && pronto.compito.risultato, 'Gentile Rossi, ecco.')
  assert.equal(pronto.fase === 'pronto' && pronto.compito.email, null)
  assert.ok(!o.sentiti.some(e => e.fase === 'guaio'))
  o.smetti()
})

test('richiamare la riga porta via anche l’email, e una risposta pure', async () => {
  compiti.perProva({
    svolgi: async () => ({ testo: 'Gentile Rossi, ecco.', fonti: [] }),
    chiedeAiuto: nonChiede,
    domandeDaFare: nessunaDomanda,
    postaCollegata: () => true,
    preparaEmail: emailFinta
  })
  const id = riga('Scrivere a Rossi')
  const o = orecchio(id)
  compiti.affida(id, 'bozza')
  await o.aspetta('pronto')
  assert.ok(store.compito(id)!.email)

  compiti.richiama(id)
  await o.aspetta('richiamato')
  assert.equal(store.compito(id)!.email, null)
  assert.equal(store.compito(id)!.risultato, null)

  // la strada di «rispondi» e «riapri» è `sbozzaCompito`: stessa pulizia
  store.scriviEmailCompito(id, { a: 'x@y.it', oggetto: 'o', corpo: 'c', conosciuto: true })
  store.sbozzaCompito(id)
  assert.equal(store.compito(id)!.email, null)
  o.smetti()
})

test('un risultato nuovo azzera l’email di quello vecchio', () => {
  const id = riga('Scrivere a Rossi')
  store.affidaCompito(id, 'bozza')
  store.risultatoCompito(id, 'Prima bozza.', [], 'pronto')
  store.scriviEmailCompito(id, { a: 'x@y.it', oggetto: 'o', corpo: 'c', conosciuto: true })
  store.affidaCompito(id, 'bozza')
  store.risultatoCompito(id, 'Seconda bozza.', [], 'pronto')
  assert.equal(store.compito(id)!.email, null)
})

/*
 * `madre`: da quale riga è nata una riga, e che resti scritto.
 *
 * Il tredici settembre il punto ha scritto «di’ quale unità di H-Farm guarda
 * l’audit», e lui ha chiesto dove fosse quella cosa. Da nessuna parte: non
 * veniva da un documento, veniva dalle domande di un’altra riga — e quel filo
 * si perdeva nel momento stesso in cui la riga era scritta. Qui si prova la
 * metà noiosa e indispensabile: la colonna c’è, ci arriva quello che si scrive,
 * e una riscrittura non la cancella.
 */
test('madre si scrive, si rilegge, e una riscrittura non taglia il filo', () => {
  store.scriviCompito({ id: 'm-madre', testo: 'Rispondere alle quattro domande sull’ambito', ordine: 'z001' })
  store.scriviCompito({
    id: 'm-figlia', testo: 'Di’ quale unità di H-Farm guarda l’audit',
    ordine: 'z002', origine: 'punto', madre: 'm-madre'
  })

  assert.equal(store.compito('m-figlia')?.madre, 'm-madre', 'la riga non sa più da chi viene')
  assert.equal(store.compito('m-madre')?.madre, null, 'una riga scritta a mano è nata da qualcuno')
  assert.equal(store.elencoCompiti().find(c => c.id === 'm-figlia')?.madre, 'm-madre',
    'la lista che va al client si porta via la provenienza')

  // riscritta senza `madre`: chi non la manda non sta dicendo «dimenticala»
  store.scriviCompito({ id: 'm-figlia', testo: 'Di’ quale unità guarda l’audit', ordine: 'z002' })
  assert.equal(store.compito('m-figlia')?.madre, 'm-madre', 'una riscrittura si è portata via il filo')
})

test('verified native delivery skips speculative classification; execution is cancellable and replayed only to its owner', async () => {
  let signal: AbortSignal | undefined
  let resolveWork: (value: {testo: string; fonti: never[]; eseguito: boolean}) => void = () => {}
  compiti.perProva({ svolgi: async (_t, _n, _m, _a, _c, passo, _d, _s, execution) => {
    signal = execution?.signal
    assert.equal(execution?.nativa, true)
    passo?.({ passo: 'apro', dettaglio: 'Pages' })
    return new Promise(r => { resolveWork = r })
  }, chiedeAiuto: async () => { throw new Error('Verified execution must not be reclassified') } })
  const id = riga('Write an essay in Pages')
  const o = orecchio(id)
  compiti.affida(id, 'tutto')
  await o.aspetta('lavoro')
  const replay: Evento[] = []
  const stop = compiti.ascolta(e => replay.push(e))
  assert.ok(replay.some(e => e.fase === 'lavoro' && e.id === id))
  const stranger: Evento[] = []
  const stopOther = compiti.ascolta(e => stranger.push(e), 'different-user')
  assert.equal(stranger.length, 0)
  assert.equal(signal?.aborted, false)
  resolveWork({ testo: 'Created and saved in Pages: /verified/document.pages', fonti: [], eseguito: true })
  await o.aspetta('pronto')
  assert.equal(store.compito(id)?.stato, 'pronto')
  stop(); stopOther(); o.smetti()
  await pausa(10)

  compiti.perProva({ svolgi: async (_t, _n, _m, _a, _c, _p, _d, _s, execution) => {
    signal = execution?.signal
    return new Promise(r => { resolveWork = r })
  } })
  const cancelled = riga('Write another essay in Pages')
  compiti.affida(cancelled, 'tutto')
  await pausa(10)
  compiti.richiama(cancelled)
  assert.equal(signal?.aborted, true)
  resolveWork({testo: 'Late result',fonti: [],eseguito: true})
  await pausa(10)
  assert.equal(store.compito(cancelled)?.stato, 'aperto')
  assert.equal(store.compito(cancelled)?.risultato, null)
})

test('created artifact is not ready when actual visual review failed or was unavailable', async () => {
 for (const esito of ['revise','unavailable'] as const) {
  compiti.perProva({svolgi:async()=>({testo:'Saved for review.',fonti:[],eseguito:true,consegna:{app:'Pages',titolo:'Review sample',percorso:'/verified/sample.pages',verificato:true,caratteri:100,revisione:{esito,problemi:['Review did not pass.']}}}),chiedeAiuto:async()=>{throw Error('Do not reclassify evidence')}})
  const id=riga('Write an essay in Pages');const o=orecchio(id)
  compiti.affida(id,'tutto');await o.aspetta('chiede')
  assert.equal(store.compito(id)?.stato,'chiede')
  assert.equal(store.compito(id)?.consegna?.revisione?.esito,esito)
  o.smetti();await pausa(10)
 }
})

test('preparation is immediate and replayable before production reports a stage', async () => {
 let finish: (value: {testo:string;fonti:never[];eseguito:boolean}) => void = () => {}
 compiti.perProva({svolgi: () => new Promise(resolve => { finish = resolve })})
 const id = riga('Private request text must not be logged')
 const o = orecchio(id)
 compiti.affida(id, 'tutto')
 const event = await o.aspetta('lavoro')
 assert.deepEqual(event, {fase:'lavoro',id,passo:{passo:'preparo'}})
 const replay: Evento[]=[]
 const stop=compiti.ascolta(e => replay.push(e))
 assert.ok(replay.some(e => e.fase==='lavoro' && e.id===id && e.passo.passo==='preparo'))
 compiti.richiama(id)
 const after: Evento[]=[];const stopAfter=compiti.ascolta(e=>after.push(e))
 assert.ok(!after.some(e=>'id' in e && e.id===id))
 finish({testo:'Cancelled',fonti:[],eseguito:true})
 await pausa(10)
 stop();stopAfter();o.smetti()
})

test('an explicitly delegated email reply is saved as a real mailbox draft', async () => {
  const doc = { id: 'posta:INBOX:reply-verification', fonte: 'posta', tipo: 'email', titolo: 'Question', corpo: 'Could you confirm the proposal?', autore: 'sender@example.com', quando: new Date().toISOString(), messageId: 'source@example.com' }
  store.salvaDocumenti([doc])
  const id='explicit-mailbox-reply'
  store.scriviCompito({id,testo:'Reply to this email with the proposal',doc:doc.id,ordine:'z'})
  let writes=0
  compiti.perProva({svolgi:async()=>({testo:'Dear Sender, here is the proposal.',fonti:[]}),chiedeAiuto:nonChiede,domandeDaFare:nessunaDomanda,postaCollegata:()=>true,
    preparaEmail:async()=>({a:'sender@example.com',oggetto:'Re: Question',corpo:'Here is the proposal.'}),
    salvaBozzaCasella:async(task,source,email)=>{writes++;assert.equal(task,id);assert.equal(source,doc.id);assert.equal(email.rispondeA?.messageId,doc.messageId);return{stato:'salvata',id:'draft1',url:'message://draft1'}}})
  const o=orecchio(id);compiti.affida(id,'bozza');await o.aspetta('pronto');o.smetti()
  assert.equal(writes,1);assert.equal(store.compito(id)?.email?.casella?.stato,'salvata')
})

test('restart recovers one bounded read-only initiative attempt, never arbitrary/native work', async () => {
  const cfg=await import('./config.ts');const initiative=await import('./iniziativa.ts')
  cfg.scrivi({lingua:'en',autonomia:'preparare'});initiative.imposta(true)
  const doc={id:'posta:recovery',fonte:'posta',tipo:'email',titolo:'Review the proposal',corpo:'Could you review the project proposal and reply with your feedback?',autore:'Jane <jane@example.com>',quando:new Date().toISOString()}
  store.salvaDocumenti([doc])
  store.scriviCompito({id:'recovery-safe',testo:'Prepare a reply',ordine:'rec-a',origine:'iniziativa',doc:doc.id})
  store.affidaCompito('recovery-safe','bozza')
  store.scriviCompito({id:'recovery-manual',testo:'Write an essay in Pages',ordine:'rec-b',origine:'chat'})
  store.affidaCompito('recovery-manual','tutto')
  let calls=0
  compiti.perProva({svolgi:async (_t,_n,_m,_a,_folder,_step,_doc,_selection,execution)=>{
    calls++;assert.equal(execution?.nativa,false);return {testo:'A recovered draft.',fonti:[],eseguito:true}
  },postaCollegata:()=>false})
  const listener=orecchio('recovery-safe')
  assert.equal(compiti.riprendiAppesi(()=>true),2)
  await listener.aspetta('pronto');await pausa(10)
  assert.equal(calls,1);assert.equal(store.compito('recovery-manual')?.stato,'aperto')
  store.affidaCompito('recovery-safe','bozza')
  compiti.riprendiAppesi(()=>true);await pausa(10)
  assert.equal(calls,1);assert.equal(store.compito('recovery-safe')?.stato,'aperto')
  listener.smetti();initiative.imposta(false)
})

test('restart does not resume proactive work after opt-out or loss of provider', async () => {
  const initiative=await import('./iniziativa.ts')
  for(const [id,enabled,ready] of [['recovery-off',false,true],['recovery-offline',true,false]] as const){
    initiative.imposta(enabled)
    store.scriviCompito({id,testo:'Reply',ordine:id,origine:'iniziativa',doc:'posta:recovery'})
    store.affidaCompito(id,'bozza')
    compiti.riprendiAppesi(()=>ready)
    assert.equal(store.compito(id)?.stato,'aperto')
  }
  initiative.imposta(false)
})

test('mail revision conflict after email preparation emits chiede with visible error and never saves or announces ready', async () => {
  const {rivediDallaChat}=await import('./revisioni.ts')
  const doc={id:'posta:revision-race',fonte:'posta',tipo:'email',titolo:'Proposal review',corpo:'Could you reply with the revised proposal?',autore:'client@example.com',quando:new Date().toISOString(),messageId:'revision-source@example.com'}
  store.salvaDocumenti([doc])
  const parent='mail-revision-race-parent'
  store.scriviCompito({id:parent,testo:'Reply to the proposal email',doc:doc.id,ordine:'race-parent'})
  store.affidaCompito(parent,'bozza')
  store.risultatoCompito(parent,'Dear Client, Tuesday works for me.',[],'pronto')
  const {id}=await rivediDallaChat({id:parent,feedback:'Change the proposed day to Wednesday'},'Change the proposed day to Wednesday',()=>{})
  let writes=0,preparations=0
  compiti.perProva({
    svolgi:async()=>({testo:'Dear Client, Wednesday works for me.',fonti:[]}),
    chiedeAiuto:nonChiede,domandeDaFare:nessunaDomanda,postaCollegata:()=>true,
    preparaEmail:async()=>{
      preparations++
      store.tieniLaTua(parent,'Dear Client, I manually changed this draft to Friday.')
      return {a:'client@example.com',oggetto:'Re: Proposal review',corpo:'Wednesday works for me.'}
    },
    salvaBozzaCasella:async()=>{writes++;return {stato:'salvata',id:'must-not-exist'}}
  })
  const o=orecchio(id)
  compiti.affida(id,'bozza')
  const event=await o.aspetta('chiede')
  assert.equal(preparations,1)
  assert.equal(writes,0)
  assert.equal(event.fase==='chiede' && event.compito.stato,'chiede')
  assert.match(store.compito(id)?.risultato||'',/previous draft changed/i)
  assert.equal(store.compito(id)?.email,null)
  assert.ok(!o.sentiti.some(e=>e.fase==='pronto'))
  assert.match(store.compito(parent)?.risultato||'',/manually changed/)
  o.smetti();await pausa(10)
})

test('ordinary parent-linked follow-up completes without requiring a revision baseline', async () => {
  const parent=riga('Discuss the launch plan')
  const id='ordinary-follow-up-no-revision'
  store.scriviCompito({id,testo:'Prepare the next meeting agenda',madre:parent,origine:'chat',ordine:'follow-up'})
  compiti.perProva({svolgi:async()=>({testo:'Agenda prepared.',fonti:[],eseguito:true})})
  const o=orecchio(id);compiti.affida(id,'bozza');await o.aspetta('pronto')
  assert.equal(store.compito(id)?.stato,'pronto')
  assert.equal(store.compito(id)?.risultato,'Agenda prepared.')
  assert.ok(!o.sentiti.some(e=>e.fase==='guaio'))
  o.smetti();await pausa(10)
})
