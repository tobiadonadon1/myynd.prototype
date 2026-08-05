import { useState, type CSSProperties, type ElementType, type ComponentPropsWithoutRef } from 'react'

type HovProps<T extends ElementType> = {
  as?: T
  style?: CSSProperties
  hover?: CSSProperties
} & Omit<ComponentPropsWithoutRef<T>, 'style' | 'as'>

/** Elemento con stile al passaggio del mouse — l'equivalente di `style-hover` nel design. */
export function Hov<T extends ElementType = 'div'>({ as, style, hover, ...rest }: HovProps<T>) {
  const [on, setOn] = useState(false)
  const El = (as || 'div') as ElementType
  return (
    <El
      {...rest}
      style={on && hover ? { ...style, ...hover } : style}
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

export const CARD_GLASS: CSSProperties = {
  background: 'rgba(255,253,249,.72)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,.8)', boxShadow: '0 22px 52px rgba(84,64,44,.12)'
}
