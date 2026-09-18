import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Compito } from '../api'
import { t } from '../lingua'
import {
  dataLocale, giornoCompito, giorniVisibili, inizioSettimana, quantiGiorni, spostaGiorno
} from './giorni'
import './calendario.css'

/**
 * Il calendario delle cose da fare: la striscia della settimana e tre giorni alti.
 *
 * Qui c'era anche una vista a mese, scelta da un interruttore a due posizioni.
 * Non è piaciuta, e per una ragione giusta: una griglia di caselle piccole
 * dentro una colonna non è un calendario, è un riassunto. Al suo posto c'è un
 * comando solo — «Espandi» — e la settimana vera si apre su tutta
 * l'applicazione, con gli attrezzi a sinistra e le ore sotto. Un comando, non
 * una scelta da fare ogni volta.
 */
export function Calendario({ compiti, oggi, giorno, scegli, lingua, pianifica, renderRiga, senzaData, setSenzaData, espandi }: {
  compiti: Compito[]; oggi: string; giorno: string; scegli: (g: string) => void; lingua: string
  pianifica: (id: string, giorno: string | null) => void; renderRiga: (c: Compito) => ReactNode
  senzaData: boolean; setSenzaData: (v: boolean | ((v: boolean) => boolean)) => void
  /** Apre la settimana su tutta l'applicazione. */
  espandi: () => void
}) {
  const [sopra, setSopra] = useState<string | null>(null)
  /**
   * Qualcosa si sta trascinando, adesso.
   *
   * Serve a una cosa sola: «Da pianificare» a zero non si disegna — un conto a
   * zero non è una notizia — ma è anche il posto dove si lascia una riga per
   * toglierle il giorno. Mentre una riga è in mano ricompare, e appena si posa
   * se ne va. Gli eventi del trascinamento salgono dalle carte fin qui.
   */
  const [inMano, setInMano] = useState(false)
  const contenitore = useRef<HTMLElement>(null)
  const [colonne, setColonne] = useState(3)
  useEffect(() => {
    const el = contenitore.current
    if (!el) return
    // 36 sono i due lati dell'imbottitura della scheda: chi la cambia cambi qui
    const misura = () => setColonne(quantiGiorni(el.clientWidth - 36))
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
  const delGiorno = (g: string) => compiti.filter(c => giornoCompito(c, oggi) === g)
  const nome = (g: string) => g === oggi ? t('Oggi') : g === spostaGiorno(oggi, 1) ? t('Domani')
    : g === spostaGiorno(oggi, 2) ? t('Dopodomani') : dataLocale(g).toLocaleDateString(locale, { weekday: 'long' })
  const perEsteso = (g: string) => dataLocale(g).toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })
  const lascia = (e: React.DragEvent, data: string | null) => {
    e.preventDefault(); setSopra(null); setInMano(false)
    const id = e.dataTransfer.getData('text/plain')
    if (compiti.some(c => c.id === id)) pianifica(id, data)
  }
  const componi = (g: string) => {
    scegli(g); setSenzaData(false)
    document.querySelector<HTMLInputElement>('#task-composer')?.focus()
  }
  const trascina = (e: React.DragEvent, g: string) => { e.preventDefault(); setSopra(g) }

  return <section ref={contenitore} className="task-calendar" aria-label={t('Calendario')}
    onDragStart={() => setInMano(true)} onDragEnd={() => setInMano(false)}>
    <div className="task-calendar-toolbar">
      <div className="task-calendar-month">{dataLocale(giorno).toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</div>
      <div className="task-calendar-nav">
        <button type="button" className="task-calendar-espandi" onClick={espandi}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 3H3v6M15 21h6v-6M21 9V3h-6M3 15v6h6" />
          </svg>
          {t('Espandi')}
        </button>
        <button type="button" className="task-calendar-today" onClick={() => { scegli(oggi); setSenzaData(false) }}>{t('Oggi')}</button>
        <button type="button" aria-label={t('Settimana precedente')} onClick={() => scegli(spostaGiorno(giorno, -7))}>‹</button>
        <button type="button" aria-label={t('Settimana successiva')} onClick={() => scegli(spostaGiorno(giorno, 7))}>›</button>
      </div>
    </div>
    <div className="task-calendar-week" role="group" aria-label={t('Scegli un giorno')}>
      {giorni.map(g => {
        const quanti = delGiorno(g).length
        const classi = ['task-calendar-day', g === giorno && !senzaData && 'selected',
          g === oggi && 'today', sopra === g && 'drop-target'].filter(Boolean).join(' ')
        return <button type="button" key={g} className={classi}
          aria-pressed={g === giorno && !senzaData} aria-current={g === oggi ? 'date' : undefined}
          aria-label={`${perEsteso(g)}, ${quanti} ${t('attività')}`}
          onClick={() => { scegli(g); setSenzaData(false) }}
          onDragOver={e => trascina(e, g)} onDragLeave={() => setSopra(null)} onDrop={e => lascia(e, g)}>
          <span className="task-calendar-weekday">{dataLocale(g).toLocaleDateString(locale, { weekday: 'short' })}</span>
          <span className="task-calendar-number">{dataLocale(g).getDate()}</span>
          <span className="task-calendar-dots" aria-hidden="true">{Array.from({ length: Math.min(quanti, 3) }, (_, i) => <i key={i} />)}</span>
        </button>
      })}
    </div>
    <div className="task-calendar-agenda-header">
      <div><h2>{senzaData ? t('Da pianificare') : t('In programma')}</h2></div>
      {(nonPianificati.length > 0 || senzaData || inMano) && (
        <button type="button" className={`task-unscheduled ${senzaData ? 'selected' : ''}`} aria-pressed={senzaData}
          onClick={() => setSenzaData(v => !v)} onDragOver={e => e.preventDefault()} onDrop={e => lascia(e, null)}>
          {t('Da pianificare')}<span>{nonPianificati.length}</span>
        </button>
      )}
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
        const righe = delGiorno(g)
        const classi = ['task-day-column', g === oggi && 'today', g === giorno && 'selected', sopra === g && 'drop-target'].filter(Boolean).join(' ')
        return <section key={g} className={classi} aria-label={perEsteso(g)}
          onDragOver={e => trascina(e, g)} onDragLeave={() => setSopra(null)} onDrop={e => lascia(e, g)}>
          <header><div><h3>{nome(g)}</h3><span>{dataLocale(g).toLocaleDateString(locale, { day: 'numeric', month: 'long' })}</span></div>
            {righe.length > 0 && <span className="task-day-count">{righe.length}</span>}</header>
          <ul className="task-agenda-list">{righe.map(renderRiga)}</ul>
          <button type="button" className="task-day-add" aria-label={`${t('Aggiungi per')} ${perEsteso(g)}`}
            onClick={() => componi(g)}>+</button>
        </section>
      })}
    </div>}
  </section>
}
