// Il conto del resoconto (P9), su righe finte: niente database, niente modello.
//
//   node --test server/resoconto-conta.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.MYYND_DATI ??= mkdtempSync(join(tmpdir(), 'myynd-resoconto-conta-'))
const { conta, numeri, MINUTI } = await import('./resoconto-conta.ts')
type M = import('./resoconto-conta.ts').Materiale
type C = import('./resoconto-conta.ts').RigaCompito
type A = import('./resoconto-conta.ts').RigaAzione

const ROMA = 'Europe/Rome'
// la settimana del 14 settembre 2026, a Roma
const S1 = { da: '2026-09-13T22:00:00.000Z', a: '2026-09-20T22:00:00.000Z', fuso: ROMA }
const S2 = { da: '2026-09-20T22:00:00.000Z', a: '2026-09-27T22:00:00.000Z', fuso: ROMA }
const g = (giorno: number, ora = 10) => `2026-09-${String(giorno).padStart(2, '0')}T${String(ora).padStart(2, '0')}:00:00.000Z`

const vuoto = (): M => ({ compiti: [], azioni: [], misure: [], tenute: [], feed: [], autori: {} })
const riga = (id: string, x: Partial<C> = {}): C => ({ id, testo: `Riga ${id}`, stato: 'fatto', creato: g(14, 8), ...x })
let n = 0
const azione = (compito: string | null, tipo: string, quando: string, x: Partial<A> = {}): A => ({ id: `a${++n}`, tipo, cosa: 'Oggetto', compito, esito: 'fatta', quando, ...x })
const con = (m: Partial<M>): M => ({ ...vuoto(), ...m })

test("una mail mandata dall'app conta una volta, 4 minuti", () => {
  const m = con({
    compiti: [riga('m1', { doc: 'posta:INBOX:1', email: { a: 'dana@northwind.example', oggetto: 'Re: October quote' } })],
    azioni: [azione('m1', 'email', g(17))],
    autori: { 'posta:INBOX:1': '"Dana Whitfield" <dana@northwind.example>' }
  })
  const { voci } = conta(m, S1)
  assert.equal(voci.length, 1)
  assert.equal(voci[0]!.genere, 'mail')
  assert.equal(voci[0]!.minuti, 4)
  assert.equal(voci[0]!.titolo, 'October quote')
  assert.equal(voci[0]!.chi, 'Dana Whitfield')
  assert.deepEqual(voci[0]!.apre, { doc: 'posta:INBOX:1' })
  // il contrario: un invio fallito non conta niente
  const f = con({ compiti: [riga('m2')], azioni: [azione('m2', 'email', g(17), { esito: 'fallita' })] })
  assert.equal(conta(f, S1).voci.length, 0)
})

test('una mail riscritta oltre metà si elenca con zero minuti', () => {
  const m = con({ compiti: [riga('m5')], azioni: [azione('m5', 'email', g(19))], misure: [{ compito: 'm5', distanza: 0.7, via: 'smtp' }] })
  const v = conta(m, S1).voci[0]!
  assert.equal(v.riscritta, true)
  assert.equal(v.minuti, 0)
  const b = con({ compiti: [riga('m5')], azioni: [azione('m5', 'email', g(19))], misure: [{ compito: 'm5', distanza: 0.4 }] })
  assert.equal(conta(b, S1).voci[0]!.minuti, 4)
  // senza misura, il vecchio confronto fra la bozza e quello che è partito
  const c = con({ compiti: [riga('m6', { email: { corpo: 'uno due tre quattro cinque sei' }, risultato: 'sette otto nove dieci undici dodici' })], azioni: [azione('m6', 'email', g(19))] })
  assert.equal(conta(c, S1).voci[0]!.riscritta, true)
})

test('una mail dalla casella con lo stesso Message-ID conta', () => {
  const buona = con({ compiti: [riga('m4', { stato: 'pronto', mandata: { doc: 'posta:Sent:9', quando: g(16), certezza: 'id', ritocco: 0.08 } })] })
  const v = conta(buona, S1).voci
  assert.equal(v.length, 1)
  assert.equal(v[0]!.minuti, 4)
  assert.deepEqual(v[0]!.apre, { doc: 'posta:Sent:9' })
  assert.equal(v[0]!.prova, 'mandata:id')
  // il filo con un testo tutto suo è una risposta sua
  const sua = con({ compiti: [riga('m6', { mandata: { doc: 'posta:Sent:10', quando: g(16), certezza: 'filo', ritocco: 0.8 } })] })
  const r = conta(sua, S1)
  assert.equal(r.voci.length, 0)
  assert.equal(r.esclusi[0]!.perche, 'risposta sua')
  // con lo stesso Message-ID resta sua la bozza: elencata, zero minuti
  const id = con({ compiti: [riga('m7', { mandata: { doc: 'posta:Sent:11', quando: g(16), certezza: 'id', ritocco: 0.8 } })] })
  const w = conta(id, S1).voci
  assert.equal(w.length, 1)
  assert.equal(w[0]!.riscritta, true)
  assert.equal(w[0]!.minuti, 0)
})

test('un messaggio inviato vale per una riga sola', () => {
  const md = { doc: 'posta:Sent:9', quando: g(16), certezza: 'id' as const, ritocco: 0.1 }
  const m = con({ compiti: [riga('m1', { mandata: md, creato: g(14) }), riga('rev-m1', { madre: 'm1', mandata: md, creato: g(15) })] })
  const v = conta(m, S1).voci
  assert.equal(v.length, 1)
  assert.equal(v[0]!.chiave, 'compito:rev-m1')
})

test("mandata dall'app e vista nella Inviata: una volta", () => {
  const m = con({
    compiti: [riga('m1', { mandata: { doc: 'posta:Sent:9', quando: g(16, 11), certezza: 'id', ritocco: 0 } })],
    azioni: [azione('m1', 'email', g(16))]
  })
  const v = conta(m, S1).voci
  assert.equal(v.length, 1)
  assert.match(v[0]!.prova, /^azioni:/)
})

test('mandata la settimana scorsa, chiusa con Va bene questa settimana: niente questa settimana', () => {
  const m = con({
    compiti: [riga('m1', { chiesto: g(15), chiuso: g(22), esito: 'Good as is.', mandata: { doc: 'posta:Sent:9', quando: g(18), certezza: 'id', ritocco: 0 } })]
  })
  assert.equal(conta(m, S2).voci.length, 0)
  assert.equal(conta(m, S1).voci.length, 1)
  assert.equal(conta(m, S1).voci[0]!.genere, 'mail')
})

test('un documento di Pages chiuso fatto vale 20', () => {
  const consegna = { app: 'Pages', titolo: 'Northwind proposal', percorso: '/x/Northwind proposal.pages' }
  const m = con({ compiti: [riga('d1', { consegna, chiesto: g(14), chiuso: g(16) })], misure: [{ compito: 'd1', consegnato: g(15) }] })
  const v = conta(m, S1).voci[0]!
  assert.equal(v.genere, 'documento')
  assert.equal(v.minuti, 20)
  assert.equal(v.quando, g(15))
  assert.deepEqual(v.apre, { compito: 'd1' })
  // pronto: si elenca, zero minuti
  const p = con({ compiti: [riga('d1', { consegna, stato: 'pronto', chiesto: g(15) })] })
  assert.equal(conta(p, S1).voci[0]!.minuti, 0)
  // lasciato: niente
  const l = con({ compiti: [riga('d1', { consegna, stato: 'lasciato', chiesto: g(15) })] })
  assert.equal(conta(l, S1).voci.length, 0)
})

test('una bozza salvata in un file è una bozza, non un documento', () => {
  const m = con({
    compiti: [riga('d2', { chiesto: g(15), chiuso: g(16, 12), consegna: JSON.stringify({ app: 'File', titolo: 'Notes', percorso: '/x/n.txt' }) })],
    azioni: [azione('d2', 'documento', g(16))]
  })
  const v = conta(m, S1).voci[0]!
  assert.equal(v.genere, 'bozza')
  assert.equal(v.minuti, 5)
  assert.match(v.prova, /^file:/)
})

test('una revisione di un documento conta una volta', () => {
  const k = (t: string) => ({ app: 'Pages', titolo: t, percorso: `/x/${t}.pages` })
  const m = con({
    compiti: [riga('d1', { consegna: k('Prima'), chiesto: g(14), chiuso: g(15) }), riga('rev-d1', { madre: 'd1', consegna: k('Seconda'), chiesto: g(16), chiuso: g(17) })]
  })
  const v = conta(m, S1).voci
  assert.equal(v.length, 1)
  assert.equal(v[0]!.titolo, 'Seconda')
})

test('il codice conta solo se ha cambiato dei file', () => {
  const m = con({
    compiti: [riga('k1', { stato: 'pronto' }), riga('k2'), riga('k3')],
    azioni: [
      azione('k1', 'lavoro.fatto', g(15), { verso: '/Users/x/code/northwind', dettaglio: JSON.stringify({ changedFiles: [{ path: 'a.ts' }] }) }),
      azione('k1', 'lavoro.fatto', g(17), { verso: '/Users/x/code/northwind', dettaglio: JSON.stringify({ changedFiles: [{ path: 'b.ts' }] }) }),
      azione('k2', 'lavoro.fatto', g(17), { dettaglio: JSON.stringify({ changedFiles: [] }) }),
      azione('k3', 'lavoro.piano', g(17), { dettaglio: JSON.stringify({ changedFiles: [{ path: 'c.ts' }] }) })
    ]
  })
  const v = conta(m, S1).voci
  assert.equal(v.length, 1)
  assert.equal(v[0]!.genere, 'codice')
  assert.equal(v[0]!.quando, g(17))
  assert.equal(v[0]!.chi, 'northwind')
  assert.equal(v[0]!.minuti, 15)
})

test("l'agenda conta gli eventi della prova", () => {
  const m = con({ compiti: [riga('a1')], azioni: [azione('a1', 'agenda', g(18), { dettaglio: JSON.stringify([{ id: 1 }, { id: 2 }]), cosa: '2 eventi' })] })
  const v = conta(m, S1).voci[0]!
  assert.equal(v.quanti, 2)
  assert.equal(v.minuti, 2)
  const c = con({ compiti: [riga('a2')], azioni: [azione('a2', 'agenda', g(18), { cosa: '3 eventi' })] })
  assert.equal(conta(c, S1).voci[0]!.quanti, 3)
})

test('il riordino conta quello che si è spostato', () => {
  const m = con({
    compiti: [riga('r1', { esito: '12 in «Archive».' })],
    azioni: [
      azione('r1', 'posta.archivia', g(19), { cosa: '14 messaggi' }),
      azione(null, 'posta.regola.archivia', g(15), { cosa: 'news@example.com' }),
      azione(null, 'posta.regola.archivia', g(16), { cosa: 'news@example.com' }),
      azione(null, 'posta.regola.archivia', g(16), { cosa: 'promo@shop.example' }),
      azione(null, 'posta.regola.archivia', g(16), { cosa: 'promo@shop.example', esito: 'fallita' })
    ]
  })
  const v = conta(m, S1).voci
  const r1 = v.find(x => x.chiave === 'compito:r1')!
  assert.equal(r1.quanti, 12)
  assert.equal(r1.minuti, 1.2)
  assert.equal(r1.cestino, false)
  assert.equal(v.find(x => x.chiave === 'regola:news@example.com')!.quanti, 2)
  assert.equal(v.find(x => x.chiave === 'regola:promo@shop.example')!.quanti, 1)
  const c = con({ compiti: [riga('r2', { esito: null })], azioni: [azione('r2', 'posta.cestina', g(19), { cosa: '3 messaggi' })] })
  const w = conta(c, S1).voci[0]!
  assert.equal(w.quanti, 3)
  assert.equal(w.cestino, true)
})

test('una bozza accettata vale 5', () => {
  const m = con({ compiti: [riga('b1', { chiesto: g(15), chiuso: g(16), esito: 'Good as is.', origine: 'iniziativa', risultato: 'Hi Leo,\nthe plan.\n\nBest' })] })
  const v = conta(m, S1).voci[0]!
  assert.equal(v.genere, 'bozza')
  assert.equal(v.minuti, 5)
  assert.equal(v.preparata, true)
  assert.equal(v.anteprima, 'Hi Leo,\nthe plan.')
  // riscritta dopo (P1B): zero minuti
  const r = con({ ...m, tenute: [{ ref: 'b1', valore: 0.9, quando: g(16) }] })
  assert.equal(conta(r, S1).voci[0]!.minuti, 0)
  // il contrario: una domanda chiusa dal cerchio, e una riga riaffidata chiusa a mano dopo un guaio
  const no = con({ compiti: [riga('b2', { chiesto: g(15), chiuso: g(16), esito: null }), riga('b3', { chiesto: g(15), chiuso: g(16), esito: 'Fatta a mano.' })] })
  assert.equal(conta(no, S1).voci.length, 0)
})

const carta = (id: string, x: Record<string, unknown>) => ({ id, tipo: 'Deadline', titolo: `Carta ${id}`, quando: g(22), stato: 'aperto', ...x }) as import('./resoconto-conta.ts').RigaFeed
const S3 = { da: '2026-09-20T22:00:00.000Z', a: '2026-09-27T22:00:00.000Z', fuso: ROMA }

test("una scadenza vista prima del giorno conta, con la data", () => {
  const buona = con({ feed: [carta('s1', { urgenza: 'Sep 25', quando: g(22), vista: g(22, 12), doc: 'posta:INBOX:3' })] })
  const v = conta(buona, S3).voci
  assert.equal(v.length, 1)
  assert.equal(v[0]!.genere, 'scadenza')
  assert.equal(v[0]!.scade, '2026-09-25')
  assert.equal(v[0]!.presa, 'vista')
  assert.deepEqual(v[0]!.apre, { doc: 'posta:INBOX:3' })
  const mai = [
    carta('x1', { urgenza: 'Sep 25', stato: 'scartato', ragione: 'vecchia', vista: g(22, 12) }),
    carta('x2', { urgenza: 'Sep 23', vista: g(24, 12) }),
    carta('x3', { urgenza: 'Sep 21', quando: g(22), vista: g(22, 12) }),
    carta('x4', { tipo: 'Priorità', urgenza: 'entro venerdì', vista: g(22, 12) }),
    carta('x5', { urgenza: 'quando puoi', vista: g(22, 12) }),
    carta('x6', { urgenza: null, testo: 'entro il 25 settembre', vista: g(22, 12) })
  ]
  assert.equal(conta(con({ feed: mai }), S3).voci.length, 0)
})

test('una scadenza fatta in lista dice nella lista', () => {
  const m = con({
    feed: [
      carta('s1', { urgenza: 'Sep 25', stato: 'fatto', ragione: 'lista', risposto: g(23) }),
      carta('s2', { urgenza: 'Sep 25', stato: 'fatto', ragione: 'lui', risposto: g(23) }),
      carta('s3', { urgenza: 'Sep 25', stato: 'aperto' })
    ]
  })
  const v = conta(m, S3).voci
  assert.equal(v.find(x => x.chiave === 'feed:s1')!.presa, 'nella lista')
  assert.equal(v.find(x => x.chiave === 'feed:s2')!.presa, 'fatta')
  assert.equal(v.find(x => x.chiave === 'feed:s3'), undefined)
})

test("la scadenza si conta la settimana in cui l'ha vista", () => {
  const m = con({ feed: [carta('s1', { urgenza: 'Sep 25', quando: g(18), vista: g(19), stato: 'fatto', ragione: 'lui', risposto: g(22) })] })
  assert.equal(conta(m, S1).voci.length, 1)
  assert.equal(conta(m, S2).voci.length, 0)
})

test('la fine del giorno è quella del suo fuso', () => {
  // vista alle 23:30 di Roma del 25 (21:30 UTC): prima della fine del giorno a Roma
  const roma = con({ feed: [carta('s1', { urgenza: 'Sep 25', quando: g(22), vista: '2026-09-25T21:30:00.000Z' })] })
  assert.equal(conta(roma, { ...S3, fuso: ROMA }).voci.length, 1)
  // a Los Angeles la fine del 25 è il 26 alle 07:00 UTC: vista alle 06:30 UTC del 26 è ancora in tempo
  const la = con({ feed: [carta('s1', { urgenza: 'Sep 25', quando: g(22), vista: '2026-09-26T06:30:00.000Z' })] })
  assert.equal(conta(la, { ...S3, fuso: 'America/Los_Angeles' }).voci.length, 1)
  // a Roma alla stessa ora il 25 è finito da un pezzo
  assert.equal(conta(la, { ...S3, fuso: ROMA }).voci.length, 0)
})

test('una carta passata in lista e poi mandata come mail conta una volta, come mail', () => {
  const m = con({
    feed: [
      { id: 'f-x', tipo: 'Priority', titolo: 'Reply Leo', quando: g(14), stato: 'fatto', ragione: 'lista', risposto: g(15) },
      carta('s9', { urgenza: 'Sep 18', quando: g(14), vista: g(14, 12) })
    ],
    compiti: [
      riga('m2', { voce: 'f-x' }),
      riga('d9', { voce: 's9', consegna: { app: 'Pages', titolo: 'Brief', percorso: '/x/b.pages' }, chiesto: g(15), chiuso: g(16) })
    ],
    azioni: [azione('m2', 'email', g(15, 12))]
  })
  const r = conta(m, S1)
  assert.deepEqual(r.voci.map(v => v.genere).sort(), ['documento', 'mail'])
  assert.ok(r.esclusi.some(e => e.chiave === 'feed:s9' && e.perche === 'contata come lavoro'))
  assert.ok(r.esclusi.some(e => e.chiave === 'feed:f-x'))
})

test('nessuna chiave doppia, nessun compito o carta dietro due voci', () => {
  const m = vuoto()
  const tipi = ['email', 'lavoro.fatto', 'agenda', 'posta.archivia', 'documento']
  for (let i = 0; i < 40; i++) {
    const id = i % 5 === 4 ? `rev-t${i - 1}` : `t${i}`
    const madre = i % 5 === 4 ? `t${i - 1}` : null
    m.compiti.push(riga(id, {
      madre, voce: i % 7 === 0 ? `f${i}` : null, chiesto: g(14), chiuso: g(15 + (i % 5)), esito: i % 3 ? 'Good as is.' : null,
      consegna: i % 4 === 0 ? { app: 'Pages', titolo: `Doc ${i}`, percorso: `/x/${i}.pages` } : null,
      mandata: i % 6 === 0 ? { doc: `posta:Sent:${i % 12}`, quando: g(16), certezza: 'id', ritocco: 0.1 } : null
    }))
    if (i % 2) m.azioni.push(azione(id, tipi[i % tipi.length]!, g(15 + (i % 5)), { dettaglio: JSON.stringify({ changedFiles: [{ path: 'x' }] }) }))
    m.feed.push({ id: `f${i}`, tipo: i % 3 ? 'Priority' : 'Deadline', titolo: `Carta ${i}`, urgenza: 'Sep 19', quando: g(14), stato: 'fatto', ragione: 'lista', vista: g(15), risposto: g(16) })
  }
  m.azioni.push(azione('sparita', 'email', g(16)))
  const { voci } = conta(m, S1)
  assert.ok(voci.length > 20)
  const chiavi = voci.map(v => v.chiave)
  assert.equal(new Set(chiavi).size, chiavi.length)
  // una catena intera sta dietro una voce sola
  const radice = (id: string) => id.startsWith('rev-') ? id.slice(4) : id
  const catene = voci.filter(v => v.chiave.startsWith('compito:')).map(v => radice(v.chiave.slice(8)))
  assert.equal(new Set(catene).size, catene.length)
  // una carta con una riga che ha fatto qualcosa non è anche una carta
  for (const v of voci.filter(x => x.chiave.startsWith('feed:'))) {
    const c = m.compiti.find(x => x.voce === v.chiave.slice(5))
    if (c) assert.ok(!catene.includes(radice(c.id)), `${v.chiave} contata due volte`)
  }
})

test('i minuti sono la somma della tabella', () => {
  const m = con({
    compiti: [
      riga('m1'), riga('m5'), riga('k1'), riga('a1'), riga('r1', { esito: '12 in «Archive».' }),
      riga('b1', { chiesto: g(15), chiuso: g(16), esito: 'Va bene così.' })
    ],
    azioni: [
      azione('m1', 'email', g(15)), azione('m5', 'email', g(15)),
      azione('k1', 'lavoro.fatto', g(17), { dettaglio: JSON.stringify({ changedFiles: [{}] }) }),
      azione('a1', 'agenda', g(18), { dettaglio: '[1,2]' }), azione('r1', 'posta.archivia', g(19))
    ],
    misure: [{ compito: 'm5', distanza: 0.9 }]
  })
  const { voci } = conta(m, S1)
  const r = numeri(voci)
  assert.equal(r.numeri.minuti, 4 + 15 + 2 + 1.2 + 5)
  assert.equal(r.numeri.mail, 2)
  assert.equal(r.numeri.lavori, 4)
  assert.deepEqual(r.stime.map(s => s.genere), ['mail', 'codice', 'bozza', 'agenda', 'riordino'])
  assert.equal(r.riscritte, 1)
  // con una tabella diversa cambia il conto, non le voci
  const altro = numeri(conta(m, { ...S1, minuti: { ...MINUTI, mail: 10 } }).voci)
  assert.equal(altro.numeri.mail, 2)
  assert.equal(altro.numeri.minuti, 10 + 15 + 2 + 1.2 + 5)
})

test('prodotte e usate per automazione', () => {
  const m = con({
    compiti: [
      riga('u1', { origine: 'auto:follow-up', creato: g(15) }),
      riga('u2', { origine: 'auto:follow-up', creato: g(16), stato: 'pronto' }),
      riga('u3', { origine: 'auto:follow-up', creato: g(8) })
    ],
    azioni: [azione('u1', 'email', g(18))]
  })
  const r = conta(m, S1)
  assert.deepEqual(r.automazioni, [{ id: 'follow-up', usate: 1, prodotte: 2 }])
  assert.equal(r.voci[0]!.automazione, 'follow-up')
  assert.equal(r.voci[0]!.preparata, true)
  assert.equal(numeri(r.voci).numeri.minuti, 4)
})

test('una mail dal registro resta anche se la riga è stata tolta, senza collegamento', () => {
  const m = con({ compiti: [riga('m1', { stato: 'lasciato', sparito: g(19), doc: 'posta:INBOX:1' })], azioni: [azione('m1', 'email', g(17))] })
  const v = conta(m, S1).voci
  assert.equal(v.length, 1)
  assert.equal(v[0]!.apre, null)
  // una bozza della casella su una riga tolta no
  const t = con({ compiti: [riga('m2', { sparito: g(19), mandata: { doc: 'posta:Sent:1', quando: g(17), certezza: 'id', ritocco: 0 } })] })
  assert.equal(conta(t, S1).voci.length, 0)
})
