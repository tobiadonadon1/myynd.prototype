// Il segno nella barra dei menu: il mostriciattolo.
//
// È l'immagine della mascotte, a colori, e dice una cosa vera: a colori pieni
// mentre l'osservatore guarda, smorto quando è spento o in pausa (cioè per
// chiunque non l'abbia acceso), con un puntino d'inchiostro dall'anello color
// crema quando qualcosa aspetta la persona. Le immagini le fa
// `build/icone.cjs`, le decisioni stanno in `icona-barra.ts`.
//
// Un clic porta su la finestra, come sempre. Il tasto destro dà il menu: con
// l'osservatore acceso, per prima la pausa di un'ora (o la ripresa), poi le
// voci di sempre. La pausa cambia icona, nuvoletta e menu subito, e torna
// indietro se il server non la conferma (`osservatore.ts`).
//
// Su Windows un `.ico` con le misure che la barra usa alle varie scale.
//
// Su Mac si tiene anche il numero sul Dock: è lo stesso conto, visto da
// chi ha la barra piena e il Dock in vista.

import { app, Menu, nativeImage, Tray, type MenuItemConstructorOptions } from 'electron'
import { fileURLToPath } from 'node:url'
import { lingua, t } from './lingua.ts'
import { iconaPer, suggerimento, vociMenu, type Voce } from './icona-barra.ts'
import type { StatoLocale } from './osservatore.ts'

const ICONE = fileURLToPath(new URL('./icone/', import.meta.url))

export type Azioni = {
  apri(): void
  nuovaChat(): void
  preferenze(): void
  esci(): void
  /** Un'ora di pausa all'osservatore. */
  pausa(): void
  riprendi(): void
}

let tray: Tray | null = null
let inAttesa = 0
let azioni: Azioni | null = null

const MAC = process.platform === 'darwin'

/** Com'è l'osservatore, per l'icona, il menu e la nuvoletta. Spento finché non si sa. */
let osservatore: Pick<StatoLocale, 'disponibile' | 'acceso' | 'pausaFino' | 'guarda'> =
  { disponibile: false, acceso: false, pausaFino: null, guarda: false }

function icona() {
  const nome = iconaPer({ guarda: osservatore.guarda, attesa: inAttesa > 0, piattaforma: process.platform })
  const img = nativeImage.createFromPath(ICONE + nome)
  // un'immagine a colori: mai «template», che il sistema tingerebbe di nero
  if (MAC) img.setTemplateImage(false)
  return img
}

function menu() {
  const su = azioni
  if (!su) return Menu.buildFromTemplate([])
  const voce = (v: Voce): MenuItemConstructorOptions => {
    switch (v) {
      case 'pausa': return { label: t('Pausa per un’ora'), click: () => su.pausa() }
      case 'riprendi': return { label: t('Riprendi a guardare'), click: () => su.riprendi() }
      case 'apri': return { label: t('Apri Myynd'), click: () => su.apri() }
      case 'nuova-chat': return { label: t('Nuova chat'), click: () => su.nuovaChat() }
      case 'preferenze': return { label: t('Preferenze…'), click: () => su.preferenze() }
      case 'esci': return { label: t('Esci'), click: () => su.esci() }
      default: return { type: 'separator' }
    }
  }
  return Menu.buildFromTemplate(vociMenu({ ...osservatore, adesso: Date.now() }).map(voce))
}

const orario = (iso: string) => new Intl.DateTimeFormat(lingua() === 'en' ? 'en-GB' : 'it-IT', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

export function crea(su: Azioni) {
  azioni = su
  if (tray) return
  try {
    tray = new Tray(icona())
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
  tray.setImage(icona())
  tray.setToolTip(suggerimento({ inAttesa, pausaFino: osservatore.pausaFino, adesso: Date.now(), t, ora: orario }))
}

/** L'osservatore è cambiato (o la pausa premuta aspetta conferma): icona, nuvoletta e menu lo seguono. */
export function osserva(s: StatoLocale) {
  osservatore = { disponibile: s.disponibile, acceso: s.acceso, pausaFino: s.pausaFino, guarda: s.guarda }
  aggiorna()
}

/** Quante cose aspettano la persona: puntino sul segno, numero sul Dock. */
export function segnala(n: number) {
  inAttesa = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  aggiorna()
  if (MAC && app.dock) app.dock.setBadge(inAttesa ? String(inAttesa) : '')
}

/** C'è un segno nella barra? Senza, chiudere la finestra deve chiudere l'app. */
export function attiva(): boolean {
  return tray !== null && !tray.isDestroyed()
}

export function distruggi() {
  tray?.destroy()
  tray = null
}
