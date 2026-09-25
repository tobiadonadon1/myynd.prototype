// Una convinzione, disegnata come una riga di «Come lavori» (P5).
//
// Un disegno solo per tutto quello che Myynd ha imparato: la frase; sotto,
// da dove viene in una parola neutra (e «forse» se non è sicura); «perché»
// apre la citazione e le premesse, con «Portami lì» se c'è il documento;
// «Tienila» solo quando aspetta; «Correggi» si scrive dov'è; il cestino
// chiede «Sicuro?», perché scordare una convinzione non torna.
//
// Non è `RigaAbitudine` di P1B: quella ha un cestino che toglie subito e un
// annulla, e non ha un posto dove passarne un altro. Stesse classi, stessa
// anatomia; la logica resta di chi la usa.

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { api, type Convinzione } from '../api'
import { loc, t } from '../lingua'
import { Cestino, useAttiva } from '../ui'
import { IconGiu } from '../icons'
import { preparaApertura } from '../navigazione'
import { senzaTrattini } from '../../server/testo.ts'
import { etichettaOrigine, fiduciaInParole } from '../sezioni.ts'

export const inAttesa = (c: Convinzione) => c.genere === 'indotta' && !c.confermata

export function RigaConvinzione({ c, storica, correggi, tieni, scorda }: {
  c: Convinzione
  storica?: boolean
  correggi?: (testo: string) => Promise<void>
  tieni?: () => Promise<void>
  scorda?: () => Promise<void>
}) {
  const { attiva, props } = useAttiva()
  const [aperta, setAperta] = useState(false)
  const [modifico, setModifico] = useState(false)
  const [bozza, setBozza] = useState(c.enunciato)
  const [mostrato, setMostrato] = useState(c.enunciato)
  const [aspetta, setAspetta] = useState(inAttesa(c))
  const [guaio, setGuaio] = useState('')
  const campo = useRef<HTMLInputElement>(null)
  useEffect(() => { setMostrato(c.enunciato); setBozza(c.enunciato) }, [c.enunciato])
  useEffect(() => { setAspetta(inAttesa(c)) }, [c.genere, c.confermata])
  useEffect(() => { if (modifico) campo.current?.select() }, [modifico])

  const etichetta = [etichettaOrigine(c.genere, c.origine), fiduciaInParole(c.fiducia)].filter(Boolean).join(' · ')
  const haPerche = !!(c.prova?.citazione || c.premesse?.length || c.prova?.doc)

  const salva = async () => {
    const nuovo = senzaTrattini(bozza).trim()
    setModifico(false)
    if (!correggi || !nuovo || nuovo === mostrato) { setBozza(mostrato); return }
    const prima = mostrato
    setMostrato(nuovo); setGuaio('')
    try { await correggi(nuovo) } catch {
      // torna com'era, riapre con le sue parole, e lo dice
      setMostrato(prima); setBozza(nuovo); setModifico(true); setGuaio(t('Non sono riuscito a salvarla.'))
    }
  }
  const tasti = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); void salva() }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setBozza(mostrato); setModifico(false); setGuaio('') }
  }
  const tienila = async () => {
    if (!tieni) return
    setAspetta(false); setGuaio('')
    try { await tieni() } catch { setAspetta(true); setGuaio(t('Non sono riuscito a salvarla.')) }
  }
  const portami = async (doc: string) => {
    setGuaio('')
    const apertura = preparaApertura()
    try {
      const r = await apertura.completa(await api.portamiDocumento(doc))
      if (!r.ok) setGuaio(t(r.errore))
    } catch { apertura.annulla(); setGuaio(t('Non trovo più il documento.')) }
  }

  return (
    <div {...props} className="mem-card mem-convinzione cl-card" data-attiva={attiva ? '' : undefined} data-superata={storica ? '' : undefined}>
      {modifico ? (
        <input ref={campo} className="cl-campo" value={bozza} onChange={e => setBozza(e.target.value)} onKeyDown={tasti} onBlur={() => void salva()} aria-label={t('Correggi')} />
      ) : (
        <div className="mem-enunciato" title={mostrato}>{mostrato}</div>
      )}
      <div className="mem-meta">
        {etichetta && <span>{etichetta}</span>}
        {c.ambito !== 'persona' && <span>{c.ambito === 'azienda' ? t('azienda') : c.ambito.replace(/^(?:cliente|progetto):/, '')}</span>}
        {storica && c.al && <span>{t('fino al')} {new Date(c.al).toLocaleDateString(loc(), { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
        {haPerche && (
          <button type="button" className="mem-perche" onClick={() => setAperta(a => !a)} aria-expanded={aperta}>
            {t('perché')}
            <span style={{ display: 'flex', transform: aperta ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
              <IconGiu size={9} stroke="currentColor" />
            </span>
          </button>
        )}
        {!storica && !modifico && (correggi || scorda) && (
          <div className="cl-gesti">
            {correggi && <button type="button" className="cl-correggi" onClick={() => setModifico(true)}>{t('Correggi')}</button>}
            {/* scordare chiede una volta: è la sua testa, ed è una cosa che non torna */}
            {scorda && <Cestino fai={async () => { setGuaio(''); await scorda() }} guaio={f => setGuaio(t(f))} titolo={t('Scordala')} visibile={attiva} />}
          </div>
        )}
      </div>
      {aspetta && tieni && !storica && (
        <button type="button" className="mem-tieni" onClick={() => void tienila()}>{t('Tienila')}</button>
      )}
      {guaio && <div className="mem-guaio">{guaio}</div>}
      {aperta && (
        <div className="mem-prova">
          {c.prova?.citazione && <div style={{ fontStyle: 'italic' }}>«{c.prova.citazione}»</div>}
          {!!c.premesse?.length && (
            <div style={{ marginTop: c.prova?.citazione ? 7 : 0 }}>
              <div className="mem-dedotta">{t('dedotta da')}</div>
              {c.premesse.map((p, i) => <div key={i}>· {p}</div>)}
            </div>
          )}
          {c.prova?.doc && (
            <div className="cl-esempio"><span /><button type="button" onClick={() => void portami(c.prova!.doc!)}>{t('Portami lì')}</button></div>
          )}
        </div>
      )}
    </div>
  )
}
