// Quando l'ha vista, se ha risposto dalla posta, dove è finito ogni documento.
//
//   node --test server/feed-dati.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Documento } from './store.ts'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-feed-dati-'))
process.env.MYYND_DATI = CASA
const store = await import('./store.ts')
const dati = await import('./feed-dati.ts')
before(() => store.azzeraTutto())
after(() => { store.chiudiIndici(); delete process.env.MYYND_DATI; rmSync(CASA, { recursive: true, force: true }) })

const ADESSO = Date.now()
const ore = (n: number) => new Date(ADESSO - n * 3_600_000).toISOString()
const mail = (id: string, sopra: Partial<Documento>): Documento => ({
  id, fonte: 'posta', tipo: 'email', titolo: `Mail ${id}`, corpo: `Puoi confermare i dettagli di ${id}? Attendo una risposta.`,
  autore: 'Leo Marsh <leo@studio.example>', gruppo: 'posta', quando: ore(4), ...sopra
})
const carta = (id: string, doc: string | null, quando: string, contesto: string | null = null) => ({ id, doc, contesto, quando })

test('segnaViste scrive una volta sola, solo sulle aperte, e ignora gli id che non esistono', () => {
  store.azzeraTutto()
  store.salvaFeed([
    { tipo: 'Da decidere', titolo: 'Rispondi a Leo sui file del logo', testo: 'Leo aspetta i file.' },
    { tipo: 'Da decidere', titolo: 'Paga la fattura di Rossi', testo: 'Scade venerdì.' }
  ])
  const [a, b] = store.elencoFeed('aperto')
  store.cambiaStatoFeed(b.id, 'fatto', 'Già fatto.', 'lui')
  assert.equal(dati.segnaViste([a.id, b.id, 'non-esiste'], '2026-09-21T10:00:00.000Z'), 1, 'solo l’aperta')
  assert.equal(store.voceFeed(a.id)!.vista, '2026-09-21T10:00:00.000Z')
  assert.equal(store.voceFeed(b.id)!.vista, null, 'una carta chiusa non si segna vista')
  assert.equal(dati.segnaViste([a.id], '2026-09-22T10:00:00.000Z'), 0, 'la seconda volta non conta')
  assert.equal(store.voceFeed(a.id)!.vista, '2026-09-21T10:00:00.000Z', 'la prima volta resta')
  assert.equal(dati.segnaViste([]), 0)
})

test('risposteFuori: per «risponde» (id), per filo con i destinatari (filo), per filo con destinatari vuoti (righe di prima)', () => {
  store.azzeraTutto()
  store.salvaDocumenti([
    mail('posta:INBOX:1', { messageId: 'm1@studio', filo: 'f1', quando: ore(4) }),
    mail('posta:Sent:1', { inviato: true, risponde: 'm1@studio', filo: 'f1', destinatari: 'leo@studio.example', quando: ore(3), autore: 'Alex <alex@northwind.example>' }),
    mail('posta:INBOX:2', { messageId: 'm2@studio', filo: 'f2', quando: ore(4) }),
    mail('posta:Sent:2', { inviato: true, filo: 'f2', destinatari: 'other@x.example,leo@studio.example', quando: ore(2), autore: 'Alex <alex@northwind.example>' }),
    mail('posta:INBOX:3', { messageId: 'm3@studio', filo: 'f3', quando: ore(4) }),
    mail('posta:Sent:3', { inviato: true, filo: 'f3', destinatari: null, quando: ore(1), autore: 'Alex <alex@northwind.example>' })
  ])
  const r = dati.risposteFuori([
    carta('c1', 'posta:INBOX:1', ore(5)), carta('c2', 'posta:INBOX:2', ore(1)), carta('c3', 'posta:INBOX:3', ore(2))
  ])
  assert.deepEqual(r.get('c1'), { quando: ore(3), dopo: true, certezza: 'id' })
  assert.deepEqual(r.get('c2'), { quando: ore(2), dopo: false, certezza: 'filo' }, 'ha risposto prima che la carta nascesse')
  assert.deepEqual(r.get('c3'), { quando: ore(1), dopo: true, certezza: 'filo' }, 'destinatari vuoti: una riga di prima, vale')
})

test('risposteFuori, i controcasi: un filo «s:» non lega, un altro destinatario no, una mail mandata prima no', () => {
  store.azzeraTutto()
  store.salvaDocumenti([
    mail('posta:INBOX:10', { messageId: 'm10', filo: 's:oggetto', quando: ore(4) }),
    mail('posta:Sent:10', { inviato: true, filo: 's:oggetto', destinatari: 'leo@studio.example', quando: ore(3), autore: 'Alex <alex@northwind.example>' }),
    mail('posta:INBOX:11', { messageId: 'm11', filo: 'f11', quando: ore(4) }),
    mail('posta:Sent:11', { inviato: true, filo: 'f11', destinatari: 'other@x.example', quando: ore(3), autore: 'Alex <alex@northwind.example>' }),
    mail('posta:INBOX:12', { messageId: 'm12', filo: 'f12', quando: ore(2) }),
    mail('posta:Sent:12', { inviato: true, filo: 'f12', destinatari: 'leo@studio.example', quando: ore(3), autore: 'Alex <alex@northwind.example>' }),
    mail('posta:INBOX:13', { messageId: 'm13', filo: 'f13', quando: ore(4) })
  ])
  const r = dati.risposteFuori([
    carta('c10', 'posta:INBOX:10', ore(5)), carta('c11', 'posta:INBOX:11', ore(5)),
    carta('c12', 'posta:INBOX:12', ore(5)), carta('c13', 'posta:INBOX:13', ore(5)), carta('c14', null, ore(5))
  ])
  assert.equal(r.size, 0, [...r.keys()].join(', '))
})

test('risposteFuori: una carta il cui documento è sparito risponde ancora, dall’istantanea', () => {
  store.azzeraTutto()
  store.salvaDocumenti([
    mail('posta:Sent:20', { inviato: true, risponde: 'm20@studio', filo: 'f20', destinatari: 'leo@studio.example', quando: ore(1), autore: 'Alex <alex@northwind.example>' })
  ])
  const contesto = JSON.stringify({ id: 'posta:INBOX:20', fonte: 'posta', titolo: 'x', corpo: 'x', autore: 'Leo Marsh <leo@studio.example>', quando: ore(4), filo: 'f20', messageId: 'm20@studio' })
  const r = dati.risposteFuori([carta('c20', 'posta:INBOX:20', ore(3), contesto)])
  assert.deepEqual(r.get('c20'), { quando: ore(1), dopo: true, certezza: 'id' })
  // e per filo, dall'istantanea
  const perFilo = JSON.stringify({ id: 'posta:INBOX:21', fonte: 'posta', titolo: 'x', corpo: 'x', autore: 'Leo Marsh <leo@studio.example>', quando: ore(4), filo: 'f20', messageId: 'altro' })
  assert.equal(dati.risposteFuori([carta('c21', null, ore(3), perFilo)]).get('c21')?.certezza, 'filo')
  assert.equal(dati.risposteFuori([carta('c22', null, ore(3), 'non json')]).size, 0)
})

test('rispostiPerId: i messaggi a cui ha già risposto', () => {
  store.azzeraTutto()
  store.salvaDocumenti([mail('posta:Sent:30', { inviato: true, risponde: 'm30', filo: 'f30', quando: ore(1), autore: 'Alex <alex@northwind.example>' })])
  assert.deepEqual([...dati.rispostiPerId(['m30', 'm31', ''])], ['m30'])
  assert.equal(dati.rispostiPerId([]).size, 0)
})

test('segnaEsame scrive dove è finito ogni documento, tiene «quando» se non cambia niente, e pota dopo sessanta giorni', () => {
  store.azzeraTutto()
  const t1 = '2026-09-20T10:00:00.000Z', t2 = '2026-09-21T10:00:00.000Z'
  assert.equal(dati.segnaEsame([{ doc: 'a', fase: 'regole', motivo: 'posta_in_serie' }, { doc: 'b', fase: 'modello' }], t1), 2)
  assert.deepEqual(dati.esameDi(['a']).get('a'), { fase: 'regole', motivo: 'posta_in_serie', quando: t1 })
  // la stessa cosa: non si tocca
  assert.equal(dati.segnaEsame([{ doc: 'a', fase: 'regole', motivo: 'posta_in_serie' }], t2), 0)
  assert.equal(dati.esameDi(['a']).get('a')!.quando, t1)
  // «modello» riletto: la stessa fase, ma l'ora si rinfresca (è quella che il salto delle 24 ore confronta)
  assert.equal(dati.segnaEsame([{ doc: 'b', fase: 'modello' }], t2), 1)
  assert.equal(dati.esameDi(['b']).get('b')!.quando, t2)
  assert.equal(dati.segnaEsame([{ doc: 'b', fase: 'verifica', motivo: 'perche:numero' }], t2), 1)
  assert.equal(dati.segnaEsame([{ doc: 'b', fase: 'verifica', motivo: 'perche:numero' }], '2026-09-21T11:00:00.000Z'), 1, 'anche «verifica» si rinfresca')
  // una cosa diversa: si riscrive, con l'ora nuova
  assert.equal(dati.segnaEsame([{ doc: 'b', fase: 'carta' }], t2), 1)
  assert.deepEqual(dati.esameDi(['b']).get('b'), { fase: 'carta', motivo: null, quando: t2 })
  // «gia» e «risposto» non coprono la fase che dice dove il feed l'ha perso: a chi misura le mancate serve quella
  assert.equal(dati.segnaEsame([{ doc: 'b', fase: 'gia' }], t2), 0)
  assert.equal(dati.segnaEsame([{ doc: 'a', fase: 'risposto' }], t2), 0)
  assert.deepEqual([dati.esameDi(['a']).get('a')!.fase, dati.esameDi(['b']).get('b')!.fase], ['regole', 'carta'])
  // ma fra loro sì, e su un documento nuovo si scrivono
  assert.equal(dati.segnaEsame([{ doc: 'd', fase: 'gia' }], t2), 1)
  assert.equal(dati.segnaEsame([{ doc: 'd', fase: 'risposto' }], t2), 1)
  assert.equal(dati.esameDi(['d']).get('d')!.fase, 'risposto')
  store.default.prepare('DELETE FROM feed_esame WHERE doc = ?').run('d')
  assert.equal(dati.esameDi(['a', 'b', 'c']).size, 2)
  // sessanta giorni dopo: via le vecchie
  dati.segnaEsame([{ doc: 'c', fase: 'posti' }], '2026-11-22T10:00:00.000Z')
  assert.deepEqual([...dati.esameDi(['a', 'b', 'c']).keys()], ['c'])
  assert.equal(dati.segnaEsame([]), 0)
  assert.deepEqual([...dati.FASI], ['regole', 'scartati', 'gia', 'risposto', 'gia_risposto', 'non_suo', 'posti', 'modello', 'verifica', 'obiettivo', 'lingua', 'doppione', 'carta'])
})
