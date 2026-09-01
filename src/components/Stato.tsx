// Gli indicatori di stato: un glifo animato accanto alla parola.
//
// Ogni stato ha il suo colore e il suo movimento — leggere è una scansione,
// pensare è uno sfarfallio, cercare è un grafo che pulsa. Servono a far vedere
// *cosa* sta facendo Myynd, non solo che sta facendo qualcosa.

import type { CSSProperties } from 'react'

export type Tipo = 'penso' | 'leggo' | 'cerco' | 'collego' | 'scrivo'

type Def = { colore: string; spento: string; moto: 'sfarfallio' | 'scansione' | 'grafo' | 'orbita' }

const DEF: Record<Tipo, Def> = {
  penso:   { colore: '#C4623B', spento: 'rgba(196,98,59,.16)',  moto: 'sfarfallio' },
  leggo:   { colore: '#D8A46E', spento: 'rgba(216,164,110,.18)', moto: 'scansione' },
  cerco:   { colore: '#7E9C82', spento: 'rgba(126,156,130,.18)', moto: 'grafo' },
  collego: { colore: '#5B9BC9', spento: 'rgba(91,155,201,.18)',  moto: 'orbita' },
  scrivo:  { colore: '#A34E2D', spento: 'rgba(163,78,45,.16)',   moto: 'scansione' }
}

const N = 5           // griglia 5×5
const CELLA = 3.4
const PASSO = 4.6

/** La griglia di pixel che sfarfalla, come nei loader di riferimento. */
function Griglia({ tipo, dim, colore }: { tipo: Tipo; dim: number; colore?: string }) {
  const d = DEF[tipo]
  // su fondo scuro l'arancione del glifo si perde: chi lo disegna può dire
  // di che colore lo vuole, e il resto della card resta com'è
  const tinta = colore ?? d.colore
  const spento = colore ? 'rgba(255,247,240,.16)' : d.spento
  const celle = []
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x
      // il ritardo decide il disegno del movimento
      const ritardo =
        d.moto === 'scansione' ? x / N
        : d.moto === 'grafo' ? Math.hypot(x - 2, y - 2) / 3
        : d.moto === 'orbita' ? (Math.atan2(y - 2, x - 2) + Math.PI) / (Math.PI * 2)
        : ((i * 7) % (N * N)) / (N * N)
      // il grafo accende solo l'anello, non il pieno
      const salta = d.moto === 'grafo' && Math.hypot(x - 2, y - 2) < 1.2 && !(x === 2 && y === 2)
      if (salta) continue
      celle.push(
        <rect
          key={i}
          x={x * PASSO}
          y={y * PASSO}
          width={CELLA}
          height={CELLA}
          rx={0.7}
          fill={tinta}
          style={{ animation: `pixel 1.5s ease-in-out ${(ritardo * 1.1).toFixed(2)}s infinite` }}
        />
      )
    }
  }
  return (
    <svg width={dim} height={dim} viewBox={`0 0 ${N * PASSO} ${N * PASSO}`} style={{ flex: 'none', display: 'block' }}>
      <rect x="0" y="0" width={N * PASSO} height={N * PASSO} fill={spento} rx={2} />
      <g transform={`translate(${(PASSO - CELLA) / 2} ${(PASSO - CELLA) / 2})`}>{celle}</g>
    </svg>
  )
}

/** Stato in linea: glifo + parola. Usalo dove Myynd sta lavorando. */
export function Stato({ tipo, testo, chiaro, stile }: {
  tipo: Tipo
  testo: string
  chiaro?: boolean
  stile?: CSSProperties
}) {
  const d = DEF[tipo]
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 11,
      padding: '9px 15px 9px 11px', borderRadius: 14,
      background: chiaro ? 'rgba(244,239,232,.06)' : 'rgba(34,39,31,.05)',
      border: `1px solid ${chiaro ? 'rgba(244,239,232,.12)' : 'rgba(34,39,31,.08)'}`,
      ...stile
    }}>
      <Griglia tipo={tipo} dim={22} />
      <span style={{
        fontSize: '13.5px', letterSpacing: '.01em',
        color: chiaro ? 'rgba(244,239,232,.9)' : 'rgba(34,39,31,.8)'
      }}>
        {testo}
        <span style={{ color: d.colore, animation: 'puls 1.4s ease-in-out infinite' }}>…</span>
      </span>
    </div>
  )
}

/** Il glifo da solo, per le etichette di sezione (come nelle card di riferimento). */
export function Glifo({ tipo, dim = 15, colore }: { tipo: Tipo; dim?: number; colore?: string }) {
  return <Griglia tipo={tipo} dim={dim} colore={colore} />
}
