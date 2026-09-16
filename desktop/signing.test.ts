import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const { signingConfiguration } = createRequire(import.meta.url)('../build/signing.cjs')
test('local signing is stable, explicit, and never silently downgrades a broken pin', () => {
  const dir = mkdtempSync(join(tmpdir(), 'myynd-signing-'))
  const file = join(dir, 'identity.json')
  try {
    assert.equal(signingConfiguration({}, {}, file).identity, '-')
    writeFileSync(file, JSON.stringify({ identity: 'Apple Development: Example (TEAM)' }))
    const signed = signingConfiguration({ hardenedRuntime: true }, {}, file)
    assert.equal(signed.identity, 'Apple Development: Example (TEAM)')
    assert.equal(signed.type, 'development')
    assert.equal(signed.notarize, false)
    assert.equal(signed.hardenedRuntime, true)
    writeFileSync(file, '{broken')
    assert.throws(() => signingConfiguration({}, {}, file))
    assert.deepEqual(signingConfiguration({ hardenedRuntime: true }, { CSC_NAME: 'Release' }, file), { hardenedRuntime: true })
    assert.deepEqual(signingConfiguration({}, { CSC_LINK: '/certificate.p12' }, file), {})
    writeFileSync(file, JSON.stringify({ identity: '-' }))
    assert.throws(() => signingConfiguration({}, {}, file), /Invalid local signing identity/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
