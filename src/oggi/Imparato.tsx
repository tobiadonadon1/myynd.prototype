// Quello che Myynd ha imparato, dove lo usa: sotto la bozza, nella riga.
//
// Tre cose piccole, le stesse nella prima pagina e nella lista:
//
//   · «Learned: niente saluto in apertura (3 edits) · Undo» sotto una bozza
//     che segue una cosa imparata. Una riga sola, smorzata: la regola più
//     forte, e «altre 2» per vedere le altre. «Undo» la toglie da tutte le
//     bozze e dalla Memoria (lo stesso «Toglila» di là).
//   · «Earned: I now draft every reply to Nora. Take it back» sotto una
//     risposta nata dal primo gradino (`server/gradino.ts`).
//   · «Not relevant, drop it» che chiede una delle ragioni del feed: è il
//     perché che insegna, non il gesto.
//
// Niente spiega il software: la frase dice cosa ha imparato o guadagnato, e
// accanto c'è il modo di riprenderselo.

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react'
import { frasi, t } from '../lingua'
import { Hov } from '../ui'
import type { Compito } from '../api'
import type { Lista } from './useCompiti'
import { imparatoDellaBozza } from '../lavoro-affidato'
import { fraseSeguita } from '../gemello-frasi'
import { RAGIONI_NON_UTILE } from '../feed-carta'

const QUIETA: CSSProperties = {
  display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0, maxWidth: '100%',
  fontSize: '12.5px', lineHeight: 1.45, color: 'rgba(var(--inchiostro-rgb),.55)'
}
/** La frase tiene la riga: se è lunga si taglia con i puntini, e intera sta nel titolo. */
const FRASE: CSSProperties = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const LINK: CSSProperties = {
  flex: 'none', padding: 0, border: 'none', background: 'none', fontFamily: 'inherit', fontSize: '12.5px', color: 'var(--rame-testo)', cursor: 'pointer',
  textDecoration: 'underline', textDecorationColor: 'transparent', textUnderlineOffset: 3, whiteSpace: 'nowrap'
}
const SOTTO = { textDecorationColor: 'currentColor' }
const fermo = (f: () => void) => (e: MouseEvent) => { e.stopPropagation(); f() }

/** «Learned: … (n edits) · Undo», sotto una bozza pronta che segue una cosa imparata. */
export function RigaImparato({ c, l }: { c: Compito; l: Lista }) {
  const [tutte, setTutte] = useState(false)
  const r = imparatoDellaBozza(c, fraseSeguita)
  if (!r) return null
  const righe = tutte ? [r.regola, ...r.altre] : [r.regola]
  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }} onClick={e => e.stopPropagation()}>
      {righe.map((x, i) => {
        const frase = i === 0 && r.nuova ? frasi.imparatoPrimaVolta(fraseSeguita(x), x.casi) : frasi.imparatoSotto(fraseSeguita(x), x.casi)
        return (
          <div key={x.chiave} style={QUIETA}>
            <span style={FRASE} title={frase}>{frase}</span>
            <span aria-hidden="true" style={{ flex: 'none' }}>·</span>
            <Hov as="button" type="button" onClick={fermo(() => { void l.togliRegola(x) })}
              aria-label={`${frasi.annullaGesto()}: ${fraseSeguita(x)}`} style={LINK} hover={SOTTO}>{frasi.annullaGesto()}</Hov>
            {i === 0 && !tutte && r.altre.length > 0 && (
              <>
                <span aria-hidden="true" style={{ flex: 'none' }}>·</span>
                <Hov as="button" type="button" onClick={fermo(() => setTutte(true))}
                  style={{ ...LINK, color: 'rgba(var(--inchiostro-rgb),.55)' }} hover={{ ...SOTTO, color: 'var(--rame-testo)' }}>{frasi.altreImparate(r.altre.length)}</Hov>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** «Earned: I now draft every reply to Nora. Take it back», sotto una risposta nata dal primo gradino. */
export function RigaGuadagnata({ c, l }: { c: Compito; l: Lista }) {
  const g = c.guadagnato
  if (!g) return null
  const frase = frasi.guadagnato(g.nome)
  return (
    <div style={{ ...QUIETA, marginTop: 8 }} onClick={e => e.stopPropagation()}>
      <span style={FRASE} title={frase}>{frase}</span>
      <Hov as="button" type="button" onClick={fermo(() => { void l.ritiraGradino(g.indirizzo) })} style={LINK} hover={SOTTO}>{t('Riprenditela')}</Hov>
    </div>
  )
}

/**
 * «Non mi serve, lasciala perdere», e poi il perché: le quattro ragioni del
 * feed, scritte piccole al posto del link. Esc o un clic altrove le chiude.
 * La ragione scelta chiude la riga e insegna (vedi `useCompiti.lascia`).
 */
export function LasciaConRagione({ c, l, style }: { c: Compito; l: Lista; style?: CSSProperties }) {
  const [scegliendo, setScegliendo] = useState(false)
  const gruppo = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!scegliendo) return
    gruppo.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [scegliendo])
  if (!scegliendo) {
    return (
      <Hov as="button" type="button" onClick={fermo(() => setScegliendo(true))}
        style={{ ...LINK, ...style }} hover={SOTTO}>{t('Non mi serve, lasciala perdere')}</Hov>
    )
  }
  return (
    <div ref={gruppo} role="group" aria-label={t('Perché non ti serve')}
      onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setScegliendo(false) } }}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setScegliendo(false) }}
      // nel rame, come il link che sostituiscono: si leggono come il seguito di «Not relevant, drop it»
      style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '2px 14px' }}>
      {RAGIONI_NON_UTILE.map(r => (
        <Hov key={r.ragione} as="button" type="button" onClick={fermo(() => { setScegliendo(false); void l.lascia(c.id, r.ragione) })}
          style={LINK} hover={SOTTO}>{t(r.etichetta)}</Hov>
      ))}
    </div>
  )
}
