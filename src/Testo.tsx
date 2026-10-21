// Come si scrive una risposta sullo schermo.
//
// Prima il testo del modello finiva in pagina così com'era: gli asterischi del
// grassetto restavano asterischi e le citazioni si leggevano «[7]». Sembrava
// l'uscita di un terminale, non una risposta.
//
// Sulle fonti la scelta non è estetica. Il brief le vuole «lì, e quasi
// invisibili: un segno tenue nel testo, rivelato al passaggio. Nessun blocco di
// citazioni, nessuna pastiglia» — perché la prova serve a chi la cerca, e a
// tutti gli altri toglie spazio alla risposta. Quindi [7] diventa un numerino
// alto accanto alla parola, che al passaggio dice da dove viene: il titolo,
// chi e quando, e il passo che regge la frase. «[M]» è un cerchietto: la
// frase viene da quello che Myynd sa di lei, e apre il progetto o la Memoria.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { CHAT, IMPAGINATO, leggibile, type Blocco } from './leggibile.ts'
import { pezzi, type Pezzo } from './segni-chat.ts'
import { IconCopia, IconSpunta } from './icons'
import { Hov } from './ui'
import { lingua, t } from './lingua'
import { perNumero, fonteMemoria, passoDi, rigaFonte, titoloDi, virgolette, type Fonte } from './citazioni.ts'

export type { Fonte }

type Posto = { top: number; left: number; larga: number }
/** Quante volte ogni numero è già comparso nel testo: il k-esimo [n] mostra il k-esimo passo. */
type Conteggi = Map<number, number>

/**
 * Il segno della citazione: si vede se lo cerchi, non se non lo cerchi.
 *
 * Raggiungibile da tastiera quando ha una fonte (Tab, Invio, Esc); la zona
 * che risponde al mouse è di sedici pixel, il segno resta piccolo; niente
 * velo dietro, né di giorno né di notte. La nuvoletta si misura all'apertura
 * e sta sopra il segno, o sotto se sopra non c'è posto, sempre dentro la
 * colonna che scorre.
 */
/** Un altro segno attaccato prima o dopo questo («[1][2]»): da quel lato la zona del mouse si ferma al bordo della cifra. */
type Vicini = { prima: boolean; dopo: boolean }

function Segno({ n, fonte, passo, onApri, vicini }: { n: number | 'M'; fonte?: Fonte; passo?: string; onApri?: (id: string, passo?: string) => void; vicini?: Vicini }) {
  const [sopra, setSopra] = useState(false)
  const [fuoco, setFuoco] = useState(false)
  // Esc chiude la nuvoletta del fuoco, non il fuoco: il segno resta quello
  // attivo, con l'anello, finché il Tab o il mouse non lo lasciano
  const [chiusa, setChiusa] = useState(false)
  const [dalMouse, setDalMouse] = useState(false)
  const [posto, setPosto] = useState<Posto | null>(null)
  // cresce a ogni scorrimento della colonna mentre il segno ha il fuoco: la nuvoletta si rimisura e lo segue
  const [giro, setGiro] = useState(0)
  const segno = useRef<HTMLElement>(null)
  const nuvola = useRef<HTMLSpanElement>(null)
  const en = lingua() === 'en'
  const memoria = n === 'M'
  // un bottone solo dove premere apre qualcosa: un risultato di lavoro senza
  // `onApri` mostra la nuvoletta al passaggio, ma il Tab non ci si ferma
  const attivo = !!fonte && !!onApri
  const titolo = fonte ? (memoria ? t('Dalla tua memoria') : titoloDi(fonte)) : ''
  const riga = fonte ? (memoria ? titoloDi(fonte) : rigaFonte(fonte)) : ''
  const aperta = (sopra || (fuoco && !chiusa)) && !!titolo
  // la nuvoletta si chiude aprendo: il mouse non esce dal segno finché la finestra del documento è sopra
  const apri = () => { if (!fonte) return; setSopra(false); setFuoco(false); onApri?.(fonte.id, passo) }

  useLayoutEffect(() => {
    if (!aperta || !segno.current) { setPosto(null); return }
    const s = segno.current
    const r = s.getBoundingClientRect()
    let a: HTMLElement | null = s.parentElement
    while (a && !/auto|scroll/.test(getComputedStyle(a).overflowY)) a = a.parentElement
    const box = a ? a.getBoundingClientRect() : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight, width: window.innerWidth }
    const larga = Math.max(120, Math.min(300, box.width - 16))
    const alta = nuvola.current?.offsetHeight ?? 0
    const ciSta = r.top - box.top >= alta + 8
    const top = ciSta ? r.top - alta - 8 : r.bottom + 8
    const left = Math.max(box.left + 8, Math.min(r.left + r.width / 2 - larga / 2, box.right - 8 - larga))
    // un segno scorso fuori dalla colonna: la nuvoletta non si vede, il fuoco resta
    setPosto(r.bottom < box.top || r.top > box.bottom ? null : { top, left, larga })
    // Uno scorrimento chiude la nuvoletta del mouse; col fuoco la sposta e
    // basta. Il Tab verso un segno sotto la piega fa scorrere la colonna da
    // sé, e chiudere lì spegneva anche il fuoco: chi arrivava da tastiera
    // trovava il segno senza anello e senza nuvoletta. Il fuoco se ne va
    // solo col blur; Esc chiude la nuvoletta e lascia l'anello.
    const scorre = () => { setSopra(false); setGiro(g => g + 1) }
    a?.addEventListener('scroll', scorre, { passive: true })
    return () => a?.removeEventListener('scroll', scorre)
  }, [aperta, passo, titolo, riga, giro])

  const tasti = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apri() }
    if (e.key === 'Escape') { e.stopPropagation(); setChiusa(true); setSopra(false) }
  }
  const conFuocoDaTastiera = fuoco && !dalMouse
  // Il segno resta piccolo, la zona che risponde no: sedici pixel di
  // larghezza (la cifra ne occupa sei, il cerchietto cinque) di imbottitura
  // trasparente, ripresi dal margine, e il testo non si muove. Ma due segni
  // attaccati («¹²») non si coprono: dal lato dove ce n'è un altro la zona
  // si ferma al bordo della cifra, senza imbottitura e senza margine, così
  // le due zone si toccano e non si sovrappongono, le cifre restano
  // attaccate come prima (un pixel di imbottitura si vedeva: «¹ ²»), e
  // puntare la prima non apre la seconda.
  const largo = memoria ? 6 : 5
  const sinistra = vicini?.prima ? 0 : largo
  const destra = vicini?.dopo ? 0 : largo
  const padding = `4px ${destra}px 4px ${sinistra}px`
  const margin = `-4px ${-destra}px -4px ${-sinistra}px`

  return (
    <span style={{ position: 'relative', whiteSpace: 'nowrap' }}>
      <sup
        ref={segno}
        onMouseEnter={() => setSopra(true)}
        onMouseLeave={() => setSopra(false)}
        onMouseDown={() => setDalMouse(true)}
        onFocus={() => { setFuoco(true); setChiusa(false) }}
        onBlur={() => { setFuoco(false); setChiusa(false); setDalMouse(false) }}
        onKeyDown={attivo ? tasti : undefined}
        onClick={apri}
        {...(attivo ? { role: 'button', tabIndex: 0, 'aria-label': memoria ? t('Dalla tua memoria') : `${t('Fonte')}: ${titolo}` } : {})}
        style={{
          // il cerchietto della memoria a .66em era un anello sottile di tre
          // pixel, che sembrava una sbavatura: un po' più grande e col tratto
          // ripassato, con lo stesso inchiostro tenue
          fontSize: memoria ? '.85em' : '.66em', lineHeight: 0, verticalAlign: 'super',
          WebkitTextStroke: memoria ? '.6px currentColor' : undefined,
          padding, margin, borderRadius: 3,
          cursor: attivo ? 'pointer' : 'default', fontWeight: memoria ? 600 : 500,
          color: (sopra || fuoco) && attivo ? 'var(--rame-testo)' : 'rgba(var(--inchiostro-rgb),.4)',
          background: 'transparent', outline: conFuocoDaTastiera ? '2px solid rgba(var(--rame-rgb),.45)' : 'none', outlineOffset: 1,
          transition: 'color .12s'
        }}>{memoria ? '◦' : n}</sup>
      {aperta && (
        <span ref={nuvola} role="tooltip" style={{
          position: 'fixed', top: posto?.top ?? 0, left: posto?.left ?? 0, width: posto?.larga ?? 300,
          visibility: posto ? 'visible' : 'hidden', zIndex: 30, whiteSpace: 'normal', boxSizing: 'border-box',
          padding: '7px 11px', borderRadius: 10, background: 'var(--pieno)', color: 'var(--avorio)',
          fontSize: '11.5px', lineHeight: 1.4, fontWeight: 400, textAlign: 'left',
          boxShadow: '0 12px 28px rgba(var(--ombra-rgb),.34)', pointerEvents: 'none'
        }}>
          <span style={{ display: 'block', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{titolo}</span>
          {riga && <span style={{ display: 'block', opacity: .72, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{riga}</span>}
          {passo && !memoria && (
            <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginTop: 3, overflowWrap: 'anywhere' }}>{virgolette(passo, en)}</span>
          )}
        </span>
      )}
    </span>
  )
}

/**
 * Grassetto, corsivo, codice, citazioni e (in chat) link dentro una riga.
 *
 * Cosa sono lo decide `segni-chat.ts`, qui si vestono. Solo elementi React
 * con testo dentro: niente HTML scritto dal modello arriva mai in pagina come
 * HTML.
 */
function inline(testo: string, fonti: Fonte[], onApri?: (id: string, passo?: string) => void, conteggi: Conteggi = new Map(), link = false): ReactNode[] {
  const vesti = (ps: Pezzo[]): ReactNode[] => ps.map((p, k) => {
    if (p.tipo === 'testo') return p.testo
    if (p.tipo === 'grassetto') return <strong key={k} style={{ fontWeight: 600 }}>{vesti(p.dentro)}</strong>
    if (p.tipo === 'corsivo') return <em key={k}>{vesti(p.dentro)}</em>
    if (p.tipo === 'codice') {
      return <code key={k} style={{ background: 'rgba(var(--inchiostro-rgb),.07)', padding: '1px 5px', borderRadius: 4, fontSize: '.92em', overflowWrap: 'anywhere', ...(link ? { fontFamily: MONO } : {}) }}>{p.testo}</code>
    }
    if (p.tipo === 'link') {
      // fuori, nel browser: il guscio apre solo http, https e mailto
      return (
        <a key={k} href={p.url} target="_blank" rel="noopener noreferrer" title={p.url}
          style={{ color: 'var(--rame-testo)', textDecoration: 'underline', textDecorationColor: 'rgba(var(--rame-rgb),.4)', textUnderlineOffset: 3, overflowWrap: 'anywhere' }}>{p.testo}</a>
      )
    }
    const vicini: Vicini = { prima: p.prima, dopo: p.dopo }
    if (p.n === 'M') return <Segno key={k} n="M" fonte={fonteMemoria(fonti)} onApri={onApri} vicini={vicini} />
    // La fonte si cerca per numero scritto nell'etichetta, non per posizione:
    // l'elenco contiene solo quelle davvero citate, quindi se il modello cita
    // [3] e [7] l'array ha due elementi e fonti[6] non esiste, ed era il
    // motivo per cui cliccare il numerino non apriva niente.
    // Il k-esimo [n] del testo porta il k-esimo passo della fonte: la
    // frase del secondo segno è un'altra frase, e la data della prima non
    // prova il prezzo della seconda.
    const volte = conteggi.get(p.n) ?? 0
    conteggi.set(p.n, volte + 1)
    const fonte = perNumero(fonti, p.n)
    return <Segno key={k} n={p.n} fonte={fonte} passo={passoDi(fonte, volte)} onApri={onApri} vicini={vicini} />
  })
  return vesti(pezzi(testo, link))
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

/**
 * Un blocco di codice in chat: la lingua in alto a sinistra, «Copia» a destra.
 *
 * Il gesto si vede subito: «Copiato» per un secondo e mezzo, poi torna com'era.
 * Il codice scorre di lato dentro la sua scatola, non spinge la colonna.
 */
function Codice({ testo, linguaggio, primo }: { testo: string; linguaggio?: string; primo: boolean }) {
  const [copiato, setCopiato] = useState(false)
  const tempo = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(tempo.current), [])
  const copia = () => {
    void navigator.clipboard?.writeText(testo).catch(() => {})
    setCopiato(true)
    clearTimeout(tempo.current)
    tempo.current = setTimeout(() => setCopiato(false), 1500)
  }
  return (
    <div style={{ margin: primo ? 0 : '14px 0 0', borderRadius: 10, border: '1px solid rgba(var(--inchiostro-rgb),.09)', background: 'rgba(var(--inchiostro-rgb),.04)', overflow: 'hidden', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '4px 6px 4px 12px', borderBottom: '1px solid rgba(var(--inchiostro-rgb),.07)', fontSize: 12, color: 'rgba(var(--inchiostro-rgb),.55)' }}>
        <span style={{ fontFamily: MONO, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{linguaggio ?? ''}</span>
        <Hov as="button" type="button" onClick={copia} aria-label={copiato ? t('Copiato') : t('Copia')}
          style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', padding: '4px 6px', borderRadius: 10, fontFamily: 'inherit', fontSize: 12, color: 'inherit', cursor: 'pointer' }}
          hover={{ color: 'var(--inchiostro)' }}>
          {copiato ? <IconSpunta size={12} /> : <IconCopia size={12} />}{copiato ? t('Copiato') : t('Copia')}
        </Hov>
      </div>
      <pre style={{ margin: 0, padding: '10px 12px', fontFamily: MONO, fontSize: '12.5px', lineHeight: 1.6, overflowX: 'auto', whiteSpace: 'pre' }}>{testo}</pre>
    </div>
  )
}

/** Una tabella in chat: la prima riga è l'intestazione; troppo larga, scorre di lato dentro la sua scatola. */
function Tabella({ celle, primo, riga }: { celle: string[][]; primo: boolean; riga: (x: string) => ReactNode[] }) {
  const [testa, ...corpo] = celle
  const cella: CSSProperties = { padding: '7px 14px 7px 0', textAlign: 'left', verticalAlign: 'top', borderBottom: '1px solid rgba(var(--inchiostro-rgb),.08)', overflowWrap: 'anywhere', minWidth: 72 }
  return (
    <div style={{ margin: primo ? 0 : '14px 0 0', overflowX: 'auto', maxWidth: '100%' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: '14px', lineHeight: 1.5, minWidth: '60%' }}>
        <thead>
          <tr>{(testa ?? []).map((c, k) => <th key={k} style={{ ...cella, fontWeight: 600, borderBottom: '1px solid rgba(var(--inchiostro-rgb),.2)' }}>{riga(c)}</th>)}</tr>
        </thead>
        <tbody>
          {corpo.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k} style={cella}>{riga(c)}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Il numerino sta attaccato alla parola che documenta.
 *
 * Il modello scrive «AeroVect.v2 (27/07/2026) [1][2], un audit»: lo spazio
 * prima della parentesi quadra è suo, e sulla pagina diventava un buco fra la
 * parola e il segno che la giustifica — con la virgola che restava staccata
 * dall'altra parte. Una citazione è una nota a margine di *quella* parola,
 * quindi le sta addosso, come in un libro.
 */
function attacca(testo: string): string {
  return testo.replace(/[ \t]+(?=\[(?:\d{1,3}|M)\])/g, '')
}

/**
 * Il testo di una risposta, impaginato.
 *
 * Restava minuscolo di proposito — grassetto, corsivo, codice, citazioni — con
 * la ragione scritta qui sopra: al modello si chiede la prosa, e una risposta
 * che ha bisogno di titoli è una risposta troppo lunga. La ragione è giusta e
 * resta. Quello che era sbagliato è la conseguenza che se ne traeva: *siccome*
 * non deve arrivare un cancelletto, se arriva lo si stampa. Un modello piccolo
 * sul portatile i cancelletti li scrive, e sullo schermo si leggeva
 * «### Key Observations: 1. **No Reference to H-Farm**: - Rental move-in»,
 * tutto su una riga, con i rientri dentro.
 *
 * Adesso i segni li riconosce `leggibile`, che è la grammatica del
 * visualizzatore dei documenti e li conosce tutti. Qui si decide solo come
 * vestirli, e il verdetto sui titoli non cambia: un titolo non diventa un
 * titolo, diventa una riga di stacco. Chi ne scrive quattro non guadagna
 * quattro capitoli, guadagna quattro righe in grassetto — che è esattamente
 * quello che era, senza i cancelletti davanti.
 *
 * Le voci di elenco si raggruppano guardando quelle attorno, non il blocco
 * intero: prima bastava una riga fuori posto — un'introduzione, un titolo —
 * perché l'elenco intero smettesse di essere un elenco e finisse appiattito in
 * un paragrafo con dentro i trattini e gli spazi del rientro.
 */
export function Testo({ testo, fonti = [], onApri, aCapo = false, ricco = false }: {
  testo: string
  fonti?: Fonte[]
  onApri?: (id: string, passo?: string) => void
  /**
   * Gli a capo semplici restano a capo. In chat le righe di seguito sono un
   * paragrafo; in una cosa consegnata «A presto,» e «Alex» sono due righe,
   * e mostrarle come «A presto, Alex» è mostrare una mail diversa da quella
   * che parte.
   */
  aCapo?: boolean
  /**
   * La chat: tabelle vere, link da cliccare, il codice con «Copia», i titoli
   * un poco più grandi e più aria fra i blocchi. Le carte e la lista restano
   * come erano.
   */
  ricco?: boolean
}) {
  const blocchi = leggibile(attacca(testo.trim()), ricco ? CHAT : IMPAGINATO)
  // nuovo a ogni impaginazione: i segni si contano dall'inizio del testo
  const conteggi: Conteggi = new Map()
  const riga = (x: string) => inline(x, fonti, onApri, conteggi, ricco)
  // l'aria fra un blocco e l'altro: in chat un poco di più, come un testo da leggere
  const aria = ricco ? '14px 0 0' : '10px 0 0'
  const pezzi: ReactNode[] = []
  let i = 0
  // `primo` e non `i`: l'aria in cima si toglie guardando cosa si è già messo
  // in pagina, non quante righe si sono lette
  const primo = () => pezzi.length === 0

  while (i < blocchi.length) {
    const b = blocchi[i]

    if (b.tipo === 'vuota') { i++; continue }

    if (b.tipo === 'voce') {
      // tutte quelle di fila, e basta il primo numero a dire di che elenco si tratta
      const voci: Blocco[] = []
      const numerato = b.numero !== null && b.numero !== undefined
      while (i < blocchi.length && blocchi[i].tipo === 'voce') { voci.push(blocchi[i]); i++ }
      const El = numerato ? 'ol' : 'ul'
      pezzi.push(
        <El key={pezzi.length} style={{ margin: primo() ? 0 : aria, paddingLeft: ricco ? 22 : 20, display: 'flex', flexDirection: 'column', gap: ricco ? 6 : 4 }}>
          {voci.map((v, j) => (
            <li key={j} style={{ lineHeight: ricco ? 1.65 : 1.6, overflowWrap: 'anywhere', paddingLeft: ricco ? 2 : 0 }}>{riga(v.testo)}</li>
          ))}
        </El>
      )
      continue
    }

    i++

    if (b.tipo === 'codice' && ricco) {
      pezzi.push(<Codice key={pezzi.length} testo={b.testo} linguaggio={b.lingua} primo={primo()} />)
      continue
    }

    if (b.tipo === 'tabella' && b.celle?.length) {
      pezzi.push(<Tabella key={pezzi.length} celle={b.celle} primo={primo()} riga={riga} />)
      continue
    }

    if (b.tipo === 'codice') {
      pezzi.push(
        <pre key={pezzi.length} style={{
          margin: primo() ? 0 : '10px 0 0', padding: '10px 12px', borderRadius: 8,
          background: 'rgba(var(--inchiostro-rgb),.05)', border: '1px solid rgba(var(--inchiostro-rgb),.09)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '12.5px',
          lineHeight: 1.6, overflowX: 'auto', whiteSpace: 'pre'
        }}>{b.testo}</pre>
      )
      continue
    }

    // il titolo: una riga di stacco, non un capitolo. In chat un poco più
    // grande del testo (e il primo livello un poco più del secondo), con più
    // aria sopra che sotto: si legge come l'inizio di una parte, non come un
    // grassetto in mezzo alle righe
    if (b.tipo === 'titolo') {
      const grande = ricco ? ((b.livello ?? 3) <= 2 ? '1.13em' : '1.04em') : undefined
      pezzi.push(
        <p key={pezzi.length} style={{
          margin: primo() ? 0 : ricco ? '20px 0 0' : '12px 0 0', lineHeight: 1.45, fontWeight: 600,
          fontSize: grande, letterSpacing: ricco ? '-.01em' : undefined,
          textWrap: 'pretty', overflowWrap: 'anywhere'
        }}>{riga(b.testo)}</p>
      )
      continue
    }

    // la prosa: le righe di seguito stanno nello stesso paragrafo, come prima
    const righe = [b.testo]
    while (i < blocchi.length && blocchi[i].tipo === 'riga') { righe.push(blocchi[i].testo); i++ }
    pezzi.push(
      <p key={pezzi.length} style={{ margin: primo() ? 0 : aria, lineHeight: ricco ? 1.65 : 1.6, textWrap: 'pretty', overflowWrap: 'anywhere' }}>
        {aCapo
          ? righe.map((r, j) => <span key={j}>{j > 0 && <br />}{riga(r)}</span>)
          : riga(righe.join(' '))}
      </p>
    )
  }

  return <>{pezzi}</>
}
