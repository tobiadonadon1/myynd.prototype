// Il mostriciattolo sullo schermo, fotografato e toccato in una finestra nascosta.
//
//   OUT=<cartella> node_modules/.bin/electron prove/compagno-foto.cjs
//
// Carica la pagina vera (`desktop/compagno.html`, con il suo `compagno.js`)
// con un preload finto al posto di quello del guscio, in finestre nascoste da
// 64 punti su un quadrato chiaro e uno scuro, nei tre stati — guarda, smorto,
// guarda col puntino — e le fotografa a scala 2 in `OUT/compagno-*.png`.
// Poi, dentro la finestra nascosta e solo lì, un clic, un trascinamento e
// un tasto destro: la pagina deve dire premuto, trascina e lascia, menu.
// Dock nascosto, dati temporanei, cane da guardia di 120 secondi.

const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const OUT = process.env.OUT || process.cwd()
const PAGINA = path.join(__dirname, '..', 'desktop', 'compagno.html')
setTimeout(() => { console.error('compagno-foto · 120 s passati: esco'); pulisci(); app.exit(1) }, 120_000).unref()
app.commandLine.appendSwitch('force-device-scale-factor', '1')
if (app.dock) app.dock.hide()
const DATI = fs.mkdtempSync(path.join(os.tmpdir(), 'myynd-compagno-foto-'))
app.setPath('userData', DATI)
// Chromium scrive nella cartella dei dati fino all'ultimo istante: la butta
// via un processo a parte, tre secondi dopo l'uscita
const pulisci = () => {
  try {
    require('node:child_process').spawn('/bin/sh', ['-c', 'sleep 3; rm -rf "$0"', DATI], { detached: true, stdio: 'ignore' }).unref()
  } catch { /* pazienza */ }
}
app.on('quit', pulisci)
const esci = codice => { process.exitCode = codice; app.quit() }

// il preload finto: le stesse funzioni di compagno-preload.cjs, ma lo stato
// arriva dagli argomenti e i gesti tornano a questo processo
const PRELOAD = path.join(DATI, 'finto-preload.cjs')
fs.writeFileSync(PRELOAD, `
const { contextBridge, ipcRenderer } = require('electron')
const q = new URLSearchParams(location.search)
const stato = q.get('stato') || '', fondo = q.get('fondo') || ''
window.addEventListener('DOMContentLoaded', () => { if (fondo) document.documentElement.style.background = '#' + fondo })
contextBridge.exposeInMainWorld('compagno', {
  premuto: () => ipcRenderer.send('prova:gesto', 'premuto'),
  menu: () => ipcRenderer.send('prova:gesto', 'menu'),
  afferra: () => ipcRenderer.send('prova:gesto', 'afferra'),
  trascina: (dx, dy) => ipcRenderer.send('prova:gesto', 'trascina', dx, dy),
  lascia: () => ipcRenderer.send('prova:gesto', 'lascia'),
  pronto: () => ipcRenderer.send('prova:gesto', 'pronto'),
  stato: cb => cb({ guarda: stato !== 'smorto', attesa: stato === 'attesa' })
})`)

const gesti = []
ipcMain.on('prova:gesto', (_e, ...g) => gesti.push(g))
const pausa = ms => new Promise(r => setTimeout(r, ms))

// una finestra sola, ricaricata per ogni stato: lo stato e il fondo stanno nell'indirizzo
let w = null
async function carica(stato, fondo) {
  if (!w) {
    w = new BrowserWindow({
      show: false, width: 128, height: 128, frame: false, useContentSize: true, transparent: true,
      webPreferences: { preload: PRELOAD, sandbox: true, contextIsolation: true, zoomFactor: 2 }
    })
  }
  await w.loadFile(PAGINA, { query: { stato, fondo } })
  return w
}

app.whenReady().then(async () => {
  const guasti = []
  const verifica = (ok, frase) => { if (!ok) guasti.push(frase); console.log(`${ok ? '✓' : '✗'} ${frase}`) }
  for (const [nomeFondo, fondo] of [['chiaro', 'F2E9DC'], ['scuro', '1F1A17']]) {
    for (const stato of ['guarda', 'smorto', 'attesa']) {
      await carica(stato, fondo)
      const pronto = await w.webContents.executeJavaScript(`document.images[0].decode().then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))).then(() => ({
        classi: document.body.className, larga: document.images[0].naturalWidth,
        punto: getComputedStyle(document.getElementById('punto')).display }))`)
      const img = await w.webContents.capturePage()
      const file = `compagno-${stato}-${nomeFondo}.png`
      fs.writeFileSync(path.join(OUT, file), img.toPNG())
      console.log(`compagno-foto · ${file} ${JSON.stringify(img.getSize())} ${JSON.stringify(pronto)}`)
      verifica(pronto.larga === 96, `${file}: l'immagine si carica sotto la sua CSP`)
      verifica(pronto.classi.includes('spenta') === (stato === 'smorto'), `${file}: smorto solo quando non guarda`)
      verifica((pronto.punto === 'block') === (stato === 'attesa'), `${file}: il puntino solo quando qualcosa aspetta`)
    }
  }

  // i gesti, dentro la finestra nascosta
  await carica('guarda', 'F2E9DC')
  await pausa(200)
  const topo = (type, x, y, button = 'left', extra = {}) => w.webContents.sendInputEvent({ type, x, y, globalX: 500 + x, globalY: 300 + y, button, clickCount: 1, ...extra })
  gesti.length = 0
  topo('mouseDown', 64, 64); topo('mouseUp', 64, 64)
  await pausa(150)
  verifica(gesti.some(g => g[0] === 'premuto') && !gesti.some(g => g[0] === 'lascia'), `un clic è premuto (${JSON.stringify(gesti)})`)
  gesti.length = 0
  topo('mouseDown', 64, 64)
  for (let i = 1; i <= 6; i++) { topo('mouseMove', 64 + i * 8, 64, 'left', { modifiers: ['leftButtonDown'] }); await pausa(30) }
  topo('mouseUp', 112, 64)
  await pausa(150)
  const passi = gesti.filter(g => g[0] === 'trascina').map(g => g[1])
  verifica(gesti[0]?.[0] === 'afferra' && passi.length > 0 && passi.at(-1) > 0 && gesti.some(g => g[0] === 'lascia') && !gesti.some(g => g[0] === 'premuto'),
    `trascinare sposta e non apre (${JSON.stringify(gesti)})`)
  // ogni passo è lo spostamento dalla presa, non dal passo prima: crescono e non si sommano
  verifica(passi.every((v, i) => i === 0 || v >= passi[i - 1]) && passi.at(-1) <= 48 * 2,
    `ogni passo si conta dalla presa (${JSON.stringify(passi)})`)
  gesti.length = 0
  topo('mouseDown', 64, 64, 'right'); topo('mouseUp', 64, 64, 'right')
  await pausa(150)
  verifica(gesti.some(g => g[0] === 'menu') && !gesti.some(g => g[0] === 'premuto'), `il tasto destro è il menu (${JSON.stringify(gesti)})`)
  w.destroy()
  console.log(guasti.length ? `guasti: ${guasti.length}` : 'ok')
  esci(guasti.length ? 1 : 0)
}).catch(e => { console.error(e); esci(1) })
