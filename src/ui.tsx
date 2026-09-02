import {
  useCallback, useEffect, useRef, useState,
  type CSSProperties, type ElementType, type ComponentPropsWithoutRef,
  type FocusEvent, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject
} from 'react'
import { t } from './lingua'
import { IconCestino } from './icons'

/**
 * Quanto è larga la finestra.
 *
 * Gli stili qui dentro sono in linea, e una media query non li vede: l'unico
 * modo di far reagire questa app alla larghezza è misurarla. Stava già scritta
 * dentro `Oggi.tsx` per le sue tre colonne; adesso serve anche fuori, perché
 * l'impaginato intero deve rimpicciolirsi invece di farsi tagliare.
 */
export function useLarghezza(): number {
  const [l, setL] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth))
  useEffect(() => {
    const misura = () => setL(window.innerWidth)
    window.addEventListener('resize', misura)
    return () => window.removeEventListener('resize', misura)
  }, [])
  return l
}

/**
 * Le tre taglie dell'impaginato.
 *
 * `rail` è quella che conta: sotto gli ottocentoventi pixel la colonna di
 * sinistra perde le parole e resta una fila di icone. Prima non c'era nessuna
 * taglia — l'impaginato aveva `minWidth: 1180` e sotto quella soglia non si
 * ridisegnava affatto: sbordava, e quello che restava fuori era semplicemente
 * tagliato via. Su un portatile con la finestra a metà schermo mancava un pezzo
 * di applicazione, e non c'era modo di arrivarci.
 */
export type Taglia = { rail: boolean; stretta: boolean; colonna: number }

export function taglia(l: number): Taglia {
  const rail = l < 820
  return {
    rail,
    stretta: l < 1100,
    // 60 basta a un'icona con il suo respiro; 234 è la misura di sempre
    colonna: rail ? 60 : l < 1100 ? 198 : 234
  }
}

type HovProps<T extends ElementType> = {
  as?: T
  style?: CSSProperties
  hover?: CSSProperties
} & Omit<ComponentPropsWithoutRef<T>, 'style' | 'as'>

/**
 * Il bordo scritto per esteso.
 *
 * Quasi ogni bottone qui dentro ha `border: '1px solid …'` e al passaggio del
 * mouse cambia solo `borderColor`. React se ne lamenta a ogni ridisegno —
 * «don't mix shorthand and non-shorthand properties» — e non è pedanteria: nel
 * momento in cui toglie la proprietà lunga mentre quella corta è ancora lì, il
 * bordo può tornare al colore di prima per un fotogramma. Con la scorciatoia
 * aperta nelle sue tre parti, i due stati dichiarano le stesse proprietà e il
 * problema non si pone.
 */
function apriBordo(s: CSSProperties): CSSProperties {
  const b = s.border
  if (typeof b !== 'string' || !b || b === 'none') return s
  const [larghezza, tipo, ...colore] = b.split(' ')
  if (!tipo || !colore.length) return s
  const { border: _via, ...resto } = s
  return { ...resto, borderWidth: larghezza, borderStyle: tipo, borderColor: colore.join(' ') }
}

/** Elemento con stile al passaggio del mouse — l'equivalente di `style-hover` nel design. */
export function Hov<T extends ElementType = 'div'>({ as, style, hover, ...rest }: HovProps<T>) {
  const [on, setOn] = useState(false)
  const El = (as || 'div') as ElementType

  // si apre solo quando serve davvero: se nessuno dei due tocca il bordo per
  // pezzi, la scorciatoia resta com'era scritta
  const mescola = () => {
    const h = hover as CSSProperties
    const perPezzi = h && ('borderColor' in h || 'borderStyle' in h || 'borderWidth' in h)
    return perPezzi ? { ...apriBordo(style ?? {}), ...apriBordo(h) } : { ...style, ...h }
  }

  // I due ascoltatori di chi ci usa non si buttano. Prima il nostro
  // `onMouseLeave` copriva il loro in silenzio: il cestino della scheda aperta
  // chiedeva «Sicuro?» e non smetteva più di chiederlo mollando il mouse.
  const { onMouseEnter, onMouseLeave } = rest as {
    onMouseEnter?: (e: MouseEvent) => void; onMouseLeave?: (e: MouseEvent) => void
  }

  return (
    <El
      {...rest}
      style={on && hover ? mescola() : style}
      onMouseEnter={(e: MouseEvent) => { setOn(true); onMouseEnter?.(e) }}
      onMouseLeave={(e: MouseEvent) => { setOn(false); onMouseLeave?.(e) }}
    />
  )
}

/**
 * Se il puntatore sa passare sopra alle cose.
 *
 * Mezza interfaccia compare al passaggio del mouse: il cestino di una riga,
 * «in lista», «Scollega». Su un dito non c'è nessun passaggio, e quei bottoni
 * non esistevano. Qui «non sa passare sopra» vale come «ci sta sopra sempre».
 */
export function usePuntatore(): boolean {
  const [passa, setPassa] = useState(() =>
    typeof window === 'undefined' || !window.matchMedia ? true : window.matchMedia('(hover: hover)').matches)
  useEffect(() => {
    if (!window.matchMedia) return
    const q = window.matchMedia('(hover: hover)')
    const cambia = () => setPassa(q.matches)
    q.addEventListener('change', cambia)
    return () => q.removeEventListener('change', cambia)
  }, [])
  return passa
}

/**
 * Se una riga è «sotto mano»: il mouse ci sta sopra, il fuoco della tastiera
 * ci sta dentro, o il puntatore non sa passare sopra a niente.
 *
 * Le righe che nascondono un bottone finché non ci passi sopra si scrivevano
 * ognuna con due `useState` e quattro ascoltatori — e quasi tutte si scordavano
 * il fuoco: da tastiera arrivavi sul cestino e il cestino era trasparente.
 * `props` si spargono sull'elemento della riga; `sopra` resta a parte per chi
 * al passaggio cambia anche il bordo.
 */
export function useAttiva() {
  const [sopra, setSopra] = useState(false)
  const [dentro, setDentro] = useState(false)
  const passa = usePuntatore()
  const props = {
    onMouseEnter: () => setSopra(true),
    onMouseLeave: () => setSopra(false),
    onFocus: () => setDentro(true),
    onBlur: (e: FocusEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDentro(false) }
  }
  return { attiva: sopra || dentro || !passa, sopra, passa, props }
}

/**
 * Chiedere una volta, sul posto.
 *
 * Il primo clic arma; il secondo, entro tre secondi, fa. Lasciar passare il
 * tempo, mollare il mouse o uscire con il tab è già la risposta «no». Non un
 * dialogo in mezzo allo schermo: il bottone stesso diventa la domanda.
 */
export function useConferma(attesa = 3000) {
  const [armato, setArmato] = useState(false)
  const armatoRef = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const disarma = useCallback(() => {
    clearTimeout(timer.current)
    armatoRef.current = false
    setArmato(false)
  }, [])

  const chiedi = useCallback((fai: () => void) => {
    if (armatoRef.current) { disarma(); fai(); return }
    clearTimeout(timer.current)
    armatoRef.current = true
    setArmato(true)
    timer.current = setTimeout(disarma, attesa)
  }, [attesa, disarma])

  useEffect(() => () => clearTimeout(timer.current), [])
  return { armato, chiedi, disarma }
}

/**
 * La scritta di un bottone che, armato, dice «Sicuro?».
 *
 * Le due scritte stanno una sopra l'altra e il bottone è largo quanto la più
 * lunga: cambiare parola non deve spostare niente, perché una cosa che si
 * muove sotto il dito fra il primo clic e il secondo è una cosa che si sbaglia
 * a cliccare.
 */
function Sicuro({ armato, children }: { armato: boolean; children: ReactNode }) {
  return (
    <span style={{ display: 'inline-grid', placeItems: 'center' }}>
      <span style={{ gridArea: '1 / 1', visibility: armato ? 'hidden' : 'visible', whiteSpace: 'nowrap' }}>{children}</span>
      <span aria-hidden={!armato} style={{ gridArea: '1 / 1', visibility: armato ? 'visible' : 'hidden', whiteSpace: 'nowrap', fontWeight: 500 }}>
        {t('Sicuro?')}
      </span>
    </span>
  )
}

/**
 * Un bottone di sole parole che distrugge — «Toglila», «Scollega» — e chiede
 * una volta. Armato prende il colore dell'accento e dice «Sicuro?» nello stesso
 * spazio; mollare il mouse o uscire con il tab lo disarma.
 */
export function BottoneSicuro({ fai, titolo, chiaro, style, children }: {
  fai: () => void
  titolo?: string
  /** Su fondo scuro. */
  chiaro?: boolean
  style?: CSSProperties
  children: ReactNode
}) {
  const { armato, chiedi, disarma } = useConferma()
  const spento = chiaro ? 'rgba(255,247,240,.6)' : 'rgba(34,39,31,.45)'
  const acceso = chiaro ? '#FFFFFF' : '#8E3F1F'
  return (
    <Hov as="button" type="button"
      onClick={(e: MouseEvent) => { e.stopPropagation(); chiedi(fai) }}
      onMouseLeave={disarma} onBlur={disarma}
      title={titolo} aria-label={armato ? t('Sicuro?') : titolo}
      style={{
        border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
        fontSize: '12.5px', color: armato ? acceso : spento, transition: 'color .15s', ...style
      }}
      hover={{ color: acceso }}>
      <Sicuro armato={armato}>{children}</Sicuro>
    </Hov>
  )
}

/**
 * Il cestino che chiede una volta.
 *
 * Cinque posti ne avevano uno ciascuno — una riga della lista, una convinzione,
 * una chat, la scheda di un'automazione e la sua finestra — e tre buttavano al
 * primo clic. La regola è una sola, ed è `useConferma`.
 *
 * Armato, la domanda si posa *sopra* la riga invece di allargarla: un cestino
 * largo ventidue pixel che diventa una pastiglia di cinquanta spingerebbe il
 * titolo accanto. Il bottone resta al suo posto, trasparente, finché la riga
 * non è sotto mano: così non salta niente né quando compare né quando chiede.
 */
export function Cestino({ fai, titolo, visibile = true, dim = 22, icona = 12, chiaro, style }: {
  fai: () => void
  titolo: string
  /** Falso finché la riga non è sotto mano: il bottone c'è, trasparente, e non prende clic. */
  visibile?: boolean
  dim?: number
  icona?: number
  /** Su fondo scuro. */
  chiaro?: boolean
  style?: CSSProperties
}) {
  const { armato, chiedi, disarma } = useConferma()
  const spento = chiaro ? 'rgba(255,247,240,.6)' : 'rgba(34,39,31,.35)'
  const acceso = chiaro ? '#FFFFFF' : '#8E3F1F'
  const mostra = visibile || armato
  return (
    <Hov as="button" type="button"
      onClick={(e: MouseEvent) => { e.stopPropagation(); chiedi(fai) }}
      onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation() }}
      onMouseLeave={disarma} onBlur={disarma}
      title={armato ? t('Sicuro?') : titolo} aria-label={armato ? t('Sicuro?') : titolo}
      style={{
        position: 'relative', flex: 'none', width: dim, height: dim, display: 'grid', placeItems: 'center',
        border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
        color: armato ? acceso : spento,
        opacity: mostra ? 1 : 0, pointerEvents: mostra ? 'auto' : 'none', transition: 'opacity .15s, color .15s',
        ...style
      }}
      hover={{ color: acceso }}>
      <IconCestino size={icona} />
      {armato && (
        <span style={{
          position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
          padding: '3px 9px', borderRadius: 99, whiteSpace: 'nowrap',
          fontSize: '11px', fontWeight: 500, lineHeight: 1.4,
          color: '#8E3F1F', background: '#FFFDF9', border: '1px solid rgba(142,63,31,.4)',
          boxShadow: '0 4px 12px -4px rgba(84,64,44,.3)', animation: 'fadein .12s ease'
        }}>{t('Sicuro?')}</span>
      )}
    </Hov>
  )
}

/**
 * Invio e spazio su una cosa che si clicca ma non è un bottone.
 *
 * Dove si può, si mette un `<button>` e basta. Dove dentro ci stanno altri
 * bottoni — una riga con il suo cestino, una scheda con il suo interruttore —
 * un bottone dentro un bottone non è HTML valido, e allora l'elemento tiene
 * `role="button"`, `tabIndex={0}` e questo.
 */
export function daTastiera(fai: () => void) {
  return (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fai() }
  }
}

const FOCALIZZABILE = 'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * Il fuoco della tastiera dentro una finestra.
 *
 * Aperta, va sulla prima cosa che si può premere — a meno che qualcuno dentro
 * non l'abbia già preso con `autoFocus`, e allora resta lì. Chiusa, torna a chi
 * l'aveva aperta. Esc la chiude, tranne mentre si scrive in un campo: lì vuol
 * dire «annulla questo», e ci pensa il campo. Si monta con la finestra: le
 * finestre di questa app esistono solo mentre sono aperte.
 */
export function useFocoDialogo(ref: RefObject<HTMLElement | null>, chiudi?: () => void) {
  // `chiudi` cambia identità a ogni ridisegno del padre: si legge dal
  // riferimento, e l'effetto gira una volta sola
  const chiudiRef = useRef(chiudi)
  chiudiRef.current = chiudi
  /*
   * Chi ha aperto la finestra si legge *durante il disegno*, non dentro
   * l'effetto: React applica `autoFocus` quando monta il nodo, cioè prima che
   * gli effetti girino. Letto nell'effetto, «chi ha aperto» risultava essere
   * il campo dentro la finestra — che chiudendo non esiste più, e il fuoco
   * finiva sul corpo della pagina invece che sul bottone di partenza.
   */
  const apertoDa = useRef<HTMLElement | null>(null)
  if (!apertoDa.current) apertoDa.current = document.activeElement as HTMLElement | null
  useEffect(() => {
    const prima = apertoDa.current
    const el = ref.current
    if (el && !el.contains(document.activeElement)) {
      const primo = el.querySelector<HTMLElement>(FOCALIZZABILE)
      ;(primo ?? el).focus()
    }
    /*
     * Esc chiude, anche con il cursore in un campo.
     *
     * Prima si usciva subito su INPUT/TEXTAREA/SELECT, «ci pensa il campo» —
     * ma nelle due finestre delle automazioni il fuoco *parte* dentro un'area
     * di testo che di Esc non fa niente, e quelle finestre non si potevano
     * chiudere da tastiera affatto. Un campo che vuole Esc per sé lo ferma con
     * `stopPropagation`, ed è quello che fa la casella con la chiocciola
     * aperta; per tutti gli altri Esc vuol dire «chiudi questa finestra».
     */
    const tasti = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || !chiudiRef.current) return
      const el2 = e.target as HTMLElement | null
      // un menu a tendina aperto se lo prende lui: chiuderlo non è chiudere la finestra
      if (el2 instanceof HTMLSelectElement) return
      chiudiRef.current()
    }
    document.addEventListener('keydown', tasti)
    return () => {
      document.removeEventListener('keydown', tasti)
      if (prima && document.contains(prima)) prima.focus()
    }
  }, [ref])
}

const NAV_BASE: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 11, padding: '8px 10px',
  borderRadius: 14, fontSize: '14.5px', cursor: 'pointer', transition: 'background .18s'
}
export const NAV_ON: CSSProperties = {
  ...NAV_BASE, background: 'linear-gradient(120deg,#C4623B,#7E9C82)',
  border: '1px solid rgba(255,255,255,.5)', boxShadow: '0 10px 22px -12px rgba(120,60,40,.65)', color: '#FFF7F0'
}
export const NAV_OFF: CSSProperties = { ...NAV_BASE, border: '1px solid transparent', color: 'rgba(34,39,31,.72)' }

const MENU_BASE: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 11, padding: '10px 11px',
  borderRadius: 12, fontSize: '13.5px', cursor: 'pointer'
}
export const MENU_ON: CSSProperties = { ...MENU_BASE, background: 'linear-gradient(110deg,#C4623B,#7E9C82)', color: '#FFF7F0' }
export const MENU_OFF: CSSProperties = { ...MENU_BASE, color: '#22271F' }

/** L'interruttore. È lo stile di un `<button>`: da tastiera un div non si raggiunge. */
export function track(on: boolean): CSSProperties {
  return {
    width: 40, height: 23, flex: 'none', borderRadius: 99, padding: 2, boxSizing: 'border-box', cursor: 'pointer',
    border: 'none',
    background: on ? 'linear-gradient(120deg,#C4623B,#7E9C82)' : 'rgba(34,39,31,.2)',
    display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start', transition: 'background .2s'
  }
}

export function knob(): CSSProperties {
  return { width: 19, height: 19, borderRadius: '50%', background: '#FFFDF9', boxShadow: '0 2px 5px rgba(30,20,14,.3)' }
}

export function dot(c: string): CSSProperties {
  return { width: 9, height: 9, flex: 'none', borderRadius: '50%', background: c, boxShadow: '0 0 0 4px ' + c + '22' }
}

export const LABEL: CSSProperties = {
  fontSize: '11.5px', fontWeight: 500, letterSpacing: '.1em',
  textTransform: 'uppercase', color: 'rgba(34,39,31,.55)'
}

/**
 * La pastiglia dell'accento: «questa cosa aspetta una persona».
 *
 * Ce n'erano tre copie con tre alfe diverse (.16/.32, .14/.32, .12/.28), due
 * delle quali sulla stessa schermata. Sono lo stesso oggetto e devono avere lo
 * stesso peso, altrimenti l'unico colore che il prodotto si concede smette di
 * voler dire una cosa sola.
 */
export const PILL: CSSProperties = {
  padding: '4px 11px', borderRadius: 99, fontSize: 12, fontWeight: 500,
  color: '#8E3F1F', background: 'rgba(196,98,59,.14)',
  border: '1px solid rgba(196,98,59,.32)'
}

export const CARD_GLASS: CSSProperties = {
  background: 'rgba(255,253,249,.72)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,.8)', boxShadow: '0 22px 52px rgba(84,64,44,.12)'
}
