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

/* ------------------------------------------------------------ il mostriciattolo */

/** Il riquadro del mostriciattolo sullo schermo, in punti. */
export const LATO_COMPAGNO = 64
/** Quanto sta lontano dai bordi quando nessuno l'ha spostato. */
export const MARGINE_COMPAGNO = 24

type Punto = { x: number; y: number }

const dentroTutto = (a: Area, p: Punto) =>
  p.x >= a.x && p.y >= a.y && p.x + LATO_COMPAGNO <= a.x + a.width && p.y + LATO_COMPAGNO <= a.y + a.height
const contiene = (a: Area, x: number, y: number) => x >= a.x && x < a.x + a.width && y >= a.y && y < a.y + a.height
/** Il punto spinto dentro l'area, se ci sta. */
const dentro = (a: Area, p: Punto): Punto => ({
  x: Math.round(Math.min(Math.max(p.x, a.x), a.x + a.width - LATO_COMPAGNO)),
  y: Math.round(Math.min(Math.max(p.y, a.y), a.y + a.height - LATO_COMPAGNO))
})
const areaDelCentro = (aree: Area[], p: Punto) =>
  aree.find(a => contiene(a, p.x + LATO_COMPAGNO / 2, p.y + LATO_COMPAGNO / 2))

/**
 * Dove sta il mostriciattolo. Senza un posto salvato: in basso a destra dello
 * schermo principale. Con un posto salvato: lì se il quadrato sta tutto dentro
 * uno schermo; spinto dentro lo schermo che ne contiene il centro, se sborda;
 * altrimenti (lo schermo non c'è più) di nuovo in basso a destra.
 */
export function posizioneCompagno(aree: Area[], voluta: { x?: number; y?: number } | undefined, principale: Area): Punto {
  const predefinita = dentro(principale, {
    x: principale.x + principale.width - LATO_COMPAGNO - MARGINE_COMPAGNO,
    y: principale.y + principale.height - LATO_COMPAGNO - MARGINE_COMPAGNO
  })
  if (!voluta || !Number.isFinite(voluta.x) || !Number.isFinite(voluta.y)) return predefinita
  const p = { x: Math.round(voluta.x!), y: Math.round(voluta.y!) }
  if (aree.some(a => dentroTutto(a, p))) return p
  const a = areaDelCentro(aree, p)
  return a ? dentro(a, p) : predefinita
}

/**
 * Mentre lo si trascina: segue il puntatore, ma resta su uno schermo. Se il
 * centro uscirebbe da tutti, sta fermo dov'era invece di saltare altrove.
 */
export function trascinaCompagno(aree: Area[], da: Punto, dx: number, dy: number): Punto {
  const p = { x: da.x + dx, y: da.y + dy }
  const a = areaDelCentro(aree, p)
  return a ? dentro(a, p) : { x: da.x, y: da.y }
}
