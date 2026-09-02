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
          color: sopra ? '#8E3F1F' : 'rgba(34,39,31,.4)',
          background: sopra ? 'rgba(196,98,59,.14)' : 'transparent',
          transition: 'color .12s, background .12s'
        }}
        title={fonte ? titolo : undefined}>{n}</sup>
      {sopra && titolo && (
        <span style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)',
          zIndex: 30, whiteSpace: 'normal', width: 'max-content', maxWidth: 280,
          padding: '7px 11px', borderRadius: 10, background: '#22271F', color: '#FFF7F0',
          fontSize: '11.5px', lineHeight: 1.4, fontWeight: 400,
          boxShadow: '0 12px 28px rgba(30,20,14,.34)', pointerEvents: 'none'
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
        <code key={m.index} style={{ background: 'rgba(34,39,31,.07)', padding: '1px 5px', borderRadius: 4, fontSize: '.92em', overflowWrap: 'anywhere' }}>{m[3]}</code>
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
 * Volutamente minuscolo: grassetto, corsivo, codice, elenchi e citazioni. Non
 * serve altro, perché al modello si chiede di scrivere in prosa — e una
 * risposta che ha bisogno di titoli e tabelle è una risposta troppo lunga.
 */
export function Testo({ testo, fonti = [], onApri }: {
  testo: string
  fonti?: Fonte[]
  onApri?: (id: string) => void
}) {
  const blocchi = attacca(testo.trim()).split(/\n{2,}/)
  return (
    <>
      {blocchi.map((b, i) => {
        const righe = b.split('\n')
        const elenco = righe.every(r => /^\s*[-*•]\s+/.test(r)) && righe.length > 0
        const numerato = righe.every(r => /^\s*\d+[.)]\s+/.test(r)) && righe.length > 0

        if (elenco || numerato) {
          const El = numerato ? 'ol' : 'ul'
          return (
            <El key={i} style={{ margin: i ? '10px 0 0' : 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {righe.map((r, j) => (
                <li key={j} style={{ lineHeight: 1.6, overflowWrap: 'anywhere' }}>
                  {inline(r.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ''), fonti, onApri)}
                </li>
              ))}
            </El>
          )
        }
        return (
          <p key={i} style={{ margin: i ? '10px 0 0' : 0, lineHeight: 1.6, textWrap: 'pretty', overflowWrap: 'anywhere' }}>
            {inline(b.replace(/\n/g, ' '), fonti, onApri)}
          </p>
        )
      })}
    </>
  )
}
