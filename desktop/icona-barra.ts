// Quello che la barra dei menu e il mostriciattolo dicono, senza Electron.
//
// L'immagine (il mostriciattolo acceso, spento, col puntino), le voci dei due
// menu e la nuvoletta sono decisioni, non disegno: stanno qui, pure, e si
// provano. `tray.ts` e `compagno.ts` le mettono sullo schermo.

import { inPausa } from './sessioni.ts'

/**
 * Il file dell'icona. Sul Mac un PNG con il suo `@2x` accanto (Electron lo
 * prende da sé), su Windows un `.ico` con le misure della barra.
 * `guarda` è vero solo mentre l'osservatore guarda davvero: acceso e non in
 * pausa. Quando è spento (cioè per chiunque non l'abbia acceso, e sempre
 * fuori dal Mac, dove l'osservatore non c'è) il mostriciattolo è smorto:
 * è vero che non sta guardando.
 */
export function iconaPer(s: { guarda: boolean; attesa: boolean; piattaforma: string }): string {
  const nome = `mascotte${s.guarda ? '' : 'Spenta'}${s.attesa ? 'Attesa' : ''}`
  return `${nome}.${s.piattaforma === 'win32' ? 'ico' : 'png'}`
}

export type Voce = 'pausa' | 'riprendi' | 'apri' | 'nuova-chat' | 'preferenze' | 'esci' | 'togli' | '-'

type Osservatore = { disponibile: boolean; acceso: boolean; pausaFino: string | null; adesso: number }

/** Pausa o riprendi, se c'è un osservatore acceso su questo Mac; niente altrimenti. */
function primaVoce(s: Osservatore): Voce[] {
  if (!s.disponibile || !s.acceso) return []
  return [inPausa(s.pausaFino, s.adesso) ? 'riprendi' : 'pausa']
}

/** Il menu del tasto destro sulla barra: con l'osservatore spento è quello di sempre. */
export function vociMenu(s: Osservatore): Voce[] {
  const prima = primaVoce(s)
  return [...prima, ...(prima.length ? ['-' as const] : []), 'apri', 'nuova-chat', 'preferenze', '-', 'esci']
}

/** Il menu del tasto destro sul mostriciattolo. */
export function vociCompagno(s: Osservatore): Voce[] {
  return [...primaVoce(s), 'apri', '-', 'togli']
}

/**
 * La nuvoletta: `Myynd`, poi la pausa se c'è, poi quante cose aspettano.
 * `Myynd · in pausa fino alle 15:10 · 3 in attesa`.
 */
export function suggerimento(s: { inAttesa: number; pausaFino: string | null; adesso: number; t: (k: string) => string; ora: (iso: string) => string }): string {
  const pezzi = ['Myynd']
  if (s.pausaFino && inPausa(s.pausaFino, s.adesso)) pezzi.push(`${s.t('in pausa fino alle')} ${s.ora(s.pausaFino)}`)
  if (s.inAttesa > 0) pezzi.push(`${s.inAttesa} ${s.t('in attesa')}`)
  return pezzi.join(' · ')
}
