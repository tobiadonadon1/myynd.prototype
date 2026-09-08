// Dove sta il richiamo sullo schermo.
//
// Solo aritmetica, senza Electron: così si prova senza aprire una finestra.
// La barra è larga 680 punti, centrata, a un quinto dell'altezza dello
// schermo su cui sta il cursore — è dove l'occhio va da solo quando si preme
// una scorciatoia, e non copre quello che si stava leggendo in mezzo. L'altezza
// la dice la pagina, e qui si tiene fra un minimo e un massimo: una risposta
// lunga scorre dentro la barra, non la fa crescere fino in fondo allo schermo.

export type Area = { x: number; y: number; width: number; height: number }

export const LARGHEZZA = 680
export const ALTEZZA_MINIMA = 60
export const ALTEZZA_MASSIMA = 560
/** Quanto sta giù, in frazione dell'area utile. */
const QUOTA = 0.2
/** Il margine che la barra tiene dai bordi di uno schermo stretto. */
const MARGINE = 12

/** Il riquadro della barra, alta `altezza` punti, nell'area utile `area`. */
export function posizioneRichiamo(area: Area, altezza: number): Area {
  const width = Math.max(MARGINE * 2, Math.min(LARGHEZZA, area.width - MARGINE * 2))
  const voluta = Number.isFinite(altezza) ? altezza : ALTEZZA_MINIMA
  const height = Math.max(ALTEZZA_MINIMA, Math.min(Math.ceil(voluta), ALTEZZA_MASSIMA, area.height - MARGINE * 2))
  const x = Math.round(area.x + (area.width - width) / 2)
  // a un quinto dall'alto, ma mai oltre il fondo: su uno schermo basso sale
  const y = Math.min(Math.round(area.y + area.height * QUOTA), area.y + area.height - height - MARGINE)
  return { x, y: Math.max(area.y, y), width, height }
}

/** Uno schermo come lo dice Electron: basta il numero, e il nome se c'è. */
export type Schermo = { id: number; label?: string }

/**
 * La frase del registro quando la barra compare: quale schermo e quale
 * riquadro. «Non funziona» da un Mac con due schermi si legge solo così.
 */
export function doveSiApre(schermo: Schermo, r: Area): string {
  const nome = schermo.label ? `«${schermo.label}» ` : ''
  return `${nome}#${schermo.id} a ${r.x},${r.y} ${r.width}×${r.height}`
}
