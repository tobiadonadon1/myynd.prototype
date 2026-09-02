// Il ponte con il server locale. Niente dati finti: se non c'è ancora niente
// collegato, le risposte tornano vuote e l'interfaccia lo dice.

export type Connettore = {
  id: string
  nome: string
  gruppo: string
  pronto: boolean
  nota: string
  collegato: boolean
  documenti: number
}

export type Stato = {
  config: {
    nome: string | null
    ruolo: string | null
    onboarding: boolean
    tono: string
    autonomia: string
    modello: string
    lingua: string
    oreFatte: number
    giro: boolean
    /** Su cosa vuole essere tenuto aggiornato dai giornali. Vuoto = di tutto. */
    argomenti: string
    /** Quella riga l'ha scritta Myynd da quello che apre, non lei. */
    argomentiDaMe: boolean
    /** Ha chiesto le undici automazioni che arrivano col pacchetto. */
    diSerie: boolean
    posta: { host: string; utente: string; giorni: number } | null
    desktop: { cartelle: string[] } | null
    notion: { collegato: boolean } | null
    claude: { collegato: boolean } | null
    /** Chi fa il lavoro grosso: Claude, o il fornitore compatibile con OpenAI. */
    motore: 'claude' | 'compatibile'
    /** Il fornitore compatibile, senza la chiave: quella non esce mai. */
    compatibile: { collegato: boolean; url: string; modello: string; nome: string | null } | null
    /*
      Il `clientId` c'è perché serve a riempire un campo, non a autenticare:
      è il nome pubblico dell'app registrata, e sta già in chiaro in ogni
      indirizzo che si apre nel browser. Quello che non c'è, e non ci sarà mai,
      è il segreto accanto.
    */
    google: { collegato: boolean; email: string | null; clientId: string } | null
    slack: { collegato: boolean; squadra: string | null } | null
    drive: { collegato: boolean; email: string | null; clientId: string } | null
    microsoft: {
      collegato: boolean; email: string | null; parti: string[]
      clientId: string; tenant: string
    } | null
    dropbox: { collegato: boolean; conto: string | null } | null
    whatsapp: { collegato: boolean; etichetta: string | null; arrivati: number } | null
  }
  conteggi: {
    totale: number
    perFonte: { fonte: string; n: number }[]
    perGruppo: { gruppo: string; n: number }[]
  }
  connettori: Connettore[]
  suggerimentiDesktop: string[]
  presetPosta: Record<string, { host: string; porta: number; smtp: string; smtpPorta: number }>
  home: string
  /** Gira su un server: le fonti che leggono «questa macchina» non ci sono, e il ballo OAuth passa dal web. */
  ospitato: boolean
  /** Quali balli via web sono possibili qui, cioè per quali fornitori chi ospita ha registrato l'app. */
  oauth: { google: boolean; microsoft: boolean; ritorno: string | null }
}

import { frasi, lingua, t } from './lingua'

const CHIAVE = 'myynd.token'

// Con MYYND_DEV il server apre all'avvio una sessione da questo token: serve a
// non ripassare dall'accesso a ogni riavvio, ma resta un token come gli altri.
const TOKEN_SVILUPPO = import.meta.env.VITE_MYYND_DEV === '1' ? 'sviluppo-non-in-produzione' : ''

export const sessione = {
  token: () => localStorage.getItem(CHIAVE) || TOKEN_SVILUPPO,
  // Il filo dei compiti porta il token nell'indirizzo, perché EventSource non
  // manda intestazioni: quando il token cambia, quel filo sta parlando con una
  // sessione che non esiste più. Si chiude, e chi ascolta lo riapre con quello
  // nuovo — altrimenti dopo un rientro la lista resterebbe muta per sempre.
  imposta: (t: string) => { localStorage.setItem(CHIAVE, t); chiudiIlFilo() },
  pulisci: () => { localStorage.removeItem(CHIAVE); chiudiIlFilo() }
}

/** Chiamato quando il server dice che la sessione non vale più. */
let suScaduta: () => void = () => {}
export function alloScadere(f: () => void) { suScaduta = f }

/**
 * Un filo solo per tutti quelli che ascoltano i compiti.
 *
 * Ne aprivamo due: uno in `App.tsx`, per rinfrescare lo stato quando qualcosa
 * cambia, e uno in `useCompiti`, per la lista. Stesso indirizzo, stessi eventi,
 * per tutta la durata della sessione — quindi due battiti dal server, due
 * registrazioni, e due dei sei socket che il browser concede a un'origine su
 * HTTP/1.1. Il terzo se ne va durante una lettura, e restano tre.
 *
 * Adesso il filo è uno e si smista qui. Chi ascolta non se ne accorge: la
 * firma è la stessa di prima.
 */
const ascoltatoriDelFilo = new Set<(e: EventoCompito) => void>()

/**
 * Un flusso di eventi letto con fetch, non con EventSource.
 *
 * EventSource non manda intestazioni, e per questo il token finiva
 * nell'indirizzo — cioè nei registri del proxy e nella cronologia. Con fetch
 * l'intestazione c'è, lo stato HTTP si vede (un 401 riporta all'accesso
 * invece di diventare un generico «interrotto»), e le righe di battito che
 * cominciano con «:» si saltano come farebbe il browser. Torna quando il
 * server chiude; lancia se non si è nemmeno aperto.
 */
async function flusso(url: string, su: (m: Record<string, unknown>) => void, segnale?: AbortSignal): Promise<void> {
  const tok = sessione.token()
  let r: Response
  try {
    r = await fetch(url, { headers: tok ? { authorization: `Bearer ${tok}` } : {}, signal: segnale })
  } catch (e) {
    if (segnale?.aborted) return
    throw new MotoreGiu(e instanceof Error ? e.message : String(e))
  }
  if (r.status === 401) { sessione.pulisci(); suScaduta() }
  if (!r.ok || !r.body) throw guastoDellaRisposta(r, await r.json().catch(() => ({})))

  const lettore = r.body.getReader()
  const dec = new TextDecoder()
  let resto = ''
  for (;;) {
    let pezzo: ReadableStreamReadResult<Uint8Array>
    try { pezzo = await lettore.read() } catch { if (segnale?.aborted) return; throw new Error('Lettura interrotta.') }
    if (pezzo.done) break
    resto += dec.decode(pezzo.value, { stream: true })
    const eventi = resto.split('\n\n')
    resto = eventi.pop() ?? ''
    for (const e of eventi) {
      for (const riga of e.split('\n')) {
        if (!riga.startsWith('data: ')) continue
        let m: Record<string, unknown>
        try { m = JSON.parse(riga.slice(6)) } catch { continue }
        su(m)
      }
    }
  }
}

let filoVivo = false
let filoCtrl: AbortController | null = null

/** Il filo dei compiti: uno solo, si riapre da sé se cade, si spegne quando nessuno ascolta. */
function apriIlFilo() {
  if (filoVivo) return
  filoVivo = true
  void (async () => {
    while (filoVivo) {
      filoCtrl = new AbortController()
      try {
        await flusso('/api/compiti/flusso', m => {
          for (const f of [...ascoltatoriDelFilo]) {
            try { f(m as EventoCompito) } catch { /* chi ascolta si arrangia */ }
          }
        }, filoCtrl.signal)
      } catch { /* caduto: si riapre fra poco */ }
      if (!filoVivo) break
      await new Promise(r => setTimeout(r, 3000))
    }
  })()
}

function chiudiIlFilo() {
  filoVivo = false
  filoCtrl?.abort()
  filoCtrl = null
}

/**
 * Il motore locale non ha risposto.
 *
 * Non è «errore 500»: quel numero è solo il modo in cui il proxy dello
 * sviluppo racconta una porta chiusa, e nell'app impacchettata la stessa cosa
 * arriva come un `TypeError` del browser con dentro una frase inglese scritta
 * da Chrome. Per chi guarda sono la stessa cosa — Myynd non c'è — e tenerle
 * insieme in una classe è quello che permette alle schermate di dirlo con una
 * frase invece che con un numero.
 */
export class MotoreGiu extends Error {
  constructor(public dettaglio: string) {
    super('Myynd non risponde.')
    this.name = 'MotoreGiu'
  }
}

/**
 * Un guasto come lo si racconta a chi guarda, e come lo si racconta a chi lo
 * deve aggiustare. Sono due cose diverse: `frase` va sullo schermo, `dettaglio`
 * va sotto solo nel build di sviluppo.
 */
/**
 * Non c'è nessun Myynd dietro questo indirizzo.
 *
 * È un guasto diverso da tutti gli altri, e va tenuto diverso. `MotoreGiu`
 * vuol dire «il motore c'era e adesso non risponde»: si riprova, e quasi
 * sempre torna. Un 404 sull'API vuol dire l'opposto — c'è un server web che
 * risponde benissimo, e dietro non c'è Myynd. È il caso di questa interfaccia
 * messa online da sola, senza il computer che la fa funzionare.
 *
 * Confonderli non è un dettaglio di parole: porta a riprovare per sempre una
 * cosa che non succederà mai, e a dire a chi guarda «Myynd non è riuscito ad
 * avviarsi» quando non c'era niente da avviare.
 */
export class SenzaMotore extends Error {
  dettaglio: string
  constructor(dettaglio: string) {
    super('Qui c’è solo l’interfaccia.')
    this.dettaglio = dettaglio
    this.name = 'SenzaMotore'
  }
}

export type Guaio = {
  frase: string
  dettaglio: string
  motoreGiu: boolean
  /** Non c'è proprio niente a cui collegarsi: riprovare non serve. */
  senzaMotore?: boolean
}

export function guaio(e: unknown): Guaio {
  if (e instanceof SenzaMotore) {
    return { frase: e.message, dettaglio: e.dettaglio, motoreGiu: false, senzaMotore: true }
  }
  if (e instanceof MotoreGiu) return { frase: e.message, dettaglio: e.dettaglio, motoreGiu: true }
  const frase = e instanceof Error ? e.message : String(e)
  return { frase, dettaglio: frase, motoreGiu: false }
}

/**
 * Una risposta che non è andata bene, detta a parole.
 *
 * Prima qui c'era `Errore ${r.status}`, e quel numero finiva dritto sullo
 * schermo: sotto la schermata di guasto, e dentro i riquadri rossi dei form.
 * Un numero non dice a nessuno cosa fare. Quando il server ha una sua frase
 * vince la sua — la sa più precisa di qui; quando non ce l'ha, il codice
 * diventa una frase, e il numero resta nella console dove serve.
 */
function guastoDellaRisposta(r: Response, corpo: unknown): Error {
  const detto = (corpo as { errore?: string })?.errore
  if (detto) return new Error(detto)
  if (r.status >= 500) return new MotoreGiu(`HTTP ${r.status} · ${r.url}`)
  if (r.status === 401 || r.status === 403) return new Error('Sessione scaduta.')
  /*
   * Un 404 su `/api` non è «non trovato»: è «qui non c'è Myynd».
   *
   * Le rotte dell'API esistono tutte, sempre, finché c'è un server di Myynd
   * davanti. Se una risponde 404 vuol dire che a rispondere è qualcun altro —
   * un sito statico, un proxy, questa interfaccia messa online da sola. Dirlo
   * «non trovato» mandava a cercare una pagina mancante che non esiste.
   */
  if (r.status === 404 && r.url.includes('/api/')) {
    return new SenzaMotore(`HTTP 404 · ${r.url}`)
  }
  if (r.status === 404) return new Error('Non trovato.')
  /*
   * Quando il server non ha una frase sua, il numero serve.
   *
   * «Non ce l'ho fatta. Riprova.» da solo è una riga che non si può indagare:
   * l'ha vista comparire su un'installazione nuova e non c'era modo di sapere
   * se fosse un 400, un 403 di un proxy davanti, o una risposta che non era
   * JSON. Il numero non spaventa nessuno e fa la differenza fra un'ora persa e
   * due minuti.
   */
  return new Error(frasi.nonRiuscito(r.status))
}

async function json<T>(url: string, opz?: RequestInit): Promise<T> {
  const t = sessione.token()
  let r: Response
  try {
    r = await fetch(url, {
      ...opz,
      headers: {
        'content-type': 'application/json',
        ...(t ? { authorization: `Bearer ${t}` } : {}),
        ...(opz?.headers ?? {})
      }
    })
  } catch (e) {
    // la richiesta non è nemmeno partita: non c'è nessuno dall'altra parte
    throw new MotoreGiu(e instanceof Error ? e.message : String(e))
  }
  const corpo = await r.json().catch(() => ({}))
  if (r.status === 401 && !url.startsWith('/api/auth')) {
    sessione.pulisci()
    suScaduta()
  }
  if (!r.ok) throw guastoDellaRisposta(r, corpo)
  return corpo as T
}

/** Il nome della fonte, non il suo identificativo. */
const NOME_FONTE: Record<string, string> = {
  posta: 'Posta', desktop: 'Desktop', notion: 'Notion', claude: 'Claude', mind2do: 'Mind2Do',
  google: 'Gmail e Calendario', microsoft: 'Outlook e Calendario', slack: 'Slack',
  drive: 'Google Drive', sharepoint: 'SharePoint e OneDrive', dropbox: 'Dropbox',
  whatsapp: 'WhatsApp Business'
}

/**
 * Trasforma un avanzamento della lettura in una riga da mostrare.
 *
 * Le due metà erano tutte e due sbagliate in inglese: a sinistra l'id crudo del
 * connettore — `posta`, minuscolo — e a destra una frase italiana scritta dal
 * server. È la riga che compare nella colonna, sul bottone delle fonti, nel
 * pannello e nel primo avvio: cioè quasi dappertutto.
 */
export function rigaSincronizzazione(m: Record<string, unknown>): string {
  const en = lingua() === 'en'
  const id = String(m.fase ?? '')
  const fonte = t(NOME_FONTE[id] ?? id)
  if (m.stato !== 'fatto') return `${fonte} · ${t(String(m.stato ?? ''))}`
  const parti = [`${Number(m.documenti ?? 0)} ${en ? 'documents' : 'documenti'}`]
  if (Number(m.tolti)) parti.push(`${Number(m.tolti)} ${en ? 'gone' : 'spariti'}`)
  if (Number(m.saltati)) parti.push(`${Number(m.saltati)} ${en ? 'code projects skipped' : 'progetti saltati'}`)
  if (Number(m.falliti)) parti.push(`${Number(m.falliti)} ${en ? 'unreadable' : 'illeggibili'}`)
  if (Number(m.parziali)) parti.push(`${Number(m.parziali)} ${en ? 'half pages' : 'pagine a metà'}`)
  if (m.troncato) parti.push(en ? 'cap reached' : 'tetto raggiunto')
  if (m.interrotto) parti.push(en ? 'interrupted by Notion' : 'interrotto da Notion')
  const dirs = (m.illeggibili as string[] | undefined) ?? []
  if (dirs.length) parti.push(`${dirs.length} ${en ? 'folders without permission' : 'cartelle senza permessi'}`)
  /**
   * Le cartelle di posta che non si sono aperte.
   *
   * Il server le contava già e le mandava in fondo alla lettura; qui non le
   * leggeva nessuno. Quindi una casella con cinque cartelle di cui tre andate
   * storte diceva «Posta · 40 documenti», identica a una andata bene — e da lì
   * in poi Myynd rispondeva su un terzo della posta convinto di averla tutta.
   * Il modo peggiore di sbagliare: non dice niente, e la risposta sembra buona.
   */
  const kaputt = (m.cartelleFallite as string[] | undefined) ?? []
  if (kaputt.length) parti.push(frasi.cartelleNonLette(kaputt.length))
  return `${fonte} · ${parti.join(' · ')}`
}


/**
 * Una cosa che Myynd si offre di fare, in attesa di un dito.
 *
 * Il `perche` sta su ogni voce e non sulla proposta: è la riga che si legge
 * prima di premere, e «sono tutte newsletter» non si può controllare mentre
 * «Newsletter di Vinted, ogni martedì» sì.
 */
export type Proposta = {
  azione: 'posta.cestina' | 'posta.archivia'
  voci: { doc: string; titolo: string; perche: string }[]
}

/** Da dove arrivano le automazioni, e quand'è andata l'ultima volta. */
export type StatoRicette = { repo: string | null; quando: string | null; guaio: string | null }

/** Una domanda con le risposte già pronte da toccare. */
export type Chiesta = { domanda: string; opzioni: string[]; multipla: boolean }

export type Compito = {
  id: string
  testo: string
  nota: string | null
  quando: string          // oggi | settimana | poi
  stato: string           // aperto | delegato | pronto | chiede | fatto | lasciato
  modo: string            // io | bozza | tutto
  ordine: string
  origine: string
  voce: string | null
  doc: string | null
  chiesto: string | null
  risultato: string | null
  fonti: { id: string; label: string }[] | null
  /** Quello che si offre di fare, se è più di un testo da rileggere. */
  proposta: Proposta | null
  /** Le domande a scelta, quando si è fermato perché gli manca qualcosa. */
  chieste: Chiesta[] | null
  guaio: string | null
  creato: string
  aggiornato: string
  chiuso: string | null
  esito: string | null
  sparito: string | null
  versione: number
}

export type Lista = { compiti: Compito[]; chiusi: Compito[]; fuoco: string }

/**
 * Un passo del lavoro su una riga: cerca, apre, scrive.
 *
 * Arriva strutturato e la frase la compone il client — così «Cerco «listino»»
 * esce in inglese sotto una riga inglese, cosa che una frase già scritta dal
 * server non potrebbe fare.
 */
export type PassoCompito = { passo: 'cerco' | 'apro' | 'scrivo'; dettaglio?: string }

/** Come va un compito affidato a Myynd, mentre ci lavora. */
export type EventoCompito =
  | { fase: 'aperto' }
  | { fase: 'preso'; id: string }
  | { fase: 'lavoro'; id: string; passo: PassoCompito }
  | { fase: 'pronto'; id: string; compito: Compito }
  | { fase: 'chiede'; id: string; compito: Compito }
  | { fase: 'guaio'; id: string; guaio: string }
  | { fase: 'richiamato'; id: string }
  | { fase: 'cambiato' }

export type Accesso = {
  entrato: boolean
  /** Gira su un server, non sul computer di chi lo usa: cambia cosa è vero dire. */
  ospitato?: boolean
  /** Come ci si registra qui: liberi, con un codice, o per niente. */
  registrazione?: 'aperta' | 'invito' | 'chiusa'
  account: { email: string } | null
}

/**
 * Una convinzione: una frase che Myynd tiene per vera su di te, adesso.
 *
 * `genere` non è un dettaglio da archivisti — è la differenza fra conoscere
 * qualcuno e inventarlo. *Esplicita* è quello che ti ha sentito dire; *dedotta*
 * è quello che ha concluso da premesse che deve saper elencare; *indotta* è una
 * regolarità che ha notato, e vale solo quanto la sua fiducia. Si mostrano
 * distinte perché tu possa dare a ciascuna il peso che merita.
 *
 * `al` è la data in cui ha smesso di valere. Non si cancella mai una
 * convinzione: le si mette una fine, così «fino a marzo pensavo X» resta una
 * domanda a cui si può rispondere.
 */
export type Convinzione = {
  id: string
  enunciato: string
  ambito: string
  genere: 'esplicita' | 'dedotta' | 'indotta'
  fiducia: number
  premesse?: string[] | null
  prova?: { doc?: string; citazione?: string } | null
  origine: string
  dal: string
  al?: string | null
}

/**
 * Una notizia della rassegna.
 *
 * `perche` è la riga scritta per te — cosa è successo, o perché conta — e può
 * mancare: senza un modello a disposizione la rassegna esce lo stesso, scelta a
 * conteggio, e allora sotto al titolo c'è quello che ne dice il giornale.
 * `letta` è la data in cui l'hai aperta: è quello che la mattina dopo distingue
 * una rassegna nuova da una pagina che si ripete.
 */
export type Notizia = {
  id: string
  titolo: string
  riassunto: string
  perche: string | null
  fonte: string
  link: string
  argomento: string
  quando: string
  presa: string
  letta: string | null
  /** L'hai buttata via. Non torna: né domani, né raccontata da un altro giornale. */
  scartata: string | null
}

export type Rassegna = {
  notizie: Notizia[]
  quando: string | null
  argomenti: string
  /**
   * Quello che Myynd ha notato da come leggi, detto in una riga.
   *
   * Sta nelle preferenze e non è decorazione: un profilo che ti decide la prima
   * pagina e che non puoi vedere è la cosa che questa app dice di non essere.
   */
  gusto: string
}

export type Blocco = { etichetta: string; descrizione: string; valore: string; tetto: number
  /** Quando l'ha scritto Myynd. Null = l'ultima parola è tua. */
  daMe?: string | null
}

/**
 * Un'automazione, come la vede chi la usa.
 *
 * La ricetta arriva con l'azienda e non si modifica da qui: quello che è tuo
 * è se tenerla accesa, e la storia di quello che ha fatto su questa macchina.
 */
export type Automazione = {
  id: string
  nome: string
  spiega: string
  quando: { ogni: 'giorno'; ora: number } | { ogni: 'settimana'; giorno: number; ora: number } | { quandoArriva: true }
  metti: { inLista: 'oggi' | 'settimana' | 'poi'; modo?: 'io' | 'bozza' | 'tutto' }
  accesa: boolean
  ultima: string | null
  quante: number
  esito: string | null
  guaio: string | null
  /** L'hai già cambiata tu: sta nella tua cartella, non in quella del pacchetto. */
  mia: boolean
  /** Quando girerà da sola. Null = è in pausa, o non va a orologio. */
  prossima: string | null
  /** Cosa guarda e cosa fa: sta nel dettaglio, non nella riga. */
  guarda: { cerca?: string; soloNuovi?: boolean; limite?: number }
  fai: string
  /** C'è solo su quelle che si offrono di mettere via dei messaggi. */
  proponi?: 'posta.cestina' | 'posta.archivia'
  /** Cosa può aprire mentre gira. Vuoto = solo l'indice, come una volta. */
  attrezzi: string[]
  /** Dove lavora Claude Code, per quelle che ce l'hanno. */
  cartella?: string
  /** In che cartella te la sei messa. Null = in nessuna. */
  raccolta: string | null
  /**
   * Come sta, e perché non fa niente quando non fa niente.
   *
   * È la risposta a una domanda che la schermata non sapeva porre: un'automazione
   * che non trova mai niente si scrive uguale a una che funziona su una casella
   * tranquilla, e senza questa riga la differenza non si vede da nessuna parte.
   */
  salute: { stato: 'bene' | 'scollegata' | 'guaio' | 'ferma' | 'muta'; quante: number }
  /** Il turno è già passato: girerà al primo giro utile, non all'ora scritta. */
  inRitardo: boolean
  /** Le ultime volte, dalla più vecchia alla più recente. */
  storia: { quando: string; esito: string; quanti: number }[]
}

/** Quello che un'automazione guarderebbe adesso, senza fare niente. */
export type Anteprima = {
  ok: true
  docs: { id: string; titolo: string; fonte: string; quando: string | null }[]
  /** Le fonti in cui ha davvero cercato. Vuoto = tutte. */
  dentro: string[]
  /** Gli attrezzi dichiarati che non sono collegati. */
  staccati: string[]
  soloNuovi: boolean
  dal: string | null
}

/** Un attrezzo del catalogo, come lo mostra il menù della chiocciola. */
export type Attrezzo = {
  nome: string
  etichetta: string
  spiega: string
  tinta: string
  serve: string | null
  /** Falso se manca la connessione che gli serve: si vede, spento. */
  collegato: boolean
  vuoleCartella: boolean
}

export type Raccolta = { nome: string; ordine: number }

/** Una cosa uscita da questa macchina, con la data e il destinatario. */
export type Azione = {
  id: string; tipo: string; verso: string | null; cosa: string
  compito: string | null; esito: string; dettaglio: string | null; quando: string
}

export type Memoria = {
  /** Vero se quello che ha imparato è in una lingua diversa da quella dell'app. */
  daTradurre: boolean
  /** Il ritratto come lo legge il modello: è letteralmente quello che finisce nel prompt. */
  carta: string
  blocchi: Blocco[]
  convinzioni: Convinzione[]
  storiche: Convinzione[]
}

export type Abbonamento = {
  installato: boolean
  entrato: boolean
  acceso: boolean
  inRiposo: boolean
}

export const api = {
  accesso: () => json<Accesso>('/api/auth'),

  registra: async (email: string, password: string, invito = '') => {
    const r = await json<{ token: string; account: { email: string } }>(
      '/api/auth/registra', { method: 'POST', body: JSON.stringify({ email, password, invito }) })
    sessione.imposta(r.token)
    return r
  },

  entra: async (email: string, password: string) => {
    const r = await json<{ token: string; account: { email: string } }>(
      '/api/auth/entra', { method: 'POST', body: JSON.stringify({ email, password }) })
    sessione.imposta(r.token)
    return r
  },

  esci: async () => {
    try { await json('/api/auth/esci', { method: 'POST' }) } finally { sessione.pulisci() }
  },

  stato: () => json<Stato>('/api/stato'),

  // — la lista —

  compiti: () => json<Lista>('/api/compiti'),

  aggiungiCompito: (c: { id: string; testo: string; quando?: string; nota?: string; voce?: string; doc?: string; origine?: string }) =>
    json<{ ok: true; id: string; compiti: Compito[] }>('/api/compiti', { method: 'POST', body: JSON.stringify(c) }),

  cambiaCompito: (id: string, c: { testo?: string; nota?: string | null; quando?: string }) =>
    json<{ ok: true; compiti: Compito[] }>(`/api/compiti/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(c) }),

  /** I vicini, non una posizione: una posizione calcolata su una lista vecchia sposta la riga nel posto sbagliato. */
  spostaCompito: (id: string, v: { sopra?: string | null; sotto?: string | null; quando?: string }) =>
    json<{ ok: true; compiti: Compito[] }>(`/api/compiti/${encodeURIComponent(id)}/sposta`,
      { method: 'POST', body: JSON.stringify(v) }),

  delegaCompito: (id: string, modo: string) =>
    json<{ ok: true; compiti: Compito[] }>(`/api/compiti/${encodeURIComponent(id)}/delega`,
      { method: 'POST', body: JSON.stringify({ modo }) }),

  /** Il pezzo che gli mancava: si attacca al compito e il lavoro riparte. */
  rispondiCompito: (id: string, testo: string) =>
    json<{ ok: true; compiti: Compito[] }>(`/api/compiti/${encodeURIComponent(id)}/rispondi`,
      { method: 'POST', body: JSON.stringify({ testo }) }),

  /**
   * Da una bozza pronta a un'email pronta.
   *
   * Due chiamate e non una, apposta: questa dice a chi andrebbe e cosa
   * conterrebbe, e non manda niente. Fra le due c'è una persona che legge.
   */
  preparaEmail: (id: string) =>
    json<{ a: string; oggetto: string; corpo: string; conosciuto: boolean }>(
      `/api/compiti/${encodeURIComponent(id)}/prepara-email`, { method: 'POST' }),

  /** C'è Claude Code su questa macchina, e in quali cartelle può lavorare. */
  lavoroPronto: () => json<{ pronto: boolean; cartelle: string[] }>('/api/lavoro/pronto'),

  /**
   * Affida la riga a Claude Code dentro un progetto.
   *
   * `piano` legge e racconta cosa farebbe senza toccare niente; `fai` lo fa.
   * Sono due chiamate e non una perché in mezzo ci va una persona che legge.
   */
  lavora: (id: string, m: { cartella: string; passo: 'piano' | 'fai' }) =>
    json<{ ok: true; passo: string; finito: boolean; compiti: Compito[]; compito: Compito }>(
      `/api/compiti/${encodeURIComponent(id)}/lavora`, { method: 'POST', body: JSON.stringify(m) }),

  /** Dalla bozza a un file vero, in una cartella collegata, aperto sul Mac. */
  salvaDocumento: (id: string, m: { testo: string; nome: string; formato: string; cartella?: string }) =>
    json<{ ok: true; percorso: string; nome: string; compiti: Compito[]; chiusi: Compito[] }>(
      `/api/compiti/${encodeURIComponent(id)}/documento`, { method: 'POST', body: JSON.stringify(m) }),

  /** Fa succedere la proposta. Quello che agisce è quello che sta nella riga. */
  esegui: (id: string) =>
    json<{ ok: true; spostati: number; dove: string; compiti: Compito[]; chiusi: Compito[] }>(
      `/api/compiti/${encodeURIComponent(id)}/esegui`, { method: 'POST' }),

  inviaEmail: (id: string, m: { a: string; oggetto: string; corpo: string }) =>
    json<{ ok: true; compiti: Compito[]; chiusi: Compito[] }>(
      `/api/compiti/${encodeURIComponent(id)}/invia`, { method: 'POST', body: JSON.stringify(m) }),

  /** Quello che è uscito da qui davvero. */
  azioni: () => json<{ azioni: Azione[] }>('/api/azioni'),

  richiamaCompito: (id: string) =>
    json<{ ok: true; compiti: Compito[] }>(`/api/compiti/${encodeURIComponent(id)}/richiama`, { method: 'POST' }),

  chiudiCompito: (id: string, c: { esito?: string; stato?: 'fatto' | 'lasciato'; tenuto?: string }) =>
    json<{ ok: true; compiti: Compito[]; chiusi: Compito[] }>(`/api/compiti/${encodeURIComponent(id)}/chiudi`,
      { method: 'POST', body: JSON.stringify(c) }),

  riapriCompito: (id: string) =>
    json<{ ok: true; compiti: Compito[]; chiusi: Compito[] }>(`/api/compiti/${encodeURIComponent(id)}/riapri`, { method: 'POST' }),

  eliminaCompito: (id: string) =>
    json<{ ok: true; compiti: Compito[] }>(`/api/compiti/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  /**
   * Il filo dei compiti affidati. Torna come chiuderlo.
   *
   * Una delega dura mezzo minuto: senza questo si scoprirebbe com'è andata
   * ricaricando la pagina, che è il modo in cui una cosa viva sembra ferma.
   */
  flussoCompiti(su: (e: EventoCompito) => void): () => void {
    ascoltatoriDelFilo.add(su)
    apriIlFilo()
    return () => {
      ascoltatoriDelFilo.delete(su)
      // l'ultimo che esce spegne la luce: un filo aperto senza nessuno che
      // ascolta è un socket occupato e un battito che il server manda per niente
      if (!ascoltatoriDelFilo.size) chiudiIlFilo()
    }
  },


  profilo: (p: Record<string, unknown>) =>
    json('/api/profilo', { method: 'POST', body: JSON.stringify(p) }),

  collegaPosta: (p: { host: string; porta: number; utente: string; password: string; giorni: number }) =>
    json<{ ok: true; cartelle: string[]; certificatoAdattato: string | null }>(
      '/api/connettori/posta', { method: 'POST', body: JSON.stringify(p) }),

  collegaDesktop: (cartelle: string[]) =>
    json<{ ok: true; cartelle: string[] }>('/api/connettori/desktop', { method: 'POST', body: JSON.stringify({ cartelle }) }),

  /**
   * Google: la chiamata resta appesa finché non hai finito nel browser.
   *
   * Fino a due minuti, e non è un difetto: la finestra che si apre e questa
   * risposta sono lo stesso gesto. Rispondere subito «guarda dopo» vorrebbe
   * dire una schermata che non sa mai se sei collegato.
   */
  collegaGoogle: (clientId: string, clientSecret: string) =>
    json<{ ok: true; email: string }>('/api/connettori/google',
      { method: 'POST', body: JSON.stringify({ clientId, clientSecret }) }),

  collegaNotion: (token: string) =>
    json<{ ok: true; pagine: number }>('/api/connettori/notion', { method: 'POST', body: JSON.stringify({ token }) }),

  collegaClaude: (apiKey: string) =>
    json<{ ok: true; avviso?: string }>('/api/connettori/claude', { method: 'POST', body: JSON.stringify({ apiKey }) }),

  /** Ospitati: l'indirizzo a cui andare a dire di sì. Si torna da soli. */
  avviaGoogle: () => json<{ dove: string }>('/api/connettori/google/avvia', { method: 'POST', body: '{}' }),
  avviaDrive: () => json<{ dove: string }>('/api/connettori/drive/avvia', { method: 'POST', body: '{}' }),
  avviaMicrosoft: (parte: 'posta' | 'file') =>
    json<{ dove: string }>('/api/connettori/microsoft/avvia', { method: 'POST', body: JSON.stringify({ parte }) }),

  /**
   * Un fornitore compatibile con OpenAI, al posto di Claude per il lavoro grosso.
   *
   * Collegarlo lo sceglie anche come motore: il server lo prova con un token
   * prima di scriverlo, e se non risponde l'errore arriva qui in italiano.
   */
  collegaCompatibile: (p: { url: string; chiave?: string; modello: string; nome?: string }) =>
    json<{ ok: true; motore: string }>('/api/connettori/compatibile', { method: 'POST', body: JSON.stringify(p) }),

  /** I modelli che il fornitore dice di avere. Vuoto se non risponde: non è un errore. */
  modelliCompatibili: (url: string, chiave: string) =>
    json<{ modelli: string[] }>(
      `/api/connettori/compatibile/modelli?url=${encodeURIComponent(url)}&chiave=${encodeURIComponent(chiave)}`),

  collegaSlack: (token: string) =>
    json<{ ok: true; squadra: string }>('/api/connettori/slack', { method: 'POST', body: JSON.stringify({ token }) }),

  /** Drive: come Google, e appesa come Google finché il browser non ha finito. */
  collegaDrive: (clientId: string, clientSecret: string) =>
    json<{ ok: true; email: string }>('/api/connettori/drive',
      { method: 'POST', body: JSON.stringify({ clientId, clientSecret }) }),

  /** Microsoft: `parte` dice quale metà — la posta o i file. */
  collegaMicrosoft: (clientId: string, tenant: string, parte: 'posta' | 'file') =>
    json<{ ok: true; email: string; parti: string[] }>('/api/connettori/microsoft',
      { method: 'POST', body: JSON.stringify({ clientId, tenant, parte }) }),

  /**
   * Dropbox in due tempi, perché Dropbox non sa tornare indietro da solo.
   *
   * `iniziaDropbox` apre il browser e torna anche l'indirizzo: serve a chi il
   * browser non ce l'ha predefinito, e senza resterebbe davanti a un bottone
   * che sembra rotto.
   */
  iniziaDropbox: (chiave: string) =>
    json<{ ok: true; dove: string }>('/api/connettori/dropbox/inizia',
      { method: 'POST', body: JSON.stringify({ chiave }) }),

  collegaDropbox: (codice: string) =>
    json<{ ok: true; conto: string }>('/api/connettori/dropbox',
      { method: 'POST', body: JSON.stringify({ codice }) }),

  collegaWhatsapp: (p: { token: string; numero: string; segreto: string; parola: string }) =>
    json<{ ok: true; etichetta: string }>('/api/connettori/whatsapp',
      { method: 'POST', body: JSON.stringify(p) }),

  scollega: (id: string) => json(`/api/connettori/${id}`, { method: 'DELETE' }),

  /** La sincronizzazione arriva a pezzi: ogni riga è un avanzamento. */
  async sincronizza(su: (m: Record<string, unknown>) => void, fonte?: string): Promise<void> {
    const q = fonte ? `?${new URLSearchParams({ fonte })}` : ''
    let esito: 'fine' | 'errore' | null = null
    let guaio = ''
    await flusso(`/api/sincronizza${q}`, m => {
      su(m)
      if (m.fase === 'fine') esito = 'fine'
      else if (m.fase === 'errore') { esito = 'errore'; guaio = String(m.errore) }
    })
    if (esito === 'errore') throw new Error(guaio)
    if (esito !== 'fine') throw new Error('Lettura interrotta.')
  },

  /** `stato` presente = risposta pronta, non passa dal modello. */
  rispondiFeed: (id: string, testo: string, stato?: string) =>
    json<{ stato: string; motivo: string; fonteVecchia: boolean; daRicordare: string; aperti: unknown[]; fatte: unknown[] }>(
      `/api/feed/${encodeURIComponent(id)}/rispondi`,
      { method: 'POST', body: JSON.stringify({ testo, stato }) }
    ),
  domanda: () => json<{ domanda: null | { id: string; testo: string; spunto: string[] } }>('/api/domanda'),
  rispondiDomanda: (id: string, testo: string) =>
    json<{ ok: true; esito: string }>(`/api/domanda/${encodeURIComponent(id)}/rispondi`, { method: 'POST', body: JSON.stringify({ testo }) }),
  ignoraDomanda: (id: string) =>
    json<{ ok: true }>(`/api/domanda/${encodeURIComponent(id)}/ignora`, { method: 'POST' }),

  // — la memoria: quello che Myynd sa di te —
  //
  // Le rotte esistevano da sempre e non le chiamava nessuno: nessuno poteva
  // vedere né correggere quello che Myynd aveva concluso sul suo conto. Il
  // brief la chiama «la ragione per cui dicono di sì», e il commento sulla
  // rotta nel server lo dice ancora meglio: un gemello che tiene convinzioni
  // su di te che non puoi vedere né correggere non è uno strumento, e nessuno
  // gli consegna la propria posta.

  memoria: () => json<Memoria>('/api/memoria'),

  scriviBlocco: (etichetta: string, valore: string) =>
    json<{ ok: true }>('/api/memoria/blocco', { method: 'POST', body: JSON.stringify({ etichetta, valore }) }),

  scriviConvinzione: (enunciato: string, ambito = 'persona') =>
    json<{ ok: true; id: string }>('/api/memoria/convinzione',
      { method: 'POST', body: JSON.stringify({ enunciato, ambito }) }),

  /** Rimette la memoria nella lingua dell'interfaccia. */
  traduciMemoria: () => json<{ ok: true; tradotte: number }>('/api/memoria/traduci', { method: 'POST' }),

  /** Riordina una nota. Non salva: torna il testo, e decidi tu. */
  riscriviBlocco: (etichetta: string, testo: string) =>
    json<{ testo: string }>('/api/memoria/riscrivi',
      { method: 'POST', body: JSON.stringify({ etichetta, testo }) }),

  scordaConvinzione: (id: string) =>
    json<{ ok: true }>(`/api/memoria/convinzione/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  /**
   * Il suo abbonamento: c'è `claude` su questa macchina, ci è entrato, ed è acceso?
   *
   * `entrato` è separato da `installato` perché sono due gesti diversi e il
   * secondo si rimanda: chi ha il programma ma non ha fatto l'accesso deve
   * leggerlo prima di scegliere questa strada, non dopo.
   */
  abbonamento: () => json<Abbonamento>('/api/modello/abbonamento'),
  usaAbbonamento: (attivo: boolean) =>
    json<{ ok: true } & Abbonamento>('/api/modello/abbonamento',
      { method: 'POST', body: JSON.stringify({ attivo }) }),

  /** Il modello di casa: c'è davvero, adesso? */
  modelloLocale: () => json<{ acceso: boolean; modello: string | null; spento: boolean }>('/api/modello/locale'),
  usaModelloLocale: (attivo: boolean) =>
    json<{ ok: true; attivo: boolean }>('/api/modello/locale', { method: 'POST', body: JSON.stringify({ attivo }) }),

  /** Chi fa il lavoro grosso: Claude, o il fornitore compatibile collegato. */
  scegliMotore: (motore: 'claude' | 'compatibile') =>
    json<{ ok: true; motore: string }>('/api/modello/motore', { method: 'POST', body: JSON.stringify({ motore }) }),

  // — le automazioni —

  /** Cosa scriverebbe negli argomenti da quello che leggi. Non lo scrive: lo propone. */
  proponiArgomenti: () =>
    json<{ ok: true; argomenti: string }>('/api/argomenti/proposta', { method: 'POST' }),

  /** Rimettere in ordine adesso quello che ha imparato di come lavori. */
  consolidaMemoria: () =>
    json<{ ok: true; blocchi: string[]; guardate: number }>('/api/memoria/consolida', { method: 'POST' }),

  /** Le undici del pacchetto: prenderle, o rimandarle indietro. */
  automazioniDiSerie: (attivo: boolean) =>
    json<{ ok: true; automazioni: Automazione[] }>('/api/automazioni/diSerie',
      { method: 'POST', body: JSON.stringify({ attivo }) }),

  /**
   * Scaricare il proprio Myynd. Passa da `fetch` e non da un link.
   *
   * Un `<a download>` non porta con sé l'intestazione con il token, quindi
   * scaricherebbe la pagina d'accesso invece del file — con l'estensione
   * giusta, e un file rotto che non sembra rotto.
   */
  /** Il conto: la password si cambia da qui, e chiudere tutte le sessioni pure. */
  cambiaPassword: async (attuale: string, nuova: string) => {
    const r = await json<{ ok: true; token: string }>('/api/conto/password',
      { method: 'POST', body: JSON.stringify({ attuale, nuova }) })
    sessione.imposta(r.token)
    return r
  },
  esciOvunque: () => json<{ ok: true; chiuse: number }>('/api/conto/esci-ovunque', { method: 'POST', body: '{}' }),

  /** Portarsi via tutto chiede la password: dentro ci sono le credenziali di ogni fonte. */
  async scaricaTrasloco(password: string): Promise<{ nome: string; dati: Blob }> {
    const r = await fetch('/api/trasloco/esporta', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${sessione.token()}` },
      body: JSON.stringify({ password })
    })
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).errore ?? 'Non ce l’ha fatta.')
    const oggi = new Date().toISOString().slice(0, 10)
    return { nome: `myynd-${oggi}.myynd`, dati: await r.blob() }
  },

  async caricaTrasloco(file: File): Promise<{ documenti: number; automazioni: number }> {
    const r = await fetch('/api/trasloco', {
      method: 'POST',
      headers: { authorization: `Bearer ${sessione.token()}`, 'content-type': 'application/octet-stream' },
      body: file
    })
    const corpo = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(corpo.errore ?? 'Non ce l’ha fatta.')
    return corpo
  },

  automazioni: () => json<{ automazioni: Automazione[]; ricette: StatoRicette }>('/api/automazioni'),

  /** Va a vedere adesso se il repository ne ha di nuove. */
  aggiornaRicette: () =>
    json<{ ok: true; nuove: number; cambiate: number; tolte: number; automazioni: Automazione[]; ricette: StatoRicette }>(
      '/api/automazioni/aggiorna', { method: 'POST' }),

  /** Da una frase a un'automazione. Nasce in pausa: prima la guardi. */
  creaAutomazione: (descrizione: string) =>
    json<{ ok: true; id: string; automazioni: Automazione[] }>('/api/automazioni',
      { method: 'POST', body: JSON.stringify({ descrizione }) }),

  cambiaAutomazione: (id: string, patch: Record<string, unknown>) =>
    json<{ ok: true; automazioni: Automazione[] }>(`/api/automazioni/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(patch) }),

  buttaAutomazione: (id: string) =>
    json<{ ok: true; automazioni: Automazione[] }>(`/api/automazioni/${encodeURIComponent(id)}`,
      { method: 'DELETE' }),

  attrezzi: () => json<{ attrezzi: Attrezzo[]; cartelle: string[] }>('/api/attrezzi'),

  raccolte: () => json<{ raccolte: Raccolta[] }>('/api/raccolte'),

  creaRaccolta: (nome: string) =>
    json<{ ok: true; raccolte: Raccolta[] }>('/api/raccolte',
      { method: 'POST', body: JSON.stringify({ nome }) }),

  rinominaRaccolta: (da: string, nome: string) =>
    json<{ ok: true; raccolte: Raccolta[]; automazioni: Automazione[] }>(
      `/api/raccolte/${encodeURIComponent(da)}`,
      { method: 'PATCH', body: JSON.stringify({ nome }) }),

  buttaRaccolta: (nome: string) =>
    json<{ ok: true; raccolte: Raccolta[]; automazioni: Automazione[] }>(
      `/api/raccolte/${encodeURIComponent(nome)}`, { method: 'DELETE' }),

  mettiInRaccolta: (id: string, raccolta: string | null) =>
    json<{ ok: true; automazioni: Automazione[]; raccolte: Raccolta[] }>(
      `/api/automazioni/${encodeURIComponent(id)}/raccolta`,
      { method: 'POST', body: JSON.stringify({ raccolta }) }),

  ottimizzaAutomazione: (id: string) =>
    json<{ ok: true; id: string; automazioni: Automazione[] }>(
      `/api/automazioni/${encodeURIComponent(id)}/ottimizza`, { method: 'POST' }),

  riscriviAutomazione: (id: string, richiesta: string) =>
    json<{ ok: true; id: string; automazioni: Automazione[] }>(
      `/api/automazioni/${encodeURIComponent(id)}/riscrivi`,
      { method: 'POST', body: JSON.stringify({ richiesta }) }),

  accendiAutomazione: (id: string, accesa: boolean) =>
    json<{ ok: true; automazioni: Automazione[] }>(`/api/automazioni/${encodeURIComponent(id)}/accendi`,
      { method: 'POST', body: JSON.stringify({ accesa }) }),

  /** Falla girare adesso invece di aspettare la sua ora. */
  /**
   * Cosa guarderebbe adesso. Non scrive niente e non costa un token.
   *
   * È la differenza fra scrivere le parole della ricerca al buio e vederle
   * funzionare: si preme mentre si scrive, quante volte si vuole.
   */
  anteprimaAutomazione: (id: string) =>
    json<Anteprima>(`/api/automazioni/${encodeURIComponent(id)}/anteprima`),

  automazioneAdesso: (id: string) =>
    json<{ ok: true; esito: 'fatta' | 'niente' | 'gia'; automazioni: Automazione[] }>(
      `/api/automazioni/${encodeURIComponent(id)}/adesso`, { method: 'POST' }),

  // — la rassegna —
  //
  // `rassegna()` legge e basta: aprire la pagina non deve far partire quindici
  // richieste ai giornali. Chi le fa partire è l'orologio del server, o il
  // bottone di chi ha voglia di riguardare adesso.

  rassegna: () => json<Rassegna>('/api/rassegna'),
  aggiornaRassegna: () => json<Rassegna>('/api/rassegna/aggiorna', { method: 'POST', body: JSON.stringify({ forza: true }) }),
  notiziaLetta: (id: string) => json<{ ok: true }>(`/api/rassegna/${encodeURIComponent(id)}/letta`, { method: 'POST' }),
  notiziaScartata: (id: string) => json<{ ok: true }>(`/api/rassegna/${encodeURIComponent(id)}/scarta`, { method: 'POST' }),

  fuoco: () => json<{ fuoco: string }>('/api/feed/fuoco'),
  scriviFuoco: (testo: string) =>
    json<{ ok: true; fuoco: string }>('/api/feed/fuoco', { method: 'POST', body: JSON.stringify({ testo }) }),

  scopriPosta: (email: string) =>
    json<{ host: string | null; come?: string }>(`/api/connettori/posta/scopri?email=${encodeURIComponent(email)}`),
  chiaveNellAmbiente: () => json<{ presente: boolean }>('/api/connettori/claude/ambiente'),
  usaChiaveAmbiente: () => json<{ ok: true }>('/api/connettori/claude/ambiente', { method: 'POST' }),

  /**
   * Cosa c'è dentro. Il grafo arriva solo se lo si chiede: costruirlo costa,
   * e la Mappa la apre quasi nessuno.
   */
  mente: (conGrafo = false) => json<{
    totale: number
    gruppi: { id: string; nome: string; colore: string; nodi: number }[]
    grafo: {
      nodi: { id: string; titolo: string; gruppo: string; fonte: string; quando: string | null }[]
      archi: [number, number, number][]
    } | null
  }>(conGrafo ? '/api/mente?grafo=1' : '/api/mente'),

  cerca: (q: string) =>
    json<{ id: string; titolo: string; fonte: string; gruppo: string; quando: string; estratto: string }[]>(
      `/api/cerca?q=${encodeURIComponent(q)}`),

  documento: (id: string) => json<Record<string, string>>(`/api/documento?id=${encodeURIComponent(id)}`),

  feed: () => json<{ aperti: Record<string, string>[]; fatte: Record<string, string>[] }>('/api/feed'),
  generaFeed: () => json<{ ok: true; generate: number; feed: Record<string, string>[] }>('/api/feed/genera', { method: 'POST' }),
  segnaFeed: (id: string, stato: 'fatto' | 'aperto') => json(`/api/feed/${id}/${stato}`, { method: 'POST' }),

  chat: () => json<{ id: string; titolo: string; quando: string }[]>('/api/chat'),
  messaggi: (id: string) => json<{ id: string; role: string; text: string; sources?: { id: string; label: string }[] }[]>(`/api/chat/${id}`),
  eliminaChat: (id: string) => json(`/api/chat/${id}`, { method: 'DELETE' }),
  /**
   * La risposta arriva a pezzi. `onDelta` viene chiamata a ogni frammento; la
   * promessa si chiude quando il messaggio è completo e salvato.
   */
  chiedi: async (
    chat: string,
    testo: string,
    onDelta: (delta: string) => void
  ): Promise<{ messaggi: Messaggio[] }> => {
    const t = sessione.token()
    let r: Response
    try {
      r = await fetch(`/api/chat/${chat}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) },
        body: JSON.stringify({ testo })
      })
    } catch (e) {
      throw new MotoreGiu(e instanceof Error ? e.message : String(e))
    }
    if (r.status === 401) { sessione.pulisci(); suScaduta() }
    if (!r.ok || !r.body) {
      const corpo = await r.json().catch(() => ({}))
      throw guastoDellaRisposta(r, corpo)
    }

    const lettore = r.body.getReader()
    const dec = new TextDecoder()
    let resto = ''
    let fine: { messaggi: Messaggio[] } | null = null

    for (;;) {
      const { done, value } = await lettore.read()
      if (done) break
      resto += dec.decode(value, { stream: true })
      // gli eventi sono separati da una riga vuota; l'ultimo pezzo può essere
      // spezzato a metà, quindi resta nel buffer fino al giro dopo
      const pezzi = resto.split('\n\n')
      resto = pezzi.pop() ?? ''
      for (const p of pezzi) {
        if (!p.startsWith('data: ')) continue
        // Il lettore della sincronizzazione lo fa già, questo no: un frammento
        // malformato in mezzo a una risposta lunga faceva esplodere il parse e
        // si portava via tutto il testo scritto fino a lì. Meglio saltare la
        // riga rotta e tenere la risposta.
        let m: { fase: string; delta?: string; errore?: string; messaggi?: Messaggio[] }
        try { m = JSON.parse(p.slice(6)) } catch { continue }
        if (m.fase === 'testo' && m.delta) onDelta(m.delta)
        if (m.fase === 'errore') throw new Error(m.errore || 'Errore.')
        if (m.fase === 'fine') fine = { messaggi: m.messaggi ?? [] }
      }
    }
    if (!fine) throw new Error('La risposta si è interrotta.')
    return fine
  }
}

export type Messaggio = { id: string; role: string; text: string; sources?: { id: string; label: string }[] }
