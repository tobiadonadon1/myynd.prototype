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

/**
 * Il riquadro del mostriciattolo sullo schermo, in punti. È in 3D, e il
 * quadrato tiene anche le antenne, i piedi e il salto: il corpo ne occupa
 * più o meno la metà in mezzo, il resto è trasparente.
 */
export const LATO_COMPAGNO = 144
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
 * Mentre lo si trascina: dov'era quando lo si è preso (`origine`) più tutto
 * lo spostamento del puntatore da allora, spinto dentro lo schermo che ne
 * contiene il centro. Se il centro uscirebbe da tutti, sta dov'è (`adesso`)
 * invece di saltare altrove. Ogni passo si conta dalla presa e non dal passo
 * prima: spinto contro un bordo e riportato indietro, torna sotto il
 * puntatore invece di restarne scostato.
 */
export function trascinaCompagno(aree: Area[], origine: Punto, dx: number, dy: number, adesso: Punto = origine): Punto {
  const p = { x: origine.x + dx, y: origine.y + dy }
  const a = areaDelCentro(aree, p)
  return a ? dentro(a, p) : { x: adesso.x, y: adesso.y }
}

/* ------------------------------------------------------------ lo sguardo */

/** A questa distanza in punti lo sguardo è a metà strada. */
const DISTANZA_SGUARDO = 260

/**
 * Dove guarda il mostriciattolo: il cursore rispetto ai suoi occhi, in due
 * numeri fra -1 e 1 (x a destra, y in giù). Vicino conta molto, lontano
 * sempre meno: il cursore all'altro capo dello schermo non gli torce la
 * testa più di quello a mezzo schermo. Arrotondato al centesimo, così un
 * cursore fermo non manda niente di nuovo.
 */
export function sguardoVerso(compagno: Area, cursore: Punto): Punto {
  const cx = compagno.x + compagno.width / 2
  // gli occhi stanno in alto nel quadrato, non nel mezzo
  const cy = compagno.y + compagno.height * 0.38
  const dx = cursore.x - cx
  const dy = cursore.y - cy
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return { x: 0, y: 0 }
  const morbido = (d: number) => Math.round((d / (Math.abs(d) + DISTANZA_SGUARDO)) * 100) / 100 || 0
  return { x: morbido(dx), y: morbido(dy) }
}

/* ------------------------------------------------------------ il fumetto */

/** La larghezza del fumetto: il richiamo aperto accanto al mostriciattolo. */
export const LARGHEZZA_FUMETTO = 360
/** Più alto di così la risposta scorre dentro: accanto a lui non deve coprire mezzo schermo. */
export const ALTEZZA_MASSIMA_FUMETTO = 440
/**
 * Quanto il fumetto entra nel quadrato del mostriciattolo, in frazione del
 * lato: il quadrato è per lo più trasparente, e un fumetto staccato di mezzo
 * quadrato dal corpo non sembra suo.
 */
const RIENTRO = 0.2

export type Fumetto = Area & { lato: 'sinistra' | 'destra'; ancora: 'sotto' | 'sopra' }

/**
 * Dove si apre il fumetto accanto al mostriciattolo `compagno`, nell'area
 * utile del suo schermo. Di fianco: a sinistra se ci sta (lui di solito è in
 * basso a destra), altrimenti a destra se ci sta, altrimenti dalla parte più
 * larga e spinto dentro. In altezza: se lui sta nella metà bassa dello
 * schermo il fondo del fumetto resta all'altezza della sua bocca e la
 * risposta cresce verso l'alto; nella metà alta il contrario. Mai fuori
 * dall'area.
 */
export function posizioneFumetto(area: Area, compagno: Area, altezza: number, larghezza = LARGHEZZA_FUMETTO): Fumetto {
  const width = Math.max(MARGINE * 2, Math.min(larghezza, area.width - MARGINE * 2))
  const voluta = Number.isFinite(altezza) ? altezza : ALTEZZA_MINIMA
  const height = Math.max(ALTEZZA_MINIMA, Math.min(Math.ceil(voluta), ALTEZZA_MASSIMA_FUMETTO, area.height - MARGINE * 2))
  const rientro = Math.round(compagno.width * RIENTRO)
  const sinistra = compagno.x + rientro - width
  const destra = compagno.x + compagno.width - rientro
  const staSinistra = sinistra >= area.x + MARGINE
  const staDestra = destra + width <= area.x + area.width - MARGINE
  const piuLargaASinistra = compagno.x - area.x >= area.x + area.width - (compagno.x + compagno.width)
  const lato = staSinistra || (!staDestra && piuLargaASinistra) ? 'sinistra' : 'destra'
  const xMin = area.x + MARGINE
  const xMax = area.x + area.width - MARGINE - width
  const x = Math.round(Math.min(Math.max(lato === 'sinistra' ? sinistra : destra, xMin), xMax))
  const ancora = compagno.y + compagno.height / 2 >= area.y + area.height / 2 ? 'sotto' : 'sopra'
  const voluto = ancora === 'sotto' ? compagno.y + compagno.height * 0.62 - height : compagno.y + compagno.height * 0.22
  const yMin = area.y + MARGINE
  const yMax = area.y + area.height - MARGINE - height
  const y = Math.round(Math.min(Math.max(voluto, yMin), yMax))
  return { x, y, width, height, lato, ancora }
}
