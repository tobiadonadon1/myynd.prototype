import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AUTONOMIE, ESEMPIO_TONO, LINGUE, LIVELLI, MODELLI, TEMI, TENUTE, TONI, parole, quando, type Gruppo, type Messaggio, type Screen, type Thread, type VoceFeed } from './data'
import { DOMANDE, type Campo } from './intervista'
import type { CambioProgetto, Progetto, Compito, ProjectInitiative } from './api'
import { coloreProgetto } from './colori-progetto'
import { costruisciDaGrafo, documentiCollegati, type Ball, type Grafo } from './brain'
import { loc, ricordaLingua, t, frasi } from './lingua'
import { ricordaTema, temaValido } from './tema'
import { api, rigaSincronizzazione, type Connettore, type Stato } from './api'
import { MENU_OFF, MENU_ON, NAV_OFF, NAV_ON, dot, knob, track } from './ui'
import { useMappa } from './useMappa'
import { primoParagrafo } from './essenza.ts'
import { preparaApertura } from './navigazione.ts'
import { leggibile } from './leggibile.ts'
import { anteprimaDocumentoMappa, dataDocumentoMappa, motivoMappa } from './mappa-testo.ts'
import {statoAccessoNote} from './note-access.ts'
import { avanzaLettura, chiudiLettura, iniziaLettura, type RigaLettura } from './lettura-fonti.ts'

/**
 * Un avviso, e — se il gesto si può disfare — il modo di disfarlo.
 *
 * `undo` era un `boolean`, e chi premeva «Annulla» finiva sempre nello stesso
 * posto: rimetti a posto *l'ultima voce fatta*. Due gesti diversi con lo stesso
 * bottone, e nessuno dei due legato alla cosa che avevi appena toccato: bastava
 * che il feed si rileggesse da solo in mezzo — e si rilegge da solo — perché
 * «l'ultima» fosse un'altra, o non ci fosse più. Adesso il gesto se lo porta
 * dietro l'avviso: chi lo mostra sa cosa ha fatto, e sa come disfarlo.
 */
type Toast = { text: string; undo?: () => void } | null

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

// `primoParagrafo` vive in `essenza.ts`, e riesporta da qui: la funzione la
// prova `essenza.test.ts` da sola, senza doversi trascinare dietro React e
// tutto il resto che questo file importa. Non `testo.ts`: c'è già `Testo.tsx`,
// e su un progetto che distingue le maiuscole i due nomi si scontrerebbero.
export { primoParagrafo }

/**
 * Cosa si apre, detto con la parola giusta.
 *
 * «Apri il documento» era vero e non serviva a niente: dietro c'è una mail a
 * cui rispondere, un file sul disco o una pagina di Notion, e dirlo cambia se
 * uno clicca o no. Il genere si legge dall'id del documento, che comincia
 * sempre col nome del connettore (`posta:INBOX:11`, `desktop:/Users/...`,
 * `notion:…`); la voce dice la sua solo quando il documento non c'è.
 *
 * L'ordine è questo e non l'altro per un motivo visto sullo schermo: il
 * modello scrive `fonte` da sé, e a volte ci mette dentro l'id intero del
 * documento — `desktop:/Users/.../large-object-promisors.html`. Letta come
 * nome di connettore non è nessuno dei nomi conosciuti, e un file sul disco
 * diventava «Apri la pagina». L'id invece è costruito da noi, e il pezzo
 * prima dei due punti è sempre il connettore.
 */
const POSTA = new Set(['posta', 'google', 'microsoft', 'gmail', 'outlook'])
const FILE = new Set(['desktop', 'drive', 'dropbox', 'sharepoint', 'mac'])
const CARTELLE = new Set(['lavoro'])
const NOTE = new Set(['note', 'granola', 'conversazioni'])
const AGENDA = new Set(['calendario', 'agenda', 'ical'])

/** Il connettore da cui viene: dall'id del documento, e solo in mancanza dalla voce. */
const connettoreDi = (fonte: string | null | undefined, doc: string | null | undefined) =>
  ((doc ?? '').split(':')[0] || (fonte ?? '').split(':')[0] || '').trim().toLowerCase()

/** Di che cosa si tratta, in una parola sola che non è mai un percorso. */
type Genere = 'mail' | 'file' | 'cartella' | 'nota' | 'calendario' | 'pagina'

function genereDi(fonte: string | null | undefined, doc: string | null | undefined): Genere {
  const nome = connettoreDi(fonte, doc)
  if (POSTA.has(nome)) return 'mail'
  if (FILE.has(nome)) return 'file'
  if (CARTELLE.has(nome)) return 'cartella'
  if (NOTE.has(nome)) return 'nota'
  if (AGENDA.has(nome)) return 'calendario'
  return 'pagina'
}

/**
 * Il posto da cui viene, senza il verbo: «la mail», «il file», «la pagina».
 *
 * Serve alla riga che dice da dove viene una cosa da fare: «Da» e poi il link.
 * Stesso elenco di connettori del bottone, così il giorno che ne arriva uno
 * nuovo la parola giusta la impara un posto solo.
 */
export function generePrimoDocumento(fonte: string | null | undefined, doc: string | null | undefined): string {
  const g = genereDi(fonte, doc)
  if (g === 'mail') return t('la mail')
  if (g === 'file') return t('il file')
  if (g === 'cartella') return t('la cartella')
  if (g === 'nota') return t('la nota')
  if (g === 'calendario') return t('il calendario')
  return t('la pagina')
}

/**
 * La parola che sta in cima alla carta, accanto all'ora.
 *
 * Lì c'era `fonte` così come arrivava, e quando il modello ci scriveva l'id
 * intero la carta mostrava mezzo disco: «DA LEGGERE  desktop:/Users/tobia/
 * pinokio/bin/miniforge/pkgs/git-2.55.0/share/doc/git/technical/
 * large-object-promisors.html · 10:05». Un percorso non dice niente a nessuno,
 * e sfora la carta. Qui esce una parola e basta: mail, file, pagina.
 */
export function parolaFonte(fonte: string | null | undefined, doc: string | null | undefined): string {
  const g = genereDi(fonte, doc)
  if (g === 'mail') return t('mail')
  if (g === 'file') return t('documento')
  if (g === 'cartella') return t('cartella di lavoro')
  if (g === 'nota') return t('nota')
  if (g === 'calendario') return t('calendario')
  return t('pagina')
}

/**
 * Il nome di un file, senza la cartella davanti.
 *
 * Solo per i file: l'id di una mail (`posta:INBOX:11`) finisce con un numero,
 * e «Da: la mail 11» sarebbe un id travestito da parola. Il nome si taglia,
 * perché fra quello che sta sul disco c'è di tutto.
 */
export function nomeDelFile(doc: string | null | undefined): string {
  if (!doc || genereDi(null, doc) !== 'file') return ''
  const strada = doc.slice(doc.indexOf(':') + 1)
  const nome = strada.split(/[/\\]/).filter(Boolean).pop() ?? ''
  return nome ? taglia(nome, 34) : ''
}

/**
 * Il progetto che la Memoria deve portare sotto gli occhi.
 *
 * Sta fuori dal hook perché chi lo scrive e chi lo legge non si conoscono: lo
 * chiede la prima pagina da una riga della lista, lo trova la Memoria quando
 * si monta. È un biglietto, non uno stato: si guarda senza consumarlo, e si
 * strappa quando la riga è stata portata davvero sotto gli occhi.
 */
let atteso: string | null = null
const inAscolto = new Set<() => void>()

/** «Portami su questo progetto»: lo dice la prima pagina, lo legge la Memoria. */
export function chiediProgetto(id: string) {
  atteso = id
  for (const f of inAscolto) f()
}
/** Guardare non consuma: la Memoria può montarsi due volte e trovarlo ancora. */
export function progettoAtteso(): string | null {
  return atteso
}
/** Portato sotto gli occhi: il biglietto si strappa, così tornarci non rifà il giro. */
export function dimenticaProgetto() {
  atteso = null
}
/** Per la Memoria già aperta: il biglietto è arrivato adesso. */
export function ascoltaProgetto(f: () => void): () => void {
  inAscolto.add(f)
  return () => { inAscolto.delete(f) }
}

/**
 * «Portami sul progetto», detto da chi non ha `v`.
 *
 * La lista di Oggi è una schermata sola, montata con la lista e niente altro:
 * non conosce la colonna, non sa cambiare pagina, e va bene così. Ma «Portami
 * lì» su una riga che non ha un documento porta sul progetto, e quello sta
 * nella Memoria. Invece di far passare mezza app dentro i puntelli di `Oggi`,
 * `useVals` lascia qui la sua mano: chi ce l'ha la usa, chi non ce l'ha lascia
 * almeno il biglietto — la Memoria lo trova quando la si apre.
 */
let portaAllaMemoria: ((id: string) => void) | null = null
export function registraPortaProgetto(f: ((id: string) => void) | null) { portaAllaMemoria = f }
export function portaAlProgetto(id: string) { (portaAllaMemoria ?? chiediProgetto)(id) }

/**
 * «I progetti sono cambiati», detto a chi li tiene in pagina.
 *
 * Adesso un progetto si apre nella sua pagina sopra qualunque schermata, e si
 * cambia da tre posti: la pagina, la scheda nella Memoria, il blocco della
 * prima pagina. Ognuno tiene la sua copia dell'elenco, e senza questo annuncio
 * la Memoria dietro la pagina mostrerebbe il colore di prima, e la prima pagina
 * un nome che non c'è più. Chi annuncia si passa come `da`, per non rileggere
 * quello che ha appena scritto lui.
 */
const alCambioDeiProgetti = new Set<(da: unknown) => void>()
export function annunciaProgetti(da?: unknown) { for (const f of alCambioDeiProgetti) f(da) }
export function ascoltaProgetti(f: (da: unknown) => void): () => void {
  alCambioDeiProgetti.add(f)
  return () => { alCambioDeiProgetti.delete(f) }
}

/**
 * «Scomponila in chat», detto dalla lista.
 *
 * «Non c'è una vera intenzione dietro il compito che aggiunge. Per compiti
 * così dovrebbe chiedermelo in chat: come pensi di farlo? dentro quali
 * progetti? Poi lo scomponiamo in cose da fare, alcune le fa lui e alcune le
 * faccio io.»
 *
 * Una riga come «solidificare i sistemi» non è un compito: è un obiettivo, e
 * un obiettivo non si affida — si smonta parlandone. Il posto dove si parla è
 * la chat, e questa è la porta. Stessa mano di `portaAlProgetto`, per la
 * stessa ragione: `Oggi` è montata con la lista e niente altro, e non conosce
 * la colonna delle schermate.
 */
let portaAllaChat: ((testo: string) => void) | null = null
export function registraPortaChat(f: ((testo: string) => void) | null) { portaAllaChat = f }
/** Vera quando c'è chi sa aprirla: senza, il bottone non si disegna. */
export function siPuoParlarne(): boolean { return !!portaAllaChat }
export function portaInChat(testo: string) { portaAllaChat?.(testo) }

/**
 * «Portami su Da fare», detto da chi non ha `v`.
 *
 * L'editor di un progetto, in Memoria, elenca le sue attività aperte e non
 * deve diventare una seconda lista: le righe si toccano dove si toccano
 * sempre, e da lì ci si arriva con un clic. Stessa mano delle altre due porte,
 * per la stessa ragione: la Memoria è montata da sola e non conosce la colonna
 * delle schermate.
 */
let portaAlleCose: (() => void) | null = null
export function registraPortaCose(f: (() => void) | null) { portaAlleCose = f }
/** Vera quando c'è chi sa aprirla: senza, il collegamento non si disegna. */
export function siPuoAprireLeCose(): boolean { return !!portaAlleCose }
export function portaAlleAttivita() { portaAlleCose?.() }

/**
 * Come si chiama il bottone che porta lì: dice *cosa* apre.
 *
 * «Portami lì» era una parola sola per tre posti diversi, e su una riga che non
 * aveva nessuno dei tre non voleva dire niente. Il nome del posto è anche la
 * prova che il posto c'è: si legge sul bottone prima di premerlo.
 *
 * È una funzione e non una tabella perché la lingua si cambia dalle preferenze
 * e deve valere subito, senza ricaricare — vedi `ricordaLingua`.
 */
export function nomePorta(p: 'posta' | 'file' | 'pagina'): string {
  return p === 'posta' ? t('Apri la mail') : p === 'file' ? t('Apri il file') : t('Apri la pagina')
}

const RIGA_MIA: CSSProperties = { display: 'flex', justifyContent: 'flex-end' }
const RIGA_SUA: CSSProperties = { display: 'flex', justifyContent: 'flex-start' }
const BOLLA_MIA: CSSProperties = {
  maxWidth: '74%', padding: '13px 17px', borderRadius: '20px 18px 6px 20px',
  background: 'linear-gradient(130deg,rgba(176,82,46,.92),rgba(140,100,64,.9))',
  color: 'var(--avorio)', fontSize: '15px', lineHeight: 1.55, whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere', minWidth: 0
}
// piatta: la sfocatura e l'ombra larga facevano un alone fra una bolla e l'altra
const BOLLA_SUA: CSSProperties = {
  maxWidth: '80%', padding: '15px 18px', borderRadius: '20px 20px 20px 6px',
  background: 'rgba(var(--carta-rgb),.92)',
  border: '1px solid rgba(var(--luce-rgb),.9)', boxShadow: '0 1px 2px rgba(var(--ombra-rgb),.06)',
  color: 'var(--inchiostro)', fontSize: '15px', lineHeight: 1.6, whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere', minWidth: 0
}

export function useVals(iniziale: Stato, apriConnessioni: (fonte?: string) => void, avviaOnboarding: () => void = () => {}, email = '') {
  const [stato, setStato] = useState<Stato>(iniziale)
  // Va impostata a ogni giro, prima di qualunque calcolo che produca testo:
  // così cambiare lingua nelle preferenze si vede subito, senza ricaricare.
  // questa viene dal profilo sul server: è una scelta, e si ricorda per le
  // schermate che si disegnano prima che il server risponda
  ricordaLingua(stato.config.lingua)
  // e lo stesso per l'ora del giorno: la scelta vive sul server, la pagina la
  // porta addosso come `data-theme`, e il browser ne tiene una copia per non
  // lampeggiare di panna al primo disegno
  ricordaTema(temaValido(stato.config.tema))
  // lo stato arriva da fuori quando cambiano i connettori: mi allineo senza
  // rimontare, così schermata, chat aperta e bozza restano dove sono
  useEffect(() => { setStato(iniziale) }, [iniziale])
  // sempre sulla prima pagina: se Myynd ha delle domande, lo dice lì — un
  // pallino sulla chat e una carta in cima — invece di aprire la chat al posto tuo
  const [screen, setScreen] = useState<Screen>('myynd')
  const [menu, setMenu] = useState(false)
  const [search, setSearch] = useState(false)
  const [query, setQuery] = useState('')
  const [risultati, setRisultati] = useState<{ id: string; titolo: string; fonte: string; gruppo: string; quando: string; estratto: string }[]>([])

  const [aperti, setAperti] = useState<VoceFeed[]>([])
  const [iniziative, setIniziative] = useState<ProjectInitiative[]>([])
  const [fatte, setFatte] = useState<VoceFeed[]>([])
  /**
   * L'ultima voce buttata via, e dov'era.
   *
   * Scartare è l'unico gesto del feed che non lascia traccia da nessuna parte:
   * una voce «fatta» resta fra le fatte, una messa in lista si vede in lista,
   * questa sparisce e basta. Senza un modo di rimetterla, un dito storto costa
   * una cosa che non si ritrova più — e la sola difesa sarebbe non premere,
   * cioè un bottone che non si usa. Vive quanto l'avviso: dopo, è andata.
   */
  // Le cose già chiuse sono archivio, non notizie: partono ripiegate. Aperte
  // di default si prendevano tutta la prima pagina proprio nel momento in cui
  // non c'era più niente da fare — l'opposto di quello che serve lì.
  const [doneOpen, setDoneOpen] = useState(false)
  const [openDone, setOpenDone] = useState<string | null>(null)
  const [fuoco, setFuoco] = useState('')

  /*
   * L'intervista: le domande delle preferenze, fatte in chat.
   *
   * Parte da sola la prima volta che manca il nome o il lavoro, e si ferma
   * dove uno la lascia: la chiave in localStorage dice che l'ha vista, così
   * non torna a ogni apertura. Da «Raccontami di te» si rifà tutta, con le
   * risposte di adesso già segnate sulle scelte. Non serve un motore: sono
   * domande scritte, non generate, e devono funzionare al primo minuto.
   */
  // per conto: la mail arriva dall'accesso, che è l'unico posto in cui è certa
  const chiaveIntervista = `myynd.intervista.${email}`
  const valoreDi = (campo: Campo, c: Stato['config'], f: string): string =>
    campo === 'nome' ? (c.nome ?? '') : campo === 'ruolo' ? (c.ruolo ?? '') : campo === 'fuoco' ? f
    : campo === 'argomenti' ? (c.argomenti ?? '') : campo === 'tono' ? (c.tono ?? '') : (c.autonomia ?? '')
  /** La prossima domanda dopo `da`: tutte, oppure solo quelle senza risposta e le scelte. */
  const prossimoPasso = (da: number, tutte: boolean, c: Stato['config'], f: string): number | null => {
    for (let i = da + 1; i < DOMANDE.length; i++) {
      const d = DOMANDE[i]
      if (tutte || d.scelte || !valoreDi(d.campo, c, f)) return i
    }
    return null
  }
  const intervistaPendente = (() => {
    try { return !localStorage.getItem(chiaveIntervista) && (!iniziale.config.nome || !iniziale.config.ruolo) } catch { return false }
  })()
  const [passo, setPasso] = useState<number | null>(() => intervistaPendente ? prossimoPasso(-1, false, iniziale.config, '') : null)
  const [tutteLeDomande, setTutteLeDomande] = useState(false)
  const [battute, setBattute] = useState<{ domanda: string; risposta: string }[]>([])
  const [intervistaFinita, setIntervistaFinita] = useState(false)
  /** I progetti: se non ce n'è nessuno, la prima pagina lo dice e offre di farne uno. */
  const [progetti, setProgetti] = useState<Progetto[] | null>(null)
  // e di nuovo ogni volta che si torna sulla prima pagina: un colore scelto in
  // Memoria deve vedersi sulle carte dei progetti senza ricaricare l'app
  useEffect(() => { if (screen === 'myynd') api.progetti().then(r => setProgetti(r.progetti)).catch(() => {}) }, [screen])
  /** Il progetto aperto nella sua pagina, sopra la schermata in cui si era: uno solo. */
  const [progettoAperto, setProgettoAperto] = useState<string | null>(null)
  /**
   * I progetti nati da qui in questa sessione.
   *
   * Hanno un blocco sulla prima pagina anche senza righe, con il posto per il
   * primo passo (`blocchiFeed`, `vuoti`): un progetto creato che non compare
   * da nessuna parte è un gesto che sembra non aver fatto niente, ed è così
   * che si arrivava a credere che se ne potesse avere uno solo.
   */
  const [progettiNuovi, setProgettiNuovi] = useState<string[]>([])
  const ricaricaProgetti = useCallback(async () => {
    try { setProgetti((await api.progetti()).progetti) } catch { /* resta l'elenco di prima */ }
  }, [])
  const questaCopia = useRef({})
  useEffect(() => ascoltaProgetti(da => { if (da !== questaCopia.current) void ricaricaProgetti() }), [ricaricaProgetti])
  // e quando cambia da fuori: la priorità detta in chat, un'altra finestra. Il
  // server lo annuncia sul filo dei compiti; qui si rilegge una volta sola per raffica
  useEffect(() => {
    let attesa: ReturnType<typeof setTimeout> | undefined
    const via = api.flussoCompiti(e => {
      if (e.fase !== 'cambiato') return
      clearTimeout(attesa)
      attesa = setTimeout(() => { void ricaricaProgetti() }, 300)
    })
    return () => { clearTimeout(attesa); via() }
  }, [ricaricaProgetti])
  /**
   * L'id con cui è nato sullo schermo ogni progetto creato da qui: il blocco
   * della prima pagina lo tiene come chiave, così quando arriva l'id vero dal
   * server non si rifà da capo (e non perde il primo passo che si scriveva).
   */
  const [nascite, setNascite] = useState<Record<string, string>>({})

  const chiudiIntervista = () => { setPasso(null); setIntervistaFinita(false); setBattute([]) }
  const avviaIntervista = (tutte: boolean) => {
    setBattute([]); setIntervistaFinita(false); setTutteLeDomande(tutte)
    setPasso(prossimoPasso(-1, tutte, stato.config, fuoco))
    setScreen('chat'); setSearch(false); setMenu(false)
  }
  const rispondiIntervista = async (testo: string | null) => {
    if (passo === null) return
    const d = DOMANDE[passo]
    const valore = testo?.trim() ?? ''
    // saltata: resta la domanda, con un trattino al posto della risposta
    const detta = valore ? (d.scelte?.find(s => s.id === valore)?.testo ?? valore) : '—'
    setBattute(b => [...b, { domanda: d.testo, risposta: detta }])
    const cfgDopo = (valore && d.campo !== 'fuoco' ? { ...stato.config, [d.campo]: valore } : stato.config) as Stato['config']
    const n = prossimoPasso(passo, tutteLeDomande, cfgDopo, d.campo === 'fuoco' && valore ? valore : fuoco)
    setPasso(n)
    if (n === null) { setIntervistaFinita(true); try { localStorage.setItem(chiaveIntervista, '1') } catch { /* incognito */ } }
    if (!valore) return
    try {
      if (d.campo === 'fuoco') await salvaFuoco(valore)
      else {
        setStato(s => ({ ...s, config: { ...s.config, [d.campo]: valore } }))
        await api.profilo({ [d.campo]: valore })
      }
    } catch { mostraToast(t('Non sono riuscito a salvarlo.')) }
  }
  const [fuocoAperto, setFuocoAperto] = useState(false)
  const [domanda, setDomanda] = useState<{ id: string; testo: string; spunto: string[]; tema?: string } | null>(null)
  const [cambioLingua, setCambioLingua] = useState(false)
  const [generando, setGenerando] = useState(false)

  const [gruppi, setGruppi] = useState<Gruppo[]>([])
  const [grafo, setGrafo] = useState<Grafo | null>(null)
  const [sel, setSel] = useState('')
  const [filtro, setFiltro] = useState<string | null>(null)
  const [mapFull, setMapFull] = useState(false)
  const [nodeMsg, setNodeMsg] = useState('')
  const [documentoMappa, setDocumentoMappa] = useState<Record<string, string> | null>(null)
  const [caricoNodo, setCaricoNodo] = useState(false)
  const [erroreNodo, setErroreNodo] = useState('')

  const [threads, setThreads] = useState<Thread[]>([])
  const [thread, setThread] = useState<string | null>(null)
  const [hoverThread, setHoverThread] = useState<string | null>(null)
  const [messaggi, setMessaggi] = useState<Messaggio[]>([])
  const [draftMsg, setDraftMsg] = useState('')
  const [pensando, setPensando] = useState(false)
  // «Aggiorno la memoria», «Cerco nelle tue fonti»: il passo che il server
  // dice mentre lavora, coerente con quello che sta facendo davvero
  const [passoChat, setPassoChat] = useState<string | null>(null)

  const [doc, setDoc] = useState<Record<string, string> | null>(null)
  const [aprendoFonte, setAprendoFonte] = useState<string | null>(null)
  const aperturaFonte = useRef(false)
  const [toast, setToast] = useState<Toast>(null)
  const [sincronizzando, setSincronizzando] = useState<string | null>(null)
  /** «Rileggi tutto», fonte per fonte: ogni scheda collegata dice a che punto è la sua. */
  const [letturaFonti, setLetturaFonti] = useState<RigaLettura[] | null>(null)

  const threadRef = useRef<HTMLDivElement>(null)
  const cvA = useRef<HTMLCanvasElement>(null)
  const cvB = useRef<HTMLCanvasElement>(null)
  const tt = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const mostraToast = useCallback((text: string, undo?: () => void) => {
    clearTimeout(tt.current)
    setToast({ text, undo })
    // cinque secondi: «sparisce dopo un secondo, a malapena» — il tempo di leggerla
    tt.current = setTimeout(() => setToast(null), 5000)
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
        // la pagina di un progetto si chiude: la ricerca le starebbe sotto, e si
        // scriverebbe in un campo che non si vede. La nota lasciata a metà si salva
        setProgettoAperto(null)
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
      // documenti. Anche un grafo vuoto resta vuoto.
      : !grafo ? PALLA_VUOTA
      : costruisciDaGrafo(grafo)),
    [mappaInVista, grafo, gruppi]
  )
  const onPick = useCallback((s: string, cluster: string) => { setSel(s); setFiltro(cluster) }, [])
  const mappa = useMappa(cvA, cvB, mappaInVista, mapFull, filtro, sel, onPick, ball, gruppi)
  const nodoSelezionato = grafo?.nodi.find(n => n.id === sel)
  useEffect(() => {
    let attuale = true
    setDocumentoMappa(null); setErroreNodo(''); setCaricoNodo(false)
    if (!mappaInVista || !nodoSelezionato) return
    setCaricoNodo(true)
    api.documento(nodoSelezionato.id).then(d => { if (attuale) setDocumentoMappa(d) })
      .catch(() => { if (attuale) setErroreNodo(t('Non trovo più il documento.')) })
      .finally(() => { if (attuale) setCaricoNodo(false) })
    return () => { attuale = false }
  }, [mappaInVista, nodoSelezionato])

  // — caricamento iniziale —

  /*
   * «Vuoto» e «non sono riuscito a leggerlo» sono due cose diverse, e la prima
   * pagina le mostrava uguali: un server che rispondeva 500 dava «La tua mente è
   * ancora vuota». Qui si tiene il guasto, e si tiene anche se il primo giro è
   * finito — prima della risposta il titolone non deve dire niente di falso.
   */
  const [guastoFeed, setGuastoFeed] = useState<string | null>(null)
  const [guastoLettura, setGuastoLettura] = useState<string | null>(null)
  /** L'ultima volta che «Leggi adesso» non ha trovato niente ma i progetti aspettano: la pagina li porta sotto gli occhi. */
  const [evidenziaProgetti, setEvidenziaProgetti] = useState(0)
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
    setIniziative(f.iniziative ?? [])
    if (f.fonti) setStato(s => ({ ...s, letturaIncompleta: f.fonti }))
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

  /**
   * Il feed cambia anche quando non lo tocchi.
   *
   * La rilettura automatica salva le voci nuove nel cuore della notte, e
   * finora nessuno lo diceva a questa pagina: la prima pagina restava quella
   * di ieri finché non si ricaricava. Lo stesso filo che tiene vive le
   * deleghe porta anche questo — un fatto, non le voci — e qui si rilegge.
   * Anche quando il filo si riapre: quello che è successo mentre era giù non
   * lo racconta nessuno.
   */
  useEffect(() => {
    let attesa: ReturnType<typeof setTimeout> | undefined
    const chiudi = api.flussoCompiti(e => {
      if (e.fase !== 'feed' && e.fase !== 'aperto') return
      clearTimeout(attesa)
      attesa = setTimeout(() => { caricaFeed().catch(() => {}) }, 200)
    })
    return () => { clearTimeout(attesa); chiudi() }
  }, [caricaFeed])

  // il grafo arriva quando si apre la Mappa, e una volta sola
  useEffect(() => {
    if (mappaInVista && !grafo) caricaMente(true).catch(() => {})
  }, [mappaInVista, grafo, caricaMente])

  // un contatore di generazione: la risposta di una richiesta vecchia non
  // deve sovrascrivere quella nuova, né cancellare la bolla ottimistica
  const gen = useRef(0)
  /**
   * Il filo aperto adesso, per poterlo tagliare.
   *
   * Serve a un gesto solo: «Annulla» sotto la rotella. Con un modello sul
   * proprio computer l'attesa prima della prima parola si misura in secondi
   * veri, e finché non c'era questo l'unico modo di fermarla era ricaricare la
   * pagina — cioè perdere la chat. Chiudendo la connessione il server vede
   * `close` e ferma anche il modello.
   */
  const filoChat = useRef<AbortController | null>(null)
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
  // cresce quando una chat già aperta va riletta: il richiamo ci ha scritto
  // dentro da un'altra finestra, e per questo effetto non è cambiato niente
  const [rilettura, setRilettura] = useState(0)
  useEffect(() => {
    if (!thread) { setMessaggi([]); setMessaggiPronti(true); return }
    if (filoNuovo.current === thread) { filoNuovo.current = null; setMessaggiPronti(true); return }
    const mio = ++gen.current
    setMessaggiPronti(false)
    api.messaggi(thread)
      .then(m => { if (gen.current === mio) setMessaggi(m) })
      .catch(() => { if (gen.current === mio) setMessaggi([]) })
      .finally(() => { if (gen.current === mio) setMessaggiPronti(true) })
  }, [thread, rilettura])

  useEffect(() => {
    const el = threadRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    const id = requestAnimationFrame(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight })
    return () => cancelAnimationFrame(id)
  // anche l'intervista: ogni domanda nuova e la chiusura devono arrivare in vista
  }, [messaggi.length, screen, pensando, battute.length, passo, intervistaFinita])

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

  /**
   * Le proposte di automazione sono state mostrate: il fulmine si spegne.
   *
   * Lo dice la schermata delle automazioni appena le ha sotto gli occhi. Si
   * chiama sempre, anche quando lo stato dice zero: una proposta scritta
   * durante l'apertura della pagina lo stato non l'ha ancora contata. Stabile
   * apposta, senza dipendenze: la schermata la mette fra le dipendenze del suo
   * caricamento, e non deve rifarlo a ogni disegno.
   */
  const segnaSuggerimentiVisti = useCallback(async () => {
    await api.segnaSuggerimentiVisti()
    setStato(s => ({ ...s, suggerimentiNuovi: 0 }))
  }, [])

  // — azioni —

  const go = (s: Screen) => (e?: { preventDefault?: () => void }) => {
    if (e?.preventDefault) e.preventDefault()
    setScreen(s); setSearch(false); setMenu(false)
  }

  const discussioniCompiti = useRef(new Map<string, string>())
  const compitoDiscussione = (chat: string): string | undefined => {
    const known = discussioniCompiti.current.get(chat)
    if (known) return known
    try { return localStorage.getItem(`myynd:discussion:${chat}`) || undefined } catch { return undefined }
  }
  const chiedi = async (testo: string, chatId?: string) => {
    // una domanda vera chiude l'intervista: le risposte date sono già salvate
    chiudiIntervista()
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
    // il filo di prima, se ce n'era uno appeso, non serve più a nessuno
    filoChat.current?.abort()
    const filo = new AbortController()
    filoChat.current = filo
    try {
      // La risposta cresce sotto gli occhi invece di comparire tutta insieme:
      // un messaggio finto che si riempie a ogni frammento, sostituito da
      // quello vero — con le fonti — solo alla fine.
      const idVivo = idScritta + 'a'
      let cresciuta = ''
      setPassoChat(null)
      const r = await api.chiedi(id, testo, delta => {
        if (gen.current !== mio) return
        cresciuta += delta
        setPensando(false)
        setPassoChat(null)
        setMessaggi(m => {
          const senza = m.filter(x => x.id !== idVivo)
          return [...senza, { id: idVivo, role: 'a', text: cresciuta }]
        })
      }, () => {
        // il motore è cambiato a metà e la risposta riparte da capo: quello
        // che si è già letto non è un pezzo di questa, e sotto tornerebbe due volte
        if (gen.current !== mio) return
        cresciuta = ''
        setPensando(true)
        setMessaggi(m => m.filter(x => x.id !== idVivo))
      }, filo.signal, compitoDiscussione(id), passo => { if (gen.current === mio) setPassoChat(passo) })
      if (gen.current === mio) setMessaggi(r.messaggi)
    } catch (e) {
      /*
       * «Annulla» non è un guasto.
       *
       * Chi l'ha premuto sa già cos'è successo: mostrargli un cartellino rosso
       * sarebbe dirgli che è andato storto un gesto che ha fatto lui. Si toglie
       * la domanda rimasta appesa e le si rimette in mano il testo, che è
       * l'unica cosa che gli serve per riprovare — magari con un altro modello.
       */
      const suo = filo.signal.aborted
      if (!suo) mostraToast(e instanceof Error ? t(e.message) : t('Non sono riuscito a rispondere.'))
      if (gen.current === mio) {
        setMessaggi(m => m.filter(x => !x.id.startsWith('tmp')))
        setDraftMsg(d => d || bozza)   // il testo scritto non si perde
      }
    }
    if (filoChat.current === filo) filoChat.current = null
    // l'elenco delle chat si rinfresca fuori dal try: un elenco che non torna
    // faceva dire «non sono riuscito a rispondere» di una risposta arrivata intera
    caricaChat().catch(() => {})
    // Explicit project goals are saved before the reply; update the feed too.
    caricaFeed().catch(() => {})
    /*
     * Sempre, non solo se è ancora la mia generazione.
     *
     * Aprire un'altra chat mentre la risposta non è ancora cominciata faceva
     * avanzare la generazione, e questa riga veniva saltata: `pensando`
     * restava acceso per il resto della sessione. Con il bottone disabilitato
     * e l'Invio ora guardato dallo stesso flag, la chat smetteva di poter
     * mandare — in tutti i fili, fino a un ricaricamento.
     */
    setPensando(false)
  }

  const sincronizza = async (fonte?: string) => {
    setSincronizzando('preparo')
    // le fonti che non portano documenti non hanno niente da dire in questa lettura
    let righe = fonte ? null : iniziaLettura(connOn.filter(c => !['claude', 'openai', 'compatibile', 'jev'].includes(c.id)).map(c => c.id))
    setLetturaFonti(righe)
    try {
      await api.sincronizza(m => {
        if (m.fase !== 'fine') setSincronizzando(rigaSincronizzazione(m))
        if (righe) { righe = avanzaLettura(righe, m); setLetturaFonti(righe) }
      }, fonte)
      const [nuovo] = await Promise.all([ricaricaStato(), caricaMente(mappaInVista), caricaFeed()])
      if (righe) setLetturaFonti(chiudiLettura(righe, id => nuovo.connettori.find(c => c.id === id)?.documenti))
      mostraToast(t('Letto tutto quello che è cambiato.'))
    } catch (e) {
      // la frase arriva nel riquadro: righe ferme a «in coda» direbbero che sta ancora leggendo
      setLetturaFonti(null)
      mostraToast(e instanceof Error ? t(e.message) : t('Sincronizzazione fallita.'))
    }
    setSincronizzando(null)
  }

  const genera = async () => {
    setGenerando(true)
    try {
      const r = await api.generaFeed()
      setGuastoLettura(null)
      // la riga fissa delle fonti non lette viene dallo stato: si rilegge, così
      // una fonte che è tornata a posto sparisce da lì nello stesso momento
      setStato(s => ({ ...s, letturaIncompleta: r.fonti ?? [] }))
      await caricaFeed()
      // «dice che c'è un passo da chiarire, ma non mi ci porta»: la frase dice
      // dove, e la pagina porta le carte sotto gli occhi e le accende un attimo
      // «213 più vecchi della finestra» è una regola raccontata come scusa, e
      // a chi lavora su otto progetti suona ridicola: quando il quadro sta per
      // essere guardato, si dice quello, e basta. I numeri restano solo per
      // chi non ha un modello che possa dire altro.
      // stava già leggendo: non è un guasto e non è un «niente», è la stessa
      // lettura che avrebbe chiesto lui, cominciata un momento prima
      mostraToast(r.gia ? t('Sto già leggendo le tue fonti: quello che trovo compare qui da sé.')
        : r.generate ? frasi.coseNuove(r.generate)
        : r.cerco ? t('Dalle fonti non è arrivato niente di nuovo. Sto guardando i tuoi progetti, le cartelle di lavoro e la posta: quello che trovo compare qui da sé.')
        : (r.vuoto ? frasi.feedVuoto(r.vuoto) : t('Non ho trovato niente da segnalare.'))
          + (r.iniziative?.length ? ' ' + t('I tuoi progetti aspettano un passo, qui sotto.') : ''))
      if (!r.generate && r.iniziative?.length) setEvidenziaProgetti(Date.now())
    } catch (e) {
      const message = e instanceof Error ? t(e.message) : t('La lettura non è riuscita.')
      setGuastoLettura(message)
      mostraToast(message)
    }
    setGenerando(false)
  }

  // — valori derivati —

  const cl = gruppi.find(g => g.id === (nodoSelezionato?.gruppo ?? sel)) ?? gruppi[0]
  const documentoCorrente = documentoMappa?.id === nodoSelezionato?.id ? documentoMappa : null
  const testoNodo = anteprimaDocumentoMappa(leggibile(documentoCorrente?.corpo ?? nodoSelezionato?.estratto ?? '').map(r => r.testo).filter(Boolean).join(' '))
  const connettori = stato.connettori
  // «Da fare» è dentro l'app e si dichiara collegato sempre: contarlo fra le
  // fonti diceva «1 fonte» a chi non aveva collegato niente, e la stessa
  // schermata sotto diceva «non hai collegato niente»
  const connOn = connettori.filter(c => c.collegato && c.id !== 'mind2do')
  // «può ragionare», non «c'è Claude»: con un fornitore compatibile scelto come
  // motore la chat e le domande funzionano uguale, e devono aprirsi. Lo dice il
  // server (`ragiona` in api.ts): rifatto qui da `motore` e dalle schede, non
  // sempre coincideva con quello che il server sa fare
  const claudeOn = stato.ragiona
  const th = threads.find(t => t.id === thread)

  /** Reach the original; a saved copy is an explicit fallback, never a fake destination. */
  const portamiFonte = async (id: string) => {
    if (aperturaFonte.current) return
    aperturaFonte.current = true
    setAprendoFonte(id)
    const apertura = preparaApertura()
    const copiaFonte = async (motivo: string) => {
      apertura.annulla()
      const salvata = await api.documento(id)
      setDoc({ ...salvata, _avviso: `${t('Non posso aprire l’originale. Questa è la copia salvata della fonte.')} ${motivo}` })
    }
    try {
      const r = await apertura.completa(await api.portamiDocumento(id))
      if (!r.ok) await copiaFonte(t(r.errore))
    } catch {
      try { await copiaFonte('') }
      catch { mostraToast(t('Non trovo più il documento.')) }
    } finally {
      apertura.annulla()
      aperturaFonte.current = false
      setAprendoFonte(null)
    }
  }


  /**
   * «Non mi interessa»: via dal feed, e non torna domani.
   *
   * Stava dentro il menù «⋯», che è il posto dove si mettono le cose che non si
   * vuole far vedere. Ma questo è il gesto che tiene pulito il feed — se costa
   * due clic e una scoperta, non lo fa nessuno, e dopo una settimana la
   * schermata è piena di roba che non interessa a nessuno. Adesso sta su ogni
   * riga, quando la riga è sotto il dito, scritto piccolo.
   *
   * Sparisce subito e si scusa dopo: aspettare il server su un gesto così
   * piccolo fa sembrare lenta l'app proprio dove è più veloce.
   */
  /**
   * Rimette una voce dove stava, non in cima.
   *
   * In cima è il posto sbagliato due volte: non è quello da cui l'hai tolta, e
   * su una pagina a blocchi «in cima» non vuol nemmeno dire niente — la voce
   * torna dentro il blocco del suo progetto, che può stare in fondo allo
   * schermo. Rimetterla al suo indice la fa ricomparire esattamente dove
   * l'avevi lasciata, che è l'unica cosa che assomiglia a non averla toccata.
   */
  const rimettiVoce = (v: VoceFeed, dove: number) => setAperti(a => {
    const senza = a.filter(x => x.id !== v.id)
    const posto = Math.max(0, Math.min(dove, senza.length))
    return [...senza.slice(0, posto), v, ...senza.slice(posto)]
  })

  const scarta = async (v: VoceFeed) => {
    const dove = aperti.findIndex(x => x.id === v.id)
    setAperti(a => a.filter(x => x.id !== v.id))
    try {
      await api.rispondiFeed(v.id, t('Non mi interessa.'), 'scartato')
      mostraToast(t('Via. Non te la rimetto davanti.'), () => {
        rimettiVoce(v, dove)
        api.segnaFeed(v.id, 'aperto').catch(() => {
          setAperti(a => a.filter(x => x.id !== v.id))
          mostraToast(t('Non sono riuscito ad annullare.'))
        })
      })
    } catch (e) {
      // rimetterla dov'era è meglio che farla sparire in silenzio
      rimettiVoce(v, dove)
      mostraToast(e instanceof Error ? t(e.message) : t('Non sono riuscito a toglierla.'))
    }
  }


  /**
   * Rispondere a quello che ha chiesto lui. L'esito non finisce in un avviso
   * che scompare: resta al posto della domanda, perché il senso di tutto il
   * meccanismo è vedere *cosa è cambiato*. Un avviso che sfarfalla e sparisce
   * insegnerebbe che rispondere non serve.
   */
  /*
   * Presa, e poi detto cosa ne ho fatto.
   *
   * La domanda sparisce nell'istante in cui si manda, e la carta delle
   * domande scrive «Presa.» al suo posto; quando arriva l'esito vero, che
   * dice dove è finita la risposta, la carta lo riscrive. Se il server non
   * ce la fa la domanda torna, e la carta tiene le sue parole nel campo: non
   * si perde niente. L'esito torna a chi chiama, che è chi lo disegna.
   */
  const rispondiADomanda = async (id: string, testo: string): Promise<string> => {
    const questa = domanda?.id === id ? domanda : null
    if (!testo.trim()) throw new Error('Scrivi qualcosa.')
    setDomanda(d => (d?.id === id ? null : d))
    try {
      const r = await api.rispondiDomanda(id, testo)
      return r.esito
    } catch (e) {
      if (questa) setDomanda(questa)
      mostraToast(e instanceof Error ? t(e.message) : t('Non sono riuscito a segnarlo.'))
      throw e
    }
  }

  const lasciaCadere = async () => {
    if (!domanda) return
    const id = domanda.id
    setDomanda(null)
    // non si ripropone: lasciarla cadere è una risposta anche quella
    try { await api.ignoraDomanda(id) } catch { /* al prossimo avvio non c'è più */ }
  }

  /**
   * La risposta alla domanda di un progetto, dalla prima pagina.
   *
   * Stessa presa: la domanda se ne va subito, l'esito arriva dopo e dice
   * dove è finita la risposta (in lista sotto il progetto, o nella sua
   * memoria). Se non passa, la domanda torna al suo posto.
   */
  const rispondiIniziativa = async (id: string, testo: string): Promise<string> => {
    if (!testo.trim()) throw new Error('Scrivi qualcosa.')
    const prima = iniziative
    setIniziative(i => i.filter(x => x.id !== id))
    try {
      const r = await api.rispondiIniziativa(id, testo)
      setIniziative(r.iniziative)
      return r.esito
    } catch (e) {
      setIniziative(prima)
      mostraToast(e instanceof Error ? t(e.message) : t('Non sono riuscito a segnarlo.'))
      throw e
    }
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

  /** «Fatto» su una voce: via dalle aperte, fra le fatte, e il server lo sa un attimo dopo. */
  const risolvi = async (v: VoceFeed) => {
    const dove = aperti.findIndex(x => x.id === v.id)
    setAperti(a => a.filter(x => x.id !== v.id))
    setFatte(f => [v, ...f])
    // disfare questa, non «l'ultima segnata»: fra il gesto e il ripensamento
    // il feed può essersi riletto da solo, e l'ultima essere diventata un'altra
    const annulla = () => {
      setFatte(f => f.filter(x => x.id !== v.id))
      rimettiVoce(v, dove)
      api.segnaFeed(v.id, 'aperto').catch(() => {
        setAperti(a => a.filter(x => x.id !== v.id))
        setFatte(f => [v, ...f])
        mostraToast(t('Non sono riuscito ad annullare.'))
      })
    }
    try {
      const r = await api.segnaFeed(v.id, 'fatto')
      // con un progetto l'avviso dice anche che si è segnato il traguardo e
      // che guarda il passo dopo: quello arriva da solo, dal filo
      mostraToast(r.registrato?.progetto ? frasi.segnataPer(r.registrato.progetto) : t('Segnata come fatta.'), annulla)
    } catch {
      // rimetto le cose come stavano invece di mentire
      setFatte(f => f.filter(x => x.id !== v.id))
      rimettiVoce(v, dove)
      mostraToast(t('Non sono riuscito a segnarla.'))
    }
  }

  /*
   * Portare su un progetto: un biglietto per la Memoria e la schermata che
   * cambia. Sta fuori dall'oggetto perché la registra anche `registraPortaProgetto`,
   * per le schermate che non ricevono `v` — vedi lì sopra.
   */
  const apriProgetto = useCallback((id: string) => {
    // la sua pagina si apre qui, sopra quello che si stava guardando: chiudendola
    // si torna dov'eri, non in una Memoria che non avevi chiesto
    setProgettoAperto(id); setSearch(false); setMenu(false)
  }, [])
  useEffect(() => {
    registraPortaProgetto(apriProgetto)
    return () => registraPortaProgetto(null)
  }, [apriProgetto])

  // e la porta della chat, per le righe che non sono compiti: vedi `portaInChat`
  useEffect(() => {
    registraPortaChat((testo: string) => { void chiedi(testo) })
    return () => registraPortaChat(null)
  })

  // e quella di Da fare, per l'editor di un progetto: vedi `portaAlleAttivita`
  useEffect(() => {
    registraPortaCose(() => { setScreen('oggi'); setSearch(false); setMenu(false) })
    return () => registraPortaCose(null)
  }, [])

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
    /** Le automazioni proposte che non ha ancora visto: il fulmine in colonna si accende. */
    suggerimentiNuovi: stato.suggerimentiNuovi ?? 0,
    segnaSuggerimentiVisti,
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
    // le voci, e basta: «mi dice che ci sono due cose sul tavolo, ma non ce
    // n'è nessuna». Una domanda sui progetti non è una cosa arrivata.
    vociAperte: aperti.length,
    totaleDocumenti: stato.conteggi.totale,
    badge: { fontSize: '11.5px', fontWeight: 500, opacity: aperti.length ? 1 : 0.35 } as CSSProperties,
    sincronizzando,
    letturaFonti,
    sincronizza: () => sincronizza(),
    claudeOn,
    /** La scheda di Claude è collegata: la stessa risposta delle Fonti, per chi deve dirlo altrove. */
    claudeCollegato: !!connettori.find(c => c.id === 'claude')?.collegato,

    // — feed —
    oggi: new Date().toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' }),
    ora: new Date().toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' }),
    // Il titolone non può dire «niente che richieda te» mentre sotto lui ti sta
    // chiedendo una cosa: la contraddizione fa sembrare che una delle due parti
    // dell'app non sappia cosa fa l'altra.
    headline: guastoLettura ? t('La lettura non è riuscita.') : guastoFeed ? t('Non riesco a leggere il feed.')
      : !feedCaricato ? t('Un momento…')
      : aperti.length === 0
      ? (iniziative.length ? t('Facciamo avanzare i tuoi progetti.') : domanda ? t('Una cosa da chiarire.')
        : stato.conteggi.totale ? t('Niente che richieda te, adesso.')
        : t('La tua mente è ancora vuota.'))
      : frasi.daGuardare(aperti.length, parole(aperti.length)),
    /**
     * Il titolo che conta la pagina intera.
     *
     * `headline` conosce solo le voci, e diceva «due cose» sopra una pagina
     * di nove: sotto le voci la prima pagina mostra anche le righe della
     * lista. Le righe della lista qui non ci sono — le ha chi disegna la
     * pagina — quindi è lui a passare quante cose ha messo in pagina, e qui
     * si aggiunge solo la domanda in sospeso.
     */
    // il numero lo fanno i blocchi (`blocchi-feed.sulTavolo`), domanda compresa
    sulTavolo: (n: number) => frasi.daGuardare(n, parole(n)),
    guastoFeed: guastoFeed ? t(guastoFeed) : null,
    guastoLettura,
    /*
     * Le fonti che l'ultima lettura non ha letto per intero, col nome che ha
     * la scheda nelle Fonti. Non è l'esito di *questo* clic: è quello che il
     * server sa dell'ultima lettura, a mano o automatica, e resta scritto in
     * pagina finché una lettura non trova la fonte a posto.
     */
    fontiIncomplete: (stato.letturaIncompleta ?? []).map(f => ({
      nome: t(connettori.find(c => c.id === f.fonte)?.nome ?? f.fonte), motivo: f.motivo
    })),
    feedCaricato,
    ricaricaFeed: () => { setGuastoFeed(null); setFeedCaricato(false); caricaFeed().catch(() => {}) },
    // Basta che non ci sia niente di aperto. Prima serviva anche zero fatte,
    // quindi chi aveva appena sistemato tutto restava con un elenco di cose
    // chiuse e nessuna indicazione su cosa succede adesso.
    feedVuoto: aperti.length === 0 && iniziative.length === 0,
    iniziative,
    evidenziaProgetti,
    /** Il colore del progetto, scelto o stabile: le carte della prima pagina si vestono con questo. */
    coloreProgetto: (id: string) => coloreProgetto(progetti?.find(p => p.id === id) ?? { id }, progetti ?? []),
    /*
     * «Parliamone»: una chat nuova in cui Myynd scrive per primo.
     *
     * Prima si apriva una chat vuota con un messaggio *suo* già scritto nel
     * campo, da mandare: «una frase strana, con le freccette attorno alle
     * parole», e il campo non la mostrava nemmeno tutta. «Preferirei che
     * Myynd mi scrivesse lui.» Le prime parole le scrive il server; qui si
     * apre la chat con quelle dentro e il campo vuoto, pronto per lui.
     */
    discutiIniziativa: async (item: ProjectInitiative) => {
      chiudiIntervista()
      const chat = `th${Date.now()}`
      try {
        const r = await api.apriChatProgetto(chat, item.id)
        filoNuovo.current = chat
        setMessaggi(r.messaggi); setThread(chat); setDraftMsg('')
        setScreen('chat'); setSearch(false); setMapFull(false); setMenu(false)
        caricaChat().catch(() => {})
      } catch (e) {
        mostraToast(e instanceof Error ? t(e.message) : t('Non sono riuscito ad aprire la chat.'))
      }
    },
    scartaIniziativa: async (id: string) => {
      try { const r = await api.feedbackIniziativa(id, 'dismissed'); setIniziative(r.iniziative) }
      catch { mostraToast(t('Non sono riuscito a salvare la preferenza.')) }
    },
    haFatte: fatte.length > 0,
    generando, genera,
    /** La carta scura: quella in cui si apre una riga della lista per lavorarci. */
    cartaScura: {
      borderRadius: 20,
      background: 'linear-gradient(138deg,rgba(176,82,46,.9),rgba(154,100,55,.88) 46%,rgba(74,58,49,.92))',
      backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
      border: '1px solid rgba(var(--luce-rgb),.6)',
      boxShadow: '0 30px 70px rgba(var(--ombra-rgb),.34),inset 0 1px 0 rgba(var(--luce-rgb),.35)',
      // Niente altezza minima: con il testo ripiegato la card restava alta 300
      // pixel con dentro centoventi di vuoto. Adesso è alta quanto quello che
      // contiene, e si allunga solo se apri il testo lungo.
      padding: '22px 24px 20px', transform: 'rotate(-.35deg)', color: 'var(--avorio)', flex: 'none',
      display: 'flex', flexDirection: 'column', animation: 'heroin .35s ease',
      // il confine del testo è la carta: un titolo scritto dal modello a partire
      // da un nome di file senza spazi non deve poterne uscire
      overflow: 'hidden', overflowWrap: 'anywhere'
    } as CSSProperties,
    /*
     * Le voci del feed, come arrivano: chi disegna la pagina le mette ognuna
     * nel blocco del suo progetto (`blocchi-feed.ts`) e le veste lì. Niente
     * «carta in cima» e niente «resto»: erano la stessa voce vestita in due
     * modi, e la pagina non ha più una voce che conta più delle altre.
     */
    voci: aperti,
    /** «Fatto» su una voce. */
    risolviVoce: (v: VoceFeed) => { void risolvi(v) },
    /** «Non mi interessa» su una voce: via, e non torna. */
    scartaVoce: (v: VoceFeed) => { void scarta(v) },
    // «Parlane in chat»: la coda è testo che finisce nella *sua* bolla e resta
    // scritto nella chat, quindi va nella lingua dell'app come tutto il resto.
    // Niente «Mettila in lista»: una voce del feed è già una cosa da fare —
    // «perché dovrebbe chiedermi di metterla in lista? è già in lista»
    parlaneDi: (v: VoceFeed) => { void chiedi(frasi.dimmiDiPiu(v.titolo)) },
    portamiFonte,
    /** Il documento che «Portami lì» sta aprendo adesso, se ce n'è uno: il link dice «Un momento…». */
    aprendoFonte,
    /**
     * La voce è diventata una riga della lista: via dal feed, senza ricaricarlo.
     *
     * Il server l'ha già chiusa — gliel'ha detto `voce` quando è nato il
     * compito — e qui si allinea quello che si ha davanti. Ricaricare il feed
     * intero per una riga farebbe sparire la pagina per mezzo secondo.
     */
    viaDalFeed: (id: string) => setAperti(a => a.filter(x => x.id !== id)),

    // — le domande che fa lui: la sua, e quelle sui progetti, in una carta sola —
    domanda,
    rispondiADomanda,
    lasciaCadere,
    rispondiIniziativa,

    fuoco,
    // chi ha scritto quella riga: come per gli argomenti, il campo lo dice
    // invece di lasciar credere a qualcuno di averla scritta lui
    fuocoDaMe: stato.config.fuocoDaMe === true,
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
    /** I progetti come li conosce il client: servono a dare un nome a un id. */
    progetti: progetti ?? [],

    /**
     * L'ordine dei blocchi della prima pagina, scelto da lui trascinandoli.
     *
     * Vuoto finché non ne sposta uno: allora decide la prima pagina da sé —
     * prima quello che aspetta lui, poi il più recente. Il nome è lo stesso di
     * qua e di là del filo (`ordineBlocchi`), e si guarda prima dentro `config`
     * e poi in cima allo stato: due posti possibili, una parola sola.
     */
    ordineBlocchi: stato.config.ordineBlocchi ?? stato.ordineBlocchi ?? [],
    /**
     * Salvarlo: subito sullo schermo, poi sul disco.
     *
     * Trascinare un blocco deve essere istantaneo — aspettare il server per
     * vedere una sezione salire la farebbe sembrare incollata — e se la
     * scrittura non riesce si rilegge lo stato, così la pagina non resta a
     * mostrare un ordine che nessuno ha scritto da nessuna parte.
     */
    salvaOrdineBlocchi: (ids: string[]) => {
      setStato(s => ({ ...s, config: { ...s.config, ordineBlocchi: ids } }))
      api.ordinaBlocchi(ids).catch(() => {
        mostraToast(t('Non sono riuscito a salvare l’ordine.'))
        ricaricaStato()
      })
    },
    /**
     * Aprire il progetto dietro una riga.
     *
     * Un progetto non ha una schermata sua: vive nella Memoria, in mezzo agli
     * altri. Portarci e basta vorrebbe dire lasciarlo cercare la riga giusta
     * in un elenco — quindi si lascia il biglietto, e la Memoria porta quella
     * riga sotto gli occhi appena si disegna.
     */
    apriProgetto,
    /** Il progetto aperto nella sua pagina, o null. */
    progettoAperto,
    chiudiProgetto: () => setProgettoAperto(null),
    progettiNuovi,
    chiaveDiNascita: (id: string) => nascite[id] ?? id,
    ricaricaProgetti,
    /**
     * Un progetto nuovo, da un nome: nella pagina subito, al server dopo.
     *
     * La riga c'è nell'istante di Invio, con un id provvisorio, e il blocco
     * vuoto della prima pagina con lei; la risposta del server la sostituisce
     * con quella vera. Se non passa, sparisce e lo dice. Torna quella vera, o
     * null.
     *
     * Lo stesso nome è lo stesso progetto (maiuscole comprese). Se c'è già e
     * non è chiuso, non si finge di averne fatto uno: lo si dice e si apre la
     * sua pagina. Se era chiuso, il server lo riapre normale, e lo si dice.
     */
    nuovoProgetto: async (nome: string): Promise<Progetto | null> => {
      const pulito = nome.trim()
      if (!pulito) return null
      const noto = (progetti ?? []).find(p => p.nome.trim().toLowerCase() === pulito.toLowerCase())
      if (noto && noto.stato !== 'chiuso') {
        mostraToast(frasi.progettoEsiste(noto.nome))
        setProgettoAperto(noto.id)
        return noto
      }
      const adesso = new Date().toISOString()
      const finto: Progetto = {
        id: `nuovo-${Date.now()}`, nome: pulito, obiettivo: '', stato: 'attivo', dal: adesso, aggiornato: adesso,
        note: '', origine: 'mano', colore: '', alias: [], genitore: null, priorita: null, memoria: null
      }
      setProgetti(ps => [...(ps ?? []), finto])
      setProgettiNuovi(ns => [...ns, finto.id])
      try {
        const r = await api.nuovoProgetto(pulito)
        const vero = r.progetto
        // lo stesso nome è lo stesso progetto: se c'era già, resta uno
        setProgetti(ps => {
          const senza = (ps ?? []).filter(p => p.id !== finto.id && p.id !== vero.id)
          return [...senza, { ...vero, memoria: null }]
        })
        if (r.esisteva && !r.riaperto) {
          // c'era già (lo sapeva il server e non ancora lo schermo): niente
          // blocco nuovo, lo si dice e si apre il suo
          setProgettiNuovi(ns => ns.filter(x => x !== finto.id))
          mostraToast(frasi.progettoEsiste(vero.nome))
          setProgettoAperto(vero.id)
        } else {
          setNascite(n => ({ ...n, [vero.id]: finto.id }))
          setProgettiNuovi(ns => ns.map(x => (x === finto.id ? vero.id : x)))
          if (r.riaperto) mostraToast(frasi.progettoRiaperto(vero.nome))
        }
        annunciaProgetti(questaCopia.current)
        return vero
      } catch (e) {
        setProgetti(ps => (ps ?? []).filter(p => p.id !== finto.id))
        setProgettiNuovi(ns => ns.filter(x => x !== finto.id))
        mostraToast(e instanceof Error ? t(e.message) : t('Non sono riuscito a crearlo.'))
        return null
      }
    },
    /**
     * Cambiare un progetto: nella pagina subito, al server dopo.
     *
     * Il guaio non si mangia qui: torna a chi ha chiamato, che lo scrive sotto
     * la cosa che l'ha causato. L'ordine trascinato non si tocca: sulla prima
     * pagina gli alti stanno davanti da sé (`ordinaBlocchi`).
     */
    cambiaProgetto: async (id: string, c: CambioProgetto): Promise<void> => {
      setProgetti(ps => ps ? ps.map(p => (p.id === id ? { ...p, ...c } : p)) : ps)
      try {
        const vero = (await api.cambiaProgetto(id, c)).progetto
        setProgetti(ps => ps ? ps.map(p => (p.id === id ? { ...p, ...vero } : p)) : ps)
        annunciaProgetti(questaCopia.current)
      } catch (e) {
        void ricaricaProgetti()
        throw e
      }
    },

    hasDone: fatte.length > 0, doneCount: fatte.length, doneOpen,
    toggleDone: () => setDoneOpen(v => !v),
    doneChevron: { display: 'flex', transform: doneOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .2s' } as CSSProperties,
    fatte: fatte.map((d, ix) => ({
      id: d.id, esito: d.titolo, tipo: d.tipo, fonte: d.fonte ?? '', at: quando(d.quando),
      testo: d.testo, open: openDone === d.id, label: openDone === d.id ? t('Chiudi') : t('Vedi'),
      wrap: {
        borderTop: ix === 0 ? 'none' : '1px solid rgba(var(--inchiostro-rgb),.08)',
        background: openDone === d.id ? 'rgba(var(--luce-rgb),.5)' : 'transparent'
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
      onAsk: (e: React.MouseEvent) => { e.stopPropagation(); chiedi(frasi.dimmiDiPiu(d.titolo)) }
    })),

    // — documento aperto —
    docOpen: !!doc,
    doc,
    chiudiDoc: () => setDoc(null),

    // — toast —
    toastOn: !!toast, toastText: toast?.text ?? '', toastUndo: !!toast?.undo,
    /*
     * «Annulla» disfa il gesto che ha acceso questo avviso, e nient'altro.
     *
     * Prima qui c'era la regola, non il gesto: se c'era uno scarto disfa lo
     * scarto, se no rimetti a posto `fatte[0]`. Due supposizioni, e tutte e
     * due cadono da sole — il feed si rilegge quando il server gli dice che è
     * cambiato qualcosa, quindi fra il «Fatto» e il ripensamento `fatte[0]`
     * può essere diventata un'altra cosa, e una riga della lista chiusa per
     * sbaglio non aveva proprio nessun modo di tornare. Adesso il gesto viaggia
     * con l'avviso: chi lo mostra sa che cosa ha fatto.
     */
    undo: () => {
      const disfa = toast?.undo
      setToast(null)
      disfa?.()
    },

    discutiCompito: (c: Compito) => {
      const id = c.id
      chiudiIntervista()
      const chat = `th${Date.now()}`
      discussioniCompiti.current.set(chat, id)
      try { localStorage.setItem(`myynd:discussion:${chat}`, id) } catch { /* session binding still works */ }
      filoNuovo.current = chat
      setThread(chat); setMessaggi([]); setScreen('chat'); setSearch(false); setMenu(false)
      setDraftMsg(`${stato.config.lingua === 'en' ? 'About' : 'A proposito di'} «${c.consegna?.titolo || c.testo}»: `)
    },
    // — chat —
    threads: threads.map(ch => ({
      id: ch.id, titolo: ch.titolo, quando: quando(ch.quando),
      aperta: ch.id === thread,
      sopra: ch.id === hoverThread,
      row: {
        display: 'flex', alignItems: 'center', gap: 6, padding: '8px 9px', borderRadius: 10, cursor: 'pointer',
        background: ch.id === thread ? 'rgba(var(--luce-rgb),.92)' : ch.id === hoverThread ? 'rgba(var(--luce-rgb),.6)' : 'transparent'
      } as CSSProperties,
      onEnter: () => setHoverThread(ch.id),
      onLeave: () => setHoverThread(h => (h === ch.id ? null : h)),
      onClick: () => { chiudiIntervista(); setThread(ch.id) },
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
    newChat: () => { chiudiIntervista(); setThread(`th${Date.now()}`); setMessaggi([]); setScreen('chat') },
    /** Una chat precisa, anche se nata altrove: l'elenco si rilegge, e i messaggi con lui. */
    apriChat: (id: string) => {
      setThread(id); setRilettura(n => n + 1); setScreen('chat'); setSearch(false); setMenu(false)
      caricaChat().catch(() => {})
    },
    chatEmpty: messaggi.length === 0,
    chatCaricata: elencoChatPronto && messaggiPronti,
    // la conversazione con Myynd ha il suo nome
    chatTitolo: passo !== null || intervistaFinita ? 'Myynd' : th?.titolo ?? 'Nuova chat',
    pensando,
    passoChat,
    /** Taglia la risposta che sta arrivando. Vale solo mentre `pensando` è acceso. */
    annulla: () => { filoChat.current?.abort() },
    messages: messaggi.map(m => ({
      id: m.id, text: m.text, mio: m.role === 'u',
      hasSources: !!(m.sources && m.sources.length), sources: m.sources ?? [],
      row: m.role === 'u' ? RIGA_MIA : RIGA_SUA,
      bubble: m.role === 'u' ? BOLLA_MIA : BOLLA_SUA
    })),
    /** Le stesse bolle, per l'intervista: le domande sono sue, le risposte mie. */
    bolla: { mia: BOLLA_MIA, sua: BOLLA_SUA, rigaMia: RIGA_MIA, rigaSua: RIGA_SUA },
    intervista: passo !== null || intervistaFinita ? {
      domanda: passo !== null ? DOMANDE[passo] : null,
      battute,
      finita: intervistaFinita,
      rispondi: (testo: string | null) => { void rispondiIntervista(testo) },
      chiudi: chiudiIntervista,
      configuraProgetto: () => { chiudiIntervista(); avviaOnboarding() }
    } : null,
    avviaIntervista: () => avviaIntervista(true),
    /** Myynd ha scritto e aspetta: il pallino sulla chat e la carta in cima alla prima pagina. */
    chatDaLeggere: passo !== null,
    senzaProgetto: progetti !== null && progetti.length === 0,
    avviaOnboarding,
    prompts: [
      // le domande su di te si rifanno da qui, e non servono documenti
      { id: 'p0', text: t('Raccontami di te'), onClick: () => avviaIntervista(true) },
      ...(stato.conteggi.totale
        ? [
            // il testo mandato al modello è quello tradotto: gli si parla nella
            // lingua in cui poi deve rispondere
            { id: 'p1', text: t('Cosa è arrivato oggi?'), onClick: () => chiedi(t('Cosa è arrivato oggi?')) },
            { id: 'p2', text: t('Chi aspetta una mia risposta?'), onClick: () => chiedi(t('Chi aspetta una mia risposta?')) },
            { id: 'p3', text: t('Riassumimi la settimana'), onClick: () => chiedi(t('Riassumimi la settimana')) }
          ]
        : [])
    ],
    draftMsg,
    onType: (e: { target: { value: string } }) => setDraftMsg(e.target.value),
    // il bottone era già disabilitato mentre risponde; Invio no, e mandava due volte
    // durante l'intervista Invio risponde a Myynd, non interroga il materiale
    onKey: (e: React.KeyboardEvent) => {
      if (e.key !== 'Enter' || e.shiftKey) return
      // il campo è un textarea: Invio manda, e non va a capo
      e.preventDefault()
      if (passo !== null) { if (draftMsg.trim()) { void rispondiIntervista(draftMsg.trim()); setDraftMsg('') } return }
      if (!pensando && draftMsg.trim()) chiedi(draftMsg.trim())
    },
    send: () => {
      if (passo !== null) { if (draftMsg.trim()) { void rispondiIntervista(draftMsg.trim()); setDraftMsg('') } return }
      if (!pensando && draftMsg.trim()) chiedi(draftMsg.trim())
    },

    // — mappa —
    mappaMeta: gruppi.length
      ? frasi.documentiEGruppi(stato.conteggi.totale.toLocaleString(loc()), gruppi.length)
      : t('ancora nessun documento'),
    mappaVuota: !!grafo && !grafo.nodi.length,
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
          background: on ? 'rgba(var(--avorio-rgb),.12)' : 'rgba(var(--avorio-rgb),.04)',
          border: '1px solid ' + (on ? 'rgba(var(--avorio-rgb),.28)' : 'rgba(var(--avorio-rgb),.1)'),
          color: 'rgba(var(--avorio-rgb),' + (on ? '.94' : '.45') + ')'
        } as CSSProperties,
        dot: { width: 8, height: 8, borderRadius: '50%', background: g.colore, flex: 'none' } as CSSProperties,
        onClick: () => { setFiltro(f => (f === g.id ? null : g.id)); setSel(g.id) }
      }
    }),
    selTipo: nodoSelezionato ? [parolaFonte(nodoSelezionato.fonte, nodoSelezionato.id), dataDocumentoMappa(nodoSelezionato.quando)].filter(Boolean).join(' · ')
      : cl ? frasi.nDocumenti(cl.nodi.toLocaleString(loc())) : '',
    selNome: nodoSelezionato?.titolo || (cl ? t(cl.nome) : t('Niente ancora')),
    selDot: { width: 10, height: 10, borderRadius: '50%', background: cl?.colore ?? 'var(--inchiostro-3)', flex: 'none', marginTop: 4 } as CSSProperties,
    selTesto: nodoSelezionato ? taglia(testoNodo, 580) || (caricoNodo ? t('Leggo il documento…') : t('Apri la fonte per leggere il documento.'))
      : cl ? t('Scegli un documento per leggerne il contenuto e i collegamenti.')
      : t('Collega una fonte e qui comparirà quello che Myynd ha letto.'),
    selDocumento: nodoSelezionato?.id ?? null,
    selAutore: documentoCorrente?.autore || nodoSelezionato?.autore || '',
    selPercorso: nodoSelezionato?.fonte === 'desktop' ? documentoCorrente?.percorso || '' : '',
    selCarico: caricoNodo,
    selErrore: erroreNodo,
    selProgetti: nodoSelezionato?.progetti ?? [],
    selFeedback: nodoSelezionato?.feedback === 'fatto' ? t('Già completato') : nodoSelezionato?.feedback === 'scartato' ? t('Escluso dai suggerimenti') : '',
    selAttenzione: nodoSelezionato?.attenzione === 'brief' ? t('Aggiornamento per il punto')
      : nodoSelezionato?.attenzione === 'feed' ? t('Possibile azione') : nodoSelezionato?.attenzione === 'ignora' ? t('Materiale di riferimento') : '',
    selMotivo: motivoMappa(nodoSelezionato?.motivoAttenzione),
    selCollegati: documentiCollegati(grafo, sel),
    mappaDocumenti: (grafo?.nodi ?? []).filter(n => !cl || n.gruppo === (filtro ?? cl.id)),
    scegliDocumentoMappa: (id: string) => {
      const n = grafo?.nodi.find(x => x.id === id)
      if (n) onPick(n.id, n.gruppo)
    },
    apriSelezionato: () => { if (nodoSelezionato) void portamiFonte(nodoSelezionato.id) },
    leggiSelezionato: () => { if (nodoSelezionato) { setMapFull(false); api.documento(nodoSelezionato.id).then(setDoc).catch(() => mostraToast(t('Non trovo più il documento.'))) } },
    tornaAlGruppo: () => { if (cl) setSel(cl.id) },
    nodePlaceholder: nodoSelezionato ? t('Chiedi di questo documento…') : cl ? frasi.chiediSu(t(cl.nome).toLowerCase()) : t('Chiedi…'),
    nodeMsg,
    onNodeType: (e: { target: { value: string } }) => setNodeMsg(e.target.value),
    onNodeKey: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && nodeMsg.trim()) {
        chiedi(nodoSelezionato ? `${nodeMsg.trim()}\n\n${t('Documento selezionato')}: «${nodoSelezionato.titolo}» [doc:${nodoSelezionato.id}]` : nodeMsg.trim())
        setMapFull(false); setNodeMsg('')
      }
    },
    askNode: () => {
      if (nodeMsg.trim()) {
        chiedi(nodoSelezionato ? `${nodeMsg.trim()}\n\n${t('Documento selezionato')}: «${nodoSelezionato.titolo}» [doc:${nodoSelezionato.id}]` : nodeMsg.trim())
        setMapFull(false); setNodeMsg('')
      }
    },

    // — preferenze —
    toni: TONI.map(x => ({
      ...x, label: t(x.label),
      onClick: () => { setStato(s => ({ ...s, config: { ...s.config, tono: x.id } })); api.profilo({ tono: x.id }).catch(() => { mostraToast(t('Non sono riuscito a salvare la preferenza.')); ricaricaStato() }) },
      style: (x.id === stato.config.tono
        ? { padding: '10px 20px', borderRadius: 99, border: '1px solid rgba(var(--luce-rgb),.5)', background: 'linear-gradient(120deg,var(--rame-profondo),var(--ambra))', color: 'var(--avorio)', fontFamily: 'inherit', fontSize: '13.5px', fontWeight: 500, cursor: 'pointer' }
        : { padding: '10px 20px', borderRadius: 99, border: '1px solid rgba(var(--inchiostro-rgb),.2)', background: 'rgba(var(--luce-rgb),.5)', color: 'var(--inchiostro)', fontFamily: 'inherit', fontSize: '13.5px', cursor: 'pointer' }) as CSSProperties
    })),
    tonoEsempio: t(ESEMPIO_TONO[stato.config.tono] ?? ESEMPIO_TONO.diretto),

    // — chi fa il lavoro grosso: Claude, o un fornitore compatibile con OpenAI —
    motore: stato.config.motore ?? 'claude',
    compatibile: stato.config.compatibile,
    openai: stato.config.openai ?? null,
    /*
     * Rileggere lo stato dal server, da un pannello che ha appena cambiato
     * qualcosa fuori dal suo giardino.
     *
     * Scegliere fra abbonamento e chiave può cambiare la risposta a «Myynd può
     * ragionare?» — chi passa alla chiave senza averne una la fa diventare no —
     * e quella risposta la mostrano schermate che il pannello non conosce.
     */
    ricaricaStato,

    scegliMotore: async (m: 'claude' | 'compatibile' | 'chatgpt' | 'openai') => {
      if ((stato.config.motore ?? 'claude') === m && !(m === 'chatgpt' && !stato.config.chatgpt?.attivo)) return
      // senza un fornitore collegato non c'è niente da scegliere: si apre la
      // scheda per collegarlo, e collegarlo lo sceglie da sé
      if (m === 'compatibile' && !stato.config.compatibile) { apriConnessioni('compatibile'); return }
      if (m === 'openai' && !stato.config.openai?.collegato) { apriConnessioni('openai'); return }
      if (m === 'chatgpt') {
        try { await api.usaChatGPT(true); await ricaricaStato() }
        catch (e) { mostraToast(e instanceof Error ? t(e.message) : t('Non sono riuscito a cambiare motore.')) }
        return
      }
      setStato(s => ({ ...s, config: { ...s.config, motore: m } }))
      try { await api.scegliMotore(m) } catch { mostraToast(t('Non sono riuscito a cambiare motore.')); ricaricaStato() }
    },

    // — i modelli di Claude, uno per livello di lavoro; la lingua; quanto tengono le fatte —
    modelli: MODELLI.map(m => ({ id: m.id, nome: m.nome, nota: t(m.nota) })),
    /*
     * Un modello per livello. Si manda sempre la terna intera: il server la
     * vuole così, e la schermata la vede così. Il campo `modello` di prima
     * resta allineato alla frontiera, e lo fa il server.
     */
    livelli: LIVELLI.map(l => ({
      id: l.id, titolo: t(l.titolo), nota: t(l.nota),
      scelto: stato.config.modelli?.[l.id] ?? (l.id === 'casa' ? 'claude-haiku-4-5' : stato.config.modello ?? 'claude-sonnet-5'),
      scegli: (modello: string) => {
        const attuali = stato.config.modelli ?? { casa: 'claude-haiku-4-5', media: stato.config.modello ?? 'claude-sonnet-5', frontiera: stato.config.modello ?? 'claude-sonnet-5' }
        const modelli = { ...attuali, [l.id]: modello }
        setStato(s => ({ ...s, config: { ...s.config, modelli, modello: modelli.frontiera } }))
        api.profilo({ modelli }).catch(() => { mostraToast(t('Non sono riuscito a salvare la preferenza.')); ricaricaStato() })
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
    temi: TEMI.map(x => ({
      ...x, label: t(x.label),
      scelto: temaValido(stato.config.tema) === x.id,
      /*
       * Cambia subito, e poi lo si dice al server.
       *
       * Al contrario della lingua non c'e niente da tradurre e niente da
       * aspettare: `ricordaTema` sposta un attributo sulla radice e le
       * variabili della tavolozza cambiano tutte insieme nello stesso
       * fotogramma. Se il server non se lo segna, si ricarica lo stato e la
       * scelta torna quella vera.
       */
      onClick: () => {
        if (temaValido(stato.config.tema) === x.id) return
        ricordaTema(x.id)
        setStato(s => ({ ...s, config: { ...s.config, tema: x.id } }))
        api.profilo({ tema: x.id }).catch(() => { mostraToast(t('Non sono riuscito a salvare la preferenza.')); ricaricaStato() })
      }
    })),
    tenute: TENUTE.map(x => ({
      ...x, label: t(x.label),
      scelto: (stato.config.oreFatte ?? 48) === x.ore,
      onClick: () => {
        setStato(s => ({ ...s, config: { ...s.config, oreFatte: x.ore } }))
        api.profilo({ oreFatte: x.ore }).then(() => caricaFeed()).catch(() => { mostraToast(t('Non sono riuscito a salvare la preferenza.')); ricaricaStato() })
      }
    })),
    autonomie: AUTONOMIE.map(a => ({
      ...a, titolo: t(a.titolo), nota: t(a.nota),
      scelto: stato.config.autonomia === a.id,
      onClick: () => { setStato(s => ({ ...s, config: { ...s.config, autonomia: a.id } })); api.profilo({ autonomia: a.id }).catch(() => { mostraToast(t('Non sono riuscito a salvare la preferenza.')); ricaricaStato() }) },
      row: {
        display: 'flex', gap: 13, alignItems: 'flex-start', padding: '13px 14px', borderRadius: 16, cursor: 'pointer',
        background: stato.config.autonomia === a.id ? 'rgba(var(--luce-rgb),.85)' : 'transparent',
        boxShadow: stato.config.autonomia === a.id ? '0 12px 30px rgba(var(--ombra-rgb),.1)' : 'none'
      } as CSSProperties,
      radio: {
        width: 15, height: 15, flex: 'none', borderRadius: '50%', marginTop: 3,
        border: stato.config.autonomia === a.id ? '4px solid var(--rame)' : '1.5px solid rgba(var(--inchiostro-rgb),.35)',
        background: stato.config.autonomia === a.id ? 'var(--avorio)' : 'transparent'
      } as CSSProperties
    })),
    apriConnessioni,

    // — connettori —
    connMeta: frasi.attiviDaCollegare(connOn.length, connettori.filter(c => c.pronto).length - connOn.length),
    connAttivi: connOn.map(c => ({
      id: c.id, nome: c.nome,
      problema: c.id === 'note' && statoAccessoNote(stato).problema,
      // il desktop dice anche se lo sta guardando dal vivo: è la differenza
      // fra «letto sei ore fa» e «quello che salvi adesso è già dentro»
      stato: [frasi.statoConnettore(c.documenti), c.id === 'note' && statoAccessoNote(stato).messaggio ? t(statoAccessoNote(stato).messaggio!) : c.id === 'desktop' && stato.vedetta?.attiva ? t('in ascolto') : null]
        .filter(Boolean).join(' · '),
      // un clic apre la fonte nel suo pannello: scollegare si fa lì, con la domanda «Sicuro?».
      // Prima un clic qui scollegava subito, e la chiave di Claude spariva senza che nessuno l'avesse chiesto
      onClick: () => apriConnessioni(c.id)

    })),
    connSpenti: connettori.filter(c => c.pronto && !c.collegato).map(c => ({
      // il pannello si apre già su questa fonte: chi clicca "Posta" vuole
      // Posta, non l'elenco di tutto da ricominciare a cercare
      id: c.id, nome: c.nome, nota: c.nota, onClick: () => apriConnessioni(c.id)
    })),
    // una che arriva presto ma è già collegata sta fra le attive, non fra le future
    connFuturi: connettori.filter(c => !c.pronto && !c.collegato).map(c => ({ id: c.id, nome: c.nome, nota: c.nota })),

    // — ricerca —
    searchOpen: search, query,
    openSearch: () => setSearch(true),
    closeSearch: () => { setSearch(false); setQuery('') },
    onQuery: (e: { target: { value: string } }) => setQuery(e.target.value),
    risultati: risultati.map(r => ({
      id: r.id, titolo: r.titolo, fonte: `${r.fonte} · ${r.estratto.slice(0, 60)}…`, quando: quando(r.quando),
      dot: dot(COLORE_FONTE[r.fonte] ?? 'var(--rame)'),
      onClick: () => {
        api.documento(r.id).then(d => { setDoc(d); setSearch(false); setQuery('') }).catch(() => {})
      }
    })),

    track, knob
  }
}

export type Vals = ReturnType<typeof useVals>
export type { Connettore }
