// Un colore per progetto.
//
// «Assegnerei un colore a ogni progetto, e lo cambierei nelle impostazioni.»
// Le carte dei progetti sulla prima pagina erano due carte uguali, e il nome
// scritto piccolo non bastava a dire a colpo d'occhio quale fosse quale.
// Il colore lo sceglie lui in Memoria, sulla riga del progetto; finché non
// lo sceglie, ogni progetto ne ha uno suo lo stesso: si assegnano in ordine
// di nascita, saltando quelli già scelti a mano, così due progetti che si
// vedono insieme non hanno mai lo stesso colore — e non cambia da un giorno
// all'altro, perché la data di nascita non cambia.
//
// Otto tinte spente, che stanno sull'avorio senza urlare: il rame dell'app è
// la prima, il verde degli stati la seconda, e le altre sono della stessa
// famiglia. Niente primari.

export const TAVOLOZZA = ['#C4623B', '#5C7660', '#4F6D8C', '#7A5A86', '#B98A2E', '#3E8F86', '#A85A6E', '#6B6F66'] as const

export const COLORE_VALIDO = /^#[0-9a-f]{6}$/i

type Tinta = { id: string; colore?: string | null; dal?: string }

const scelto = (p: Tinta | null | undefined) => (p?.colore && COLORE_VALIDO.test(p.colore) ? p.colore : null)

/**
 * Il colore di un progetto: quello scelto, o uno assegnato fra i suoi.
 *
 * `tutti` è la lista dei progetti che si vedono insieme: serve a non dare a
 * due progetti la stessa tinta. Senza la lista, una tinta stabile dall'id.
 */
export function coloreProgetto(p: Tinta | null | undefined, tutti: Tinta[] = []): string {
  if (!p) return TAVOLOZZA[0]
  const suo = scelto(p)
  if (suo) return suo
  const presi = new Set(tutti.map(scelto).filter(Boolean))
  const libere = TAVOLOZZA.filter(c => !presi.has(c))
  const tinte = libere.length ? libere : [...TAVOLOZZA]
  // in ordine di nascita, e a parità di data per id: sempre lo stesso ordine
  const senzaScelta = tutti.filter(x => !scelto(x)).sort((a, b) => (a.dal ?? '').localeCompare(b.dal ?? '') || a.id.localeCompare(b.id))
  const posto = senzaScelta.findIndex(x => x.id === p.id)
  if (posto >= 0) return tinte[posto % tinte.length]
  let h = 0
  for (const ch of p.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return tinte[h % tinte.length]
}

/** Il colore con una trasparenza, per fondi e bordi: `#RRGGBB` + `AA`. */
export const velato = (colore: string, alfa: number) =>
  colore + Math.round(alfa * 255).toString(16).padStart(2, '0')
