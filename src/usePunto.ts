// Il punto, dalla parte della pagina: quando chiederlo, e cosa farne.
//
// Il server ha il cancello vero — tre al giorno, tre ore fra l'uno e l'altro,
// mai su niente di nuovo. Qui c'è l'altra metà: *quando* bussare. Si bussa
// quando la persona torna dopo un'assenza vera, e la prima volta nella
// giornata: sono i due momenti in cui «cosa è cambiato?» è la domanda giusta.
// Un focus ogni cinque minuti non è tornare, e non chiede niente.
//
// L'assenza la sa solo la finestra. Si segna quando perde il fuoco — cioè
// quando lui se ne va — e al ritorno si guarda quanto è passato. Sta in
// `localStorage` perché deve sopravvivere a un ricaricamento, non a un altro
// computer.

import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type Punto } from './api'

/** Da quante ore di assenza si rifà il punto al ritorno. */
const ORE_VIA = 3
/** Quando ha lasciato la finestra l'ultima volta. */
const CHIAVE_FUOCO = 'myynd.punto.fuoco'
/** Il punto che ha chiuso con la ×: non torna finché non ce n'è uno nuovo. */
const CHIAVE_NASCOSTO = 'myynd.punto.nascosto'

function leggi(k: string): string | null {
  try { return localStorage.getItem(k) } catch { return null }
}
function scrivi(k: string, v: string) {
  try { localStorage.setItem(k, v) } catch { /* niente memoria: si rifà il punto più spesso, e basta */ }
}

const giorno = (ms: number) => new Date(ms).toDateString()

export function usePunto() {
  const [punto, setPunto] = useState<Punto | null>(null)
  const [nascosto, setNascosto] = useState<string | null>(() => leggi(CHIAVE_NASCOSTO))
  const [carico, setCarico] = useState(false)
  const [tetto, setTetto] = useState(false)
  /** La data dell'ultimo punto, quando è di ieri: allora non se ne mostra il testo. */
  const [vecchio, setVecchio] = useState<string | null>(null)
  /** Perché non è arrivato: la frase del server, da passare da `t()`. */
  const [guaio, setGuaio] = useState<string | null>(null)
  const inCorso = useRef(false)

  const prendi = useCallback(async (forza = false, via: number | null = null) => {
    if (inCorso.current) return
    inCorso.current = true
    setCarico(true)
    setTetto(false)
    try {
      const r = forza || via !== null ? await api.rifaiPunto(forza, via) : await api.punto()
      /*
       * Anche quando è nullo.
       *
       * Prima si scriveva solo un punto che c'era, e un `null` lasciava in
       * pagina quello di prima: è così che il punto dell'otto settembre è
       * rimasto in prima pagina l'undici, con tre cose già fatte sotto
       * «adesso». Il server adesso toglie le righe scadute e non manda quello
       * di ieri: la pagina deve credergli anche quando dice «niente».
       */
      setPunto(r.punto)
      setVecchio(r.vecchio ?? null)
      setGuaio(r.guaio ?? null)
      if (r.tetto) setTetto(true)
    } catch {
      // il punto non è il motivo per cui si apre Myynd: se non risponde, la
      // pagina resta quella di sempre
    } finally {
      inCorso.current = false
      setCarico(false)
    }
  }, [])

  /**
   * Il ritorno.
   *
   * `prima` è quando ha lasciato la finestra. Se manca — primo avvio, memoria
   * pulita — o se è di un altro giorno, o se sono passate più di tre ore, si
   * chiede un punto nuovo con il tempo di assenza; altrimenti solo quello che
   * c'è. In tutti e due i casi il server decide da sé se chiamare qualcuno.
   */
  const tornato = useCallback(() => {
    const ora = Date.now()
    const prima = Number(leggi(CHIAVE_FUOCO) ?? 0)
    const via = prima ? Math.round((ora - prima) / 60_000) : null
    const altroGiorno = !prima || giorno(prima) !== giorno(ora)
    if (altroGiorno || (via !== null && via >= ORE_VIA * 60)) prendi(false, via)
    else prendi(false)
    scrivi(CHIAVE_FUOCO, String(ora))
  }, [prendi])

  useEffect(() => {
    tornato()
    const partito = () => scrivi(CHIAVE_FUOCO, String(Date.now()))
    const tornatoSeVisibile = () => { if (!document.hidden) tornato() }
    window.addEventListener('focus', tornatoSeVisibile)
    window.addEventListener('blur', partito)
    return () => {
      window.removeEventListener('focus', tornatoSeVisibile)
      window.removeEventListener('blur', partito)
    }
  }, [tornato])

  const rifai = useCallback(() => prendi(true), [prendi])

  const nascondi = useCallback(() => {
    if (!punto) return
    scrivi(CHIAVE_NASCOSTO, punto.quando)
    setNascosto(punto.quando)
  }, [punto])

  const aggiornaProgetto = (nome: string, f: (p: Punto['progetti'][number]) => Punto['progetti'][number]) =>
    setPunto(p => p ? { ...p, progetti: p.progetti.map(x => x.nome === nome ? f(x) : x) } : p)

  const tieni = useCallback(async (nome: string, angolo: string) => {
    // subito nella pagina, poi al server: se fallisce si torna indietro
    aggiornaProgetto(nome, p => ({ ...p, angoliTenuti: [...p.angoliTenuti, angolo] }))
    try { await api.tieniAngolo(nome, angolo) }
    catch { aggiornaProgetto(nome, p => ({ ...p, angoliTenuti: p.angoliTenuti.filter(a => a !== angolo) })) }
  }, [])

  /** «Non è un progetto»: si chiude in tabella, e sparisce dalla finestra. Se non passa, torna. */
  const nonProgetto = useCallback(async (id: string) => {
    let tolto: Punto['progetti'][number] | undefined
    setPunto(p => {
      if (!p) return p
      tolto = p.progetti.find(x => x.id === id)
      return { ...p, progetti: p.progetti.filter(x => x.id !== id) }
    })
    try { await api.chiudiProgetto(id) }
    catch { if (tolto) setPunto(p => p ? { ...p, progetti: [...p.progetti, tolto!] } : p) }
  }, [])

  const scarta = useCallback(async (nome: string, angolo: string) => {
    aggiornaProgetto(nome, p => ({ ...p, angolo: '' }))
    try { await api.scartaAngolo(nome, angolo) }
    catch { aggiornaProgetto(nome, p => ({ ...p, angolo })) }
  }, [])

  /** Le frasi accese da qui, in questa pagina: il bottone dice «Accesa» e non si ripreme. */
  const [accese, setAccese] = useState<Record<string, string>>({})
  const [guaioAvvio, setGuaioAvvio] = useState<string | null>(null)
  const avvia = useCallback(async (frase: string) => {
    setGuaioAvvio(null)
    try {
      const r = await api.avviaDalPunto(frase)
      setAccese(a => ({ ...a, [frase]: r.nome }))
      // il server toglie l'avvio dal punto: qui si tiene la riga, con il nome
      // della ricetta accanto, finché la finestra non si chiude
    } catch (e) {
      setGuaioAvvio(e instanceof Error ? e.message : String(e))
    }
  }, [])

  return {
    /** Il punto, anche se l'ha già chiuso: chi lo chiama decide se aprirlo o solo nominarlo. */
    punto,
    /** Vero se questo punto non l'ha ancora chiuso con la ×. */
    daVedere: !!punto && nascosto !== punto.quando,
    /** Riapre quello di prima, da un dito. */
    riapri: () => { try { localStorage.removeItem(CHIAVE_NASCOSTO) } catch { /* pazienza */ } setNascosto(null) },
    /** C'è un punto, ma è di ieri: si dice, e si offre di rifarlo. */
    vecchio,
    /** Perché l'ultimo tentativo non è andato: già in italiano, da tradurre in pagina. */
    guaio,
    carico, tetto,
    rifai, nascondi, tieni, scarta, nonProgetto,
    avvia, accese, guaioAvvio
  }
}

export type StatoPunto = ReturnType<typeof usePunto>
