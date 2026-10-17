// Il segreto del guscio non si legge dall'ambiente del server.
//
// L'attacco: uno script qualunque col suo utente legge l'ambiente di partenza
// di un altro processo (`ps eww`, `sysctl kern.procargs2`), anche dopo che il
// server ha fatto `delete process.env.X`. Con il segreto e l'indirizzo del
// padrone chiamava `/api/auth/reimposta/mac` e si prendeva un conto. Adesso
// nell'ambiente c'è solo il percorso di un file 0600 che il server cancella
// appena letto.
//
//   node --import ./build/test-profile.mjs --test server/segreto-guscio.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AUTH = fileURLToPath(new URL('./auth.ts', import.meta.url))

/** Un server finto: carica auth.ts come il vero, dice «pronto», e aspetta. */
async function conServer(env: Record<string, string>, guarda: (pid: number) => void): Promise<void> {
  const p = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e',
    `const a = await import(${JSON.stringify(AUTH)}); console.log('pronto ' + a.segretoPerProva().length); setInterval(() => {}, 1000)`],
  { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'inherit'] })
  try {
    await new Promise<void>((ok, ko) => {
      p.stdout!.on('data', d => { if (String(d).includes('pronto')) ok() })
      p.on('exit', c => ko(new Error(`uscito ${c}`)))
    })
    guarda(p.pid!)
  } finally { p.kill('SIGKILL') }
}

/** Quello che chiunque col suo utente vede del processo: comando e ambiente di partenza. */
const visto = (pid: number) => execFileSync('/bin/ps', ['eww', '-o', 'command=', '-p', String(pid)], { encoding: 'utf8' })

const SEGRETO = 'c3'.repeat(32)

test('prima: il segreto nell’ambiente resta leggibile da fuori anche dopo il delete', { skip: process.platform !== 'darwin' && 'ps eww del Mac' }, async () => {
  await conServer({ MYYND_GUSCIO_SEGRETO: SEGRETO }, pid => assert.match(visto(pid), new RegExp(SEGRETO)))
})

test('adesso: nell’ambiente solo un percorso, il file sparisce appena letto, e il server ha il segreto', { skip: process.platform !== 'darwin' && 'ps eww del Mac' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'myynd-segreto-'))
  const file = join(dir, 'guscio')
  writeFileSync(file, SEGRETO, { mode: 0o600 })
  try {
    await conServer({ MYYND_GUSCIO_SEGRETO_FILE: file }, pid => {
      assert.doesNotMatch(visto(pid), new RegExp(SEGRETO), 'il segreto non si legge da fuori')
      assert.equal(existsSync(file), false, 'il file è stato cancellato')
    })
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('il server legge il segreto dal file, e lo cancella', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'myynd-segreto-'))
  const file = join(dir, 'guscio')
  writeFileSync(file, SEGRETO, { mode: 0o600 })
  process.env.MYYND_GUSCIO_SEGRETO_FILE = file
  try {
    const auth = await import('./auth.ts')
    assert.equal(auth.segretoPerProva(), SEGRETO)
    assert.equal(auth.dalGuscio(SEGRETO), true)
    assert.equal(existsSync(file), false)
    assert.equal(process.env.MYYND_GUSCIO_SEGRETO_FILE, undefined)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
