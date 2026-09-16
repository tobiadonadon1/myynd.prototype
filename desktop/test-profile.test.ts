import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

test('test bootstrap isolates configuration writes from an inherited customer profile', () => {
  const customer = mkdtempSync(join(tmpdir(), 'myynd-test-sentinel-'))
  const sentinel = JSON.stringify({ nome: 'unchanged', claudeCon: 'abbonamento', abbonamento: { attivo: true } })
  writeFileSync(join(customer, 'config.json'), sentinel)
  try {
    const code = `import * as cfg from ${JSON.stringify(new URL('../server/config.ts', import.meta.url).href)}; cfg.scrivi({nome:'test write'});`
    const child = spawnSync(process.execPath, ['--import', fileURLToPath(new URL('../build/test-profile.mjs', import.meta.url)), '--input-type=module', '-e', code], {
      encoding: 'utf8', env: { ...process.env, MYYND_DATI: customer }
    })
    assert.equal(child.status, 0, child.stderr)
    assert.equal(readFileSync(join(customer, 'config.json'), 'utf8'), sentinel)
  } finally { rmSync(customer, { recursive: true, force: true }) }
})
