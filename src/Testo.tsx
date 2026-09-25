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
// alto accanto alla parola, che al passaggio dice da dove viene.

import { useState, type ReactNode } from 'react'
import { IMPAGINATO, leggibile, type Blocco } from './leggibile.ts'

export type Fonte = { id: string; label: string }

/** Il numerino della citazione: si vede se lo cerchi, non se non lo cerchi. */
function Segno({ n, fonte, onApri }: { n: number; fonte?: Fonte; onApri?: (id: string) => void }) {
  const [sopra, setSopra] = useState(false)
  // via il «[7] » iniziale: lì dentro resta il titolo del documento
  const titolo = fonte?.label.replace(/^\[\d+\]\s*/, '') ?? ''
  return (
    <span style={{ position: 'relative', whiteSpace: 'nowrap' }}>
      <sup
        onMouseEnter={() => setSopra(true)}
        onMouseLeave={() => setSopra(false)}
        onClick={() => fonte && onApri?.(fonte.id)}
        style={{
          // Stretto: due citazioni di fila sono un gruppo, non due segni che
          // si guardano da lontano. Prima fra l'una e l'altra c'erano cinque
          // pixel di margine e imbottitura, e sulla pagina si leggevano come
          // «¹ ²» — due cose separate, con dentro uno spazio che nel testo
          // non c'è.
          fontSize: '.66em', lineHeight: 0, verticalAlign: 'super',
          padding: '0 1px', borderRadius: 3, cursor: fonte ? 'pointer' : 'default',
          fontWeight: 500,
          color: sopra ? 'var(--rame-testo)' : 'rgba(var(--inchiostro-rgb),.4)',
          background: sopra ? 'rgba(var(--rame-rgb),.14)' : 'transparent',
          transition: 'color .12s, background .12s'
        }}
        title={fonte ? titolo : undefined}>{n}</sup>
      {sopra && titolo && (
        <span style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)',
          zIndex: 30, whiteSpace: 'normal', width: 'max-content', maxWidth: 280,
          padding: '7px 11px', borderRadius: 10, background: 'var(--pieno)', color: 'var(--avorio)',
          fontSize: '11.5px', lineHeight: 1.4, fontWeight: 400,
          boxShadow: '0 12px 28px rgba(var(--ombra-rgb),.34)', pointerEvents: 'none'
        }}>{titolo}</span>
      )}
    </span>
  )
}

/** La fonte il cui numero combacia con quello scritto nel testo. */
function perNumero(fonti: Fonte[], n: number): Fonte | undefined {
  return fonti.find(f => Number(f.label.match(/^\[(\d+)\]/)?.[1]) === n)
}

/** Grassetto, corsivo, codice e citazioni dentro una riga. */
function inline(testo: string, fonti: Fonte[], onApri?: (id: string) => void): ReactNode[] {
  const pezzi: ReactNode[] = []
  // Nuova a ogni chiamata: `lastIndex` è di stato, e la ricorsione qui sotto
  // condividerebbe la posizione con il chiamante
  const re = /\*\*(.+?)\*\*|(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)|`(.+?)`|\[(\d{1,2})\]/g
  let ultimo = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(testo))) {
    if (m.index > ultimo) pezzi.push(testo.slice(ultimo, m.index))
    if (m[1] !== undefined) {
      // ricorsivo: una citazione dentro il grassetto resta una citazione
      pezzi.push(<strong key={m.index} style={{ fontWeight: 600 }}>{inline(m[1], fonti, onApri)}</strong>)
    } else if (m[2] !== undefined) {
      pezzi.push(<em key={m.index}>{inline(m[2], fonti, onApri)}</em>)
    } else if (m[3] !== undefined) {
      pezzi.push(
        <code key={m.index} style={{ background: 'rgba(var(--inchiostro-rgb),.07)', padding: '1px 5px', borderRadius: 4, fontSize: '.92em', overflowWrap: 'anywhere' }}>{m[3]}</code>
      )
    } else {
      const n = Number(m[4])
      // La fonte si cerca per numero scritto nell'etichetta, non per posizione:
      // l'elenco contiene solo quelle davvero citate, quindi se il modello cita
      // [3] e [7] l'array ha due elementi e fonti[6] non esiste — ed era il
      // motivo per cui cliccare il numerino non apriva niente.
      pezzi.push(<Segno key={m.index} n={n} fonte={perNumero(fonti, n)} onApri={onApri} />)
    }
    ultimo = m.index + m[0].length
  }
  if (ultimo < testo.length) pezzi.push(testo.slice(ultimo))
  return pezzi
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
  return testo.replace(/[ \t]+(?=\[\d{1,2}\])/g, '')
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
export function Testo({ testo, fonti = [], onApri, aCapo = false }: {
  testo: string
  fonti?: Fonte[]
  onApri?: (id: string) => void
  /**
   * Gli a capo semplici restano a capo. In chat le righe di seguito sono un
   * paragrafo; in una cosa consegnata «A presto,» e «Alex» sono due righe,
   * e mostrarle come «A presto, Alex» è mostrare una mail diversa da quella
   * che parte.
   */
  aCapo?: boolean
}) {
  const blocchi = leggibile(attacca(testo.trim()), IMPAGINATO)
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
        <El key={pezzi.length} style={{ margin: primo() ? 0 : '10px 0 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {voci.map((v, j) => (
            <li key={j} style={{ lineHeight: 1.6, overflowWrap: 'anywhere' }}>{inline(v.testo, fonti, onApri)}</li>
          ))}
        </El>
      )
      continue
    }

    i++

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

    // il titolo: una riga di stacco, non un capitolo
    if (b.tipo === 'titolo') {
      pezzi.push(
        <p key={pezzi.length} style={{
          margin: primo() ? 0 : '12px 0 0', lineHeight: 1.5, fontWeight: 600,
          textWrap: 'pretty', overflowWrap: 'anywhere'
        }}>{inline(b.testo, fonti, onApri)}</p>
      )
      continue
    }

    // la prosa: le righe di seguito stanno nello stesso paragrafo, come prima
    const righe = [b.testo]
    while (i < blocchi.length && blocchi[i].tipo === 'riga') { righe.push(blocchi[i].testo); i++ }
    pezzi.push(
      <p key={pezzi.length} style={{ margin: primo() ? 0 : '10px 0 0', lineHeight: 1.6, textWrap: 'pretty', overflowWrap: 'anywhere' }}>
        {aCapo
          ? righe.map((r, j) => <span key={j}>{j > 0 && <br />}{inline(r, fonti, onApri)}</span>)
          : inline(righe.join(' '), fonti, onApri)}
      </p>
    )
  }

  return <>{pezzi}</>
}
