// La lettura del resoconto (P9) su un database vero e temporaneo: le
// settimane nel suo fuso, la carta del lunedì, il gemello, e che leggere non
// scrive niente.
//
//   node --test server/resoconto.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const casa = mkdtempSync(join(tmpdir(), 'myynd-resoconto-'))
process.env.MYYND_DATI = casa
const conti = await import('./conti.ts')
const chi = await import('./chi.ts')
const store = await import('./store.ts')
const cfg = await import('./config.ts')
const r = await import('./resoconto.ts')
const db = store.default

let A = '', B = '', C = ''
const LUN = new Date('2026-09-21T09:00:00+02:00')

function riga(id: string, campi: Record<string, unknown> = {}) {
  store.scriviCompito({ id, testo: `Riga ${id}`, quando: 'oggi', ordine: 'a0' })
  for (const [k, v] of Object.entries(campi)) {
    db.prepare(`UPDATE compiti SET ${k} = ? WHERE id = ?`).run(v === null ? null : typeof v === 'object' ? JSON.stringify(v) : v as string, id)
  }
}
let n = 0
function azione(compito: string | null, tipo: string, quando: string, x: Record<string, string> = {}) {
  db.prepare('INSERT INTO azioni (id, tipo, verso, cosa, compito, esito, dettaglio, quando) VALUES (?,?,?,?,?,?,?,?)')
    .run(`az${++n}`, tipo, x.verso ?? null, x.cosa ?? 'Oggetto', compito, x.esito ?? 'fatta', x.dettaglio ?? null, quando)
}
function carta(id: string, x: Record<string, string | null>) {
  db.prepare(`INSERT INTO feed (id, tipo, titolo, testo, urgenza, fonte, doc, stato, quando, perche, offerta, progetto, peso, ragione)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, x.tipo ?? 'Deadline', x.titolo ?? `Carta ${id}`, '', x.urgenza ?? null, 'posta', x.doc ?? null,
    x.stato ?? 'aperto', x.quando ?? '2026-09-15T08:00:00.000Z', null, null, null, null, x.ragione ?? null)
  db.prepare('UPDATE feed SET vista = ?, risposto = ? WHERE id = ?').run(x.vista ?? null, x.risposto ?? null, id)
}

before(async () => {
  store.azzeraTutto()
  for (const [i, e] of ['a', 'b', 'c'].entries()) {
    const k = await conti.registra(`resoconto-${e}@esempio.test`, 'parola-di-prova-lunga')
    assert.ok(k.ok)
    if (i === 0) A = k.id; else if (i === 1) B = k.id; else C = k.id
    chi.dentro(k.id, () => cfg.scrivi({ lingua: 'en', fuso: 'Europe/Rome', diSerie: false, onboarding: true, giro: true }))
  }
  chi.dentro(A, () => {
    riga('m1', { creato: '2026-09-02T09:00:00.000Z', stato: 'fatto', chiesto: '2026-09-15T08:00:00.000Z', chiuso: '2026-09-17T09:00:00.000Z' })
    azione('m1', 'email', '2026-09-17T09:00:00.000Z')
    carta('s1', { urgenza: 'Sep 25', quando: '2026-09-15T08:00:00.000Z', vista: '2026-09-15T09:00:00.000Z' })
  })
})

after(() => {
  store.chiudiIndici()
  rmSync(casa, { recursive: true, force: true })
})

test('settimana: lunedì a mezzanotte nel suo fuso', () => {
  const mer = new Date('2026-09-23T10:00:00Z')
  assert.equal(r.settimana(mer, 'questa', 'Europe/Rome').da, '2026-09-20T22:00:00.000Z')
  assert.equal(r.settimana(mer, 'questa', 'Europe/Rome').a, mer.toISOString())
  assert.equal(r.settimana(mer, 'questa', 'Europe/Rome').lunedi, '2026-09-21')
  assert.equal(r.settimana(mer, 'scorsa', 'Europe/Rome').da, '2026-09-13T22:00:00.000Z')
  assert.equal(r.settimana(mer, 'scorsa', 'Europe/Rome').a, '2026-09-20T22:00:00.000Z')
  assert.equal(r.settimana(mer, 'questa', 'America/Los_Angeles').da, '2026-09-21T07:00:00.000Z')
  assert.equal(r.settimana(mer, 'questa', 'Asia/Tokyo').da, '2026-09-20T15:00:00.000Z')
  // il cambio d'ora: 169 ore
  const roma = r.settimana(new Date('2026-10-27T10:00:00Z'), 'scorsa', 'Europe/Rome')
  assert.deepEqual([roma.da, roma.a], ['2026-10-18T22:00:00.000Z', '2026-10-25T23:00:00.000Z'])
  const us = r.settimana(new Date('2026-11-03T18:00:00Z'), 'scorsa', 'America/Los_Angeles')
  assert.deepEqual([us.da, us.a], ['2026-10-26T07:00:00.000Z', '2026-11-02T08:00:00.000Z'])
  // domenica alle 23:30 è ancora quella settimana
  const s = r.settimana(new Date('2026-09-21T09:00:00+02:00'), 'scorsa', 'Europe/Rome')
  const t = Date.parse('2026-09-20T23:30:00+02:00')
  assert.ok(t >= Date.parse(s.da) && t < Date.parse(s.a))
})

test('lunedi: da lunedì alle 6 a mercoledì sera', () => {
  chi.dentro(A, () => {
    const prima = r.sonda.letture
    assert.equal(r.lunedi(new Date('2026-09-21T05:59:00+02:00')).mostra, false)
    assert.equal(r.lunedi(new Date('2026-09-24T00:00:00+02:00')).mostra, false)
    assert.equal(r.lunedi(new Date('2026-09-20T12:00:00+02:00')).mostra, false)
    assert.equal(r.sonda.letture, prima, 'fuori finestra non si conta niente')
    const si = r.lunedi(new Date('2026-09-21T06:00:00+02:00'))
    assert.deepEqual(si, { mostra: true, lunedi: '2026-09-21', numeri: { mail: 1, lavori: 0, scadenze: 1 } })
    assert.equal(r.lunedi(new Date('2026-09-23T23:59:00+02:00')).mostra, true)
  })
  // solo scadenze: niente carta
  chi.dentro(C, () => {
    carta('c1', { urgenza: 'Sep 25', quando: '2026-09-15T08:00:00.000Z', vista: '2026-09-15T09:00:00.000Z' })
    assert.equal(r.lunedi(LUN).mostra, false)
  })
  // aperta una volta, non torna; e resta di quel conto
  chi.dentro(A, () => {
    r.segnaVisto('2026-09-21')
    assert.equal(r.lunedi(LUN).mostra, false)
    assert.deepEqual(JSON.parse(readFileSync(join(cfg.cartella(), 'resoconto.json'), 'utf8')), { visto: '2026-09-21' })
    assert.throws(() => r.segnaVisto('2026-9-1'), /Non conosco questo periodo/)
  })
  chi.dentro(B, () => assert.ok(!existsSync(join(cfg.cartella(), 'resoconto.json'))))
})

test('inizio: il primo di conto, righe e carte', () => {
  const a = chi.dentro(A, () => r.inizio())
  assert.equal(a, '2026-09-02T09:00:00.000Z')
  const b = chi.dentro(B, () => r.inizio())
  // B non ha righe né carte: comincia con il conto
  assert.ok(Date.parse(b) > Date.parse(a))
  assert.equal(b, new Date(conti.conto(B)!.creato).toISOString())
})

test('punteggio solo da 20 in su, con la base', () => {
  chi.dentro(B, () => {
    const ins = db.prepare("INSERT OR REPLACE INTO punteggi (giorno, giuste, sbagliate, annullate, base, calcolato) VALUES (?,?,?,0,?,'x')")
    ins.run('2026-09-14', 15, 4, 0.5)
    assert.equal(r.resoconto('scorsa', LUN).punteggio, null)
    for (let d = 14; d <= 20; d++) ins.run(`2026-09-${d}`, 5, 1, 0.55)
    // un giorno senza base resta fuori dai due numeri
    db.prepare("INSERT OR REPLACE INTO punteggi (giorno, giuste, sbagliate, annullate, base, calcolato) VALUES ('2026-09-19', 9, 0, 0, NULL, 'x')").run()
    const p = r.resoconto('scorsa', LUN).punteggio
    assert.deepEqual(p, { giuste: 30, totale: 36, base: 20 })
    ins.run('2026-09-19', 5, 1, 0.55)
    assert.deepEqual(r.resoconto('scorsa', LUN).punteggio, { giuste: 35, totale: 42, base: 23 })
  })
})

test('notato: le righe nuove della settimana, non quelle tolte', () => {
  chi.dentro(B, () => {
    const ins = db.prepare('INSERT INTO abitudini (chiave, genere, dati, prova, fiducia, stato, testoSuo, visto, aggiornato, tolta) VALUES (?,?,?,?,?,?,?,?,?,?)')
    ins.run('k1', 'posta.tempo', '{"latenzaMin":120}', '[]', 0.8, 'osservata', null, '2026-09-16T10:00:00.000Z', '2026-09-16T10:00:00.000Z', null)
    ins.run('k2', 'posta.lascia', '{"nome":"Deals"}', '[]', 0.8, 'tenuta', 'Deals goes unread', '2026-09-17T10:00:00.000Z', '2026-09-17T10:00:00.000Z', null)
    ins.run('k3', 'posta.ore', '{"da":9,"a":11}', '[]', 0.8, 'osservata', null, '2026-09-16T10:00:00.000Z', '2026-09-16T10:00:00.000Z', '2026-09-18T10:00:00.000Z')
    ins.run('k4', 'posta.ore', '{"da":9,"a":11}', '[]', 0.8, 'osservata', null, '2026-09-08T10:00:00.000Z', '2026-09-08T10:00:00.000Z', null)
    const nt = r.resoconto('scorsa', LUN).notato
    assert.deepEqual(nt.map(x => x.chiave), ['k2', 'k1'])
    assert.deepEqual(nt[1]!.dati, { latenzaMin: 120 })
  })
})

test('copertura: senza posta inviata e con una bozza nella casella', () => {
  chi.dentro(B, () => {
    riga('bz1', { stato: 'pronto', chiesto: '2026-09-16T08:00:00.000Z', email: { a: 'x@y.example', oggetto: 'Hi', corpo: 'Hi', casella: { stato: 'salvata' } } })
    const c = r.resoconto('scorsa', LUN).copertura
    assert.deepEqual(c, { postaInviata: false, bozzeInCasella: 1 })
    store.salvaDocumenti([{ id: 'posta:Sent:1', fonte: 'posta', tipo: 'email', titolo: 'Re: Hi', corpo: 'Hi', quando: '2026-09-16T10:00:00.000Z', percorso: 'Sent', inviato: true } as Parameters<typeof store.salvaDocumenti>[0][0]])
    assert.equal(r.resoconto('scorsa', LUN).copertura.postaInviata, true)
    // partita dalla casella: non è più una bozza che manca
    db.prepare('UPDATE compiti SET mandata = ? WHERE id = ?').run(JSON.stringify({ doc: 'posta:Sent:1', quando: '2026-09-16T10:00:00.000Z', certezza: 'id', ritocco: 0 }), 'bz1')
    assert.equal(r.resoconto('scorsa', LUN).copertura.bozzeInCasella, 0)
  })
})

test('leggere non scrive', () => {
  chi.dentro(A, () => {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    const file = join(cfg.cartella(), 'mente.db')
    const primaByte = readFileSync(file)
    const primaWal = existsSync(file + '-wal') ? readFileSync(file + '-wal') : Buffer.alloc(0)
    const primaCambi = (db.prepare('SELECT total_changes() AS n').get() as { n: number }).n
    r.resoconto('inizio', LUN); r.resoconto('scorsa', LUN); r.sommario(LUN); r.lunedi(LUN)
    assert.equal((db.prepare('SELECT total_changes() AS n').get() as { n: number }).n, primaCambi)
    assert.ok(readFileSync(file).equals(primaByte))
    assert.ok((existsSync(file + '-wal') ? readFileSync(file + '-wal') : Buffer.alloc(0)).equals(primaWal))
  })
})

test('due conti, due resoconti', () => {
  const a = chi.dentro(A, () => r.resoconto('scorsa', LUN))
  const b = chi.dentro(B, () => r.resoconto('scorsa', LUN))
  assert.equal(a.numeri.mail, 1)
  assert.equal(b.numeri.mail, 1)
  assert.deepEqual(a.voci.filter(v => v.genere === 'mail').map(v => v.chiave), ['compito:m1'])
  assert.deepEqual(b.voci.filter(v => v.genere === 'mail').map(v => v.chiave), ['compito:bz1'])
  const s = chi.dentro(A, () => r.sommario(LUN))
  assert.deepEqual(s.righe.map(x => x.quale), ['scorsa', 'inizio'])
  assert.equal(s.inizio, '2026-09-02T09:00:00.000Z')
})

test("bilancio spento di serie; acceso con una prova finta l'ultimo giorno dalle 6", () => {
  chi.dentro(A, () => {
    assert.equal(r.bilancio(LUN).mostra, false)
    r.usaProva(() => ({ dal: '2026-09-08T08:00:00.000Z', giorni: 14, finisce: '2026-09-22T08:00:00.000Z' }))
    try {
      assert.equal(r.bilancio(new Date('2026-09-22T05:59:00+02:00')).mostra, false)
      const b = r.bilancio(new Date('2026-09-22T06:00:00+02:00'))
      assert.equal(b.mostra, true)
      if (b.mostra) { assert.equal(b.giorni, 14); assert.equal(b.resoconto.numeri.mail, 1) }
      assert.equal(r.bilancio(new Date('2026-09-22T09:00:00Z')).mostra, false)
    } finally { r.usaProva(() => null) }
  })
})

test('adesso finto solo con MYYND_DEV', () => {
  const dev = process.env.MYYND_DEV, ora = process.env.MYYND_ADESSO
  try {
    process.env.MYYND_ADESSO = '2026-09-21T09:00:00+02:00'
    delete process.env.MYYND_DEV
    assert.ok(Math.abs(r.adesso().getTime() - Date.now()) < 5000)
    process.env.MYYND_DEV = '1'
    assert.equal(r.adesso().toISOString(), '2026-09-21T07:00:00.000Z')
    process.env.MYYND_ADESSO = 'boh'
    assert.ok(Math.abs(r.adesso().getTime() - Date.now()) < 5000)
  } finally {
    if (dev === undefined) delete process.env.MYYND_DEV; else process.env.MYYND_DEV = dev
    if (ora === undefined) delete process.env.MYYND_ADESSO; else process.env.MYYND_ADESSO = ora
  }
})
