// Le impostazioni del mostriciattolo: il pannellino che l'ingranaggio della
// sua pastiglia apre sotto di lui.
//
// Tre cose sole: quanto è grande, se segue il cursore con lo sguardo, e
// toglierlo dalla scrivania (con dove si va a riprenderlo). Si salvano nel
// guscio (`desktop/compagno.ts`, `impostazioni.json`) appena le si tocca.
// È nella stessa finestra del richiamo, quindi si chiude come lei: Esc, la ×,
// un clic altrove.

import { useEffect, useState, type CSSProperties } from 'react'
import { desktop, type SceltaCompagno } from '../desktop'
import { t } from '../lingua'
import { Interruttore } from '../components/forme'

const INCHIOSTRO = '#22271F'
const RIGA = 'rgba(34,39,31,.1)'
const TAGLIE: { chiave: SceltaCompagno['taglia']; nome: string }[] = [
  { chiave: 'piccolo', nome: 'Piccolo' }, { chiave: 'medio', nome: 'Medio' }, { chiave: 'grande', nome: 'Grande' }
]

export function ImpostazioniCompagno({ versione, chiudi }: {
  /** Cresce a ogni apertura: le scelte si rileggono dal guscio. */
  versione: number
  chiudi: () => void
}) {
  const ponte = desktop()?.compagno
  const [scelte, setScelte] = useState<SceltaCompagno>({ taglia: 'medio', segue: true })

  useEffect(() => {
    void ponte?.scelte?.().then(s => { if (s) setScelte(s) }).catch(() => {})
  }, [ponte, versione])

  const scegli = (patch: Partial<SceltaCompagno>) => {
    setScelte(s => ({ ...s, ...patch }))
    void ponte?.scegli?.(patch).then(s => { if (s) setScelte(s) }).catch(() => {})
  }

  const togli = () => {
    void ponte?.accendi(false)
    chiudi()
  }

  const riga: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: `1px solid ${RIGA}` }
  const nome: CSSProperties = { flex: 1, minWidth: 0, fontSize: '13px' }

  return (
    <div data-impostazioni-compagno>
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 8px 8px 14px' }}>
        <span style={{ flex: 1, fontSize: '13px', fontWeight: 600 }}>{t('Myynd sullo schermo')}</span>
        <Chiudi chiudi={chiudi} />
      </div>
      <div style={riga}>
        <span style={nome}>{t('Taglia')}</span>
        <div role="radiogroup" aria-label={t('Taglia')} style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 10, background: 'rgba(34,39,31,.06)' }}>
          {TAGLIE.map(({ chiave, nome: n }) => (
            <button key={chiave} type="button" role="radio" aria-checked={scelte.taglia === chiave} onClick={() => scegli({ taglia: chiave })}
              style={{
                border: 'none', borderRadius: 10, padding: '4px 9px', fontSize: '12px', fontFamily: 'inherit', cursor: 'pointer',
                background: scelte.taglia === chiave ? '#FFFFFF' : 'transparent', color: INCHIOSTRO,
                boxShadow: scelte.taglia === chiave ? '0 1px 2px rgba(34,39,31,.15)' : 'none'
              }}>{t(n)}</button>
          ))}
        </div>
      </div>
      <div style={riga}>
        <span style={nome}>{t('Segue il mio cursore')}</span>
        <Interruttore acceso={scelte.segue} cambia={() => scegli({ segue: !scelte.segue })} etichetta={t('Segue il mio cursore')} />
      </div>
      <div style={{ ...riga, flexDirection: 'column', alignItems: 'stretch', gap: 6, paddingBottom: 12 }}>
        <button type="button" onClick={togli} style={{
          alignSelf: 'flex-start', border: 'none', borderRadius: 99, padding: '6px 12px', cursor: 'pointer',
          background: 'rgba(34,39,31,.07)', color: INCHIOSTRO, fontSize: '12.5px', fontFamily: 'inherit'
        }}>{t('Togli dalla scrivania')}</button>
        <span style={{ fontSize: '11.5px', lineHeight: 1.45, color: 'rgba(34,39,31,.55)' }}>{t('Lo rimetti dalle Preferenze o dalla barra dei menu.')}</span>
      </div>
    </div>
  )
}

/** La × in alto a destra: chiude, come Esc. */
export function Chiudi({ chiudi }: { chiudi: () => void }) {
  return (
    <button type="button" onClick={chiudi} aria-label={t('Chiudi')} title={t('Chiudi')} style={{
      flex: 'none', width: 26, height: 26, display: 'grid', placeItems: 'center', border: 'none', borderRadius: 10,
      background: 'transparent', color: 'rgba(34,39,31,.5)', cursor: 'pointer', padding: 0
    }}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
      </svg>
    </button>
  )
}
