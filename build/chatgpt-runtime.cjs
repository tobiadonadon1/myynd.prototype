// Official Codex binaries, pinned by version AND registry SHA512. Downloaded
// at build time, never on a customer's first login and never through npm hooks.
const { createHash } = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { cache, architettura } = require('./binari.cjs')
const manifest = require('./codex-runtime.json')
const triples = { 'darwin-arm64': 'aarch64-apple-darwin', 'darwin-x64': 'x86_64-apple-darwin',
  'win32-x64': 'x86_64-pc-windows-msvc', 'win32-arm64': 'aarch64-pc-windows-msvc',
  'linux-x64': 'x86_64-unknown-linux-musl', 'linux-arm64': 'aarch64-unknown-linux-musl' }

function destinazione(platform, arch) { return join(cache(), 'codex', manifest.version, `${platform}-${arch}`) }
function nomeBinario(platform) { return platform === 'win32' ? 'codex.exe' : 'codex' }
function integrita(bytes, expected) {
  if (`sha512-${createHash('sha512').update(bytes).digest('base64')}` !== expected) throw new Error('Codex runtime archive integrity mismatch')
}
function descrizione(platform, arch) {
  const target = `${platform}-${arch}`
  const m = manifest.targets[target]
  if (!m || !triples[target]) throw new Error(`Unsupported Codex runtime target: ${target}`)
  if (m.tarball !== `https://registry.npmjs.org/@openai/codex/-/codex-${manifest.version}-${target}.tgz`
    || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(m.integrity)) throw new Error('Invalid pinned Codex distribution')
  return { ...m, target, member: `package/vendor/${triples[target]}/bin/${nomeBinario(platform)}` }
}
function verifica(dir, platform, arch) {
  const expected = descrizione(platform, arch)
  const m = JSON.parse(readFileSync(join(dir, 'runtime.json'), 'utf8'))
  const file = join(dir, 'bin', nomeBinario(platform))
  if (m.version !== manifest.version || m.platform !== platform || m.arch !== arch || m.integrity !== expected.integrity)
    throw new Error('Codex runtime metadata does not match the pinned target')
  if (architettura(file) !== `${platform}/${arch}`) throw new Error('Codex runtime architecture mismatch')
  if (createHash('sha256').update(readFileSync(file)).digest('hex') !== m.sha256) throw new Error('Codex runtime binary checksum mismatch')
  for (const name of ['LICENSE', 'NOTICE']) if (!existsSync(join(dir, name))) throw new Error(`Codex runtime ${name} is missing`)
}
async function prepara(platform, arch) {
  const d = descrizione(platform, arch)
  const dest = destinazione(platform, arch)
  if (existsSync(dest)) {
    verifica(dest, platform, arch)
    return dest
  }
  const parent = join(cache(), 'codex', manifest.version)
  mkdirSync(parent, { recursive: true })
  const temp = mkdtempSync(join(parent, '.preparing-'))
  try {
    console.log(`  • preparing official Codex ${manifest.version} for ${d.target}`)
    const response = await fetch(d.tarball, { redirect: 'error', signal: AbortSignal.timeout(240_000) })
    if (!response.ok) throw new Error(`Codex runtime download failed (${response.status})`)
    const bytes = Buffer.from(await response.arrayBuffer())
    integrita(bytes, d.integrity)
    const tgz = join(temp, 'runtime.tgz')
    writeFileSync(tgz, bytes)
    // Extract one known member from the verified archive. We do not ship the
    // native shell, search or code-mode helpers: Myynd provides its own tools.
    execFileSync('tar', ['-xzf', tgz, '-C', temp, d.member], { stdio: 'ignore' })
    const prepared = join(temp, 'ready')
    mkdirSync(join(prepared, 'bin'), { recursive: true })
    const binary = join(prepared, 'bin', nomeBinario(platform))
    copyFileSync(join(temp, d.member), binary)
    chmodSync(binary, 0o755)
    for (const name of ['LICENSE', 'NOTICE']) copyFileSync(join(__dirname, 'vendor', 'codex', name), join(prepared, name))
    writeFileSync(join(prepared, 'runtime.json'), JSON.stringify({ version: manifest.version, platform, arch,
      source: manifest.source, integrity: d.integrity, sha256: createHash('sha256').update(readFileSync(binary)).digest('hex') }, null, 2) + '\n')
    verifica(prepared, platform, arch)
    renameSync(prepared, dest)
    return dest
  } finally { rmSync(temp, { recursive: true, force: true }) }
}
function voci(platform) { return [{ from: destinazione(platform, '${arch}'), to: 'chatgpt-runtime', filter: ['**/*'] }] }
function archNome(arch) { return typeof arch === 'string' ? arch : ({ 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64', 4: 'universal' })[arch] }
async function beforePack(ctx) { await prepara(ctx.electronPlatformName, archNome(ctx.arch)) }
async function afterPack(ctx) {
  const platform = ctx.electronPlatformName
  const resources = platform === 'darwin'
    ? join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`, 'Contents', 'Resources') : join(ctx.appOutDir, 'resources')
  verifica(join(resources, 'chatgpt-runtime'), platform, archNome(ctx.arch))
}
module.exports = { beforePack, afterPack, prepara, voci, destinazione, descrizione, integrita, verifica }
if (require.main === module) prepara(process.platform, process.arch).then(dir => console.log(`ChatGPT runtime ready: ${dir}`)).catch(e => { console.error(e.message); process.exitCode = 1 })
