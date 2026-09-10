import { useCallback, useEffect, useLayoutEffect, useRef, useState, type TextareaHTMLAttributes } from 'react'
import { giornoLocale, spostaGiorno } from '../oggi/giorni'
import { api, rigaSincronizzazione, type Stato, type StatoAvvio } from '../api'
import { t } from '../lingua'
import { ConnectorIcon } from '../components/ConnectorIcon'
import { Form } from '../components/forms'
import { IconFreccia } from '../icons'
import { Scena, OnboardAttesa, OnboardErrore, type Momento } from './Scena'
import { Introduzione } from './Introduzione'

const NON_FONTI = new Set(['claude', 'compatibile', 'mind2do'])
const PRIORITA_FONTI = ['desktop', 'google', 'posta', 'notion', 'slack', 'calendario']
const momentoDi = (fase: StatoAvvio['fase']): Momento => fase === 'progetto' ? 0 : fase === 'fonte' ? 3 : fase === 'verifica' ? 2 : 3
const messaggio = (e: unknown) => e instanceof Error ? e.message : String(e)
/** La freccia del bottone che va avanti, nel suo riquadro scuro. */
const Avanti = () => <span className="onboard-arrow"><IconFreccia /></span>

/**
 * Una risposta di una riga, che cresce se serve.
 *
 * Era una textarea di tre righe con la maniglia in basso: per dieci parole
 * sembrava un modulo da compilare. Parte alta una riga e si allarga con quello
 * che ci scrivi. Invio manda avanti — è una risposta, non una lettera — e
 * Maiuscole+Invio va a capo.
 */
function Risposta({ value, invio, onKeyDown, ...resto }: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string; invio?: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const misura = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0'
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`
    el.style.overflowY = el.scrollHeight > 240 ? 'auto' : 'hidden'
  }, [])
  useLayoutEffect(misura, [value, misura])
  useEffect(() => {
    window.addEventListener('resize', misura)
    return () => window.removeEventListener('resize', misura)
  }, [misura])
  return <textarea ref={ref} rows={1} value={value} {...resto} onKeyDown={e => {
    onKeyDown?.(e)
    if (e.key === 'Enter' && !e.shiftKey && invio && !e.defaultPrevented) { e.preventDefault(); invio() }
  }} />
}

/**
 * Tre schermate che si compilano, e nessuna che si guarda e basta.
 *
 * Il benvenuto passa da solo. Il progetto e l'obiettivo stanno sulla stessa
 * schermata — erano due domande, una per il nome e una per la meta, e la
 * seconda si apriva su un campo alto tre righe per una frase. La prima
 * attività ha la data e la fonte in vista, sotto la risposta, invece che sotto
 * una linguetta. Salvata l'attività si entra: la schermata «è pronto» con un
 * bottone solo resta per chi rivede l'avvio dalle preferenze, dove è una
 * ricapitolazione e non un passaggio.
 */
export function Onboarding({ stato, fatto, accountEmail, cambiaAccount }: { stato: Stato; fatto: () => void; accountEmail: string; cambiaAccount: () => Promise<void> }) {
  const [s, setS] = useState(stato)
  const [avvio, setAvvio] = useState<StatoAvvio | null>(null)
  const [momento, setMomento] = useState<Momento>(0)
  const [carico, setCarico] = useState(true)
  const [occupato, setOccupato] = useState(false)
  const [errore, setErrore] = useState('')
  const [progetto, setProgetto] = useState('')
  const [obiettivo, setObiettivo] = useState('')
  /** Il benvenuto è passato: da solo dopo tre secondi, o premendo. */
  const [accountConfermato, setAccountConfermato] = useState(false)
  const [fonte, setFonte] = useState('')
  const [confermati, setConfermati] = useState<string[]>([])
  const [azione, setAzione] = useState('')
  const [giorno, setGiorno] = useState('')
  const [progresso, setProgresso] = useState('')
  const [tutteFonti, setTutteFonti] = useState(false)
  const [cercaFonte, setCercaFonte] = useState('')
  const lock = useRef(false)
  const titolo = useRef<HTMLHeadingElement>(null)
  const nome = useRef<HTMLInputElement>(null)
  const iniziato = useRef(false)

  const ricarica = useCallback(async () => { const n = await api.stato(); setS(n); return n }, [])
  const carica = useCallback(async () => {
    setCarico(true); setErrore('')
    try {
      const n = await api.avvio()
      setAvvio(n); setProgetto(n.progetto?.nome ?? ''); setObiettivo(n.progetto?.obiettivo ?? '')
      setFonte(n.fonte ?? ''); setAzione(n.azione); setConfermati(n.fatti.filter(f => f.confermato).map(f => f.id))
      try {
        const bozza = JSON.parse(localStorage.getItem(`myynd.avvio.bozza.${n.id}`) ?? 'null')
        if (!n.risultato && bozza?.revisione === n.revisione) {
          if (typeof bozza.progetto === 'string') setProgetto(bozza.progetto.slice(0, 160))
          if (typeof bozza.obiettivo === 'string') setObiettivo(bozza.obiettivo.slice(0, 1000))
          if (typeof bozza.azione === 'string') setAzione(bozza.azione.slice(0, 2000))
          if (typeof bozza.giorno === 'string' && /^(\d{4}-\d{2}-\d{2})?$/.test(bozza.giorno)) setGiorno(bozza.giorno)
        }
      } catch { /* A damaged local draft never blocks the server-backed flow. */ }
      const url = new URL(window.location.href)
      const ritorno = url.searchParams.get('torno') === 'connetti'
      if (ritorno) { url.searchParams.delete('torno'); window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`) }
      setMomento(ritorno && !n.risultato ? 1 : momentoDi(n.fase))
      try {
        const salvata = sessionStorage.getItem(`myynd.avvio.fonte.${n.id}`)
        if (salvata && !n.risultato) setFonte(salvata)
      } catch { /* The saved server session remains usable with storage disabled. */ }
    } catch (e) { setErrore(messaggio(e)) }
    finally { setCarico(false) }
  }, [])
  useEffect(() => { void carica() }, [carica])
  useEffect(() => {
    if (!avvio || carico) return
    try {
      const chiave = `myynd.avvio.bozza.${avvio.id}`
      if (avvio.risultato) localStorage.removeItem(chiave)
      else localStorage.setItem(chiave, JSON.stringify({ revisione: avvio.revisione, progetto, obiettivo, azione, giorno }))
    } catch { /* Resume still uses the last successful server save. */ }
  }, [avvio, carico, progetto, obiettivo, azione, giorno])

  // l'introduzione: cinque momenti che finiscono da soli nel progetto (vedi Introduzione)
  const benvenuto = !carico && !accountConfermato

  useEffect(() => {
    if (!iniziato.current) { iniziato.current = true; return }
    // Il fuoco va nel campo, se c'è: la domanda si legge e si risponde, senza un clic in mezzo.
    const pannello = titolo.current?.closest('.onboard-panel')
    const campo = pannello?.querySelector<HTMLElement>('textarea, input:not([type=date]):not([type=checkbox]):not([type=search])')
    ;(campo ?? titolo.current)?.focus()
  }, [momento, carico, avvio?.risultato, accountConfermato])

  // Refresh the revision after a lost response/conflict without discarding form drafts.
  const fai = async (lavoro: () => Promise<void>) => {
    if (lock.current) return
    lock.current = true; setOccupato(true); setErrore('')
    let stessaSessione = false
    try {
      const auth = await api.accesso()
      if (!auth.entrato || !accountEmail || auth.account?.email !== accountEmail) {
        setErrore(t('L’account è cambiato. Usa un altro account per rientrare.')); return
      }
      stessaSessione = true
      await lavoro()
    }
    catch (e) {
      setErrore(messaggio(e))
      if (!stessaSessione) return
      try {
        const n = await api.avvio(); setAvvio(n)
        setConfermati(ids => ids.filter(id => n.fatti.some(f => f.id === id)))
        if (n.risultato) setMomento(3)
      } catch { /* Keep the initial actionable error and every unsaved field. */ }
    } finally { lock.current = false; setOccupato(false); setProgresso('') }
  }
  const vai = (dove: Momento) => { setErrore(''); setMomento(dove) }
  const salvaProgetto = () => fai(async () => {
    if (!avvio || !progetto.trim() || !obiettivo.trim()) return
    const cambiato = progetto.trim() !== avvio.progetto?.nome || obiettivo.trim() !== avvio.progetto?.obiettivo
    const n = cambiato ? await api.avvioProgetto({ nome: progetto.trim(), obiettivo: obiettivo.trim(), revisione: avvio.revisione }) : avvio
    setAvvio(n); if (cambiato) setAzione(''); vai(3)
  })
  /** Invio sull'obiettivo: se manca il nome del progetto ci si va, se no si salva. */
  const invioProgetto = () => {
    if (occupato || !obiettivo.trim()) return
    if (!progetto.trim()) { nome.current?.focus(); return }
    void salvaProgetto()
  }
  const scegliFonte = (id: string) => {
    setFonte(id); setErrore('')
    if (avvio) try { sessionStorage.setItem(`myynd.avvio.fonte.${avvio.id}`, id) } catch { /* optional return hint */ }
  }
  const leggiFonte = (salta = false) => fai(async () => {
    if (!avvio) return
    const n = await api.avvioFonte({ fonte: salta ? null : fonte, revisione: avvio.revisione })
    setAvvio(n)
    if (salta) {
      setFonte(''); setConfermati([])
      try { sessionStorage.removeItem(`myynd.avvio.fonte.${avvio.id}`) } catch { /* optional return hint */ }
      const confermato = await api.avvioConferma({ ids: [], revisione: n.revisione }); setAvvio(confermato); vai(3); return
    }
    setProgresso(t('Leggo la fonte del progetto…'))
    await api.sincronizza(m => { if (m.fase !== 'fine' && m.fase !== 'errore') setProgresso(rigaSincronizzazione(m)) }, fonte)
    await ricarica()
    const letto = await api.avvio(); setAvvio(letto); setConfermati(letto.fatti.filter(f => f.confermato).map(f => f.id)); vai(2)
  })
  const conferma = () => fai(async () => {
    if (!avvio) return
    const n = await api.avvioConferma({ ids: confermati, revisione: avvio.revisione })
    setAvvio(n); setAzione(prima => prima || n.azione); vai(3)
  })
  const entra = () => fai(async () => { await api.profilo({ onboarding: true, giro: true }); fatto() })
  const prepara = () => fai(async () => {
    if (!avvio || !azione.trim()) return
    let corrente = avvio
    if (corrente.fase === 'fonte') {
      corrente = await api.avvioFonte({ fonte: null, revisione: corrente.revisione }); setAvvio(corrente)
    }
    if (corrente.fase === 'verifica') {
      if (!corrente.fonteSaltata) { vai(2); return }
      corrente = await api.avvioConferma({ ids: [], revisione: corrente.revisione }); setAvvio(corrente)
    }
    const n = await api.avvioCompleta({ azione: azione.trim(), giorno: giorno || null, revisione: corrente.revisione })
    setAvvio(n)
    // L'attività è salvata e si vede nella lista: si entra, senza una schermata
    // in mezzo che lo dica e chieda di premere ancora.
    await api.profilo({ onboarding: true, giro: true }); fatto()
  })
  // Leaving setup never claims completion or creates a project/task.
  const esci = () => { if (stato.config.onboarding) fatto(); else void cambiaAccount() }

  const fonti = s.connettori.filter(c => (c.pronto || c.collegato) && !NON_FONTI.has(c.id))
  const ordinate = [...fonti].sort((a, b) => {
    const ia = PRIORITA_FONTI.indexOf(a.id), ib = PRIORITA_FONTI.indexOf(b.id)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
  const visibili = (tutteFonti ? ordinate : ordinate.slice(0, 6)).filter(c => `${t(c.nome)} ${t(c.nota)}`.toLocaleLowerCase().includes(cercaFonte.toLocaleLowerCase()))
  const scelta = fonti.find(c => c.id === fonte)
  /** La fonte che l'avvio ha già letto, se c'è: sulla prima attività si mostra quella. */
  const letta = avvio?.fonte ? s.connettori.find(c => c.id === avvio.fonte) : undefined
  const risultato = avvio?.risultato
  const oggi = giornoLocale(), domani = spostaGiorno(oggi, 1)
  const altroGiorno = !!giorno && giorno !== oggi && giorno !== domani

  const progressione = benvenuto ? 0 : momento === 0 ? 1.5 : momento === 1 ? 3.4 : momento === 2 ? 3.7 : risultato ? 5 : 3

  return <Scena progressione={progressione} benvenuto={benvenuto} intro={benvenuto && !!avvio} momento={momento} progetto={avvio?.progetto?.nome} salvato={!!avvio?.progetto} esci={esci} occupato={occupato} accountEmail={accountEmail} uscita={stato.config.onboarding ? t('Torna a Myynd') : t('Esci')}>
    {carico ? <OnboardAttesa testo="Un momento…" /> : !avvio ? <><OnboardErrore testo={errore} /><div className="onboard-actions"><button className="onboard-primary" onClick={carica}>{t('Riprova')}<Avanti /></button></div></> : <>
      {!accountConfermato && <Introduzione avanti={() => setAccountConfermato(true)} pronto={!!accountEmail} riprendi={!!avvio.progetto} cambiaAccount={() => void cambiaAccount()} occupato={occupato} />}
      {accountConfermato && momento === 0 && <form onSubmit={e => { e.preventDefault(); invioProgetto() }}>
        <span className="onboard-kicker">{t('Cominciamo da te')}</span>
        <h2 ref={titolo} tabIndex={-1}>{t('Cosa vuoi ottenere?')}</h2>
        <p className="onboard-why">{t('Serve a scegliere cosa conta, ogni mattina.')}</p>
        <fieldset disabled={occupato} className="onboard-fieldset">
          <label className="onboard-field onboard-answer"><span className="onboard-sr-only">{t('Cosa vuoi ottenere?')}</span><Risposta value={obiettivo} onChange={e => setObiettivo(e.target.value)} invio={invioProgetto} required maxLength={1000} placeholder={t('Un risultato concreto, con le tue parole.')} /></label>
          <label className="onboard-field"><span>{t('Progetto')}</span><input ref={nome} value={progetto} onChange={e => setProgetto(e.target.value)} required maxLength={160} autoComplete="off" placeholder={t('Il nome del tuo progetto')} /></label>
          <OnboardErrore testo={errore} />
          <div className="onboard-actions"><button className="onboard-primary" disabled={!progetto.trim() || !obiettivo.trim() || occupato}>{occupato ? t('Salvo…') : t('Continua')}<Avanti /></button></div>
        </fieldset>
      </form>}
      {accountConfermato && momento === 1 && <>
        <h2 ref={titolo} tabIndex={-1}>{t('Quale fonte deve leggere Myynd?')}</h2>
        {progresso ? <OnboardAttesa testo={progresso} /> : <>
          <fieldset disabled={occupato} className="onboard-fieldset">
            {tutteFonti && <label className="onboard-field"><span className="onboard-sr-only">{t('Cerca connessioni…')}</span><input type="search" value={cercaFonte} onChange={e => setCercaFonte(e.target.value)} placeholder={t('Cerca connessioni…')} /></label>}
            <div className="onboard-sources">{visibili.map(c => <button key={c.id} className="onboard-source" type="button" aria-pressed={fonte === c.id} aria-label={`${t(c.nome)} · ${c.collegato ? t('Collegato') : t('Da collegare')}`} onClick={() => scegliFonte(c.id)}><ConnectorIcon id={c.id} size={25} /><span>{t(c.nome)}</span>{c.collegato && <i aria-hidden="true" />}</button>)}</div>
            {fonti.length > 6 && <button type="button" className="onboard-secondary" onClick={() => { setTutteFonti(!tutteFonti); setCercaFonte('') }}>{tutteFonti ? t('Mostra meno') : t('Tutte le fonti')} <span aria-hidden="true">{tutteFonti ? '−' : '+'}</span></button>}
            {scelta && <div className="onboard-source-detail" key={scelta.id}>
              <div className="onboard-source-title"><ConnectorIcon id={scelta.id} size={16} /><span>{t(scelta.nome)}</span>{scelta.collegato && <span className="onboard-connected">✓ {t('Collegato')}</span>}</div>
              {!scelta.collegato && <Form id={scelta.id} tema="scuro" ok={ricarica} />}
            </div>}
          </fieldset>
        </>}
        <OnboardErrore testo={errore} />
        <div className="onboard-actions"><button className="onboard-secondary" disabled={occupato} onClick={() => vai(3)}>{t('Indietro')}</button><button className="onboard-primary" disabled={occupato || !scelta?.collegato} onClick={() => leggiFonte()}>{occupato ? t('Leggo…') : t('Leggi questa fonte')}<Avanti /></button></div>
        {!occupato && <button className="onboard-secondary onboard-skip" onClick={() => leggiFonte(true)}>{t('Continuo senza una fonte')}</button>}
      </>}
      {accountConfermato && momento === 2 && <>
        <h2 ref={titolo} tabIndex={-1}>{avvio.fatti.length ? t('Quali estratti vuoi tenere?') : t('Partiamo dal tuo obiettivo.')}</h2>
        {avvio.fatti.length ? <>
          <p className="onboard-note onboard-before-facts">{t('Seleziona gli estratti utili. Ogni frase ha una fonte.')}</p>
          <div className="onboard-facts">{avvio.fatti.map((f, i) => <article className={`onboard-fact ${confermati.includes(f.id) ? 'selected' : ''}`} key={f.id}>
            <label className="onboard-fact-choice"><input type="checkbox" disabled={occupato} checked={confermati.includes(f.id)} onChange={e => setConfermati(ids => e.target.checked ? [...ids, f.id] : ids.filter(id => id !== f.id))} /><span className="onboard-fact-number">{String(i + 1).padStart(2, '0')}</span><span>{f.testo}</span></label>
            <details><summary>{f.evidenza.titolo}</summary><blockquote>{f.evidenza.estratto}</blockquote></details>
          </article>)}</div>
        </> : <div className="onboard-goal-card"><span>{t('Il tuo obiettivo')}</span><p>{avvio.progetto?.obiettivo}</p><div>{t(avvio.fonteSaltata ? 'Nessuna fonte collegata a questo avvio.' : 'Non ho trovato estratti pertinenti in questa fonte.')}</div></div>}
        <OnboardErrore testo={errore} />
        <div className="onboard-actions"><button className="onboard-secondary" disabled={occupato} onClick={() => vai(1)}>{t('Cambia fonte')}</button><button className="onboard-primary" disabled={occupato} onClick={conferma}>{occupato ? t('Salvo…') : confermati.length ? t('Conferma') : t('Continua senza estratti')}<Avanti /></button></div>
      </>}
      {accountConfermato && momento === 3 && <>
        <h2 ref={titolo} tabIndex={-1}>{risultato ? t('Il tuo primo passo è pronto.') : t('Qual è la prima attività?')}</h2>
        {!risultato && <p className="onboard-why">{t('Finisce nella lista: è la prima cosa che vedrai.')}</p>}
        {risultato ? <div className="onboard-result">
          <div className="onboard-result-eyebrow"><span />{t('Salvato nella To-do')}</div><h3>{risultato.compito.testo}</h3>
          <div className="onboard-result-body"><span className="onboard-result-label">{t('Obiettivo')}</span><p>{risultato.traccia.obiettivo}</p>{risultato.traccia.estratti.length > 0 && <><span className="onboard-result-label">{t('Estratti confermati')}</span>{risultato.traccia.estratti.map((e, i) => <blockquote key={`${e.doc}-${i}`}>{e.testo}<cite>{e.titolo}</cite></blockquote>)}</>}</div>
          <div className="onboard-result-source">{risultato.progetto.nome} · {t('Attività ancora da svolgere')}</div>
        </div> : <>
          <label className="onboard-field onboard-answer"><span className="onboard-sr-only">{t('Prima attività')}</span><Risposta value={azione} disabled={occupato} onChange={e => { setAzione(e.target.value); if (errore) setErrore('') }} invio={() => { if (azione.trim() && !occupato) void prepara() }} maxLength={2000} placeholder={t('Un’azione concreta, con le tue parole.')} /></label>
          {/* La data e la fonte fanno parte dell'attività: due righe con la loro etichetta, sempre in vista. */}
          <div className="onboard-options">
            <div className="onboard-option">
              <span className="onboard-option-label" id="onboard-giorno">{t('Per che giorno')}</span>
              <div className="onboard-chips" role="group" aria-labelledby="onboard-giorno">
                {([[t('Oggi'), oggi], [t('Domani'), domani]] as [string, string][]).map(([etichetta, data]) => <button type="button" key={data} className="onboard-chip" disabled={occupato} aria-pressed={giorno === data} onClick={() => setGiorno(giorno === data ? '' : data)}>{etichetta}</button>)}
                <label className={`onboard-chip onboard-chip-date${altroGiorno ? ' is-on' : ''}`}><input type="date" disabled={occupato} value={giorno} aria-label={t('Data')} onInput={e => setGiorno(e.currentTarget.value)} onChange={e => setGiorno(e.target.value)} /></label>
              </div>
            </div>
            <button type="button" className="onboard-option onboard-option-button" disabled={occupato} onClick={() => {
              // prima la domanda, poi la fonte: la fonte serve all'attività, non il contrario
              if (!azione.trim()) { setErrore(t('Prima scrivi l’attività, poi la fonte.')); titolo.current?.closest('.onboard-panel')?.querySelector<HTMLElement>('textarea')?.focus(); return }
              vai(1)
            }}>
              <span className="onboard-option-label">{t('Fonte')}</span>
              <span className="onboard-option-body">{letta ? <><ConnectorIcon id={letta.id} size={16} /><strong>{t(letta.nome)}</strong><em>{t('Cambia')}</em></> : <><strong>{t('Aggiungi una fonte')}</strong><small>{t('Myynd la legge e cita quello che serve al progetto.')}</small></>}</span>
              <span className="onboard-arrow onboard-option-arrow"><IconFreccia /></span>
            </button>
          </div>
        </>}
        <OnboardErrore testo={errore} />
        <div className="onboard-actions">{!risultato && <button className="onboard-secondary" disabled={occupato} onClick={() => vai(0)}>{t('Indietro')}</button>}<button className="onboard-primary" disabled={occupato || (!risultato && !azione.trim())} onClick={risultato ? entra : prepara}>{occupato ? t('Salvo…') : risultato ? t('Apri Myynd') : t('Salva la prima attività')}<Avanti /></button></div>
      </>}
    </>}
  </Scena>
}
