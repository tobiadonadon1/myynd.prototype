import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Compito } from '../api'
import { t } from '../lingua'
import { dataLocale, giornoCompito, giorniVisibili, inizioSettimana, quantiGiorni, spostaGiorno } from './giorni'
import './calendario.css'

export function Calendario({ compiti, oggi, giorno, scegli, lingua, pianifica, renderRiga, senzaData, setSenzaData }: {
  compiti: Compito[]; oggi: string; giorno: string; scegli: (g: string) => void; lingua: string
  pianifica: (id: string, giorno: string | null) => void; renderRiga: (c: Compito) => ReactNode
  senzaData: boolean; setSenzaData: (v: boolean | ((v: boolean) => boolean)) => void
}) {
  const [sopra, setSopra] = useState<string | null>(null)
  const contenitore = useRef<HTMLElement>(null)
  const [colonne, setColonne] = useState(3)
  useEffect(() => {
    const el = contenitore.current
    if (!el) return
    const misura = () => setColonne(quantiGiorni(el.clientWidth - 44))
    misura()
    const observer = new ResizeObserver(misura)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const locale = lingua === 'it' ? 'it-IT' : 'en-US'
  const giorni = Array.from({ length: 7 }, (_, i) => spostaGiorno(inizioSettimana(giorno), i))
  const nonPianificati = compiti.filter(c => !giornoCompito(c, oggi))
  const arretrati = compiti.filter(c => { const g = giornoCompito(c, oggi); return g && g < oggi })
  const visibili = giorniVisibili(giorno, colonne)
  const nome = (g: string) => g === oggi ? t('Oggi') : g === spostaGiorno(oggi, 1) ? t('Domani')
    : g === spostaGiorno(oggi, 2) ? t('Dopodomani') : dataLocale(g).toLocaleDateString(locale, { weekday: 'short' })
  const lascia = (e: React.DragEvent, data: string | null) => {
    e.preventDefault(); setSopra(null)
    const id = e.dataTransfer.getData('text/plain')
    if (compiti.some(c => c.id === id)) pianifica(id, data)
  }
  return <section ref={contenitore} className="task-calendar" aria-label={t('Calendario')}>
    <div className="task-calendar-toolbar">
      <div className="task-calendar-month">{dataLocale(giorno).toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</div>
      <div className="task-calendar-nav">
        <button type="button" onClick={() => { scegli(oggi); setSenzaData(false) }}>{t('Oggi')}</button>
        <button type="button" aria-label={t('Settimana precedente')} onClick={() => scegli(spostaGiorno(giorno, -7))}>‹</button>
        <button type="button" aria-label={t('Settimana successiva')} onClick={() => scegli(spostaGiorno(giorno, 7))}>›</button>
      </div>
    </div>
    <div className="task-calendar-week" role="group" aria-label={t('Scegli un giorno')}>
      {giorni.map(g => {
        const quanti = compiti.filter(c => giornoCompito(c, oggi) === g).length
        const classi = ['task-calendar-day', g === giorno && !senzaData && 'selected',
          g === oggi && 'today', sopra === g && 'drop-target'].filter(Boolean).join(' ')
        return <button type="button" key={g} className={classi}
          aria-pressed={g === giorno && !senzaData} aria-current={g === oggi ? 'date' : undefined}
          aria-label={`${dataLocale(g).toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })}, ${quanti} ${t('attività')}`}
          onClick={() => { scegli(g); setSenzaData(false) }}
          onDragOver={e => { e.preventDefault(); setSopra(g) }} onDragLeave={() => setSopra(null)} onDrop={e => lascia(e, g)}>
          <span className="task-calendar-weekday">{dataLocale(g).toLocaleDateString(locale, { weekday: 'short' })}</span>
          <span className="task-calendar-number">{dataLocale(g).getDate()}</span>
          <span className="task-calendar-dots" aria-hidden="true">{Array.from({ length: Math.min(quanti, 3) }, (_, i) => <i key={i} />)}</span>
        </button>
      })}
    </div>
    <div className="task-calendar-agenda-header">
      <div><h2>{senzaData ? t('Da pianificare') : t('In programma')}</h2></div>
      <button type="button" className={`task-unscheduled ${senzaData ? 'selected' : ''}`} aria-pressed={senzaData}
        onClick={() => setSenzaData(v => !v)} onDragOver={e => e.preventDefault()} onDrop={e => lascia(e, null)}>
        {t('Da pianificare')}<span>{nonPianificati.length}</span>
      </button>
    </div>
    {!senzaData && visibili.includes(oggi) && arretrati.length > 0 && <div className="task-calendar-overdue">
      <h3>{t('Da recuperare')} <span>{arretrati.length}</span></h3>
      <ul className="task-unscheduled-grid">{arretrati.map(renderRiga)}</ul>
    </div>}
    {senzaData ? <>
      <ul className="task-unscheduled-grid">{nonPianificati.map(renderRiga)}</ul>
      {!nonPianificati.length && <div className="task-calendar-empty"><span aria-hidden="true">✓</span><p>{t('Tutto pianificato.')}</p></div>}
    </> : <div className="task-calendar-columns" style={{ gridTemplateColumns: `repeat(${colonne}, minmax(0, 1fr))` }}>
      {visibili.map(g => {
        const righe = compiti.filter(c => giornoCompito(c, oggi) === g)
        const classi = ['task-day-column', g === oggi && 'today', sopra === g && 'drop-target'].filter(Boolean).join(' ')
        return <section key={g} className={classi} aria-label={dataLocale(g).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
          onDragOver={e => { e.preventDefault(); setSopra(g) }} onDragLeave={() => setSopra(null)} onDrop={e => lascia(e, g)}>
          <header><div><h3>{nome(g)}</h3><span>{dataLocale(g).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</span></div><span className="task-day-count">{righe.length}</span></header>
          <ul className="task-agenda-list">{righe.map(renderRiga)}</ul>
          <button type="button" className="task-day-add" aria-label={`${t('Aggiungi per')} ${dataLocale(g).toLocaleDateString(locale)}`}
            onClick={() => { scegli(g); document.querySelector<HTMLInputElement>('#task-composer')?.focus() }}>+</button>
        </section>
      })}
    </div>}
  </section>
}
