// Il marchio: il cervello-albero, nei nostri colori.
//
// Vettoriale, quindi nitido a ogni misura. Dove c'è spazio entra con una
// piccola crescita e poi oscilla di un grado; nelle icone piccole sta fermo
// e in tinta unita.

import { useId } from 'react'
import { PREDEFINITA, type Forma } from './marchio-forma'

export function Marchio({ dim = 40, animato = true, colore, forma = PREDEFINITA }: {
  dim?: number
  animato?: boolean
  /** Tinta unita al posto del gradiente. */
  colore?: string
  /** Quale sagoma: per il confronto fra le due. */
  forma?: Forma
}) {
  const uid = useId().replace(/:/g, '')
  const { tracciato: TRACCIATO, altezza: ALTEZZA } = forma
  const alt = (dim * ALTEZZA) / 100

  return (
    <svg width={dim} height={alt} viewBox={`0 0 100 ${ALTEZZA}`} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={`${uid}g`} x1="0" y1="1" x2="0.15" y2="0">
          <stop offset="0" stopColor="#A34E2D" />
          <stop offset="0.42" stopColor="#C4623B" />
          <stop offset="0.78" stopColor="#D8A46E" />
          <stop offset="1" stopColor="#8FA593" />
        </linearGradient>
      </defs>

      <g style={animato ? {
        animation: 'marchioOnda 8s ease-in-out infinite',
        transformOrigin: `50px ${ALTEZZA}px`
      } : undefined}>
        <g style={animato ? {
          animation: 'marchioCresci .8s cubic-bezier(.2,.8,.3,1)',
          transformOrigin: `50px ${ALTEZZA}px`
        } : undefined}>
          <path d={TRACCIATO} fill={colore ?? `url(#${uid}g)`} />
        </g>
      </g>
    </svg>
  )
}

/** Marchio e parola, come nell'accesso e nella colonna. */
export function Logo({ dim = 34, animato = true, colore, testo = 22, tinta = 'currentColor', forma }: {
  dim?: number
  animato?: boolean
  colore?: string
  testo?: number
  tinta?: string
  forma?: Forma
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: dim * 0.26 }}>
      <Marchio dim={dim} animato={animato} colore={colore} forma={forma} />
      <span style={{ fontSize: testo, fontWeight: 300, letterSpacing: '.02em', lineHeight: 1, color: tinta }}>
        myynd
      </span>
    </div>
  )
}
