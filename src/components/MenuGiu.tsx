/**
 * Il menù che scende da un bottone, e che nessuno può tagliare.
 *
 * Il «⋯» stava dentro la carta e il menù pure: `position: absolute` dentro un
 * riquadro che ha `overflow: hidden` — e la carta grande ce l'ha apposta,
 * perché il testo non deve poterne uscire. Risultato: si premeva il bottone, si
 * vedeva spuntare un centimetro di bianco sotto il bordo della carta, e la voce
 * da cliccare non c'era. Nella lista di Oggi era l'altra metà dello stesso
 * guaio: ogni riga ha il suo vetro sfocato, e una riga sfocata è un piano a sé
 * — quella dopo si disegna *sopra* il menù di quella prima, qualunque `zIndex`
 * gli si dia da dentro.
 *
 * Le due cose hanno una causa sola: un menù disegnato dentro la cosa da cui
 * nasce non è mai al sicuro. Quindi non nasce più lì. Va in fondo alla pagina,
 * in `position: fixed`, e si mette sotto al bottone misurandolo: il riquadro
 * che lo conteneva non lo tocca più, e niente che venga dopo gli va sopra.
 *
 * Le tre cose che deve saper fare, e che fa qui una volta per tutte:
 * si gira in su quando sotto non ci sta, si tiene dentro i bordi della finestra
 * quando il bottone sta a destra, e si chiude con Esc, con un click fuori, o
 * appena la pagina si muove sotto — un menù rimasto appeso a mezz'aria mentre
 * si scorre è peggio di un menù che si chiude da solo.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Quanto sta fra il bottone e il menù, e quanto resta dai bordi della finestra. */
const ARIA = 8
const MARGINE = 10

type Posto = { top: number; left: number; larghezza: number }

export function MenuGiu({ ancora, chiudi, minLarghezza = 200, allinea = 'sinistra', children }: {
  /** Il bottone da cui scende: si misura lui, non si contano i pixel a mano. */
  ancora: HTMLElement | null
  chiudi: () => void
  minLarghezza?: number
  /** Da che parte si allinea al bottone, finché la finestra glielo lascia fare. */
  allinea?: 'sinistra' | 'destra'
  children: ReactNode
}) {
  const scatola = useRef<HTMLDivElement | null>(null)
  const [posto, setPosto] = useState<Posto | null>(null)

  /*
   * `chiudi` arriva quasi sempre come una funzione scritta lì per lì — chi ci
   * passa `() => setMenu(false)` non sta sbagliando niente. Ma se il posto si
   * ricalcolasse a ogni sua identità nuova, il calcolo scriverebbe uno stato,
   * lo stato rifarebbe il giro, e il giro rifarebbe il calcolo: un menù che si
   * misura all'infinito. Qui l'ultima resta in un `ref`, e la misura dipende
   * solo dalle cose che la cambiano davvero.
   */
  const perChiudere = useRef(chiudi)
  perChiudere.current = chiudi

  /*
   * Misurare prima che si veda: `useLayoutEffect` gira fra il disegno e la
   * pittura, quindi il menù non appare mai per un fotogramma nell'angolo in
   * alto a sinistra per poi saltare al suo posto.
   */
  useLayoutEffect(() => {
    if (!ancora) return
    const metti = () => {
      const b = ancora.getBoundingClientRect()
      const m = scatola.current?.getBoundingClientRect()
      const larghezza = Math.max(minLarghezza, m?.width ?? minLarghezza)
      const alto = m?.height ?? 0

      // sotto se ci sta, sopra se non ci sta: la finestra è il limite, non la carta
      const sotto = b.bottom + ARIA
      const sopra = b.top - ARIA - alto
      const top = sotto + alto + MARGINE > window.innerHeight && sopra >= MARGINE ? sopra : sotto

      const voluto = allinea === 'destra' ? b.right - larghezza : b.left
      const left = Math.max(MARGINE, Math.min(voluto, window.innerWidth - larghezza - MARGINE))
      // lo stesso posto torna lo stesso oggetto: React si ferma lì invece di
      // ridisegnare, ed è quello che tiene chiusa la seconda metà del giro
      setPosto(p => (p && p.top === top && p.left === left && p.larghezza === larghezza ? p : { top, left, larghezza }))
    }
    metti()
    // la pagina che si muove sotto un menù aperto: si chiude, non lo si insegue
    const via = () => perChiudere.current()
    window.addEventListener('scroll', via, true)
    window.addEventListener('resize', via)
    return () => {
      window.removeEventListener('scroll', via, true)
      window.removeEventListener('resize', via)
    }
  }, [ancora, minLarghezza, allinea])

  useEffect(() => {
    const tasto = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); perChiudere.current() } }
    window.addEventListener('keydown', tasto, true)
    return () => window.removeEventListener('keydown', tasto, true)
  }, [])

  return createPortal(
    <>
      {/* il click fuori chiude e basta: non deve anche premere quello che c'è sotto */}
      <div onMouseDown={e => { e.preventDefault(); perChiudere.current() }} style={{ position: 'fixed', inset: 0, zIndex: 900 }} />
      <div ref={scatola} role="menu" style={{
        position: 'fixed',
        top: posto?.top ?? -9999, left: posto?.left ?? -9999, minWidth: minLarghezza,
        // finché non è misurato non si vede: invisibile, ma largo quanto sarà
        visibility: posto ? 'visible' : 'hidden',
        zIndex: 901, maxHeight: `calc(100vh - ${MARGINE * 2}px)`, overflowY: 'auto',
        borderRadius: 16, background: '#FFFDF9', border: '1px solid rgba(255,255,255,.9)',
        boxShadow: '0 24px 56px rgba(30,20,14,.34)', padding: 5,
        animation: 'fadein .14s ease'
      }}>
        {children}
      </div>
    </>,
    document.body
  )
}

/** Una voce: un bottone largo quanto il menù, senza vestito suo. */
export const VOCE_MENU: CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', borderRadius: 10,
  border: 'none', background: 'none', cursor: 'pointer', fontSize: '13.5px', fontFamily: 'inherit', color: '#22271F'
}
