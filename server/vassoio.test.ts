// Il vassoio di prova (P6): i primi quattordici giorni di un'automazione accesa.
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

test('accenderne una nuova apre quattordici giorni di vassoio; riaccenderla non li riapre', () => {
  const a = auto.scrivi(RISPOSTE)
  auto.accendi(a.id, false)
  assert.equal(store.statoAutomazione(a.id)?.vassoio ?? null, null)
  auto.accendi(a.id, true)
  const fino = Date.parse(store.statoAutomazione(a.id)!.vassoio!)
  assert.ok(Math.abs(fino - (ORA + 14 * GIORNO)) < 60_000)
  auto.accendi(a.id, false); auto.accendi(a.id, true)
  assert.equal(Date.parse(store.statoAutomazione(a.id)!.vassoio!), fino)
})

test('nel vassoio il giro scrive risultati e nessuna riga; le bozze contano nel tetto, e chi le scrive non lo tocca', async () => {
  arriva('Quote request A'); arriva('Quote request B')
  const a = auto.ricette().find(x => x.id === 'risposte')!
  assert.equal(await auto.fai(a), 'fatta')
  assert.equal(righe('risposte'), 0)
  const inAttesa = store.vassoioInAttesa().filter(e => e.automazione === 'risposte')
  assert.equal(inAttesa.length, 2)
  assert.ok(inAttesa.every(e => e.stato === 'da scrivere'))
  assert.equal(bozzeDi('risposte'), 2, 'le bozze del vassoio contano nel tetto del giorno')
  const prima = bozzeDi('risposte')
  assert.equal(await vassoio.giro(), true)
  assert.equal(bozzeDi('risposte'), prima, 'chi scrive nel vassoio non segna bozze')
  assert.equal(store.vassoioInAttesa().filter(e => e.stato === 'scritta').length, 1, 'una bozza per giro')
  // oltre il tetto del giorno, righe senza bozza
  arriva('Quote request C'); arriva('Quote request D')
  await auto.fai(a)
  const nuove = store.vassoioInAttesa().filter(e => e.stato === 'senza bozza')
  assert.equal(nuove.length, 1, `tetto: ${auto.BOZZE_AL_GIORNO}`)
})

test('un documento nel vassoio non è una carta del feed e non si rifà', async () => {
  const a = auto.ricette().find(x => x.id === 'risposte')!
  const prima = store.vassoioInAttesa().length
  await auto.fai(a)
  assert.equal(store.vassoioInAttesa().length, prima, 'nessun doppione')
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
  assert.equal(await vassoio.inLista(e.id), id)
  assert.equal(righe('risposte'), 1)
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
  const primi = vassoio.nonVisti()
  assert.ok(primi > 0)
  const e = store.vassoioInAttesa()[0]
  vassoio.scarta(e.id)
  assert.equal(store.esito(e.id)?.suo, 'sbagliato')
  assert.equal(store.esito(e.id)?.stato, 'scartata')
  vassoio.visto()
  assert.equal(vassoio.nonVisti(), 0)
})

test('«Termina la prova»: da lì le righe vanno in lista, e un documento che aspetta nel vassoio non si rifà', async () => {
  arriva('Quote request G')
  await auto.fai(auto.ricette().find(x => x.id === 'risposte')!)
  const aspetta = store.vassoioInAttesa().filter(e => e.automazione === 'risposte').map(e => e.doc!)
  vassoio.dalVivo('risposte')
  assert.equal(store.nelVassoio('risposte'), false)
  arriva('Quote request E')
  // domani: il tetto di oggi non conta
  const prima = righe('risposte')
  await auto.fai(auto.ricette().find(x => x.id === 'risposte')!, { adesso: new Date(Date.now() + GIORNO) })
  assert.equal(righe('risposte'), prima + 1, 'la riga nuova è in lista')
  const docs = (db.prepare('SELECT doc FROM compiti WHERE origine = ?').all('auto:risposte') as { doc: string }[]).map(r => r.doc)
  assert.ok(aspetta.length > 0)
  for (const d of aspetta) assert.ok(!docs.includes(d), `${d} rifatto in lista`)
})

test('una già accesa prima del vassoio non ci entra mai: il giro dal vivo scrive in lista (controcaso)', async () => {
  const a = auto.scrivi({ ...RISPOSTE, id: 'vecchia' })
  store.accendiAutomazione(a.id, true)
  assert.equal(store.statoAutomazione(a.id)?.vassoio ?? null, null)
  arriva('Quote request F')
  await auto.fai(auto.ricette().find(x => x.id === 'vecchia')!)
  assert.equal(store.statoAutomazione(a.id)?.vassoio, '1970-01-01T00:00:00.000Z')
  assert.ok(righe('vecchia') >= 1)
})
