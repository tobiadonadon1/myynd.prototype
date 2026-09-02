import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AUTONOMIE, ESEMPIO_TONO, LINGUE, MODELLI, TENUTE, TONI, parole, quando, type Gruppo, type Messaggio, type Screen, type Thread, type VoceFeed } from './data'
import { costruisci, costruisciDaGrafo, type Ball, type Grafo } from './brain'
import { loc, ricordaLingua, t, frasi } from './lingua'
import { api, rigaSincronizzazione, type Connettore, type Stato } from './api'
import { MENU_OFF, MENU_ON, NAV_OFF, NAV_ON, dot, knob, track } from './ui'
import { useMappa } from './useMappa'

type Toast = { text: string; undo: boolean } | null

const COLORE_FONTE: Record<string, string> = {
  posta: '#C4553C', desktop: '#E0A44A', notion: '#5B9BC9', claude: '#7FA98A'
}

/**
 * La palla quando non la si sta guardando.
 *
 * Una costante e non `{ nodes: [], edges: [] }` scritto sul posto: la memo che
 * la restituisce ha `ball` fra le dipendenze di chi la usa, e un oggetto nuovo
 * a ogni giro rifarebbe partire tutto quello che questa riga serve a evitare.
 */
const PALLA_VUOTA: Ball = { nodes: [], edges: [] }

/** Tutto lo stato dell'app, alimentato dal server locale. */
/** Taglia a una lunghezza, ma su uno spazio: mai una parola spezzata a metà. */
export function taglia(t: string, max: number): string {
  if (t.length <= max) return t
  const corto = t.slice(0, max)
  const spazio = corto.lastIndexOf(' ')
  return (spazio > max * 0.6 ? corto.slice(0, spazio) : corto).trimEnd() + '…'
}

export function useVals(iniziale: Stato, apriConnessioni: (fonte?: string) => void) {
  const [stato, setStato] = useState<Stato>(iniziale)
  // Va impostata a ogni giro, prima di qualunque calcolo che produca testo:
  // così cambiare lingua nelle preferenze si vede subito, senza ricaricare.
  // questa viene dal profilo sul server: è una scelta, e si ricorda per le
  // schermate che si disegnano prima che il server risponda
  ricordaLingua(stato.config.lingua)
  // lo stato arriva da fuori quando cambiano i connettori: mi allineo senza
  // rimontare, così schermata, chat aperta e bozza restano dove sono
  useEffect(() => { setStato(iniziale) }, [iniziale])
  const [screen, setScreen] = useState<Screen>('myynd')
  const [menu, setMenu] = useState(false)
  const [search, setSearch] = useState(false)
  const [query, setQuery] = useState('')
  const [risultati, setRisultati] = useState<{ id: string; titolo: string; fonte: string; gruppo: string; quando: string; estratto: string }[]>([])

  const [aperti, setAperti] = useState<VoceFeed[]>([])
  const [fatte, setFatte] = useState<VoceFeed[]>([])
  // Le cose già chiuse sono archivio, non notizie: partono ripiegate. Aperte
  // di default si prendevano tutta la prima pagina proprio nel momento in cui
  // non c'era più niente da fare — l'opposto di quello che serve lì.
  const [doneOpen, setDoneOpen] = useState(false)
  const [openDone, setOpenDone] = useState<string | null>(null)
  const [heroLong, setHeroLong] = useState(false)
  // Quali righe del resto hanno il testo aperto. Un insieme e non un id
  // solo: aprirne una non è scegliere, è leggere — e mentre leggi la
  // seconda non ha senso che la prima ti si richiuda sotto il dito.
  const [restoAperti, setRestoAperti] = useState<Set<string>>(new Set())
  const [risposta, setRisposta] = useState('')
  const [rispondendo, setRispondendo] = useState(false)
  const [scriviAperto, setScriviAperto] = useState(false)
  const [menuAperto, setMenuAperto] = useState(false)
  const [fuoco, setFuoco] = useState('')
  const [fuocoAperto, setFuocoAperto] = useState(false)
  const [domanda, setDomanda] = useState<{ id: string; testo: string; spunto: string[] } | null>(null)
  const [rispostaDom, setRispostaDom] = useState('')
  const [esitoDom, setEsitoDom] = useState('')
  const [spuntoAperto, setSpuntoAperto] = useState(false)
  const [cambioLingua, setCambioLingua] = useState(false)
  const [generando, setGenerando] = useState(false)

  const [gruppi, setGruppi] = useState<Gruppo[]>([])
  const [grafo, setGrafo] = useState<Grafo | null>(null)
  const [sel, setSel] = useState('')
  const [filtro, setFiltro] = useState<string | null>(null)
  const [mapFull, setMapFull] = useState(false)
  const [nodeMsg, setNodeMsg] = useState('')

  const [threads, setThreads] = useState<Thread[]>([])
  const [thread, setThread] = useState<string | null>(null)
  const [hoverThread, setHoverThread] = useState<string | null>(null)
  const [messaggi, setMessaggi] = useState<Messaggio[]>([])
  const [draftMsg, setDraftMsg] = useState('')
  const [pensando, setPensando] = useState(false)

  const [doc, setDoc] = useState<Record<string, string> | null>(null)
  const [toast, setToast] = useState<Toast>(null)
  const [sincronizzando, setSincronizzando] = useState<string | null>(null)

  const threadRef = useRef<HTMLDivElement>(null)
  const cvA = useRef<HTMLCanvasElement>(null)
  const cvB = useRef<HTMLCanvasElement>(null)
  const tt = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const mostraToast = useCallback((text: string, undo?: boolean) => {
    clearTimeout(tt.current)
    setToast({ text, undo: !!undo })
    tt.current = setTimeout(() => setToast(null), 4200)
  }, [])
  useEffect(() => () => clearTimeout(tt.current), [])

  // La tastiera. Un attrezzo che si usa tutti i giorni deve poter essere
  // guidato senza staccare le mani: ⌘K apre la ricerca da qualunque punto,
  // Esc chiude quello che è aperto. Il brief chiede una via rapida verso
  // l'app; questa è la stessa idea, dentro.
  useEffect(() => {
    const tasti = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearch(true)
        return
      }
      // Esc non deve rubare il tasto a chi sta scrivendo in un campo: lì
      // significa «annulla questo», e ci pensa il campo stesso
      const dentroUnCampo = (e.target as HTMLElement | null)?.tagName === 'INPUT'
        || (e.target as HTMLElement | null)?.tagName === 'TEXTAREA'
      if (e.key === 'Escape' && !dentroUnCampo) {
        setSearch(false)
        setDoc(null)
        setMapFull(false)
      }
    }
    window.addEventListener('keydown', tasti)
    return () => window.removeEventListener('keydown', tasti)
  }, [])

  /**
   * La palla si calcola solo quando la si guarda.
   *
   * `costruisciDaGrafo` assesta a molle duecentoquaranta volte su un massimo di
   * duemilaseicento nodi: misurati, sono duecentottanta millisecondi di thread
   * principale bloccato. Girava dentro il render *su ogni schermata*, perché
   * `attivo` in `useMappa` ferma il disegno ma non il calcolo — quindi l'app si
   * inchiodava all'avvio per una schermata che sta dietro a un menù e che il
   * brief mette esplicitamente fra le cose da non fare.
   *
   * Adesso finché la Mappa non è in vista la palla è vuota, e non costa niente.
   */
  const mappaInVista = screen === 'mappa' || mapFull
  const ball = useMemo(
    () => (!mappaInVista ? PALLA_VUOTA
      // Con il materiale vero la palla nasce dai legami fra i documenti. Finché
      // il grafo non è arrivato — o se non è arrivato affatto — non si disegna
      // niente e lo si dice: prima al suo posto compariva la forma costruita
      // sui conteggi, una scenografia che chi guardava prendeva per i propri
      // documenti. Quella resta solo per un grafo arrivato e vuoto.
      : !grafo ? PALLA_VUOTA
      : grafo.nodi.length ? costruisciDaGrafo(grafo)
      : costruisci(gruppi)),
    [mappaInVista, grafo, gruppi]
  )
  const onPick = useCallback((s: string, cluster: string) => { setSel(s); setFiltro(cluster) }, [])
  const mappa = useMappa(cvA, cvB, mappaInVista, mapFull, filtro, sel, onPick, ball, gruppi)

  // — caricamento iniziale —

  /*
   * «Vuoto» e «non sono riuscito a leggerlo» sono due cose diverse, e la prima
   * pagina le mostrava uguali: un server che rispondeva 500 dava «La tua mente è
   * ancora vuota». Qui si tiene il guasto, e si tiene anche se il primo giro è
   * finito — prima della risposta il titolone non deve dire niente di falso.
   */
  const [guastoFeed, setGuastoFeed] = useState<string | null>(null)
  const [feedCaricato, setFeedCaricato] = useState(false)

  const caricaFeed = useCallback(async () => {
    let f: Awaited<ReturnType<typeof api.feed>>
    try {
      f = await api.feed()
      setGuastoFeed(null)
    } catch (e) {
      setGuastoFeed(e instanceof Error ? e.message : String(e))
      throw e
    } finally {
      setFeedCaricato(true)
    }
    setAperti(f.aperti as unknown as VoceFeed[])
    setFatte(f.fatte as unknown as VoceFeed[])
    // solo il valore vero: la bozza del campo NON si tocca da qui. Prima ogni
    // ricaricamento del feed — una lettura, un cambio lingua, qualunque cosa —
    // ripassava di qui e sovrascriveva quello che stavi scrivendo con il valore
    // vecchio del server. Era il fuoco che «tornava indietro da solo».
    api.fuoco().then(r => setFuoco(r.fuoco)).catch(() => {})
    api.domanda().then(r => setDomanda(r.domanda)).catch(() => {})
  }, [])

  /**
   * I conteggi sempre, il grafo solo se serve.
   *
   * Costruirlo lato server vuol dire un indice rovesciato su tutto il materiale:
   * si chiede quando si apre la Mappa, non a ogni avvio dell'app.
   */
  /*
   * Il grafo che non arriva si dice, non si finge. `costruendoMappa` copre il
   * tempo della chiamata; `guastoMappa` resta finché qualcuno non riprova.
   */
  const [guastoMappa, setGuastoMappa] = useState<string | null>(null)
  const [costruendoMappa, setCostruendoMappa] = useState(false)

  const caricaMente = useCallback(async (conGrafo = false) => {
    if (conGrafo) { setCostruendoMappa(true); setGuastoMappa(null) }
    let m: Awaited<ReturnType<typeof api.mente>>
    try {
      m = await api.mente(conGrafo)
    } catch (e) {
      if (conGrafo) setGuastoMappa(e instanceof Error ? t(e.message) : t('Non sono riuscito a costruire la mappa.'))
      throw e
    } finally {
      if (conGrafo) setCostruendoMappa(false)
    }
    setGruppi(m.gruppi)
    // se non l'abbiamo chiesto non si azzera quello che c'era: chi ha la Mappa
    // aperta durante una lettura non deve vederla sparire
    if (m.grafo) setGrafo(m.grafo)
    setSel(s => s || m.gruppi[0]?.id || '')
  }, [])

  /*
   * La chat non deve dire «Cosa vuoi sapere?» prima di sapere se è vuota.
   * Due attese: l'elenco delle conversazioni, e i messaggi di quella aperta.
   */
  const [elencoChatPronto, setElencoChatPronto] = useState(false)
  const [messaggiPronti, setMessaggiPronti] = useState(true)

  const caricaChat = useCallback(async () => {
    try {
      const c = await api.chat()
      setThreads(c)
      setThread(t => t ?? c[0]?.id ?? null)
    } finally {
      setElencoChatPronto(true)
    }
  }, [])

  useEffect(() => {
    caricaFeed().catch(() => {})
    caricaMente().catch(() => {})
    caricaChat().catch(() => {})
  }, [caricaFeed, caricaMente, caricaChat])

  // il grafo arriva quando si apre la Mappa, e una volta sola
  useEffect(() => {
    if (mappaInVista && !grafo) caricaMente(true).catch(() => {})
  }, [mappaInVista, grafo, caricaMente])

  // un contatore di generazione: la risposta di una richiesta vecchia non
  // deve sovrascrivere quella nuova, né cancellare la bolla ottimistica
  const gen = useRef(0)
  /*
   * Il filo che `chiedi` ha appena creato.
   *
   * La prima domanda senza una chat aperta creava il filo e lo apriva; questo
   * effetto, vedendo un thread nuovo, andava a leggerne i messaggi — che non
   * esistono — e nel farlo avanzava `gen`. Da lì la risposta in streaming
   * apparteneva a una generazione vecchia e veniva scartata: la prima domanda
   * di una persona nuova restava senza risposta finché non ricaricava.
   */
  const filoNuovo = useRef<string | null>(null)
  useEffect(() => {
    if (!thread) { setMessaggi([]); setMessaggiPronti(true); return }
    if (filoNuovo.current === thread) { filoNuovo.current = null; setMessaggiPronti(true); return }
    const mio = ++gen.current
    setMessaggiPronti(false)
    api.messaggi(thread)
      .then(m => { if (gen.current === mio) setMessaggi(m) })
      .catch(() => { if (gen.current === mio) setMessaggi([]) })
      .finally(() => { if (gen.current === mio) setMessaggiPronti(true) })
  }, [thread])

  useEffect(() => {
    const el = threadRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    const id = requestAnimationFrame(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight })
    return () => cancelAnimationFrame(id)
  }, [messaggi.length, screen, pensando])

  // aperta la ricerca senza scrivere niente, mostro gli ultimi documenti letti
  const genCerca = useRef(0)
  useEffect(() => {
    if (!search) { setRisultati([]); return }
    const mio = ++genCerca.current
    const t = setTimeout(() => {
      api.cerca(query)
        .then(r => { if (genCerca.current === mio) setRisultati(r) })
        .catch(() => { if (genCerca.current === mio) setRisultati([]) })
    }, query.trim() ? 180 : 0)
    return () => clearTimeout(t)
  }, [query, search])

  const ricaricaStato = useCallback(async () => {
    const s = await api.stato()
    setStato(s)
    return s
  }, [])

  // — azioni —

  const go = (s: Screen) => (e?: { preventDefault?: () => void }) => {
    if (e?.preventDefault) e.preventDefault()
    setScreen(s); setSearch(false); setMenu(false)
  }

  const chiedi = async (testo: string, chatId?: string) => {
    const id = chatId ?? thread ?? `th${Date.now()}`
    // nato adesso: non c'è niente da caricare, e caricare farebbe perdere la risposta
    if (!chatId && !thread) filoNuovo.current = id
    const mio = ++gen.current
    setScreen('chat'); setSearch(false); setMapFull(false); setMenu(false)
    setThread(id)
    const bozza = draftMsg
    setDraftMsg(''); setNodeMsg('')
    const idScritta = `tmp${Date.now()}`
    setMessaggi(m => [...m, { id: idScritta, role: 'u', text: testo }])
    setPensando(true)
    try {
      // La risposta cresce sotto gli occhi invece di comparire tutta insieme:
      // un messaggio finto che si riempie a ogni frammento, sostituito da
      // quello vero — con le fonti — solo alla fine.
      const idVivo = idScritta + 'a'
      let cresciuta = ''
      const r = await api.chiedi(id, testo, delta => {
        if (gen.current !== mio) return
        cresciuta += delta
        setPensando(false)
        setMessaggi(m => {
          const senza = m.filter(x => x.id !== idVivo)
          return [...senza, { id: idVivo, role: 'a', text: cresciuta }]
        })
      })
      if (gen.current === mio) setMessaggi(r.messaggi)
      await caricaChat()
    } catch (e) {
      mostraToast(e instanceof Error ? t(e.message) : t('Non sono riuscito a rispondere.'))
      if (gen.current === mio) {
        setMessaggi(m => m.filter(x => !x.id.startsWith('tmp')))
        setDraftMsg(d => d || bozza)   // il testo scritto non si perde
      }
    }
    if (gen.current === mio) setPensando(false)
  }

  const sincronizza = async (fonte?: string) => {
    setSincronizzando('preparo')
    try {
      await api.sincronizza(m => {
        if (m.fase !== 'fine') setSincronizzando(rigaSincronizzazione(m))
      }, fonte)
      await Promise.all([ricaricaStato(), caricaMente(mappaInVista), caricaFeed()])
      mostraToast(t('Letto tutto quello che è cambiato.'))
    } catch (e) {
      mostraToast(e instanceof Error ? t(e.message) : t('Sincronizzazione fallita.'))
    }
    setSincronizzando(null)
  }

  const genera = async () => {
    setGenerando(true)
    try {
      const r = await api.generaFeed()
      await caricaFeed()
      mostraToast(r.generate ? frasi.coseNuove(r.generate) : t('Non ho trovato niente da segnalare.'))
    } catch (e) {
      mostraToast(e instanceof Error ? t(e.message) : t('La lettura non è riuscita.'))
    }
    setGenerando(false)
  }

  // — valori derivati —

  const hero = aperti[0]
  const cl = gruppi.find(g => g.id === sel) ?? gruppi[0]
  const connettori = stato.connettori
  const connOn = connettori.filter(c => c.pronto && c.collegato)
  // «può ragionare», non «c'è Claude»: con un fornitore compatibile scelto come
  // motore la chat e le domande funzionano uguale, e devono aprirsi
  const claudeOn = !!connettori.find(c => c.id === 'claude')?.collegato || stato.config.motore === 'compatibile'
  const th = threads.find(t => t.id === thread)
  const noop = () => {}


  /**
   * Rispondere alla voce in cima con parole tue. Non aggiorno l'elenco a mano:
   * il server rimanda quello vero, perché è lui che decide se «l'ho già
   * mandato» chiude la voce o la lascia aperta.
   */
  /**
   * Da una voce del feed a una riga della lista.
   *
   * È il ponte fra le due schermate, ed è quello che le rende un organismo solo
   * invece di due app che condividono un database. Lui nota una cosa; tu decidi
   * che è tua e la prendi in carico.
   *
   * La voce si chiude nello stesso momento — lo fa il server — perché la stessa
   * cosa in due posti con due stati diversi diverge al primo tocco: la chiuderesti
   * in lista e resterebbe aperta nel feed, a chiederti di nuovo la stessa cosa.
   */
  const mettiInLista = async (v: VoceFeed) => {
    setMenuAperto(false)
    // sparisce subito dal feed: aspettare il giro completo del server su un
    // gesto così piccolo fa sembrare l'app lenta proprio dove è più veloce
    setAperti(a => a.filter(x => x.id !== v.id))
    try {
      await api.aggiungiCompito({
        id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        testo: v.titolo,
        quando: 'oggi',
        origine: 'feed',
        voce: v.id,
        ...(v.doc ? { doc: v.doc } : {})
      })
      mostraToast(t('Messa in lista.'))
    } catch (e) {
      // rimetterla dov'era è meglio che farla sparire in silenzio
      setAperti(a => [v, ...a])
      mostraToast(e instanceof Error ? t(e.message) : t('Non sono riuscito a metterla in lista.'))
    }
  }

  const mandaRisposta = async (testo: string, stato?: string) => {
    if (!hero || !testo.trim()) return
    setRispondendo(true)
    try {
      const r = await api.rispondiFeed(hero.id, testo, stato)
      setAperti(r.aperti as unknown as VoceFeed[])
      setFatte(r.fatte as unknown as VoceFeed[])
      setRisposta('')
      setScriviAperto(false)
      setMenuAperto(false)
      setHeroLong(false)
      mostraToast(
        r.fonteVecchia
          ? t('Segnato. Il documento è indietro rispetto a te: rileggo la fonte alla prossima lettura.')
          : r.daRicordare
            ? frasi.segnatoRicordo(r.daRicordare)
            : t('Segnato.')
      )
    } catch (e) {
      mostraToast(e instanceof Error ? t(e.message) : t('Non sono riuscito a segnarlo.'))
    }
    setRispondendo(false)
  }

  const rispondiAlHero = () => mandaRisposta(risposta)

  /**
   * Rispondere a quello che ha chiesto lui. L'esito non finisce in un avviso
   * che scompare: resta al posto della domanda, perché il senso di tutto il
   * meccanismo è vedere *cosa è cambiato*. Un avviso che sfarfalla e sparisce
   * insegnerebbe che rispondere non serve.
   */
  const rispondiADomanda = async () => {
    if (!domanda || !rispostaDom.trim()) return
    const id = domanda.id
    const testo = rispostaDom
    setRispostaDom('')
    try {
      const r = await api.rispondiDomanda(id, testo)
      setEsitoDom(r.esito)
      setDomanda(null)
    } catch (e) {
      setRispostaDom(testo)
      mostraToast(e instanceof Error ? t(e.message) : t('Non sono riuscito a segnarlo.'))
    }
  }

  const lasciaCadere = async () => {
    if (!domanda) return
    const id = domanda.id
    setDomanda(null)
    setSpuntoAperto(false)
    // non si ripropone: lasciarla cadere è una risposta anche quella
    try { await api.ignoraDomanda(id) } catch { /* al prossimo avvio non c'è più */ }
  }

  const salvaFuoco = async (testo: string) => {
    setFuoco(testo)
    setFuocoAperto(false)
    try {
      await api.scriviFuoco(testo)
      mostraToast(testo.trim() ? t('Da adesso guardo prima lì.') : t('Fuoco tolto.'))
      // il fuoco nuovo non può restare una promessa: il feed si rigenera
      // subito, così cambiare direzione cambia la pagina che hai davanti
      setGenerando(true)
      api.generaFeed().then(() => caricaFeed()).catch(() => {}).finally(() => setGenerando(false))
    } catch { mostraToast(t('Non sono riuscito a salvarlo.')) }
  }

  /**
   * Gli argomenti della rassegna.
   *
   * Diverso dal fuoco in una cosa: qui non si rigenera niente. Cambiare fuoco
   * rifà subito il feed perché il materiale è già in casa; cambiare argomenti
   * vorrebbe dire ribussare a quindici giornali, e non è quello che uno si
   * aspetta premendo Salva dentro le preferenze. La rassegna nuova arriva al
   * prossimo giro, o quando la chiedi tu dalla fascia.
   */
  const salvaArgomenti = async (testo: string) => {
    setStato(s => ({ ...s, config: { ...s.config, argomenti: testo } }))
    try {
      await api.profilo({ argomenti: testo })
    } catch { mostraToast(t('Non sono riuscito a salvarlo.')) }
  }

  const risolvi = (v: VoceFeed) => async () => {
    setAperti(a => a.filter(x => x.id !== v.id))
    setFatte(f => [v, ...f])
    setHeroLong(false)
    try {
      await api.segnaFeed(v.id, 'fatto')
      mostraToast(t('Segnata come fatta.'), true)
    } catch {
      // rimetto le cose come stavano invece di mentire
      setFatte(f => f.filter(x => x.id !== v.id))
      setAperti(a => [v, ...a])
      mostraToast(t('Non sono riuscito a segnarla.'))
    }
  }

  /**
   * Le voci del feed, vestite da riga.
   *
   * Si mappano tutte, non solo quelle sotto la prima: quando in cima ci va una
   * cosa della tua lista, la voce che stava lì scende fra le righe — e per
   * scendere le serve la stessa vestizione delle altre. Chi la disegna prende
   * `rigaHero`; chi disegna il resto prende `resto`, che è quella dopo.
   */
  const righe = aperti.map((i, ix) => {
    const aperto = restoAperti.has(i.id)
    const testo = i.testo ?? ''
    return {
      id: i.id, tipo: i.tipo, titolo: i.titolo, fonte: i.fonte ?? '', ora: quando(i.quando),
      onInLista: () => mettiInLista(i as unknown as VoceFeed),
      // Aperta è tutta; chiusa si ferma dov'è ancora una frase e non un
      // troncone. Il chevron sta attaccato a questo punto, in fondo alle
      // parole — è lì che ti accorgi che ne mancano, non in cima alla riga.
      testo: aperto ? testo : taglia(testo, 150),
      aperto,
      // Sotto la soglia non c'è niente da aprire: il chevron non compare,
      // invece di girare a vuoto.
      espandibile: testo.length > 150,
      urgenza: i.urgenza ?? '',
      /**
       * La freccia accanto a «Da leggere».
       *
       * Il pallino era decorazione: stava lì, non diceva niente, e la riga
       * sembrava una voce di elenco puntato invece di una cosa su cui si
       * clicca. Questa punta alla voce e alla riga che ci porta sopra — e
       * resta ferma: quella che gira è l'altra, in fondo al testo.
       */
      freccia: {
        flex: 'none', width: 14, marginTop: 4, display: 'flex', justifyContent: 'center',
        color: 'rgba(62,81,64,.6)'
      } as CSSProperties,
      // Il chevron in fondo alla frase: giù quando c'è altro da vedere, su
      // quando sei già in fondo.
      chevron: {
        display: 'inline-flex', verticalAlign: '-2px', marginLeft: 5, padding: 0, border: 'none',
        background: 'none', cursor: 'pointer', color: 'rgba(34,39,31,.5)',
        transform: aperto ? 'rotate(180deg)' : 'rotate(0deg)',
        transition: 'transform .28s cubic-bezier(.22,.61,.36,1), color .2s ease'
      } as CSSProperties,
      // «Da decidere», «Da leggere»: è la prima cosa che dice se la riga ti
      // riguarda, e stava scritta come una didascalia qualsiasi accanto alla
      // fonte. Adesso pesa quanto quello che dice — maiuscoletto spaziato,
      // il verde dell'app, staccata dal grigio della fonte.
      tipoStyle: {
        fontSize: '11.5px', fontWeight: 600, letterSpacing: '.09em',
        textTransform: 'uppercase', color: '#3E5140'
      } as CSSProperties,
      pill: {
        flex: 'none', fontSize: '12px', fontWeight: 700, letterSpacing: '.02em', color: '#8E3F1F',
        background: 'rgba(196,98,59,.16)', border: '1px solid rgba(196,98,59,.32)', borderRadius: 99, padding: '5px 11px'
      } as CSSProperties,
      row: {
        display: 'flex', gap: 13, alignItems: 'flex-start', padding: '17px 21px', cursor: 'pointer',
        borderTop: ix === 0 ? 'none' : '1px solid rgba(34,39,31,.09)'
      } as CSSProperties,
      // Vedere il resto della frase e prendere in carico la voce sono due
      // gesti diversi, e adesso hanno due bersagli diversi: il chevron in
      // fondo al testo apre, la riga porta la voce in cima. Prima l'unico
      // modo di leggere tutto era spostarsela sotto il naso.
      onToggle: () => setRestoAperti(s => {
        const n = new Set(s)
        n.has(i.id) ? n.delete(i.id) : n.add(i.id)
        return n
      }),
      onPromote: () => { setAperti(a => [i, ...a.filter(x => x.id !== i.id)]); setHeroLong(false) }
    }
  })

  return {
    threadRef, cvA, cvB,

    isMyynd: screen === 'myynd', isOggi: screen === 'oggi', isChat: screen === 'chat', isAuto: screen === 'auto',
    isMappa: screen === 'mappa', isPref: screen === 'pref', isConn: screen === 'conn',
    isMemoria: screen === 'memoria',
    isAiuto: screen === 'aiuto', menuAiuto: screen === 'aiuto' ? MENU_ON : MENU_OFF, goAiuto: go('aiuto'),
    navMyynd: screen === 'myynd' ? NAV_ON : NAV_OFF,
    navOggi: screen === 'oggi' ? NAV_ON : NAV_OFF,
    goOggi: (e?: { preventDefault: () => void }) => { e?.preventDefault(); setScreen('oggi') },
    mostraToast,
    navChat: screen === 'chat' ? NAV_ON : NAV_OFF,
    navAuto: screen === 'auto' ? NAV_ON : NAV_OFF,
    menuPref: screen === 'pref' ? MENU_ON : MENU_OFF,
    menuMappa: screen === 'mappa' ? MENU_ON : MENU_OFF,
    menuConn: screen === 'conn' ? MENU_ON : MENU_OFF,
    menuMemoria: screen === 'memoria' ? MENU_ON : MENU_OFF,
    menuOpen: menu, toggleMenu: () => setMenu(m => !m),
    chevron: { display: 'flex', transform: menu ? 'none' : 'rotate(180deg)', transition: 'transform .2s' } as CSSProperties,
    goMyynd: go('myynd'), goChat: go('chat'), goAuto: go('auto'),
    goMappa: go('mappa'), goPref: go('pref'), goConn: go('conn'), goMemoria: go('memoria'),

    nome: stato.config.nome ?? t('tu'),
    ruolo: stato.config.ruolo ?? '',
    /** Su un server, non sul suo computer: cambia cosa è vero dire sui dati. */
    ospitato: !!stato.ospitato,
    iniziali: (stato.config.nome ?? 'M').slice(0, 2).toUpperCase(),
    connCount: connOn.length,
    apertiCount: aperti.length,
    totaleDocumenti: stato.conteggi.totale,
    badge: { fontSize: '11.5px', fontWeight: 500, opacity: aperti.length ? 1 : 0.35 } as CSSProperties,
    sincronizzando,
    sincronizza: () => sincronizza(),
    claudeOn,

    // — feed —
    oggi: new Date().toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' }),
    ora: new Date().toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' }),
    // Il titolone non può dire «niente che richieda te» mentre sotto lui ti sta
    // chiedendo una cosa: la contraddizione fa sembrare che una delle due parti
    // dell'app non sappia cosa fa l'altra.
    headline: guastoFeed ? t('Non riesco a leggere il feed.')
      : !feedCaricato ? t('Un momento…')
      : aperti.length === 0
      ? (domanda ? t('Una cosa da chiarire.')
        : stato.conteggi.totale ? t('Niente che richieda te, adesso.')
        : t('La tua mente è ancora vuota.'))
      : frasi.daGuardare(aperti.length, parole(aperti.length)),
    guastoFeed: guastoFeed ? t(guastoFeed) : null,
    feedCaricato,
    ricaricaFeed: () => { setGuastoFeed(null); setFeedCaricato(false); caricaFeed().catch(() => {}) },
    hasHero: !!hero,
    // Basta che non ci sia niente di aperto. Prima serviva anche zero fatte,
    // quindi chi aveva appena sistemato tutto restava con un elenco di cose
    // chiuse e nessuna indicazione su cosa succede adesso.
    feedVuoto: aperti.length === 0,
    haFatte: fatte.length > 0,
    generando, genera,
    heroStyle: {
      borderRadius: '28px 24px 28px 22px',
      background: 'linear-gradient(138deg,rgba(176,82,46,.9),rgba(154,100,55,.88) 46%,rgba(65,96,74,.9))',
      backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
      border: '1px solid rgba(255,255,255,.6)',
      boxShadow: '0 30px 70px rgba(120,74,48,.34),inset 0 1px 0 rgba(255,255,255,.35)',
      // Niente altezza minima: con il testo ripiegato la card restava alta 300
      // pixel con dentro centoventi di vuoto. Adesso è alta quanto quello che
      // contiene, e si allunga solo se apri il testo lungo.
      padding: '22px 24px 20px', transform: 'rotate(-.35deg)', color: '#FFF7F0', flex: 'none',
      display: 'flex', flexDirection: 'column', animation: 'heroin .35s ease',
      // il confine del testo è la carta: un titolo scritto dal modello a partire
      // da un nome di file senza spazi non deve poterne uscire
      overflow: 'hidden', overflowWrap: 'anywhere'
    } as CSSProperties,
    heroTipo: hero?.tipo ?? '',
    heroTitolo: hero?.titolo ?? '',
    heroFonte: hero?.fonte ?? '',
    heroOra: quando(hero?.quando),
    // non si disegna più sulla card in cima; resta per le righe sotto
    heroUrgenza: hero?.urgenza ?? '',
    // il modello a volte sfora il tetto che gli si chiede: qui si taglia
    // comunque, perché la card in cima non deve mai diventare un muro di testo
    // Chiuso di default: il titolo dice di cosa si tratta, e quasi sempre
    // basta per decidere. Il testo lungo si apre se serve, non prima —
    // sette righe di paragrafo per ogni voce sono un muro, non un feed.
    heroTesto: heroLong ? (hero?.testo ?? '') : taglia(hero?.testo ?? '', 96),
    heroTagliato: (hero?.testo ?? '').length > 96,
    heroLong,
    heroToggle: () => setHeroLong(x => !x),
    heroHaDoc: !!hero?.doc,
    heroPrimary: hero ? risolvi(hero) : noop,
    heroAsk: hero ? () => chiedi(`${hero.titolo}: dimmi di più`) : noop,
    heroSkip: hero ? () => setAperti(a => [...a.slice(1), a[0]]) : noop,

    // — rispondere alla voce in cima, e indirizzare tutto il resto —
    risposta,
    setRisposta,
    rispondendo,
    rispondiAlHero,
    scriviAperto,
    apriScrivi: () => setScriviAperto(true),
    chiudiScrivi: () => { setScriviAperto(false); setRisposta('') },

    /**
     * Le correzioni, dietro un «⋯».
     *
     * Prima erano quattro pastiglie sempre in vista, e una di quelle — «Già
     * fatto» — faceva esattamente quello che fa il bottone Fatto qui accanto.
     * Un doppione in mezzo a una fila di controlli è la definizione di
     * ingombro: le tre che restano sono quelle che il bottone principale *non*
     * sa dire, e stanno via finché non servono.
     */
    menuAperto,
    apriMenu: () => setMenuAperto(v => !v),
    chiudiMenu: () => setMenuAperto(false),
    correzioni: hero ? [
      { id: 'lista', label: t('Mettila in lista'), onClick: () => mettiInLista(hero) },
      { id: 'altrove', label: t('Aggiornato altrove'), onClick: () => mandaRisposta(t("L'ho aggiornato altrove: il documento qui è indietro."), 'fonte_vecchia') },
      { id: 'scarta', label: t('Non mi interessa'), onClick: () => mandaRisposta(t('Non mi interessa.'), 'scartato') },
      { id: 'parole', label: t('Altro…'), onClick: () => { setMenuAperto(false); setScriviAperto(true) } }
    ] : [],
    // — la domanda che fa lui —
    domanda,
    rispostaDom,
    setRispostaDom,
    rispondiADomanda,
    lasciaCadere,
    esitoDom,
    chiudiEsito: () => setEsitoDom(''),
    spuntoAperto,
    apriSpunto: () => setSpuntoAperto(v => !v),

    fuoco,
    fuocoAperto,
    apriFuoco: () => setFuocoAperto(v => !v),
    salvaFuoco,

    argomenti: stato.config.argomenti ?? '',
    // chi ha scritto quella riga: cambia cosa c'è scritto sotto il campo, e
    // lasciarlo implicito vorrebbe dire far credere a qualcuno di averla
    // scritta lui
    argomentiDaMe: stato.config.argomentiDaMe === true,
    salvaArgomenti,
    /** Aprire il documento dietro una citazione, dal segno nel testo. */
    apriFonte: (id: string) => {
      api.documento(id).then(setDoc).catch(() => mostraToast(t('Non trovo più il documento.')))
    },
    apriDoc: hero?.doc ? () => { api.documento(hero.doc!).then(setDoc).catch(() => {
        // il bottone sparisce insieme all'errore: invitarti a riprovare su una
        // cosa che non c'è è il modo di far sembrare rotta tutta l'app
        setAperti(a => a.map(v => (v.id === hero?.id ? { ...v, doc: null } : v)))
        mostraToast(t('Non trovo più il documento.'))
      }) } : noop,

    resto: righe.slice(1),
    // la voce in cima, pronta a scendere fra le altre se le passi davanti
    rigaHero: righe[0] ?? null,

    hasDone: fatte.length > 0, doneCount: fatte.length, doneOpen,
    toggleDone: () => setDoneOpen(v => !v),
    doneChevron: { display: 'flex', transform: doneOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .2s' } as CSSProperties,
    fatte: fatte.map((d, ix) => ({
      id: d.id, esito: d.titolo, tipo: d.tipo, fonte: d.fonte ?? '', at: quando(d.quando),
      testo: d.testo, open: openDone === d.id, label: openDone === d.id ? t('Chiudi') : t('Vedi'),
      wrap: {
        borderTop: ix === 0 ? 'none' : '1px solid rgba(34,39,31,.08)',
        background: openDone === d.id ? 'rgba(255,255,255,.5)' : 'transparent'
      } as CSSProperties,
      onOpen: () => setOpenDone(v => (v === d.id ? null : d.id)),
      onRestore: async (e: React.MouseEvent) => {
        e.stopPropagation()
        setFatte(f => f.filter(x => x.id !== d.id))
        setAperti(a => [d, ...a])
        setOpenDone(null)
        try {
          await api.segnaFeed(d.id, 'aperto')
          mostraToast(t('Rimessa in cima al feed.'))
        } catch {
          setAperti(a => a.filter(x => x.id !== d.id))
          setFatte(f => [d, ...f])
          mostraToast(t('Non sono riuscito a rimetterla.'))
        }
      },
      onAsk: (e: React.MouseEvent) => { e.stopPropagation(); chiedi(`${d.titolo}: dimmi di più`) }
    })),

    // — documento aperto —
    docOpen: !!doc,
    doc,
    chiudiDoc: () => setDoc(null),

    // — toast —
    toastOn: !!toast, toastText: toast?.text ?? '', toastUndo: !!toast?.undo,
    undo: () => {
      const ultima = fatte[0]
      setToast(null)
      if (!ultima) return
      setFatte(f => f.slice(1))
      setAperti(a => [ultima, ...a])
      api.segnaFeed(ultima.id, 'aperto').catch(() => {
        setAperti(a => a.filter(x => x.id !== ultima.id))
        setFatte(f => [ultima, ...f])
        mostraToast(t('Non sono riuscito ad annullare.'))
      })
    },

    // — chat —
    threads: threads.map(ch => ({
      id: ch.id, titolo: ch.titolo, quando: quando(ch.quando),
      aperta: ch.id === thread,
      sopra: ch.id === hoverThread,
      row: {
        display: 'flex', alignItems: 'center', gap: 6, padding: '8px 9px', borderRadius: 10, cursor: 'pointer',
        background: ch.id === thread ? 'rgba(255,255,255,.92)' : ch.id === hoverThread ? 'rgba(255,255,255,.6)' : 'transparent'
      } as CSSProperties,
      onEnter: () => setHoverThread(ch.id),
      onLeave: () => setHoverThread(h => (h === ch.id ? null : h)),
      onClick: () => setThread(ch.id),
      // chiede una volta, sul posto: il cestino della riga se ne occupa
      onDelete: async () => {
        try {
          await api.eliminaChat(ch.id)
        } catch (e) {
          mostraToast(e instanceof Error ? t(e.message) : t('Non sono riuscito a eliminare la chat.'))
          return
        }
        const resto = threads.filter(x => x.id !== ch.id)
        setThreads(resto)
        if (thread === ch.id) setThread(resto[0]?.id ?? null)
        mostraToast(t('Chat eliminata.'))
      }
    })),
    newChat: () => { setThread(`th${Date.now()}`); setMessaggi([]); setScreen('chat') },
    chatEmpty: messaggi.length === 0,
    chatCaricata: elencoChatPronto && messaggiPronti,
    chatTitolo: th?.titolo ?? 'Nuova chat',
    pensando,
    messages: messaggi.map(m => ({
      id: m.id, text: m.text, mio: m.role === 'u',
      hasSources: !!(m.sources && m.sources.length), sources: m.sources ?? [],
      row: { display: 'flex', justifyContent: m.role === 'u' ? 'flex-end' : 'flex-start' } as CSSProperties,
      bubble: (m.role === 'u'
        ? {
            maxWidth: '74%', padding: '13px 17px', borderRadius: '20px 18px 6px 20px',
            background: 'linear-gradient(130deg,rgba(176,82,46,.92),rgba(140,100,64,.9))',
            color: '#FFF7F0', fontSize: '15px', lineHeight: 1.55, whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere', minWidth: 0
          }
        : {
            maxWidth: '80%', padding: '15px 18px', borderRadius: '20px 20px 20px 6px',
            background: 'rgba(255,253,249,.78)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,.8)', boxShadow: '0 16px 40px rgba(84,64,44,.1)',
            color: '#22271F', fontSize: '15px', lineHeight: 1.6, whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere', minWidth: 0
          }) as CSSProperties
    })),
    prompts: stato.conteggi.totale
      ? [
          // il testo mandato al modello è quello tradotto: gli si parla nella
          // lingua in cui poi deve rispondere
          { id: 'p1', text: t('Cosa è arrivato oggi?'), onClick: () => chiedi(t('Cosa è arrivato oggi?')) },
          { id: 'p2', text: t('Chi aspetta una mia risposta?'), onClick: () => chiedi(t('Chi aspetta una mia risposta?')) },
          { id: 'p3', text: t('Riassumimi la settimana'), onClick: () => chiedi(t('Riassumimi la settimana')) }
        ]
      : [],
    draftMsg,
    onType: (e: { target: { value: string } }) => setDraftMsg(e.target.value),
    // il bottone era già disabilitato mentre risponde; Invio no, e mandava due volte
    onKey: (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !pensando && draftMsg.trim()) chiedi(draftMsg.trim()) },
    send: () => { if (!pensando && draftMsg.trim()) chiedi(draftMsg.trim()) },

    // — mappa —
    mappaMeta: gruppi.length
      ? frasi.documentiEGruppi(stato.conteggi.totale.toLocaleString(loc()), gruppi.length)
      : t('ancora nessun documento'),
    mappaVuota: !gruppi.length,
    guastoMappa,
    // «costruisco» solo finché non c'è niente: sopra a una mappa che c'è già si rilegge in silenzio
    costruendoMappa: costruendoMappa && !grafo,
    ricaricaMappa: () => { caricaMente(true).catch(() => {}) },
    mapFull,
    expandMap: () => setMapFull(true),
    closeMap: () => setMapFull(false),
    resetView: () => { mappa.reset(); setFiltro(null) },
    legenda: gruppi.map(g => {
      const on = !filtro || filtro === g.id
      return {
        id: g.id, nome: t(g.nome),
        chip: {
          display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 99,
          cursor: 'pointer', fontFamily: 'inherit', fontSize: '11.5px',
          background: on ? 'rgba(255,247,240,.12)' : 'rgba(255,247,240,.04)',
          border: '1px solid ' + (on ? 'rgba(255,247,240,.28)' : 'rgba(255,247,240,.1)'),
          color: 'rgba(255,247,240,' + (on ? '.94' : '.45') + ')'
        } as CSSProperties,
        dot: { width: 8, height: 8, borderRadius: '50%', background: g.colore, flex: 'none' } as CSSProperties,
        onClick: () => { setFiltro(f => (f === g.id ? null : g.id)); setSel(g.id) }
      }
    }),
    selTipo: cl ? frasi.nDocumenti(cl.nodi.toLocaleString(loc())) : '',
    selNome: cl?.nome ?? t('Niente ancora'),
    selDot: { width: 10, height: 10, borderRadius: '50%', background: cl?.colore ?? '#8A7A6A', flex: 'none', marginTop: 4 } as CSSProperties,
    selTesto: cl
      ? frasi.tuttoDa(t(cl.nome).toLowerCase())
      : t('Collega una fonte e qui comparirà quello che Myynd ha letto.'),
    nodePlaceholder: cl ? frasi.chiediSu(t(cl.nome).toLowerCase()) : t('Chiedi…'),
    nodeMsg,
    onNodeType: (e: { target: { value: string } }) => setNodeMsg(e.target.value),
    onNodeKey: (e: React.KeyboardEvent) => { if (e.key === 'Enter' && nodeMsg.trim()) chiedi(nodeMsg.trim()) },
    askNode: () => { if (nodeMsg.trim()) chiedi(nodeMsg.trim()) },

    // — preferenze —
    toni: TONI.map(x => ({
      ...x, label: t(x.label),
      onClick: () => { setStato(s => ({ ...s, config: { ...s.config, tono: x.id } })); api.profilo({ tono: x.id }).catch(() => mostraToast(t('Non sono riuscito a salvare la preferenza.'))) },
      style: (x.id === stato.config.tono
        ? { padding: '10px 20px', borderRadius: 99, border: '1px solid rgba(255,255,255,.5)', background: 'linear-gradient(120deg,#C4623B,#7E9C82)', color: '#FFF7F0', fontFamily: 'inherit', fontSize: '13.5px', fontWeight: 500, cursor: 'pointer' }
        : { padding: '10px 20px', borderRadius: 99, border: '1px solid rgba(34,39,31,.2)', background: 'rgba(255,255,255,.5)', color: '#22271F', fontFamily: 'inherit', fontSize: '13.5px', cursor: 'pointer' }) as CSSProperties
    })),
    tonoEsempio: t(ESEMPIO_TONO[stato.config.tono] ?? ESEMPIO_TONO.diretto),

    // — chi fa il lavoro grosso: Claude, o un fornitore compatibile con OpenAI —
    motore: stato.config.motore ?? 'claude',
    compatibile: stato.config.compatibile,
    scegliMotore: async (m: 'claude' | 'compatibile') => {
      if ((stato.config.motore ?? 'claude') === m) return
      // senza un fornitore collegato non c'è niente da scegliere: si apre la
      // scheda per collegarlo, e collegarlo lo sceglie da sé
      if (m === 'compatibile' && !stato.config.compatibile) { apriConnessioni('compatibile'); return }
      setStato(s => ({ ...s, config: { ...s.config, motore: m } }))
      try { await api.scegliMotore(m) } catch { mostraToast(t('Non sono riuscito a cambiare motore.')); ricaricaStato() }
    },

    // — il modello di Claude, la lingua, e quanto tengono le fatte —
    modelli: MODELLI.map(m => ({
      ...m, nota: t(m.nota),
      scelto: (stato.config.modello ?? 'claude-sonnet-5') === m.id,
      onClick: () => {
        setStato(s => ({ ...s, config: { ...s.config, modello: m.id } }))
        api.profilo({ modello: m.id }).catch(() => mostraToast(t('Non sono riuscito a salvare la preferenza.')))
      }
    })),
    lingue: LINGUE.map(l => ({
      ...l,
      scelto: (stato.config.lingua ?? 'en') === l.id,
      occupato: cambioLingua,
      /**
       * Cambiare lingua traduce anche il feed e la domanda in sospeso, quindi
       * ci mette un paio di secondi. Si aspetta e poi si ricarica: mostrare
       * subito l'interfaccia inglese sopra un feed ancora italiano sarebbe
       * peggio dell'attesa.
       */
      onClick: async () => {
        if (cambioLingua || (stato.config.lingua ?? 'en') === l.id) return
        setCambioLingua(true)
        try {
          await api.profilo({ lingua: l.id })
          setStato(s => ({ ...s, config: { ...s.config, lingua: l.id } }))
          await Promise.all([
            caricaFeed(),
            api.domanda().then(r => setDomanda(r.domanda)).catch(() => {})
          ])
        } catch { mostraToast(t('Non sono riuscito a cambiare lingua.')) }
        setCambioLingua(false)
      }
    })),
    tenute: TENUTE.map(x => ({
      ...x, label: t(x.label),
      scelto: (stato.config.oreFatte ?? 48) === x.ore,
      onClick: () => {
        setStato(s => ({ ...s, config: { ...s.config, oreFatte: x.ore } }))
        api.profilo({ oreFatte: x.ore }).then(() => caricaFeed()).catch(() => mostraToast(t('Non sono riuscito a salvare la preferenza.')))
      }
    })),
    autonomie: AUTONOMIE.map(a => ({
      ...a, titolo: t(a.titolo), nota: t(a.nota),
      scelto: stato.config.autonomia === a.id,
      onClick: () => { setStato(s => ({ ...s, config: { ...s.config, autonomia: a.id } })); api.profilo({ autonomia: a.id }).catch(() => mostraToast(t('Non sono riuscito a salvare la preferenza.'))) },
      row: {
        display: 'flex', gap: 13, alignItems: 'flex-start', padding: '13px 14px', borderRadius: 16, cursor: 'pointer',
        background: stato.config.autonomia === a.id ? 'rgba(255,255,255,.85)' : 'transparent',
        boxShadow: stato.config.autonomia === a.id ? '0 12px 30px rgba(84,64,44,.1)' : 'none'
      } as CSSProperties,
      radio: {
        width: 15, height: 15, flex: 'none', borderRadius: '50%', marginTop: 3,
        border: stato.config.autonomia === a.id ? '4px solid #C4623B' : '1.5px solid rgba(34,39,31,.35)',
        background: stato.config.autonomia === a.id ? '#FFF7F0' : 'transparent'
      } as CSSProperties
    })),
    apriConnessioni,

    // — connettori —
    connMeta: frasi.attiviDaCollegare(connOn.length, connettori.filter(c => c.pronto).length - connOn.length),
    connAttivi: connOn.map(c => ({
      id: c.id, nome: c.nome, stato: frasi.statoConnettore(c.documenti),
      onClick: async () => {
        await api.scollega(c.id).catch(() => {})
        await Promise.all([ricaricaStato(), caricaMente(mappaInVista)])
        mostraToast(frasi.scollegato(t(c.nome)))
      }
    })),
    connSpenti: connettori.filter(c => c.pronto && !c.collegato).map(c => ({
      // il pannello si apre già su questa fonte: chi clicca "Posta" vuole
      // Posta, non l'elenco di tutto da ricominciare a cercare
      id: c.id, nome: c.nome, nota: c.nota, onClick: () => apriConnessioni(c.id)
    })),
    connFuturi: connettori.filter(c => !c.pronto).map(c => ({ id: c.id, nome: c.nome, nota: c.nota })),

    // — ricerca —
    searchOpen: search, query,
    openSearch: () => setSearch(true),
    closeSearch: () => { setSearch(false); setQuery('') },
    onQuery: (e: { target: { value: string } }) => setQuery(e.target.value),
    risultati: risultati.map(r => ({
      id: r.id, titolo: r.titolo, fonte: `${r.fonte} · ${r.estratto.slice(0, 60)}…`, quando: quando(r.quando),
      dot: dot(COLORE_FONTE[r.fonte] ?? '#C4623B'),
      onClick: () => {
        api.documento(r.id).then(d => { setDoc(d); setSearch(false); setQuery('') }).catch(() => {})
      }
    })),

    track, knob
  }
}

export type Vals = ReturnType<typeof useVals>
export type { Connettore }
