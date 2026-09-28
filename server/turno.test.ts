// Il turno (F2): le regole di quando tocca a una carta, e il turno che le fa
// partire da solo, una dopo l'altra, dentro il suo tetto.
//
//   node --test server/turno.test.ts

import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-turno-'))
process.env.MYYND_DATI = CASA

const store = await import('./store.ts')
const cfg = await import('./config.ts')
const regole = await import('./turno-regole.ts')
const turno = await import('./turno.ts')
const compiti = await import('./compiti.ts')

before(() => { store.azzeraTutto(); cfg.aggiorna({ lingua: 'en' }) })
after(() => {
  turno.perProva(null)
  compiti.perProva(null)
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

/** Un'ora locale di un giorno fisso: lunedì 28 settembre 2026. */
const alle = (h: number, m = 0, giorno = 28) => new Date(2026, 8, giorno, h, m, 0, 0)
const NOTTE = regole.NOTTE_DI_SERIE

test('la notte che scavalca la mezzanotte, e una notte dentro il giorno', () => {
  assert.equal(regole.inNotte(alle(23), NOTTE), true)
  assert.equal(regole.inNotte(alle(0, 30), NOTTE), true)
  assert.equal(regole.inNotte(alle(6, 59), NOTTE), true)
  assert.equal(regole.inNotte(alle(7), NOTTE), false)
  assert.equal(regole.inNotte(alle(21, 59), NOTTE), false)
  assert.equal(regole.inNotte(alle(14), { da: '13:00', a: '15:00' }), true)
  assert.equal(regole.inNotte(alle(15), { da: '13:00', a: '15:00' }), false)
})

test('la giornata del turno comincia alla fine della notte; la prossima notte, e l’ultima', () => {
  assert.equal(regole.inizioGiornata(alle(6), NOTTE).getTime(), alle(7, 0, 27).getTime())
  assert.equal(regole.inizioGiornata(alle(8), NOTTE).getTime(), alle(7).getTime())
  assert.equal(regole.prossimaNotte(alle(20), NOTTE)?.getTime(), alle(22).getTime())
  assert.equal(regole.prossimaNotte(alle(23), NOTTE), null)
  assert.equal(regole.inizioUltimaNotte(alle(9), NOTTE).getTime(), alle(22, 0, 27).getTime())
  assert.equal(regole.inizioUltimaNotte(alle(23), NOTTE).getTime(), alle(22).getTime())
})

type C = Parameters<typeof regole.tocca>[0]
const carta = (x: Partial<C>): C => ({ stato: 'aperto', modo: 'tutto', guaio: null, sparito: null, giorno: null, quando: 'oggi', turno: { da: 'tu', quando: 'presto', dal: alle(8).toISOString(), tentativi: 0 }, ...x }) as C

test('quando tocca: oggi adesso, domani la notte prima, più avanti la notte prima del suo giorno', () => {
  const giorno = { adesso: alle(15), notte: NOTTE, assente: false }
  const notte = { adesso: alle(23), notte: NOTTE, assente: false }
  assert.equal(regole.tocca(carta({}), giorno), 'adesso')
  assert.equal(regole.tocca(carta({ giorno: '2026-09-27' }), giorno), 'adesso', 'in ritardo: subito')
  assert.equal(regole.tocca(carta({ giorno: '2026-09-29', quando: 'settimana' }), giorno), 'notte')
  assert.equal(regole.tocca(carta({ giorno: '2026-09-29', quando: 'settimana' }), notte), 'adesso')
  assert.equal(regole.tocca(carta({ giorno: '2026-10-01', quando: 'settimana' }), giorno), 'prima:2026-10-01')
  // senza giorno e non per oggi: di notte o quando lei non c'è
  assert.equal(regole.tocca(carta({ quando: 'poi' }), giorno), 'notte')
  assert.equal(regole.tocca(carta({ quando: 'poi' }), { ...giorno, assente: true }), 'adesso')
})

test('quando tocca: una proposta di Myynd aspetta che lei non ci sia, o la notte', () => {
  const myynd = carta({ turno: { da: 'myynd', quando: 'notte', dal: alle(8).toISOString(), tentativi: 0 } })
  assert.equal(regole.tocca(myynd, { adesso: alle(15), notte: NOTTE, assente: false }), 'via')
  assert.equal(regole.tocca(myynd, { adesso: alle(15), notte: NOTTE, assente: true }), 'adesso')
  assert.equal(regole.tocca(myynd, { adesso: alle(2), notte: NOTTE, assente: false }), 'adesso')
})

test('quando tocca: fuori dalla coda non tocca a nessuno', () => {
  const g = { adesso: alle(15), notte: NOTTE, assente: false }
  assert.equal(regole.tocca(carta({ modo: 'io' }), g), null)
  assert.equal(regole.tocca(carta({ stato: 'delegato' }), g), null)
  assert.equal(regole.tocca(carta({ guaio: 'Collega la posta e la riprendo da qui.' }), g), null)
})

test('il punteggio: in ritardo prima di oggi, l’alta prima, una mail prima di un documento, le sue prima delle proposte', () => {
  const o = { adesso: alle(10) }
  const p = (x: Partial<Parameters<typeof regole.punteggio>[0]>) => regole.punteggio({ giorno: null, quando: 'oggi', priorita: null, doc: null, turno: null, creato: alle(9).toISOString(), ...x }, o)
  assert.ok(p({ giorno: '2026-09-27' }) > p({}))
  assert.ok(p({}) > p({ giorno: '2026-09-29', quando: 'settimana' }))
  assert.ok(p({ priorita: 'alta' }) > p({}))
  assert.ok(p({ doc: 'posta:INBOX:1' }) > p({ doc: 'desktop:/x.md' }))
  assert.ok(p({ turno: { da: 'tu', quando: 'presto', dal: alle(9).toISOString(), tentativi: 0 } }) > p({ turno: { da: 'myynd', quando: 'notte', dal: alle(9).toISOString(), tentativi: 0 } }))
})

let n = 0
function riga(testo: string, extra: Partial<Parameters<typeof store.scriviCompito>[0]> = {}): string {
  const id = `t${++n}`
  store.scriviCompito({ id, testo, ordine: `o${String(n).padStart(3, '0')}`, ...extra })
  return id
}

const partite: string[] = []
/** Le mani finte di tutte le prove del turno, con quello che una prova vuole diverso. */
const finti = (x: Parameters<typeof turno.perProva>[0] = {}) => turno.perProva({
  affida: id => { partite.push(id); store.affidaCompito(id, 'tutto') },
  motore: () => true, occupato: () => false, assente: () => false, contratto: async () => null, ...x
})
beforeEach(() => {
  partite.length = 0
  store.azzeraTutto()
  // il conto della giornata sta su disco apposta (vale anche dopo un riavvio): fra una prova e l'altra si butta
  rmSync(join(cfg.cartella(), 'turno.json'), { force: true })
  cfg.scrivi({ lingua: 'en' })
  finti()
})

test('mettiInCoda: aperta e di Myynd, con il turno e la base del contratto; una domanda non si mette in coda', () => {
  finti({ motore: () => false })
  const id = riga('Reply to Riccardo about the pilot')
  const t = turno.mettiInCoda(id, 'tu')
  const c = store.compito(id)!
  assert.equal(c.stato, 'aperto')
  assert.equal(c.modo, 'tutto')
  assert.equal(c.turno?.da, 'tu')
  assert.equal(t.tentativi, 0)
  assert.ok(c.contratto?.criterio)
  const q = riga('A question card')
  store.affidaCompito(q, 'bozza')
  store.cambiaStatoCompito(q, 'chiede')
  assert.throws(() => turno.mettiInCoda(q, 'tu'), /rispondile/)
})

test('il giro fa partire la carta pronta che conta di più, e ne scrive il turno e il diario', async () => {
  const bassa = riga('Low priority thing', { priorita: 'bassa' })
  const alta = riga('Answer the investor', { priorita: 'alta' })
  const domani = riga('Prepare the board pack', { giorno: '2026-09-29', quando: 'settimana' })
  for (const id of [bassa, alta, domani]) store.mettiCompitoInCoda(id, 'tutto', { da: 'tu', quando: 'presto', dal: alle(8).toISOString(), tentativi: 0 })
  const partita = await turno.giro(alle(15))
  assert.equal(partita, alta)
  const c = store.compito(alta)!
  assert.equal(c.turno?.tentativi, 1)
  assert.equal(c.turno?.notte, false)
  assert.ok((c.diario ?? []).some(v => v.tipo === 'turno' && v.dettaglio === 'giorno'))
  // di notte parte anche quella di domani
  store.cambiaStatoCompito(alta, 'fatto')
  store.cambiaStatoCompito(bassa, 'fatto')
  assert.equal(await turno.giro(alle(23)), domani)
  assert.equal(store.compito(domani)?.turno?.notte, true)
})

test('il giro non parte: spento, in pausa, senza motore, con un lavoro in corso, o a tetto', async () => {
  const id = riga('Something for today')
  store.mettiCompitoInCoda(id, 'tutto', { da: 'tu', quando: 'presto', dal: alle(8).toISOString(), tentativi: 0 })
  turno.imposta({ acceso: false })
  assert.equal(await turno.giro(alle(15)), null)
  turno.imposta({ acceso: true })
  turno.imposta({ pausa: 30 }, alle(15))
  assert.equal(await turno.giro(alle(15, 10)), null)
  turno.imposta({ pausa: 0 })
  finti({ motore: () => false })
  assert.equal(await turno.giro(alle(15)), null)
  finti({ occupato: () => true })
  assert.equal(await turno.giro(alle(15)), null)
  finti()
  turno.imposta({ carte: 1 })
  assert.equal(await turno.giro(alle(15)), id)
  const altra = riga('Another for today')
  store.mettiCompitoInCoda(altra, 'tutto', { da: 'tu', quando: 'presto', dal: alle(8).toISOString(), tentativi: 0 })
  assert.equal(await turno.giro(alle(15, 5)), null, 'il tetto della giornata è raggiunto')
  // la giornata dopo il conto riparte
  assert.equal(await turno.giro(alle(8, 0, 29)), altra)
})

test('imposta: valori che non vanno si dicono', () => {
  assert.throws(() => turno.imposta({ carte: 0 }), /Quante carte/)
  assert.throws(() => turno.imposta({ notteDa: '25:00' }), /22:00/)
  assert.throws(() => turno.imposta({ notteDa: '07:00', notteA: '07:00' }), /stessa ora/)
  assert.throws(() => turno.imposta({ pausa: 99999 }), /pausa/)
  const imp = turno.imposta({ carte: 20, notteDa: '23:00', notteA: '06:30' })
  assert.deepEqual([imp.carte, imp.notte.da, imp.notte.a], [20, '23:00', '06:30'])
})

test('lo stato: in coda, pronte adesso, avviate, e quello che il turno ha fatto stanotte', async () => {
  const oggi = riga('For today')
  const dopo = riga('For Thursday', { giorno: '2026-10-01', quando: 'settimana' })
  for (const id of [oggi, dopo]) store.mettiCompitoInCoda(id, 'tutto', { da: 'tu', quando: 'presto', dal: alle(8).toISOString(), tentativi: 0 })
  let s = turno.stato(alle(15))
  assert.equal(s.inCoda, 2)
  assert.equal(s.prontePerOra, 1)
  assert.equal(s.inNotte, false)
  assert.equal(s.prossimaNotte, alle(22).toISOString())
  // una carta partita stanotte e finita, una partita stanotte che chiede
  const finita = riga('Done overnight')
  store.affidaCompito(finita, 'tutto')
  store.risultatoCompito(finita, 'Done.', [], 'pronto')
  store.scriviTurnoCompito(finita, { da: 'myynd', quando: 'notte', dal: alle(20, 0, 27).toISOString(), tentativi: 1, ultimo: alle(2).toISOString(), notte: true })
  const chiede = riga('Asks overnight')
  store.affidaCompito(chiede, 'tutto')
  store.cambiaStatoCompito(chiede, 'chiede')
  store.scriviTurnoCompito(chiede, { da: 'tu', quando: 'presto', dal: alle(20, 0, 27).toISOString(), tentativi: 1, ultimo: alle(3).toISOString(), notte: true })
  s = turno.stato(alle(9))
  assert.deepEqual([s.stanotte.fatte, s.stanotte.attende], [1, 1])
})

test('la catena: quando una carta finisce, il turno fa partire la prossima da solo', async () => {
  // il turno vero sulla coda vera, con un modello finto che finisce subito
  turno.perProva({ motore: () => true, assente: () => false, contratto: async () => null })
  compiti.perProva({
    svolgi: async () => ({ testo: 'Done: the note is below.\n\nA short note with the three points, ready to read on its own.', fonti: [] }),
    chiedeAiuto: async () => ({ chiede: false, manca: [], domanda: '' }), domandeDaFare: async () => [], prossimoPasso: async () => null,
    giudica: async () => ({ esito: 'unavailable', per: '', comeTe: '', comeLoro: '', problemi: [], verificato: [] })
  })
  turno.avvia()
  const a = riga('First for today')
  const b = riga('Second for today')
  for (const id of [a, b]) store.mettiCompitoInCoda(id, 'tutto', { da: 'tu', quando: 'presto', dal: new Date().toISOString(), tentativi: 0 })
  assert.ok(await turno.giro())
  const fine = Date.now() + 8000
  while (Date.now() < fine && !['pronto'].every(s => store.compito(a)?.stato === s && store.compito(b)?.stato === s)) {
    await new Promise(r => setTimeout(r, 100))
  }
  assert.equal(store.compito(a)?.stato, 'pronto')
  assert.equal(store.compito(b)?.stato, 'pronto', 'la seconda è partita da sola quando la prima ha finito')
  assert.equal(store.compito(b)?.turno?.tentativi, 1)
})

test('F6 · una carta del primo giorno si ritira se nel suo filo è arrivata la risposta; senza risposta parte, anche con le proposte spente', async () => {
  finti()
  cfg.aggiorna({ autonomia: 'preparare' })
  const arrivata = (id: string, filo: string) => ({ id, fonte: 'posta', tipo: 'email', titolo: `Plan review ${id}`, corpo: 'Could you review the plan and reply with your feedback?',
    autore: 'Jane <jane@example.com>', quando: new Date(alle(1).getTime() - 3_600_000).toISOString(), filo, messageId: `${id}@x` })
  store.salvaDocumenti([arrivata('posta:INBOX:a', 'fa'), arrivata('posta:INBOX:b', 'fb')])
  const notte = { da: 'myynd' as const, quando: 'notte' as const, dal: alle(0, 30).toISOString(), tentativi: 0 }
  const risposta = riga('Reply to Jane (answered)', { origine: 'primo-giorno', doc: 'posta:INBOX:a' })
  const aperta = riga('Reply to Jane', { origine: 'primo-giorno', doc: 'posta:INBOX:b' })
  store.mettiCompitoInCoda(risposta, 'bozza', notte)
  store.mettiCompitoInCoda(aperta, 'bozza', notte)
  // lei ha risposto dalla sua posta al primo filo
  store.salvaDocumenti([{ id: 'posta:Sent:a', fonte: 'posta', tipo: 'email', titolo: 'Re: Plan review', corpo: 'Done.', autore: 'me@example.com', inviato: true,
    quando: alle(0, 50).toISOString(), filo: 'fa', messageId: 'sa@x', risponde: 'posta:INBOX:a@x', destinatari: 'jane@example.com' }])
  // alle due di notte il turno la prende: la prima si ritira, la seconda parte
  const partita = await turno.giro(alle(2))
  assert.equal(store.compito(risposta)?.stato, 'ritirato')
  assert.equal(partita, aperta)
})
