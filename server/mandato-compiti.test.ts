// Il mandato e la traccia dentro la coda dei compiti, senza un modello sotto.
//
// La carta parte e nasce la sua traccia; consegnata, la traccia dice dove;
// il mandato del progetto arriva a chi lavora; un file che il mandato non
// lascia scrivere resta sulla riga; un progetto col budget del mese finito
// non parte.
//
//   node --import ./build/test-profile.mjs --test server/mandato-compiti.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-mandato-compiti-'))
process.env.MYYND_DATI = CASA

const store = await import('./store.ts')
const compiti = await import('./compiti.ts')
const progetti = await import('./progetti.ts')
const mandato = await import('./mandato.ts')
const tracce = await import('./tracce.ts')
const cfg = await import('./config.ts')
type Evento = import('./compiti.ts').Evento
type Ferri = NonNullable<Parameters<typeof compiti.perProva>[0]>
type Giudizio = import('./revisione-lavoro.ts').Giudizio

before(() => { store.azzeraTutto(); cfg.scrivi({ lingua: 'en' }) })
after(() => { compiti.perProva(null); store.chiudiIndici(); rmSync(CASA, { recursive: true, force: true }) })

const CONSEGNE = join(CASA, 'consegne')
let salvati: string[] = []
const salvaInCasa: Ferri['salvaConsegna'] = o => {
  mkdirSync(join(CONSEGNE, o.luogo), { recursive: true })
  const nome = `${o.titolo.replace(/[\\/:*?"<>|]+/g, ' ').trim()}.md`
  const percorso = join(CONSEGNE, o.luogo, nome)
  writeFileSync(percorso, o.testo)
  salvati.push(percorso)
  return { percorso, nome, luogo: o.luogo }
}
const nonDisponibile = async (): Promise<Giudizio> => ({ esito: 'unavailable', per: '', comeTe: '', comeLoro: '', problemi: [], verificato: [] })
const prova = (f: Ferri) => compiti.perProva({
  giudica: nonDisponibile, prossimoPasso: async () => null, salvaConsegna: salvaInCasa,
  chiedeAiuto: async () => ({ chiede: false, manca: [], domanda: '' }), domandeDaFare: async () => [], ...f
})

let n = 0
function riga(testo: string, progetto?: string): string {
  const id = `mc${++n}`
  store.scriviCompito({ id, testo, ordine: `o${String(n).padStart(3, '0')}`, ...(progetto ? { progetto } : {}) })
  return id
}
function aspetta(id: string, fase: Evento['fase'], ms = 4000): Promise<Evento> {
  return new Promise((ok, no) => {
    const t = setTimeout(() => { smetti(); no(new Error(`nessun «${fase}» entro ${ms}ms`)) }, ms)
    const smetti = compiti.ascolta(e => { if ('id' in e && e.id === id && e.fase === fase) { clearTimeout(t); smetti(); ok(e) } }, null)
  })
}

const PAGINA = '# Plan\n\n' + 'A real step with a real reason. '.repeat(40).trim() + '\n\n## Next\n\nShip it.'

test('una carta parte: nasce la traccia; consegnata, la traccia dice dove; il mandato arriva a chi lavora', async () => {
  const p = progetti.scrivi({ nome: 'Aurora', obiettivo: 'Sell ten subscriptions' })
  let mandatoVisto: unknown = 'non passato'
  prova({ svolgi: async (...a) => { mandatoVisto = a[8]?.mandato; return { testo: PAGINA, fonti: [{ id: 'desktop:7', label: 'Notes' }], fatti: [] } } })
  const id = riga('Write the launch plan', p.id)
  const pronto = aspetta(id, 'pronto')
  compiti.affida(id, 'bozza')
  await pronto
  assert.deepEqual(mandatoVisto, { progetto: p.id })
  const t = tracce.ultimaDi(id)!
  assert.ok(t, 'la traccia c’è')
  assert.equal(t.progetto, p.id)
  assert.ok(t.consegnata)
  assert.equal(t.ricevuta, 'fatto')
  assert.equal(t.esito, 'in_attesa')
  assert.ok(store.compito(id)?.consegna?.percorso)
  assert.equal(t.uscita, store.compito(id)?.consegna?.percorso)
  assert.ok(t.prove.includes('desktop:7'))
})

test('il mandato dice «file: mai»: il lavoro resta sulla riga, nessun file', async () => {
  const p = progetti.scrivi({ nome: 'Borea', obiettivo: 'Publish the site' })
  mandato.salva(p.id, { classi: { file: 'mai' } }, { conferma: true })
  salvati = []
  prova({ svolgi: async () => ({ testo: PAGINA, fonti: [], fatti: [] }) })
  const id = riga('Write the site copy', p.id)
  const pronto = aspetta(id, 'pronto')
  compiti.affida(id, 'bozza')
  await pronto
  assert.deepEqual(salvati, [])
  const c = store.compito(id)!
  assert.equal(c.consegna ?? null, null)
  assert.match(c.risultato ?? '', /## Next/)
  assert.equal(tracce.ultimaDi(id)?.uscita ?? null, null)
})

test('il budget del mese del progetto è finito: la carta non parte, e la traccia è trattenuta', async () => {
  const p = progetti.scrivi({ nome: 'Cirro', obiettivo: 'Ten users' })
  mandato.salva(p.id, { budget: 0.1 }, { conferma: true })
  const prima = riga('Earlier research', p.id)
  store.default.prepare('INSERT INTO uso (quando, lavoro, motore, entrata, cache, uscita, compito, costo) VALUES (?,?,?,?,?,?,?,?)')
    .run(new Date().toISOString(), 'bozza', 'claude', 1, 0, 1, prima, 200_000)
  let chiamato = false
  prova({ svolgi: async () => { chiamato = true; return { testo: 'x', fonti: [] } } })
  const id = riga('More research', p.id)
  const guaio = aspetta(id, 'guaio')
  compiti.affida(id, 'bozza')
  const e = await guaio
  assert.equal(chiamato, false)
  assert.match(e.fase === 'guaio' ? e.guaio : '', /budget/)
  assert.equal(tracce.ultimaDi(id)?.ricevuta, 'trattenuto')
  assert.equal(tracce.ultimaDi(id)?.motivo, 'budget')
})

test('una carta senza progetto lavora con il mandato di serie', async () => {
  let mandatoVisto: unknown = 'non passato'
  prova({ svolgi: async (...a) => { mandatoVisto = a[8]?.mandato; return { testo: 'Short answer.', fonti: [] } } })
  const id = riga('Quick question')
  const pronto = aspetta(id, 'pronto')
  compiti.affida(id, 'bozza')
  await pronto
  assert.deepEqual(mandatoVisto, { progetto: null })
  assert.ok(existsSync(CASA))
})
