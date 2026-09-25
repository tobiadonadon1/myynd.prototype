// L'imbuto del primo giorno: ogni passo una volta, con la sua data vera; due
// conti non si mescolano; i conti di prima non si contano mai; la macchina
// tiene solo numeri.
//
//   node --test server/imbuto.test.ts

import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-imbuto-'))
process.env.MYYND_DATI = CASA
process.env.MYYND_REGISTRAZIONE = 'aperta'
const conti = await import('./conti.ts')
const cfg = await import('./config.ts')
const chi = await import('./chi.ts')
const store = await import('./store.ts')
const imbuto = await import('./imbuto.ts')
const fascicolo = await import('./fascicolo.ts')

const ORA = Date.parse('2026-09-24T09:00:00Z')
const dopo = (ore: number) => new Date(ORA + ore * 3_600_000)
const macchina = () => JSON.parse(readFileSync(imbuto.fileMacchina(), 'utf8')) as { passi: Record<string, number>; giornoUno: Record<string, number> }
let anna = '', bruno = ''

before(async () => {
  await conti.avvia()
  const a = await conti.registra('anna@imbuto.test', 'passwordlunga1')
  const b = await conti.registra('bruno@imbuto.test', 'passwordlunga2')
  assert.ok(a.ok && b.ok)
  anna = a.ok ? a.id : ''; bruno = b.ok ? b.id : ''
})
beforeEach(() => imbuto.dimentica())
after(() => { store.chiudiIndici(); rmSync(CASA, { recursive: true, force: true }) })

test('un conto che non è nato con l’imbuto non si conta mai (counter-case)', () => {
  chi.dentro(bruno, () => {
    cfg.aggiorna({ calendario: { url: 'https://example.invalid/a.ics' } })
    store.salvaDocumenti([{ id: 'calendario:x:1', fonte: 'calendario', tipo: 'evento', titolo: 'x', corpo: 'x', quando: null }])
    imbuto.controlla(dopo(1))
  })
  assert.equal(existsSync(imbuto.fileMacchina()), false)
})

test('ogni passo una volta, con la sua data vera, e il giorno uno solo entro ventiquattro ore', () => {
  chi.dentro(anna, () => {
    imbuto.nasce(dopo(0))
    imbuto.nasce(dopo(0.5))
    imbuto.controlla(dopo(1))
    assert.deepEqual(macchina().passi, { conto: 1, fonte: 0, lettura: 0, pagina: 0, gesto: 0 })
    cfg.aggiorna({ calendario: { url: 'https://example.invalid/a.ics' } })
    imbuto.controlla(dopo(2))
    store.salvaDocumenti([{ id: 'calendario:u:1', fonte: 'calendario', tipo: 'evento', titolo: 'x', corpo: 'x', quando: null }])
    imbuto.controlla(dopo(3))
    imbuto.controlla(dopo(4))
  })
  const m = macchina()
  assert.equal(m.passi.fonte, 1)
  assert.equal(m.passi.lettura, 1)
  assert.equal(m.giornoUno.fonte, 1)
  const mio = chi.dentro(anna, () => JSON.parse(readFileSync(join(cfg.cartella(), 'imbuto.json'), 'utf8')))
  assert.equal(mio.conto, dopo(0).toISOString())
  assert.equal(mio.fonte, dopo(2).toISOString())
  assert.ok(mio.lettura, 'la data vera del primo documento')
})

test('la prima carta vista due giorni dopo conta, ma non nel giorno uno', () => {
  chi.dentro(anna, () => {
    store.salvaFeed([{ tipo: 'risposta', titolo: 'Rispondi a Maya', testo: 'Chiede il menu.' }])
    const [v] = store.elencoFeed('aperto') as { id: string }[]
    store.default.prepare('UPDATE feed SET vista = ? WHERE id = ?').run(dopo(50).toISOString(), v!.id)
    imbuto.controlla(dopo(51))
  })
  const m = macchina()
  assert.equal(m.passi.pagina, 1)
  assert.equal(m.giornoUno.pagina, 0)
})

test('due conti non si mescolano: il secondo che nasce conta per sé', () => {
  const c = chi.dentro(bruno, () => { imbuto.nasce(dopo(0)); imbuto.controlla(dopo(1)); return JSON.parse(readFileSync(join(cfg.cartella(), 'imbuto.json'), 'utf8')) })
  // Bruno aveva già una fonte e un documento: li conta con la sua data
  assert.ok(c.fonte && c.lettura)
  const m = macchina()
  assert.equal(m.passi.conto, 2)
  assert.equal(m.passi.fonte, 2)
  const a = chi.dentro(anna, () => JSON.parse(readFileSync(join(cfg.cartella(), 'imbuto.json'), 'utf8')))
  assert.notEqual(a.conto, undefined)
  assert.equal(a.gesto, undefined)
})

test('il file della macchina tiene solo numeri interi, e non sta dove sta il conto di prima', () => {
  const testo = readFileSync(imbuto.fileMacchina(), 'utf8')
  assert.doesNotMatch(testo, /@|imbuto\.test|utenti/)
  const m = JSON.parse(testo) as { passi: Record<string, unknown>; giornoUno: Record<string, unknown> }
  for (const v of [...Object.values(m.passi), ...Object.values(m.giornoUno)]) assert.ok(Number.isInteger(v))
  assert.equal(imbuto.fileMacchina(), join(CASA, 'misure', 'imbuto.json'))
  assert.equal(existsSync(join(CASA, 'imbuto.json')), false, 'la cartella del conto di prima è RADICE: niente file lì')
})

test('la riga di npm run imbuto, e la riga di comando non apre nessun indice', () => {
  const riga = imbuto.riga(imbuto.leggiAggregato())
  assert.match(riga, /^Conti nuovi 2 · prima fonte 2 · prima lettura 2 · prima pagina vista 1 \(giorno uno 0, 0%\) · primo gesto 0$/)
  const altra = mkdtempSync(join(tmpdir(), 'myynd-imbuto-cli-'))
  try {
    const fuori = execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/imbuto-cli.ts', '--dati', CASA], {
      cwd: new URL('..', import.meta.url).pathname, env: { PATH: process.env.PATH ?? '', HOME: altra, MYYND_DATI: altra }
    }).toString()
    assert.match(fuori, /Conti nuovi 2 · prima fonte 2/)
    assert.deepEqual(readdirSync(altra), [], 'niente scritto altrove')
    assert.equal(readdirSync(join(CASA, 'misure')).some(n => n.endsWith('.db')), false)
  } finally { rmSync(altra, { recursive: true, force: true }) }
})

test('imbuto.json del conto viaggia in «Scarica tutti i miei dati»', () => {
  const testo = chi.dentro(anna, () => [...fascicolo.scrivi()].join(''))
  assert.match(testo, /imbuto\.json/)
})
