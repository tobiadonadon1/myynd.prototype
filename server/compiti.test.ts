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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

type Giudizio = import('./revisione-lavoro.ts').Giudizio
type Ferri = NonNullable<Parameters<typeof compiti.perProva>[0]>
const nonDisponibile = async (): Promise<Giudizio> => ({ esito: 'unavailable', per: '', comeTe: '', comeLoro: '', problemi: [], verificato: [] })
/**
 * Le mani per le prove: la rilettura e la cosa dopo stanno zitte se la prova
 * non le nomina. Senza questo, una chiave ANTHROPIC_API_KEY nell'ambiente
 * basterebbe a far partire un revisore vero in mezzo a una prova sulla coda.
 */
/** Le consegne su file delle prove: in casa, mai sulla Scrivania vera. */
const CONSEGNE = join(CASA, 'consegne')
const salvaInCasa: Ferri['salvaConsegna'] = o => {
  mkdirSync(join(CONSEGNE, o.luogo), { recursive: true })
  const nome = `${o.titolo.replace(/[\\/:*?"<>|]+/g, ' ').trim()}.md`
  const percorso = join(CONSEGNE, o.luogo, nome)
  writeFileSync(percorso, o.testo)
  return { percorso, nome, luogo: o.luogo }
}
function prova(f: Ferri) {
  compiti.perProva({ giudica: nonDisponibile, prossimoPasso: async () => null, salvaConsegna: salvaInCasa, ...f })
}

test('la delega riceve il progetto attuale per ID e conserva le note della riga', async () => {
  const progetti = await import('./progetti.ts')
  const p = progetti.scrivi({ nome: 'Aurora', obiettivo: 'Lanciare con cinque clienti' })
  let notaRicevuta: string | null = null
  prova({ svolgi: async (_testo, nota) => {
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
  prova({
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
  prova({
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
  assert.equal(pronto.fase === 'pronto' && pronto.compito.risultato, 'Done: the deliverable is below.\n\nGentile Rossi, ecco il preventivo.')
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
  prova({
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
  assert.equal(risultato, 'Done: the deliverable is below.\n\nIl succo in una riga. La parte che conta.\n\nGentile Rossi. Ecco il preventivo. A presto.')
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
  prova({
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
  prova({
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
  prova({
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
  prova({
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
  prova({
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
  prova({
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
  prova({
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
  prova({
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
  prova({
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
  prova({
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
  prova({
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
  assert.equal(pronto.fase === 'pronto' && pronto.compito.risultato, 'Done: the deliverable is below.\n\nGentile Rossi, ecco.')
  assert.equal(pronto.fase === 'pronto' && pronto.compito.email, null)
  assert.ok(!o.sentiti.some(e => e.fase === 'guaio'))
  o.smetti()
})

test('richiamare la riga porta via anche l’email, e una risposta pure', async () => {
  prova({
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
  prova({ svolgi: async (_t, _n, _m, _a, _c, passo, _d, _s, execution) => {
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

  prova({ svolgi: async (_t, _n, _m, _a, _c, _p, _d, _s, execution) => {
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
  prova({svolgi:async()=>({testo:'Saved for review.',fonti:[],eseguito:true,consegna:{app:'Pages',titolo:'Review sample',percorso:'/verified/sample.pages',verificato:true,caratteri:100,revisione:{esito,problemi:['Review did not pass.']}}}),chiedeAiuto:async()=>{throw Error('Do not reclassify evidence')}})
  const id=riga('Write an essay in Pages');const o=orecchio(id)
  compiti.affida(id,'tutto');await o.aspetta('chiede')
  assert.equal(store.compito(id)?.stato,'chiede')
  assert.equal(store.compito(id)?.consegna?.revisione?.esito,esito)
  o.smetti();await pausa(10)
 }
})

test('preparation is immediate and replayable before production reports a stage', async () => {
 let finish: (value: {testo:string;fonti:never[];eseguito:boolean}) => void = () => {}
 prova({svolgi: () => new Promise(resolve => { finish = resolve })})
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
  prova({svolgi:async()=>({testo:'Dear Sender, here is the proposal.',fonti:[]}),chiedeAiuto:nonChiede,domandeDaFare:nessunaDomanda,postaCollegata:()=>true,
    preparaEmail:async()=>({a:'sender@example.com',oggetto:'Re: Question',corpo:'Here is the proposal.'}),
    salvaBozzaCasella:async(task,source,email)=>{writes++;assert.equal(task,id);assert.equal(source,doc.id);assert.equal(email.rispondeA?.messageId,doc.messageId);return{stato:'salvata',id:'draft1',url:'message://draft1'}}})
  const o=orecchio(id);compiti.affida(id,'bozza');await o.aspetta('pronto');o.smetti()
  assert.equal(writes,1);assert.equal(store.compito(id)?.email?.casella?.stato,'salvata')
})

// P4 · una mail di Mail del Mac non ha una casella dove mettere la bozza: la
// riga resta pronta con il testo, e nessuno bussa alla casella IMAP
test('a delegated reply to a Mail on this Mac message stays ready with no mailbox call and no error', async () => {
  const doc = { id: 'postamac:CONTO/INBOX/12.emlx', fonte: 'postamac', tipo: 'email', titolo: 'Menu wording', corpo: 'Could you confirm the menu wording by Thursday?', autore: 'Maya <maya@northwind-studio.test>', quando: new Date().toISOString(), messageId: 'menu@northwind-studio.test' }
  store.salvaDocumenti([doc])
  const id = 'reply-mail-on-mac'
  store.scriviCompito({ id, testo: 'Reply to Maya about the menu wording', doc: doc.id, ordine: 'z2' })
  let casella = 0, smontata = 0
  prova({ svolgi: async () => ({ testo: 'Dear Maya, the wording is confirmed.', fonti: [] }), chiedeAiuto: nonChiede, domandeDaFare: nessunaDomanda, postaCollegata: () => true,
    preparaEmail: async () => { smontata++; return { a: 'maya@northwind-studio.test', oggetto: 'Re: Menu wording', corpo: 'The wording is confirmed.' } },
    salvaBozzaCasella: async () => { casella++; return { stato: 'salvata', id: 'x', url: 'message://x' } } })
  const o = orecchio(id); compiti.affida(id, 'bozza'); await o.aspetta('pronto'); await pausa(20); o.smetti()
  assert.equal(casella, 0)
  assert.equal(smontata, 0)
  const c = store.compito(id)
  assert.equal(c?.stato, 'pronto')
  assert.equal(c?.guaio ?? null, null)
  assert.equal(c?.email ?? null, null)
  assert.match(String(c?.risultato ?? ''), /wording is confirmed/)
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
  prova({svolgi:async (_t,_n,_m,_a,_folder,_step,_doc,_selection,execution)=>{
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
  prova({
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
  prova({svolgi:async()=>({testo:'Agenda prepared.',fonti:[],eseguito:true})})
  const o=orecchio(id);compiti.affida(id,'bozza');await o.aspetta('pronto')
  assert.equal(store.compito(id)?.stato,'pronto')
  assert.equal(store.compito(id)?.risultato,'Done: the deliverable is below.\n\nAgenda prepared.')
  assert.ok(!o.sentiti.some(e=>e.fase==='guaio'))
  o.smetti();await pausa(10)
})

/*
 * La rilettura: una bozza non è pronta perché il modello ha smesso di scrivere.
 *
 * «Quando affido una cosa a Myynd devo sapere che è di qualità, e cioè che
 * non accetta la sua prima stesura.» Qui si prova la meccanica attorno al
 * revisore, che nelle prove è finto: una stesura bocciata si riscrive una
 * volta sola con i problemi nella nota, il verdetto finisce sulla riga con il
 * conto dei giri, un revisore assente non ferma niente, e le righe che non
 * portano la sua firma — una domanda, un prompt — non passano di qui.
 */
const passa = async (): Promise<Giudizio> => ({ esito: 'pass', per: 'Rossi', comeTe: 'Va bene così.', comeLoro: 'Chiaro, rispondo.', problemi: [], verificato: ['prezzo contro il listino'] })
const boccia = async (): Promise<Giudizio> => ({ esito: 'revise', per: 'Rossi', comeTe: 'Il prezzo non torna.', comeLoro: 'Mi aspettavo 980.', problemi: ['il prezzo dice 890, il listino dice 980'], verificato: ['prezzo contro il listino'] })

test('una stesura bocciata si riscrive una volta, con i problemi nella nota, e il verdetto resta sulla riga', async () => {
  const note: (string | null | undefined)[] = []
  const giudicati: string[] = []
  prova({
    svolgi: async (_t, nota) => { note.push(nota); return { testo: note.length === 1 ? 'Gentile Rossi, l\'impianto costa 890 euro.' : 'Gentile Rossi, l\'impianto costa 980 euro.', fonti: [] } },
    chiedeAiuto: nonChiede, domandeDaFare: nessunaDomanda,
    giudica: async ({ risultato, nota }) => { giudicati.push(risultato); return nota?.startsWith('Rivedi:') ? passa() : boccia() }
  })
  const id = riga('Mandare il preventivo a Rossi')
  const o = orecchio(id)
  compiti.affida(id, 'bozza')
  const pronto = await o.aspetta('pronto')

  assert.equal(note.length, 2, 'una stesura bocciata si riscrive una volta, non zero e non due')
  assert.equal(note[0], null)
  assert.match(note[1] ?? '', /^Rivedi:/, 'il feedback non comincia con «Rivedi:»')
  assert.match(note[1] ?? '', /- il prezzo dice 890, il listino dice 980/, 'il problema non è arrivato a chi riscrive')
  assert.deepEqual(giudicati, ['Done: the deliverable is below.\n\nGentile Rossi, l\'impianto costa 890 euro.', 'Done: the deliverable is below.\n\nGentile Rossi, l\'impianto costa 980 euro.'])

  const c = store.compito(id)!
  assert.equal(c.stato, 'pronto')
  assert.equal(c.risultato, 'Done: the deliverable is below.\n\nGentile Rossi, l\'impianto costa 980 euro.')
  assert.deepEqual(c.revisione, { esito: 'pass', per: 'Rossi', comeTe: 'Va bene così.', comeLoro: 'Chiaro, rispondo.', problemi: [], verificato: ['prezzo contro il listino'], giri: 2 })
  // e il «pronto» lo porta già con sé: chi guarda non deve rileggere la lista
  assert.equal(pronto.fase === 'pronto' && pronto.compito.revisione?.giri, 2)
  o.smetti()
})

test('se non passa nemmeno la seconda si consegna lo stesso, con il verdetto accanto: mai un terzo giro', async () => {
  let stesure = 0
  prova({ svolgi: async () => { stesure++; return { testo: 'Gentile Rossi, ecco.', fonti: [] } }, chiedeAiuto: nonChiede, domandeDaFare: nessunaDomanda, giudica: boccia })
  const id = riga('Mandare il preventivo a Rossi')
  const o = orecchio(id)
  compiti.affida(id, 'tutto')
  await o.aspetta('pronto')
  assert.equal(stesure, 2)
  const c = store.compito(id)!
  assert.equal(c.stato, 'pronto')
  assert.equal(c.revisione?.esito, 'revise')
  assert.equal(c.revisione?.giri, 2)
  assert.deepEqual(c.revisione?.problemi, ['il prezzo dice 890, il listino dice 980'])
  o.smetti()
})

test('una stesura che passa al primo giro resta com\'è, con il verdetto e un giro solo', async () => {
  let stesure = 0
  prova({ svolgi: async () => { stesure++; return { testo: 'Gentile Rossi, ecco.', fonti: [] } }, chiedeAiuto: nonChiede, domandeDaFare: nessunaDomanda, giudica: passa })
  const id = riga('Mandare il preventivo a Rossi')
  const o = orecchio(id)
  compiti.affida(id, 'bozza')
  await o.aspetta('pronto')
  assert.equal(stesure, 1)
  const c = store.compito(id)!
  assert.equal(c.revisione?.esito, 'pass')
  assert.equal(c.revisione?.giri, 1)
  assert.equal(c.revisione?.comeTe, 'Va bene così.')
  assert.equal(c.revisione?.comeLoro, 'Chiaro, rispondo.')
  assert.equal(store.elencoCompiti().find(x => x.id === id)?.revisione?.esito, 'pass', 'la lista che va al client non porta il verdetto')
  o.smetti()
})

test('senza un revisore la riga è pronta come prima, e lo dice: unavailable', async () => {
  let stesure = 0
  prova({ svolgi: async () => { stesure++; return { testo: 'Gentile Rossi, ecco.', fonti: [] } }, chiedeAiuto: nonChiede, domandeDaFare: nessunaDomanda })
  const id = riga('Mandare il preventivo a Rossi')
  const o = orecchio(id)
  compiti.affida(id, 'bozza')
  await o.aspetta('pronto')
  assert.equal(stesure, 1)
  const c = store.compito(id)!
  assert.equal(c.stato, 'pronto')
  assert.equal(c.risultato, 'Done: the deliverable is below.\n\nGentile Rossi, ecco.')
  assert.deepEqual(c.revisione, { esito: 'unavailable', per: '', comeTe: '', comeLoro: '', problemi: [], verificato: [], giri: 1 })
  assert.ok(!o.sentiti.some(e => e.fase === 'guaio'))
  o.smetti()
})

test('una domanda e un prompt non si rileggono, e una riga riaffidata che stavolta chiede perde il verdetto di ieri', async () => {
  let giudicate = 0
  const conta = async () => { giudicate++; return passa() }
  prova({ svolgi: async () => ({ testo: 'Mi manca l\'indirizzo di Rossi.', fonti: [] }), chiedeAiuto: async () => ({ chiede: true, manca: ['indirizzo'], domanda: 'A quale indirizzo scrivo a Rossi?' }), domandeDaFare: nessunaDomanda, giudica: conta })
  const chiede = riga('Scrivere a Rossi')
  const o1 = orecchio(chiede)
  compiti.affida(chiede, 'bozza')
  await o1.aspetta('chiede')
  assert.equal(giudicate, 0, 'ha riletto una domanda')
  assert.equal(store.compito(chiede)!.revisione, null)
  o1.smetti()

  prova({ svolgi: async () => ({ testo: 'Scrivi a Rossi.', fonti: [] }), chiedeAiuto: nonChiede, domandeDaFare: nessunaDomanda, giudica: conta })
  const prompt = riga('Mandare il preventivo a Rossi')
  const o2 = orecchio(prompt)
  compiti.affida(prompt, 'prompt')
  await o2.aspetta('pronto')
  assert.equal(giudicate, 0, 'ha riletto un prompt')
  assert.equal(store.compito(prompt)!.revisione, null)
  o2.smetti()

  prova({ svolgi: async () => ({ testo: 'Gentile Rossi, ecco.', fonti: [] }), chiedeAiuto: nonChiede, domandeDaFare: nessunaDomanda, giudica: conta })
  const ieri = riga('Mandare il preventivo a Rossi')
  const o3 = orecchio(ieri)
  compiti.affida(ieri, 'bozza')
  await o3.aspetta('pronto')
  assert.equal(giudicate, 1)
  assert.equal(store.compito(ieri)!.revisione?.esito, 'pass')
  o3.smetti()
  prova({ svolgi: async () => ({ testo: 'Mi manca il listino.', fonti: [] }), chiedeAiuto: async () => ({ chiede: true, manca: ['listino'], domanda: 'Quale listino uso?' }), domandeDaFare: nessunaDomanda, giudica: conta })
  const o4 = orecchio(ieri)
  compiti.affida(ieri, 'tutto')
  await o4.aspetta('chiede')
  assert.equal(giudicate, 1)
  assert.equal(store.compito(ieri)!.revisione, null, 'il «passa» di ieri è rimasto sotto una domanda')
  o4.smetti()
})

test('quando chiede, sulla riga c\'è prima cosa ha visto e poi la domanda sola', async () => {
  prova({
    svolgi: async () => ({ testo: 'Ho letto il filo con H-Farm.\n\n1. Analizzo il perimetro\n2. Chiedo: di quale unità parliamo? E quando?', fonti: [] }),
    chiedeAiuto: async () => ({ chiede: true, manca: ['unità'], domanda: 'Di quale unità parliamo?', visto: 'Ho letto il filo con H-Farm: l\'audit nomina due unità.' }),
    domandeDaFare: nessunaDomanda
  })
  const id = riga('Rispondere a H-Farm sull\'audit')
  const o = orecchio(id)
  compiti.affida(id, 'bozza')
  await o.aspetta('chiede')
  assert.equal(store.compito(id)!.risultato, 'Ho letto il filo con H-Farm: l\'audit nomina due unità.\nDi quale unità parliamo?')
  o.smetti()
})

/*
 * La frase di chiusura.
 *
 * «Signal more clearly when it's done with a clear message that everything
 * has been done.» La prima riga di un risultato pronto dice cosa è stato
 * prodotto e dove, composta dai fatti se il modello non l'ha scritta, tenuta
 * se l'ha scritta; e il revisore riceve i fatti per controllarla. Non su una
 * domanda, non su un prompt.
 */
test('un risultato pronto comincia con «Done:» composto dai fatti, o con quello che il modello ha scritto; il revisore riceve i fatti', async () => {
  const cfg = await import('./config.ts')
  cfg.scrivi({ lingua: 'en' })
  const fatti = [
    { attrezzo: 'leggi_pagina' as const, esito: 'ok' as const, dettaglio: 'https://www.h-farm.com/en' },
    { attrezzo: 'crea_nota' as const, esito: 'ok' as const, dettaglio: 'H-Farm pilot' }
  ]
  let ricevuti: unknown = null
  let riletto = ''
  prova({
    svolgi: async () => ({ testo: 'Myynd pilot inside H-Farm: one team, four weeks, a review with the CEO at the end.', fonti: [], fatti }),
    chiedeAiuto: nonChiede, domandeDaFare: nessunaDomanda,
    giudica: async o => { ricevuti = o.fatti; riletto = o.risultato; return passa() }
  })
  const id = riga('Define a Myynd pilot inside H-Farm')
  const o = orecchio(id)
  compiti.affida(id, 'bozza')
  await o.aspetta('pronto')
  const atteso = 'Done: the note «H-Farm pilot» is in Apple Notes; the rest is below after reading 1 web page.\n\nMyynd pilot inside H-Farm: one team, four weeks, a review with the CEO at the end.'
  assert.equal(store.compito(id)!.risultato, atteso)
  assert.equal(riletto, atteso, 'il revisore deve rileggere il testo con la frase di chiusura davanti')
  assert.deepEqual(ricevuti, fatti, 'il revisore non ha ricevuto i fatti')
  o.smetti()

  // scritta dal modello: si tiene, nella lingua dell'app
  prova({ svolgi: async () => ({ testo: 'Fatto: the reply to Rossi is ready below.\nHello Rossi, here is the quote.', fonti: [], fatti: [] }), chiedeAiuto: nonChiede, domandeDaFare: nessunaDomanda })
  const sua = riga('Reply to Rossi')
  const o2 = orecchio(sua)
  compiti.affida(sua, 'bozza')
  await o2.aspetta('pronto')
  assert.equal(store.compito(sua)!.risultato, 'Done: the reply to Rossi is ready below.\n\nHello Rossi, here is the quote.')
  o2.smetti()

  // una domanda non ha finito niente: nessuna frase davanti
  prova({ svolgi: async () => ({ testo: 'Which unit is the audit about?', fonti: [], fatti: [] }), chiedeAiuto: async () => ({ chiede: true, manca: ['unit'], domanda: 'Which unit is the audit about?' }), domandeDaFare: nessunaDomanda })
  const chiede = riga('Reply to H-Farm about the audit')
  const o3 = orecchio(chiede)
  compiti.affida(chiede, 'bozza')
  await o3.aspetta('chiede')
  assert.equal(store.compito(chiede)!.risultato, 'Which unit is the audit about?')
  o3.smetti()
})

/*
 * La cosa dopo.
 *
 * «Torna con il risultato e con la cosa dopo.» Si prova che la riga nasca una
 * volta, figlia della riga finita e nel suo progetto, e soprattutto quando
 * NON nasce: da una riga nata così, da una madre che ha già figli, quando una
 * simile è già in lista, quando il modello non ha niente da proporre.
 */
test('a lavoro pronto la cosa dopo entra in lista una volta sola, figlia della riga e nel suo progetto', async () => {
  const progetti = await import('./progetti.ts')
  const p = progetti.scrivi({ nome: 'Preventivi', obiettivo: 'Chiudere Rossi entro il mese' })
  let proposte = 0
  prova({
    svolgi: async () => ({ testo: 'Gentile Rossi, ecco il preventivo.', fonti: [] }), chiedeAiuto: nonChiede, domandeDaFare: nessunaDomanda,
    prossimoPasso: async ({ compito, progetto, inLista }) => {
      proposte++
      assert.equal(compito.testo, 'Mandare il preventivo a Rossi')
      assert.equal(progetto?.id, p.id)
      assert.ok(!inLista.includes('Mandare il preventivo a Rossi'), 'la riga stessa sta fra quelle «già in lista»')
      return 'Fissare la chiamata con Rossi sul preventivo'
    }
  })
  const id = riga('Mandare il preventivo a Rossi')
  store.cambiaCompito(id, { progetto: p.id })
  const o = orecchio(id)
  compiti.affida(id, 'bozza')
  await o.aspetta('pronto')
  await pausa(60)

  const figlie = store.elencoCompiti().filter(c => c.madre === id)
  assert.equal(figlie.length, 1)
  const f = figlie[0]
  assert.equal(f.testo, 'Fissare la chiamata con Rossi sul preventivo')
  assert.equal(f.origine, 'seguito')
  assert.equal(f.progetto, p.id)
  assert.equal(f.quando, 'oggi')
  assert.equal(f.modo, 'io')
  assert.equal(f.stato, 'aperto')
  o.smetti()

  // «rifallo»: la madre ha già una figlia, non se ne fa un'altra e non si chiede nemmeno
  const o2 = orecchio(id)
  compiti.affida(id, 'tutto')
  await o2.aspetta('pronto')
  await pausa(60)
  assert.equal(proposte, 1)
  assert.equal(store.elencoCompiti().filter(c => c.madre === id).length, 1)
  o2.smetti()
})

test('la cosa dopo non nasce da una riga nata così, né se una simile è già in lista, né dal niente', async () => {
  let proposte = 0
  prova({ svolgi: async () => ({ testo: 'Fatto.', fonti: [] }), chiedeAiuto: nonChiede, domandeDaFare: nessunaDomanda, prossimoPasso: async () => { proposte++; return 'Mandare il contratto firmato a Rossi' } })

  store.scriviCompito({ id: 'seguito-1', testo: 'Fissare la chiamata con Rossi', origine: 'seguito', madre: 'qualcuno', ordine: 'seg-1' })
  const o1 = orecchio('seguito-1')
  compiti.affida('seguito-1', 'bozza')
  await o1.aspetta('pronto')
  await pausa(40)
  assert.equal(proposte, 0, 'ha proposto un seguito a un seguito')
  assert.equal(store.elencoCompiti().filter(c => c.madre === 'seguito-1').length, 0)
  o1.smetti()

  const prima = store.elencoCompiti().length
  store.scriviCompito({ id: 'gia-in-lista', testo: 'Manda a Rossi il contratto firmato', ordine: 'gia-1' })
  const id = riga('Preparare il contratto per Rossi')
  const o2 = orecchio(id)
  compiti.affida(id, 'bozza')
  await o2.aspetta('pronto')
  await pausa(40)
  assert.equal(proposte, 1)
  assert.equal(store.elencoCompiti().filter(c => c.madre === id).length, 0, 'ha messo in lista una riga che c\'era già, detta in altre parole')
  assert.equal(store.elencoCompiti().length, prima + 2)
  o2.smetti()

  prova({ svolgi: async () => ({ testo: 'Fatto.', fonti: [] }), chiedeAiuto: nonChiede, domandeDaFare: nessunaDomanda, prossimoPasso: async () => null })
  const niente = riga('Riassumere la settimana')
  const o3 = orecchio(niente)
  compiti.affida(niente, 'bozza')
  await o3.aspetta('pronto')
  await pausa(40)
  assert.equal(store.elencoCompiti().filter(c => c.madre === niente).length, 0)
  o3.smetti()
})

/*
 * Una risposta che congeda la riga.
 *
 * «This is not relevant.» in risposta a una domanda non è il pezzo che
 * mancava: è la chiusura, con il motivo. La rotta chiude; qui si prova la
 * lettura pura, nelle due lingue, e i casi in cui NON si chiude: una
 * risposta lunga, o un congedo seguito da un ordine.
 */
test('rispostaCheChiude: «lascia stare» e «già fatto» nelle due lingue; un ordine dopo, o una risposta lunga, non chiudono', () => {
  const lasciate = ['this is not relevant.', 'Not relevant', 'irrelevant', 'skip', 'Skip it.', 'drop it', 'not now', 'Not relevant now, the client dropped out.',
    'No, skip it', 'It is not relevant anymore', 'later', 'never mind', 'non serve', 'Non è rilevante.', 'lascia stare', 'Lasciamo perdere, non serve più.', 'non serve più', 'salta', 'dopo']
  for (const r of lasciate) assert.equal(compiti.rispostaCheChiude(r), 'lasciato', `doveva chiudere come lasciata: «${r}»`)
  const fatte = ['already done', 'Done.', 'I have completed it, i have approved it.', 'I did it', 'It\'s already done', 'già fatto', 'Fatta.', 'L\'ho già mandata.', 'Sì, già fatto', 'ho fatto tutto']
  for (const r of fatte) assert.equal(compiti.rispostaCheChiude(r), 'fatto', `doveva chiudere come fatta: «${r}»`)
  const no = ['Not now, use the June figures instead', 'Skip the intro and write the full email', 'Done, send it to Rossi',
    'Use this shared link: https://drive.example.com/x.mov, recorded on an iPhone 15. Setup steps for the reviewer: install build 6, tap Allow, open Reels.',
    'The source is the Notion export, one page, and the result is a table in the prod database with the same columns.', 'no', 'Rossi', 'not sure']
  for (const r of no) assert.equal(compiti.rispostaCheChiude(r), null, `non doveva chiudere: «${r}»`)
})

test('la lezione della chiusura porta con sé la domanda a cui rispondeva', async () => {
  const scambi: { ruolo: string; testo: string }[][] = []
  compiti.perProva({ distilla: async s => { scambi.push(s); return 0 } })
  compiti.imparaDallaChiusura({ testo: 'Ingest one controlled real source in H-Brain production', nota: null }, 'lasciato', 'this is not relevant.', 'What should exist when this is done?')
  assert.equal(scambi.length, 1)
  assert.match(scambi[0][0].testo, /Myynd le aveva chiesto: What should exist when this is done\?/)
  assert.match(scambi[0][1].testo, /lasciata perdere.*this is not relevant\./)
  // sotto le quattro parole non si impara niente, come sempre
  compiti.imparaDallaChiusura({ testo: 'Una cosa', nota: null }, 'lasciato', 'skip', 'Quale?')
  assert.equal(scambi.length, 1)
  compiti.perProva(null)
})

/*
 * Il materiale del progetto.
 *
 * La cartella di lavoro si trova per nome o per alias del riferimento, la
 * memoria del progetto e le sue righe del riferimento arrivano a `svolgi`
 * insieme al percorso della cartella. Una riga di un progetto senza cartella
 * lavora com'era.
 */
test('una riga di un progetto porta a svolgi la cartella di lavoro, la memoria e le righe del riferimento; il percorso è la cartella', async () => {
  const progetti = await import('./progetti.ts')
  const riferimento = await import('./riferimento.ts')
  const pm = await import('./project-memory.ts')
  const p = progetti.scrivi({ nome: 'Evermute', obiettivo: 'Ship Evermute 1.0' })
  const q = progetti.scrivi({ nome: 'Nextas', obiettivo: 'Un altro' })
  store.salvaDocumenti([
    { id: 'lavoro:/Users/prova/Desktop/everwave', fonte: 'lavoro', tipo: 'cartella', titolo: 'Lavoro: everwave', corpo: 'Ultimi commit:\n2026-09-10  screen time permission flow\nREADME: # everwave', percorso: '/Users/prova/Desktop/everwave', autore: null, quando: '2026-09-10T10:00:00.000Z' },
    { id: 'lavoro:/Users/prova/Desktop/nextas', fonte: 'lavoro', tipo: 'cartella', titolo: 'Lavoro: nextas', corpo: 'README: # nextas', percorso: '/Users/prova/Desktop/nextas', autore: null, quando: '2026-09-10T10:00:00.000Z' }
  ])
  riferimento.scrivi('Evermute (everwave): waiting on Apple, I send the recording Friday.\nNextas: dead, dropped it in August.')
  pm.recordCurrentWork(p.id, 'Preparing the App Review reply.')

  const m = compiti.materialeDelProgetto(p)
  assert.equal(m.cartella?.id, 'lavoro:/Users/prova/Desktop/everwave', 'la cartella si trova dall\'alias del riferimento')
  assert.match(m.riferimento, /waiting on Apple/)
  assert.ok(!/Nextas: dead/.test(m.riferimento), 'le righe degli altri progetti non c\'entrano')
  assert.match(m.memoria, /Preparing the App Review reply/)
  assert.equal(compiti.materialeDelProgetto(q).cartella?.id, 'lavoro:/Users/prova/Desktop/nextas', 'per nome, quando non c\'è un alias')

  let ricevuto: { cartella: string | null | undefined; concessi: string[]; materiale: unknown; nota: string | null | undefined } | null = null
  prova({
    svolgi: async (_t, nota, _m, concessi, cartella, _p, _d, _s, _e, materiale) => {
      ricevuto = { cartella, concessi: concessi ?? [], materiale, nota }
      return { testo: 'Reply to App Review with the link and the steps, whole and ready to send.', fonti: [] }
    },
    chiedeAiuto: async (_c, _r, nota) => { assert.match(nota ?? '', /^Progetto: Evermute/, 'chi classifica non ha ricevuto la nota'); return { chiede: false, manca: [], domanda: '' } },
    domandeDaFare: nessunaDomanda
  })
  const id = riga('Reply to App Review with the recording')
  store.cambiaCompito(id, { progetto: p.id })
  const o = orecchio(id)
  compiti.affida(id, 'bozza')
  await o.aspetta('pronto')
  assert.ok(ricevuto, 'svolgi non è stato chiamato')
  const r = ricevuto as unknown as { cartella: string | null | undefined; concessi: string[]; materiale: { cartella: { id: string } | null; memoria: string; riferimento: string }; nota: string }
  assert.equal(r.cartella, '/Users/prova/Desktop/everwave')
  assert.equal(r.materiale.cartella?.id, 'lavoro:/Users/prova/Desktop/everwave')
  assert.match(r.materiale.riferimento, /waiting on Apple/)
  // senza Claude Code installato e cartelle collegate non si concede nessuna mano
  assert.deepEqual(r.concessi, [])
  o.smetti()

  // una riga di codice si riconosce; le mani si concedono solo se ci sono
  assert.equal(compiti.sembraLavoroDiCodice('Fix the crash in ScreenTimeManager.swift', null), true)
  assert.equal(compiti.sembraLavoroDiCodice('Reply to App Review with the recording', null), false)
})

/*
 * La consegna su file.
 *
 * «Once the work was produced, he just pasted it under the task on my feed.
 * That's not okay. He should tell me, "Hey, I saved it to your desktop".»
 * Una pagina scritta si salva come file nel luogo delle consegne; sulla riga
 * resta la frase che dice dove, più la riga per lei; il revisore e la cosa
 * dopo leggono il lavoro intero. E il luogo si impara dalle sue parole.
 */
test('una pagina scritta si salva come file nel luogo delle consegne, e sulla riga resta dove sta più la riga per lei', async () => {
  const cfg = await import('./config.ts')
  cfg.scrivi({ lingua: 'en' })
  const corpo = '# Introducing Myynd to H-Farm\n\n' + 'Myynd is a personal digital twin that reads what you already have. '.repeat(20).trim() + '\n\n## Why now\n\nBecause.'
  const pagina = corpo + '\n\nI assumed the audience is the leadership team; tell me if it is the students.'
  let riletto = ''
  let seguito = ''
  prova({
    svolgi: async () => ({ testo: pagina, fonti: [], fatti: [] }),
    chiedeAiuto: nonChiede, domandeDaFare: nessunaDomanda,
    giudica: async o => { riletto = o.risultato; return passa() },
    prossimoPasso: async o => { seguito = o.risultato; return null }
  })
  const id = riga('Introduce Myynd to H-Farm')
  const o = orecchio(id)
  compiti.affida(id, 'bozza')
  const e = await o.aspetta('pronto')
  const c = store.compito(id)!
  assert.equal(c.consegna?.app, 'File')
  assert.equal(c.consegna?.dove, 'scrivania', 'il predefinito è la Scrivania nuda: «save it to my Desktop» è la sua opzione')
  assert.equal(c.consegna?.titolo, 'Introduce Myynd to H-Farm.md')
  assert.equal(readFileSync(c.consegna!.percorso, 'utf8'), corpo, 'il file ha il documento, senza la frase di chiusura né la riga per lei')
  assert.equal(c.risultato, 'Done: «Introduce Myynd to H-Farm.md» is on your Desktop.\n\nI assumed the audience is the leadership team; tell me if it is the students.')
  assert.equal(c.consegna?.revisione?.esito, 'pass')
  assert.ok(riletto.includes('## Why now'), 'il revisore rilegge il documento intero')
  assert.ok(seguito.includes('## Why now'), 'la cosa dopo si cerca dal lavoro intero')
  assert.equal(e.fase === 'pronto' && e.compito.consegna?.app, 'File')
  o.smetti()
})

test('«save it to my Desktop» nella risposta si impara e vale da subito; un messaggio e una risposta corta restano sulla riga', async () => {
  const cfg = await import('./config.ts')
  cfg.scrivi({ lingua: 'en' })
  prova({ svolgi: async () => ({ testo: 'Yes: go with the June figures.', fonti: [], fatti: [] }), chiedeAiuto: nonChiede, domandeDaFare: nessunaDomanda })
  const corta = riga('Decide which figures to use')
  store.cambiaCompito(corta, { nota: 'Put it in my Downloads folder.' })
  const o = orecchio(corta)
  compiti.affida(corta, 'bozza')
  await o.aspetta('pronto')
  const c = store.compito(corta)!
  assert.equal(c.consegna?.app, 'File', 'l\'ha chiesto lei: si salva anche se corto')
  assert.equal(c.consegna?.dove, 'scaricati')
  assert.equal(c.risultato, 'Done: «Decide which figures to use.md» is in your Downloads folder. I will keep saving there.')
  assert.equal(cfg.leggi().consegne?.luogo, 'scaricati')
  o.smetti()

  // da adesso una pagina va in Download senza che lo dica, e «write» da solo non è una mail
  const pagina = '# Plan\n\n' + 'Step. '.repeat(200).trim() + '\n\nA.\n\nB.'
  prova({ svolgi: async () => ({ testo: pagina, fonti: [], fatti: [] }), chiedeAiuto: nonChiede, domandeDaFare: nessunaDomanda })
  const piano = riga('Write the pilot plan')
  const o2 = orecchio(piano)
  compiti.affida(piano, 'bozza')
  await o2.aspetta('pronto')
  assert.equal(store.compito(piano)!.consegna?.dove, 'scaricati')
  assert.equal(store.compito(piano)!.risultato, 'Done: «Write the pilot plan.md» is in your Downloads folder.')
  o2.smetti()

  // un messaggio resta sulla riga: «Manda» legge da lì
  prova({ svolgi: async () => ({ testo: 'Subject: Quote\n\nHello Rossi,\n\n' + 'Here is the quote. '.repeat(60) + '\n\nBest,\nTobia', fonti: [], fatti: [] }), chiedeAiuto: nonChiede, domandeDaFare: nessunaDomanda })
  const mail = riga('Reply to Rossi with the quote')
  const o3 = orecchio(mail)
  compiti.affida(mail, 'bozza')
  await o3.aspetta('pronto')
  assert.equal(store.compito(mail)!.consegna ?? null, null)
  assert.match(store.compito(mail)!.risultato ?? '', /Hello Rossi/)
  o3.smetti()

  // una risposta corta senza che lo chieda: sulla riga
  cfg.aggiorna({ consegne: { luogo: 'scrivania' } })
  prova({ svolgi: async () => ({ testo: 'Yes: go with the June figures.', fonti: [], fatti: [] }), chiedeAiuto: nonChiede, domandeDaFare: nessunaDomanda })
  const breve = riga('Decide which figures to use, again')
  const o4 = orecchio(breve)
  compiti.affida(breve, 'bozza')
  await o4.aspetta('pronto')
  assert.equal(store.compito(breve)!.consegna ?? null, null)
  assert.equal(store.compito(breve)!.risultato, 'Done: the deliverable is below.\n\nYes: go with the June figures.')
  o4.smetti()

  // se il file non si può scrivere, il testo resta sulla riga com'era
  prova({ svolgi: async () => ({ testo: pagina, fonti: [], fatti: [] }), chiedeAiuto: nonChiede, domandeDaFare: nessunaDomanda, salvaConsegna: () => { throw new Error('disco pieno') } })
  const senza = riga('Write the second plan')
  const o5 = orecchio(senza)
  compiti.affida(senza, 'bozza')
  await o5.aspetta('pronto')
  assert.equal(store.compito(senza)!.consegna ?? null, null)
  assert.match(store.compito(senza)!.risultato ?? '', /^Done: the deliverable is below\.\n\n# Plan/)
  o5.smetti()
})

test('quando chiede, sulla riga ci sono tutte le domande, fino a tre, dopo cosa ha visto', async () => {
  prova({
    svolgi: async () => ({ testo: 'x', fonti: [] }),
    chiedeAiuto: async () => ({ chiede: true, manca: ['unità', 'quando'], domanda: 'Di quale unità parliamo?\nEntro quando? E chi firma?\nUna quarta?', visto: 'Ho letto il filo con H-Farm.' }),
    domandeDaFare: async () => [
      { domanda: 'Di quale unità parliamo?', opzioni: ['Education', 'Ventures'], multipla: false },
      { domanda: 'Entro quando?', opzioni: ['Questa settimana', 'Fine mese'], multipla: false },
      { domanda: 'Chi firma?', opzioni: ['Tobia', 'Il CEO'], multipla: false }
    ]
  })
  const id = riga('Rispondere a H-Farm sull\'audit')
  const o = orecchio(id)
  compiti.affida(id, 'bozza')
  await o.aspetta('chiede')
  const c = store.compito(id)!
  assert.equal(c.risultato, 'Ho letto il filo con H-Farm.\nDi quale unità parliamo?\nEntro quando?\nE chi firma?')
  assert.equal(c.chieste?.length, 3)
  o.smetti()
})

