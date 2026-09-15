import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const build = require('../build/chatgpt-runtime.cjs')
const manifest = require('../build/codex-runtime.json')

test('every desktop target uses the pinned official registry artifact', () => {
  for (const [platform, arch] of [['darwin', 'arm64'], ['darwin', 'x64'], ['win32', 'x64'], ['win32', 'arm64']]) {
    const d = build.descrizione(platform, arch)
    assert.equal(d.tarball, `https://registry.npmjs.org/@openai/codex/-/codex-0.145.0-${platform}-${arch}.tgz`)
    assert.match(d.integrity, /^sha512-/)
    assert.ok(d.member.endsWith(platform === 'win32' ? '/bin/codex.exe' : '/bin/codex'))
  }
  assert.throws(() => build.descrizione('darwin', 'universal'), /Unsupported/)
  assert.equal(build.voci('darwin')[0].to, 'chatgpt-runtime')
  assert.ok(build.voci('darwin')[0].from.includes('darwin-${arch}'))
})

test('archive integrity is verified before extraction', () => {
  const bytes = Buffer.from('test-only archive')
  const valid = 'sha512-' + createHash('sha512').update(bytes).digest('base64')
  build.integrita(bytes, valid)
  assert.throws(() => build.integrita(Buffer.from('tampered'), valid), /integrity mismatch/)
})

test('packaging rejects the wrong architecture, corrupted binaries and missing licenses', () => {
  const dir = mkdtempSync(join(tmpdir(), 'myynd-runtime-build-'))
  try {
    mkdirSync(join(dir, 'bin'))
    const bytes = Buffer.alloc(64)
    bytes.writeUInt32LE(0xfeedfacf); bytes.writeUInt32LE(0x0100000c, 4)
    writeFileSync(join(dir, 'bin', 'codex'), bytes)
    const m = { version: manifest.version, platform: 'darwin', arch: 'arm64', integrity: manifest.targets['darwin-arm64'].integrity,
      sha256: createHash('sha256').update(bytes).digest('hex') }
    writeFileSync(join(dir, 'runtime.json'), JSON.stringify(m))
    assert.throws(() => build.verifica(dir, 'darwin', 'arm64'), /LICENSE is missing/)
    writeFileSync(join(dir, 'LICENSE'), 'Apache-2.0 fixture'); writeFileSync(join(dir, 'NOTICE'), 'notice fixture')
    build.verifica(dir, 'darwin', 'arm64')
    assert.throws(() => build.verifica(dir, 'darwin', 'x64'), /pinned target/)
    bytes[40] = 1; writeFileSync(join(dir, 'bin', 'codex'), bytes)
    assert.throws(() => build.verifica(dir, 'darwin', 'arm64'), /checksum mismatch/)
    assert.ok(readFileSync(new URL('../build/configura.cjs', import.meta.url), 'utf8').includes('await chatgpt.afterPack(ctx)'))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
