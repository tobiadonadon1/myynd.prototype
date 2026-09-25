// Il mostriciattolo sullo schermo.
//
// Spento finché la persona non lo accende dalle Preferenze. Acceso, è un
// quadratino di 64 punti sempre sopra, su tutti gli Space, che non prende mai
// il fuoco: su Mac un pannello che non attiva l'app, come il richiamo. Un
// clic apre la barra del richiamo (come ⇧⌘M), trascinarlo lo sposta e il
// posto resta, il tasto destro dà pausa o ripresa (se l'osservatore è
// acceso), «Apri Myynd» e «Togli dallo schermo». Smorto quando non guarda, col
// puntino quando qualcosa aspetta: le stesse regole della barra dei menu.
//
// La pagina è statica (`compagno.html`), senza server e senza gettone: c'è
// solo un'immagine da mostrare. Parla col guscio da `compagno-preload.cjs`.
//
// Da qui non si chiama mai `focus()`, `show()` o `app.focus()`: il
// mostriciattolo compare con `showInactive()` e basta. Prendere il fuoco
// vorrebbe dire portare avanti Myynd, e macOS salterebbe allo Space della
// finestra grande: esattamente il guasto che il richiamo ha già insegnato.

import { BrowserWindow, Menu, ipcMain, screen, type IpcMainEvent, type MenuItemConstructorOptions } from 'electron'
import { fileURLToPath } from 'node:url'
import * as impostazioni from './impostazioni.ts'
import { smorto, vociCompagno, type Voce } from './icona-barra.ts'
import { t } from './lingua.ts'
import type { StatoLocale } from './osservatore.ts'
import { LATO_COMPAGNO, posizioneCompagno, trascinaCompagno } from './posizione.ts'
import { scriviRegistro } from './server.ts'

const PAGINA = fileURLToPath(new URL('./compagno.html', import.meta.url))
const PRELOAD = fileURLToPath(new URL('./compagno-preload.cjs', import.meta.url))
const MAC = process.platform === 'darwin'
/** Uno spostamento dalla presa più grande di così non viene da un trascinamento. */
const PASSO_MASSIMO = 20_000

export type Azioni = { alPremere(): void; apri(): void; pausa(): void; riprendi(): void }

let azioni: Azioni | null = null
let finestra: BrowserWindow | null = null
let osservatore: Pick<StatoLocale, 'disponibile' | 'acceso' | 'pausaFino' | 'guarda'> =
  { disponibile: false, acceso: false, pausaFino: null, guarda: false }
let inAttesa = 0
let ascolti = false
/** Dov'era la finestra quando la si è presa: ogni passo del trascinamento si conta da qui. */
let presa: { x: number; y: number } | null = null

function attuale(): BrowserWindow | null {
  return finestra && !finestra.isDestroyed() ? finestra : null
}

function aree() {
  return screen.getAllDisplays().map(d => d.workArea)
}

function salvata(): { x?: number; y?: number } | undefined {
  const c = impostazioni.leggi().compagno
  return c ? { x: c.x, y: c.y } : undefined
}

/** Da dove arriva il messaggio? Solo la pagina del mostriciattolo può chiedere. */
function suo(e: IpcMainEvent): BrowserWindow | null {
  const w = attuale()
  return w && e.sender === w.webContents ? w : null
}

function mandaStato() {
  const w = attuale()
  if (!w) return
  w.webContents.send('compagno:stato', { guarda: !smorto({ guarda: osservatore.guarda, piattaforma: process.platform }), attesa: inAttesa > 0 })
}

function riposiziona() {
  const w = attuale()
  if (!w) return
  const [x, y] = w.getPosition()
  const p = posizioneCompagno(aree(), { x, y }, screen.getPrimaryDisplay().workArea)
  if (p.x !== x || p.y !== y) w.setPosition(p.x, p.y)
}

function menu(w: BrowserWindow) {
  const su = azioni
  if (!su) return
  const voce = (v: Voce): MenuItemConstructorOptions => {
    switch (v) {
      case 'pausa': return { label: t('Pausa per un’ora'), click: () => su.pausa() }
      case 'riprendi': return { label: t('Riprendi a guardare'), click: () => su.riprendi() }
      case 'apri': return { label: t('Apri Myynd'), click: () => su.apri() }
      case 'togli': return { label: t('Togli dallo schermo'), click: () => accendi(false) }
      default: return { type: 'separator' }
    }
  }
  Menu.buildFromTemplate(vociCompagno({ ...osservatore, adesso: Date.now() }).map(voce)).popup({ window: w })
}

/** I canali della pagina, registrati una volta sola; ognuno controlla chi lo chiama. */
function ascolta() {
  if (ascolti) return
  ascolti = true
  ipcMain.on('compagno:premuto', e => { if (suo(e)) azioni?.alPremere() })
  ipcMain.on('compagno:menu', e => { const w = suo(e); if (w) menu(w) })
  ipcMain.on('compagno:afferra', e => {
    const w = suo(e)
    if (!w) return
    const [x, y] = w.getPosition()
    presa = { x, y }
  })
  // dx e dy: tutto lo spostamento del puntatore dalla presa, non dall'ultimo passo
  ipcMain.on('compagno:trascina', (e, dx: unknown, dy: unknown) => {
    const w = suo(e)
    if (!w || typeof dx !== 'number' || typeof dy !== 'number') return
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) > PASSO_MASSIMO || Math.abs(dy) > PASSO_MASSIMO) return
    const [x, y] = w.getPosition()
    if (!presa) presa = { x, y }
    const p = trascinaCompagno(aree(), presa, Math.round(dx), Math.round(dy), { x, y })
    if (p.x !== x || p.y !== y) w.setPosition(p.x, p.y)
  })
  ipcMain.on('compagno:lascia', e => {
    const w = suo(e)
    if (!w) return
    presa = null
    const [x, y] = w.getPosition()
    impostazioni.scrivi({ compagno: { ...impostazioni.leggi().compagno, acceso: true, x, y } })
  })
  ipcMain.on('compagno:pronto', e => { if (suo(e)) mandaStato() })
  screen.on('display-removed', riposiziona)
  screen.on('display-added', riposiziona)
  screen.on('display-metrics-changed', riposiziona)
}

function crea(): BrowserWindow {
  const p = posizioneCompagno(aree(), salvata(), screen.getPrimaryDisplay().workArea)
  const w = new BrowserWindow({
    width: LATO_COMPAGNO, height: LATO_COMPAGNO, x: p.x, y: p.y,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    acceptFirstMouse: true,
    title: 'Myynd',
    ...(MAC ? { type: 'panel' } : {}),
    webPreferences: {
      preload: PRELOAD,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })
  finestra = w
  // sopra le finestre normali, su tutti gli Space e sopra lo schermo intero.
  // `skipTransformProcessType` come nel richiamo: senza, Myynd diventerebbe
  // un'app di sfondo e perderebbe Dock e menu
  w.setAlwaysOnTop(true, 'floating')
  w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  w.once('ready-to-show', () => { if (!w.isDestroyed()) w.showInactive() })
  w.on('closed', () => { if (finestra === w) finestra = null })
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  w.webContents.on('will-navigate', e => e.preventDefault())
  w.webContents.on('did-finish-load', mandaStato)
  void w.loadFile(PAGINA)
  return w
}

/** All'avvio: c'è solo se la persona l'ha acceso. */
export function prepara(a: Azioni): void {
  azioni = a
  ascolta()
  if (impostazioni.leggi().compagno?.acceso === true && !attuale()) crea()
}

/** Dalle Preferenze, o da «Togli dallo schermo»: si ricorda, e compare o sparisce. */
export function accendi(on: boolean): void {
  impostazioni.scrivi({ compagno: { ...impostazioni.leggi().compagno, acceso: on } })
  if (on && !attuale() && azioni) {
    crea()
    scriviRegistro('guscio · il mostriciattolo compare')
  } else if (!on && attuale()) {
    distruggi()
    scriviRegistro('guscio · il mostriciattolo si toglie')
  }
}

export function osserva(s: StatoLocale): void {
  osservatore = { disponibile: s.disponibile, acceso: s.acceso, pausaFino: s.pausaFino, guarda: s.guarda }
  mandaStato()
}

export function segnala(n: number): void {
  const prima = inAttesa > 0
  inAttesa = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  if (prima !== inAttesa > 0) mandaStato()
}

export function distruggi(): void {
  const w = attuale()
  if (w) w.destroy()
  finestra = null
}
