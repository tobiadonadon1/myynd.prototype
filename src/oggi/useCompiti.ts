// Lo stato della lista.
//
// Due regole che valgono per tutto quello che c'è qui sotto:
//
//   · Si muove prima, si chiede dopo. Spuntare una riga deve essere istantaneo
//     — se aspetta il server, dopo tre giorni la lista sembra lenta e non la
//     apri più. La chiamata parte dietro; se fallisce, la riga torna com'era
//     invece di restare lì a mentire.
//   · L'id lo fa il client. Serve adesso, perché la riga deve comparire prima
//     che il server risponda, e servirà il giorno che la stessa riga possa
//     nascere in macchina dal telefono: due posti, un nome solo, nessun
//     coordinamento.

import { useCallback, useEffect, useRef, useState } from 'react'
import { api, DaCollegare, type Compito, type EventoCompito, type PassoCompito, type Portato, type ProjectWorkRequest } from '../api'
import { frasi, t } from '../lingua'
import { avvisiAccesi, desktop } from '../desktop'
import { copia as negliAppunti } from './prompt'
import { giornoLocale } from './giorni'
import { secchioVivo } from './secchi'
import { preparaApertura } from '../navigazione.ts'

export const SECCHI = ['oggi', 'settimana', 'poi'] as const
export type Secchio = (typeof SECCHI)[number]

export function nuovoId(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export type Avviso = { testo: string; quando: number } | null

/** Il titolo dentro un avviso: intero se ci sta, altrimenti la testa. */
const titoloCorto = (s: string) => (s.length > 64 ? `${s.slice(0, 63).trimEnd()}…` : s)

export function useCompiti(
  /** `disfa`, quando c'è, è il gesto che «Annulla» deve rifare al contrario. */
  mostraToast: (t: string, disfa?: () => void) => void,
  /** Dove si collega una fonte che manca: il pannello delle connessioni, aperto su di lei. */
  apriConnessioni?: (fonte: string) => void
) {
  const [compiti, setCompiti] = useState<Compito[]>([])
  const [chiusi, setChiusi] = useState<Compito[]>([])
  const [fuoco, setFuoco] = useState('')
  const [caricato, setCaricato] = useState(false)
  const [guasto, setGuasto] = useState('')
  // quali righe hanno la bozza aperta sotto
  const [aperti, setAperti] = useState<Set<string>>(new Set())
  /**
   * L'ultimo passo di ogni riga su cui Myynd sta lavorando.
   *
   * Solo l'ultimo: la riga ha spazio per una frase, e «cerco listino» che
   * diventa «apro il preventivo» è tutto quello che serve per sapere che è
   * vivo e cosa sta facendo. Si toglie appena la riga finisce, in qualunque
   * modo finisca: una frase di lavoro sotto una bozza pronta sarebbe una bugia.
   */
  const [passi, setPassi] = useState<Record<string, PassoCompito>>({})

  const compitiRef = useRef<Compito[]>([])
  compitiRef.current = compiti

  useEffect(() => {
    api.compiti()
      .then(l => { setCompiti(l.compiti); setChiusi(l.chiusi); setFuoco(l.fuoco); setGuasto('') })
      // dire «la lista è vuota» quando in realtà non si è riusciti a leggerla è
      // il modo peggiore di sbagliare: la schermata mentirebbe con sicurezza
      .catch(e => setGuasto(e instanceof Error ? e.message : String(e)))
      .finally(() => setCaricato(true))
  }, [])

  /**
   * Il filo con i compiti affidati.
   *
   * Quando una bozza è pronta la riga si apre da sola: è l'unico momento in cui
   * questa app si prende l'iniziativa, e se lo può permettere perché è successo
   * qualcosa che hai chiesto tu.
   */
  /** Rilegge la lista dal server. Il server è la verità; noi siamo una copia. */
  const rileggi = useCallback(() => {
    api.compiti()
      .then(l => { setCompiti(l.compiti); setChiusi(l.chiusi); setFuoco(l.fuoco) })
      .catch(() => { /* si riprova al prossimo annuncio */ })
  }, [])

  // Native apps can take focus while a terminal stream event is missed.
  // Reconcile active work with persisted state so the Aurora cannot imply
  // continued execution after the server has finished or failed.
  const lavoroInCorso = compiti.some(c => c.stato === 'delegato')
  useEffect(() => {
    if (!lavoroInCorso) return
    const timer = setInterval(rileggi, 5_000)
    return () => clearInterval(timer)
  }, [lavoroInCorso, rileggi])

  /**
   * Rilettura anche al ritorno sulla finestra.
   *
   * Il filo degli annunci vive dentro UN processo del server — ma l'app
   * impacchettata e il sito possono parlare con due processi diversi sullo
   * stesso database, e un annuncio nato di là non arriva di qua. Il momento
   * giusto per riallinearsi è quello in cui torni a guardare: scrivi nell'app,
   * passi al sito, e il sito rilegge da solo.
   */
  useEffect(() => {
    const alRitorno = () => { if (!document.hidden) rileggi() }
    window.addEventListener('focus', alRitorno)
    document.addEventListener('visibilitychange', alRitorno)
    return () => {
      window.removeEventListener('focus', alRitorno)
      document.removeEventListener('visibilitychange', alRitorno)
    }
  }, [rileggi])

  useEffect(() => {
    // gli annunci arrivano a raffica quando si trascina: si aspetta un attimo
    // che finiscano invece di rileggere sei volte
    let attesa: ReturnType<typeof setTimeout> | undefined
    const chiudi = api.flussoCompiti((e: EventoCompito) => {
      /*
       * Il filo si è (ri)aperto.
       *
       * Il filo si riapre da solo quando cade, e quello che è successo mentre
       * era giù non lo racconta nessuno: una riga affidata poteva restare
       * «da Myynd» con l'ultimo passo scritto sotto, per sempre, mentre il
       * server l'aveva già riaperta. Si rilegge, e i passi si buttano perché
       * appartengono a un lavoro di prima.
       */
      if (e.fase === 'aperto') {
        setPassi({})
        clearTimeout(attesa)
        attesa = setTimeout(rileggi, 160)
      }
      if (e.fase === 'cambiato') {
        clearTimeout(attesa)
        attesa = setTimeout(rileggi, 160)
      }
      if (e.fase === 'preso') {
        setPassi(p => { const { [e.id]: _via, ...resto } = p; return resto })
        setCompiti(cs => cs.map(c => (c.id === e.id ? { ...c, stato: 'delegato', guaio: null } : c)))
      }
      if (e.fase === 'lavoro') {
        setPassi(p => ({ ...p, [e.id]: e.passo }))
      }
      // finito, in qualunque modo: la frase di lavoro non ha più niente da dire
      if (e.fase === 'pronto' || e.fase === 'chiede' || e.fase === 'guaio' || e.fase === 'richiamato') {
        setPassi(p => {
          if (!(e.id in p)) return p
          const { [e.id]: _via, ...resto } = p
          return resto
        })
      }
      /*
       * Un avviso di sistema, se la persona l'ha chiesto e non sta guardando.
       *
       * Sono le stesse due cose che accendono il punto nella barra: una bozza
       * pronta, una domanda. Con la finestra davanti la riga si apre da sola
       * e basta; nascosta o dietro un'altra app, chi ha acceso gli avvisi
       * vuole saperlo. Il guscio mostra e basta: la scelta sta qui.
       */
      if ((e.fase === 'pronto' || e.fase === 'chiede') && avvisiAccesi() && (document.hidden || !document.hasFocus())) {
        desktop()?.notifica?.({
          titolo: e.fase === 'pronto' ? t('Una bozza è pronta.') : t('Myynd ti chiede una cosa.'),
          corpo: e.compito.testo, dove: 'oggi'
        })
      }
      // una domanda si apre da sola come una bozza: in tutti e due i casi
      // c'è qualcosa che aspetta te
      if (e.fase === 'chiede') {
        setCompiti(cs => cs.map(c => (c.id === e.id ? e.compito : c)))
        setAperti(a => (a.has(e.id) ? a : new Set(a).add(e.id)))
      }
      if (e.fase === 'pronto') {
        setCompiti(cs => cs.map(c => (c.id === e.id ? e.compito : c)))
        setAperti(a => (a.has(e.id) ? a : new Set(a).add(e.id)))
      }
      if (e.fase === 'richiamato') {
        setCompiti(cs => cs.map(c => (c.id === e.id ? { ...c, stato: 'aperto' } : c)))
      }
      if (e.fase === 'guaio') {
        setCompiti(cs => cs.map(c => (c.id === e.id ? { ...c, stato: 'aperto', guaio: e.guaio } : c)))
      }
    })
    return () => { clearTimeout(attesa); chiudi() }
  }, [rileggi])

  /**
   * «Ha finito»: detto una volta, quando succede.
   *
   * Lui lo ha chiesto così: che si veda chiaramente quando ha finito. In
   * pagina la riga cambia da sola, ma se stai guardando altrove non te ne
   * accorgi, e l'unico momento in cui si può dire è quello in cui passa da
   * affidata a fatta. Non si guarda l'annuncio, si guarda la lista: qualunque
   * strada abbia preso la notizia — il filo, una rilettura, il ritorno sulla
   * finestra — il passaggio è uno solo, e si vede confrontando la lista di
   * prima con quella di adesso. La prima lista che arriva non è un
   * passaggio: è come stanno le cose, e non si annuncia niente.
   */
  const statiVisti = useRef<Record<string, string> | null>(null)
  useEffect(() => {
    const prima = statiVisti.current
    const adesso: Record<string, string> = {}
    for (const c of compiti) adesso[c.id] = c.stato
    statiVisti.current = adesso
    if (!prima) return
    for (const c of compiti) {
      if (prima[c.id] === 'delegato' && c.stato === 'pronto') mostraToast(frasi.compitoFinito(titoloCorto(c.testo)))
    }
  }, [compiti, mostraToast])

  /**
   * Rimette a posto UNA riga, non tutta la lista.
   *
   * Rimettere l'intera lista sembrava più semplice ed era un baco: la fotografia
   * è di prima della chiamata, quindi rimetterla annulla anche tutto quello che
   * è successo nel frattempo — una bozza arrivata, un'altra riga cancellata. Si
   * disfa solo quello che si era fatto.
   */
  const indietro = useCallback((prima: Compito[], id: string, messaggio: string) => {
    const comEra = prima.find(c => c.id === id)
    setCompiti(cs => {
      const presente = cs.some(c => c.id === id)
      if (!comEra) return cs.filter(c => c.id !== id)          // era nata ora: sparisce
      if (!presente) return [...cs, comEra]                        // era stata tolta: torna
      return cs.map(c => (c.id === id ? comEra : c))            // era cambiata: com'era
    })
    mostraToast(messaggio)
  }, [mostraToast])

  const aggiungi = useCallback(async (testo: string, quando: Secchio, giorno?: string | null, ora?: string | null): Promise<string | null> => {
    const pulito = testo.trim()
    if (!pulito) return null
    const adesso = new Date().toISOString()
    const finto: Compito = {
      id: nuovoId(), testo: pulito, nota: null, quando, giorno, ora: ora ?? null, stato: 'aperto',
      // in coda al suo secchio: la chiave vera arriva dal server, questa serve
      // solo a non far saltare la riga di posto nel mezzo secondo di attesa
      ordine: 'zzzz', origine: 'mano', voce: null, doc: null, chiesto: null,
      risultato: null, fonti: null, proposta: null, chieste: null, email: null, guaio: null, creato: adesso, aggiornato: adesso,
      chiuso: null, esito: null, sparito: null, versione: 1, modo: 'io'
    }
    const prima = compitiRef.current
    setCompiti(cs => [...cs, finto])
    try {
      const r = await api.aggiungiCompito({ id: finto.id, testo: pulito, quando, giorno, ora: ora ?? null })
      setCompiti(r.compiti)
      return finto.id
    } catch {
      indietro(prima, finto.id, t('Non sono riuscito a segnarlo.'))
      return null
    }
  }, [indietro])

  /**
   * Tante righe in un colpo: una lista incollata.
   *
   * Una alla volta, in fila, e non tutte insieme: ogni risposta del server
   * porta la lista intera, e otto risposte in volo che si sorpassano lasciano
   * sullo schermo quella arrivata per ultima — non l'ultima scritta. In fila
   * l'ordine è quello del foglio, e la chiave d'ordine del server lo segue.
   * Torna gli id di quelle nate davvero; se una non è nata l'avviso è il suo.
   */
  const aggiungiTante = useCallback(async (righe: string[], quando: Secchio, giorno?: string | null): Promise<string[]> => {
    const piene = righe.map(r => r.trim()).filter(Boolean)
    const nati: string[] = []
    for (const r of piene) {
      const id = await aggiungi(r, quando, giorno)
      if (id) nati.push(id)
    }
    if (nati.length && nati.length === piene.length) mostraToast(frasi.righeSegnate(nati.length))
    return nati
  }, [aggiungi, mostraToast])

  /**
   * Toglie una riga dall'insieme di quelle aperte, e con lei il suo ultimo passo.
   *
   * Chiudere o buttare una riga mentre Myynd ci lavorava non produce nessun
   * evento finale — il server scarta il risultato in arrivo e tace — quindi il
   * passo restava scritto. Riaperta e riaffidata più tardi, la riga mostrava
   * per un istante quello che stava facendo *l'altra volta*.
   */
  const scorda = (id: string) => {
    setAperti(a => (a.has(id) ? new Set([...a].filter(x => x !== id)) : a))
    setPassi(p => {
      if (!(id in p)) return p
      const { [id]: _via, ...resto } = p
      return resto
    })
  }

  /**
   * Chiudere una riga, e poterlo disdire.
   *
   * Una riga chiusa spariva e basta: nessun avviso senza progetto, e con un
   * progetto un avviso senza «Annulla». Ma questa è la pagina dove le righe si
   * riordinano da sole — una bozza che diventa pronta passa davanti, un passo
   * nuovo arriva dal filo mentre guardi — e un bersaglio che si sposta sotto
   * il dito è un bersaglio che prima o poi si prende quello sbagliato. Da qui
   * in poi chiuderne una costa un clic per rimetterla, sempre, anche quando
   * non c'era niente da dire.
   */
  const chiudi = useCallback(async (id: string, esito?: string, tenuto?: string) => {
    const prima = compitiRef.current
    setCompiti(cs => cs.filter(x => x.id !== id))
    scorda(id)
    try {
      const r = await api.chiudiCompito(id, { esito, tenuto })
      setCompiti(r.compiti); setChiusi(r.chiusi)
      const disfa = () => {
        api.riapriCompito(id)
          .then(x => { setCompiti(x.compiti); setChiusi(x.chiusi) })
          .catch(() => mostraToast(t('Non sono riuscito a rimetterlo.')))
      }
      // con un progetto si dice anche che il traguardo è segnato e che guarda
      // il passo dopo: la riga nuova, o la domanda, arrivano da sole dal filo
      mostraToast(r.registrato?.progetto ? frasi.segnataPer(r.registrato.progetto) : t('Fatta.'), disfa)
    } catch {
      indietro(prima, id, t('Non sono riuscito a chiuderlo.'))
    }
  }, [indietro, mostraToast])

  const riapri = useCallback(async (id: string) => {
    try {
      const r = await api.riapriCompito(id)
      setCompiti(r.compiti); setChiusi(r.chiusi)
    } catch { mostraToast(t('Non sono riuscito a rimetterlo.')) }
  }, [mostraToast])

  const delega = useCallback(async (id: string, modo: string) => {
    const prima = compitiRef.current
    setCompiti(cs => cs.map(c => (c.id === id ? { ...c, stato: 'delegato', modo, guaio: null } : c)))
    try {
      const r = await api.delegaCompito(id, modo)
      setCompiti(r.compiti)
    } catch (e) {
      indietro(prima, id, e instanceof Error ? t(e.message) : t('Non sono riuscito ad affidarlo.'))
      // «collega Claude» detto e basta lascia la persona dov'era: si apre il
      // pannello in cui si collega, con la riga già tornata sua
      if (e instanceof DaCollegare) apriConnessioni?.(e.fonte)
    }
  }, [indietro, apriConnessioni])

  /**
   * Una cosa notata nel feed, presa in carico e affidata nello stesso gesto.
   *
   * Dalla carta in cima «Affidalo a Myynd» deve fare *una* cosa sola vista da
   * fuori: la riga nasce nella lista, con dentro il documento da cui viene, e
   * parte subito il lavoro. In due chiamate separate — crea, poi affida — il
   * primo mezzo secondo la riga sarebbe lì aperta e ferma, cioè il contrario
   * di quello che si è appena chiesto.
   *
   * `voce` non è un di più: dirlo al server chiude la voce nel feed, perché la
   * stessa cosa in due posti con due stati diversi diverge al primo tocco.
   * Torna l'id della riga nata, così chi ha cliccato può portarsela in cima.
   */
  const affidaNuovo = useCallback(async (
    testo: string,
    da?: { doc?: string | null; voce?: string | null; nota?: string | null }
  ): Promise<string | null> => {
    const pulito = testo.trim()
    if (!pulito) return null
    const ora = new Date().toISOString()
    const finto: Compito = {
      id: nuovoId(), testo: pulito, nota: da?.nota ?? null, quando: 'oggi', giorno: null,
      // nasce aperta e la passa ad affidata `delega`, un respiro dopo: se
      // l'affido non riesce, quello a cui si torna è una riga vera e aperta,
      // non una riga che dice di essere in lavorazione mentre non lo è
      stato: 'aperto', modo: 'io',
      ordine: 'zzzz', origine: 'feed', voce: da?.voce ?? null, doc: da?.doc ?? null, chiesto: null,
      risultato: null, fonti: null, proposta: null, chieste: null, email: null, guaio: null,
      creato: ora, aggiornato: ora, chiuso: null, esito: null, sparito: null, versione: 1
    }
    const prima = compitiRef.current
    setCompiti(cs => [...cs, finto])
    try {
      await api.aggiungiCompito({
        id: finto.id, testo: pulito, quando: 'oggi', origine: 'feed',
        ...(da?.nota ? { nota: da.nota } : {}),
        ...(da?.doc ? { doc: da.doc } : {}),
        ...(da?.voce ? { voce: da.voce } : {})
      })
    } catch {
      indietro(prima, finto.id, t('Non sono riuscito a segnarlo.'))
      return null
    }
    // la lista che torna dal server ha la riga aperta: `delega` la rimette
    // affidata e chiede il lavoro
    await delega(finto.id, 'tutto')
    return finto.id
  }, [indietro, delega])

  /** Ci ho ripensato: il compito torna mio. */
  const richiama = useCallback(async (id: string) => {
    const prima = compitiRef.current
    setCompiti(cs => cs.map(c => (c.id === id ? { ...c, stato: 'aperto', modo: 'io', guaio: null, risultato: null } : c)))
    scorda(id)
    try {
      const r = await api.richiamaCompito(id)
      setCompiti(r.compiti)
    } catch { indietro(prima, id, t('Non sono riuscito a richiamarlo.')) }
  }, [indietro, mostraToast])

  /** Rispondi a quello che ti ha chiesto, e il lavoro riparte da lì. */
  const rispondi = useCallback(async (id: string, testo: string) => {
    const prima = compitiRef.current
    setCompiti(cs => cs.map(c => (c.id === id ? { ...c, stato: 'delegato', risultato: null } : c)))
    scorda(id)
    try {
      const r = await api.rispondiCompito(id, testo)
      setCompiti(r.compiti)
      // «non è rilevante» a una sua domanda non riparte: chiude, e lo si dice
      if (r.chiuso === 'lasciato') mostraToast(t('Lasciata, con il tuo perché: me lo ricordo.'))
      else if (r.chiuso === 'fatto') mostraToast(t('Segnata come fatta.'))
    } catch { indietro(prima, id, t('Non sono riuscito a rispondergli.')) }
  }, [indietro, mostraToast])

  const cambia = useCallback(async (id: string, c: { testo?: string; nota?: string | null; quando?: string; giorno?: string | null; ora?: string | null; progetto?: string | null }): Promise<boolean> => {
    const prima = compitiRef.current
    setCompiti(cs => cs.map(x => (x.id === id ? { ...x, ...c } as Compito : x)))
    try {
      const r = await api.cambiaCompito(id, c)
      setCompiti(r.compiti)
      return true
    } catch { indietro(prima, id, t('Non sono riuscito a salvarlo.')); return false }
  }, [indietro])

  /**
   * Sposta una riga fra due vicine — o in un altro secchio, che è lo stesso gesto.
   *
   * Si muove subito e si chiede dopo, come tutto il resto: il trascinamento è
   * proprio il gesto in cui mezzo secondo di ritardo si vede di più, perché il
   * dito ha già lasciato la riga da un pezzo.
   */
  const sposta = useCallback(async (id: string, sopra: string | null, sotto: string | null, quando?: string) => {
    const prima = compitiRef.current
    setCompiti(cs => {
      const mossa = cs.find(c => c.id === id)
      if (!mossa) return cs
      const senza = cs.filter(c => c.id !== id)
      const dove = sotto ? senza.findIndex(c => c.id === sotto)
        : sopra ? senza.findIndex(c => c.id === sopra) + 1
        : senza.length
      const nuova = [...senza]
      nuova.splice(dove < 0 ? senza.length : dove, 0, { ...mossa, quando: quando ?? mossa.quando,
        giorno: quando && quando !== mossa.quando ? null : mossa.giorno })
      return nuova
    })
    try {
      const r = await api.spostaCompito(id, { sopra, sotto, quando })
      setCompiti(r.compiti)
    } catch { indietro(prima, id, t('Non sono riuscito a spostarlo.')) }
  }, [indietro])

  const elimina = useCallback(async (id: string) => {
    const prima = compitiRef.current
    setCompiti(cs => cs.filter(x => x.id !== id))
    scorda(id)
    try {
      const r = await api.eliminaCompito(id)
      setCompiti(r.compiti)
    } catch { indietro(prima, id, t('Non sono riuscito a toglierlo.')) }
  }, [indietro, mostraToast])

  /**
   * Mandarla davvero.
   *
   * Non c'è un aggiornamento ottimistico qui, ed è l'unico posto in tutto
   * questo file dove non c'è: tutto il resto si può disfare, un'email no.
   * La riga si chiude quando il server dice che è partita, non un istante
   * prima — sarebbe la peggior bugia che questa app possa raccontare.
   */
  const manda = useCallback(async (id: string, m?: { a: string; oggetto: string; corpo: string }) => {
    const r = await api.inviaEmail(id, m)
    setCompiti(r.compiti); setChiusi(r.chiusi)
    scorda(id)
    mostraToast(t('Mandata.'))
  }, [mostraToast])

  /**
   * Eseguire una proposta.
   *
   * Vale la stessa regola di `manda`, e per lo stesso motivo: la riga si chiude
   * quando il server dice che è successo, non quando si preme. Spostare dei
   * messaggi si disfa — sono in una cartella, non cancellati — ma dire «fatto»
   * per una cosa che non è avvenuta non si disfa: si scopre giorni dopo, con la
   * casella piena e una riga che giura il contrario.
   */
  const esegui = useCallback(async (id: string) => {
    const r = await api.esegui(id)
    setCompiti(r.compiti); setChiusi(r.chiusi)
    scorda(id)
    mostraToast(frasi.spostati(r.spostati, r.dove))
  }, [mostraToast])

  /**
   * Salvarla come documento.
   *
   * Come `manda` e `esegui`: la riga si chiude quando il file esiste davvero,
   * non quando si preme. Un «fatto» su un documento che non è stato scritto si
   * scopre la settimana dopo, cercandolo nel Finder.
   */
  const salvaDocumento = useCallback(async (
    id: string, m: { testo: string; nome: string; formato: string; cartella?: string }
  ) => {
    const r = await api.salvaDocumento(id, m)
    setCompiti(r.compiti); setChiusi(r.chiusi)
    scorda(id)
    mostraToast(frasi.salvatoIn(r.nome))
  }, [mostraToast])

  /**
   * Affidarla a Claude Code. Il risultato torna dove torna tutto il resto.
   *
   * Non chiude la riga: un piano si legge, e quello che ha fatto davvero si
   * guarda prima di dire che è finita. Chiuderla qui vorrebbe dire fidarsi di
   * un lavoro che nessuno ha ancora aperto.
   */
  const lavora = useCallback(async (id: string, m: ProjectWorkRequest) => {
    const r = await api.lavora(id, m)
    setCompiti(r.compiti)
    return r
  }, [])

  /**
   * Il prompt negli appunti, e una parola che dice che è andata.
   *
   * Sta qui e non nella riga perché il «Copiato.» è un avviso come gli altri,
   * e gli avvisi escono da un posto solo. Se gli appunti dicono di no, lo si
   * dice: un bottone premuto che non fa niente è peggio di un errore.
   */
  const copia = useCallback(async (testo: string) => {
    try { await negliAppunti(testo); mostraToast(t('Copiato.')); return true }
    catch { mostraToast(t('Non sono riuscito a copiarlo.')); return false }
  }, [mostraToast])

  /**
   * «Portami lì»: aprire il posto vero, non la copia dentro Myynd.
   *
   * Decide il server — è lui che sa se dietro la riga c'è una mail, un file o
   * una pagina, ed è lui che ha le mani per aprirla. Qui restano le due cose
   * che il server non può fare: dirlo, e consegnare a chi ha lo schermo i due
   * posti che stanno dentro l'app. Chi chiama naviga con quello che torna —
   * la lista non conosce la colonna delle schermate, e non deve.
   */
  const portami = useCallback(async (id: string, opzioni?: { anteprima?: boolean }): Promise<Portato | null> => {
    const apertura = preparaApertura()
    try {
      const r = await apertura.completa(await api.portami(id, opzioni))
      if (!r.ok) { mostraToast(t(r.errore)); return null }
      // i posti dell'app non sono «aperti» finché non ci si è arrivati: il
      // «Aperto.» lo dice solo quello che è successo davvero sul Mac
      if (r.dove !== 'compito' && r.dove !== 'progetto') mostraToast(t('Aperto.'))
      return r
    } catch (e) {
      mostraToast(e instanceof Error ? t(e.message) : t('Non sono riuscito ad aprirlo.'))
      return null
    } finally { apertura.annulla() }
  }, [mostraToast])

  const salvaFuoco = useCallback(async (testo: string) => {
    setFuoco(testo)
    try {
      await api.scriviFuoco(testo)
      mostraToast(testo.trim() ? t('Da adesso guardo prima lì.') : t('Fuoco tolto.'))
    } catch { mostraToast(t('Non sono riuscito a salvarlo.')) }
  }, [mostraToast])

  /*
   * Una riga da aprire nel dettaglio, chiesta da un'altra schermata (il punto
   * in prima pagina): la lista la apre appena è in vista e poi dimentica la
   * richiesta. Un id solo: chi chiede due volte vede l'ultima.
   */
  const [daAprire, setDaAprire] = useState<string | null>(null)
  const chiediDiAprire = useCallback((id: string) => setDaAprire(id), [])
  const richiestaServita = useCallback(() => setDaAprire(null), [])

  const apriChiudi = useCallback((id: string) => {
    setAperti(a => {
      const n = new Set(a)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }, [])

  /**
   * Il secchio *vivo*, non quello scritto: vedi `secchioVivo` in `secchi.ts`.
   *
   * Una riga pianificata per lunedì e rimasta lì resta scritta «questa
   * settimana» per sempre — è così che si scopre, arrivati a giovedì, che non
   * è mai stata portata avanti. Si guarda a ogni lettura invece che scriverlo
   * una volta, così anche la mezzanotte che passa mentre la finestra sta
   * aperta la sposta al posto giusto.
   */
  const perSecchio = (s: Secchio) => { const oggi = giornoLocale(); return compiti.filter(c => secchioVivo(c, oggi) === s) }

  const pronte = compiti.filter(c => c.stato === 'pronto').length
  const chiedono = compiti.filter(c => c.stato === 'chiede').length

  /**
   * Quante cose aspettano una persona, dette al guscio dell'app.
   *
   * Sono le stesse due che accendono il punto sulla voce «Da fare»: una bozza
   * pronta da leggere e una domanda che Myynd ha fatto e a cui nessuno ha
   * ancora risposto. Non le righe aperte — quelle sono la lista, e una lista
   * di dieci cose non è dieci interruzioni — e non quelle affidate, che
   * stanno lavorando e non chiedono niente. Il segno nella barra dei menù e
   * il numero sul Dock vogliono dire una cosa sola: c'è qualcosa che si
   * sblocca solo se guardi.
   *
   * Si manda solo quando cambia, e zero quando questa lista se ne va — cioè
   * quando si esce: un numero rimasto sul Dock dopo l'uscita parlerebbe di
   * un conto che non c'è più.
   */
  const inAttesa = pronte + chiedono
  useEffect(() => { desktop()?.segnala(inAttesa) }, [inAttesa])
  useEffect(() => () => { desktop()?.segnala(0) }, [])

  return {
    esegui, salvaDocumento, lavora, copia,
    compiti, chiusi, fuoco, caricato, guasto, aperti, passi,
    perSecchio,
    // «chiede» conta come da fare: è una riga che aspetta te, e dire «tutto
    // pronto» sopra a una domanda senza risposta è la stessa bugia di prima
    daFare: compiti.filter(c => ['aperto', 'delegato', 'chiede'].includes(c.stato)).length,
    quante: (s: Secchio) => { const oggi = giornoLocale(); return compiti.filter(c => secchioVivo(c, oggi) === s).length },
    pronte, chiedono,
    aggiungi, aggiungiTante, affidaNuovo, chiudi, riapri, delega, richiama, rispondi, cambia, sposta, elimina, salvaFuoco, apriChiudi, manda,
    portami,
    daAprire, chiediDiAprire, richiestaServita
  }
}

export type Lista = ReturnType<typeof useCompiti>
