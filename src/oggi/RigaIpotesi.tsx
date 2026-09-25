// La riga dell'ipotesi sotto un lavoro consegnato, e il modo di cambiarla (P3).
//
// «I assumed Friday.» in una riga, e accanto «Change» nel rame, sempre
// visibile: lei corregge dopo, non prima. Premendolo la riga diventa la
// scatola di casa, con dentro quello che vale invece; Invio la manda, Esc la
// chiude e il fuoco torna su «Change», e se il fuoco esce dalla riga con la
// casella vuota si chiude da sola. Il gesto si vede subito: la lista si
// muove prima che il server risponda (`useCompiti.correggi`).
//
// Quando la riga dice «Manca …» (un segnaposto nel corpo), la casella chiede
// cosa ci va, non cosa vale invece: è la stessa riga con un'altra domanda.

import { useEffect, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { Hov } from '../ui'
import { t } from '../lingua'
import type { Compito } from '../api'
import { CAMPO, Scatola } from './Scatola'
import { eUnaMancanza } from '../lavoro-affidato'

const RIGA: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 3, minWidth: 0, maxWidth: '100%' }
// il testo prende solo lo spazio che gli serve e si accorcia con i puntini
// quando deve: «Cambia» segue la frase, non sta appeso al bordo destro della riga
const TESTO: CSSProperties = {
  flex: '0 1 auto', minWidth: 0, fontSize: '13px', lineHeight: 1.5, color: 'rgba(var(--inchiostro-rgb),.64)',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
}
/** «Cambia», nel rame: un gesto scritto, non una pastiglia, e sempre visibile. */
const CAMBIA: CSSProperties = {
  flex: 'none', padding: '2px 0', border: 'none', background: 'none', color: 'var(--rame-testo)',
  fontSize: '12.5px', fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
  textDecoration: 'underline', textDecorationColor: 'transparent', textUnderlineOffset: 3
}
const PILLOLA: CSSProperties = {
  flex: 'none', padding: '4px 11px', borderRadius: 99, border: '1px solid rgba(var(--inchiostro-rgb),.2)', background: 'rgba(var(--luce-rgb),.7)',
  color: 'rgba(var(--inchiostro-rgb),.72)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap'
}
const PILLOLA_SPENTA: CSSProperties = { ...PILLOLA, opacity: .45, cursor: 'default' }

export function RigaIpotesi({ c, titolo, correggi }: {
  c: Pick<Compito, 'id' | 'ipotesi' | 'email'>
  /** Il titolo della riga, per il nome accessibile di «Cambia». */
  titolo: string
  correggi: (id: string, testo: string) => void | Promise<void>
}) {
  const riga = c.ipotesi?.[0] ?? ''
  const [aperta, setAperta] = useState(false)
  const [testo, setTesto] = useState('')
  const campo = useRef<HTMLInputElement>(null)
  const cambia = useRef<HTMLButtonElement>(null)
  const scatola = useRef<HTMLDivElement>(null)

  useEffect(() => { if (aperta) campo.current?.focus() }, [aperta])
  if (!riga) return null

  const chiudi = (indietro = true) => {
    setAperta(false); setTesto('')
    if (indietro) requestAnimationFrame(() => cambia.current?.focus())
  }
  const manda = () => {
    const pulito = testo.trim()
    if (!pulito) return
    setAperta(false); setTesto('')
    void correggi(c.id, pulito)
  }
  const fermo = (e: MouseEvent) => e.stopPropagation()
  const tasti = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation()
    if (e.key === 'Enter') manda()
    else if (e.key === 'Escape') chiudi()
  }
  // il fuoco esce dalla riga con la casella vuota: si chiude da sola
  const fuori = (e: FocusEvent<HTMLDivElement>) => {
    if (scatola.current?.contains(e.relatedTarget as Node | null)) return
    if (!testo.trim()) chiudi(false)
  }

  if (aperta) {
    const puo = !!testo.trim()
    return (
      <div ref={scatola} onClick={fermo} onBlur={fuori} style={{ ...RIGA, alignItems: 'center', maxWidth: 560 }}>
        <Scatola>
          <input ref={campo} value={testo} onChange={e => setTesto(e.target.value)} onKeyDown={tasti}
            aria-label={riga} placeholder={eUnaMancanza(c) ? t('Cosa ci va?') : t('Cosa vale invece?')} style={CAMPO} />
        </Scatola>
        <button type="button" onClick={manda} disabled={!puo} style={puo ? PILLOLA : PILLOLA_SPENTA}>{t('Rifallo')}</button>
      </div>
    )
  }
  return (
    <div style={RIGA} onClick={fermo}>
      <span title={riga} style={TESTO}>{riga}</span>
      <Hov as="button" type="button" ref={cambia} aria-label={`${t('Cambia')}: ${titolo}`}
        onClick={(e: MouseEvent) => { e.stopPropagation(); setAperta(true) }}
        style={CAMBIA} hover={{ textDecorationColor: 'currentColor' }}>{t('Cambia')}</Hov>
    </div>
  )
}
