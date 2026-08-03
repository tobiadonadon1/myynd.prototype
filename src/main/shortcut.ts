import { globalShortcut } from 'electron'
import type { BrowserWindow } from 'electron'
import { summon } from './window'

/**
 * ⌥Space è la scelta voluta (Cmd+Space è Spotlight). Se un'altra app se
 * l'è già presa, si scende in ordine verso le alternative.
 */
const CANDIDATES = ['Alt+Space', 'Control+Alt+Space', 'Control+Alt+M'] as const

const LABELS: Record<(typeof CANDIDATES)[number], string> = {
  'Alt+Space': '⌥ spazio',
  'Control+Alt+Space': '⌃⌥ spazio',
  'Control+Alt+M': '⌃⌥ m',
}

let bound: (typeof CANDIDATES)[number] | null = null

/** Registra la scorciatoia globale, con fallback. Ritorna quella agganciata davvero. */
export function registerShortcut(getWindow: () => BrowserWindow | null): string | null {
  for (const accelerator of CANDIDATES) {
    const ok = globalShortcut.register(accelerator, () => toggle(getWindow()))
    if (ok) {
      bound = accelerator
      break
    }
  }
  if (!bound) {
    console.warn('nessuna scorciatoia disponibile: tutte le combinazioni sono già in uso')
  }
  return bound
}

export function getBoundShortcut(): string | null {
  return bound
}

/** Etichetta leggibile per il menu del tray, es. "⌥ spazio". */
export function shortcutLabel(): string {
  return bound ? LABELS[bound] : 'nessuna scorciatoia'
}

export function unregisterShortcut(): void {
  globalShortcut.unregisterAll()
}

function toggle(win: BrowserWindow | null): void {
  if (!win) return
  if (win.isVisible() && win.isFocused()) {
    win.hide()
  } else {
    summon(win)
  }
}
