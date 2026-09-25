// La prova di un'automazione sugli ultimi trenta giorni (P6).
//
// Trenta giorni di posta inventata: richieste di preventivo da quattro persone,
// una newsletter ogni martedì, una richiesta a cui ha risposto il giorno dopo,
// una carta scartata «non è mia», una segnata «già fatta», due fatture. I
// modelli sono finti: lo smistamento, la stesura, il giudice.
//
//   node --test server/collaudo.test.ts

import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-collaudo-'))
mkdirSync(join(CASA, '.myynd'), { recursive: true })
mkdirSync(join(CASA, 'Desktop'), { recursive: true })
const CASA_VERA = process.env.HOME
process.env.HOME = CASA
process.env.MYYND_DATI = join(CASA, '.myynd')
const CONFIG = join(CASA, '.myynd', 'config.json')
writeFileSync(CONFIG, JSON.stringify({
  lingua: 'en', motore: 'compatibile', compatibile: { url: 'https://esempio.test/v1/', chiave: 'sk-prova', modello: 'gpt-prova' },
  posta: { host: 'imap.example.test', porta: 993, utente: 'alex@example.com', password: 'x' }
}), { mode: 0o600 })

const store = await import('./store.ts')
const auto = await import('./automazioni.ts')
const collaudo = await import('./collaudo.ts')
const compatibile = await import('./compatibile.ts')
const mani = await import('./mani.ts')
const pc = await import('./prova-chiusa.ts')
const { FERRI_STESURA } = await import('./stesura.ts')
const db = store.default

// nessun modello vero: una chiamata che scappa ai finti fa fallire la prova
let fuggite = 0
compatibile.usaRete((async () => { fuggite++; return new Response('no', { status: 500 }) }) as typeof fetch)

after(() => {
  auto.perProva(null); collaudo.perProva(null); compatibile.usaRete(null)
  store.chiudiIndici()
  process.env.HOME = CASA_VERA
  rmSync(CASA, { recursive: true, force: true })
})

// — trenta giorni di posta —

const GIORNO = 86_400_000
const ORA = Date.now()
const giorno = (k: number, ora = 10) => { const d = new Date(ORA - k * GIORNO); d.setHours(ora, 0, 0, 0); return d.toISOString() }
const PERSONE = ['Dana Reyes <dana@northwind.example>', 'Lee Park <lee@contoso.example>', 'Sam Ito <sam@fabrikam.example>', 'Ana Ruiz <ana@tailspin.example>']
const QUANDO = [29, 26, 23, 20, 17, 13, 8, 6, 3]
const richieste = QUANDO.map((k, i) => ({
  id: `posta:q${i}`, fonte: 'posta', tipo: 'email', titolo: `Quote request ${i}`,
  corpo: `Hello, could you send me a quote for the fit-out, phase ${i}? ${PERSONE[i % 4].split(' <')[0]}`,
  autore: PERSONE[i % 4], quando: giorno(k), filo: `fq${i}`
}))
const RISPOSTA = { id: 'posta:r5', fonte: 'posta', tipo: 'email', titolo: 'Re: Quote request 5', corpo: 'ZQX-DOPO here is the quote you asked for.', autore: 'alex@example.com', quando: giorno(12), filo: 'fq5', inviato: true }
const martedi = Array.from({ length: 30 }, (_, k) => k).filter(k => new Date(ORA - k * GIORNO).getDay() === 2)
const newsletter = martedi.map(k => ({ id: `posta:n${k}`, fonte: 'posta', tipo: 'email', titolo: 'Weekly quote digest', corpo: 'This week in quotes. Unsubscribe here.', autore: 'news@digest.example', quando: giorno(k, 7), filo: `fn${k}` }))
const fatture = [3, 1].map(k => ({ id: `posta:f${k}`, fonte: 'posta', tipo: 'email', titolo: `Invoice ${k}`, corpo: 'Invoice attached, due in 30 days.', autore: 'billing@supplier.example', quando: giorno(k, 11), filo: `ff${k}` }))
const VECCHIO = { id: 'posta:vecchio', fonte: 'posta', tipo: 'email', titolo: 'Framework agreement', corpo: 'The framework agreement for next year.', autore: 'legal@northwind.example', quando: giorno(40), filo: 'fv' }
store.salvaDocumenti([...richieste, RISPOSTA, ...newsletter, ...fatture, VECCHIO] as never)
const carta = (id: string, doc: string, stato: string, ragione: string | null, k: number) =>
  db.prepare('INSERT INTO feed (id, tipo, titolo, testo, doc, stato, quando, risposto, ragione) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, 'email', 'x', 'x', doc, stato, giorno(k + 1), giorno(k), ragione)
carta('v-nonmia', 'posta:q3', 'scartato', 'non_mia', 5)
carta('v-fatta', 'posta:q6', 'scartato', 'fatta', 2)
carta('v-vecchia', 'posta:q7', 'scartato', 'vecchia', 1)

// — i modelli finti —

let giudicate = 0
const richiesteAlGiudice: string[] = []
function giudiceFinto(sbagliate = /digest|Invoice/) {
  collaudo.perProva({
    collegato: () => true,
    chiediJSON: async o => {
      giudicate++
      const testo = String(o.messages[0].content)
      richiesteAlGiudice.push(testo)
      const pezzi = testo.split(/\n\n(?=\d+\. Instruction)/)
      return { giudizi: [...pezzi.map((p, n) => ({ n, giusta: !sbagliate.test(p), perche: sbagliate.test(p) ? 'A newsletter — not a request.' : 'A real request.' })), { n: 99, giusta: false, perche: 'x' }] }
    },
    stesura: stesuraFinta()
  })
}
const tentativi: unknown[] = []
const vistiDalloScrittore: string[][] = []
function stesuraFinta(testo = 'Hi Dana, thanks for the request. The quote is attached.') {
  return {
    ...FERRI_STESURA, voce: () => null,
    svolgi: (async (compito: string) => {
      // la bozza finta prova a scrivere un file: nella prova la porta è chiusa
      try { await mani.esegui('scrivi_file', { percorso: 'x.md', testo: 'x' }) } catch (e) { tentativi.push(e) }
      vistiDalloScrittore.push([new Date(pc.adesso()).toISOString(), ...store.cerca('quote', 50).map(d => d.id)])
      return { testo: `${testo} (${compito})`, fonti: [] }
    }) as unknown as typeof FERRI_STESURA.svolgi,
    chiedeAiuto: async () => ({ chiede: false, domanda: '' }),
    pesaLaDomanda: async () => null,
    giudica: (async () => ({ esito: 'pass', problemi: [] })) as unknown as typeof FERRI_STESURA.giudica
  }
}
function smistamentoFinto() {
  auto.perProva({
    collegato: () => true,
    chiediJSON: async o => {
      const docs = JSON.parse(String(o.messages[0].content)) as { id: string; titolo: string; da: string }[]
      return { righe: docs.filter(d => /Quote request/.test(d.titolo)).map(d => ({ doc: d.id, testo: `Reply to ${d.da.split(' <')[0]} about the quote` })) }
    }
  })
}

const base = { spiega: 'Only the tests use it.', attrezzi: ['posta.leggi'], en: { nome: '', spiega: 'Only the tests use it.', fai: '' } }
const PREVENTIVI = {
  ...base, id: 'preventivi', nome: 'Quote follow-ups', quando: { ogni: 'giorno' as const, ora: 9 },
  guarda: { cerca: 'quote', limite: 8 }, fai: 'Draft a follow-up for each quote request.',
  metti: { inLista: 'oggi' as const, modo: 'bozza' as const },
  en: { nome: 'Quote follow-ups', spiega: 'x', fai: 'Draft a follow-up for each quote request.', cerca: 'quote' }
}
const RISPOSTE = {
  ...base, id: 'risposte', nome: 'Replies to give', quando: { quandoArriva: true as const },
  guarda: { soloNuovi: true, limite: 8 }, fai: 'One row for each person waiting on a reply.',
  metti: { inLista: 'oggi' as const, modo: 'bozza' as const, perDocumento: true },
  en: { nome: 'Replies to give', spiega: 'x', fai: 'One row for each person waiting on a reply.' }
}
const SETTIMANA = { ...PREVENTIVI, id: 'lunedi', nome: 'Monday summary', quando: { ogni: 'settimana' as const, giorno: 1, ora: 8 }, en: { ...PREVENTIVI.en, nome: 'Monday summary' } }

const conta = (t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n
const statoAuto = (id: string) => JSON.stringify(db.prepare('SELECT * FROM automazioni WHERE id = ?').get(id) ?? null)

async function prova(r: Record<string, unknown>) {
  const a = auto.scrivi(r)
  auto.accendi(a.id, false)
  const v = collaudo.avvia(auto.ricette().find(x => x.id === a.id)!)
  await collaudo.finche(20_000)
  return collaudo.vista(v.id)!
}

beforeEach(() => {
  giudiceFinto(); smistamentoFinto()
  // le prove di ieri: il tetto delle sei al giorno e i gettoni di oggi ripartono a ogni prova
  db.prepare("UPDATE prove SET creata = '2000-01-01T00:00:00.000Z'").run()
  db.prepare("UPDATE uso SET quando = '2000-01-01T00:00:00.000Z'").run()
})

// — le prove —

test('una prova non scrive: niente in lista, niente fuori, la configurazione intatta', async () => {
  const tabelle = ['compiti', 'azioni', 'feed', 'misure_compiti', 'segnali']
  const prima = Object.fromEntries(tabelle.map(t => [t, conta(t)]))
  const a = auto.scrivi(RISPOSTE); auto.accendi(a.id, false)
  const statoPrima = statoAuto(a.id)
  const config = readFileSync(CONFIG, 'utf8')
  const v = collaudo.avvia(auto.ricette().find(x => x.id === a.id)!)
  assert.equal(v.stato, 'in coda')
  await collaudo.finche(20_000)
  const p = collaudo.vista(v.id)!
  assert.equal(p.stato, 'finita')
  assert.ok(p.esiti.length >= 5, `risultati: ${p.esiti.length}`)
  assert.ok(p.bozze > 0)
  for (const t of tabelle) assert.equal(conta(t), prima[t], `${t} è cambiata`)
  assert.equal(statoAuto(a.id), statoPrima, 'lo stato dell\'automazione è cambiato')
  assert.equal(readFileSync(CONFIG, 'utf8'), config)
  assert.ok(!existsSync(join(CASA, '.myynd', 'mailbox-drafts')))
  assert.deepEqual(readdirSync(join(CASA, 'Desktop')), [])
  assert.ok(tentativi.length > 0 && tentativi.every(e => pc.eChiusa(e)), 'scrivi_file dentro la prova lancia «prova-chiusa»')
  assert.equal(fuggite, 0)
})

test('il modello non vede il futuro: la risposta del giorno 12 non c\'è prima del giorno 12', async () => {
  vistiDalloScrittore.length = 0
  const p = await prova(PREVENTIVI)
  assert.ok(p.bozze > 0)
  const prima = vistiDalloScrittore.filter(([al]) => al < RISPOSTA.quando)
  const dopo = vistiDalloScrittore.filter(([al]) => al >= RISPOSTA.quando)
  assert.ok(prima.length > 0, 'almeno una bozza scritta prima del giorno 12')
  for (const v of prima) assert.ok(!v.includes('posta:r5'), `la risposta si vede il ${v[0]}`)
  // controcaso: dopo il giorno 12 la risposta c'è
  if (dopo.length) assert.ok(dopo.some(v => v.includes('posta:r5')))
  // e nessun risultato di prima del giorno 12 porta la risposta fra i suoi documenti
  for (const e of p.esiti.filter(e => e.quando < RISPOSTA.quando)) assert.ok(!e.voci.some(v => v.doc === 'posta:r5'))
  assert.ok(p.esiti.some(e => e.quando >= RISPOSTA.quando && e.voci.some(v => v.doc === 'posta:r5')), 'dopo, sì')
})

test('le volte: in pausa ha i suoi turni, giornaliera ≈ 30 poi 12, settimanale ≈ 4, all\'arrivo per giorno e a pezzi', () => {
  const al = new Date(ORA), dal = new Date(ORA - 30 * GIORNO)
  const g = auto.occorrenze(auto.scrivi(PREVENTIVI), dal, al)
  assert.ok(g.length >= 29 && g.length <= 31, `giornaliera: ${g.length}`)
  assert.equal(collaudo.campiona(g, 12).length, 12)
  assert.equal(collaudo.campiona(g, 12)[0], g[0])
  assert.equal(collaudo.campiona(g, 12)[11], g[g.length - 1])
  const s = auto.occorrenze(auto.scrivi(SETTIMANA), dal, al)
  assert.ok(s.length >= 4 && s.length <= 5, `settimanale: ${s.length}`)
  const r = auto.occorrenze(auto.scrivi({ ...RISPOSTE, id: 'pezzi', guarda: { soloNuovi: true, limite: 1 } }), dal, al)
  const giorniConPosta = new Set([...richieste, ...newsletter, ...fatture].map(d => new Date(d.quando).toDateString())).size
  assert.ok(r.length >= giorniConPosta, 'un pezzo per documento con limite 1')
  assert.ok(r.every((x, i) => i === 0 || x.dal.getTime() === r[i - 1].al.getTime()), 'ogni pezzo parte dove finisce il precedente')
})

test('una ricetta di sola ricerca su un indice fermo dà un risultato, non trenta; per documento non si piega mai', async () => {
  const fermo = { ...PREVENTIVI, id: 'fermo', guarda: { cerca: 'framework', limite: 8 }, en: { ...PREVENTIVI.en, cerca: 'framework' } }
  const p = await prova(fermo)
  assert.equal(p.esiti.length, 1, `risultati: ${p.esiti.map(e => e.quando).join(', ')}`)
  assert.ok(p.esiti[0].anche.length >= 1, 'le date piegate stanno in «anche»')
  // per documento: ogni risultato ha il suo documento, nessuno piegato
  const d = await prova({ ...RISPOSTE, id: 'perdoc2' })
  assert.ok(d.esiti.every(e => e.anche.length === 0))
  assert.equal(new Set(d.esiti.map(e => e.voci[0]?.doc)).size, d.esiti.length)
})

test('col senno di poi: risposto con l\'id e senza testo, fatta, non è mia, vecchia no', () => {
  const r = collaudo.aPosteriori('posta:q5', giorno(13, 11))
  assert.deepEqual(r, { cosa: 'risposto', quando: RISPOSTA.quando, risposta: 'posta:r5' })
  assert.ok(!JSON.stringify(r).includes('ZQX'))
  assert.equal(collaudo.aPosteriori('posta:q6', giorno(9))?.cosa, 'fatto')
  assert.equal(collaudo.aPosteriori('posta:q3', giorno(20, 11))?.cosa, 'scartato')
  assert.equal(collaudo.aPosteriori('posta:q7', giorno(7)), null, '«vecchia» non dice niente')
  // controcaso: prima di T non conta
  assert.equal(collaudo.aPosteriori('posta:q5', giorno(0)), null)
})

test('il verdetto: il suo segno, poi quello che ha fatto, poi il giudice; un conflitto è incerto', () => {
  const v = (x: Partial<import('./collaudo.ts').Giudicabile>) => collaudo.verdetto({ suo: null, prova: null, giudice: null, forma: 'riga', revisione: null, chiede: false, ...x })
  assert.deepEqual(v({ suo: 'sbagliato', prova: 'risposto', giudice: true }), { verdetto: 'sbagliato', da: 'tuo' })
  assert.deepEqual(v({ prova: 'scartato', giudice: true }), { verdetto: 'sbagliato', da: 'mosse' })
  assert.deepEqual(v({ prova: 'risposto', giudice: true }), { verdetto: 'giusto', da: 'mosse' })
  assert.deepEqual(v({ prova: 'fatto', giudice: null }), { verdetto: 'giusto', da: 'mosse' })
  assert.deepEqual(v({ prova: 'riga', giudice: false }), { verdetto: 'incerto', da: null }, 'agito ma il modello dice sbagliata: incerto')
  assert.deepEqual(v({ giudice: false }), { verdetto: 'sbagliato', da: 'modello' })
  assert.deepEqual(v({ giudice: true }), { verdetto: 'giusto', da: 'modello' })
  assert.deepEqual(v({}), { verdetto: 'incerto', da: null })
  assert.deepEqual(v({ giudice: true, forma: 'documento', revisione: 'revise' }), { verdetto: 'sbagliato', da: 'modello' })
  assert.deepEqual(v({ giudice: true, forma: 'riga', revisione: 'revise' }), { verdetto: 'incerto', da: null })
  assert.deepEqual(v({ giudice: true, chiede: true }), { verdetto: 'incerto', da: null }, 'avrebbe chiesto: incerto')
  assert.deepEqual(v({ suo: 'giusto', chiede: true }), { verdetto: 'giusto', da: 'tuo' })
})

test('il conto: almeno 5 giudicati e 9 su 10; l\'incerto non conta mai', () => {
  const vv = (g: number, s: number, i = 0) => [
    ...Array(g).fill({ verdetto: 'giusto', da: 'modello' }), ...Array(s).fill({ verdetto: 'sbagliato', da: 'tuo' }), ...Array(i).fill({ verdetto: 'incerto', da: null })]
  assert.equal(collaudo.record(vv(4, 0)).esito, 'poco')
  assert.equal(collaudo.record(vv(5, 0)).esito, 'pronta')
  assert.equal(collaudo.record(vv(9, 1)).esito, 'pronta')
  assert.equal(collaudo.record(vv(8, 1)).esito, 'non passa')
  assert.equal(collaudo.record(vv(0, 0)).esito, 'poco')
  assert.deepEqual(collaudo.record(vv(4, 0, 20)), { giusti: 4, giudicati: 4, tue: 0, esito: 'poco' })
  assert.equal(collaudo.record(vv(9, 1)).tue, 1)
})

test('il giudice per posizione: n sconosciuti si ignorano, il perché senza lineette', async () => {
  const p = await prova({ ...PREVENTIVI, id: 'giudice', guarda: { cerca: 'quote digest', limite: 8 }, en: { ...PREVENTIVI.en, cerca: 'quote digest' } })
  const sbagliate = p.esiti.flatMap(e => e.voci).filter(v => v.verdetto === 'sbagliato' && v.da === 'modello')
  assert.ok(sbagliate.length > 0, 'la newsletter è sbagliata')
  for (const v of sbagliate) assert.doesNotMatch(v.perche ?? '', /[—–]/)
})

const dorme = (ms: number) => new Promise(r => setTimeout(r, ms))
const tetto = await import('./tetto.ts')
const attrezzi = await import('./attrezzi.ts')
const cfg = await import('./config.ts')

test('il budget: oltre i gettoni della prova si ferma, tiene quello che ha fatto e dice fin dove è arrivata', async () => {
  auto.perProva({
    collegato: () => true,
    chiediJSON: async o => {
      // ogni smistamento costa 200 mila gettoni: il secondo sfora
      store.segnaUso({ lavoro: 'smistamento', motore: 'finto', entrata: 150_000, cache: 0, uscita: 50_000 })
      tetto.controllaIlTetto()
      const docs = JSON.parse(String(o.messages[0].content)) as { id: string; titolo: string; da: string }[]
      return { righe: docs.filter(d => /Quote request/.test(d.titolo)).map(d => ({ doc: d.id, testo: `Reply to ${d.da}` })) }
    }
  })
  const p = await prova({ ...RISPOSTE, id: 'budget' })
  assert.equal(p.stato, 'fermata')
  assert.ok(p.al, 'fin dove è arrivata')
  assert.ok(p.esiti.length >= 1, 'i risultati parziali restano')
  assert.ok((store.prova(p.id)?.gettoni ?? 0) >= collaudo.PROVA_GETTONI)
})

test('il tetto di oggi ferma la prova come «tetto»', async () => {
  const c = cfg.leggi()
  cfg.scrivi({ ...c, tetto: 1 })
  store.segnaUso({ lavoro: 'chat', motore: 'finto', entrata: 5, cache: 0, uscita: 5 })
  try {
    const p = await prova({ ...RISPOSTE, id: 'tetto' })
    assert.equal(p.stato, 'tetto')
  } finally { cfg.scrivi(c) }
})

test('l\'agenda nel passato non si legge: la riga fissa, e la prova lo dice come parziale', async () => {
  let risposta = ''
  collaudo.perProva({
    collegato: () => true,
    chiediJSON: async () => ({ giudizi: [] }),
    stesura: {
      ...stesuraFinta(),
      svolgi: (async () => {
        const r = await attrezzi.esegui('agenda.leggi', {}, ['agenda.leggi'])
        risposta = r.testo
        return { testo: 'Monday: two quotes to chase.', fonti: [] }
      }) as unknown as typeof FERRI_STESURA.svolgi
    }
  })
  const p = await prova({ ...SETTIMANA, id: 'agenda', attrezzi: ['posta.leggi', 'agenda.leggi'] })
  assert.equal(risposta, 'Il calendario nel passato non si legge.', 'la porta dell\'agenda non si è aperta')
  assert.deepEqual(p.parziale, ['agenda'])
})

test('la fila: una seconda premuta aspetta la sua, con davanti il nome di quella che gira', async () => {
  auto.perProva({
    collegato: () => true,
    chiediJSON: async o => {
      await dorme(30)
      const docs = JSON.parse(String(o.messages[0].content)) as { id: string; titolo: string }[]
      return { righe: docs.filter(d => /Quote request/.test(d.titolo)).map(d => ({ doc: d.id, testo: 'Reply' })) }
    }
  })
  const a = auto.scrivi({ ...RISPOSTE, id: 'fila-a', nome: 'Invoices arriving', en: { ...RISPOSTE.en, nome: 'Invoices arriving' } }); auto.accendi(a.id, false)
  const b = auto.scrivi({ ...RISPOSTE, id: 'fila-b' }); auto.accendi(b.id, false)
  const va = collaudo.avvia(auto.ricette().find(x => x.id === a.id)!)
  await dorme(20)
  const vb = collaudo.avvia(auto.ricette().find(x => x.id === b.id)!)
  assert.equal(vb.stato, 'in coda')
  assert.equal(vb.davanti, 'Invoices arriving')
  // la stessa premuta due volte torna la stessa prova
  assert.equal(collaudo.avvia(auto.ricette().find(x => x.id === b.id)!).id, vb.id)
  await collaudo.finche(20_000)
  assert.equal(collaudo.vista(va.id)!.stato, 'finita')
  assert.equal(collaudo.vista(vb.id)!.stato, 'finita')
})

test('una prova d\'idea cede il passo a una premuta, alla volta dopo', async () => {
  auto.perProva({
    collegato: () => true,
    chiediJSON: async o => {
      await dorme(20)
      const docs = JSON.parse(String(o.messages[0].content)) as { id: string; titolo: string }[]
      return { righe: docs.filter(d => /Quote request/.test(d.titolo)).map(d => ({ doc: d.id, testo: 'Reply' })) }
    }
  })
  const idea = auto.nella({ ...RISPOSTE, id: 'idea-x', suggerita: true } as never)
  const pid = collaudo.preprova(idea, 'impronta-x')!
  assert.ok(pid)
  await dorme(30)
  const a = auto.scrivi({ ...RISPOSTE, id: 'premuta' }); auto.accendi(a.id, false)
  const v = collaudo.avvia(auto.ricette().find(x => x.id === a.id)!)
  await collaudo.finche(20_000)
  const idp = store.prova(pid)!, ed = store.prova(v.id)!
  assert.equal(idp.stato, 'finita')
  assert.equal(ed.stato, 'finita')
  assert.ok(ed.finita! < idp.finita!, 'la premuta finisce prima dell\'idea')
  assert.equal(idp.automazione, 'idea:impronta-x')
  assert.equal(idp.origine, 'suggerimento')
})

test('annullare ferma la prova che gira; all\'avvio quelle a metà sono interrotte', async () => {
  auto.perProva({ collegato: () => true, chiediJSON: async () => { await dorme(40); return { righe: [] } } })
  const a = auto.scrivi({ ...RISPOSTE, id: 'annulla' }); auto.accendi(a.id, false)
  const v = collaudo.avvia(auto.ricette().find(x => x.id === a.id)!)
  await dorme(60)
  collaudo.annulla(a.id)
  await collaudo.finche(20_000)
  assert.equal(store.prova(v.id)!.stato, 'annullata')
  store.nuovaProva({ id: 'appesa', automazione: 'x', tipo: 'prova', stato: 'in corso', origine: 'editor' })
  assert.equal(collaudo.riprendiAppese(), 1)
  assert.equal(store.prova('appesa')!.stato, 'interrotta')
})

test('l\'undicesima bozza si rifiuta, e il suo segno cambia il conto subito', async () => {
  store.nuovaProva({ id: 'dieci', automazione: 'preventivi', tipo: 'prova', stato: 'finita', origine: 'editor', ricetta: JSON.stringify({ ricetta: auto.ricette().find(x => x.id === 'preventivi'), altri: 0 }) })
  for (let i = 0; i < 11; i++) {
    store.scriviEsito({ id: `e-dieci-${i}`, prova: 'dieci', automazione: 'preventivi', tipo: 'riga', stato: i < 10 ? 'scritta' : 'senza bozza',
      quando: giorno(20 - i), testo: 'Quote follow-ups', modo: 'bozza', doc: `posta:q${i % 9}`, docs: JSON.stringify({ ids: [`posta:q${i % 9}`], nuovi: [`posta:q${i % 9}`], anche: [] }),
      ...(i < 10 ? { bozza: 'Hi.' } : {}) })
  }
  assert.throws(() => collaudo.scriviAncora('e-dieci-10'), /dieci bozze/)
  const prima = collaudo.riassunto('dieci')!
  const r = collaudo.giudica('e-dieci-0', 'giusto')
  assert.equal(r.giusti, prima.giusti + 1)
  assert.equal(collaudo.giudica('e-dieci-0', null).giusti, prima.giusti, 'premere di nuovo toglie il segno')
  assert.throws(() => collaudo.giudica('nessuno', 'giusto'), /Non conosco questo risultato/)
})

test('sei prove premute oggi bastano; le prove d\'idea si contano a parte', () => {
  const oggi = store.proveDiOggi('editor')
  for (let i = oggi; i < collaudo.PROVE_AL_GIORNO; i++) store.nuovaProva({ id: `oggi-${i}`, automazione: 'x', tipo: 'prova', stato: 'finita', origine: 'editor' })
  const a = auto.ricette().find(x => x.id === 'preventivi')!
  assert.equal(collaudo.avvia(a).stato, 'basta per oggi')
  assert.ok(store.proveDiOggi('suggerimento') < collaudo.PROVE_AL_GIORNO)
})
