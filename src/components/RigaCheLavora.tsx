// Una riga che lavora, disegnata come una riga affidata: il fuoco sotto, il
// titolo sopra, un passo sotto il titolo se c'è (P4; P10 la allarga qui).
//
// Nasce per «Preparo la prima pagina»: finché la prima pagina di un conto
// nuovo non è pronta, la prima pagina dice che ci sta lavorando invece di
// restare vuota. Quando il lavoro finisce, il fuoco si posa (`finita`) e poi
// la riga se ne va (`onFinita`): le carte arrivano da sole.

import type { CSSProperties } from 'react'
import { AuroraCompito } from './AuroraCompito'
import { Glifo } from './Stato'

const RIGA: CSSProperties = { position: 'relative', padding: '12px 21px 12px', marginBottom: 14 }
const TITOLO: CSSProperties = { fontSize: '14.5px', fontWeight: 500, lineHeight: 1.4, overflowWrap: 'anywhere', textWrap: 'pretty', display: 'flex', alignItems: 'center', gap: 8 }
const PASSO: CSSProperties = { fontSize: '13px', lineHeight: 1.5, color: 'rgba(var(--inchiostro-rgb),.64)', marginTop: 3, textWrap: 'pretty', overflowWrap: 'anywhere' }

export function RigaCheLavora({ titolo, passo, finita = false, onFinita }: {
  titolo: string
  /** Una riga sotto il titolo: a che punto è (quello che ha trovato, per la prima pagina). */
  passo?: string | null
  /** Il lavoro è finito: il fuoco si posa, poi `onFinita`. */
  finita?: boolean
  onFinita?: () => void
}) {
  return (
    <div className="task-aurora-host task-aurora-row" data-working="" data-riga-che-lavora="" role="status" aria-live="polite" style={RIGA}>
      {finita ? <AuroraCompito fase="finita" onFinita={onFinita} /> : <AuroraCompito />}
      <div style={{ minWidth: 0 }}>
        <div style={TITOLO}>
          <Glifo tipo="penso" dim={12} colore="var(--inchiostro)" />
          <span style={{ minWidth: 0 }}>{titolo}</span>
        </div>
        {passo && <div style={PASSO}>{passo}</div>}
      </div>
    </div>
  )
}
