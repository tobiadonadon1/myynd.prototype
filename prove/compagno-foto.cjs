// Il mostriciattolo in 3D, fotografato, toccato e misurato in una finestra nascosta.
//
//   OUT=<cartella> [SCALA=1|2] [FORESTA=<png>] node_modules/.bin/electron prove/compagno-foto.cjs
//
// Carica la pagina vera (`desktop/compagno.html`, con `compagno.js` e la scena
// in three.js) con un preload finto al posto di quello del guscio, in una
// finestra nascosta grande come quella vera (144 × 188 punti) a scala
// SCALA (2 di serie, come un Retina; 1 come uno schermo esterno), su un fondo
// chiaro e su un bosco scuro: FORESTA è un'immagine da usare come sfondo (per
// esempio una schermata della scrivania), altrimenti un verde scuro dipinto.
// Con `?prova=1` la scena si mette in posa a comando (`scena.posa`): di
// fronte, che guarda a sinistra, a destra, in su, che dorme, a mezzo salto
// col puntino, e col cursore sopra (attento, con la pastiglia). Le foto vanno
// in `OUT/compagno-<posa>-<fondo>.png`.
//
// Poi i gesti, dentro la finestra nascosta e solo lì: il cursore sul corpo
// dice «sopra» e fa comparire la pastiglia, sulla pastiglia resta, fuori se
// ne va dopo 400 ms; i due bottoni chiamano scrivi e impostazioni; un clic sul corpo
// è premuto, un trascinamento sposta e non apre, il tasto destro è il menu.
//
// E il costo: la stessa pagina senza pose, lasciata girare come sul Mac, per
// MISURA secondi (10 di serie), letto con `ps` per renderer, GPU e processo
// principale, contro una pagina vuota nella stessa finestra.
// Dock nascosto, dati temporanei, cane da guardia di 180 secondi.

const { app, BrowserWindow, ipcMain, nativeImage } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const OUT = process.env.OUT || process.cwd()
const MISURA = Number(process.env.MISURA || 10)
const SCALA = Number(process.env.SCALA || 2)
const PAGINA = path.join(__dirname, '..', 'desktop', 'compagno.html')
const LARGO = 144
const ALTO = 188
setTimeout(() => { console.error('compagno-foto · 180 s passati: esco'); pulisci(); app.exit(1) }, 180_000).unref()
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
window.addEventListener('DOMContentLoaded', () => {
  if (!fondo) return
  const s = document.documentElement.style
  if (fondo.startsWith('file:')) { s.background = 'url("' + fondo + '") center / cover' } else s.background = '#' + fondo
})
contextBridge.exposeInMainWorld('compagno', {
  premuto: () => ipcRenderer.send('prova:gesto', 'premuto'),
  scrivi: () => ipcRenderer.send('prova:gesto', 'scrivi'),
  impostazioni: () => ipcRenderer.send('prova:gesto', 'impostazioni'),
  menu: () => ipcRenderer.send('prova:gesto', 'menu'),
  afferra: () => ipcRenderer.send('prova:gesto', 'afferra'),
  trascina: (dx, dy) => ipcRenderer.send('prova:gesto', 'trascina', dx, dy),
  lascia: () => ipcRenderer.send('prova:gesto', 'lascia'),
  pronto: () => ipcRenderer.send('prova:gesto', 'pronto'),
  sopra: on => ipcRenderer.send('prova:gesto', 'sopra', on),
  stato: cb => cb({ guarda: stato !== 'smorto', attesa: stato === 'attesa', testi: { scrivi: 'Write to Myynd', impostazioni: 'Settings' } }),
  sguardo: () => {}
})`)

const gesti = []
ipcMain.on('prova:gesto', (_e, ...g) => gesti.push(g))
const pausa = ms => new Promise(r => setTimeout(r, ms))

/** Il bosco: un pezzo dell'immagine in FORESTA, o un verde scuro dipinto se non c'è. */
function bosco() {
  const file = path.join(DATI, 'bosco.png')
  if (process.env.FORESTA && fs.existsSync(process.env.FORESTA)) {
    const img = nativeImage.createFromPath(process.env.FORESTA)
    const { width, height } = img.getSize()
    // l'angolo in basso a sinistra: di solito lì c'è solo lo sfondo
    const lato = Math.min(width, height) / 2
    fs.writeFileSync(file, img.crop({ x: 0, y: Math.round(height - lato * 1.3), width: Math.round(lato * 0.77), height: Math.round(lato) }).toPNG())
  } else {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="188"><defs><radialGradient id="g" cx="40%" cy="35%" r="80%"><stop offset="0" stop-color="#3E5A2A"/><stop offset=".6" stop-color="#1D3318"/><stop offset="1" stop-color="#0E1A0C"/></radialGradient></defs><rect width="144" height="188" fill="url(#g)"/></svg>`
    fs.writeFileSync(file, nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')).toPNG())
  }
  return 'file://' + file
}

function finestra() {
  return new BrowserWindow({
    show: false, width: LARGO * SCALA, height: ALTO * SCALA, frame: false, useContentSize: true, transparent: true,
    webPreferences: { preload: PRELOAD, sandbox: true, contextIsolation: true, zoomFactor: SCALA }
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
  ['smorto', { sveglio: false, attento: false, tempo: 0.2 }, 'smorto'],
  ['salto', { guarda: [0, 0], sveglio: true, tempo: 2, salto: 0.28 }, 'attesa'],
  ['sopra', { guarda: [0.15, 0.3], sveglio: true, attento: true, tempo: 0.2 }, 'guarda']
]

app.whenReady().then(async () => {
  const guasti = []
  const verifica = (ok, frase) => { if (!ok) guasti.push(frase); console.log(`${ok ? '✓' : '✗'} ${frase}`) }
  const w = finestra()
  for (const [nomeFondo, fondo] of [['chiaro', 'F2E9DC'], ['bosco', bosco()]]) {
    for (const [nome, posa, stato] of POSE) {
      const errori = await carica(w, { stato, fondo, prova: '1' })
      const info = await w.webContents.executeJavaScript(`(() => {
        if (!window.scena) return { scena: false }
        ${nome === 'sopra' ? "document.body.classList.add('sopra')" : ''}
        window.scena.posa(${JSON.stringify(posa)})
        return { scena: true, classi: document.body.className, punto: getComputedStyle(document.getElementById('punto')).display }
      })()`)
      await pausa(nome === 'sopra' ? 300 : 80)
      const img = await w.webContents.capturePage()
      const file = `compagno-${nome}-${nomeFondo}${SCALA === 2 ? '' : `-${SCALA}x`}.png`
      fs.writeFileSync(path.join(OUT, file), img.toPNG())
      console.log(`compagno-foto · ${file} ${JSON.stringify(img.getSize())} ${JSON.stringify(info)}`)
      verifica(info.scena === true, `${file}: la scena 3D parte sotto la sua CSP${errori.length ? ` (${errori.join(' | ')})` : ''}`)
      verifica(info.classi?.includes('spenta') === (stato === 'smorto'), `${file}: smorto solo quando non guarda`)
      verifica((info.punto === 'block') === (stato === 'attesa'), `${file}: il puntino solo quando qualcosa aspetta`)
    }
  }
  if (process.env.SOLO_FOTO === '1') { w.destroy(); console.log(guasti.length ? `guasti: ${guasti.length}` : 'ok'); return esci(guasti.length ? 1 : 0) }

  // i gesti, dentro la finestra nascosta
  await carica(w, { stato: 'guarda', fondo: 'F2E9DC', prova: '1' })
  await pausa(200)
  const zona = await w.webContents.executeJavaScript('window.scena.zona()')
  console.log(`compagno-foto · la zona del corpo ${JSON.stringify(zona)}`)
  // le coordinate della finestra sono in punti della pagina per lo zoom
  const cx = Math.round(zona.cx * SCALA), cy = Math.round(zona.cy * SCALA)
  const topo = (type, x, y, button = 'left', extra = {}) => w.webContents.sendInputEvent({ type, x, y, globalX: 500 + x, globalY: 300 + y, button, clickCount: 1, ...extra })
  const pastiglia = () => w.webContents.executeJavaScript(`(() => { const r = document.getElementById('pastiglia').getBoundingClientRect(); const s = document.getElementById('scrivi').getBoundingClientRect(); const p = document.getElementById('impostazioni').getBoundingClientRect()
    return { vista: document.body.classList.contains('sopra'), opacita: getComputedStyle(document.getElementById('pastiglia')).opacity, basso: r.bottom, scrivi: [s.left + s.width / 2, s.top + s.height / 2], impostazioni: [p.left + p.width / 2, p.top + p.height / 2], titoli: [document.getElementById('scrivi').title, document.getElementById('impostazioni').title] } })()`)
  gesti.length = 0
  topo('mouseMove', 4, 4); await pausa(60)
  verifica(!(await pastiglia()).vista, 'nell’angolo vuoto niente pastiglia')
  topo('mouseMove', cx, cy); await pausa(300)
  const p1 = await pastiglia()
  verifica(p1.vista && Number(p1.opacita) > 0.9 && p1.basso <= ALTO, `sopra di lui la pastiglia compare dentro la finestra (${JSON.stringify(p1)})`)
  verifica(p1.titoli[0] === 'Write to Myynd' && p1.titoli[1] === 'Settings', `i bottoni dicono cosa fanno (${p1.titoli})`)
  // dal corpo alla pastiglia: passa per il vuoto in mezzo e resta
  const [sx, sy] = p1.scrivi.map(v => Math.round(v * SCALA))
  topo('mouseMove', sx, sy); await pausa(120)
  verifica((await pastiglia()).vista && gesti.filter(g => g[0] === 'sopra').at(-1)?.[1] === true, `sulla pastiglia resta, e prende i clic (${JSON.stringify(gesti)})`)
  gesti.length = 0
  topo('mouseDown', sx, sy); topo('mouseUp', sx, sy); await pausa(120)
  verifica(gesti.some(g => g[0] === 'scrivi') && !gesti.some(g => g[0] === 'premuto' || g[0] === 'afferra'), `«scrivi» chiama scrivi, non è un clic su di lui (${JSON.stringify(gesti)})`)
  const [px, py] = p1.impostazioni.map(v => Math.round(v * SCALA))
  gesti.length = 0
  topo('mouseMove', px, py); await pausa(60)
  topo('mouseDown', px, py); topo('mouseUp', px, py); await pausa(120)
  verifica(gesti.some(g => g[0] === 'impostazioni'), `l’ingranaggio chiama impostazioni (${JSON.stringify(gesti)})`)
  gesti.length = 0
  topo('mouseMove', 4, 4); await pausa(150)
  verifica((await pastiglia()).vista && gesti.at(-1)?.[0] === 'sopra' && gesti.at(-1)?.[1] === false, `uscendo il mouse passa subito, la pastiglia aspetta (${JSON.stringify(gesti)})`)
  await pausa(450)
  verifica(!(await pastiglia()).vista, 'dopo 400 ms la pastiglia se ne va')

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
  verifica(passi.every((v, i) => i === 0 || v >= passi[i - 1]) && passi.at(-1) <= 48 * SCALA, `ogni passo si conta dalla presa (${JSON.stringify(passi)})`)
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
    // i primi secondi si assesta (il sonno arriva piano): non si contano
    await pausa(4000)
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
  verifica(fermo.fps <= 5, `a riposo bastano 4 fotogrammi al secondo (${fermo.fps.toFixed(1)})`)
  verifica(dorme.fps <= 3, `smorto 2 (${dorme.fps.toFixed(1)})`)
  verifica(segue.fps > 15 && segue.fps <= 31, `col cursore fino a 30 (${segue.fps.toFixed(1)})`)
  w.destroy()
  console.log(guasti.length ? `guasti: ${guasti.length}` : 'ok')
  esci(guasti.length ? 1 : 0)
}).catch(e => { console.error(e); esci(1) })
