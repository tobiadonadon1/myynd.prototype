// Il richiamo: la barra che la scorciatoia apre da qualunque app.
//
// Non è la finestra grande: è una riga sola, senza cornice, sopra a tutto,
// sullo schermo dove sta il cursore. Ci si scrive una cosa da segnare — o una
// domanda, se comincia con «?» — e si sparisce. Carica la stessa pagina
// dell'app con `?richiamo=1`: il renderer sa che è lì e disegna solo la barra
// (`src/richiamo/Richiamo.tsx`). L'altezza la decide la pagina e la dice via
// IPC: la finestra si adatta al contenuto, entro i limiti di `posizione.ts`.
//
// Si nasconde quando perde il fuoco o quando la pagina chiede di chiudere
// (Esc): una barra che resta a mezz'aria sopra un'altra app è una cosa rotta.

import { app, BrowserWindow, screen } from 'electron'
import { fileURLToPath } from 'node:url'
import { ALTEZZA_MINIMA, posizioneRichiamo } from './posizione.ts'
import { scriviRegistro } from './server.ts'
import * as finestra from './finestra.ts'

const PRELOAD = fileURLToPath(new URL('./preload.cjs', import.meta.url))
const MAC = process.platform === 'darwin'

let barra: BrowserWindow | null = null
let url = ''
let argomenti: string[] = []
let altezza = ALTEZZA_MINIMA
/*
 * Quando è comparsa l'ultima volta.
 *
 * Su Mac portare avanti l'app rende chiave la finestra che lo era prima —
 * quella grande, se è in vista — e la barra appena mostrata perde il fuoco
 * per un istante, prima ancora che qualcuno la veda. Un `blur` in quel
 * mezzo secondo non è la persona che è andata altrove: si riprende il fuoco
 * invece di sparire.
 */
let mostrataAlle = 0
const GRAZIA = 500

/** Il server c'è: da qui in poi la barra si può aprire. */
export function prepara(urlApp: string, argomentiPreload: string[]) {
  url = new URL('/?richiamo=1', urlApp).toString()
  argomenti = argomentiPreload
  // la pagina vecchia parlava con un altro server: si rifà alla prossima apertura
  if (barra && !barra.isDestroyed()) { barra.destroy(); barra = null }
}

/** L'area utile dello schermo su cui sta il cursore: è lì che si sta guardando. */
function areaDelCursore() {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
}

function crea(): BrowserWindow {
  const w = new BrowserWindow({
    ...posizioneRichiamo(areaDelCursore(), altezza),
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    title: 'Myynd',
    ...(MAC ? { vibrancy: 'hud' as const, visualEffectState: 'active' as const } : {}),
    webPreferences: {
      preload: PRELOAD,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
      additionalArguments: [...argomenti, '--myynd-richiamo=1']
    }
  })
  barra = w
  // sopra le finestre a schermo intero, e su tutti gli spazi: la scorciatoia
  // si preme da dove si è, non da dove sta Myynd
  w.setAlwaysOnTop(true, 'floating')
  w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  w.on('blur', () => {
    if (w.webContents.isDevToolsFocused()) return
    if (Date.now() - mostrataAlle < GRAZIA) { w.focus(); return }
    scriviRegistro('guscio · il richiamo perde il fuoco: si nasconde')
    nascondi()
  })
  w.on('closed', () => { if (barra === w) barra = null })
  // le finestre nuove qui non esistono, e non si va da nessun'altra parte
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  w.webContents.on('will-navigate', e => e.preventDefault())
  void w.loadURL(url)
  return w
}

export function attuale(): BrowserWindow | null {
  return barra && !barra.isDestroyed() ? barra : null
}

export function visibile(): boolean {
  const w = attuale()
  return !!w && w.isVisible()
}

/** Sullo schermo del cursore, con il fuoco. Falso se il server non c'è ancora. */
export function mostra(): boolean {
  if (!url) return false
  const w = attuale() ?? crea()
  w.setBounds(posizioneRichiamo(areaDelCursore(), altezza))
  // prima l'app davanti, poi la barra: al contrario macOS rende chiave la
  // finestra grande dopo la barra, e la barra si vede sfilare il fuoco
  if (MAC) app.focus({ steal: true })
  mostrataAlle = Date.now()
  w.show()
  w.focus()
  scriviRegistro('guscio · il richiamo si apre')
  return true
}

/**
 * Via, e il fuoco torna a chi ce l'aveva.
 *
 * Su Mac nascondere una finestra non basta: Myynd resta l'app attiva, con
 * i suoi menù, e chi ha premuto Esc si ritrova senza tastiera sull'editor da
 * cui era partito. Se la finestra grande non è in vista si nasconde l'app
 * intera, che è il gesto con cui macOS ridà il fuoco all'app di prima.
 *
 * Se invece è in vista, l'app resta: `app.hide()` la porterebbe via con la
 * barra — e la si chiama anche dal `blur`, cioè proprio quando la persona
 * ha appena cliccato sulla finestra grande. Lo si guarda qui, al momento,
 * e non lo si fa dire a chi chiama: il `blur` non lo sa.
 */
export function nascondi() {
  const w = attuale()
  if (!w || !w.isVisible()) return
  w.hide()
  if (MAC && !finestra.inVista()) app.hide()
}

/** La scorciatoia: apre se è chiusa, chiude se è aperta. */
export function alterna(): boolean {
  if (visibile()) { nascondi(); return true }
  return mostra()
}

/** La pagina ha misurato il suo contenuto: la finestra si adatta. */
export function ridimensiona(contenuto: number) {
  const w = attuale()
  const nuova = posizioneRichiamo(w ? screen.getDisplayMatching(w.getBounds()).workArea : areaDelCursore(), contenuto)
  altezza = nuova.height
  if (!w || !w.isVisible()) return
  const adesso = w.getBounds()
  if (adesso.height === nuova.height) return
  // la cima resta ferma: cresce verso il basso, come un menù
  w.setBounds({ x: adesso.x, y: adesso.y, width: adesso.width, height: nuova.height })
}

export function distruggi() {
  const w = attuale()
  if (w) w.destroy()
  barra = null
}
