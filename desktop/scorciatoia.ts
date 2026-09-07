// La scorciatoia globale.
//
// ⌘⇧M porta su Myynd da qualunque app, e la nasconde se era già davanti.
// `globalShortcut.register` dice `true` anche per combinazioni che il
// sistema tiene per sé, quindi da qui non si può capire se funziona davvero:
// si valida la forma, si registra, e alla persona si lascia il modo di
// cambiarla nelle preferenze se non risponde.

import { globalShortcut } from 'electron'
import * as impostazioni from './impostazioni.ts'
import { t } from './lingua.ts'

export const PREDEFINITA = 'CommandOrControl+Shift+M'

const MODIFICATORI = new Set([
  'command', 'cmd', 'control', 'ctrl', 'commandorcontrol', 'cmdorctrl',
  'alt', 'option', 'altgr', 'shift', 'super', 'meta'
])

const TASTI_SPECIALI = new Set([
  'plus', 'space', 'tab', 'capslock', 'numlock', 'scrolllock', 'backspace',
  'delete', 'insert', 'return', 'enter', 'up', 'down', 'left', 'right', 'home',
  'end', 'pageup', 'pagedown', 'escape', 'esc', 'volumeup', 'volumedown',
  'volumemute', 'medianexttrack', 'mediaprevioustrack', 'mediastop',
  'mediaplaypause', 'printscreen', 'numdec', 'numadd', 'numsub', 'nummult', 'numdiv'
])

/** Un modificatore almeno e un tasto solo, nella grammatica di Electron. */
export function valida(acc: string): boolean {
  if (typeof acc !== 'string') return false
  const parti = acc.split('+').map(p => p.trim())
  if (parti.some(p => !p)) return false
  let modificatori = 0
  let tasti = 0
  for (const p of parti) {
    const l = p.toLowerCase()
    if (MODIFICATORI.has(l)) { modificatori++; continue }
    const tasto = /^[a-z0-9]$/.test(l) || /^f([1-9]|1[0-9]|2[0-4])$/.test(l) ||
      /^num[0-9]$/.test(l) || TASTI_SPECIALI.has(l) || /^[~!@#$%^&*()_\-=[\]{}\\|;:'",.<>/?]$/.test(p)
    if (!tasto) return false
    tasti++
  }
  return modificatori >= 1 && tasti === 1
}

let attuale = ''
let azione: (() => void) | null = null

export function corrente(): string {
  return attuale || impostazioni.leggi().scorciatoia || PREDEFINITA
}

/** All'avvio: quella salvata, o la predefinita. Un fallimento qui non ferma niente. */
export function attiva(alPremere: () => void) {
  azione = alPremere
  const voluta = impostazioni.leggi().scorciatoia || PREDEFINITA
  if (registra(voluta)) attuale = voluta
  else if (registra(PREDEFINITA)) attuale = PREDEFINITA
}

function registra(acc: string): boolean {
  try {
    return globalShortcut.register(acc, () => azione?.())
  } catch {
    return false
  }
}

/** Cambia, e se la nuova non si registra rimette la vecchia e lo dice. */
export function imposta(nuova: string): { ok: boolean; errore?: string } {
  if (!valida(nuova)) {
    return { ok: false, errore: t('La combinazione deve avere un modificatore e un tasto, per esempio CommandOrControl+Shift+M.') }
  }
  const vecchia = attuale
  if (vecchia) globalShortcut.unregister(vecchia)
  if (registra(nuova)) {
    attuale = nuova
    impostazioni.scrivi({ scorciatoia: nuova })
    return { ok: true }
  }
  if (vecchia) registra(vecchia)
  return { ok: false, errore: t('Questa combinazione non si può usare qui.') }
}

export function spegni() {
  globalShortcut.unregisterAll()
  attuale = ''
}
