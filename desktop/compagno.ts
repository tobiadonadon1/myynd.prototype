// Il mostriciattolo sullo schermo.
//
// Acceso di serie: è qualcuno sul computer con te, non un'opzione da
// scoprire. Si toglie dalle sue impostazioni, dal suo menu («Togli dallo
// schermo») o dalle Preferenze, e la scelta resta; torna dalle Preferenze o
// dalla barra dei menu. È una finestra di `misureCompagno` punti sempre
// sopra, su tutti gli Space, che non prende mai il fuoco: su Mac un pannello
// che non attiva l'app, come il richiamo. Dentro c'è lui in 3D, col pelo
// (`compagno-scena.js`): respira, sbatte gli occhi, gira la testa verso il
// cursore (se lo si vuole), fa un salto quando qualcosa aspetta, socchiude
// gli occhi quando l'osservatore non guarda.
//
// Il cursore che gli passa sopra lo sveglia (si drizza, apre gli occhi, lo
// guarda) e fa comparire sotto di lui una pastiglia scura con due bottoni:
// scrivi e impostazioni. «Scrivi», come un clic su di lui, apre la casella
// attaccata sotto di lui (il richiamo, `richiamo.alternaSotto`): lì si
// scrive e la risposta di Myynd arriva lì. Un altro clic la chiude, come Esc,
// la × o un clic altrove. «Impostazioni» apre lì sotto il pannellino con la
// taglia, «Segui il mio cursore» e «Togli dalla scrivania». Trascinarlo lo
// sposta e il posto resta (e la casella aperta lo segue), il tasto destro dà
// pausa o ripresa (se l'osservatore è acceso), «Apri Myynd» e «Togli dallo
// schermo».
//
// La finestra è quasi tutta trasparente: il mouse ci passa attraverso finché
// la pagina non dice che il cursore è sopra il corpo o sopra la pastiglia
// (`compagno:sopra`). Dove sta il cursore, per lo sguardo, lo chiede il
// guscio al sistema dodici volte al secondo, solo mentre lui si vede, solo
// se lo deve seguire, e solo se il cursore si è mosso.
//
// La pagina è statica (`compagno.html`), senza server e senza gettone.
// Parla col guscio da `compagno-preload.cjs`. Le taglie sono la stessa
// pagina ingrandita (`setZoomFactor`).
//
// Da qui non si chiama mai `focus()`, `show()` o `app.focus()`: il
// mostriciattolo compare con `showInactive()` e basta. Prendere il fuoco
// vorrebbe dire portare avanti Myynd, e macOS salterebbe allo Space della
// finestra grande: esattamente il guasto che il richiamo ha già insegnato.
// La casella prende la tastiera, ma è il richiamo a farlo, col suo pannello.

import { BrowserWindow, Menu, ipcMain, screen, type IpcMainEvent, type MenuItemConstructorOptions } from 'electron'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as impostazioni from './impostazioni.ts'
import { vociCompagno, type Voce } from './icona-barra.ts'
import { t } from './lingua.ts'
import type { StatoLocale } from './osservatore.ts'
import { corpoDelCompagno, misureCompagno, posizioneCompagno, sguardoVerso, trascinaCompagno, type Area, type Taglia } from './posizione.ts'
import { scriviRegistro } from './server.ts'

const PAGINA = fileURLToPath(new URL('./compagno.html', import.meta.url))
const PRELOAD = fileURLToPath(new URL('./compagno-preload.cjs', import.meta.url))
/** Un modello vero, se un giorno c'è: la pagina lo carica al posto di quello fatto a mano. */
const MODELLO = fileURLToPath(new URL('./icone/compagno.glb', import.meta.url))
const MAC = process.platform === 'darwin'
/** Uno spostamento dalla presa più grande di così non viene da un trascinamento. */
const PASSO_MASSIMO = 20_000
/** Ogni quanto si guarda dov'è il cursore: dodici volte al secondo bastano a uno sguardo. */
const OGNI_SGUARDO = 80
const TAGLIE: Taglia[] = ['piccolo', 'medio', 'grande']

export type Azioni = {
  /** Il clic su di lui, o «scrivi»: apre o chiude la casella sotto di lui, che sta in `riquadro`. */
  parla(riquadro: Area): void
  /** L'ingranaggio della pastiglia: apre o chiude le sue impostazioni sotto di lui. */
  impostazioni(riquadro: Area): void
  /** Si è spostato o ha cambiato taglia: la casella aperta lo segue. */
  mosso?(riquadro: Area): void
  apri(): void; pausa(): void; riprendi(): void
  /** Acceso o spento, da qualunque parte: le Preferenze aperte lo devono sapere. */
  cambiato?(on: boolean): void
}

/** Quello che si sceglie nelle sue impostazioni. */
export type Scelte = { taglia: Taglia; segue: boolean }

let azioni: Azioni | null = null
let finestra: BrowserWindow | null = null
let osservatore: Pick<StatoLocale, 'disponibile' | 'acceso' | 'pausaFino' | 'guarda'> =
  { disponibile: false, acceso: false, pausaFino: null, guarda: false }
let inAttesa = 0
let ascolti = false
/** Dov'era la finestra quando la si è presa: ogni passo del trascinamento si conta da qui. */
let presa: { x: number; y: number } | null = null
/** Il giro dello sguardo, finché lui si vede; e l'ultimo cursore e l'ultimo sguardo mandati. */
let giroSguardo: ReturnType<typeof setInterval> | null = null
let ultimoCursore = { x: Number.NaN, y: Number.NaN }
let ultimoSguardo = ''

function attuale(): BrowserWindow | null {
  return finestra && !finestra.isDestroyed() ? finestra : null
}

function aree() {
  return screen.getAllDisplays().map(d => d.workArea)
}

/**
 * Acceso, se nessuno l'ha tolto: di serie lo è. Vale anche per chi l'aveva
 * spento quando era spento di serie, prima del 3D: `prepara` lo riaccende
 * una volta sola (`compagno3d`), e da lì in poi «Togli dallo schermo» resta.
 */
export function acceso(): boolean {
  return impostazioni.leggi().compagno?.acceso !== false
}

/** La taglia e se segue il cursore: medio e sì, se nessuno ha scelto. */
export function scelte(): Scelte {
  const c = impostazioni.leggi().compagno
  return { taglia: TAGLIE.includes(c?.taglia as Taglia) ? c!.taglia as Taglia : 'medio', segue: c?.segue !== false }
}

const misure = () => misureCompagno(scelte().taglia)

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
  w.webContents.send('compagno:stato', {
    guarda: osservatore.guarda,
    attesa: inAttesa > 0,
    // le parole dei bottoni della pastiglia, nella lingua dell'app
    testi: { scrivi: t('Scrivi a Myynd'), impostazioni: t('Impostazioni') }
  })
}

/** La lingua è cambiata: i bottoni della pastiglia la seguono. */
export function rinfresca(): void {
  mandaStato()
}

/** Il quadrato dove sta lui, sullo schermo: da qui si misurano casella e sguardo. */
function corpo(w: BrowserWindow): Area {
  return corpoDelCompagno(w.getBounds())
}

function riposiziona() {
  const w = attuale()
  if (!w) return
  const [x, y] = w.getPosition()
  const p = posizioneCompagno(aree(), { x, y }, screen.getPrimaryDisplay().workArea, misure())
  if (p.x !== x || p.y !== y) w.setPosition(p.x, p.y)
  azioni?.mosso?.(corpo(w))
}

/**
 * Lo sguardo: dov'è il cursore rispetto a lui. Solo se il cursore si è
 * mosso, solo se lo sguardo cambia di almeno un centesimo, e mai con la
 * finestra nascosta: un mostriciattolo che nessuno vede non chiede niente.
 */
function guardaIlCursore() {
  const w = attuale()
  if (!w || !w.isVisible() || !scelte().segue) { fermaSguardo(); return }
  const c = screen.getCursorScreenPoint()
  if (c.x === ultimoCursore.x && c.y === ultimoCursore.y) return
  ultimoCursore = c
  const s = sguardoVerso(corpo(w), c)
  const chiave = `${s.x},${s.y}`
  if (chiave === ultimoSguardo) return
  ultimoSguardo = chiave
  w.webContents.send('compagno:sguardo', s)
}

function avviaSguardo() {
  if (giroSguardo || !scelte().segue) return
  ultimoCursore = { x: Number.NaN, y: Number.NaN }
  ultimoSguardo = ''
  giroSguardo = setInterval(guardaIlCursore, OGNI_SGUARDO)
}

function fermaSguardo() {
  if (giroSguardo) clearInterval(giroSguardo)
  giroSguardo = null
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
  ipcMain.on('compagno:premuto', e => { const w = suo(e); if (w) azioni?.parla(corpo(w)) })
  ipcMain.on('compagno:scrivi', e => { const w = suo(e); if (w) azioni?.parla(corpo(w)) })
  ipcMain.on('compagno:impostazioni', e => { const w = suo(e); if (w) azioni?.impostazioni(corpo(w)) })
  // il cursore sopra il corpo: la finestra prende i clic; altrove passano a chi sta sotto
  ipcMain.on('compagno:sopra', (e, on: unknown) => {
    const w = suo(e)
    if (w) w.setIgnoreMouseEvents(on !== true, { forward: true })
  })
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
    const p = trascinaCompagno(aree(), presa, Math.round(dx), Math.round(dy), { x, y }, misure())
    if (p.x !== x || p.y !== y) {
      w.setPosition(p.x, p.y)
      azioni?.mosso?.(corpo(w))
    }
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
  const m = misure()
  const p = posizioneCompagno(aree(), salvata(), screen.getPrimaryDisplay().workArea, m)
  const w = new BrowserWindow({
    width: m.lato, height: m.alto, x: p.x, y: p.y,
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
      spellcheck: false,
      // la taglia: la stessa pagina ingrandita
      zoomFactor: m.scala
    }
  })
  finestra = w
  // sopra le finestre normali, su tutti gli Space e sopra lo schermo intero.
  // `skipTransformProcessType` come nel richiamo: senza, Myynd diventerebbe
  // un'app di sfondo e perderebbe Dock e menu
  w.setAlwaysOnTop(true, 'floating')
  w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  // il mouse passa attraverso finché la pagina non dice che è sopra di lui;
  // `forward` fa arrivare lo stesso i movimenti, per accorgersene
  w.setIgnoreMouseEvents(true, { forward: true })
  w.once('ready-to-show', () => {
    if (w.isDestroyed()) return
    w.showInactive()
    avviaSguardo()
  })
  w.on('show', avviaSguardo)
  w.on('hide', fermaSguardo)
  w.on('closed', () => {
    fermaSguardo()
    if (finestra === w) finestra = null
  })
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  w.webContents.on('will-navigate', e => e.preventDefault())
  w.webContents.on('did-finish-load', () => {
    w.webContents.setZoomFactor(misure().scala)
    mandaStato()
  })
  void w.loadFile(PAGINA, existsSync(MODELLO) ? { query: { glb: '1' } } : undefined)
  return w
}

/**
 * Dalle sue impostazioni: la taglia (la finestra cresce o cala tenendo i
 * piedi dove sono) e se segue il cursore. Si ricorda tutto.
 */
export function imposta(patch: Partial<Scelte>): Scelte {
  const prima = scelte()
  const taglia = TAGLIE.includes(patch.taglia as Taglia) ? patch.taglia as Taglia : prima.taglia
  const segue = typeof patch.segue === 'boolean' ? patch.segue : prima.segue
  impostazioni.scrivi({ compagno: { ...impostazioni.leggi().compagno, acceso: acceso(), taglia, segue } })
  const w = attuale()
  if (w && taglia !== prima.taglia) {
    const vecchio = w.getBounds()
    const m = misureCompagno(taglia)
    // il centro dei piedi resta fermo: cresce in su e di lato, non scappa
    const voluta = { x: Math.round(vecchio.x + vecchio.width / 2 - m.lato / 2), y: vecchio.y + vecchio.height - m.alto }
    const p = posizioneCompagno(aree(), voluta, screen.getPrimaryDisplay().workArea, m)
    w.setBounds({ x: p.x, y: p.y, width: m.lato, height: m.alto })
    w.webContents.setZoomFactor(m.scala)
    impostazioni.scrivi({ compagno: { ...impostazioni.leggi().compagno, acceso: acceso(), x: p.x, y: p.y } })
    azioni?.mosso?.(corpo(w))
    scriviRegistro(`guscio · il mostriciattolo diventa ${taglia}`)
  }
  if (segue !== prima.segue) {
    if (segue) avviaSguardo()
    else {
      fermaSguardo()
      // non segue più: torna a guardare davanti a sé
      attuale()?.webContents.send('compagno:sguardo', { x: 0, y: 0 })
    }
  }
  return { taglia, segue }
}

/** All'avvio: c'è, a meno che la persona non l'abbia tolto. */
export function prepara(a: Azioni): void {
  azioni = a
  ascolta()
  // una volta sola: chi l'aveva spento quando era spento di serie lo ritrova
  // acceso, perché allora non era una scelta
  const s = impostazioni.leggi()
  if (s.compagno3d !== true) impostazioni.scrivi({ compagno: { ...s.compagno, acceso: true }, compagno3d: true })
  if (acceso() && !attuale()) crea()
}

/** Dalle Preferenze, dalla barra dei menu, dalle sue impostazioni o da «Togli dallo schermo»: si ricorda, e compare o sparisce. */
export function accendi(on: boolean): void {
  impostazioni.scrivi({ compagno: { ...impostazioni.leggi().compagno, acceso: on } })
  if (on && !attuale() && azioni) {
    crea()
    scriviRegistro('guscio · il mostriciattolo compare')
  } else if (!on && attuale()) {
    distruggi()
    scriviRegistro('guscio · il mostriciattolo si toglie')
  }
  // «Togli dallo schermo» non passa dalla pagina, e il pannello non prende
  // il fuoco: senza questo l'interruttore nelle Preferenze direbbe ancora acceso
  azioni?.cambiato?.(on)
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
  fermaSguardo()
  const w = attuale()
  if (w) w.destroy()
  finestra = null
}
