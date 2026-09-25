// L'osservatore degli invii: una bozza salvata nella posta che poi è partita.
//
//   node --test server/invii-osservati.test.ts

import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-invii-'))
process.env.MYYND_DATI = CASA
delete process.env.ANTHROPIC_API_KEY
const store = await import('./store.ts')
const invii = await import('./invii-osservati.ts')
const lavoroDati = await import('./lavoro-dati.ts')
const voce = await import('./voce.ts')

const imparate: [string, string][] = []
before(() => { store.azzeraTutto(); invii.perProva({ impara: async (b, i) => { imparate.push([b, i]); return 1 } }) })
beforeEach(() => { store.azzeraTutto(); voce.dimentica(); imparate.length = 0 })
after(() => { invii.perProva(null); store.chiudiIndici(); rmSync(CASA, { recursive: true, force: true }) })

const oreFa = (n: number) => new Date(Date.now() - n * 3_600_000).toISOString()
const BOZZA = 'Hi Leo,\n\nHere are the logo files in all three formats.\n\nBest,\nAlex'

/** La mail di Leo, e una riga pronta con la bozza salvata nella posta, consegnata due ore fa. */
function riga(id = 'c-s1', o: { consegnato?: string; casella?: 'salvata' | 'errore' } = {}) {
  store.salvaDocumenti([{ id: 'posta:INBOX:503', fonte: 'posta', tipo: 'email', titolo: 'Logo files', corpo: 'Can you send me the logo files?', autore: 'Leo Marsh <leo@studio.example>', quando: oreFa(3), filo: 'f-leo', messageId: 'l1@studio.example' }])
  store.scriviCompito({ id, testo: 'Reply to Leo about the logo files', ordine: id, doc: 'posta:INBOX:503' })
  const email = { casella: { stato: o.casella ?? 'salvata', id: 'd1', url: 'https://mail.example/d1' }, a: 'leo@studio.example', oggetto: 'Re: Logo files', corpo: BOZZA, conosciuto: true, rispondeA: { messageId: 'l1@studio.example' } }
  store.default.prepare("UPDATE compiti SET stato = 'pronto', chiesto = ?, risultato = ?, email = ? WHERE id = ?").run(oreFa(2.5), `Done: the reply to Leo.\n\n${BOZZA}`, JSON.stringify(email), id)
  const c = store.compito(id)!
  lavoroDati.registraAffido(c, true)
  lavoroDati.registraEsito(id, { mossa: 'produci', tipo: 'risposta', consegnato: o.consegnato ?? oreFa(2) })
  return c
}

function mandata(id: string, o: { quando: string; corpo?: string; risponde?: string | null; filo?: string | null; messageId?: string }) {
  store.salvaDocumenti([{ id, fonte: 'posta', tipo: 'email', titolo: 'Re: Logo files', inviato: true, quando: o.quando, autore: 'Alex <alex@harbor.example>',
    corpo: o.corpo ?? BOZZA, risponde: o.risponde === undefined ? 'l1@studio.example' : o.risponde, filo: o.filo === undefined ? 'f-leo' : o.filo, messageId: o.messageId ?? `s${id}@harbor.example` }])
}

test('una mail mandata dopo la consegna, che risponde al messaggio, segna la riga: mandata dal filo, misure dalla casella, e la riga resta', async () => {
  const c = riga()
  mandata('posta:Sent:61', { quando: oreFa(1), corpo: 'Hi Leo,\n\nHere are the logo files in all four formats.\n\nBest,\nAlex' })
  assert.equal(await invii.osserva(), 1)
  const dopo = store.compito(c.id)!
  assert.equal(dopo.stato, 'pronto', 'la riga è stata chiusa')
  assert.equal(dopo.mandata?.doc, 'posta:Sent:61')
  assert.equal(dopo.mandata?.certezza, 'filo')
  assert.ok(dopo.mandata!.ritocco > 0 && dopo.mandata!.ritocco <= 0.15, `ritocco ${dopo.mandata!.ritocco}`)
  const m = lavoroDati.misura(c.id)!
  assert.equal(m.via, 'casella')
  assert.equal(m.classe, 'ritocco')
  assert.equal(m.inviato, dopo.mandata!.quando)
  assert.ok(m.parole! > 5)
  assert.equal(imparate.length, 1, 'un ritocco si impara')
  assert.equal(imparate[0][0], BOZZA)
  // idempotente: al giro dopo non riscrive niente
  assert.equal(await invii.osserva(), 0)
  assert.equal(store.compito(c.id)!.mandata?.doc, 'posta:Sent:61')
})

test('il Message-ID della bozza vale come certezza «id»; identica non si impara', async () => {
  const c = riga('c-s2')
  mandata('posta:Sent:62', { quando: oreFa(1), messageId: invii.idDellaBozza(c.id, 'posta:INBOX:503') })
  assert.equal(await invii.osservaUno(store.compito(c.id)!)?.then(v => v && v.mandata && v.certezza), 'id')
  assert.equal(lavoroDati.misura(c.id)!.classe, 'identico')
  assert.equal(imparate.length, 0)
})

test('i contro: una mail prima della consegna, un altro filo, un filo «s:», una riga già segnata', async () => {
  const c = riga('c-s3')
  mandata('posta:Sent:70', { quando: oreFa(2.2), risponde: null })            // prima della consegna (due ore fa)
  mandata('posta:Sent:71', { quando: oreFa(1), risponde: null, filo: 'f-altro' }) // un altro filo
  assert.equal(await invii.osservaUno(store.compito(c.id)!), null)
  assert.equal(store.compito(c.id)!.mandata ?? null, null)

  // un filo per oggetto non abbina da solo
  store.default.prepare("UPDATE documenti SET filo = 's:logo' WHERE id = 'posta:INBOX:503'").run()
  mandata('posta:Sent:72', { quando: oreFa(1), risponde: null, filo: 's:logo' })
  assert.equal(await invii.osservaUno(store.compito(c.id)!), null)

  // ma se risponde al messaggio, sì; e una riga già segnata non si riscrive
  mandata('posta:Sent:73', { quando: oreFa(0.5) })
  assert.ok(await invii.osservaUno(store.compito(c.id)!))
  assert.equal(store.compito(c.id)!.mandata?.doc, 'posta:Sent:73')
  mandata('posta:Sent:74', { quando: oreFa(0.2) })
  assert.equal(await invii.osservaUno(store.compito(c.id)!), null)
  assert.equal(store.compito(c.id)!.mandata?.doc, 'posta:Sent:73')
})

test('una risposta riscritta da capo nello stesso filo è sua: via «propria», niente mandata, niente da imparare', async () => {
  const c = riga('c-s4')
  mandata('posta:Sent:80', { quando: oreFa(1), risponde: null, corpo: 'Leo, sorry, the logo files are still with the designer: I will send them on Monday together with the brand guide. Alex' })
  const v = await invii.osservaUno(store.compito(c.id)!)
  assert.deepEqual(v, { mandata: false, via: 'propria' })
  assert.equal(store.compito(c.id)!.mandata ?? null, null)
  assert.equal(lavoroDati.misura(c.id)!.via, 'propria')
  assert.equal(lavoroDati.misura(c.id)!.classe, 'riscritto')
  assert.equal(imparate.length, 0)
})

test('modificata si impara; una bozza non salvata nella posta non si guarda', async () => {
  const c = riga('c-s5')
  mandata('posta:Sent:90', { quando: oreFa(1), corpo: 'Hi Leo,\n\nHere are the logo files in all three formats and the icon set.\n\nBest,\nAlex' })
  const v = await invii.osservaUno(store.compito(c.id)!)
  assert.ok(v && v.mandata)
  assert.equal(lavoroDati.misura(c.id)!.classe, 'modificato')
  assert.equal(imparate.length, 1)

  const senza = riga('c-s6', { casella: 'errore' })
  mandata('posta:Sent:91', { quando: oreFa(0.5) })
  assert.equal(await invii.osservaUno(senza), null)
})
