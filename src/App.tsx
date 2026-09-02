import { useCallback, useEffect, useState } from 'react'
import { frasi, lingua, ricordaLingua, t } from './lingua'
import { Sfondo } from './Sfondo'
import { Cestino, Hov, daTastiera, taglia, useAttiva, useLarghezza } from './ui'
import {
  IconAiuto, IconCerca, IconChat, IconFulmine, IconIngranaggio,
  IconMappa, IconPiu, IconSpina, IconSpunta, IconSuPiccola, IconEsci
} from './icons'
import { Documento, Ricerca, Toast } from './modals'
import { Aiuto } from './screens/Aiuto'
import { Automazioni } from './screens/Automazioni'
import { Chat } from './screens/Chat'
import { Connettori } from './screens/Connettori'
import { Mappa, MappaPiena } from './screens/Mappa'
import { Myynd } from './screens/Myynd'
import { Oggi } from './oggi/Oggi'
import { useCompiti } from './oggi/useCompiti'
import { Preferenze } from './screens/Preferenze'
import { Memoria } from './screens/Memoria'
import { Onboarding } from './onboarding/Onboarding'
import { Stato as Indicatore } from './components/Stato'
import { Connessioni } from './components/Connessioni'
import { Credito } from './components/Credito'
import { Logo, Marchio } from './components/Marchio'
import { useVals, type Vals } from './vals'
import { alloScadere, api, guaio, type Accesso as TipoAccesso, type Guaio, type Stato } from './api'
import { Accesso } from './Accesso'

export default function App() {
  const [accesso, setAccesso] = useState<TipoAccesso | null>(null)
  const [stato, setStato] = useState<Stato | null>(null)
  const [guasto, setGuasto] = useState<Guaio | null>(null)
  const [onboarding, setOnboarding] = useState(false)
  // null = pannello chiuso; '' = aperto su tutto; 'posta' = aperto su quella fonte
  const [connessioni, setConnessioni] = useState<string | null>(null)
  /*
   * Il cartellino del credito, già chiuso.
   *
   * Si tiene *quale* frase è stata chiusa, non un sì o un no: se domani il
   * fornitore dice un'altra cosa — un tetto di spesa invece di un conto vuoto —
   * quella è una notizia nuova e va data. Chiudere l'avviso di ieri non deve
   * zittire quello di domani.
   */
  const [creditoVisto, setCreditoVisto] = useState<string | null>(null)

  /**
   * Il sito ascolta quello che succede nell'app.
   *
   * Sono due finestre sullo stesso cervello, e finora una delle due non sapeva
   * niente dell'altra: aggiungevi una riga in Mind2Do e qui non cambiava
   * niente — nemmeno il conto delle fonti — finché non ricaricavi. Lo stesso
   * filo che tiene vive le deleghe serve anche a questo.
   */
  useEffect(() => {
    if (!accesso?.entrato) return
    let attesa: ReturnType<typeof setTimeout> | undefined
    const chiudi = api.flussoCompiti(e => {
      if (e.fase !== 'cambiato' && e.fase !== 'pronto' && e.fase !== 'chiede') return
      clearTimeout(attesa)
      attesa = setTimeout(() => { api.stato().then(setStato).catch(() => {}) }, 250)
    })
    return () => { clearTimeout(attesa); chiudi() }
  }, [accesso?.entrato])

  /*
   * Chi torna dal consenso di Google o Microsoft, a onboarding già fatto.
   *
   * La pagina del ritorno rimanda a `/?torno=connetti`, e finora quel segno lo
   * leggeva solo l'onboarding: chi collega Gmail dalle connessioni atterrava
   * sulla prima pagina, senza conferma, con il segno appeso all'indirizzo per
   * sempre. Qui si riaprono le connessioni e si pulisce l'indirizzo.
   */
  useEffect(() => {
    if (!accesso?.entrato || onboarding) return
    const q = new URLSearchParams(window.location.search)
    if (q.get('torno') !== 'connetti') return
    q.delete('torno')
    const resto = q.toString()
    window.history.replaceState(null, '', window.location.pathname + (resto ? `?${resto}` : ''))
    setConnessioni('')
  }, [accesso?.entrato, onboarding])

  // se la sessione cade, si torna all'accesso senza schianti
  useEffect(() => {
    alloScadere(() => {
      setStato(null)
      setConnessioni(null)
      setAccesso(a => (a ? { ...a, entrato: false } : a))
    })
  }, [])

  /**
   * Il primo caricamento — e ogni tentativo successivo.
   *
   * Estratto perché la schermata di guasto lo richiama: prima la prova si
   * faceva una volta sola al montaggio, quindi riavviare il server non
   * cambiava niente e l'unica via d'uscita era ricaricare a mano.
   */
  const carica = useCallback(async () => {
    try {
      const a = await api.accesso()
      setAccesso(a)
      if (a.entrato) {
        const s = await api.stato()
        setStato(s)
        setOnboarding(!s.config.onboarding)
      }
      // è andata: se c'era un guasto, non c'è più
      setGuasto(null)
    } catch (e) {
      setGuasto(guaio(e))
    }
  }, [])

  useEffect(() => { carica() }, [carica])

  const dentro = async (conto: { email: string }) => {
    try {
      const s = await api.stato()
      setStato(s)
      setOnboarding(!s.config.onboarding)
      setAccesso(a => ({ ...a, entrato: true, account: conto }))
    } catch (e) {
      // se il primo caricamento fallisce non lascio l'utente sullo splash
      setGuasto(guaio(e))
    }
  }

  const fuori = async () => {
    try { await api.esci() } catch { /* il token è comunque già stato buttato */ }
    setStato(null)
    setOnboarding(false)
    setConnessioni(null)
    setGuasto(null)
    // l'uscita non cancella cosa sappiamo del posto — solo che non ci sei più
    setAccesso(a => ({ ...a, entrato: false, account: null }))
  }

  if (guasto) return <Guasto guasto={guasto} riprova={carica} />
  if (!accesso) return <Attesa />
  if (!accesso.entrato) {
    return (
      <Accesso accesso={accesso} entrato={dentro} />
    )
  }
  if (!stato) return <Attesa />

  if (onboarding) {
    return (
      <Onboarding
        stato={stato}
        fatto={() => { api.stato().then(s => { setStato(s); setOnboarding(false) }) }}
      />
    )
  }

  return (
    <>
      <Casa stato={stato} apriConnessioni={(fonte = '') => setConnessioni(fonte)} esci={fuori} />
      {connessioni !== null && (
        <Connessioni
          fonte={connessioni}
          chiudi={() => setConnessioni(null)}
          cambiato={() => { api.stato().then(setStato).catch(() => {}) }}
        />
      )}
      {/*
        Sopra tutto il resto, perché è l'unica cosa che spiega perché il resto
        non risponde. Sotto le connessioni no: ci si arriva anche da lì.
      */}
      {stato.credito && stato.credito !== creditoVisto && (
        <Credito
          motivo={stato.credito}
          claude={stato.config.motore !== 'compatibile'}
          chiudi={() => setCreditoVisto(stato.credito)}
        />
      )}
    </>
  )
}

function Casa({ stato, apriConnessioni, esci }: {
  stato: Stato; apriConnessioni: (fonte?: string) => void; esci: () => void
}) {
  const v = useVals(stato, apriConnessioni)
  // la lista si vede anche da qui: due facce, un cervello. Il filo che tiene
  // vive le deleghe la aggiorna da solo quando l'app cambia qualcosa.
  const lista = useCompiti(v.mostraToast)

  /**
   * Quanto sta in larghezza.
   *
   * Qui c'era `minWidth: 1180` e basta: sotto quella soglia l'impaginato non
   * si ridisegnava, sbordava — e quello che restava fuori era tagliato via,
   * senza modo di arrivarci. Su un portatile con la finestra a metà schermo
   * mancava un pezzo di applicazione.
   *
   * Adesso la colonna di sinistra si stringe, e sotto gli ottocentoventi
   * pixel perde le parole e resta una fila di icone. Il posto va a quello
   * che si sta guardando, che è la cosa giusta su una finestra piccola.
   */
  const { rail, colonna } = taglia(useLarghezza())

  /** Nel rail l'icona si centra e l'etichetta sparisce: restano i titoli. */
  const nav = (base: React.CSSProperties): React.CSSProperties =>
    rail ? { ...base, justifyContent: 'center', padding: '10px 0', gap: 0 } : base

  return (
    // La radice è fissata alla finestra, non alta 100vh dentro il documento.
    // Con `minWidth` più larga della finestra il documento sbordava, compariva
    // la barra di scorrimento orizzontale, questa cambiava l'altezza utile,
    // 100vh si ricalcolava, il contenuto si rifletteva e la barra spariva —
    // e da capo. A ogni giro il compositore ridisegnava le macchie animate e
    // rifaceva il backdrop-filter della colonna: è quello lo sfarfallio, e si
    // vedeva solo a finestra piccola perché a schermo intero il ciclo non parte.
    <div style={{
      position: 'fixed', inset: 0, overflow: 'hidden',
      background: '#F2E9DC', color: '#22271F',
      fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 14
    }}>
      {/*
        Alto esattamente quanto la finestra, mai di più. Il `minHeight: 820` che
        c'era prima costringeva l'impaginato a essere più alto dello schermo su
        ogni finestra bassa: sotto l'ultima card restava una fascia vuota di
        fondo animato — quella che sembrava un piè di pagina che nessuno aveva
        chiesto. In verticale non si scorre qui: scorrono le due colonne, ognuna
        per conto suo, e il fondo finisce dove finisce lo schermo.
      */}
      <div style={{
        position: 'relative', display: 'flex', width: '100%', height: '100%',
        // 360 e non 1180: sotto si scorre, ma solo davvero in fondo alla
        // scala, non appena la finestra scende sotto un portatile
        minWidth: 360, boxSizing: 'border-box',
        overflowX: 'auto', overflowY: 'hidden'
      }}>
      <Sfondo />

      {/* colonna di sinistra */}
      <div style={{
        position: 'relative', width: colonna, flex: 'none', display: 'flex', flexDirection: 'column',
        // `minHeight: 0` è quello che permette ai figli in overflow di scorrere
        // dentro la colonna invece di allungarla: senza, un elenco chat lungo
        // spingerebbe la colonna oltre lo schermo e riporterebbe la fascia vuota
        minHeight: 0, margin: rail ? '12px 0 12px 12px' : '18px 0 18px 18px',
        padding: rail ? '16px 7px 12px' : '22px 15px 15px',
        borderRadius: rail ? 20 : '26px 22px 24px 20px',
        background: 'linear-gradient(180deg,rgba(255,253,249,.72),rgba(255,253,249,.5))',
        backdropFilter: 'blur(26px) saturate(1.5)', WebkitBackdropFilter: 'blur(26px) saturate(1.5)',
        border: '1px solid rgba(255,255,255,.7)', boxShadow: '0 26px 60px rgba(84,64,44,.13)',
        // un livello di composizione suo: senza, ogni fotogramma delle macchie
        // dietro obbliga a rifare la sfocatura di tutta la colonna
        transform: 'translateZ(0)', backfaceVisibility: 'hidden', contain: 'paint'
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          flexDirection: rail ? 'column' : 'row',
          padding: rail ? '0 0 18px' : '0 4px 24px'
        }}>
          <div style={{ flex: rail ? 'none' : 1 }}>
            {rail ? <Marchio dim={20} animato={false} /> : <Logo dim={20} testo={20} animato={false} />}
          </div>
          <Hov as="button" title={t('Cerca  ⌘K')} onClick={v.openSearch}
            style={{ width: 26, height: 26, display: 'grid', placeItems: 'center', border: 'none', background: 'none', padding: 0, color: 'rgba(34,39,31,.7)', cursor: 'pointer' }}
            hover={{ color: '#C4623B' }}>
            <IconCerca />
          </Hov>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <a href="#" onClick={v.goMyynd} style={nav(v.navMyynd)} title={rail ? 'Myynd' : undefined}>
            <Marchio dim={15} animato={false} colore="currentColor" />
            {!rail && <span style={{ flex: 1 }}>Myynd</span>}
            {!rail && <span style={v.badge}>{v.apertiCount}</span>}
          </a>
          <a href="#" onClick={v.goOggi} style={nav(v.navOggi)} title={rail ? t('Da fare') : undefined}>
            <IconSpunta size={15} style={{ flex: 'none' }} />
            {!rail && <span style={{ flex: 1 }}>{t('Da fare')}</span>}
            {/* l'accento qui vuol dire quello che vuol dire dappertutto:
                qualcosa aspetta una persona */}
            {(lista.pronte > 0 || lista.chiedono > 0) && <span style={{ width: 6, height: 6, borderRadius: '50%', background: v.isOggi ? '#FFF7F0' : '#C4623B' }} />}
            {!rail && lista.pronte === 0 && lista.chiedono === 0 && lista.daFare > 0 && <span style={v.badge}>{lista.daFare}</span>}
          </a>
          <a href="#" onClick={v.goChat} style={nav(v.navChat)} title={rail ? t('Chat') : undefined}>
            <IconChat style={{ flex: 'none' }} />
            {!rail && <span style={{ flex: 1 }}>{t('Chat')}</span>}
          </a>

          {/* l'elenco delle conversazioni non ci sta in una fila di icone:
              nel rail si raggiunge entrando in Chat */}
          {v.isChat && !rail && (
            <div style={{ margin: '2px 0 6px', padding: 5, borderRadius: 14, background: 'rgba(34,39,31,.05)', animation: 'fadein .2s ease' }}>
              <Hov as="button" onClick={v.newChat}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', borderRadius: 11, border: '1px solid rgba(34,39,31,.16)', background: 'rgba(255,255,255,.66)', color: '#8E3F1F', fontSize: '12.5px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
                hover={{ background: '#FFFFFF', borderColor: '#C4623B' }}>
                <IconPiu />{t('Nuova chat')}
              </Hov>
              <div style={{ maxHeight: 116, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1, marginTop: 4 }}>
                {v.threads.map(ch => <RigaChat key={ch.id} ch={ch} />)}
              </div>
            </div>
          )}

          <a href="#" onClick={v.goAuto} style={nav(v.navAuto)} title={rail ? t('Automazioni') : undefined}>
            <IconFulmine style={{ flex: 'none' }} />
            {!rail && <span style={{ flex: 1 }}>{t('Automazioni')}</span>}
          </a>
        </div>

        <div style={{ flex: 1 }} />

        {v.sincronizzando && (
          <div style={{ padding: '0 2px 12px' }}>
            <Indicatore tipo="leggo" testo={v.sincronizzando} stile={{ padding: '8px 12px 8px 9px', fontSize: 12 }} />
          </div>
        )}

        <div style={{ position: 'relative' }}>
          {/* Nel rail la colonna è larga sessanta pixel: un menù largo quanto lei
              sarebbe cinque parole spezzate una lettera per riga. Lì si stacca
              dalla colonna e si allarga verso destra — le voci del menù le parole
              ce le hanno anche quando la navigazione non le ha. */}
          {v.menuOpen && (
            <div style={{ position: 'absolute', left: rail ? 0 : -3, right: rail ? 'auto' : -3, width: rail ? 200 : 'auto', bottom: 54, borderRadius: '18px 16px 18px 14px', background: 'rgba(255,253,249,.92)', backdropFilter: 'blur(30px) saturate(1.5)', WebkitBackdropFilter: 'blur(30px) saturate(1.5)', border: '1px solid rgba(255,255,255,.85)', boxShadow: '0 22px 50px rgba(84,64,44,.22)', padding: 5, zIndex: 5, animation: 'fadein .18s ease' }}>
              <a href="#" onClick={v.goPref} style={v.menuPref}><IconIngranaggio style={{ flex: 'none' }} />{t('Preferenze')}</a>
              <a href="#" onClick={v.goMemoria} style={v.menuMemoria}><IconSpunta size={15} style={{ flex: 'none' }} />{t('Memoria')}</a>
              <a href="#" onClick={v.goMappa} style={v.menuMappa}><IconMappa style={{ flex: 'none' }} />{t('Mappa')}</a>
              <a href="#" onClick={v.goConn} style={v.menuConn}>
                <IconSpina style={{ flex: 'none' }} />
                <span style={{ flex: 1 }}>{t('Connettori')}</span>
                <span style={{ fontSize: 12, opacity: 0.7 }}>{v.connCount}</span>
              </a>
              <a href="#" onClick={v.goAiuto} style={v.menuAiuto}><IconAiuto style={{ flex: 'none' }} />{t('Aiuto')}</a>
              <div style={{ height: 1, background: 'rgba(34,39,31,.1)', margin: '5px 8px' }} />
              <Hov as="a" href="#"
                onClick={(e: React.MouseEvent) => { e.preventDefault(); esci() }}
                style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 11px', borderRadius: 12, fontSize: '13.5px', cursor: 'pointer', color: 'rgba(34,39,31,.7)' }}
                hover={{ color: '#8E3F1F', background: 'rgba(196,98,59,.1)' }}>
                <IconEsci style={{ flex: 'none' }} />{t('Esci')}</Hov>
            </div>
          )}
          {/* un bottone, non un div: dietro ci stanno Preferenze, Memoria, le fonti e
              «Esci», e da tastiera un div non si raggiunge */}
          <Hov as="button" type="button" onClick={v.toggleMenu} aria-haspopup="menu" aria-label={t('Il tuo conto')}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 8px', borderRadius: 14, background: 'rgba(255,255,255,.42)', border: '1px solid rgba(255,255,255,.72)', cursor: 'pointer', width: '100%', fontFamily: 'inherit', fontSize: 'inherit', color: 'inherit', textAlign: 'left' }}
            hover={{ background: 'rgba(255,255,255,.72)' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(140deg,#C4623B,#8FA593)', color: '#FFF7F0', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 500 }}>{v.iniziali}</div>
            {/* il punto sta con il ruolo, non da solo in fondo alla riga: un nome
                lungo mandava a capo dopo il separatore, e restava lì appeso */}
            {!rail && (
              <span style={{ flex: 1, minWidth: 0, fontSize: '13.5px', overflowWrap: 'anywhere' }}>
                {v.nome}{v.ruolo && <span style={{ color: 'rgba(34,39,31,.6)' }}>{' · '}{v.ruolo}</span>}
              </span>
            )}
            {!rail && <span style={v.chevron}><IconSuPiccola /></span>}
          </Hov>
        </div>
      </div>

      {/* colonna centrale */}
      <div style={{
        position: 'relative', flex: 1, minWidth: 0, minHeight: 0,
        display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
        overflowY: 'auto', overscrollBehavior: 'contain',
        padding: rail ? '16px 14px 24px 14px' : '22px 34px 30px 30px'
      }}>
        {v.isMyynd && <Myynd v={v} lista={lista} />}
        {v.isOggi && (
          <Oggi
            l={lista}
            oggi={v.oggi}
            lingua={stato.config.lingua}
            giroFatto={stato.config.giro}
            segnaGiro={() => { api.profilo({ giro: true }).catch(() => { /* lo rifarà: pazienza */ }) }}
            apriGuida={v.goAiuto}
          />
        )}
        {v.isChat && <Chat v={v} />}
        {v.isAuto && <Automazioni v={v} />}
        {v.isMappa && <Mappa v={v} />}
        {v.isPref && <Preferenze v={v} />}
        {v.isMemoria && <Memoria />}
        {v.isConn && <Connettori v={v} />}
        {v.isAiuto && <Aiuto v={v} />}
      </div>

      {v.mapFull && <MappaPiena v={v} />}
      {v.docOpen && <Documento v={v} />}
      {v.toastOn && <Toast v={v} />}
      {v.searchOpen && <Ricerca v={v} />}
      </div>
    </div>
  )
}

/**
 * Una conversazione nell'elenco.
 *
 * La riga si apre con un clic o con Invio; il cestino compare quando la riga è
 * sotto mano — mouse, tastiera o dito — e chiede una volta prima di buttare.
 * Prima buttava al primo clic, e da tastiera non si arrivava né alla riga né
 * al cestino.
 */
function RigaChat({ ch }: { ch: Vals['threads'][number] }) {
  const { attiva, props } = useAttiva()
  return (
    <div role="button" tabIndex={0} aria-current={ch.aperta || undefined}
      onClick={ch.onClick} onKeyDown={daTastiera(ch.onClick)}
      {...props}
      onMouseEnter={() => { props.onMouseEnter(); ch.onEnter() }}
      onMouseLeave={() => { props.onMouseLeave(); ch.onLeave() }}
      style={ch.row}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '12.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ch.titolo}</div>
        <div style={{ fontSize: '10.5px', color: 'rgba(34,39,31,.5)', marginTop: 2 }}>{ch.quando}</div>
      </div>
      <Cestino fai={ch.onDelete} titolo={t('Elimina')} visibile={attiva || ch.sopra} icona={13} />
    </div>
  )
}

function Attesa() {
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: '#191715', color: 'rgba(244,239,232,.6)', fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 15 }}>
      <div style={{ animation: 'puls 1.6s ease-in-out infinite' }}>myynd</div>
    </div>
  )
}

/** Ogni quanto la schermata di guasto ribussa, in secondi. */
/**
 * Quanto si aspetta prima di ribussare, tentativo dopo tentativo.
 *
 * Prima era un numero solo — tre secondi — e si riprovava ogni tre secondi
 * **per sempre**. Su un motore che sta ripartendo va benissimo. Su un
 * indirizzo dove Myynd non c'è e non ci sarà mai, sono venti richieste al
 * minuto fino a quando qualcuno non chiude la scheda: la console si riempie di
 * rosso, il portatile scalda, e il rumore nasconde l'unica riga che spiegava
 * cosa fosse successo.
 *
 * Si allarga, e si ferma. Chi guarda ha comunque il bottone: riprovare è una
 * cosa che si può chiedere, non una cosa che deve succedere da sola per sempre.
 */
const ATTESE = [3, 6, 12, 30, 60]

/**
 * Quando Myynd non risponde.
 *
 * Questa schermata la vede chi usa Myynd, non chi lo scrive, e per tre cose si
 * comportava come se fosse il contrario:
 *
 * — diceva «il server non risponde» e poi «avvialo con npm run dev». È
 *   un'istruzione vera per chi ha il progetto aperto in un terminale e muta per
 *   chiunque altro: chi usa Myynd ha un'app. Adesso quella riga esiste solo nel
 *   build di sviluppo, dove è l'unica cosa utile da dire, e a chi usa l'app si
 *   dice quello che può fare davvero — chiuderla e riaprirla.
 * — mostrava «Errore 500» in rosso. Non è un errore del server: è il numero con
 *   cui il proxy dello sviluppo racconta una porta chiusa. Non dice niente a chi
 *   legge e spaventa. Il dettaglio tecnico resta, ma di là — in sviluppo e nella
 *   console.
 * — riprovava da sola ogni tre secondi e lo diceva a metà: un bottone «Riprova»
 *   accanto a un «riprovo da solo…» che compariva dopo il primo giro. Sembravano
 *   due cose in disaccordo. Adesso il tentativo si vede — c'è il conto alla
 *   rovescia — e il bottone è quello che è sempre stato: il modo di non
 *   aspettarlo.
 */
function Guasto({ guasto, riprova }: { guasto: Guaio; riprova: () => void }) {
  const [tentativi, setTentativi] = useState(0)
  const [fra, setFra] = useState(ATTESE[0])
  /** Cambiare lingua non passa da React: questo lo obbliga a ridisegnare. */
  const [, ridisegna] = useState(0)

  /*
   * Con niente dietro non si riprova affatto.
   *
   * Un 404 sull'API vuol dire che a rispondere è un server che non è Myynd, e
   * quello non diventerà Myynd fra tre secondi. Riprovare qui non è ottimismo,
   * è rumore — e in più tiene addosso a chi guarda un conto alla rovescia che
   * promette una cosa che non succederà.
   */
  const inutile = !!guasto.senzaMotore
  const finiti = tentativi >= ATTESE.length

  useEffect(() => {
    if (inutile || finiti) return
    const t = setInterval(() => setFra(n => Math.max(0, n - 1)), 1000)
    return () => clearInterval(t)
  }, [inutile, finiti])

  // arrivato a zero si ribussa, e la prossima attesa è più lunga. Se il server
  // risponde questa schermata sparisce da sola e l'app riparte da dove doveva.
  useEffect(() => {
    if (inutile || finiti || fra > 0) return
    riprova()
    setTentativi(n => {
      setFra(ATTESE[Math.min(n + 1, ATTESE.length - 1)])
      return n + 1
    })
  }, [fra, riprova, inutile, finiti])

  const adesso = () => { riprova(); setTentativi(0); setFra(ATTESE[0]) }

  /**
   * Le due lingue, proprio qui.
   *
   * È l'unica schermata che si disegna **prima** che il server dica qualcosa,
   * quindi è l'unica in cui la lingua scelta nelle preferenze non si può
   * sapere: si tira a indovinare da quella del browser. Indovinare va bene
   * finché si può correggere, e fin qui non si poteva — chi apriva questo
   * indirizzo con Chrome in italiano leggeva un guasto in italiano e basta,
   * senza nessun posto in cui dire di no.
   */
  const cambiaLingua = (l: string) => { ricordaLingua(l); ridisegna(n => n + 1) }

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: '#191715', color: '#F4EFE8', fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", padding: 40 }}>
      <div style={{ maxWidth: 480, textAlign: 'center' }}>
        <div style={{ fontSize: 26, letterSpacing: '-.02em', textWrap: 'balance' }}>
          {t(inutile ? 'Qui c’è solo l’interfaccia.'
            : guasto.motoreGiu ? 'Myynd non risponde.'
            : 'Myynd non è riuscito ad avviarsi.')}
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.7, color: 'rgba(244,239,232,.6)', marginTop: 16, textWrap: 'pretty' }}>
          {inutile
            ? t('Myynd gira sul computer di chi lo usa: legge la sua posta e i suoi file, e non esce da lì. Questa pagina è solo la finestra, e da sola non ha niente a cui collegarsi.')
            : guasto.motoreGiu
              ? t('Non risponde su questo computer. Sto riprovando da solo: se non torna, chiudi Myynd e riaprilo.')
              : t(guasto.frase)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 22 }}>
          <button onClick={adesso} style={{
            padding: '10px 20px', borderRadius: 99, border: '1px solid rgba(244,239,232,.3)',
            background: 'rgba(244,239,232,.08)', color: '#F4EFE8',
            fontSize: '13.5px', fontFamily: 'inherit', cursor: 'pointer'
          }}>{t('Riprova adesso')}</button>
          {!inutile && (
            <span style={{ fontSize: '12px', color: 'rgba(244,239,232,.35)', minWidth: 96, textAlign: 'left' }}>
              {finiti ? t('smesso di riprovare') : fra > 0 ? frasi.riprovoFra(fra) : t('riprovo…')}
            </span>
          )}
        </div>

        {/* Le due lingue: qui, perché è l'unica schermata in cui il server non
            può dire quale sia quella giusta. */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: 26 }}>
          {(['it', 'en'] as const).map(l => (
            <button key={l} onClick={() => cambiaLingua(l)} style={{
              border: 'none', background: 'none', padding: 0, cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '12px', letterSpacing: '.08em',
              textTransform: 'uppercase',
              color: lingua() === l ? 'rgba(244,239,232,.8)' : 'rgba(244,239,232,.3)'
            }}>{l === 'it' ? 'Italiano' : 'English'}</button>
          ))}
        </div>
        {/* Il numero, il percorso, la frase del browser: a chi sta sistemando
            Myynd servono, a chi lo sta usando no. */}
        {import.meta.env.DEV && (
          <div style={{ fontSize: '12.5px', color: 'rgba(244,239,232,.4)', marginTop: 20, lineHeight: 1.6 }}>
            {frasi.motoreGiuDev(
              <code style={{ background: 'rgba(244,239,232,.1)', padding: '2px 7px', borderRadius: 5 }}>npm run dev</code>
            )}
            <div style={{ marginTop: 6, color: 'rgba(232,144,122,.75)' }}>{guasto.dettaglio}</div>
          </div>
        )}
      </div>
    </div>
  )
}
