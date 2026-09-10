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

/**
 * Quanto della tela è inchiostro.
 *
 * La sagoma non riempie la sua tela: sopra e sotto c'è un margine di qualche
 * centesimo, e se si misura la tela invece dell'inchiostro il marchio esce
 * più basso della d anche a conti fatti. Si legge una volta per forma dai
 * numeri del tracciato — sono tutti comandi assoluti, quindi ogni coppia è
 * un punto — e si tiene da parte.
 */
const INCHIOSTRI = new Map<string, { alto: number; sotto: number }>()
function inchiostro(f: Forma): { alto: number; sotto: number } {
  let v = INCHIOSTRI.get(f.tracciato)
  if (!v) {
    const n = f.tracciato.match(/-?\d*\.?\d+/g)?.map(Number) ?? []
    let min = Infinity, max = -Infinity
    for (let i = 1; i < n.length; i += 2) { if (n[i] < min) min = n[i]; if (n[i] > max) max = n[i] }
    v = { alto: (max - min) / f.altezza, sotto: (f.altezza - max) / f.altezza }
    INCHIOSTRI.set(f.tracciato, v)
  }
  return v
}

/** Le maiuscole di Helvetica Neue, e di Arial dietro: 0,714 em. */
const MAIUSCOLE = 0.714

/**
 * Marchio e parola, come nell'accesso e nella colonna.
 *
 * Il marchio si misura sulla parola, non il contrario. Prima era largo
 * `dim` — 29 nel primo avvio — e alto di conseguenza: sporgeva sopra l'asta
 * della d e sotto la linea di base, e accanto a «myynd» sembrava un cappello
 * appoggiato lì, non una cosa sola. Adesso l'inchiostro è alto quanto le
 * maiuscole del carattere e siede sulla stessa linea di base della parola:
 * il flex allinea le linee di base, e per un disegno la linea di base è il
 * suo bordo inferiore — il margine della tela sotto l'inchiostro si sconta
 * con uno spostamento, che non tocca l'impaginazione.
 */
export function Logo({ animato = true, colore, testo = 22, tinta = 'currentColor', forma = PREDEFINITA, scala = 1 }: {
  animato?: boolean
  colore?: string
  /** Il corpo della parola: da qui discende la misura del marchio. */
  testo?: number
  /** Quanto il marchio supera le maiuscole: 1 le pareggia, 1,4 si fa vedere. Resta sulla linea di base. */
  scala?: number
  tinta?: string
  forma?: Forma
}) {
  const { alto, sotto } = inchiostro(forma)
  const tela = (testo * MAIUSCOLE * scala) / alto
  const dim = (tela * 100) / forma.altezza
  /** Il margine della tela sotto l'inchiostro, in pixel: di tanto il disegno scende sulla linea di base. */
  const scarto = (sotto * tela).toFixed(2)
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: Math.round(testo * 0.3) }}>
      <span style={{ display: 'block', lineHeight: 0, transform: `translateY(${scarto}px)` }}>
        <Marchio dim={dim} animato={animato} colore={colore} forma={forma} />
      </span>
      <span style={{ fontSize: testo, fontWeight: 300, letterSpacing: '.02em', lineHeight: 1, color: tinta }}>
        myynd
      </span>
    </div>
  )
}
