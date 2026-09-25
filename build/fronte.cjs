// Costruisce `desktop/bin/myynd-fronte`, il programma che dice al guscio chi
// c'è davanti (il sorgente è `desktop/bin/fronte.swift`).
//
// Universale: si compila una volta per arm64 e una per x86_64 e si uniscono
// con `lipo`, così lo stesso file va nei due pacchetti del Mac. Il binario non
// si committa (è in .gitignore): lo rifà `npm run fronte`, e `pacchetto:mac`
// lo rifà prima di impacchettare. Senza di lui l'app funziona lo stesso, con
// il ripiego che vede solo le app.
//
//   node build/fronte.cjs
const { execFileSync } = require('node:child_process')
const { chmodSync, mkdirSync, mkdtempSync, renameSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const radice = join(__dirname, '..')
const sorgente = join(radice, 'desktop', 'bin', 'fronte.swift')
const uscita = join(radice, 'desktop', 'bin', 'myynd-fronte')

if (process.platform !== 'darwin') {
  console.error('fronte · si costruisce solo su un Mac')
  process.exit(1)
}

let sdk
try {
  execFileSync('xcrun', ['--find', 'swiftc'], { encoding: 'utf8' })
  sdk = execFileSync('xcrun', ['--sdk', 'macosx', '--show-sdk-path'], { encoding: 'utf8' }).trim()
} catch {
  console.error('fronte · manca swiftc: installa gli strumenti da riga di comando di Xcode (xcode-select --install)')
  process.exit(1)
}

const lavoro = mkdtempSync(join(tmpdir(), 'myynd-fronte-'))
try {
  const pezzi = []
  for (const arch of ['arm64', 'x86_64']) {
    const fuori = join(lavoro, `myynd-fronte-${arch}`)
    execFileSync('xcrun', [
      '--sdk', 'macosx', 'swiftc', '-sdk', sdk, '-O', '-swift-version', '5', '-target', `${arch}-apple-macos13`,
      '-module-cache-path', join(lavoro, 'cache'),
      sorgente, '-o', fuori
    ], { stdio: 'inherit' })
    pezzi.push(fuori)
  }
  mkdirSync(join(radice, 'desktop', 'bin'), { recursive: true })
  const unito = join(lavoro, 'myynd-fronte')
  execFileSync('lipo', ['-create', ...pezzi, '-output', unito])
  chmodSync(unito, 0o755)
  renameSync(unito, uscita)
  console.log(execFileSync('lipo', ['-info', uscita], { encoding: 'utf8' }).trim())
} catch (e) {
  console.error(`fronte · non si è costruito: ${e.message}`)
  process.exitCode = 1
} finally {
  rmSync(lavoro, { recursive: true, force: true })
}
