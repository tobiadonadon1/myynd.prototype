// Il vassoio di prova (P6): erano i primi quattordici giorni di un'automazione accesa.
//
// Adesso un ordine fisso acceso gira dal vivo da subito (E), e nel vassoio non
// entra più niente. Restano i risultati arrivati prima: si scrivono, si mettono
// in lista con un dito, si scartano, e il loro documento non si rifà.
//
//   node --test server/vassoio.test.ts

import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-vassoio-'))
mkdirSync(join(CASA, '.myynd'), { recursive: true })
const CASA_VERA = process.env.HOME
process.env.HOME = CASA
process.env.MYYND_DATI = join(CASA, '.myynd')
writeFileSync(join(CASA, '.myynd', 'config.json'), JSON.stringify({
  lingua: 'en', motore: 'compatibile', compatibile: { url: 'https://esempio.test/v1/', chiave: 'sk-prova', modello: 'gpt-prova' },
  posta: { host: 'imap.example.test', porta: 993, utente: 'alex@example.com', password: 'x' }
}), { mode: 0o600 })

const store = await import('./store.ts')
const auto = await import('./automazioni.ts')
const compiti = await import('./compiti.ts')
const collaudo = await import('./collaudo.ts')
const vassoio = await import('./vassoio.ts')
const compatibile = await import('./compatibile.ts')
const { FERRI_STESURA } = await import('./stesura.ts')
const db = store.default

compatibile.usaRete((async () => new Response('no', { status: 500 })) as typeof fetch)
after(() => {
  auto.perProva(null); compiti.perProva(null); collaudo.perProva(null); compatibile.usaRete(null)
  store.chiudiIndici()
  process.env.HOME = CASA_VERA
  rmSync(CASA, { recursive: true, force: true })
})

const GIORNO = 86_400_000
const ORA = Date.now()
let n = 0
function arriva(titolo: string, chi = 'Dana <dana@northwind.example>') {
  const id = `posta:v${n++}`
  store.salvaDocumenti([{ id, fonte: 'posta', tipo: 'email', titolo, corpo: `${titolo}: could you reply?`, autore: chi, quando: new Date().toISOString(), filo: `f-${id}`, messageId: `<${id}@example>` }] as never)
  return id
}

const salvate: string[] = []
let stesure = 0
let lento = 0
beforeEach(() => {
  auto.perProva({
    collegato: () => true,
    chiediJSON: async o => {
      const docs = JSON.parse(String(o.messages[0].content)) as { id: string; da: string }[]
      return { righe: docs.map(d => ({ doc: d.id, testo: `Reply to ${d.da.split(' <')[0]}` })) }
    }
  })
  collaudo.perProva({
    collegato: () => true,
    stesura: {
      ...FERRI_STESURA, voce: () => null,
      svolgi: (async () => { stesure++; if (lento) await new Promise(r => setTimeout(r, lento)); return { testo: 'Hi Dana, thanks for the request. The quote is attached.', fonti: [] } }) as never,
      chiedeAiuto: async () => ({ chiede: false, domanda: '' }), pesaLaDomanda: async () => null,
      giudica: (async () => ({ esito: 'pass', problemi: [] })) as never
    }
  })
  compiti.perProva({
    postaCollegata: () => true,
    preparaEmail: (async () => ({ a: 'dana@northwind.example', oggetto: 'Re: quote', corpo: 'Hi Dana, the quote is attached.' })) as never,
    salvaBozzaCasella: (async (id: string) => { salvate.push(id); return { stato: 'salvata', id: 'b', url: '' } }) as never,
    prossimoPasso: (async () => null) as never,
    salvaConsegna: () => { throw new Error('nessun file') }
  })
})

const RISPOSTE = {
  id: 'risposte', nome: 'Replies to give', spiega: 'x', quando: { quandoArriva: true as const }, guarda: { soloNuovi: true, limite: 8 },
  fai: 'One row for each person waiting on a reply.', metti: { inLista: 'oggi' as const, modo: 'bozza' as const, perDocumento: true },
  attrezzi: ['posta.leggi'], en: { nome: 'Replies to give', spiega: 'x', fai: 'One row for each person waiting on a reply.' }
}
const righe = (id: string) => (db.prepare('SELECT COUNT(*) AS n FROM compiti WHERE origine = ?').get(`auto:${id}`) as { n: number }).n
const bozzeDi = (id: string) => store.statoAutomazione(id)?.bozze ?? 0
async function finche(f: () => boolean, ms = 5000) { const fine = Date.now() + ms; while (!f() && Date.now() < fine) await new Promise(r => setTimeout(r, 15)) }

/** Un risultato rimasto nel vassoio da prima, come lo scriveva il giro di allora. */
function rimasto(automazione: string, doc: string, stato: 'senza bozza' | 'da scrivere') {
  const prova = `v-${automazione}`
  if (!store.prova(prova)) store.nuovaProva({ id: prova, automazione, tipo: 'vassoio', stato: 'in corso', origine: 'vassoio' })
  const id = `e-${doc}`
  store.scriviEsito({
    id, prova, automazione, tipo: 'riga', stato, quando: new Date().toISOString(),
    testo: `Reply about ${store.documento(doc)!.titolo}`, doc, inLista: 'oggi',
    docs: JSON.stringify({ ids: [doc], nuovi: [doc], anche: [] }),
    attrezzi: JSON.stringify({ nomi: ['posta.leggi'], origine: 'automazione' }), ...(stato === 'da scrivere' ? { modo: 'bozza' } : {})
  })
  return id
}

test('i risultati rimasti da prima si scrivono, uno per giro, e non segnano bozze', async () => {
  auto.scrivi(RISPOSTE)
  const c = arriva('Quote request C'); const d = arriva('Quote request D')
  rimasto('risposte', c, 'da scrivere'); rimasto('risposte', d, 'da scrivere')
  const prima = bozzeDi('risposte')
  assert.equal(await vassoio.giro(), true)
  assert.equal(bozzeDi('risposte'), prima, 'chi scrive nel vassoio non segna bozze')
  assert.equal(store.vassoioInAttesa().filter(e => e.stato === 'scritta').length, 1, 'una bozza per giro')
  rimasto('risposte', arriva('Quote request H'), 'senza bozza')
})

test('un documento rimasto nel vassoio non si rifà in lista', async () => {
  const a = auto.ricette().find(x => x.id === 'risposte')!
  const prima = righe('risposte')
  await auto.fai(a, { aMano: true })
  assert.equal(righe('risposte'), prima, 'un documento che aspetta nel vassoio è tornato in lista')
  const ids = store.vassoioInAttesa().map(e => e.doc!)
  assert.deepEqual([...store.docsNelVassoio(ids)].sort(), [...ids].sort())
})

test('«Metti in lista»: una riga sola, la bozza nella casella solo adesso, e due volte è la stessa', async () => {
  const e = store.vassoioInAttesa().find(x => x.stato === 'scritta')!
  assert.deepEqual(salvate, [], 'niente nella casella prima del dito')
  const id = await vassoio.inLista(e.id)
  const riga = store.compito(id)!
  assert.equal(riga.origine, 'auto:risposte')
  await finche(() => salvate.length > 0)
  assert.deepEqual(salvate, [id], 'la bozza va nella casella dopo il dito')
  const dopo = righe('risposte')
  assert.equal(await vassoio.inLista(e.id), id)
  assert.equal(righe('risposte'), dopo, 'due volte è la stessa riga')
  const azione = db.prepare("SELECT dettaglio FROM azioni WHERE compito = ?").get(id) as { dettaglio: string }
  assert.equal(azione.dettaglio, 'dal vassoio')
})

test('se lui ha già risposto nel filo, «Metti in lista» dice quando e non scrive niente', async () => {
  const e = store.vassoioInAttesa().find(x => x.stato !== 'scritta' && x.doc)!
  const d = store.documento(e.doc!)!
  store.salvaDocumenti([{ id: 'posta:sent-1', fonte: 'posta', tipo: 'email', titolo: `Re: ${d.titolo}`, corpo: 'Done.', autore: 'alex@example.com', quando: new Date(Date.now() + 1000).toISOString(), filo: d.filo, inviato: true }] as never)
  const prima = righe('risposte')
  await assert.rejects(vassoio.inLista(e.id), (err: unknown) => err instanceof vassoio.Superata && !!err.quando)
  assert.equal(righe('risposte'), prima)
  assert.equal(store.esito(e.id)?.stato, 'superata')
})

test('messo in lista mentre si scriveva: la bozza si butta', async () => {
  const e = store.vassoioInAttesa().find(x => x.stato === 'da scrivere')!
  lento = 150
  const giro = vassoio.giro()
  await new Promise(r => setTimeout(r, 30))
  const id = await vassoio.inLista(e.id)
  await giro
  lento = 0
  assert.equal(store.esito(e.id)?.bozza ?? null, null)
  assert.equal(store.esito(e.id)?.stato, 'in lista')
  assert.equal(store.compito(id)?.origine, 'auto:risposte')
})

test('«Non serve» segna sbagliato; i nuovi e «visto»', () => {
  rimasto('risposte', arriva('Quote request J'), 'senza bozza')
  const primi = vassoio.nonVisti()
  assert.ok(primi > 0)
  const e = store.vassoioInAttesa()[0]
  vassoio.scarta(e.id)
  assert.equal(store.esito(e.id)?.suo, 'sbagliato')
  assert.equal(store.esito(e.id)?.stato, 'scartata')
  vassoio.visto()
  assert.equal(vassoio.nonVisti(), 0)
})

test('accenderne una la mette dal vivo subito: niente vassoio, le righe vanno in lista', async () => {
  // per ultima: le sue righe dal vivo fanno lavorare la lista, e il vassoio aspetta chi lavora
  const a = auto.scrivi({ ...RISPOSTE, id: 'dal-vivo' })
  auto.accendi(a.id, false)
  auto.accendi(a.id, true)
  assert.equal(store.statoAutomazione(a.id)?.vassoio ?? null, null, 'accenderla ha aperto un vassoio')
  arriva('Quote request A'); arriva('Quote request B')
  const prima = store.vassoioInAttesa().length
  assert.equal(await auto.fai(auto.ricette().find(x => x.id === 'dal-vivo')!), 'fatta')
  assert.ok(righe('dal-vivo') >= 2, 'le righe dovevano andare in lista')
  assert.equal(store.vassoioInAttesa().length, prima, 'nel vassoio non entra più niente')
  assert.equal(auto.elenco().find(x => x.id === 'dal-vivo')?.ricevuta?.fatti, righe('dal-vivo'), 'la ricevuta conta le righe fatte')
})
