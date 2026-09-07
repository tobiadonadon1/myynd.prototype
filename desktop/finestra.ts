// La finestra, e le regole su cosa ci può entrare.
//
// Una sola, che carica l'interfaccia dal server locale — mai da `file://`,
// il server lo rifiuta con un 403 e ha ragione. Finché il server non c'è
// ancora si mostra una pagina minima nei colori dell'app: senza, il primo
// secondo sarebbe un rettangolo bianco, che è la cosa più lontana da Myynd
// che esista.
//
// I link verso fuori escono nel browser. Tutto quello che non è la nostra
// origine e non è http(s) resta fuori e basta: la finestra non è un browser.

import { BrowserWindow, screen, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import * as impostazioni from './impostazioni.ts'
import { t } from './lingua.ts'

const PRELOAD = fileURLToPath(new URL('./preload.cjs', import.meta.url))

export const SFONDO = '#F2E9DC'
const INCHIOSTRO = '#22271F'

/**
 * Dove stanno i semafori con la barra del titolo nascosta.
 *
 * La colonna di sinistra dell'app comincia con il marchio in alto: i tre
 * cerchi devono stare sopra la sua riga, non sopra di lui. Chi cambia il
 * margine della colonna ricontrolli lo scatto di `prove/app.mjs`.
 */
export const SEMAFORI = { x: 14, y: 16 }

let finestra: BrowserWindow | null = null
let origine = ''
let chiudeDavvero = false
/*
 * Quello che serve a rifare la finestra da capo.
 *
 * Su Mac la X nasconde e basta, ma una finestra può comunque sparire — un
 * errore del renderer, un `destroy` — e il Dock la chiede di nuovo. Senza
 * questi due la seconda finestra nascerebbe senza versione e piattaforma nel
 * preload, e sulla pagina d'avvio, aspettando una porta che è già arrivata.
 */
let argomentiDati: string[] = []
let urlApp = ''

function paginaDiAvvio(): string {
  const riga = t('Myynd si sta svegliando.')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Myynd</title><style>
html,body{margin:0;height:100%;background:${SFONDO};color:${INCHIOSTRO};
font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;-webkit-user-select:none}
body{display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;-webkit-app-region:drag}
h1{margin:0;font-weight:600;font-size:34px;letter-spacing:-.02em}
p{margin:0;font-size:15px;opacity:.7}
</style></head><body><h1>Myynd</h1><p>${riga}</p></body></html>`
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html)
}

/** Vero se il riquadro salvato sta almeno in parte su uno schermo di adesso. */
function visibile(r: impostazioni.Riquadro): boolean {
  return screen.getAllDisplays().some(d => {
    const a = d.workArea
    return r.x < a.x + a.width - 80 && r.x + r.width > a.x + 80 &&
      r.y < a.y + a.height - 80 && r.y + r.height > a.y + 40
  })
}

function apriFuoriSePuoi(url: string) {
  try {
    const u = new URL(url)
    if (u.protocol === 'http:' || u.protocol === 'https:') void shell.openExternal(url)
  } catch { /* non è un indirizzo: si ignora */ }
}

export function crea(argomenti: string[] = argomentiDati): BrowserWindow {
  if (finestra) return finestra
  argomentiDati = argomenti
  const salvato = impostazioni.leggi().finestra
  const riquadro = salvato && visibile(salvato) ? salvato : { width: 1280, height: 860 }

  const w = new BrowserWindow({
    ...riquadro,
    minWidth: 900, minHeight: 640,
    show: false,
    backgroundColor: SFONDO,
    title: 'Myynd',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: SEMAFORI,
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      preload: PRELOAD,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
      additionalArguments: argomenti
    }
  })
  finestra = w

  w.once('ready-to-show', () => w.show())

  // le finestre nuove non esistono: o è un link e va nel browser, o niente
  w.webContents.setWindowOpenHandler(({ url }) => {
    apriFuoriSePuoi(url)
    return { action: 'deny' }
  })
  w.webContents.on('will-navigate', (e, url) => {
    if (origine && url.startsWith(origine)) return
    e.preventDefault()
    apriFuoriSePuoi(url)
  })

  let orologio: NodeJS.Timeout | null = null
  const ricorda = () => {
    if (orologio) clearTimeout(orologio)
    orologio = setTimeout(() => {
      if (!w.isDestroyed() && !w.isMinimized() && !w.isFullScreen()) {
        impostazioni.scrivi({ finestra: w.getNormalBounds() })
      }
    }, 400)
  }
  w.on('resize', ricorda)
  w.on('move', ricorda)

  // su Mac la X nasconde: l'app resta nel Dock e nella barra, come le altre
  w.on('close', e => {
    if (process.platform === 'darwin' && !chiudeDavvero) {
      e.preventDefault()
      w.hide()
    }
  })
  w.on('closed', () => { finestra = null })

  void w.loadURL(urlApp || paginaDiAvvio())
  return w
}

/** Da adesso in poi la X chiude sul serio: si sta uscendo. */
export function lasciaChiudere() {
  chiudeDavvero = true
}

export function attuale(): BrowserWindow | null {
  return finestra && !finestra.isDestroyed() ? finestra : null
}

/** Il server c'è: si carica l'interfaccia vera da lì. */
export function caricaApp(url: string) {
  origine = new URL(url).origin
  urlApp = url
  const w = attuale()
  if (w) void w.loadURL(url)
}

export function origineNostra(): string {
  return origine
}

/** In primo piano, anche se era nascosta o ridotta a icona. */
export function mostra() {
  const w = attuale()
  if (!w) return
  if (w.isMinimized()) w.restore()
  if (!w.isVisible()) w.show()
  w.focus()
}

/** Visibile e con il fuoco: la scorciatoia globale la nasconde, se no la porta su. */
export function alterna() {
  const w = attuale()
  if (!w) return
  if (w.isVisible() && w.isFocused()) w.hide()
  else mostra()
}

export function manda(canale: string, carico: unknown) {
  const w = attuale()
  if (w) w.webContents.send(canale, carico)
}
