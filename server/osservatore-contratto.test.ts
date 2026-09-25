// Il contratto col guscio (P1A): gli stessi messaggi, alla lettera.
//
//   node --test server/osservatore-contratto.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-contratto-'))
process.env.MYYND_DATI = CASA
process.env.MYYND_APP = '1'

const conti = await import('./conti.ts')
const chi = await import('./chi.ts')
const cfg = await import('./config.ts')
const store = await import('./store.ts')
const oss = await import('./osservatore.ts')

export const DAL_GUSCIO = [
  { tipo: 'osservatore', sessioni: [
    { bundle: 'com.apple.Safari', app: 'Safari', titolo: 'Northwind pricing - Google Docs', inizio: '2026-09-24T07:10:00.000Z', fine: '2026-09-24T07:14:30.000Z', secondi: 270 },
    { bundle: 'com.microsoft.VSCode', app: 'Code', titolo: null, inizio: '2026-09-24T07:14:30.000Z', fine: '2026-09-24T07:40:00.000Z', secondi: 1530 }
  ] },
  { tipo: 'osservatore-chiedi' },
  { tipo: 'osservatore-pausa', minuti: 60 },
  { tipo: 'osservatore-riprendi' }
]
export const DAL_SERVER = [
  { tipo: 'osservatore-stato', acceso: true, titoli: true, pausaFino: null },
  { tipo: 'osservatore-stato', acceso: true, titoli: false, pausaFino: '2026-09-24T08:10:00.000Z' },
  { tipo: 'osservatore-stato', acceso: false, titoli: false, pausaFino: null }
]

let anna = ''
let ascoltatore: ((m: { data?: unknown }) => void) | null = null
const mandati: Record<string, unknown>[] = []
const porta = {
  on(_e: 'message', f: (m: { data?: unknown }) => void) { ascoltatore = f },
  postMessage(m: unknown) { mandati.push(m as Record<string, unknown>) }
}
const manda = (m: unknown) => ascoltatore!({ data: m })

before(async () => {
  const a = await conti.registra('anna@esempio.it', 'passwordlunga1')
  assert.ok(a.ok); anna = a.ok ? a.id : ''
  chi.dentro(anna, () => { cfg.scrivi({ lingua: 'en', fuso: 'Europe/Rome' }); store.azzeraTutto(); oss.imposta({ acceso: true }) })
})
after(() => { store.chiudiIndici(); rmSync(CASA, { recursive: true, force: true }) })

test('ascolta si registra sul filo, e ogni messaggio del guscio ha la risposta del contratto', () => {
  assert.equal(oss.ascolta(porta), true)
  assert.ok(ascoltatore)
  const chiavi = Object.keys(DAL_SERVER[0]!).sort()
  mandati.length = 0
  // 1. un mazzo: si scrive subito, senza risposta
  manda(DAL_GUSCIO[0])
  assert.equal(mandati.length, 0)
  const righe = (chi.dentro(anna, () => store.default.prepare('SELECT bundle, titolo, secondi FROM sessioni_app ORDER BY id').all()) as { bundle: string; titolo: string | null; secondi: number }[])
    .map(r => ({ bundle: r.bundle, titolo: r.titolo, secondi: r.secondi }))
  assert.deepEqual(righe, [{ bundle: 'com.apple.Safari', titolo: 'Northwind pricing - Google Docs', secondi: 270 }, { bundle: 'com.microsoft.VSCode', titolo: null, secondi: 1530 }])
  // 2. chiedi: uno stato, con le quattro chiavi e basta (e vede le righe appena scritte: in ordine)
  manda(DAL_GUSCIO[1])
  assert.equal(mandati.length, 1)
  assert.deepEqual(Object.keys(mandati[0]!).sort(), chiavi)
  assert.deepEqual(mandati[0], DAL_SERVER[0])
  // 3. pausa: lo stato con pausaFino a un'ora
  manda(DAL_GUSCIO[2])
  assert.equal(mandati.length, 2)
  assert.deepEqual(Object.keys(mandati[1]!).sort(), chiavi)
  assert.equal(mandati[1]!.acceso, true)
  assert.ok(typeof mandati[1]!.pausaFino === 'string' && Date.parse(mandati[1]!.pausaFino as string) > Date.now() + 59 * 60_000)
  // 4. riprendi
  manda(DAL_GUSCIO[3])
  assert.equal(mandati.length, 3)
  assert.deepEqual(mandati[2], DAL_SERVER[0])
  // un tipo sconosciuto non ha risposta
  manda({ tipo: 'boh' }); manda(null); manda('osservatore-chiedi')
  assert.equal(mandati.length, 3)
})

test('gli esempi del server sono esattamente la forma che annuncia() produce', () => {
  chi.dentro(anna, () => oss.imposta({ titoli: false }))
  chi.dentro(anna, () => oss.pausa(60, new Date('2026-09-24T07:10:00.000Z')))
  mandati.length = 0
  // la pausa è passata (è nel passato): lo stato la mostra null
  manda(DAL_GUSCIO[1])
  assert.deepEqual(mandati[0], { tipo: 'osservatore-stato', acceso: true, titoli: false, pausaFino: null })
  for (const m of DAL_SERVER) assert.deepEqual(Object.keys(m).sort(), Object.keys(mandati[0]!).sort())
  chi.dentro(anna, () => oss.imposta({ acceso: false }))
  assert.deepEqual(mandati.at(-1), DAL_SERVER[2])
})
