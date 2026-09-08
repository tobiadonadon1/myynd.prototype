// I binari nativi: ogni pacchetto porta il suo, e solo il suo.
//
// pdf-parse porta con sé @napi-rs/canvas, che è JavaScript più un pacchetto
// per piattaforma e architettura (`@napi-rs/canvas-darwin-arm64`,
// `-darwin-x64`, `-win32-x64-msvc`…) con dentro il solo file `.node`. npm
// installa quello del computer su cui gira, ed electron-builder raccoglie
// quello che trova in node_modules: costruendo il DMG x64 o l'installatore di
// Windows da un Mac Apple silicon, dentro finiva il binario arm64, e su quei
// computer canvas non si caricava.
//
// La soluzione non passa da node_modules — metterci un pacchetto di un'altra
// piattaforma manda in confusione `npm list`, da cui electron-builder ricava
// l'elenco dei moduli, e il pacchetto usciva vuoto. Si tengono invece i
// pacchetti di canvas in una cache fuori dal progetto, uno per piattaforma e
// architettura, e da lì entrano nel pacchetto come file in più:
//  - `voci(piattaforma)` dà a build/configura.cjs le righe di `files` per
//    quella piattaforma: fuori tutti i `canvas-*` raccolti da node_modules,
//    dentro quello della cache con il nome scritto con `${arch}`, che
//    electron-builder espande per ogni target;
//  - prima di raccogliere i file (`beforePack`) ci si assicura che in cache
//    ci sia il pacchetto giusto alla stessa versione di @napi-rs/canvas —
//    copiato da node_modules se è quello di questo computer, scaricato con
//    `npm pack` altrimenti, una volta sola;
//  - dopo (`afterPack`) si guarda dentro il pacchetto: il binario c'è, è
//    davvero per quell'architettura (lo dice l'intestazione del file), il suo
//    package.json sta nell'archivio asar — è da lì che `require` lo trova —
//    e degli altri non c'è traccia.
//
// CommonJS come gli altri file di build/: electron-builder lo carica con
// `require`, e il package.json dice `"type": "module"`.
const { execFileSync } = require('node:child_process')
const {
  closeSync, cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, renameSync, rmSync
} = require('node:fs')
const { homedir, tmpdir } = require('node:os')
const { join } = require('node:path')

const NAPI = join(__dirname, '..', 'node_modules', '@napi-rs')

// l'enum Arch di builder-util (0 ia32, 1 x64, 2 armv7l, 3 arm64, 4 universal):
// lo si legge da lì quando c'è, e i numeri restano di scorta
const ARCHI = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64', 4: 'universal' }
function nomeArch(arch) {
  try {
    const { Arch } = require('builder-util')
    if (typeof Arch[arch] === 'string') return Arch[arch]
  } catch { /* si va con la tabella */ }
  return ARCHI[arch] ?? String(arch)
}

/** Come @napi-rs chiama il pacchetto di questa piattaforma; `arch` può essere anche `${arch}`, da espandere dopo. */
function suffisso(piattaforma, arch) {
  return piattaforma === 'darwin' ? `darwin-${arch}`
    : piattaforma === 'win32' ? `win32-${arch}-msvc`
    : `linux-${arch}-gnu`
}

/** Il pacchetto di canvas per questa piattaforma e architettura, e il nome del suo `.node`. */
function pacchetto(piattaforma, arch) {
  return { nome: `canvas-${suffisso(piattaforma, arch)}`, binario: `skia.${suffisso(piattaforma, arch)}.node` }
}

/** Dove stanno i pacchetti di canvas, fuori dal progetto: si scaricano una volta, non a ogni pacchetto. */
function cache() {
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Caches', 'myynd-binari')
  if (process.platform === 'win32') return join(process.env.LOCALAPPDATA || tmpdir(), 'myynd-binari')
  return join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'myynd-binari')
}

/**
 * Le righe di `files` per una piattaforma di electron-builder (`mac`, `win`,
 * `linux`): via i `canvas-*` che arrivano da node_modules, dentro quello
 * della cache. Il nome resta con `${arch}`: lo espande electron-builder,
 * target per target, sia nel percorso di partenza che in quello di arrivo.
 */
function voci(piattaforma) {
  const nome = `canvas-${suffisso(piattaforma, '${arch}')}`
  return [
    '!node_modules/@napi-rs/canvas-*/**',
    { from: join(cache(), '@napi-rs', nome), to: `node_modules/@napi-rs/${nome}` }
  ]
}

function versioneDi(cartella) {
  return JSON.parse(readFileSync(join(cartella, 'package.json'), 'utf8')).version
}

/* ------------------------------------------------------------- prima: c'è? */

/** `npm pack` del pacchetto nella cache; torna il percorso del tarball. */
function scarica(nome, versione, dove) {
  const tgz = join(dove, `napi-rs-${nome}-${versione}.tgz`)
  if (existsSync(tgz)) return tgz
  console.log(`  • scarico @napi-rs/${nome}@${versione} in ${dove}`)
  // dentro `npm run` si sa dov'è npm: lo si chiama con lo stesso node, che
  // su Windows evita il giro per `npm.cmd` e la shell
  const cli = process.env.npm_execpath
  const args = ['pack', `@napi-rs/${nome}@${versione}`, '--pack-destination', dove]
  if (cli && /\.[cm]?js$/.test(cli)) {
    execFileSync(process.execPath, [cli, ...args], { stdio: ['ignore', 'ignore', 'inherit'] })
  } else {
    execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args,
      { stdio: ['ignore', 'ignore', 'inherit'], shell: process.platform === 'win32' })
  }
  if (!existsSync(tgz)) throw new Error(`npm pack non ha lasciato ${tgz}`)
  return tgz
}

async function beforePack(contesto) {
  const piattaforma = contesto.electronPlatformName
  const arch = nomeArch(contesto.arch)
  if (arch === 'universal') throw new Error('niente pacchetto universale: canvas ha un binario per architettura')
  const { nome } = pacchetto(piattaforma, arch)
  const versione = versioneDi(join(NAPI, 'canvas'))
  const dove = join(cache(), '@napi-rs')
  const cartella = join(dove, nome)
  mkdirSync(dove, { recursive: true })

  if (existsSync(join(cartella, 'package.json'))) {
    const sua = versioneDi(cartella)
    if (sua === versione) {
      console.log(`  • @napi-rs/${nome}@${versione} è in cache (${dove})`)
      return
    }
    console.log(`  • @napi-rs/${nome} in cache è alla ${sua} e canvas alla ${versione}: lo rimetto`)
    rmSync(cartella, { recursive: true, force: true })
  }

  // si prepara accanto alla destinazione e si rinomina alla fine: stesso
  // disco, una mossa sola, niente pacchetto a metà se qualcosa si ferma
  const lavoro = mkdtempSync(join(dove, `.${nome}-`))
  try {
    const installato = join(NAPI, nome)
    if (existsSync(join(installato, 'package.json')) && versioneDi(installato) === versione) {
      // è quello di questo computer: npm l'ha già scaricato
      cpSync(installato, join(lavoro, 'package'), { recursive: true })
      console.log(`  • @napi-rs/${nome}@${versione} copiato da node_modules in cache`)
    } else {
      // `tar` c'è su macOS, Linux e Windows 10 in su, e non è una dipendenza da installare
      const tgz = scarica(nome, versione, dove)
      execFileSync('tar', ['-xzf', tgz, '-C', lavoro], { stdio: ['ignore', 'ignore', 'inherit'] })
      console.log(`  • @napi-rs/${nome}@${versione} scompattato in cache`)
    }
    renameSync(join(lavoro, 'package'), cartella)
  } finally {
    rmSync(lavoro, { recursive: true, force: true })
  }
}

/* ------------------------------------------------------------ dopo: è lui? */

/**
 * Per chi è compilato un binario, letto dall'intestazione del file.
 *
 * Mach-O a 64 bit comincia con il magico FEEDFACF e il tipo di CPU subito
 * dopo; un fat (CAFEBABE) è universale; ELF ha la macchina al byte 18; un
 * PE comincia con «MZ», e la macchina sta quattro byte dopo la firma «PE»,
 * il cui scarto è scritto al byte 0x3C.
 */
function architettura(file) {
  const fd = openSync(file, 'r')
  try {
    const testa = Buffer.alloc(64)
    readSync(fd, testa, 0, 64, 0)
    if (testa.readUInt32LE(0) === 0xfeedfacf) {
      const cpu = testa.readUInt32LE(4)
      return cpu === 0x0100000c ? 'darwin/arm64' : cpu === 0x01000007 ? 'darwin/x64' : `darwin/cpu ${cpu}`
    }
    if (testa.readUInt32BE(0) === 0xcafebabe) return 'darwin/universal'
    if (testa[0] === 0x7f && testa.toString('ascii', 1, 4) === 'ELF') {
      const m = testa.readUInt16LE(18)
      return m === 0x3e ? 'linux/x64' : m === 0xb7 ? 'linux/arm64' : `linux/macchina ${m}`
    }
    if (testa.toString('ascii', 0, 2) === 'MZ') {
      const pe = Buffer.alloc(6)
      readSync(fd, pe, 0, 6, testa.readUInt32LE(0x3c))
      if (pe.toString('ascii', 0, 4) !== 'PE\0\0') return 'win32/senza firma PE'
      const m = pe.readUInt16LE(4)
      return m === 0x8664 ? 'win32/x64' : m === 0xaa64 ? 'win32/arm64' : m === 0x14c ? 'win32/ia32' : `win32/macchina ${m}`
    }
    return 'sconosciuta'
  } finally {
    closeSync(fd)
  }
}

async function afterPack(contesto) {
  const piattaforma = contesto.electronPlatformName
  const arch = nomeArch(contesto.arch)
  const { nome, binario } = pacchetto(piattaforma, arch)
  const risorse = piattaforma === 'darwin'
    ? join(contesto.appOutDir, `${contesto.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : join(contesto.appOutDir, 'resources')
  const spacchettati = join(risorse, 'app.asar.unpacked', 'node_modules', '@napi-rs')
  if (!existsSync(spacchettati)) throw new Error(`manca ${spacchettati}: canvas non è nel pacchetto`)

  // gli altri li tiene fuori il filtro di `voci`; se uno è passato lo stesso,
  // via — e lo si dice, perché vuol dire che il filtro non ha fatto il suo
  for (const voce of readdirSync(spacchettati)) {
    if (!voce.startsWith('canvas-') || voce === nome) continue
    rmSync(join(spacchettati, voce), { recursive: true, force: true })
    console.log(`  • @napi-rs/${voce} era nel pacchetto ${piattaforma}/${arch}: tolto (il filtro non l'ha fermato)`)
  }

  const file = join(spacchettati, nome, binario)
  if (!existsSync(file)) throw new Error(`manca ${nome}/${binario} in ${spacchettati}: senza, i PDF non si leggono`)
  const vista = architettura(file)
  if (vista !== `${piattaforma}/${arch}`) throw new Error(`${binario} è ${vista}, il pacchetto è ${piattaforma}/${arch}`)

  // il package.json del pacchetto deve stare nell'indice dell'asar: è da lì
  // che `require('@napi-rs/canvas-…')` arriva al .node spacchettato
  const asar = require('@electron/asar')
  const dentro = new Set(asar.listPackage(join(risorse, 'app.asar'), { isPack: false }).map(p => p.replace(/\\/g, '/')))
  const vietati = [...dentro].filter(p => /^\/(?:\.env[^/]*|dist-app|src|\.git)(?:\/|$)/.test(p) || /^\/(?:server|desktop)\/.*\.test\.ts$/.test(p))
  if (vietati.length) throw new Error('Il pacchetto include file di sviluppo o configurazione privata: build interrotta')
  if (!dentro.has(`/node_modules/@napi-rs/${nome}/package.json`)) {
    throw new Error(`app.asar non ha node_modules/@napi-rs/${nome}/package.json: canvas non si caricherebbe`)
  }
  const altri = [...dentro].filter(p => /^\/node_modules\/@napi-rs\/canvas-[^/]+\/package\.json$/.test(p) && !p.includes(`/${nome}/`))
  if (altri.length) throw new Error(`nell'asar ci sono anche ${altri.join(', ')}: il filtro non ha fatto il suo`)

  console.log(`  • @napi-rs/${nome}: ${binario} è ${vista}, ed è l'unico`)
}

module.exports = { beforePack, afterPack, voci, architettura, pacchetto, cache }
