// Il fumetto del mostriciattolo, fotografato in una finestra nascosta.
//
//   URL=http://127.0.0.1:<porta>/ OUT=<cartella> node_modules/.bin/electron prove/fumetto-foto.cjs
//
// Serve un server di prova acceso (`TIENI=1 FOTO=0 SCENA=vuoto
// COPIONE=prove/copioni/fumetto.json prove/scena.sh`): il richiamo è la
// pagina dell'app con `?richiamo=1`, e la risposta arriva dal modello finto.
// Un preload finto fa credere alla pagina di stare nel guscio, poi la apre
// come fumetto (`mostrato({ accanto: true })`), ci scrive una domanda e preme
// Invio dentro la finestra nascosta. Quando la risposta c'è, la fotografa
// all'altezza che la pagina ha chiesto, fotografa il mostriciattolo, e li
// mette insieme su un pezzo di scrivania finta, dove `posizioneFumetto` li
// mette davvero (in basso a destra, il fumetto a sinistra che cresce in su):
// `OUT/compagno-fumetto.png`.
// Dock nascosto, dati temporanei, cane da guardia di 90 secondi.

const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const URL_APP = process.env.URL || 'http://127.0.0.1:18780/'
const OUT = process.env.OUT || process.cwd()
const DOMANDA = process.env.DOMANDA || 'what should I do first today?'
setTimeout(() => { console.error('fumetto-foto · 90 s passati: esco'); app.exit(1) }, 90_000).unref()
// a scala 2, come su uno schermo Retina
app.commandLine.appendSwitch('force-device-scale-factor', '2')
if (app.dock) app.dock.hide()
const DATI = fs.mkdtempSync(path.join(os.tmpdir(), 'myynd-fumetto-foto-'))
app.setPath('userData', DATI)
app.on('quit', () => {
  try {
    require('node:child_process').spawn('/bin/sh', ['-c', 'sleep 3; rm -rf "$0"', DATI], { detached: true, stdio: 'ignore' }).unref()
  } catch { /* pazienza */ }
})
const esci = codice => { process.exitCode = codice; app.quit() }
const pausa = ms => new Promise(r => setTimeout(r, ms))

const PRELOAD = path.join(DATI, 'finto-preload.cjs')
fs.writeFileSync(PRELOAD, `
const { contextBridge, ipcRenderer } = require('electron')
let alMostrato = null
// il gettone della sessione di prova (il server parte con MYYND_DEV), prima di ogni script della pagina
try { localStorage.setItem('myynd.token', 'sviluppo-non-in-produzione') } catch { /* pazienza */ }
contextBridge.exposeInMainWorld('myynd', {
  versione: '0.0.0-prova', piattaforma: 'darwin', dentroIlRichiamo: true,
  naviga: () => () => {}, lingua: () => {}, segnala: () => {}, notifica: () => {},
  aggiornamenti: { attuale: async () => ({}), controlla: async () => {}, installa: async () => {}, stato: () => () => {} },
  richiamo: {
    chiudi: () => ipcRenderer.send('prova:richiamo', 'chiudi'),
    apri: () => ipcRenderer.send('prova:richiamo', 'apri'),
    misura: h => ipcRenderer.send('prova:misura', Number(h)),
    mostrato: cb => { alMostrato = cb; return () => {} }
  }
})
contextBridge.exposeInMainWorld('prova', { mostra: () => alMostrato && alMostrato({ accanto: true }) })
`)

let altezza = 60
ipcMain.on('prova:misura', (_e, h) => { altezza = h })

app.whenReady().then(async () => {
  const LARGO = 360
  const w = new BrowserWindow({
    show: false, width: LARGO, height: 440, frame: false, transparent: true, useContentSize: true,
    webPreferences: { preload: PRELOAD, sandbox: true, contextIsolation: true }
  })
  w.webContents.on('console-message', e => { if (e.level === 'error') console.log('fumetto-foto · console:', e.message) })
  w.webContents.session.webRequest.onCompleted(d => { if (d.statusCode >= 400) console.log('fumetto-foto · rete', d.statusCode, d.method, d.url) })
  await w.loadURL(new URL('/?richiamo=1', URL_APP).toString())
  await pausa(800)
  await w.webContents.executeJavaScript('window.prova.mostra(); 1')
  await pausa(200)
  const segnaposto = await w.webContents.executeJavaScript('document.querySelector("textarea")?.placeholder')
  console.log(`fumetto-foto · la casella dice «${segnaposto}»`)
  await w.webContents.executeJavaScript('document.querySelector("textarea").focus(); 1')
  w.webContents.insertText(DOMANDA)
  await pausa(150)
  w.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' })
  w.webContents.sendInputEvent({ type: 'char', keyCode: '\r' })
  w.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
  let testo = ''
  for (let i = 0; i < 80; i++) {
    await pausa(250)
    testo = await w.webContents.executeJavaScript('document.body.innerText')
    if (/Right here/.test(testo) && /Continue|Continua/.test(testo)) break
  }
  console.log(`fumetto-foto · il fumetto dice: ${JSON.stringify(testo)}`)
  w.setContentSize(LARGO, Math.ceil(altezza))
  await pausa(300)
  const fumetto = await w.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, 'fumetto-solo.png'), fumetto.toPNG())

  // il mostriciattolo, nella sua pagina, che guarda il fumetto (a sinistra, un po' in su)
  const PAGINA = path.join(__dirname, '..', 'desktop', 'compagno.html')
  const PRE2 = path.join(DATI, 'finto-compagno.cjs')
  fs.writeFileSync(PRE2, `
const { contextBridge } = require('electron')
contextBridge.exposeInMainWorld('compagno', { premuto() {}, menu() {}, afferra() {}, trascina() {}, lascia() {}, pronto() {}, sopra() {},
  stato: cb => cb({ guarda: true, attesa: false }), sguardo: () => {} })`)
  const m = new BrowserWindow({ show: false, width: 144, height: 144, frame: false, transparent: true, useContentSize: true,
    webPreferences: { preload: PRE2, sandbox: true, contextIsolation: true } })
  await m.loadFile(PAGINA, { query: { prova: '1' } })
  for (let i = 0; i < 100 && !(await m.webContents.executeJavaScript('!!window.scena')); i++) await pausa(50)
  await m.webContents.executeJavaScript('window.scena.posa({ guarda: [-0.7, -0.15], sveglio: true, tempo: 0.2 }); 1')
  await pausa(100)
  const lui = await m.webContents.capturePage()

  // la scrivania finta: 760×520 punti, lui in basso a destra a 24 punti dai bordi
  const AREA = { x: 0, y: 0, width: 760, height: 520 }
  const L = { x: AREA.width - 144 - 24, y: AREA.height - 144 - 24, width: 144, height: 144 }
  const h = Math.ceil(altezza)
  // la stessa aritmetica di posizioneFumetto: a sinistra, il fondo all'altezza della bocca
  const fx = L.x + Math.round(144 * 0.2) - LARGO
  const fy = Math.round(L.y + 144 * 0.62 - h)
  const html = `<!doctype html><html><body style="margin:0;width:${AREA.width}px;height:${AREA.height}px;overflow:hidden;
    background:linear-gradient(135deg,#3B4A5C 0%,#6E7F8C 45%,#C9B79C 100%);font:13px -apple-system">
    <div style="position:absolute;left:40px;top:40px;width:330px;height:220px;border-radius:10px;background:#F7F5F0;box-shadow:0 18px 40px rgba(0,0,0,.25)">
      <div style="height:28px;border-bottom:1px solid #e3ded4;border-radius:10px 10px 0 0;background:#EDEAE3"></div></div>
    <img src="data:image/png;base64,${fumetto.toPNG().toString('base64')}" style="position:absolute;left:${fx}px;top:${fy}px;width:${LARGO}px;height:${h}px;filter:drop-shadow(0 12px 24px rgba(40,30,20,.28))">
    <img src="data:image/png;base64,${lui.toPNG().toString('base64')}" style="position:absolute;left:${L.x}px;top:${L.y}px;width:144px;height:144px">
  </body></html>`
  const foglio = path.join(DATI, 'scrivania.html')
  fs.writeFileSync(foglio, html)
  const s = new BrowserWindow({ show: false, width: AREA.width, height: AREA.height, frame: false, useContentSize: true, webPreferences: { zoomFactor: 1 } })
  await s.loadFile(foglio)
  await pausa(300)
  fs.writeFileSync(path.join(OUT, 'compagno-fumetto.png'), (await s.webContents.capturePage()).toPNG())
  const ok = /Right here/.test(testo) && /Talk to Myynd|Scrivi a Myynd/.test(segnaposto ?? '')
  console.log(ok ? 'ok' : 'guasto: il fumetto non ha la risposta o la casella non dice «Scrivi a Myynd»')
  esci(ok ? 0 : 1)
}).catch(e => { console.error(e); esci(1) })
