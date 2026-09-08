import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Compito } from '../api'
import { t } from '../lingua'
import { Cestino } from '../ui'
import type { Lista } from './useCompiti'
import { giornoCompito, giornoLocale, secchioDelGiorno, spostaGiorno } from './giorni'
import './calendario.css'

/** Native modal semantics provide focus containment, Escape and focus restoration. */
export function Dettaglio({ c, l, chiudi }: { c: Compito; l: Lista; chiudi: () => void }) {
  const dialogo = useRef<HTMLDialogElement>(null)
  const [testo, setTesto] = useState(c.testo)
  const [nota, setNota] = useState(c.nota ?? '')
  const oggi = giornoLocale()
  const [giorno, setGiorno] = useState(giornoCompito(c, oggi) ?? '')
  const [salvando, setSalvando] = useState(false)
  const [errore, setErrore] = useState(false)
  useEffect(() => {
    const dialog = dialogo.current
    const precedente = document.activeElement as HTMLElement | null
    dialog?.showModal()
    dialog?.querySelector<HTMLInputElement>('#task-detail-title')?.focus()
    return () => {
      dialog?.close()
      requestAnimationFrame(() => {
        if (precedente?.isConnected) precedente.focus()
        else document.querySelector<HTMLInputElement>('#task-composer')?.focus()
      })
    }
  }, [])
  const salva = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!testo.trim() || salvando) return
    setSalvando(true); setErrore(false)
    const fatto = await l.cambia(c.id, { testo: testo.trim(), nota: nota.trim() || null, giorno: giorno || null,
      quando: giorno ? secchioDelGiorno(giorno) : (c.quando === 'settimana' ? 'settimana' : 'poi') })
    setSalvando(false)
    if (fatto) chiudi(); else setErrore(true)
  }
  return createPortal(<dialog ref={dialogo} className="task-detail" aria-labelledby="task-detail-heading"
    onCancel={e => { e.preventDefault(); if (!salvando) chiudi() }}>
    <form onSubmit={salva}>
      <header><span id="task-detail-heading">{t('Dettagli attività')}</span><button type="button" className="task-detail-close" aria-label={t('Chiudi')} disabled={salvando} onClick={chiudi}>×</button></header>
      <div className="task-detail-body">
        <label className="task-detail-label" htmlFor="task-detail-title">{t('Attività')}</label>
        <input id="task-detail-title" className="task-detail-title" autoFocus required value={testo} onChange={e => setTesto(e.target.value)} />
        <fieldset><legend>{t('Pianificazione')}</legend><div className="task-detail-presets">
          {[['Oggi', oggi], ['Domani', spostaGiorno(oggi, 1)], ['Dopodomani', spostaGiorno(oggi, 2)], ['Senza data', '']].map(([nome, data]) =>
            <button type="button" key={nome} aria-pressed={giorno === data} onClick={() => setGiorno(data)}>{t(nome)}</button>)}
        </div><input type="date" aria-label={t('Data')} min="1900-01-01" max="9999-12-31" value={giorno} onChange={e => setGiorno(e.target.value)} /></fieldset>
        <label className="task-detail-label" htmlFor="task-detail-notes">{t('Note')}</label>
        <textarea id="task-detail-notes" className="task-detail-notes" rows={3} value={nota} placeholder={t('Aggiungi un dettaglio…')} onChange={e => setNota(e.target.value)} />
        {errore && <p role="alert" className="task-detail-error">{t('Non sono riuscito a salvarlo.')}</p>}
      </div>
      <footer><div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center' }}>{!salvando && <Cestino fai={() => { l.elimina(c.id); chiudi() }} titolo={t('Toglila')} visibile dim={32} icona={14} />}</div><button type="button" disabled={salvando} onClick={chiudi}>{t('Annulla')}</button><button type="submit" className="task-detail-save" disabled={!testo.trim() || salvando}>{salvando ? t('Salvo…') : t('Salva')}</button></footer>
    </form>
  </dialog>, document.body)
}
