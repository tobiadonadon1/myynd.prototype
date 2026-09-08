// Il richiamo: la barra che la scorciatoia apre da qualunque app.
//
// Non è la finestra grande: è una riga sola, senza cornice, sopra a tutto,
// sullo schermo dove sta il cursore. Ci si scrive una cosa da segnare — o una
// domanda, se comincia con «?» — e si sparisce. Carica la stessa pagina
// dell'app con `?richiamo=1`: il renderer sa che è lì e disegna solo la barra
// (`src/richiamo/Richiamo.tsx`). L'altezza la decide la pagina e la dice via
// IPC: la finestra si adatta al contenuto, entro i limiti di `posizione.ts`.
//
// Nasce nascosta appena il server c'è, così la prima scorciatoia trova una
// pagina già disegnata: una finestra trasparente che sta ancora caricando è
// un rettangolo invisibile, e chi preme ⇧⌘M vede «niente» e va altrove.
//
// Su Mac è un pannello che non attiva l'app — `type: 'panel'`, cioè un
// NSPanel con lo stile nonactivating, quello di Spotlight. Compare sopra a
// quello che si sta usando, anche a schermo intero e sullo Space in cui si è,
// prende la tastiera senza portare avanti Myynd, e quando sparisce la
// tastiera torna da sola a chi ce l'aveva. Portare avanti l'app era il
// guasto: macOS saltava allo Space della finestra grande, rendeva chiave
// quella, e la barra si vedeva sfilare il fuoco prima ancora di comparire.
//
// Si nasconde quando perde il fuoco o quando la pagina chiede di chiudere
// (Esc): una barra che resta a mezz'aria sopra un'altra app è una cosa rotta.

import { app, BrowserWindow, screen } from 'electron'
import { fileURLToPath } from 'node:url'
import { ALTEZZA_MINIMA, doveSiApre, posizioneRichiamo } from './posizione.ts'
import { scriviRegistro } from './server.ts'
import * as finestra from './finestra.ts'

const PRELOAD = fileURLToPath(new URL('./preload.cjs', import.meta.url))
const MAC = process.platform === 'darwin'

let barra: BrowserWindow | null = null
let url = ''
let argomenti: string[] = []
let altezza = ALTEZZA_MINIMA
/** La pagina è arrivata in fondo: da qui in poi mostrarla mostra qualcosa. */
let caricata = false
/** La scorciatoia è arrivata prima della pagina: si mostra appena c'è. */
let daMostrare = false
/*
 * Quando è comparsa l'ultima volta.
 *
 * Se la finestra grande è in vista e Myynd è l'app attiva, macOS può rendere
 * chiave quella per un istante mentre la barra sta comparendo, e la barra
 * perde il fuoco prima ancora che qualcuno la veda. Un `blur` in quel mezzo
 * secondo non è la persona che è andata altrove: si riprende il fuoco invece
 * di sparire.
 */
let mostrataAlle = 0
const GRAZIA = 500
/*
 * Myynd è l'app attiva? Solo su Mac conta, e lo si sa solo dai suoi eventi.
 *
 * Il pannello non attiva l'app, quindi di norma non lo è: la persona è in
 * un'altra app, e quando la barra sparisce la tastiera torna lì da sola. Lo
 * è se la persona era già in Myynd — per esempio ha chiuso la finestra con
 * la X, che su Mac la nasconde soltanto — e allora, sparita la barra,
 * resterebbe un'app attiva senza finestre: lì, e solo lì, si nasconde l'app.
 */
let appAttiva = false
if (MAC) {
  app.on('did-become-active', () => { appAttiva = true })
  app.on('did-resign-active', () => { appAttiva = false })
}
/** Myynd era l'app attiva quando la barra è comparsa: è a lei che si torna. */
let attivaAllApertura = false

/** Il server c'è: la barra nasce adesso, nascosta, e da qui in poi si può aprire. */
export function prepara(urlApp: string, argomentiPreload: string[]) {
  url = new URL('/?richiamo=1', urlApp).toString()
  argomenti = argomentiPreload
  // la pagina vecchia parlava con un altro server: si rifà da capo
  distruggi()
  crea()
}

/** Lo schermo su cui sta il cursore: è lì che si sta guardando. */
function schermoDelCursore() {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
}

function crea(): BrowserWindow {
  const w = new BrowserWindow({
    ...posizioneRichiamo(schermoDelCursore().workArea, altezza),
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
    focusable: true,
    title: 'Myynd',
    // il pannello che non attiva l'app; `focusable` resta vero, perché la
    // tastiera deve arrivare lo stesso
    ...(MAC ? { type: 'panel', vibrancy: 'hud' as const, visualEffectState: 'active' as const } : {}),
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
  caricata = false
  daMostrare = false
  // sopra a tutto, anche alle finestre a schermo intero, e su tutti gli
  // Space: la scorciatoia si preme da dove si è, non da dove sta Myynd.
  // `skipTransformProcessType` non è un dettaglio: senza, Electron trasforma
  // il processo in un'app di sfondo (UIElement) — via il Dock, via il menù —
  // e Myynd dopo la prima scorciatoia non era più un'app normale
  w.setAlwaysOnTop(true, 'screen-saver')
  w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  w.webContents.once('did-finish-load', () => {
    caricata = true
    if (daMostrare) { daMostrare = false; mostra() }
  })
  w.on('blur', () => {
    // nascondersi manda un `blur` a finestra già sparita: non c'è niente da fare
    if (!w.isVisible() || w.webContents.isDevToolsFocused()) return
    if (Date.now() - mostrataAlle < GRAZIA) { w.focus(); return }
    scriviRegistro('guscio · il richiamo perde il fuoco: si nasconde')
    via(false)
  })
  // ⌘Q con la barra davanti: chi lo preme crede di essere nell'app da cui
  // ha chiamato il richiamo, e chiudere Myynd al suo posto è un guasto. La
  // barra si toglie e basta; per uscire c'è la finestra grande, e il tray
  w.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return
    const primario = MAC ? input.meta : input.control
    if (primario && input.key.toLowerCase() === 'q') { e.preventDefault(); nascondi() }
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

/**
 * Sullo schermo del cursore, con il fuoco. Falso se il server non c'è ancora.
 *
 * Se la pagina non è ancora arrivata si aspetta lei: compare da sola appena
 * c'è. Il riquadro e lo schermo finiscono nel registro, perché «non
 * funziona» detto da un Mac con due schermi non si può capire altrimenti.
 */
export function mostra(): boolean {
  if (!url) return false
  const w = attuale() ?? crea()
  if (!caricata) {
    daMostrare = true
    scriviRegistro('guscio · il richiamo aspetta la pagina')
    return true
  }
  const schermo = schermoDelCursore()
  const riquadro = posizioneRichiamo(schermo.workArea, altezza)
  w.setBounds(riquadro)
  mostrataAlle = Date.now()
  attivaAllApertura = appAttiva
  w.show()
  w.focus()
  // la pagina rimette il fuoco nella casella e toglie la risposta di prima
  w.webContents.send('myynd:richiamo-mostrato')
  scriviRegistro(`guscio · il richiamo si apre su ${doveSiApre(schermo, riquadro)}`)
  return true
}

/**
 * Via, e il fuoco torna a chi ce l'aveva.
 *
 * Con il pannello basta nasconderlo: se la persona era in un'altra app,
 * Myynd non è mai diventata attiva e la tastiera torna lì da sola. Se
 * invece era in Myynd, macOS al pannello che sparisce non ridà il fuoco
 * alla finestra grande — lascia l'app senza finestra chiave, e la tastiera
 * finisce in un'altra app. Con la finestra grande in vista la si riporta
 * su lei; se non è in vista — chiusa con la X, che su Mac la nasconde
 * soltanto — resterebbe un'app attiva senza finestre, con i suoi menù e
 * senza tastiera: si nasconde l'app intera, che è il gesto con cui macOS
 * ridà il fuoco a chi lo aveva. Tutto questo solo se è la pagina a chiedere
 * di chiudere, o la scorciatoia: dal `blur` la persona è già andata dove
 * voleva — sulla finestra grande, o in un'altra app — e non la si segue.
 */
export function nascondi() {
  via(true)
}

function via(ridaiIlFuoco: boolean) {
  daMostrare = false
  const w = attuale()
  if (!w || !w.isVisible()) return
  w.hide()
  if (!MAC || !attivaAllApertura || !ridaiIlFuoco) return
  if (finestra.inVista()) {
    scriviRegistro('guscio · il richiamo si chiude: il fuoco torna alla finestra grande')
    finestra.mostra()
  } else {
    scriviRegistro('guscio · il richiamo si chiude: Myynd era attiva senza finestre, si nasconde')
    app.hide()
  }
}

/** La scorciatoia: apre se è chiusa, chiude se è aperta. */
export function alterna(): boolean {
  if (visibile()) { nascondi(); return true }
  return mostra()
}

/** La pagina ha misurato il suo contenuto: la finestra si adatta. */
export function ridimensiona(contenuto: number) {
  const w = attuale()
  const nuova = posizioneRichiamo(w ? screen.getDisplayMatching(w.getBounds()).workArea : schermoDelCursore().workArea, contenuto)
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
  caricata = false
  daMostrare = false
}
