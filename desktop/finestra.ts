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

import { app, BrowserWindow, screen, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import * as impostazioni from './impostazioni.ts'
import { t } from './lingua.ts'

const PRELOAD = fileURLToPath(new URL('./preload.cjs', import.meta.url))

export const SFONDO = '#F2E9DC'
const INCHIOSTRO = '#22271F'

/**
 * Dove stanno i semafori con la barra del titolo nascosta.
 *
 * L'interfaccia lascia una fascia vuota in cima — ventiquattro pixel, li
 * mette `App.tsx` come margine delle due colonne — e i tre cerchi stanno lì
 * dentro, sul fondo, senza toccare la scheda della colonna che comincia
 * sotto. Chi cambia quella fascia rimisuri questi due numeri.
 */
export const SEMAFORI = { x: 19, y: 15 }

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
  // su Mac la barra del titolo è nascosta e la finestra si prende dal corpo;
  // su Windows la barra c'è, e un corpo trascinabile si mangerebbe i clic
  const trascina = process.platform === 'darwin' ? ';-webkit-app-region:drag' : ''
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Myynd</title><style>
html,body{margin:0;height:100%;background:${SFONDO};color:${INCHIOSTRO};
font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;-webkit-user-select:none}
body{display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px${trascina}}
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
    if (nostra(url)) return
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

/**
 * È un indirizzo della nostra pagina?
 *
 * Si confronta l'origine *letta* dall'indirizzo, non l'inizio della stringa:
 * `http://127.0.0.1:5174@altrove/` comincia come la nostra e va altrove.
 */
export function nostra(url: string): boolean {
  if (!origine) return false
  try { return new URL(url).origin === origine } catch { return false }
}

/**
 * In primo piano, anche se era nascosta, ridotta a icona, o dietro un'altra app.
 *
 * `w.focus()` da solo non basta su Mac: accende la finestra dentro Myynd, ma
 * se davanti c'è la posta o l'editor Myynd resta dietro, e chi ha premuto la
 * scorciatoia da un'altra app non vede succedere niente. Portare avanti *l'app*
 * è un'altra richiesta, e macOS la concede solo se gliela si fa: è `steal`.
 * È la promessa della scorciatoia globale — «la finestra viene avanti sopra
 * quello che stavi facendo» — quindi qui non è un dettaglio.
 */
export function mostra() {
  const w = attuale()
  if (!w) return
  if (w.isMinimized()) w.restore()
  if (!w.isVisible()) w.show()
  if (process.platform === 'darwin') app.focus({ steal: true })
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
