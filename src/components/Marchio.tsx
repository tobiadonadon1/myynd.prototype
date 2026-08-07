// Il marchio: il corallo-albero del riferimento, nei nostri colori.
//
// È un tracciato solo, quindi resta nitido a ogni misura. Dove c'è spazio si
// muove: una luce calda risale piano lungo la chioma e il tutto oscilla di
// un grado. Nelle icone piccole sta fermo e in tinta unita.

import { useId } from 'react'
import { ALTEZZA, TRACCIATO } from './marchio-forma'

export function Marchio({ dim = 40, animato = true, colore }: {
  dim?: number
  animato?: boolean
  /** Tinta unita al posto del gradiente. */
  colore?: string
}) {
  const uid = useId().replace(/:/g, '')
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
        {animato && (
          // la luce che risale: è quello che lo tiene vivo
          <linearGradient id={`${uid}l`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#FFE9C8" stopOpacity="0">
              <animate attributeName="offset" values="-0.35;1" dur="5s" repeatCount="indefinite" />
            </stop>
            <stop offset="0.12" stopColor="#FFE9C8" stopOpacity="0.5">
              <animate attributeName="offset" values="-0.23;1.12" dur="5s" repeatCount="indefinite" />
            </stop>
            <stop offset="0.24" stopColor="#FFE9C8" stopOpacity="0">
              <animate attributeName="offset" values="-0.11;1.24" dur="5s" repeatCount="indefinite" />
            </stop>
          </linearGradient>
        )}
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
          {animato && <path d={TRACCIATO} fill={`url(#${uid}l)`} style={{ mixBlendMode: 'screen' }} />}
        </g>
      </g>
    </svg>
  )
}

/** Marchio e parola, come nell'accesso e nella colonna. */
export function Logo({ dim = 34, animato = true, colore, testo = 22, tinta = 'currentColor' }: {
  dim?: number
  animato?: boolean
  colore?: string
  testo?: number
  tinta?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: dim * 0.26 }}>
      <Marchio dim={dim} animato={animato} colore={colore} />
      <span style={{ fontSize: testo, fontWeight: 300, letterSpacing: '.02em', lineHeight: 1, color: tinta }}>
        myynd
      </span>
    </div>
  )
}
