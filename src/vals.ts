import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AUTONOMIE, ESEMPIO_TONO, TONI, parole, quando, type Gruppo, type Messaggio, type Screen, type Thread, type VoceFeed } from './data'
import { costruisci } from './brain'
import { api, rigaSincronizzazione, type Connettore, type Stato } from './api'
import { MENU_OFF, MENU_ON, NAV_OFF, NAV_ON, dot, knob, track } from './ui'
import { useMappa } from './useMappa'

type Toast = { text: string; undo: boolean } | null

const COLORE_FONTE: Record<string, string> = {
  posta: '#C4553C', desktop: '#E0A44A', notion: '#5B9BC9', claude: '#7FA98A'
}

/** Tutto lo stato dell'app, alimentato dal server locale. */
export function useVals(iniziale: Stato, apriConnessioni: () => void) {
  const [stato, setStato] = useState<Stato>(iniziale)
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
  const [doneOpen, setDoneOpen] = useState(true)
  const [openDone, setOpenDone] = useState<string | null>(null)
  const [heroLong, setHeroLong] = useState(false)
  const [generando, setGenerando] = useState(false)

  const [gruppi, setGruppi] = useState<Gruppo[]>([])
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

  const ball = useMemo(() => costruisci(gruppi), [gruppi])
  const onPick = useCallback((s: string, cluster: string) => { setSel(s); setFiltro(cluster) }, [])
  const mappa = useMappa(cvA, cvB, mapFull, filtro, sel, onPick, ball, gruppi)

  // — caricamento iniziale —

  const caricaFeed = useCallback(async () => {
    const f = await api.feed()
    setAperti(f.aperti as unknown as VoceFeed[])
    setFatte(f.fatte as unknown as VoceFeed[])
  }, [])

  const caricaMente = useCallback(async () => {
    const m = await api.mente()
    setGruppi(m.gruppi)
    setSel(s => s || m.gruppi[0]?.id || '')
  }, [])

  const caricaChat = useCallback(async () => {
    const c = await api.chat()
    setThreads(c)
    setThread(t => t ?? c[0]?.id ?? null)
  }, [])

  useEffect(() => {
    caricaFeed().catch(() => {})
    caricaMente().catch(() => {})
    caricaChat().catch(() => {})
  }, [caricaFeed, caricaMente, caricaChat])

  // un contatore di generazione: la risposta di una richiesta vecchia non
  // deve sovrascrivere quella nuova, né cancellare la bolla ottimistica
  const gen = useRef(0)
  useEffect(() => {
    if (!thread) { setMessaggi([]); return }
    const mio = ++gen.current
    api.messaggi(thread)
      .then(m => { if (gen.current === mio) setMessaggi(m) })
      .catch(() => { if (gen.current === mio) setMessaggi([]) })
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
    const mio = ++gen.current
    setScreen('chat'); setSearch(false); setMapFull(false); setMenu(false)
    setThread(id)
    const bozza = draftMsg
    setDraftMsg(''); setNodeMsg('')
    setMessaggi(m => [...m, { id: `tmp${Date.now()}`, role: 'u', text: testo }])
    setPensando(true)
    try {
      const r = await api.chiedi(id, testo)
      if (gen.current === mio) setMessaggi(r.messaggi)
      await caricaChat()
    } catch (e) {
      mostraToast(e instanceof Error ? e.message : 'Non sono riuscito a rispondere.')
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
      await Promise.all([ricaricaStato(), caricaMente(), caricaFeed()])
      mostraToast('Letto tutto quello che è cambiato.')
    } catch (e) {
      mostraToast(e instanceof Error ? e.message : 'Sincronizzazione fallita.')
    }
    setSincronizzando(null)
  }

  const genera = async () => {
    setGenerando(true)
    try {
      const r = await api.generaFeed()
      await caricaFeed()
      mostraToast(r.generate ? `${r.generate} cose nuove nel feed.` : 'Non ho trovato niente da segnalare.')
    } catch (e) {
      mostraToast(e instanceof Error ? e.message : 'La lettura non è riuscita.')
    }
    setGenerando(false)
  }

  // — valori derivati —

  const hero = aperti[0]
  const resto = aperti.slice(1)
  const cl = gruppi.find(g => g.id === sel) ?? gruppi[0]
  const connettori = stato.connettori
  const connOn = connettori.filter(c => c.pronto && c.collegato)
  const claudeOn = !!connettori.find(c => c.id === 'claude')?.collegato
  const th = threads.find(t => t.id === thread)
  const noop = () => {}

  const risolvi = (v: VoceFeed) => async () => {
    setAperti(a => a.filter(x => x.id !== v.id))
    setFatte(f => [v, ...f])
    setHeroLong(false)
    try {
      await api.segnaFeed(v.id, 'fatto')
      mostraToast('Segnata come fatta.', true)
    } catch {
      // rimetto le cose come stavano invece di mentire
      setFatte(f => f.filter(x => x.id !== v.id))
      setAperti(a => [v, ...a])
      mostraToast('Non sono riuscito a segnarla.')
    }
  }

  return {
    threadRef, cvA, cvB,

    isMyynd: screen === 'myynd', isChat: screen === 'chat', isAuto: screen === 'auto',
    isMappa: screen === 'mappa', isPref: screen === 'pref', isConn: screen === 'conn',
    navMyynd: screen === 'myynd' ? NAV_ON : NAV_OFF,
    navChat: screen === 'chat' ? NAV_ON : NAV_OFF,
    navAuto: screen === 'auto' ? NAV_ON : NAV_OFF,
    menuPref: screen === 'pref' ? MENU_ON : MENU_OFF,
    menuMappa: screen === 'mappa' ? MENU_ON : MENU_OFF,
    menuConn: screen === 'conn' ? MENU_ON : MENU_OFF,
    menuOpen: menu, toggleMenu: () => setMenu(m => !m),
    chevron: { display: 'flex', transform: menu ? 'none' : 'rotate(180deg)', transition: 'transform .2s' } as CSSProperties,
    goMyynd: go('myynd'), goChat: go('chat'), goAuto: go('auto'),
    goMappa: go('mappa'), goPref: go('pref'), goConn: go('conn'),

    nome: stato.config.nome ?? 'tu',
    ruolo: stato.config.ruolo ?? '',
    iniziali: (stato.config.nome ?? 'M').slice(0, 2).toUpperCase(),
    connCount: connOn.length,
    apertiCount: aperti.length,
    totaleDocumenti: stato.conteggi.totale,
    badge: { fontSize: '11.5px', fontWeight: 500, opacity: aperti.length ? 1 : 0.35 } as CSSProperties,
    sincronizzando,
    sincronizza: () => sincronizza(),
    claudeOn,

    // — feed —
    oggi: new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }),
    ora: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
    headline: aperti.length === 0
      ? (stato.conteggi.totale ? 'Niente che richieda te, adesso.' : 'La tua mente è ancora vuota.')
      : `${parole(aperti.length)}, da guardare.`,
    hasHero: !!hero,
    feedVuoto: aperti.length === 0 && fatte.length === 0,
    hasRest: resto.length > 0,
    generando, genera,
    heroStyle: {
      borderRadius: '28px 24px 28px 22px',
      background: 'linear-gradient(138deg,rgba(176,82,46,.9),rgba(154,100,55,.88) 46%,rgba(65,96,74,.9))',
      backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
      border: '1px solid rgba(255,255,255,.6)',
      boxShadow: '0 30px 70px rgba(120,74,48,.34),inset 0 1px 0 rgba(255,255,255,.35)',
      padding: '24px 26px 22px', transform: 'rotate(-.35deg)', color: '#FFF7F0', minHeight: 300, flex: 'none',
      display: 'flex', flexDirection: 'column', animation: 'heroin .35s ease'
    } as CSSProperties,
    heroTipo: hero?.tipo ?? '',
    heroTitolo: hero?.titolo ?? '',
    heroFonte: hero?.fonte ?? '',
    heroOra: quando(hero?.quando),
    heroUrgenza: hero?.urgenza ?? '',
    heroTesto: hero?.testo ?? '',
    heroLong,
    heroToggle: () => setHeroLong(v => !v),
    heroHaDoc: !!hero?.doc,
    heroPrimary: hero ? risolvi(hero) : noop,
    heroAsk: hero ? () => chiedi(`${hero.titolo} — dimmi di più`) : noop,
    heroSkip: hero ? () => setAperti(a => [...a.slice(1), a[0]]) : noop,
    apriDoc: hero?.doc ? () => { api.documento(hero.doc!).then(setDoc).catch(() => mostraToast('Non trovo più il documento.')) } : noop,

    resto: resto.map((i, ix) => ({
      id: i.id, tipo: i.tipo, titolo: i.titolo, fonte: i.fonte ?? '', ora: quando(i.quando),
      testo: i.testo, urgenza: i.urgenza ?? '',
      dot: dot(COLORE_FONTE[i.fonte ?? ''] ?? '#C4623B'),
      pill: {
        flex: 'none', fontSize: '12px', fontWeight: 700, letterSpacing: '.02em', color: '#8E3F1F',
        background: 'rgba(196,98,59,.16)', border: '1px solid rgba(196,98,59,.32)', borderRadius: 99, padding: '5px 11px'
      } as CSSProperties,
      row: {
        display: 'flex', gap: 13, alignItems: 'flex-start', padding: '17px 21px', cursor: 'pointer',
        borderTop: ix === 0 ? 'none' : '1px solid rgba(34,39,31,.09)'
      } as CSSProperties,
      onPromote: () => { setAperti(a => [i, ...a.filter(x => x.id !== i.id)]); setHeroLong(false) }
    })),

    hasDone: fatte.length > 0, doneCount: fatte.length, doneOpen,
    toggleDone: () => setDoneOpen(v => !v),
    doneChevron: { display: 'flex', transform: doneOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .2s' } as CSSProperties,
    fatte: fatte.map((d, ix) => ({
      id: d.id, esito: d.titolo, tipo: d.tipo, fonte: d.fonte ?? '', at: quando(d.quando),
      testo: d.testo, open: openDone === d.id, label: openDone === d.id ? 'Chiudi' : 'Vedi',
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
          mostraToast('Rimessa in cima al feed.')
        } catch {
          setAperti(a => a.filter(x => x.id !== d.id))
          setFatte(f => [d, ...f])
          mostraToast('Non sono riuscito a rimetterla.')
        }
      },
      onAsk: (e: React.MouseEvent) => { e.stopPropagation(); chiedi(`${d.titolo} — dimmi di più`) }
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
        mostraToast('Non sono riuscito ad annullare.')
      })
    },

    // — chat —
    threads: threads.map(t => ({
      id: t.id, titolo: t.titolo, quando: quando(t.quando),
      row: {
        display: 'flex', alignItems: 'center', gap: 6, padding: '8px 9px', borderRadius: 10, cursor: 'pointer',
        background: t.id === thread ? 'rgba(255,255,255,.92)' : t.id === hoverThread ? 'rgba(255,255,255,.6)' : 'transparent'
      } as CSSProperties,
      binStyle: {
        width: 22, height: 22, flex: 'none', display: 'grid', placeItems: 'center', border: 'none',
        background: 'none', padding: 0, cursor: 'pointer', color: '#C0392B',
        opacity: t.id === hoverThread ? 1 : 0, transition: 'opacity .15s'
      } as CSSProperties,
      onEnter: () => setHoverThread(t.id),
      onLeave: () => setHoverThread(h => (h === t.id ? null : h)),
      onClick: () => setThread(t.id),
      onDelete: async (e: React.MouseEvent) => {
        e.stopPropagation()
        await api.eliminaChat(t.id).catch(() => {})
        const resto = threads.filter(x => x.id !== t.id)
        setThreads(resto)
        if (thread === t.id) setThread(resto[0]?.id ?? null)
        mostraToast('Chat eliminata.')
      }
    })),
    newChat: () => { setThread(`th${Date.now()}`); setMessaggi([]); setScreen('chat') },
    chatEmpty: messaggi.length === 0,
    chatTitolo: th?.titolo ?? 'Nuova chat',
    pensando,
    messages: messaggi.map(m => ({
      id: m.id, text: m.text,
      hasSources: !!(m.sources && m.sources.length), sources: m.sources ?? [],
      row: { display: 'flex', justifyContent: m.role === 'u' ? 'flex-end' : 'flex-start' } as CSSProperties,
      bubble: (m.role === 'u'
        ? {
            maxWidth: '74%', padding: '13px 17px', borderRadius: '20px 18px 6px 20px',
            background: 'linear-gradient(130deg,rgba(176,82,46,.92),rgba(140,100,64,.9))',
            color: '#FFF7F0', fontSize: '15px', lineHeight: 1.55, whiteSpace: 'pre-wrap'
          }
        : {
            maxWidth: '80%', padding: '15px 18px', borderRadius: '20px 20px 20px 6px',
            background: 'rgba(255,253,249,.78)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,.8)', boxShadow: '0 16px 40px rgba(84,64,44,.1)',
            color: '#22271F', fontSize: '15px', lineHeight: 1.6, whiteSpace: 'pre-wrap'
          }) as CSSProperties
    })),
    prompts: stato.conteggi.totale
      ? [
          { id: 'p1', text: 'Cosa è arrivato oggi?', onClick: () => chiedi('Cosa è arrivato oggi?') },
          { id: 'p2', text: 'Chi aspetta una mia risposta?', onClick: () => chiedi('Chi aspetta una mia risposta?') },
          { id: 'p3', text: 'Riassumimi la settimana', onClick: () => chiedi('Riassumimi la settimana') }
        ]
      : [],
    draftMsg,
    onType: (e: { target: { value: string } }) => setDraftMsg(e.target.value),
    onKey: (e: React.KeyboardEvent) => { if (e.key === 'Enter' && draftMsg.trim()) chiedi(draftMsg.trim()) },
    send: () => { if (draftMsg.trim()) chiedi(draftMsg.trim()) },

    // — mappa —
    mappaMeta: gruppi.length
      ? `${stato.conteggi.totale.toLocaleString('it-IT')} documenti · ${gruppi.length} gruppi`
      : 'ancora nessun documento',
    mappaVuota: !gruppi.length,
    mapFull,
    expandMap: () => setMapFull(true),
    closeMap: () => setMapFull(false),
    resetView: () => { mappa.reset(); setFiltro(null) },
    legenda: gruppi.map(g => {
      const on = !filtro || filtro === g.id
      return {
        id: g.id, nome: g.nome,
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
    selTipo: cl ? `${cl.nodi.toLocaleString('it-IT')} documenti` : '',
    selNome: cl?.nome ?? 'Niente ancora',
    selDot: { width: 10, height: 10, borderRadius: '50%', background: cl?.colore ?? '#8A7A6A', flex: 'none', marginTop: 4 } as CSSProperties,
    selTesto: cl
      ? `Tutto quello che è arrivato da ${cl.nome.toLowerCase()}. Clicca un nodo per filtrare, o chiedi qui sotto.`
      : 'Collega una fonte e qui comparirà quello che Myynd ha letto.',
    nodePlaceholder: cl ? `Chiedi su ${cl.nome.toLowerCase()}…` : 'Chiedi…',
    nodeMsg,
    onNodeType: (e: { target: { value: string } }) => setNodeMsg(e.target.value),
    onNodeKey: (e: React.KeyboardEvent) => { if (e.key === 'Enter' && nodeMsg.trim()) chiedi(nodeMsg.trim()) },
    askNode: () => { if (nodeMsg.trim()) chiedi(nodeMsg.trim()) },

    // — preferenze —
    toni: TONI.map(t => ({
      ...t,
      onClick: () => { setStato(s => ({ ...s, config: { ...s.config, tono: t.id } })); api.profilo({ tono: t.id }).catch(() => {}) },
      style: (t.id === stato.config.tono
        ? { padding: '10px 20px', borderRadius: 99, border: '1px solid rgba(255,255,255,.5)', background: 'linear-gradient(120deg,#C4623B,#7E9C82)', color: '#FFF7F0', fontFamily: 'inherit', fontSize: '13.5px', fontWeight: 500, cursor: 'pointer' }
        : { padding: '10px 20px', borderRadius: 99, border: '1px solid rgba(34,39,31,.2)', background: 'rgba(255,255,255,.5)', color: '#22271F', fontFamily: 'inherit', fontSize: '13.5px', cursor: 'pointer' }) as CSSProperties
    })),
    tonoEsempio: ESEMPIO_TONO[stato.config.tono] ?? ESEMPIO_TONO.diretto,
    autonomie: AUTONOMIE.map(a => ({
      ...a,
      onClick: () => { setStato(s => ({ ...s, config: { ...s.config, autonomia: a.id } })); api.profilo({ autonomia: a.id }).catch(() => {}) },
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
    connMeta: `${connOn.length} attivi · ${connettori.filter(c => c.pronto).length - connOn.length} da collegare`,
    connAttivi: connOn.map(c => ({
      id: c.id, nome: c.nome, stato: c.documenti ? `${c.documenti} documenti` : 'collegato',
      onClick: async () => {
        await api.scollega(c.id).catch(() => {})
        await Promise.all([ricaricaStato(), caricaMente()])
        mostraToast(`${c.nome} scollegato.`)
      }
    })),
    connSpenti: connettori.filter(c => c.pronto && !c.collegato).map(c => ({
      id: c.id, nome: c.nome, nota: c.nota, onClick: apriConnessioni
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
