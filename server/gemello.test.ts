// Il gemello: l'ordine del giro, il sigillo, la chiusura dei giorni, il punteggio.
//
//   node --test server/gemello.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-gemello-'))
process.env.MYYND_DATI = CASA
delete process.env.ANTHROPIC_API_KEY

const conti = await import('./conti.ts')
const chi = await import('./chi.ts')
const cfg = await import('./config.ts')
const store = await import('./store.ts')
const seg = await import('./segnali.ts')
const gem = await import('./gemello.ts')
const progetti = await import('./progetti.ts')
const ordine = await import('./ordine.ts')

let anna = '', bruno = ''
const GIORNO = 86_400_000
const ORA = 3_600_000
/** Le 8 di Roma del 24 settembre 2026. */
const MATTINA = new Date('2026-09-24T06:00:00.000Z')
const POSTA = { host: 'h', porta: 993, utente: 'anna@esempio.it', password: 'x' }

before(async () => {
  const a = await conti.registra('anna@esempio.it', 'passwordlunga1')
  const b = await conti.registra('bruno@esempio.it', 'passwordlunga2')
  assert.ok(a.ok && b.ok); anna = a.ok ? a.id : ''; bruno = b.ok ? b.id : ''
  chi.dentro(anna, () => { cfg.scrivi({ lingua: 'en', fuso: 'Europe/Rome', posta: POSTA }); store.azzeraTutto() })
  chi.dentro(bruno, () => { cfg.scrivi({ lingua: 'en', fuso: 'Europe/Rome' }); store.azzeraTutto() })
})
after(() => { store.chiudiIndici(); rmSync(CASA, { recursive: true, force: true }) })

let n = 0
/** Una mail nell'indice, da `chi`, `quando`; con `dopoMin` anche la risposta mandata. */
function mail(chi: string, nome: string, quando: Date, dopoMin: number | null, richiesta = false) {
  n++
  const docs: Parameters<typeof store.salvaDocumenti>[0] = [{
    id: `posta:INBOX:${n}`, fonte: 'posta', tipo: 'email', titolo: `Mail ${n}${richiesta ? ' can you confirm?' : ''}`, corpo: richiesta ? 'Can you confirm please?' : 'Hello',
    autore: `${nome} <${chi}>`, quando: quando.toISOString(), filo: `f${n}@x`, messageId: `m${n}@x`
  }]
  if (dopoMin !== null) docs.push({
    id: `posta:Sent:${n}`, fonte: 'posta', tipo: 'email', titolo: `Re: Mail ${n}`, corpo: 'Sure', autore: 'Anna <anna@esempio.it>', inviato: true,
    quando: new Date(quando.getTime() + dopoMin * 60_000).toISOString(), filo: `f${n}@x`, messageId: `s${n}@x`, risponde: `m${n}@x`, destinatari: chi
  })
  store.salvaDocumenti(docs)
  return n
}
const prev = () => store.default.prepare('SELECT * FROM previsioni ORDER BY id').all() as { id: string; giorno: string; genere: string; ref: string; esito: string | null; verificata: string | null; dati: string }[]
const azzera = () => { store.azzeraTutto(); store.default.exec('DELETE FROM cursori'); n = 0 }

/** Trenta giorni di storia: Nora sempre risposta in un'ora, Priya mai (ma non nell'ultima settimana, o le sue riempiono il tetto). */
function storia(fino: Date) {
  for (let d = 30; d >= 1; d--) {
    const q = new Date(fino.getTime() - d * GIORNO + 2 * ORA)
    mail('nora@h.example', 'Nora Vance', q, 60)
    if (d >= 8) mail('priya@a.example', 'Priya Shah', q, null, true)
  }
}

test('senza una fonte, o senza documenti recenti, il giro non fa niente', async () => {
  await chi.dentro(bruno, async () => {
    await gem.giro(MATTINA)
    assert.equal(store.cursore('gemello:mattina'), null)
  })
  await chi.dentro(anna, async () => {
    azzera()
    await gem.giro(MATTINA)
    assert.equal(store.cursore('gemello:mattina'), null, 'niente indicizzato: niente giro')
  })
})

test('la mattina prevede (dalle sei), una volta al giorno anche con zero affermazioni; il sigillo tiene fino alle venti', async () => {
  await chi.dentro(anna, async () => {
    azzera()
    storia(MATTINA)
    // le mail di oggi, arrivate alle 7 di Roma: Nora e Priya
    mail('nora@h.example', 'Nora Vance', new Date('2026-09-24T05:00:00.000Z'), null)
    mail('priya@a.example', 'Priya Shah', new Date('2026-09-24T05:00:00.000Z'), null, true)
    await gem.giro(new Date('2026-09-24T03:30:00.000Z'))
    assert.equal(store.cursore('gemello:mattina'), null, 'alle cinque e mezza non è mattina')
    assert.equal(store.cursore('gemello:notte'), '2026-09-24', 'ma la notte sì, dalle tre')
    await gem.giro(MATTINA)
    assert.equal(store.cursore('gemello:mattina'), '2026-09-24')
    const p = prev()
    assert.ok(p.length >= 2, `${p.length} affermazioni`)
    assert.ok(p.some(x => x.genere === 'posta.risponde' && x.ref.endsWith(`posta:INBOX:${n - 1}`)), 'Nora: risponderà')
    assert.ok(p.some(x => x.genere === 'posta.non_risponde' && x.ref.endsWith(`posta:INBOX:${n}`)), 'Priya: non risponderà')
    assert.ok(p.every(x => x.esito === null && x.verificata === null), 'niente si scrive prima che il giorno chiuda')
    // il sigillo
    const v1 = gem.vista(new Date('2026-09-24T17:59:00.000Z'))
    assert.equal(v1.oggi.sigillate, true); assert.equal(v1.oggi.quante, p.length); assert.deepEqual(v1.oggi.previsioni, [])
    // Nora ha risposto alle 10: dalle venti si vede solo quella decisa
    store.salvaDocumenti([{ id: 'posta:Sent:900', fonte: 'posta', tipo: 'email', titolo: 'Re: Mail', corpo: 'ok', autore: 'Anna <anna@esempio.it>', inviato: true, quando: '2026-09-24T08:00:00.000Z', filo: `f${n - 1}@x`, messageId: 's900@x', risponde: `m${n - 1}@x`, destinatari: 'nora@h.example' }])
    seg.raccogliPosta()
    const v2 = gem.vista(new Date('2026-09-24T18:01:00.000Z'))
    assert.equal(v2.oggi.sigillate, false)
    assert.equal(v2.oggi.previsioni.find(x => x.genere === 'posta.risponde')?.esito, 'giusta')
    assert.equal(v2.oggi.previsioni.find(x => x.genere === 'posta.non_risponde')?.esito, null, 'ancora aperta')
    assert.ok(prev().every(x => x.esito === null), 'la sera mostra, non scrive')
    // una seconda mattina nello stesso giorno non aggiunge niente
    const quante = prev().length
    store.default.exec('DELETE FROM previsioni WHERE 0')
    await gem.giro(new Date('2026-09-24T09:00:00.000Z'))
    assert.equal(prev().length, quante)
  })
})

test('il giorno chiude solo dopo una lettura partita dopo la mezzanotte: la risposta delle 23:30 letta alle 08:10 fa giusta la previsione', async () => {
  await chi.dentro(anna, async () => {
    azzera()
    storia(MATTINA)
    const id = mail('nora@h.example', 'Nora Vance', new Date('2026-09-24T05:00:00.000Z'), null)
    await gem.giro(MATTINA)
    assert.ok(prev().some(x => x.genere === 'posta.risponde' && x.ref === `posta.arrivata|posta:INBOX:${id}`))
    // la risposta alle 23:30 di Roma, che l'indice vede solo la mattina dopo
    store.salvaDocumenti([{ id: 'posta:Sent:901', fonte: 'posta', tipo: 'email', titolo: 'Re', corpo: 'ok', autore: 'Anna <anna@esempio.it>', inviato: true, quando: '2026-09-24T21:30:00.000Z', filo: `f${id}@x`, messageId: 's901@x', risponde: `m${id}@x`, destinatari: 'nora@h.example' }])
    // il giro delle 00:40 del 25, senza una lettura dopo mezzanotte: il giorno resta aperto
    gem.dopoLaLettura('2026-09-24T20:00:00.000Z', true)
    await gem.giro(new Date('2026-09-24T22:40:00.000Z'))
    assert.ok(prev().every(x => x.verificata === null), 'nessuna lettura dopo la mezzanotte: ancora aperto')
    assert.equal(gem.vista(new Date('2026-09-24T22:40:00.000Z')).ieri?.chiuso, false)
    // la lettura delle 08:10 del 25 con la posta a posto
    gem.dopoLaLettura('2026-09-25T06:10:00.000Z', true)
    await gem.giro(new Date('2026-09-25T06:15:00.000Z'))
    const r = prev().find(x => x.ref === `posta.arrivata|posta:INBOX:${id}`)!
    assert.equal(r.esito, 'giusta'); assert.ok(r.verificata)
    const punteggio = store.default.prepare("SELECT * FROM punteggi WHERE giorno = '2026-09-24'").get() as { giuste: number; sbagliate: number; annullate: number; base: number; brier: number }
    assert.ok(punteggio); assert.ok(punteggio.giuste >= 1)
    assert.equal(punteggio.base, prev().filter(x => x.giorno === '2026-09-24' && JSON.parse(x.dati).base === true).length, 'la base sulle stesse affermazioni')
    const v = gem.vista(new Date('2026-09-25T06:20:00.000Z'))
    assert.equal(v.ieri?.chiuso, true); assert.equal(v.ieri?.giorno, '2026-09-24'); assert.ok(v.ieri!.giuste >= 1)
    assert.ok(v.punteggio && v.punteggio.totale >= 1 && v.punteggio.base <= v.punteggio.totale)
    // una lettura con la posta rotta non chiude niente
    azzera(); storia(MATTINA)
    mail('nora@h.example', 'Nora Vance', new Date('2026-09-24T05:00:00.000Z'), null)
    await gem.giro(MATTINA)
    gem.dopoLaLettura('2026-09-25T06:10:00.000Z', false)
    await gem.giro(new Date('2026-09-25T06:15:00.000Z'))
    assert.ok(prev().every(x => x.verificata === null), 'la posta era rotta: il giorno resta aperto')
  })
})

test('la posta è letta bene solo se ogni casella è arrivata in fondo: una lettura del solo calendario, una fermata o una rotta non chiudono il giorno', async () => {
  const ok = (fasi: { fase?: string; stato?: string }[], collegate = ['posta'], fermata = false) => gem.postaLettaBene({ fasi, collegate, fermata })
  assert.equal(ok([{ fase: 'posta', stato: 'fatto' }]), true)
  assert.equal(ok([{ fase: 'posta', stato: 'mi collego alla casella' }, { fase: 'posta', stato: 'fatto' }]), true)
  assert.equal(ok([{ fase: 'calendario', stato: 'fatto' }]), false, 'una fonte sola che non è la posta')
  assert.equal(ok([]), false, 'una lettura che ha lanciato prima della posta')
  assert.equal(ok([{ fase: 'posta', stato: 'guaio' }]), false)
  assert.equal(ok([{ fase: 'posta', stato: 'fatto' }], ['posta'], true), false, 'fermata')
  assert.equal(ok([{ fase: 'google', stato: 'fatto' }], ['posta', 'google']), false, 'due caselle, una sola letta')
  assert.equal(ok([{ fase: 'google', stato: 'fatto' }, { fase: 'posta', stato: 'fatto' }], ['posta', 'google']), true)
  assert.equal(ok([{ fase: 'posta', stato: 'fatto' }], []), false, 'senza caselle non c\'è posta da leggere')
  assert.deepEqual(gem.casellePostali({ posta: {}, google: {}, microsoft: { parti: ['agenda'] } }), ['posta', 'google'])
  assert.deepEqual(gem.casellePostali({ microsoft: { parti: ['posta'] } }), ['microsoft'])
  // dal vivo: una lettura del solo calendario dopo la mezzanotte non chiude il giorno
  await chi.dentro(anna, async () => {
    azzera(); storia(MATTINA)
    mail('nora@h.example', 'Nora Vance', new Date('2026-09-24T05:00:00.000Z'), null)
    await gem.giro(MATTINA)
    gem.dopoLaLettura('2026-09-25T06:05:00.000Z', gem.postaLettaBene({ fasi: [{ fase: 'calendario', stato: 'fatto' }], collegate: gem.casellePostali(cfg.leggi()), fermata: false }))
    await gem.giro(new Date('2026-09-25T06:15:00.000Z'))
    assert.ok(prev().every(x => x.verificata === null), 'il calendario da solo non dice niente della posta')
    gem.dopoLaLettura('2026-09-25T06:20:00.000Z', gem.postaLettaBene({ fasi: [{ fase: 'calendario', stato: 'fatto' }, { fase: 'posta', stato: 'fatto' }], collegate: gem.casellePostali(cfg.leggi()), fermata: false }))
    await gem.giro(new Date('2026-09-25T06:25:00.000Z'))
    assert.ok(prev().filter(x => x.giorno === '2026-09-24').every(x => x.verificata), 'con la posta letta il giorno chiude')
  })
})

test('a D + 2 giorni 12:00 senza lettura le affermazioni sulla posta si annullano; senza casella il giorno chiude subito', async () => {
  await chi.dentro(anna, async () => {
    azzera(); storia(MATTINA)
    mail('nora@h.example', 'Nora Vance', new Date('2026-09-24T05:00:00.000Z'), null)
    await gem.giro(MATTINA)
    await gem.giro(new Date('2026-09-26T09:59:00.000Z'))
    assert.ok(prev().every(x => x.verificata === null))
    await gem.giro(new Date('2026-09-26T10:01:00.000Z'))
    const p = prev().filter(x => x.giorno === '2026-09-24')
    assert.ok(p.length && p.every(x => x.verificata))
    assert.ok(p.filter(x => x.genere.startsWith('posta.')).every(x => x.esito === 'annullata'))
    assert.equal((store.default.prepare("SELECT annullate FROM punteggi WHERE giorno = '2026-09-24'").get() as { annullate: number }).annullate, p.filter(x => x.genere.startsWith('posta.')).length)
  })
  // senza una casella: i compiti chiudono al primo giro del giorno dopo
  await chi.dentro(anna, async () => {
    azzera()
    // la casella se ne va davvero: `scrivi` conserva le credenziali se non glielo si dice
    cfg.scrivi({ lingua: 'en', fuso: 'Europe/Rome', desktop: { cartelle: [CASA], scelte: true } }, { togli: ['posta'] })
    assert.equal(cfg.leggi().posta, undefined)
    store.salvaDocumenti([{ id: 'file:1', fonte: 'desktop', tipo: 'file', titolo: 'x', corpo: 'x', quando: '2026-09-23T10:00:00.000Z' }])
    for (let i = 0; i < 6; i++) {
      const g = `2026-09-${String(10 + i).padStart(2, '0')}`
      store.scriviCompito({ id: `s${i}`, testo: `Storia ${i}`, quando: 'oggi', ordine: ordine.dopo(store.ultimoOrdine('oggi')), giorno: g })
      if (i < 4) store.default.prepare("UPDATE compiti SET stato = 'fatto', chiuso = ? WHERE id = ?").run(`${g}T15:00:00.000Z`, `s${i}`)
    }
    store.scriviCompito({ id: 'c1', testo: 'Reply to Apple', quando: 'oggi', ordine: ordine.dopo(store.ultimoOrdine('oggi')), giorno: '2026-09-24' })
    store.default.prepare("UPDATE compiti SET priorita = 'alta', stato = 'pronto' WHERE id = 'c1'").run()
    store.scriviCompito({ id: 'c2', testo: 'Old thing', quando: 'oggi', ordine: ordine.dopo(store.ultimoOrdine('oggi')), giorno: '2026-09-24' })
    store.default.prepare("UPDATE compiti SET creato = '2026-09-01T00:00:00.000Z' WHERE id = 'c2'").run()
    await gem.giro(MATTINA)
    const p = prev()
    assert.ok(p.some(x => x.genere === 'compito.chiude' && x.ref === 'c1'), JSON.stringify(p))
    assert.ok(p.some(x => x.genere === 'compito.slitta' && x.ref === 'c2'))
    store.cambiaStatoCompito('c1', 'fatto')
    store.default.prepare("UPDATE compiti SET chiuso = '2026-09-24T15:00:00.000Z' WHERE id = 'c1'").run()
    await gem.giro(new Date('2026-09-25T00:30:00.000Z'))
    const dopo = prev()
    assert.equal(dopo.find(x => x.ref === 'c1')?.esito, 'giusta')
    assert.equal(dopo.find(x => x.ref === 'c2')?.esito, 'giusta', 'rimandata davvero')
    assert.equal(JSON.parse(dopo.find(x => x.ref === 'c1')!.dati).base, true, 'la base «le pianificate chiudono» ci prende')
    assert.equal(JSON.parse(dopo.find(x => x.ref === 'c2')!.dati).base, false)
    cfg.scrivi({ lingua: 'en', fuso: 'Europe/Rome', posta: POSTA })
  })
})

test('il progetto del giorno: dai minuti; senza minuti la previsione si annulla', async () => {
  await chi.dentro(anna, async () => {
    azzera()
    const nw = progetti.scrivi({ nome: 'Northwind', obiettivo: 'Ship' })
    const hb = progetti.scrivi({ nome: 'Harbor Labs', obiettivo: 'Pilot' })
    store.salvaDocumenti([{ id: 'file:1', fonte: 'desktop', tipo: 'file', titolo: 'x', corpo: 'x', quando: '2026-09-23T10:00:00.000Z' }])
    const ins = store.default.prepare('INSERT INTO sessioni_app (bundle, app, titolo, inizio, fine, secondi, giorno, progetto, cartella) VALUES (?,?,?,?,?,?,?,?,?)')
    for (let i = 1; i <= 5; i++) {
      const g = `2026-09-${String(24 - i).padStart(2, '0')}`
      ins.run('com.apple.Safari', 'Safari', null, `${g}T07:00:00.000Z`, `${g}T09:00:00.000Z`, 7200, g, nw.id, null)
      ins.run('com.apple.Safari', 'Safari', null, `${g}T10:00:00.000Z`, `${g}T10:30:00.000Z`, 1800, g, hb.id, null)
    }
    await gem.giro(MATTINA)
    const p = prev().find(x => x.genere === 'progetto.del_giorno')!
    assert.ok(p); assert.equal(p.ref, nw.id); assert.equal(JSON.parse(p.dati).ieri, nw.id)
    // oggi lavora su Harbor
    ins.run('com.apple.Safari', 'Safari', null, '2026-09-24T07:00:00.000Z', '2026-09-24T09:00:00.000Z', 7200, '2026-09-24', hb.id, null)
    assert.equal(gem.minutiProgetto('2026-09-24').get(hb.id), 120)
    gem.dopoLaLettura('2026-09-25T00:30:00.000Z', true)
    await gem.giro(new Date('2026-09-25T06:00:00.000Z'))
    const v = prev().find(x => x.genere === 'progetto.del_giorno' && x.giorno === '2026-09-24')!
    assert.equal(v.esito, 'sbagliata'); assert.equal(JSON.parse(v.dati).vero, hb.id); assert.equal(JSON.parse(v.dati).base, false)
    // il giorno dopo, senza minuti: annullata
    const p2 = prev().find(x => x.genere === 'progetto.del_giorno' && x.giorno === '2026-09-25')!
    assert.ok(p2)
    gem.dopoLaLettura('2026-09-26T00:30:00.000Z', true)
    await gem.giro(new Date('2026-09-26T06:00:00.000Z'))
    assert.equal(prev().find(x => x.id === p2.id)!.esito, 'annullata')
  })
})

test('due conti non si vedono; la fiducia si ricalcola idempotente e «già fatta» conta giusta', async () => {
  await chi.dentro(anna, async () => {
    azzera()
    store.salvaDocumenti([{ id: 'file:1', fonte: 'desktop', tipo: 'file', titolo: 'x', corpo: 'x', quando: '2026-09-23T10:00:00.000Z' }])
    store.default.prepare("INSERT INTO previsioni (id, giorno, genere, ref, probabilita, dati, fatta, esito, verificata) VALUES ('x','2026-09-20','posta.risponde','r',0.8,'{}','x','giusta','x')").run()
    const insFeed = store.default.prepare("INSERT INTO feed (id, tipo, titolo, testo, stato, quando, ragione, vista, risposto) VALUES (?,?,?,?,?,?,?,?,?)")
    insFeed.run('f1', 'Priorità', 'a', '', 'scartato', '2026-09-20T10:00:00.000Z', 'fatta', '2026-09-20T10:00:00.000Z', '2026-09-20T11:00:00.000Z')
    insFeed.run('f2', 'Priorità', 'b', '', 'scartato', '2026-09-20T10:00:00.000Z', 'vecchia', '2026-09-20T10:00:00.000Z', '2026-09-20T11:00:00.000Z')
    insFeed.run('f3', 'Priorità', 'c', '', 'scaduto', '2026-09-20T10:00:00.000Z', 'tetto', null, '2026-09-20T11:00:00.000Z')
    insFeed.run('f4', 'Priorità', 'd', '', 'fatto', '2026-09-20T10:00:00.000Z', 'lui', '2026-09-20T10:00:00.000Z', '2026-09-20T11:00:00.000Z')
    // le carte sulla mail a cui ha poi risposto dalla posta: aperta con la risposta dopo la carta → giusta;
    // scaduta con la risposta prima della carta → giusta (era una carta giusta arrivata tardi); aperta senza risposta → non conta
    const arrivata = (k: string) => seg.scrivi({ id: `posta.arrivata|posta:INBOX:${k}`, genere: 'posta.arrivata', quando: '2026-09-20T09:00:00.000Z', chi: 'nora@h.example', ref: `posta:INBOX:${k}`, dati: { messageId: `m${k}@x`, filo: `f${k}`, nome: 'Nora', titolo: 'Piano', richiesta: false } })
    const risposta = (k: string, quando: string) => seg.scrivi({ id: `posta.inviata|posta:Sent:${k}`, genere: 'posta.inviata', quando, chi: 'nora@h.example', ref: `posta:Sent:${k}`, dati: { messageId: `s${k}@x`, risponde: `m${k}@x`, filo: `f${k}`, destinatari: ['nora@h.example'] } })
    arrivata('f5'); risposta('f5', '2026-09-20T14:00:00.000Z')
    arrivata('f6'); risposta('f6', '2026-09-20T09:30:00.000Z')
    arrivata('f7')
    const insCarta = store.default.prepare("INSERT INTO feed (id, tipo, titolo, testo, stato, quando, ragione, vista, doc) VALUES (?,?,?,?,?,?,?,?,?)")
    insCarta.run('f5', 'Priorità', 'e', '', 'aperto', '2026-09-20T10:00:00.000Z', null, '2026-09-20T10:00:00.000Z', 'posta:INBOX:f5')
    insCarta.run('f6', 'Priorità', 'f', '', 'scaduto', '2026-09-20T10:00:00.000Z', 'tempo', '2026-09-20T10:00:00.000Z', 'posta:INBOX:f6')
    insCarta.run('f7', 'Priorità', 'g', '', 'aperto', '2026-09-20T10:00:00.000Z', null, null, 'posta:INBOX:f7')
    store.default.prepare("INSERT INTO misure_compiti (compito, affidato, classe, inviato) VALUES ('c1','x','ritocco','2026-09-20T10:00:00.000Z'), ('c2','x','riscritto','2026-09-20T10:00:00.000Z')").run()
    gem.bozzaTenuta({ id: 'd1', risultato: 'Hello Nora, the plan is ready.' }, 'Hello Nora, the plan is ready.', new Date('2026-09-20T12:00:00.000Z'))
    gem.bozzaTenuta({ id: 'd2', risultato: 'Hello Nora, the plan is ready.' }, 'Dear Nora, everything changed completely today.', new Date('2026-09-20T12:00:01.000Z'))
    gem.perProva.ricalcolaFiducia(MATTINA)
    gem.perProva.ricalcolaFiducia(MATTINA)
    const f = Object.fromEntries((store.default.prepare('SELECT genere, giuste, sbagliate, gradino FROM fiducia').all() as { genere: string; giuste: number; sbagliate: number; gradino: string }[]).map(r => [r.genere, r]))
    assert.deepEqual([f['feed.carta']!.giuste, f['feed.carta']!.sbagliate], [4, 1], 'già fatta, fatto e le due risposte dalla posta sono giuste; vecchia sbagliata; tetto e l’aperta senza risposta non contano')
    assert.deepEqual([f['bozza.email']!.giuste, f['bozza.email']!.sbagliate], [1, 1])
    assert.deepEqual([f['bozza.documento']!.giuste, f['bozza.documento']!.sbagliate], [1, 1])
    assert.deepEqual([f['previsione.posta']!.giuste, f['previsione.posta']!.sbagliate], [1, 0])
    assert.ok(Object.values(f).every(r => r.gradino === 'guarda'), 'il gradino non si tocca')
    assert.equal(Object.keys(f).length, 6)
    store.default.exec("DELETE FROM segnali WHERE genere LIKE 'posta.%'")
  })
  await chi.dentro(bruno, async () => {
    assert.equal(prev().length, 0)
    assert.equal((store.default.prepare('SELECT COUNT(*) AS n FROM fiducia').get() as { n: number }).n, 0)
    assert.equal(gem.vista(MATTINA).punteggio, null)
  })
})

test('punteggio per P9, misura, e la riga «non vedo la posta che mandi»', async () => {
  await chi.dentro(anna, async () => {
    const p = gem.punteggio({ dal: '2026-09-01', al: '2026-09-30' })
    assert.deepEqual(p, { giuste: 1, sbagliate: 0, base: 0, giorni: 1 })
    assert.equal(gem.punteggio({ dal: '2020-01-01', al: '2020-01-31' }), null)
    const m = gem.misura(30, new Date('2026-09-25T06:00:00.000Z'))
    assert.equal(m.affermazioni, 1); assert.equal(m.punteggio, 1); assert.equal(m.calibrazione.length, 5)
    // la riga fissa si mostra solo a registro in pari: il giro lo porta in pari a ogni quarto d'ora
    seg.raccogliPosta(MATTINA)
    const v = gem.vista(MATTINA)
    assert.deepEqual(v.guai, ['posta-inviata'], 'casella collegata e niente posta mandata')
  })
})

test('col registro della posta indietro il giorno non chiude e la mattina aspetta: una lettura che indicizza 9.000 mail prima della risposta delle 23:30', async () => {
  await chi.dentro(anna, async () => {
    azzera(); storia(MATTINA)
    const id = mail('nora@h.example', 'Nora Vance', new Date('2026-09-24T05:00:00.000Z'), null)
    await gem.giro(MATTINA)
    assert.ok(prev().some(x => x.genere === 'posta.risponde' && x.ref === `posta.arrivata|posta:INBOX:${id}`))
    // la lettura del 25 alle 06:10 legge una casella nuova (9.000 mail vecchie: la lettura stessa ne mette nel registro
    // quattromila, il giro dopo altre quattromila, e non basta) e in fondo la risposta delle 23:30
    const vecchie = [...Array(9000)].map((_, i) => ({
      // di giugno: la potatura della notte toglie la posta di più di centottanta giorni, e qui si contano tutte
      id: `posta:Archivio:${i}`, fonte: 'posta', tipo: 'email', titolo: `Vecchia ${i}`, corpo: 'x', autore: `p${i % 40}@vecchio.example`,
      quando: new Date(Date.parse('2026-06-01T00:00:00.000Z') + i * 60_000).toISOString()
    }))
    for (let i = 0; i < vecchie.length; i += 1500) store.salvaDocumenti(vecchie.slice(i, i + 1500))
    store.salvaDocumenti([{ id: 'posta:Sent:902', fonte: 'posta', tipo: 'email', titolo: 'Re', corpo: 'ok', autore: 'Anna <anna@esempio.it>', inviato: true, quando: '2026-09-24T21:30:00.000Z', filo: `f${id}@x`, messageId: 's902@x', risponde: `m${id}@x`, destinatari: 'nora@h.example' }])
    gem.dopoLaLettura('2026-09-25T06:10:00.000Z', true)
    assert.equal(store.cursore('gemello:letta'), null, 'la lettura resta in attesa finché il registro non è in pari')
    assert.equal(store.cursore('gemello:letta:attesa'), '2026-09-25T06:10:00.000Z')
    // il giro delle 08:40: il registro cammina di quattromila al massimo, la risposta non c'è ancora
    await gem.giro(new Date('2026-09-25T06:40:00.000Z'))
    const aperta = prev().find(x => x.ref === `posta.arrivata|posta:INBOX:${id}`)!
    assert.equal(aperta.verificata, null, 'il giorno non chiude con il registro indietro: la risposta non conterebbe')
    assert.equal(aperta.esito, null)
    assert.ok(prev().every(x => x.giorno !== '2026-09-25'), 'la mattina aspetta: niente affermazioni su una posta a metà')
    assert.notEqual(store.cursore('gemello:mattina'), '2026-09-25')
    // i giri dopo portano il registro in pari: il giorno chiude giusto, e la mattina fa le sue
    for (let i = 1; i <= 12 && store.cursore('gemello:mattina') !== '2026-09-25'; i++) await gem.giro(new Date(Date.parse('2026-09-25T06:40:00.000Z') + i * 15 * 60_000))
    assert.equal(store.cursore('gemello:letta'), '2026-09-25T06:10:00.000Z')
    assert.equal(store.cursore('gemello:letta:attesa'), null)
    const chiusa = prev().find(x => x.ref === `posta.arrivata|posta:INBOX:${id}`)!
    assert.equal(chiusa.esito, 'giusta'); assert.ok(chiusa.verificata)
    assert.equal(store.cursore('gemello:mattina'), '2026-09-25')
    assert.equal((store.default.prepare("SELECT COUNT(*) AS n FROM segnali WHERE genere = 'posta.arrivata' AND ref LIKE 'posta:Archivio:%'").get() as { n: number }).n, 9000)
  })
})

test('una risposta mandata prima dell’affermazione ma indicizzata dopo annulla l’affermazione: la mail era già chiusa', async () => {
  await chi.dentro(anna, async () => {
    azzera(); storia(MATTINA)
    // Nora scrive alle 05:00 di Roma; la risposta parte alle 07:50, prima delle otto in cui si afferma, ma l'indice la vede solo dopo
    const id = mail('nora@h.example', 'Nora Vance', new Date('2026-09-24T03:00:00.000Z'), null)
    await gem.giro(MATTINA)
    assert.ok(prev().some(x => x.genere === 'posta.risponde' && x.ref === `posta.arrivata|posta:INBOX:${id}`))
    store.salvaDocumenti([{ id: 'posta:Sent:903', fonte: 'posta', tipo: 'email', titolo: 'Re', corpo: 'ok', autore: 'Anna <anna@esempio.it>', inviato: true, quando: '2026-09-24T05:50:00.000Z', filo: `f${id}@x`, messageId: 's903@x', risponde: `m${id}@x`, destinatari: 'nora@h.example' }])
    seg.raccogliPosta()
    // la sera: «non conta», non «giusta»
    assert.equal(gem.vista(new Date('2026-09-24T18:01:00.000Z')).oggi.previsioni.find(x => x.genere === 'posta.risponde')?.esito, 'annullata')
    gem.dopoLaLettura('2026-09-25T06:10:00.000Z', true)
    await gem.giro(new Date('2026-09-25T06:15:00.000Z'))
    const r = prev().find(x => x.ref === `posta.arrivata|posta:INBOX:${id}`)!
    assert.equal(r.esito, 'annullata'); assert.ok(r.verificata)
    const p = store.default.prepare("SELECT * FROM punteggi WHERE giorno = '2026-09-24'").get() as { annullate: number }
    assert.ok(p.annullate >= 1)
    // il caso normale resta: una risposta dopo l'affermazione fa «giusta»
    azzera(); storia(MATTINA)
    const id2 = mail('nora@h.example', 'Nora Vance', new Date('2026-09-24T03:00:00.000Z'), null)
    await gem.giro(MATTINA)
    store.salvaDocumenti([{ id: 'posta:Sent:904', fonte: 'posta', tipo: 'email', titolo: 'Re', corpo: 'ok', autore: 'Anna <anna@esempio.it>', inviato: true, quando: '2026-09-24T08:00:00.000Z', filo: `f${id2}@x`, messageId: 's904@x', risponde: `m${id2}@x`, destinatari: 'nora@h.example' }])
    gem.dopoLaLettura('2026-09-25T06:10:00.000Z', true)
    await gem.giro(new Date('2026-09-25T06:15:00.000Z'))
    assert.equal(prev().find(x => x.ref === `posta.arrivata|posta:INBOX:${id2}`)!.esito, 'giusta')
  })
})

test('le misure: un giorno è attivo con almeno cinque candidate, il Brier sta giorno per giorno, e la riga di registro le riassume', async () => {
  await chi.dentro(anna, async () => {
    azzera()
    const ins = store.default.prepare('INSERT INTO previsioni (id, giorno, genere, ref, probabilita, dati, fatta, esito, verificata) VALUES (?,?,?,?,?,?,?,?,?)')
    // un giorno con due candidate e due affermazioni: non è attivo
    ins.run('a1', '2026-09-20', 'posta.risponde', 'r1', 0.8, JSON.stringify({ candidati: 2, base: false }), 'x', 'giusta', 'x')
    ins.run('a2', '2026-09-20', 'posta.non_risponde', 'r2', 0.7, JSON.stringify({ candidati: 2, base: true }), 'x', 'giusta', 'x')
    // un giorno con sette candidate e cinque affermazioni: attivo, con cinque
    for (let i = 0; i < 5; i++) ins.run(`b${i}`, '2026-09-21', 'posta.risponde', `s${i}`, 0.9, JSON.stringify({ candidati: 7, base: false, spinta: i === 0 ? 'carta' : null }), 'x', i < 4 ? 'giusta' : 'sbagliata', 'x')
    // un giorno con sei candidate e tre affermazioni (due annullate non contano): attivo, senza cinque
    for (let i = 0; i < 3; i++) ins.run(`c${i}`, '2026-09-22', 'compito.chiude', `t${i}`, 0.6, JSON.stringify({ candidati: 6, base: true }), 'x', i === 0 ? 'annullata' : 'giusta', 'x')
    store.default.prepare('INSERT INTO punteggi (giorno, giuste, sbagliate, annullate, brier, base, calcolato) VALUES (?,?,?,?,?,?,?)').run('2026-09-21', 4, 1, 0, 0.12, 0, 'x')
    const m = gem.misura(30, new Date('2026-09-25T06:00:00.000Z'))
    assert.equal(m.affermazioni, 10); assert.equal(m.annullate, 1)
    assert.equal(m.giorniAttivi, 2, 'il 21 e il 22, non il 20')
    assert.equal(m.perGiorno, 4, '(5 + 3) su due giorni attivi')
    assert.equal(m.quotaGiorniConCinque, 0.5)
    assert.deepEqual(m.perGenere['posta.risponde'], { n: 6, giuste: 5, base: 0 })
    assert.deepEqual(m.spinta.con, { n: 1, giuste: 1 })
    assert.deepEqual(m.giorniChiusi.map(g => [g.giorno, g.brier]), [['2026-09-21', 0.12]])
    const riga = gem.rigaMisura(m)
    assert.match(riga, /30 giorni · 10 affermazioni · giuste \d+% · senza conoscerti \d+% · 2 giorni attivi, 4\.0 al giorno, 50% con cinque · brier 0\.\d\d/)
    assert.doesNotMatch(riga, /[—–]/)
  })
})

test('col registro indietro la notte aspetta: niente gemello:notte e nessuna riga di «Come lavori» contata su metà posta', async () => {
  await chi.dentro(anna, async () => {
    azzera()
    const doc = (id: string, autore: string, quando: Date, x: Record<string, unknown> = {}) =>
      ({ id, fonte: 'posta', tipo: 'email', titolo: `Mail ${id}`, corpo: 'Hello', autore, quando: quando.toISOString(), ...x })
    // nell'ordine dell'indice: le quaranta mail di Nora e tre di Sam con risposta, poi cinquemila mail
    // vecchie, e in fondo le quaranta risposte a Nora: a metà registro Nora sembra lasciata senza risposta
    const prime: Record<string, unknown>[] = []
    for (let d = 40; d >= 1; d--) prime.push(doc(`posta:INBOX:n${d}`, 'Nora Vance <nora@h.example>', new Date(MATTINA.getTime() - d * GIORNO + 2 * ORA), { filo: `fn${d}@x`, messageId: `mn${d}@x` }))
    for (let d = 42; d >= 40; d--) {
      const q = new Date(MATTINA.getTime() - d * GIORNO + 2 * ORA)
      prime.push(doc(`posta:INBOX:s${d}`, 'Sam Ortiz <sam@l.example>', q, { filo: `fs${d}@x`, messageId: `ms${d}@x` }))
      prime.push(doc(`posta:Sent:s${d}`, 'Anna <anna@esempio.it>', new Date(q.getTime() + ORA), { inviato: true, filo: `fs${d}@x`, messageId: `ss${d}@x`, risponde: `ms${d}@x`, destinatari: 'sam@l.example' }))
    }
    store.salvaDocumenti(prime as Parameters<typeof store.salvaDocumenti>[0])
    const vecchie = [...Array(5000)].map((_, i) => doc(`posta:Vecchie:${i}`, `p${i % 40}@vecchio.example`, new Date(Date.parse('2026-07-01T00:00:00.000Z') + i * 60_000)))
    for (let i = 0; i < vecchie.length; i += 1500) store.salvaDocumenti(vecchie.slice(i, i + 1500) as Parameters<typeof store.salvaDocumenti>[0])
    const risposte: Record<string, unknown>[] = []
    for (let d = 40; d >= 1; d--) risposte.push(doc(`posta:Sent:n${d}`, 'Anna <anna@esempio.it>', new Date(MATTINA.getTime() - d * GIORNO + 3 * ORA), { inviato: true, filo: `fn${d}@x`, messageId: `sn${d}@x`, risponde: `mn${d}@x`, destinatari: 'nora@h.example' }))
    store.salvaDocumenti(risposte as Parameters<typeof store.salvaDocumenti>[0])
    const righe = () => store.default.prepare('SELECT chiave, genere FROM abitudini').all() as { chiave: string; genere: string }[]
    await gem.giro(MATTINA)
    assert.ok(seg.postaDaRipassare(), 'il primo giro non arriva in fondo a cinquemila mail')
    assert.equal(store.cursore('gemello:notte'), null, 'la notte aspetta il registro in pari')
    assert.deepEqual(righe(), [], 'nessuna riga contata su metà posta')
    assert.equal((store.default.prepare('SELECT COUNT(*) AS n FROM fiducia').get() as { n: number }).n, 0, 'nemmeno la fiducia si conta su metà posta')
    // i giri dopo portano il registro in pari: la notte fa le sue, e Nora è una a cui risponde sempre
    for (let i = 1; i <= 12 && store.cursore('gemello:notte') !== '2026-09-24'; i++) await gem.giro(new Date(MATTINA.getTime() + i * 15 * 60_000))
    assert.equal(store.cursore('gemello:notte'), '2026-09-24')
    assert.ok(!seg.postaDaRipassare())
    assert.ok(righe().some(r => r.chiave === 'posta.risponde_sempre:nora@h.example'), JSON.stringify(righe()))
    assert.ok(!righe().some(r => r.genere === 'posta.lascia'), 'mai «resta senza risposta» su Nora')
  })
})

test('«non vedo la posta che mandi» tace finché il registro cammina, e compare solo a registro in pari', async () => {
  await chi.dentro(anna, async () => {
    azzera()
    const doc = (id: string, autore: string, quando: Date, x: Record<string, unknown> = {}) =>
      ({ id, fonte: 'posta', tipo: 'email', titolo: `Mail ${id}`, corpo: 'Hello', autore, quando: quando.toISOString(), ...x })
    const semina = (quante: number) => {
      const molte = [...Array(quante)].map((_, i) => doc(`posta:Molte:${i}`, `p${i % 40}@molte.example`, new Date(MATTINA.getTime() - 20 * GIORNO + i * 60_000)))
      for (let i = 0; i < molte.length; i += 1500) store.salvaDocumenti(molte.slice(i, i + 1500) as Parameters<typeof store.salvaDocumenti>[0])
    }
    semina(6000)
    // la cartella Sent arriva in fondo all'indice: cinquanta risposte mandate ieri
    store.salvaDocumenti([...Array(50)].map((_, i) => doc(`posta:Sent:${i}`, 'Anna <anna@esempio.it>', new Date(MATTINA.getTime() - GIORNO + i * 60_000), { inviato: true, destinatari: `p${i}@molte.example` })) as Parameters<typeof store.salvaDocumenti>[0])
    let r = seg.raccogliPosta(MATTINA)
    assert.equal(r.finito, false)
    assert.deepEqual(gem.vista(MATTINA).guai, [], 'il registro è indietro: la riga fissa non compare')
    for (let i = 0; i < 12 && !r.finito; i++) r = seg.raccogliPosta(MATTINA)
    assert.ok(r.finito)
    assert.deepEqual(gem.vista(MATTINA).guai, [], 'in pari, e la posta mandata c’è')
    // senza posta mandata: zitta finché cammina, poi la riga
    azzera(); semina(4500)
    r = seg.raccogliPosta(MATTINA)
    assert.equal(r.finito, false)
    assert.deepEqual(gem.vista(MATTINA).guai, [])
    for (let i = 0; i < 12 && !r.finito; i++) r = seg.raccogliPosta(MATTINA)
    assert.ok(r.finito)
    assert.deepEqual(gem.vista(MATTINA).guai, ['posta-inviata'])
  })
})

test('la conservazione delle osservazioni non aspetta una fonte: senza fonti, una sessione di trentun giorni perde il titolo lo stesso', async () => {
  await chi.dentro(bruno, async () => {
    store.default.exec('DELETE FROM sessioni_app; DELETE FROM cursori')
    const ins = store.default.prepare('INSERT INTO sessioni_app (bundle, app, titolo, inizio, fine, secondi, giorno, progetto, cartella) VALUES (?,?,?,?,?,?,?,?,?)')
    const vecchio = new Date(MATTINA.getTime() - 31 * GIORNO).toISOString().slice(0, 10)
    const recente = new Date(MATTINA.getTime() - 2 * GIORNO).toISOString().slice(0, 10)
    ins.run('com.apple.Safari', 'Safari', 'Northwind pricing - Google Docs', `${vecchio}T07:00:00.000Z`, `${vecchio}T07:10:00.000Z`, 600, vecchio, null, null)
    ins.run('com.apple.Safari', 'Safari', 'Inbox - Gmail', `${recente}T07:00:00.000Z`, `${recente}T07:10:00.000Z`, 600, recente, null, null)
    await gem.giro(MATTINA)
    assert.equal(store.cursore('gemello:mattina'), null, 'senza fonti il resto del giro non parte')
    assert.equal(store.cursore('gemello:notte'), null)
    assert.equal(store.cursore('gemello:conserva'), '2026-09-24')
    const titoli = (store.default.prepare('SELECT giorno, titolo FROM sessioni_app ORDER BY giorno').all() as { giorno: string; titolo: string | null }[]).map(r => [r.giorno, r.titolo])
    assert.deepEqual(titoli, [[vecchio, null], [recente, 'Inbox - Gmail']])
    store.default.exec('DELETE FROM sessioni_app')
  })
})
