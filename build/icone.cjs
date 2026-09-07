// Le icone dell'app, disegnate da build/icona.cjs.
//
// Si disegna il vettore a ogni misura invece di rimpicciolire un PNG grande:
// a 16 pixel un marchio ridimensionato è una macchia, uno disegnato apposta
// no.
//
// Il rasterizzatore è Electron, che c'è già fra le dipendenze. Prima era
// `qlmanage`, l'anteprima di Quick Look: comodo, ma appiattisce l'SVG su un
// fondo bianco *opaco*. Per un marchio che riempiva tutto il quadrato non si
// notava; per un'icona che deve avere gli angoli trasparenti è sbagliato, e
// infatti la vecchia build/icon.png aveva alfa 255 in tutti e quattro gli
// angoli — nel Dock il marchio su un francobollo bianco. Qui invece si apre
// una finestra senza cornice e trasparente, ci si carica dentro l'SVG alla
// misura giusta e si fotografa: l'alfa resta quello del disegno.
//
// Serve comunque un Mac, perché `iconutil` è di Apple. Si lancia con node —
// lo script si rilancia da sé sotto Electron, che è l'unico modo di avere
// una BrowserWindow:
//
//   node build/icone.cjs      → build/icon.png (1024), build/icon.icns, build/icon.ico,
//                               desktop/icone/tray.ico e trayAttesa.ico (la barra di Windows),
//                               desktop/icone/tray*Template*.png (la barra del Mac)

// Sotto node non esiste una BrowserWindow: `require('electron')` qui dà il
// percorso del binario, e ci si rilancia dentro passando lo stesso file.
if (!process.versions.electron) {
  const { execFileSync } = require('node:child_process')
  execFileSync(require('electron'), [__filename, ...process.argv.slice(2)], { stdio: 'inherit' })
  return
}

const { app, BrowserWindow } = require('electron')
const { execFileSync } = require('node:child_process')
const { mkdtempSync, writeFileSync, mkdirSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { ico } = require('./ico.cjs')
const { svgApp, svgBarra } = require('./icona.cjs')

// Senza questa la cattura verrebbe al fattore di scala dello schermo: su un
// Retina una finestra da 512 darebbe un PNG da 1024, e le misure non
// tornerebbero più. E niente GPU: qui non serve, e in headless dà noie.
app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.disableHardwareAcceleration()

const radice = join(__dirname, '..')
const icone = join(radice, 'desktop', 'icone')
const lavoro = mkdtempSync(join(tmpdir(), 'myynd-icone-'))

/** Il PNG di un SVG a `n` pixel di lato. La stessa coppia si disegna una volta sola. */
const fatti = new Map()
async function png(finestra, svg, n) {
  const chiave = `${n}:${svg}`
  if (fatti.has(chiave)) return fatti.get(chiave)
  const html = '<style>html,body{margin:0;background:transparent}svg{display:block}</style>'
    + svg.replace('<svg ', `<svg width="${n}" height="${n}" `)
  await finestra.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  // un giro di disegno prima di fotografare, se no si becca la pagina vuota
  await finestra.webContents.executeJavaScript(
    'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))')
  const img = await finestra.webContents.capturePage({ x: 0, y: 0, width: n, height: n })
  const dim = img.getSize()
  if (dim.width !== n || dim.height !== n) throw new Error(`chiesti ${n} px, tornati ${dim.width}×${dim.height}`)
  const buf = img.toPNG()
  fatti.set(chiave, { buf, bitmap: img.getBitmap(), n })
  return fatti.get(chiave)
}

/** Gli angoli devono restare vuoti: è tutto il punto di aver mollato qlmanage. */
function angoliVuoti({ bitmap, n }, dove) {
  const alfa = (x, y) => bitmap[(y * n + x) * 4 + 3]    // il bitmap è BGRA
  const q = [alfa(0, 0), alfa(n - 1, 0), alfa(0, n - 1), alfa(n - 1, n - 1)]
  if (q.some(a => a !== 0)) throw new Error(`${dove} a ${n} px: angoli con alfa ${q.join(', ')}, non 0`)
}

app.whenReady().then(async () => {
  const finestra = new BrowserWindow({
    width: 1024, height: 1024, show: false, frame: false, transparent: true,
    backgroundColor: '#00000000', hasShadow: false, useContentSize: true,
    webPreferences: { offscreen: true, backgroundThrottling: false }
  })

  // — l'icona dell'app: piastrella con gli angoli trasparenti.
  // Il disegno dipende dalla misura (sotto i 64 px cade il rilievo): l'SVG si
  // chiede per ogni n, non una volta sola.
  const dellApp = async n => {
    const p = await png(finestra, svgApp(n), n)
    angoliVuoti(p, 'icon')
    return p.buf
  }

  // icns: le dieci misure che iconutil pretende, ciascuna disegnata alla sua
  const iconset = join(lavoro, 'icon.iconset')
  mkdirSync(iconset)
  for (const base of [16, 32, 128, 256, 512]) {
    writeFileSync(join(iconset, `icon_${base}x${base}.png`), await dellApp(base))
    writeFileSync(join(iconset, `icon_${base}x${base}@2x.png`), await dellApp(base * 2))
  }
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(__dirname, 'icon.icns')])

  // png: il 1024, che electron-builder usa anche per Linux e come ripiego
  writeFileSync(join(__dirname, 'icon.png'), await dellApp(1024))

  // ico: le sei misure classiche di Windows, PNG dentro
  const misure = [16, 32, 48, 64, 128, 256]
  const pezzi = []
  for (const n of misure) pezzi.push(await dellApp(n))
  writeFileSync(join(__dirname, 'icon.ico'), ico(pezzi))

  // — la barra dei menu: la sagoma nuda, senza piastrella (vedi build/icona.cjs).
  // Su Windows a colori, nelle misure che la barra usa dal 100% al 300%.
  const misureBarra = [16, 20, 24, 32, 48]
  for (const [nome, attesa] of [['tray.ico', false], ['trayAttesa.ico', true]]) {
    const svg = svgBarra({ attesa })
    const p = []
    for (const n of misureBarra) p.push((await png(finestra, svg, n)).buf)
    writeFileSync(join(icone, nome), ico(p))
  }
  // Su Mac le «template»: nere su trasparente, a 1× e a 2×, che il sistema tinge
  for (const [nome, attesa] of [['trayTemplate', false], ['trayAttesaTemplate', true]]) {
    const svg = svgBarra({ attesa, template: true })
    writeFileSync(join(icone, `${nome}.png`), (await png(finestra, svg, 16)).buf)
    writeFileSync(join(icone, `${nome}@2x.png`), (await png(finestra, svg, 32)).buf)
  }

  rmSync(lavoro, { recursive: true, force: true })
  console.log('build/icon.png, build/icon.icns, build/icon.ico, desktop/icone/tray*.ico e tray*Template*.png:'
    + ' fatte da build/icona.cjs')
  app.exit(0)
}).catch(e => {
  console.error(e)
  app.exit(1)
})
