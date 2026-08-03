import { Menu, Tray, nativeImage } from 'electron'
import type { NativeImage } from 'electron'

/**
 * Il segno nel menu bar: un anello sottile, quieto. In attesa, lo stesso
 * segno con un piccolo punto pieno. Disegnato a runtime pixel per pixel
 * (nessun asset su disco) e marcato come template image: macOS lo adatta
 * da solo a tema chiaro/scuro.
 */
const SIZE = 22
const SCALE = 2
const PX = SIZE * SCALE

function buildTrayIcon(waiting: boolean): NativeImage {
  const buffer = Buffer.alloc(PX * PX * 4) // BGRA, tutto zero = trasparente
  const cx = PX / 2
  const cy = PX / 2
  const outerR = PX * 0.32
  const innerR = PX * 0.24

  const setAlpha = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= PX || y >= PX) return
    const idx = (y * PX + x) * 4
    buffer[idx + 3] = 255 // R=G=B=0 (nero), conta solo l'alpha
  }

  for (let y = 0; y < PX; y++) {
    for (let x = 0; x < PX; x++) {
      const dist = Math.hypot(x - cx, y - cy)
      if (dist <= outerR && dist >= innerR) setAlpha(x, y)
    }
  }

  if (waiting) {
    const dotR = PX * 0.12
    const dotCx = cx + outerR * 0.68
    const dotCy = cy + outerR * 0.68
    for (let y = 0; y < PX; y++) {
      for (let x = 0; x < PX; x++) {
        if (Math.hypot(x - dotCx, y - dotCy) <= dotR) setAlpha(x, y)
      }
    }
  }

  const image = nativeImage.createFromBitmap(buffer, { width: PX, height: PX, scaleFactor: SCALE })
  image.setTemplateImage(true)
  return image
}

let tray: Tray | null = null

export interface TrayCallbacks {
  onOpen: () => void
  onQuit: () => void
  shortcutLabel: () => string
}

export function createTray(callbacks: TrayCallbacks): Tray {
  const t = new Tray(buildTrayIcon(false))
  t.setToolTip('myynd')
  t.on('click', () => callbacks.onOpen())
  t.on('right-click', () => {
    t.popUpContextMenu(buildMenu(callbacks))
  })
  tray = t
  return t
}

function buildMenu(callbacks: TrayCallbacks): Menu {
  return Menu.buildFromTemplate([
    {
      label: `apri myynd (${callbacks.shortcutLabel()})`,
      click: () => callbacks.onOpen(),
    },
    { type: 'separator' },
    { label: 'esci', click: () => callbacks.onQuit() },
  ])
}

/** Guidato dal motore: quante cose stanno aspettando una persona. */
export function setWaiting(count: number): void {
  tray?.setImage(buildTrayIcon(count > 0))
}
