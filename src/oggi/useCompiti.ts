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
import { api, type Compito, type EventoCompito } from '../api'
import { frasi, t } from '../lingua'

export const SECCHI = ['oggi', 'settimana', 'poi'] as const
export type Secchio = (typeof SECCHI)[number]

export function nuovoId(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export type Avviso = { testo: string; quando: number } | null

export function useCompiti(mostraToast: (t: string) => void) {
  const [compiti, setCompiti] = useState<Compito[]>([])
  const [chiusi, setChiusi] = useState<Compito[]>([])
  const [fuoco, setFuoco] = useState('')
  const [caricato, setCaricato] = useState(false)
  const [guasto, setGuasto] = useState('')
  // quali righe hanno la bozza aperta sotto
  const [aperti, setAperti] = useState<Set<string>>(new Set())

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
      if (e.fase === 'cambiato') {
        clearTimeout(attesa)
        attesa = setTimeout(rileggi, 160)
      }
      if (e.fase === 'preso') {
        setCompiti(cs => cs.map(c => (c.id === e.id ? { ...c, stato: 'delegato', guaio: null } : c)))
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

  const aggiungi = useCallback(async (testo: string, quando: Secchio): Promise<string | null> => {
    const pulito = testo.trim()
    if (!pulito) return null
    const ora = new Date().toISOString()
    const finto: Compito = {
      id: nuovoId(), testo: pulito, nota: null, quando, stato: 'aperto',
      // in coda al suo secchio: la chiave vera arriva dal server, questa serve
      // solo a non far saltare la riga di posto nel mezzo secondo di attesa
      ordine: 'zzzz', origine: 'mano', voce: null, doc: null, chiesto: null,
      risultato: null, fonti: null, proposta: null, chieste: null, guaio: null, creato: ora, aggiornato: ora,
      chiuso: null, esito: null, sparito: null, versione: 1, modo: 'io'
    }
    const prima = compitiRef.current
    setCompiti(cs => [...cs, finto])
    try {
      const r = await api.aggiungiCompito({ id: finto.id, testo: pulito, quando })
      setCompiti(r.compiti)
      return finto.id
    } catch {
      indietro(prima, finto.id, t('Non sono riuscito a segnarlo.'))
      return null
    }
  }, [indietro])

  /** Toglie una riga dall'insieme di quelle aperte: senza, l'insieme cresce e basta. */
  const scorda = (id: string) => setAperti(a => (a.has(id) ? new Set([...a].filter(x => x !== id)) : a))

  const chiudi = useCallback(async (id: string, esito?: string, tenuto?: string) => {
    const prima = compitiRef.current
    setCompiti(cs => cs.filter(x => x.id !== id))
    scorda(id)
    try {
      const r = await api.chiudiCompito(id, { esito, tenuto })
      setCompiti(r.compiti); setChiusi(r.chiusi)
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
      indietro(prima, id, e instanceof Error ? e.message : t('Non sono riuscito ad affidarlo.'))
    }
  }, [indietro])

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
    } catch { indietro(prima, id, t('Non sono riuscito a rispondergli.')) }
  }, [indietro])

  const cambia = useCallback(async (id: string, c: { testo?: string; nota?: string | null; quando?: string }) => {
    const prima = compitiRef.current
    setCompiti(cs => cs.map(x => (x.id === id ? { ...x, ...c } as Compito : x)))
    try {
      const r = await api.cambiaCompito(id, c)
      setCompiti(r.compiti)
    } catch { indietro(prima, id, t('Non sono riuscito a salvarlo.')) }
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
      nuova.splice(dove < 0 ? senza.length : dove, 0, { ...mossa, quando: quando ?? mossa.quando })
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
  const manda = useCallback(async (id: string, m: { a: string; oggetto: string; corpo: string }) => {
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
  const lavora = useCallback(async (id: string, m: { cartella: string; passo: 'piano' | 'fai' }) => {
    const r = await api.lavora(id, m)
    setCompiti(r.compiti)
    return r
  }, [])

  const salvaFuoco = useCallback(async (testo: string) => {
    setFuoco(testo)
    try {
      await api.scriviFuoco(testo)
      mostraToast(testo.trim() ? t('Da adesso guardo prima lì.') : t('Fuoco tolto.'))
    } catch { mostraToast(t('Non sono riuscito a salvarlo.')) }
  }, [mostraToast])

  const apriChiudi = useCallback((id: string) => {
    setAperti(a => {
      const n = new Set(a)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }, [])

  const perSecchio = (s: Secchio) => compiti.filter(c => c.quando === s)

  return {
    esegui, salvaDocumento, lavora,
    compiti, chiusi, fuoco, caricato, guasto, aperti,
    perSecchio,
    // «chiede» conta come da fare: è una riga che aspetta te, e dire «tutto
    // pronto» sopra a una domanda senza risposta è la stessa bugia di prima
    daFare: compiti.filter(c => ['aperto', 'delegato', 'chiede'].includes(c.stato)).length,
    quante: (s: Secchio) => compiti.filter(c => c.quando === s).length,
    pronte: compiti.filter(c => c.stato === 'pronto').length,
    chiedono: compiti.filter(c => c.stato === 'chiede').length,
    aggiungi, chiudi, riapri, delega, richiama, rispondi, cambia, sposta, elimina, salvaFuoco, apriChiudi, manda
  }
}

export type Lista = ReturnType<typeof useCompiti>
