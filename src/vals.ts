import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  ALLEGATI, AUTOS, AUTO_ON, CLUSTERS, COMPOSER, CONNETTORI, DOCS, FEED, RISULTATI, THREADS, WORDS,
  fmtOre, type Connettore, type Fonte, type Screen, type Thread
} from './data'
import { BALL } from './brain'
import { MENU_OFF, MENU_ON, NAV_OFF, NAV_ON, dot, knob, track } from './ui'
import { useMappa } from './useMappa'

type Toast = { text: string; undo: boolean } | null
type Fatta = { id: string; at: string }

/**
 * Tutto lo stato del prototipo e i valori già pronti per il rendering.
 * Ricalca `renderVals()` del design: le schermate ricevono questo oggetto
 * e non calcolano niente per conto loro.
 */
export function useVals() {
  const [screen, setScreen] = useState<Screen>('myynd')
  const [menu, setMenu] = useState(false)
  const [search, setSearch] = useState(false)
  const [query, setQuery] = useState('')

  const [order, setOrder] = useState<string[]>(FEED.map(f => f.id))
  const [done, setDone] = useState<Fatta[]>([])
  const [doneOpen, setDoneOpen] = useState(true)
  const [openDone, setOpenDone] = useState<string | null>(null)
  const [heroLong, setHeroLong] = useState(false)

  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [bodies, setBodies] = useState<Record<string, string>>({})
  const [orig, setOrig] = useState<string | null>(null)
  const [doc, setDoc] = useState(false)

  const [autoOn, setAutoOn] = useState<Record<string, boolean>>({ ...AUTO_ON })
  const [openAuto, setOpenAuto] = useState<string | null>(null)

  const [conn, setConn] = useState<Connettore[]>(CONNETTORI.map(c => ({ ...c })))

  const [threads, setThreads] = useState<Thread[]>(THREADS.map(t => ({ ...t, messages: [...t.messages] })))
  const [thread, setThread] = useState<string | null>('th0')
  const [hoverThread, setHoverThread] = useState<string | null>(null)
  const [draftMsg, setDraftMsg] = useState('')

  const [sel, setSel] = useState('clienti')
  const [filtro, setFiltro] = useState<string | null>(null)
  const [mapFull, setMapFull] = useState(false)
  const [nodeMsg, setNodeMsg] = useState('')

  const [tono, setTono] = useState('diretto')
  const [autonomia, setAutonomia] = useState('preparare')
  const [prefs, setPrefs] = useState<Record<string, boolean>>({ mattina: true, silenzio: false, autoinvio: false, imparare: true })
  const [areeOff, setAreeOff] = useState<Record<string, boolean>>({ buste: true, legale: true, prezzi: false, hr: false })

  const [toast, setToast] = useState<Toast>(null)
  const [nuova, setNuova] = useState(false)
  const [nuovaText, setNuovaText] = useState('')
  const [ticket, setTicket] = useState(false)
  const [ticketText, setTicketText] = useState('')

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

  const onPick = useCallback((s: string, cluster: string) => {
    setSel(s)
    setFiltro(cluster)
  }, [])
  const mappa = useMappa(cvA, cvB, mapFull, filtro, sel, onPick)

  const th = threads.find(t => t.id === thread) || threads[0]
  const nMsg = th ? th.messages.length : 0

  // la chat resta incollata in fondo quando arriva un messaggio o si cambia schermata
  useEffect(() => {
    const el = threadRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    const id = requestAnimationFrame(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight })
    return () => cancelAnimationFrame(id)
  }, [nMsg, screen])

  const go = (s: Screen) => (e?: { preventDefault?: () => void }) => {
    if (e && e.preventDefault) e.preventDefault()
    setScreen(s)
    setSearch(false)
    setMenu(false)
  }

  const say = (text: string, answer: string, sources?: Fonte[]) => {
    const n = Date.now()
    setScreen('chat')
    setSearch(false)
    setMapFull(false)
    setMenu(false)
    setDraftMsg('')
    setNodeMsg('')
    setThreads(ts => ts.map(t => t.id === thread
      ? { ...t, messages: [...t.messages, { id: 'u' + n, role: 'u' as const, text }, { id: 'a' + n, role: 'a' as const, text: answer, sources }] }
      : t))
  }

  const items = order.map(id => FEED.find(f => f.id === id)!).filter(Boolean)
  const hero = items[0]
  const rest = items.slice(1)
  const connOn = conn.filter(c => c.on).length
  const apertaAuto = AUTOS.find(a => a.id === openAuto)
  const ore = AUTOS.reduce((t, a) => t + (autoOn[a.id] ? a.ore : 0), 0)
  const attive = AUTOS.filter(a => autoOn[a.id]).length
  const cl = CLUSTERS.find(c => c.id === sel.split('|')[0]) || CLUSTERS[0]
  const selName = sel.includes('|') ? sel.split('|')[1] : null
  const q = query.trim().toLowerCase()
  const edited = hero ? bodies[hero.id] : null
  const origItem = orig ? FEED.find(f => f.id === orig)! : null

  const resolve = (item: typeof FEED[number]) => () => {
    setOrder(o => o.filter(x => x !== item.id))
    setHeroLong(false)
    setEditing(false)
    setDone(d => [{ id: item.id, at: '14:32' }, ...d])
    mostraToast(bodies[item.id] ? 'Inviata con le tue modifiche.' : item.toast, item.undo)
  }

  const noop = () => {}

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
    connCount: connOn, apertiCount: items.length,
    badge: { fontSize: '11.5px', fontWeight: 500, opacity: items.length ? 1 : 0.35 } as CSSProperties,

    headline: items.length === 0 ? 'Tutto chiuso, mentre dormivi.' : WORDS[items.length] + ', mentre dormivi.',
    hasHero: !!hero, feedEmpty: items.length === 0 && done.length === 0, hasRest: rest.length > 0,
    heroStyle: {
      borderRadius: '28px 24px 28px 22px',
      background: 'linear-gradient(138deg,rgba(176,82,46,.9),rgba(154,100,55,.88) 46%,rgba(65,96,74,.9))',
      backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
      border: '1px solid rgba(255,255,255,.6)',
      boxShadow: '0 30px 70px rgba(120,74,48,.34),inset 0 1px 0 rgba(255,255,255,.35)',
      padding: '24px 26px 22px', transform: 'rotate(-.35deg)', color: '#FFF7F0', minHeight: 340, flex: 'none',
      display: 'flex', flexDirection: 'column', animation: 'heroin .35s ease'
    } as CSSProperties,
    heroTipo: hero ? hero.tipo : '', heroFonte: hero ? hero.fonte : '', heroOra: hero ? hero.ora : '',
    heroUrgenza: hero ? hero.urgenza : '',
    heroTesto: hero ? hero.testo : '',
    heroQuoteFonte: hero ? hero.quoteFonte : '', heroQuoteTitolo: hero ? hero.quoteTitolo : '',
    heroQuote: hero ? edited || (heroLong ? hero.quoteFull : hero.quote) : '',
    heroSecondaryLabel: hero ? (heroLong || edited ? 'Chiudi' : hero.expand) : '',
    heroSecondary: hero ? () => setHeroLong(v => !v) : noop,
    heroEditText: editText, heroEditabile: true, heroModificata: !!edited,
    heroEditLabel: hero ? COMPOSER[hero.id].label : '',
    heroOpenLabel: hero ? 'Apri in ' + hero.app : '',
    heroHasAllegato: !!(hero && ALLEGATI[hero.id]),
    heroAllegato: hero && ALLEGATI[hero.id] ? ALLEGATI[hero.id].nome : '',
    heroAllegatoMeta: hero && ALLEGATI[hero.id] ? ALLEGATI[hero.id].meta : '',

    compOpen: !!(hero && editing),
    compApp: hero ? hero.app : '', compStato: hero ? COMPOSER[hero.id].stato : '',
    compCampi: hero ? COMPOSER[hero.id].campi : [],
    compDot: { width: 7, height: 7, borderRadius: '50%', flex: 'none', background: hero ? hero.colore : '#C4623B' } as CSSProperties,
    startEdit: hero ? () => { setEditing(true); setEditText(edited || hero.quoteFull) } : noop,
    onHeroEdit: (e: { target: { value: string } }) => setEditText(e.target.value),
    saveEdit: hero
      ? () => { setEditing(false); setBodies(b => ({ ...b, [hero.id]: editText })); mostraToast('Salvata. La invii quando vuoi.') }
      : noop,
    sendFromComposer: hero
      ? () => { setBodies(b => ({ ...b, [hero.id]: editText })); resolve(hero)() }
      : noop,
    cancelEdit: () => setEditing(false),

    docOpen: !!(hero && doc), openDoc: () => setDoc(true), closeDoc: () => setDoc(false),
    docTipo: hero && DOCS[hero.id] ? DOCS[hero.id].tipo : '',
    docNumero: hero && DOCS[hero.id] ? DOCS[hero.id].numero : '',
    docData: hero && DOCS[hero.id] ? DOCS[hero.id].data : '',
    docMeta: hero && DOCS[hero.id] ? DOCS[hero.id].meta : [],
    docHasRighe: !!(hero && DOCS[hero.id] && DOCS[hero.id].righe.length),
    docRighe: hero && DOCS[hero.id] ? DOCS[hero.id].righe : [],
    docTotali: hero && DOCS[hero.id] ? DOCS[hero.id].totali : [],
    docNote: hero && DOCS[hero.id] ? DOCS[hero.id].note : '',

    openOriginal: hero ? () => setOrig(hero.id) : noop,
    closeOriginal: () => setOrig(null),
    editFromOriginal: hero ? () => { setOrig(null); setEditing(true); setEditText(edited || hero.quoteFull) } : noop,
    origOpen: !!origItem,
    origApp: origItem ? origItem.app : '', origColore: origItem ? origItem.colore : '#C4623B',
    origTitolo: origItem ? origItem.orig.titolo : '', origCampi: origItem ? origItem.orig.campi : [],
    origCorpo: origItem ? origItem.orig.corpo : '',

    heroPrimaryLabel: hero ? hero.p : '',
    heroPrimary: hero ? resolve(hero) : noop,
    heroAsk: hero ? () => say(hero.q, hero.a, hero.src) : noop,
    heroSkip: hero ? () => { setOrder(o => [...o.slice(1), o[0]]); setHeroLong(false) } : noop,
    resto: rest.map((i, ix) => ({
      id: i.id, tipo: i.tipo, fonte: i.fonte, ora: i.ora, testo: i.testo, urgenza: i.urgenza, dot: dot(i.colore),
      pill: {
        flex: 'none', fontSize: '12px', fontWeight: 700, letterSpacing: '.02em', color: '#8E3F1F',
        background: 'rgba(196,98,59,.16)', border: '1px solid rgba(196,98,59,.32)', borderRadius: 99, padding: '5px 11px'
      } as CSSProperties,
      row: {
        display: 'flex', gap: 13, alignItems: 'flex-start', padding: '17px 21px', cursor: 'pointer',
        borderTop: ix === 0 ? 'none' : '1px solid rgba(34,39,31,.09)'
      } as CSSProperties,
      onPromote: () => { setOrder(o => [i.id, ...o.filter(x => x !== i.id)]); setHeroLong(false) }
    })),
    resetFeed: () => { setOrder(FEED.map(f => f.id)); setDone([]) },

    hasDone: done.length > 0, doneCount: done.length, doneOpen,
    toggleDone: () => setDoneOpen(v => !v),
    doneChevron: { display: 'flex', transform: doneOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .2s' } as CSSProperties,
    fatte: done.map((d, ix) => {
      const item = FEED.find(f => f.id === d.id)!
      const open = openDone === d.id
      return {
        id: d.id, at: d.at, esito: item.esito, tipo: item.tipo, fonte: item.fonte,
        quoteTitolo: item.quoteTitolo, quote: bodies[d.id] || item.quoteFull, open,
        label: open ? 'Chiudi' : 'Vedi',
        wrap: {
          borderTop: ix === 0 ? 'none' : '1px solid rgba(34,39,31,.08)',
          background: open ? 'rgba(255,255,255,.5)' : 'transparent'
        } as CSSProperties,
        onOpen: () => setOpenDone(v => (v === d.id ? null : d.id)),
        onRestore: (e: React.MouseEvent) => {
          e.stopPropagation()
          setOrder(o => [d.id, ...o])
          setDone(ds => ds.filter(x => x.id !== d.id))
          setOpenDone(null)
          mostraToast('Rimessa in cima al feed.')
        },
        onAsk: (e: React.MouseEvent) => { e.stopPropagation(); say(item.q, item.a, item.src) }
      }
    }),

    toastOn: !!toast, toastText: toast ? toast.text : '', toastUndo: !!(toast && toast.undo),
    undo: () => {
      const last = done[0]
      setToast(null)
      if (!last) return
      setOrder(o => [last.id, ...o])
      setDone(ds => ds.slice(1))
    },

    threads: threads.map(t => ({
      id: t.id, titolo: t.titolo, quando: t.quando,
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
      onDelete: (e: React.MouseEvent) => {
        e.stopPropagation()
        setThreads(ts => {
          const left = ts.filter(x => x.id !== t.id)
          setThread(cur => (cur === t.id ? (left[0] ? left[0].id : null) : cur))
          return left
        })
        mostraToast('Chat eliminata.')
      }
    })),
    newChat: () => {
      const id = 'th' + Date.now()
      setThread(id)
      setScreen('chat')
      setThreads(ts => [{ id, titolo: 'Nuova chat', quando: 'ora', messages: [] }, ...ts])
    },
    chatEmpty: !th || th.messages.length === 0,
    messages: th
      ? th.messages.map(m => ({
          id: m.id, text: m.text, hasSources: !!(m.sources && m.sources.length), sources: m.sources || [],
          row: { display: 'flex', justifyContent: m.role === 'u' ? 'flex-end' : 'flex-start' } as CSSProperties,
          bubble: (m.role === 'u'
            ? {
                maxWidth: '74%', padding: '13px 17px', borderRadius: '20px 18px 6px 20px',
                background: 'linear-gradient(130deg,rgba(176,82,46,.92),rgba(140,100,64,.9))',
                color: '#FFF7F0', fontSize: '15px', lineHeight: 1.55
              }
            : {
                maxWidth: '80%', padding: '15px 18px', borderRadius: '20px 20px 20px 6px',
                background: 'rgba(255,253,249,.78)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,.8)', boxShadow: '0 16px 40px rgba(84,64,44,.1)',
                color: '#22271F', fontSize: '15px', lineHeight: 1.6
              }) as CSSProperties
        }))
      : [],
    prompts: [
      { id: 'p1', text: 'Chi non mi ha ancora risposto?', onClick: () => say('Chi non mi ha ancora risposto?', 'Tre: Bertoli (preventivo, 6 giorni), lo studio del commercialista (F24 di luglio, 4 giorni) e Vetreria Sile (disponibilità settembre, 2 giorni).', [{ id: 'x1', label: 'Gmail' }]) },
      { id: 'p2', text: 'Cosa scade questa settimana?', onClick: () => say('Cosa scade questa settimana?', "Il preventivo per Studio Ferri (venerdì), l'F24 (giovedì) e la conferma di consegna a Ceramiche Lodi che avevi promesso in call.", [{ id: 'x3', label: 'Calendario' }, { id: 'x4', label: 'Fatture in Cloud' }]) },
      { id: 'p3', text: 'Dove stiamo perdendo margine?', onClick: () => say('Dove stiamo perdendo margine?', 'Sui trasporti: Rossi ha alzato del 12% da giugno e due consegne su tre passano da loro. Poi sui pezzi su misura sotto i 500 euro.', [{ id: 'x5', label: 'Fatture fornitori' }]) }
    ],
    draftMsg,
    onType: (e: { target: { value: string } }) => setDraftMsg(e.target.value),
    onKey: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && draftMsg.trim()) say(draftMsg.trim(), 'Sto cercando tra le fonti collegate. In questo prototipo le risposte pronte sono quelle dei suggerimenti qui sotto.')
    },
    send: () => {
      if (draftMsg.trim()) say(draftMsg.trim(), 'Sto cercando tra le fonti collegate. In questo prototipo le risposte pronte sono quelle dei suggerimenti qui sotto.')
    },

    autoMeta: attive + ' attive · ' + fmtOre(ore) + ' risparmiate questo mese',
    automazioni: AUTOS.map(a => {
      const on = !!autoOn[a.id]
      return {
        id: a.id, nome: a.nome, desc: a.desc, esecuzioni: a.esecuzioni, risparmio: fmtOre(a.ore), ultima: a.ultima,
        card: {
          borderRadius: 22, padding: '20px', cursor: 'pointer', border: '1px solid rgba(255,255,255,.78)',
          background: a.id === openAuto
            ? 'linear-gradient(150deg,rgba(196,98,59,.2),rgba(255,253,249,.82) 50%,rgba(126,156,130,.24))'
            : 'rgba(255,253,249,.66)',
          backdropFilter: 'blur(22px)', WebkitBackdropFilter: 'blur(22px)',
          boxShadow: a.id === openAuto ? '0 26px 60px rgba(84,64,44,.2)' : '0 18px 44px rgba(84,64,44,.1)',
          opacity: on ? 1 : 0.62, transition: 'box-shadow .2s, opacity .2s'
        } as CSSProperties,
        track: track(on), knob: knob(),
        onOpen: () => setOpenAuto(v => (v === a.id ? null : a.id)),
        onToggle: (e: React.MouseEvent) => {
          e.stopPropagation()
          setAutoOn(s => ({ ...s, [a.id]: !s[a.id] }))
          mostraToast(on ? a.nome + ' in pausa.' : a.nome + ' riattivata.')
        }
      }
    }),
    autoDetail: !!apertaAuto, detailNome: apertaAuto ? apertaAuto.nome : '',
    detailMeta: apertaAuto ? apertaAuto.esecuzioni + ' esecuzioni · ' + fmtOre(apertaAuto.ore) + ' · ultima ' + apertaAuto.ultima : '',
    detailSteps: apertaAuto ? apertaAuto.steps : [],
    closeAuto: () => setOpenAuto(null),

    nuovaOpen: nuova, nuovaText,
    openNuova: () => setNuova(true), closeNuova: () => setNuova(false),
    onNuova: (e: { target: { value: string } }) => setNuovaText(e.target.value),
    sendNuova: () => { setNuova(false); setNuovaText(''); mostraToast('Richiesta ricevuta. Te la faccio provare prima di attivarla.') },
    ticketOpen: ticket, ticketText,
    openTicket: () => setTicket(true), closeTicket: () => setTicket(false),
    onTicket: (e: { target: { value: string } }) => setTicketText(e.target.value),
    sendTicket: () => { setTicket(false); setTicketText(''); mostraToast('Ticket aperto. Risposta entro un giorno lavorativo.') },

    mappaMeta: BALL.nodes.length.toLocaleString('it-IT') + ' nodi · 5 gruppi',
    mapFull,
    expandMap: () => setMapFull(true),
    closeMap: () => setMapFull(false),
    resetView: () => { mappa.reset(); setFiltro(null) },
    legenda: CLUSTERS.map(c => {
      const on = !filtro || filtro === c.id
      return {
        id: c.id, nome: c.nome,
        chip: {
          display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 99,
          cursor: 'pointer', fontFamily: 'inherit', fontSize: '11.5px',
          background: on ? 'rgba(255,247,240,.12)' : 'rgba(255,247,240,.04)',
          border: '1px solid ' + (on ? 'rgba(255,247,240,.28)' : 'rgba(255,247,240,.1)'),
          color: 'rgba(255,247,240,' + (on ? '.94' : '.45') + ')'
        } as CSSProperties,
        dot: { width: 8, height: 8, borderRadius: '50%', background: c.colore, flex: 'none' } as CSSProperties,
        onClick: () => { setFiltro(f => (f === c.id ? null : c.id)); setSel(c.id) }
      }
    }),
    selTipo: selName ? cl.nome : cl.tipo, selNome: selName || cl.nome,
    selDot: { width: 10, height: 10, borderRadius: '50%', background: cl.colore, flex: 'none', marginTop: 4 } as CSSProperties,
    selTesto: selName ? 'Nodo dentro ' + cl.nome.toLowerCase() + '. ' + cl.testo : cl.testo,
    selFatti: cl.fatti,
    selChiesto: cl.chiesto.map((c, i) => ({ id: cl.id + i, q: c.q, onClick: () => say(c.q, c.a) })),
    nodePlaceholder: 'Chiedi su ' + (selName || cl.nome.toLowerCase()) + '…',
    nodeMsg,
    onNodeType: (e: { target: { value: string } }) => setNodeMsg(e.target.value),
    onNodeKey: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && nodeMsg.trim()) {
        say(nodeMsg.trim() + ' (' + (selName || cl.nome) + ')', cl.testo + ' Dimmi quale nodo ti interessa e scendo nel dettaglio.')
      }
    },
    askNode: () => say(
      (nodeMsg.trim() || 'Riassumimi ' + (selName || cl.nome.toLowerCase())) + (nodeMsg.trim() ? ' (' + (selName || cl.nome) + ')' : ''),
      cl.testo + ' Vuoi che parta da quello che è cambiato oggi?'
    ),

    toni: [{ id: 'diretto', label: 'Diretto' }, { id: 'cordiale', label: 'Cordiale' }, { id: 'formale', label: 'Formale' }].map(t => ({
      ...t,
      onClick: () => setTono(t.id),
      style: (t.id === tono
        ? { padding: '10px 20px', borderRadius: 99, border: '1px solid rgba(255,255,255,.5)', background: 'linear-gradient(120deg,#C4623B,#7E9C82)', color: '#FFF7F0', fontFamily: 'inherit', fontSize: '13.5px', fontWeight: 500, cursor: 'pointer' }
        : { padding: '10px 20px', borderRadius: 99, border: '1px solid rgba(34,39,31,.2)', background: 'rgba(255,255,255,.5)', color: '#22271F', fontFamily: 'inherit', fontSize: '13.5px', cursor: 'pointer' }) as CSSProperties
    })),
    tonoEsempio: tono === 'diretto'
      ? '"Ciao Marta, ti mando il preventivo aggiornato. Consegna quattro settimane dalla conferma."'
      : tono === 'cordiale'
        ? '"Ciao Marta, come promesso ti mando il preventivo aggiornato: spero sia tutto chiaro, fammi sapere."'
        : '"Gentile Dott.ssa Ferri, in allegato il preventivo aggiornato come da Sua richiesta. Resto a disposizione."',
    autonomie: [
      { id: 'osservare', titolo: 'Solo osservare', nota: 'Legge e indicizza. Risponde solo se le chiedi.' },
      { id: 'preparare', titolo: 'Preparare e aspettare', nota: 'Scrive bozze e brief, niente esce senza il tuo Invia.' },
      { id: 'agire', titolo: 'Agire sulla routine', nota: 'Archivia e risponde dove hai già confermato tre volte.' }
    ].map(a => ({
      ...a,
      onClick: () => setAutonomia(a.id),
      row: {
        display: 'flex', gap: 13, alignItems: 'flex-start', padding: '13px 14px', borderRadius: 16, cursor: 'pointer',
        background: autonomia === a.id ? 'rgba(255,255,255,.85)' : 'transparent',
        boxShadow: autonomia === a.id ? '0 12px 30px rgba(84,64,44,.1)' : 'none'
      } as CSSProperties,
      radio: {
        width: 15, height: 15, flex: 'none', borderRadius: '50%', marginTop: 3,
        border: autonomia === a.id ? '4px solid #C4623B' : '1.5px solid rgba(34,39,31,.35)',
        background: autonomia === a.id ? '#FFF7F0' : 'transparent'
      } as CSSProperties
    })),
    switches: [
      { id: 'mattina', titolo: 'Riepilogo del mattino', nota: 'Alle 7:30.' },
      { id: 'silenzio', titolo: 'Silenzio dopo le 19', nota: 'Niente notifiche fino al mattino.' },
      { id: 'autoinvio', titolo: 'Invio automatico delle bozze', nota: 'Solo per i clienti già approvati tre volte.' },
      { id: 'imparare', titolo: 'Impara dalle mie correzioni', nota: 'Tiene la tua versione come riferimento.' }
    ].map(x => ({
      ...x, track: track(prefs[x.id]), knob: knob(),
      onToggle: () => setPrefs(p => ({ ...p, [x.id]: !p[x.id] }))
    })),
    aree: [
      { id: 'buste', label: 'Buste paga' }, { id: 'legale', label: 'Contenzioso legale' },
      { id: 'prezzi', label: 'Prezzi speciali' }, { id: 'hr', label: 'Colloqui e HR' }
    ].map(a => ({
      ...a,
      onClick: () => setAreeOff(s => ({ ...s, [a.id]: !s[a.id] })),
      style: (areeOff[a.id]
        ? { padding: '8px 15px', borderRadius: 99, border: '1px solid #A34E2D', background: 'rgba(196,98,59,.14)', color: '#8E3F1F', fontFamily: 'inherit', fontSize: '13px', cursor: 'pointer' }
        : { padding: '8px 15px', borderRadius: 99, border: '1px dashed rgba(34,39,31,.3)', background: 'none', color: 'rgba(34,39,31,.6)', fontFamily: 'inherit', fontSize: '13px', cursor: 'pointer' }) as CSSProperties
    })),

    connMeta: connOn + ' attivi · ' + (conn.length - connOn) + ' da collegare',
    connAttivi: conn.filter(c => c.on).map(c => ({
      id: c.id, nome: c.nome, stato: c.stato,
      onClick: () => {
        setConn(cs => cs.map(x => (x.id === c.id ? { ...x, on: false, stato: '' } : x)))
        mostraToast(c.nome + ' scollegato.')
      }
    })),
    connSpenti: conn.filter(c => !c.on).map(c => ({
      id: c.id, nome: c.nome,
      onClick: () => {
        setConn(cs => cs.map(x => (x.id === c.id ? { ...x, on: true, stato: 'ora' } : x)))
        mostraToast(c.nome + ' collegato.')
      }
    })),

    searchOpen: search, query,
    openSearch: () => setSearch(true),
    closeSearch: () => { setSearch(false); setQuery('') },
    onQuery: (e: { target: { value: string } }) => setQuery(e.target.value),
    risultati: RISULTATI.filter(r => !q || (r.titolo + ' ' + r.fonte).toLowerCase().includes(q)).map(r => ({
      id: r.id, titolo: r.titolo, fonte: r.fonte, quando: r.quando, dot: dot(r.colore),
      onClick: () => {
        setScreen(r.screen)
        setSearch(false)
        setQuery('')
        setMenu(false)
        if (r.cluster) { setSel(r.cluster); setFiltro(r.cluster) }
      }
    }))
  }
}

export type Vals = ReturnType<typeof useVals>
