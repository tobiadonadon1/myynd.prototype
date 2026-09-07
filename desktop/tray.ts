// Il segno nella barra dei menu.
//
// Un'immagine template — nera su trasparente, il sistema la tinge da sé
// chiara o scura — con una variante che ha un puntino quando qualcosa
// aspetta la persona. Niente pannello: il brief lo vieta. Un clic porta su
// la finestra, il tasto destro dà quattro voci e basta.
//
// Su Windows «template» non vuol dire niente, e un segno nero sparisce sulla
// barra scura: là va il marchio a colori, in un .ico con le misure che la
// barra usa alle varie scale (`build/icone.cjs` fa tutti e due).
//
// Su Mac si tiene anche il numero sul Dock: è lo stesso conto, visto da
// chi ha la barra piena e il Dock in vista.

import { app, Menu, nativeImage, Tray } from 'electron'
import { fileURLToPath } from 'node:url'
import { t } from './lingua.ts'

const ICONE = fileURLToPath(new URL('./icone/', import.meta.url))

export type Azioni = {
  apri(): void
  nuovaChat(): void
  preferenze(): void
  esci(): void
}

let tray: Tray | null = null
let inAttesa = 0
let azioni: Azioni | null = null

const MAC = process.platform === 'darwin'

function icona(attesa: boolean) {
  const nome = process.platform === 'win32'
    ? (attesa ? 'trayAttesa.ico' : 'tray.ico')
    : (attesa ? 'trayAttesaTemplate.png' : 'trayTemplate.png')
  const img = nativeImage.createFromPath(ICONE + nome)
  if (MAC) img.setTemplateImage(true)
  return img
}

function menu() {
  const su = azioni
  if (!su) return Menu.buildFromTemplate([])
  return Menu.buildFromTemplate([
    { label: t('Apri Myynd'), click: () => su.apri() },
    { label: t('Nuova chat'), click: () => su.nuovaChat() },
    { label: t('Preferenze…'), click: () => su.preferenze() },
    { type: 'separator' },
    { label: t('Esci'), click: () => su.esci() }
  ])
}

export function crea(su: Azioni) {
  azioni = su
  if (tray) return
  try {
    tray = new Tray(icona(false))
  } catch {
    // senza immagine niente barra: l'app funziona lo stesso dal Dock
    return
  }
  tray.on('click', () => su.apri())
  tray.on('right-click', () => tray?.popUpContextMenu(menu()))
  aggiorna()
}

/** Tooltip e immagine seguono il conto e la lingua: si rifà tutto insieme. */
export function aggiorna() {
  if (!tray) return
  tray.setImage(icona(inAttesa > 0))
  tray.setToolTip(inAttesa > 0 ? `Myynd · ${inAttesa} ${t('in attesa')}` : 'Myynd')
}

/** Quante cose aspettano la persona: puntino sul segno, numero sul Dock. */
export function segnala(n: number) {
  inAttesa = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  aggiorna()
  if (MAC && app.dock) app.dock.setBadge(inAttesa ? String(inAttesa) : '')
}

export function distruggi() {
  tray?.destroy()
  tray = null
}
