// Quello che la pagina legge a ogni caricamento (`attenzione.feedAttuale`, P2):
// la pillola relativa a oggi, la risposta già mandata dalla posta (la carta
// resta aperta), le carte nate dalla memoria di un progetto che restano
// finché la riga c'è, e il filtro della pagina che non è diventato più severo.
//
//   node --test server/feed-vista-server.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Documento } from './store.ts'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-feed-vista-'))
process.env.MYYND_DATI = CASA
delete process.env.ANTHROPIC_API_KEY

const cfg = await import('./config.ts')
const store = await import('./store.ts')
const progetti = await import('./progetti.ts')
const riferimento = await import('./riferimento.ts')
const { feedAttuale } = await import('./attenzione.ts')

before(() => { store.azzeraTutto(); cfg.scrivi({ lingua: 'en' }) })
after(() => { store.chiudiIndici(); delete process.env.MYYND_DATI; rmSync(CASA, { recursive: true, force: true }) })

const ORA = 3_600_000
const fa = (ore: number) => new Date(Date.now() - ore * ORA).toISOString()
const mail = (id: string, corpo: string, sopra: Partial<Documento> = {}): Documento => ({
  id, fonte: 'posta', tipo: 'email', titolo: `Mail ${id}`, corpo, autore: 'Nora Vance <nora@harbor.example>', percorso: 'INBOX', gruppo: 'posta',
  quando: fa(2), messageId: `${id}@ex`, filo: `${id}@ex`, ...sopra
})
const aperta = (titolo: string) => feedAttuale().find(v => v.titolo === titolo)

test('una carta dalla memoria di un progetto resta finché il progetto è attivo e la riga c’è ancora; una proposta di prima senza fonte resta sempre', () => {
  store.azzeraTutto()
  const p = progetti.scrivi({ nome: 'Northwind', obiettivo: 'Ship Northwind 1.0 on the App Store', note: 'The review video must be recorded before we resubmit.' })
  store.salvaFeed([
    { tipo: 'Priorità', titolo: 'Record the Northwind review video', testo: 'The resubmission waits on it.', perche: 'The review video must be recorded before we resubmit.', offerta: 'I write the shot list.', progetto: p.id, fonte: 'memoria', contesto: JSON.stringify({ fonte: 'memoria', progetto: p.id, prova: 'The review video must be recorded before we resubmit.' }) },
    { tipo: 'Priorità', titolo: 'A legacy proposal with no source', testo: 'Born before the rule, with no snapshot at all.', perche: 'Moves the project', offerta: 'I draft it.', progetto: p.id }
  ])
  let v = aperta('Record the Northwind review video')
  assert.ok(v, 'la carta dalla memoria sta in pagina')
  assert.equal(v.fonte, 'memoria')
  assert.equal(v.doc, null)
  assert.equal(v.progetto, p.id)
  assert.ok(aperta('A legacy proposal with no source'), 'una proposta di prima, senza fonte, resta')
  // la riga sparisce dalla nota: la carta sparisce dalla pagina (resta aperta sul disco)
  progetti.cambia(p.id, { note: 'Nothing left to record.' })
  assert.equal(aperta('Record the Northwind review video'), undefined)
  assert.equal(store.elencoFeed('aperto').some(x => x.titolo === 'Record the Northwind review video'), true, 'la pagina è una vista: non chiude niente')
  // la riga torna: la carta torna
  progetti.cambia(p.id, { note: 'The review video must be recorded before we resubmit.' })
  assert.ok(aperta('Record the Northwind review video'))
  // il progetto chiude: la carta sparisce
  progetti.chiudi(p.id)
  assert.equal(aperta('Record the Northwind review video'), undefined)
  assert.ok(aperta('A legacy proposal with no source'), 'la proposta di prima non dipende dal progetto')
})

test('una carta dal riferimento resta finché la riga che nomina il progetto la contiene', () => {
  store.azzeraTutto()
  const p = progetti.scrivi({ nome: 'Harbor Labs', obiettivo: 'Run the pilot' })
  riferimento.scrivi('Harbor Labs: the pilot scope waits on Nora.\nNorthwind: shipping.')
  store.salvaFeed([{ tipo: 'Priorità', titolo: 'Confirm the pilot scope with Nora', testo: 'Nora waits on the scope.', perche: 'The pilot scope waits on Nora.', offerta: 'I draft the scope.', progetto: p.id, fonte: 'riferimento', contesto: JSON.stringify({ fonte: 'riferimento', progetto: p.id, prova: 'the pilot scope waits on Nora' }) }])
  const v = aperta('Confirm the pilot scope with Nora')
  assert.ok(v)
  assert.equal(v.fonte, 'riferimento')
  // la riga passa sotto un altro progetto: non regge più
  riferimento.scrivi('Northwind: the pilot scope waits on Nora.\nHarbor Labs: done.')
  assert.equal(aperta('Confirm the pilot scope with Nora'), undefined)
})

test('una carta a cui ha risposto dalla posta torna con «risposta» e resta aperta; la pillola si legge relativa a oggi', () => {
  store.azzeraTutto()
  const d = mail('posta:INBOX:1', 'Can you send me the logo files by tomorrow at 9:30?')
  store.salvaDocumenti([d])
  store.salvaFeed([{ tipo: 'Da decidere', titolo: 'Send Leo the logo files', testo: 'Leo is waiting on the files to finish the site.', perche: 'Leo is waiting on the files to finish the site.', fonte: 'posta', doc: d.id, urgenza: 'tomorrow 9:30' }])
  let v = aperta('Send Leo the logo files')!
  assert.equal(v.risposta, null)
  assert.equal(v.urgenza, 'Tomorrow 9:30')
  const mandata = fa(1)
  store.salvaDocumenti([mail('posta:Sent:1', 'Here are the logo files.', { inviato: true, autore: 'Alex <alex@northwind.example>', risponde: d.messageId, destinatari: 'nora@harbor.example', quando: mandata })])
  v = aperta('Send Leo the logo files')!
  assert.equal(v.risposta, mandata)
  assert.equal(v.stato, 'aperto', 'la pagina non chiude la carta: lo fa lui con Fatto')
  // domani mattina la stessa pillola dice «Today 9:30»
  const domani = feedAttuale(Date.now() + 24 * ORA).find(x => x.titolo === 'Send Leo the logo files')!
  assert.equal(domani.urgenza, 'Today 9:30')
})

test('il filtro della pagina non è più severo di ieri: un perché con un giorno non nella fonte passa, un testo con il giorno sciolto da «tomorrow» passa', () => {
  store.azzeraTutto()
  const lunedi = new Date(); lunedi.setHours(9, 0, 0, 0)
  while (lunedi.getDay() !== 1) lunedi.setDate(lunedi.getDate() - 1)
  const d = mail('posta:INBOX:2', 'Can you join the review call tomorrow at 9:30?', { quando: lunedi.toISOString() })
  const e = mail('posta:INBOX:3', 'Can you confirm the pilot scope?', { quando: fa(3) })
  store.salvaDocumenti([d, e])
  store.salvaFeed([
    { tipo: 'Da decidere', titolo: 'Join the review call with Nora', testo: 'Nora needs your yes on Tuesday.', perche: 'Nora waits for your yes.', fonte: 'posta', doc: d.id },
    { tipo: 'Da decidere', titolo: 'Confirm the pilot scope with Nora', testo: 'Nora asks you to confirm the pilot scope.', perche: 'Nora waits for the scope since Friday.', fonte: 'posta', doc: e.id }
  ])
  assert.ok(aperta('Join the review call with Nora'), 'il giorno che «tomorrow» voleva dire nella mail di lunedì regge')
  assert.ok(aperta('Confirm the pilot scope with Nora'), 'un perché vecchio con un giorno non nella fonte si vede ancora')
})
