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
 * Il riquadro del mostriciattolo sullo schermo, in punti, nella taglia media.
 * È in 3D: il quadrato in alto (`LATO_COMPAGNO`) tiene lui, con le antenne, i
 * piedi e il salto; la striscia sotto (`PIEDE_COMPAGNO`) tiene la pastiglia
 * con i due bottoni, che compare quando il cursore gli passa sopra. Il resto
 * è trasparente, e il mouse ci passa attraverso. Le altre taglie sono la
 * stessa finestra in scala (`misureCompagno`).
 */
export const LATO_COMPAGNO = 144
export const PIEDE_COMPAGNO = 44
export const ALTO_COMPAGNO = LATO_COMPAGNO + PIEDE_COMPAGNO
/** Quanto sta lontano dai bordi quando nessuno l'ha spostato. */
export const MARGINE_COMPAGNO = 24

/** Le tre taglie che si scelgono nelle sue impostazioni: la pagina resta uguale, la si ingrandisce. */
export type Taglia = 'piccolo' | 'medio' | 'grande'
export const SCALE_COMPAGNO: Record<Taglia, number> = { piccolo: 0.8, medio: 1, grande: 1.3 }
export type Misure = { lato: number; alto: number; scala: number }

/** Le misure della finestra per una taglia; una taglia che non esiste vale media. */
export function misureCompagno(taglia?: unknown): Misure {
  const scala = typeof taglia === 'string' && taglia in SCALE_COMPAGNO ? SCALE_COMPAGNO[taglia as Taglia] : 1
  return { lato: Math.round(LATO_COMPAGNO * scala), alto: Math.round(ALTO_COMPAGNO * scala), scala }
}

const MEDIE = misureCompagno('medio')

type Punto = { x: number; y: number }

const dentroTutto = (a: Area, p: Punto, m: Misure) =>
  p.x >= a.x && p.y >= a.y && p.x + m.lato <= a.x + a.width && p.y + m.alto <= a.y + a.height
const contiene = (a: Area, x: number, y: number) => x >= a.x && x < a.x + a.width && y >= a.y && y < a.y + a.height
/** Il punto spinto dentro l'area, se ci sta. */
const dentro = (a: Area, p: Punto, m: Misure): Punto => ({
  x: Math.round(Math.min(Math.max(p.x, a.x), a.x + a.width - m.lato)),
  y: Math.round(Math.min(Math.max(p.y, a.y), a.y + a.height - m.alto))
})
const areaDelCentro = (aree: Area[], p: Punto, m: Misure) =>
  aree.find(a => contiene(a, p.x + m.lato / 2, p.y + m.alto / 2))

/**
 * Il quadrato dove sta lui, dentro la finestra `finestra`: senza la striscia
 * della pastiglia. È da lì che si misurano lo sguardo e il posto della
 * casella sotto di lui.
 */
export function corpoDelCompagno(finestra: Area): Area {
  return { x: finestra.x, y: finestra.y, width: finestra.width, height: Math.min(finestra.height, finestra.width) }
}

/**
 * Dove sta il mostriciattolo. Senza un posto salvato: in basso a destra dello
 * schermo principale. Con un posto salvato: lì se la finestra sta tutta
 * dentro uno schermo; spinta dentro lo schermo che ne contiene il centro, se
 * sborda; altrimenti (lo schermo non c'è più) di nuovo in basso a destra.
 */
export function posizioneCompagno(aree: Area[], voluta: { x?: number; y?: number } | undefined, principale: Area, m: Misure = MEDIE): Punto {
  const predefinita = dentro(principale, {
    x: principale.x + principale.width - m.lato - MARGINE_COMPAGNO,
    y: principale.y + principale.height - m.alto - MARGINE_COMPAGNO
  }, m)
  if (!voluta || !Number.isFinite(voluta.x) || !Number.isFinite(voluta.y)) return predefinita
  const p = { x: Math.round(voluta.x!), y: Math.round(voluta.y!) }
  if (aree.some(a => dentroTutto(a, p, m))) return p
  const a = areaDelCentro(aree, p, m)
  return a ? dentro(a, p, m) : predefinita
}

/**
 * Mentre lo si trascina: dov'era quando lo si è preso (`origine`) più tutto
 * lo spostamento del puntatore da allora, spinto dentro lo schermo che ne
 * contiene il centro. Se il centro uscirebbe da tutti, sta dov'è (`adesso`)
 * invece di saltare altrove. Ogni passo si conta dalla presa e non dal passo
 * prima: spinto contro un bordo e riportato indietro, torna sotto il
 * puntatore invece di restarne scostato.
 */
export function trascinaCompagno(aree: Area[], origine: Punto, dx: number, dy: number, adesso: Punto = origine, m: Misure = MEDIE): Punto {
  const p = { x: origine.x + dx, y: origine.y + dy }
  const a = areaDelCentro(aree, p, m)
  return a ? dentro(a, p, m) : { x: adesso.x, y: adesso.y }
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

/* ------------------------------------------------------------ la casella sotto di lui */

/** La casella per scrivergli: larga di serie, e fin dove la si può tirare. */
export const LARGHEZZA_SCATOLA = 320
export const LARGHEZZA_SCATOLA_MIN = 240
export const LARGHEZZA_SCATOLA_MAX = 640
/** Fin dove cresce con la risposta prima di scorrere dentro; anche questo si tira col bordo. */
export const ALTEZZA_SCATOLA = 340
export const ALTEZZA_SCATOLA_MIN = 140
export const ALTEZZA_SCATOLA_MAX = 760
/** Sotto di lui ci vuole almeno questo, o la casella va sopra la testa. */
const SPAZIO_GIU = 180

export type Scatola = Area & { verso: 'giu' | 'su' }

const stretto = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max))

/**
 * Dove sta la casella del mostriciattolo `compagno` (il suo quadrato, senza
 * la striscia della pastiglia), nell'area utile del suo schermo.
 *
 * Centrata sotto di lui, attaccata ai piedi, e la risposta la fa crescere in
 * giù. Se sotto non c'è posto (lui sta in basso, dove sta di serie) va sopra
 * la testa e cresce in su: il fondo resta fermo sopra le antenne. Larga
 * quanto la persona l'ha tirata (`voluta.larghezza`), alta quanto il
 * contenuto fino al tetto che ha tirato lei (`voluta.altezza`), e in ogni
 * caso dentro lo schermo.
 */
export function posizioneScatola(area: Area, compagno: Area, contenuto: number, voluta: { larghezza?: number; altezza?: number } = {}): Scatola {
  const width = Math.round(stretto(voluta.larghezza ?? LARGHEZZA_SCATOLA, LARGHEZZA_SCATOLA_MIN, Math.min(LARGHEZZA_SCATOLA_MAX, area.width - MARGINE * 2)))
  const tetto = stretto(voluta.altezza ?? ALTEZZA_SCATOLA, ALTEZZA_SCATOLA_MIN, Math.min(ALTEZZA_SCATOLA_MAX, area.height - MARGINE * 2))
  const voluto = Number.isFinite(contenuto) ? Math.ceil(contenuto) : ALTEZZA_MINIMA
  const giu = compagno.y + compagno.height - Math.round(compagno.height * 0.02)
  const su = compagno.y + Math.round(compagno.height * 0.05)
  const spazioGiu = area.y + area.height - MARGINE - giu
  const spazioSu = su - (area.y + MARGINE)
  const verso = spazioGiu >= Math.min(tetto, SPAZIO_GIU) || spazioGiu >= spazioSu ? 'giu' : 'su'
  const posto = Math.max(ALTEZZA_MINIMA, verso === 'giu' ? spazioGiu : spazioSu)
  const height = Math.round(stretto(voluto, ALTEZZA_MINIMA, Math.min(tetto, posto)))
  const x = Math.round(stretto(compagno.x + compagno.width / 2 - width / 2, area.x + MARGINE, area.x + area.width - MARGINE - width))
  const y = Math.round(stretto(verso === 'giu' ? giu : su - height, area.y + MARGINE, area.y + area.height - MARGINE - height))
  return { x, y, width, height, verso }
}
