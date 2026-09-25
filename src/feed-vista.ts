// «Vista» è vera: una carta conta come vista solo quando almeno metà è stata
// sullo schermo per un secondo, con la finestra visibile e davanti.
//
// Prima non si sapeva: una carta nata di notte e scaduta, o nascosta al
// caricamento, era uguale a una che lui aveva guardato e lasciato lì. La
// misura del feed (`server/misura-feed.ts`) conta contro il feed solo quello
// che ha visto davvero, e il server scrive `feed.vista` una volta sola.
//
// Un osservatore solo per tutte le righe, un orologio da mezzo secondo che
// gira solo mentre c'è qualcosa sopra la metà, una coda che parte due secondi
// dopo, cinquanta alla volta. Un id mandato con successo non si rimanda in
// questa sessione; se la chiamata fallisce torna in coda. Niente evento del
// feed: segnare una carta vista non ricarica mai la pagina.
//
// La parte che decide è pura (`contaComeVista`, `creaVista`) e si prova senza
// un browser; il gancio (`useVista`) la attacca al DOM.

import { useCallback, useEffect, useRef } from 'react'
import { apiP2 } from './api.ts'

/** Quanto deve stare sullo schermo: metà della carta, per un secondo. */
export const META = 0.5
export const UN_SECONDO = 1000
/** Ogni quanto si guarda l'orologio, e quanto si aspetta prima di mandare. */
export const OGNI = 500
export const ATTESA_INVIO = 2000
/** Quante per chiamata. */
export const PER_CHIAMATA = 50
/** Dopo un guasto l'attesa raddoppia, fino a un minuto: una pagina aperta con il server giù non bussa ogni due secondi. */
export const ATTESA_MASSIMA = 60_000

export function contaComeVista(s: { visibile: boolean; fuoco: boolean; frazione: number; da: number | null; adesso: number }): boolean {
  return s.visibile && s.fuoco && s.frazione >= META && s.da !== null && s.adesso - s.da >= UN_SECONDO
}

export type Ferri = {
  adesso(): number
  visibile(): boolean
  fuoco(): boolean
  manda(ids: string[]): Promise<unknown>
  /** Un timer: torna la funzione che lo cancella. */
  dopo(fai: () => void, ms: number): () => void
}

/**
 * Il registro di cosa sta sopra la metà e da quando, e la coda di cosa mandare.
 *
 * `frazione(id, f)` arriva dall'osservatore; `tick()` dall'orologio: quando
 * la finestra non si vede o non è davanti ogni «da quando» si azzera, perché
 * il tempo conta solo mentre lui può guardare.
 */
export function creaVista(f: Ferri) {
  const sopra = new Map<string, number | null>()
  const inviate = new Set<string>()
  const coda = new Set<string>()
  let cancellaInvio: (() => void) | null = null
  let inViaggio = false
  let attesa = ATTESA_INVIO

  const programma = () => {
    if (cancellaInvio) return
    cancellaInvio = f.dopo(() => { cancellaInvio = null; void svuota() }, attesa)
  }

  const svuota = async () => {
    if (inViaggio || !coda.size) return
    const ids = [...coda].slice(0, PER_CHIAMATA)
    for (const id of ids) coda.delete(id)
    inViaggio = true
    try {
      await f.manda(ids)
      for (const id of ids) inviate.add(id)
      attesa = ATTESA_INVIO
    } catch {
      // torna in coda, e si riprova più tardi: niente si perde, ma ogni
      // guasto raddoppia l'attesa fino a un minuto
      for (const id of ids) if (!inviate.has(id)) coda.add(id)
      attesa = Math.min(attesa * 2, ATTESA_MASSIMA)
    } finally {
      inViaggio = false
    }
    if (coda.size) programma()
  }

  return {
    frazione(id: string, frazione: number) {
      if (inviate.has(id) || coda.has(id)) return
      if (frazione < META) { sopra.delete(id); return }
      if (!sopra.has(id)) sopra.set(id, f.visibile() && f.fuoco() ? f.adesso() : null)
    },
    tick() {
      const davanti = f.visibile() && f.fuoco()
      for (const [id, da] of sopra) {
        if (!davanti) { sopra.set(id, null); continue }
        if (da === null) { sopra.set(id, f.adesso()); continue }
        if (contaComeVista({ visibile: true, fuoco: true, frazione: META, da, adesso: f.adesso() })) {
          sopra.delete(id)
          coda.add(id)
          programma()
        }
      }
    },
    /** C'è qualcosa sopra la metà: l'orologio deve girare. */
    attiva: () => sopra.size > 0,
    svuota,
    /** Solo per le prove. */
    perProva: () => ({ sopra: new Map(sopra), coda: new Set(coda), inviate: new Set(inviate) })
  }
}

// — il gancio —

const finestra = typeof document !== 'undefined' ? document : null
const vista = creaVista({
  adesso: () => Date.now(),
  visibile: () => !finestra || finestra.visibilityState === 'visible',
  fuoco: () => !finestra || finestra.hasFocus(),
  manda: ids => apiP2.segnaViste(ids),
  dopo: (fai, ms) => { const t = setTimeout(fai, ms); return () => clearTimeout(t) }
})

let orologio: ReturnType<typeof setInterval> | null = null
const idDi = new Map<Element, string>()
let osservatore: IntersectionObserver | null = null

/** L'orologio gira solo mentre c'è qualcosa sopra la metà. */
function accordaOrologio() {
  if (vista.attiva() && !orologio) {
    orologio = setInterval(() => { vista.tick(); accordaOrologio() }, OGNI)
  } else if (!vista.attiva() && orologio) {
    clearInterval(orologio)
    orologio = null
  }
}

function osserva(): IntersectionObserver | null {
  if (osservatore) return osservatore
  if (typeof IntersectionObserver === 'undefined') return null
  osservatore = new IntersectionObserver(voci => {
    for (const e of voci) {
      const id = idDi.get(e.target)
      if (id) vista.frazione(id, e.isIntersecting ? e.intersectionRatio : 0)
    }
    accordaOrologio()
  }, { threshold: [0, META] })
  return osservatore
}

/** Il ref da mettere sulla radice della riga: la carta conta come vista quando lo è davvero. */
export function useVista(id: string): (el: HTMLElement | null) => void {
  const attuale = useRef<HTMLElement | null>(null)
  const ref = useCallback((el: HTMLElement | null) => {
    const o = osserva()
    if (attuale.current && o) { o.unobserve(attuale.current); idDi.delete(attuale.current); vista.frazione(id, 0) }
    attuale.current = el
    if (el && o) { idDi.set(el, id); o.observe(el) }
  }, [id])
  useEffect(() => () => {
    const o = osservatore
    if (attuale.current && o) { o.unobserve(attuale.current); idDi.delete(attuale.current) }
    vista.frazione(id, 0)
    accordaOrologio()
  }, [id])
  return ref
}
