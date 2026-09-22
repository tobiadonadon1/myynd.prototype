// Le preferenze: quattro aree, e dentro ognuna una griglia di schede.
//
// «The settings page is clustered, not intuitive, not straightforward, not
// easy to edit, and not easy to manage.»
//
// Quello che era: una pila di riquadri larghi quanto il pannello, ognuno con
// un titolo, un paragrafo che spiegava cosa fa il controllo, e poi il
// controllo. Per trovare l'aspetto bisognava leggere quattro paragrafi.
//
// Quello che è adesso, e le tre regole che lo tengono insieme:
//
//   · una scheda è un titolo, un controllo, e al massimo una riga che dice
//     come sta la cosa adesso. I paragrafi che insegnano non ci sono più:
//     «Chiaro di giorno, scuro di sera» non aggiunge niente a tre pastiglie
//     che dicono Sistema, Chiaro, Scuro.
//   · un solo bottone pieno per scheda, e sta in fondo a destra. Il resto è
//     bordo o sole parole.
//   · le caselle di testo sono quelle della barra di «Da fare»: stesso raggio,
//     stesso fondo, stesso bordo che si accende quando ci scrivi.

import { useCallback, useEffect, useRef, useState } from 'react'
import { api, sessione, type ChatGPT, type ClaudeCon } from '../api'
import { frasi, t } from '../lingua'
import { Hov, daTastiera, knob, track } from '../ui'
import { IconAvanti, IconSpunta } from '../icons'
import type { Vals } from '../vals'
import { acceleratore, avvisiAccesi, desktop, impostaAvvisi, nomePiattaforma, simboli, soloModificatore, type Aggiornamento } from '../desktop'
import './preferenze.css'
import { nomePianoChatGPT } from '../chatgpt-accesso.ts'

/** Una scheda: il titolo è la gerarchia, e sotto ci sta quello che si tocca. */
function Scheda({ titolo, larga, quieta, children }: {
  titolo: string
  /** Larga quanto il pannello: solo dove il controllo non ci sta in metà. */
  larga?: boolean
  /** Smorzata: quello che non si preme di fretta. */
  quieta?: boolean
  children: React.ReactNode
}) {
  return (
    <article className={`prefs-card${larga ? ' larga' : ''}${quieta ? ' quieta' : ''}`}>
      <h3>{titolo}</h3>
      {children}
    </article>
  )
}

/** La spunta che dice «l'ho salvato», e se ne va da sola. */
function Tic({ mostra }: { mostra: boolean }) {
  return (
    <span aria-live="polite" style={{
      flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '11.5px',
      color: 'var(--verde-cupo)', opacity: mostra ? 1 : 0, transition: 'opacity .35s'
    }}>
      {mostra && <><IconSpunta size={11} />{t('Salvato')}</>}
    </span>
  )
}

/** Una pastiglia di scelta: è quella dell'app, scelta di rame e spenta di bordo. */
function pastiglia(scelta: boolean): React.CSSProperties {
  return scelta
    ? { padding: '9px 17px', borderRadius: 99, border: '1px solid rgba(var(--luce-rgb),.5)', background: 'var(--gradiente-rame)', color: 'var(--avorio)', fontFamily: 'inherit', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }
    : { padding: '9px 17px', borderRadius: 99, border: '1px solid rgba(var(--inchiostro-rgb),.2)', background: 'rgba(var(--luce-rgb),.5)', color: 'var(--inchiostro)', fontFamily: 'inherit', fontSize: '13px', cursor: 'pointer' }
}

/**
 * L'app da scrivania: quello che sa fare il guscio e il sito no.
 *
 * Si vede solo dentro l'app. Sono le quattro cose che una persona tocca una
 * volta e poi dimentica: gli aggiornamenti, la scorciatoia che porta Myynd
 * davanti da qualunque programma, se parte da sola all'accesso, e gli avvisi.
 * La scorciatoia si cambia premendola — non scrivendola — perché
 * «CommandOrControl+Shift+M» non è una cosa che si chiede a nessuno di sapere.
 *
 * Quando l'app non può aggiornarsi lo dice con una riga e basta, senza un
 * bottone spento accanto: un «Controlla» che non controlla niente insegna a
 * non fidarsi degli altri.
 */
function LApp() {
  const d = desktop()
  const [acc, setAcc] = useState('')
  const [registro, setRegistro] = useState(false)
  const [avvio, setAvvio] = useState<boolean | null>(null)
  const [avvisi, setAvvisi] = useState(avvisiAccesi)
  const [agg, setAgg] = useState<Aggiornamento | null>(null)
  const [chiedo, setChiedo] = useState(false)
  const [guaio, setGuaio] = useState('')

  useEffect(() => {
    if (!d) return
    d.scorciatoia().then(setAcc).catch(() => {})
    d.avvioAutomatico().then(setAvvio).catch(() => {})
    // gli eventi già mandati prima che questa scheda esistesse non tornano:
    // si chiede com'è adesso, e da lì in poi si ascolta
    d.aggiornamenti.attuale().then(setAgg).catch(() => {})
    return d.aggiornamenti.stato(setAgg)
  }, [d])

  /*
   * La registrazione: il prossimo tasto premuto è la scorciatoia nuova.
   *
   * In cattura e su `window`, così arriva prima di qualunque campo o
   * scorciatoia della pagina — ⌘K aprirebbe la ricerca invece di diventare
   * la combinazione. Esc lascia com'era; un modificatore da solo aspetta.
   */
  useEffect(() => {
    if (!registro || !d) return
    const alTasto = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation()
      if (e.key === 'Escape') { setRegistro(false); return }
      if (soloModificatore(e.key)) return
      const nuovo = acceleratore(e, d.piattaforma)
      if (!nuovo) {
        setGuaio(d.piattaforma === 'darwin' ? t('Serve ⌘, ⌃ o ⌥ insieme a un tasto.') : t('Serve Ctrl, Alt o Win insieme a un tasto.'))
        return
      }
      setRegistro(false); setGuaio('')
      d.impostaScorciatoia(nuovo)
        .then(r => { if (r.ok) setAcc(nuovo); else setGuaio(r.errore ? t(r.errore) : t('Non sono riuscito a cambiare la scorciatoia.')) })
        .catch(e => setGuaio(e instanceof Error ? t(e.message) : String(e)))
    }
    window.addEventListener('keydown', alTasto, true)
    return () => window.removeEventListener('keydown', alTasto, true)
  }, [registro, d])

  if (!d) return null

  const cambiaAvvio = async () => {
    const nuovo = !avvio
    setAvvio(nuovo); setGuaio('')
    try { await d.impostaAvvioAutomatico(nuovo) }
    catch (e) { setAvvio(!nuovo); setGuaio(e instanceof Error ? t(e.message) : String(e)) }
  }

  const controlla = async () => {
    setChiedo(true); setGuaio('')
    try { setAgg(await d.aggiornamenti.controlla()) }
    catch (e) { setAgg({ stato: 'errore', messaggio: e instanceof Error ? e.message : String(e) }) }
    setChiedo(false)
  }

  const rigaAggiornamenti = (): string => {
    if (!agg) return t('Non ho ancora controllato.')
    switch (agg.stato) {
      case 'spento':
        return agg.perche === 'non-firmata' ? t('L’app non è firmata, quindi non può ancora aggiornarsi da sola.')
          : agg.perche === 'sviluppo' ? t('In sviluppo non si aggiorna.')
          : t('Questa copia non ha un indirizzo da cui aggiornarsi.')
      case 'controllo': return t('Controllo…')
      case 'aggiornata': return t('È l’ultima versione.')
      case 'scarico': return frasi.scaricoAggiornamento(agg.versione, agg.percento)
      case 'pronta': return frasi.aggiornamentoPronto(agg.versione)
      case 'errore': return `${t('Non sono riuscito a controllare.')} ${agg.messaggio}`
    }
  }
  const inCorso = chiedo || agg?.stato === 'controllo' || agg?.stato === 'scarico'

  return (
    <Scheda titolo={t('L’app')}>
      <div className="prefs-riga">
        <div>
          <div className="prefs-nome">{t('Versione')} {d.versione} · {nomePiattaforma(d.piattaforma)}</div>
          <div className="prefs-stato">{rigaAggiornamenti()}</div>
        </div>
        {agg?.stato === 'pronta' ? (
          <button type="button" className="prefs-pieno" onClick={() => d.aggiornamenti.installa()}>{t('Riavvia e aggiorna')}</button>
        ) : agg?.stato !== 'spento' && (
          <button type="button" className="prefs-secondario" onClick={controlla} disabled={inCorso}>
            {inCorso ? t('Controllo…') : t('Controlla')}
          </button>
        )}
      </div>

      <div className="prefs-riga">
        <div>
          <div className="prefs-nome">{t('Il richiamo')}</div>
          {registro
            ? <div className="prefs-stato rame">{t('Premi la combinazione nuova…')} {t('Esc lascia com’è.')}</div>
            : <div style={{ marginTop: 4 }}><span className="prefs-tasto">{acc ? simboli(acc, d.piattaforma) : '…'}</span></div>}
        </div>
        <button type="button" className="prefs-secondario" onClick={() => { setGuaio(''); setRegistro(r => !r) }}>
          {registro ? t('Annulla') : t('Cambia')}
        </button>
      </div>

      <div className="prefs-riga">
        <div className="prefs-nome">{t('Si apre all’accesso')}</div>
        <button type="button" role="switch" aria-checked={!!avvio} aria-label={t('Si apre all’accesso')}
          disabled={avvio === null} onClick={cambiaAvvio} style={track(!!avvio)}><span style={knob()} /></button>
      </div>

      {/* Spento finché non lo si accende: il brief vuole un'app quieta, e un
          avviso è un'interruzione che si sceglie. */}
      <div className="prefs-riga">
        <div className="prefs-nome">{t('Avvisami quando una bozza è pronta')}</div>
        <button type="button" role="switch" aria-checked={avvisi} aria-label={t('Avvisami quando una bozza è pronta')}
          onClick={() => { impostaAvvisi(!avvisi); setAvvisi(!avvisi) }} style={track(avvisi)}><span style={knob()} /></button>
      </div>

      {guaio && <div className="prefs-stato rame">{guaio}</div>}
    </Scheda>
  )
}

/**
 * Dove stanno i tuoi dati: il percorso, e il bottone che lo apre.
 *
 * Era un paragrafo di tre righe con tre nomi di file dentro. Il percorso vero
 * è l'unica cosa che serve sapere, e sull'app c'è anche il modo di arrivarci.
 */
function DoveStanno({ v }: { v: Vals }) {
  const d = desktop()
  const [dati, setDati] = useState('')
  useEffect(() => {
    // la cartella vera, non `home + '/.myynd'`: con MYYND_DATI è un'altra
    api.stato().then(s => setDati(s.dati || (s.home ? `${s.home}/.myynd` : ''))).catch(() => {})
  }, [])

  return (
    <Scheda titolo={t('I tuoi dati')}>
      <div className="prefs-stato">
        {v.ospitato ? frasi.doveStannoIDatiServer() : <code>{dati || '~/.myynd'}</code>}
      </div>
      {d && !v.ospitato && (
        <div className="prefs-piede">
          <div className="prefs-stato" />
          <button type="button" className="prefs-secondario" disabled={!dati}
            onClick={() => { d.mostraNelFinder(dati).catch(() => {}) }}>
            {d.piattaforma === 'darwin' ? t('Mostra nel Finder') : t('Mostra la cartella dei dati')}
          </button>
        </div>
      )}
    </Scheda>
  )
}

/** Il campo del fuoco: stato suo, di nessun altro. */
function CampoFuoco({ v }: { v: Vals }) {
  const [testo, setTesto] = useState(v.fuoco)
  // si riallinea solo quando il valore vero cambia — cioè al caricamento e al
  // salvataggio. Mentre scrivi, nessun caricamento in sottofondo può toccarlo.
  useEffect(() => { setTesto(v.fuoco) }, [v.fuoco])

  return (
    <Scheda titolo={t('Su cosa mi concentro')}>
      <input className="prefs-campo" value={testo} onChange={e => setTesto(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') v.salvaFuoco(testo) }}
        aria-label={t('Su cosa mi concentro')}
        placeholder={t('Questa settimana solo i preventivi e i pagamenti')} />
      <div className="prefs-piede">
        {/*
          Chi ha scritto quella riga.

          Il campo restava vuoto perché «su cosa vuoi che mi concentri adesso?»
          non è una domanda a cui si risponde in astratto. Adesso, se è vuoto,
          lo scrive Myynd da quello che ha in lista — e lo dice, perché una riga
          comparsa da sola che nessuno dichiara è peggio di una riga vuota.
        */}
        <span className="prefs-stato">
          {v.fuocoDaMe && !!v.fuoco ? t('L’ha scritto Myynd dalle tue attività e dai tuoi progetti. Se non torna, correggilo.') : ''}
        </span>
        <button type="button" className="prefs-pieno" onClick={() => v.salvaFuoco(testo)}>{t('Salva')}</button>
      </div>
    </Scheda>
  )
}

/**
 * Gli argomenti della rassegna.
 *
 * Gemello del fuoco, e vale la pena tenerli distinti anche qui sotto gli occhi:
 * il fuoco dice a Myynd dove guardare *dentro* — nella posta, nei file, in
 * quello che ti riguarda — questo dice cosa cercare *fuori*, nei giornali.
 */
function CampoArgomenti({ v }: { v: Vals }) {
  const [testo, setTesto] = useState(v.argomenti)
  const [salvato, setSalvato] = useState(false)
  const [gusto, setGusto] = useState('')
  const [chiedo, setChiedo] = useState(false)
  const [detto, setDetto] = useState('')
  useEffect(() => { setTesto(v.argomenti) }, [v.argomenti])

  // quello che ha notato da come leggi: si chiede una volta, all'apertura
  useEffect(() => { api.rassegna().then(r => setGusto(r.gusto)).catch(() => {}) }, [])

  const salva = () => {
    v.salvaArgomenti(testo)
    setSalvato(true)
    setTimeout(() => setSalvato(false), 1800)
  }

  /**
   * La proposta, che si mette nel campo e non ci si scrive da sola.
   *
   * Chi ha scritto quella riga se la tiene: qui si riempie la casella e basta,
   * e a salvare ci pensa lei. La differenza fra le due cose è tutto quello che
   * separa un aiuto da una cosa che ti riscrive addosso.
   */
  const proponi = async () => {
    setChiedo(true); setDetto('')
    try {
      const r = await api.proponiArgomenti()
      if (r.argomenti) { setTesto(r.argomenti); setDetto(t('Guarda se ti torna, poi salva.')) }
      else setDetto(t('Non ho ancora abbastanza per dire cosa ti interessa.'))
    } catch { setDetto(t('Non ce l’ha fatta.')) }
    setChiedo(false)
  }

  return (
    <Scheda titolo={t('Di cosa ti tengo aggiornato')}>
      <input className="prefs-campo" value={testo} onChange={e => setTesto(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') salva() }}
        aria-label={t('Di cosa ti tengo aggiornato')}
        placeholder={t('intelligenza artificiale, startup, Medio Oriente, mercati')} />
      <div className="prefs-piede">
        <button type="button" className="prefs-quieto" onClick={proponi} disabled={chiedo}>
          {chiedo ? t('Guardo…') : t('Scrivilo da quello che faccio e leggo')}
        </button>
        <div style={{ flex: 1 }} />
        <button type="button" className="prefs-pieno" onClick={salva}>{salvato ? t('Salvato') : t('Salva')}</button>
      </div>
      {/*
        Quello che ha imparato guardandoti leggere: non è una cosa che hai
        scritto tu, è una cosa che ha concluso lui, e tenerle separate è quello
        che permette di crederci — e di correggerlo scrivendo sopra nel campo.
      */}
      {(detto || (v.argomentiDaMe && !!v.argomenti)) && (
        <div className="prefs-stato">{detto || t('L’ho scritto io, da quello che apri. Se lo cambi, resta tuo.')}</div>
      )}
      {gusto && (
        <div className="prefs-stato"><span className="prefs-etichetta">{t('Da come leggi')}</span>{gusto}</div>
      )}
    </Scheda>
  )
}

/**
 * Quanto è costato ragionare, e dove sta il tetto.
 *
 * Prima «perché ho speso sei dollari in tre giorni» non aveva un posto in
 * cui trovare risposta. Qui si vede oggi e gli ultimi giorni, in token — che
 * è quello che si paga — e si mette un tetto oltre il quale Myynd smette di
 * chiamare il modello fino a domani.
 */
function Uso() {
  const [u, setU] = useState<Awaited<ReturnType<typeof api.uso>> | null>(null)
  const [tetto, setTetto] = useState('')
  const [salvo, setSalvo] = useState(false)
  const [guaio, setGuaio] = useState('')
  useEffect(() => {
    // un errore qui faceva sparire la carta intera, senza dire niente: è la
    // stessa distinzione fra «vuoto» e «guasto» che vale per il feed e la mappa
    api.uso()
      .then(x => { setU(x); setTetto(x.oggi.tetto ? String(x.oggi.tetto) : '') })
      .catch(e => setGuaio(e instanceof Error ? t(e.message) : String(e)))
  }, [])

  const salva = async () => {
    const n = Math.max(0, Math.floor(Number(tetto) || 0))
    setSalvo(true); setGuaio('')
    try { await api.profilo({ tetto: n }); setU(await api.uso()) }
    catch (e) { setGuaio(e instanceof Error ? t(e.message) : String(e)) }
    setSalvo(false)
  }

  if (!u) {
    if (!guaio) return null
    return <Scheda titolo={t('Quanto ha ragionato')}><div className="prefs-stato rame">{guaio}</div></Scheda>
  }
  const mila = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(n)
  const giorni = u.giorni.slice(-7)
  const max = Math.max(1, ...giorni.map(g => g.entrata + g.uscita))

  return (
    <Scheda titolo={t('Quanto ha ragionato')}>
      <div className="prefs-stato">
        {u.oggi.chiamate
          ? frasi.usoOggi(u.oggi.chiamate, mila(u.oggi.entrata + u.oggi.uscita), mila(u.oggi.cache))
          : t('Oggi ancora niente.')}
        {u.oggi.raggiunto && <span className="rame"> {t('Tetto raggiunto: si riparte domani.')}</span>}
      </div>
      {giorni.length > 1 && (
        <div aria-hidden="true" className="prefs-barre">
          {giorni.map(g => {
            const tot = g.entrata + g.uscita
            return <div key={g.giorno} className="prefs-barra" title={`${g.giorno} · ${mila(tot)}`}
              style={{ height: `${Math.max(8, Math.round(100 * tot / max))}%` }} />
          })}
        </div>
      )}
      <div>
        <span className="prefs-etichetta">{t('Tetto al giorno, in token')}</span>
        <input inputMode="numeric" className="prefs-campo" value={tetto} placeholder={t('nessuno')}
          aria-label={t('Tetto al giorno, in token')}
          onChange={e => setTetto(e.target.value.replace(/[^\d]/g, ''))}
          onKeyDown={e => { if (e.key === 'Enter') salva() }} />
      </div>
      <div className="prefs-piede">
        <div className="prefs-stato" />
        <button type="button" className="prefs-pieno" onClick={salva} disabled={salvo}>
          {salvo ? t('Un momento…') : t('Salva')}
        </button>
      </div>
      {guaio && <div className="prefs-stato rame">{guaio}</div>}
    </Scheda>
  )
}

/**
 * Il conto: la password si cambia da qui, e le sessioni si chiudono da qui.
 * Prima l'unica strada era la riga di comando di chi ospita — cioè nessuna,
 * per chi usa.
 */
function Conto() {
  const [attuale, setAttuale] = useState('')
  const [nuova, setNuova] = useState('')
  const [ripeti, setRipeti] = useState('')
  const [faccio, setFaccio] = useState<'' | 'cambio' | 'esco'>('')
  const [detto, setDetto] = useState('')
  const [guaio, setGuaio] = useState('')

  const cambia = async () => {
    if (nuova !== ripeti) { setGuaio(t('Le due password nuove non coincidono.')); return }
    setFaccio('cambio'); setDetto(''); setGuaio('')
    try {
      await api.cambiaPassword(attuale, nuova)
      setAttuale(''); setNuova(''); setRipeti('')
      setDetto(t('Password cambiata. Gli altri dispositivi dovranno rientrare.'))
    } catch (e) { setGuaio(e instanceof Error ? t(e.message) : String(e)) }
    setFaccio('')
  }

  const esciOvunque = async () => {
    setFaccio('esco'); setGuaio('')
    try { await api.esciOvunque(); sessione.pulisci(); location.reload() }
    catch (e) { setGuaio(e instanceof Error ? t(e.message) : String(e)); setFaccio('') }
  }

  const pronto = attuale.length > 0 && nuova.length >= 8 && ripeti.length >= 8 && !faccio

  return (
    <Scheda titolo={t('Il tuo accesso')}>
      <div className="prefs-coppia">
        <div>
          <span className="prefs-etichetta">{t('Password attuale')}</span>
          <input type="password" className="prefs-campo" value={attuale} onChange={e => setAttuale(e.target.value)} autoComplete="current-password" />
        </div>
        <div>
          <span className="prefs-etichetta">{t('Password nuova')}</span>
          <input type="password" className="prefs-campo" value={nuova} onChange={e => setNuova(e.target.value)} autoComplete="new-password"
            placeholder={t('otto caratteri')} />
        </div>
        <div>
          <span className="prefs-etichetta">{t('Ripeti la nuova')}</span>
          <input type="password" className="prefs-campo" value={ripeti} onChange={e => setRipeti(e.target.value)} autoComplete="new-password"
            onKeyDown={e => { if (e.key === 'Enter' && pronto) cambia() }} />
        </div>
      </div>
      <div className="prefs-piede">
        <button type="button" className="prefs-quieto" onClick={esciOvunque} disabled={!!faccio}>
          {faccio === 'esco' ? t('Un momento…') : t('Esci da tutti i dispositivi')}
        </button>
        <div style={{ flex: 1 }} />
        <button type="button" className="prefs-pieno" onClick={cambia} disabled={!pronto}>
          {faccio === 'cambio' ? t('Un momento…') : t('Cambia la password')}
        </button>
      </div>
      {detto && <div className="prefs-stato verde">{detto}</div>}
      {guaio && <div className="prefs-stato rame">{guaio}</div>}
    </Scheda>
  )
}

/**
 * Come ti chiami, e cosa fai.
 *
 * `/api/profilo` li accetta da sempre e li chiedeva **solo l'onboarding**: una
 * scrittura andata storta là dentro — la rete che salta, una scheda chiusa a
 * metà — e da lì in avanti Myynd ti chiamava «tu» per sempre, senza nessuna
 * schermata da cui rimediare.
 *
 * Si salva lasciando il campo o con Invio, con una spunta piccola che lo dice:
 * la stessa regola dei campi di un progetto, e nessun bottone da premere.
 */
function Identita() {
  const [nome, setNome] = useState('')
  const [ruolo, setRuolo] = useState('')
  const [caricato, setCaricato] = useState(false)
  const [fatto, setFatto] = useState(false)
  const [guaio, setGuaio] = useState('')
  /** Quello che il server ha davvero: senza, ogni uscita dal campo riscrive. */
  const vero = useRef({ nome: '', ruolo: '' })
  const orologio = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    api.stato()
      .then(s => {
        const n = s.config.nome ?? '', r = s.config.ruolo ?? ''
        vero.current = { nome: n, ruolo: r }
        setNome(n); setRuolo(r); setCaricato(true)
      })
      .catch(e => setGuaio(e instanceof Error ? t(e.message) : String(e)))
  }, [])
  useEffect(() => () => clearTimeout(orologio.current), [])

  const salva = async () => {
    if (!caricato) return
    const n = nome.trim(), r = ruolo.trim()
    if (n === vero.current.nome && r === vero.current.ruolo) return
    setGuaio('')
    try {
      await api.profilo({ nome: n, ruolo: r })
      vero.current = { nome: n, ruolo: r }
      setFatto(true)
      clearTimeout(orologio.current)
      orologio.current = setTimeout(() => setFatto(false), 2400)
    } catch (e) { setGuaio(e instanceof Error ? t(e.message) : String(e)) }
  }

  return (
    <Scheda titolo={t('Chi sei')}>
      <div className="prefs-coppia">
        <div>
          <span className="prefs-etichetta">{t('Nome')}</span>
          <input className="prefs-campo" value={nome} onChange={e => setNome(e.target.value)} disabled={!caricato}
            onBlur={salva} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
        </div>
        <div>
          <span className="prefs-etichetta">{t('Ruolo')}</span>
          <input className="prefs-campo" value={ruolo} onChange={e => setRuolo(e.target.value)} disabled={!caricato}
            onBlur={salva} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
            placeholder={t('titolare, responsabile vendite, …')} />
        </div>
      </div>
      <div className="prefs-piede"><div className="prefs-stato" /><Tic mostra={fatto} /></div>
      {guaio && <div className="prefs-stato rame">{guaio}</div>}
    </Scheda>
  )
}

/**
 * «Dammi tutto quello che avete su di me».
 *
 * Si legge, si stampa, si manda a un consulente. La password si chiede lo
 * stesso: dentro non ci sono chiavi, ma c'è tutta la posta letta.
 */
function Fascicolo() {
  const [password, setPassword] = useState('')
  const [chiedo, setChiedo] = useState(false)
  const [faccio, setFaccio] = useState(false)
  const [detto, setDetto] = useState('')
  const [guaio, setGuaio] = useState('')

  const scarica = async () => {
    if (!password) { setChiedo(true); return }
    setFaccio(true); setDetto(''); setGuaio('')
    try {
      const { nome, dati } = await api.scaricaDati(password)
      setPassword(''); setChiedo(false)
      const url = URL.createObjectURL(dati)
      const a = document.createElement('a')
      a.href = url; a.download = nome; a.click()
      URL.revokeObjectURL(url)
      setDetto(t('Scaricato: è nella cartella dei download.'))
    } catch (e) { setGuaio(e instanceof Error ? t(e.message) : String(e)) }
    setFaccio(false)
  }

  return (
    <Scheda titolo={t('Scarica i miei dati')}>
      {/* una riga sola, e dice una cosa che non si può dedurre dal bottone */}
      <div className="prefs-stato">{t('Senza password né token.')}</div>
      {chiedo && (
        <input type="password" className="prefs-campo" value={password} onChange={e => setPassword(e.target.value)}
          autoComplete="current-password" placeholder={t('la tua password')} autoFocus
          aria-label={t('la tua password')}
          onKeyDown={e => { if (e.key === 'Enter' && password) scarica() }} />
      )}
      <div className="prefs-piede">
        <div className="prefs-stato" />
        <button type="button" className="prefs-pieno" onClick={scarica} disabled={faccio}>
          {faccio ? t('Preparo…') : chiedo ? t('Conferma') : t('Scarica')}
        </button>
      </div>
      {detto && <div className="prefs-stato verde">{detto}</div>}
      {guaio && <div className="prefs-stato rame">{guaio}</div>}
    </Scheda>
  )
}

/**
 * Andarsene.
 *
 * Due cose insieme, e non è una cerimonia: la password dice che è lei, e il
 * proprio indirizzo ricopiato a mano la obbliga a fermarsi un secondo davanti a
 * un gesto che non ha un annulla. Un bottone rosso con «sei sicuro?» si preme
 * per riflesso; ricopiare il proprio indirizzo no.
 *
 * E sopra ai due campi c'è scritto **cosa sparisce**, per esteso: quella riga
 * non è una spiegazione del bottone, è la conseguenza di premerlo.
 */
function Cancella() {
  const [aperto, setAperto] = useState(false)
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [faccio, setFaccio] = useState(false)
  const [guaio, setGuaio] = useState('')

  const cancella = async () => {
    setFaccio(true); setGuaio('')
    try {
      await api.cancellaConto(password, email)
      sessione.pulisci()
      location.reload()
    } catch (e) { setGuaio(e instanceof Error ? t(e.message) : String(e)); setFaccio(false) }
  }

  const puo = !!password && !!email.trim() && !faccio

  return (
    <Scheda titolo={t('Cancella il conto')} quieta larga={aperto}>
      <div className="prefs-stato">{t('Sparisce tutto: documenti, lista, chat, memoria, automazioni e fonti. Non si torna indietro.')}</div>
      {!aperto ? (
        <div className="prefs-piede">
          <div className="prefs-stato" />
          <button type="button" className="prefs-secondario prefs-rosso" onClick={() => setAperto(true)}>
            {t('Voglio cancellare il conto')}
          </button>
        </div>
      ) : (
        <>
          <div className="prefs-coppia">
            <div>
              <span className="prefs-etichetta">{t('La tua password')}</span>
              <input type="password" className="prefs-campo" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
            <div>
              <span className="prefs-etichetta">{t('Il tuo indirizzo, per conferma')}</span>
              <input type="email" className="prefs-campo" value={email} onChange={e => setEmail(e.target.value)} autoComplete="off"
                placeholder={t('tu@tuodominio.it')} />
            </div>
          </div>
          <div className="prefs-piede">
            <button type="button" className="prefs-quieto" onClick={() => { setAperto(false); setPassword(''); setEmail(''); setGuaio('') }}>
              {t('Lascia stare')}
            </button>
            <div style={{ flex: 1 }} />
            <button type="button" className="prefs-pieno" onClick={cancella} disabled={!puo}
              style={puo ? { background: 'var(--rame-forte)' } : undefined}>
              {faccio ? t('Un momento…') : t('Cancella tutto, per sempre')}
            </button>
          </div>
        </>
      )}
      {guaio && <div className="prefs-stato rame">{guaio}</div>}
    </Scheda>
  )
}

/** «Ollama · qwen3.5:9b»: il nome che gli ha dato lei, e il modello che lavora davvero. */
function chiEComeSiChiama(f: NonNullable<Vals['compatibile']>): string {
  return [f.nome, f.modello].filter(Boolean).join(' · ')
}

/**
 * Con chi ragiona Myynd: una scelta sola, con tre strade.
 *
 * Anthropic, OpenAI, o un modello sul proprio computer (e chiunque parli la
 * lingua di OpenAI). Le prime due sono le due schede delle Fonti: ognuna si
 * collega con l'account che uno paga già o con una chiave a consumo, e
 * *come* è collegata lo dice la riga sotto il nome. Qui si sceglie solo chi
 * lavora; per collegare o cambiare strada c'è il bottone, che apre la scheda.
 *
 * Siccome Myynd è stato messo a punto su Claude, scegliere un altro si può,
 * ma con una riga che lo dice — non più un riquadro d'avviso di quattro righe
 * sotto la scelta.
 */
function Motore({ v, avvisa }: { v: Vals; avvisa: (testo: string) => void }) {
  type Via = 'claude' | 'openai' | 'compatibile'
  const [s, setS] = useState<ClaudeCon | null>(null)
  const [chatgpt, setChatgpt] = useState<ChatGPT | null>(null)
  const [occupato, setOccupato] = useState(false)
  const guarda = useCallback(() => { api.claude().then(setS).catch(() => setS(null)) }, [])
  // e si rilegge quando cambia quello che è collegato: la scheda si apre
  // sopra questa schermata, e chiudendola la riga deve dire «pronto» senza
  // che uno esca e rientri
  useEffect(() => { guarda() }, [guarda, v.claudeOn, v.compatibile, v.motore])
  useEffect(() => {
    const controller = new AbortController()
    api.chatgpt(controller.signal).then(r => { if (!controller.signal.aborted) setChatgpt(r) })
      .catch(() => { if (!controller.signal.aborted) setChatgpt(null) })
    return () => controller.abort()
  }, [v.motore, v.claudeOn, v.openai])

  const f = v.compatibile
  const o = v.openai

  /*
   * Il modello di casa, provato davvero, all'apertura della scheda.
   *
   * Un modello sul proprio computer è una cosa che si spegne: si chiude
   * Ollama, si riavvia il portatile, e la riga continua a dire «In uso»
   * mentre la chat non risponde più. Si prova, e si dice in quanto ha
   * risposto. Solo in casa: la rotta che prova riscrive la configurazione con
   * quello che le si manda, e la chiave di un fornitore in rete qui non ce
   * l'abbiamo.
   */
  const inCasa = !!f && /^https?:\/\/(127\.|localhost|\[?::1\]?|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(f.url)
  const [velocita, setVelocita] = useState<{ ok: boolean; ms: number } | null>(null)
  const [provando, setProvando] = useState(false)
  useEffect(() => {
    if (v.motore !== 'compatibile' || !f || !inCasa) { setVelocita(null); return }
    let ancora = true
    setProvando(true)
    api.provaMotore({ url: f.url, modello: f.modello, ...(f.nome ? { nome: f.nome } : {}) })
      .then(r => { if (ancora) setVelocita({ ok: r.ok, ms: r.ms }) })
      .finally(() => { if (ancora) setProvando(false) })
    return () => { ancora = false }
  }, [v.motore, f?.url, f?.modello, f?.nome, inCasa])

  /** Sopra i dieci secondi non è un dettaglio: è la chat che sembra rotta. */
  const LENTO = 10_000

  const attuale: Via = v.motore === 'chatgpt' || v.motore === 'openai' ? 'openai' : v.motore === 'compatibile' ? 'compatibile' : 'claude'
  // Claude è collegato con la chiave, o con l'account scelto e in cui si è entrati
  const conAccountClaude = !!s?.abbonamentoPossibile && s.con === 'abbonamento' && s.abbonamento.entrato
  const claudeCollegato = !!s && (s.chiave.collegata || conAccountClaude)
  const accountChatGPT = !!chatgpt?.entrato
  const openaiCollegato = accountChatGPT || !!o?.collegato
  const accountChatGPTInUso = v.motore === 'chatgpt' && !!chatgpt?.acceso

  /** Da quale strada passa, detto in una riga. Vuoto = niente da dire. */
  const dettaglio = (via: Via): string | undefined => {
    if (via === 'claude') {
      if (!claudeCollegato) return undefined
      return conAccountClaude && (s?.con === 'abbonamento') ? t('Con il tuo account, tramite Claude Code') : t('Con la chiave API')
    }
    if (via === 'openai') {
      if (accountChatGPTInUso || (accountChatGPT && v.motore !== 'openai')) {
        return [t('ChatGPT, con il tuo account'), chatgpt?.email, nomePianoChatGPT(chatgpt?.piano)].filter(Boolean).join(' · ')
      }
      return o?.collegato ? [t('Con la chiave API'), o.modello].join(' · ') : undefined
    }
    if (!f) return undefined
    // l'indirizzo può essere lungo: si spezza, non sfora. E davanti, quando
    // si è potuto misurare, quello che conta di più: risponde, e in quanto
    return [
      provando ? t('Provo…')
        : velocita ? (velocita.ok
          ? frasi.motoreRisponde(chiEComeSiChiama(f), (velocita.ms / 1000).toFixed(1))
          : frasi.motoreGiu(chiEComeSiChiama(f)))
        : chiEComeSiChiama(f),
      f.url
    ].filter(Boolean).join(' · ')
  }

  /** Cosa manca a questa strada per poter lavorare adesso. Vuoto = niente. */
  const manca = (via: Via): string => {
    if (via === 'claude') return claudeCollegato || !s ? '' : t('Non ancora collegato.')
    if (via === 'openai') return openaiCollegato || !chatgpt ? '' : t('Non ancora collegato.')
    return f ? '' : t('Non ancora collegato.')
  }

  const scegli = async (via: Via) => {
    if (occupato) return
    // finché non si sa cosa c'è, un clic non deve aprire schede a caso
    if (via === 'claude' && !s) return
    // premere di nuovo la riga scelta serve solo a svegliare l'account dopo un
    // guasto: il server azzera il riposo e riprova alla richiesta successiva
    if (via === attuale) {
      if (via === 'claude' && s?.con === 'abbonamento' && s.abbonamento.inRiposo) {
        setOccupato(true)
        try { await api.claudeCon('abbonamento') } catch (e) { avvisa(e instanceof Error ? t(e.message) : t('Non sono riuscito a cambiare.')) }
        finally { setOccupato(false); guarda() }
      }
      return
    }
    // non collegata: si apre la scheda, e collegarla la sceglie
    if (via === 'compatibile') { void v.scegliMotore('compatibile'); return }
    if (via === 'claude' && !claudeCollegato) { v.apriConnessioni('claude'); return }
    if (via === 'openai' && !openaiCollegato) { v.apriConnessioni('openai'); return }
    setOccupato(true)
    try {
      if (via === 'claude') await v.scegliMotore('claude')
      // l'account prima della chiave: è quello che non manda una bolletta
      else if (accountChatGPT) { await api.usaChatGPT(true); await v.ricaricaStato() }
      else await v.scegliMotore('openai')
    } catch (e) { avvisa(e instanceof Error ? t(e.message) : t('Non sono riuscito a cambiare motore.')) }
    finally { setOccupato(false); guarda(); v.ricaricaStato() }
  }

  const vie: { id: Via; titolo: string; collegato: boolean; apri: () => void }[] = [
    { id: 'claude', titolo: 'Anthropic', collegato: claudeCollegato, apri: () => v.apriConnessioni('claude') },
    { id: 'openai', titolo: 'OpenAI', collegato: openaiCollegato, apri: () => v.apriConnessioni('openai') },
    { id: 'compatibile', titolo: t('Un modello sul tuo computer, o un altro fornitore'), collegato: !!f, apri: () => v.apriConnessioni('compatibile') }
  ]

  return (
    <Scheda titolo={t('Con quale motore lavora')} larga>
      <div role="radiogroup" aria-label={t('Con quale motore lavora')} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {vie.map(x => {
          const scelto = attuale === x.id
          const guaio = manca(x.id)
          const riga = dettaglio(x.id)
          const spento = x.id === 'openai' && scelto && v.motore === 'chatgpt' && chatgpt && !chatgpt.acceso
          return (
            // dentro c'è il bottone «Gestisci»: la riga tiene il ruolo, non il tag
            <div key={x.id} className="prefs-via" role="radio" aria-checked={scelto} tabIndex={0}
              onClick={() => scegli(x.id)} onKeyDown={daTastiera(() => scegli(x.id))}>
              <span className="prefs-bollo" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="prefs-via-cima">
                  <span>{x.titolo}</span>
                  <span className={`prefs-status ${guaio || spento ? 'needs-attention' : 'ready'}`}>
                    {spento ? t('Disattivato in Myynd') : guaio ? t('Da collegare') : scelto ? t('In uso') : t('Pronto')}
                  </span>
                  <Hov as="button" type="button" className="prefs-secondario"
                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); x.apri() }}
                    style={{ padding: '5px 12px', fontSize: '12px' }}
                    hover={{ borderColor: 'var(--rame)', color: 'var(--rame-testo)' }}>
                    {x.collegato ? t('Gestisci') : t('Collega')}
                  </Hov>
                </div>
                {/* da quale strada passa, o cosa manca: sotto il nome, in una riga */}
                {(riga || guaio) && (
                  <div className={`prefs-stato${guaio ? ' rame' : ''}`} style={{ marginTop: 5 }}>{riga ?? guaio}</div>
                )}
                {scelto && x.id === 'claude' && s?.con === 'abbonamento' && s.abbonamento.inRiposo && (
                  <div className="prefs-stato rame" style={{ marginTop: 5 }}>
                    {t('L’ultima volta non ha risposto: per qualche minuto uso la chiave.')}{' '}
                    <span style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>{t('Riprova adesso')}</span>
                  </div>
                )}
                {/*
                  Un modello che ci mette più di dieci secondi a cominciare non
                  è «un po' lento»: è la chat che sembra rotta, ed è la cosa che
                  lui ha raccontato per prima. Dirlo qui, con la via d'uscita.
                */}
                {scelto && x.id === 'compatibile' && velocita?.ok && velocita.ms > LENTO && (
                  <div className="prefs-stato rame" style={{ marginTop: 5 }}>
                    {t('Questo modello è lento sul tuo computer: prova uno più piccolo.')}
                  </div>
                )}
                {scelto && x.id !== 'claude' && (
                  <div className="prefs-stato rame" style={{ marginTop: 5 }}>
                    {t('Messo a punto su Claude: con un altro modello rileggi le bozze e le fonti citate.')}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Scheda>
  )
}

/** La pastiglia di un modello: scelta, di rame; altrimenti solo il bordo. */
function pastigliaModello(scelta: boolean): React.CSSProperties {
  return scelta
    ? { padding: '7px 14px', borderRadius: 99, border: '1px solid rgba(var(--luce-rgb),.5)', background: 'var(--gradiente-rame)', color: 'var(--avorio)', fontFamily: 'inherit', fontSize: '12.5px', fontWeight: 500, cursor: 'pointer' }
    : { padding: '7px 14px', borderRadius: 99, border: '1px solid rgba(var(--inchiostro-rgb),.2)', background: 'rgba(var(--luce-rgb),.5)', color: 'var(--inchiostro)', fontFamily: 'inherit', fontSize: '12.5px', cursor: 'pointer' }
}

/**
 * Quale modello di Claude, per quale lavoro.
 *
 * Il lavoro non è uno: dare un titolo a una chat e scrivere una bozza che esce
 * dall'azienda non valgono la stessa spesa, e chi paga deve poterlo dire senza
 * conoscere la tabella dei lavori. Tre righe, una per livello, e su ognuna i
 * tre modelli come pastiglie.
 */
function Modelli({ v }: { v: Vals }) {
  return (
    <Scheda titolo={t('Quale modello, per quale lavoro')} larga>
      <div>
        {v.livelli.map(l => (
          <div key={l.id} className="prefs-livello">
            <div>
              <div className="prefs-nome">{l.titolo}</div>
              <div className="prefs-stato">{l.nota}</div>
            </div>
            <div role="radiogroup" aria-label={l.titolo} className="prefs-pastiglie">
              {v.modelli.map(m => (
                <button key={m.id} type="button" role="radio" aria-checked={l.scelto === m.id} title={m.nota}
                  onClick={() => { if (l.scelto !== m.id) l.scegli(m.id) }} style={pastigliaModello(l.scelto === m.id)}>{m.nome}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Scheda>
  )
}

/**
 * Quale modello di OpenAI, per quale lavoro.
 *
 * La stessa scheda di Claude, con una differenza che decide la forma: i modelli
 * non sono tre nostri, sono quelli del catalogo — dell'API con la chiave, del
 * piano con l'account — e possono essere venti. Quindi un menù per riga, non
 * le pastiglie.
 */
function ModelliOpenAI({ v }: { v: Vals }) {
  const [via, setVia] = useState<'chiave' | 'account' | null>(null)
  const [catalogo, setCatalogo] = useState<string[]>([])
  const [scelti, setScelti] = useState<Record<'casa' | 'media' | 'frontiera', string> | null>(null)
  const [guaio, setGuaio] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    api.modelliMotoreOpenAI(controller.signal)
      .then(r => { if (!controller.signal.aborted) { setVia(r.via); setCatalogo(r.modelli); setScelti(r.scelti) } })
      .catch(e => { if (!controller.signal.aborted) setGuaio(e instanceof Error ? t(e.message) : t('Non riesco a leggere i modelli.')) })
    return () => controller.abort()
  }, [v.motore, v.openai])
  if (!via || !scelti) return null

  const scegli = (livello: 'casa' | 'media' | 'frontiera', modello: string) => {
    const nuovi = { ...scelti, [livello]: modello }
    setScelti(nuovi)
    api.scegliModelliOpenAI(nuovi).catch(() => { v.mostraToast(t('Non sono riuscito a salvare la preferenza.')); v.ricaricaStato() })
  }
  // il modello scelto resta in lista anche se il catalogo non è arrivato: un
  // menù che non mostra quello che c'è scritto sembra rotto
  const opzioni = (attuale: string) => [...new Set([...(attuale && !catalogo.includes(attuale) ? [attuale] : []), ...catalogo])]

  return (
    <Scheda titolo={t('Quale modello, per quale lavoro')} larga>
      {guaio && <div className="prefs-stato rame">{guaio}</div>}
      <div>
        {v.livelli.map(l => (
          <div key={l.id} className="prefs-livello">
            <div>
              <div className="prefs-nome">{l.titolo}</div>
              <div className="prefs-stato">{l.nota}</div>
            </div>
            <select aria-label={l.titolo} value={scelti[l.id]} onChange={e => scegli(l.id, e.target.value)}
              className="prefs-campo" style={{ width: 'auto', minWidth: 200, maxWidth: '100%', padding: '8px 12px', fontSize: '13px' }}>
              {via === 'account' && <option value="">{t('Il modello del piano')}</option>}
              {opzioni(scelti[l.id]).map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        ))}
      </div>
    </Scheda>
  )
}

export function Preferenze({ v }: { v: Vals }) {
  type Sezione = 'myynd' | 'intelligenza' | 'dati' | 'account'
  const [sezione, setSezione] = useState<Sezione>('myynd')
  const sezioni: { id: Sezione; titolo: string; nota: string }[] = [
    { id: 'myynd', titolo: 'Myynd', nota: t('Priorità, autonomia e voce') },
    { id: 'intelligenza', titolo: t('Intelligenza e costi'), nota: t('Modello, chiave e utilizzo') },
    { id: 'dati', titolo: t('Dati e fonti'), nota: t('Fonti, memoria e trasferimento') },
    { id: 'account', titolo: t('Account e app'), nota: t('Accesso, notifiche e sicurezza') }
  ]
  const attuale = sezioni.find(s => s.id === sezione)!

  return (
    <main className="prefs-page">
      <header className="prefs-header">
        <h1>{t('Preferenze')}</h1>
      </header>

      <div className="prefs-layout">
        <nav className="prefs-nav" aria-label={t('Sezioni delle preferenze')}>
          {sezioni.map(s => (
            <button key={s.id} type="button" aria-current={sezione === s.id ? 'page' : undefined}
              onClick={() => setSezione(s.id)}>
              <span>{s.titolo}</span>
              <small>{s.nota}</small>
            </button>
          ))}
        </nav>

        <section className="prefs-panel" aria-labelledby={`prefs-${sezione}`}>
          <div className="prefs-panel-heading">
            <h2 id={`prefs-${sezione}`}>{attuale.titolo}</h2>
            <p>{attuale.nota}</p>
          </div>

          {sezione === 'myynd' && (
            <div className="prefs-grid">
              {/*
                Il fuoco sta qui e non più come pastiglia sopra al feed: è una
                preferenza a tutti gli effetti, e vale per tutte le letture che
                verranno, non per quella che stai guardando.
              */}
              <CampoFuoco v={v} />
              {/* Subito dopo il fuoco perché sono la stessa domanda fatta due
                  volte — dove guardo dentro, cosa cerco fuori. */}
              <CampoArgomenti v={v} />

              <Scheda titolo={t('Autonomia')} larga>
                <div role="radiogroup" aria-label={t('Autonomia')} className="prefs-pastiglie">
                  {v.autonomie.map(a => (
                    <button key={a.id} type="button" role="radio" aria-checked={a.scelto} onClick={a.onClick}
                      style={pastiglia(a.scelto)}>{a.titolo}</button>
                  ))}
                </div>
                {/* una riga sola: quella della scelta fatta, non tutte e tre */}
                <div className="prefs-stato">{v.autonomie.find(a => a.scelto)?.nota}</div>
              </Scheda>

              <Scheda titolo={t('Tono')}>
                <div className="prefs-pastiglie">
                  {v.toni.map(tono => (
                    <button key={tono.id} type="button" onClick={tono.onClick} style={tono.style}>{tono.label}</button>
                  ))}
                </div>
                <div className="prefs-stato" style={{ padding: '11px 13px', borderRadius: 14, background: 'rgba(var(--inchiostro-rgb),.05)', color: 'rgba(var(--inchiostro-rgb),.72)' }}>
                  {v.tonoEsempio}
                </div>
              </Scheda>

              <Scheda titolo={t('Lingua')}>
                <div className="prefs-pastiglie">
                  {v.lingue.map(l => (
                    <button key={l.id} type="button" onClick={l.onClick} disabled={l.occupato} style={pastiglia(l.scelto)}>
                      {l.occupato && !l.scelto ? t('Traduco…') : l.nome}
                    </button>
                  ))}
                </div>
              </Scheda>

              {/* L'ora del giorno, accanto alla lingua: sono le due cose che
                  cambiano come l'app ti parla e come ti guarda. */}
              <Scheda titolo={t('Aspetto')}>
                <div role="radiogroup" aria-label={t('Aspetto')} className="prefs-pastiglie">
                  {v.temi.map(x => (
                    <button key={x.id} type="button" role="radio" aria-checked={x.scelto} onClick={x.onClick}
                      style={pastiglia(x.scelto)}>{x.label}</button>
                  ))}
                </div>
              </Scheda>

              <Identita />
            </div>
          )}

          {sezione === 'intelligenza' && (
            <div className="prefs-grid">
              {/* Chi ragiona: Anthropic, OpenAI, o un modello in casa. */}
              <Motore v={v} avvisa={v.mostraToast} />
              {/* I modelli, uno per livello di lavoro: quelli di chi lavora. */}
              {v.motore === 'claude' && <Modelli v={v} />}
              {(v.motore === 'openai' || v.motore === 'chatgpt') && <ModelliOpenAI v={v} />}
              <Uso />
            </div>
          )}

          {sezione === 'dati' && (
            <div className="prefs-grid">
              <Scheda titolo={t('Le tue fonti')}>
                <div className="prefs-piede">
                  <div className="prefs-stato" />
                  <button type="button" className="prefs-secondario" onClick={() => v.apriConnessioni()}>
                    {t('Gestisci')} <IconAvanti />
                  </button>
                </div>
              </Scheda>
              <DoveStanno v={v} />
              <Fascicolo />
            </div>
          )}

          {sezione === 'account' && (
            <div className="prefs-grid">
              <Conto />
              {/* solo dentro l'app da scrivania: nel browser la scheda non si disegna */}
              <LApp />
              {/* ultima di tutte, e non per pudore: è l'unica cosa in questa
                  schermata che non si può annullare, e non deve stare accanto a
                  niente che si preme di fretta */}
              <Cancella />
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
