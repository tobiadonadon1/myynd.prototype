/**
 * «Cosa ha fatto Myynd» in Memoria (P9): questa settimana, la scorsa, da
 * quando hai iniziato. Solo le finestre che hanno qualcosa; senza niente la
 * sezione non c'è, e mentre carica non si disegna niente.
 */
import { useEffect, useState, type CSSProperties } from 'react'
import { resocontoApi, type QualeResoconto, type SommarioResoconto } from '../api'
import { t } from '../lingua'
import { Hov } from '../ui'
import { IconAvanti } from '../icons'
import { apriResoconto } from '../useResoconto'
import * as parole from '../resoconto-parole'

const RIGA: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, width: '100%', minWidth: 0, padding: '8px 2px', margin: 0,
  border: 'none', background: 'none', textAlign: 'left', font: 'inherit', color: 'var(--inchiostro)', cursor: 'pointer'
}

/** `titolo` falso dentro la sezione della Memoria che ha già il suo titolo (P5). */
export function CosaHaFatto({ titolo = true }: { titolo?: boolean } = {}) {
  const [s, setS] = useState<SommarioResoconto | null>(null)
  useEffect(() => {
    let vivo = true
    resocontoApi.sommario().then(x => { if (vivo) setS(x) }).catch(() => { /* la sezione è un di più */ })
    return () => { vivo = false }
  }, [])
  if (!s || !s.righe.length) return null
  const etichetta = (q: QualeResoconto) => q === 'questa' ? t('Questa settimana') : q === 'scorsa' ? t('La settimana scorsa') : parole.etichettaInizio(s.inizio)
  return (
    <section className="mem-section" data-sezione="cosa-ha-fatto">
      {titolo && <div className="mem-section-head"><h2>{t('Cosa ha fatto Myynd')}</h2></div>}
      <div className="mem-card">
        {s.righe.map(r => (
          <Hov key={r.quale} as="button" type="button" style={RIGA} hover={{ color: 'var(--rame)' }} onClick={() => apriResoconto(r.quale)}>
            <span style={{ flex: 1, minWidth: 0, display: 'block' }}>
              <span style={{ display: 'block', fontSize: 14.5, fontWeight: 500, overflowWrap: 'anywhere' }}>{etichetta(r.quale)}</span>
              <span style={{ display: 'block', fontSize: 13, lineHeight: 1.5, color: 'rgba(var(--inchiostro-rgb),.6)', marginTop: 2, overflowWrap: 'anywhere' }}>
                {parole.rigaNumeri(r.numeri) || parole.rigaSegnalate(r.numeri.segnalate)}
              </span>
            </span>
            <IconAvanti size={12} style={{ flex: 'none', opacity: .5 }} />
          </Hov>
        ))}
      </div>
    </section>
  )
}
