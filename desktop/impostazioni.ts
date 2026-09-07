// Le poche cose che il guscio si ricorda.
//
// Dove stava la finestra, quale scorciatoia si usa, in che lingua parlare
// prima che il renderer lo dica. Un JSON in `userData`, riscritto per intero
// a ogni modifica: sono tre chiavi, non vale una base dati. Un file rotto o
// assente vale come vuoto, mai come errore — una preferenza persa non deve
// impedire di aprire l'app.

import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Lingua } from './lingua.ts'

export type Riquadro = { x: number; y: number; width: number; height: number }

export type Impostazioni = {
  finestra?: Riquadro
  scorciatoia?: string
  lingua?: Lingua
  /**
   * La porta su cui il server ha ascoltato l'ultima volta.
   *
   * Non è un vezzo: il renderer tiene la sessione, la lingua e ogni altra
   * preferenza in `localStorage`, che il browser lega all'origine — cioè a
   * `127.0.0.1:<porta>`. Una porta diversa a ogni avvio era una persona che
   * si trovava davanti l'accesso ogni volta che apriva l'app, e anche dopo
   * ogni riavvio del server. Si chiede la stessa; se è presa, se ne prende
   * una nuova e da lì in poi è quella.
   */
  porta?: number
}

let percorso = ''
let cache: Impostazioni = {}

export function apri(cartellaDati: string) {
  percorso = join(cartellaDati, 'impostazioni.json')
  try {
    const grezzo = JSON.parse(readFileSync(percorso, 'utf8'))
    cache = grezzo && typeof grezzo === 'object' ? grezzo : {}
  } catch {
    cache = {}
  }
}

export function leggi(): Impostazioni {
  return cache
}

export function scrivi(patch: Partial<Impostazioni>) {
  cache = { ...cache, ...patch }
  if (!percorso) return
  try {
    mkdirSync(dirname(percorso), { recursive: true })
    // prima il file accanto, poi lo scambio: un crash a metà scrittura lascia
    // il vecchio intero invece di un JSON troncato
    writeFileSync(percorso + '.nuovo', JSON.stringify(cache, null, 2))
    renameSync(percorso + '.nuovo', percorso)
  } catch {
    // niente da fare: si riproverà alla prossima modifica
  }
}
