import { useEffect, useState, type CSSProperties, type ElementType, type ComponentPropsWithoutRef } from 'react'

/**
 * Quanto è larga la finestra.
 *
 * Gli stili qui dentro sono in linea, e una media query non li vede: l'unico
 * modo di far reagire questa app alla larghezza è misurarla. Stava già scritta
 * dentro `Oggi.tsx` per le sue tre colonne; adesso serve anche fuori, perché
 * l'impaginato intero deve rimpicciolirsi invece di farsi tagliare.
 */
export function useLarghezza(): number {
  const [l, setL] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth))
  useEffect(() => {
    const misura = () => setL(window.innerWidth)
    window.addEventListener('resize', misura)
    return () => window.removeEventListener('resize', misura)
  }, [])
  return l
}

/**
 * Le tre taglie dell'impaginato.
 *
 * `rail` è quella che conta: sotto gli ottocentoventi pixel la colonna di
 * sinistra perde le parole e resta una fila di icone. Prima non c'era nessuna
 * taglia — l'impaginato aveva `minWidth: 1180` e sotto quella soglia non si
 * ridisegnava affatto: sbordava, e quello che restava fuori era semplicemente
 * tagliato via. Su un portatile con la finestra a metà schermo mancava un pezzo
 * di applicazione, e non c'era modo di arrivarci.
 */
export type Taglia = { rail: boolean; stretta: boolean; colonna: number }

export function taglia(l: number): Taglia {
  const rail = l < 820
  return {
    rail,
    stretta: l < 1100,
    // 60 basta a un'icona con il suo respiro; 234 è la misura di sempre
    colonna: rail ? 60 : l < 1100 ? 198 : 234
  }
}

type HovProps<T extends ElementType> = {
  as?: T
  style?: CSSProperties
  hover?: CSSProperties
} & Omit<ComponentPropsWithoutRef<T>, 'style' | 'as'>

/**
 * Il bordo scritto per esteso.
 *
 * Quasi ogni bottone qui dentro ha `border: '1px solid …'` e al passaggio del
 * mouse cambia solo `borderColor`. React se ne lamenta a ogni ridisegno —
 * «don't mix shorthand and non-shorthand properties» — e non è pedanteria: nel
 * momento in cui toglie la proprietà lunga mentre quella corta è ancora lì, il
 * bordo può tornare al colore di prima per un fotogramma. Con la scorciatoia
 * aperta nelle sue tre parti, i due stati dichiarano le stesse proprietà e il
 * problema non si pone.
 */
function apriBordo(s: CSSProperties): CSSProperties {
  const b = s.border
  if (typeof b !== 'string' || !b || b === 'none') return s
  const [larghezza, tipo, ...colore] = b.split(' ')
  if (!tipo || !colore.length) return s
  const { border: _via, ...resto } = s
  return { ...resto, borderWidth: larghezza, borderStyle: tipo, borderColor: colore.join(' ') }
}

/** Elemento con stile al passaggio del mouse — l'equivalente di `style-hover` nel design. */
export function Hov<T extends ElementType = 'div'>({ as, style, hover, ...rest }: HovProps<T>) {
  const [on, setOn] = useState(false)
  const El = (as || 'div') as ElementType

  // si apre solo quando serve davvero: se nessuno dei due tocca il bordo per
  // pezzi, la scorciatoia resta com'era scritta
  const mescola = () => {
    const h = hover as CSSProperties
    const perPezzi = h && ('borderColor' in h || 'borderStyle' in h || 'borderWidth' in h)
    return perPezzi ? { ...apriBordo(style ?? {}), ...apriBordo(h) } : { ...style, ...h }
  }

  return (
    <El
      {...rest}
      style={on && hover ? mescola() : style}
      onMouseEnter={() => setOn(true)}
      onMouseLeave={() => setOn(false)}
    />
  )
}

const NAV_BASE: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 11, padding: '8px 10px',
  borderRadius: 14, fontSize: '14.5px', cursor: 'pointer', transition: 'background .18s'
}
export const NAV_ON: CSSProperties = {
  ...NAV_BASE, background: 'linear-gradient(120deg,#C4623B,#7E9C82)',
  border: '1px solid rgba(255,255,255,.5)', boxShadow: '0 10px 22px -12px rgba(120,60,40,.65)', color: '#FFF7F0'
}
export const NAV_OFF: CSSProperties = { ...NAV_BASE, border: '1px solid transparent', color: 'rgba(34,39,31,.72)' }

const MENU_BASE: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 11, padding: '10px 11px',
  borderRadius: 12, fontSize: '13.5px', cursor: 'pointer'
}
export const MENU_ON: CSSProperties = { ...MENU_BASE, background: 'linear-gradient(110deg,#C4623B,#7E9C82)', color: '#FFF7F0' }
export const MENU_OFF: CSSProperties = { ...MENU_BASE, color: '#22271F' }

export function track(on: boolean): CSSProperties {
  return {
    width: 40, height: 23, flex: 'none', borderRadius: 99, padding: 2, boxSizing: 'border-box', cursor: 'pointer',
    background: on ? 'linear-gradient(120deg,#C4623B,#7E9C82)' : 'rgba(34,39,31,.2)',
    display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start', transition: 'background .2s'
  }
}

export function knob(): CSSProperties {
  return { width: 19, height: 19, borderRadius: '50%', background: '#FFFDF9', boxShadow: '0 2px 5px rgba(30,20,14,.3)' }
}

export function dot(c: string): CSSProperties {
  return { width: 9, height: 9, flex: 'none', borderRadius: '50%', background: c, boxShadow: '0 0 0 4px ' + c + '22' }
}

export const LABEL: CSSProperties = {
  fontSize: '11.5px', fontWeight: 500, letterSpacing: '.1em',
  textTransform: 'uppercase', color: 'rgba(34,39,31,.55)'
}

/**
 * La pastiglia dell'accento: «questa cosa aspetta una persona».
 *
 * Ce n'erano tre copie con tre alfe diverse (.16/.32, .14/.32, .12/.28), due
 * delle quali sulla stessa schermata. Sono lo stesso oggetto e devono avere lo
 * stesso peso, altrimenti l'unico colore che il prodotto si concede smette di
 * voler dire una cosa sola.
 */
export const PILL: CSSProperties = {
  padding: '4px 11px', borderRadius: 99, fontSize: 12, fontWeight: 500,
  color: '#8E3F1F', background: 'rgba(196,98,59,.14)',
  border: '1px solid rgba(196,98,59,.32)'
}

export const CARD_GLASS: CSSProperties = {
  background: 'rgba(255,253,249,.72)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,.8)', boxShadow: '0 22px 52px rgba(84,64,44,.12)'
}
