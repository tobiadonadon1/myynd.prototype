// Il marchio: una M Helvetica vettoriale.
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
        <linearGradient id={`${uid}g`} x1="0" y1="1" x2="1" y2="0">
          {/* rame cupo → rame → ambra → avorio: il verde non è più nel marchio */}
          <stop offset="0" stopColor="#8E3F1F" />
          <stop offset="0.38" stopColor="#C4623B" />
          <stop offset="0.74" stopColor="#E4A074" />
          <stop offset="1" stopColor="#F3D4B5" />
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
