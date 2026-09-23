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
import { suCollegamento } from './collegamenti'

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

  /*
   * Il perché dell'ultimo tentativo vale per il collegamento di allora.
   *
   * «Collega Claude e potrò ragionare sul tuo materiale» restava sotto il
   * punto anche dopo averlo collegato, finché la finestra non perdeva e
   * riprendeva il fuoco: le Fonti si aprono dentro la stessa finestra, e quel
   * giro non c'era. Cambiato il collegamento, la frase si toglie. Non si
   * rifà il punto da qui: costa una chiamata, e lo decide lui col bottone.
   */
  useEffect(() => suCollegamento(() => setGuaio(null)), [])

  const rifai = useCallback(() => prendi(true), [prendi])

  const nascondi = useCallback(() => {
    if (!punto) return
    scrivi(CHIAVE_NASCOSTO, punto.quando)
    setNascosto(punto.quando)
  }, [punto])

  /*
   * Qui non si fa più niente.
   *
   * C'erano «tienilo», «non è così», «non è un progetto» e «accendi»: quattro
   * gesti dentro una finestra che si legge in dieci secondi. Il punto adesso
   * racconta e basta — quello che si fa si fa dove le cose vivono, cioè in
   * lista e nel feed — quindi da qui escono solo le due cose che riguardano la
   * finestra stessa: rifarlo e chiuderla.
   */
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
    rifai, nascondi
  }
}

export type StatoPunto = ReturnType<typeof usePunto>
