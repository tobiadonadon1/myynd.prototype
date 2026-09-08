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
  const inCorso = useRef(false)

  const prendi = useCallback(async (forza = false, via: number | null = null) => {
    if (inCorso.current) return
    inCorso.current = true
    setCarico(true)
    setTetto(false)
    try {
      const r = forza || via !== null ? await api.rifaiPunto(forza, via) : await api.punto()
      if (r.punto) setPunto(r.punto)
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

  const scarta = useCallback(async (nome: string, angolo: string) => {
    aggiornaProgetto(nome, p => ({ ...p, angolo: '' }))
    try { await api.scartaAngolo(nome, angolo) }
    catch { aggiornaProgetto(nome, p => ({ ...p, angolo })) }
  }, [])

  return {
    /** Null anche quando c'è, se l'ha chiuso e non ce n'è uno nuovo. */
    punto: punto && nascosto !== punto.quando ? punto : null,
    carico, tetto,
    rifai, nascondi, tieni, scarta
  }
}

export type StatoPunto = ReturnType<typeof usePunto>
