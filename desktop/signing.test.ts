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
    const valid = () => ['Apple Development: Example (TEAM)']
    const signed = signingConfiguration({ hardenedRuntime: true }, {}, file, valid)
    assert.equal(signed.identity, 'Apple Development: Example (TEAM)')
    assert.equal(signed.type, 'development')
    assert.equal(signed.notarize, false)
    assert.equal(signed.hardenedRuntime, true)
    // 22 September 2026: the pinned certificate expired and the build went
    // ad-hoc without a word. An invalid pin stops the package instead.
    assert.throws(() => signingConfiguration({}, {}, file, () => []), /not valid on this Mac/)
    assert.throws(() => signingConfiguration({}, {}, file, () => ['Apple Development: Someone Else (OTHER)']), /Renew it in Xcode/)
    writeFileSync(file, '{broken')
    assert.throws(() => signingConfiguration({}, {}, file, valid))
    assert.deepEqual(signingConfiguration({ hardenedRuntime: true }, { CSC_NAME: 'Release' }, file), { hardenedRuntime: true })
    assert.deepEqual(signingConfiguration({}, { CSC_LINK: '/certificate.p12' }, file), {})
    writeFileSync(file, JSON.stringify({ identity: '-' }))
    assert.throws(() => signingConfiguration({}, {}, file, valid), /Invalid local signing identity/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('after packaging: signed as the app, never as Electron, and ad hoc only when asked', () => {
  const { giudicaFirma } = createRequire(import.meta.url)('../build/verifica-firma.cjs')
  const appId = 'com.myynd.app'
  // the build installed on 22 September 2026, with the certificate expired
  const quel = 'Executable=/Applications/Myynd.app/Contents/MacOS/Myynd\nIdentifier=Electron\nFormat=app bundle with Mach-O thin (arm64)\nSignature=adhoc\nTeamIdentifier=not set'
  assert.equal(giudicaFirma(quel, { appId, adhocAmmesso: true }).guai.length, 1, 'even when ad hoc is allowed, "Electron" is another app')
  assert.equal(giudicaFirma(quel, { appId, adhocAmmesso: false }).guai.length, 2)
  const adhoc = 'Identifier=com.myynd.app\nSignature=adhoc'
  assert.deepEqual(giudicaFirma(adhoc, { appId, adhocAmmesso: true }).guai, [])
  assert.match(giudicaFirma(adhoc, { appId, adhocAmmesso: false }).guai[0], /ad hoc/)
  const firmata = 'Identifier=com.myynd.app\nAuthority=Apple Development: tobia donadon (Z29F6698MB)\nTeamIdentifier=875LRYG4RF'
  assert.deepEqual(giudicaFirma(firmata, { appId, adhocAmmesso: false }).guai, [])
})

test('ad hoc on purpose is an explicit switch, and the pin stays for next time', () => {
  const dir = mkdtempSync(join(tmpdir(), 'myynd-signing-'))
  const file = join(dir, 'identity.json')
  try {
    writeFileSync(file, JSON.stringify({ identity: 'Apple Development: Example (TEAM)' }))
    assert.equal(signingConfiguration({}, { MYYND_FIRMA_ADHOC: '1' }, file, () => []).identity, '-')
    assert.throws(() => signingConfiguration({}, {}, file, () => []), /not valid on this Mac/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
