// Il mostriciattolo in 3D, fotografato, toccato e misurato in una finestra nascosta.
//
//   OUT=<cartella> node_modules/.bin/electron prove/compagno-foto.cjs
//
// Carica la pagina vera (`desktop/compagno.html`, con `compagno.js` e la scena
// in three.js) con un preload finto al posto di quello del guscio, in una
// finestra nascosta di 144 punti a scala 2, su un fondo chiaro e uno scuro.
// Con `?prova=1` la scena si mette in posa a comando (`scena.posa`): di
// fronte, che guarda a sinistra, a destra, in su, che dorme, a mezzo salto
// col puntino. Le foto vanno in `OUT/compagno-*.png`.
//
// Poi i gesti, dentro la finestra nascosta e solo lì: un clic sul corpo è
// premuto, un trascinamento sposta e non apre, il tasto destro è il menu, e
// il cursore sul corpo dice «sopra» mentre ai bordi no.
//
// E il costo: la stessa pagina senza pose, lasciata girare come sul Mac, per
// MISURA secondi (10 di serie). Si leggono la CPU del renderer e quella della
// GPU da `app.getAppMetrics()`, e quanti fotogrammi ha disegnato.
// Dock nascosto, dati temporanei, cane da guardia di 150 secondi.

const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const OUT = process.env.OUT || process.cwd()
const MISURA = Number(process.env.MISURA || 10)
const PAGINA = path.join(__dirname, '..', 'desktop', 'compagno.html')
const LATO = 144
setTimeout(() => { console.error('compagno-foto · 150 s passati: esco'); pulisci(); app.exit(1) }, 150_000).unref()
app.commandLine.appendSwitch('force-device-scale-factor', '1')
if (app.dock) app.dock.hide()
const DATI = fs.mkdtempSync(path.join(os.tmpdir(), 'myynd-compagno-foto-'))
app.setPath('userData', DATI)
const pulisci = () => {
  try {
    require('node:child_process').spawn('/bin/sh', ['-c', 'sleep 3; rm -rf "$0"', DATI], { detached: true, stdio: 'ignore' }).unref()
  } catch { /* pazienza */ }
}
app.on('quit', pulisci)
const esci = codice => { process.exitCode = codice; app.quit() }

// il preload finto: le stesse funzioni di compagno-preload.cjs, ma lo stato
// arriva dall'indirizzo e i gesti tornano a questo processo
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
  sopra: on => ipcRenderer.send('prova:gesto', 'sopra', on),
  stato: cb => cb({ guarda: stato !== 'smorto', attesa: stato === 'attesa' }),
  sguardo: () => {}
})`)

const gesti = []
ipcMain.on('prova:gesto', (_e, ...g) => gesti.push(g))
const pausa = ms => new Promise(r => setTimeout(r, ms))

function finestra() {
  return new BrowserWindow({
    show: false, width: LATO * 2, height: LATO * 2, frame: false, useContentSize: true, transparent: true,
    webPreferences: { preload: PRELOAD, sandbox: true, contextIsolation: true, zoomFactor: 2 }
  })
}

async function carica(w, query) {
  const errori = []
  const ascolta = e => { if (e.level === 'error' || e.level === 'warning') errori.push(e.message) }
  w.webContents.on('console-message', ascolta)
  await w.loadFile(PAGINA, { query })
  // la scena è un modulo che aspetta three: si aspetta che ci sia
  for (let i = 0; i < 100; i++) {
    if (await w.webContents.executeJavaScript('!!window.scena || !!document.querySelector("img")')) break
    await pausa(50)
  }
  w.webContents.off('console-message', ascolta)
  return errori
}

const POSE = [
  ['fronte', { guarda: [0, 0.05], sveglio: true, tempo: 0.2 }, 'guarda'],
  ['sinistra', { guarda: [-0.85, 0.05], sveglio: true, tempo: 0.2 }, 'guarda'],
  ['destra', { guarda: [0.85, 0.05], sveglio: true, tempo: 0.2 }, 'guarda'],
  ['su', { guarda: [0.2, -0.8], sveglio: true, tempo: 0.2 }, 'guarda'],
  ['smorto', { sveglio: false, tempo: 0.2 }, 'smorto'],
  ['salto', { guarda: [0, 0], sveglio: true, tempo: 2, salto: 0.3 }, 'attesa']
]

app.whenReady().then(async () => {
  const guasti = []
  const verifica = (ok, frase) => { if (!ok) guasti.push(frase); console.log(`${ok ? '✓' : '✗'} ${frase}`) }
  const w = finestra()
  for (const [nomeFondo, fondo] of [['chiaro', 'F2E9DC'], ['scuro', '1F1A17']]) {
    for (const [nome, posa, stato] of POSE) {
      const errori = await carica(w, { stato, fondo, prova: '1' })
      const info = await w.webContents.executeJavaScript(`(() => {
        if (!window.scena) return { scena: false }
        window.scena.posa(${JSON.stringify(posa)})
        return { scena: true, classi: document.body.className, punto: getComputedStyle(document.getElementById('punto')).display }
      })()`)
      await pausa(80)
      const img = await w.webContents.capturePage()
      const file = `compagno-${nome}-${nomeFondo}.png`
      fs.writeFileSync(path.join(OUT, file), img.toPNG())
      console.log(`compagno-foto · ${file} ${JSON.stringify(img.getSize())} ${JSON.stringify(info)}`)
      verifica(info.scena === true, `${file}: la scena 3D parte sotto la sua CSP${errori.length ? ` (${errori.join(' | ')})` : ''}`)
      verifica(info.classi?.includes('spenta') === (stato === 'smorto'), `${file}: smorto solo quando non guarda`)
      verifica((info.punto === 'block') === (stato === 'attesa'), `${file}: il puntino solo quando qualcosa aspetta`)
    }
  }

  // i gesti, dentro la finestra nascosta
  await carica(w, { stato: 'guarda', fondo: 'F2E9DC', prova: '1' })
  await pausa(200)
  const zona = await w.webContents.executeJavaScript('window.scena.zona()')
  console.log(`compagno-foto · la zona del corpo ${JSON.stringify(zona)}`)
  // le coordinate della finestra sono in punti della pagina per lo zoom: ×2
  const cx = Math.round(zona.cx * 2), cy = Math.round(zona.cy * 2)
  const topo = (type, x, y, button = 'left', extra = {}) => w.webContents.sendInputEvent({ type, x, y, globalX: 500 + x, globalY: 300 + y, button, clickCount: 1, ...extra })
  gesti.length = 0
  topo('mouseMove', 6, 6); await pausa(60)
  topo('mouseMove', cx, cy); await pausa(60)
  topo('mouseMove', 6, 6); await pausa(60)
  const sopra = gesti.filter(g => g[0] === 'sopra').map(g => g[1])
  verifica(JSON.stringify(sopra) === '[true,false]', `sopra il corpo sì, nell'angolo no (${JSON.stringify(sopra)})`)
  topo('mouseMove', cx, cy); await pausa(60)
  gesti.length = 0
  topo('mouseDown', cx, cy); topo('mouseUp', cx, cy)
  await pausa(150)
  verifica(gesti.some(g => g[0] === 'premuto') && !gesti.some(g => g[0] === 'lascia'), `un clic è premuto (${JSON.stringify(gesti)})`)
  gesti.length = 0
  topo('mouseDown', cx, cy)
  for (let i = 1; i <= 6; i++) { topo('mouseMove', cx + i * 8, cy, 'left', { modifiers: ['leftButtonDown'] }); await pausa(30) }
  topo('mouseUp', cx + 48, cy)
  await pausa(150)
  const passi = gesti.filter(g => g[0] === 'trascina').map(g => g[1])
  verifica(gesti[0]?.[0] === 'afferra' && passi.length > 0 && passi.at(-1) > 0 && gesti.some(g => g[0] === 'lascia') && !gesti.some(g => g[0] === 'premuto'),
    `trascinare sposta e non apre (${JSON.stringify(gesti)})`)
  verifica(passi.every((v, i) => i === 0 || v >= passi[i - 1]) && passi.at(-1) <= 48 * 2, `ogni passo si conta dalla presa (${JSON.stringify(passi)})`)
  gesti.length = 0
  topo('mouseDown', cx, cy, 'right'); topo('mouseUp', cx, cy, 'right')
  await pausa(150)
  verifica(gesti.some(g => g[0] === 'menu') && !gesti.some(g => g[0] === 'premuto'), `il tasto destro è il menu (${JSON.stringify(gesti)})`)

  // il costo: la pagina vera, senza pose, che gira da sola; e per confronto
  // una pagina vuota nella stessa finestra, che è il costo di Electron e basta
  const tempoCpu = pids => {
    // `ps` dà il tempo di CPU consumato da quando il processo è nato: la differenza fra due letture è il costo
    const righe = require('node:child_process').execFileSync('/bin/ps', ['-o', 'pid=,time=', '-p', pids.join(',')], { encoding: 'utf8' })
    const t = {}
    for (const r of righe.trim().split('\n')) {
      const [p, tempo] = r.trim().split(/\s+/)
      const pezzi = tempo.split(':').map(Number)
      t[p] = pezzi.reduce((s, v) => s * 60 + v, 0)
    }
    return t
  }
  async function misura(nome, query, durante = '') {
    if (query) await carica(w, query)
    else await w.loadURL('about:blank')
    if (durante) await w.webContents.executeJavaScript(durante)
    // il primo secondo e mezzo si assesta (il sonno arriva piano): non si conta
    await pausa(2500)
    const processi = app.getAppMetrics()
    const pid = w.webContents.getOSProcessId()
    const quali = { renderer: pid, gpu: processi.find(m => m.type === 'GPU')?.pid, principale: process.pid }
    const pids = Object.values(quali).filter(Boolean)
    const prima = tempoCpu(pids)
    const f0 = query ? await w.webContents.executeJavaScript('window.scena ? window.scena.info().frame : 0') : 0
    const t0 = Date.now()
    await pausa(MISURA * 1000)
    const dopo = tempoCpu(pids)
    const secondi = (Date.now() - t0) / 1000
    const f1 = query ? await w.webContents.executeJavaScript('window.scena ? window.scena.info().frame : 0') : 0
    const pct = k => (quali[k] ? ((dopo[quali[k]] - prima[quali[k]]) / secondi) * 100 : 0)
    const r = { renderer: pct('renderer'), gpu: pct('gpu'), principale: pct('principale'), fps: (f1 - f0) / secondi }
    console.log(`compagno-foto · costo ${nome} su ${secondi.toFixed(1)} s: renderer ${r.renderer.toFixed(2)}%, GPU ${r.gpu.toFixed(2)}%, principale ${r.principale.toFixed(2)}%, ${r.fps.toFixed(1)} fotogrammi/s`)
    return r
  }
  const vuota = await misura('pagina vuota', null)
  const fermo = await misura('a riposo', { stato: 'guarda', misura: '1' })
  const dorme = await misura('smorto', { stato: 'smorto', misura: '1' })
  // il cursore che gira intorno: lo sguardo cambia 12 volte al secondo, come lo manda il guscio
  const segue = await misura('col cursore che si muove', { stato: 'guarda', misura: '1' },
    'let k = 0; setInterval(() => { k++; window.scena.guarda(Math.sin(k / 6) * 0.8, Math.cos(k / 9) * 0.4) }, 80); 1')
  const totale = r => r.renderer + r.gpu + r.principale
  const oltre = r => (totale(r) - totale(vuota)).toFixed(2)
  console.log(`compagno-foto · oltre la pagina vuota, in percento di un core: a riposo +${oltre(fermo)}, smorto +${oltre(dorme)}, col cursore +${oltre(segue)}`)
  verifica(fermo.fps <= 6, `a riposo bastano 5 fotogrammi al secondo (${fermo.fps.toFixed(1)})`)
  verifica(dorme.fps <= 4, `smorto 3 (${dorme.fps.toFixed(1)})`)
  verifica(segue.fps > 15 && segue.fps <= 31, `col cursore fino a 30 (${segue.fps.toFixed(1)})`)
  w.destroy()
  console.log(guasti.length ? `guasti: ${guasti.length}` : 'ok')
  esci(guasti.length ? 1 : 0)
}).catch(e => { console.error(e); esci(1) })
