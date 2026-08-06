// Il marchio: un albero che è anche una mente.
//
// Cresce quando compare — i rami si disegnano dal tronco alle punte — e poi
// resta vivo: una luce sale piano lungo i rami, e la chioma oscilla appena.
// Fermo in un'icona piccola, animato dove c'è spazio.

import { useMemo } from 'react'
import { generaMarchio } from './marchio-forma'

const SEME = 9

export function Marchio({ dim = 40, animato = true, colore }: {
  dim?: number
  animato?: boolean
  /** Tinta unita al posto del gradiente — per le icone piccole. */
  colore?: string
}) {
  // sotto una certa misura le punte si impastano: tolgo l'ultimo livello
  const { rami } = useMemo(() => {
    const g = generaMarchio(SEME)
    return dim < 28 ? { ...g, rami: g.rami.filter(r => r.profondita < 3) } : g
  }, [dim])
  const id = useMemo(() => `m${Math.round(dim)}${animato ? 'a' : 's'}${colore ? 'c' : 'g'}`, [dim, animato, colore])

  return (
    <svg width={dim} height={dim} viewBox="0 0 100 100" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#A34E2D" />
          <stop offset="0.5" stopColor="#C4623B" />
          <stop offset="0.84" stopColor="#D8A46E" />
          <stop offset="1" stopColor="#8FA593" />
        </linearGradient>
        {animato && (
          // la luce che sale: è quello che lo rende vivo invece che stampato
          <linearGradient id={`${id}-l`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#FFE7C4" stopOpacity="0">
              <animate attributeName="offset" values="-0.4;1" dur="4.5s" repeatCount="indefinite" />
            </stop>
            <stop offset="0.14" stopColor="#FFE7C4" stopOpacity="0.75">
              <animate attributeName="offset" values="-0.26;1.14" dur="4.5s" repeatCount="indefinite" />
            </stop>
            <stop offset="0.28" stopColor="#FFE7C4" stopOpacity="0">
              <animate attributeName="offset" values="-0.12;1.28" dur="4.5s" repeatCount="indefinite" />
            </stop>
          </linearGradient>
        )}
      </defs>

      <g style={animato ? { animation: 'marchioOnda 7s ease-in-out infinite', transformOrigin: '50px 94px' } : undefined}>
        {rami.map((r, i) => (
          <path
            key={i}
            d={r.d}
            stroke={colore ?? `url(#${id}-g)`}
            strokeWidth={r.spessore}
            strokeLinecap="round"
            fill="none"
            style={animato ? {
              // ogni ramo entra dopo il suo genitore: sembra che cresca
              animation: `marchioCresci .7s ease-out ${(r.t * 0.5).toFixed(2)}s both`
            } : undefined}
          />
        ))}
        {animato && rami.map((r, i) => (
          <path key={`l${i}`} d={r.d} stroke={`url(#${id}-l)`} strokeWidth={r.spessore}
            strokeLinecap="round" fill="none" style={{ mixBlendMode: 'screen' }} />
        ))}
      </g>
    </svg>
  )
}

/** Marchio + parola, come compare nell'accesso e nella colonna. */
export function Logo({ dim = 34, animato = true, colore, testo = 22, tinta = 'currentColor' }: {
  dim?: number
  animato?: boolean
  colore?: string
  testo?: number
  tinta?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: dim * 0.3 }}>
      <Marchio dim={dim} animato={animato} colore={colore} />
      <span style={{ fontSize: testo, fontWeight: 300, letterSpacing: '.02em', lineHeight: 1, color: tinta }}>
        myynd
      </span>
    </div>
  )
}
