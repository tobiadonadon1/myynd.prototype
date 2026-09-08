import { useCallback, useEffect, useState } from 'react'
import { api, type Attrezzo, type Automazione, type Raccolta, type SuggerimentoAutomazione } from '../api'
import { loc, t } from '../lingua'
import { Editor, Nuova } from '../automazioni/Editor'
import { quandoGira } from '../automazioni/Scheda'
import { Cestino } from '../ui'
import { IconPiu, IconGiro } from '../icons'
import { ConnectorIcon, connectorPerAttrezzo } from '../components/ConnectorIcon'
import type { Vals } from '../vals'
import '../automazioni/automazioni.css'

export function Automazioni({ v }: { v: Vals }) {
  const [tutte, setTutte] = useState<Automazione[]>([])
  const [catalogo, setCatalogo] = useState<Attrezzo[]>([])
  const [cartelle, setCartelle] = useState<string[]>([])
  const [raccolte, setRaccolte] = useState<Raccolta[]>([])
  const [suggerimenti, setSuggerimenti] = useState<SuggerimentoAutomazione[]>([])
  const [aperto, setAperto] = useState<string | null>(null)
  const [cerca, setCerca] = useState('')
  const [filtro, setFiltro] = useState('tutte')
  const [raccolta, setRaccolta] = useState('')
  const [rinomino, setRinomino] = useState<string | null>(null)
  const [repo, setRepo] = useState(false)
  const [nomeCartella, setNomeCartella] = useState<string | null>(null)
  const [carico, setCarico] = useState(true)
  const [errore, setErrore] = useState('')
  const [occupato, setOccupato] = useState('')
  const [scoperteErrore, setScoperteErrore] = useState('')
  const connessioni = v.connAttivi.map(c => c.id).sort().join(',')
  const carica = useCallback(async () => {
    setCarico(true); setErrore('')
    const risultati = await Promise.allSettled([api.automazioni(), api.attrezzi(), api.raccolte(), api.suggerimentiAutomazioni()])
    const [a, c, r, s] = risultati
    if (a.status === 'fulfilled') { setTutte(a.value.automazioni); setRepo(!!a.value.ricette.repo) }
    else setErrore(String(a.reason?.message ?? a.reason))
    if (c.status === 'fulfilled') { setCatalogo(c.value.attrezzi); setCartelle(c.value.cartelle) }
    else setErrore(String(c.reason?.message ?? c.reason))
    if (r.status === 'fulfilled') setRaccolte(r.value.raccolte)
    else setErrore(String(r.reason?.message ?? r.reason))
    if (s.status === 'fulfilled') { setSuggerimenti(s.value.suggerimenti); setScoperteErrore('') }
    else setScoperteErrore(String(s.reason?.message ?? s.reason))
    setCarico(false)
  }, [])
  useEffect(() => { void carica() }, [carica, connessioni])
  const azione = async (id: string, fai: () => Promise<void>) => {
    if (occupato) return
    setOccupato(id); setErrore('')
    try { await fai() } catch (e) { setErrore(e instanceof Error ? e.message : String(e)) }
    finally { setOccupato('') }
  }
  const sposta = (id: string, destinazione: string | null) => {
    void azione(id, async () => {
      const r = await api.mettiInRaccolta(id, destinazione)
      setTutte(r.automazioni); setRaccolte(r.raccolte)
    })
  }
  const viste = tutte.filter(a =>
    (!raccolta || a.raccolta === raccolta) &&
    (filtro === 'tutte' || (filtro === 'attive' ? a.accesa : filtro === 'pausa' ? !a.accesa : ['guaio', 'scollegata', 'muta'].includes(a.salute.stato))) &&
    `${a.nome} ${a.spiega} ${a.attrezzi.map(n => catalogo.find(c => c.nome === n)?.etichetta ?? n).join(' ')}`.toLocaleLowerCase().includes(cerca.toLocaleLowerCase()))
  const scelta = tutte.find(a => a.id === aperto)
  return <main className="auto-page">
    <header className="auto-header">
      <h1>{t('Automazioni')}</h1>
      <div className="auto-header-actions">
        <button className="auto-button" onClick={() => v.apriConnessioni()}><IconPiu size={13} />{t('Connessioni')}<span className="auto-connection-count">{v.connAttivi.length}</span></button>
        <button className="auto-button primary" onClick={() => setAperto('')}><IconPiu size={14} />{t('Crea automazione')}</button>
      </div>
    </header>
    {errore && <div className="auto-error" role="alert">{t(errore)} <button className="auto-button" onClick={carica}>{t('Riprova')}</button></div>}
    <section className="auto-discover" aria-labelledby="auto-discover-title">
      <div className="auto-section-heading"><h2 id="auto-discover-title">{t('Suggerimenti')}</h2>
        <button className="auto-button subtle" onClick={carica} disabled={carico} aria-label={t('Aggiorna')} title={t('Aggiorna')}><IconGiro size={13} /></button></div>
      {scoperteErrore ? <p role="alert" className="auto-error">{t(scoperteErrore)}</p> : carico ? <p role="status" className="auto-muted">{t('Guardo…')}</p> : suggerimenti.length ?
        <div className="auto-suggestions">{suggerimenti.map(s => <article className="auto-suggestion" key={s.id}>
          <span className="auto-suggestion-mark" aria-hidden="true">↳</span>
          <div className="auto-suggestion-body"><h3>{s.nome}</h3>
            <details><summary>{s.quanti} {t('documenti pertinenti')}</summary><p>{s.spiega}</p><ul>{s.esempi.map((e, i) => <li key={i}>{e}</li>)}</ul></details></div>
          <div className="auto-card-actions"><button className="auto-button" disabled={!!occupato} onClick={() => azione(s.id, async () => {
            const r = await api.adottaAutomazione(s.id); setTutte(r.automazioni); setAperto(r.id); setSuggerimenti(x => x.filter(y => y.id !== s.id))
          })}>{occupato === s.id ? t('Preparo…') : t('Crea bozza')} <span aria-hidden="true">↗</span></button>
          <button className="auto-button subtle" disabled={!!occupato} aria-label={`${t('Non ora')}: ${s.nome}`} title={t('Non ora')} onClick={() => azione(s.id, async () => {
            await api.ignoraAutomazione(s.id); setSuggerimenti(x => x.filter(y => y.id !== s.id))
          })}>×</button></div>
        </article>)}</div> : <p className="auto-muted auto-discovery-quiet">{t('Nessun nuovo suggerimento, per ora.')}</p>}
    </section>
    <section aria-labelledby="auto-library-title">
      <div className="auto-section-heading auto-library-heading"><h2 id="auto-library-title">{t('Le tue automazioni')} <span className="auto-count">{tutte.length}</span></h2>
        <span className="auto-muted">{tutte.filter(a => a.accesa).length} {t('attive')}</span></div>
      {!!tutte.length && <div className="auto-toolbar">
        <div className="auto-tabs" aria-label={t('Filtra automazioni')}>{[
          ['tutte', t('Tutte')], ['attive', t('Attive')], ['pausa', t('In pausa')], ['attenzione', t('Da controllare')]
        ].map(([id, label]) => <button key={id} data-state={id} aria-pressed={filtro === id} onClick={() => setFiltro(id)}>{id !== 'tutte' && <span className="auto-filter-dot" aria-hidden="true" />}{label}</button>)}</div>
        <input type="search" value={cerca} onChange={e => setCerca(e.target.value)} placeholder={t('Cerca automazioni…')} aria-label={t('Cerca automazioni…')} />
        {!!raccolte.length && <select aria-label={t('cartelle')} value={raccolta} onChange={e => setRaccolta(e.target.value)}><option value="">{t('Tutte le cartelle')}</option>{raccolte.map(r => <option key={r.nome}>{r.nome}</option>)}</select>}
        <button className="auto-button subtle" onClick={() => { setRinomino(null); setNomeCartella('') }}>{t('Nuova cartella')}</button>
        {raccolta && <><button className="auto-button subtle" onClick={() => { setRinomino(raccolta); setNomeCartella(raccolta) }}>{t('Rinominala')}</button><Cestino titolo={t('Butta la cartella')} fai={() => azione('folder', async () => {
          const r = await api.buttaRaccolta(raccolta); setRaccolte(r.raccolte); setTutte(r.automazioni); setRaccolta('')
        })} /></>}
      </div>}
      {nomeCartella !== null && <form className="auto-toolbar" onSubmit={e => { e.preventDefault(); if (nomeCartella.trim()) void azione('folder', async () => {
        if (rinomino) {
          const r = await api.rinominaRaccolta(rinomino, nomeCartella.trim()); setRaccolte(r.raccolte); setTutte(r.automazioni); setRaccolta(nomeCartella.trim())
        } else setRaccolte((await api.creaRaccolta(nomeCartella.trim())).raccolte)
        setNomeCartella(null); setRinomino(null)
      }) }}><input autoFocus aria-label={t('come si chiama')} value={nomeCartella} onChange={e => setNomeCartella(e.target.value)} /><button className="auto-button" disabled={!!occupato || !nomeCartella.trim()}>{t('Salva')}</button><button className="auto-button subtle" type="button" onClick={() => setNomeCartella(null)}>{t('Chiudi')}</button></form>}
      <div className="auto-grid">{viste.map(a => <article className={`auto-card ${['guaio', 'scollegata', 'muta'].includes(a.salute.stato) ? 'attention' : a.accesa ? 'active' : 'paused'}`} key={a.id}>
        <div className="auto-card-top"><span className={`auto-status ${a.accesa ? 'on' : ''}`}>{a.accesa ? t('Attiva') : t('In pausa')}</span>
          <button className="auto-switch" role="switch" aria-checked={a.accesa} aria-label={`${a.accesa ? t('Mettila in pausa') : t('Accendila')}: ${a.nome}`} disabled={!!occupato}
            onClick={() => azione(a.id, async () => { setTutte((await api.accendiAutomazione(a.id, !a.accesa)).automazioni) })}><span /></button></div>
        <button className="auto-card-open" onClick={() => setAperto(a.id)}><h3>{a.nome}</h3><p>{a.spiega}</p>
          <div className="auto-card-sources">{a.attrezzi.slice(0, 4).map(n => { const c = catalogo.find(x => x.nome === n); return <span key={n} className={c && !c.collegato ? 'missing' : ''} title={`${c?.etichetta ?? n}${c && !c.collegato ? ` · ${t('Da collegare')}` : ''}`} aria-label={`${c?.etichetta ?? n}${c && !c.collegato ? ` · ${t('Da collegare')}` : ''}`}><ConnectorIcon id={connectorPerAttrezzo(n, c?.serve)} size={18} /></span> })}{a.attrezzi.length > 4 && <span className="auto-source-more">+{a.attrezzi.length - 4}</span>}</div>
        </button>
        <div className="auto-card-footer"><span>{quandoGira(a)}</span><button className="auto-button subtle" onClick={() => setAperto(a.id)} aria-label={`${t('Apri')}: ${a.nome}`}>↗</button></div>
        {a.salute.stato !== 'bene' && <div className="auto-health"><span>{a.salute.stato === 'scollegata' ? t('manca una connessione') : a.salute.stato === 'guaio' ? t('l’ultima volta è andata storta') : a.salute.stato === 'ferma' ? t('aspetta che chiudi la sua riga') : t('Da controllare')}</span>{a.salute.stato === 'scollegata' && <button className="auto-button subtle" onClick={() => {
          const mancante = a.attrezzi.map(n => catalogo.find(c => c.nome === n)).find(c => c && !c.collegato)
          v.apriConnessioni(mancante?.serve === 'agenda' ? 'calendario' : mancante?.serve === 'sharepoint' ? 'microsoft' : mancante?.serve ?? '')
        }}>{t('Collega')} ↗</button>}</div>}
        {a.ultima && <div className="auto-last">{t('Ultima esecuzione')}: {new Date(a.ultima).toLocaleString(loc(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>}
      </article>)}</div>
      {!carico && !viste.length && <div className="auto-empty"><h3>{tutte.length ? t('Nessun risultato') : t('Nessuna automazione, per ora.')}</h3><button className="auto-button" onClick={() => { if (tutte.length) { setFiltro('tutte'); setCerca(''); setRaccolta('') } else setAperto('') }}>{tutte.length ? t('Mostra tutte') : t('Crea automazione')}</button></div>}
    </section>
    {repo && <button className="auto-button subtle" disabled={!!occupato} onClick={() => azione('recipes', async () => { const r = await api.aggiornaRicette(); setTutte(r.automazioni) })}>{t('Cerca automazioni nuove')}</button>}
    <footer className="auto-page-footer">{v.ospitato ? t('Le automazioni girano nel tuo spazio.') : t('Le automazioni girano mentre Myynd è aperto su questo computer.')}</footer>
    {scelta && <Editor key={scelta.id} a={scelta} catalogo={catalogo} cartelle={cartelle} raccolte={raccolte} cambiata={setTutte} chiudi={() => setAperto(null)} spostata={sposta} />}
    {aperto === '' && <Nuova catalogo={catalogo} chiudi={() => setAperto(null)} fatta={(a, id) => { setTutte(a); setAperto(id) }} />}
  </main>
}
