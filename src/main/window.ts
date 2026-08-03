import { BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null
let quitting = false
let windowReady = false
let pendingSummon = false

export function markQuitting(): void {
  quitting = true
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

/**
 * Crea la finestra nascosta e già caricata. Va chiamata una sola volta,
 * all'avvio dell'app: mostrarla dopo è solo show()+focus(), mai un caricamento.
 */
export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 980,
    height: 680,
    minWidth: 840,
    minHeight: 560,
    center: true,
    resizable: true,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    transparent: true,
    backgroundColor: '#00000000',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    roundedCorners: true,
    hasShadow: true,
    fullscreenable: false,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  win.once('ready-to-show', () => {
    // il contenuto è dipinto: da qui in poi mostrare la finestra è sicuro
    // (niente flash bianco). Resta comunque nascosta finché non viene
    // richiamata — non si mostra da sola all'avvio.
    windowReady = true
    if (pendingSummon) {
      pendingSummon = false
      summon(win)
    }
  })

  win.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    win.hide()
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    void win.loadURL(rendererUrl)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow = win
  return win
}

/** Porta la finestra in primo piano e le dà il focus, senza restare always-on-top. */
export function bringToFront(win: BrowserWindow): void {
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

/** Mostra e mette a fuoco la finestra, avvisando il renderer. */
export function summon(win: BrowserWindow): void {
  if (!windowReady) {
    // contenuto non ancora dipinto (praticamente mai, ma per sicurezza):
    // aspetta 'ready-to-show' invece di rischiare un flash bianco.
    pendingSummon = true
    return
  }
  bringToFront(win)
  win.webContents.send('window:shown')
}
