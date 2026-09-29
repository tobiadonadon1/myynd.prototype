// Una notte di cui fidarsi (F9): il conto di ogni carta, il budget della
// notte, il bottone che ferma, e la carta fermata che torna in coda senza
// lasciare file a metà.
//
//   node --test server/turno-f9.test.ts

import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-turno-f9-'))
process.env.MYYND_DATI = join(CASA, 'dati')

const store = await import('./store.ts')
const cfg = await import('./config.ts')
const turno = await import('./turno.ts')
const compiti = await import('./compiti.ts')
const mani = await import('./mani.ts')
const cestino = await import('./cestino.ts')
const tetto = await import('./tetto.ts')
const etichetta = await import('./etichetta-uso.ts')

const SCRIVANIA = join(CASA, 'Desktop')
const CESTINO = join(CASA, '.Trash')

before(() => {
  store.azzeraTutto()
  mkdirSync(SCRIVANIA, { recursive: true })
  mani.perProva({ scrivania: () => SCRIVANIA, scaricati: () => join(CASA, 'Downloads'), documenti: () => join(CASA, 'Documents') })
  cestino.perProva({ cestino: () => CESTINO })
})
after(() => {
  turno.perProva(null); compiti.perProva(null); mani.perProva(null); cestino.perProva(null)
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

/** Lunedì 28 settembre 2026, a un'ora locale. */
const alle = (h: number, m = 0, giorno = 28) => new Date(2026, 8, giorno, h, m, 0, 0)

let n = 0
function carta(testo: string): string {
  const id = `f${++n}`
  store.scriviCompito({ id, testo, ordine: `o${String(n).padStart(3, '0')}` })
  store.mettiCompitoInCoda(id, 'tutto', { da: 'tu', quando: 'presto', dal: new Date(Date.now() - 3_600_000).toISOString(), tentativi: 0 })
  return id
}

/** Una riga del registro dell'uso scritta a un'ora scelta: il registro vero scrive l'ora di adesso. */
function spesa(compito: string, quando: Date, microDollari: number) {
  store.default.prepare('INSERT INTO uso (quando, lavoro, motore, entrata, cache, uscita, compito, costo) VALUES (?,?,?,?,?,?,?,?)')
    .run(quando.toISOString(), 'bozza', 'claude-sonnet-5', 1000, 0, 100, compito, microDollari)
}

const aspetta = async (f: () => boolean, ms = 8000) => {
  const fine = Date.now() + ms
  while (Date.now() < fine && !f()) await new Promise(r => setTimeout(r, 25))
  return f()
}

beforeEach(async () => {
  // un lavoro della prova prima non deve restare in fila
  await aspetta(() => !compiti.occupatoPer(''), 5000)
  store.azzeraTutto()
  store.default.exec('DELETE FROM uso')
  rmSync(join(cfg.cartella(), 'turno.json'), { force: true })
  cfg.scrivi({ lingua: 'en' })
  turno.perProva({ motore: () => true, assente: () => false, contratto: async () => null })
  compiti.perProva(null)
})

test('il conto di una carta: quello che si registra dentro la carta va sul suo conto, e costoDal lo somma', () => {
  store.scriviCompito({ id: 'k1', testo: 'Card with a bill', ordine: 'k1' })
  etichetta.conCompito('k1', () => {
    store.segnaUso({ lavoro: 'bozza', motore: 'claude-sonnet-5', entrata: 1000, cache: 0, uscita: 100, modello: 'claude-sonnet-5' })
    store.segnaUso({ lavoro: 'revisione', motore: 'claude-sonnet-5', entrata: 2000, cache: 10_000, uscita: 200, scritti: 1000, modello: 'claude-sonnet-5' })
  })
  // fuori da una carta: la chat non va sul conto di nessuno
  store.segnaUso({ lavoro: 'risposta', motore: 'claude-sonnet-5', entrata: 5000, cache: 0, uscita: 500, modello: 'claude-sonnet-5' })
  const k = store.usoDelCompito('k1')!
  // 1000·2 + 100·10 = 3000; poi 1000·2 + 1000·2.5 + 10000·0.2 + 200·10 = 8500
  assert.deepEqual(k, { chiamate: 2, entrata: 3000, uscita: 300, costo: 11_500, stimato: false })
  assert.equal(store.costoDal(new Date(Date.now() - 60_000).toISOString()), 11_500, 'la chat non conta nel budget delle carte')
  // un fornitore contato al prezzo del modello scelto è una stima
  etichetta.conCompito('k2', () => store.segnaUso({ lavoro: 'bozza', motore: 'ChatGPT subscription', entrata: 1000, cache: 0, uscita: 0, modello: 'claude-sonnet-5' }))
  assert.equal(store.usoDelCompito('k2')?.stimato, true)
  // e la lista lo porta sulla carta
  store.cambiaStatoCompito('k1', 'fatto')
  assert.equal(store.compitiChiusi().find(c => c.id === 'k1')?.costo?.costo, 11_500)
})

test('il budget finito: il giro non parte, la carta resta in coda, il conto lo scrive; la giornata dopo si riparte', async () => {
  turno.imposta({ budget: 1 })
  const partite: string[] = []
  turno.perProva({ motore: () => true, assente: () => false, contratto: async () => null, occupato: () => false,
    affida: id => { partite.push(id); store.affidaCompito(id, 'tutto') } })
  const id = carta('Draft the board note')
  spesa('vecchia', alle(14), 1_050_000)
  assert.equal(await turno.giro(alle(15)), null)
  assert.equal(store.compito(id)?.stato, 'aperto')
  assert.equal(store.compito(id)?.modo, 'tutto', 'resta in coda')
  const s = turno.stato(alle(15))
  assert.equal(s.budget.finito, true)
  assert.equal(s.budget.limite, 1)
  assert.ok(Math.abs(s.budget.speso - 1.05) < 1e-9)
  const conto = JSON.parse(readFileSync(join(cfg.cartella(), 'turno.json'), 'utf8'))
  assert.equal(conto.fermata?.perche, 'budget')
  // quello che resta non basta per una carta come le ultime: ferma anche prima di arrivare al limite
  turno.imposta({ budget: 1.2 })
  assert.equal(turno.stato(alle(15)).budget.finito, true, 'restano 15 centesimi, e l’ultima carta ne è costata 105')
  // la giornata dopo il conto riparte da zero
  assert.equal(await turno.giro(alle(8, 0, 29)), id)
  assert.deepEqual(partite, [id])
  // e senza limite non si ferma mai
  turno.imposta({ budget: 0 })
  assert.equal(turno.stato(alle(15)).budget.finito, false)
})

/** Un modello finto che lavora finché non lo fermano: scrive un file a metà, e aspetta il segnale. */
function lavoroCheAspetta(o: { fatto?: (id: string) => void } = {}) {
  let chiamate = 0
  compiti.perProva({
    svolgi: async (...a) => {
      chiamate++
      const esecuzione = a[8] as { signal: AbortSignal; taskId: string }
      const percorso = join(SCRIVANIA, `Half ${esecuzione.taskId}.md`)
      writeFileSync(percorso, 'half written')
      store.segnaNelDiario(esecuzione.taskId, { tipo: 'file', dettaglio: percorso })
      o.fatto?.(esecuzione.taskId)
      return await new Promise((_, rifiuta) => {
        if (esecuzione.signal.aborted) return rifiuta(new Error('fermato'))
        esecuzione.signal.addEventListener('abort', () => rifiuta(new Error('fermato')), { once: true })
      })
    },
    chiedeAiuto: async () => ({ chiede: false, manca: [], domanda: '' }), domandeDaFare: async () => [], prossimoPasso: async () => null,
    giudica: async () => ({ esito: 'unavailable', per: '', comeTe: '', comeLoro: '', problemi: [], verificato: [] })
  })
  return { chiamate: () => chiamate }
}

test('«Stop now»: la carta al lavoro si interrompe e torna in coda col suo modo, senza il tentativo; il file a metà va nel Cestino; il turno resta fermo', async () => {
  const lavoro = lavoroCheAspetta()
  const id = carta('Write the pilot summary')
  assert.equal(await turno.giro(), id)
  assert.ok(await aspetta(() => lavoro.chiamate() === 1), 'il lavoro è partito')
  assert.equal(store.compito(id)?.turno?.tentativi, 1)
  assert.equal(turno.stato().lavora, true)
  const fermate = turno.ferma()
  assert.deepEqual(fermate, [id])
  // subito: la carta è di nuovo in coda, com'era prima di partire
  const c = store.compito(id)!
  assert.equal(c.stato, 'aperto')
  assert.equal(c.modo, 'tutto')
  assert.equal(c.guaio, null)
  assert.equal(c.turno?.tentativi, 0)
  assert.ok(c.diario?.some(v => v.tipo === 'fermato' && v.dettaglio === 'stop'))
  // il lavoro finisce, e il file scritto a metà è nel Cestino, non sulla Scrivania
  assert.ok(await aspetta(() => !compiti.occupatoPer('')), 'il lavoro si è fermato davvero')
  assert.equal(existsSync(join(SCRIVANIA, `Half ${id}.md`)), false)
  assert.ok(readdirSync(CESTINO).includes(`Half ${id}.md`))
  assert.equal(store.compito(id)?.guaio, null, 'fermata non è un guaio')
  // il turno resta fermo finché lei non lo riprende
  assert.ok(turno.impostazioni().fermo)
  assert.equal(await turno.giro(), null)
  assert.equal(turno.veglia().fermo, true)
  turno.imposta({ pausa: 0 })
  assert.equal(turno.impostazioni().fermo, null)
  assert.equal(await turno.giro(), id, 'ripreso, la stessa carta riparte')
  assert.ok(await aspetta(() => lavoro.chiamate() === 2))
  turno.ferma()
  assert.ok(await aspetta(() => !compiti.occupatoPer('')))
})

test('il budget sforato a metà: la carta del turno si ferma e torna in coda, senza guaio; una affidata a mano no', async () => {
  turno.imposta({ budget: 1 })
  compiti.perProva({
    svolgi: async () => {
      // la carta costa più del previsto: 1,30 $ su un budget di 1 $
      store.segnaUso({ lavoro: 'bozza', motore: 'claude-sonnet-5', entrata: 0, cache: 0, uscita: 0, costo: 1_300_000 })
      tetto.controllaIlTetto()
      return { testo: 'Done: the note is below.\n\nA short note with the three points, ready to read on its own.', fonti: [] }
    },
    chiedeAiuto: async () => ({ chiede: false, manca: [], domanda: '' }), domandeDaFare: async () => [], prossimoPasso: async () => null,
    giudica: async () => ({ esito: 'unavailable', per: '', comeTe: '', comeLoro: '', problemi: [], verificato: [] })
  })
  const id = carta('Prepare the renewal email')
  assert.equal(await turno.giro(), id)
  assert.ok(await aspetta(() => store.compito(id)?.stato === 'aperto' && !compiti.occupatoPer('')))
  const c = store.compito(id)!
  assert.equal(c.guaio, null)
  assert.equal(c.modo, 'tutto')
  assert.equal(c.turno?.tentativi, 0)
  assert.ok(c.diario?.some(v => v.tipo === 'fermato' && v.dettaglio === 'budget'))
  assert.equal(store.usoDelCompito(id)?.costo, 1_300_000, 'la spesa resta sul conto della carta')
  // e adesso il turno non fa partire altro
  assert.equal(await turno.giro(), null)
  // una carta affidata a mano, anche oltre il budget, lavora fino in fondo
  const mano = 'mano1'
  store.scriviCompito({ id: mano, testo: 'Summarise the thread', ordine: 'zz' })
  compiti.affida(mano, 'tutto')
  assert.ok(await aspetta(() => store.compito(mano)?.stato === 'pronto'), `a mano non si ferma: ${store.compito(mano)?.stato} ${store.compito(mano)?.guaio ?? ''}`)
})

test('la veglia: il Mac resta sveglio da un’ora prima della notte, con carte in coda e budget; il battito segna quando ha dormito', async () => {
  turno.perProva({ motore: () => true, assente: () => false, contratto: async () => null, occupato: () => true })
  carta('Something for tonight')
  assert.equal(turno.veglia(alle(15)).sveglio, false, 'di pomeriggio no')
  assert.equal(turno.veglia(alle(21, 15)).sveglio, true, 'a tre quarti d’ora dalla notte sì')
  assert.equal(turno.veglia(alle(2, 0, 29)).sveglio, true)
  assert.equal(turno.veglia(alle(21, 15)).inAttesa, true)
  // il battito alle 23, poi niente fino alle 2: un buco nella notte
  await turno.giro(alle(23))
  await turno.giro(alle(23, 1))
  await turno.giro(alle(2, 0, 29))
  const s = turno.stato(alle(9, 0, 29))
  assert.equal(s.stanotte.buchi.length, 1)
  assert.equal(s.stanotte.buchi[0].da, alle(23, 1).toISOString())
  assert.equal(s.stanotte.buchi[0].a, alle(2, 0, 29).toISOString())
  // fermato: niente veglia, e il guscio lo sa
  turno.ferma(alle(21, 15))
  assert.deepEqual([turno.veglia(alle(21, 15)).sveglio, turno.veglia(alle(21, 15)).fermo], [false, true])
  assert.equal(turno.stato(alle(21, 15)).stanotte.fermata, null, 'di giorno la fermata non è della notte')
  turno.imposta({ acceso: true })
  assert.equal(turno.impostazioni().fermo, null, 'riacceso è anche ripreso')
})
