import { useCallback, useEffect, useLayoutEffect, useRef, useState, type TextareaHTMLAttributes } from 'react'
import { giornoLocale, spostaGiorno } from '../oggi/giorni'
import { api, apiP4, type PaginaAvvio, type Stato, type StatoAvvio } from '../api'
import { frasi, t } from '../lingua'
import { aperta as rigaAperta, daGuardare, leggiPoiScegli, nonLette } from '../lettura-fonti'
import { trovato, trovatoDurante } from '../conta-fonti'
import { letturaFonti, useLettura } from '../lettura-app'
import { ConnectorIcon } from '../components/ConnectorIcon'
import { Form } from '../components/forms'
import { RigheLettura } from '../components/RigheLettura'
import { BottoneSicuro } from '../ui'
import { IconFreccia } from '../icons'
import { Scena, OnboardAttesa, OnboardErrore, type Momento } from './Scena'
import { Introduzione } from './Introduzione'
import { momentoAllaRipresa, riprendeLeggendo } from './passi'

// i modelli non si leggono: OpenAI stava fra le fonti e il server lo rifiutava
const NON_FONTI = new Set(['claude', 'openai', 'compatibile', 'mind2do'])
/*
 * Le prime schede (P4). Su un Mac, nove: Mail e Calendario del Mac subito
 * dopo il Mac, senza niente da incollare; WhatsApp Business, Granola, Dropbox
 * e GitHub stanno dietro «Tutte le fonti» (spostate, non tolte). Altrove, sei.
 */
const PRIORITA_MAC = ['desktop', 'postamac', 'agendamac', 'posta', 'calendario', 'notion', 'slack', 'note', 'conversazioni']
const PRIORITA_FONTI = ['desktop', 'posta', 'notion', 'slack', 'calendario', 'github']
/** I tre modi di collegare chi ragiona, quando nessuno è collegato: la stessa scheda delle Fonti. */
const MODELLI: { id: string; etichetta: string }[] = [
  { id: 'claude', etichetta: 'Anthropic' }, { id: 'openai', etichetta: 'OpenAI' }, { id: 'compatibile', etichetta: 'Altro modello' }
]
/** Quanto si aspetta prima che «Continua» si possa premere mentre legge. */
const CONTINUA_DOPO_MS = 10_000
/** Quanto aspetta al massimo la fine dell'avvio, con i conti che salgono, prima di entrare. */
const FINE_MASSIMO_MS = 20_000
/** La scheda aperta, per chi riapre l'app (anche dopo averla riaperta per un permesso). */
const chiaveScheda = (id: string) => `myynd.avvio.fonte.${id}`
/**
 * Il passo che vede la persona, per un indicatore «2 di 3»: le fonti e i loro
 * estratti sono un passo solo, perché gli estratti sono quello che la lettura ha trovato.
 */
export const PASSO_AVVIO: Record<Momento, number> = { 0: 1, 1: 2, 2: 2, 3: 3 }
export const PASSI_AVVIO = 3
const pausa = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
const messaggio = (e: unknown) => e instanceof Error ? e.message : String(e)
/** Il segno, per questa scheda del browser, che si stava leggendo: chi ricarica torna alle fonti. */
const chiaveLettura = (id: string) => `myynd.avvio.lettura.${id}`
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
  /** La scheda aperta sotto le fonti, per collegarne una: non è una scelta, le collegate si leggono tutte. */
  const [aperta, setAperta] = useState('')
  /** Si guardano le righe della lettura, invece delle schede: mentre legge, e dopo, finché si resta qui. */
  const [vistaLettura, setVistaLettura] = useState(false)
  /** L'ultima lettura non è arrivata in fondo (la rete, il server): non si è salvato niente. */
  const [nonSalvate, setNonSalvate] = useState(false)
  /** La lettura di tutta l'app: le sue righe sono quelle che si mostrano qui. */
  const letturaStato = useLettura()
  /** Collegate adesso e già confermate dal server, anche se la loro scheda aspetta ancora «Avanti». */
  const [appena, setAppena] = useState<string[]>([])
  /** La frase con cui una scheda ha confermato il collegamento («Work: 4 eventi»): resta sotto la tessera chiusa. */
  const [conferme, setConferme] = useState<Record<string, string>>({})
  /** Ricollegate dopo l'ultima lettura: il loro «non letta» era della connessione di prima. */
  const [riparate, setRiparate] = useState<string[]>([])
  /** La scheda aperta di una fonte già collegata mostra di nuovo il suo modulo: «Cambia». */
  const [modifica, setModifica] = useState(false)
  const [confermati, setConfermati] = useState<string[]>([])
  const [azione, setAzione] = useState('')
  const [giorno, setGiorno] = useState('')
  const [tutteFonti, setTutteFonti] = useState(false)
  const [cercaFonte, setCercaFonte] = useState('')
  /** Chiedere un modello su questo passo: solo se nessuno ragionava quando il passo è comparso, deciso una volta (P4). */
  const [chiediModello, setChiediModello] = useState<boolean | null>(null)
  /** Quando si è premuto «Leggi»: «Continua» si può premere dieci secondi dopo (P4). */
  const [leggiDa, setLeggiDa] = useState<number | null>(null)
  const [adesso, setAdesso] = useState(() => Date.now())
  /** Quello che la lettura ha trovato, per genere, e se sta ancora leggendo (P4). */
  const [pagina, setPagina] = useState<PaginaAvvio | null>(null)
  /** La fine dell'avvio: i conti che salgono per al massimo venti secondi, poi si entra (P4). */
  const [fine, setFine] = useState<{ dal: number; eraPrima: boolean; finitaIl: number | null } | null>(null)
  /** Una lettura da riprendere al caricamento: il server la sta ancora facendo (P4). */
  const [riattacca, setRiattacca] = useState(false)
  /** «Continua» premuto durante la lettura: le fonti sono già salvate, la fine della lettura non le risalva. */
  const giaScelte = useRef(false)
  const entrato = useRef(false)
  const primario = useRef<HTMLButtonElement>(null)
  const ultimo = useRef<StatoAvvio | null>(null)
  ultimo.current = avvio
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
      setAzione(n.azione); setConfermati(n.fatti.filter(f => f.confermato).map(f => f.id))
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
      let leggeva = false
      try { leggeva = !!sessionStorage.getItem(chiaveLettura(n.id)); sessionStorage.removeItem(chiaveLettura(n.id)) } catch { /* senza memoria della scheda si riparte dal server */ }
      const leggendo = !!n.leggendo
      setMomento(momentoAllaRipresa(n.fase, { ritorno, leggeva, leggendo }))
      // la lettura non si è fermata con la pagina: si torna a guardarla, senza ripassare dal benvenuto (P4)
      if (riprendeLeggendo(n.fase, leggendo)) { setRiattacca(true); setAccountConfermato(true) }
      try {
        // in localStorage e non nella scheda del browser: sopravvive a «Riapri Myynd» dopo un permesso
        const salvata = localStorage.getItem(chiaveScheda(n.id))
        if (salvata && !n.risultato) setAperta(salvata)
        if (n.risultato) localStorage.removeItem(chiaveScheda(n.id))
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
  }, [momento, carico, avvio?.risultato, accountConfermato, !!fine])

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
    } finally { lock.current = false; setOccupato(false) }
  }
  const vai = (dove: Momento) => { setErrore(''); setVistaLettura(false); setMomento(dove) }
  const salvaProgetto = () => fai(async () => {
    if (!avvio || !progetto.trim() || !obiettivo.trim()) return
    const cambiato = progetto.trim() !== avvio.progetto?.nome || obiettivo.trim() !== avvio.progetto?.obiettivo
    const n = cambiato ? await api.avvioProgetto({ nome: progetto.trim(), obiettivo: obiettivo.trim(), revisione: avvio.revisione }) : avvio
    setAvvio(n); if (cambiato) setAzione(''); vai(1)
  })
  /** Invio sull'obiettivo: se manca il nome del progetto ci si va, se no si salva. */
  const invioProgetto = () => {
    if (occupato || !obiettivo.trim()) return
    if (!progetto.trim()) { nome.current?.focus(); return }
    void salvaProgetto()
  }
  const apri = (id: string) => {
    const nuova = aperta === id ? '' : id
    setAperta(nuova); setErrore(''); setModifica(false)
    if (avvio) try {
      if (nuova) localStorage.setItem(chiaveScheda(avvio.id), nuova)
      else localStorage.removeItem(chiaveScheda(avvio.id))
    } catch { /* optional return hint */ }
  }
  const salta = () => fai(async () => {
    if (!avvio) return
    const n = await api.avvioFonti({ fonti: [], revisione: avvio.revisione })
    setAperta(''); setConfermati([])
    try { localStorage.removeItem(chiaveScheda(avvio.id)) } catch { /* optional return hint */ }
    const confermato = await api.avvioConferma({ ids: [], revisione: n.revisione }); setAvvio(confermato); vai(3)
  })
  /** Il server ha detto sì: la tessera diventa verde adesso, e la scheda si chiude sulla sua frase. */
  const collegataOra = (id: string, conferma?: string) => {
    setAppena(a => a.includes(id) ? a : [...a, id])
    setRiparate(r => r.includes(id) ? r : [...r, id])
    if (conferma) setConferme(c => ({ ...c, [id]: conferma }))
    setModifica(false)
    void ricarica().catch(() => {})
  }
  const scollega = async (id: string) => {
    await api.scollega(id)
    setAppena(a => a.filter(x => x !== id)); setRiparate(r => r.filter(x => x !== id))
    setConferme(({ [id]: _via, ...resto }) => resto)
    setModifica(false)
    await ricarica()
  }
  /**
   * Tutte le fonti collegate, lette in una volta, con una riga ciascuna.
   *
   * La lettura è quella di sempre, `/api/sincronizza` senza una fonte: la
   * stessa del bottone «Rileggi tutto» e del giro dei dieci minuti. Qui si
   * guarda passare, fonte per fonte. Non sta dentro `fai` (P4): durante la
   * lettura i bottoni restano vivi, e dopo dieci secondi «Continua» porta
   * avanti mentre il server continua a leggere. Solo il salvataggio delle
   * fonti passa da `fai`. Se la lettura finisce prima, si passa da soli a
   * quello che ha dato; se una fonte non si è letta, si resta.
   */
  const leggiFonti = async () => {
    const a = ultimo.current
    if (!a || lock.current) return
    const ids = collegate.map(c => c.id)
    giaScelte.current = false
    setVistaLettura(true); setNonSalvate(false); setAperta(''); setModifica(false); setRiparate([]); setErrore('')
    setLeggiDa(Date.now())
    try { sessionStorage.setItem(chiaveLettura(a.id), '1') } catch { /* il segno serve solo a chi ricarica */ }
    let esito: Awaited<ReturnType<typeof leggiPoiScegli>> | null = null
    try {
      esito = await leggiPoiScegli(letturaFonti, ids, async fonti => {
        // «Continua» le ha già salvate: un secondo salvataggio sotto gli estratti farebbe 409
        if (giaScelte.current) return
        let fatto = false
        await fai(async () => {
          const corrente = ultimo.current
          if (!corrente) return
          const n = await api.avvioFonti({ fonti, revisione: corrente.revisione })
          setAvvio(n); setConfermati(n.fatti.filter(f => f.confermato).map(f => f.id))
          fatto = true
        })
        if (!fatto) throw new Error('')
      })
    } catch { esito = null }
    finally {
      try { sessionStorage.removeItem(chiaveLettura(a.id)) } catch { /* come sopra */ }
    }
    await ricarica().catch(() => {})
    if (giaScelte.current) return
    if (!esito?.salvate) { setNonSalvate(true); setErrore(e => e || (letturaFonti.stato().guaio ?? '')); return }
    // le righe verdi restano in vista un attimo: è la conferma che le ha lette tutte
    if (!daGuardare(esito.righe)) { await pausa(900); if (!giaScelte.current) vai(2) }
  }
  /**
   * «Continua» mentre legge (P4): si salvano le fonti che si stanno leggendo e
   * si va agli estratti subito. Se il salvataggio non riesce si torna alle
   * righe della lettura, con il motivo.
   */
  const continuaDurante = () => fai(async () => {
    const a = ultimo.current
    if (!a) return
    const fonti = (letturaFonti.stato().righe ?? []).map(r => r.id)
    giaScelte.current = true
    vai(2)
    try {
      // la sua lettura non è finita, anche se aspetta ancora il suo turno: gli estratti si fermano a qui
      const n = await api.avvioFonti({ fonti, revisione: a.revisione, durante: true })
      setAvvio(n); setConfermati(n.fatti.filter(f => f.confermato).map(f => f.id))
      try { sessionStorage.removeItem(chiaveLettura(a.id)) } catch { /* il segno serve solo a chi ricarica */ }
    } catch (e) {
      giaScelte.current = false
      setMomento(1); setVistaLettura(true)
      throw e
    }
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
      corrente = await api.avvioFonti({ fonti: [], revisione: corrente.revisione }); setAvvio(corrente)
    }
    if (corrente.fase === 'verifica') {
      if (!corrente.fonteSaltata) { vai(2); return }
      corrente = await api.avvioConferma({ ids: [], revisione: corrente.revisione }); setAvvio(corrente)
    }
    const n = await api.avvioCompleta({ azione: azione.trim(), giorno: giorno || null, revisione: corrente.revisione })
    // L'attività è salvata e si vede nella lista. Con delle fonti lette, un
    // momento con quello che ha trovato (al massimo venti secondi, P4); senza,
    // si entra subito.
    await api.profilo({ onboarding: true, giro: true })
    setAvvio(n)
    try { localStorage.removeItem(chiaveScheda(n.id)) } catch { /* optional return hint */ }
    if (n.fonti.length > 0) {
      const p = await apiP4.avvioPagina().catch(() => null)
      if (p) setPagina(p)
      setFine({ dal: Date.now(), eraPrima: p?.lettura === 'prima', finitaIl: p?.lettura === 'prima' ? null : Date.now() })
    } else fatto()
  })
  /** Si entra una volta sola: dal bottone, o da soli quando i conti si sono fermati. */
  const entraOra = () => { if (entrato.current) return; entrato.current = true; fatto() }
  // Leaving setup never claims completion or creates a project/task.
  const esci = () => { if (stato.config.onboarding) fatto(); else void cambiaAccount() }

  const fonti = s.connettori.filter(c => (c.pronto || c.collegato) && !NON_FONTI.has(c.id))
  // su un Mac (dove il server offre Calendario del Mac) nove schede, altrove sei
  const suMac = s.connettori.some(c => c.id === 'agendamac')
  const priorita = suMac ? PRIORITA_MAC : PRIORITA_FONTI
  const quante = priorita.length
  const ordinate = [...fonti].sort((a, b) => {
    const ia = priorita.indexOf(a.id), ib = priorita.indexOf(b.id)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
  const collegata = (c: { id: string; collegato: boolean }) => c.collegato || appena.includes(c.id)
  const collegate = ordinate.filter(collegata)
  // una fonte collegata resta in vista anche oltre le prime: è una di quelle che si leggeranno
  const visibili = (tutteFonti ? ordinate : ordinate.filter((c, i) => i < quante || c.collegato)).filter(c => `${t(c.nome)} ${t(c.nota)}`.toLocaleLowerCase().includes(cercaFonte.toLocaleLowerCase()))
  /** Chi ragiona, se sul passo delle fonti si chiede: le tre strade, con la loro scheda. */
  const modelli = s.connettori.filter(c => MODELLI.some(m => m.id === c.id))
  const modelloCollegato = modelli.find(collegata)
  const scelta = fonti.find(c => c.id === aperta) ?? (chiediModello ? modelli.find(c => c.id === aperta) : undefined)
  const eModello = !!scelta && MODELLI.some(m => m.id === scelta.id)
  const nomeFonte = (id: string) => t(s.connettori.find(c => c.id === id)?.nome ?? id)
  /** Le fonti che l'avvio ha già letto: sulla prima attività si mostrano quelle. */
  const lette = (avvio?.fonti ?? []).map(id => s.connettori.find(c => c.id === id)).filter(c => !!c)
  const lettura = vistaLettura ? letturaStato.righe : null
  // il titolo segue le righe: finché una è in coda o in lettura si sta leggendo
  const inLettura = !!lettura?.some(r => r.stato === 'attesa' || r.stato === 'leggo')
  // le fonti la cui riga dice ancora «In coda»: la riga dei conti non le conta (P4)
  const inCoda = lettura?.filter(r => r.stato === 'attesa').map(r => r.id) ?? []
  /** La fonte che l'ultima lettura non ha letto (o solo in parte), finché non la si ricollega. */
  const nonLetta = (id: string) => riparate.includes(id) ? undefined
    : letturaStato.righe?.find(r => r.id === id && (r.stato === 'guaio' || r.stato === 'avviso'))
  const moduloAperto = !!scelta && (!collegata(scelta) || modifica)
  const risultato = avvio?.risultato
  const oggi = giornoLocale(), domani = spostaGiorno(oggi, 1)
  const altroGiorno = !!giorno && giorno !== oggi && giorno !== domani
  /** La lettura di tutta l'app sta ancora girando: gli estratti non hanno ancora tutto (P4). */
  const leggeAncora = !!letturaStato.righe?.some(rigaAperta)
  // «Continua» dopo dieci secondi di lettura
  const presto = inLettura && leggiDa !== null && adesso - leggiDa < CONTINUA_DOPO_MS

  // P4 · chi ragiona: chiesto su questo passo solo se nessuno ragionava quando è comparso
  useEffect(() => {
    if (momento === 1 && accountConfermato && !carico && chiediModello === null) setChiediModello(!s.ragiona)
    if (momento !== 1 && chiediModello !== null) setChiediModello(null)
  }, [momento, accountConfermato, carico, chiediModello, s.ragiona])
  // P4 · il bottone si sveglia a dieci secondi
  useEffect(() => {
    if (leggiDa === null) return
    const resta = leggiDa + CONTINUA_DOPO_MS - Date.now()
    if (resta <= 0) { setAdesso(Date.now()); return }
    const x = setTimeout(() => setAdesso(Date.now()), resta + 20)
    return () => clearTimeout(x)
  }, [leggiDa])
  // P4 · quello che ha trovato: ogni secondo e mezzo mentre si guarda la lettura, ogni secondo alla fine
  const chiediPagina = (momento === 1 && vistaLettura) || !!fine
  useEffect(() => {
    if (!chiediPagina) return
    let vivo = true
    const giro = () => { void apiP4.avvioPagina().then(p => { if (vivo) setPagina(p) }).catch(() => {}) }
    giro()
    const x = setInterval(giro, fine ? 1000 : 1500)
    return () => { vivo = false; clearInterval(x) }
  }, [chiediPagina, fine])
  // P4 · e subito, ogni volta che una fonte finisce: il conto non aspetta il prossimo giro
  const finite = lettura?.filter(r => !rigaAperta(r)).length ?? 0
  useEffect(() => {
    if (!finite || !vistaLettura) return
    let vivo = true
    void apiP4.avvioPagina().then(p => { if (vivo) setPagina(p) }).catch(() => {})
    return () => { vivo = false }
  }, [finite, vistaLettura])
  // P4 · la fine: si entra un secondo e mezzo dopo che la prima lettura ha finito, due se aveva già finito, venti al massimo
  useEffect(() => {
    if (!fine) return
    if (fine.finitaIl === null && pagina && pagina.lettura !== 'prima') { setFine({ ...fine, finitaIl: Date.now() }); return }
    const quando = Math.min(fine.dal + FINE_MASSIMO_MS, fine.finitaIl === null ? Infinity : fine.finitaIl + (fine.eraPrima ? 1500 : 2000))
    const x = setTimeout(entraOra, Math.max(0, quando - Date.now()))
    return () => clearTimeout(x)
  }, [fine, pagina])
  // P4 · al caricamento, una lettura che il server sta ancora facendo: ci si riattacca
  useEffect(() => {
    if (!riattacca || carico || !avvio) return
    setRiattacca(false)
    void leggiFonti()
  }, [riattacca, carico, avvio])
  // P4 · Invio preme il bottone principale mentre si guarda la lettura, e alla fine
  useEffect(() => {
    if (!(momento === 1 && vistaLettura) && !fine) return
    const suInvio = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing) return
      const dove = e.target as HTMLElement | null
      if (dove && /^(INPUT|TEXTAREA|BUTTON|SELECT|A)$/.test(dove.tagName)) return
      const b = primario.current
      if (b && !b.disabled) { e.preventDefault(); b.click() }
    }
    window.addEventListener('keydown', suInvio)
    return () => window.removeEventListener('keydown', suInvio)
  }, [momento, vistaLettura, fine])

  // la luce sale con i passi, che adesso sono obiettivo, fonti, estratti, attività
  const progressione = benvenuto ? 0 : momento === 0 ? 1.5 : momento === 1 ? 2.2 : momento === 2 ? 2.6 : risultato ? 5 : 3
  // tre passi: l'obiettivo, le fonti (con i loro estratti), la prima attività.
  // L'introduzione ha i suoi, e mentre carica non si è ancora in nessun passo
  const passo = carico || !avvio || !accountConfermato || avvio.risultato ? undefined : PASSO_AVVIO[momento]

  return <Scena progressione={progressione} passo={passo} passi={PASSI_AVVIO} benvenuto={benvenuto} intro={benvenuto && !!avvio} momento={momento} progetto={avvio?.progetto?.nome} salvato={!!avvio?.progetto && !inLettura} esci={esci} occupato={occupato} accountEmail={accountEmail} uscita={stato.config.onboarding ? t('Torna a Myynd') : t('Esci')}>
    {carico ? <OnboardAttesa testo="Un momento…" /> : !avvio ? <><OnboardErrore testo={errore} /><div className="onboard-actions"><button className="onboard-primary" onClick={carica}>{t('Riprova')}<Avanti /></button></div></> : <>
      {!accountConfermato && <Introduzione avanti={() => setAccountConfermato(true)} pronto={!!accountEmail} riprendi={!!avvio.progetto} cambiaAccount={() => void cambiaAccount()} occupato={occupato} />}
      {accountConfermato && momento === 0 && <form onSubmit={e => { e.preventDefault(); invioProgetto() }}>
        <span className="onboard-kicker">{t('Cominciamo da te')}</span>
        <h2 ref={titolo} tabIndex={-1}>{t('Cosa vuoi ottenere?')}</h2>
        {/* cosa ci fa Myynd, detto da fuori: «serve a scegliere cosa conta» non diceva chi sceglie, né cosa */}
        <p className="onboard-why">{t('Myynd usa questo obiettivo per decidere cosa mostrarti per primo ogni mattina.')}</p>
        <fieldset disabled={occupato} className="onboard-fieldset">
          {/* ogni campo la sua etichetta sopra, e nel segnaposto un esempio: l'obiettivo era l'unico senza */}
          <label className="onboard-field onboard-answer"><span>{t('Obiettivo')}</span><Risposta value={obiettivo} onChange={e => setObiettivo(e.target.value)} invio={invioProgetto} required maxLength={1000} placeholder={t('Mettere online il sito nuovo entro ottobre')} /></label>
          <label className="onboard-field"><span>{t('Progetto')}</span><input ref={nome} value={progetto} onChange={e => setProgetto(e.target.value)} required maxLength={160} autoComplete="off" placeholder={t('Sito nuovo')} /></label>
          <OnboardErrore testo={errore} />
          <div className="onboard-actions"><button className="onboard-primary" disabled={!progetto.trim() || !obiettivo.trim() || occupato}>{occupato ? t('Salvo…') : t('Continua')}<Avanti /></button></div>
        </fieldset>
      </form>}
      {accountConfermato && momento === 1 && <>
        <h2 ref={titolo} tabIndex={-1}>{!lettura ? t('Cosa deve leggere Myynd?') : inLettura ? t('Leggo le tue fonti…') : nonLette(lettura) ? frasi.fontiNonLetteInsieme(nonLette(lettura)) : t('Ho letto le tue fonti.')}</h2>
        {!lettura && <p className="onboard-why">{t('Collegane quante vuoi. Myynd le legge tutte insieme.')}</p>}
        {/* quello che ha trovato finora, per genere: una riga di stato, e niente finché non c'è niente */}
        {lettura && trovatoDurante(pagina, inCoda) && <p className="onboard-why" role="status">{trovatoDurante(pagina, inCoda)}</p>}
        {lettura ? <RigheLettura righe={lettura} classe="onboard" icona={18} nome={nomeFonte} corte /> : <fieldset disabled={occupato} className="onboard-fieldset">
          {tutteFonti && <label className="onboard-field"><span className="onboard-sr-only">{t('Cerca connessioni…')}</span><input type="search" value={cercaFonte} onChange={e => setCercaFonte(e.target.value)} placeholder={t('Cerca connessioni…')} /></label>}
          {/* Le collegate si vedono da lontano: il bordo e la riga verdi, che qui vogliono dire solo «collegata».
              Una collegata che l'ultima lettura non ha letto non è verde: dice «non letta», e aprendola si ripara. */}
          <div className="onboard-sources">{visibili.map(c => {
            const guasta = collegata(c) ? nonLetta(c.id) : undefined
            return <button key={c.id} className={`onboard-source${guasta ? ' is-failed' : collegata(c) ? ' is-connected' : ''}`} type="button" aria-pressed={aperta === c.id} aria-label={`${t(c.nome)} · ${guasta ? t('Non letta') : collegata(c) ? t('Collegato') : t('Da collegare')}`} onClick={() => apri(c.id)}>
              <ConnectorIcon id={c.id} size={25} /><span>{t(c.nome)}</span>
              {guasta ? <em className="onboard-source-state is-failed" aria-hidden="true">{t('Non letta')}</em>
                : collegata(c) && <em className="onboard-source-state" aria-hidden="true">✓ {t('Collegato')}</em>}
            </button>
          })}</div>
          {fonti.length > quante && <button type="button" className="onboard-secondary" onClick={() => { setTutteFonti(!tutteFonti); setCercaFonte('') }}>{tutteFonti ? t('Mostra meno') : t('Tutte le fonti')} <span aria-hidden="true">{tutteFonti ? '−' : '+'}</span></button>}
          {/* chi ragiona, solo se nessuno ragionava quando il passo è comparso: tre strade, la scheda si apre qui sotto (P4) */}
          {chiediModello && <div className="onboard-option onboard-model-row">
            <span className="onboard-option-label">{t('Modello')}</span>
            {modelloCollegato
              ? <span className="onboard-connected" style={{ marginLeft: 0, fontSize: 12, overflowWrap: 'anywhere' }}>✓ {t('Collegato')} · {t(modelloCollegato.nome)}</span>
              : <div className="onboard-provider-choice" style={{ marginBottom: 0, flexWrap: 'wrap' }} role="group" aria-label={t('Modello')}>
                {MODELLI.map(m => <button key={m.id} type="button" aria-pressed={aperta === m.id} onClick={() => apri(m.id)}>{t(m.etichetta)}</button>)}
              </div>}
            <span />
          </div>}
          {scelta && (() => {
            const guasta = collegata(scelta) ? nonLetta(scelta.id) : undefined
            return <div className="onboard-source-detail" key={scelta.id}>
              <div className="onboard-source-title"><ConnectorIcon id={scelta.id} size={16} /><span>{t(scelta.nome)}</span>
                {guasta ? <span className="onboard-connected is-failed">{t('Non letta')}</span> : collegata(scelta) && <span className="onboard-connected">✓ {t('Collegato')}</span>}</div>
              {/* il motivo, o la conferma della scheda che si è chiusa: una riga, e poi i due modi di rimediare */}
              {guasta ? <p className="onboard-source-note is-failed">{guasta.testo}</p>
                : collegata(scelta) && !modifica && conferme[scelta.id] && <p className="onboard-source-note">{conferme[scelta.id]}</p>}
              {collegata(scelta) && !modifica && <div className="onboard-source-actions">
                <button type="button" className="onboard-secondary" onClick={() => setModifica(true)}>{t('Cambia')}</button>
                <BottoneSicuro chiaro titolo={t('Scollega')} guaio={m => setErrore(t(m))} fai={() => scollega(scelta.id)} style={{ fontSize: 11 }}>{t('Scollega')}</BottoneSicuro>
              </div>}
              {moduloAperto && <Form id={scelta.id} tema="scuro" ok={() => {
                setModifica(false)
                // un modello collegato chiude la sua scheda: la riga dice «✓ Collegato»
                if (eModello) { setAppena(a => a.includes(scelta.id) ? a : [...a, scelta.id]); apri(scelta.id) }
                void ricarica().catch(() => {})
              }} collegato={conferma => collegataOra(scelta.id, conferma)} />}
            </div>
          })()}
        </fieldset>}
        <OnboardErrore testo={errore} />
        <div className="onboard-actions">
          {/* dopo una lettura con un guaio, Indietro riporta alle schede: lì si ricollega quella che non si è letta */}
          {/* a sinistra anche quando è da solo: la regola «l'unico va a destra» lo lasciava lontano dal suo posto */}
          <button className="onboard-secondary onboard-back" disabled={occupato} onClick={() => lettura ? setVistaLettura(false) : vai(0)}>{t('Indietro')}</button>
          {/* mentre legge: «Leggo…» per dieci secondi, poi «Continua» salva le fonti e va avanti; la lettura continua da sé (P4) */}
          {lettura
            ? !nonSalvate && <button ref={primario} className="onboard-primary" disabled={occupato || presto} onClick={() => inLettura ? void continuaDurante() : vai(2)}>{presto ? t('Leggo…') : t('Continua')}<Avanti /></button>
            /* un modulo aperto ha il suo bottone pieno, «Collega …»: di primario ce n'è uno, e intanto «Leggi» fa un passo indietro */
            : moduloAperto
              ? !!collegate.length && <button className="onboard-secondary" disabled={occupato} onClick={leggiFonti}>{frasi.leggiFonti(collegate.length)}</button>
              : <button className="onboard-primary" disabled={occupato || !collegate.length} onClick={leggiFonti}>{collegate.length ? frasi.leggiFonti(collegate.length) : t('Leggi le fonti')}<Avanti /></button>}
        </div>
        {/* con una fonte collegata «senza fonti» non è più vero: resta «Leggi» */}
        {!occupato && !lettura && !collegate.length && <button className="onboard-secondary onboard-skip" onClick={salta}>{t('Continua senza fonti')}</button>}
      </>}
      {accountConfermato && momento === 2 && <>
        <h2 ref={titolo} tabIndex={-1}>{avvio.fatti.length ? t('Quali estratti vuoi tenere?') : t('Partiamo dal tuo obiettivo.')}</h2>
        {avvio.fatti.length ? <>
          <p className="onboard-note onboard-before-facts">{t('Seleziona gli estratti utili. Ogni frase ha una fonte.')}</p>
          <div className="onboard-facts">{avvio.fatti.map((f, i) => <article className={`onboard-fact ${confermati.includes(f.id) ? 'selected' : ''}`} key={f.id}>
            <label className="onboard-fact-choice"><input type="checkbox" disabled={occupato} checked={confermati.includes(f.id)} onChange={e => setConfermati(ids => e.target.checked ? [...ids, f.id] : ids.filter(id => id !== f.id))} /><span className="onboard-fact-number">{String(i + 1).padStart(2, '0')}</span><span>{f.testo}</span></label>
            {/* da quale fonte viene, prima del titolo: con più fonti è la prima cosa che si vuole sapere */}
            {/* da dove viene, e basta: la freccia apriva la stessa frase, parola per parola */}
            <p className="onboard-fact-source">{f.evidenza.fonte ? `${nomeFonte(f.evidenza.fonte)} · ${f.evidenza.titolo}` : f.evidenza.titolo}</p>
          </article>)}</div>
        </> : <div className="onboard-goal-card"><span>{t('Il tuo obiettivo')}</span><p>{avvio.progetto?.obiettivo}</p>{/* mentre legge ancora, o scelte a metà lettura, «non ho trovato» non è vero: la riga non c'è (P4) */}{(avvio.fonteSaltata || (!leggeAncora && !avvio.aMetaLettura)) && <div>{t(avvio.fonteSaltata ? 'Nessuna fonte collegata a questo avvio.' : 'Non ho trovato estratti pertinenti nelle fonti lette.')}</div>}</div>}
        <OnboardErrore testo={errore} />
        <div className="onboard-actions"><button className="onboard-secondary" disabled={occupato} onClick={() => vai(1)}>{t('Cambia fonti')}</button><button className="onboard-primary" disabled={occupato} onClick={conferma}>{occupato ? t('Salvo…') : confermati.length ? t('Conferma') : t('Continua senza estratti')}<Avanti /></button></div>
      </>}
      {/* la fine dell'avvio (P4): quello che ha trovato, per al massimo venti secondi, e «Apri Myynd» subito premibile */}
      {accountConfermato && fine && <>
        <h2 ref={titolo} tabIndex={-1}>{pagina?.lettura === 'prima' ? t('Leggo le tue fonti…') : t('Ho letto le tue fonti.')}</h2>
        {trovato(pagina?.trovato) && <p className="onboard-why" role="status">{trovato(pagina?.trovato)}</p>}
        {pagina?.lettura === 'prima' && <div className="onboard-working" style={{ minHeight: 40 }}><span aria-hidden="true" className="onboard-working-mark" /></div>}
        <div className="onboard-actions"><button ref={primario} className="onboard-primary" onClick={entraOra}>{t('Apri Myynd')}<Avanti /></button></div>
      </>}
      {accountConfermato && momento === 3 && !fine && <>
        <h2 ref={titolo} tabIndex={-1}>{risultato ? t('Il tuo primo passo è pronto.') : t('Qual è la prima attività?')}</h2>
        {!risultato && <p className="onboard-why">{t('Finisce nella lista: è la prima cosa che vedrai.')}</p>}
        {risultato ? <div className="onboard-result">
          <div className="onboard-result-eyebrow"><span />{t('Salvato nella To-do')}</div><h3>{risultato.compito.testo}</h3>
          <div className="onboard-result-body"><span className="onboard-result-label">{t('Obiettivo')}</span><p>{risultato.traccia.obiettivo}</p>{risultato.traccia.estratti.length > 0 && <><span className="onboard-result-label">{t('Estratti confermati')}</span>{risultato.traccia.estratti.map((e, i) => <blockquote key={`${e.doc}-${i}`}>{e.testo}<cite>{e.titolo}</cite></blockquote>)}</>}</div>
          <div className="onboard-result-source">{risultato.progetto.nome} · {t('Attività ancora da svolgere')}</div>
        </div> : <>
          {/* l'etichetta sopra e un esempio nel segnaposto, come l'obiettivo al primo passo */}
          <label className="onboard-field onboard-answer"><span>{t('Prima attività')}</span><Risposta value={azione} disabled={occupato} onChange={e => { setAzione(e.target.value); if (errore) setErrore('') }} invio={() => { if (azione.trim() && !occupato) void prepara() }} maxLength={2000} placeholder={t('Scrivere i testi della pagina iniziale')} /></label>
          {/* La data e la fonte fanno parte dell'attività: due righe con la loro etichetta, sempre in vista. */}
          <div className="onboard-options">
            <div className="onboard-option">
              <span className="onboard-option-label" id="onboard-giorno">{t('Per che giorno')}</span>
              <div className="onboard-chips" role="group" aria-labelledby="onboard-giorno">
                {([[t('Oggi'), oggi], [t('Domani'), domani]] as [string, string][]).map(([etichetta, data]) => <button type="button" key={data} className="onboard-chip" disabled={occupato} aria-pressed={giorno === data} onClick={() => setGiorno(giorno === data ? '' : data)}>{etichetta}</button>)}
                <label className={`onboard-chip onboard-chip-date${altroGiorno ? ' is-on' : ''}`}><input type="date" disabled={occupato} value={giorno} aria-label={t('Data')} onInput={e => setGiorno(e.currentTarget.value)} onChange={e => setGiorno(e.target.value)} /></label>
              </div>
            </div>
            {/* le fonti vengono prima, adesso: qui si vede quali ha letto, e si torna a cambiarle */}
            <button type="button" className="onboard-option onboard-option-button" disabled={occupato} onClick={() => vai(1)}>
              <span className="onboard-option-label">{lette.length > 1 ? t('Fonti') : t('Fonte')}</span>
              <span className="onboard-option-body">{lette.length ? <>{lette.map(c => <ConnectorIcon key={c.id} id={c.id} size={16} />)}<strong>{lette.map(c => t(c.nome)).join(', ')}</strong><em>{t('Cambia')}</em></> : <><strong>{t('Aggiungi una fonte')}</strong><small>{t('Myynd la legge e cita quello che serve al progetto.')}</small></>}</span>
              <span className="onboard-arrow onboard-option-arrow"><IconFreccia /></span>
            </button>
          </div>
        </>}
        <OnboardErrore testo={errore} />
        <div className="onboard-actions">{!risultato && <button className="onboard-secondary" disabled={occupato} onClick={() => vai(avvio.fonti.length ? 2 : 1)}>{t('Indietro')}</button>}<button className="onboard-primary" disabled={occupato || (!risultato && !azione.trim())} onClick={risultato ? entra : prepara}>{occupato ? t('Salvo…') : risultato ? t('Apri Myynd') : t('Salva la prima attività')}<Avanti /></button></div>
      </>}
    </>}
  </Scena>
}
