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
//                               desktop/icone/mascotte*.png e .ico (il mostriciattolo nella barra)
//                               desktop/icone/compagno.png (il mostriciattolo sullo schermo)

// Sotto node non esiste una BrowserWindow: `require('electron')` qui dà il
// percorso del binario, e ci si rilancia dentro passando lo stesso file.
if (!process.versions.electron) {
  const { execFileSync } = require('node:child_process')
  execFileSync(require('electron'), [__filename, ...process.argv.slice(2)], { stdio: 'inherit' })
  return
}

const { app, BrowserWindow, nativeImage } = require('electron')
const { execFileSync } = require('node:child_process')
const { mkdtempSync, writeFileSync, mkdirSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { ico } = require('./ico.cjs')
const { svgApp, svgBarra, COLORI } = require('./icona.cjs')

// Senza questa la cattura verrebbe al fattore di scala dello schermo: su un
// Retina una finestra da 512 darebbe un PNG da 1024, e le misure non
// tornerebbero più. E niente GPU: qui non serve, e in headless dà noie.
app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.disableHardwareAcceleration()
// niente icona nel Dock: è un lavoro di fondo, non un'app da guardare
if (app.dock) app.dock.hide()

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

/**
 * Il PNG di una pagina HTML a `n` pixel di lato, sullo stesso giro di `png()`.
 * Aspetta che le immagini dentro siano decodificate prima di fotografare.
 */
async function pngHtml(finestra, html, n) {
  const pagina = '<!doctype html><style>html,body{margin:0;background:transparent;overflow:hidden}'
    + 'body{width:' + n + 'px;height:' + n + 'px;position:relative}</style>' + html
  await finestra.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(pagina))
  await finestra.webContents.executeJavaScript(
    'Promise.all([...document.images].map(i => i.decode())).then(() =>'
    + ' new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))')
  const img = await finestra.webContents.capturePage({ x: 0, y: 0, width: n, height: n })
  const dim = img.getSize()
  if (dim.width !== n || dim.height !== n) throw new Error(`chiesti ${n} px, tornati ${dim.width}×${dim.height}`)
  return img.toPNG()
}

/*
 * Il mostriciattolo, da build/mascotte.png, senza disegnarne uno nuovo.
 *
 * Prima si ritaglia sul disegno vero (l'alfa dice dove finisce), poi si
 * rimpicciolisce con il ricampionamento migliore di Electron alla misura
 * esatta: così la pagina lo mette giù pixel per pixel, senza un secondo
 * ricampionamento del browser che lo impasterebbe.
 */
function ritaglioMascotte() {
  const base = nativeImage.createFromPath(join(__dirname, 'mascotte.png'))
  const { width: w, height: h } = base.getSize()
  const bmp = base.toBitmap()                       // BGRA
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (bmp[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) throw new Error('build/mascotte.png è vuota')
  return base.crop({ x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 })
}

/** Il mostriciattolo contenuto in un quadrato di `lato` pixel: data URL, larghezza, altezza. */
function mascotteA(ritaglio, lato) {
  const { width, height } = ritaglio.getSize()
  const k = lato / Math.max(width, height)
  const w = Math.max(1, Math.round(width * k))
  const h = Math.max(1, Math.round(height * k))
  return { url: ritaglio.resize({ width: w, height: h, quality: 'best' }).toDataURL(), w, h }
}

/**
 * Il mostriciattolo nella barra a `n` pixel: a colori, o smorto, con o senza
 * il puntino. Smorto vuol dire grigio e non trasparente: al 45% di opacità
 * sulla barra scura era grigio scuro su quasi nero (contrasto 1,8 a 1) e non
 * si trovava più il posto dove si clicca per aprire Myynd. Grigio pieno,
 * schiarito di un 5%, ha lo stesso contrasto del mostriciattolo a colori su
 * tutte e due le barre (circa 3,8 a 1) e dice «spento» col colore che manca. Il puntino è quello del segno di Windows:
 * inchiostro con un anello color crema, in basso a destra, a piena opacità
 * anche sul mostriciattolo smorto. Misure a 18 px, scalate: raggio 3,2,
 * anello 1,2, centro a 14,3.
 */
function htmlBarra(ritaglio, n, { spenta, attesa }) {
  const margine = n / 18
  const m = mascotteA(ritaglio, Math.round(n - margine * 2))
  const x = Math.round((n - m.w) / 2)
  const y = Math.round((n - m.h) / 2)
  const filtro = spenta ? 'filter:grayscale(1) brightness(1.05);' : ''
  const k = n / 18
  const punto = !attesa ? ''
    : `<svg width="${n}" height="${n}" viewBox="0 0 ${n} ${n}" style="position:absolute;left:0;top:0">`
      + `<circle cx="${14.3 * k}" cy="${14.3 * k}" r="${3.2 * k}" fill="${COLORI.inchiostro}" stroke="${COLORI.crema}" stroke-width="${1.2 * k}"/></svg>`
  return `<img src="${m.url}" width="${m.w}" height="${m.h}" style="position:absolute;left:${x}px;top:${y}px;${filtro}">` + punto
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

  // — il mostriciattolo nella barra, da build/mascotte.png: quattro stati,
  // a 18 e 36 px sul Mac (a colori, mai template) e nelle misure della barra
  // di Windows. E quello sullo schermo, a 96 px (si vede a 48 punti).
  const ritaglio = ritaglioMascotte()
  const stati = [
    ['mascotte', { spenta: false, attesa: false }],
    ['mascotteAttesa', { spenta: false, attesa: true }],
    ['mascotteSpenta', { spenta: true, attesa: false }],
    ['mascotteSpentaAttesa', { spenta: true, attesa: true }]
  ]
  for (const [nome, stato] of stati) {
    writeFileSync(join(icone, `${nome}.png`), await pngHtml(finestra, htmlBarra(ritaglio, 18, stato), 18))
    writeFileSync(join(icone, `${nome}@2x.png`), await pngHtml(finestra, htmlBarra(ritaglio, 36, stato), 36))
    const p = []
    for (const n of misureBarra) p.push(await pngHtml(finestra, htmlBarra(ritaglio, n, stato), n))
    writeFileSync(join(icone, `${nome}.ico`), ico(p))
  }
  const grande = mascotteA(ritaglio, 92)
  writeFileSync(join(icone, 'compagno.png'), await pngHtml(finestra,
    `<img src="${grande.url}" width="${grande.w}" height="${grande.h}" style="position:absolute;`
    + `left:${Math.round((96 - grande.w) / 2)}px;top:${Math.round((96 - grande.h) / 2)}px">`, 96))

  rmSync(lavoro, { recursive: true, force: true })
  console.log('build/icon.png, build/icon.icns, build/icon.ico, desktop/icone/tray*.ico e tray*Template*.png:'
    + ' fatte da build/icona.cjs; desktop/icone/mascotte*.png e .ico, compagno.png: da build/mascotte.png')
  app.exit(0)
}).catch(e => {
  console.error(e)
  app.exit(1)
})
