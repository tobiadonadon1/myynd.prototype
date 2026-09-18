import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Compito } from '../api'
import { t } from '../lingua'
import {
  celleDelMese, dataLocale, giornoCompito, giorniVisibili, inizioSettimana,
  quantiGiorni, quantiInPiu, spostaGiorno, spostaMese
} from './giorni'
import './calendario.css'

/** Quante targhette stanno in una casella del mese prima del «+N». */
const IN_CASELLA = 3

/**
 * La vista scelta resta scelta.
 *
 * Sta in `localStorage` come le altre preferenze della finestra: chi lavora a
 * mese vuole ritrovare il mese, e ricominciare ogni volta dai tre giorni è il
 * genere di attrito che non si racconta, si subisce.
 */
const CHIAVE_VISTA = 'myynd.calendario.vista'
type Vista = 'tre' | 'mese'

function vistaSalvata(): Vista {
  try { return localStorage.getItem(CHIAVE_VISTA) === 'mese' ? 'mese' : 'tre' } catch { return 'tre' }
}

function salvaVista(v: Vista) {
  try { localStorage.setItem(CHIAVE_VISTA, v) } catch { /* niente memoria: si riparte dai tre giorni, e basta */ }
}

export function Calendario({ compiti, oggi, giorno, scegli, lingua, pianifica, renderRiga, senzaData, setSenzaData }: {
  compiti: Compito[]; oggi: string; giorno: string; scegli: (g: string) => void; lingua: string
  pianifica: (id: string, giorno: string | null) => void; renderRiga: (c: Compito) => ReactNode
  senzaData: boolean; setSenzaData: (v: boolean | ((v: boolean) => boolean)) => void
}) {
  const [sopra, setSopra] = useState<string | null>(null)
  const contenitore = useRef<HTMLElement>(null)
  const [colonne, setColonne] = useState(3)
  const [vista, setVista] = useState<Vista>(vistaSalvata)
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
  const celle = celleDelMese(giorno)
  const nonPianificati = compiti.filter(c => !giornoCompito(c, oggi))
  const arretrati = compiti.filter(c => { const g = giornoCompito(c, oggi); return g && g < oggi })
  const visibili = giorniVisibili(giorno, colonne)
  const delGiorno = (g: string) => compiti.filter(c => giornoCompito(c, oggi) === g)
  const nome = (g: string) => g === oggi ? t('Oggi') : g === spostaGiorno(oggi, 1) ? t('Domani')
    : g === spostaGiorno(oggi, 2) ? t('Dopodomani') : dataLocale(g).toLocaleDateString(locale, { weekday: 'long' })
  const perEsteso = (g: string) => dataLocale(g).toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })
  const lascia = (e: React.DragEvent, data: string | null) => {
    e.preventDefault(); setSopra(null)
    const id = e.dataTransfer.getData('text/plain')
    if (compiti.some(c => c.id === id)) pianifica(id, data)
  }
  const cambiaVista = (v: Vista) => { setVista(v); salvaVista(v) }
  /** Il giorno scelto dal mese torna nei tre giorni, e la barra scrive lì. */
  const apri = (g: string) => { scegli(g); setSenzaData(false); cambiaVista('tre') }
  const componi = (g: string) => {
    apri(g)
    document.querySelector<HTMLInputElement>('#task-composer')?.focus()
  }
  const trascina = (e: React.DragEvent, g: string) => { e.preventDefault(); setSopra(g) }

  return <section ref={contenitore} className="task-calendar" aria-label={t('Calendario')}>
    <div className="task-calendar-toolbar">
      <div className="task-calendar-month">{dataLocale(giorno).toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</div>
      <div className="task-calendar-nav">
        <div className="task-view-toggle" role="group" aria-label={t('Vista calendario')}>
          <button type="button" aria-pressed={vista === 'tre'} onClick={() => cambiaVista('tre')}>{t('Tre giorni')}</button>
          <button type="button" aria-pressed={vista === 'mese'} onClick={() => cambiaVista('mese')}>{t('Vista intera')}</button>
        </div>
        <button type="button" className="task-calendar-today" onClick={() => { scegli(oggi); setSenzaData(false) }}>{t('Oggi')}</button>
        <button type="button" aria-label={vista === 'mese' ? t('Mese precedente') : t('Settimana precedente')}
          onClick={() => scegli(vista === 'mese' ? spostaMese(giorno, -1) : spostaGiorno(giorno, -7))}>‹</button>
        <button type="button" aria-label={vista === 'mese' ? t('Mese successivo') : t('Settimana successiva')}
          onClick={() => scegli(vista === 'mese' ? spostaMese(giorno, 1) : spostaGiorno(giorno, 7))}>›</button>
      </div>
    </div>
    {vista === 'tre' && <div className="task-calendar-week" role="group" aria-label={t('Scegli un giorno')}>
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
    </div>}
    <div className="task-calendar-agenda-header">
      <div><h2>{senzaData ? t('Da pianificare') : t('In programma')}</h2></div>
      <button type="button" className={`task-unscheduled ${senzaData ? 'selected' : ''}`} aria-pressed={senzaData}
        onClick={() => setSenzaData(v => !v)} onDragOver={e => e.preventDefault()} onDrop={e => lascia(e, null)}>
        {t('Da pianificare')}<span>{nonPianificati.length}</span>
      </button>
    </div>
    {!senzaData && vista === 'tre' && visibili.includes(oggi) && arretrati.length > 0 && <div className="task-calendar-overdue">
      <h3>{t('Da recuperare')} <span>{arretrati.length}</span></h3>
      <ul className="task-unscheduled-grid">{arretrati.map(renderRiga)}</ul>
    </div>}
    {senzaData ? <>
      <ul className="task-unscheduled-grid">{nonPianificati.map(renderRiga)}</ul>
      {!nonPianificati.length && <div className="task-calendar-empty"><span aria-hidden="true">✓</span><p>{t('Tutto pianificato.')}</p></div>}
    </> : vista === 'mese' ? <div className="task-month">
      <div className="task-month-heads" aria-hidden="true">
        {celle.slice(0, 7).map(g => <span key={g}>{dataLocale(g).toLocaleDateString(locale, { weekday: 'short' })}</span>)}
      </div>
      <div className="task-month-grid">
        {celle.map(g => {
          const righe = delGiorno(g)
          const inPiu = quantiInPiu(righe.length, IN_CASELLA)
          const classi = ['task-month-cell', g.slice(0, 7) !== giorno.slice(0, 7) && 'fuori',
            g === giorno && 'selected', g === oggi && 'today', sopra === g && 'drop-target'].filter(Boolean).join(' ')
          return <div key={g} className={classi} onClick={() => apri(g)}
            onDragOver={e => trascina(e, g)} onDragLeave={() => setSopra(null)} onDrop={e => lascia(e, g)}>
            <div className="task-month-top">
              <button type="button" className="task-month-number"
                aria-current={g === oggi ? 'date' : undefined} aria-pressed={g === giorno}
                aria-label={`${perEsteso(g)}, ${righe.length} ${t('attività')}`}>{dataLocale(g).getDate()}</button>
              <button type="button" className="task-month-add" aria-label={`${t('Aggiungi per')} ${perEsteso(g)}`}
                onClick={e => { e.stopPropagation(); componi(g) }}>+</button>
            </div>
            <ul className="task-month-chips">
              {righe.slice(0, IN_CASELLA).map(c => <li key={c.id} className="task-month-chip" title={c.testo} draggable
                onDragStart={e => { e.dataTransfer.setData('text/plain', c.id); e.dataTransfer.effectAllowed = 'move' }}>{c.testo}</li>)}
              {inPiu > 0 && <li className="task-month-more">+{inPiu}</li>}
            </ul>
          </div>
        })}
      </div>
    </div> : <div className="task-calendar-columns" style={{ gridTemplateColumns: `repeat(${colonne}, minmax(0, 1fr))` }}>
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
