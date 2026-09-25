// Il mostriciattolo nella barra dei menu, fotografato alla misura vera.
//
//   OUT=<cartella> node_modules/.bin/electron prove/icone-barra.cjs
//
// Due barre finte, chiara (#F4F4F4) e scura (#1E1E1E), alte 24 punti, con
// sopra le quattro varianti a 18 punti dai file `@2x` — guarda, guarda con il
// puntino, spento, spento con il puntino — e accanto il segno di oggi
// (template, tinto come lo tingerebbe il sistema) per confronto. Fotografate
// a scala 2 in `OUT/barra-chiara.png` e `OUT/barra-scura.png`. Finestra
// nascosta, Dock nascosto, cane da guardia di 120 secondi.
//
// La scala 2 è uno zoom della pagina e non il fattore dello schermo: una
// finestra nascosta si fotografa sempre a 1×. Con lo zoom le immagini da 18
// punti si disegnano a 36 pixel dai file `@2x`, cioè come su un Retina.

const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const OUT = process.env.OUT || process.cwd()
const ICONE = path.join(__dirname, '..', 'desktop', 'icone')
setTimeout(() => { console.error('icone-barra · 120 s passati: esco'); pulisci(); app.exit(1) }, 120_000).unref()
app.commandLine.appendSwitch('force-device-scale-factor', '1')
if (app.dock) app.dock.hide()
const DATI = fs.mkdtempSync(path.join(os.tmpdir(), 'myynd-icone-barra-'))
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

const url = f => pathToFileURL(path.join(ICONE, f)).href

function pagina(scura) {
  const fondo = scura ? '#1E1E1E' : '#F4F4F4'
  const testo = scura ? '#FFFFFF' : '#000000'
  // il segno template: nero su trasparente, che il sistema tinge; qui lo si tinge a mano
  const tinta = scura ? 'filter:invert(1)' : ''
  const icona = (f, extra = '') => `<img src="${url(f)}" width="18" height="18" style="display:block;${extra}">`
  return `<!doctype html><html><body style="margin:0;zoom:2;width:420px;height:120px;background:${scura ? '#3a3f47' : '#c9d3dc'};font:12px -apple-system,system-ui">
  <div style="height:24px;background:${fondo};display:flex;align-items:center;justify-content:flex-end;gap:14px;padding:0 14px;color:${testo}">
    <span style="opacity:.85">Wi‑Fi</span>
    ${icona('trayTemplate@2x.png', tinta)}
    ${icona('trayAttesaTemplate@2x.png', tinta)}
    <span style="width:1px;height:14px;background:${testo};opacity:.25"></span>
    ${icona('mascotte@2x.png')}
    ${icona('mascotteAttesa@2x.png')}
    ${icona('mascotteSpenta@2x.png')}
    ${icona('mascotteSpentaAttesa@2x.png')}
    <span>gio 24 set 15:10</span>
  </div>
  <div style="display:flex;gap:14px;justify-content:flex-end;padding:10px 14px;color:${scura ? '#ddd' : '#222'};font-size:10px">
    <span>oggi: segno, segno con puntino</span><span>|</span><span>guarda, guarda+puntino, spento, spento+puntino</span>
  </div></body></html>`
}

app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, width: 840, height: 240, frame: false, useContentSize: true,
    webPreferences: { sandbox: true, contextIsolation: true } })
  for (const [nome, scura] of [['barra-chiara', false], ['barra-scura', true]]) {
    const file = path.join(DATI, `${nome}.html`)
    fs.writeFileSync(file, pagina(scura))
    await w.loadFile(file)
    await w.webContents.executeJavaScript('Promise.all([...document.images].map(i => i.decode())).then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))')
    const img = await w.webContents.capturePage()
    fs.writeFileSync(path.join(OUT, `${nome}.png`), img.toPNG())
    console.log(`icone-barra · ${nome}.png ${JSON.stringify(img.getSize())}`)
  }
  esci(0)
}).catch(e => { console.error(e); esci(1) })
