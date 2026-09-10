// La mascotte: Brace, una fiammella con due occhi.
//
// È chi scrive quando scrive Myynd — nella chat, nell'elenco delle
// conversazioni. Elementare e disegnata, non un'icona: la stessa luce di rame
// del primo avvio, con un cuore chiaro e due occhi che la rendono qualcuno.
// Non è il marchio: il marchio è l'app, questa è la voce.

import { useId } from 'react'

export function Mascotte({ size = 22, style }: { size?: number; style?: React.CSSProperties }) {
  const uid = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={style} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${uid}b`} x1="0" y1="1" x2="0.2" y2="0">
          <stop offset="0" stopColor="#8E3F1F" />
          <stop offset="0.55" stopColor="#C4623B" />
          <stop offset="1" stopColor="#E4A074" />
        </linearGradient>
      </defs>
      {/* il corpo: una fiamma tonda, che pende un po' a sinistra come una cosa viva */}
      <path d="M12 2.4c.7 2.9 2.9 4.6 4.5 6.9 1.4 2 2.1 4.1 1.4 6.5-.9 3.2-3.4 5.2-6.1 5.3-3.2.1-6-2.2-6.6-5.4-.5-2.6.5-4.7 1.9-6.7C8.7 6.7 11.3 5.3 12 2.4z" fill={`url(#${uid}b)`} />
      {/* il cuore chiaro, dove il calore è più alto */}
      <path d="M12 9.6c.5 1.6 1.6 2.5 2.3 3.6.7 1.1.9 2.3.4 3.4-.6 1.4-1.8 2.2-2.9 2.2-1.3 0-2.5-.9-3-2.3-.4-1.2 0-2.3.8-3.4.8-1.1 1.9-1.9 2.4-3.5z" fill="#F6E2CC" />
      {/* gli occhi */}
      <circle cx="10.55" cy="15.7" r="1.05" fill="#22271F" />
      <circle cx="13.55" cy="15.7" r="1.05" fill="#22271F" />
    </svg>
  )
}
