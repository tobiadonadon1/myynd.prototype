// Una riga affidata non sparisce in silenzio.
//
// Il primo ottobre 2026, alle 14:30, lui ha premuto «Affidalo a Myynd» sulla
// carta «Check Myynd's first full night run on 0.2.34». Il lavoro è partito,
// due giri del modello sono finiti, il terzo è stato interrotto un secondo e
// mezzo dopo, e il registro dice solo «worker · released»: nessun errore,
// nessun guaio, nessun risultato. La riga era tornata sua (`modo = 'io'`),
// col diario fermo all'ultimo «apro». È la firma di `compiti.richiama`: il
// segnale interrompe il modello, il `catch` vede la riga richiamata e tace.
// Lui: «it kind of worked through it, and then the task disappeared, and I
// don't know where the thing went».
//
// Qui si prova che ogni strada che ferma un lavoro affidato lascia una traccia
// sulla riga, e che un «Salva» del dettaglio che rimanda i valori di prima non
// ferma niente.
//
//   node --test server/richiamo-visibile.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-richiamo-'))
process.env.MYYND_DATI = CASA

const store = await import('./store.ts')
const compiti = await import('./compiti.ts')
type Evento = import('./compiti.ts').Evento
type Ferri = NonNullable<Parameters<typeof compiti.perProva>[0]>
type Giudizio = import('./revisione-lavoro.ts').Giudizio

before(() => store.azzeraTutto())
after(() => {
  compiti.perProva(null)
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

const pausa = (ms: number) => new Promise(r => setTimeout(r, ms))
const nonDisponibile = async (): Promise<Giudizio> => ({ esito: 'unavailable', per: '', comeTe: '', comeLoro: '', problemi: [], verificato: [] })
function prova(f: Ferri) {
  compiti.perProva({ giudica: nonDisponibile, prossimoPasso: async () => null, chiedeAiuto: async () => ({ chiede: false, manca: [], domanda: '' }), domandeDaFare: async () => [], ...f })
}

function ascolta(id: string) {
  const sentiti: Evento[] = []
  const smetti = compiti.ascolta(e => { if ('id' in e && e.id === id) sentiti.push(e) }, null)
  return { sentiti, smetti }
}

/** Il modello vero, al terzo giro: due passi, poi aspetta finché il segnale non lo interrompe. */
function modelloCheAspetta() {
  let segnale: AbortSignal | undefined
  prova({
    svolgi: async (_t, _n, _m, _a, _c, passo, _d, _s, esecuzione) => {
      segnale = esecuzione?.signal
      passo?.({ passo: 'apro', dettaglio: 'docs' })
      passo?.({ passo: 'scrivo' })
      return new Promise((_ok, ko) => {
        const via = () => ko(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }))
        if (segnale?.aborted) via()
        else segnale?.addEventListener('abort', via, { once: true })
      })
    }
  })
  return { segnale: () => segnale }
}

test('il caso del primo ottobre: una riga affidata dal feed e richiamata a metà lavoro lo dice nel diario, non sparisce in silenzio', async () => {
  const m = modelloCheAspetta()
  const id = 'feed-notte'
  store.scriviCompito({ id, testo: 'Check Myynd\'s first full night run on 0.2.34', origine: 'feed', ordine: 'a' })
  const o = ascolta(id)
  compiti.affida(id, 'tutto')
  await pausa(30)
  assert.equal(store.compito(id)?.stato, 'delegato')
  assert.ok(o.sentiti.some(e => e.fase === 'lavoro'), 'il lavoro era partito')

  compiti.richiama(id)
  assert.equal(m.segnale()?.aborted, true, 'il modello si ferma davvero')
  await pausa(30)

  const c = store.compito(id)!
  assert.equal(c.stato, 'aperto')
  assert.equal(c.modo, 'io')
  assert.equal(c.risultato, null)
  // la traccia: l'ultima voce del diario dice che l'ha ripresa lei
  assert.deepEqual(c.diario?.at(-1) && { tipo: c.diario.at(-1)!.tipo, dettaglio: c.diario.at(-1)!.dettaglio }, { tipo: 'fermato', dettaglio: 'tu' })
  // e il lavoro non scrive più niente dopo il richiamo
  assert.ok(!o.sentiti.some(e => e.fase === 'pronto' || e.fase === 'guaio'))
  assert.equal(compiti.occupatoPer(''), false, 'la persona ha le mani libere')
  o.smetti()
})

test('fermata perché l’ha cambiata: il diario lo dice con il suo perché', async () => {
  modelloCheAspetta()
  const id = 'cambiata'
  store.scriviCompito({ id, testo: 'Riscrivi la sezione prezzi', ordine: 'b' })
  compiti.affida(id, 'tutto')
  await pausa(30)
  compiti.richiama(id, 'modificata')
  await pausa(20)
  const v = store.compito(id)!.diario!.at(-1)!
  assert.equal(v.tipo, 'fermato')
  assert.equal(v.dettaglio, 'modificata')
})

test('(contro) richiamare una riga che non era mai stata di Myynd non scrive niente nel diario', () => {
  const id = 'mai-sua'
  store.scriviCompito({ id, testo: 'Comprare il latte', ordine: 'c' })
  compiti.richiama(id)
  assert.deepEqual(store.compito(id)!.diario ?? [], [])
})

test('richiamare una riga in coda per il turno la fa tornare sua, e il diario lo dice', () => {
  const id = 'in-coda'
  store.scriviCompito({ id, testo: 'Prepara il riassunto della settimana', ordine: 'd' })
  assert.ok(store.mettiCompitoInCoda(id, 'tutto', { da: 'tu', quando: 'presto', dal: new Date().toISOString(), tentativi: 0 }))
  compiti.richiama(id)
  const c = store.compito(id)!
  assert.equal(c.modo, 'io')
  assert.equal(c.turno, null)
  assert.equal(c.diario?.at(-1)?.tipo, 'fermato')
})

test('al riavvio una carta interrotta torna in coda e il diario dice perché; una caduta due volte porta il guaio anche nel diario', () => {
  store.scriviCompito({ id: 'riavvio-a', testo: 'Scrivi la proposta', ordine: 'e' })
  store.affidaCompito('riavvio-a', 'tutto')
  store.scriviCompito({ id: 'riavvio-b', testo: 'La carta che cade', ordine: 'f' })
  store.affidaCompito('riavvio-b', 'tutto')
  store.scriviTurnoCompito('riavvio-b', { da: 'tu', quando: 'presto', dal: new Date().toISOString(), tentativi: 2, ultimo: new Date().toISOString() })
  compiti.riprendiAppesi()
  const a = store.compito('riavvio-a')!
  assert.equal(a.stato, 'aperto')
  assert.notEqual(a.modo, 'io')
  assert.deepEqual({ tipo: a.diario?.at(-1)?.tipo, dettaglio: a.diario?.at(-1)?.dettaglio }, { tipo: 'fermato', dettaglio: 'riavvio' })
  const b = store.compito('riavvio-b')!
  assert.equal(b.guaio, compiti.INTERROTTA_DUE_VOLTE)
  assert.deepEqual({ tipo: b.diario?.at(-1)?.tipo, dettaglio: b.diario?.at(-1)?.dettaglio }, { tipo: 'guaio', dettaglio: compiti.INTERROTTA_DUE_VOLTE })
})

test('il dettaglio aperto e salvato senza toccare niente non cambia il lavoro, e non scrive niente', () => {
  const id = 'dettaglio'
  store.scriviCompito({ id, testo: 'Check the night run', nota: 'Posso farlo io: leggo il registro.\n', origine: 'feed', ordine: 'g' })
  store.affidaCompito(id, 'tutto')
  const c = store.compito(id)!
  // quello che il dettaglio mandava sempre: tutti i campi, la nota rifilata, il giorno di oggi per una riga «di oggi»
  const comeLoMandava = { testo: 'Check the night run', nota: 'Posso farlo io: leggo il registro.', progetto: null, ora: null }
  assert.deepEqual(compiti.soloCambiati(c, comeLoMandava), {})
  assert.equal(compiti.cambiaIlLavoro(c, compiti.soloCambiati(c, comeLoMandava)), false)
  // il giorno e la priorità dicono quando, non cosa: non fermano il lavoro
  const quando = compiti.soloCambiati(c, { giorno: '2026-10-02', priorita: 'alta' })
  assert.deepEqual(quando, { giorno: '2026-10-02', priorita: 'alta' })
  assert.equal(compiti.cambiaIlLavoro(c, quando), false)
  // il testo cambiato sì
  const testo = compiti.soloCambiati(c, { testo: 'Check the night run and the budget' })
  assert.equal(compiti.cambiaIlLavoro(c, testo), true)
  // e una nota svuotata pure
  assert.equal(compiti.cambiaIlLavoro(c, compiti.soloCambiati(c, { nota: null })), true)
})
