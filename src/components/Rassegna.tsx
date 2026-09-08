// A short editorial reading room. The work stays on the desk; news opens on demand.
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, type Notizia } from '../api'
import { frasi, loc, t } from '../lingua'
import { IconApri, IconCroce, IconGiro, IconSpunta } from '../icons'
import './rassegna.css'

const PER_PAGINA = 5
const MASSIMO = 10

function eta(iso: string): string {
  const minuti = (Date.now() - Date.parse(iso)) / 60_000
  if (!Number.isFinite(minuti)) return ''
  if (minuti < 90) return frasi.minutiFa(Math.max(1, Math.round(minuti)))
  const ore = minuti / 60
  if (ore < 22) return frasi.oreFa(Math.round(ore))
  if (ore < 46) return t('ieri')
  return new Date(iso).toLocaleDateString(loc(), { day: 'numeric', month: 'short' })
}

function SalaNotizie({ notizie, quando, carico, guaio, aggiorna, togli, occupata, archivio, chiudi }: {
  notizie: Notizia[]; quando: string | null; carico: boolean; guaio: string
  aggiorna: () => void; togli: (n: Notizia, come: 'letta' | 'scartata') => Promise<void>
  occupata: string | null; archivio: boolean; chiudi: () => void
}) {
  const finestra = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = finestra.current
    const precedente = document.activeElement as HTMLElement | null
    dialog?.showModal()
    return () => {
      dialog?.close()
      requestAnimationFrame(() => { if (precedente?.isConnected) precedente.focus() })
    }
  }, [])
  const [scelta, setScelta] = useState<string | null>(null)
  const [pagina, setPagina] = useState(0)
  const pagine = Math.max(1, Math.ceil(notizie.length / PER_PAGINA))
  const corrente = Math.min(pagina, pagine - 1)
  const visibili = notizie.slice(corrente * PER_PAGINA, (corrente + 1) * PER_PAGINA)
  const selezionata = visibili.find(n => n.id === scelta) ?? visibili[0]

  return createPortal(
    <dialog ref={finestra} className="news-room" aria-labelledby="news-title"
      onCancel={e => { e.preventDefault(); chiudi() }}
      onClick={e => {
        if (e.target !== e.currentTarget) return
        const box = e.currentTarget.getBoundingClientRect()
        if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) chiudi()
      }}>
        <header className="news-heading">
          <div className="news-heading-title"><div>
            <h2 id="news-title">{t('Notizie')}</h2>
            <p>{t('Intorno ai tuoi progetti')}</p>
          </div></div>
          <div className="news-heading-actions">
            <button className="news-icon" onClick={aggiorna} disabled={carico}
              title={quando ? frasi.guardatiIGiornali(eta(quando)) : t('Guarda i giornali')}
              aria-label={t('Guarda i giornali')}><span className={carico ? 'news-spinning' : undefined}><IconGiro /></span></button>
            <button className="news-icon" onClick={chiudi} aria-label={t('Chiudi')}><IconCroce size={15} /></button>
          </div>
        </header>

        {guaio && <p role="alert" className="news-error">{t(guaio)}</p>}

        {selezionata ? <div className="news-layout">
          <nav className="news-index" aria-label={t('Notizie selezionate')}>
            <div className="news-index-label">{archivio ? t('Già lette') : t('La selezione')}<span>{notizie.length}</span></div>
            <ol start={corrente * PER_PAGINA + 1}>
              {visibili.map((n, i) => <li key={n.id}>
                <button className={`news-story${selezionata.id === n.id ? ' is-selected' : ''}`}
                  onClick={() => setScelta(n.id)} aria-current={selezionata.id === n.id ? 'true' : undefined}
                  aria-controls="news-article">
                  <span className="news-number" aria-hidden="true">{String(corrente * PER_PAGINA + i + 1).padStart(2, '0')}</span>
                  <span className="news-story-copy"><span className="news-source">{n.fonte}</span><span className="news-story-title">{n.titolo}</span></span>
                </button>
              </li>)}
            </ol>
            {pagine > 1 && <div className="news-pagination">
              <button className="news-icon" aria-label={t('Pagina precedente')} disabled={corrente === 0} onClick={() => setPagina(corrente - 1)}>←</button>
              <span aria-live="polite">{corrente + 1} / {pagine}</span>
              <button className="news-icon" aria-label={t('Pagina successiva')} disabled={corrente === pagine - 1} onClick={() => setPagina(corrente + 1)}>→</button>
            </div>}
          </nav>
          <article id="news-article" className="news-article" key={selezionata.id} aria-labelledby="news-article-title">
            <div className="news-article-meta"><span>{selezionata.fonte}</span><time dateTime={selezionata.quando}>{eta(selezionata.quando)}</time></div>
            <h3 id="news-article-title">{selezionata.titolo}</h3>
            {selezionata.riassunto && <p className="news-summary">{selezionata.riassunto}</p>}
            <div className="news-article-actions">
              <a className="news-read" href={selezionata.link} target="_blank" rel="noopener noreferrer">{t('Leggi l’articolo')}<IconApri size={14} /></a>
              <div className="news-secondary-actions">
                {!selezionata.letta && <button onClick={() => void togli(selezionata, 'letta')} disabled={!!occupata}><IconSpunta size={14} />{t('Letta')}</button>}
                <button onClick={() => void togli(selezionata, 'scartata')} disabled={!!occupata}>{t('Non mi interessa')}</button>
              </div>
            </div>
          </article>
        </div> : <div className="news-empty" role="status">
          <span className="news-empty-mark" aria-hidden="true"><IconSpunta size={23} /></span>
          <h3>{carico ? t('Sto guardando i giornali…') : t('Niente da aggiungere, per ora.')}</h3>
          <p>{t('Qui arrivano le notizie rilevanti per il tuo lavoro.')}</p>
        </div>}
    </dialog>, document.body
  )
}

export function Rassegna() {
  const [notizie, setNotizie] = useState<Notizia[]>([])
  const [recenti, setRecenti] = useState<Notizia[]>([])
  const [aggiornando, setAggiornando] = useState(false)
  const [quando, setQuando] = useState<string | null>(null)
  const [carico, setCarico] = useState(false)
  const [guaio, setGuaio] = useState('')
  const [aperta, setAperta] = useState(false)
  const [occupata, setOccupata] = useState<string | null>(null)
  const viva = useRef(true)
  const caricando = useRef(false)
  const modificando = useRef(false)

  const carica = useCallback(async (forza = false) => {
    if (caricando.current || modificando.current) return
    caricando.current = true
    setCarico(true)
    setGuaio('')
    try {
      const r = await (forza ? api.aggiornaRassegna() : api.rassegna())
      if (viva.current) { setNotizie(r.notizie.filter(n => !n.letta && !n.scartata).slice(0, MASSIMO)); setRecenti((r.recenti ?? []).filter(n => n.letta && !n.scartata).slice(0, MASSIMO)); setAggiornando(!!r.aggiornando); setQuando(r.quando) }
    } catch (e) { if (viva.current) setGuaio(e instanceof Error ? e.message : String(e)) }
    finally { caricando.current = false; if (viva.current) setCarico(false) }
  }, [])

  useEffect(() => {
    viva.current = true
    void carica()
    // The server prepares a selection after startup; keep the small indicator current.
    const timer = setInterval(() => void carica(), 60_000)
    return () => { viva.current = false; clearInterval(timer) }
  }, [carica])

  useEffect(() => {
    if (!aperta || !aggiornando) return
    const timer = setInterval(() => void carica(), 3_000)
    return () => clearInterval(timer)
  }, [aperta, aggiornando, carica])

  const togli = async (n: Notizia, come: 'letta' | 'scartata') => {
    if (modificando.current || caricando.current) return
    modificando.current = true
    setOccupata(n.id)
    setGuaio('')
    try {
      await (come === 'letta' ? api.notiziaLetta(n.id) : api.notiziaScartata(n.id))
      if (viva.current) {
        setNotizie(v => v.filter(x => x.id !== n.id))
        setRecenti(v => come === 'letta' ? [{ ...n, letta: new Date().toISOString() }, ...v.filter(x => x.id !== n.id)].slice(0, MASSIMO) : v.filter(x => x.id !== n.id))
        requestAnimationFrame(() => {
          (document.querySelector<HTMLElement>('.news-story.is-selected') ?? document.querySelector<HTMLElement>('.news-room .news-heading-actions button:last-child'))?.focus()
        })
      }
    } catch (e) { if (viva.current) setGuaio(e instanceof Error ? e.message : String(e)) }
    finally { modificando.current = false; if (viva.current) setOccupata(null) }
  }

  return <>
    <button type="button" className="news-pill" onClick={() => { setAperta(true); void carica() }} aria-haspopup="dialog" aria-expanded={aperta}
      aria-label={t('Notizie')}>
      <span className={notizie.length ? 'news-dot has-news' : 'news-dot'} aria-hidden="true" />{t('Notizie')}
    </button>
    {aperta && <SalaNotizie notizie={notizie.length ? notizie : recenti} archivio={!notizie.length && !!recenti.length} quando={quando} carico={carico || aggiornando} guaio={guaio}
      aggiorna={() => void carica(true)} togli={togli} occupata={occupata ?? (carico ? 'loading' : null)} chiudi={() => setAperta(false)} />}
  </>
}
