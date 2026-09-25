// Una cartella che macOS nega non è una cartella sparita.
//
// Le due finivano insieme in `illeggibili`, e la salute delle fonti non
// poteva dire «manca l'accesso completo al disco» a chi doveva solo darlo:
// EPERM adesso si conta anche a parte, in `negate`.
//
//   node --test server/desktop-negate.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-negate-'))
process.env.MYYND_DATI = join(CASA, 'dati')
const desktop = await import('./connettori/desktop.ts')
const store = await import('./store.ts')

after(() => { desktop.usaElenco(null); store.chiudiIndici(); rmSync(CASA, { recursive: true, force: true }) })

const PRIVATA = join(CASA, 'privata')
const SPARITA = join(CASA, 'sparita')
const BUONA = join(CASA, 'buona')
mkdirSync(PRIVATA); mkdirSync(BUONA)

const finto = ((dove: string, o: unknown) => {
  if (dove === PRIVATA) return Promise.reject(Object.assign(new Error('operation not permitted'), { code: 'EPERM' }))
  if (dove === SPARITA) return Promise.reject(Object.assign(new Error('no such file'), { code: 'ENOENT' }))
  return readdir(dove, o as never)
}) as typeof readdir

test('EPERM finisce fra le negate e fra le illeggibili; ENOENT solo fra le illeggibili', async () => {
  desktop.usaElenco(finto)
  const e = await desktop.sincronizza({ cartelle: [PRIVATA, SPARITA, BUONA], scelte: true } as never)
  assert.deepEqual(e.illeggibili, [PRIVATA, SPARITA])
  assert.deepEqual(e.negate, [PRIVATA])
  assert.ok(e.complete.includes(BUONA))
})

test('senza cartelle negate, `negate` è vuoto (counter-case)', async () => {
  desktop.usaElenco(finto)
  const e = await desktop.sincronizza({ cartelle: [SPARITA, BUONA], scelte: true } as never)
  assert.deepEqual(e.negate, [])
  assert.deepEqual(e.illeggibili, [SPARITA])
})
