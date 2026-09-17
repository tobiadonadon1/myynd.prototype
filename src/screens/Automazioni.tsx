import { SenderRules } from '../components/SenderRules'
import { useCallback, useEffect, useState } from 'react'
import { api, type Attrezzo, type Automazione, type Raccolta, type SuggerimentoAutomazione } from '../api'
import { loc, t } from '../lingua'
import { Editor, Nuova } from '../automazioni/Editor'
import { quandoGira } from '../automazioni/Scheda'
import { Cestino } from '../ui'
import { IconPiu, IconAvanti } from '../icons'
import { ConnectorIcon, connectorPerAttrezzo } from '../components/ConnectorIcon'
import type { Vals } from '../vals'
import '../automazioni/automazioni.css'

/*
  Quante automazioni servono prima che la pagina tiri fuori gli attrezzi.

  Con una sola automazione questa schermata mostrava quattro filtri, una
  casella di ricerca, un bottone «Nuova cartella», un titolo di gruppo con il
  suo conto e un secondo conto accanto al titolo della sezione: sei comandi per
  governare una riga. Sono comandi che servono — a undici automazioni servono
  parecchio — ma prima che ci sia qualcosa da filtrare non governano niente:
  sono solo le istruzioni per un problema che chi legge non ha ancora.

  Otto è la soglia perché sotto le otto stanno in tre righe di griglia e si
  trovano guardando; sopra comincia a servire lo scorrimento, e allora cercare
  e filtrare diventa più veloce che guardare.
*/
const SOGLIA = 8

export function Automazioni({ v }: { v: Vals }) {
  const [iniziativa, setIniziativa] = useState<Awaited<ReturnType<typeof api.iniziativa>> | null>(null)
  const [iniziativaEsito, setIniziativaEsito] = useState('')
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
  const [menu, setMenu] = useState(false)
  const [carico, setCarico] = useState(true)
  const [cercoSuggerimenti, setCercoSuggerimenti] = useState(true)
  const [errore, setErrore] = useState('')
  const [occupato, setOccupato] = useState('')
  const [scoperteErrore, setScoperteErrore] = useState('')
  const connessioni = v.connAttivi.map(c => c.id).sort().join(',')
  const segnaVisti = v.segnaSuggerimentiVisti
  /*
    Le proposte si caricano per conto loro.

    Stavano nello stesso `Promise.allSettled` delle automazioni, e la pagina
    aspettava la più lenta: quando il foglio delle proposte era vecchio, il
    modello le riscriveva, e per quei secondi la pagina restava vuota; poi
    comparivano tutte insieme, senza che si capisse perché. Adesso le
    automazioni arrivano subito e le proposte quando ci sono, e nel mezzo una
    riga dice cosa si sta guardando. Appena sono sotto gli occhi si segnano
    viste: è quello che spegne il fulmine in colonna.
  */
  const caricaSuggerimenti = useCallback(async (rifai = false) => {
    setCercoSuggerimenti(true); setScoperteErrore('')
    try {
      setSuggerimenti((await api.suggerimentiAutomazioni(rifai)).suggerimenti)
      segnaVisti().catch(() => {})
    } catch (e) { setScoperteErrore(e instanceof Error ? e.message : String(e)) }
    finally { setCercoSuggerimenti(false) }
  }, [segnaVisti])
  const carica = useCallback(async () => {
    setCarico(true); setErrore('')
    void caricaSuggerimenti()
    const risultati = await Promise.allSettled([api.automazioni(), api.attrezzi(), api.raccolte(), api.iniziativa()])
    const [a, c, r, i] = risultati
    if (a.status === 'fulfilled') { setTutte(a.value.automazioni); setRepo(!!a.value.ricette.repo) }
    else setErrore(String(a.reason?.message ?? a.reason))
    if (c.status === 'fulfilled') { setCatalogo(c.value.attrezzi); setCartelle(c.value.cartelle) }
    else setErrore(String(c.reason?.message ?? c.reason))
    if (r.status === 'fulfilled') setRaccolte(r.value.raccolte)
    else setErrore(String(r.reason?.message ?? r.reason))
    if (i.status === 'fulfilled') setIniziativa(i.value)
    else setErrore(String(i.reason?.message ?? i.reason))
    setCarico(false)
  }, [caricaSuggerimenti])
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
  /*
    Sotto la soglia gli attrezzi non ci sono, e quindi non possono nemmeno
    essere rimasti accesi da prima. Chi arriva a nove automazioni, filtra per
    «in pausa» e poi ne butta due si troverebbe con una griglia che nasconde
    metà delle sue cose e nessun comando per dirle di smettere: qui il filtro
    torna a «tutte» insieme alla barra che lo governa.
  */
  const semplice = tutte.length < SOGLIA
  const filtroVero = semplice ? 'tutte' : filtro
  const cercaVera = semplice ? '' : cerca
  const raccoltaVera = semplice ? '' : raccolta
  const viste = tutte.filter(a =>
    (!raccoltaVera || a.raccolta === raccoltaVera) &&
    (filtroVero === 'tutte' || (filtroVero === 'attive' ? a.accesa : filtroVero === 'pausa' ? !a.accesa : ['guaio', 'scollegata', 'muta'].includes(a.salute.stato))) &&
    `${a.nome} ${a.spiega} ${a.attrezzi.map(n => catalogo.find(c => c.nome === n)?.etichetta ?? n).join(' ')}`.toLocaleLowerCase().includes(cercaVera.toLocaleLowerCase()))
  const scelta = tutte.find(a => a.id === aperto)
  /*
    I suggerimenti stanno in griglia, non in un riquadro sopra.
    Erano una sezione a parte con il suo titolo e il suo sfondo, e per due
    proposte si mangiava lo schermo prima ancora che si vedesse un'automazione
    vera. Adesso una proposta è una scheda come le altre — stessa anatomia,
    stessa griglia, in coda alle sue — solo smorzata: si legge che è una cosa
    che *non* sta girando, e si accende con un dito senza cambiare pagina.
  */
  const suggeriti = !cercaVera && !raccoltaVera && (filtroVero === 'tutte' || filtroVero === 'pausa') ? suggerimenti : []
  /*
    Come si taglia la griglia, e quando conviene tagliarla.

    Sopra la soglia il taglio è «pronte» contro «manca una connessione»: è la
    differenza che non si vede dalla scheda e che risponde da sola alla domanda
    «perché questa non fa niente?». Sotto la soglia quel taglio costa due
    titoli e due conti per mostrare due schede, e la domanda non c'è ancora:
    resta solo la griglia, e le cartelle che qualcuno si è fatto — quelle sì,
    perché le ha volute lui — con un titolo leggero e solo se dentro c'è
    qualcosa.
  */
  const gruppi = semplice
    ? [
      { chiave: 'sciolte', titolo: '', classe: 'sciolte', quali: viste.filter(a => !a.raccolta || !raccolte.some(r => r.nome === a.raccolta)), conSuggeriti: true },
      ...raccolte.map(r => ({ chiave: `cartella-${r.nome}`, titolo: r.nome, classe: 'cartella', quali: viste.filter(a => a.raccolta === r.nome), conSuggeriti: false }))
    ]
    : [
      { chiave: 'pronte', titolo: t('Pronte'), classe: 'pronte', quali: viste.filter(a => a.salute.stato !== 'scollegata'), conSuggeriti: true },
      { chiave: 'staccate', titolo: t('Manca una connessione'), classe: 'staccate', quali: viste.filter(a => a.salute.stato === 'scollegata'), conSuggeriti: false }
    ]
  const fonti = (nomi: string[]) => <div className="auto-card-sources">{nomi.slice(0, 4).map(n => {
    const c = catalogo.find(x => x.nome === n)
    const eti = `${c?.etichetta ?? n}${c && !c.collegato ? ` · ${t('Da collegare')}` : ''}`
    return <span key={n} className={c && !c.collegato ? 'missing' : ''} title={eti} aria-label={eti}>
      <ConnectorIcon id={connectorPerAttrezzo(n, c?.serve)} size={18} spenta={!!c && !c.collegato} /></span>
  })}{nomi.length > 4 && <span className="auto-source-more">+{nomi.length - 4}</span>}</div>
  const rinfresca = async () => {
    if (occupato) return
    setOccupato('suggerimenti')
    try { await caricaSuggerimenti(true) } finally { setOccupato('') }
  }
  const schedaSuggerita = (s: SuggerimentoAutomazione) => <article className="auto-card suggestion" key={s.id}>
    <div className="auto-card-top"><span className="auto-status suggested">{t('Suggerita')}</span></div>
    <div className="auto-card-open"><h3>{s.nome}</h3><p>{s.spiega}</p>{fonti(s.attrezzi)}</div>
    <div className="auto-card-footer"><span>{quandoGira({ quando: s.quando } as Automazione)}</span></div>
    <div className="auto-card-actions">
      {/* accendere è il gesto intero: la scrive, la accende, e la scheda resta dov'è */}
      <button className="auto-button" disabled={!!occupato} onClick={() => azione(s.id, async () => {
        const r = await api.adottaAutomazione(s.id)
        setTutte((await api.accendiAutomazione(r.id, true)).automazioni)
        setSuggerimenti(x => x.filter(y => y.id !== s.id))
      })}>{occupato === s.id ? t('Preparo…') : t('Accendi')}</button>
      {/* o la si guarda prima: nasce spenta, e l'interruttore resta suo */}
      <button className="auto-button subtle" disabled={!!occupato} onClick={() => azione(s.id, async () => {
        const r = await api.adottaAutomazione(s.id)
        setTutte(r.automazioni); setAperto(r.id); setSuggerimenti(x => x.filter(y => y.id !== s.id))
      })}>{t('Modifica')}</button>
      <button className="auto-button subtle auto-card-no" disabled={!!occupato} aria-label={`${t('Non ora')}: ${s.nome}`} title={t('Non ora')}
        onClick={() => azione(s.id, async () => {
          await api.ignoraAutomazione(s.id); setSuggerimenti(x => x.filter(y => y.id !== s.id))
        })}>×</button>
    </div>
  </article>
  /*
    Una riga sola in fondo alla scheda.

    Erano due: «ogni giorno alle 08:00» sopra una linea, e «Ultima esecuzione:
    8 set 11:25» sotto, con la sua etichetta. Sono la stessa cosa — il ritmo di
    questa automazione — e separate occupavano due righe per dire una frase.
    Unite dal punto in mezzo si leggono in un colpo, e quando non è mai girata
    la seconda metà semplicemente non c'è invece di lasciare un vuoto.
  */
  const ritmo = (a: Automazione) => {
    const q = quandoGira(a)
    if (!a.ultima) return q
    const data = new Date(a.ultima).toLocaleString(loc(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    return `${q} · ${t('ultima corsa')} ${data}`
  }
  /*
    La pillola e l'interruttore erano due cose che dicevano la stessa cosa, ai
    due capi della stessa riga: un pallino con scritto «Attiva» a sinistra e un
    interruttore verde a destra. Due bersagli per gli occhi, uno solo per il
    dito. Adesso sono un comando solo — l'interruttore, con la sua parola
    accanto — e la parola è anche l'etichetta che gli mancava.
  */
  const scheda = (a: Automazione) => <article className={`auto-card ${['guaio', 'scollegata', 'muta'].includes(a.salute.stato) ? 'attention' : a.accesa ? 'active' : 'paused'}`} key={a.id}>
    <div className="auto-card-top">
      <button className="auto-switch" role="switch" aria-checked={a.accesa} aria-label={`${a.accesa ? t('Mettila in pausa') : t('Accendila')}: ${a.nome}`} disabled={!!occupato}
        onClick={() => azione(a.id, async () => { setTutte((await api.accendiAutomazione(a.id, !a.accesa)).automazioni) })}><span /></button>
      <span className={`auto-switch-word ${a.accesa ? 'on' : ''}`} aria-hidden="true">{a.accesa ? t('Attiva') : t('In pausa')}</span>
    </div>
    <button className="auto-card-open" onClick={() => setAperto(a.id)}><h3>{a.nome}</h3><p>{a.spiega}</p>{fonti(a.attrezzi)}</button>
    <div className="auto-card-footer"><span>{ritmo(a)}</span></div>
    {a.salute.stato !== 'bene' && <div className="auto-health"><span>{a.salute.stato === 'scollegata' ? t('manca una connessione') : a.salute.stato === 'guaio' ? t('l’ultima volta è andata storta') : a.salute.stato === 'ferma' ? t('aspetta che chiudi la sua riga') : t('Da controllare')}</span>{a.salute.stato === 'scollegata' && <button className="auto-button subtle" onClick={() => {
      const mancante = a.attrezzi.map(n => catalogo.find(c => c.nome === n)).find(c => c && !c.collegato)
      v.apriConnessioni(mancante?.serve === 'agenda' ? 'calendario' : mancante?.serve === 'sharepoint' ? 'microsoft' : mancante?.serve ?? '')
    }}>{t('Collega')} <IconAvanti size={11} /></button>}</div>}
  </article>
  return <main className="auto-page">
    {/*
      Un'azione sola ha il colore dell'azione. «Connessioni» era un bottone
      identico a «Crea automazione» meno il rame: due controlli con la stessa
      forma, e quello che porta altrove pesava quanto quello che fa la cosa.
      Adesso è quello che è — un collegamento con il suo conto.
    */}
    <header className="auto-header">
      <h1 id="auto-library-title">{t('Le tue automazioni')}</h1>
      <div className="auto-header-actions">
        <button className="auto-link" onClick={() => v.apriConnessioni()}>{t('Connessioni')}<span className="auto-link-count">{v.connAttivi.length}</span></button>
        <button className="auto-button primary" onClick={() => setAperto('')}><IconPiu size={14} />{t('Crea automazione')}</button>
      </div>
    </header>
    {/*
      Si chiamava «Prepara in anticipo», e non diceva cosa preparasse né in
      anticipo su cosa. Il titolo adesso è la cosa che fa, e la frase sotto
      dice quando, quanto e cosa non fa mai: le tre domande di chi vede un
      interruttore.
    */}
    {iniziativa && <section className="auto-initiative" aria-label={t('Bozze pronte prima che le chieda')}>
      <div><h2>{t('Bozze pronte prima che le chieda')}</h2><p>{t('Quando sul feed arriva una cosa che vuole una risposta o un passo, Myynd la prepara in sottofondo: al massimo due al giorno, e non manda mai niente.')}</p>
      {iniziativa.inPausa && <p>{t('In pausa: la tua autonomia è impostata su chiedere prima.')}</p>}
      <small>{t('Funziona mentre Myynd è aperto e il Mac è sveglio.')}</small></div>
      <div className="auto-initiative-controls"><button className="auto-switch" role="switch" aria-checked={iniziativa.attiva} aria-label={t('Bozze pronte prima che le chieda')} disabled={!!occupato}
        onClick={() => azione('iniziativa', async () => { setIniziativa(await api.impostaIniziativa(!iniziativa.attiva)); setIniziativaEsito('') })}><span /></button>
      <span>{iniziativa.attiva ? t('Attiva') : t('In pausa')}</span>
      {iniziativa.attiva && <button className="auto-button" disabled={!!occupato || iniziativa.inPausa} onClick={() => azione('iniziativa', async () => {
        const r = await api.preparaInAnticipo(); setIniziativa(await api.iniziativa()); setIniziativaEsito(r.compito ? t('Preparo il lavoro da rivedere.') : t('Nessun nuovo lavoro da preparare adesso.'))
      })}>{t('Prepara ora')}</button>}</div>
      {iniziativaEsito && <p role="status">{iniziativaEsito}</p>}
    </section>}
    <SenderRules />
    {errore && <div className="auto-error" role="alert">{t(errore)} <button className="auto-button" onClick={carica}>{t('Riprova')}</button></div>}
    {scoperteErrore && <p role="alert" className="auto-error">{t(scoperteErrore)}</p>}
    <section aria-labelledby="auto-library-title">
      {/*
        Una riga sola, e quello che si usa una volta al mese sta dietro i tre
        punti. I filtri erano quattro piastrelle dentro un contenitore grigio —
        un blocco che pesa come una scheda e non è una scheda; adesso sono
        quattro parole, e quella scelta porta l'unica riga di rame della barra.
      */}
      {!semplice && <div className="auto-toolbar">
        <div className="auto-filtri" role="group" aria-label={t('Filtra automazioni')}>{([
          ['tutte', t('Tutte')], ['attive', t('Attive')], ['pausa', t('In pausa')], ['attenzione', t('Da controllare')]
        ] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={filtro === id} onClick={() => setFiltro(id)}>{label}</button>)}</div>
        <input type="search" value={cerca} onChange={e => setCerca(e.target.value)} placeholder={t('Cerca automazioni…')} aria-label={t('Cerca automazioni…')} />
        <div className="auto-altro" onKeyDown={e => { if (e.key === 'Escape') setMenu(false) }}>
          <button type="button" className="auto-altro-apri" aria-expanded={menu} aria-haspopup="true"
            title={t('Altro')} aria-label={t('Altro')} onClick={() => setMenu(x => !x)}>⋯</button>
          {menu && <>
            {/* fuori dal menù è «no»: un bersaglio invisibile che copre la pagina, come lo aspetta il dito */}
            <button type="button" className="auto-altro-fuori" tabIndex={-1} aria-label={t('Chiudi')} onClick={() => setMenu(false)} />
            <div className="auto-altro-menu">
              {!!raccolte.length && <>
                <button type="button" aria-pressed={!raccolta} onClick={() => { setRaccolta(''); setMenu(false) }}>{t('Tutte le cartelle')}</button>
                {raccolte.map(r => <button key={r.nome} type="button" aria-pressed={raccolta === r.nome} onClick={() => { setRaccolta(r.nome); setMenu(false) }}>{r.nome}</button>)}
                <div className="auto-altro-riga" />
              </>}
              <button type="button" onClick={() => { setRinomino(null); setNomeCartella(''); setMenu(false) }}>{t('Nuova cartella')}</button>
              {!!raccolta && <>
                <button type="button" onClick={() => { setRinomino(raccolta); setNomeCartella(raccolta); setMenu(false) }}>{t('Rinominala')}</button>
                <div className="auto-altro-butta"><span>{t('Butta la cartella')}</span><Cestino titolo={t('Butta la cartella')} fai={() => azione('folder', async () => {
                  const r = await api.buttaRaccolta(raccolta); setRaccolte(r.raccolte); setTutte(r.automazioni); setRaccolta(''); setMenu(false)
                })} /></div>
              </>}
            </div>
          </>}
        </div>
      </div>}
      {nomeCartella !== null && <form className="auto-cartella-form" onSubmit={e => { e.preventDefault(); if (nomeCartella.trim()) void azione('folder', async () => {
        if (rinomino) {
          const r = await api.rinominaRaccolta(rinomino, nomeCartella.trim()); setRaccolte(r.raccolte); setTutte(r.automazioni); setRaccolta(nomeCartella.trim())
        } else setRaccolte((await api.creaRaccolta(nomeCartella.trim())).raccolte)
        setNomeCartella(null); setRinomino(null)
      }) }}><input autoFocus aria-label={t('come si chiama')} value={nomeCartella} onChange={e => setNomeCartella(e.target.value)} /><button className="auto-button" disabled={!!occupato || !nomeCartella.trim()}>{t('Salva')}</button><button className="auto-link" type="button" onClick={() => setNomeCartella(null)}>{t('Chiudi')}</button></form>}
      {gruppi.map((g, i) => (!!g.quali.length || (g.conSuggeriti && !!suggeriti.length)) &&
        <section key={g.chiave} className={`auto-group ${g.classe}`} aria-labelledby={g.titolo ? `auto-gruppo-${i}` : undefined}>
          {!!g.titolo && <h3 className="auto-group-heading" id={`auto-gruppo-${i}`}>{g.titolo}<span>{g.quali.length + (g.conSuggeriti ? suggeriti.length : 0)}</span></h3>}
          {/* in coda alle sue, nella stessa griglia: la riga si allinea da sola */}
          <div className="auto-grid">{g.quali.map(scheda)}{g.conSuggeriti && suggeriti.map(schedaSuggerita)}</div>
          {/*
            Il giro stava in alto accanto al conto delle attive, con la sua
            icona sola: un bottone permanente per una cosa che riguarda le
            schede in fondo, e che quando non c'è nessun suggerimento non
            riguarda niente. Adesso è una riga scritta dopo l'ultima proposta,
            dove serve, e se non ci sono proposte non c'è nemmeno lei.
          */}
          {g.conSuggeriti && !!suggeriti.length && <div className="auto-coda-suggerimenti">
            <button className="auto-link" onClick={rinfresca} disabled={!!occupato || carico}>
              {occupato === 'suggerimenti' ? t('Guardo…') : t('Aggiorna i suggerimenti')}</button>
          </div>}
        </section>)}
      {!carico && !viste.length && !suggeriti.length && <div className="auto-empty">
        <p>{tutte.length ? t('Nessun risultato') : t('Nessuna automazione ancora. Descrivine una, o accendi un suggerimento quando compare.')}</p>
        <button className={`auto-button ${tutte.length ? '' : 'primary'}`} onClick={() => { if (tutte.length) { setFiltro('tutte'); setCerca(''); setRaccolta('') } else setAperto('') }}>{tutte.length ? t('Mostra tutte') : t('Crea automazione')}</button>
      </div>}
      {/*
        Le proposte stanno arrivando: una riga, non un vuoto. Solo quando non
        ce n'è ancora nessuna e nessun filtro le terrebbe fuori comunque.
      */}
      {!carico && cercoSuggerimenti && !suggerimenti.length && !cercaVera && !raccoltaVera && filtroVero === 'tutte' &&
        <p role="status" style={{ fontSize: 13, color: '#64675e', margin: '14px 2px 0' }}>{t('Guardo cosa si ripete nel tuo lavoro…')}</p>}
    </section>
    <footer className="auto-page-footer">
      <span>{v.ospitato ? t('Le automazioni girano nel tuo spazio.') : t('Le automazioni girano mentre Myynd è aperto su questo computer.')}</span>
      {repo && <button className="auto-link" disabled={!!occupato} onClick={() => azione('recipes', async () => { const r = await api.aggiornaRicette(); setTutte(r.automazioni) })}>{t('Cerca automazioni nuove')}</button>}
    </footer>
    {scelta && <Editor key={scelta.id} a={scelta} catalogo={catalogo} cartelle={cartelle} raccolte={raccolte} cambiata={setTutte} chiudi={() => setAperto(null)} spostata={sposta} />}
    {aperto === '' && <Nuova catalogo={catalogo} cartelle={cartelle} chiudi={() => setAperto(null)} fatta={(a, id) => { setTutte(a); setAperto(id) }} />}
  </main>
}
