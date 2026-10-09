// Una Myynd sola sul Mac: quella in Applicazioni.
//
// Ogni pacchetto lasciava dietro di sé una copia che macOS conosceva: le due
// in dist-app (arm64 e x64), quelle nei worktree degli agenti, quelle dei DMG
// montati per un attimo. Launch Services le registra appena le vede, Spotlight
// le indicizza, e «Apri con», le notifiche e i permessi del Mac finivano a
// volte su una copia di build invece che su quella installata: per chi guarda,
// mille Myynd. Dopo ogni pacchetto (`npm run pacchetto:mac`) e dopo la prova
// dell'app impacchettata (`prove/app.mjs`) questo file toglie da Launch
// Services ogni Myynd che non sta in /Applications, e lascia in dist-app un
// `.metadata_never_index` perché Spotlight non le elenchi più. Non cancella
// nessun file: toglie solo la registrazione.
//
//   node build/una-sola.cjs           toglie le copie in più
//   node build/una-sola.cjs --prova   dice cosa toglierebbe, e non tocca niente
//
// CommonJS come gli altri file di build/: il package.json dice "type": "module".

const { spawnSync } = require('node:child_process')
const { existsSync, mkdirSync, readdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { homedir } = require('node:os')

const LSREGISTER = '/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister'
const ID = 'com.myynd.app'
/** L'unica copia che resta registrata: quella installata. */
const INSTALLATA = '/Applications/Myynd.app'
/**
 * Anche quella in ~/Applications è installata: chi non è amministratore la
 * mette lì, e ogni pacchetto la toglieva da Launch Services.
 */
const INSTALLATE = (casa = homedir()) => [INSTALLATA, join(casa, 'Applications', 'Myynd.app')]

/**
 * Le Myynd che Launch Services conosce, dal testo di `lsregister -dump`.
 *
 * Il testo è a blocchi, una riga `path:` e più sotto una `identifier:`; si
 * prende il percorso dei soli blocchi con l'identificatore dell'app (non
 * quelli degli aiutanti, `com.myynd.app.helper`, che stanno dentro l'app e se
 * ne vanno con lei). Il percorso finisce con un numero fra parentesi.
 */
function registrate(dump) {
  const trovate = new Set()
  let percorso = ''
  for (const riga of String(dump).split('\n')) {
    if (/^-{10,}/.test(riga)) { percorso = ''; continue }
    const p = /^path:\s+(.+?)(?:\s+\(0x[0-9a-f]+\))?\s*$/i.exec(riga)
    if (p) { percorso = p[1]; continue }
    const i = /^identifier:\s+(\S+)\s*$/.exec(riga)
    if (i && i[1] === ID && percorso) trovate.add(percorso)
  }
  return [...trovate]
}

/** Quelle da togliere: tutte tranne le installate. */
function daTogliere(percorsi, installate = INSTALLATE()) {
  const restano = new Set(Array.isArray(installate) ? installate : [installate])
  return percorsi.filter(p => !restano.has(p))
}

/** Le app che un pacchetto ha appena lasciato in dist-app (`mac`, `mac-arm64`, …). */
function inDistApp(radice) {
  const dist = join(radice, 'dist-app')
  if (!existsSync(dist)) return []
  return readdirSync(dist, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^mac/.test(d.name))
    .map(d => join(dist, d.name, 'Myynd.app'))
    .filter(existsSync)
}

/** Spotlight non entra in dist-app: il file vuoto è la convenzione che rispetta. */
function nonIndicizzare(radice) {
  const dist = join(radice, 'dist-app')
  mkdirSync(dist, { recursive: true })
  writeFileSync(join(dist, '.metadata_never_index'), '')
}

/**
 * Il giro intero. `esegui` è chi chiama lsregister: di serie il vero, nelle
 * prove uno finto che risponde e segna, così il Mac di chi prova non si tocca.
 */
function unaSola({ radice = join(__dirname, '..'), prova = false, casa = homedir(), esegui = (args) => spawnSync(LSREGISTER, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }) } = {}) {
  if (!prova) nonIndicizzare(radice)
  const dump = esegui(['-dump'])
  const viste = registrate(dump?.stdout ?? '')
  const installate = INSTALLATE(casa)
  // quelle di dist-app si tolgono anche se il dump non le nomina ancora: la
  // registrazione arriva in ritardo, e un pacchetto appena fatto la riceve dopo
  const tutte = [...new Set([...daTogliere(viste, installate), ...inDistApp(radice)])]
  if (!prova) for (const p of tutte) esegui(['-u', p])
  return { tolte: tutte, resta: installate.find(p => viste.includes(p)) ?? null }
}

if (require.main === module) {
  if (process.platform !== 'darwin') process.exit(0)
  const prova = process.argv.includes('--prova')
  try {
    const r = unaSola({ prova })
    for (const p of r.tolte) console.log(`myynd · una sola · ${prova ? 'toglierei' : 'tolta'} ${p}`)
    console.log(`myynd · una sola · ${r.resta ? `resta ${r.resta}` : 'nessuna Myynd installata in Applicazioni'}`)
  } catch (e) {
    // non ferma mai il pacchetto: è pulizia, non costruzione
    console.error(`myynd · una sola · ${e instanceof Error ? e.message : e}`)
  }
}

module.exports = { registrate, daTogliere, inDistApp, nonIndicizzare, unaSola, INSTALLATA, INSTALLATE, LSREGISTER }
