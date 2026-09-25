// La riga in fondo al punto: «Ieri ci ho preso 7 volte su 9.»
//
// Una riga sola, tutta un bottone: chiude il foglio, apre la Memoria, e
// «Come lavori» si cerchia di rame per un attimo. Compare quando ieri è
// chiuso e c'era almeno un'affermazione, e non più di una volta al giorno
// (localStorage, ogni lettura in try/catch). Niente sulla prima pagina,
// niente punto, niente avviso.

import { useEffect, useState, type CSSProperties } from 'react'
import { gemelloApi, type Gemello } from '../api'
import { fraseIeri } from '../gemello-frasi'
import { Hov } from '../ui'

const CHIAVE = 'myynd:ieri-gemello'
const VAI = 'myynd:vai'

/** Il giorno di qui, non quello di Greenwich: alle 21 di New York è ancora oggi. */
const oggi = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

const RIGA: CSSProperties = {
  display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 26, padding: '9px 0 0', border: 0, borderTop: '1px solid rgba(var(--inchiostro-rgb),.08)',
  background: 'none', textAlign: 'left', fontFamily: 'inherit', fontSize: 13.5, lineHeight: 1.5, color: 'rgba(var(--inchiostro-rgb),.72)',
  cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
}

export function IeriGemello({ chiudi, apriMemoria }: { chiudi: () => void; apriMemoria: () => void }) {
  const [ieri, setIeri] = useState<Gemello['ieri']>(null)

  useEffect(() => {
    let visto = ''
    try { visto = localStorage.getItem(CHIAVE) ?? '' } catch { /* senza deposito si mostra */ }
    if (visto === oggi()) return
    let vivo = true
    gemelloApi.vista().then(v => { if (vivo && v.ieri?.chiuso && v.ieri.totale > 0) setIeri(v.ieri) }).catch(() => {})
    return () => { vivo = false }
  }, [])

  if (!ieri) return null
  const vai = () => {
    try { localStorage.setItem(CHIAVE, oggi()) } catch { /* pazienza */ }
    try { sessionStorage.setItem(VAI, 'come-lavori') } catch { /* la Memoria si apre lo stesso */ }
    chiudi()
    apriMemoria()
  }
  const frase = fraseIeri(ieri.giuste, ieri.totale, ieri.base)
  return (
    <Hov as="button" type="button" onClick={vai} style={RIGA} hover={{ color: 'var(--rame-testo)' }} title={frase}>
      {frase}
    </Hov>
  )
}
