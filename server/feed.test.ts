// Come le cose finiscono sul feed — e come non ci finiscono due volte.
//
// Sul database vero la stessa email stava sul feed tre volte, con tre titoli
// un po' diversi, nata in tre letture di tre giorni: l'id nasce dal titolo, e
// il modello non è tenuto a riscriverlo alla lettera. Le prove qui sotto sono
// le reti che lo impediscono, prese una per una, e poi la lettura intera con
// un fornitore finto al posto del modello — per guardare cosa gli si manda,
// non cosa risponde.
//
// E in fondo la riga che mancava: quando il feed cambia in sottofondo, chi ha
// la pagina aperta lo sente. Solo lui.
//
//   node --test server/feed.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Documento } from './store.ts'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-feed-'))
process.env.MYYND_DATI = CASA
// la chiave di casa non deve entrare in queste prove: senza motore vuol dire senza
delete process.env.ANTHROPIC_API_KEY

const cfg = await import('./config.ts')
const store = await import('./store.ts')
const claude = await import('./claude.ts')
const compatibile = await import('./compatibile.ts')
const compiti = await import('./compiti.ts')
const automazioni = await import('./automazioni.ts')

before(() => store.azzeraTutto())
after(() => {
  compatibile.usaRete(null)
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

const doc = (id: string, titolo: string, sopra: Partial<Documento> = {}): Documento => ({
  id, fonte: 'posta', tipo: 'email', titolo, corpo: `Il testo di ${titolo}.`,
  autore: 'Rossi <rossi@esempio.it>', percorso: 'INBOX',
  quando: '2026-09-01T10:00:00.000Z', gruppo: 'posta', ...sopra
})

const voce = (titolo: string, doc?: string) =>
  ({ tipo: 'Da decidere', titolo, testo: `Il testo di ${titolo}.`, fonte: 'posta', ...(doc ? { doc } : {}) })

// — salvaFeed: le reti —

test('un documento, una voce: la stessa email con un titolo nuovo non entra due volte', () => {
  store.azzeraTutto()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo')])
  assert.equal(store.salvaFeed([voce('Preventivo Rossi da confermare', 'posta:INBOX:1')]), 1)
  // la lettura del giorno dopo: stesso documento, parole diverse
  assert.equal(store.salvaFeed([voce('Rossi aspetta una risposta sul preventivo', 'posta:INBOX:1')]), 0)
  const aperte = store.elencoFeed('aperto')
  assert.equal(aperte.length, 1)
  assert.equal(aperte[0].titolo, 'Preventivo Rossi da confermare')
})

test('e non entra nemmeno dopo che l’hai chiusa o scartata', () => {
  store.azzeraTutto()
  store.salvaDocumenti([doc('posta:INBOX:2', 'Fattura'), doc('posta:INBOX:3', 'Newsletter')])
  store.salvaFeed([voce('Fattura di marzo da pagare', 'posta:INBOX:2'), voce('Newsletter di aprile', 'posta:INBOX:3')])
  const [fattura, newsletter] = ['Fattura di marzo da pagare', 'Newsletter di aprile']
    .map(t => store.elencoFeed('aperto').find(v => v.titolo === t)!)
  store.cambiaStatoFeed(fattura.id, 'fatto', 'Pagata lunedì')
  store.cambiaStatoFeed(newsletter.id, 'scartato', 'Non mi interessa.')

  assert.equal(store.salvaFeed([
    voce('Pagare la fattura di marzo', 'posta:INBOX:2'),
    voce('La newsletter di aprile è arrivata', 'posta:INBOX:3')
  ]), 0, 'una cosa che hai chiuso è tornata su con un altro nome')
  assert.equal(store.elencoFeed('aperto').length, 0)
})

test('senza documento contano le parole: un titolo che somiglia a uno già lì non entra', () => {
  store.azzeraTutto()
  assert.equal(store.salvaFeed([voce('Preventivo Rossi da confermare entro venerdì')]), 1)
  assert.equal(store.salvaFeed([voce('Confermare il preventivo a Rossi entro venerdì')]), 0)
  // e vale anche fra quelle dello stesso giro
  assert.equal(store.salvaFeed([voce('Contratto Bianchi da firmare'), voce('Firmare il contratto di Bianchi')]), 1)
  assert.equal(store.elencoFeed('aperto').length, 2)
})

test('due cose diverse sullo stesso cliente restano due cose', () => {
  store.azzeraTutto()
  assert.equal(store.salvaFeed([voce('Fattura di marzo a Rossi'), voce('Fattura di aprile a Rossi')]), 2)
  assert.equal(store.salvaFeed([voce('Scadenza del contratto Rossi')]), 1)
  assert.equal(store.elencoFeed('aperto').length, 3)
})

test('due documenti diversi con titoli quasi uguali sono due voci: la rete delle parole non copre un documento nuovo', () => {
  store.azzeraTutto()
  // due fatture dello stesso fornitore, due email: i numeri corti non contano fra le parole
  store.salvaDocumenti([doc('posta:INBOX:5', 'Fattura n. 123'), doc('posta:INBOX:6', 'Fattura n. 124')])
  assert.equal(store.salvaFeed([voce('Fattura n. 123 di Rossi da pagare', 'posta:INBOX:5')]), 1)
  assert.equal(store.salvaFeed([voce('Fattura n. 124 di Rossi da pagare', 'posta:INBOX:6')]), 1,
    'la seconda fattura è stata presa per un doppione della prima')
  assert.equal(store.elencoFeed('aperto').length, 2)
  // ma una voce senza documento che ripete una di quelle resta fuori
  assert.equal(store.salvaFeed([voce('Pagare la fattura n. 123 di Rossi')]), 0)
})

test('la stessa voce riscritta uguale non conta come nuova, e resta chiusa se l’avevi chiusa', () => {
  store.azzeraTutto()
  store.salvaDocumenti([doc('posta:INBOX:4', 'Deck')])
  const v = voce('Deck a metà', 'posta:INBOX:4')
  assert.equal(store.salvaFeed([v]), 1)
  assert.equal(store.salvaFeed([v]), 0, 'la stessa voce è stata contata due volte')
  const [prima] = store.elencoFeed('aperto')
  store.cambiaStatoFeed(prima.id, 'fatto')
  assert.equal(store.salvaFeed([{ ...v, testo: 'Mancano ancora due slide.' }]), 0)
  assert.equal(store.elencoFeed('aperto').length, 0)
  assert.equal(store.voceFeed(prima.id)!.testo, 'Mancano ancora due slide.', 'l’upsert non aggiorna più il testo')
})

// — generaFeed: cosa arriva al modello —

/** Un fornitore compatibile finto: risponde con queste voci e si ricorda cosa ha ricevuto. */
function fornitoreFinto(voci: object[]) {
  cfg.scrivi({ motore: 'compatibile', compatibile: { url: 'https://esempio.test/v1/', chiave: 'sk-prova', modello: 'gpt-prova' } })
  const ricevute: Record<string, unknown>[] = []
  compatibile.usaRete((async (_url: string | URL | Request, init?: RequestInit) => {
    ricevute.push(init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {})
    return Response.json({
      id: 'chatcmpl-1', model: 'gpt-prova',
      choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify({ voci }) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 10 }
    })
  }) as typeof fetch)
  return ricevute
}

/** Tutto il testo mandato al modello, system e messaggi insieme. */
const testoDi = (r: Record<string, unknown>) =>
  (r.messages as { content: string }[]).map(m => m.content).join('\n')

test('quello che è già sul feed non si rilegge e si dice al modello per titolo', async () => {
  store.azzeraTutto()
  store.salvaDocumenti([
    doc('posta:INBOX:10', 'Preventivo Rossi', { quando: '2026-09-03T10:00:00.000Z' }),
    doc('posta:INBOX:11', 'Fattura Bianchi', { quando: '2026-09-02T10:00:00.000Z' })
  ])
  // la voce di ieri, ancora aperta, nata dal preventivo
  store.salvaFeed([voce('Preventivo Rossi da confermare', 'posta:INBOX:10')])

  const ricevute = fornitoreFinto([
    { tipo: 'Da decidere', titolo: 'Fattura Bianchi da pagare', testo: 'Scade venerdì.', urgenza: 'entro venerdì', fonte: 'posta', doc: 'posta:INBOX:11' }
  ])
  const voci = await claude.generaFeed()
  assert.equal(ricevute.length, 1, 'il modello va chiamato una volta')
  const mandato = testoDi(ricevute[0])
  assert.match(mandato, /id: posta:INBOX:11/)
  assert.doesNotMatch(mandato, /id: posta:INBOX:10/, 'un documento con una voce aperta è stato riletto')
  assert.match(mandato, /GIÀ sul suo feed[\s\S]*«Preventivo Rossi da confermare»/, 'le voci aperte non arrivano al modello')
  // e quello che torna si salva, e si conta
  assert.equal(voci.length, 1)
  assert.equal(store.salvaFeed(voci), 1)
  assert.equal(store.elencoFeed('aperto').length, 2)
})

test('con tutto già sul feed non si chiama nessun modello', async () => {
  store.azzeraTutto()
  store.salvaDocumenti([doc('posta:INBOX:20', 'Unico')])
  store.salvaFeed([voce('L’unico documento', 'posta:INBOX:20')])
  const ricevute = fornitoreFinto([])
  assert.deepEqual(await claude.generaFeed(), [])
  assert.equal(ricevute.length, 0, 'ha chiamato il modello senza niente da leggere')
})

test('senza un motore la lettura non finge: torna vuota, e scriversi un’automazione lo dice', async () => {
  cfg.scrivi({})
  compatibile.usaRete(null)
  store.salvaDocumenti([doc('posta:INBOX:30', 'Qualcosa')])
  assert.deepEqual(await claude.generaFeed(), [])
  await assert.rejects(automazioni.daUnaFrase('Ogni lunedì dimmi quali preventivi sono senza risposta'),
    /Collega Claude e potrò lavorarci/)
})

// — il filo: chi ha la pagina aperta lo sente —

test('«feed» arriva sul filo dei compiti, e solo a chi è la stessa persona', () => {
  const miei: string[] = []
  const altrui: string[] = []
  const smettiMio = compiti.ascolta(e => { miei.push(e.fase) }, null)
  const smettiAltro = compiti.ascolta(e => { altrui.push(e.fase) }, 'qualcun-altro')
  compiti.annunciaFeed()
  smettiMio(); smettiAltro()
  assert.deepEqual(miei, ['feed'])
  assert.deepEqual(altrui, [])
})
