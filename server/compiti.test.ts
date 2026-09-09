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

const nonChiede = async () => ({ chiede: false, manca: [] })
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

  assert.deepEqual(mio.sentiti.map(e => e.fase), ['preso', 'lavoro', 'lavoro', 'pronto'])
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

test('una riga in modo prompt arriva a «pronto» senza che nessuno prepari una email', async () => {
  // il prompt parla di una email, con tanto di saluto: è esattamente il testo
  // su cui `sembraUnMessaggio` direbbe di sì
  const prompt = 'Scrivi un\'email a Rossi.\n\nComincia con «Gentile Rossi» e chiudi con «Cordiali saluti».\n\nFonti:\n— [1] Listino 2026: il prezzo\n\nManca il preventivo di marzo.'
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

  assert.equal(pronto.fase === 'pronto' && pronto.compito.risultato, prompt)
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
  assert.deepEqual(lavoro, passi)
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
  assert.ok(!o.sentiti.some(e => e.fase === 'lavoro'), 'ha annunciato un passo dopo il richiamo')
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
  assert.deepEqual(o.sentiti.map(e => e.fase), ['preso', 'guaio'])
  const c = store.compito(id)!
  assert.equal(c.stato, 'aperto')
  assert.equal(c.guaio, 'Il modello non risponde. Riprova.')
  assert.equal(c.risultato, null)
  o.smetti()
})

test('una risposta che chiede qualcosa finisce in «chiede», non in «pronto»', async () => {
  compiti.perProva({
    svolgi: async () => ({ testo: 'Mi manca l\'indirizzo di Rossi.', fonti: [] }),
    chiedeAiuto: async () => ({ chiede: true, manca: ['indirizzo'] }),
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
    chiedeAiuto: async () => ({ chiede: true, manca: ['indirizzo'] }),
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
