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

/**
 * Le combinazioni con il solo ⌘ (o Ctrl) e una lettera che sono già di
 * qualcuno: dell'app stessa, o di ogni app. Una scorciatoia globale vince
 * sui menù ovunque, e ⌘Q che apre Myynd invece di chiudere quello che si
 * sta usando non è una preferenza, è un guasto.
 */
const RISERVATE = new Set(['q', 'w', 'n', 'c', 'v', 'x', 'a', 'z', 'h', 'm', 'r', 'f', 'p', 's', 't', ',', 'tab', 'space'])

/**
 * Un modificatore vero almeno — ⇧ da solo prenderebbe una maiuscola a tutte
 * le app — e un tasto solo, nella grammatica di Electron.
 */
export function valida(acc: string): boolean {
  if (typeof acc !== 'string') return false
  const parti = acc.split('+').map(p => p.trim())
  if (parti.some(p => !p)) return false
  let modificatori = 0
  let tasti = 0
  for (const p of parti) {
    const l = p.toLowerCase()
    if (MODIFICATORI.has(l)) { if (l !== 'shift') modificatori++; continue }
    const tasto = /^[a-z0-9]$/.test(l) || /^f([1-9]|1[0-9]|2[0-4])$/.test(l) ||
      /^num[0-9]$/.test(l) || TASTI_SPECIALI.has(l) || /^[`~!@#$%^&*()_\-=[\]{}\\|;:'",.<>/?]$/.test(p)
    if (!tasto) return false
    tasti++
  }
  return modificatori >= 1 && tasti === 1
}

/** ⌘ o Ctrl da soli con un tasto che è già di tutti. */
export function riservata(acc: string): boolean {
  const parti = acc.split('+').map(p => p.trim().toLowerCase())
  const soloPrimario = parti.filter(p => MODIFICATORI.has(p)).every(p => ['command', 'cmd', 'control', 'ctrl', 'commandorcontrol', 'cmdorctrl', 'shift'].includes(p))
    && !parti.includes('shift')
  const tasto = parti.find(p => !MODIFICATORI.has(p)) ?? ''
  return soloPrimario && RISERVATE.has(tasto)
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
  if (riservata(nuova)) return { ok: false, errore: t('Questa combinazione non si può usare qui.') }
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
