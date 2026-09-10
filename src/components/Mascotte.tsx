// La mascotte: un mostriciattolo di peluche, con la pancia chiara e due antenne.
//
// È chi scrive quando scrive Myynd — nella chat, nell'elenco delle
// conversazioni. È un'immagine, non un'icona: un personaggio disegnato in
// 3D, morbido, con le braccia giù, senza sfondo. Non è il marchio: il marchio
// è l'app, lui è la voce.
//
// Sta in `public/mascotte.png` (512 px; l'originale a 1024 è in `build/`) e si
// serve da lì; è quadrato, quindi `size` è il lato. Se il file non ci fosse,
// resta un cerchio di rame al suo posto: un avatar vuoto non è un errore,
// un'icona rotta sì. Il `ref` guarda anche un'immagine già fallita e presa
// dalla cache, che al rientro nella chat non rifà l'evento `error`.

import { useState } from 'react'

export function Mascotte({ size = 28, style }: { size?: number; style?: React.CSSProperties }) {
  const [rotta, setRotta] = useState(false)
  if (rotta) return <span style={{ width: size, height: size, borderRadius: '50%', background: 'linear-gradient(135deg,#C4623B,#E4A074)', display: 'inline-block', ...style }} aria-hidden="true" />
  return <img src="/mascotte.png" width={size} height={size} alt="" aria-hidden="true" draggable={false} decoding="async"
    ref={el => { if (el && el.complete && el.naturalWidth === 0) setRotta(true) }}
    onError={() => setRotta(true)} style={{ display: 'block', objectFit: 'contain', ...style }} />
}
