// La casella sotto il mostriciattolo e le sue impostazioni, fotografate in finestre nascoste.
//
//   URL=http://127.0.0.1:<porta>/ OUT=<cartella> node_modules/.bin/electron prove/casella-foto.cjs
//
// Serve un server di prova acceso (`TIENI=1 FOTO=0 SCENA=vuoto
// COPIONE=prove/copioni/casella.json prove/scena.sh`): la casella è la
// pagina dell'app con `?richiamo=1`, e la risposta arriva dal modello finto.
// Un preload finto fa credere alla pagina di stare nel guscio, la apre sotto
// il mostriciattolo (`mostrato({ accanto: true, pannello })`), ci scrive una
// domanda e preme Invio dentro la finestra nascosta. Il posto e la misura
// della casella li dà `posizioneScatola` vera (da `desktop/posizione.ts`),
// con la misura di serie e con una tirata più grande; poi le impostazioni.
// Ognuna finisce su un pezzo di scrivania finta accanto al mostriciattolo
// vero (`desktop/compagno.html`): `OUT/compagno-casella.png`,
// `OUT/compagno-casella-tirata.png`, `OUT/compagno-impostazioni.png`.
// Dock nascosto, dati temporanei, cane da guardia di 120 secondi.

const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const URL_APP = process.env.URL || 'http://127.0.0.1:18780/'
const OUT = process.env.OUT || process.cwd()
const DOMANDA = process.env.DOMANDA || 'what should I do first today?'
const RADICE = path.join(__dirname, '..')
setTimeout(() => { console.error('casella-foto · 120 s passati: esco'); app.exit(1) }, 120_000).unref()
// a scala 2, come su uno schermo Retina
app.commandLine.appendSwitch('force-device-scale-factor', '2')
if (app.dock) app.dock.hide()
const DATI = fs.mkdtempSync(path.join(os.tmpdir(), 'myynd-casella-foto-'))
app.setPath('userData', DATI)
app.on('quit', () => {
  try {
    require('node:child_process').spawn('/bin/sh', ['-c', 'sleep 3; rm -rf "$0"', DATI], { detached: true, stdio: 'ignore' }).unref()
  } catch { /* pazienza */ }
})
// le finestre si aprono e si chiudono una per volta: chiusa l'ultima, non si esce da soli
app.on('window-all-closed', () => {})
const esci = codice => { process.exitCode = codice; app.quit() }
const pausa = ms => new Promise(r => setTimeout(r, ms))

/** La stessa aritmetica del guscio: si chiede a node, che legge il TypeScript di `posizione.ts`. */
function scatola(area, corpo, contenuto, voluta) {
  const codice = `import { posizioneScatola } from ${JSON.stringify(path.join(RADICE, 'desktop', 'posizione.ts'))}
    console.log(JSON.stringify(posizioneScatola(${JSON.stringify(area)}, ${JSON.stringify(corpo)}, ${contenuto}, ${JSON.stringify(voluta)})))`
  return JSON.parse(execFileSync('node', ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', codice], { encoding: 'utf8' }))
}

const PRELOAD = path.join(DATI, 'finto-preload.cjs')
fs.writeFileSync(PRELOAD, `
const { contextBridge, ipcRenderer } = require('electron')
let alMostrato = null
let scelte = { taglia: 'medio', segue: true }
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
  },
  compagno: {
    acceso: async () => true,
    accendi: async on => { ipcRenderer.send('prova:richiamo', 'accendi', on) },
    scelte: async () => scelte,
    scegli: async p => { scelte = { ...scelte, ...p }; ipcRenderer.send('prova:richiamo', 'scegli', p); return scelte }
  }
})
contextBridge.exposeInMainWorld('prova', { mostra: pannello => alMostrato && alMostrato({ accanto: true, pannello }) })
`)

let altezza = 60
const gesti = []
ipcMain.on('prova:misura', (_e, h) => { altezza = h })
ipcMain.on('prova:richiamo', (_e, ...g) => gesti.push(g))

// la scrivania finta: lui in alto a metà, così la casella ha posto sotto
const AREA = { x: 0, y: 0, width: 760, height: 600 }
const LUI = { x: 440, y: 36, width: 144, height: 188 }
const CORPO = { x: LUI.x, y: LUI.y, width: 144, height: 144 }

async function mostriciattolo() {
  const PRE2 = path.join(DATI, 'finto-compagno.cjs')
  fs.writeFileSync(PRE2, `
const { contextBridge } = require('electron')
contextBridge.exposeInMainWorld('compagno', { premuto() {}, scrivi() {}, impostazioni() {}, menu() {}, afferra() {}, trascina() {}, lascia() {}, pronto() {}, sopra() {},
  stato: cb => cb({ guarda: true, attesa: false }), sguardo: () => {} })`)
  const m = new BrowserWindow({ show: false, width: 144, height: 188, frame: false, transparent: true, useContentSize: true,
    webPreferences: { preload: PRE2, sandbox: true, contextIsolation: true } })
  await m.loadFile(path.join(RADICE, 'desktop', 'compagno.html'), { query: { prova: '1' } })
  for (let i = 0; i < 100 && !(await m.webContents.executeJavaScript('!!window.scena')); i++) await pausa(50)
  // guarda giù, verso la casella, attento
  await m.webContents.executeJavaScript('window.scena.posa({ guarda: [-0.1, 0.55], sveglio: true, attento: true, tempo: 0.2 }); 1')
  await pausa(150)
  const img = await m.webContents.capturePage()
  m.destroy()
  return img
}

async function scrivania(nome, pannelloImg, riquadro, lui) {
  const html = `<!doctype html><html><body style="margin:0;width:${AREA.width}px;height:${AREA.height}px;overflow:hidden;
    background:linear-gradient(160deg,#21331F 0%,#2F4A2A 40%,#5F7A45 100%);font:13px -apple-system">
    <div style="position:absolute;left:36px;top:60px;width:330px;height:240px;border-radius:10px;background:#F7F5F0;box-shadow:0 18px 40px rgba(0,0,0,.3)">
      <div style="height:28px;border-bottom:1px solid #e3ded4;border-radius:10px 10px 0 0;background:#EDEAE3"></div></div>
    <img src="data:image/png;base64,${lui.toPNG().toString('base64')}" style="position:absolute;left:${LUI.x}px;top:${LUI.y}px;width:144px;height:188px">
    <img src="data:image/png;base64,${pannelloImg.toPNG().toString('base64')}" style="position:absolute;left:${riquadro.x}px;top:${riquadro.y}px;width:${riquadro.width}px;height:${riquadro.height}px;filter:drop-shadow(0 12px 26px rgba(10,20,10,.35))">
  </body></html>`
  const foglio = path.join(DATI, `${nome}.html`)
  fs.writeFileSync(foglio, html)
  const s = new BrowserWindow({ show: false, width: AREA.width, height: AREA.height, frame: false, useContentSize: true })
  await s.loadFile(foglio)
  await pausa(300)
  fs.writeFileSync(path.join(OUT, `${nome}.png`), (await s.webContents.capturePage()).toPNG())
  s.destroy()
}

async function pannello(quale, voluta, domanda) {
  const w = new BrowserWindow({
    show: false, width: 320, height: 60, frame: false, transparent: true, useContentSize: true,
    webPreferences: { preload: PRELOAD, sandbox: true, contextIsolation: true }
  })
  w.webContents.on('console-message', e => { if (e.level === 'error') console.log('casella-foto · console:', e.message) })
  w.webContents.on('did-fail-load', (_e, codice, descrizione, indirizzo, principale) => console.log('casella-foto · non carica', codice, descrizione, indirizzo, principale))
  w.webContents.on('render-process-gone', (_e, d) => console.log('casella-foto · renderer', JSON.stringify(d)))
  await w.loadURL(new URL('/?richiamo=1', URL_APP).toString()).catch(e => console.log('casella-foto · loadURL', e.message))
  await pausa(800)
  await w.webContents.executeJavaScript(`window.prova.mostra(${JSON.stringify(quale)}); 1`)
  await pausa(300)
  let testo = ''
  if (domanda) {
    await w.webContents.executeJavaScript('document.querySelector("textarea").focus(); 1')
    w.webContents.insertText(domanda)
    await pausa(150)
    w.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' })
    w.webContents.sendInputEvent({ type: 'char', keyCode: '\r' })
    w.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
    for (let i = 0; i < 80; i++) {
      await pausa(250)
      testo = await w.webContents.executeJavaScript('document.body.innerText')
      if (/Right here/.test(testo) && /Continue|Continua/.test(testo)) break
    }
  }
  // la misura che il guscio darebbe: prima larga come vuole, poi alta quanto il contenuto in quella larghezza
  let r = scatola(AREA, CORPO, altezza, voluta)
  w.setContentSize(r.width, r.height)
  await pausa(300)
  r = scatola(AREA, CORPO, altezza, voluta)
  w.setContentSize(r.width, r.height)
  await pausa(300)
  const info = await w.webContents.executeJavaScript(`({ testo: document.body.innerText, segnaposto: document.querySelector('textarea')?.placeholder ?? '',
    chiudi: !!document.querySelector('button[aria-label="Close"], button[aria-label="Chiudi"]') })`)
  const img = await w.webContents.capturePage()
  w.destroy()
  return { img, r, info, testo }
}

app.whenReady().then(async () => {
  const guasti = []
  const verifica = (ok, frase) => { if (!ok) guasti.push(frase); console.log(`${ok ? '✓' : '✗'} ${frase}`) }
  const lui = await mostriciattolo()

  const a = await pannello('scrivi', {}, DOMANDA)
  console.log(`casella-foto · la casella ${JSON.stringify(a.r)} dice ${JSON.stringify(a.info.testo)}`)
  verifica(/Right here/.test(a.info.testo) && /Continue in the app|Continua nell/.test(a.info.testo), 'la risposta arriva nella casella, con «Continua nell’app»')
  verifica(a.info.segnaposto === 'Write to Myynd' && a.info.chiudi, `la casella dice «Write to Myynd» e ha la × (${a.info.segnaposto})`)
  verifica(a.r.verso === 'giu' && a.r.y >= CORPO.y + CORPO.height * 0.9, `sta sotto di lui (${JSON.stringify(a.r)})`)
  await scrivania('compagno-casella', a.img, a.r, lui)

  const b = await pannello('scrivi', { larghezza: 480, altezza: 300 }, DOMANDA + ' and what about tomorrow?')
  verifica(b.r.width === 480, `tirata più larga, resta larga (${JSON.stringify(b.r)})`)
  await scrivania('compagno-casella-tirata', b.img, b.r, lui)

  const c = await pannello('impostazioni', { larghezza: 280, altezza: 760 }, '')
  console.log(`casella-foto · le impostazioni ${JSON.stringify(c.r)} dicono ${JSON.stringify(c.info.testo)}`)
  verifica(/Size/.test(c.info.testo) && /Follow my pointer/.test(c.info.testo) && /Hide from the desktop/.test(c.info.testo) && /Preferences or the menu bar/.test(c.info.testo),
    'le impostazioni: taglia, segue il cursore, togli, e dove riprenderlo')
  await scrivania('compagno-impostazioni', c.img, c.r, lui)

  console.log(guasti.length ? `guasti: ${guasti.length}` : 'ok')
  esci(guasti.length ? 1 : 0)
}).catch(e => { console.error(e); esci(1) })
